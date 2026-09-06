'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// SLEEPER SYNC -- the commissioner's side of reconciling the app against
// Sleeper. Every function here returns { ok, ... } and never throws, matching
// how the panel reports failure.
//
// WHY createSupabaseServerClient AND NOT adminClient. Every sleeper_sync_*
// function calls require_commissioner_or_co(), which resolves the caller
// through auth.uid(). The service-role client has no auth.uid(), so an
// adminClient() call would be refused by the database no matter who is logged
// in. This is the opposite of /admin/sync-players, which writes players
// directly and therefore does use adminClient. The app-layer check below is
// for a readable message; the database is the gate.
//
// WIDENED TO CO-COMMISSIONERS, deliberately, matching
// require_commissioner_or_co() in the database. Note that /admin/sync-players
// -- the older, unrelated player-pool page -- is strict commissioner-only.
// Two Sleeper pages, two different gates, on purpose: that one rewrites the
// player pool, this one reconciles rosters and writes almost nothing.
//
// THE DATABASE NEVER MAKES AN OUTBOUND CALL. Sleeper is fetched here and the
// payload is handed to sleeper_sync_stage() as jsonb.

const ROSTERS_PATH = '/rosters';
const USERS_PATH = '/users';
const SLEEPER_BASE = 'https://api.sleeper.app/v1/league/';

function refusal() {
  return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
}

// The league id lives in league_config and is never hardcoded.
async function leagueId(supabase) {
  const { data, error } = await supabase
    .from('league_config')
    .select('sleeper_league_id')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.sleeper_league_id) {
    throw new Error('league_config.sleeper_league_id is not set, so there is nothing to pull from.');
  }
  return data.sleeper_league_id;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Sleeper returned ' + res.status + ' ' + res.statusText + ' for ' + url);
  }
  return res.json();
}

// Reads the open run and its conflicts. Returns run: null when nothing is open.
export async function loadSyncState() {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();

  const { data: runs, error: runErr } = await supabase
    .from('sleeper_sync_runs')
    .select('id, status, feeds, sleeper_fetched_at, db_snapshot_at, detected_at, created_at')
    .in('status', ['staged', 'detected', 'adjudicated'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (runErr) return { ok: false, message: runErr.message };

  const { data: armedRow, error: armedErr } = await supabase.rpc('edfl_sync_enforcement_armed');
  if (armedErr) return { ok: false, message: armedErr.message };

  const run = runs && runs.length > 0 ? runs[0] : null;
  if (!run) {
    return { ok: true, data: { run: null, conflicts: [], armed: Boolean(armedRow) } };
  }

  // Filtered by run_id, so the 1,000-row PostgREST ceiling cannot bite: a run
  // is bounded by the number of rostered players, currently under 300.
  const { data: conflicts, error: cErr } = await supabase
    .from('sleeper_sync_conflicts')
    .select(
      'id, conflict_class, conflict_type, severity, detail, app_value, sleeper_value,' +
        ' recommended_resolution, resolution, resolution_note, team_id, player_id'
    )
    .eq('run_id', run.id)
    .order('severity')
    .order('conflict_class')
    .order('conflict_type')
    .order('detail');
  if (cErr) return { ok: false, message: cErr.message };

  return { ok: true, data: { run: run, conflicts: conflicts || [], armed: Boolean(armedRow) } };
}

// Opens a run, pulls both feeds, stages them, and detects. Writes nothing to
// any league table -- staging and conflicts only.
export async function pullAndCompare() {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();

  let rosters;
  let users;
  let openRes;
  try {
    const id = await leagueId(supabase);
    rosters = await fetchJson(SLEEPER_BASE + id + ROSTERS_PATH);
    users = await fetchJson(SLEEPER_BASE + id + USERS_PATH);
  } catch (e) {
    return { ok: false, message: e.message };
  }

  if (!Array.isArray(rosters) || rosters.length === 0) {
    return { ok: false, message: 'Sleeper returned no rosters. Nothing was staged.' };
  }

  openRes = await supabase.rpc('sleeper_sync_open', { p_feeds: ['rosters', 'users'] });
  if (openRes.error) return { ok: false, message: openRes.error.message };
  const runId = openRes.data.run_id;

  const stageRosters = await supabase.rpc('sleeper_sync_stage', {
    p_run_id: runId,
    p_feed: 'rosters',
    p_payload: rosters,
  });
  if (stageRosters.error) return { ok: false, message: stageRosters.error.message };

  const stageUsers = await supabase.rpc('sleeper_sync_stage', {
    p_run_id: runId,
    p_feed: 'users',
    p_payload: users,
  });
  if (stageUsers.error) return { ok: false, message: stageUsers.error.message };

  const detected = await supabase.rpc('sleeper_sync_detect', { p_run_id: runId });
  if (detected.error) return { ok: false, message: detected.error.message };

  revalidatePath('/admin/sleeper-sync');
  return { ok: true, data: detected.data };
}

export async function resolveOne(runId, conflictId, resolution, note) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('sleeper_sync_resolve', {
    p_run_id: runId,
    p_conflict_id: conflictId,
    p_resolution: resolution,
    p_note: note && note.trim() ? note.trim() : null,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/admin/sleeper-sync');
  return { ok: true };
}

export async function resolveType(runId, conflictType, resolution, note) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('sleeper_sync_resolve_type', {
    p_run_id: runId,
    p_conflict_type: conflictType,
    p_resolution: resolution,
    p_note: note && note.trim() ? note.trim() : null,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/admin/sleeper-sync');
  return { ok: true, data: data };
}

// Read-only. Returns every write apply would make, the worklist, and the token
// that binds this exact reviewed state.
export async function previewApply(runId) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('sleeper_sync_preview_apply', { p_run_id: runId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data };
}

// The refusals are matched on error.code, never on message text:
//   EDFS1 blocking conflicts unresolved
//   EDFS2 the league moved since the run was opened
//   EDFS3 the conflict set changed since the preview
export async function applySync(runId, confirmToken) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('sleeper_sync_apply', {
    p_run_id: runId,
    p_confirm_token: confirmToken,
  });

  if (error) {
    let hint = '';
    if (error.code === 'EDFS1') {
      hint = 'Decide the blocking rows above, then preview again.';
    } else if (error.code === 'EDFS2') {
      hint = 'Pull and compare again — the league changed after this run was opened.';
    } else if (error.code === 'EDFS3') {
      hint = 'Preview again to get a fresh approval, then apply.';
    }
    return { ok: false, message: error.message, hint: hint, code: error.code || null };
  }

  revalidatePath('/admin/sleeper-sync');
  revalidatePath('/actions');
  return { ok: true, data: data };
}

export async function abandonSync(runId, reason) {
  const me = await getCurrentTeamOwner();
  if (!isCommissionerOrCo(me)) return refusal();
  if (!reason || reason.trim().length < 10) {
    return { ok: false, message: 'A reason of at least 10 characters is required — it goes in the public action log.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('sleeper_sync_abandon', {
    p_run_id: runId,
    p_reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/admin/sleeper-sync');
  revalidatePath('/actions');
  return { ok: true };
}
