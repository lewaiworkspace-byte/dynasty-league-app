'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatShortDateTime } from '../../lib/formatDate';
import { formatCost } from '../../lib/formatMoney';
import PlayerLink from '../../components/PlayerLink';
import OfferForm from '../../components/OfferForm';
import { supabase } from '../../lib/supabaseClient';
import { setPoachExemption } from '../team/[teamId]/actions';

/**
 * POACHING -- rule 5.17. Phase 2D-3, September 19 2026 (ET).
 *
 * The approved artboard, in three blocks: when the market is, who of YOURS is
 * exposed, and who around the league is. The bid itself is
 * components/OfferForm.js, the same form /free-agency mounts, because a poach
 * bid is an ordinary free agency offer and the database is what makes it a
 * poach.
 *
 * WHAT THE ARTBOARD ASKED FOR AND THIS DOES NOT DRAW, and why:
 *
 * 1. "Promote him to the active roster before Tuesday and he cannot be
 *    poached. That costs you $22 of room you do not have." Every figure in
 *    that sentence is arithmetic across the viewer's whole roster, so
 *    composing it here is money arithmetic in JavaScript (SR-23) AND a money
 *    sentence written in JavaScript, which this project puts in the database
 *    so two screens cannot word one fact differently. This is exactly the call
 *    R-11 recorded for the player card's gold advisory sentence in 2D-1, and
 *    it is the same answer: if that sentence is wanted it is a view or a
 *    function, and this block prints it verbatim. A ruling and a migration,
 *    not a component change.
 *
 * 2. "the incumbent may match." There is no right of first refusal in 5.17.
 *    The holding team may BID like anyone else, and a tie goes to it; on a
 *    rookie contract every bid must BEAT the bar or he stays where he is and
 *    the team that opened the window pays a $75 fine. "Match" would tell an
 *    owner he is safe when he is not, so the copy says what the rule says.
 *
 * NOTHING HERE IS A GATE. Every status below -- on waivers, being cut, a live
 * window, whose player he is, exempt, inside the 24-hour grace -- is a flag the
 * database already computed, and submit_fa_offer re-tests all of it through
 * edfl_poach_eligible on every bid. The buttons are a convenience; the refusal
 * is the answer.
 *
 * THE EXEMPTION CONTROL (rule 5.17(l), September 21 2026) lives on YOUR EXPOSURE,
 * because exposure is the question it answers. It is the same Server Action the
 * Roster tab uses -- one caller of ps_exempt_set() per surface, no second RPC --
 * and the two-at-a-time limit is not counted here: the database refuses a third
 * with its own sentence. Other owners see EXEMPT on the league list by ruling.
 *
 * SORTED AND FILTERED IN THE CLIENT, honestly: the whole league's squads are
 * in props (ten teams, nine slots each at most, 46 rows today), the same
 * reasoning AvailablePlayers uses for the free agency pool. If this ever comes
 * from a paged read, the controls move to the query.
 *
 * THE CLOCK IS A PROP, NOT A CALL. props.nowIso is the instant the server
 * rendered the page; it seeds the clock state so the server's HTML and the
 * first client paint are identical, and a mount effect replaces it with the
 * browser's own and ticks it. The 2D-2 pattern.
 */

