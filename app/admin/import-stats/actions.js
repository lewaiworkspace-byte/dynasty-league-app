'use server'

import { revalidatePath } from 'next/cache'
import { adminClient } from '../../../lib/supabaseAdmin'
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient'
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner'

const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const UPSERT_BATCH = 500
const ID_QUERY_BATCH = 200

// THE IMPORTABLE SEASONS ARE READ, NOT LISTED (September 16, 2026). They run
// from the first season with nflverse coverage the league uses through the
// last COMPLETED league year -- current_season_year minus one -- so the season
// just played becomes importable at the March 1 rollover with no code change.
// The list was a constant, [2021..2025], which would have needed an edit every
// spring. importableSeasons() is exported for the page so the buttons and the
// check below can never disagree.
const FIRST_IMPORT_SEASON = 2021

export async function importableSeasons() {
  // league_config is public-read; the session client is enough.
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .maybeSingle()
  if (error || !data || !data.current_season_year) {
    return { ok: false, seasons: [], message: error ? error.message : 'The current season could not be read.' }
  }
  const seasons = []
  for (let y = FIRST_IMPORT_SEASON; y < data.current_season_year; y += 1) seasons.push(y)
  return { ok: true, seasons: seasons, currentSeason: data.current_season_year }
}

// Column mapping: for each of our database fields, the list of nflverse
// header names that can supply it. mode 'first' uses the first header
// found; mode 'sum' adds up every header found (for stats nflverse
// splits across multiple columns).
// Note: historical nflverse files do not split return TDs by kick vs
// punt — they provide one combined special_teams_tds column. That
// combined value lands in kick_return_tds (both types score 6 points,
// so scoring is unaffected); the stats page displays them combined.
const STAT_MAP = [
  { db: 'completions', mode: 'first', sources: ['completions'] },
  { db: 'attempts', mode: 'first', sources: ['attempts', 'passing_attempts'] },
  { db: 'passing_yards', mode: 'first', sources: ['passing_yards'] },
  { db: 'passing_tds', mode: 'first', sources: ['passing_tds'] },
  { db: 'passing_first_downs', mode: 'first', sources: ['passing_first_downs'] },
  { db: 'passing_2pt_conversions', mode: 'first', sources: ['passing_2pt_conversions'] },
  { db: 'interceptions_thrown', mode: 'first', sources: ['passing_interceptions', 'interceptions'] },
  { db: 'times_sacked', mode: 'first', sources: ['sacks_suffered', 'sacks'] },
  { db: 'carries', mode: 'first', sources: ['carries', 'rushing_attempts'] },
  { db: 'rushing_yards', mode: 'first', sources: ['rushing_yards'] },
  { db: 'rushing_tds', mode: 'first', sources: ['rushing_tds'] },
  { db: 'rushing_first_downs', mode: 'first', sources: ['rushing_first_downs'] },
  { db: 'rushing_2pt_conversions', mode: 'first', sources: ['rushing_2pt_conversions'] },
  { db: 'targets', mode: 'first', sources: ['targets'] },
  { db: 'receptions', mode: 'first', sources: ['receptions'] },
  { db: 'receiving_yards', mode: 'first', sources: ['receiving_yards'] },
  { db: 'receiving_tds', mode: 'first', sources: ['receiving_tds'] },
  { db: 'receiving_first_downs', mode: 'first', sources: ['receiving_first_downs'] },
  { db: 'receiving_2pt_conversions', mode: 'first', sources: ['receiving_2pt_conversions'] },
  { db: 'fumbles', mode: 'sum', sources: ['sack_fumbles', 'rushing_fumbles', 'receiving_fumbles'] },
  { db: 'fumbles_lost', mode: 'sum', sources: ['sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost'] },
  { db: 'kick_returns', mode: 'first', sources: ['kickoff_returns', 'kick_returns'] },
  { db: 'kick_return_yards', mode: 'first', sources: ['kickoff_return_yards', 'kick_return_yards'] },
  { db: 'kick_return_tds', mode: 'first', sources: ['kickoff_return_tds', 'kick_return_tds', 'special_teams_tds'] },
  { db: 'punt_returns', mode: 'first', sources: ['punt_returns'] },
  { db: 'punt_return_yards', mode: 'first', sources: ['punt_return_yards'] },
  { db: 'punt_return_tds', mode: 'first', sources: ['punt_return_tds'] },
  { db: 'fg_made_0_19', mode: 'first', sources: ['fg_made_0_19'] },
  { db: 'fg_made_20_29', mode: 'first', sources: ['fg_made_20_29'] },
  { db: 'fg_made_30_39', mode: 'first', sources: ['fg_made_30_39'] },
  { db: 'fg_made_40_49', mode: 'first', sources: ['fg_made_40_49'] },
  { db: 'fg_made_50_59', mode: 'first', sources: ['fg_made_50_59'] },
  { db: 'fg_made_60_plus', mode: 'first', sources: ['fg_made_60_', 'fg_made_60_plus'] },
  { db: 'fg_missed_0_19', mode: 'first', sources: ['fg_missed_0_19'] },
  { db: 'fg_missed_20_29', mode: 'first', sources: ['fg_missed_20_29'] },
  { db: 'fg_missed_30_39', mode: 'first', sources: ['fg_missed_30_39'] },
  { db: 'fg_missed_40_plus', mode: 'sum', sources: ['fg_missed_40_49', 'fg_missed_50_59', 'fg_missed_60_', 'fg_missed_60_plus'] },
  { db: 'pat_made', mode: 'first', sources: ['pat_made'] },
  { db: 'pat_missed', mode: 'first', sources: ['pat_missed'] },
]

