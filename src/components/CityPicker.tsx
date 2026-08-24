'use client';
import { useMemo, useState } from 'react';
import { CITIES, type City } from '@/lib/cities';
import { IconSearch, IconClose, IconMap } from './icons';
import type { makeT } from '@/lib/i18n';

export default function CityPicker({
  open, t, current, onPick, onUseLocation, onClose, canClose,
}: {
  open: boolean;
  t: ReturnType<typeof makeT>;
  current: City | null;
  onPick: (c: City) => void;
  onUseLocation: () => void;
  onClose: () => void;
  canClose: boolean;
}) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return CITIES;
    return CITIES.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.region.toLowerCase().includes(needle)
    );
  }, [q]);

  return (
    <>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={() => canClose && onClose()} />
      <div className={`sheet citysheet ${open ? 'on' : ''}`} role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="cityhead">
          <h2>{t('pickCity')}</h2>
          {canClose && (
            <button className="rnd" onClick={onClose} aria-label={t('cancel')}>
              <IconClose size={18} />
            </button>
          )}
        </div>

        <button className="btn gh uselocation" onClick={onUseLocation}>
          <IconMap size={18} />{t('useLocation')}
        </button>

        <div className="searchbar citysearch">
          <IconSearch size={19} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchCity')}
            aria-label={t('searchCity')}
          />
          {q && (
            <button onClick={() => setQ('')} aria-label={t('cancel')}>
              <IconClose size={17} />
            </button>
          )}
        </div>

        <div className="citylist">
          {list.map((c) => (
            <button
              key={c.key}
              className="cityitem"
              aria-pressed={current?.key === c.key}
              onClick={() => onPick(c)}
            >
              <span className="nm">{c.name}</span>
              <span className="rg">{c.region}</span>
            </button>
          ))}
          {list.length === 0 && <div className="empty">{t('noCity')}</div>}
        </div>
      </div>
    </>
  );
}
