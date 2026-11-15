'use client';

import { useState } from 'react';
import TeamDisc from '../../components/TeamDisc';
import { pts, signed, tone, shortName, record, kickoffShort, pct } from './matchupsFormat';

/**
 * BOX SCORE 1 -- both teams side by side (UI test batch 20, November 15, 2026).
 *
 * Lewis's boards Box1-390 (a week in progress), Box1-W9-diff-390 (a finished
 * week, his Choice 1) and Box1-W11-390 (a week to come). One component draws
 * all three from the week's state; MatchupsView puts it in the swipe-down
 * sheet on a phone and in the right-hand panel from 1024px (MatchA-1280).
 *
 * IT ADDS NOTHING UP. Each side's total, its difference against the
 * projection, the six position groups, the bye and injured counts and
 * points-per-game, every player's +/-, the red "no sub" spots, the empty spots
 * and the green practice-squad names all arrive from edfl_matchups_week_sides
 * and edfl_matchups_week_players. Bar widths are drawn from those values, and
 * that is the only arithmetic here.
 *
 * A player's row is a plain /player/<id> link, so the sheet host opens his
 * Mini Player Card over the box score. On a week to come his injury pill
 * links to /player/<id>/injury (the Roster tab's white pill).
 */

const INFO = {
  lineup:
    'Best ball: the highest scorers fill QB, 2 RB, 4 WR, 2 TE, 2 FLEX (RB, WR or TE) and K. A player who has not played counts at his projection until he does.',
  lineupProj:
    'The highest projections fill QB, 2 RB, 4 WR, 2 TE, 2 FLEX (RB, WR or TE) and K. A player on bye holds no spot.',
  groupsFinal:
    'Each bar is what the lineup scored at that position. The dashed outline is what those players were projected to score.',
  groupsProj: 'The projected points of the players in each position of the projected lineup.',
  injured:
    'A player on the active roster or IR with an IR, Out, Doubtful or PUP designation whose expected return is after this week’s last game, or who has no estimate. A player on bye counts under On bye only. Pts/gm is his season average.',
  ps: 'Practice squad players never score. A green name would have beaten the lowest lineup spot he could fill.',
};

export function Info(props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mx-xi"
        aria-label={props.label}
        aria-expanded={open}
        onClick={function (e) {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" />
          <path d="M8 7.2v4" />
          <circle cx="8" cy="4.9" r="0.55" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open ? (
        <span className="mx-tip" role="note" onClick={function (e) { e.stopPropagation(); }}>
          {INFO[props.k]}
        </span>
      ) : null}
    </>
  );
}

export function Disc(props) {
  return (
    <TeamDisc
      className={'kit-disc mx-disc ' + (props.size || '') + (props.me ? ' kit-disc-own' : '')}
      abbrev={props.side ? props.side.abbrev : ''}
    />
  );
}

// The bye / projected-injured table of a week to come (card and box score).
export function LostTable(props) {
  const L = props.left;
  const R = props.right;
  return (
    <span className="mx-ptab" role="group" aria-label="Players lost this week">
      <span className="mx-ptr mx-ptr-h">
        <span />
        <span className="mx-ph">Players &middot; avg pts/gm</span>
        <span />
      </span>
      <span className="mx-ptr">
        <span className="mx-pv"><b>{L.bye_count}</b><em>{pts(L.bye_ppg)} pts/gm</em></span>
        <span className="mx-pl">On bye</span>
        <span className="mx-pv r"><b>{R.bye_count}</b><em>{pts(R.bye_ppg)} pts/gm</em></span>
      </span>
      <span className="mx-ptr">
        <span className="mx-pv"><b>{L.inj_count}</b><em>{pts(L.inj_ppg)} pts/gm</em></span>
        <span className="mx-pl">Projected injured<Info k="injured" label="Who counts as projected injured" /></span>
        <span className="mx-pv r"><b>{R.inj_count}</b><em>{pts(R.inj_ppg)} pts/gm</em></span>
      </span>
      <span className="mx-ptr mx-tot">
        <span className="mx-pv"><b>{pts(L.ppg_lost)}</b></span>
        <span className="mx-pl">Pts/gm lost</span>
        <span className="mx-pv r"><b>{pts(R.ppg_lost)}</b></span>
      </span>
    </span>
  );
}

function PillIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M4.6 0.6h2.8v3.2h3.2v2.8H7.4v3.2H4.6V6.6H1.4V3.8h3.2z" fill="currentColor" />
    </svg>
  );
}

