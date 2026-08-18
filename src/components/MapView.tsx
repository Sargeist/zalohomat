'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Machine } from '@/lib/types';
import { freshness, glyph } from '@/lib/status';
import { liveness } from '@/lib/liveness';

export interface Bounds { south: number; west: number; north: number; east: number }

interface Props {
  machines: Machine[];
  center: [number, number];
  onSelect: (id: string) => void;
  onBoundsChange?: (b: Bounds, zoom: number) => void;
}

const SIMPLE_ABOVE = 220;

export default function MapView({ machines, center, onSelect, onBoundsChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const cb = useRef(onBoundsChange);
  cb.current = onBoundsChange;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: false, attributionControl: true })
      .setView(center, 13);
    map.current = m;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OSM &copy; CARTO',
    }).addTo(m);
    L.circleMarker(center, { radius: 6, color: '#0B0D10', weight: 3, fillColor: '#2E7BFF', fillOpacity: 1 })
      .addTo(m);
    layer.current = L.layerGroup().addTo(m);

    let timer: ReturnType<typeof setTimeout>;
    const emit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = m.getBounds();
        cb.current?.({
          south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(),
        }, m.getZoom());
      }, 260);
    };
    m.on('moveend zoomend', emit);
    emit();

    return () => { clearTimeout(timer); m.remove(); map.current = null; };
  }, [center]);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    const simple = machines.length > SIMPLE_ABOVE;

    machines.forEach((mm) => {
      const l = liveness(mm);
      const s = l.status;
      const color = s === 'ok' ? '#3DDC97' : s === 'issue' ? '#FFB020'
        : s === 'down' ? '#FF5C6A' : '#6B747D';

      if (simple) {
        L.circleMarker([mm.lat, mm.lng], {
          radius: l.kind === 'no_machine' ? 3.5 : 5,
          color: '#0B0D10', weight: 1.5,
          fillColor: color,
          fillOpacity: l.kind === 'presumed' ? 0.55 : 0.95,
        }).on('click', () => onSelect(mm.id)).addTo(layer.current!);
        return;
      }

      const f = freshness(mm);
      const cls = l.kind === 'no_machine' ? 'nomachine'
        : l.kind === 'presumed' ? 'presumed'
        : f === 0 ? 'stale' : f === 3 ? 'live' : '';
      L.marker([mm.lat, mm.lng], {
        icon: L.divIcon({
          className: '', iconSize: [30, 30], iconAnchor: [15, 15],
          html: `<div class="mk ${s} ${cls}"><div class="b">${glyph(s)}</div></div>`,
        }),
      }).on('click', () => onSelect(mm.id)).addTo(layer.current!);
    });
  }, [machines, onSelect]);

  return <div ref={box} className="lmap" />;
}
