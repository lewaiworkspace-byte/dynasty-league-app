'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import BoxScore, { Disc, LostTable } from './BoxScore';
import { pts, record, shortName, weekRange, STATE_WORDS } from './matchupsFormat';

/**
 * THE MATCHUPS TAB'S SCREEN (UI test batch 20, November 15, 2026). page.js
 * carries the reads; this file draws one week.
 *
 *   - The week pager: arrows, the fourteen dots (a finished week's dot is
 *     solid) and a sideways swipe anywhere on the page all change ?week=.
 *   - YOUR MATCHUP is Option B's card on the week in progress (logos, record,
 *     score with the projected final in brackets, the projected-finals bar,
 *     the Yet to play dots, the twelve-slot lineup preview and "Full box
 *     score with bench") and Option A's card on a finished week
 *     (MatchA-W9-390) or a week to come (MatchA-W11-390, with the bye and
 *     projected-injured table).
 *   - THE OTHER FOUR GAMES are Option A's two-line cards.
 *   - A TAP ON ANY CARD opens its box score (BoxScore.js): a sheet you swipe
 *     down, X, Esc or back out of on a phone; the right-hand panel from 1024px.
 *     The whole card is the control now, which retires the old Scoreboard's
 *     "the card is not one anchor" rule (scoreboard-and-matchups.md).
 *
 * NO NARRATIVE SENTENCES (Lewis): labels and numbers only.
 *
 * ?box=M IS KEPT IN THE ADDRESS. Opening pushes one history entry (so the
 * phone's back gesture closes the sheet) through window.history, which Next
 * 14.2 keeps in step with its router; closing steps back. A box given in the
 * URL on arrival opens with no entry of its own, and closing it replaces the
 * address instead.
 */

const WIDE = '(min-width: 1024px)';

