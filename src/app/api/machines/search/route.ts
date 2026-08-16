import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Query = z.object({
  q: z.string().max(60).default(''),
  lat: z.coerce.number().min(47.5).max(49.7).optional(),
  lng: z.coerce.number().min(16.7).max(22.7).optional(),
});

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const { q, lat, lng } = parsed.data;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('machines_search', {
    p_query: q.trim(), p_lat: lat ?? null, p_lng: lng ?? null, p_limit: 60,
  });

  if (error) {
    console.error('machines_search', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
  return NextResponse.json({ machines: data ?? [] });
}
