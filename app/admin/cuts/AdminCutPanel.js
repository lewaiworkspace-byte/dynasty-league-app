'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import CutPlayerDialog from '../../team/[teamId]/CutPlayerDialog';
import RosterMoveDialog from '../../team/[teamId]/RosterMoveDialog';

// CUT FROM ANY ROSTER. This is the Admin-section home of a power that used to
// live on /team/[teamId], where canCut read "own team OR commissioner".
//
// It moved because a League surface treats the commissioner as an ordinary
// owner (standing rule, September 4 2026): an owner cuts their own players on
// their own team page, and cutting somebody else's is an administrative act
// that belongs here. The team page keeps its own-roster Cut control; this is
// the duplicate, and the duplication is the point.
//
// THE DIALOG IS THE SAME COMPONENT THE TEAM PAGE USES, imported rather than
// copied. Its own imports resolve relative to itself, so previewCut and
// executeCut still come from app/team/[teamId]/actions.js wherever it is
// mounted. Two cut dialogs would be two settlement summaries to keep in step,
// and the whole point of compute_cut_charges being the single implementation
// is that there is one place a figure comes from.
//
// NOTHING HERE DECIDES WHETHER A CUT IS LEGAL. cut_player() owns the cuts-open
// gate, the League Reset freeze, ownership and the June 1st allowance, and
// compute_cut_charges() owns every figure in the dialog. This panel picks a
// contract and opens the dialog on it.

export default function AdminCutPanel({ players, seasonYear }) {
  const router = useRouter();

  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [cutTarget, setCutTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  const teams = [];
  const seen = {};
  (players || []).forEach(function (p) {
    if (!seen[p.teamId]) {
      seen[p.teamId] = true;
      teams.push({ id: p.teamId, name: p.teamName });
    }
  });

  const needle = search.trim().toLowerCase();
  const visible = (players || []).filter(function (p) {
    if (teamFilter && p.teamId !== teamFilter) return false;
    if (needle && p.name.toLowerCase().indexOf(needle) === -1) return false;
    return true;
  });

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Cut or move a player</h2>
      <p className="empty-note">
        Any player on any roster. An owner cuts and moves their own players from their team page;
        this is the commissioner&apos;s equivalent, mounting the same two dialogs, so every figure
        and every refusal is identical to what the owner would see.
      </p>

      <div className="page-actions">
        <label>
          Team
          <select value={teamFilter} onChange={function (e) { setTeamFilter(e.target.value); }}>
            <option value="">All teams</option>
            {teams.map(function (t) {
              return <option key={t.id} value={t.id}>{t.name}</option>;
            })}
          </select>
        </label>
        <label>
          Search
          <input
            type="text"
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            placeholder="Player name"
          />
        </label>
      </div>

      <p className="empty-note">
        {visible.length} active contract(s) shown for {seasonYear}.
      </p>

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Type</th>
              <th>Contract</th>
              <th>Squad</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(function (p) {
              return (
                <tr key={p.id}>
                  <td className="team-name" data-label="Player">
                    <PlayerLink playerId={p.playerId}>{p.name}</PlayerLink>
                    {p.position ? <span className="empty-note"> {p.position}</span> : null}
                  </td>
                  <td data-label="Team">{p.teamName}</td>
                  <td data-label="Type">{p.typeLabel}</td>
                  <td data-label="Contract">{p.span}</td>
                  <td data-label="Squad">
                    {/*
                      Same idiom as the team page: shown only when it is not
                      'active', because a column of "Active" on every row is
                      noise.
                    */}
                    {p.rosterStatus === 'taxi' ? 'Practice squad' : null}
                    {p.rosterStatus === 'ir' ? 'Injured reserve' : null}
                    {p.rosterStatus !== 'taxi' && p.rosterStatus !== 'ir' ? (
                      <span className="empty-note">—</span>
                    ) : null}
                  </td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={function () { setMoveTarget(p); }}
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-danger"
                      onClick={function () { setCutTarget(p); }}
                    >
                      Cut
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <p className="empty-note">No active contracts match that filter.</p>
      )}

      {cutTarget && (
        <CutPlayerDialog
          player={cutTarget}
          onClose={function () { setCutTarget(null); }}
          onDone={function () {
            setCutTarget(null);
            // The ledger below this panel gains a row, so the whole page
            // refreshes rather than just the list.
            router.refresh();
          }}
        />
      )}

      {moveTarget && (
        <RosterMoveDialog
          player={moveTarget}
          onClose={function () { setMoveTarget(null); }}
          onDone={function () {
            setMoveTarget(null);
            // Refreshes so the Squad column reflects the move. A roster move
            // writes no cut-history row, so nothing below changes -- but the
            // row that was just moved is in the table above.
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
