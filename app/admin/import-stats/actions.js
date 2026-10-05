'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '../../../lib/supabaseAdmin'
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient'
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner'
import { seasonWindow, importSeason } from '../../../lib/statsImport'

// THE IMPORT ITSELF LIVES IN lib/statsImport.js (October 5, 2026) so the daily
// cron (/api/cron/stats-sync) and the Import buttons below run one
// implementation. This file keeps the officer gates and the form shapes.
//
// TWO LISTS OF SEASONS, AND THE DIFFERENCE IS THE POINT (October 5, 2026).
//   importable  every completed league year PLUS the season in progress --
//               nflverse publishes the current season week by week, and an
//               import is an idempotent upsert, so importing it early and
//               often is safe.
//   publishable completed league years ONLY. Publishing settles the Pro Bowl
//               record and the Fifth Year Option tiers; a half-played season
//               must never be published. publish_edfl_season_results() now
//               refuses it in the database as well (stats_live_01).
// Both are read from league_config by seasonWindow(), never listed in code.
// They were one list until today, when "importable" meant "completed".

export async function importableSeasons() {
  // league_config is public-read; the session client is enough.
  const supabase = await createSupabaseServerClient()
  const w = await seasonWindow(supabase)
  if (!w.ok) return { ok: false, seasons: [], completed: [], message: w.message }
  return {
    ok: true,
    seasons: w.importable,
    completed: w.completed,
    currentSeason: w.current,
  }
}

// IMPORTING STATS DOES NOT MOVE A PUBLISHED SEASON, AND THERE IS NOTHING TO
// REFRESH HERE.
//
// This function briefly called refresh_edfl_player_season_composite() after
// each import, on the strength of migration fyo_08, which had materialised the
// season composite. fyo_09 replaced that view with edfl_season_results -- a
// PUBLISHED RECORD rather than a derivation -- and dropped both the view and
// the refresh function. The obligation had been dead about an hour when it was
// implemented, against a handoff section that had not been corrected.
//
// The distinction is the point of fyo_09, not an implementation detail: a
// published season does not move when stats change, which is what stops a stat
// correction in November altering a player's option tier -- and therefore his
// price -- after his owner has already decided. So there is no per-import work
// at all. The only recurring work is once a year after the season ends, via
// publish_edfl_season_results(), which belongs on an admin control and in the
// March 1 rollover checklist, NOT on this path. Do not reintroduce a
// per-import call here.
//
// What is left is a true statement instead of a false warning.
// edfl_season_results_status() answers whether the season the commissioner just
// imported is published, and its `message` is written to be shown verbatim.
//
// THE SESSION CLIENT, NOT adminClient(). Class B -- execute revoked from public
// and anon, granted to authenticated -- and service_role is not a member of
// authenticated, so the admin client would be the wrong role. That reasoning
// was right for the refresh call and it is still right for this one.
//
// ITS FAILURE IS QUIET, deliberately, and that is not the swallowed-error
// mistake. A failed refresh had a real consequence -- tiers silently stale --
// so it was reported loudly. This call has no consequence at all: it is a
// courtesy note about a record the import cannot affect. The error is captured
// rather than discarded, and the form renders it as a quiet note; crying wolf
// over a failed courtesy is what made the last version of this block wrong.
async function seasonResultsStatus(season) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('edfl_season_results_status', {
      p_season: season,
    })
    if (error) {
      return { ok: false, message: error.message }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, message: err.message || 'The season status could not be read.' }
  }
}

export async function importSeasonAction(prevState, formData) {
  // Server Actions are callable endpoints regardless of what the UI
  // renders -- the page's redirect alone doesn't protect this write path.
  // Returns the form's error-state shape rather than throwing, matching
  // how this useFormState action reports every other failure.
  //
  // WIDENED to the co-commissioner (September 16, 2026), implementing the
  // commissioner's ruling of September 8, 2026 that struck Technical Manual
  // Appendix A.2(c). This check is still the WHOLE gate for the import: it
  // writes through adminClient(), and no database function stands behind it.
  const me = await getCurrentTeamOwner()
  if (!isCommissionerOrCo(me)) {
    return { status: 'error', message: COMMISSIONER_OR_CO_REFUSAL }
  }

  try {
    const season = Number(formData.get('season'))
    const allowed = await importableSeasons()
    if (!allowed.ok) {
      return { status: 'error', message: 'Could not read which seasons may be imported: ' + allowed.message }
    }
    if (!allowed.seasons.includes(season)) {
      return { status: 'error', message: 'Invalid season: ' + season }
    }
    const results = await importSeason(adminClient(), season)
    results.inProgress = season === allowed.currentSeason
    results.seasonResults = await seasonResultsStatus(season)
    return { status: 'done', results }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}

// PUBLISH THE SEASON'S EDFL RESULTS -- the Pro Bowl record and the positional
// ranks the Fifth Year Option tiers read (September 16, 2026). Until now
// publish_edfl_season_results() had no caller in the app; it was run from the
// project chat. It belongs to the officers (Technical Manual Appendix A.2) and
// runs once a year, after the season is over and its stats are imported.
//
// THE SESSION CLIENT, NOT adminClient(): the function resolves the caller
// through auth.uid() and refuses anyone who is not the commissioner or
// co-commissioner. It also refuses to overwrite a published season unless
// republish is passed -- republishing can move a Fifth Year Option tier after
// an owner has decided, so the form makes that a separate, confirmed step.
// The database writes the public Commissioner Action Log row.
//
// Returns { ok, ... } and never throws.
export async function publishSeasonResults(season, republish) {
  const me = await getCurrentTeamOwner()
  if (!isCommissionerOrCo(me)) {
    return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL }
  }
  const s = Number(season)
  if (!Number.isInteger(s)) {
    return { ok: false, message: 'Pick a season to publish.' }
  }
  try {
    const allowed = await importableSeasons()
    if (!allowed.ok) {
      return { ok: false, message: 'Could not read which seasons are complete: ' + allowed.message }
    }
    if (!allowed.completed.includes(s)) {
      return { ok: false, message: s + ' is not a completed season, so it cannot be published yet.' }
    }
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.rpc('publish_edfl_season_results', {
      p_season: s,
      p_republish: Boolean(republish),
    })
    if (error) {
      return { ok: false, message: error.message }
    }
    revalidatePath('/admin/import-stats')
    revalidatePath('/fifth-year-option')
    revalidatePath('/actions')
    const status = await seasonResultsStatus(s)
    return { ok: true, data: data, status: status }
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : 'The season could not be published.' }
  }
}

// One status line per season for the publish panel. Read through the session
// client for the same reason as seasonResultsStatus() above; a failed read is
// returned per season and rendered quietly.
export async function loadSeasonStatuses(seasons) {
  const list = Array.isArray(seasons) ? seasons : []
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const st = await seasonResultsStatus(list[i])
    out.push({ season: list[i], status: st })
  }
  return out
}
