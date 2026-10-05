// NFL STAT IMPORT -- one season of game-by-game stat lines from nflverse into
// nfl_games + player_game_stats. October 5, 2026.
//
// Moved here, unchanged in what it writes, from app/admin/import-stats/
// actions.js so that TWO callers share one implementation:
//   - the officers' Import button on /admin/import-stats (Server Action), and
//   - the daily Vercel cron, /api/cron/stats-sync, which keeps the season in
//     progress current.
// A 'use server' file cannot be the shared home: every export there is a
// callable endpoint, and a cron route should not import one.
//
// WRITES THROUGH THE SERVICE-ROLE CLIENT THE CALLER PASSES IN. No database
// function stands behind these writes, so each caller's own check is the
// whole gate (officer check in the action, CRON_SECRET in the route).
//
// THE CURRENT SEASON IS IMPORTABLE (October 5, 2026). nflverse publishes the
// season in progress week by week (stats_player_week_<season>.csv), so the
// current league year is importable alongside every completed one. Importing
// is idempotent -- an upsert on (player_id, game_id) -- so re-running it picks
// up new weeks and stat corrections and never duplicates. PUBLISHING is a
// different question and stays completed-seasons-only: see seasonWindow().
//
// PLAYER IDENTITY: gsis first, then a guarded name match, then create.
// nflverse keys players by gsis id. A Sleeper row that has no gsis id yet --
// a 2026 rookie or a recent signing, or a row carrying one of the wrong ids
// Sleeper has shipped -- would not match, and the import used to CREATE a
// second player row for him. That is the exact mechanism behind the 755
// duplicate players merged in August: his contract sat on the Sleeper row and
// his stats on the new one, and neither page could see the other half. On the
// first 2026 file, 14 of 15 unmatched players had a Sleeper row. So before
// creating, the import looks for exactly one Sleeper row with the same
// normalised name and no valid gsis id of its own, agreeing on position or
// NFL team, and books the stats there. It does NOT write gsis_id onto that
// row -- identity columns are the player sync's and the crosswalk trigger's
// (CLAUDE.md: the sync never overwrites a gsis_id a row already has). A
// player with no Sleeper row at all is still created, as before, and every
// name match and creation is reported back by name.

export const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
export const FIRST_IMPORT_SEASON = 2021
const UPSERT_BATCH = 500
const ID_QUERY_BATCH = 200
const PAGE = 1000

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

// nflverse writes the Rams as LA; Sleeper writes LAR. Every other club uses
// the same abbreviation in both. Used only to compare teams in the name match.
const TEAM_ALIAS = { LA: 'LAR' }

const VALID_GSIS = /^00-00\d{5}$/

/**
 * Which seasons may be imported and which may be published, read from
 * league_config -- never a list in code.
 *   completed   FIRST_IMPORT_SEASON .. current - 1   (importable AND publishable)
 *   current     the league year in progress          (importable only)
 * Returns { ok, completed, current, importable } or { ok: false, message }.
 */
export async function seasonWindow(supabase) {
  const { data, error } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .maybeSingle()
  if (error || !data || !data.current_season_year) {
    return { ok: false, message: error ? error.message : 'The current season could not be read.' }
  }
  const current = Number(data.current_season_year)
  const completed = []
  for (let y = FIRST_IMPORT_SEASON; y < current; y += 1) completed.push(y)
  return { ok: true, completed: completed, current: current, importable: completed.concat([current]) }
}

