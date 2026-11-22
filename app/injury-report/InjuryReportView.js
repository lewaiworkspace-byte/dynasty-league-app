'use client';

import { useEffect, useMemo, useState } from 'react';
import TeamDisc from '../../components/TeamDisc';
import ExplainButton from '../../components/ExplainButton';
import { SORTS, compareInjuries, statusCounts, ordinal } from './injuryModel';

/**
 * THE INJURY REPORT'S SCREEN -- November 15, 2026 (UI test batch 19).
 *
 * Three views of one list, switched by the tabs at the top (Lewis, Nov 14):
 *   - Team View (the default): one team at a time, picked from a grid of team
 *     logos and opening on the owner's own team; its box gives the team's
 *     status bar, points per game out, where that ranks and how many cleared.
 *   - League View: the League page's Injury Report box at full length, with
 *     search, Rostered / Free agents / All, status chips, Team, Position and
 *     Roster spot filters, and a table with sortable headings on a laptop.
 *   - Return View: a chart of when the hurt players are expected back, week by
 *     week, and the list grouped the same way.
 * SORT opens a sheet holding every sort and filter, the same in all three.
 *
 * It reads nothing and formats no date: page.js loaded the rows and
 * injuryModel.js shaped them, labels included. The view and the team picked
 * are written to the address bar (replaceState) so a reload or a shared link
 * opens the same view; nothing else is.
 */

const VIEWS = [
  { key: 'league', label: 'League View' },
  { key: 'team', label: 'Team View' },
  { key: 'return', label: 'Return View' },
];

const SCOPES = [
  { key: 'rostered', label: 'Rostered' },
  { key: 'free', label: 'Free agents' },
  { key: 'all', label: 'All' },
];

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

const SLOTS = [
  { key: 'active', label: 'Active' },
  { key: 'ir', label: 'IR slot' },
  { key: 'taxi', label: 'Practice squad' },
];

const CHANGES = [
  { key: 'new', label: 'New' },
  { key: 'changed', label: 'Changed' },
  { key: 'cleared', label: 'Cleared' },
];

const DEFAULT_SORT = { league: 'pts', team: 'pts', return: 'ret' };
const LIST_STEP = 40;
const CLEARED_PREVIEW = 3;

function fixed2(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toFixed(2);
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4v12M3 13l3 3 3-3M14 16V4M11 7l3-3 3 3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l4 4" />
    </svg>
  );
}

function Disc(props) {
  return (
    <TeamDisc
      className={'kit-disc irv-disc' + (props.mine ? ' kit-disc-own' : '') + (props.size ? ' ' + props.size : '')}
      abbrev={props.abbr || ''}
      fallback="FA"
    />
  );
}

function StatusTag(props) {
  const r = props.r;
  if (!r.hurt) return <span className="irv-ist is-good">Cleared</span>;
  return (
    <span className={'irv-ist is-' + r.tone} title={r.statusFull}>
      {r.status}
    </span>
  );
}

function StackBar(props) {
  const counts = props.counts;
  const total = counts.reduce(function (s, c) { return s + c.n; }, 0);
  if (total === 0) return null;
  return (
    <>
      <div className="lgx-stack irv-stack" role="img"
        aria-label={total + ' hurt: ' + counts.map(function (c) { return c.label + ' ' + c.n; }).join(', ')}>
        {counts.map(function (c) {
          return <i key={c.label} className={'lgx-s-' + c.shade} style={{ flexGrow: c.n, flexBasis: 0 }} />;
        })}
      </div>
      <div className="lgx-slg">
        {counts.map(function (c) {
          return <span key={c.label}><i className={'lgx-s-' + c.shade} />{c.label} {c.n}</span>;
        })}
      </div>
    </>
  );
}

