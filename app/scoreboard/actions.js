'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// SCOREBOARD REFRESH -- pulls one week of matchups from Sleeper and hands the
// payload to edfl_sync_week_scores() as jsonb.
//
// THE DATABASE NEVER MAKES AN OUTBOUND CALL. Sleeper is fetched here, exactly
// as /admin/sleeper-sync does it, and the array goes to the function untouched.
//
// NOT OFFICER-GATED, DELIBERATELY. edfl_sync_week_scores() admits any signed-in
// team owner. The function only mirrors Sleeper, and Sleeper's number is the
// official points for, so there is nothing to adjudicate and no advantage
// available to whoever presses the button. Commissioner-only would have meant
// the waiver priority order going stale whenever he was away on a Tuesday.
//
// createSupabaseServerClient, not the shared anon client: the function has no
// anon grant and resolves the caller through auth.uid(), so a service-role or
// anon call is refused by the database no matter who is logged in.
//
// Returns { ok, ... } and never throws.

const SLEEPER_BASE = 'https://api.sleeper.app/v1/league/';

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

export async function refreshWeekScores(seasonYear, weekNumber) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'Sign in as a team owner to refresh scores.' };
  }

  const week = Number(weekNumber);
  const season = Number(seasonYear);
  if (!Number.isInteger(week) || week < 1) {
    return { ok: false, message: 'Pick a week to refresh.' };
  }

  const supabase = await createSupabaseServerClient();

  let matchups;
  try {
    const id = await leagueId(supabase);
    matchups = await fetchJson(SLEEPER_BASE + id + '/matchups/' + week);
  } catch (e) {
    return { ok: false, message: e.message };
  }

  if (!Array.isArray(matchups)) {
    return { ok: false, message: 'Sleeper did not return a matchup array for week ' + week + '. Nothing was written.' };
  }
  if (matchups.length === 0) {
    return { ok: false, message: 'Sleeper has no matchups for week ' + week + ' yet. Nothing was written.' };
  }

  const { data, error } = await supabase.rpc('edfl_sync_week_scores', {
    p_season: season,
    p_week: week,
    p_payload: matchups,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/scoreboard');
  revalidatePath('/standings');

  // unmatched_rosters is surfaced rather than swallowed: a Sleeper roster with
  // no matching teams.sleeper_roster_id is silently absent from every score,
  // which would look like a quiet week rather than a broken mapping.
  return { ok: true, data: data };
}
