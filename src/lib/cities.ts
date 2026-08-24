export interface City {
  key: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  zoom: number;
}

export const CITIES: City[] = [
  { key: 'bratislava', name: 'Bratislava', region: 'Bratislavský', lat: 48.1486, lng: 17.1077, zoom: 12 },
  { key: 'kosice', name: 'Košice', region: 'Košický', lat: 48.7164, lng: 21.2611, zoom: 12 },
  { key: 'presov', name: 'Prešov', region: 'Prešovský', lat: 48.9985, lng: 21.2339, zoom: 13 },
  { key: 'zilina', name: 'Žilina', region: 'Žilinský', lat: 49.2231, lng: 18.7394, zoom: 13 },
  { key: 'nitra', name: 'Nitra', region: 'Nitriansky', lat: 48.3069, lng: 18.0876, zoom: 13 },
  { key: 'banska-bystrica', name: 'Banská Bystrica', region: 'Banskobystrický', lat: 48.7364, lng: 19.1462, zoom: 13 },
  { key: 'trnava', name: 'Trnava', region: 'Trnavský', lat: 48.3774, lng: 17.5877, zoom: 13 },
  { key: 'trencin', name: 'Trenčín', region: 'Trenčiansky', lat: 48.8945, lng: 18.0444, zoom: 13 },
  { key: 'martin', name: 'Martin', region: 'Žilinský', lat: 49.0655, lng: 18.9219, zoom: 13 },
  { key: 'poprad', name: 'Poprad', region: 'Prešovský', lat: 49.0558, lng: 20.2976, zoom: 13 },
  { key: 'prievidza', name: 'Prievidza', region: 'Trenčiansky', lat: 48.7719, lng: 18.6245, zoom: 13 },
  { key: 'zvolen', name: 'Zvolen', region: 'Banskobystrický', lat: 48.5762, lng: 19.1256, zoom: 13 },
  { key: 'povazska-bystrica', name: 'Považská Bystrica', region: 'Trenčiansky', lat: 49.1214, lng: 18.4232, zoom: 13 },
  { key: 'michalovce', name: 'Michalovce', region: 'Košický', lat: 48.7544, lng: 21.9195, zoom: 13 },
  { key: 'nove-zamky', name: 'Nové Zámky', region: 'Nitriansky', lat: 47.9856, lng: 18.1616, zoom: 13 },
  { key: 'spisska-nova-ves', name: 'Spišská Nová Ves', region: 'Košický', lat: 48.9440, lng: 20.5619, zoom: 13 },
  { key: 'komarno', name: 'Komárno', region: 'Nitriansky', lat: 47.7629, lng: 18.1291, zoom: 13 },
  { key: 'levice', name: 'Levice', region: 'Nitriansky', lat: 48.2167, lng: 18.6069, zoom: 13 },
  { key: 'humenne', name: 'Humenné', region: 'Prešovský', lat: 48.9376, lng: 21.9101, zoom: 13 },
  { key: 'bardejov', name: 'Bardejov', region: 'Prešovský', lat: 49.2925, lng: 21.2757, zoom: 13 },
  { key: 'liptovsky-mikulas', name: 'Liptovský Mikuláš', region: 'Žilinský', lat: 49.0805, lng: 19.6203, zoom: 13 },
  { key: 'ruzomberok', name: 'Ružomberok', region: 'Žilinský', lat: 49.0786, lng: 19.3078, zoom: 13 },
  { key: 'piestany', name: 'Piešťany', region: 'Trnavský', lat: 48.5921, lng: 17.8267, zoom: 13 },
  { key: 'dunajska-streda', name: 'Dunajská Streda', region: 'Trnavský', lat: 47.9925, lng: 17.6122, zoom: 13 },
  { key: 'trebisov', name: 'Trebišov', region: 'Košický', lat: 48.6280, lng: 21.7192, zoom: 13 },
  { key: 'senica', name: 'Senica', region: 'Trnavský', lat: 48.6789, lng: 17.3667, zoom: 13 },
  { key: 'topolcany', name: 'Topoľčany', region: 'Nitriansky', lat: 48.5606, lng: 18.1764, zoom: 13 },
  { key: 'rimavska-sobota', name: 'Rimavská Sobota', region: 'Banskobystrický', lat: 48.3833, lng: 20.0222, zoom: 13 },
];

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function nearestCity(lat: number, lng: number): { city: City; km: number } {
  let best = CITIES[0];
  let bestKm = Infinity;
  for (const c of CITIES) {
    const dLat = rad(c.lat - lat);
    const dLng = rad(c.lng - lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(c.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(h));
    if (km < bestKm) { bestKm = km; best = c; }
  }
  return { city: best, km: bestKm };
}

const STORE_KEY = 'zalohomat.city';

export function savedCity(): City | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = window.localStorage.getItem(STORE_KEY);
    return CITIES.find((c) => c.key === key) ?? null;
  } catch {
    return null;
  }
}

export function saveCity(city: City | null) {
  try {
    if (city) window.localStorage.setItem(STORE_KEY, city.key);
    else window.localStorage.removeItem(STORE_KEY);
  } catch { /* privátny režim */ }
}
