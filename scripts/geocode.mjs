import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {  }

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Chyba .env.local'); process.exit(1); }

const UA = 'zalohomat/0.1 (https://github.com/Sargeist/zalohomat)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: machines, error } = await sb
  .from('machines')
  .select('id, name, address, city, geom')
  .is('address', null)
  .eq('active', true)
  .limit(2000);

if (error) { console.error(error.message); process.exit(1); }

const { data: coords } = await sb.rpc('machines_near', { p_lat: 48.7, p_lng: 19.5, p_radius_m: 400000 });
const byId = new Map((coords ?? []).map((c) => [c.id, c]));

const todo = (machines ?? []).filter((m) => byId.has(m.id));
console.log(`Bez adresy: ${todo.length}`);

const out = [];
for (let i = 0; i < todo.length; i++) {
  const c = byId.get(todo[i].id);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c.lat}&lon=${c.lng}&zoom=18&addressdetails=1&accept-language=sk`,
      { headers: { 'User-Agent': UA } }
    );
    if (res.ok) {
      const j = await res.json();
      const a = j.address ?? {};
      const streetName = a.road || a.pedestrian || a.footway || a.neighbourhood || null;
      const houseNr = a.house_number ? ` ${a.house_number}` : '';
      out.push({
        id: c.id,
        address: streetName ? `${streetName}${houseNr}` : '',
        city: a.city || a.town || a.village || a.municipality || '',

        name: j.name && j.name.length < 60 ? j.name : '',
      });
      console.log(`  ${i + 1}/${todo.length}  ${out.at(-1).address || '—'}, ${out.at(-1).city || '—'}`);
    }
  } catch (e) { console.log(`  ${i + 1}/${todo.length}  chyba: ${e.message}`); }

  await sleep(1100);

  if (out.length >= 50 || i === todo.length - 1) {
    if (out.length) {
      const { error: e2 } = await sb.rpc('apply_addresses', { payload: out.splice(0) });
      if (e2) console.error('apply_addresses:', e2.message);
      else console.log('  … uložené');
    }
  }
}
console.log('Hotovo.');
