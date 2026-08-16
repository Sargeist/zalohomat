'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase, ensureSession } from '@/lib/supabase-browser';
import { makeT, agoText, reasonsFor, type Lang } from '@/lib/i18n';
import { effStatus, freshness, glyph, statusColor, formatDistance, minutesSince } from '@/lib/status';
import type { Machine, Report, Status } from '@/lib/types';

const MapView = dynamic(() => import('./MapView'), { ssr: false });

const BRATISLAVA: [number, number] = [48.1486, 17.1077];
type View = 'home' | 'detail' | 'points';
type Filter = 'all' | 'ok' | 'open' | 'cans' | 'big';

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

  /* ---------- štart: anonymná session + poloha ---------- */
  useEffect(() => {
    ensureSession().catch(console.error);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      () => { /* poloha zamietnutá — ostávame na predvolenom strede */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/machines?lat=${pos[0]}&lng=${pos[1]}&radius=8000`);
      const json = await r.json();
      setMachines(json.machines ?? []);
    } finally { setLoading(false); }
  }, [pos]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 60000);              // stav starne rýchlo — obnovujeme každú minútu
    return () => clearInterval(id);
  }, [load]);

  /* ---------- profil ---------- */
  useEffect(() => {
    if (view !== 'points') return;
    supabase.from('reporters').select('points, reports_total, reports_confirmed').single()
      .then(({ data }) => data && setProfile(data));
  }, [view]);

  /* ---------- výber automatu ---------- */
  const open = useCallback(async (id: string) => {
    const m = machines.find((x) => x.id === id);
    if (!m) return;
    setSelected(m); setView('detail'); setFeed([]);
    const { data } = await supabase
      .from('public_reports').select('*')
      .eq('machine_id', id).order('created_at', { ascending: false }).limit(12);
    setFeed((data as Report[]) ?? []);
  }, [machines]);

  const visible = useMemo(() => machines.filter((m) => {
    if (filter === 'ok') return effStatus(m) === 'ok';
    if (filter === 'cans') return m.accepts_cans;
    if (filter === 'big') return m.type === 'big';
    return true;
  }), [machines, filter]);

  const nearestOk = useMemo(
    () => visible.filter((m) => effStatus(m) === 'ok').sort((a, b) => a.distance_m - b.distance_m)[0],
    [visible]
  );
  const unit = { m: t('m'), km: t('km') };

  /* ---------- odoslanie hlásenia ---------- */
  async function send(status: Status, reasons: string[]) {
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(async (p) => {
        await ensureSession();
        const res = await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            machineId: selected!.id, status, reasons,
            lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy,
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
        setTimeout(() => setToast(null), 3200);
        resolve();
      }, () => {
        setToast({ text: t('geoDenied'), bad: true });
        setTimeout(() => setToast(null), 3200);
        resolve();
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  return (
    <div className="app">
      <div className="views">
        {/* ============ HOME ============ */}
        <section className={`view ${view === 'home' ? 'on' : ''}`}>
          <div className="hd">
            <div className="loc"><small>{t('loc')}</small><b>{selected?.city ?? 'Bratislava'}</b></div>
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
            <div className="hero"><div className="lbl">{t('heroLabel')}</div>
              <div className="big" style={{ fontSize: 22 }}>{t('heroNone')}</div></div>
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
          {visible.sort((a, b) => a.distance_m - b.distance_m).map((m) => {
            const s = effStatus(m), f = freshness(m);
            return (
              <button key={m.id} className="mc" onClick={() => open(m.id)}>
                <span className={`av ${s}`}>{glyph(s)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="nm">{m.name}</span>
                  <span className="ad">{m.address}</span>
                  <span className={`stat ${s} f${f}`}>
                    <span className="bars"><i style={{ height: 4 }} /><i style={{ height: 7 }} /><i style={{ height: 11 }} /></span>
                    {t(s)} · {agoText(minutesSince(m.status_at), t)}
                  </span>
                </span>
                <span className="rt"><b>{formatDistance(m.distance_m, unit)}</b></span>
              </button>
            );
          })}
        </section>

        {/* ============ DETAIL ============ */}
        <section className={`view ${view === 'detail' ? 'on' : ''}`}>
          {selected && (() => {
            const s = effStatus(selected);
            const heroKey = s === 'ok' ? 'hOk' : s === 'issue' ? 'hIssue' : s === 'down' ? 'hDown' : 'hUnknown';
            return (
              <>
                <div className="dhd">
                  <button className="rnd" onClick={() => setView('home')} aria-label="back">←</button>
                  <h1>{selected.name}<small>{selected.address}</small></h1>
                </div>
                <div className={`shero ${s}`}>
                  <div className="ring">{glyph(s)}</div>
                  <div className="big">{t(heroKey as 'hOk')}</div>
                  <div className="sub">
                    {s === 'unknown' ? t('noReport')
                      : t('lastReport', { ago: agoText(minutesSince(selected.status_at), t) })}
                  </div>
                </div>
                <div className="tri">
                  <div><b style={{ color: statusColor(s) }}>{agoText(minutesSince(selected.status_at), t)}</b><small>{t('tLast')}</small></div>
                  <div><b>{selected.status_reports}</b><small>{t('tConf')}</small></div>
                  <div><b>{formatDistance(selected.distance_m, unit)}</b><small>{t('tDist')}</small></div>
                </div>
                <Timeline feed={feed} t={t} />
                <div className="rows">
                  <div className="row"><span className="k">{t('kHours')}</span><span className="v">{selected.opening_hours ?? '—'}</span></div>
                  <div className="row"><span className="k">{t('kTakes')}</span><span className="v">
                    {selected.accepts_pet ? 'PET' : ''}{selected.accepts_cans ? ' · ' + t('cans') : ''}</span></div>
                  <div className="row"><span className="k">{t('kType')}</span><span className="v">
                    {selected.type === 'manual' ? t('vManual') : selected.type === 'big' ? t('vBig') : t('vAuto')}</span></div>
                  <div className="row"><span className="k">{t('kRefund')}</span><span className="v">{t('vCoupon')}</span></div>
                </div>
                <div className="st"><h2>{t('feed')}</h2></div>
                <div className="feed">
                  {feed.length === 0 && <div className="fi"><span className="n">—</span></div>}
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
                  <a className="btn gh" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
                     target="_blank" rel="noreferrer noopener">{t('route')}</a>
                  <button className="btn pri" onClick={() => setSheet(true)}>{t('report')}</button>
                </div>
                <div className="src"><span>{t('source')}</span></div>
              </>
            );
          })()}
        </section>

        {/* ============ POINTS ============ */}
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
            <div className="sc acc"><div className="h">{t('pPoints')}</div><div className="n">{profile?.points ?? 0}</div><div className="f">&nbsp;</div></div>
            <div className="sc"><div className="h">{t('pReports')}</div><div className="n">{profile?.reports_total ?? 0}</div><div className="f">&nbsp;</div></div>
            <div className="sc"><div className="h">{t('pAcc')}</div>
              <div className="n">{profile && profile.reports_total > 0
                ? Math.round((profile.reports_confirmed / profile.reports_total) * 100) + '%' : '—'}</div>
              <div className="f">{t('pAccF')}</div></div>
            <div className="sc"><div className="h">{t('pRank')}</div><div className="n">—</div><div className="f">{t('pRankF')}</div></div>
          </div>
        </section>
      </div>

      <nav className="nav">
        <button className={view !== 'points' ? 'on' : ''} onClick={() => setView('home')}>
          <span>◎</span>{t('nav1')}
        </button>
        <button onClick={() => setView('home')}><span>≡</span>{t('nav2')}</button>
        <button className="fab" onClick={() => { if (selected) setSheet(true); }} aria-label={t('report')}>+</button>
        <button className={view === 'points' ? 'on' : ''} onClick={() => setView('points')}>
          <span>★</span>{t('nav3')}
        </button>
        <button onClick={() => setView('points')}><span>☺</span>{t('nav4')}</button>
      </nav>

      <div className={`scrim ${sheet ? 'on' : ''}`} onClick={() => setSheet(false)} />
      {selected && <ReportSheet open={sheet} machine={selected} t={t} lang={lang} onClose={() => setSheet(false)} onSend={send} />}
      {toast && <div className={`toast on ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>}
    </div>
  );
}

