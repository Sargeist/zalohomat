import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  lat: z.coerce.number().min(47.5).max(49.7),   // hranice SR — mimo nich nemá zmysel hľadať
  lng: z.coerce.number().min(16.7).max(22.7),
  radius: z.coerce.number().int().min(200).max(30000).default(6000),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const { lat, lng, radius } = parsed.data;

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('machines_near', {
    p_lat: lat, p_lng: lng, p_radius_m: radius,
  });

  if (error) {
    console.error('machines_near', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json(
    { machines: data ?? [] },
    { headers: { 'Cache-Control': 'private, max-age=20, stale-while-revalidate=60' } }
  );
}
