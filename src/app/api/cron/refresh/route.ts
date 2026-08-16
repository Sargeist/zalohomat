import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Automaticka obnova — spusta sa cronom kazdych 15 minut.
 *
 * Co realne robi:
 *  1) prepocita vsetky stavy s casovym utlmom (bez toho stav "zostarne"
 *     az ked nan niekto klikne)
 *  2) ak je nastaveny GOOGLE_PLACES_API_KEY, zisti pre kazdy automat,
 *     ci je predajna prave otvorena a ci nie je docasne/trvalo zatvorena
 *
 * Co NEROBI a robit nemoze: nezisti, ci je samotny zalohomat pokazeny.
 * Taku telemetriu maju len prevadzkovatelia (TOMRA, Envipco, Botler)
 * a verejne API na nu neexistuje. Preto stav stroja stoji na hlaseniach.
 */
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

  // --- 1. prepocet stavov -------------------------------------------------
  const { data: refreshed, error: e1 } = await sb.rpc('refresh_all_statuses');
  if (e1) {
    console.error('refresh_all_statuses', e1.message);
    return NextResponse.json({ error: 'refresh_failed' }, { status: 500 });
  }

  // --- 2. dostupnost predajne z Google Places (volitelne) -----------------
  let checked = 0;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key) {
    const { data: machines } = await sb
      .from('machines')
      .select('id, name, city')
      .eq('active', true)
      .order('checked_at', { ascending: true, nullsFirst: true })
      .limit(60);                        // davkujeme, aby sme nevycerpali kvotu

    const results: { id: string; open_now: boolean | null; availability: string | null }[] = [];

    for (const m of machines ?? []) {
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.businessStatus,places.currentOpeningHours.openNow',
          },
          body: JSON.stringify({
            textQuery: [m.name, m.city, 'Slovensko'].filter(Boolean).join(', '),
            maxResultCount: 1,
          }),
        });
        const json = await res.json();
        const place = json.places?.[0];
        if (!place) continue;
        results.push({
          id: m.id,
          open_now: place.currentOpeningHours?.openNow ?? null,
          availability:
            place.businessStatus === 'CLOSED_PERMANENTLY' ? 'closed_permanently'
            : place.businessStatus === 'CLOSED_TEMPORARILY' ? 'closed_temporarily'
            : 'operational',
        });
      } catch { /* jedna neuspesna kontrola nesmie zhodit cely beh */ }
    }

    if (results.length) {
      const { error: e2 } = await sb.rpc('apply_availability', { payload: results });
      if (e2) console.error('apply_availability', e2.message);
      else checked = results.length;
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