// The second line under a name: position, then the game or why there is none.
function subLine(row, state) {
  const pos = row.player_position || '';
  if (row.section === 'ps') {
    const bits = [pos, row.nfl_team || 'No NFL team'];
    if (row.game_state === 'bye') bits.push('Bye');
    else if (row.game_state === 'final' && state !== 'projected') bits.push('Final');
    return bits.filter(Boolean).join(' · ');
  }
  if (row.game_state === 'bye') return pos + ' · Bye';
  if (row.game_state === 'no_team') return pos + ' · No NFL team';
  const when =
    row.game_state === 'final' ? 'Final' : row.game_state === 'live' ? 'Live' : kickoffShort(row.kickoff_at);
  return pos + ' · ' + (row.nfl_team || '') + ' v ' + (row.opponent || '') + (when ? ' · ' + when : '');
}

function Value(props) {
  const row = props.row;
  const state = props.state;
  if (row.no_sub) {
    return (
      <span className="mx-vl">
        <b className="xr">{row.game_state === 'bye' || row.game_state === 'no_team' ? 'BYE' : 'OUT'}</b>
        <span>no sub</span>
      </span>
    );
  }
  if (row.game_state === 'bye') {
    return (
      <span className="mx-vl"><b className="z">&mdash;</b><span>bye</span></span>
    );
  }
  if (row.game_state === 'no_team') {
    return (
      <span className="mx-vl"><b className="z">&mdash;</b><span>&nbsp;</span></span>
    );
  }
  if (state === 'final') {
    return (
      <span className="mx-vl">
        <b>{pts(row.points)}</b>
        <span>{row.vs_proj === null || row.vs_proj === undefined ? 'no proj' : <i className={'mx-dv ' + tone(row.vs_proj)}>{signed(row.vs_proj)}</i>}</span>
      </span>
    );
  }
  if (state === 'live') {
    const played = row.game_state === 'final' || row.game_state === 'live';
    return (
      <span className="mx-vl">
        {played ? <b>{pts(row.points)}</b> : <b className="z">&mdash;</b>}
        <span>{row.proj_points === null || row.proj_points === undefined ? 'no proj' : pts(row.proj_points)}</span>
      </span>
    );
  }
  const has = row.proj_points !== null && row.proj_points !== undefined;
  return (
    <span className="mx-vl">
      <b className="z">{has ? pts(row.proj_points) : '—'}</b>
      <span>{has ? 'proj' : 'no proj'}</span>
    </span>
  );
}

function Cell(props) {
  const row = props.row;
  const right = props.side === 'r';
  const state = props.state;
  if (!row) return <span className={'mx-pc' + (right ? ' r' : '')} />;
  if (!row.player_id) {
    return (
      <span className={'mx-pc em ux' + (right ? ' r' : '')}>
        {'Empty' + (row.empty_reason ? ' · ' + row.empty_reason : '')}
      </span>
    );
  }
  const cls =
    'mx-pc' + (right ? ' r' : '') + (row.no_sub ? ' ux' : '') + (row.ps_would_start ? ' gs' : '');
  const tag =
    state === 'live' && row.injury_tag ? (
      <span className={'mx-it ' + (row.injury_tone || 'bad')} title={row.injury_status || ''}>
        {row.injury_tag}
      </span>
    ) : null;
  const name = shortName(row.full_name);
  const sub =
    state === 'final' && row.past_label ? (
      <span className="mx-sub2">
        <span>{row.player_position} &middot;&nbsp;</span>
        <em className="ixo">{row.past_label}</em>
      </span>
    ) : (
      <span>{subLine(row, state)}</span>
    );
  const inner = (
    <>
      <span className="mx-tx">
        <b>
          {right ? tag : null}
          <span className="mx-nmx">{name}</span>
          {right ? null : tag}
        </b>
        {sub}
      </span>
      <Value row={row} state={state} />
    </>
  );
  const href = '/player/' + row.player_id;
  const label = row.full_name + ': open player card';
  if (state === 'projected' && row.injury_short) {
    return (
      <span className={cls}>
        <a
          className={'mx-ipill' + (row.injury_severe ? ' sev' : '')}
          href={'/player/' + row.player_id + '/injury'}
          aria-label={'Injury report: ' + row.full_name + ', ' + (row.injury_status || row.injury_short)}
        >
          <PillIcon />
          <span>{row.injury_short}</span>
        </a>
        <a className="mx-pcin" href={href} aria-label={label}>
          {inner}
        </a>
      </span>
    );
  }
  return (
    <a className={cls} href={href} aria-label={label}>
      {inner}
    </a>
  );
}

