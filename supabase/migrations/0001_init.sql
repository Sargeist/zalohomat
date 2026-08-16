-- ============================================================
--  Zálohomat — schéma, konsenzus a ochrana proti manipulácii
--  Spusti celý súbor v Supabase -> SQL Editor
-- ============================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- typy ----------
do $$ begin
  create type machine_status as enum ('ok','issue','down');
exception when duplicate_object then null; end $$;

do $$ begin
  create type collection_type as enum ('auto','big','manual');
exception when duplicate_object then null; end $$;

-- ---------- odberné miesta ----------
create table if not exists machines (
  id             uuid primary key default gen_random_uuid(),
  external_id    text unique,                    -- 'osm:node/123', 'szs:456'
  source         text not null default 'osm',    -- osm | szs | retailer | manual
  name           text not null,
  chain          text,
  address        text,
  city           text,
  geom           geography(Point,4326) not null,
  opening_hours  text,
  accepts_pet    boolean not null default true,
  accepts_cans   boolean not null default true,
  type           collection_type not null default 'auto',
  active         boolean not null default true,
  -- cache konsenzu (prepocitava sa triggerom, aby citanie bolo lacne)
  status            machine_status,
  status_confidence real    not null default 0,
  status_reports    integer not null default 0,
  status_at         timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists machines_geom_idx on machines using gist (geom);
create index if not exists machines_active_idx on machines (active) where active;

-- ---------- prispievatelia (anonymni, bez osobnych udajov) ----------
create table if not exists reporters (
  id                uuid primary key references auth.users(id) on delete cascade,
  reputation        real    not null default 1.0,   -- 0.1 .. 3.0
  reports_total     integer not null default 0,
  reports_confirmed integer not null default 0,
  points            integer not null default 0,
  shadow_banned     boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ---------- hlasenia ----------
create table if not exists reports (
  id           bigserial primary key,
  machine_id   uuid not null references machines(id) on delete cascade,
  reporter_id  uuid not null references reporters(id) on delete cascade,
  status       machine_status not null,
  reasons      text[] not null default '{}',
  distance_m   real not null,
  accuracy_m   real,
  weight       real not null default 1.0,
  ip_hash      text,                -- iba hash + sol, nikdy surova IP
  created_at   timestamptz not null default now()
);
create index if not exists reports_machine_time_idx on reports (machine_id, created_at desc);
create index if not exists reports_reporter_time_idx on reports (reporter_id, created_at desc);

-- ============================================================
--  KONSENZUS: stav = vazeny sucet hlaseni s exponencialnym utlmom
--  Jedno hlasenie nikdy nerozhodne. Polcas rozpadu ~3 h.
-- ============================================================
create or replace function recompute_status(p_machine uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  w_ok real := 0; w_issue real := 0; w_down real := 0; w_total real;
  best machine_status; best_w real; last_at timestamptz; n integer;
begin
  select
    coalesce(sum(case when status='ok'    then weight * exp(-extract(epoch from (now()-created_at))/10800.0) end),0),
    coalesce(sum(case when status='issue' then weight * exp(-extract(epoch from (now()-created_at))/10800.0) end),0),
    coalesce(sum(case when status='down'  then weight * exp(-extract(epoch from (now()-created_at))/10800.0) end),0),
    max(created_at), count(*)
  into w_ok, w_issue, w_down, last_at, n
  from reports
  where machine_id = p_machine and created_at > now() - interval '48 hours';

  w_total := w_ok + w_issue + w_down;

  if w_total < 0.15 then           -- prilis stare alebo ziadne data
    update machines set status = null, status_confidence = 0,
           status_reports = 0, status_at = last_at, updated_at = now()
     where id = p_machine;
    return;
  end if;

  best := 'ok'; best_w := w_ok;
  if w_issue > best_w then best := 'issue'; best_w := w_issue; end if;
  if w_down  > best_w then best := 'down';  best_w := w_down;  end if;

  update machines
     set status = best,
         status_confidence = round((best_w / w_total)::numeric, 3),
         status_reports = n,
         status_at = last_at,
         updated_at = now()
   where id = p_machine;
end $$;

-- ============================================================
--  REPUTACIA: kto sa trafil do konsenzu, ten rastie
-- ============================================================
create or replace function update_reputation(p_report bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r reports%rowtype; consensus machine_status;
begin
  select * into r from reports where id = p_report;
  select status into consensus from machines where id = r.machine_id;
  if consensus is null then return; end if;

  if consensus = r.status then
    update reporters
       set reputation = least(3.0, reputation + 0.05),
           reports_confirmed = reports_confirmed + 1,
           points = points + 10
     where id = r.reporter_id;
  else
    update reporters
       set reputation = greatest(0.1, reputation - 0.20)
     where id = r.reporter_id;
  end if;
end $$;

-- ============================================================
--  HLAVNE RPC: jedina cesta, ako sa hlasenie dostane do DB
--  Klient NIKDY nepise priamo do tabulky reports.
-- ============================================================
create or replace function submit_report(
  p_machine   uuid,
  p_status    machine_status,
  p_reasons   text[],
  p_lat       double precision,
  p_lng       double precision,
  p_accuracy  real,
  p_ip_hash   text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  rep reporters%rowtype;
  d   real;
  w   real;
  rid bigint;
  recent integer;
begin
  if uid is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  insert into reporters (id) values (uid) on conflict (id) do nothing;
  select * into rep from reporters where id = uid;

  -- 1) presnost GPS: nepresna poloha = neplatne hlasenie
  if p_accuracy is null or p_accuracy > 100 then
    return jsonb_build_object('ok', false, 'error', 'gps_accuracy');
  end if;

  -- 2) geo-overenie na serveri (klientovi neverime nikdy)
  select st_distance(geom, st_point(p_lng, p_lat)::geography)
    into d from machines where id = p_machine and active;
  if d is null then
    return jsonb_build_object('ok', false, 'error', 'machine_not_found');
  end if;
  if d > 150 then
    return jsonb_build_object('ok', false, 'error', 'too_far', 'distance_m', round(d));
  end if;

  -- 3) rate limit: 12 hlaseni / hodinu na ucet
  select count(*) into recent from reports
   where reporter_id = uid and created_at > now() - interval '1 hour';
  if recent >= 12 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- 4) rate limit: ten isty automat najviac raz za 15 minut
  select count(*) into recent from reports
   where reporter_id = uid and machine_id = p_machine
     and created_at > now() - interval '15 minutes';
  if recent > 0 then
    return jsonb_build_object('ok', false, 'error', 'duplicate');
  end if;

  -- 5) vaha hlasenia = reputacia, znizena pri vacsej vzdialenosti
  w := rep.reputation * (case when d < 50 then 1.0 when d < 100 then 0.8 else 0.6 end);
  -- shadow ban: hlasenie sa ulozi, ale nema ziadnu vahu a autor to nevie
  if rep.shadow_banned then w := 0; end if;

  insert into reports (machine_id, reporter_id, status, reasons, distance_m, accuracy_m, weight, ip_hash)
  values (p_machine, uid, p_status, coalesce(p_reasons,'{}'), d, p_accuracy, w, p_ip_hash)
  returning id into rid;

  update reporters set reports_total = reports_total + 1 where id = uid;

  perform recompute_status(p_machine);
  perform update_reputation(rid);

  return (
    select jsonb_build_object(
      'ok', true, 'status', m.status, 'confidence', m.status_confidence,
      'reports', m.status_reports, 'distance_m', round(d))
    from machines m where m.id = p_machine
  );
