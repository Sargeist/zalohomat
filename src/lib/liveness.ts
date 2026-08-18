import type { Machine, EffStatus } from './types';
import { effStatus, minutesSince } from './status';
import { isOpenNow, typicalRetailOpen } from './hours';

const BASE_UPTIME = 0.93;

export type Liveness =
  | { kind: 'no_machine'; status: 'unknown'; probability: null }
  | { kind: 'confirmed'; status: EffStatus; probability: null }
  | { kind: 'presumed'; status: 'ok' | 'down'; probability: number;
      reason: 'open' | 'closed' | 'permanently_closed' | 'assumed_open' | 'assumed_closed' }
  | { kind: 'unknown'; status: 'unknown'; probability: null };

export function liveness(m: Machine): Liveness {
  if (m.machine_presence === 'no') {
    return { kind: 'no_machine', status: 'unknown', probability: null };
  }

  const confirmed = effStatus(m);

  if (confirmed !== 'unknown') {
    return { kind: 'confirmed', status: confirmed, probability: null };
  }

  if (m.availability === 'closed_permanently') {
    return { kind: 'presumed', status: 'down', probability: 0.98, reason: 'permanently_closed' };
  }

  const open = m.open_now ?? isOpenNow(m.opening_hours);
  if (open === false) {
    return { kind: 'presumed', status: 'down', probability: 0.9, reason: 'closed' };
  }
  if (open === true) {
    const recentFault = m.status === 'down' && minutesSince(m.status_at) < 720;
    return {
      kind: 'presumed',
      status: 'ok',
      probability: recentFault ? 0.55 : (m.availability === 'closed_temporarily' ? 0.4 : BASE_UPTIME),
      reason: 'open',
    };
  }

  const typical = typicalRetailOpen();
  return typical
    ? { kind: 'presumed', status: 'ok', probability: 0.7, reason: 'assumed_open' }
    : { kind: 'presumed', status: 'down', probability: 0.75, reason: 'assumed_closed' };
}

export function heroScore(m: Machine): number {
  const l = liveness(m);
  if (l.status !== 'ok') return Number.POSITIVE_INFINITY;
  const certainty = l.kind === 'confirmed' ? 0.99 : l.probability;
  return m.distance_m / Math.max(certainty, 0.2);
}
export const rankForHero = (a: Machine, b: Machine) => heroScore(a) - heroScore(b);
