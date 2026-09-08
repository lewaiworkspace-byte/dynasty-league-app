import { adminClient } from './supabaseAdmin';

// SERVER ONLY. Imports adminClient(), which holds the service_role key --
// never import this file into a 'use client' component.
//
// ONE IMPLEMENTATION, TWO CALLERS. The commissioner's button
// (app/admin/injury-sync/actions.js) and the nightly cron
// (app/api/cron/injury-sync/route.js) both call runInjurySync(). They differ
// only in who is allowed to start one and what trigger_source gets recorded.
// A second copy of this logic behind the cron is how the two would drift.

// NOT the ?active=true URL /admin/sync-players uses. A player on IR or PUP is
// exactly who this pull exists to find, and active=true is the filter most
// likely to drop him.
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

// The same five the players table carries. A designation for a player we do
// not store has nowhere to go.
const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

// A run that dies mid-flight -- a Vercel timeout, a deploy in the middle of a
// pull -- leaves a 'running' row, and the one-running unique index (guard INJ1)
// would then block every later pull forever. Reaping first is the release valve
// for that index; the index comment in migration inj_01 points back here.
const STALE_RUN_MINUTES = 15;

export const SYNC_BUSY = 'INJURY_SYNC_BUSY';

function nowMinusMinutes(mins) {
  return new Date(Date.now() - mins * 60 * 1000).toISOString();
}

async function reapStalledRuns(supabase) {
  const { data, error } = await supabase
    .from('injury_sync_runs')
    .update({
      status: 'failed',
      error_message:
        'Abandoned: no result within ' +
        STALE_RUN_MINUTES +
        ' minutes. Reaped so a later pull could start.',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', nowMinusMinutes(STALE_RUN_MINUTES))
    .select('id');
  if (error) throw new Error('Could not reap stalled runs: ' + error.message);
  return (data || []).length;
}

async function fetchSleeperPlayers() {
  const res = await fetch(SLEEPER_PLAYERS_URL, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      'Sleeper player feed failed: ' + res.status + ' ' + res.statusText
    );
  }
  const body = await res.json();
  if (!body || typeof body !== 'object') {
    throw new Error('Sleeper returned something that is not a player map.');
  }
  return body;
}

/**
 * Splits the Sleeper feed into the two arrays apply_injury_sync() needs.
 *
 * seen    -- every tracked sleeper id the feed returned at all
 * injured -- the subset carrying a designation
 *
 * The split is the whole safety story for clearing: a player leaves `injured`
 * both when he gets healthy and when Sleeper stops carrying him, and only the
 * first is a recovery. See the header comment on apply_injury_sync().
 */
export function splitFeed(allPlayers) {
  const seen = [];
  const injured = [];

  const ids = Object.keys(allPlayers || {});
  for (let i = 0; i < ids.length; i += 1) {
    const sid = ids[i];
    const sp = allPlayers[sid];
    if (!sp || TRACKED_POSITIONS.indexOf(sp.position) === -1) continue;

    seen.push(sid);

    const status = sp.injury_status;
    if (!status) continue;

    injured.push({
      sid: sid,
      st: String(status),
      bp: sp.injury_body_part ? String(sp.injury_body_part) : null,
      nt: sp.injury_notes ? String(sp.injury_notes) : null,
      sd: sp.injury_start_date ? String(sp.injury_start_date) : null,
    });
  }

  return { seen: seen, injured: injured };
}

/**
 * Runs one pull end to end and returns the counts.
 *
 * @param {{triggerSource: 'manual'|'scheduled', runBy: string|null}} opts
 * @returns {Promise<object>} the apply_injury_sync() summary, plus reaped
 */
export async function runInjurySync(opts) {
  const triggerSource = opts && opts.triggerSource === 'scheduled' ? 'scheduled' : 'manual';
  const runBy = opts && opts.runBy ? opts.runBy : null;

  const supabase = adminClient();

  const reaped = await reapStalledRuns(supabase);

  const { data: opened, error: openError } = await supabase
    .from('injury_sync_runs')
    .insert({ trigger_source: triggerSource, run_by: runBy })
    .select('id')
    .single();

  if (openError) {
    // 23505 is guard INJ1 -- another pull is genuinely in flight. That is a
    // normal outcome the caller should report calmly, not an error.
    if (openError.code === '23505') {
      const busy = new Error(
        'Another injury pull is already running. Wait for it to finish, then try again.'
      );
      busy.code = SYNC_BUSY;
      throw busy;
    }
    throw new Error('Could not open an injury sync run: ' + openError.message);
  }

  const runId = opened.id;

  try {
    const allPlayers = await fetchSleeperPlayers();
    const split = splitFeed(allPlayers);

    if (split.seen.length === 0) {
      throw new Error(
        'Sleeper returned no tracked players at all. Refusing to apply -- an ' +
          'empty feed would clear every designation in the league.'
      );
    }

    const { data: summary, error: applyError } = await supabase.rpc('apply_injury_sync', {
      p_run_id: runId,
      p_injured: split.injured,
      p_seen: split.seen,
    });

    if (applyError) throw new Error(applyError.message);

    const result = summary || {};
    result.reaped = reaped;
    result.run_id = runId;
    result.trigger_source = triggerSource;
    return result;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    // Best effort. If this write itself fails the reaper picks the run up
    // fifteen minutes later, which is why the reaper exists.
    await supabase
      .from('injury_sync_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: message.slice(0, 1000),
      })
      .eq('id', runId);
    throw err;
  }
}

/**
 * The one-line summary written to the Commissioner Action Log.
 *
 * Commissioner ruling, September 8 2026: a pull that changed nothing does NOT
 * log. The banner timestamp on /injury-report already says the data is current,
 * and a nightly no-change entry would bury the log it shares with contract
 * deletions and cash adjustments.
 */
export function shouldLog(summary) {
  return Boolean(summary && Number(summary.status_changes) > 0);
}

export function summaryLine(summary) {
  const s = summary || {};
  const parts = [];
  parts.push(String(s.status_changes || 0) + ' designation changes');
  if (Number(s.cleared) > 0) parts.push(String(s.cleared) + ' cleared');
  if (Number(s.detail_updates) > 0) parts.push(String(s.detail_updates) + ' note updates');
  parts.push(String(s.injured_after || 0) + ' players now carrying a designation');
  const how = s.trigger_source === 'scheduled' ? 'Scheduled daily' : 'Manual';
  return how + ' Sleeper injury pull: ' + parts.join(', ') + '.';
}
