import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

try {
  readFileSync('.env.local', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {  }

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) || !SERVICE_KEY) {
  console.error('Skontroluj NEXT_PUBLIC_SUPABASE_URL a SUPABASE_SERVICE_ROLE_KEY v .env.local');
  process.exit(1);
}

const CHAINS = [
  { key: 'Kaufland',     re: /kaufland/i,              machine: 'yes',    type: 'big' },
  { key: 'Lidl',         re: /lidl/i,                  machine: 'yes',    type: 'auto' },
  { key: 'Tesco',        re: /tesco/i,                 machine: 'yes',    type: 'big' },
  { key: 'Billa',        re: /billa/i,                 machine: 'yes',    type: 'auto' },
  { key: 'COOP Jednota', re: /coop|jednota/i,          machine: 'yes',    type: 'auto' },
  { key: 'Terno',        re: /\bterno\b/i,             machine: 'yes',    type: 'auto' },
  { key: 'Kraj',         re: /\bkraj\b/i,              machine: 'yes',    type: 'auto' },
  { key: 'Fresh',        re: /\bfresh\b/i,             machine: 'yes',    type: 'auto' },
  { key: 'Metro',        re: /\bmetro\b/i,             machine: 'yes',    type: 'big' },
  { key: 'CBA',          re: /\bcba\b/i,               machine: 'manual', type: 'manual' },
  { key: 'Milk-Agro',    re: /milk[\s-]?agro/i,        machine: 'manual', type: 'manual' },
  { key: 'Môj obchod',   re: /môj obchod|moj obchod/i, machine: 'manual', type: 'manual' },
  { key: 'DELIA',        re: /\bdelia\b/i,             machine: 'manual', type: 'manual' },
  { key: 'Viva',         re: /\bviva\b/i,              machine: 'manual', type: 'manual' },
  { key: 'Malina',       re: /\bmalina\b/i,            machine: 'no',     type: 'manual' },
  { key: 'Žabka',        re: /žabka|zabka/i,           machine: 'no',     type: 'manual' },
  { key: 'Slovnaft',     re: /slovnaft/i,              machine: 'no',     type: 'manual' },
  { key: 'OMV',          re: /\bomv\b/i,               machine: 'no',     type: 'manual' },
  { key: 'Shell',        re: /\bshell\b/i,             machine: 'no',     type: 'manual' },
];

function tiles() {
  const out = [];
  for (let lat = 47.7; lat < 49.65; lat += 0.5) {
    for (let lng = 16.8; lng < 22.6; lng += 0.65) {
      out.push([
        +lat.toFixed(2), +lng.toFixed(2),
        +Math.min(lat + 0.5, 49.65).toFixed(2),
        +Math.min(lng + 0.65, 22.6).toFixed(2),
      ]);
    }
  }
  return out;
}

const q = ([s, w, n, e]) => `
[out:json][timeout:90];
nwr["shop"~"^(supermarket|department_store|convenience|grocery|wholesale)$"](${s},${w},${n},${e});
out center tags;`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const UA = 'zalohomat/0.1 (https://github.com/Sargeist/zalohomat)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(box, label) {
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    const host = new URL(url).host;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' },
        body: 'data=' + encodeURIComponent(q(box)),
        signal: AbortSignal.timeout(150000),
      });
      if (res.ok) return (await res.json()).elements ?? [];
      console.log(`    ${label} ${host}: HTTP ${res.status}, skusam dalej…`);
    } catch (e) {
      console.log(`    ${label} ${host}: ${e.name === 'TimeoutError' ? 'timeout' : e.message}`);
    }
    await sleep(3000);
  }
  console.log(`    ${label}: PRESKOCENE po vsetkych pokusoch`);
  return null;
}

const CACHE = 'shops-cache.json';
let elements = [];

if (process.argv.includes('--cache') && existsSync(CACHE)) {
  elements = JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log(`Nacitane z ${CACHE}: ${elements.length} prvkov`);
} else {
  const boxes = tiles();
  console.log(`Stahujem po dlazdiciach: ${boxes.length} ks (potrva 5–15 minut)`);
  const seen = new Set();
  let failed = 0;

  for (let i = 0; i < boxes.length; i++) {
    const label = `[${i + 1}/${boxes.length}]`;
    const got = await fetchTile(boxes[i], label);
    if (got === null) { failed++; continue; }
    let added = 0;
    for (const el of got) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key); elements.push(el); added++;
    }
    console.log(`  ${label} +${added} (spolu ${elements.length})`);
    writeFileSync(CACHE, JSON.stringify(elements));
    await sleep(1200);
  }
  if (failed) console.log(`\nPozor: ${failed} dlazdic sa nepodarilo stiahnut. Spusti skript znova.`);
}

const rows = [];
let noName = 0;

for (const e of elements) {
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  const tg = e.tags ?? {};
  if (lat == null || lng == null) continue;

  const name = (tg.name || tg.brand || tg.operator || '').trim();
  const explicitRvm = tg.vending === 'bottle_return' || tg.recycling_type === 'reverse_vending_machine';
  if (!name) { noName++; continue; }

  const chain = CHAINS.find((c) => c.re.test(`${tg.brand ?? ''} ${tg.operator ?? ''} ${name}`));
  const presence = explicitRvm ? 'yes' : chain ? chain.machine
    : (tg.shop === 'supermarket' || tg.shop === 'department_store') ? 'yes' : 'no';

  const street = tg['addr:street'] || null;
  const hn = tg['addr:housenumber'] ? ` ${tg['addr:housenumber']}` : '';

  rows.push({
    external_id: `osm:${e.type}/${e.id}`,
    name: chain ? chain.key : name,
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

console.log(`\nNa import: ${rows.length}`);
console.log(`  vynechane bez nazvu: ${noName}`);
console.log(`  so zalohomatom:      ${rows.filter((r) => r.machine_presence === 'yes').length}`);
console.log(`  rucny odber:         ${rows.filter((r) => r.machine_presence === 'manual').length}`);
console.log(`  bez zalohomatu:      ${rows.filter((r) => r.machine_presence === 'no').length}`);
const byChain = {};
rows.forEach((r) => { byChain[r.chain ?? 'iné'] = (byChain[r.chain ?? 'iné'] ?? 0) + 1; });
console.log('Podla siete:', byChain);
console.log(`S ulicou z OSM: ${rows.filter((r) => r.address).length} / ${rows.length}`);

if (!rows.length) { console.log('Nic na import — skus spustit znova.'); process.exit(0); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await sb.rpc('upsert_shops', { payload: rows.slice(i, i + 100) });
  if (error) {
    console.error('\nSupabase:', error.message);
    if (error.message.includes('upsert_shops')) console.error('Spusti migraciu 0004_real_stores.sql.');
    process.exit(1);
  }
  console.log(`  ulozene ${Math.min(i + 100, rows.length)} / ${rows.length}`);
}

const { data: visible } = await sb.rpc('recompute_quality');
console.log(`\nHotovo. Zobrazitelnych odbernych miest: ${visible}`);