function Row(props) {
  const r = props.r;
  const mine = props.myTeamId !== null && r.teamId === props.myTeamId;
  const showPpg = props.sort === 'ppg';
  return (
    <li>
      <a className={'irv-row' + (mine ? ' is-mine' : '')} href={'/player/' + r.id}>
        <Disc abbr={r.abbr} mine={mine} />
        <span className="irv-bd">
          <b>
            {r.name}{' '}
            <em>({[r.pos, r.nfl].filter(Boolean).join(' · ')})</em>
            {r.hurt && r.changeLabel ? <span className="irv-flag">{r.changeLabel}</span> : null}
          </b>
          <span>
            <StatusTag r={r} />
            {r.hurt
              ? [r.injury, r.team || 'Free agent'].filter(Boolean).join(' · ')
              : ['Was ' + (r.prev || 'listed'), r.team || 'Free agent'].join(' · ')}
          </span>
          <span className="irv-l3">
            {r.hurt ? (
              <span className={'irv-bk' + (r.backDone ? ' is-done' : '')}>{r.backText}</span>
            ) : (
              <span className="irv-bk">Off the report {r.changedText}</span>
            )}
            {r.rostered && r.slot && r.slot !== 'active' ? <span className="irv-slt">{r.slotLabel}</span> : null}
          </span>
        </span>
        <span className="irv-vl">
          {showPpg ? fixed2(r.fppg) : fixed2(r.points)}
          <span>{showPpg ? 'per game' : props.season + ' pts'}</span>
        </span>
      </a>
    </li>
  );
}

const TABLE_COLS = [
  { key: 'name', label: 'Player', sort: 'name' },
  { key: 'pos', label: 'Pos' },
  { key: 'nfl', label: 'NFL' },
  { key: 'status', label: 'Status', sort: 'sev' },
  { key: 'injury', label: 'Injury' },
  { key: 'team', label: 'EDFL team', sort: 'team' },
  { key: 'slot', label: 'Slot' },
  { key: 'pts', label: 'pts', sort: 'pts', num: true },
  { key: 'ppg', label: 'Per game', sort: 'ppg', num: true },
  { key: 'ret', label: 'Expected back', sort: 'ret' },
];

function TableRow(props) {
  const r = props.r;
  const mine = props.myTeamId !== null && r.teamId === props.myTeamId;
  return (
    <tr className={mine ? 'is-mine' : ''}>
      <td>
        <span className="irv-tpl">
          <Disc abbr={r.abbr} mine={mine} />
          <a href={'/player/' + r.id}>{r.name}</a>
          {r.hurt && r.changeLabel ? <span className="irv-flag">{r.changeLabel}</span> : null}
        </span>
      </td>
      <td>{r.pos}</td>
      <td className="irv-mut">{r.nfl || '—'}</td>
      <td><StatusTag r={r} /></td>
      <td>{r.hurt ? r.injury || '—' : <span className="irv-mut">was {r.prev || 'listed'}</span>}</td>
      <td>{r.team || <span className="irv-mut">Free agent</span>}</td>
      <td className="irv-mut">{r.rostered ? r.slotLabel : '—'}</td>
      <td className="irv-num"><b>{fixed2(r.points)}</b></td>
      <td className="irv-num irv-mut">{fixed2(r.fppg)}</td>
      <td className={'irv-ret' + (r.backDone ? ' is-done' : '')} title={r.hurt ? r.backText : ''}>
        {r.hurt ? r.backText : <span className="irv-mut">Off the report {r.changedText}</span>}
      </td>
    </tr>
  );
}

