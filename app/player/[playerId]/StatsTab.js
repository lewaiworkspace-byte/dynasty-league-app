'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COMMON_COLS,
  statColsFor,
  formatCell,
  fetchPlayerStats,
  aggregateSeasons,
  exportRowsToExcel,
} from '../../../lib/statsHelpers';

// Statistics: the same season table /stats/player/[playerId] renders,
// embedded as a card tab. It deliberately reuses lib/statsHelpers
// wholesale -- columns, formatting, aggregation and the Excel export are
// single-implementation there and must not fork here.
//
// Fetched client-side on first visit to the tab, not server-side with the
// rest of the card: player_game_stats holds 33,555 rows and most card
// opens never reach this tab, so the card stays fast by not paying for
// stats it may never show. fetchPlayerStats filters by player and pages
// until exhausted, so the 1,000-row ceiling cannot truncate it.

export default function StatsTab({ playerId, position }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(
    function () {
      let cancelled = false;
      setLoadError(null);
      fetchPlayerStats(playerId)
        .then(function (statRows) {
          if (!cancelled) setRows(statRows);
        })
        .catch(function (err) {
          if (!cancelled) setLoadError(err.message);
        });
      return function () {
        cancelled = true;
      };
    },
    [playerId]
  );

  const totalsRow = useMemo(
    function () {
      return rows && rows.length > 0 ? aggregateSeasons(rows, 'Total') : null;
    },
    [rows]
  );

  const columns = useMemo(
    function () {
      return [
        ...COMMON_COLS.filter(function (c) {
          return c.key !== 'player' && c.key !== 'position';
        }),
        ...statColsFor(position || 'QB'),
      ];
    },
    [position]
  );

  function handleExport() {
    const exportRows = totalsRow ? [...rows, totalsRow] : rows;
    exportRowsToExcel('edfl-stats-player.xlsx', columns, exportRows);
  }

  if (loadError) {
    return <div className="form-error">Failed to load stats: {loadError}</div>;
  }
  if (rows === null) {
    return <p className="empty-note">Loading stats…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="empty-note">
        No stat data recorded for this player (2021–2025 regular seasons,
        EDFL scoring).
      </p>
    );
  }

  return (
    <>
      <p className="pc-note" style={{ marginBottom: 12 }}>
        2021–2025 regular season stats under EDFL scoring.
      </p>
      <div style={{ margin: '0 0 12px' }}>
        <button type="button" className="btn" onClick={handleExport}>
          Export to Excel
        </button>
      </div>
      <div className="table-scroll">
        <table className="ledger year-table">
          <thead>
            <tr>
              {columns.map(function (col) {
                return (
                  <th key={col.key} style={{ whiteSpace: 'nowrap' }}>
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(function (row) {
              return (
                <tr key={String(row.season_year)}>
                  {columns.map(function (col) {
                    return (
                      <td
                        key={col.key}
                        className={col.fmt === 'text' ? undefined : 'num'}
                      >
                        {formatCell(row[col.key], col.fmt)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {totalsRow && (
              <tr key="totals" style={{ fontWeight: 'bold' }}>
                {columns.map(function (col) {
                  return (
                    <td
                      key={col.key}
                      className={col.fmt === 'text' ? undefined : 'num'}
                    >
                      {formatCell(totalsRow[col.key], col.fmt)}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
