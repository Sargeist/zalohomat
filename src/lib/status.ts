import type { Machine, EffStatus } from './types';

export const minutesSince = (iso: string | null) =>
  iso === null ? Infinity : (Date.now() - new Date(iso).getTime()) / 60000;

/** Po 24 h bez hlásenia je stav neznámy — starý údaj klame viac, než pomáha. */
export function effStatus(m: Machine): EffStatus {
  if (!m.status) return 'unknown';
  return minutesSince(m.status_at) > 1440 ? 'unknown' : m.status;
}

/** 3 = čerstvé (<1 h), 2 = <6 h, 1 = <24 h, 0 = staré */
export function freshness(m: Machine): 0 | 1 | 2 | 3 {
  const min = minutesSince(m.status_at);
  return min < 60 ? 3 : min < 360 ? 2 : min < 1440 ? 1 : 0;
}

export const glyph = (s: EffStatus) =>
  s === 'ok' ? '✓' : s === 'down' ? '✕' : s === 'issue' ? '!' : '?';

export const statusColor = (s: EffStatus) =>
  s === 'ok' ? 'var(--ok)' : s === 'issue' ? 'var(--warn)'
  : s === 'down' ? 'var(--down)' : 'var(--mut2)';

export function formatDistance(m: number, unit: { m: string; km: string }) {
  return m < 1000 ? `${Math.round(m / 10) * 10} ${unit.m}` : `${(m / 1000).toFixed(1)} ${unit.km}`;
}