function pairs(left, right) {
  const n = Math.max(left.length, right.length);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push([left[i] || null, right[i] || null]);
  return out;
}

function Rows(props) {
  return pairs(props.left, props.right).map(function (pr, i) {
    const a = pr[0];
    const b = pr[1];
    const lab =
      props.section === 'lineup'
        ? (a && a.slot_group) || (b && b.slot_group) || ''
        : props.section === 'ps'
        ? 'PS'
        : 'BN';
    return (
      <div className="mx-mr" key={props.section + i}>
        <Cell row={a} side="l" state={props.state} />
        <span className={'mx-sl' + (props.section === 'lineup' ? '' : ' bn')}>{lab}</span>
        <Cell row={b} side="r" state={props.state} />
      </div>
    );
  });
}

function GroupsFinal(props) {
  const L = props.left.groups || [];
  const R = props.right.groups || [];
  let max = 0;
  L.concat(R).forEach(function (g) {
    max = Math.max(max, Number(g.pts) || 0, Number(g.proj) || 0);
  });
  // The largest bar stops at 74% so its +/- fits after it (Lewis's Choice 1).
  const scale = max > 0 ? max / 0.74 : 1;
  function track(g, color) {
    const a = pct(g.pts, scale);
    const p = pct(g.proj, scale);
    return (
      <span className="mx-trk">
        <i className="gh" style={{ width: p + '%' }} />
        <i className="ac" style={{ width: a + '%', background: color }} />
        <em className="mx-dlab" style={{ left: 'calc(' + Math.max(a, p) + '% + 5px)' }}>
          <i className={'mx-dv ' + tone(g.diff)}>{signed(g.diff)}</i>
        </em>
      </span>
    );
  }
  return (
    <div className="mx-pg">
      {L.map(function (g, i) {
        const r = R[i] || { pts: 0, proj: 0, diff: 0 };
        return (
          <div className="mx-gr fx" key={g.grp}>
            <span>{g.grp}</span>
            <span className="mx-bars">
              {track(g, 'var(--neon)')}
              {track(r, 'var(--mx-bar-o)')}
            </span>
            <span className="mx-vals">
              <b>
                <i className={'mx-dv ' + tone(g.diff)}>{pts(g.pts)}</i> <em>({pts(g.proj)})</em>
              </b>
              <span>
                <i className={'mx-dv ' + tone(r.diff)}>{pts(r.pts)}</i> <em>({pts(r.proj)})</em>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GroupsProj(props) {
  const L = props.left.groups || [];
  const R = props.right.groups || [];
  let max = 0;
  L.concat(R).forEach(function (g) {
    max = Math.max(max, Number(g.proj) || 0);
  });
  return (
    <div className="mx-pg">
      {L.map(function (g, i) {
        const r = R[i] || { proj: 0 };
        return (
          <div className="mx-gr" key={g.grp}>
            <span>{g.grp}</span>
            <span className="mx-bars">
              <i style={{ width: Math.max(pct(g.proj, max), 2) + '%', background: 'var(--neon)' }} />
              <i style={{ width: Math.max(pct(r.proj, max), 2) + '%', background: 'var(--mx-bar-o)' }} />
            </span>
            <span className="mx-vals">
              <b>{pts(g.proj)}</b>
              <span>{pts(r.proj)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function sideScore(side, other, state) {
  if (state === 'projected') {
    return (
      <span className="mx-t">
        <b className="pj">{pts(side.proj_total)}</b>
        <span>projected</span>
      </span>
    );
  }
  const behind = Number(side.points) < Number(other.points);
  if (state === 'final') {
    return (
      <span className="mx-t">
        <b className={behind ? 'tr' : ''}>{pts(side.points)}</b>
        <span>
          <i className={'mx-dv ' + tone(side.vs_proj)}>{signed(side.vs_proj)}</i> vs proj
        </span>
      </span>
    );
  }
  return (
    <span className="mx-t">
      <b className={behind ? 'tr' : ''}>{pts(side.points)}</b>
      <span>{side.proj_final === null || side.proj_final === undefined ? '' : '(' + pts(side.proj_final) + ')'}</span>
    </span>
  );
}

export default function BoxScore(props) {
  const L = props.left;
  const R = props.right;
  const state = props.state;
  const rows = props.rows || [];
  function of(team, section) {
    return rows
      .filter(function (r) {
        return r.team_id === team && r.section === section;
      })
      .sort(function (a, b) {
        return a.row_order - b.row_order;
      });
  }
  const lb = of(L.team_id, 'bench');
  const rb = of(R.team_id, 'bench');
  const lp = of(L.team_id, 'ps');
  const rp = of(R.team_id, 'ps');
  const result = props.result || null;
  const winner = result && result.winner ? (result.winner === L.team_id ? L : result.winner === R.team_id ? R : null) : null;

  return (
    <>
      <div className="mx-shd" {...(props.dragProps || {})}>
        {props.mode === 'sheet' ? <span className="mx-grip" aria-hidden="true" /> : null}
        <div className="mx-shh">
          <span className="mx-ey">Week {props.week} &middot; Box score</span>
          {props.onClose ? (
            <button type="button" className="mx-cls" aria-label="Close" onClick={props.onClose} ref={props.closeRef}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="mx-bxf">
          <span className="mx-sd">
            <Disc side={L} size="l" me={L.team_id === props.myTeamId} />
            {sideScore(L, R, state)}
          </span>
          <span className="mx-mid">vs</span>
          <span className="mx-sd r">
            <Disc side={R} size="l" me={R.team_id === props.myTeamId} />
            {sideScore(R, L, state)}
          </span>
        </div>
        <div className="mx-bxn">
          <span>
            {L.team_name}
            <em>{record(L)}{L.owner_name ? ' · ' + L.owner_name : ''}</em>
          </span>
          <span>
            {R.team_name}
            <em>{record(R)}{R.owner_name ? ' · ' + R.owner_name : ''}</em>
          </span>
        </div>
        {state === 'final' ? (
          <div className="mx-chiprow">
            <span className="mx-chip fin">Final</span>
            <span>
              {winner && result.margin !== null && result.margin !== undefined
                ? winner.team_name + ' by ' + pts(result.margin)
                : ''}
            </span>
          </div>
        ) : state === 'live' ? (
          <div className="mx-chiprow">
            <span className="mx-chip live"><i />In progress</span>
            <span>Yet to play {L.yet_to_play} &middot; {R.yet_to_play}</span>
          </div>
        ) : null}
      </div>
      <div className="mx-shb">
        {state === 'projected' ? <LostTable left={L} right={R} /> : null}
        {state === 'final' ? (
          <>
            <div className="mx-lh">
              <b>Points by position, against projection<Info k="groupsFinal" label="How these are worked out" /></b>
            </div>
            <GroupsFinal left={L} right={R} />
            <div className="mx-lgd">
              <span><i style={{ background: 'var(--neon)' }} />{L.abbrev}</span>
              <span><i style={{ background: 'var(--mx-bar-o)' }} />{R.abbrev}</span>
              <span><i className="gl" />Projected</span>
            </div>
            <p className="mx-cap">Actual points, and how far over or under the projection.</p>
          </>
        ) : null}
        {state === 'projected' ? (
          <>
            <div className="mx-lh">
              <b>Projected points by position<Info k="groupsProj" label="How these are worked out" /></b>
            </div>
            <GroupsProj left={L} right={R} />
            <div className="mx-lgd">
              <span><i style={{ background: 'var(--neon)' }} />{L.abbrev}</span>
              <span><i style={{ background: 'var(--mx-bar-o)' }} />{R.abbrev}</span>
            </div>
          </>
        ) : null}
        <div className="mx-lh">
          <b>
            {state === 'projected' ? 'Projected lineup' : 'Lineup'}
            <Info k={state === 'projected' ? 'lineupProj' : 'lineup'} label="How the best-ball lineup is picked" />
          </b>
          <span>12 slots</span>
        </div>
        <Rows left={of(L.team_id, 'lineup')} right={of(R.team_id, 'lineup')} section="lineup" state={state} />
        <div className="mx-lh">
          <b>Bench</b>
          <span>{lb.length} &middot; {rb.length}</span>
        </div>
        <Rows left={lb} right={rb} section="bench" state={state} />
        <div className="mx-lh">
          <b>
            Practice squad
            <Info k="ps" label="Practice squad players never score; green means he would have made the lineup" />
          </b>
          <span>{lp.length} &middot; {rp.length}</span>
        </div>
        <Rows left={lp} right={rp} section="ps" state={state} />
      </div>
    </>
  );
}
