const DAYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

function slovakNow(): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bratislava',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const day = DAYS.indexOf(String(parts.weekday).slice(0, 2).toLowerCase());
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

export function isOpenNow(spec?: string | null): boolean | null {
  if (!spec) return null;
  const s = spec.trim().toLowerCase();
  if (s === '24/7' || s === 'mo-su 00:00-24:00') return true;
  if (s === 'off' || s === 'closed') return false;

  const { day, minutes } = slovakNow();
  if (day < 0) return null;

  let understood = false;
  let open = false;

  for (const rule of s.split(';')) {
    const r = rule.trim();
    if (!r) continue;

    const m = r.match(/^([a-z,\-\s]+?)\s+(.+)$/);
    if (!m) continue;
    const [, dayPart, timePart] = m;

    if (!matchesDay(dayPart, day)) continue;
    understood = true;

    if (timePart.includes('off') || timePart.includes('closed')) return false;

    for (const span of timePart.split(',')) {
      const t = span.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!t) continue;
      const from = toMin(t[1]);
      let to = toMin(t[2]);
      if (to === 0) to = 24 * 60;
      if (to < from) {
        if (minutes >= from || minutes < to) open = true;
      } else if (minutes >= from && minutes < to) {
        open = true;
      }
    }
  }

  if (!understood) return null;
  return open;
}

function matchesDay(part: string, today: number): boolean {
  for (const chunk of part.split(',')) {
    const c = chunk.trim();
    if (!c) continue;
    const range = c.match(/^([a-z]{2})\s*-\s*([a-z]{2})$/);
    if (range) {
      const a = DAYS.indexOf(range[1]), b = DAYS.indexOf(range[2]);
      if (a < 0 || b < 0) continue;
      if (a <= b) { if (today >= a && today <= b) return true; }
      else if (today >= a || today <= b) return true;
    } else if (DAYS.indexOf(c) === today) return true;
  }
  return false;
}

export function hoursToday(spec?: string | null): string | null {
  if (!spec) return null;
  if (spec.trim() === '24/7') return '24/7';
  const { day } = slovakNow();
  for (const rule of spec.toLowerCase().split(';')) {
    const m = rule.trim().match(/^([a-z,\-\s]+?)\s+(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}.*)$/);
    if (m && matchesDay(m[1], day)) return m[2].replace(/\s/g, '');
  }
  return null;
}

export function typicalRetailOpen(): boolean {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bratislava', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const wd = String(parts.weekday).slice(0, 2).toLowerCase();
  const min = Number(parts.hour) * 60 + Number(parts.minute);
  if (wd === 'su') return min >= 8 * 60 && min < 20 * 60;
  return min >= 7 * 60 && min < 21 * 60;
}
