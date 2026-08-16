-- ============================================================
--  0002: automaticka obnova stavov + vyhladavanie
--  Spusti v Supabase -> SQL Editor po migracii 0001.
-- ============================================================

-- ---------- doplnkove stlpce ----------
alter table machines add column if not exists open_now boolean;
alter table machines add column if not exists availability text;  -- 'operational' | 'closed_temporarily' | 'closed_permanently'
alter table machines add column if not exists checked_at timestamptz;

-- ============================================================
--  Prepocet vsetkych stavov naraz.
--  Bez toho by stav "zostarol" az vtedy, ked na neho niekto klikne.
-- ============================================================
create or replace function refresh_all_statuses()
returns integer language plpgsql security definer set search_path = public as $$
declare m record; n integer := 0;
begin
  for m in
    select id from machines
     where active
       and (status is not null or status_at > now() - interval '48 hours')
  loop
    perform recompute_status(m.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ============================================================
--  Vyhladavanie v celej databaze (nie len v okoli).
--  Pouziva sa na obrazovke "Zoznam".
-- ============================================================
create extension if not exists pg_trgm;
create index if not exists machines_name_trgm on machines using gin (name gin_trgm_ops);
create index if not exists machines_city_trgm on machines using gin (city gin_trgm_ops);

create or replace function machines_search(
  p_query text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 60
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         case when p_lat is null then 0::real
              else st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real end,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability
    from machines m
   where m.active
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

-- machines_near musi vracat aj nove stlpce
drop function if exists machines_near(double precision, double precision, integer);
create or replace function machines_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 5000
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability
    from machines m
   where m.active
     and st_dwithin(m.geom, st_point(p_lng, p_lat)::geography, p_radius_m)
   order by 8
   limit 300;
$$;

-- ============================================================
--  Zapis vysledkov automatickej kontroly (vola ju cron endpoint)
-- ============================================================
create or replace function apply_availability(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb;
begin
  for r in select * from jsonb_array_elements(payload) loop
    update machines
       set open_now = (r->>'open_now')::boolean,
           availability = r->>'availability',
           checked_at = now()
     where id = (r->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function machines_search(text, double precision, double precision, integer) to anon, authenticated;
grant execute on function machines_near(double precision, double precision, integer) to anon, authenticated;
revoke execute on function refresh_all_statuses() from anon, authenticated;
revoke execute on function apply_availability(jsonb) from anon, authenticated;
