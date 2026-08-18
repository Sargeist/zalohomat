import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';

try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {  }

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n=== 1. Prostredie ===');
console.log('  SUPABASE_URL          :', URL_ || 'CHÝBA');
console.log('  SERVICE_ROLE_KEY      :', KEY ? 'nastavený' : 'CHÝBA');
if (!URL_ || !KEY) { console.log('\nBez týchto premenných sa ďalej nedostaneme.'); process.exit(1); }

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

console.log('\n=== 2. Databáza ===');
const { count: total, error: e1 } = await sb.from('machines').select('*', { count: 'exact', head: true });
if (e1) { console.log('  CHYBA:', e1.message); process.exit(1); }
console.log('  Bodov celkom          :', total);

const { data: rows, error: eCols } = await sb
  .from('machines').select('deposit_source, quality, chain, address, machine_presence').limit(5000);
if (eCols) {
  console.log('  !! Stĺpce chýbajú:', eCols.message);
  console.log('  !! => Migrácie 0004_real_stores.sql a 0005_presence.sql NIE SÚ spustené.');
  console.log('  !! Bez nich import nemá kam zapisovať. Spusti ich v SQL Editore.');
}
const by = (f) => {
  const o = {};
  (rows ?? []).forEach((r) => { const k = r[f] ?? '(null)'; o[k] = (o[k] ?? 0) + 1; });
  return o;
};
console.log('  Podľa deposit_source  :', by('deposit_source'));
console.log('  Podľa quality         :', by('quality'));
console.log('  Podľa siete           :', by('chain'));
console.log('  S adresou             :', (rows ?? []).filter((r) => r.address).length, '/', rows?.length ?? 0);

const { data: near } = await sb.rpc('machines_near', { p_lat: 48.1486, p_lng: 17.1077, p_radius_m: 8000 });
console.log('  V okruhu 8 km od centra BA:', near?.length ?? 0);

console.log('\n=== 3. Overpass: čo je v OSM pre Bratislavu ===');
const Q = `[out:json][timeout:90];
(
  nwr["shop"="supermarket"](48.05,16.95,48.28,17.25);
  nwr["shop"="department_store"](48.05,16.95,48.28,17.25);
  nwr["shop"="convenience"](48.05,16.95,48.28,17.25);
);
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
let els = null;
for (const url of ENDPOINTS) {
  try {
    process.stdout.write(`  ${new URL(url).host} … `);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'zalohomat/0.1 (diagnostics)' },
      body: 'data=' + encodeURIComponent(Q),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) { console.log(`HTTP ${res.status}`); continue; }
    els = (await res.json()).elements ?? [];
    console.log(`OK, ${els.length} prvkov`);
    break;
  } catch (e) { console.log(e.name === 'TimeoutError' ? 'timeout' : e.message); }
}

if (els) {
  writeFileSync('osm-cache-bratislava.json', JSON.stringify(els));
  console.log('  Uložené do osm-cache-bratislava.json (import ich použije bez opätovného sťahovania)');
  const named = els.filter((e) => e.tags?.name || e.tags?.brand);
  const withAddr = els.filter((e) => e.tags?.['addr:street']);
  const brands = {};
  named.forEach((e) => {
    const b = (e.tags.brand || e.tags.name || '').split(' ')[0];
    brands[b] = (brands[b] ?? 0) + 1;
  });
  const top = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('  S názvom              :', named.length);
  console.log('  S ulicou              :', withAddr.length);
  console.log('  Najčastejšie značky   :', Object.fromEntries(top));
}

console.log('\n=== ZÁVER ===');
if (!els) {
  console.log('  Overpass neodpovedal. Problém je v sieti/serveri, nie v dátach.');
} else if (els.length > 150 && (near?.length ?? 0) < 100) {
  console.log(`  OSM pozná ${els.length} predajní v Bratislave, ale v databáze ich je ${near?.length ?? 0}.`);
  console.log('  => Dáta existujú, láme sa import. Spusti:  npm run import:city -- bratislava');
} else if (els.length <= 150) {
  console.log(`  OSM pozná len ${els.length} predajní v Bratislave — pokrytie je naozaj slabé.`);
  console.log('  => Treba iný zdroj (oficiálne store locatory sietí).');
} else {
  console.log('  Databáza zodpovedá tomu, čo je v OSM. Problém je inde.');
}
console.log('');
