'use client';

import { useEffect, useRef, useState } from 'react';
import ExplainButton from '../../../components/ExplainButton';
import { RosterFace } from '../../team/[teamId]/RosterList';
import { formatCost } from '../../../lib/formatMoney';
import { searchTradeTargets } from '../actions';
import NeedsTiles, {
  NeedsKey,
  currentWeek,
  lastWeek,
  shortSentence,
  teamsThatFit,
} from '../NeedsTiles';
import { ContractStrip, PlayerTags, RankChip, contractWords } from './deskBits';
import TradeBuilder from './TradeBuilder';

// THE TRADE DESK -- UI test batch 14, November 14, 2026 (test site only).
//
// Lewis's picks on the GM's Office canvas: "Find a trade" (TrF-390), the laptop
// "Trade desk" (TrF-1280) and the Trade Builder (TrG-390), with his markups of
// November 11-13:
//   * your needs as TILES (not a table), counting FLEX, with red notes for later
//     weeks that come up short because of byes;
//   * the teams-that-fit list ("I like this");
//   * search by team, position, cap hit and contract, EVERY FILTER MULTI-PICK:
//     any match within a filter, all filters together, no pick = all;
//   * the contract boxes explained by an info icon at the end of each row's
//     contract line (on the laptop table, once, in the column heading);
//   * no trade balance, no odds of acceptance, no "worth" (Nov 11).
// On a phone the search and the builder are two views of this page; from
// 1024px they sit side by side (CSS only; nothing here measures the screen).
//
// IT DECIDES NOTHING. Needs are edfl_team_needs() rows (Lewis's definition of
// November 13, 2026); the search is edfl_trade_targets(), which applies the
// filters itself; ranks, bands, cap hits, cap bands and contract kinds are its
// columns. The only work here is drawing, choosing which page of results to
// show, and sorting the rows the function already returned.

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const CAP_BANDS = [
  { key: 'under_10', label: 'Under $10' },
  { key: '10_to_49', label: '$10 to $49' },
  { key: '50_up', label: '$50 and up' },
];
const CONTRACTS = [
  { key: 'final', label: 'Final year (rental)', words: 'final year' },
  { key: 'two', label: '2 seasons', words: '2 seasons' },
  { key: 'three_plus', label: '3+ seasons', words: '3+ seasons' },
  { key: 'rookie', label: 'Rookie deal', words: 'rookie deal' },
];
const PAGE = 8;
const SEARCH_DEBOUNCE_MS = 300;

function toggle(list, key) {
  return list.indexOf(key) >= 0 ? list.filter(function (k) { return k !== key; }) : list.concat([key]);
}

function Check() {
  return (
    <span className="tdk-cb" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10.5l4 4 8-9" />
      </svg>
    </span>
  );
}

