-- ============================================================
--  0004: skutocne predajne namiesto zastupnych nazvov
--
--  Pravny zaklad: distributor s predajnou plochou nad 300 m2 ma zo zakona
--  povinnost zriadit a zaregistrovat odberne miesto. Kazdy supermarket
--  velkej siete teda odberne miesto MA. Preto neimportujeme body s tagom
--  vending=bottle_return (ten skoro nikto nevyplna), ale predajne sieti,
--  ktore su v OSM vedene s nazvom, adresou aj otvaracimi hodinami.
-- ============================================================

alter table machines add column if not exists deposit_source text;   -- law_300m2 | osm_tag | szs | user
alter table machines add column if not exists quality smallint not null default 0;
--  quality: 0 = bez nazvu (nezobrazuje sa)
--           1 = ma pouzitelny nazov
--           2 = nazov + ulica
--           3 = potvrdene oficialnym zdrojom alebo pouzivatelom

comment on column machines.quality is
  'Zobrazuju sa iba body s quality >= 1. Zastupne nazvy typu "Odberné miesto" sa nezobrazuju nikdy.';

-- ---------- prepocet kvality ----------
create or replace function recompute_quality() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update machines set quality =
    case
      when name is null
        or btrim(name) = ''
        or lower(btrim(name)) in ('odberné miesto','odberne miesto','zálohomat','zalohomat','recycling','vending machine')
        then 0
      when address is not null and btrim(address) <> '' then 2
      else 1
    end;
  update machines set quality = 3 where deposit_source in ('szs','user') and quality >= 1;
  get diagnostics n = row_count;
  return (select count(*) from machines where quality >= 1);
end $$;

-- ---------- import predajni sieti ----------
create or replace function upsert_shops(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb; near_id uuid;
begin
  for r in select * from jsonb_array_elements(payload) loop
    -- deduplikacia: ak uz mame bod do 70 m s rovnakou sietou, iba ho doplnime
    select id into near_id from machines
     where st_dwithin(geom, st_point((r->>'lng')::double precision,
                                     (r->>'lat')::double precision)::geography, 70)
       and (chain is null or lower(chain) = lower(r->>'chain'))
     order by st_distance(geom, st_point((r->>'lng')::double precision,
                                         (r->>'lat')::double precision)::geography)
     limit 1;

    if near_id is not null then
      update machines set
        name = coalesce(nullif(r->>'name',''), name),
        chain = coalesce(nullif(r->>'chain',''), chain),
        address = coalesce(nullif(r->>'address',''), address),
        city = coalesce(nullif(r->>'city',''), city),
        opening_hours = coalesce(nullif(r->>'opening_hours',''), opening_hours),
        deposit_source = coalesce(deposit_source, r->>'deposit_source'),
        updated_at = now()
      where id = near_id;
    else
      insert into machines (external_id, source, name, chain, address, city, geom,
                            opening_hours, accepts_pet, accepts_cans, type, deposit_source)
      values (
        r->>'external_id', 'osm', r->>'name', nullif(r->>'chain',''),
        nullif(r->>'address',''), nullif(r->>'city',''),
        st_point((r->>'lng')::double precision, (r->>'lat')::double precision)::geography,
        nullif(r->>'opening_hours',''), true, true,
        coalesce((r->>'type')::collection_type,'auto'), r->>'deposit_source'
      )
      on conflict (external_id) do update set
        name = excluded.name, chain = excluded.chain, address = excluded.address,
        city = excluded.city, opening_hours = excluded.opening_hours, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  perform recompute_quality();
  return n;
end $$;

-- ---------- citanie: zastupne nazvy sa nezobrazuju ----------
drop function if exists machines_near(double precision, double precision, integer);
create or replace function machines_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 5000
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text, photo_ref text, photo_credit text, quality smallint
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit, m.quality
    from machines m
   where m.active and m.quality >= 1
     and st_dwithin(m.geom, st_point(p_lng, p_lat)::geography, p_radius_m)
   order by 8
   limit 300;
$$;

drop function if exists machines_search(text, double precision, double precision, integer);
create or replace function machines_search(
  p_query text, p_lat double precision default null,
  p_lng double precision default null, p_limit integer default 60
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text, photo_ref text, photo_credit text, quality smallint
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         case when p_lat is null then 0::real
              else st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real end,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit, m.quality
    from machines m
   where m.active and m.quality >= 1
     and (
       coalesce(p_query,'') = ''
       or m.name  ilike '%' || p_query || '%'
       or m.chain ilike '%' || p_query || '%'
       or m.city  ilike '%' || p_query || '%'
       or m.address ilike '%' || p_query || '%'
     )
   order by 8, m.name
   limit p_limit;
$$;

grant execute on function machines_near(double precision, double precision, integer) to anon, authenticated;
grant execute on function machines_search(text, double precision, double precision, integer) to anon, authenticated;
revoke execute on function upsert_shops(jsonb) from anon, authenticated;

-- prvy prepocet nad existujucimi datami
select recompute_quality();
