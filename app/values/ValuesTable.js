'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../components/PlayerLink';
import { formatCell, exportRowsToExcel } from '../../lib/statsHelpers';
import { formatDate } from '../../lib/formatDate';

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K'];
const PAGE_SIZE = 50;

const COLUMNS = [
  { key: 'rank', label: 'Rank', fmt: 'int' },
  { key: 'player', label: 'Player', fmt: 'text' },
  { key: 'nfl_team', label: 'NFL Team', fmt: 'text' },
  { key: 'per_year_value', label: 'Per-Year Value', fmt: 'dec2' },
  { key: 'likely_years', label: 'Likely Deal (Yrs)', fmt: 'int' },
  { key: 'total_ppv', label: 'Total PPV', fmt: 'dec2' },
  { key: 'tier', label: 'Tier', fmt: 'text' },
  { key: 'movement', label: 'Movement', fmt: 'text' },
  { key: 'notes', label: 'Notes', fmt: 'text' },
];

// Turns the raw player_value_history rows (server-fetched, already scoped
// to one snapshot_id) into the flat shape this component sorts, filters,
// renders and exports.
//
// chart_position is the player's fantasy POSITION (QB/RB/WR/TE/K), not a
// numeric rank -- this is the field the position tabs filter on, and it's
// the only place that information exists for the two "absent" rows (Luke
// Hasz, Holden Staes), since they have no player_id to join against the
// players table. chart_rank is the numeric rank within that position.
function buildRows(historyRows) {
  return (historyRows || []).map((r) => {
    const delta = r.total_ppv_delta;
    const hasDelta = delta !== null && delta !== undefined;
    let movement = '';
    if (r.is_new_this_snapshot) {
      movement = 'new';
    } else if (hasDelta) {
      const n = Number(delta);
      movement = (n > 0 ? '+' : '') + n;
    }
    return {
      position: r.chart_position,
      rank: r.chart_rank,
      player: r.chart_name,
      full_name: r.chart_name,
      player_id: r.player_id,
      nfl_team: r.chart_nfl_team,
      per_year_value: r.per_year_value,
      likely_years: r.likely_years,
      total_ppv: r.total_ppv,
      tier: r.value_tier,
      notes: r.notes || '',
      movement: movement,
      movementSort: hasDelta ? Number(delta) : 0,
      matchStatus: r.match_status,
    };
  });
}

function compareRows(a, b, key) {
  if (key === 'player') {
    return (a.full_name || '').localeCompare(b.full_name || '');
  }
  if (key === 'nfl_team' || key === 'tier' || key === 'notes' || key === 'position') {
    return (a[key] || '').localeCompare(b[key] || '');
  }
  if (key === 'movement') {
    return a.movementSort - b.movementSort;
  }
  return Number(a[key] || 0) - Number(b[key] || 0);
}

