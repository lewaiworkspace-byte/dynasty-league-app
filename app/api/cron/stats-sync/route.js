import { NextResponse } from 'next/server';
import { adminClient } from '../../../../lib/supabaseAdmin';
import { seasonWindow, importSeason, NoStatsFileError } from '../../../../lib/statsImport';

// THE DAILY STATS REFRESH -- October 5, 2026. Scheduled in vercel.json at
// 0 11 UTC (7 AM Eastern in daylight time, 6 AM in standard time; a Hobby cron
// fires anywhere inside its hour). Vercel calls this URL with
// Authorization: Bearer $CRON_SECRET.
//
// What it does: imports the CURRENT league season from nflverse through
// lib/statsImport.js -- the same code as the Import button on
// /admin/import-stats -- so every player's 2026 stat lines (not just rostered
// players' EDFL points) stay current without anyone pressing a button. The
// import is an idempotent upsert: new weeks land, stat corrections overwrite,
// nothing duplicates.
//
// It never imports a completed season (an officer does that once, by hand,
// at the rollover) and it never publishes anything -- publishing settles the
// Fifth Year Option record and is an officer act on a completed season only.
//
// A missing file is not a failure. Between the March 1 rollover and the first
// game, nflverse has no file for the new league year; the route answers 200
// 'skipped' and touches nothing.
//
// Node runtime, never cached: this route writes.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// FAILS CLOSED, exactly like /api/cron/injury-sync: no CRON_SECRET, no run.
function authorize(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, message: 'CRON_SECRET is not configured. Refusing to run.' };
  }
  const header = request.headers.get('authorization') || '';
  if (header !== 'Bearer ' + secret) {
    return { ok: false, status: 401, message: 'Unauthorized.' };
  }
  return { ok: true };
}

export async function GET(request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.message }, { status: auth.status });
  }

  const supabase = adminClient();
  const w = await seasonWindow(supabase);
  if (!w.ok) {
    return NextResponse.json({ ok: false, error: 'Could not read the current season: ' + w.message }, { status: 500 });
  }

  try {
    const r = await importSeason(supabase, w.current);
    const summary = {
      ok: r.errors.length === 0,
      season: r.season,
      throughWeek: r.throughWeek,
      statRowsUpserted: r.statRowsUpserted,
      gamesUpserted: r.gamesUpserted,
      playersCreated: r.createdPlayers,
      matchedByName: r.matchedByName,
      missingColumns: Object.keys(r.columnReport).filter(function (k) {
        return r.columnReport[k] === 'MISSING';
      }),
      errors: r.errors,
      source: r.sourceUrl,
    };
    // One line in the Vercel log either way; a partial failure is a 500 so
    // the cron dashboard shows it red.
    console.log('[stats-sync] ' + JSON.stringify(summary));
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  } catch (e) {
    if (e instanceof NoStatsFileError) {
      return NextResponse.json({ ok: true, skipped: e.message, season: w.current });
    }
    console.error('[stats-sync] ' + (e && e.message ? e.message : String(e)));
    return NextResponse.json({ ok: false, error: e && e.message ? e.message : String(e) }, { status: 500 });
  }
}
