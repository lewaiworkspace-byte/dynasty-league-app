'use client';

import ExplainButton from '../../../components/ExplainButton';

/**
 * POSITION RANKINGS -- Team HQ Overview, November 11, 2026 (UI test batch 7).
 *
 * Lewis's direction, read back and approved that night (Team HQ design canvas
 * and the projections chat):
 *   - "Production is more important than beating projections." Each row leads
 *     with points a week from that position's STARTING spots (the players who
 *     counted in best ball), the rank among the teams and the league average.
 *   - Colour compares the team with the LEAGUE, never with 100% of projected
 *     ("it doesn't matter if your team is beating projections if everyone is
 *     beating projections"): only the "vs league" chip is coloured.
 *   - Beating projections is a small, uncoloured second line: every rostered
 *     player at the position against his projection, against the league's
 *     same figure.
 *   - "FLEX really becomes an indicator of roster depth": FLEX is the Depth row,
 *     with which positions filled the spots, and a short blurb under the table.
 *   - No explanation paragraph: the explain icon (components/ExplainButton.js).
 *
 * THIS FILE DECIDES NOTHING AND ADDS NOTHING UP. Every figure, rank and
 * difference is a column of edfl_team_position_rankings(); page.js hands over
 * this team's seven rows and the number of teams the function returned. Here
 * numbers are only FORMATTED (one decimal, a sign, an ordinal), a bar width is
 * a ratio of two of its columns (geometry, clamped), and the blurb compares
 * three integer counts the function returned.
 */

const ROW_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', FLEX: 'Depth', ALL: 'Total' };

const POS_WORDS = {
  RB: ['running back', 'running backs'],
  WR: ['receiver', 'receivers'],
  TE: ['tight end', 'tight ends'],
};

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function one(v) {
  const n = num(v);
  return n === null ? '—' : n.toFixed(1);
}

// A signed difference: "+6.7", "−5.0" (a real minus sign), or "level".
function signed(v, digits) {
  const n = num(v);
  if (n === null) return null;
  const text = Math.abs(n).toFixed(digits);
  if (Number(text) === 0) return 'level';
  return (n > 0 ? '+' : '−') + text;
}

function ordinal(v) {
  const n = num(v);
  if (n === null) return '—';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return n + 'th';
  const last = n % 10;
  if (last === 1) return n + 'st';
  if (last === 2) return n + 'nd';
  if (last === 3) return n + 'rd';
  return n + 'th';
}

// A bar width or a tick position, in percent of the league's best. Geometry,
// not league arithmetic; clamped so a bad row cannot overflow its track.
function share(part, whole) {
  const p = num(part);
  const w = num(whole);
  if (p === null || w === null || w <= 0) return null;
  return Math.max(0, Math.min(100, (p / w) * 100));
}

function possessive(name) {
  return /s$/i.test(name) ? name + '’' : name + '’s';
}

function countWord(key, n) {
  return POS_WORDS[key][n === 1 ? 0 : 1] + ' ' + n;
}

/**
 * THE FLEX BLURB (Lewis, November 11: "a pithy way to explain who is filling a
 * team's FLEX positions ... as simple as writing a short blurb"). Wording and
 * thresholds as read back that night: one position in every spot; "nearly
 * every" at 90% or more; "most" at 60% or more; otherwise "split". Descriptive
 * only, never advice. "Your" on the owner's own team, the team's name elsewhere.
 */
function flexBlurb(rb, wr, te, isMine, teamName) {
  const counts = [
    { key: 'RB', n: num(rb) || 0 },
    { key: 'WR', n: num(wr) || 0 },
    { key: 'TE', n: num(te) || 0 },
  ];
  const total = counts[0].n + counts[1].n + counts[2].n;
  if (total === 0) return 'No FLEX spot has been filled in a final week yet.';
  counts.sort(function (a, b) {
    return b.n - a.n;
  });
  const lead = counts[0];
  const rest = counts.slice(1).filter(function (c) {
    return c.n > 0;
  });
  const whose = isMine ? 'Your' : possessive(teamName || 'This team');
  const leadOne = POS_WORDS[lead.key][0];
  const leadMany = POS_WORDS[lead.key][1];
  const restText = rest
    .map(function (c) {
      return countWord(c.key, c.n);
    })
    .join(', ');

  if (lead.n === total) {
    return (
      'Every FLEX spot has gone to a ' + leadOne + ' (' + lead.n + ' of ' + total + '). ' +
      whose + ' backup ' + leadMany + ' are outscoring the rest of the bench.'
    );
  }
  if (lead.n * 10 >= total * 9) {
    return (
      'Nearly every FLEX spot has gone to a ' + leadOne + ' (' + lead.n + ' of ' + total + '); ' +
      restText + '. ' + whose + ' backup ' + leadMany + ' are outscoring the rest of the bench.'
    );
  }
  if (lead.n * 10 >= total * 6) {
    return (
      leadMany.charAt(0).toUpperCase() + leadMany.slice(1) + ' fill most FLEX spots (' +
      lead.n + ' of ' + total + '); ' + restText + '. ' +
      whose + ' backup ' + leadMany + ' are outscoring the rest of the bench.'
    );
  }
  const named = counts.filter(function (c) {
    return c.n > 0;
  });
  const second = counts[1];
  return (
    'FLEX is split: ' +
    named
      .map(function (c) {
        return countWord(c.key, c.n);
      })
      .join(', ') +
    ' (of ' + total + '). ' +
    whose + ' backup ' + leadMany + ' and ' + POS_WORDS[second.key][1] +
    ' trade the spots week to week.'
  );
}

