'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabaseClient'
import {
  COMMON_COLS,
  statColsFor,
  formatCell,
  fetchPlayerStats,
  aggregateSeasons,
  exportRowsToExcel,
} from '../../../../lib/statsHelpers'

export default function PlayerStatsPage({ params }) {
  const playerId = params.playerId
  const [player, setPlayer] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    Promise.all([
      supabase.from('players').select('full_name, position').eq('id', playerId).single(),
      fetchPlayerStats(playerId),
    ])
      .then(([playerRes, statRows]) => {
        if (cancelled) return
        if (playerRes.error) throw playerRes.error
        setPlayer(playerRes.data)
        setRows(statRows)
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
  }, [playerId])

  const totalsRow = useMemo(
    () => (rows.length > 0 ? aggregateSeasons(rows, 'Total') : null),
    [rows]
  )

  const position = player ? player.position : 'QB'
  const columns = [
    ...COMMON_COLS.filter((c) => c.key !== 'player' && c.key !== 'position'),
    ...statColsFor(position),
  ]

  function handleExport() {
    const slug = player ? player.full_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'player'
    const exportRows = totalsRow ? [...rows, totalsRow] : rows
    exportRowsToExcel('edfl-stats-' + slug + '.xlsx', columns, exportRows)
  }

  return (
    <main className="page">
      <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
        <Link href="/stats" className="btn">
          Back to Stats
        </Link>
        <a
          href={'/player/' + playerId}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
        >
          Open Player Card
        </a>
        <Link href="/" className="btn">
          Return to Home
        </Link>
      </div>

      {loadError && <div className="form-error">Failed to load: {loadError}</div>}

      {loading ? (
        <p className="empty-note">Loading…</p>
      ) : (
        <>
          <h1>{player ? player.full_name : 'Player'}</h1>
          <p className="empty-note">
            {position} — 2021-2025 regular season stats under EDFL scoring
          </p>

          {rows.length === 0 ? (
            <p className="empty-note">No stat data recorded for this player.</p>
          ) : (
            <>
              <div style={{ margin: '12px 0' }}>
                <button type="button" className="btn" onClick={handleExport}>
                  Export to Excel
                </button>
              </div>
              <table className="ledger year-table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} style={{ whiteSpace: 'nowrap' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.season_year)}>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={col.fmt === 'text' ? undefined : 'num'}
                        >
                          {formatCell(row[col.key], col.fmt)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {totalsRow && (
                    <tr key="totals" style={{ fontWeight: 'bold' }}>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={col.fmt === 'text' ? undefined : 'num'}
                        >
                          {formatCell(totalsRow[col.key], col.fmt)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </main>
  )
}