export default function ValuesTable({ snapshots, selectedSnapshot, historyRows, removalRows, removalsError }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const rows = useMemo(() => buildRows(historyRows), [historyRows]);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (activeTab !== 'All') {
      out = out.filter((r) => r.position === activeTab);
    }
    const term = search.trim().toLowerCase();
    if (term) {
      out = out.filter((r) => (r.full_name || '').toLowerCase().indexOf(term) !== -1);
    }
    return out;
  }, [rows, activeTab, search]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const copy = filteredRows.slice();
    copy.sort((a, b) => {
      const result = compareRows(a, b, sortKey);
      return sortDir === 'asc' ? result : -result;
    });
    return copy;
  }, [filteredRows, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      const ascByDefault = key === 'player' || key === 'nfl_team' || key === 'tier' || key === 'notes' || key === 'rank';
      setSortDir(ascByDefault ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function handleSnapshotChange(e) {
    const id = e.target.value;
    router.push('/values?snapshot=' + id);
  }

  function handleExport() {
    const name = 'edfl-values-' + activeTab + '.xlsx';
    exportRowsToExcel(name, COLUMNS, sortedRows);
  }

  const activeStyle = {
    background: 'var(--accent-gold)',
    color: '#14161a',
  };

  const isStale = Number(selectedSnapshot.recency_rank) !== 1;

  return (
    <>
      <div className="assistant-box">
        <p style={{ margin: 0 }}>
          <strong>{selectedSnapshot.label}</strong>
          {' · as of ' + formatDate(selectedSnapshot.as_of_date)}
          {selectedSnapshot.published_at ? ' · published ' + formatDate(selectedSnapshot.published_at) : ''}
        </p>
        {selectedSnapshot.source_note && (
          <p className="empty-note" style={{ marginTop: 8 }}>{selectedSnapshot.source_note}</p>
        )}
        {isStale && (
          <p className="empty-note" style={{ color: 'var(--accent-rust)', marginTop: 8 }}>
            You are viewing an older chart, not the most recently published one. Pick the latest
            snapshot below to see current values.
          </p>
        )}

        <div className="admin-form" style={{ marginTop: 16 }}>
          <label>
            Snapshot
            <select value={selectedSnapshot.id} onChange={handleSnapshotChange}>
              {snapshots.map((s) => {
                const isLatest = Number(s.recency_rank) === 1;
                const optionLabel = s.label + ' (' + formatDate(s.as_of_date) + ')' + (isLatest ? ' — latest' : '');
                return (
                  <option key={s.id} value={s.id}>
                    {optionLabel}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '12px 0' }}>
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            className="btn"
            style={p === activeTab ? activeStyle : undefined}
            onClick={() => setActiveTab(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="admin-form" style={{ margin: '12px 0' }}>
        <label>
          Search Player
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a player name"
          />
        </label>
      </div>

      {sortedRows.length === 0 ? (
        <p className="empty-note">No players match this filter.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '12px 0' }}>
            <button type="button" className="btn" onClick={handleExport}>
              Export to Excel
            </button>
            <span className="empty-note" style={{ margin: 0 }}>
              {sortedRows.length + ' player' + (sortedRows.length === 1 ? '' : 's')}
            </span>
          </div>

          <table className="ledger year-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
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
              {pagedRows.map((row, i) => (
                <tr key={(row.player_id || row.full_name) + '-' + i}>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={col.fmt === 'text' ? undefined : 'num'}>
                      {col.key === 'player' ? (
                        <PlayerLink playerId={row.player_id}>{row.full_name}</PlayerLink>
                      ) : (
                        formatCell(row[col.key], col.fmt)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
              <button
                type="button"
                className="btn"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                Prev
              </button>
              <span className="empty-note" style={{ margin: 0 }}>
                {'Page ' + safePage + ' of ' + pageCount}
              </span>
              <button
                type="button"
                className="btn"
                disabled={safePage >= pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {removalsError && (
        <p className="form-error" style={{ marginTop: 24 }}>
          Couldn&apos;t load removed players: {removalsError}
        </p>
      )}

      {removalRows.length > 0 && (
        <details className="assistant-box" style={{ marginTop: 32 }}>
          <summary className="section-heading" style={{ margin: 0, cursor: 'pointer' }}>
            {'Removed Since Last Chart (' + removalRows.length + ')'}
          </summary>
          <table className="ledger year-table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Position</th>
                <th>NFL Team</th>
                <th style={{ textAlign: 'right' }}>Last Total PPV</th>
              </tr>
            </thead>
            <tbody>
              {removalRows.map((r, i) => (
                <tr key={i}>
                  <td className="team-name">{r.chart_name}</td>
                  <td>{r.chart_position}</td>
                  <td>{r.chart_nfl_team}</td>
                  <td className="num">{formatCell(r.last_total_ppv, 'dec2')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <p className="empty-note" style={{ marginTop: 32 }}>
        Total PPV is per-year value times a length multiplier (1 yr 1.0, 2 yr 1.9, 3 yr 2.7, 4 yr
        3.4, 5 yr 4.0). Minimum contract is 9 dollars per year; unlisted players are 9 dollars
        times years offered.
      </p>
    </>
  );
}
