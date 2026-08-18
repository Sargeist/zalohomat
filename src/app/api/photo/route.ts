import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get('ref');
  const key = process.env.GOOGLE_PLACES_API_KEY;

  if (!ref || !key) return new NextResponse(null, { status: 404 });

  if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref)) {
    return new NextResponse(null, { status: 400 });
  }

  const upstream = await fetch(
    `https://places.googleapis.com/v1/${ref}/media?maxHeightPx=720&maxWidthPx=1080&key=${key}`,
    { redirect: 'follow', cache: 'no-store' }
  );
  if (!upstream.ok) return new NextResponse(null, { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}
