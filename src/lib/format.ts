import type { Machine } from './types';

const GENERIC = /^(odberné miesto|odberne miesto|zálohomat|zalohomat|recycling)$/i;

export const hasRealName = (name?: string | null) => Boolean(name && !GENERIC.test(name.trim()));

export function street(m: Machine): string | null {
  return m.address?.trim() || null;
}

export function fullTitle(m: Machine): string {
  const st = street(m);
  return st ? `${m.name}, ${st}` : m.name;
}

export const googleMapsUrl = (m: Machine) =>
  `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`;

export const googleDirectionsUrl = (m: Machine) =>
  `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
