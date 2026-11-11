'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  COMMON_COLS,
  statColsFor,
  formatCell,
  fetchPlayerStats,
  aggregateSeasons,
  exportRowsToExcel,
} from '../../../lib/statsHelpers';

// Statistics: the same season table /stats/player/[playerId] renders,
// embedded in the card. It deliberately reuses lib/statsHelpers wholesale --
// columns, formatting, aggregation and the Excel export are
// single-implementation there and must not fork here.
//
// UI TEST BATCH 6 (November 2026): the card's Stats box. Three changes, all
// from Lewis's notes on the canvas:
//   * POS RK, right after FPPG (Lewis, November 9: "Can you add position rank
//     to the right of FPPG?"). His finish at his position by EDFL fantasy
//     points that season, from edfl_player_season_ranks() -- rank() among
//     every player at his position in edfl_player_season_stats, the season in
//     progress ranked to date. The Total row has none. It travels in the
//     Excel export too. A failed rank read leaves the column dashed and says
//     so; the stats themselves still show (they are the box's content, the
//     rank is one column of it).
//   * The season in progress is marked "in progress".
//   * Export to Excel sits in the box's header (the page passes the slot).
//   * On a phone the Season column stays put and the rest swipes
//     (.edfl-pc-stats in kit.css).
//
// Fetched client-side after the card renders, not with the page's reads:
// the season view aggregates every game row and the rank reads all of a
// position's seasons, so the card stays quick to open. fetchPlayerStats
// filters by player and pages until exhausted, so the 1,000-row ceiling
// cannot truncate it.

const RANK_COL = { key: 'pos_rank', label: 'Pos Rk', fmt: 'text' };

export default function StatsTab({ playerId, position, seasonInProgress, renderHeader }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [ranks, setRanks] = useState(null);
  const [rankError, setRankError] = useState(null);

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
      supabase
        .rpc('edfl_player_season_ranks', { p_player_id: playerId })
        .then(function (res) {
          if (cancelled) return;
          if (res.error) setRankError(res.error.message);
          else {
            const map = {};
            (res.data || []).forEach(function (r) {
              map[r.season_year] = r;
            });
            setRanks(map);
          }
        });
      return function () {
        cancelled = true;
      };
    },
    [playerId]
  );

  const rankedRows = useMemo(
    function () {
      if (!rows) return null;
      return rows.map(function (r) {
        const rk = ranks ? ranks[r.season_year] : null;
        return Object.assign({}, r, {
          pos_rank: rk && rk.pos_rank ? (rk.position || '') + rk.pos_rank : '—',
        });
      });
    },
    [rows, ranks]
  );

  const totalsRow = useMemo(
    function () {
      if (!rankedRows || rankedRows.length === 0) return null;
      return Object.assign(aggregateSeasons(rankedRows, 'Total'), { pos_rank: '—' });
    },
    [rankedRows]
  );

  const columns = useMemo(
    function () {
      const common = COMMON_COLS.filter(function (c) {
        return c.key !== 'player' && c.key !== 'position';
      });
      const out = [];
      common.forEach(function (c) {
        out.push(c);
        if (c.key === 'fppg') out.push(RANK_COL);
      });
      return out.concat(statColsFor(position || 'QB'));
    },
    [position]
  );

  function handleExport() {
    const exportRows = totalsRow ? [...rankedRows, totalsRow] : rankedRows;
    exportRowsToExcel('edfl-stats-player.xlsx', columns, exportRows);
  }

  const canExport = Boolean(rankedRows && rankedRows.length > 0);
  const header = renderHeader ? renderHeader(canExport ? handleExport : null) : null;

  let body;
  if (loadError) {
    body = <div className="form-error">Failed to load stats: {loadError}</div>;
  } else if (rankedRows === null) {
    body = <p className="edfl-pc-note">Loading stats…</p>;
  } else if (rankedRows.length === 0) {
    body = (
      <p className="edfl-pc-note">
        No stat data recorded for this player (regular seasons from 2021 through the season in
        progress, EDFL scoring).
      </p>
    );
  } else {
    body = (
      <>
        <p className="edfl-pc-note">
          NFL regular seasons under EDFL scoring, 2021 through the season in progress (refreshed
          every morning). Pos Rk = his finish at his position by EDFL points that season
          {seasonInProgress ? ' (the season in progress: so far)' : ''}.
        </p>
        {rankError ? (
          <p className="form-error">Position rank could not be loaded: {rankError}</p>
        ) : null}
        <div className="edfl-pc-stats">
          <table className="edfl-pc-stats-table">
            <thead>
              <tr>
                {columns.map(function (col) {
                  return (
                    <th key={col.key} scope="col">
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rankedRows.map(function (row) {
                const live = seasonInProgress && Number(row.season_year) === Number(seasonInProgress);
                return (
                  <tr key={String(row.season_year)} className={live ? 'is-now' : undefined}>
                    {columns.map(function (col) {
                      const cls =
                        col.key === 'fantasy_points' ? 'is-fp' : col.key === 'pos_rank' ? 'is-rank' : undefined;
                      return (
                        <td key={col.key} className={cls}>
                          {formatCell(row[col.key], col.fmt)}
                          {col.key === 'season_year' && live ? (
                            <span className="edfl-pc-live">in progress</span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {totalsRow ? (
                <tr key="totals" className="is-total">
                  {columns.map(function (col) {
                    return <td key={col.key}>{formatCell(totalsRow[col.key], col.fmt)}</td>;
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="edfl-pc-hint">On a phone the Season column stays put; swipe the table for the rest.</p>
      </>
    );
  }

  return (
    <>
      {header}
      {body}
    </>
  );
}
