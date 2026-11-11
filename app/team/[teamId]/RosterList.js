'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../../components/ExplainButton';
import { headshotUrl, playerInitials } from '../../../lib/playerHeadshot';
import { formatKickoff } from '../../../lib/formatDate';

// THE ROSTER TAB, OPTION C -- UI test batch 10, November 11, 2026.
//
// Lewis's pick on the Claude Design canvas "EDFL Roster tab (test site) --
// today and layout options" (artifact SCBiKPV5YnKHL8Kbb8tTss), with every
// markup he made on it the same afternoon (roster-design addenda 1-28):
//   * the team banner and the Cap Room / Cash / Record / Waiver strip are gone
//     from this view (page.js draws neither on ?tab=roster);
//   * Season dropdown with the explain icon; the ordering sentence and the
//     colour key live in its card;
//   * the squad switch (Active / Practice squad / IR, one at a time) ABOVE the
//     position pills; seven equal pills across the full width;
//   * one Sleeper-style row per player: position badge, photo, name; "POS •
//     TEAM (bye) · QB5" with the rank coloured by band; "Start 78%" or
//     "Start: RB 67%, FLEX 22%"; this week's game; this week's points over the
//     projection. No money, no contract year, no status tags, no buttons on
//     the row: those are on the Mini Player Card;
//   * the white injury pill in the row's top-left corner, the badge slid down
//     below it, opening the injury report; red / yellow / grey row tints, a
//     bye winning over an injury tint.
//
// IT DECIDES NOTHING AND COMPUTES NOTHING. Every rank, band, percentage, bye,
// opponent, opponent rank, tint and short label is a column of
// edfl_team_roster_rows() (props.extra, keyed by contract id), and the order is
// page.js's projection order (never re-sorted here). A failed read of that
// function is shown in red above the list; the rows then show what the
// contracts read alone can say.
//
// A TAP ON A ROW opens the Mini Player Card: on a phone the row is a plain link
// to /player/<id>, which the pop-up sheet (components/SheetHost.js) opens as
// /player/<id>/mini; from 1024px the card is a panel beside the list (an
// iframe of the same page, named edfl-panel), and the row only selects it.

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const PILLS = [
  { key: 'all', label: 'All' },
  { key: 'QB', label: 'QB' },
  { key: 'RB', label: 'RB' },
  { key: 'WR', label: 'WR' },
  { key: 'TE', label: 'TE' },
  { key: 'flex', label: 'Flex' },
  { key: 'K', label: 'K' },
];
const FLEX = ['RB', 'WR', 'TE'];
const SQUADS = [
  { key: 'active', label: 'Active', used: 'active_count', limit: 'active_roster_size', over: 'active_over_by' },
  { key: 'taxi', label: 'Practice squad', used: 'ps_count', limit: 'taxi_squad_size', over: 'ps_over_by' },
  { key: 'ir', label: 'IR', used: 'ir_count', limit: 'ir_slots', over: 'ir_over_by' },
];
const WIDE = '(min-width: 1024px)';

