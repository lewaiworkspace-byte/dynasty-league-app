'use client';

import { useState, useMemo } from 'react';
import { deleteContract } from './actions';
import { formatMoney } from '../../../lib/formatMoney';

export default function FixContractsTable({ rows, teams }) {
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState(null); // contract awaiting a reason
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!teamFilter || r.teamName === teamFilter) &&
        (!q || r.playerName.toLowerCase().includes(q))
    );
  }, [rows, teamFilter, search]);

  async function confirmDelete(row) {
    setError(null);
    setBusy(true);
    try {
      await deleteContract(row.id, reason);
      setDone('Deleted ' + row.playerName + "'s contract with " + row.teamName + '.');
      setPendingId(null);
      setReason('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <p className="page-actions">
        <a href="/">← Home</a> · <a href="/actions">Action Log</a>
      </p>
      <p className="eyebrow">Commissioner</p>
      <h1 className="team-name">Fix Contracts</h1>

      <div className="assistant-box" style={{ borderColor: 'var(--accent-rust)' }}>
        <p style={{ marginTop: 0 }}>
          <strong>This permanently deletes a contract and all of its years.</strong> It&apos;s for
          correcting mistakes — a contract entered wrong, or leftover test data. It is{' '}
          <em>not</em> how you cut a player: a real cut produces dead cap and keeps the contract on
          record. Cut a player from that team&apos;s page instead.
        </p>
        <p className="empty-note" style={{ marginBottom: 0 }}>
          Every deletion is recorded in the{' '}
          <a href="/actions">public action log</a> along with your reason and a full snapshot of
          what was removed. Owners can read it.
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}
      {done && (
        <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>
          ✓ {done} <a href="/actions">View in the log →</a>
        </p>
      )}

      <div className="form-row">
        <label>
          Team
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          Player
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <p className="empty-note">
        {filtered.length} of {rows.length} contract{rows.length === 1 ? '' : 's'}
      </p>

      {filtered.length === 0 ? (
        <p className="empty-note">No contracts match.</p>
      ) : (
        <table className="ledger year-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Type</th>
              <th>Status</th>
              <th>Contract</th>
              <th style={{ textAlign: 'right' }}>Signing Bonus</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="team-name">
                  {r.playerName} <span className="empty-note">{r.position}</span>
                </td>
                <td>{r.teamName}</td>
                <td className="empty-note">{r.contractType?.replace(/_/g, ' ')}</td>
                <td className="empty-note">{r.status}</td>
                <td className="num">
                  {r.startYear}–{r.startYear + r.totalYears - 1}
                  {r.voidYears > 0 ? ' +' + r.voidYears + 'v' : ''}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>{formatMoney(r.signingBonusTotal)}</td>
                <td>
                  {pendingId === r.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Reason (required, public)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={{ minWidth: 220 }}
                      />
                      <button
                        className="btn"
                        disabled={busy || !reason.trim()}
                        onClick={() => confirmDelete(r)}
                      >
                        {busy ? 'Deleting…' : 'Confirm Delete'}
                      </button>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                          setPendingId(null);
                          setReason('');
                          setError(null);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => {
                        setPendingId(r.id);
                        setReason('');
                        setError(null);
                        setDone(null);
                      }}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
