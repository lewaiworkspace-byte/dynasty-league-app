'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  refreshProspectsAction,
  matchSleeperAction,
  closeRookieDraftAction,
  setProspectMatchAction,
} from './actions';
import { searchPlayersForDianna } from '../../team/[teamId]/insiderActions';

// The prospect board's officer controls, in the order they happen each year:
//   1. Load / refresh the class from ESPN   (January, then whenever)
//   2. Match to Sleeper                     (after the NFL draft + Sync Players)
//   3. Match by hand                        (the ambiguous ones)
//   4. Close the rookie draft               (rolls the board; retires draft rumours)
//
// Same useFormState split as /admin/sync-players. Every result the database
// returns is printed as returned; nothing is summarised into a number the
// database did not give.

const idle = { status: 'idle' };

function Pending(props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={'btn' + (props.cta ? ' kit-cta' : ' btn-secondary')} disabled={pending}>
      {pending ? props.busy : props.label}
    </button>
  );
}

export default function ProspectsAdmin(props) {
  const router = useRouter();
  const [refresh, refreshAction] = useFormState(refreshProspectsAction, idle);
  const [close, closeAction] = useFormState(closeRookieDraftAction, idle);
  const [match, setMatch] = useState(idle);
  const [matching, setMatching] = useState(false);

  async function runMatch() {
    setMatching(true);
    const res = await matchSleeperAction();
    setMatching(false);
    setMatch(res);
    router.refresh();
  }

  return (
    <main className="portal-body">
      <p className="subhead">
        <a href="/admin">&larr; Commissioner Portal</a>
      </p>
      <h1>Draft Prospects</h1>
      <p className="subhead">
        ESPN&rsquo;s board, loaded on demand and filtered to QB, RB, WR, TE and K. The board is
        what Insider Threat&rsquo;s draft rumours point at; a prospect lives here and nowhere else.
      </p>

      <section className="portal-group">
        <div className="portal-group-title">STATE</div>
        <div className="kit-strip mk-figures">
          <div className="mk-figure">
            <div className="mk-figure-label">OPEN CLASS</div>
            <div className="mk-figure-value">{props.openClassYear || '—'}</div>
          </div>
          <div className="mk-figure">
            <div className="mk-figure-label">ON THE BOARD</div>
            <div className="mk-figure-value">{props.boardCount}</div>
          </div>
          <div className="mk-figure">
            <div className="mk-figure-label">UNMATCHED</div>
            <div className="mk-figure-value">{props.unmatched.length}</div>
          </div>
        </div>
        {props.classes.length > 0 ? (
          <div className="kit-rows">
            {props.classes.map(function (c) {
              return (
                <div className="kit-row" key={c.class_year}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {c.class_year} class
                      {!c.rolled ? <span className="kit-chip kit-chip-live">OPEN</span> : null}
                    </div>
                    <div className="kit-row-meta">
                      Opened {c.opened}
                      {c.rolled ? ' · rolled ' + c.rolled : ''}
                      {c.note ? ' · ' + c.note : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {/* 1 */}
      <section className="portal-group">
        <div className="portal-group-title">1 · LOAD OR REFRESH FROM ESPN</div>
        <form action={refreshAction} className="mk-form">
          <label className="form-row">
            <span>Class year</span>
            <input type="number" name="class_year" defaultValue={props.suggestedYear} min="2026" max="2100" />
          </label>
          <p className="kit-row-meta">
            Reads every athlete on ESPN&rsquo;s board for that year, keeps the five positions, and
            upserts. Safe to re-run: existing rows are refreshed, not duplicated. ESPN publishes a
            class after the college season; an empty answer means it is not out yet. This can take
            up to a minute.
          </p>
          <div className="mk-form-actions">
            <Pending label="Refresh from ESPN" busy="Reading ESPN… up to a minute" cta />
          </div>
        </form>
        {refresh.status === 'error' ? <p className="form-error">{refresh.message}</p> : null}
        {refresh.status === 'done' ? (
          <div className="kit-notice kit-notice-good">
            <p>ESPN listed {refresh.result.espnTotal}; {refresh.result.keptPositions} at QB/RB/WR/TE/K.</p>
            <p>
              Inserted {refresh.result.upsert.inserted}, updated {refresh.result.upsert.updated}; {refresh.result.upsert.on_board} on the{' '}
              {refresh.result.classYear} board.
            </p>
            {refresh.result.failedFetches > 0 ? (
              <p className="form-error">{refresh.result.failedFetches} athlete record(s) could not be read; run it again to pick them up.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 2 */}
      <section className="portal-group">
        <div className="portal-group-title">2 · MATCH TO SLEEPER</div>
        <p className="kit-row-meta">
          After the NFL draft, run Sync Players first, then this. Each unmatched prospect is matched
          to exactly one Sleeper player by name and position; anything ambiguous is left for step 3.
        </p>
        <div className="mk-form-actions">
          <button type="button" className="btn btn-secondary" disabled={matching || !props.openClassYear} onClick={runMatch}>
            {matching ? 'Matching…' : 'Match to Sleeper'}
          </button>
        </div>
        {match.status === 'error' ? <p className="form-error">{match.message}</p> : null}
        {match.status === 'done' ? (
          <p className="kit-notice kit-notice-good">
            Matched {match.result.matched}, ambiguous {match.result.ambiguous}, unmatched {match.result.unmatched}.
          </p>
        ) : null}
      </section>

      {/* 3 */}
      <section className="portal-group">
        <div className="portal-group-title">3 · MATCH BY HAND</div>
        {props.unmatched.length === 0 ? (
          <p className="mk-empty">Everyone on the board is matched, or the board is empty.</p>
        ) : (
          <div className="kit-rows">
            {props.unmatched.map(function (u) {
              return <HandMatchRow key={u.prospect_id} prospect={u} onDone={router.refresh} />;
            })}
          </div>
        )}
      </section>

      {/* 4 */}
      <section className="portal-group">
        <div className="portal-group-title">4 · CLOSE THE ROOKIE DRAFT</div>
        <form action={closeAction} className="mk-form">
          <p className="kit-notice mk-notice-warn">
            Rolls the {props.openClassYear || '—'} board off Insider Threat and retires every live
            draft rumour. Rows are kept. The next class loads with step 1 when ESPN publishes it. Logged
            to the League Action Log.
          </p>
          <label className="form-row">
            <span>Type CLOSE to confirm</span>
            <input type="text" name="confirm" autoComplete="off" />
          </label>
          <label className="form-row">
            <span>Note (optional)</span>
            <input type="text" name="note" maxLength="200" />
          </label>
          <div className="mk-form-actions">
            <Pending label="Close the rookie draft" busy="Closing…" />
          </div>
        </form>
        {close.status === 'error' ? <p className="form-error">{close.message}</p> : null}
        {close.status === 'done' ? (
          <p className="kit-notice kit-notice-good">
            Closed the {close.result.class_year} rookie draft; {close.result.rumours_retired} draft rumour(s) retired.
          </p>
        ) : null}
      </section>
    </main>
  );
}

function HandMatchRow(props) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function search(value) {
    setQ(value);
    if (value.trim().length < 2) {
      setRows([]);
      return;
    }
    const res = await searchPlayersForDianna(value);
    setRows(res.ok ? res.rows.filter((r) => r.position === props.prospect.position) : []);
    if (!res.ok) setErr(res.message);
  }

  async function choose(playerId) {
    setBusy(true);
    setErr(null);
    const res = await setProspectMatchAction(props.prospect.prospect_id, playerId);
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    setRows([]);
    setQ('');
    if (props.onDone) props.onDone();
  }

  const p = props.prospect;
  return (
    <div className="kit-row it-handmatch">
      <div className="kit-row-main">
        <div className="kit-row-title">
          {p.espn_overall_rank ? '#' + p.espn_overall_rank + ' ' : ''}
          {p.full_name}
        </div>
        <div className="kit-row-meta">
          {p.position}
          {p.college ? ' · ' + p.college : ''}
        </div>
        <label className="form-row">
          <span className="it-visually-hidden">Search Sleeper players</span>
          <input
            type="search"
            value={q}
            placeholder={'Search Sleeper for a ' + p.position}
            onChange={function (e) {
              search(e.target.value);
            }}
          />
        </label>
        {rows.length > 0 ? (
          <div className="mk-finder-results kit-rows">
            {rows.map(function (r) {
              return (
                <button
                  type="button"
                  className="kit-row it-result"
                  key={r.player_id}
                  disabled={busy}
                  onClick={function () {
                    choose(r.player_id);
                  }}
                >
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {r.full_name} ({r.position}
                      {r.nfl_team ? ', ' + r.nfl_team : ''})
                    </div>
                    <div className="kit-row-meta">{r.is_free_agent ? 'Free agent' : r.edfl_team || ''}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
        {err ? <p className="form-error">{err}</p> : null}
      </div>
    </div>
  );
}
