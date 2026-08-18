'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase, ensureSession } from '@/lib/supabase-browser';
import { makeT, agoText, reasonsFor, type Lang } from '@/lib/i18n';
import { effStatus, freshness, statusColor, formatDistance, minutesSince } from '@/lib/status';
import { liveness, rankForHero } from '@/lib/liveness';
import { hoursToday } from '@/lib/hours';
import { fullTitle, street, googleMapsUrl, googleDirectionsUrl } from '@/lib/format';
import type { Machine, Report, Status } from '@/lib/types';
import {
  IconMap, IconList, IconAward, IconInfo, IconPlus, IconSearch, IconBack,
  IconClose, IconNavigate, IconStore, IconRefresh, StatusIcon,
} from './icons';
import { MachinePhoto, BrandBadge, BrandMark } from './Photo';

const photoUrl = (m: Machine) => (m.photo_ref ? `/api/photo?ref=${encodeURIComponent(m.photo_ref)}` : null);

const MapView = dynamic(() => import('./MapView'), { ssr: false });
type Bounds = { south: number; west: number; north: number; east: number };
type Cluster = { lat: number; lng: number; n: number; n_machine: number };

const BRATISLAVA: [number, number] = [48.1486, 17.1077];
const REPORT_RADIUS_M = 150;
type View = 'home' | 'list' | 'detail' | 'points' | 'info';
type Filter = 'all' | 'ok' | 'cans' | 'big';

function withDistance(list: Machine[], pos: [number, number]): Machine[] {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  return list.map((m) => {
    const dLat = rad(m.lat - pos[0]);
    const dLng = rad(m.lng - pos[1]);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(pos[0])) * Math.cos(rad(m.lat)) * Math.sin(dLng / 2) ** 2;
    return { ...m, distance_m: 2 * R * Math.asin(Math.sqrt(h)) };
  });
}

