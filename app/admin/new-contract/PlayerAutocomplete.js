'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

/**
 * Type-ahead player search, backed by the local `players` table
 * (populated by the Sleeper player-pool sync — not a live Sleeper call).
 *
 * Usage in a parent form:
 *   <PlayerAutocomplete
 *     initialPlayer={editingPlayer /* or null for a new contract *\/}
 *     onSelect={(player) => {
 *       // player is the full row: { id, full_name, position, nfl_team, sleeper_player_id, status }
 *       // or null if the field was cleared / is mid-edit with no confirmed match
 *     }}
 *   />
 *
 * The parent owns `player_id` and `nfl_team` in its own state via onSelect —
 * this component never writes to the database itself.
 */
export default function PlayerAutocomplete({ onSelect, initialPlayer = null, disabled = false }) {
  const [query, setQuery] = useState(initialPlayer?.full_name || '');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = useCallback(async (text) => {
    if (!text || text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, full_name, position, nfl_team, sleeper_player_id, status')
      .ilike('full_name', `%${text.trim()}%`)
      .order('full_name', { ascending: true })
      .limit(10);
    setLoading(false);
    if (error) {
      console.error('Player search failed:', error);
      setResults([]);
      return;
    }
    setResults(data || []);
  }, []);

  function handleChange(e) {
    const text = e.target.value;
    setQuery(text);
    setIsOpen(true);
    setHighlightedIndex(-1);

    // Editing away from a confirmed selection clears it — the parent's
    // nfl_team field should blank out too until a new match is picked.
    if (selectedPlayer && text !== selectedPlayer.full_name) {
      setSelectedPlayer(null);
      onSelect(null);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 250);
  }

  function pickPlayer(player) {
    setSelectedPlayer(player);
    setQuery(player.full_name);
    setResults([]);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelect(player);
  }

  function handleKeyDown(e) {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0) pickPlayer(results[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div className="player-autocomplete" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
        placeholder="Start typing a player name..."
        autoComplete="off"
        disabled={disabled}
        className="player-autocomplete-input"
      />

      {isOpen && (loading || results.length > 0 || query.trim().length >= 2) && (
        <ul className="player-autocomplete-results">
          {loading && <li className="player-autocomplete-loading">Searching…</li>}
          {!loading &&
            results.map((player, i) => (
              <li
                key={player.id}
                className={
                  'player-autocomplete-item' +
                  (i === highlightedIndex ? ' player-autocomplete-item-active' : '')
                }
                onMouseDown={() => pickPlayer(player)}
                onMouseEnter={() => setHighlightedIndex(i)}
              >
                <span className="player-autocomplete-name">{player.full_name}</span>
                <span className="player-autocomplete-meta">
                  {player.position || '—'} · {player.nfl_team || 'FA'}
                </span>
              </li>
            ))}
          {!loading && results.length === 0 && (
            <li className="player-autocomplete-empty">No matching players found</li>
          )}
        </ul>
      )}

      <style jsx>{`
        .player-autocomplete {
          position: relative;
        }
        .player-autocomplete-input {
          width: 100%;
          background: var(--bg-elevated, #1b1e24);
          border: 1px solid var(--border, #2a2d33);
          color: var(--text, #e8e6e1);
          padding: 0.5rem 0.65rem;
          border-radius: 4px;
          font-size: 0.95rem;
        }
        .player-autocomplete-input:focus {
          outline: none;
          border-color: var(--accent-gold, #c9a227);
        }
        .player-autocomplete-results {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 20;
          background: var(--bg-elevated, #1b1e24);
          border: 1px solid var(--border, #2a2d33);
          border-radius: 4px;
          max-height: 260px;
          overflow-y: auto;
          list-style: none;
          margin: 0;
          padding: 4px 0;
        }
        .player-autocomplete-item {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.4rem 0.65rem;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .player-autocomplete-item-active,
        .player-autocomplete-item:hover {
          background: rgba(201, 162, 39, 0.12);
        }
        .player-autocomplete-name {
          color: var(--text, #e8e6e1);
        }
        .player-autocomplete-meta {
          color: var(--text-dim, #9a9da3);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 0.8rem;
          white-space: nowrap;
        }
        .player-autocomplete-loading,
        .player-autocomplete-empty {
          padding: 0.5rem 0.65rem;
          color: var(--text-dim, #9a9da3);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
