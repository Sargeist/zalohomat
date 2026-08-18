-- ============================================================
--  0005: rozlisenie "ma zalohomat" / "ma rucny odber" / "nema"
--  Spusti po 0004.
-- ============================================================

alter table machines add column if not exists machine_presence text not null default 'unknown';
-- yes    = velka predajna siete, odberne miesto zo zakona (nad 300 m2)
-- manual = mensia predajna, odber pri pokladni
-- no     = format, kde zalohomat nebyva (benzinka, mala prevadzka)

create index if not exists machines_presence_idx on machines (machine_presence);

-- upsert_shops musi vediet zapisat aj presence
create or replace function upsert_shops(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb; near_id uuid;
begin
  for r in select * from jsonb_array_elements(payload) loop
    select id into near_id from machines
     where st_dwithin(geom, st_point((r->>'lng')::double precision,
                                     (r->>'lat')::double precision)::geography, 70)
       and (chain is null or lower(chain) = lower(coalesce(r->>'chain','')))
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
        machine_presence = coalesce(nullif(r->>'machine_presence',''), machine_presence),
        updated_at = now()
      where id = near_id;
    else
      insert into machines (external_id, source, name, chain, address, city, geom,
                            opening_hours, accepts_pet, accepts_cans, type,
                            deposit_source, machine_presence)
      values (
        r->>'external_id', 'osm', r->>'name', nullif(r->>'chain',''),
        nullif(r->>'address',''), nullif(r->>'city',''),
        st_point((r->>'lng')::double precision, (r->>'lat')::double precision)::geography,
        nullif(r->>'opening_hours',''), true, true,
        coalesce((r->>'type')::collection_type,'auto'),
        r->>'deposit_source', coalesce(nullif(r->>'machine_presence',''),'unknown')
      )
      on conflict (external_id) do update set
        name = excluded.name, chain = excluded.chain, address = excluded.address,
        city = excluded.city, opening_hours = excluded.opening_hours,
        machine_presence = excluded.machine_presence, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  perform recompute_quality();
  return n;
end $$;

-- citanie vracia aj presence
drop function if exists machines_near(double precision, double precision, integer);
create or replace function machines_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 5000
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text, photo_ref text, photo_credit text,
  quality smallint, machine_presence text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit,
         m.quality, m.machine_presence
    from machines m
   where m.active and m.quality >= 1
     and st_dwithin(m.geom, st_point(p_lng, p_lat)::geography, p_radius_m)
   order by 8
   limit 400;
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
  open_now boolean, availability text, photo_ref text, photo_credit text,
  quality smallint, machine_presence text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         case when p_lat is null then 0::real
              else st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real end,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit,
         m.quality, m.machine_presence
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
