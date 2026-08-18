-- ============================================================
--  0008: nacitanie bodov podla vyrezu mapy
--  Doteraz sa tahal pevny okruh 8 km okolo pouzivatela — pri oddialeni
--  mapy sa dalsie body neobjavili. Teraz sa tahaju podla toho, co je vidiet.
-- ============================================================

create or replace function machines_bbox(
  p_south double precision, p_west double precision,
  p_north double precision, p_east double precision,
  p_lat   double precision default null,
  p_lng   double precision default null,
  p_limit integer default 1200
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
     and m.geom && st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography
   -- pri velkom vyreze uprednostnime body so zalohomatom, aby sa neorezali
   order by (m.machine_presence = 'yes') desc, 8
   limit p_limit;
$$;

grant execute on function machines_bbox(double precision, double precision, double precision,
                                        double precision, double precision, double precision, integer)
  to anon, authenticated;
