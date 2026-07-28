'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  COMMON_COLS,
  statColsFor,
  formatCell,
  fetchSeasonStats,
  aggregateByPlayer,
  exportRowsToExcel,
} from '../../lib/statsHelpers'

const SEASONS = ['All', 'Total', 2025, 2024, 2023, 2022, 2021]
const POSITION_FILTERS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K']

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
        if (cancelled) return
        setRows(season === 'Total' ? aggregateByPlayer(data, '2021-25') : data)
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

  function handleExport() {
    const name = 'edfl-stats-' + position + '-' + season + '.xlsx'
    exportRowsToExcel(name, columns, sortedRows)
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
        scoring settings. Click any column header to sort, or a player
        name for their full history. Total combines all five seasons.
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
        <>
          <div style={{ margin: '12px 0' }}>
            <button type="button" className="btn" onClick={handleExport}>
              Export to Excel
            </button>
          </div>
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
                      {col.key === 'player' ? (
                        <Link href={'/stats/player/' + row.player_id}>
                          {row.full_name}
                        </Link>
                      ) : (
                        formatCell(row[col.key], col.fmt)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
