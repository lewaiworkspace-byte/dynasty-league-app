import { NextResponse } from 'next/server';
import { adminClient } from '../../../../lib/supabaseAdmin';
import { runInjurySync, shouldLog, summaryLine, SYNC_BUSY } from '../../../../lib/injurySync';

// THE NIGHTLY PULL. Scheduled in vercel.json; Vercel calls this URL with
// Authorization: Bearer $CRON_SECRET.
//
// Node runtime, never cached: this route writes.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