// DAYS, THEN HOURS, THEN MINUTES -- poaching can be four days out, and "107h"
// is not a readable answer to "when". Never seconds: the ticker runs every
// thirty, so a seconds figure would be wrong most of the time it was on screen.
// The wire's countdown, for the wire's reason.
function countdown(iso, nowMs) {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return 'due';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return d + 'd ' + h + 'h';
  if (h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

function ppvText(v) {
  if (v === null || v === undefined || v === '') return '—';
  return (Math.round(Number(v) * 100) / 100).toFixed(2);
}

// The seal marker. An inline SVG rather than a padlock emoji: an emoji is a
// font question on every platform and renders at a different size and colour on
// each, and this one sits inside a sentence. currentColor, so it takes the
// notice's ink in both themes. Lifted from WaiverBoard, where 2D-2 drew it.
function LockMark() {
  return (
    <svg
      className="mk-lock"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function PoachingBoard(props) {
  const squads = props.squads || [];
  const windows = props.windows || [];
  const myOffers = props.myOffers || [];
  const router = useRouter();

  const [now, setNow] = useState(function () {
    return props.nowIso ? new Date(props.nowIso).getTime() : Date.now();
  });
  useEffect(function () {
    setNow(Date.now());
    const t = setInterval(function () { setNow(Date.now()); }, 30000);
    return function () { clearInterval(t); };
  }, []);

  // Rule 3.3(d)/(e). Who drops back to this team's practice squad at Tuesday
  // 00:00, and how full that squad is now. Both are database reads: the RPC is
  // granted to authenticated only, and ps_count / taxi_squad_size are the same
  // view the compliance banner prints, so the offer form's notice and the
  // banner cannot disagree about how many slots a team holds.
  const [taxiReturning, setTaxiReturning] = useState([]);
  const [taxiRoom, setTaxiRoom] = useState(null);
  useEffect(function () {
    if (!props.myTeamId) return undefined;
    let live = true;
    Promise.all([
      supabase.rpc('edfl_taxi_origin_actives', { p_team_id: props.myTeamId }),
      supabase
        .from('team_inseason_compliance')
        .select('ps_count, taxi_squad_size')
        .eq('team_id', props.myTeamId)
        .maybeSingle(),
    ]).then(function (res) {
      if (!live) return;
      if (res[0] && res[0].data) setTaxiReturning(res[0].data);
      if (res[1] && res[1].data) setTaxiRoom(res[1].data);
    });
    return function () { live = false; };
  }, [props.myTeamId]);

  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [team, setTeam] = useState('ALL');
  const [exemptBusy, setExemptBusy] = useState(null);

  // Rule 5.17(l). One call, the database's sentence on refusal, and a refresh so
  // the league list, the roster tag and this card all move together.
  function toggleExempt(r) {
    clearMessages();
    setExemptBusy(r.contract_id);
    setPoachExemption(r.contract_id, !r.poach_exempt)
      .then(function (res) {
        if (!res.ok) { setFailure(res.message); return; }
        setNotice(
          res.data.player +
            (res.data.exempt ? ' is exempt from poaching. ' : ' is no longer exempt from poaching. ') +
            res.data.team_exempt_count + ' of ' + res.data.team_exempt_limit + ' exemptions in use.'
        );
        router.refresh();
      })
      .catch(function (err) { setFailure('Could not reach the server: ' + (err.message || 'unknown error')); })
      .finally(function () { setExemptBusy(null); });
  }

  // Rule 5.17(m): the grace instant, as a sentence. The instant is the view's;
  // only the wording is here.
  function graceText(r) {
    if (!r.poachable_from) return null;
    if (new Date(r.poachable_from).getTime() <= now) return null;
    return 'Back from the active roster · poachable ' + formatShortDateTime(r.poachable_from);
  }

  // The player the form is open on, in the shape OfferForm wants, plus its
  // poach context. One at a time.
  const [picked, setPicked] = useState(null);

  const windowByPlayer = {};
  windows.forEach(function (w) { windowByPlayer[w.player_id] = w; });

  // One entry per window. myOffers arrives newest first, so a plain assignment
  // would let an older non-live offer overwrite the live one an owner submitted
  // afterwards. A live offer always wins; otherwise the newest is kept.
  // (Withdrawal is gone -- 5.14(d) -- but historical 'withdrawn' rows still
  // exist.) The same reducer FreeAgencyBoard uses, and CLAUDE.md says not to
  // simplify it.
  const offerByWindow = {};
  myOffers.forEach(function (o) {
    const held = offerByWindow[o.window_id];
    if (!held || (held.status !== 'submitted' && o.status === 'submitted')) {
      offerByWindow[o.window_id] = o;
    }
  });

  function clearMessages() { setNotice(null); setFailure(null); }

  function pick(r) {
    clearMessages();
    setPicked({
      player: {
        id: r.player_id,
        full_name: r.player_name,
        position: r.position,
        nfl_team: r.nfl_team,
        hasPriorContract: true,
      },
      poach: {
        teamId: r.team_id,
        teamName: r.team_name,
        isMine: r.team_id === props.myTeamId,
        bar: r.bar_ppv === null || r.bar_ppv === undefined ? null : Number(r.bar_ppv),
        seasonCash: Number(r.season_cash) || 0,
        windowOpen: Boolean(r.live_window_id),
      },
    });
    // Runs in a click handler, so it is client-only by construction and never
    // touches document during render.
    const form = document.getElementById('offer-form');
    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const mine = squads.filter(function (r) { return r.team_id === props.myTeamId; });
  const others = squads.filter(function (r) { return r.team_id !== props.myTeamId; });

  const teams = [];
  others.forEach(function (r) {
    if (!teams.some(function (t) { return t.id === r.team_id; })) {
      teams.push({ id: r.team_id, name: r.team_name });
    }
  });
  const shown = others.filter(function (r) { return team === 'ALL' || r.team_id === team; });

  // What a row can do, in the order the database applies its exclusions. None
  // of it is a gate -- edfl_poach_eligible decides on submit.
  function actionFor(r) {
    if (r.on_waivers) return { label: null, status: 'On waivers' };
    if (r.pending_cut) return { label: null, status: 'Being cut' };
    // Rule 5.17(l)-(m), in the order edfl_poach_eligible applies them. A window
    // already open on him outranks both (an exemption cannot close a window).
    if (!r.live_window_id && r.poach_exempt) return { label: null, status: 'Exempt from poaching (rule 5.17(l))' };
    if (!r.live_window_id && graceText(r)) return { label: null, status: graceText(r) };
    if (!props.poachingOpen) return { label: null, status: null };
    const isMine = r.team_id === props.myTeamId;
    if (isMine) {
      return r.live_window_id
        ? { label: 'Bid to keep him', status: null }
        : { label: null, status: 'Your player' };
    }
    return { label: r.live_window_id ? 'Bid' : 'Make a bid', status: null };
  }

  function myOfferOn(r) {
    if (!r.live_window_id) return null;
    const o = offerByWindow[r.live_window_id];
    return o && o.status === 'submitted' ? o : null;
  }

  return (
    <div>
      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      {/* ---- THE MARKET ----
          The lead card, and the only countdown on this screen. Everything
          below it is a consequence of this instant. Three states, and the
          database decides which: poachingOpen is the view's own flag, and
          windowHasOpened is the calendar row's is_past. */}
      {props.poachingOpen ? (
        <div className="mk-lead">
          <p className="mk-lead-label">POACHING OPEN &middot; RULE 5.17</p>
          {props.closesAt && (
            <>
              <p className="mk-lead-figure">{countdown(props.closesAt, now)}</p>
              <p className="mk-lead-when">
                {'Closes ' + formatShortDateTime(props.closesAt)}
              </p>
            </>
          )}
          <p className="mk-lead-foot">
            A bid opens a sealed 24-hour window on that player. Any team may bid into it,
            including the one that holds him.
          </p>
        </div>
      ) : props.windowHasOpened ? (
        <div className="mk-lead">
          <p className="mk-lead-label">POACHING CLOSED</p>
          <p className="mk-lead-when">
            {props.closesAt ? 'Closed ' + formatShortDateTime(props.closesAt) : 'Closed for the season.'}
          </p>
          <p className="mk-lead-foot">
            The list below is the league&apos;s practice squads as they stand. Nothing on it can be
            bid on until poaching opens again.
          </p>
        </div>
      ) : (
        <div className="mk-lead">
          <p className="mk-lead-label">POACHING OPENS IN</p>
          <p className="mk-lead-figure">
            {props.opensAt ? countdown(props.opensAt, now) : '—'}
          </p>
          <p className="mk-lead-when">
            {props.opensAt ? formatShortDateTime(props.opensAt) : 'Not on the calendar.'}
          </p>
          <p className="mk-lead-foot">
            Nothing below can be bid on yet. Until it opens, this is a look at what the
            opening exposes &mdash; yours and everyone else&apos;s.
          </p>
        </div>
      )}

      {/* ---- YOUR EXPOSURE ----
          First, because it is the thing an owner needs to know and the one
          thing he cannot read off another team's screen. */}
      <div className="edfl-hq-block">
        <div className="mk-head">
          <h2 className="section-heading">{'Your exposure · ' + mine.length}</h2>
        </div>

        {/* THE RULE, STATED ONCE. It was inside each exposure card until it was
            looked at: six practice squad players is the same paragraph six
            times down one screen. Both cases are covered here and the card's
            own bar figure -- a number, or "none" -- says which one he is. The
            2D-2 call, for the 2D-2 reason. */}
        {mine.length > 0 && (
          <p className="kit-notice mk-notice-info mk-section-lead">
            <span>
              A bid on a player carrying a <strong>bar</strong> has to be worth more than it
              &mdash; the bar is his rookie contract&apos;s total PPV. If no bid beats it he stays
              where he is and the team that opened the window pays a $75 fine to League Finances.
              A bar of <strong>none</strong> is a practice squad contract with no rookie deal
              behind it, so the best legal bid takes him. Either way a tie goes to you. You may
              mark up to <strong>two</strong> of these players <strong>exempt</strong> (rule
              5.17(l)): nobody can open a window on an exempt player. The exemption ends when you
              release it or promote him, and it does not come back on its own. A player just back
              from your active roster cannot be poached for 24 hours (rule 5.17(m)).
            </span>
          </p>
        )}

        {mine.length === 0 ? (
          <p className="mk-empty">
            Nobody on your practice squad, so you have nothing exposed. A player on your active
            roster cannot be poached.
          </p>
        ) : (
          mine.map(function (r) {
            const act = actionFor(r);
            const standing = myOfferOn(r);
            const w = windowByPlayer[r.player_id];
            return (
              <div className="mk-item mk-exposed" key={r.contract_id}>
                <div className="kit-row">
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      <PlayerLink playerId={r.player_id}>{r.player_name}</PlayerLink>
                      {r.position && <span className="kit-chip">{r.position}</span>}
                      {/* PLAIN .kit-chip, NOT the neon variant, and that is a
                          measurement rather than a preference. .kit-chip-neon
                          measures 4.49:1 on the kit's own surface and 3.56:1 on
                          this card's neon ground; .kit-chip-live measures 4.39:1.
                          Both are under AA for 10px text, both are 2A's tokens,
                          and both are live on /waivers today -- so they are
                          REPORTED for a design-layer fix rather than patched from
                          a market batch, and this batch does not add more failing
                          text meanwhile. When the tokens are corrected these chips
                          take the coloured variants: one word each. */}
                      {r.live_window_id && (
                        <span className="kit-chip">WINDOW OPEN</span>
                      )}
                      {r.poach_exempt && <span className="kit-chip">EXEMPT</span>}
                    </div>
                    <div className="kit-row-meta">
                      {(r.nfl_team ? r.nfl_team + ' · ' : '') +
                        'your practice squad · ' +
                        (r.contract_type === 'rookie' ? 'rookie deal' : 'practice squad contract')}
                    </div>
                  </div>
                  {/* Rule 5.17(l). Offered on every card of yours; the database
                      refuses a third exemption, or one on a player with a window
                      already open, with its own sentence. */}
                  {!r.live_window_id && (
                    <div className="kit-row-right">
                      <button
                        type="button"
                        className="btn btn-quiet"
                        disabled={exemptBusy === r.contract_id}
                        onClick={function () { toggleExempt(r); }}
                      >
                        {exemptBusy === r.contract_id
                          ? 'Saving…'
                          : r.poach_exempt ? 'Release exemption' : 'Exempt from poaching'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mk-figures">
                  <div className="mk-figure">
                    <span className="mk-figure-label">Bar to poach him</span>
                    <span className="mk-figure-value v-ppv">
                      {r.bar_ppv === null || r.bar_ppv === undefined
                        ? 'none' : ppvText(r.bar_ppv) + ' PPV'}
                    </span>
                  </div>
                  <div className="mk-figure">
                    <span className="mk-figure-label">{props.season + ' cash'}</span>
                    <span className="mk-figure-value">{formatCost(r.season_cash)}</span>
                  </div>
                  {w && w.closes_at && (
                    <div className="mk-figure">
                      <span className="mk-figure-label">Window closes</span>
                      <span className="mk-figure-value">{countdown(w.closes_at, now)}</span>
                    </div>
                  )}
                </div>

                {act.status && <p className="kit-row-meta mk-inset">{act.status}</p>}

                {standing && (
                  <p className="kit-row-meta mk-inset">
                    {'Your keep bid is in · ' + standing.total_years + 'yr'}
                  </p>
                )}

                {act.label && (
                  <button
                    type="button"
                    className={'btn mk-cta ' + (standing ? 'btn-secondary' : 'kit-cta')}
                    onClick={function () { pick(r); }}
                  >
                    {standing ? 'Raise your keep bid' : act.label}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ---- EXPOSED AROUND THE LEAGUE ---- */}
      <div className="edfl-hq-block">
        <div className="mk-head">
          <h2 className="section-heading">{'Exposed around the league · ' + others.length}</h2>
          {teams.length > 1 && (
            <label className="mk-filter">
              <span className="stat-label">Team</span>
              <select value={team} onChange={function (e) { setTeam(e.target.value); }}>
                <option value="ALL">All teams</option>
                {teams.map(function (t) {
                  return <option key={t.id} value={t.id}>{t.name}</option>;
                })}
              </select>
            </label>
          )}
        </div>

        {shown.length === 0 ? (
          <p className="mk-empty">
            {others.length === 0
              ? 'No other team is carrying a practice squad player.'
              : 'No practice squad player on that team.'}
          </p>
        ) : (
          <>
            <div className="mk-colhead">
              <span className="mk-colhead-main">PLAYER</span>
              <span className="mk-colhead-fig">BAR PPV</span>
            </div>
            <div className="kit-rows">
              {shown.map(function (r) {
                const act = actionFor(r);
                const standing = myOfferOn(r);
                return (
                  <div className="kit-row mk-actionrow" key={r.contract_id}>
                    <div className="kit-row-main">
                      <div className="kit-row-title">
                        <PlayerLink playerId={r.player_id}>{r.player_name}</PlayerLink>
                        {r.position && <span className="kit-chip">{r.position}</span>}
                        {r.live_window_id && (
                          <span className="kit-chip">WINDOW OPEN</span>
                        )}
                        {!r.live_window_id && r.poach_exempt && <span className="kit-chip">EXEMPT</span>}
                        {standing && <span className="kit-chip kit-chip-good">YOUR BID IN</span>}
                      </div>
                      <div className="kit-row-meta">
                        {(r.nfl_team ? r.nfl_team + ' · ' : '') + r.team_name +
                          ' · ' + (r.contract_type === 'rookie' ? 'rookie deal' : 'practice squad') +
                          ' · ' + formatCost(r.season_cash) + ' in ' + props.season}
                      </div>
                    </div>
                    <div className="kit-row-right">
                      {r.bar_ppv === null || r.bar_ppv === undefined
                        ? 'none' : ppvText(r.bar_ppv)}
                    </div>
                    {(act.label || act.status) && (
                      <div className="mk-rowaction">
                        {act.label ? (
                          <button
                            type="button"
                            className={'btn ' + (standing ? 'btn-secondary' : 'btn-quiet')}
                            onClick={function () { pick(r); }}
                          >
                            {standing ? 'Raise' : act.label}
                          </button>
                        ) : (
                          <span className="kit-row-meta">{act.status}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="kit-notice mk-notice-info mk-section-note">
          <LockMark />
          <span>
            A bid is sealed exactly as a free agency offer is: nobody &mdash; including the
            commissioner &mdash; sees the terms or who bid until the window resolves. Bar
            &ldquo;none&rdquo; means a practice squad contract with no rookie deal to beat, so the
            best legal bid wins. Whether a bid is legal is decided by the database when you
            submit; this list only helps you find him.
          </span>
        </p>
      </div>

      {/* ---- THE BID ----
          The same form /free-agency mounts. Keyed on the player so a second
          pick re-seeds the poach defaults -- a $2 signing bonus and a first
          year that clears both the league minimum and his current cash --
          rather than carrying the previous player's figures over. */}
      {picked && (
        <OfferForm
          key={picked.player.id}
          season={props.season}
          weightRows={props.weightRows}
          wireLive={props.wireLive}
          player={picked.player}
          poach={picked.poach}
          signsInstantly={false}
          firstOfferUntil={null}
          taxiReturning={taxiReturning}
          taxiRoom={taxiRoom}
          onCancel={function () { setPicked(null); clearMessages(); }}
          onFail={function (m) { setFailure(m); }}
          onDone={function (m) { setPicked(null); setNotice(m); }}
        />
      )}
    </div>
  );
}
