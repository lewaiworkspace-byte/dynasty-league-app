'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../../lib/getCurrentTeamOwner';
import { fetchWeekProjections } from '../../../../lib/sleeperProjections';

/**
 * PROJECTION REFRESH -- pulls one week of Rotowire projections from Sleeper
 * and hands the array to edfl_sync_week_projections() as jsonb.
 *
 * THE DATABASE NEVER MAKES AN OUTBOUND CALL. Sleeper is fetched here, exactly
 * as /scoreboard and /admin/sleeper-sync do it, and the rows go to the
 * function untouched. The function does the scoring, against
 * edfl_scoring_settings.
 *
 * NOT OFFICER-GATED, DELIBERATELY -- the same reasoning the score refresh was
 * written under. edfl_sync_week_projections() admits any signed-in team
 * owner. Nothing here is adjudicated, nothing is settled from a projection,
 * and no owner gains anything by pressing the button. Commissioner-only would
 * have meant stale projections every Sunday he was away.
 *
 * createSupabaseServerClient, not the shared anon client: the function has no
 * anon grant and resolves the caller through auth.uid(), so an anon call is
 * refused by the database no matter who is logged in.
 *
 * Returns { ok, ... } and never throws.
 */
export async function refreshProjections(seasonYear, weekNumber) {
  const me = await getCurrentTeamOwner();
  if (!me) {
    return { ok: false, message: 'Sign in as a team owner to refresh projections.' };
  }

  const season = Number(seasonYear);
  const week = Number(weekNumber);
  if (!Number.isInteger(week) || week < 1) {
    return { ok: false, message: 'Pick a week to refresh.' };
  }

  let pulled;
  try {
    pulled = await fetchWeekProjections(season, week);
  } catch (e) {
    return { ok: false, message: 'Sleeper could not be reached: ' + e.message };
  }

  // EVERY POSITION FAILING IS A REAL FAILURE AND SAYS SO. One position failing
  // is not -- the endpoint is undocumented and can be flaky per position, and
  // writing the four that answered is better than writing none. The names of
  // the ones that did not are returned so the page can say which.
  if (pulled.rows.length === 0) {
    return {
      ok: false,
      message:
        'Sleeper returned no projections for week ' +
        week +
        '. Nothing was written.' +
        (pulled.notes.length > 0 ? ' (' + pulled.notes.join('; ') + ')' : ''),
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('edfl_sync_week_projections', {
    p_season: season,
    p_week: week,
    p_payload: pulled.rows,
  });

  if (error) return { ok: false, message: error.message };

  // The ROUTE pattern, not a built path: revalidatePath needs the literal
  // segment names for a dynamic route, and every matchup of the week shares
  // the projections that were just written. The page also carries
  // `revalidate = 0`, so this is belt and braces rather than the mechanism.
  revalidatePath('/matchup/[week]/[matchupId]', 'page');

  return {
    ok: true,
    data: data,
    positionsOk: pulled.positionsOk,
    positionsFailed: pulled.positionsFailed,
  };
}
