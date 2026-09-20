'use client';

import { useState, useTransition } from 'react';
import { headshotUrl, playerInitials } from '../../../../lib/playerHeadshot';
import InjuryCross from '../../../../components/InjuryCross';
import { refreshProjections } from './actions';

/**
 * THE MATCHUP BOARD -- Phase 2G-2, September 20, 2026.
 *
 * Laid out the way the Sleeper matchup screen is, because that is the shape
 * every owner in this league already reads without thinking: the two scores
 * at the top with the projected final beneath each, then the starters slot by
 * slot with the two sides facing each other across the position badge, then
 * the benches.
 *
 * THE SLOT ORDER IS THE DATABASE'S, NOT THIS FILE'S. edfl_matchup_detail
 * returns slot_order and the rows are sorted on it, so QB/RB/RB2/WR..WR4/
 * TE/TE2/FLEX1/FLEX2/K is stated once, in SQL, alongside the greedy that
 * fills them. A second copy of the template here is the kind of thing that
 * stays right for a season and then quietly does not.
 *
 * WHY THE TWO SIDES ARE NOT THE SAME LENGTH, and why that is fine. This is
 * best ball, not a set lineup: each side's twelve slots are filled from its
 * own active roster, so the two columns always have twelve rows each, but the
 * BENCHES differ -- teams carry 20 to 25 active players. The benches are
 * therefore stacked under one another rather than paired across.
 *
 * EVERY NUMBER ON THIS PAGE IS ONE OF TWO KINDS AND THEY ARE NEVER MIXED:
 *   actual      -- from player_week_scores, mirrored from Sleeper
 *   projected   -- Rotowire components scored by EDFL rules, always dimmer,
 *                  always with the projection styling, never bold
 * A player who has not kicked off shows a dash where his actual score would
 * be. He is never shown a 0.00, because a real 0.00 from a player who has
 * finished is a different and much more painful fact.
 *
 * THE INJURY MARK IS NOT THIS PAGE'S TO DEFINE. The red cross comes from
 * <InjuryCross />, the component the roster and the player card already use,
 * and whether it is drawn is edfl_matchup_detail's injury_flagged -- which is
 * edfl_injury_designation_qualifies() in the database, the September 20
 * ruling's single definition of IR / Out / Doubtful / PUP. The same predicate
 * decides IR eligibility under rule 3.4(b), so the cross on this page and the
 * compliance banner's reason can never disagree.
 *
 * An earlier cut of this file printed players.injury_status raw, in rust. That
 * would have drawn an injury mark for 'Questionable' and for the one rostered
 * player carrying 'NA', neither of which the ruling names -- a second answer
 * to a settled question, in a second colour.
 *
 * A DESIGNATION THAT IS NOT FLAGGED STILL SHOWS, as neutral dim text beside
 * the position. 'Questionable' is worth knowing on a matchup screen -- Sleeper
 * carries it too -- and saying the word is not the same as wearing the mark.
 */

