import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const Body = z.object({
  machineId: z.string().uuid(),
  status: z.enum(['ok', 'issue', 'down']),
  reasons: z.array(z.string().max(40)).max(7).default([]),
  lat: z.number().min(47.5).max(49.7),
  lng: z.number().min(16.7).max(22.7),
  accuracy: z.number().min(0).max(10000),
  turnstileToken: z.string().optional(),
});

function hashIp(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip') ?? '0.0.0.0';
  return createHash('sha256').update(ip + (process.env.IP_HASH_SALT ?? '')).digest('hex').slice(0, 32);
}

async function verifyTurnstile(token?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token }),
  });
  const json = await res.json();
  return json.success === true;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const b = parsed.data;

  if (!(await verifyTurnstile(b.turnstileToken))) {
    return NextResponse.json({ ok: false, error: 'captcha' }, { status: 403 });
  }

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await sb.rpc('submit_report', {
    p_machine: b.machineId,
    p_status: b.status,
    p_reasons: b.reasons,
    p_lat: b.lat,
    p_lng: b.lng,
    p_accuracy: b.accuracy,
    p_ip_hash: hashIp(req),
  });

  if (error) {
    console.error('submit_report', error.message);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
  return NextResponse.json(data);
}
