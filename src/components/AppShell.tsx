'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase, ensureSession } from '@/lib/supabase-browser';
import { makeT, agoText, reasonsFor, type Lang } from '@/lib/i18n';
import { effStatus, freshness, statusColor, formatDistance, minutesSince } from '@/lib/status';
import type { Machine, Report, Status } from '@/lib/types';
import {
  IconMap, IconList, IconAward, IconInfo, IconPlus, IconSearch, IconBack,
  IconClose, IconNavigate, IconStore, IconRefresh, StatusIcon,
} from './icons';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

const BRATISLAVA: [number, number] = [48.1486, 17.1077];
const REPORT_RADIUS_M = 150;
type View = 'home' | 'list' | 'detail' | 'points' | 'info';
type Filter = 'all' | 'ok' | 'cans' | 'big';

export default function AppShell() {
  const [lang, setLang] = useState<Lang>('sk');
  const t = useMemo(() => makeT(lang), [lang]);

  const [pos, setPos] = useState<[number, number]>(BRATISLAVA);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('home');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Machine | null>(null);
  const [feed, setFeed] = useState<Report[]>([]);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [profile, setProfile] = useState<{ points: number; reports_total: number; reports_confirmed: number } | null>(null);

  // vyhladavanie
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Machine[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    ensureSession().catch(console.error);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      () => { /* poloha zamietnuta — ostavame na predvolenom strede */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/machines?lat=${pos[0]}&lng=${pos[1]}&radius=8000`);
      const json = await r.json();
      setMachines(json.machines ?? []);
    } catch { /* offline — ponechame stare data */ }
    finally { setLoading(false); }
  }, [pos]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (view !== 'points') return;
    supabase.from('reporters').select('points, reports_total, reports_confirmed').single()
      .then(({ data }) => data && setProfile(data));
  }, [view]);

  /* ---------- vyhladavanie s oneskorenim ---------- */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (view !== 'list') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/machines/search?q=${encodeURIComponent(query)}&lat=${pos[0]}&lng=${pos[1]}`);
        const json = await r.json();
        setResults(json.machines ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 280);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, view, pos]);

  const open = useCallback(async (id: string) => {
    const m = [...machines, ...(results ?? [])].find((x) => x.id === id);
    if (!m) return;
    setSelected(m); setView('detail'); setFeed([]);
    const { data } = await supabase
      .from('public_reports').select('*')
      .eq('machine_id', id).order('created_at', { ascending: false }).limit(12);
    setFeed((data as Report[]) ?? []);
  }, [machines, results]);

  const visible = useMemo(() => machines.filter((m) => {
    if (filter === 'ok') return effStatus(m) === 'ok';
    if (filter === 'cans') return m.accepts_cans;
    if (filter === 'big') return m.type === 'big';
    return true;
  }).sort((a, b) => a.distance_m - b.distance_m), [machines, filter]);

  const nearestOk = useMemo(
    () => machines.filter((m) => effStatus(m) === 'ok').sort((a, b) => a.distance_m - b.distance_m)[0],
    [machines]
  );
  const unit = { m: t('m'), km: t('km') };

  async function send(status: Status, coords: GeolocationCoordinates, reasons: string[]) {
    await ensureSession();
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        machineId: selected!.id, status, reasons,
        lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setToast({ text: t('sent') });
      setSheet(false);
      await load();
    } else {
      const map: Record<string, string> = {
        rate_limited: t('errRate'), duplicate: t('errDup'),
        gps_accuracy: t('errAcc'), too_far: t('geoFar', { d: json.distance_m ?? '?' }),
      };
      setToast({ text: map[json.error] ?? t('errGeneric'), bad: true });
    }
    setTimeout(() => setToast(null), 3400);
  }

  const MachineRow = ({ m }: { m: Machine }) => {
    const s = effStatus(m), f = freshness(m);
    return (
      <button className="mc" onClick={() => open(m.id)}>
        <span className={`av ${s}`}><StatusIcon status={s} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="nm">{m.name}</span>
          <span className="ad">{[m.address, m.city].filter(Boolean).join(', ') || '—'}</span>
          <span className={`stat ${s} f${f}`}>
            <span className="bars"><i style={{ height: 4 }} /><i style={{ height: 7 }} /><i style={{ height: 11 }} /></span>
            {t(s)}{m.status_at ? ` · ${agoText(minutesSince(m.status_at), t)}` : ''}
          </span>
        </span>
        <span className="rt">
          <b>{m.distance_m ? formatDistance(m.distance_m, unit) : ''}</b>
          {m.open_now === false && <small>{t('closed')}</small>}
        </span>
      </button>
    );
  };

  return (
    <div className="app">
      <div className="views">
        {/* ============ MAPA ============ */}
        <section className={`view ${view === 'home' ? 'on' : ''}`}>
          <div className="hd">
            <div className="loc"><small>{t('loc')}</small><b>Bratislava</b></div>
            <div className="langsw">
              {(['sk', 'ru'] as Lang[]).map((l) => (
                <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {nearestOk ? (
            <button className="hero" onClick={() => open(nearestOk.id)}>
              <span className="badge"><span className="blink" />{t('live')}</span>
              <div className="lbl">{t('heroLabel')}</div>
              <div className="big">{formatDistance(nearestOk.distance_m, unit)}</div>
              <div className="sub">{nearestOk.name} · {agoText(minutesSince(nearestOk.status_at), t)}</div>
            </button>
          ) : (
            <div className="hero">
              <div className="lbl">{t('heroLabel')}</div>
              <div className="big" style={{ fontSize: 21, lineHeight: 1.2 }}>{t('heroNone')}</div>
              <div className="sub" style={{ marginTop: 6 }}>{t('heroNoneSub')}</div>
            </div>
          )}

          <div className="mapcard">
            <MapView machines={visible} center={pos} onSelect={open} />
            <div className="maplbl"><i />
              {t('works', { a: machines.filter((m) => effStatus(m) === 'ok').length, b: machines.length })}
            </div>
          </div>

          <div className="pills">
            {([['all', t('all')], ['ok', t('ok')], ['cans', t('cans')], ['big', t('big')]] as [Filter, string][])
              .map(([k, label]) => (
                <button key={k} className="pill" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'ok' && <i style={{ background: 'var(--ok)' }} />}{label}
                </button>
              ))}
          </div>

          <div className="st"><h2>{t('near')}</h2><span>{visible.length}</span></div>
          {loading && <div className="empty">{t('loading')}</div>}
          {!loading && visible.length === 0 && <div className="empty">{t('empty')}</div>}
          {visible.map((m) => <MachineRow key={m.id} m={m} />)}
        </section>

        {/* ============ ZOZNAM + VYHLADAVANIE ============ */}
        <section className={`view ${view === 'list' ? 'on' : ''}`}>
          <div className="hd"><div className="loc"><small>{t('allMachines')}</small><b>{t('nav2')}</b></div></div>

          <div className="searchbar">
            <IconSearch size={20} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
            />
            {query && <button onClick={() => setQuery('')} aria-label={t('cancel')}><IconClose size={18} /></button>}
          </div>

          {searching && <div className="empty">{t('searching')}</div>}

          {!searching && results && results.length === 0 && (
            <div className="notfound">
              <div className="ic"><IconStore size={26} /></div>
              <b>{query ? t('notFoundTitle') : t('emptyDbTitle')}</b>
              <span>{query ? t('notFoundText', { q: query }) : t('emptyDbText')}</span>
            </div>
          )}

          {!searching && results && results.length > 0 && (
            <>
              <div className="hint">{t('foundN', { n: results.length })}</div>
              {results.map((m) => <MachineRow key={m.id} m={m} />)}
            </>
          )}
        </section>

        {/* ============ DETAIL ============ */}
        <section className={`view ${view === 'detail' ? 'on' : ''}`}>
          {selected && (() => {
            const s = effStatus(selected);
            const heroKey = s === 'ok' ? 'hOk' : s === 'issue' ? 'hIssue' : s === 'down' ? 'hDown' : 'hUnknown';
            return (
              <>
                <div className="dhd">
                  <button className="rnd" onClick={() => setView('home')} aria-label={t('back')}>
                    <IconBack size={20} />
                  </button>
                  <h1>{selected.name}<small>{[selected.address, selected.city].filter(Boolean).join(', ') || '—'}</small></h1>
                </div>
                <div className={`shero ${s}`}>
                  <div className="ring"><StatusIcon status={s} size={28} /></div>
                  <div className="big">{t(heroKey as 'hOk')}</div>
                  <div className="sub">
                    {s === 'unknown' ? t('noReport')
                      : t('lastReport', { ago: agoText(minutesSince(selected.status_at), t) })}
                  </div>
                </div>
                <div className="tri">
                  <div><b style={{ color: statusColor(s) }}>
                    {selected.status_at ? agoText(minutesSince(selected.status_at), t) : '—'}</b>
                    <small>{t('tLast')}</small></div>
                  <div><b>{selected.status_reports}</b><small>{t('tConf')}</small></div>
                  <div><b>{formatDistance(selected.distance_m, unit)}</b><small>{t('tDist')}</small></div>
                </div>
                <Timeline feed={feed} t={t} />
                <div className="rows">
                  <div className="row"><span className="k">{t('kHours')}</span><span className="v">
                    {selected.opening_hours ?? '—'}
                    {selected.open_now !== null && selected.open_now !== undefined &&
                      ` · ${selected.open_now ? t('open') : t('closed')}`}
                  </span></div>
                  <div className="row"><span className="k">{t('kTakes')}</span><span className="v">
                    {selected.accepts_pet ? 'PET' : ''}{selected.accepts_cans ? ' · ' + t('cans') : ''}</span></div>
                  <div className="row"><span className="k">{t('kType')}</span><span className="v">
                    {selected.type === 'manual' ? t('vManual') : selected.type === 'big' ? t('vBig') : t('vAuto')}</span></div>
                  <div className="row"><span className="k">{t('kRefund')}</span><span className="v">{t('vCoupon')}</span></div>
                </div>
                <div className="st"><h2>{t('feed')}</h2></div>
                <div className="feed">
                  {feed.length === 0 && <div className="fi"><span className="n">{t('noReports')}</span></div>}
                  {feed.map((r) => (
                    <div className="fi" key={r.id}>
                      <span className="d" style={{ background: statusColor(r.status) }} />
                      <span style={{ flex: 1 }}>
                        <span className="t">{t(r.status)}</span>
                        {r.reasons.length > 0 && <span className="n">{r.reasons.join(' · ')}</span>}
                      </span>
                      <span className="a">{agoText(minutesSince(r.created_at), t)}</span>
                    </div>
                  ))}
                </div>
                <div className="acts">
                  <a className="btn gh"
                     href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                     target="_blank" rel="noreferrer noopener">
                    <IconNavigate size={19} />{t('route')}
                  </a>
                  <button className="btn pri" onClick={() => setSheet(true)}>{t('report')}</button>
                </div>
                <div className="src"><span>{t('source')}</span></div>
              </>
            );
          })()}
        </section>

        {/* ============ BODY ============ */}
        <section className={`view ${view === 'points' ? 'on' : ''}`}>
          <div className="hd"><div className="loc"><small>{t('pContrib')}</small><b>{t('pTitle')}</b></div></div>
          <div className="prof">
            <div className="ava">Z</div>
            <div style={{ flex: 1 }}>
              <b>{t('pContrib')}</b>
              <small>{t('pLevel', { n: Math.floor((profile?.points ?? 0) / 300) + 1 })}</small>
              <div className="lvl"><i style={{ width: `${((profile?.points ?? 0) % 300) / 3}%` }} /></div>
            </div>
          </div>
          <div className="grid">
            <div className="sc acc"><div className="h">{t('pPoints')}</div>
              <div className="n">{profile?.points ?? 0}</div><div className="f">&nbsp;</div></div>
            <div className="sc"><div className="h">{t('pReports')}</div>
              <div className="n">{profile?.reports_total ?? 0}</div><div className="f">&nbsp;</div></div>
            <div className="sc"><div className="h">{t('pAcc')}</div>
              <div className="n">{profile && profile.reports_total > 0
                ? Math.round((profile.reports_confirmed / profile.reports_total) * 100) + '%' : '—'}</div>
              <div className="f">{t('pAccF')}</div></div>
            <div className="sc"><div className="h">{t('pRank')}</div>
              <div className="n">—</div><div className="f">{t('pRankF')}</div></div>
          </div>
        </section>

        {/* ============ INFO ============ */}
        <section className={`view ${view === 'info' ? 'on' : ''}`}>
          <div className="hd"><div className="loc"><small>{t('about')}</small><b>Zálohomat</b></div></div>
          <div className="rows">
            <div className="row"><span className="k">{t('iSources')}</span><span className="v">OSM · {t('iUsers')}</span></div>
            <div className="row"><span className="k">{t('iRefresh')}</span><span className="v">15 min</span></div>
            <div className="row"><span className="k">{t('iMachines')}</span><span className="v">{machines.length}</span></div>
          </div>
          <div className="src"><span>{t('iLicence')}</span></div>
          <div className="src" style={{ marginTop: 12 }}><span>{t('iPrivacy')}</span></div>
        </section>
      </div>

      <nav className="nav">
        <button className={view === 'home' || view === 'detail' ? 'on' : ''} onClick={() => setView('home')}>
          <IconMap size={21} />{t('nav1')}
        </button>
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
          <IconList size={21} />{t('nav2')}
        </button>
        <button className="fab" onClick={() => { if (selected) setSheet(true); else setView('home'); }}
                aria-label={t('report')}>
          <IconPlus size={24} />
        </button>
        <button className={view === 'points' ? 'on' : ''} onClick={() => setView('points')}>
          <IconAward size={21} />{t('nav3')}
        </button>
        <button className={view === 'info' ? 'on' : ''} onClick={() => setView('info')}>
          <IconInfo size={21} />{t('nav4')}
        </button>
      </nav>

      <div className={`scrim ${sheet ? 'on' : ''}`} onClick={() => setSheet(false)} />
      {selected && (
        <ReportSheet open={sheet} machine={selected} t={t} lang={lang}
                     onClose={() => setSheet(false)} onSend={send} />
      )}
      {toast && <div className={`toast on ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}

/* ---------- 24-hodinova os stavu ---------- */
function Timeline({ feed, t }: { feed: Report[]; t: ReturnType<typeof makeT> }) {
  const hours: (Status | null)[] = Array(24).fill(null);
  feed.forEach((r) => {
    const i = 23 - Math.floor(minutesSince(r.created_at) / 60);
    if (i >= 0 && i < 24 && !hours[i]) hours[i] = r.status;
  });
  let last: Status | null = null;
  return (
    <div className="tlcard">
      <div className="cap"><b>{t('day')}</b><span>{t('byReports')}</span></div>
      <div className="tl">
        {hours.map((v, i) => {
          if (v) last = v;
          const val = v ?? (i > 3 ? last : null);
          const h = val ? (val === 'ok' ? '100%' : val === 'issue' ? '62%' : '34%') : '14%';
          return <i key={i} className={val ?? ''} style={{ height: h }} />;
        })}
      </div>
      <div className="tlax"><span>−24 h</span><span>−12 h</span><span>{t('now')}</span></div>
    </div>
  );
}

/* ---------- sablona hlasenia ---------- */
type GeoState =
  | { kind: 'wait' }
  | { kind: 'ok'; coords: GeolocationCoordinates; distance: number }
  | { kind: 'far'; coords: GeolocationCoordinates; distance: number }
  | { kind: 'denied' };

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ReportSheet({ open, machine, t, lang, onClose, onSend }: {
  open: boolean; machine: Machine; t: ReturnType<typeof makeT>; lang: Lang;
  onClose: () => void; onSend: (s: Status, c: GeolocationCoordinates, r: string[]) => Promise<void>;
}) {
  const [pick, setPick] = useState<Status | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<GeoState>({ kind: 'wait' });

  useEffect(() => {
    if (!open) { setPick(null); setReasons([]); setBusy(false); setGeo({ kind: 'wait' }); return; }
    if (!navigator.geolocation) { setGeo({ kind: 'denied' }); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const d = haversine(p.coords.latitude, p.coords.longitude, machine.lat, machine.lng);
        setGeo(d <= REPORT_RADIUS_M
          ? { kind: 'ok', coords: p.coords, distance: d }
          : { kind: 'far', coords: p.coords, distance: d });
      },
      () => setGeo({ kind: 'denied' }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [open, machine.lat, machine.lng]);

  const opts: [Status, string, string][] = [
    ['ok', t('oOk'), t('oOkS')],
    ['issue', t('oIssue'), t('oIssueS')],
    ['down', t('oDown'), t('oDownS')],
  ];

  const geoClass = geo.kind === 'ok' ? 'ok' : geo.kind === 'wait' ? 'wait' : 'err';
  const geoText =
    geo.kind === 'ok' ? t('geoOk', { d: Math.round(geo.distance) })
    : geo.kind === 'far' ? t('geoFar', { d: Math.round(geo.distance) })
    : geo.kind === 'denied' ? t('geoDenied')
    : t('geoWait');

  return (
    <div className={`sheet ${open ? 'on' : ''}`}>
      <div className="grab" />
      <h2>{t('dlgTitle')}</h2>
      <div className="who">{machine.name}{machine.address ? ` · ${machine.address}` : ''}</div>
      <div className={`geo ${geoClass}`}>
        {geo.kind === 'wait' ? <IconRefresh size={15} /> : <StatusIcon status={geo.kind === 'ok' ? 'ok' : 'down'} size={15} />}
        {geoText}
      </div>

      {opts.map(([k, title, sub]) => (
        <button key={k} className={`opt ${k}`} aria-pressed={pick === k} onClick={() => setPick(k)}>
          <span className="ic"><StatusIcon status={k} size={20} /></span>
          <span className="txt"><span className="tt">{title}</span><span className="ss">{sub}</span></span>
        </button>
      ))}

      {pick && pick !== 'ok' && (
        <div className="reasons">
          {reasonsFor(lang).map((r) => (
            <button key={r} className="pill" aria-pressed={reasons.includes(r)}
              onClick={() => setReasons((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r])}>{r}</button>
          ))}
        </div>
      )}

      <div className="note">{t('privacy')}</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn gh" onClick={onClose}>{t('cancel')}</button>
        <button className="btn pri" disabled={!pick || busy || geo.kind !== 'ok'}
          onClick={async () => {
            if (geo.kind !== 'ok' || !pick) return;
            setBusy(true); await onSend(pick, geo.coords, reasons); setBusy(false);
          }}>
          {busy ? t('sending') : t('send')}
        </button>
      </div>
    </div>
  );
}
