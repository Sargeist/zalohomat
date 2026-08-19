type Brand = { key: string; label: string; color: string; color2: string; fg: string };

const BRANDS: Brand[] = [
  { key: 'kaufland', label: 'Kaufland',     color: '#E30613', color2: '#9E0410', fg: '#fff' },
  { key: 'lidl',     label: 'Lidl',         color: '#0050AA', color2: '#003576', fg: '#fff' },
  { key: 'billa',    label: 'Billa',        color: '#FFD400', color2: '#E0A400', fg: '#2B1D00' },
  { key: 'tesco',    label: 'Tesco',        color: '#00539F', color2: '#00376C', fg: '#fff' },
  { key: 'terno',    label: 'Terno',        color: '#00963F', color2: '#00622A', fg: '#fff' },
  { key: 'coop',     label: 'COOP Jednota', color: '#D81B25', color2: '#8E1017', fg: '#fff' },
  { key: 'kraj',     label: 'Kraj',         color: '#F39200', color2: '#B06600', fg: '#241300' },
  { key: 'fresh',    label: 'Fresh',        color: '#78BE20', color2: '#4E7C13', fg: '#0F1A02' },
  { key: 'cba',      label: 'CBA',          color: '#0F5FA6', color2: '#083C6C', fg: '#fff' },
  { key: 'metro',    label: 'Metro',        color: '#003C7D', color2: '#00274F', fg: '#fff' },
  { key: 'moj',      label: 'Môj obchod',   color: '#8E44AD', color2: '#5E2C74', fg: '#fff' },
  { key: 'delia',    label: 'DELIA',        color: '#C2185B', color2: '#82103C', fg: '#fff' },
  { key: 'viva',     label: 'Viva',         color: '#00897B', color2: '#005B51', fg: '#fff' },
  { key: 'malina',   label: 'Malina',       color: '#D2436A', color2: '#8E2A46', fg: '#fff' },
  { key: 'milkagro', label: 'Milk-Agro',    color: '#2E86C1', color2: '#1B5A84', fg: '#fff' },
];

const FALLBACK: Brand = { key: 'other', label: '', color: '#3D4752', color2: '#252C33', fg: '#fff' };

export const CHAIN_FILTERS = ['Lidl', 'Billa', 'Kaufland', 'Tesco', 'Terno', 'COOP Jednota'] as const;

export function brandOf(name?: string | null, chain?: string | null): Brand {
  const hay = `${chain ?? ''} ${name ?? ''}`.toLowerCase();
  if (/coop|jednota/.test(hay)) return BRANDS.find((b) => b.key === 'coop')!;
  if (/môj obchod|moj obchod/.test(hay)) return BRANDS.find((b) => b.key === 'moj')!;
  if (/milk[\s-]?agro/.test(hay)) return BRANDS.find((b) => b.key === 'milkagro')!;
  return BRANDS.find((b) => hay.includes(b.key) || hay.includes(b.label.toLowerCase())) ?? FALLBACK;
}

export function monogram(name?: string | null) {
  if (!name) return 'Z';
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Zá-žÁ-Ž]/.test(w));
  if (words.length === 0) return 'Z';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