end $$;

-- ============================================================
--  CITANIE: automaty v okoli
-- ============================================================
create or replace function machines_near(
  p_lat double precision, p_lng double precision, p_radius_m integer default 5000
) returns table (
  id uuid, name text, chain text, address text, city text,
  lat double precision, lng double precision, distance_m real,
  opening_hours text, accepts_pet boolean, accepts_cans boolean,
  type collection_type, source text,
  status machine_status, status_confidence real, status_reports integer, status_at timestamptz
) language sql stable as $$
  select m.id, m.name, m.chain, m.address, m.city,
         st_y(m.geom::geometry), st_x(m.geom::geometry),
         st_distance(m.geom, st_point(p_lng, p_lat)::geography)::real,
         m.opening_hours, m.accepts_pet, m.accepts_cans, m.type, m.source,
         m.status, m.status_confidence, m.status_reports, m.status_at
    from machines m
   where m.active
     and st_dwithin(m.geom, st_point(p_lng, p_lat)::geography, p_radius_m)
   order by 8
   limit 300;
$$;

-- verejny feed hlaseni (bez ip_hash a bez identity autora)
create or replace view public_reports as
  select id, machine_id, status, reasons, created_at
    from reports
   where created_at > now() - interval '7 days';

-- ============================================================
--  RLS — vsetko zamknute, citanie povolene bodovo
-- ============================================================
alter table machines  enable row level security;
alter table reports   enable row level security;
alter table reporters enable row level security;

drop policy if exists machines_read on machines;
create policy machines_read on machines for select using (active);

drop policy if exists reports_read on reports;
create policy reports_read on reports for select using (created_at > now() - interval '7 days');

-- ZIADNA insert/update/delete politika => zapis len cez submit_report (security definer)

drop policy if exists reporters_self on reporters;
create policy reporters_self on reporters for select using (id = auth.uid());

grant select on machines to anon, authenticated;
grant select on public_reports to anon, authenticated;
grant execute on function submit_report(uuid, machine_status, text[], double precision, double precision, real, text) to authenticated;
grant execute on function machines_near(double precision, double precision, integer) to anon, authenticated;

-- ============================================================
--  DETEKCIA ANOMALII (spustaj cez pg_cron alebo rucne)
--  Ucet, ktoreho hlasenia sustavne popiera konsenzus -> shadow ban
-- ============================================================
create or replace function flag_suspicious_reporters() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update reporters set shadow_banned = true
   where reports_total >= 10
     and reports_confirmed::real / nullif(reports_total,0) < 0.35
     and not shadow_banned;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================
--  IMPORT: hromadny upsert z OSM / SZS / retailerov
-- ============================================================
create or replace function upsert_machines(payload jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0; r jsonb;
begin
  for r in select * from jsonb_array_elements(payload) loop
    insert into machines (external_id, source, name, chain, address, city, geom,
                          opening_hours, accepts_pet, accepts_cans, type)
    values (
      r->>'external_id', coalesce(r->>'source','osm'), r->>'name', r->>'chain',
      r->>'address', r->>'city',
      st_point((r->>'lng')::double precision, (r->>'lat')::double precision)::geography,
      r->>'opening_hours',
      coalesce((r->>'accepts_pet')::boolean, true),
      coalesce((r->>'accepts_cans')::boolean, true),
      coalesce((r->>'type')::collection_type, 'auto')
    )
    on conflict (external_id) do update set
      name = excluded.name, chain = excluded.chain, address = excluded.address,
      city = excluded.city, geom = excluded.geom, opening_hours = excluded.opening_hours,
      accepts_pet = excluded.accepts_pet, accepts_cans = excluded.accepts_cans,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function upsert_machines(jsonb) from anon, authenticated;