const REQUIRED_META = ['player_id', 'position', 'season', 'week', 'season_type', 'game_id']

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function toInt(v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

async function fetchSeasonCsv(season) {
  const candidates = [
    'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_' + season + '.csv',
    'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_' + season + '.csv',
  ]
  for (const url of candidates) {
    const res = await fetch(url, { redirect: 'follow' })
    if (res.ok) {
      const text = await res.text()
      return { url, text }
    }
  }
  throw new Error('No nflverse stats file found for season ' + season + ' at any known URL')
}

async function importSeason(season) {
  const supabase = adminClient()
  const { url, text } = await fetchSeasonCsv(season)
  const parsed = parseCsv(text)
  if (parsed.length < 2) throw new Error('Downloaded file is empty or unreadable')

  const header = parsed[0]
  const idx = {}
  for (let i = 0; i < header.length; i++) idx[header[i]] = i

  const missingMeta = REQUIRED_META.filter((m) => idx[m] === undefined)
  if (missingMeta.length > 0) {
    throw new Error('Stats file is missing required columns: ' + missingMeta.join(', ') + ' (source: ' + url + ')')
  }

  // Resolve each mapping against the actual header, recording what matched
  const columnReport = {}
  const resolved = []
  for (const m of STAT_MAP) {
    const found = m.sources.filter((s) => idx[s] !== undefined)
    if (found.length === 0) {
      columnReport[m.db] = 'MISSING'
    } else if (m.mode === 'sum') {
      columnReport[m.db] = 'sum of ' + found.join(' + ')
      resolved.push({ db: m.db, cols: found.map((s) => idx[s]), mode: 'sum' })
    } else {
      columnReport[m.db] = found[0]
      resolved.push({ db: m.db, cols: [idx[found[0]]], mode: 'first' })
    }
  }

  // First pass over rows: collect tracked-position rows, games, gsis ids
  const gamesById = new Map()
  const gsisIds = new Set()
  const rawRows = []
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r]
    if (row.length < 2) continue
    const position = row[idx['position']]
    if (!TRACKED_POSITIONS.includes(position)) continue
    const gsis = row[idx['player_id']]
    const gameId = row[idx['game_id']]
    if (!gsis || !gameId) continue
    gsisIds.add(gsis)
    if (!gamesById.has(gameId)) {
      gamesById.set(gameId, {
        game_id: gameId,
        season_year: toInt(row[idx['season']]),
        week: toInt(row[idx['week']]),
        season_type: row[idx['season_type']] || 'REG',
      })
    }
    rawRows.push(row)
  }

  // Upsert games
  const errors = []
  for (const chunk of chunkArray(Array.from(gamesById.values()), UPSERT_BATCH)) {
    const { error } = await supabase.from('nfl_games').upsert(chunk, { onConflict: 'game_id' })
    if (error) errors.push({ step: 'games', message: error.message })
  }

  // Resolve gsis -> players.id, creating missing players
  const gsisToPlayer = new Map()
  const gsisList = Array.from(gsisIds)
  for (const chunk of chunkArray(gsisList, ID_QUERY_BATCH)) {
    const { data, error } = await supabase.from('players').select('id, gsis_id').in('gsis_id', chunk)
    if (error) {
      errors.push({ step: 'player lookup', message: error.message })
      continue
    }
    for (const p of data || []) gsisToPlayer.set(p.gsis_id, p.id)
  }

  const nameIdx = idx['player_display_name'] !== undefined ? idx['player_display_name'] : idx['player_name']
  const newPlayersByGsis = new Map()
  for (const row of rawRows) {
    const gsis = row[idx['player_id']]
    if (gsisToPlayer.has(gsis) || newPlayersByGsis.has(gsis)) continue
    newPlayersByGsis.set(gsis, {
      gsis_id: gsis,
      full_name: nameIdx !== undefined ? row[nameIdx] : gsis,
      position: row[idx['position']],
    })
  }
  let playersCreated = 0
  for (const chunk of chunkArray(Array.from(newPlayersByGsis.values()), UPSERT_BATCH)) {
    const { data, error } = await supabase.from('players').insert(chunk).select('id, gsis_id')
    if (error) {
      errors.push({ step: 'player create', message: error.message })
      continue
    }
    for (const p of data || []) {
      gsisToPlayer.set(p.gsis_id, p.id)
      playersCreated++
    }
  }

  // Build stat rows
  const statRows = []
  for (const row of rawRows) {
    const gsis = row[idx['player_id']]
    const playerId = gsisToPlayer.get(gsis)
    if (!playerId) continue
    const statRow = {
      player_id: playerId,
      game_id: row[idx['game_id']],
      team: idx['team'] !== undefined ? row[idx['team']] : null,
      opponent_team: idx['opponent_team'] !== undefined ? row[idx['opponent_team']] : null,
      position: row[idx['position']],
      source: 'nflverse',
    }
    for (const m of resolved) {
      if (m.mode === 'sum') {
        let total = 0
        for (const c of m.cols) total += toInt(row[c])
        statRow[m.db] = total
      } else {
        statRow[m.db] = toInt(row[m.cols[0]])
      }
    }
    statRows.push(statRow)
  }

  let statRowsUpserted = 0
  for (const chunk of chunkArray(statRows, UPSERT_BATCH)) {
    const { error } = await supabase
      .from('player_game_stats')
      .upsert(chunk, { onConflict: 'player_id,game_id' })
    if (error) errors.push({ step: 'stats upsert', message: error.message })
    else statRowsUpserted += chunk.length
  }

  return {
    season,
    sourceUrl: url,
    csvRows: parsed.length - 1,
    trackedRows: rawRows.length,
    gamesUpserted: gamesById.size,
    playersCreated,
    statRowsUpserted,
    columnReport,
    errors,
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
    const results = await importSeason(season)
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
    if (!allowed.seasons.includes(s)) {
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