function Table(props) {
  return (
    <div className="irv-tw">
      <table className="irv-table">
        <thead>
          <tr>
            {TABLE_COLS.map(function (c) {
              const label = c.key === 'pts' ? props.season + ' pts' : c.label;
              const on = c.sort && props.sort === c.sort;
              return (
                <th key={c.key} className={(c.num ? 'irv-num' : '') + (on ? ' is-on' : '')}
                  aria-sort={on ? (c.sort === 'pts' || c.sort === 'ppg' ? 'descending' : 'ascending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={function () { props.onSort(c.sort); }}>{label}</button>
                  ) : (
                    <span>{label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {props.groups.map(function (g) {
            return [
              g.label ? (
                <tr key={'g-' + g.key} className="irv-grow">
                  <td colSpan={TABLE_COLS.length}>{g.label} &middot; {g.rows.length} {g.rows.length === 1 ? 'player' : 'players'}</td>
                </tr>
              ) : null,
            ].concat(
              g.rows.map(function (r) {
                return <TableRow key={r.id} r={r} myTeamId={props.myTeamId} />;
              })
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// The rows, as a list on a phone and a table from 1024px (Team View keeps
// the list at every width: one team's rows beside its box). groups is
// [{ key, label, rows }]; a single group with no label is a flat list.
function Rows(props) {
  const total = props.groups.reduce(function (s, g) { return s + g.rows.length; }, 0);
  if (total === 0) return <p className="empty-note irv-empty">{props.empty}</p>;
  return (
    <>
      <div className={'irv-lists' + (props.listOnly ? ' is-kept' : '')}>
        {props.groups.map(function (g) {
          return (
            <div key={g.key}>
              {g.label ? (
                <div className={'irv-gh' + (g.key === 'done' ? ' is-done' : '')}>
                  <b>{g.label}</b><span>{g.rows.length} {g.rows.length === 1 ? 'player' : 'players'}</span>
                </div>
              ) : null}
              <ul className="irv-list">
                {g.rows.map(function (r) {
                  return <Row key={r.id} r={r} myTeamId={props.myTeamId} season={props.season} sort={props.sort} />;
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {props.listOnly ? null : (
        <Table groups={props.groups} myTeamId={props.myTeamId} season={props.season} sort={props.sort} onSort={props.onSort} />
      )}
    </>
  );
}

export default function InjuryReportView(props) {
  const { rows, teams, teamSums, buckets, season, myTeamId, asOf } = props;

  const [view, setView] = useState(props.initialView || 'team');
  const [teamId, setTeamId] = useState(props.initialTeamId || null);
  const [scope, setScope] = useState('rostered');
  const [teamF, setTeamF] = useState('ALL');
  const [pos, setPos] = useState('ALL');
  const [slot, setSlot] = useState('ALL');
  const [status, setStatus] = useState('all');
  const [change, setChange] = useState('ALL');
  const [q, setQ] = useState('');
  const [sorts, setSorts] = useState(DEFAULT_SORT);
  const [sheet, setSheet] = useState(false);
  const [limit, setLimit] = useState(LIST_STEP);
  const [allCleared, setAllCleared] = useState(false);

  const sort = sorts[view] || 'pts';
  function setSort(k) {
    setSorts(Object.assign({}, sorts, { [view]: k }));
  }

  const teamById = useMemo(function () {
    const m = {};
    (teams || []).forEach(function (t) { m[t.id] = t; });
    return m;
  }, [teams]);
  const sumById = useMemo(function () {
    const m = {};
    (teamSums || []).forEach(function (t) { m[t.id] = t; });
    return m;
  }, [teamSums]);

  // The address bar carries the view and the team, nothing else.
  useEffect(function () {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      const t = teamById[teamId];
      if (view === 'team' && t && t.abbrev) url.searchParams.set('team', t.abbrev);
      else url.searchParams.delete('team');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch (e) {
      // A browser that refuses replaceState keeps working; only the address lags.
    }
  }, [view, teamId, teamById]);

  // A new filter starts the list from the top again.
  useEffect(function () {
    setLimit(LIST_STEP);
    setAllCleared(false);
  }, [view, teamId, scope, teamF, pos, slot, status, change, q, sort]);

  // Escape closes the sheet.
  useEffect(function () {
    if (!sheet) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setSheet(false);
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }, [sheet]);

  // ---- the rows this view is about -----------------------------------------
  const needle = q.trim().toLowerCase();
  const base = useMemo(function () {
    return rows.filter(function (r) {
      if (view === 'team') {
        if (!r.rostered || r.teamId !== teamId) return false;
      } else {
        if (scope === 'rostered' && !r.rostered) return false;
        if (scope === 'free' && r.rostered) return false;
        if (teamF !== 'ALL' && r.teamId !== teamF) return false;
      }
      if (pos !== 'ALL' && r.pos !== pos) return false;
      if (slot !== 'ALL' && !(r.rostered && r.slot === slot)) return false;
      if (change !== 'ALL' && r.change !== change) return false;
      if (needle && r.name.toLowerCase().indexOf(needle) === -1) return false;
      return true;
    });
  }, [rows, view, teamId, scope, teamF, pos, slot, change, needle]);

  const counts = useMemo(function () { return statusCounts(base); }, [base]);
  const hurtRows = base.filter(function (r) { return r.hurt; });
  const clearedRows = base.filter(function (r) { return !r.hurt; });
  const cmp = compareInjuries(sort);

  let shown;
  if (status === 'cleared') shown = clearedRows.slice();
  else if (status === 'all') shown = hurtRows.slice();
  else shown = hurtRows.filter(function (r) { return r.status === status; });
  shown.sort(cmp);
  const clearedSorted = clearedRows.slice().sort(compareInjuries('chg'));

  const nNew = hurtRows.filter(function (r) { return r.change === 'new'; }).length;
  const nChanged = hurtRows.filter(function (r) { return r.change === 'changed'; }).length;
  const nDone = hurtRows.filter(function (r) { return r.bucket === 'done'; }).length;

  // ---- the groups the list is drawn in -------------------------------------
  let groups;
  const limited = shown.slice(0, limit);
  if (view === 'return' && sort === 'ret' && status !== 'cleared') {
    groups = buckets
      .map(function (b) {
        return { key: b.key, label: b.label, rows: limited.filter(function (r) { return r.bucket === b.key; }) };
      })
      .filter(function (g) { return g.rows.length > 0; });
  } else {
    groups = [{ key: 'all', label: null, rows: limited }];
  }

  // ---- downloads carry the screen's filters --------------------------------
  const selTeam = teamById[teamId];
  const exportTeamName = view === 'team'
    ? (selTeam ? selTeam.name : 'ALL')
    : teamF !== 'ALL' && teamById[teamF] ? teamById[teamF].name : 'ALL';
  const exportQuery =
    '?scope=' + encodeURIComponent(view === 'team' ? 'rostered' : scope) +
    '&position=' + encodeURIComponent(pos) +
    '&team=' + encodeURIComponent(exportTeamName) +
    '&q=' + encodeURIComponent(q.trim()) +
    '&status=' + encodeURIComponent(status) +
    '&slot=' + encodeURIComponent(slot) +
    '&change=' + encodeURIComponent(change);

  function resetFilters() {
    setScope('rostered');
    setTeamF('ALL');
    setPos('ALL');
    setSlot('ALL');
    setStatus('all');
    setChange('ALL');
    setQ('');
    setSorts(DEFAULT_SORT);
  }

  // ---- pieces ---------------------------------------------------------------
  const asOfLine = asOf ? 'Current as of ' + asOf : 'Not yet pulled from Sleeper';

  const searchBox = (
    <label className="irv-srch">
      <span className="it-visually-hidden">Search players</span>
      <SearchIcon />
      <input type="search" value={q} placeholder={view === 'team' ? 'Search this team' : 'Search injured players'}
        onChange={function (e) { setQ(e.target.value); }} />
    </label>
  );

  function scopeSeg() {
    const n = {
      rostered: rows.filter(function (r) { return r.hurt && r.rostered; }).length,
      free: rows.filter(function (r) { return r.hurt && !r.rostered; }).length,
    };
    n.all = n.rostered + n.free;
    return (
      <div className="irv-seg" role="group" aria-label="Show">
        {SCOPES.map(function (s) {
          return (
            <button key={s.key} type="button" className={scope === s.key ? 'is-on' : ''} aria-pressed={scope === s.key}
              onClick={function () { setScope(s.key); if (s.key === 'free') setTeamF('ALL'); }}>
              {s.label} <b>{n[s.key]}</b>
            </button>
          );
        })}
      </div>
    );
  }

  function statusChips(tabs) {
    const items = [{ key: 'all', label: 'All hurt', n: hurtRows.length, shade: null }]
      .concat(counts.map(function (c) { return { key: c.label, label: c.label, n: c.n, shade: c.shade }; }))
      .concat([{ key: 'cleared', label: 'Cleared', n: clearedRows.length, shade: 'ok' }]);
    return (
      <div className={tabs ? 'irv-tabs' : 'irv-chips'} role="group" aria-label="Status">
        {items.map(function (it) {
          return (
            <button key={it.key} type="button" className={status === it.key ? 'is-on' : ''} aria-pressed={status === it.key}
              onClick={function () { setStatus(it.key); }}>
              {it.shade && !tabs ? <i className={it.shade === 'ok' ? 'irv-okd' : 'lgx-s-' + it.shade} /> : null}
              {it.label} <b>{it.n}</b>
            </button>
          );
        })}
      </div>
    );
  }

  function selectBox(label, value, onChange, options) {
    return (
      <label className="irv-dd">
        <span>{label}</span>
        <select value={value} onChange={function (e) { onChange(e.target.value); }}>
          {options.map(function (o) {
            return <option key={o.value} value={o.value}>{o.label}</option>;
          })}
        </select>
        <Chevron />
      </label>
    );
  }

  const teamOptions = [{ value: 'ALL', label: 'All teams' }].concat(
    (teams || []).map(function (t) { return { value: t.id, label: t.name }; })
  );
  const posOptions = [{ value: 'ALL', label: 'All' }].concat(POSITIONS.map(function (p) { return { value: p, label: p }; }));
  const slotOptions = [{ value: 'ALL', label: 'All' }].concat(SLOTS.map(function (s) { return { value: s.key, label: s.label }; }));
  const scopeOptions = SCOPES.map(function (s) { return { value: s.key, label: s.label }; });
  const sortLabel = (SORTS.find(function (s) { return s.key === sort; }) || SORTS[0]).label;

  const resultLine = (
    <div className="irv-rl">
      <span><b>{shown.length}</b> {shown.length === 1 ? 'player' : 'players'}</span>
      <button type="button" className="irv-sortb" aria-haspopup="dialog" onClick={function () { setSheet(true); }}>
        <SortIcon />Sort: <b>{sortLabel}</b>
      </button>
    </div>
  );

  const moreButton = shown.length > limit ? (
    <button type="button" className="irv-more" onClick={function () { setLimit(limit + LIST_STEP * 5); }}>
      Show all {shown.length} <Chevron />
    </button>
  ) : null;

  const clearedGroup = status === 'all' && clearedSorted.length > 0 ? (
    <div className="irv-clr">
      <div className="irv-gh"><b>Cleared in the last 7 days</b><span>{clearedSorted.length} {clearedSorted.length === 1 ? 'player' : 'players'}</span></div>
      <Rows
        groups={[{ key: 'clr', label: null, rows: allCleared ? clearedSorted : clearedSorted.slice(0, CLEARED_PREVIEW) }]}
        myTeamId={myTeamId} season={season} sort="pts" onSort={setSort} empty="" listOnly={view === 'team'} />
      {!allCleared && clearedSorted.length > CLEARED_PREVIEW ? (
        <button type="button" className="irv-more" onClick={function () { setAllCleared(true); }}>
          Show all {clearedSorted.length} cleared <Chevron />
        </button>
      ) : null}
    </div>
  ) : null;

  const errLines = (
    <>
      {props.statsError ? (
        <p className="form-error irv-err">Season points could not be loaded, so the lists are not in points
          order: {props.statsError}</p>
      ) : null}
      {props.progError ? (
        <p className="form-error irv-err">Return estimates could not be loaded: {props.progError}</p>
      ) : null}
    </>
  );

  const downloads = (
    <div className="irv-dls">
      <span>Download</span>
      <a href={'/injury-report/export' + exportQuery + '&format=csv'}>CSV</a>
      <a href={'/injury-report/export' + exportQuery + '&format=xlsx'}>Excel</a>
      <a href={'/injury-report/export' + exportQuery + '&format=pdf'}>PDF</a>
    </div>
  );

  const emptyText = base.length === 0 && hurtRows.length === 0 && clearedRows.length === 0
    ? 'No player matches those filters.'
    : status === 'cleared' ? 'Nobody came off the report this week.' : 'No hurt player matches those filters.';

  // ---- the three views ------------------------------------------------------
  function teamView() {
    const t = sumById[teamId];
    const team = teamById[teamId];
    const order = (teams || []).slice().sort(function (a, b) {
      if (a.id === myTeamId) return -1;
      if (b.id === myTeamId) return 1;
      return a.abbrev.localeCompare(b.abbrev);
    });
    if (!team || !t) {
      return (
        <p className="form-error">
          {props.teamsError ? 'The teams could not be loaded: ' + props.teamsError : 'No team to show.'}
        </p>
      );
    }
    return (
      <div className="irv-tv">
        <div className="irv-tv-side">
          <div className="irv-tpk" role="group" aria-label="Choose a team">
            {order.map(function (o) {
              const s = sumById[o.id];
              const on = o.id === teamId;
              return (
                <button key={o.id} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                  aria-label={o.name + ', ' + (s ? s.hurt : 0) + ' hurt'}
                  onClick={function () { setTeamId(o.id); setStatus('all'); }}>
                  <Disc abbr={o.abbrev} size="irv-disc-m" />
                  <span>{o.abbrev}</span>
                  {s && s.hurt > 0 ? <em>{s.hurt}</em> : null}
                </button>
              );
            })}
          </div>

          <section className="lgx-box irv-box edfl-explain-host" aria-label={team.name + ' injuries'}>
            <div className="irv-bh">
              <span className="lgx-ey">Injury Report &middot; {asOfLine}</span>
              <h2 className="lgx-title">{team.name} &middot; {t.hurt} hurt</h2>
            </div>
            <StackBar counts={statusCounts(rows.filter(function (r) { return r.rostered && r.teamId === teamId; }))} />
            <div className="irv-kp">
              <div>
                <span className="irv-kl">
                  Pts/gm out
                  <ExplainButton label="How points per game out is worked out">
                    <ul>
                      <li>The {season} points per game of every {team.name} player who is on IR, Out,
                        Doubtful or another designation that keeps him off the field, added together.</li>
                      <li>Questionable players are left out: they play more often than not.</li>
                      <li>A player who has not played this season adds nothing.</li>
                    </ul>
                  </ExplainButton>
                </span>
                <b>{t.ppgOut.toFixed(1)}</b>
              </div>
              <div>
                <span className="irv-kl">League rank</span>
                <b>{ordinal(t.rank)}</b>
                <span className="irv-ks">most lost of {(teamSums || []).length}</span>
              </div>
              <div>
                <span className="irv-kl">Cleared</span>
                <b>{t.cleared}</b>
                <span className="irv-ks">this week</span>
              </div>
            </div>
            <p className="irv-say">
              {t.biggest ? (
                <><b>{t.biggest.name}</b> ({t.biggest.fppg.toFixed(1)} a game) is the biggest loss. </>
              ) : (
                <>Nobody on {team.name} who has played this season is out. </>
              )}
              <b>{t.cleared}</b> {t.cleared === 1 ? 'player' : 'players'} came off the report this week.
            </p>
          </section>

          <div className="irv-ctl">
            {searchBox}
            {statusChips(false)}
          </div>
          <div className="irv-wide-only">{downloads}</div>
        </div>

        <div className="irv-tv-main">
          {resultLine}
          {errLines}
          <Rows groups={groups} myTeamId={myTeamId} season={season} sort={sort} onSort={setSort} empty={emptyText} listOnly />
          {moreButton}
          {clearedGroup}
          <div className="irv-phone-only">{downloads}</div>
        </div>
      </div>
    );
  }

  function leagueView() {
    const title = scope === 'free'
      ? hurtRows.length + ' hurt free agents'
      : scope === 'all'
        ? hurtRows.length + ' hurt, rostered and free agents'
        : hurtRows.length + ' hurt on EDFL rosters';
    return (
      <>
        <div className="irv-lv-top">
          <section className="lgx-box irv-box" aria-label="Injury report summary">
            <div className="irv-bh">
              <span className="lgx-ey">Injury Report &middot; {asOfLine}</span>
              <h2 className="lgx-title">{title}</h2>
            </div>
            <StackBar counts={counts} />
            <p className="irv-say">
              <b>{nNew}</b> {nNew === 1 ? 'is' : 'are'} new to the report this week and <b>{nChanged}</b> changed
              status. <b>{clearedRows.length}</b> came off it. <b>{nDone}</b> {nDone === 1 ? 'is' : 'are'} done
              for {season}.
            </p>
          </section>
          <div className="irv-ctl">
            {searchBox}
            {scopeSeg()}
            {statusChips(false)}
            <div className="irv-dds">
              {selectBox('Team', teamF, setTeamF, teamOptions)}
              {selectBox('Position', pos, setPos, posOptions)}
              {selectBox('Roster spot', slot, setSlot, slotOptions)}
            </div>
          </div>
        </div>
        {resultLine}
        {errLines}
        <Rows groups={groups} myTeamId={myTeamId} season={season} sort={sort} onSort={setSort} empty={emptyText} />
        {moreButton}
        {clearedGroup}
        {downloads}
      </>
    );
  }

  function returnView() {
    const byBucket = {};
    hurtRows.forEach(function (r) {
      byBucket[r.bucket] = (byBucket[r.bucket] || 0) + 1;
    });
    const cols = buckets.filter(function (b) { return byBucket[b.key] || (b.key !== 'none'); });
    const max = cols.reduce(function (m, b) { return Math.max(m, byBucket[b.key] || 0); }, 0);
    const weekCols = buckets.filter(function (b) { return /^w\d+$/.test(b.key); });
    const soonKeys = weekCols.slice(0, 2);
    const soon = soonKeys.reduce(function (s, b) { return s + (byBucket[b.key] || 0); }, 0);
    const soonBy = soonKeys.length ? soonKeys[soonKeys.length - 1].label : null;
    return (
      <>
        <section className="lgx-box irv-box" aria-label="When injured players are due back">
          <div className="irv-bh edfl-explain-h edfl-explain-host">
            <div>
              <span className="lgx-ey">Injury Report &middot; {asOfLine}</span>
              <h2 className="lgx-title">When they&rsquo;re due back</h2>
            </div>
            <ExplainButton label="Where the return dates come from">
              <ul>
                <li>Each player&rsquo;s expected return comes from the injury outlook check (Thursdays and
                  Sundays) and, where it has none, from ESPN.</li>
                <li>A player goes in the league week in which he is expected back. A date already past
                  counts as this week.</li>
                <li>&ldquo;Done for {season}&rdquo; is a date after January, which is how ESPN files a
                  season-ending injury.</li>
                <li>It is a reading aid, not a prediction the app makes.</li>
              </ul>
            </ExplainButton>
          </div>
          {props.weeksError ? (
            <p className="form-error irv-err">The league weeks could not be loaded, so the chart is not drawn:
              {' '}{props.weeksError}</p>
          ) : (
            <>
              <p className="irv-say">
                {soonBy ? (
                  <><b>{soon}</b> of the {hurtRows.length} are expected back by the end of {soonBy}. </>
                ) : null}
                <b>{byBucket.done || 0}</b> {(byBucket.done || 0) === 1 ? 'is' : 'are'} done for {season}.
              </p>
              <div className="irv-tl" role="img"
                aria-label={'Hurt players by expected return: ' +
                  cols.map(function (b) { return b.label + ' ' + (byBucket[b.key] || 0); }).join(', ')}>
                {cols.map(function (b) {
                  const n = byBucket[b.key] || 0;
                  const h = max > 0 ? Math.max(n > 0 ? 4 : 0, Math.round((n / max) * 100)) : 0;
                  return (
                    <div key={b.key} className={'irv-tlc' + (b.key === 'done' ? ' is-done' : b.key === 'none' ? ' is-none' : '')}>
                      <b>{n}</b>
                      <i style={{ height: h + '%' }} />
                    </div>
                  );
                })}
              </div>
              <div className="irv-tll" aria-hidden="true" style={{ gridTemplateColumns: 'repeat(' + cols.length + ', minmax(0, 1fr))' }}>
                {cols.map(function (b) { return <span key={b.key}>{b.short}</span>; })}
              </div>
            </>
          )}
          <div className="irv-chg" role="group" aria-label="This week">
            {CHANGES.map(function (c) {
              const n = c.key === 'new' ? nNew : c.key === 'changed' ? nChanged : clearedRows.length;
              const on = change === c.key;
              return (
                <button key={c.key} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                  onClick={function () {
                    setChange(on ? 'ALL' : c.key);
                    if (c.key === 'cleared' && !on) setStatus('cleared');
                    else if (status === 'cleared') setStatus('all');
                  }}>
                  <b>{n}</b><span>{c.key === 'new' ? 'New this week' : c.key === 'changed' ? 'Changed status' : 'Cleared'}</span>
                </button>
              );
            })}
          </div>
        </section>
        {statusChips(true)}
        <div className="irv-ctl">
          {searchBox}
          <div className="irv-dds">
            {selectBox('Team', teamF, setTeamF, teamOptions)}
            {selectBox('Position', pos, setPos, posOptions)}
            {selectBox('Show', scope, function (v) { setScope(v); if (v === 'free') setTeamF('ALL'); }, scopeOptions)}
          </div>
        </div>
        {resultLine}
        {errLines}
        <Rows groups={groups} myTeamId={myTeamId} season={season} sort={sort} onSort={setSort} empty={emptyText} />
        {moreButton}
        {downloads}
      </>
    );
  }

  // ---- the sheet ------------------------------------------------------------
  function sortSheet() {
    return (
      <>
        <div className="irv-scrim" aria-hidden="true" onClick={function () { setSheet(false); }} />
        <section className="irv-sheet" role="dialog" aria-modal="true" aria-labelledby="irv-sheet-title">
          <span className="irv-grip" aria-hidden="true" />
          <div className="irv-sh-h">
            <h2 id="irv-sheet-title">Sort and filter</h2>
            <button type="button" onClick={resetFilters}>Reset</button>
          </div>
          <div className="irv-sh-s">Sort by</div>
          <div role="radiogroup" aria-label="Sort by">
            {SORTS.map(function (s) {
              return (
                <label key={s.key} className="irv-rad">
                  <input type="radio" name="irv-sort" checked={sort === s.key} onChange={function () { setSort(s.key); }} />
                  <span>{s.label}</span><em>{s.hint}</em>
                </label>
              );
            })}
          </div>
          {view !== 'team' ? (
            <>
              <div className="irv-sh-s">Show</div>
              {scopeSeg()}
            </>
          ) : null}
          <div className="irv-sh-s">Status</div>
          {statusChips(false)}
          {view !== 'team' ? (
            <>
              <div className="irv-sh-s">EDFL team</div>
              <div className="irv-tpk">
                {(teams || []).slice().sort(function (a, b) { return a.abbrev.localeCompare(b.abbrev); }).map(function (o) {
                  const on = teamF === o.id;
                  return (
                    <button key={o.id} type="button" className={on ? 'is-on' : ''} aria-pressed={on} aria-label={o.name}
                      onClick={function () { setTeamF(on ? 'ALL' : o.id); if (scope === 'free') setScope('rostered'); }}>
                      <Disc abbr={o.abbrev} size="irv-disc-m" />
                      <span>{o.abbrev}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          <div className="irv-sh-s">Position</div>
          <div className="irv-chips">
            {POSITIONS.map(function (p) {
              const on = pos === p;
              return (
                <button key={p} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                  onClick={function () { setPos(on ? 'ALL' : p); }}>{p}</button>
              );
            })}
          </div>
          <div className="irv-sh-s">Roster spot</div>
          <div className="irv-chips">
            {SLOTS.map(function (s) {
              const on = slot === s.key;
              return (
                <button key={s.key} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                  onClick={function () { setSlot(on ? 'ALL' : s.key); }}>{s.label}</button>
              );
            })}
          </div>
          <div className="irv-sh-s">This week</div>
          <div className="irv-chips">
            {CHANGES.map(function (c) {
              const on = change === c.key;
              return (
                <button key={c.key} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
                  onClick={function () {
                    setChange(on ? 'ALL' : c.key);
                    if (c.key === 'cleared' && !on) setStatus('cleared');
                    else if (status === 'cleared') setStatus('all');
                  }}>{c.label}</button>
              );
            })}
          </div>
          <div className="irv-sh-f">
            <button type="button" className="irv-ghost" onClick={function () { setSheet(false); }}>Close</button>
            <button type="button" className="irv-go" onClick={function () { setSheet(false); }}>
              Show {shown.length} {shown.length === 1 ? 'player' : 'players'}
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="irv">
      <nav className="irv-views" aria-label="Injury Report views">
        {VIEWS.map(function (v) {
          const on = view === v.key;
          return (
            <button key={v.key} type="button" className={on ? 'is-on' : ''} aria-pressed={on}
              onClick={function () { setView(v.key); setStatus('all'); setChange('ALL'); }}>
              {v.label}
            </button>
          );
        })}
      </nav>
      {view === 'team' ? teamView() : view === 'return' ? returnView() : leagueView()}
      {sheet ? sortSheet() : null}
    </div>
  );
}