export default function AppShell() {
  const [lang, setLang] = useState<Lang>('sk');
  const t = useMemo(() => makeT(lang), [lang]);

  const [pos, setPos] = useState<[number, number]>(BRATISLAVA);

  const [mapPoints, setMapPoints] = useState<Machine[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('home');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Machine | null>(null);
  const [feed, setFeed] = useState<Report[]>([]);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [profile, setProfile] = useState<{ points: number; reports_total: number; reports_confirmed: number } | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Machine[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    ensureSession().catch(console.error);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      () => {  },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const inflight = useRef<AbortController | null>(null);

  const load = useCallback(async (b?: Bounds, zoom = 13) => {
    const box = b ?? {
      south: pos[0] - 0.09, north: pos[0] + 0.09,
      west: pos[1] - 0.14, east: pos[1] + 0.14,
    };

    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;

    setLoading(true);
    try {
      const q = new URLSearchParams({
        south: String(box.south), west: String(box.west),
        north: String(box.north), east: String(box.east),
        lat: String(pos[0]), lng: String(pos[1]), zoom: String(zoom),
      });
      const r = await fetch(`/api/machines/bbox?${q}`, { signal: ac.signal });
      const json = await r.json();
      if (json.error) {
        console.error('/api/machines/bbox:', json.error);
        return;
      }
      const points = withDistance([...(json.points ?? []), ...(json.extra ?? [])], pos);
      setMapPoints(points);
      setClusters(json.clusters ?? []);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.error('/api/machines/bbox:', e);
    } finally {
      if (inflight.current === ac) setLoading(false);
    }
  }, [pos]);

  useEffect(() => { load(); }, [load]);

  const loadBounds = useCallback((b: Bounds, zoom: number) => { load(b, zoom); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (view !== 'points') return;
    supabase.from('reporters').select('points, reports_total, reports_confirmed').single()
      .then(({ data }) => data && setProfile(data));
  }, [view]);

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

  const passesFilter = useCallback((m: Machine) => {
    if (filter === 'ok') return liveness(m).status === 'ok';
    if (filter === 'cans') return m.accepts_cans;
    if (filter === 'big') return m.type === 'big';
    return true;
  }, [filter]);

  const pool = mapPoints;

  const visible = useMemo(
    () => [...pool].filter(passesFilter).sort((a, b) => a.distance_m - b.distance_m).slice(0, 60),
    [pool, passesFilter]
  );

  const nearestOk = useMemo(
    () => [...pool.filter((m) => liveness(m).status === 'ok')].sort(rankForHero)[0],
    [pool]
  );
  const open = useCallback(async (id: string) => {
    const m = [...pool, ...(results ?? [])].find((x) => x.id === id);
    if (!m) return;
    setSelected(m); setView('detail'); setFeed([]);
    const { data } = await supabase
      .from('public_reports').select('*')
      .eq('machine_id', id).order('created_at', { ascending: false }).limit(12);
    setFeed((data as Report[]) ?? []);
  }, [pool, results]);

  const heroLive = nearestOk ? liveness(nearestOk) : null;
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
    const l = liveness(m);
    const s = l.status, f = freshness(m);
    return (
      <button className="mc photo" onClick={() => open(m.id)}>
        <span className="thumb">
          <MachinePhoto photo={photoUrl(m)} name={m.name} chain={m.chain} lat={m.lat} lng={m.lng} rounded={16} zoom={17} />
          {l.kind !== 'no_machine' && (
            <span className={`badge ${s} ${l.kind === 'presumed' ? 'soft' : ''}`}>
              <StatusIcon status={s} size={12} />
            </span>
          )}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="nm">
            {m.name}
            {street(m) && <span className="street">, {street(m)}</span>}
          </span>
          <span className="ad">{m.city || t('noAddress')}</span>
          {l.kind === 'no_machine' ? (
            <span className="stat nomachine">{t('noMachine')}</span>
          ) : l.kind === 'confirmed' ? (
            <span className={`stat ${s} f${f}`}>
              <span className="bars"><i style={{ height: 4 }} /><i style={{ height: 7 }} /><i style={{ height: 11 }} /></span>
              {t(s)} · {agoText(minutesSince(m.status_at), t)}
            </span>
          ) : l.kind === 'presumed' ? (
            <span className={`stat presumed ${s}`}>
              {l.reason === 'permanently_closed' ? t('permClosed')
                : l.reason === 'closed' ? t('presumedClosed')
                : l.reason === 'assumed_closed' ? `${t('presumedClosed')} · ${t('hoursUnknown')}`
                : l.reason === 'assumed_open'
                  ? `${t('presumedOk')} · ${t('hoursUnknown')}`
                  : `${t('presumedOk')} · ${t('confidence', { n: Math.round(l.probability * 100) })}`}
            </span>
          ) : (
            <span className="stat unknown">{t('unknown')}</span>
          )}
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
        {}
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
            <button className="phero" onClick={() => open(nearestOk.id)}>
              <span className="bg">
                <MachinePhoto photo={photoUrl(nearestOk)} name={nearestOk.name} chain={nearestOk.chain} lat={nearestOk.lat} lng={nearestOk.lng} rounded={0} zoom={16} />
              </span>
              <span className="sc" />
              <span className="topright">
                {heroLive?.kind === 'confirmed'
                  ? <span className="livepill"><span className="blink" />{t('live')}</span>
                  : <span className="livepill soft">{t('confidence', { n: Math.round((heroLive?.probability ?? 0) * 100) })}</span>}
              </span>
              <span className="body">
                <span className="lbl">
                  {heroLive?.kind === 'confirmed' ? t('heroLabel') : t('heroPresumed')}
                </span>
                <span className="ttl">{fullTitle(nearestOk)}</span>
                <span className="meta">
                  <span className="dist">{formatDistance(nearestOk.distance_m, unit)}</span>
                  <BrandBadge name={nearestOk.name} chain={nearestOk.chain} size={24} radius={8} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {heroLive?.kind === 'confirmed'
                      ? agoText(minutesSince(nearestOk.status_at), t)
                      : hoursToday(nearestOk.opening_hours) ?? t('byHours')}
                  </span>
                </span>
              </span>
            </button>
          ) : (
            <div className="hero">
              <div className="lbl">{t('heroLabel')}</div>
              <div className="big" style={{ fontSize: 21, lineHeight: 1.2 }}>{t('heroNone')}</div>
              <div className="sub" style={{ marginTop: 6 }}>{t('heroNoneSub')}</div>
            </div>
          )}

          <div className="mapcard">
            <MapView
              machines={pool.filter(passesFilter)}
              clusters={clusters}
              center={pos}
              onSelect={open}
              onBoundsChange={loadBounds}
            />
            <div className="maplbl"><i />
              {clusters.length > 0
                ? t('clustered', { n: clusters.reduce((a, c) => a + c.n, 0) })
                : t('works', {
                    a: pool.filter((m) => liveness(m).status === 'ok').length,
                    b: pool.length,
                  })}
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
          {loading && pool.length === 0 && <div className="empty">{t('loading')}</div>}
          {!loading && visible.length === 0 && (
            <div className="empty">{filter === 'all' ? t('empty') : t('emptyFilter')}</div>
          )}
          {visible.map((m) => <MachineRow key={m.id} m={m} />)}
        </section>

        {}
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

        {}
        <section className={`view viewpad ${view === 'detail' ? 'on' : ''}`}>
          {selected && (() => {
            const st = effStatus(selected);
            const dl = liveness(selected);
            const heroKey = st === 'ok' ? 'hOk' : st === 'issue' ? 'hIssue' : st === 'down' ? 'hDown' : 'hUnknown';
            return (
              <>
                {}
                <div className="dphoto">
                  <div className="bg">
                    <MachinePhoto photo={photoUrl(selected)} name={selected.name} chain={selected.chain} lat={selected.lat} lng={selected.lng} rounded={0} zoom={17} />
                  </div>
                  <div className="sc" />
                  <div className="nav-top">
                    <button className="glassbtn" onClick={() => setView('home')} aria-label={t('back')}>
                      <IconBack size={19} />
                    </button>
                    <div style={{ flex: 1 }} />
                    <a className="glassbtn"
                       href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                       target="_blank" rel="noreferrer noopener" aria-label={t('route')}>
                      <IconNavigate size={18} />
                    </a>
                  </div>
                  {selected.photo_credit && <div className="credit">{selected.photo_credit}</div>}
                </div>

                {}
                <div className="gcard">
                  <div className="row1">
                    <BrandBadge name={selected.name} chain={selected.chain} size={52} radius={18} />
                    <h1>{selected.name}</h1>
                  </div>
                  <div className="sub">
                    {[street(selected), selected.city].filter(Boolean).join(', ') || t('noAddress')}
                  </div>

                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {dl.kind === 'no_machine' ? (
                      <span className="livepill unknown">{t('noMachine')}</span>
                    ) : dl.kind === 'confirmed' ? (
                      <span className={`livepill ${st}`}>
                        <StatusIcon status={st} size={13} />{t(heroKey as 'hOk')}
                      </span>
                    ) : dl.kind === 'presumed' ? (
                      <>
                        <span className={`livepill soft ${dl.status}`}>
                          <StatusIcon status={dl.status} size={13} />
                          {dl.reason === 'permanently_closed' ? t('permClosed')
                            : dl.reason === 'closed' ? t('presumedClosed')
                            : dl.reason === 'assumed_closed' ? t('presumedClosed')
                            : `${t('presumedOk')} · ${t('confidence', { n: Math.round(dl.probability * 100) })}`}
                        </span>
                        <span className="tag off">{t('notConfirmed')}</span>
                      </>
                    ) : (
                      <span className="livepill unknown">{t('hUnknown')}</span>
                    )}
                  </div>

                  <div className="gstats">
                    <div>
                      <b style={{ color: statusColor(st) }}>
                        {selected.status_at ? agoText(minutesSince(selected.status_at), t) : '—'}
                      </b>
                      <small>{t('tLast')}</small>
                    </div>
                    <div><b>{selected.status_reports}</b><small>{t('tConf')}</small></div>
                    <div><b>{formatDistance(selected.distance_m, unit)}</b><small>{t('tDist')}</small></div>
                  </div>

                  <div className="tags">
                    <span className={`tag ${selected.accepts_pet ? 'on' : 'off'}`}>PET</span>
                    <span className={`tag ${selected.accepts_cans ? 'on' : 'off'}`}>{t('cans')}</span>
                    <span className="tag">
                      {selected.type === 'manual' ? t('vManual') : selected.type === 'big' ? t('vBig') : t('vAuto')}
                    </span>
                    {selected.opening_hours && <span className="tag">{selected.opening_hours}</span>}
                    {selected.open_now === true && <span className="tag on">{t('open')}</span>}
                    {selected.open_now === false && <span className="tag off">{t('closed')}</span>}
                  </div>
                </div>

                <Timeline feed={feed} t={t} />

                {dl.kind !== 'confirmed' && (
                  <div className="explain">
                    <b>{t('howWeKnow')}</b>
                    <span>{t('howText')}</span>
                  </div>
                )}

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
                  <a className="btn gh" href={googleMapsUrl(selected)} target="_blank" rel="noreferrer noopener">
                    <IconMap size={18} />{t('onMap')}
                  </a>
                  <a className="btn gh" href={googleDirectionsUrl(selected)} target="_blank" rel="noreferrer noopener">
                    <IconNavigate size={18} />{t('route')}
                  </a>
                </div>
                <div className="acts">
                  <button className="btn pri" onClick={() => setSheet(true)}>{t('report')}</button>
                </div>
                <div className="src"><span>{t('source')}</span></div>
              </>
            );
          })()}
        </section>

        {}
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

        {}
        <section className={`view ${view === 'info' ? 'on' : ''}`}>
          <div className="hd"><div className="loc"><small>{t('about')}</small><b>Zálohomat</b></div></div>
          <div className="rows">
            <div className="row"><span className="k">{t('iSources')}</span><span className="v">OSM · {t('iUsers')}</span></div>
            <div className="row"><span className="k">{t('iRefresh')}</span><span className="v">15 min</span></div>
            <div className="row"><span className="k">{t('iMachines')}</span><span className="v">{pool.length}</span></div>
          </div>
          <div className="src"><span>{t('iLicence')}</span></div>
          <div className="src" style={{ marginTop: 12 }}><span>{t('iPrivacy')}</span></div>
        </section>
      </div>

      <nav className="nav">
        <button className={view === 'home' || view === 'detail' ? 'on' : ''} onClick={() => setView('home')} aria-label={t('nav1')}>
          <IconMap size={22} />
        </button>
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label={t('nav2')}>
          <IconList size={22} />
        </button>
        <button className="fab" onClick={() => { if (selected) setSheet(true); else setView('home'); }}
                aria-label={t('report')}>
          <IconPlus size={24} />
        </button>
        <button className={view === 'points' ? 'on' : ''} onClick={() => setView('points')} aria-label={t('nav3')}>
          <IconAward size={22} />
        </button>
        <button className={view === 'info' ? 'on' : ''} onClick={() => setView('info')} aria-label={t('nav4')}>
          <IconInfo size={22} />
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
