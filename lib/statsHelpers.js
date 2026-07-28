import { supabase } from './supabaseClient'

export const FLEX_POSITIONS = ['RB', 'WR', 'TE']

export const COMMON_COLS = [
  { key: 'player', label: 'Player', fmt: 'text' },
  { key: 'position', label: 'Pos', fmt: 'text' },
  { key: 'season_year', label: 'Season', fmt: 'text' },
  { key: 'games', label: 'G', fmt: 'int' },
  { key: 'fantasy_points', label: 'FP', fmt: 'dec2' },
  { key: 'fppg', label: 'FPPG', fmt: 'dec2' },
]

export const QB_COLS = [
  { key: 'pass_attempts', label: 'Pass Att', fmt: 'int' },
  { key: 'completions', label: 'Comp', fmt: 'int' },
  { key: 'passing_yards', label: 'Pass Yds', fmt: 'int' },
  { key: 'passing_tds', label: 'Pass TD', fmt: 'int' },
  { key: 'interceptions', label: 'INT', fmt: 'int' },
  { key: 'rush_attempts', label: 'Rush Att', fmt: 'int' },
  { key: 'rushing_yards', label: 'Rush Yds', fmt: 'int' },
  { key: 'ypc', label: 'YPC', fmt: 'dec1' },
  { key: 'rushing_tds', label: 'Rush TD', fmt: 'int' },
]

export const SKILL_COLS = [
  { key: 'rush_attempts', label: 'Rush Att', fmt: 'int' },
  { key: 'rushing_yards', label: 'Rush Yds', fmt: 'int' },
  { key: 'ypc', label: 'YPC', fmt: 'dec1' },
  { key: 'rushing_tds', label: 'Rush TD', fmt: 'int' },
  { key: 'targets', label: 'Tgt', fmt: 'int' },
  { key: 'receptions', label: 'Rec', fmt: 'int' },
  { key: 'receiving_yards', label: 'Rec Yds', fmt: 'int' },
  { key: 'receiving_tds', label: 'Rec TD', fmt: 'int' },
  { key: 'kick_returns', label: 'KR', fmt: 'int' },
  { key: 'kick_return_yards', label: 'KR Yds', fmt: 'int' },
  { key: 'punt_returns', label: 'PR', fmt: 'int' },
  { key: 'punt_return_yards', label: 'PR Yds', fmt: 'int' },
  { key: 'ret_tds', label: 'Ret TD', fmt: 'int' },
]

export const K_COLS = [
  { key: 'xp_att', label: 'XPA', fmt: 'int' },
  { key: 'xp_made', label: 'XPM', fmt: 'int' },
  { key: 'fg_att', label: 'FGA', fmt: 'int' },
  { key: 'fg_made', label: 'FGM', fmt: 'int' },
]

export function statColsFor(position) {
  if (position === 'QB') return QB_COLS
  if (position === 'K') return K_COLS
  return SKILL_COLS
}

export function formatCell(value, fmt) {
  if (fmt === 'text') return value
  const n = Number(value || 0)
  if (fmt === 'dec2') return n.toFixed(2)
  if (fmt === 'dec1') return n.toFixed(1)
  return n.toLocaleString()
}

function withRetTds(rows) {
  return rows.map((r) => ({
    ...r,
    ret_tds: Number(r.kick_return_tds || 0) + Number(r.punt_return_tds || 0),
  }))
}

async function fetchAllPages(buildQuery) {
  const pageSize = 1000
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

export async function fetchSeasonStats(position, season) {
  const positions = position === 'FLEX' ? FLEX_POSITIONS : [position]
  const rows = await fetchAllPages(() => {
    let query = supabase
      .from('edfl_player_season_stats')
      .select('*')
      .in('position', positions)
    if (season !== 'All' && season !== 'Total') query = query.eq('season_year', season)
    return query
  })
  return withRetTds(rows)
}

export async function fetchPlayerStats(playerId) {
  const rows = await fetchAllPages(() =>
    supabase.from('edfl_player_season_stats').select('*').eq('player_id', playerId)
  )
  rows.sort((a, b) => Number(a.season_year) - Number(b.season_year))
  return withRetTds(rows)
}

const SUM_FIELDS = [
  'games', 'fantasy_points',
  'pass_attempts', 'completions', 'passing_yards', 'passing_tds', 'interceptions',
  'rush_attempts', 'rushing_yards', 'rushing_tds',
  'targets', 'receptions', 'receiving_yards', 'receiving_tds',
  'kick_returns', 'kick_return_yards', 'kick_return_tds',
  'punt_returns', 'punt_return_yards', 'punt_return_tds',
  'xp_att', 'xp_made', 'fg_att', 'fg_made',
]

function round2(n) {
  return Math.round(n * 100) / 100
}

function round1(n) {
  return Math.round(n * 10) / 10
}

// Collapse several season rows for one player into a single totals row.
// FPPG and YPC are recomputed from the summed totals, not averaged.
export function aggregateSeasons(rows, seasonLabel) {
  const total = { ...rows[0] }
  for (const f of SUM_FIELDS) {
    let sum = 0
    for (const r of rows) sum += Number(r[f] || 0)
    total[f] = sum
  }
  total.fantasy_points = round2(total.fantasy_points)
  total.fppg = total.games > 0 ? round2(total.fantasy_points / total.games) : 0
  total.ypc = total.rush_attempts > 0 ? round1(total.rushing_yards / total.rush_attempts) : 0
  total.ret_tds = Number(total.kick_return_tds || 0) + Number(total.punt_return_tds || 0)
  total.season_year = seasonLabel
  return total
}

// Group per-season rows by player and return one career-total row each.
export function aggregateByPlayer(rows, seasonLabel) {
  const byPlayer = new Map()
  for (const r of rows) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
    byPlayer.get(r.player_id).push(r)
  }
  const totals = []
  for (const group of byPlayer.values()) {
    totals.push(aggregateSeasons(group, seasonLabel))
  }
  return totals
}

// Export the given rows/columns to a downloaded .xlsx file.
// xlsx is dynamically imported so it only loads when actually exporting.
export async function exportRowsToExcel(filename, columns, rows) {
  const XLSX = await import('xlsx')
  const header = columns.map((c) => c.label)
  const data = rows.map((row) =>
    columns.map((c) => {
      if (c.key === 'player') return row.full_name
      if (c.fmt === 'text') return row[c.key]
      return Number(row[c.key] || 0)
    })
  )
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'EDFL Stats')
  XLSX.writeFile(workbook, filename)
}
