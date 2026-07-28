'use server'

import { adminClient } from '../../../lib/supabaseAdmin'

const TRACKED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']
const VALID_SEASONS = [2021, 2022, 2023, 2024, 2025]
const UPSERT_BATCH = 500
const ID_QUERY_BATCH = 200

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

export async function importSeasonAction(prevState, formData) {
  try {
    const season = Number(formData.get('season'))
    if (!VALID_SEASONS.includes(season)) {
      return { status: 'error', message: 'Invalid season: ' + season }
    }
    const results = await importSeason(season)
    return { status: 'done', results }
  } catch (err) {
    return { status: 'error', message: err.message }
  }
}