function flexSplit(r) {
  const parts = [];
  [['RB', r.flex_rb], ['WR', r.flex_wr], ['TE', r.flex_te]].forEach(function (p) {
    const n = num(p[1]);
    if (n) parts.push(p[0] + ' ' + n);
  });
  return parts.length ? 'FLEX: ' + parts.join(' · ') : 'FLEX: none yet';
}

function ProjLine(props) {
  const r = props.row;
  const pct = num(r.proj_pct);
  if (pct === null) {
    return <span className="edfl-pr-proj">vs projections: none stored yet</span>;
  }
  const diff = signed(Math.round(num(r.proj_vs_league)), 0);
  const tip =
    Math.round(pct) + '% of projected; league ' + Math.round(num(r.league_proj_pct)) +
    '%; ' + ordinal(r.proj_rank) + ' of ' + props.teamCount;
  return (
    <span className="edfl-pr-proj" title={tip}>
      vs projections: {diff === 'level' ? 'level with the league' : diff + ' vs league'}
    </span>
  );
}

function Row(props) {
  const r = props.row;
  const vs = signed(r.pts_vs_league, 1);
  const tone = vs === null || vs === 'level' ? 'is-level' : num(r.pts_vs_league) > 0 ? 'is-ahead' : 'is-behind';
  const fill = share(r.pts_per_week, r.best_per_week);
  const tick = share(r.league_per_week, r.best_per_week);
  const isFlex = r.row_key === 'FLEX';
  return (
    <div className={'edfl-pr-row' + (r.row_key === 'ALL' ? ' is-total' : '')} role="row">
      <span className="edfl-pr-pos" role="rowheader">
        {ROW_LABEL[r.row_key] || r.row_key}
      </span>
      <span className="edfl-pr-you" role="cell">
        <span className="edfl-pr-num">{one(r.pts_per_week)}</span>
        <span className="edfl-pr-rank" title={'Rank among the ' + props.teamCount + ' teams'}>
          {ordinal(r.pts_rank)}
        </span>
      </span>
      <span className="edfl-pr-lg edfl-pr-num" role="cell">
        {one(r.league_per_week)}
      </span>
      <span className="edfl-pr-vscell" role="cell">
        {vs === null ? null : (
          <span className={'edfl-pr-vs ' + tone}>{vs === 'level' ? 'level' : vs}</span>
        )}
      </span>
      <span className="edfl-pr-bar" aria-hidden="true">
        {fill !== null ? <span className="edfl-pr-fill" style={{ width: fill + '%' }} /> : null}
        {tick !== null ? <span className="edfl-pr-tick" style={{ left: tick + '%' }} /> : null}
      </span>
      <span className="edfl-pr-sub">
        {isFlex ? <span className="edfl-pr-proj">{flexSplit(r)}</span> : <ProjLine row={r} teamCount={props.teamCount} />}
      </span>
    </div>
  );
}

export default function PositionRankings(props) {
  const data = props.data;
  const isMine = Boolean(props.isMine);
  const season = props.season;
  const rows = data && Array.isArray(data.rows) ? data.rows : [];
  const teamCount = data ? data.teamCount : null;
  const first = rows[0] || null;
  const weeks = first ? num(first.weeks) : 0;
  const projWeeks = first ? num(first.proj_weeks) : 0;
  const flexRow = rows.filter(function (r) {
    return r.row_key === 'FLEX';
  })[0];
  const your = isMine ? 'your' : 'this team’s';

  let body;
  if (props.gated) {
    body = (
      <p className="empty-note">
        Your login is not linked to a team yet, so position rankings are not shown.
      </p>
    );
  } else if (props.error) {
    body = <div className="form-error">Position rankings could not be loaded: {props.error}.</div>;
  } else if (!first || !weeks) {
    body = (
      <p className="empty-note">No week of {season} is final yet, so there is nothing to rank.</p>
    );
  } else {
    body = (
      <>
        <div className="edfl-pr-card" role="table" aria-label="Position rankings">
          <div className="edfl-pr-row edfl-pr-headrow" role="row">
            <span className="edfl-pr-pos" role="columnheader">Spot</span>
            <span className="edfl-pr-you" role="columnheader">Per week</span>
            <span className="edfl-pr-lg" role="columnheader">League</span>
            <span className="edfl-pr-vscell" role="columnheader">vs league</span>
          </div>
          {rows.map(function (r) {
            return <Row key={r.row_key} row={r} teamCount={teamCount} />;
          })}
        </div>
        {flexRow ? (
          <p className="edfl-pr-blurb">
            {flexBlurb(flexRow.flex_rb, flexRow.flex_wr, flexRow.flex_te, isMine, props.teamName)}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="edfl-hq-block">
      <div className="edfl-explain-h edfl-explain-host">
        <h2 className="section-heading">Position rankings</h2>
        <ExplainButton label="How Position rankings is calculated">
          <ul>
            <li>
              Per week is the points scored from {your} starting spots at each position, the
              players who counted in best ball, averaged over the {weeks || 0} final weeks of{' '}
              {season}.
            </li>
            <li>
              League is the average of the {teamCount ? teamCount + ' ' : ''}teams, and the pill
              is the rank among them. Green or red compares with the league average, never with a
              target.
            </li>
            <li>
              Depth is the two FLEX spots: the best running backs, receivers and tight ends left
              after the starters. The note under the table says which positions filled them.
            </li>
            <li>
              vs projections compares every rostered player at the position, counted or not,
              with his own projection, then with the league&rsquo;s same figure. Only weeks with
              projections stored count ({projWeeks || 0} of {weeks || 0}).
            </li>
            <li>The bar runs to the league&rsquo;s best; the mark across it is the league average.</li>
          </ul>
        </ExplainButton>
      </div>
      {body}
    </div>
  );
}
