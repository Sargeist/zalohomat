import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  south: z.coerce.number().min(45).max(52),
  west: z.coerce.number().min(14).max(25),
  north: z.coerce.number().min(45).max(52),
  east: z.coerce.number().min(14).max(25),
  lat: z.coerce.number().min(45).max(52),
  lng: z.coerce.number().min(14).max(25),
  zoom: z.coerce.number().int().min(3).max(20).default(13),
}).refine((v) => v.north > v.south && v.east > v.west, { message: 'bad_bbox' });

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('machines_view', {
    p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east,
    p_lat: b.lat, p_lng: b.lng, p_zoom: b.zoom, p_points: 60,
  });

  if (error) {
    console.error('machines_view', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, max-age=20' },
  });
}
