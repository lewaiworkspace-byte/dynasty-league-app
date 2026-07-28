'use client';

// Expected location: app/admin/new-tier/TierBuilder.js

import { useState, useTransition } from 'react';
import { createTier } from './actions';
import { supabase } from '../../../lib/supabaseClient';
import PlayerAutocomplete from '../new-contract/PlayerAutocomplete';

export default function TierBuilder() {
  const [seasonYear, setSeasonYear] = useState(2026);
  const [tierNumber, setTierNumber] = useState(1);
  const [name, setName] = useState('');
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [players, setPlayers] = useState([]); // { player, rosteredTo: string|null, checking: bool }
  const [pickerKey, setPickerKey] = useState(0); // remounts the autocomplete to clear it after each add
  const [error, setError] = useState(null);
  const [createdTierId, setCreatedTierId] = useState(null);
  const [isPending, startTransition] = useTransition();

  async function handlePlayerSelect(player) {
    if (!player) return; // ignore clears mid-typing; only confirmed picks matter here
    if (players.some((p) => p.player.id === player.id)) {
      setPickerKey((k) => k + 1);
      return; // already in the list
    }

    // Add immediately, then check roster status in the background
    setPlayers((prev) => [...prev, { player, rosteredTo: null, checking: true }]);
    setPickerKey((k) => k + 1);

    const { data: activeContracts } = await supabase
      .from('contracts')
      .select('id, teams(name)')
      .eq('player_id', player.id)
      .eq('status', 'active');

    const rosteredTo =
      activeContracts && activeContracts.length > 0
        ? activeContracts[0].teams?.name || 'an EDFL team'
        : null;

    setPlayers((prev) =>
      prev.map((p) => (p.player.id === player.id ? { ...p, rosteredTo, checking: false } : p))
    );
  }

  function removePlayer(playerId) {
    setPlayers((prev) => prev.filter((p) => p.player.id !== playerId));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await createTier({
          seasonYear,
          tierNumber,
          name,
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          playerIds: players.map((p) => p.player.id),
        });
        setCreatedTierId(result.tierId);
      } catch (err) {
        setError(err.message);
      }
    });
  }

  if (createdTierId) {
    return (
      <div className="assistant-box">
        <p className="empty-note" style={{ color: 'var(--accent-gold)', margin: 0 }}>
          ✓ Tier created with {players.length} player{players.length === 1 ? '' : 's'}.{' '}
          <a href="/bids">View the Blind Bid page</a> (it shows this tier once its open time
          arrives).
        </p>
      </div>
    );
  }

  const rosteredCount = players.filter((p) => p.rosteredTo).length;

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      <div className="form-row">
        <label>
          Season Year
          <input
            type="number"
            value={seasonYear}
            onChange={(e) => setSeasonYear(e.target.value)}
            required
          />
        </label>
        <label>
          Tier Number
          <input
            type="number"
            min="1"
            value={tierNumber}
            onChange={(e) => setTierNumber(e.target.value)}
            required
          />
        </label>
        <label>
          Tier Name (optional)
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tier 1 — Top Free Agents"
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Opens At
          <input
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            required
          />
        </label>
        <label>
          Closes At
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            required
          />
        </label>
      </div>

      <h2 className="section-heading">Players in This Tier</h2>
      <p className="subhead" style={{ marginBottom: 8 }}>
        Search the synced Sleeper pool and add each player. A warning appears if a player is
        already on an EDFL roster — they can still be added, but that usually means they
        shouldn&apos;t be up for auction.
      </p>

      <div style={{ maxWidth: 420, marginBottom: 16 }}>
        <PlayerAutocomplete key={pickerKey} onSelect={handlePlayerSelect} />
      </div>

      {players.length > 0 && (
        <table className="ledger" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>NFL Team</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map(({ player, rosteredTo, checking }) => (
              <tr key={player.id}>
                <td className="team-name">{player.full_name}</td>
                <td>{player.position || '—'}</td>
                <td>{player.nfl_team || 'FA'}</td>
                <td>
                  {checking && <span className="empty-note">checking roster…</span>}
                  {!checking && rosteredTo && (
                    <span className="form-error" style={{ padding: '2px 8px' }}>
                      ⚠ Already rostered — {rosteredTo}
                    </span>
                  )}
                  {!checking && !rosteredTo && (
                    <span className="empty-note" style={{ color: 'var(--accent-gold)' }}>
                      Free agent
                    </span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="btn" onClick={() => removePlayer(player.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rosteredCount > 0 && (
        <p className="form-error" style={{ marginBottom: 16 }}>
          ⚠ {rosteredCount} player{rosteredCount === 1 ? ' is' : 's are'} already on an EDFL
          roster. You can still create the tier, but double-check that&apos;s intended.
        </p>
      )}

      <button type="submit" className="btn" disabled={isPending || players.length === 0}>
        {isPending ? 'Creating…' : `Create Tier (${players.length} player${players.length === 1 ? '' : 's'})`}
      </button>
    </form>
  );
}
