import { NextResponse } from 'next/server';
import { adminClient } from '../../../../lib/supabaseAdmin';
import { runInjurySync, shouldLog, summaryLine, SYNC_BUSY } from '../../../../lib/injurySync';

// THE DAILY PULL. Scheduled in vercel.json; Vercel calls this URL with
// Authorization: Bearer $CRON_SECRET.
//
// Node runtime, never cached: this route writes.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// TWO SCHEDULES, ONE PULL (September 16, 2026).
//
// The pull must land in the 5 PM Eastern hour, after the NFL's 4:00 PM ET
// game-status filing deadline. Vercel crons are written in UTC with no time
// zone, and a Hobby cron fires anywhere inside its scheduled hour. A single
// UTC schedule is therefore right for only half the year: 0 21 is 5 PM in
// daylight time and 4 PM -- on top of the deadline -- once standard time
// begins on the first Sunday of November.
//
// So vercel.json registers this route twice, at 0 21 and 0 22 UTC, and the
// route itself decides which invocation is the real one: it runs the pull only
// when the Eastern clock reads the 17:00 hour, and every other invocation
// returns a 200 'skipped' and touches nothing. On any date exactly one of the
// two lands in that hour -- 21:xx UTC in daylight time, 22:xx UTC in standard
// time -- so the pull happens once a day at the ruled hour with no edit on
// DST days, ever. This is SR-50 (time-window logic belongs in the due-check,
// not the cron expression) applied to Vercel.
//
// Consequence worth knowing: the Vercel dashboard's Run button now only pulls
// if pressed during the 5 PM Eastern hour. The /admin/injury-sync button is
// the manual pull and is unaffected.
const PULL_HOUR_ET = 17;

function easternHour(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = parts.find(function (p) {
    return p.type === 'hour';
  });
  return hour ? Number(hour.value) % 24 : NaN;
}

// FAILS CLOSED. This route runs as service_role and rewrites injury data on
// every player in the league. If CRON_SECRET is not set in the environment,
// there is no way to tell Vercel's scheduler from anybody who guessed the URL,
// so it refuses rather than running unauthenticated. A 503 on the cron
// dashboard is a legible symptom; an open write endpoint is not.
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

  // Authorization first, then the clock: an unauthenticated caller learns
  // nothing about the schedule.
  const hourEt = easternHour(new Date());
  if (hourEt !== PULL_HOUR_ET) {
    return NextResponse.json({
      ok: true,
      skipped:
        'Outside the 5 PM Eastern pull hour (it is ' +
        hourEt +
        ':xx ET). The other scheduled invocation runs the pull.',
    });
  }

  let summary;
  try {
    // run_by is null on purpose. A scheduled pull was performed by nobody, and
    // attributing it to the commissioner would put his name on a write he did
    // not make. trigger_source on the run row is what says how it started.
    summary = await runInjurySync({ triggerSource: 'scheduled', runBy: null });
  } catch (err) {
    // The manual button and the schedule can land in the same minute. A busy
    // answer is not a failure -- returning 200 keeps it out of the cron
    // dashboard's error count, where it would be noise rather than signal.
    if (err && err.code === SYNC_BUSY) {
      return NextResponse.json({ ok: true, skipped: 'A pull was already running.' });
    }
    return NextResponse.json(
      { ok: false, error: err && err.message ? err.message : String(err) },
      { status: 500 }
    );
  }

  if (shouldLog(summary)) {
    const supabase = adminClient();
    const { error: logError } = await supabase.rpc('log_commissioner_action', {
      p_owner_id: null,
      p_action_type: 'injury_sync',
      p_target_type: 'injury_sync_run',
      p_target_id: summary.run_id,
      p_summary: summaryLine(summary),
      p_reason: null,
      p_snapshot: summary,
    });
    if (logError) summary.log_error = logError.message;
  }

  return NextResponse.json({ ok: true, summary: summary });
}