function fmt(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function sum(rows, pick) {
  let t = 0;
  rows.forEach(function (r) {
    const n = Number(pick(r));
    if (Number.isFinite(n)) t += n;
  });
  return t;
}

function kickoffLabel(row) {
  if (row.game_state === 'bye') return 'BYE';
  if (!row.kickoff_at) return '';
  const d = new Date(row.kickoff_at);
  const when = d.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  const opp = row.opponent ? ' ' + row.opponent : '';
  return when + opp;
}

function PlayerFace(props) {
  const [broken, setBroken] = useState(false);
  const url = headshotUrl(props.sleeperPlayerId, 'thumb');
  return (
    <span className="mu-face" aria-hidden="true">
      <span className="mu-face-fallback">{playerInitials(props.fullName)}</span>
      {url && !broken && (
        /* A plain <img>, deliberately. next/image would want sleepercdn.com in
           next.config.js's remotePatterns, and next.config.js belongs to the
           PWA batch -- two phases editing one file is how a merge goes wrong.
           These are 34px thumbnails from a CDN; there is nothing for the
           optimiser to save. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="mu-face-img"
          src={url}
          alt=""
          loading="lazy"
          onError={function () {
            setBroken(true);
          }}
        />
      )}
    </span>
  );
}

function PlayerCell(props) {
  const r = props.row;
  if (!r) return <div className={'mu-player is-empty' + (props.right ? ' is-right' : '')} />;

  const played = r.game_state === 'final' || r.game_state === 'live';
  // Flagged -> the league's cross. Not flagged but designated ('Questionable')
  // -> the word, in the same dim ink as the position beside it.
  const softInj = !r.injury_flagged && r.injury_status ? String(r.injury_status) : '';

  return (
    <a
      className={'mu-player' + (props.right ? ' is-right' : '')}
      href={'/player/' + r.player_id}
    >
      <PlayerFace sleeperPlayerId={r.sleeper_player_id} fullName={r.full_name} />
      <span className="mu-player-text">
        <span className="mu-player-name">
          {r.injury_flagged ? <InjuryCross label={r.injury_label} /> : null}
          {r.full_name}
        </span>
        <span className="mu-player-meta">
          {r.player_position}
          {r.nfl_team ? ' · ' + r.nfl_team : ''}
          {softInj ? <span className="mu-inj"> {softInj}</span> : null}
        </span>
        <span className="mu-player-game">{kickoffLabel(r)}</span>
      </span>
      <span className="mu-player-nums">
        <span className={'mu-actual' + (r.game_state === 'live' ? ' is-live' : '')}>
          {played ? fmt(r.points) : '—'}
        </span>
        <span className="mu-proj">{fmt(r.proj_points)}</span>
      </span>
    </a>
  );
}

export default function MatchupBoard(props) {
  const game = props.game;
  const players = props.players || [];
  const myTeamId = props.myTeamId || null;

  const [notice, setNotice] = useState(null);
  const [failure, setFailure] = useState(null);
  const [pending, startTransition] = useTransition();

  const homeId = game.home_team_id;
  const awayId = game.away_team_id;

  function forTeam(id) {
    return players.filter(function (r) {
      return r.team_id === id;
    });
  }

  const home = forTeam(homeId);
  const away = forTeam(awayId);

  function starters(rows) {
    return rows
      .filter(function (r) {
        return r.slot !== null && r.slot !== undefined;
      })
      .sort(function (a, b) {
        return a.slot_order - b.slot_order;
      });
  }

  function bench(rows) {
    return rows
      .filter(function (r) {
        return r.slot === null || r.slot === undefined;
      })
      .sort(function (a, b) {
        return Number(b.effective_points) - Number(a.effective_points);
      });
  }

  const homeStart = starters(home);
  const awayStart = starters(away);

  // The projected FINAL: what the twelve slots add up to when every player who
  // has not kicked off contributes his projection. effective_points is exactly
  // that quantity, computed in SQL, so this is a sum and not a second rule.
  const homeProjFinal = sum(homeStart, function (r) {
    return r.effective_points;
  });
  const awayProjFinal = sum(awayStart, function (r) {
    return r.effective_points;
  });

  function yetToPlay(rows) {
    const counts = {};
    let n = 0;
    rows.forEach(function (r) {
      if (r.game_state === 'final' || r.game_state === 'live') return;
      n += 1;
      const p = r.player_position || '?';
      counts[p] = (counts[p] || 0) + 1;
    });
    const order = ['QB', 'RB', 'WR', 'TE', 'K'];
    const parts = [];
    order.forEach(function (p) {
      if (!counts[p]) return;
      parts.push(counts[p] > 1 ? counts[p] + ' ' + p : p);
    });
    return { n: n, label: parts.join(', ') };
  }

  const homeYet = yetToPlay(homeStart);
  const awayYet = yetToPlay(awayStart);

  // The slot rail down the middle. Both sides always have twelve, but read the
  // labels off whichever side actually returned rows so a half-loaded matchup
  // still draws.
  const rail = (homeStart.length >= awayStart.length ? homeStart : awayStart).map(function (r) {
    return r.slot;
  });

  function onRefresh() {
    setNotice(null);
    setFailure(null);
    startTransition(async function () {
      const res = await refreshProjections(props.season, props.week);
      if (!res.ok) {
        setFailure(res.message);
        return;
      }
      const d = res.data || {};
      let msg =
        'Projections refreshed: ' +
        (d.rows_written || 0) +
        ' players written.';
      if (d.rostered_without_projection > 0) {
        msg =
          msg +
          ' ' +
          d.rostered_without_projection +
          ' of ' +
          d.rostered_active +
          ' rostered players had no projection and will show a dash.';
      }
      if (res.positionsFailed && res.positionsFailed.length > 0) {
        msg = msg + ' Sleeper did not answer for: ' + res.positionsFailed.join(', ') + '.';
      }
      setNotice(msg);
    });
  }

  function Side(props2) {
    const isWinner =
      game.winner_team_id && game.winner_team_id === props2.id && game.week_is_final;
    return (
      <div className={'mu-head-side' + (props2.right ? ' is-right' : '')}>
        <a
          className={'mu-head-team' + (props2.id === myTeamId ? ' is-mine' : '')}
          href={props2.id ? '/team/' + props2.id : '#'}
        >
          {props2.name || 'Unclaimed Team'}
        </a>
        <div className={'mu-head-score' + (isWinner ? ' is-winner' : '')}>
          {game.has_scores ? fmt(props2.points) : '—'}
        </div>
        <div className="mu-head-proj">{fmt(props2.proj)} proj</div>
        <div className="mu-head-yet">
          {props2.yet.n > 0
            ? 'yet to play (' + props2.yet.n + ') ' + props2.yet.label
            : 'all starters done'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ================= THE HEADER ================= */}
      <div className="mu-head">
        <Side
          id={homeId}
          name={game.home_team}
          points={game.home_points}
          proj={homeProjFinal}
          yet={homeYet}
        />
        <div className="mu-head-mid">
          <span className={game.week_is_final ? 'mu-state' : 'mu-state is-live'}>
            {game.week_is_final ? 'FINAL' : game.has_scores ? 'LIVE' : 'NOT PLAYED'}
          </span>
          {game.has_scores && (
            <span className="mu-margin">
              {game.winner_team_id ? fmt(game.margin) : 'tied'}
            </span>
          )}
        </div>
        <Side
          id={awayId}
          name={game.away_team}
          points={game.away_points}
          proj={awayProjFinal}
          yet={awayYet}
          right
        />
      </div>

      {/* THE DISCLAIMER. Owner request, 2026-09-20. Small, and directly under
          the two numbers it qualifies rather than at the foot of the page
          where nobody scrolls. */}
      <p className="mu-disclaimer">
        The large number is the official best-ball score. The smaller
        &ldquo;proj&rdquo; figure is an <strong>estimate</strong>: Sleeper&rsquo;s projected stats
        run through EDFL scoring, for players who have not kicked off yet. Projections are
        Rotowire&rsquo;s and nothing in the league is ever settled from them.
        {props.projSyncedAt
          ? ' Last updated ' +
            new Date(props.projSyncedAt).toLocaleString('en-US', {
              timeZone: 'America/New_York',
            }) +
            ' ET.'
          : ' No projections have been pulled for this week yet.'}
      </p>

      {!game.week_is_final && (
        <p className="empty-note">
          Best ball picks your twelve slots for you, and it picks them again every time somebody
          scores. What is below is the lineup as it stands right now &mdash; a player who has not
          kicked off is holding his slot on his projection, and will lose it if the man behind
          him outscores it.
        </p>
      )}

      {/* ================= THE STARTERS ================= */}
      <h2 className="section-heading">Starters</h2>
      <div className="mu-grid">
        {rail.map(function (slot, i) {
          return (
            <div className="mu-row" key={slot + ':' + i}>
              <PlayerCell row={homeStart[i]} />
              <div className="mu-slot">{slot}</div>
              <PlayerCell row={awayStart[i]} right />
            </div>
          );
        })}
      </div>

      {rail.length === 0 && (
        <p className="empty-note">
          No active-roster players have been synced for this week, so there is no lineup to
          resolve. Refresh the week on the <a href="/scoreboard">Scoreboard</a>.
        </p>
      )}

      {/* ================= THE BENCHES ================= */}
      <h2 className="section-heading">Bench</h2>
      <p className="empty-note">
        Everyone else on the active roster, best projected first. Under best ball any of them can
        take a slot by outscoring the man in it &mdash; nothing has to be moved. Taxi and IR
        players are not shown: ruling BB-1, they score nothing whatever they do.
      </p>
      <div className="mu-benches">
        {[
          { id: homeId, name: game.home_team, rows: bench(home) },
          { id: awayId, name: game.away_team, rows: bench(away) },
        ].map(function (b) {
          return (
            <div className="mu-bench" key={b.id || b.name}>
              <div className="lg-head">
                <span>{(b.name || 'Unclaimed Team').toUpperCase()}</span>
                <span>{b.rows.length}</span>
              </div>
              <div className="kit-rows">
                {b.rows.map(function (r) {
                  return <PlayerCell row={r} key={r.player_id} />;
                })}
              </div>
              {b.rows.length === 0 && <p className="empty-note">Nobody on the bench.</p>}
            </div>
          );
        })}
      </div>

      {/* ================= THE CONTROLS ================= */}
      <div
        className="control-row"
        style={{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: 20 }}
      >
        <p className="row-note" style={{ margin: 0 }}>
          Scores refresh from Sleeper every five minutes. Projections are pulled on demand.
        </p>
        {props.canRefresh && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={pending}
          >
            {pending ? 'Refreshing...' : 'Refresh projections'}
          </button>
        )}
      </div>

      {failure && <div className="form-error">{failure}</div>}
      {notice && <p className="form-notice">{notice}</p>}

      <p className="page-actions edfl-hq-links">
        <a className="btn" href="/scoreboard">
          Scoreboard
        </a>
        <a className="btn" href="/standings">
          Standings
        </a>
        {myTeamId && (
          <a className="btn" href={'/team/' + myTeamId}>
            My Team
          </a>
        )}
      </p>
    </div>
  );
}