/* ---------- 24-hodinová os stavu ---------- */
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

/* ---------- šablóna hlásenia ---------- */
function ReportSheet({ open, machine, t, lang, onClose, onSend }: {
  open: boolean; machine: Machine; t: ReturnType<typeof makeT>; lang: Lang;
  onClose: () => void; onSend: (s: Status, r: string[]) => Promise<void>;
}) {
  const [pick, setPick] = useState<Status | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setPick(null); setReasons([]); setBusy(false); } }, [open]);

  const opts: [Status, string, string][] = [
    ['ok', t('oOk'), t('oOkS')],
    ['issue', t('oIssue'), t('oIssueS')],
    ['down', t('oDown'), t('oDownS')],
  ];

  return (
    <div className={`sheet ${open ? 'on' : ''}`}>
      <div className="grab" />
      <h2>{t('dlgTitle')}</h2>
      <div className="who">{machine.name} · {machine.address}</div>
      <div className="geo wait">{t('geoWait')}</div>

      {opts.map(([k, title, sub]) => (
        <button key={k} className={`opt ${k}`} aria-pressed={pick === k} onClick={() => setPick(k)}>
          <span className="ic">{glyph(k)}</span>
          <span><span className="tt">{title}</span><span className="ss">{sub}</span></span>
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
        <button className="btn pri" disabled={!pick || busy}
          onClick={async () => { setBusy(true); await onSend(pick!, reasons); setBusy(false); }}>
          {busy ? t('sending') : t('send')}
        </button>
      </div>
    </div>
  );
}
