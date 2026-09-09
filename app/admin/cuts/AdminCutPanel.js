'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import CutPlayerDialog from '../../team/[teamId]/CutPlayerDialog';
import RosterMoveDialog from '../../team/[teamId]/RosterMoveDialog';
import { formatDateTime } from '../../../lib/formatDate';

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
//
// TRANSACTION DATES, September 9 2026. Acquired and Last move come from
// league_active_roster_acquisitions. They are here because deciding who a team
// cuts to get compliant is a question about WHEN, and the table had no date on
// it at all -- an officer had to open each player's card one at a time to find
// out who had just arrived. The default sort is newest acquisition first for
// the same reason.
//
// THESE COLUMNS ARE INFORMATION, NOT A RULE. Nothing here ranks players by
// cuttability, flags a team as non-compliant, or suggests a candidate. Roster
// and cap compliance are gameplay and the commissioner's call (SR-32); this
// panel supplies the dates he asked for and stops there.

const ACQUIRED_VIA_LABELS = {
  trade: 'Trade',
  auction: 'Auction',
  rookie: 'Rookie draft',
  extension: 'Extension',
  fifth_year_option: '5th Year Option',
  free_agency: 'Free agency',
  free_agency_practice_squad: 'Free agency (practice squad)',
  signing: 'Signed',
};

const ROSTER_STATUS_LABELS = {
  active: 'active roster',
  taxi: 'practice squad',
  ir: 'injured reserve',
};

const SORTS = [
  { value: 'acquired_desc', label: 'Newest acquisition' },
  { value: 'acquired_asc', label: 'Oldest acquisition' },
  { value: 'move_desc', label: 'Most recent roster move' },
  { value: 'team', label: 'Team, then player' },
  { value: 'player', label: 'Player name' },
];

function viaLabel(via) {
  return ACQUIRED_VIA_LABELS[via] || via || '—';
}

function statusWord(s) {
  return ROSTER_STATUS_LABELS[s] || s;
}

// Sort keys are epoch milliseconds. A row with no date sorts last in both
// directions rather than pretending to be very old or very new -- a player
// with no recorded roster move has not made one, which is not the same fact as
// having made one long ago.
function timeKey(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function byTime(a, b, descending) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

export default function AdminCutPanel({ players, seasonYear }) {
  const router = useRouter();

  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('acquired_desc');
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
  teams.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  const needle = search.trim().toLowerCase();
  const visible = (players || []).filter(function (p) {
    if (teamFilter && p.teamId !== teamFilter) return false;
    if (needle && p.name.toLowerCase().indexOf(needle) === -1) return false;
    return true;
  });

  // Sorting is client-side here, deliberately and unlike /transactions. That
  // page pages a log of thousands, where sorting the 100 rows you happen to
  // hold would answer a different question than the one asked. This panel is
  // handed every active contract in the league in one array -- 290 today, and
  // the .range() ceiling on the page makes that a fact rather than a hope -- so
  // sorting in the browser sorts the whole set.
  visible.sort(function (a, b) {
    if (sort === 'acquired_desc') return byTime(timeKey(a.acquiredAt), timeKey(b.acquiredAt), true);
    if (sort === 'acquired_asc') return byTime(timeKey(a.acquiredAt), timeKey(b.acquiredAt), false);
    if (sort === 'move_desc') return byTime(timeKey(a.lastMoveAt), timeKey(b.lastMoveAt), true);
    if (sort === 'player') return a.name.localeCompare(b.name);
    if (a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName);
    return a.name.localeCompare(b.name);
  });

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Cut or move a player</h2>
      <p className="empty-note">
        Any player on any roster. An owner cuts and moves their own players from their team page;
        this is the commissioner&apos;s equivalent, mounting the same two dialogs, so every figure
        and every refusal is identical to what the owner would see.
      </p>
      <p className="empty-note">
        <strong>Acquired</strong> is when the player arrived on this roster under this contract
        &mdash; the trade&rsquo;s date for a traded contract, the signing date otherwise &mdash; and
        how he got there. <strong>Last move</strong> is his most recent taxi, IR or activation move.
        Times are Eastern.
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
        <label>
          Sort
          <select value={sort} onChange={function (e) { setSort(e.target.value); }}>
            {SORTS.map(function (s) {
              return <option key={s.value} value={s.value}>{s.label}</option>;
            })}
          </select>
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
              <th>Acquired</th>
              <th>Last move</th>
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
                  <td data-label="Acquired">
                    {formatDateTime(p.acquiredAt)}
                    <span className="empty-note" style={{ display: 'block' }}>
                      {viaLabel(p.acquiredVia)}
                      {p.acquiredTierName ? ' · ' + p.acquiredTierName : ''}
                    </span>
                  </td>
                  <td data-label="Last move">
                    {p.lastMoveAt ? (
                      <span>
                        {formatDateTime(p.lastMoveAt)}
                        <span className="empty-note" style={{ display: 'block' }}>
                          {statusWord(p.lastMoveFrom)} &rarr; {statusWord(p.lastMoveTo)}
                          {p.movesCount > 1 ? ' · ' + p.movesCount + ' moves' : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="empty-note">No roster moves</span>
                    )}
                  </td>
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
            // Refreshes so the Squad column and the Last move date both
            // reflect the move that was just made. Before the date column
            // existed this refresh only had the Squad cell to update.
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
