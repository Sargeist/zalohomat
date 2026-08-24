-- ============================================================
--  0011: stabilne zoradenie pri strankovani
--
--  points (LIMIT n) a extra (OFFSET n) su dva samostatne dopyty. Ked ma
--  viac riadkov rovnaku vzdialenost, Postgres nezarucuje rovnake poradie
--  v oboch — ten isty bod sa potom objavi v oboch zoznamoch.
--  Doplnenie m.id do ORDER BY robi zoradenie jednoznacnym.
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
  extra_limit integer;
begin
  env := st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography;

  cell := case
            when p_zoom >= 12 then null
            when p_zoom >= 10 then 0.03
            when p_zoom >= 8  then 0.12
            else 0.45
          end;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into pts
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
     order by 8, m.id
     limit p_points
  ) t;

  if cell is null then
    extra_limit := case when p_zoom >= 14 then 900 else 1400 end;

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
       order by 8, m.id
       offset p_points
       limit extra_limit
    ) t;

    return jsonb_build_object('points', pts, 'extra', cls, 'clusters', '[]'::jsonb, 'zoom', p_zoom);
  end if;

  select coalesce(jsonb_agg(c), '[]'::jsonb) into cls
  from (
    select round(avg(st_y(m.geom::geometry))::numeric, 5)::double precision as lat,
           round(avg(st_x(m.geom::geometry))::numeric, 5)::double precision as lng,
           count(*)::integer as n,
           count(*) filter (where m.machine_presence in ('yes','manual'))::integer as n_machine
      from machines m
     where m.active and m.quality >= 1
       and m.geom && env
     group by floor(st_x(m.geom::geometry) / cell), floor(st_y(m.geom::geometry) / cell)
     limit 600
  ) c;

  return jsonb_build_object('points', pts, 'extra', '[]'::jsonb, 'clusters', cls, 'zoom', p_zoom);
end $$;

grant execute on function machines_view(double precision, double precision, double precision,
  double precision, double precision, double precision, integer, integer) to anon, authenticated;
