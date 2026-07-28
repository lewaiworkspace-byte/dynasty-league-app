'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const SEASONS = ['All', 2025, 2024, 2023, 2022, 2021]
const POSITION_FILTERS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K']
const FLEX_POSITIONS = ['RB', 'WR', 'TE']

const COMMON_COLS = [
  { key: 'player', label: 'Player', fmt: 'text' },
  { key: 'position', label: 'Pos', fmt: 'text' },
  { key: 'season_year', label: 'Season', fmt: 'int' },
  { key: 'games', label: 'G', fmt: 'int' },
  { key: 'fantasy_points', label: 'FP', fmt: 'dec2' },
  { key: 'fppg', label: 'FPPG', fmt: 'dec2' },
]

const QB_COLS = [
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

const SKILL_COLS = [
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
  { key: 'kick_return_tds', label: 'KR TD', fmt: 'int' },
  { key: 'punt_returns', label: 'PR', fmt: 'int' },
  { key: 'punt_return_yards', label: 'PR Yds', fmt: 'int' },
  { key: 'punt_return_tds', label: 'PR TD', fmt: 'int' },
]

const K_COLS = [
  { key: 'xp_att', label: 'XPA', fmt: 'int' },
  { key: 'xp_made', label: 'XPM', fmt: 'int' },
  { key: 'fg_att', label: 'FGA', fmt: 'int' },
  { key: 'fg_made', label: 'FGM', fmt: 'int' },
]

function statColsFor(position) {
  if (position === 'QB') return QB_COLS
  if (position === 'K') return K_COLS
  return SKILL_COLS
}

function formatCell(value, fmt) {
  if (fmt === 'text') return value
  const n = Number(value || 0)
  if (fmt === 'dec2') return n.toFixed(2)
  if (fmt === 'dec1') return n.toFixed(1)
  return n.toLocaleString()
}

async function fetchSeasonStats(position, season) {
  const positions = position === 'FLEX' ? FLEX_POSITIONS : [position]
  const pageSize = 1000
  let from = 0
  let all = []
  for (;;) {
    let query = supabase
      .from('edfl_player_season_stats')
      .select('*')
      .in('position', positions)
      .range(from, from + pageSize - 1)
    if (season !== 'All') query = query.eq('season_year', season)
    const { data, error } = await query
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return all
}

export default function StatsPage() {
  const [position, setPosition] = useState('QB')
  const [season, setSeason] = useState('All')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [sortKey, setSortKey] = useState('fantasy_points')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchSeasonStats(position, season)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [position, season])

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let result
      if (sortKey === 'player') {
        result =
          (a.last_name || '').localeCompare(b.last_name || '') ||
          (a.full_name || '').localeCompare(b.full_name || '')
      } else if (sortKey === 'position') {
        result = (a.position || '').localeCompare(b.position || '')
      } else {
        result = Number(a[sortKey] || 0) - Number(b[sortKey] || 0)
      }
      return sortDir === 'asc' ? result : -result
    })
    return copy
  }, [rows, sortKey, sortDir])

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'player' || key === 'position' ? 'asc' : 'desc')
    }
  }

  const columns = [...COMMON_COLS, ...statColsFor(position)]

  const activeStyle = {
    background: 'var(--accent-gold)',
    color: '#14161a',
  }

  return (
    <div className="ledger">
      <h1>Historical Fantasy Scoring</h1>
      <p className="empty-note">
        Real NFL game data, 2021-2025 regular seasons, scored under EDFL
        scoring settings. Click any column header to sort. Name sorting
        uses last name.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
        {POSITION_FILTERS.map((p) => (
          <button
            key={p}
            type="button"
            className="btn"
            style={p === position ? activeStyle : undefined}
            onClick={() => setPosition(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
        {SEASONS.map((s) => (
          <button
            key={s}
            type="button"
            className="btn"
            style={s === season ? activeStyle : undefined}
            onClick={() => setSeason(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {loadError && <div className="form-error">Failed to load stats: {loadError}</div>}

      {loading ? (
        <p className="empty-note">Loading…</p>
      ) : sortedRows.length === 0 ? (
        <p className="empty-note">
          No stat data found for this filter. If nothing shows for any
          filter, the historical data import has not been run yet.
        </p>
      ) : (
        <table className="year-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.player_id + '-' + row.season_year}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={col.fmt === 'text' ? undefined : 'num'}
                  >
                    {col.key === 'player'
                      ? row.full_name
                      : formatCell(row[col.key], col.fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
