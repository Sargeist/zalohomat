import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: refreshed, error: e1 } = await sb.rpc('refresh_all_statuses');
  if (e1) {
    console.error('refresh_all_statuses', e1.message);
    return NextResponse.json({ error: 'refresh_failed' }, { status: 500 });
  }

  let checked = 0;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key) {
    const { data: machines } = await sb
      .from('machines')
      .select('id, name, city, photo_ref')
      .eq('active', true)
      .order('checked_at', { ascending: true, nullsFirst: true })
      .limit(60);

    const results: { id: string; open_now: boolean | null; availability: string | null }[] = [];
    const photos: { id: string; photo_ref: string; photo_credit: string }[] = [];

    for (const m of machines ?? []) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.businessStatus,places.currentOpeningHours.openNow,places.photos',
          },
          body: JSON.stringify({
            textQuery: [m.name, m.city, 'Slovensko'].filter(Boolean).join(', '),
            maxResultCount: 1,
          }),
        });
        const json = await res.json();
        const place = json.places?.[0];
        if (!place) continue;

        const ph = place.photos?.[0];
        if (ph?.name && !m.photo_ref) {
          photos.push({
            id: m.id,
            photo_ref: ph.name,
            photo_credit: ph.authorAttributions?.[0]?.displayName
              ? `Foto: ${ph.authorAttributions[0].displayName} / Google`
              : 'Foto: Google',
          });
        }
        results.push({
          id: m.id,
          open_now: place.currentOpeningHours?.openNow ?? null,
          availability:
            place.businessStatus === 'CLOSED_PERMANENTLY' ? 'closed_permanently'
            : place.businessStatus === 'CLOSED_TEMPORARILY' ? 'closed_temporarily'
            : 'operational',
        });
      } catch {  }
    }

    if (results.length) {
      const { error: e2 } = await sb.rpc('apply_availability', { payload: results });
      if (e2) console.error('apply_availability', e2.message);
      else checked = results.length;
    }
    if (photos.length) {
      const { error: e3 } = await sb.rpc('apply_photos', { payload: photos });
      if (e3) console.error('apply_photos', e3.message);
    }
  }

  return NextResponse.json({
    ok: true,
    statuses_refreshed: refreshed,
    availability_checked: checked,
    places_enabled: Boolean(key),
    at: new Date().toISOString(),
  });
}
