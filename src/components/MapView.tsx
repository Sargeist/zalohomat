'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Machine } from '@/lib/types';
import { freshness, glyph } from '@/lib/status';
import { liveness } from '@/lib/liveness';

export interface Bounds { south: number; west: number; north: number; east: number }
export interface Cluster { lat: number; lng: number; n: number; n_machine: number }

interface Props {
  machines: Machine[];
  clusters: Cluster[];
  center: [number, number];
  zoom?: number;
  userPos?: [number, number] | null;
  onSelect: (id: string) => void;
  onBoundsChange?: (b: Bounds, zoom: number) => void;
}

const DETAIL_ABOVE_ZOOM = 14;
const RICH_MARKER_LIMIT = 140;

function clusterIcon(c: Cluster) {
  const size = c.n < 10 ? 34 : c.n < 50 ? 42 : c.n < 200 ? 50 : 58;
  const label = c.n < 1000 ? String(c.n) : `${Math.round(c.n / 100) / 10}k`;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="cl" style="width:${size}px;height:${size}px"><span>${label}</span></div>`,
  });
}

export default function MapView({
  machines, clusters, center, zoom = 13, userPos, onSelect, onBoundsChange,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const canvas = useRef<L.Canvas | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const first = useRef<{ center: [number, number]; zoom: number }>({ center, zoom });
  const cb = useRef(onBoundsChange);
  cb.current = onBoundsChange;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      zoomAnimation: true,
      markerZoomAnimation: false,
      wheelDebounceTime: 120,
    }).setView(first.current.center, first.current.zoom);
    map.current = m;
    canvas.current = L.canvas({ padding: 0.3 });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; OSM &copy; CARTO',
      updateWhenZooming: false,
      keepBuffer: 1,
    }).addTo(m);

    layer.current = L.layerGroup().addTo(m);

    let timer: ReturnType<typeof setTimeout>;
    const emit = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = m.getBounds();
        cb.current?.(
          { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
          m.getZoom()
        );
      }, 320);
    };
    m.on('moveend zoomend', emit);
    emit();

    return () => { clearTimeout(timer); m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.setView(center, zoom, { animate: true });
  }, [center, zoom]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!userPos) {
      me.current?.remove();
      me.current = null;
      return;
    }
    if (me.current) me.current.setLatLng(userPos);
    else {
      me.current = L.circleMarker(userPos, {
        radius: 6, color: '#0B0D10', weight: 3, fillColor: '#2E7BFF', fillOpacity: 1,
        renderer: canvas.current!,
      }).addTo(m);
    }
  }, [userPos]);

  useEffect(() => {
    const m = map.current;
    if (!m || !layer.current) return;

    layer.current.clearLayers();
    const zoom = m.getZoom();

    clusters.forEach((c) => {
      L.marker([c.lat, c.lng], { icon: clusterIcon(c), interactive: true })
        .on('click', () => m.flyTo([c.lat, c.lng], Math.min(zoom + 3, 16), { duration: 0.5 }))
        .addTo(layer.current!);
    });

    const rich = zoom >= DETAIL_ABOVE_ZOOM && machines.length <= RICH_MARKER_LIMIT;

    machines.forEach((mm) => {
      const l = liveness(mm);
      const s = l.status;

      if (!rich) {
        const color = s === 'ok' ? '#3DDC97' : s === 'issue' ? '#FFB020'
          : s === 'down' ? '#FF5C6A' : '#6B747D';
        L.circleMarker([mm.lat, mm.lng], {
          radius: l.kind === 'no_machine' ? 3.5 : 5,
          color: '#0B0D10',
          weight: 1.5,
          fillColor: color,
          fillOpacity: l.kind === 'presumed' ? 0.6 : 0.95,
          renderer: canvas.current!,
        }).on('click', () => onSelect(mm.id)).addTo(layer.current!);
        return;
      }

      const f = freshness(mm);
      const cls = l.kind === 'no_machine' ? 'nomachine'
        : l.kind === 'presumed' ? 'presumed'
        : f === 0 ? 'stale' : f === 3 ? 'live' : '';
      L.marker([mm.lat, mm.lng], {
        icon: L.divIcon({
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
          html: `<div class="mk ${s} ${cls}"><div class="b">${glyph(s)}</div></div>`,
        }),
      }).on('click', () => onSelect(mm.id)).addTo(layer.current!);
    });
  }, [machines, clusters, onSelect]);

  return <div ref={box} className="lmap" />;
}
