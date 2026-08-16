/**
 * Import odberných miest z OpenStreetMap cez Overpass API.
 * Spustenie:  node scripts/import-osm.mjs
 * Potrebuje:  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY v .env.local
 *
 * Licencia: dáta OSM sú pod ODbL — v aplikácii musí byť uvedená atribúcia.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// jednoduché načítanie .env.local bez extra závislostí
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch { /* .env.local nemusí existovať v CI */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const QUERY = `
[out:json][timeout:300];
area["ISO3166-1"="SK"][admin_level=2]->.sk;
(
  node["amenity"="vending_machine"]["vending"="bottle_return"](area.sk);
  way["amenity"="vending_machine"]["vending"="bottle_return"](area.sk);
  node["amenity"="recycling"]["recycling_type"="reverse_vending_machine"](area.sk);
  way["amenity"="recycling"]["recycling_type"="reverse_vending_machine"](area.sk);
);
out center tags;`;

const yes = (v) => v === undefined ? true : v === 'yes';

// Zrkadla Overpass — hlavny instancia byva pretazena alebo odmietne poziadavku.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

// Overpass vyzaduje identifikovatelny User-Agent, inak vrati 406/429.
const UA = 'zalohomat/0.1 (https://github.com/Sargeist/zalohomat)';

async function fetchOverpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log(`  skusam ${new URL(url).host} …`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(QUERY),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        lastErr = new Error(`${res.status} ${res.statusText} — ${body}`);
        console.log(`  ✗ ${lastErr.message}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.log(`  ✗ ${e.message}`);
    }
  }
  throw new Error('Vsetky zrkadla Overpass zlyhali. Posledna chyba: ' + lastErr?.message);
}

async function main() {
  console.log('Stahujem z Overpass…');
  const { elements } = await fetchOverpass();

  console.log(`Nájdených prvkov: ${elements.length}`);

  const rows = elements.map((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) return null;
    const tg = e.tags ?? {};
    return {
      external_id: `osm:${e.type}/${e.id}`,
      source: 'osm',
      name: tg.name || tg.operator || tg.brand || 'Odberné miesto',
      chain: tg.brand || tg.operator || null,
      address: [tg['addr:street'], tg['addr:housenumber']].filter(Boolean).join(' ') || null,
      city: tg['addr:city'] || null,
      lat, lng: lon,
      opening_hours: tg.opening_hours || null,
      accepts_pet: yes(tg['recycling:plastic_bottles']),
      accepts_cans: yes(tg['recycling:cans']),
      type: tg.vending === 'bottle_return' || tg.recycling_type ? 'auto' : 'manual',
    };
  }).filter(Boolean);

  console.log(`Na import: ${rows.length}`);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // upsert po dávkach cez SQL funkciu (geography sa nedá poslať priamo cez REST)
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await sb.rpc('upsert_machines', { payload: chunk });
    if (error) { console.error(error.message); process.exit(1); }
    console.log(`  ${Math.min(i + 100, rows.length)} / ${rows.length}`);
  }
  console.log('Hotovo.');
}
main().catch((e) => { console.error(e); process.exit(1); });