export function parseCsv(text) {
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

// "Mike Washington Jr." and "Mike Washington" are one man; "D.J." and "DJ"
// too. Lower case, letters only, generational suffix dropped.
export function normName(name) {
  const words = String(name || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 1 && ['jr', 'sr', 'ii', 'iii', 'iv', 'v'].indexOf(words[words.length - 1]) !== -1) {
    words.pop()
  }
  return words.join('')
}

function normTeam(t) {
  const s = String(t || '').toUpperCase()
  return TEAM_ALIAS[s] || s
}

export class NoStatsFileError extends Error {}

export async function fetchSeasonCsv(season) {
  const candidates = [
    'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_' + season + '.csv',
    'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_' + season + '.csv',
  ]
  for (const url of candidates) {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
    if (res.ok) {
      const text = await res.text()
      return { url, text }
    }
  }
  throw new NoStatsFileError('No nflverse stats file found for season ' + season + ' at any known URL')
}

// Sleeper rows with no valid gsis id of their own, keyed by normalised name.
// Paged until exhausted on the primary key (CLAUDE.md: never an unbounded
// select of players).
async function nameIndex(supabase) {
  const byName = new Map()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('players')
      .select('id, full_name, position, nfl_team, gsis_id')
      .not('sleeper_player_id', 'is', null)
      .in('position', TRACKED_POSITIONS)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error('player name index: ' + error.message)
    ;(data || []).forEach(function (p) {
      if (p.gsis_id && VALID_GSIS.test(String(p.gsis_id).trim())) return
      const k = normName(p.full_name)
      if (!k) return
      if (!byName.has(k)) byName.set(k, [])
      byName.get(k).push(p)
    })
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return byName
}

function pickByName(candidates, position, team, claimed) {
  let c = candidates.filter(function (p) {
    return !claimed.has(p.id)
  })
  if (c.length > 1) {
    const sameTeam = c.filter(function (p) {
      return normTeam(p.nfl_team) === normTeam(team)
    })
    if (sameTeam.length) c = sameTeam
  }
  if (c.length > 1) {
    const samePos = c.filter(function (p) {
      return p.position === position
    })
    if (samePos.length) c = samePos
  }
  if (c.length !== 1) return null
  const p = c[0]
  // One candidate is not enough on its own: it must agree on position OR
  // NFL team. A Sleeper TE booked as an RB by nflverse on the same club is
  // the same man; a namesake at another position on another club is not.
  if (p.position !== position && normTeam(p.nfl_team) !== normTeam(team)) return null
  return p
}

/**
 * Imports one season. `supabase` must be the service-role client.
 * Returns the same result shape the admin form has always rendered, plus
 * matchedByName / createdPlayers (names) and throughWeek.
 */
export async function importSeason(supabase, season) {
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

  // First pass over rows: collect tracked-position rows, games, gsis ids.
  // A row whose season is not the one asked for is skipped, not imported.
  const gamesById = new Map()
  const gsisIds = new Set()
  const rawRows = []
  let throughWeek = 0
  for (let r = 1; r < parsed.length; r++) {
    const row = parsed[r]
    if (row.length < 2) continue
    const position = row[idx['position']]
    if (!TRACKED_POSITIONS.includes(position)) continue
    if (toInt(row[idx['season']]) !== Number(season)) continue
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
    if ((row[idx['season_type']] || 'REG') === 'REG') throughWeek = Math.max(throughWeek, toInt(row[idx['week']]))
    rawRows.push(row)
  }

  // Upsert games. Only these four columns are sent, so a scheduled 2026 game
  // keeps its kickoff, teams and scores (the schedule refresh owns those).
  const errors = []
  for (const chunk of chunkArray(Array.from(gamesById.values()), UPSERT_BATCH)) {
    const { error } = await supabase.from('nfl_games').upsert(chunk, { onConflict: 'game_id' })
    if (error) errors.push({ step: 'games', message: error.message })
  }

  // 1. gsis -> players.id
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

  // 2. guarded name match onto a Sleeper row with no valid gsis
  const nameIdx = idx['player_display_name'] !== undefined ? idx['player_display_name'] : idx['player_name']
  const firstRowByGsis = new Map()
  for (const row of rawRows) {
    const gsis = row[idx['player_id']]
    if (!gsisToPlayer.has(gsis) && !firstRowByGsis.has(gsis)) firstRowByGsis.set(gsis, row)
  }
  const matchedByName = []
  if (firstRowByGsis.size > 0) {
    let byName = null
    try {
      byName = await nameIndex(supabase)
    } catch (e) {
      errors.push({ step: 'name match', message: e.message })
    }
    if (byName) {
      const claimed = new Set(gsisToPlayer.values())
      firstRowByGsis.forEach(function (row, gsis) {
        const name = nameIdx !== undefined ? row[nameIdx] : ''
        const cands = byName.get(normName(name))
        if (!cands) return
        const p = pickByName(cands, row[idx['position']], idx['team'] !== undefined ? row[idx['team']] : null, claimed)
        if (!p) return
        gsisToPlayer.set(gsis, p.id)
        claimed.add(p.id)
        matchedByName.push(name + ' (' + row[idx['position']] + ') -> ' + p.full_name + ' (' + p.position + ', ' + (p.nfl_team || 'no team') + ')')
      })
    }
  }

  // 3. create whoever is left -- a player Sleeper does not carry at all
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
  const createdPlayers = []
  for (const chunk of chunkArray(Array.from(newPlayersByGsis.values()), UPSERT_BATCH)) {
    const { data, error } = await supabase.from('players').insert(chunk).select('id, gsis_id, full_name, position')
    if (error) {
      errors.push({ step: 'player create', message: error.message })
      continue
    }
    for (const p of data || []) {
      gsisToPlayer.set(p.gsis_id, p.id)
      playersCreated++
      createdPlayers.push(p.full_name + ' (' + p.position + ')')
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
    throughWeek: throughWeek,
    playersCreated,
    createdPlayers,
    matchedByName,
    statRowsUpserted,
    columnReport,
    errors,
  }
}
