import { NextResponse } from 'next/server';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg']);

export async function GET() {
  const dir = path.join(process.cwd(), 'public', 'logos');
  const map: Record<string, string> = {};

  try {
    const files = await readdir(dir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!ALLOWED.has(ext)) continue;
      const key = path.basename(file, ext).toLowerCase();
      if (!map[key] || ext === '.svg') map[key] = `/logos/${file}`;
    }
  } catch {
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json(map, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' },
  });
}
