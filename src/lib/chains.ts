type Brand = { key: string; label: string; color: string; color2: string };

const BRANDS: Brand[] = [
  { key: 'kaufland', label: 'Kaufland', color: '#E10915', color2: '#8C0009' },
  { key: 'lidl',     label: 'Lidl',     color: '#0050AA', color2: '#00337A' },
  { key: 'tesco',    label: 'Tesco',    color: '#00539F', color2: '#003263' },
  { key: 'billa',    label: 'Billa',    color: '#D31820', color2: '#8E0F14' },
  { key: 'coop',     label: 'COOP Jednota', color: '#E30613', color2: '#96040D' },
  { key: 'terno',    label: 'Terno',    color: '#009640', color2: '#00612A' },
  { key: 'fresh',    label: 'Fresh',    color: '#78BE20', color2: '#4E7C13' },
  { key: 'cba',      label: 'CBA',      color: '#004B93', color2: '#00305E' },
  { key: 'kraj',     label: 'Kraj',     color: '#F39200', color2: '#A15F00' },
  { key: 'metro',    label: 'Metro',    color: '#003C7D', color2: '#00274F' },
];

const FALLBACK: Brand = { key: 'other', label: '', color: '#2E7BFF', color2: '#1B54C6' };

export function brandOf(name?: string | null, chain?: string | null): Brand {
  const hay = `${chain ?? ''} ${name ?? ''}`.toLowerCase();
  return BRANDS.find((b) => hay.includes(b.key) || hay.includes(b.label.toLowerCase())) ?? FALLBACK;
}

export function monogram(name?: string | null) {
  if (!name) return 'Z';
  const words = name.trim().split(/\s+/).filter((w) => /[a-zA-Zá-žÁ-Ž]/.test(w));
  if (words.length === 0) return 'Z';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