function ordinal(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

function pct(v) {
  return v === null || v === undefined ? '–' : v + '%';
}

function startLine(x) {
  if (!x || !x.weeks_active) return 'Start –';
  if (x.flex_eligible) {
    return 'Start: ' + x.rank_position_label + ' ' + pct(x.pos_pct) + ', FLEX ' + pct(x.flex_pct);
  }
  return 'Start ' + pct(x.start_pct);
}

function gameLine(x) {
  if (!x) return null;
  if (x.no_team) return 'No NFL team';
  if (x.on_bye) return 'Bye week';
  if (!x.opponent) return null;
  const tail = [];
  if (x.is_neutral) tail.push('N');
  if (x.opp_rank) tail.push(ordinal(x.opp_rank));
  return (
    (x.kickoff_at ? formatKickoff(x.kickoff_at) + ' ' : '') +
    (x.is_away ? '@ ' : '') +
    x.opponent +
    (tail.length ? ' (' + tail.join(', ') + ')' : '')
  );
}

const TINT = { red: 'rc-warn-red', yellow: 'rc-warn-yel', bye: 'rc-warn-bye' };
const CT = { 'ct-rookie': 'rc-ct-rookie', 'ct-practice': 'rc-ct-practice' };

// THE FACE DISC (shared with the Mini Player Card and the injury report). The
// initials sit underneath; the headshot covers them when it loads. A headshot
// that fails before React hydrates never fires onError, so the effect checks
// the image once mounted (the old roster face's fix, kept).
export function RosterFace(props) {
  const [broken, setBroken] = useState(false);
  const imgRef = useRef(null);
  const url = props.sleeperId ? headshotUrl(props.sleeperId, 'thumb') : null;
  useEffect(
    function () {
      const el = imgRef.current;
      if (el && el.complete && el.naturalWidth === 0) setBroken(true);
    },
    [url]
  );
  return (
    <span className={'rc-face' + (props.big ? ' is-big' : '')} aria-hidden="true">
      {playerInitials(props.name)}
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={url}
          alt=""
          loading={props.big ? undefined : 'lazy'}
          onError={function () {
            setBroken(true);
          }}
        />
      ) : null}
    </span>
  );
}

function InjuryPillIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M4.6 0.6h2.8v3.2h3.2v2.8H7.4v3.2H4.6V6.6H1.4V3.8h3.2z" fill="currentColor" />
    </svg>
  );
}

export function rosterSquadOf(show) {
  if (show === 'active' || show === 'ir' || show === 'taxi') return show;
  if (show === 'taxi-nonrookie') return 'taxi';
  return 'active';
}

export function rosterPillOf(show) {
  return PILLS.some(function (p) {
    return p.key === show;
  })
    ? show
    : 'all';
}

