import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SK = { south: 47.6, north: 49.8, west: 16.6, east: 22.8 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

const Query = z.object({
  south: z.coerce.number().finite(),
  west: z.coerce.number().finite(),
  north: z.coerce.number().finite(),
  east: z.coerce.number().finite(),
  lat: z.coerce.number().finite(),
  lng: z.coerce.number().finite(),
  zoom: z.coerce.number().finite().default(13),
});

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const q = parsed.data;

  const south = clamp(Math.min(q.south, q.north), SK.south, SK.north);
  const north = clamp(Math.max(q.south, q.north), SK.south, SK.north);
  const west = clamp(Math.min(q.west, q.east), SK.west, SK.east);
  const east = clamp(Math.max(q.west, q.east), SK.west, SK.east);

  if (north - south < 1e-6 || east - west < 1e-6) {
    return NextResponse.json({ points: [], extra: [], clusters: [], zoom: q.zoom });
  }

  const lat = clamp(q.lat, SK.south, SK.north);
  const lng = clamp(q.lng, SK.west, SK.east);
  const zoom = clamp(Math.round(q.zoom), 3, 20);

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('machines_view', {
    p_south: south, p_west: west, p_north: north, p_east: east,
    p_lat: lat, p_lng: lng, p_zoom: zoom, p_points: 120,
  });

  if (error) {
    console.error('machines_view', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=20' } });
}
