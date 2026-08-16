'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Machine } from '@/lib/types';
import { effStatus, freshness, glyph } from '@/lib/status';

interface Props {
  machines: Machine[];
  center: [number, number];
  onSelect: (id: string) => void;
}

export default function MapView({ machines, center, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!box.current || map.current) return;
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true })
      .setView(center, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OSM &copy; CARTO',
    }).addTo(map.current);
    L.circleMarker(center, { radius: 6, color: '#0B0D10', weight: 3, fillColor: '#2E7BFF', fillOpacity: 1 })
      .addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [center]);

  useEffect(() => {
    if (!map.current || !layer.current) return;
    layer.current.clearLayers();
    machines.forEach((m) => {
      const s = effStatus(m), f = freshness(m);
      const icon = L.divIcon({
        className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<div class="mk ${s} ${f === 0 ? 'stale' : ''} ${f === 3 ? 'live' : ''}">
                 <div class="b">${glyph(s)}</div></div>`,
      });
      L.marker([m.lat, m.lng], { icon })
        .on('click', () => onSelect(m.id))
        .addTo(layer.current!);
    });
  }, [machines, onSelect]);

  return <div ref={box} className="lmap" />;
}
