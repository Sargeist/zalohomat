-- ============================================================
--  0003: fotografie odbernych miest
-- ============================================================

alter table machines add column if not exists photo_ref text;        -- Google Places photo resource name
alter table machines add column if not exists photo_credit text;     -- povinna atribucia autora
alter table machines add column if not exists photo_checked_at timestamptz;

-- fotky od pouzivatelov (ulozisko: Supabase Storage, bucket 'machine-photos')
create table if not exists machine_photos (
  id          bigserial primary key,
  machine_id  uuid not null references machines(id) on delete cascade,
  reporter_id uuid references reporters(id) on delete set null,
  storage_path text not null,
  approved    boolean not null default false,   -- fotky od ludi az po kontrole
  created_at  timestamptz not null default now()
);
create index if not exists machine_photos_machine_idx on machine_photos (machine_id, created_at desc);

alter table machine_photos enable row level security;

drop policy if exists machine_photos_read on machine_photos;
create policy machine_photos_read on machine_photos for select using (approved);

-- ---------- machines_near / machines_search musia vracat fotku ----------
drop function if exists machines_near(double precision, double precision, integer);
create or replace function machines_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 5000
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz,
  open_now boolean, availability text, photo_ref text, photo_credit text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit
    from machines m
   where m.active
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
  open_now boolean, availability text, photo_ref text, photo_credit text
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         case when p_lat is null then 0::real
              else st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real end,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at,
         m.open_now, m.availability, m.photo_ref, m.photo_credit
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

create or replace function apply_photos(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb;
begin
  for r in select * from jsonb_array_elements(payload) loop
    update machines
       set photo_ref = r->>'photo_ref',
           photo_credit = r->>'photo_credit',
           photo_checked_at = now()
     where id = (r->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;

grant execute on function machines_near(double precision, double precision, integer) to anon, authenticated;
grant execute on function machines_search(text, double precision, double precision, integer) to anon, authenticated;
revoke execute on function apply_photos(jsonb) from anon, authenticated;

-- ---------- doplnenie adries (reverse geocoding) ----------
create or replace function apply_addresses(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb;
begin
  for r in select * from jsonb_array_elements(payload) loop
    update machines
       set address = coalesce(nullif(r->>'address',''), address),
           city    = coalesce(nullif(r->>'city',''), city),
           name    = case
                       when r->>'name' is not null and r->>'name' <> ''
                            and name in ('Odberné miesto','Odberne miesto','Zálohomat')
                       then r->>'name' else name end,
           updated_at = now()
     where id = (r->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function apply_addresses(jsonb) from anon, authenticated;
