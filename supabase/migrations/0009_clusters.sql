-- ============================================================
--  0009: agregacia bodov podla priblizenia
-- ============================================================

create or replace function machines_view(
  p_south double precision, p_west double precision,
  p_north double precision, p_east double precision,
  p_lat   double precision,
  p_lng   double precision,
  p_zoom  integer default 13,
  p_points integer default 60
) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  cell double precision;
  env geography;
  pts jsonb;
  cls jsonb;
begin
  env := st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography;

  cell := case
            when p_zoom >= 14 then null
            when p_zoom >= 12 then 0.008
            when p_zoom >= 10 then 0.03
            when p_zoom >= 8  then 0.12
            else 0.45
          end;

  select coalesce(jsonb_agg(to_jsonb(t) - 'geom'), '[]'::jsonb) into pts
  from (
    select m.id, m.name, m.chain, m.address, m.city,
           st_y(m.geom::geometry) as lat, st_x(m.geom::geometry) as lng,
           st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real as distance_m,
           m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
           m.status, m.status_confidence, m.status_reports, m.status_at,
           m.open_now, m.availability, m.photo_ref, m.photo_credit,
           m.quality, m.machine_presence
      from machines m
     where m.active and m.quality >= 1
       and m.geom && env
     order by 8
     limit p_points
  ) t;

  if cell is null then
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into cls
    from (
      select m.id, m.name, m.chain, m.address, m.city,
             st_y(m.geom::geometry) as lat, st_x(m.geom::geometry) as lng,
             st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real as distance_m,
             m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
             m.status, m.status_confidence, m.status_reports, m.status_at,
             m.open_now, m.availability, m.photo_ref, m.photo_credit,
             m.quality, m.machine_presence
        from machines m
       where m.active and m.quality >= 1
         and m.geom && env
       order by 8
       offset p_points
       limit 500
    ) t;

    return jsonb_build_object('points', pts, 'extra', cls, 'clusters', '[]'::jsonb, 'zoom', p_zoom);
  end if;

  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into cls
  from (
    select round(avg(st_y(m.geom::geometry))::numeric, 5)::double precision as lat,
           round(avg(st_x(m.geom::geometry))::numeric, 5)::double precision as lng,
           count(*)::integer as n,
           count(*) filter (where m.machine_presence in ('yes','manual'))::integer as n_machine
      from machines m
     where m.active and m.quality >= 1
       and m.geom && env
     group by floor(st_x(m.geom::geometry) / cell), floor(st_y(m.geom::geometry) / cell)
     having count(*) > 0
     limit 400
  ) c;

  return jsonb_build_object('points', pts, 'extra', '[]'::jsonb, 'clusters', cls, 'zoom', p_zoom);
end $$;

grant execute on function machines_view(double precision, double precision, double precision,
  double precision, double precision, double precision, integer, integer) to anon, authenticated;