function Chips({ label, items, picked, onToggle }) {
  return (
    <div className="tdk-fg">
      <span className="tdk-fl">
        {label}
        <span className="tdk-any">pick one or more</span>
      </span>
      <div className="tdk-chips" role="group" aria-label={label}>
        {items.map(function (it) {
          const on = picked.indexOf(it.key) >= 0;
          return (
            <button
              key={it.key}
              type="button"
              className={on ? 'is-on' : ''}
              aria-pressed={on ? 'true' : 'false'}
              aria-label={it.aria || undefined}
              onClick={function () { onToggle(it.key); }}
            >
              <Check />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TradeDesk({ teams, players, picks, needs, needsError, capRoom, capError, myTeamId, seasonYear }) {
  const teamById = {};
  (teams || []).forEach(function (t) { teamById[t.id] = t; });

  // ---- The trade being built (owned here, so a "+" in the search adds to it).
  const [partners, setPartners] = useState([]);
  const [assets, setAssets] = useState([]);
  const [view, setView] = useState('find'); // phone only: 'find' or 'build'

  // ---- The search.
  const [search, setSearch] = useState('');
  const [teamIds, setTeamIds] = useState([]);
  const [positions, setPositions] = useState([]);
  const [capBands, setCapBands] = useState([]);
  const [contractKinds, setContractKinds] = useState([]);
  const [sort, setSort] = useState('rank');
  const [shown, setShown] = useState(PAGE);
  const initial = (players || []).filter(function (p) { return p.team_id !== myTeamId; });
  const [results, setResults] = useState(initial);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const firstRun = useRef(true);
  const resultsRef = useRef(null);

  useEffect(
    function () {
      if (firstRun.current) {
        firstRun.current = false;
        return undefined;
      }
      setShown(PAGE);
      const timer = setTimeout(function () {
        setSearching(true);
        setSearchError('');
        searchTradeTargets({ search: search, teamIds: teamIds, positions: positions, capBands: capBands, contractKinds: contractKinds })
          .then(function (r) {
            if (!r.ok) {
              setSearchError(r.message);
              setResults([]);
              return;
            }
            setResults(r.data);
          })
          .catch(function (err) {
            setSearchError('Could not reach the server: ' + (err.message || 'unknown error'));
          })
          .finally(function () {
            setSearching(false);
          });
      }, SEARCH_DEBOUNCE_MS);
      return function () { clearTimeout(timer); };
    },
    [search, teamIds, positions, capBands, contractKinds]
  );

  // Sorting the rows the function returned (it returns them by 2026 rank).
  const sorted = results.slice();
  if (sort === 'cap') {
    sorted.sort(function (a, b) { return (Number(a.cap_hit) || 0) - (Number(b.cap_hit) || 0); });
  } else if (sort === 'name') {
    sorted.sort(function (a, b) { return String(a.full_name).localeCompare(String(b.full_name)); });
  }
  const visible = sorted.slice(0, shown);

  function addPlayer(p) {
    if (!p || p.team_id === myTeamId) return;
    const nextPartners = partners.indexOf(p.team_id) >= 0 ? partners : partners.concat([p.team_id]);
    setPartners(nextPartners);
    setAssets(function (prev) {
      if (prev.some(function (a) { return a.assetType === 'player' && a.contractId === p.contract_id; })) return prev;
      return prev.concat([{
        assetType: 'player',
        contractId: p.contract_id,
        playerId: p.player_id,
        fromTeamId: p.team_id,
        toTeamId: nextPartners.length === 1 ? myTeamId : '',
      }]);
    });
    setView('build');
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(min-width: 1024px)').matches) {
      window.scrollTo(0, 0);
    }
  }

  function seeTeam(fit) {
    setTeamIds([fit.teamId]);
    setPositions([fit.position]);
    if (resultsRef.current && resultsRef.current.scrollIntoView) {
      resultsRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  // ---- Your needs.
  const cw = needs ? currentWeek(needs) : null;
  const lw = needs ? lastWeek(needs) : null;
  const sentence = needs ? shortSentence(needs, myTeamId) : null;
  const fits = needs && myTeamId ? teamsThatFit(needs, myTeamId).slice(0, 3) : [];

  // ---- The results heading: "45 RBs, final year or rookie deal".
  const posWords = positions.length === 0 ? 'players' : positions.map(function (p) { return p + 's'; }).join(' and ');
  const contractWordsList = CONTRACTS.filter(function (c) { return contractKinds.indexOf(c.key) >= 0; })
    .map(function (c) { return c.words; });
  const heading =
    results.length + ' ' + (results.length === 1 && positions.length <= 1 ? posWords.replace(/s$/, '') : posWords) +
    (contractWordsList.length ? ', ' + contractWordsList.join(' or ') : '');

  const teamChips = (teams || [])
    .filter(function (t) { return t.id !== myTeamId; })
    .map(function (t) { return { key: t.id, label: t.abbrev || t.name, aria: t.name }; });

  const firstSeason = initial.length && Array.isArray(initial[0].seasons) ? initial[0].seasons[0] : seasonYear;
  const lastSeason = initial.length && Array.isArray(initial[0].seasons)
    ? initial[0].seasons[initial[0].seasons.length - 1]
    : null;

  return (
    <div className={'tdk' + (view === 'build' ? ' is-build' : ' is-find')}>
      <div className="edfl-explain-h edfl-explain-host tdk-h">
        <h1>
          <span className="tdk-ph">{view === 'build' ? 'Your trade' : 'Find a trade'}</span>
          <span className="tdk-wd">Trade desk</span>
        </h1>
        <ExplainButton label="How finding a trade works" title="How finding a trade works">
          <ul>
            <li>Your needs show your starters by position this week, and later weeks that come up short because of byes.</li>
            <li>Search every other team&rsquo;s players by team, position, cap hit and contract. Within a filter any match counts; across filters all must match; no pick means all.</li>
            <li>Press + on a player to put him in a trade. Nothing is sent until you review the trade and send it.</li>
          </ul>
        </ExplainButton>
      </div>

      <div className="tdk-cols">
        {/* ---------------- Left: needs and filters ---------------- */}
        <div className="tdk-col tdk-find">
          <div className="tdk-card">
            <div className="tdk-eyb-row edfl-explain-host">
              <span className="tdk-eyb">Your needs</span>
              <ExplainButton label="How needs are worked out" title="How needs are worked out">
                <ul>
                  <li>Your lineup is QB 1, RB 2, WR 4, TE 2 and K 1, plus 2 FLEX filled from RB, WR or TE.</li>
                  <li>A starter is a healthy player on your active roster who ranks in the top 12 QB, TE or K, the top 24 RB or the top 36 WR by 2026 EDFL points. Healthy means no injury designation, or Questionable.</li>
                  <li>Bye weeks are counted from this week through {lw ? 'Week ' + lw : 'the last league week'}. You are short at a slot when you have fewer starters than the lineup needs.</li>
                  <li>A team has a spare at a position when it has more starters there than its lineup uses after FLEX is filled.</li>
                </ul>
              </ExplainButton>
            </div>
            {needsError ? (
              <div className="form-error">Your needs could not be worked out: {needsError}</div>
            ) : !myTeamId ? (
              <p className="tdk-sm">Your login is not linked to a team, so there are no needs to show.</p>
            ) : (
              <>
                <div className="tdk-sm">
                  Week {cw}, with FLEX and the bye weeks to Week {lw} counted.{' '}
                  {sentence || 'You are short nowhere.'}
                </div>
                <NeedsTiles rows={needs} teamId={myTeamId} label="Your starters by position this week, with later bye-week shortfalls" />
                <NeedsKey />
                {fits.length > 0 ? (
                  <>
                    <div className="tdk-sub">Teams with spares where you are short</div>
                    <ul className="tdk-fit">
                      {fits.map(function (f) {
                        const t = teamById[f.teamId] || {};
                        return (
                          <li key={f.teamId + f.position}>
                            <span className="tdk-disc" aria-hidden="true">{t.abbrev || '?'}</span>
                            <span className="tdk-id">
                              <span className="tdk-nm">{t.name}</span>
                              <span className="tdk-sm">
                                {f.most} spare {f.position}{f.most === 1 ? '' : 's'} {f.when}
                                {f.theirShort.length ? <> &middot; short at <b>{f.theirShort.join(', ')}</b></> : null}
                              </span>
                            </span>
                            <button type="button" className="tdk-linkb" onClick={function () { seeTeam(f); }}>
                              See<span className="rsb-vh"> {t.name}&rsquo;s {f.position}s</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>

          <label className="tdk-search">
            <span className="rsb-vh">Search players on other teams</span>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="M13 13l4 4" />
            </svg>
            <input
              type="search"
              value={search}
              placeholder="Search players on other teams"
              onChange={function (e) { setSearch(e.target.value); }}
            />
          </label>

          <Chips label="Team" items={teamChips} picked={teamIds} onToggle={function (k) { setTeamIds(toggle(teamIds, k)); }} />
          <Chips
            label="Position"
            items={POSITIONS.map(function (p) { return { key: p, label: p }; })}
            picked={positions}
            onToggle={function (k) { setPositions(toggle(positions, k)); }}
          />
          <Chips label="Cap hit this season" items={CAP_BANDS} picked={capBands} onToggle={function (k) { setCapBands(toggle(capBands, k)); }} />
          <Chips label="Contract" items={CONTRACTS} picked={contractKinds} onToggle={function (k) { setContractKinds(toggle(contractKinds, k)); }} />
          {teamIds.length + positions.length + capBands.length + contractKinds.length > 0 || search ? (
            <button
              type="button"
              className="tdk-linkb tdk-clear"
              onClick={function () {
                setSearch(''); setTeamIds([]); setPositions([]); setCapBands([]); setContractKinds([]);
              }}
            >
              Clear the filters
            </button>
          ) : null}
        </div>

        {/* ---------------- Middle: the results ---------------- */}
        <div className="tdk-col tdk-find" ref={resultsRef}>
          <div className="tdk-rh">
            <b aria-live="polite">{searching ? 'Searching…' : heading}</b>
            <label className="tdk-sort">
              <span className="rsb-vh">Sort by</span>
              <select value={sort} onChange={function (e) { setSort(e.target.value); }}>
                <option value="rank">2026 rank</option>
                <option value="cap">Cap hit</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          {searchError ? <div className="form-error">{searchError}</div> : null}
          <div className="tdk-panel">
            <div className="tdk-th edfl-explain-host" aria-hidden="false">
              <span>Player and team</span>
              <span>Rank</span>
              <span className="tdk-num">Cap</span>
              <span className="tdk-th-i">
                {firstSeason}&ndash;{lastSeason ? String(lastSeason).slice(-2) : ''}
                <ExplainButton label="What the contract boxes mean" title="The contract boxes">
                  <ul>
                    <li>One box per season, {firstSeason} to {lastSeason}. A filled box means he is signed for that season.</li>
                    <li>Void seasons are not counted: he does not play in one.</li>
                  </ul>
                </ExplainButton>
              </span>
              <span />
            </div>
            {visible.length === 0 && !searching && !searchError ? (
              <p className="tdk-sm tdk-pad">No player matches. Try fewer filters.</p>
            ) : null}
            <ul className="tdk-list">
              {visible.map(function (p) {
                const inTrade = assets.some(function (a) { return a.contractId === p.contract_id; });
                return (
                  <li key={p.contract_id} className={'tdk-r edfl-explain-host' + (inTrade ? ' is-sel' : '')}>
                    <span className="tdk-who">
                      <RosterFace sleeperId={p.sleeper_player_id} name={p.full_name} />
                      <span className="tdk-id">
                        <span className="tdk-nm">
                          <a href={'/player/' + p.player_id}>{p.full_name}</a>
                          <span className="tdk-ph"><PlayerTags p={p} /></span>
                        </span>
                        <span className="tdk-ln">
                          {p.player_position} &bull; {p.nfl_team || 'FA'}
                          <span className="tdk-ph"> &middot; <RankChip p={p} /></span> &middot; <b>{p.team_name}</b>
                        </span>
                        <span className="tdk-ln tdk-ph">
                          <ContractStrip p={p} explain />
                          {' '}<b>{formatCost(p.cap_hit)}</b> cap &middot; {contractWords(p)}
                        </span>
                      </span>
                    </span>
                    <span className="tdk-wd"><RankChip p={p} /></span>
                    <span className="tdk-wd tdk-num"><b>{formatCost(p.cap_hit)}</b></span>
                    <span className="tdk-wd tdk-cell">
                      <ContractStrip p={p} />
                      <span className="tdk-tags"><PlayerTags p={p} /></span>
                    </span>
                    <button
                      type="button"
                      className="tdk-addc"
                      aria-label={inTrade ? p.full_name + ' is in your trade' : 'Add ' + p.full_name + ' to a trade'}
                      disabled={inTrade}
                      onClick={function () { addPlayer(p); }}
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        {inTrade ? <path d="M4 10.5l4 4 8-9" /> : <path d="M10 4v12M4 10h12" />}
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {sorted.length > shown ? (
            <button type="button" className="tdk-more" onClick={function () { setShown(sorted.length); }}>
              Show {sorted.length - shown} more
            </button>
          ) : null}
          <p className="tdk-sm tdk-foot">
            Within a filter, any match counts. Across filters, all must match. No chip picked means all.
          </p>
        </div>

        {/* ---------------- Right: the trade ---------------- */}
        <div className="tdk-col tdk-build">
          <TradeBuilder
            teams={teams}
            players={players}
            picks={picks}
            needs={needs}
            capRoom={capRoom}
            capError={capError}
            myTeamId={myTeamId}
            partners={partners}
            setPartners={setPartners}
            assets={assets}
            setAssets={setAssets}
            onFindMore={function () { setView('find'); }}
          />
        </div>
      </div>

      {view === 'find' && assets.length > 0 ? (
        <div className="tdk-dock tdk-ph-block">
          <button type="button" className="btn" onClick={function () { setView('build'); window.scrollTo(0, 0); }}>
            Your trade ({assets.length})
          </button>
        </div>
      ) : null}
    </div>
  );
}
