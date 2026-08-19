'use client';
import { useState } from 'react';
import { brandOf, monogram } from '@/lib/chains';
import { useLogo } from '@/lib/logos';
import { mapThumb } from '@/lib/tiles';

export function MachinePhoto({
  photo, name, chain, lat, lng, className, rounded = 20, zoom = 17,
}: {
  photo?: string | null;
  name?: string | null;
  chain?: string | null;
  lat?: number;
  lng?: number;
  className?: string;
  rounded?: number;
  zoom?: number;
}) {
  const [broken, setBroken] = useState(false);
  const b = brandOf(name, chain);

  if (photo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        className={className}
        onError={() => setBroken(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: rounded, display: 'block' }}
      />
    );
  }

  if (lat !== undefined && lng !== undefined) {
    const th = mapThumb(lat, lng, zoom);
    return (
      <div className={className} style={{ position: 'relative', width: '100%', height: '100%', borderRadius: rounded, overflow: 'hidden', background: '#0E1114' }}>
        <div
          style={{
            position: 'absolute',
            width: th.size,
            height: th.size,
            left: '50%',
            top: '50%',
            transform: `translate(${-th.offsetX}px, ${-th.offsetY}px)`,
            opacity: 0.9,
          }}
        >
          {th.tiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              loading="lazy"
              style={{ position: 'absolute', left: tile.left, top: tile.top, width: 256, height: 256 }}
            />
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at 50% 50%, ${b.color}33 0%, transparent 62%),
                         linear-gradient(to top, rgba(6,8,10,.82) 0%, rgba(6,8,10,.15) 55%, transparent 100%)`,
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}>
          <BrandBadge name={name} chain={chain} size={30} radius={15} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: rounded,
        display: 'grid',
        placeItems: 'center',
        background: `linear-gradient(145deg, ${b.color}, ${b.color2})`,
      }}
    >
      <BrandMark name={name} chain={chain} size="60%" />
    </div>
  );
}

export function BrandMark({
  name, chain, size = 44,
}: { name?: string | null; chain?: string | null; size?: number | string }) {
  const b = brandOf(name, chain);
  const { url } = useLogo(b.key);
  const px = typeof size === 'number' ? `${size}px` : size;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={b.label}
        style={{ width: px, height: px, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return (
    <span
      style={{
        fontWeight: 700,
        fontSize: `calc(${px} * 0.4)`,
        letterSpacing: '-.04em',
        color: b.fg,
        lineHeight: 1,
        textShadow: '0 2px 10px rgba(0,0,0,.35)',
      }}
    >
      {monogram(name)}
    </span>
  );
}

export function BrandBadge({
  name, chain, size = 46, radius = 16,
}: { name?: string | null; chain?: string | null; size?: number; radius?: number }) {
  const b = brandOf(name, chain);
  const { url } = useLogo(b.key);

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        padding: url ? Math.round(size * 0.14) : 0,
        background: url ? '#fff' : `linear-gradient(145deg, ${b.color}, ${b.color2})`,
        boxShadow: `0 6px 18px -6px ${b.color}80`,
      }}
    >
      <BrandMark name={name} chain={chain} size={url ? Math.round(size * 0.72) : Math.round(size * 0.62)} />
    </span>
  );
}