export default function RosterList(props) {
  const router = useRouter();
  const rows = props.rows || [];
  const extra = props.extra || {};
  const isCurrent = Boolean(props.isCurrent);
  const compliance = props.complianceRow || null;
  const [squad, setSquad] = useState(rosterSquadOf(props.initialShow));
  const [pill, setPill] = useState(rosterPillOf(props.initialShow));
  const [nonRookieOnly, setNonRookieOnly] = useState(props.initialShow === 'taxi-nonrookie');
  const [wide, setWide] = useState(false);
  const [selected, setSelected] = useState(null);
  const panelRef = useRef(null);

  // The laptop layout is chosen after mount (a server render has no width).
  useEffect(function () {
    let mq;
    try {
      mq = window.matchMedia(WIDE);
    } catch (e) {
      return undefined;
    }
    const f = function () {
      setWide(mq.matches);
    };
    f();
    if (mq.addEventListener) mq.addEventListener('change', f);
    else if (mq.addListener) mq.addListener(f);
    return function () {
      if (mq.removeEventListener) mq.removeEventListener('change', f);
      else if (mq.removeListener) mq.removeListener(f);
    };
  }, []);

  // A move made in the panel's Mini Player Card refreshes this page.
  useEffect(
    function () {
      function onMessage(e) {
        if (e.origin !== window.location.origin) return;
        const frame = panelRef.current;
        if (!frame || e.source !== frame.contentWindow) return;
        if (e.data && e.data.edflPanel === 'changed') router.refresh();
      }
      window.addEventListener('message', onMessage);
      return function () {
        window.removeEventListener('message', onMessage);
      };
    },
    [router]
  );

  const visible = rows.filter(function (r) {
    if (r.onWaivers) return false;
    if (isCurrent) {
      if (r.rosterStatus !== squad) return false;
      if (squad === 'taxi' && nonRookieOnly) {
        const t = props.taxiByContract ? props.taxiByContract[r.id] : null;
        const subject = t && t.ps_rule_subject === true;
        if (r.contractType === 'rookie' && subject) return false;
      }
    }
    if (pill === 'all') return true;
    if (pill === 'flex') return FLEX.indexOf(r.position) >= 0;
    return r.position === pill;
  });

  // On a laptop the panel always shows someone: the selected player while he
  // is in the list, else the first row.
  const selectedRow =
    visible.find(function (r) {
      return r.playerId && r.playerId === selected;
    }) ||
    visible.find(function (r) {
      return r.playerId;
    }) ||
    null;
  const panelPlayer = wide && selectedRow ? selectedRow.playerId : null;

  return (
    <div>
      <div className="rc-head edfl-explain-host">
        <div className="control-row">
          <label htmlFor="rseason">Season</label>
          <select
            id="rseason"
            value={props.season}
            onChange={function (e) {
              props.onSeason(Number(e.target.value));
            }}
          >
            {props.seasons.map(function (yr) {
              return (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              );
            })}
          </select>
        </div>
        <ExplainButton label="How this list is ordered and marked" title="How this list works">
          <ul>
            <li>
              {props.projWeek
                ? 'In order of projected points for Week ' + props.projWeek + ', highest first. A player with no projection is listed last, by cap hit.'
                : 'In order of projected points for the coming week, highest first.'}
            </li>
            <li>
              The figure after the team is his rank at his position in total EDFL points this season,
              among every NFL player: green, blue, orange or red by band (QB and K 1–5, 6–10, 11–15,
              16+; RB and TE 1–10, 11–20, 21–35, 36+; WR 1–15, 16–30, 31–45, 46+).
            </li>
            <li>
              Start is the share of his weeks on an active roster in which his points counted in the
              best-ball lineup; for an RB, WR or TE, split into his position and FLEX.
            </li>
            <li>
              The game line gives the opponent, @ for away, N for a neutral site, and the opponent&rsquo;s
              rank against his position (1st = fewest points allowed).
            </li>
            <li>
              Rows are red for IR, Out, Doubtful or PUP, yellow for a lesser designation, grey on a bye
              week. Tap the white pill for the injury report.
            </li>
            <li>A teal edge marks a rookie deal; a dashed edge a practice squad deal.</li>
          </ul>
        </ExplainButton>
      </div>

      {isCurrent ? (
        <div className="rc-seg" role="group" aria-label="Squad">
          {SQUADS.map(function (s) {
            const on = squad === s.key;
            const used = compliance ? compliance[s.used] : null;
            const limit = compliance ? compliance[s.limit] : null;
            const over = compliance ? Number(compliance[s.over]) > 0 : false;
            return (
              <button
                key={s.key}
                type="button"
                className={(on ? 'is-on' : '') + (over ? ' is-over' : '')}
                aria-pressed={on}
                onClick={function () {
                  setSquad(s.key);
                  setNonRookieOnly(false);
                }}
              >
                {s.label}
                {used !== null && used !== undefined && limit ? (
                  <span>
                    {used} of {limit}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="rc-pills" role="group" aria-label="Position">
        {PILLS.map(function (p) {
          const on = pill === p.key;
          return (
            <button
              key={p.key}
              type="button"
              className={'edfl-rr-pill' + (on ? ' is-on' : '')}
              aria-pressed={on}
              onClick={function () {
                setPill(p.key);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {nonRookieOnly && squad === 'taxi' ? (
        <p className="empty-note edfl-rr-filternote">
          Showing the practice squad players who are not on a rookie deal.{' '}
          <button
            type="button"
            className="edfl-rr-linkbtn"
            onClick={function () {
              setNonRookieOnly(false);
            }}
          >
            Show the whole practice squad
          </button>
        </p>
      ) : null}

      {props.extraError ? (
        <div className="form-error">
          Ranks, start rates and this week&rsquo;s games could not be read: {props.extraError}. The rows
          below show names only for those figures.
        </div>
      ) : null}
      {props.projError ? (
        <div className="form-error">
          This week&rsquo;s projections could not be loaded: {props.projError}. The roster is in cap-hit
          order instead.
        </div>
      ) : null}

      {isCurrent && props.projWeek ? (
        <div className="rc-colhead">WEEK {props.projWeek} · PTS / PROJ</div>
      ) : null}

      <div className={'rc-split' + (wide ? ' has-panel' : '')}>
        <div>
          <ul className="rc-list" aria-label={'Roster, ' + props.season}>
            {visible.map(function (r) {
              const x = isCurrent ? extra[r.id] || null : null;
              const tint = x && x.row_tint ? TINT[x.row_tint] || '' : '';
              const hasInj = Boolean(x && x.injury_flagged && r.playerId);
              const cls =
                'rc-row' +
                (CT[r.markerClass] ? ' ' + CT[r.markerClass] : '') +
                (tint ? ' ' + tint : '') +
                (hasInj ? ' has-inj' : '') +
                (panelPlayer && r.playerId === panelPlayer ? ' is-sel' : '');
              const team = r.nflTeam || 'FA';
              const bye = x && x.bye_week ? ' (' + x.bye_week + ')' : '';
              const game = gameLine(x);
              const posKey = POSITIONS.indexOf(r.position) >= 0 ? r.position : '';
              const xs = x ? Object.assign({ rank_position_label: r.position }, x) : null;
              return (
                <li key={r.id} className={cls}>
                  <a
                    className="rc-rowlink"
                    href={r.playerId ? '/player/' + r.playerId : undefined}
                    aria-label={r.name}
                    onClick={function (e) {
                      if (!r.playerId) return;
                      if (wide) {
                        e.preventDefault();
                        setSelected(r.playerId);
                      }
                    }}
                  >
                    <span className={'rc-pos' + (posKey ? ' is-' + posKey : '')} aria-hidden="true">
                      {r.position}
                    </span>
                    <RosterFace sleeperId={r.sleeperId} name={r.name} />
                    <span className="rc-id">
                      <span className="rc-name" style={{ display: 'block' }}>
                        {r.name}
                      </span>
                      <span className="rc-line" style={{ display: 'block' }}>
                        {r.position} &bull; {team}
                        {bye}
                        {isCurrent ? (
                          x && x.pos_rank ? (
                            <>
                              {' · '}
                              <span className={'rc-rank is-' + (x.rank_band || 'r')}>
                                {x.rank_position}
                                {x.pos_rank}
                              </span>
                            </>
                          ) : x ? (
                            ' · no ' + props.season + ' pts'
                          ) : null
                        ) : null}
                      </span>
                      {xs ? (
                        <span className="rc-line" style={{ display: 'block' }}>
                          <span className="rc-start">{startLine(xs)}</span>
                        </span>
                      ) : null}
                      {game ? (
                        <span className="rc-line" style={{ display: 'block' }}>
                          {game}
                        </span>
                      ) : null}
                    </span>
                    {isCurrent ? (
                      <span className="rc-pts">
                        <b>{x && x.week_points !== null && x.week_points !== undefined ? String(x.week_points) : '–'}</b>
                        <span>{r.projLabel ? r.projLabel : '–'}</span>
                      </span>
                    ) : null}
                  </a>
                  {hasInj ? (
                    <a
                      className={'rc-injpill' + (x.injury_qualifies ? ' is-severe' : '')}
                      href={'/player/' + r.playerId + '/injury'}
                      aria-label={'Injury report: ' + r.name + ', ' + (x.injury_status || x.injury_short)}
                    >
                      <InjuryPillIcon />
                      <span>{x.injury_short}</span>
                    </a>
                  ) : null}
                </li>
              );
            })}
            {visible.length === 0 ? <li className="rc-empty">No players in this section.</li> : null}
          </ul>
        </div>
        {wide ? (
          <aside className="rc-panel" aria-label="Mini Player Card">
            {panelPlayer ? (
              <iframe
                key={panelPlayer}
                ref={panelRef}
                name="edfl-panel"
                title="Mini Player Card"
                src={'/player/' + panelPlayer + '/mini'}
              />
            ) : (
              <p className="rc-panel-empty">No player in this section.</p>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
