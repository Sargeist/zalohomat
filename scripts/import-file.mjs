/**
 * Zaloha, ked Overpass API odmieta poziadavky:
 * stiahni data rucne cez overpass-turbo.eu (Export -> GeoJSON) a spusti:
 *
 *   node scripts/import-file.mjs export.geojson
 *
 * Zvlada aj surovy JSON z Overpass ({ elements: [...] }).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch { /* ignore */ }

// odrezeme koncove lomitko — inak vznikne '//rest/v1/...' a gateway vrati chybu
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const file = process.argv[2];

if (!file) { console.error('Pouzitie: node scripts/import-file.mjs export.geojson'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Chyba .env.local'); process.exit(1); }

// Kontrola formatu URL — casta chyba je vlozit adresu dashboardu namiesto API.
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(SUPABASE_URL)) {
  console.error('\nNEXT_PUBLIC_SUPABASE_URL vyzera nespravne:');
  console.error('  ' + SUPABASE_URL);
  console.error('\nOcakavany tvar:  https://xxxxxxxxxxxx.supabase.co');
  console.error('Najdes ho v Supabase -> Project Settings -> Data API -> Project URL');
  console.error('(NIE adresa z prehliadaca so /dashboard/project/... )\n');
  process.exit(1);
}

const yes = (v) => v === undefined ? true : v === 'yes';
const raw = JSON.parse(readFileSync(file, 'utf8'));

// GeoJSON z overpass-turbo alebo surovy Overpass JSON
const items = raw.features
  ? raw.features.map((f) => ({
      id: (f.id ?? '').toString().replace('/', '/'),
      tags: f.properties ?? {},
      lat: f.geometry?.type === 'Point' ? f.geometry.coordinates[1] : f.properties?.['@lat'],
      lon: f.geometry?.type === 'Point' ? f.geometry.coordinates[0] : f.properties?.['@lon'],
    }))
  : (raw.elements ?? []).map((e) => ({
      id: `${e.type}/${e.id}`,
      tags: e.tags ?? {},
      lat: e.lat ?? e.center?.lat,
      lon: e.lon ?? e.center?.lon,
    }));

const rows = items.filter((i) => i.lat != null && i.lon != null).map((i) => {
  const tg = i.tags;
  return {
    external_id: `osm:${i.id || tg['@id'] || Math.random().toString(36).slice(2)}`,
    source: 'osm',
    name: tg.name || tg.operator || tg.brand || 'Odberné miesto',
    chain: tg.brand || tg.operator || null,
    address: [tg['addr:street'], tg['addr:housenumber']].filter(Boolean).join(' ') || null,
    city: tg['addr:city'] || null,
    lat: Number(i.lat), lng: Number(i.lon),
    opening_hours: tg.opening_hours || null,
    accepts_pet: yes(tg['recycling:plastic_bottles']),
    accepts_cans: yes(tg['recycling:cans']),
    type: 'auto',
  };
});

console.log(`Na import: ${rows.length}`);
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

for (let i = 0; i < rows.length; i += 100) {
  const { error } = await sb.rpc('upsert_machines', { payload: rows.slice(i, i + 100) });
  if (error) {
      console.error('\nSupabase odmietol zapis:', error.message);
      if (error.message.includes('upsert_machines')) {
        console.error('Funkcia upsert_machines neexistuje — spusti migraciu 0001_init.sql v SQL Editore.');
      }
      process.exit(1);
    }
  console.log(`  ${Math.min(i + 100, rows.length)} / ${rows.length}`);
}
console.log('Hotovo.');
