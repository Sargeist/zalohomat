import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {  }

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_) || !KEY) {
  console.error('Skontroluj .env.local'); process.exit(1);
}

const CITIES = {
  bratislava: [48.05, 16.95, 48.28, 17.25],
  kosice:     [48.60, 21.15, 48.80, 21.40],
  zilina:     [49.16, 18.66, 49.28, 18.85],
  nitra:      [48.25, 18.00, 48.37, 18.18],
  presov:     [48.95, 21.15, 49.05, 21.31],
  banskabystrica: [48.68, 19.05, 48.80, 19.22],
  trnava:     [48.33, 17.53, 48.42, 17.65],
  trencin:    [48.85, 17.99, 48.94, 18.10],
};

const city = (process.argv[2] || 'bratislava').toLowerCase().replace(/[^a-z]/g, '');
const box = CITIES[city];
if (!box) {
  console.error(`Neznáme mesto. Dostupné: ${Object.keys(CITIES).join(', ')}`);
  process.exit(1);
}

const CHAINS = [
  { key: 'Kaufland',     re: /kaufland/i,        machine: 'yes',    type: 'big' },
  { key: 'Lidl',         re: /lidl/i,            machine: 'yes',    type: 'auto' },
  { key: 'Tesco',        re: /tesco/i,           machine: 'yes',    type: 'big' },
  { key: 'Billa',        re: /billa/i,           machine: 'yes',    type: 'auto' },
  { key: 'COOP Jednota', re: /coop|jednota/i,    machine: 'yes',    type: 'auto' },
  { key: 'Terno',        re: /\bterno\b/i,       machine: 'yes',    type: 'auto' },
  { key: 'Kraj',         re: /\bkraj\b/i,        machine: 'yes',    type: 'auto' },
  { key: 'Fresh',        re: /\bfresh\b/i,       machine: 'yes',    type: 'auto' },
  { key: 'Metro',        re: /\bmetro\b/i,       machine: 'yes',    type: 'big' },
  { key: 'CBA',          re: /\bcba\b/i,         machine: 'manual', type: 'manual' },
  { key: 'Milk-Agro',    re: /milk[\s-]?agro/i,  machine: 'manual', type: 'manual' },
  { key: 'Žabka',        re: /\bžabka|zabka\b/i, machine: 'no',     type: 'manual' },
  { key: 'Slovnaft',     re: /slovnaft/i,        machine: 'no',     type: 'manual' },
  { key: 'OMV',          re: /\bomv\b/i,         machine: 'no',     type: 'manual' },
  { key: 'Shell',        re: /\bshell\b/i,       machine: 'no',     type: 'manual' },

  { key: 'Môj obchod',   re: /môj obchod|moj obchod/i, machine: 'manual', type: 'manual' },
  { key: 'DELIA',        re: /\bdelia\b/i,      machine: 'manual', type: 'manual' },
  { key: 'Viva',         re: /\bviva\b/i,       machine: 'manual', type: 'manual' },
  { key: 'Malina',       re: /\bmalina\b/i,     machine: 'no',     type: 'manual' },
];

const [s, w, n, e] = box;

const Q = `[out:json][timeout:90];
nwr["shop"~"^(supermarket|department_store|convenience|grocery|wholesale)$"](${s},${w},${n},${e});
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CACHE = `osm-cache-${city}.json`;

let els = null;

if (existsSync(CACHE) && !process.argv.includes('--fresh')) {
  els = JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log(`Použitá keš ${CACHE}: ${els.length} prvkov  (--fresh vynúti nové stiahnutie)`);
}

if (!els) {
  console.log(`Sťahujem: ${city}`);
  outer:
  for (let round = 0; round < 3; round++) {
    for (const url of ENDPOINTS) {
      try {
        process.stdout.write(`  ${new URL(url).host} … `);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'zalohomat/0.1 (https://github.com/Sargeist/zalohomat)',
            Accept: 'application/json',
          },
          body: 'data=' + encodeURIComponent(Q),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) { console.log(`HTTP ${res.status}`); await sleep(2000); continue; }
        els = (await res.json()).elements ?? [];
        console.log(`OK, ${els.length} prvkov`);
        writeFileSync(CACHE, JSON.stringify(els));
        break outer;
      } catch (err) { console.log(err.name === 'TimeoutError' ? 'timeout' : err.message); }
    }
    if (round < 2) {
      const wait = (round + 1) * 20;
      console.log(`  Všetky zrkadlá zaneprázdnené, čakám ${wait} s…`);
      await sleep(wait * 1000);
    }
  }
}

if (!els) {
  console.error('\nOverpass nedostupný na všetkých zrkadlách.');
  console.error('Náhradná cesta: overpass-turbo.eu → Export → GeoJSON → npm run import:file -- export.geojson');
  process.exit(1);
}

const rows = [];
let noName = 0;
for (const el of els) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const tg = el.tags ?? {};
  if (lat == null || lng == null) continue;

  const rawName = (tg.name || tg.brand || tg.operator || '').trim();
  if (!rawName) { noName++; continue; }

  const chain = CHAINS.find((c) => c.re.test(`${tg.brand ?? ''} ${tg.operator ?? ''} ${rawName}`));
  const explicitRvm = tg.vending === 'bottle_return' || tg.recycling_type === 'reverse_vending_machine';

  const presence = explicitRvm ? 'yes' : chain ? chain.machine
    : (tg.shop === 'supermarket' || tg.shop === 'department_store') ? 'yes' : 'no';

  const street = tg['addr:street'] || null;
  const hn = tg['addr:housenumber'] ? ` ${tg['addr:housenumber']}` : '';

  rows.push({
    external_id: `osm:${el.type}/${el.id}`,
    name: chain?.key ?? rawName,
    chain: chain?.key ?? null,
    address: street ? `${street}${hn}` : '',
    city: tg['addr:city'] || tg['addr:place'] || '',
    lat, lng,
    opening_hours: tg.opening_hours || '',
    type: chain?.type ?? (presence === 'yes' ? 'auto' : 'manual'),
    deposit_source: explicitRvm ? 'osm_tag' : 'law_300m2',
    machine_presence: presence,
  });
}

const stat = (f) => {
  const o = {}; rows.forEach((r) => { const k = r[f] ?? '—'; o[k] = (o[k] ?? 0) + 1; }); return o;
};
console.log(`\nNa import: ${rows.length}   (bez názvu vynechané: ${noName})`);
console.log('  So zálohomatom  :', rows.filter((r) => r.machine_presence === 'yes').length);
console.log('  Ručný odber     :', rows.filter((r) => r.machine_presence === 'manual').length);
console.log('  Bez zálohomatu  :', rows.filter((r) => r.machine_presence === 'no').length);
console.log('  S ulicou z OSM  :', rows.filter((r) => r.address).length);
console.log('  Podľa siete     :', stat('chain'));

if (!rows.length) { console.log('Nič na import.'); process.exit(0); }

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await sb.rpc('upsert_shops', { payload: rows.slice(i, i + 100) });
  if (error) {
    console.error('\nSupabase:', error.message);
    if (error.message.includes('upsert_shops') || error.message.includes('machine_presence')) {
      console.error('=> Spusti migráciu 0005_presence.sql v SQL Editore.');
    }
    process.exit(1);
  }
  console.log(`  uložené ${Math.min(i + 100, rows.length)} / ${rows.length}`);
}
const { data: visible } = await sb.rpc('recompute_quality');
console.log(`\nHotovo. Zobraziteľných bodov v databáze: ${visible}`);
console.log('Ďalej:  npm run geocode   (doplní ulice tam, kde v OSM nie sú)');
