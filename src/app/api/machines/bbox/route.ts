import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  south: z.coerce.number().min(47).max(50),
  west: z.coerce.number().min(16).max(23),
  north: z.coerce.number().min(47).max(50),
  east: z.coerce.number().min(16).max(23),
  lat: z.coerce.number().min(47).max(50).optional(),
  lng: z.coerce.number().min(16).max(23).optional(),
}).refine((v) => v.north > v.south && v.east > v.west, { message: 'bad_bbox' });

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('machines_bbox', {
    p_south: b.south, p_west: b.west, p_north: b.north, p_east: b.east,
    p_lat: b.lat ?? null, p_lng: b.lng ?? null, p_limit: 1200,
  });

  if (error) {
    console.error('machines_bbox', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  return NextResponse.json(
    { machines: data ?? [], truncated: (data?.length ?? 0) >= 1200 },
    { headers: { 'Cache-Control': 'private, max-age=15' } }
  );
}