function Chevron(props) {
  return (
    <svg width={props.size || 18} height={props.size || 18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={props.w || 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={props.left ? 'M12.5 4.5 7 10l5.5 5.5' : 'M7.5 4.5 13 10l-5.5 5.5'} />
    </svg>
  );
}

function Pips(props) {
  const n = props.slots || 0;
  const played = Math.max(0, n - (props.ytp || 0));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = props.right ? i >= n - played : i < played;
    out.push(<i key={i} className={p ? 'p' : ''} />);
  }
  return <span className="mx-pips" aria-hidden="true">{out}</span>;
}

// The lineup preview on your card (week in progress only).
function Preview(props) {
  function of(team) {
    return props.rows
      .filter(function (r) {
        return r.team_id === team && r.section === 'lineup';
      })
      .sort(function (a, b) {
        return a.row_order - b.row_order;
      });
  }
  const l = of(props.left.team_id);
  const r = of(props.right.team_id);
  const n = Math.max(l.length, r.length);
  function val(row, right) {
    const cls = 'v' + (right ? ' l' : '');
    if (!row) return <span className={cls} />;
    if (!row.player_id) return <span className={cls + ' xr'}>&nbsp;</span>;
    if (row.no_sub)
      return <span className={cls + ' xr'}>{row.game_state === 'bye' || row.game_state === 'no_team' ? 'BYE' : 'OUT'}</span>;
    const played = row.game_state === 'final' || row.game_state === 'live';
    if (played) return <span className={cls}>{pts(row.points)}</span>;
    return <span className={cls + ' z'}>{pts(row.proj_points)}</span>;
  }
  function nm(row, right) {
    const cls = 'n' + (right ? ' r' : '');
    if (!row) return <span className={cls} />;
    if (!row.player_id) return <span className={cls + ' xr'}>Empty</span>;
    return <span className={cls + (row.no_sub ? ' xr' : '')}>{shortName(row.full_name)}</span>;
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = l[i] || null;
    const b = r[i] || null;
    out.push(
      <span className="mx-lr" key={i}>
        {nm(a, false)}
        {val(a, false)}
        <span className="sl">{(a && a.slot_group) || (b && b.slot_group) || ''}</span>
        {val(b, true)}
        {nm(b, true)}
      </span>
    );
  }
  return <span className="mx-lp">{out}</span>;
}

function HeroSide(props) {
  const s = props.side;
  const o = props.other;
  const state = props.state;
  const behind = state !== 'projected' && Number(s.points) < Number(o.points);
  return (
    <span className="mx-sd">
      <Disc side={s} size={props.big ? 'xl' : 'l'} me={props.me} />
      <span className="mx-nm">{s.team_name}</span>
      <span className="mx-rc">
        {record(s)}
        {props.big && s.owner_name ? ' · ' + s.owner_name : ''}
      </span>
      {state === 'projected' ? (
        <>
          <span className="mx-big pj">{pts(s.proj_total)}</span>
          <span className="mx-pf">projected</span>
        </>
      ) : (
        <>
          <span className={'mx-big' + (behind ? ' tr' : '')}>{pts(s.points)}</span>
          {state === 'live' && s.proj_final !== null && s.proj_final !== undefined ? (
            <span className="mx-pf">({pts(s.proj_final)})</span>
          ) : null}
        </>
      )}
    </span>
  );
}

function Hero(props) {
  const L = props.left;
  const R = props.right;
  const state = props.state;
  const live = state === 'live';
  const result = props.result;
  let chip;
  if (state === 'final') {
    const won = result && result.winner === L.team_id;
    const lost = result && result.winner === R.team_id;
    chip = (
      <span className="mx-chips">
        <span className="mx-chip fin">Final</span>
        {won ? <span className="mx-chip w">Win</span> : lost ? <span className="mx-chip l">Loss</span> : <span className="mx-chip fin">Tie</span>}
      </span>
    );
  } else if (live) {
    chip = <span className="mx-chip live"><i />In progress</span>;
  } else {
    chip = <span className="mx-chip proj">Projected</span>;
  }
  const a = Number(L.proj_final) || 0;
  const b = Number(R.proj_final) || 0;
  const share = a + b > 0 ? (a / (a + b)) * 100 : 50;
  let margin = null;
  if (state === 'final' && result && result.margin !== null && result.margin !== undefined) {
    margin =
      result.winner === L.team_id
        ? 'Won by ' + pts(result.margin)
        : result.winner === R.team_id
        ? 'Lost by ' + pts(result.margin)
        : 'Tied';
  }
  return (
    <div
      className="mx-hero"
      onClick={function () {
        props.onOpen();
      }}
    >
      <span className="mx-top">
        <span className="mx-ey">Your matchup</span>
        {chip}
      </span>
      <span className="mx-fo">
        <HeroSide side={L} other={R} state={state} big={!live} me />
        <span className="mx-vs">vs</span>
        <HeroSide side={R} other={L} state={state} big={!live} />
      </span>
      {live ? (
        <>
          {L.proj_final !== null && L.proj_final !== undefined ? (
            <>
              <span className="mx-pbar" role="img" aria-label={'Projected finals ' + pts(a) + ' to ' + pts(b)}>
                <i style={{ width: share + '%', background: 'var(--neon)' }} />
                <i style={{ width: 100 - share + '%', background: 'var(--mx-bar-o)' }} />
              </span>
              <span className="mx-pbl">
                <span>{pts(a)}</span>
                <span>Projected finals</span>
                <span>{pts(b)}</span>
              </span>
            </>
          ) : null}
          <span className="mx-ytp">
            <Pips slots={L.lineup_slots} ytp={L.yet_to_play} />
            <span>Yet to play</span>
            <span className="r"><Pips slots={R.lineup_slots} ytp={R.yet_to_play} right /></span>
          </span>
          <span className="mx-ytp mx-ytn">
            <span>{L.yet_to_play} of {L.lineup_slots}</span>
            <span />
            <span className="r">{R.yet_to_play} of {R.lineup_slots}</span>
          </span>
          <Preview rows={props.rows} left={L} right={R} />
        </>
      ) : null}
      {margin ? <span className="mx-pbl mx-margin">{margin}</span> : null}
      {state === 'projected' ? <LostTable left={L} right={R} /> : null}
      <button
        type="button"
        className="mx-go"
        aria-label={'Open the box score: ' + L.team_name + ' v ' + R.team_name}
        onClick={function (e) {
          e.stopPropagation();
          props.onOpen();
        }}
      >
        {live ? 'Full box score with bench' : 'Box score'} <Chevron size={14} w={2.2} />
      </button>
    </div>
  );
}

function ListSide(props) {
  const s = props.side;
  const o = props.other;
  const state = props.state;
  let score;
  if (state === 'projected') {
    score = (
      <span className="mx-s pj">
        {pts(s.proj_total)}
        <em>proj</em>
      </span>
    );
  } else if (state === 'live') {
    const none = Number(s.points) === 0;
    score = (
      <span className={'mx-s' + (none ? ' pj' : Number(s.points) < Number(o.points) ? ' tr' : '')}>
        {none ? '—' : pts(s.points)}
        {s.proj_final !== null && s.proj_final !== undefined ? <em>({pts(s.proj_final)})</em> : null}
      </span>
    );
  } else {
    const won = props.result && props.result.winner === s.team_id;
    const lost = props.result && props.result.winner === o.team_id;
    score = (
      <span className={'mx-s' + (lost ? ' tr' : '')}>
        {pts(s.points)}
        {won ? <i className="mx-wn" aria-label="won" /> : null}
      </span>
    );
  }
  return (
    <span className="mx-ln">
      <Disc side={s} size="s" me={props.me} />
      <span className="mx-nm">
        <span className="mx-nmx">{s.team_name}</span>
        <em>{record(s)}</em>
      </span>
      {score}
    </span>
  );
}

function ListCard(props) {
  const L = props.left;
  const R = props.right;
  const state = props.state;
  let foot;
  if (state === 'projected') foot = 'On bye ' + L.bye_count + ' · ' + R.bye_count;
  else if (state === 'live') foot = 'Yet to play ' + L.yet_to_play + ' · ' + R.yet_to_play;
  else foot = props.result && props.result.margin !== null && props.result.margin !== undefined ? 'Margin ' + pts(props.result.margin) : '';
  return (
    <button
      type="button"
      className={'mx-mc' + (props.selected ? ' is-sel' : '')}
      aria-label={'Open the box score: ' + L.team_name + ' v ' + R.team_name}
      onClick={props.onOpen}
    >
      <ListSide side={L} other={R} state={state} result={props.result} me={props.mineL} />
      <ListSide side={R} other={L} state={state} result={props.result} />
      <span className="mx-ft">
        <span>{foot}</span>
        <b>{state === 'projected' ? 'Projection ›' : 'Box score ›'}</b>
      </span>
    </button>
  );
}

export default function MatchupsView(props) {
  const router = useRouter();
  const week = props.week;
  const weeks = props.weeks;
  const myTeamId = props.myTeamId;
  const sides = props.sides || [];
  const rows = props.players || [];

  // Pair the sides of each matchup; yours on the left, otherwise home.
  const games = [];
  const seen = {};
  sides.forEach(function (s) {
    if (seen[s.matchup_id]) return;
    const both = sides.filter(function (x) {
      return x.matchup_id === s.matchup_id;
    });
    seen[s.matchup_id] = true;
    let home = both.find(function (x) { return x.is_home; }) || both[0];
    let away = both.find(function (x) { return x !== home; }) || null;
    if (!away) return;
    const mine = myTeamId && (home.team_id === myTeamId || away.team_id === myTeamId);
    if (mine && away.team_id === myTeamId) {
      const t = home;
      home = away;
      away = t;
    }
    games.push({ id: s.matchup_id, left: home, right: away, mine: Boolean(mine) });
  });
  const myGame = games.find(function (g) { return g.mine; }) || null;
  const others = games.filter(function (g) { return !g.mine; });
  const state = sides.length > 0 ? sides[0].week_state : 'projected';
  const wk = weeks.find(function (w) { return w.week_number === week; }) || null;
  const idx = weeks.findIndex(function (w) { return w.week_number === week; });
  const prevWeek = idx > 0 ? weeks[idx - 1].week_number : null;
  const nextWeek = idx >= 0 && idx < weeks.length - 1 ? weeks[idx + 1].week_number : null;

  const [box, setBox] = useState(
    props.initialBox && games.some(function (g) { return g.id === props.initialBox; }) ? props.initialBox : null
  );
  const [wide, setWide] = useState(false);
  const pushedRef = useRef(false);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const swipeRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(function () {
    let mq;
    try {
      mq = window.matchMedia(WIDE);
    } catch (e) {
      return undefined;
    }
    function on() {
      setWide(mq.matches);
    }
    on();
    if (mq.addEventListener) mq.addEventListener('change', on);
    return function () {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
    };
  }, []);

  // No prefetch of the weeks either side (UI test batch 40, November 22, 2026). Each one was a
  // full server render of /matchups, top bar included, so every visit built three pages and the
  // test database ran out of connections under load. The week arrows load a week when pressed.

  const goWeek = useCallback(
    function (n) {
      if (!n || n === week) return;
      router.push('/matchups?week=' + n, { scroll: false });
    },
    [router, week]
  );

  const openBox = useCallback(
    function (id) {
      try {
        returnFocusRef.current = document.activeElement;
      } catch (e) {
        returnFocusRef.current = null;
      }
      setBox(id);
      try {
        const st = Object.assign({}, window.history.state || {}, { mxBox: id });
        window.history.pushState(st, '', '/matchups?week=' + week + '&box=' + id);
        pushedRef.current = true;
      } catch (e) {
        pushedRef.current = false;
      }
    },
    [week]
  );

  const closeBox = useCallback(
    function () {
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
        return;
      }
      setBox(null);
      try {
        window.history.replaceState(window.history.state, '', '/matchups?week=' + week);
      } catch (e) {
        /* the address keeps ?box=; nothing else depends on it */
      }
    },
    [week]
  );

  // Back (or the swipe-down's history.back) closes the sheet.
  useEffect(
    function () {
      function onPop() {
        let id = null;
        try {
          const v = Number(new URL(window.location.href).searchParams.get('box'));
          id = Number.isInteger(v) && v > 0 ? v : null;
        } catch (e) {
          id = null;
        }
        // A Mini Player Card's sheet over the box score pushes entries with
        // this same address, so a back that only closes it lands here with
        // ?box= still set: the box score stays open and keeps its entry.
        if (id === null) pushedRef.current = false;
        setBox(id);
      }
      window.addEventListener('popstate', onPop);
      return function () {
        window.removeEventListener('popstate', onPop);
      };
    },
    []
  );

  const sheetOpen = box !== null && !wide;

  // The sheet: lock the page behind, focus the X, Esc closes, focus returns.
  useEffect(
    function () {
      if (!sheetOpen) return undefined;
      const html = document.documentElement;
      html.classList.add('mx-sheet-open');
      if (closeRef.current) closeRef.current.focus({ preventScroll: true });
      function onKey(e) {
        if (e.key === 'Escape' && !e.defaultPrevented && !html.classList.contains('edfl-sheet-open')) closeBox();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        html.classList.remove('mx-sheet-open');
        document.removeEventListener('keydown', onKey);
        const back = returnFocusRef.current;
        if (back && back.focus) {
          try {
            back.focus({ preventScroll: true });
          } catch (e) {
            /* the element left the page */
          }
        }
      };
    },
    [sheetOpen, closeBox]
  );

  // Drag the sheet's head down to close it.
  const dragProps = {
    onPointerDown: function (e) {
      if (e.target.closest && e.target.closest('button, a')) return;
      dragRef.current = { y: e.clientY, dy: 0, id: e.pointerId };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* capture is a nicety */
      }
    },
    onPointerMove: function (e) {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      d.dy = Math.max(0, e.clientY - d.y);
      if (panelRef.current) {
        panelRef.current.style.transition = 'none';
        panelRef.current.style.transform = 'translateY(' + d.dy + 'px)';
      }
    },
    onPointerUp: function (e) {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || d.id !== e.pointerId) return;
      const p = panelRef.current;
      if (d.dy > 110) {
        closeBox();
        return;
      }
      if (p) {
        p.style.transition = 'transform 200ms ease-out';
        p.style.transform = '';
      }
    },
    onPointerCancel: function () {
      dragRef.current = null;
      if (panelRef.current) panelRef.current.style.transform = '';
    },
  };

  // A sideways swipe on the page changes the week.
  const swipe = {
    onTouchStart: function (e) {
      if (sheetOpen || !e.touches || e.touches.length !== 1) return;
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: function (e) {
      const s = swipeRef.current;
      swipeRef.current = null;
      if (!s || sheetOpen || !e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      goWeek(dx < 0 ? nextWeek : prevWeek);
    },
  };

  const shown = games.find(function (g) { return g.id === box; }) || null;
  const panelGame = shown || myGame || games[0] || null;

  function boxFor(g, mode) {
    return (
      <BoxScore
        mode={mode}
        week={week}
        state={state}
        left={g.left}
        right={g.right}
        rows={rows.filter(function (r) {
          return r.matchup_id === g.id;
        })}
        result={props.results[g.id] || null}
        myTeamId={myTeamId}
        onClose={mode === 'sheet' ? closeBox : null}
        closeRef={mode === 'sheet' ? closeRef : null}
        dragProps={mode === 'sheet' ? dragProps : null}
      />
    );
  }

  return (
    <div className="mx-lay" {...swipe}>
      <div className="mx-col">
        <div className="mx-wkp">
          <button type="button" className="mx-arr" aria-label={prevWeek ? 'Week ' + prevWeek : 'No earlier week'} disabled={!prevWeek} onClick={function () { goWeek(prevWeek); }}>
            <Chevron left />
          </button>
          <div className="mx-wmid">
            <b>Week {week}</b>
            <span>
              {weekRange(wk)}
              {wk ? ' · ' : ''}
              {STATE_WORDS[state] || ''}
            </span>
          </div>
          <button type="button" className="mx-arr" aria-label={nextWeek ? 'Week ' + nextWeek : 'No later week'} disabled={!nextWeek} onClick={function () { goWeek(nextWeek); }}>
            <Chevron />
          </button>
        </div>
        <div className="mx-dots" role="group" aria-label={'Week ' + week + ' of ' + weeks.length}>
          {weeks.map(function (w) {
            const on = w.week_number === week;
            return (
              <button
                type="button"
                key={w.week_number}
                className={'mx-dot' + (on ? ' on' : props.finalWeeks[w.week_number] ? ' pl' : '')}
                aria-label={'Week ' + w.week_number}
                aria-current={on ? 'true' : undefined}
                onClick={function () { goWeek(w.week_number); }}
              >
                <i />
              </button>
            );
          })}
        </div>
        {props.resultsError ? <p className="mx-note">Winners and margins did not load: {props.resultsError}</p> : null}

        {games.length === 0 ? <p className="empty-note">Week {week} has no matchups on the schedule.</p> : null}

        {myGame ? (
          <Hero
            left={myGame.left}
            right={myGame.right}
            state={state}
            rows={rows.filter(function (r) { return r.matchup_id === myGame.id; })}
            result={props.results[myGame.id] || null}
            onOpen={function () { openBox(myGame.id); }}
          />
        ) : null}

        {others.length > 0 ? (
          <>
            <div className="mx-grp">
              {myGame ? 'Around the league' : 'This week'}
              <span>{others.length} matchups</span>
            </div>
            <div className="mx-mcs">
              {others.map(function (g) {
                return (
                  <ListCard
                    key={g.id}
                    left={g.left}
                    right={g.right}
                    state={state}
                    result={props.results[g.id] || null}
                    selected={wide && panelGame && panelGame.id === g.id}
                    onOpen={function () { openBox(g.id); }}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      {wide && panelGame ? (
        <section className="mx-panel" aria-label="Box score">
          {boxFor(panelGame, 'panel')}
        </section>
      ) : null}

      {sheetOpen && shown ? (
        <div className="mx-sheet-wrap">
          <div className="mx-scrim" aria-hidden="true" onClick={closeBox} />
          <section className="mx-sheet" role="dialog" aria-modal="true" aria-label="Box score" ref={panelRef}>
            {boxFor(shown, 'sheet')}
          </section>
        </div>
      ) : null}
    </div>
  );
}
