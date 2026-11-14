'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExplainButton from '../../../components/ExplainButton';
import { RosterFace } from '../../team/[teamId]/RosterList';
import { formatCost, formatMoney, formatRoom } from '../../../lib/formatMoney';
import {
  proposeDraft,
  updateDraft,
  discardDraft,
  submitTrade,
  loadTradePreview,
  loadNeedsAfter,
} from '../actions';
import TradeImpactCards from '../TradeImpactCards';
import NeedsTiles, { NeedsKey, rowsBySlot, shortNow, spareNow, shortSentence, SLOT_ORDER } from '../NeedsTiles';
import { ContractStrip, PlayerTags, RankChip, contractWords } from './deskBits';

// THE TRADE BUILDER -- UI test batch 14, November 14, 2026 (board TrG-390).
//
// "Trade with <team>": a card per team ("You send", "<Team> sends") with its cap
// room and its Short / Spare chips, the assets moving, and an "Add another
// player or pick" box (Lewis liked it, Nov 11). Then "What this trade does":
// how each team's starters change this week and later (live, from
// edfl_team_needs() with the trade's moves), the tiles after the trade, and,
// once the trade is reviewed, your money by season and the rule checks.
// No trade balance, no odds of acceptance, no "worth" (Lewis, Nov 11).
//
// ONE DRAFT PER BUILDER SESSION, AS BEFORE. trade_impact(), trade_legality()
// and trade_savings() need a trade_id, so "Review trade" is a write: the first
// one calls propose_trade(as_draft) and every later one update_trade_draft on
// the same row. An abandoned session leaves at most one draft, visible and
// discardable under "Your drafts" on /trades.
//
// A DRAFT RESERVES NOTHING, AND NEITHER DOES A SENT OFFER (ruling of September
// 3, 2026): an owner may offer the same player or pick in any number of open
// proposals, so nothing here greys a player out because he is in another one.
// submit_trade() checks availability at send time and its refusal is shown
// verbatim.
//
// NO CAP OR CASH ARITHMETIC LIVES IN THIS FILE. The money chart draws
// trade_savings()'s own fields (cap_added = salary you take on, cap_if_kept =
// salary that leaves with your player, dead_cap = dead money you keep) for your
// team, season by season; nothing is netted or summed here (SR-23). Every rule
// figure is TradeImpactCards, the component the detail page and the officer
// see too.

function assetKey(a) {
  return a.assetType + ':' + (a.contractId || a.draftPickId);
}

const NEEDS_DEBOUNCE_MS = 300;

export default function TradeBuilder({
  teams, players, picks, needs, capRoom, capError, myTeamId,
  partners, setPartners, assets, setAssets, onFindMore,
}) {
  const router = useRouter();
  const teamById = {};
  (teams || []).forEach(function (t) { teamById[t.id] = t; });
  const playerByContract = {};
  (players || []).forEach(function (p) { playerByContract[p.contract_id] = p; });
  const pickById = {};
  (picks || []).forEach(function (p) { pickById[p.id] = p; });

  const involved = myTeamId ? [myTeamId].concat(partners) : partners.slice();
  const twoTeams = involved.length === 2;

  const [note, setNote] = useState('');
  const [tradeId, setTradeId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [stale, setStale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingSend, setConfirmingSend] = useState(false);

  const [after, setAfter] = useState(null);
  const [afterError, setAfterError] = useState('');

  const [addFor, setAddFor] = useState(null);
  const [addText, setAddText] = useState('');
  const [addKind, setAddKind] = useState('all');

  // With two teams every asset goes to the other one; with three or more the
  // owner names a destination per asset, as before.
  useEffect(
    function () {
      if (!twoTeams) return;
      setAssets(function (prev) {
        let changed = false;
        const next = prev.map(function (a) {
          const other = involved.find(function (t) { return t !== a.fromTeamId; });
          if (a.toTeamId !== other) { changed = true; return Object.assign({}, a, { toTeamId: other }); }
          return a;
        });
        return changed ? next : prev;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partners.join(','), myTeamId]
  );

  // Every change to the trade makes the reviewed figures stale.
  useEffect(
    function () {
      setStale(true);
      setConfirmingSend(false);
    },
    [assets, partners, note]
  );

  // Needs after the trade: edfl_team_needs() with the trade's player moves.
  const moves = assets
    .filter(function (a) { return a.assetType === 'player' && a.toTeamId; })
    .map(function (a) { return { player_id: a.playerId, to_team_id: a.toTeamId }; });
  const movesKey = JSON.stringify(moves);
  useEffect(
    function () {
      if (moves.length === 0) {
        setAfter(null);
        setAfterError('');
        return undefined;
      }
      const timer = setTimeout(function () {
        loadNeedsAfter(moves)
          .then(function (r) {
            if (!r.ok) { setAfterError(r.message); setAfter(null); return; }
            setAfterError('');
            setAfter(r.data);
          })
          .catch(function (err) {
            setAfterError('Could not reach the server: ' + (err.message || 'unknown error'));
          });
      }, NEEDS_DEBOUNCE_MS);
      return function () { clearTimeout(timer); };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movesKey]
  );

  function togglePartner(teamId) {
    if (teamId === myTeamId) return;
    const next = partners.indexOf(teamId) >= 0
      ? partners.filter(function (t) { return t !== teamId; })
      : partners.concat([teamId]);
    const nextInvolved = myTeamId ? [myTeamId].concat(next) : next;
    setPartners(next);
    // Drop any asset whose sender or destination just left the deal.
    setAssets(function (current) {
      return current
        .filter(function (a) {
          return nextInvolved.indexOf(a.fromTeamId) >= 0 && (!a.toTeamId || nextInvolved.indexOf(a.toTeamId) >= 0);
        });
    });
  }

  function addAsset(asset) {
    setAssets(function (prev) {
      if (prev.some(function (a) { return assetKey(a) === assetKey(asset); })) return prev;
      return prev.concat([asset]);
    });
    setAddText('');
    setAddFor(null);
  }

  function removeAsset(key) {
    setAssets(function (prev) { return prev.filter(function (a) { return assetKey(a) !== key; }); });
  }

  function setDestination(key, toTeamId) {
    setAssets(function (prev) {
      return prev.map(function (a) { return assetKey(a) === key ? Object.assign({}, a, { toTeamId: toTeamId }) : a; });
    });
  }

  // The exact shape propose_trade / update_trade_draft expect.
  function payload() {
    return assets.map(function (a) {
      const el = { asset_type: a.assetType, from_team_id: a.fromTeamId, to_team_id: a.toTeamId };
      if (a.assetType === 'player') el.contract_id = a.contractId;
      else el.draft_pick_id = a.draftPickId;
      return el;
    });
  }

  const unrouted = assets.filter(function (a) { return !a.toTeamId; });
  const canReview = assets.length > 0 && unrouted.length === 0 && involved.length >= 2 && Boolean(myTeamId);

  function handleReview() {
    if (!canReview) return;
    setBusy(true);
    setError('');
    const body = payload();
    const write = tradeId ? updateDraft(tradeId, body, note) : proposeDraft(body, note);
    write
      .then(function (result) {
        if (!result.ok) { setError(result.message); return null; }
        const id = tradeId || (result.data && result.data.trade_id);
        if (!id) { setError('The draft was saved but did not come back with an id. Reload and try again.'); return null; }
        setTradeId(id);
        return loadTradePreview(id);
      })
      .then(function (previewResult) {
        if (!previewResult) return;
        if (!previewResult.ok) { setError(previewResult.message); return; }
        setPreview(previewResult);
        setStale(false);
      })
      .catch(function (err) { setError('Could not reach the server: ' + (err.message || 'unknown error')); })
      .finally(function () { setBusy(false); });
  }

  function handleSend() {
    if (!tradeId) return;
    if (!confirmingSend) { setConfirmingSend(true); return; }
    setBusy(true);
    setError('');
    submitTrade(tradeId)
      .then(function (result) {
        if (!result.ok) { setError(result.message); setConfirmingSend(false); return; }
        router.push('/trades/' + tradeId);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
        setConfirmingSend(false);
      })
      .finally(function () { setBusy(false); });
  }

  function handleDiscard() {
    function reset() {
      setTradeId(null); setAssets([]); setPartners([]); setPreview(null); setNote('');
      setStale(true); setConfirmingSend(false);
    }
    if (!tradeId) { reset(); return; }
    setBusy(true);
    setError('');
    discardDraft(tradeId)
      .then(function (result) { if (!result.ok) { setError(result.message); return; } reset(); })
      .catch(function (err) { setError('Could not reach the server: ' + (err.message || 'unknown error')); })
      .finally(function () { setBusy(false); });
  }

  const legalityBlocking = preview && preview.legality && preview.legality.length > 0;
  const partnerNames = partners.map(function (t) { return (teamById[t] || {}).name || 'Unknown team'; });
  const title = partners.length === 0
    ? 'Start a trade'
    : 'Trade with ' + (partnerNames.length <= 1 ? partnerNames.join('') : partnerNames.slice(0, -1).join(', ') + ' and ' + partnerNames[partnerNames.length - 1]);

  // ---- "What this trade does": starters before and after, in words.
  function changeLines(teamId) {
    if (!needs || !after) return null;
    const before = rowsBySlot(needs, teamId);
    const aft = rowsBySlot(after, teamId);
    const changed = [];
    SLOT_ORDER.forEach(function (s) {
      const b = (before[s] || []).find(function (r) { return r.is_current; });
      const a = (aft[s] || []).find(function (r) { return r.is_current; });
      if (!b || !a) return;
      if (b.starters !== a.starters || b.spare !== a.spare) {
        const spareWords = a.spare !== b.spare ? ' (' + a.spare + ' spare)' : '';
        changed.push(s + ' from ' + b.starters + '/' + b.need + ' to ' + a.starters + '/' + a.need + spareWords);
      }
    });
    const later = shortSentence(after, teamId);
    return {
      now: changed.length ? changed.join('; ') : null,
      later: later,
    };
  }

  const mySavings = preview && Array.isArray(preview.savings)
    ? preview.savings.find(function (s) { return s.team_id === myTeamId; }) || null
    : null;
  const moneyYears = mySavings && Array.isArray(mySavings.years) ? mySavings.years : [];
  let moneyTop = 0;
  moneyYears.forEach(function (y) {
    moneyTop = Math.max(moneyTop, Number(y.cap_added) || 0, Number(y.cap_if_kept) || 0, Number(y.dead_cap) || 0);
  });
  function barWidth(v) {
    const n = Number(v) || 0;
    if (moneyTop <= 0 || n <= 0) return '0%';
    return Math.max(2, (n / moneyTop) * 100).toFixed(1) + '%';
  }

  function matchesFor(teamId) {
    const q = addText.trim().toLowerCase();
    const chosen = assets.map(assetKey);
    const ps = (players || [])
      .filter(function (p) { return p.team_id === teamId && chosen.indexOf('player:' + p.contract_id) === -1; })
      .filter(function (p) {
        if (!q) return true;
        return String(p.full_name).toLowerCase().indexOf(q) !== -1 || String(p.player_position).toLowerCase() === q;
      });
    const ks = (picks || [])
      .filter(function (k) { return k.teamId === teamId && chosen.indexOf('pick:' + k.id) === -1; })
      .filter(function (k) {
        if (!q) return true;
        const label = (k.seasonYear + ' round ' + k.round + ' pick').toLowerCase();
        return label.indexOf(q) !== -1 || ('r' + k.round) === q;
      });
    return {
      players: addKind === 'picks' ? [] : ps.slice(0, 6),
      picks: addKind === 'players' ? [] : ks.slice(0, 6),
      morePlayers: Math.max(0, ps.length - 6),
    };
  }

  function addFrom(teamId, item, kind) {
    const other = twoTeams ? involved.find(function (t) { return t !== teamId; }) : '';
    if (kind === 'player') {
      addAsset({ assetType: 'player', contractId: item.contract_id, playerId: item.player_id, fromTeamId: teamId, toTeamId: other });
    } else {
      addAsset({ assetType: 'pick', draftPickId: item.id, fromTeamId: teamId, toTeamId: other });
    }
  }

  return (
    <div className="tdk-builder">
      <div className="tdk-bhead">
        <h2 className="tdk-btitle">{title}</h2>
        <button type="button" className="tdk-linkb tdk-ph" onClick={onFindMore}>&larr; Find more players</button>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <div className="tdk-fg">
        <span className="tdk-fl">Trade with<span className="tdk-any">pick one or more teams</span></span>
        <div className="tdk-chips" role="group" aria-label="Teams in the trade">
          {(teams || []).filter(function (t) { return t.id !== myTeamId; }).map(function (t) {
            const on = partners.indexOf(t.id) >= 0;
            return (
              <button
                key={t.id}
                type="button"
                className={on ? 'is-on' : ''}
                aria-pressed={on ? 'true' : 'false'}
                aria-label={t.name}
                disabled={busy}
                onClick={function () { togglePartner(t.id); }}
              >
                <span className="tdk-cb" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                </span>
                {t.abbrev || t.name}
              </button>
            );
          })}
        </div>
      </div>

      {partners.length === 0 ? (
        <p className="tdk-sm tdk-pad0">
          Pick a team, or press + on a player in the search, to start a trade.
        </p>
      ) : null}

      {partners.length > 0 ? involved.map(function (teamId) {
        const t = teamById[teamId] || {};
        const mine = teamId === myTeamId;
        const sending = assets.filter(function (a) { return a.fromTeamId === teamId; });
        const shorts = needs ? shortNow(needs, teamId) : [];
        const spares = needs ? spareNow(needs, teamId) : [];
        const m = addFor === teamId ? matchesFor(teamId) : null;
        return (
          <section className="tdk-tcard" key={teamId} aria-label={mine ? 'You send' : t.name + ' sends'}>
            <div className="tdk-th2">
              <span className="tdk-disc" aria-hidden="true">{t.abbrev || '?'}</span>
              <span className="tdk-id">
                <span className="tdk-nm">{mine ? 'You send' : t.name + ' sends'}</span>
                <span className="tdk-sm">
                  Cap room <b>{capError || capRoom[teamId] === undefined ? '—' : formatRoom(capRoom[teamId])}</b>
                </span>
                {shorts.length || spares.length ? (
                  <span className="tdk-mini">
                    {spares.length ? <span className="is-dp">Spare: {spares.join(', ')}</span> : null}
                    {shorts.length ? <span className="is-sh">Short: {shorts.join(', ')}</span> : null}
                  </span>
                ) : null}
              </span>
            </div>

            {sending.length === 0 ? <p className="tdk-sm tdk-pad">Sending nothing yet.</p> : null}
            {sending.map(function (a) {
              const key = assetKey(a);
              const p = a.assetType === 'player' ? playerByContract[a.contractId] : null;
              const k = a.assetType === 'pick' ? pickById[a.draftPickId] : null;
              return (
                <div className="tdk-asset edfl-explain-host" key={key}>
                  {p ? <RosterFace sleeperId={p.sleeper_player_id} name={p.full_name} /> : (
                    <span className="tdk-pk" aria-hidden="true"><b>R{k ? k.round : '?'}</b>{k ? String(k.seasonYear).slice(-2) : ''}</span>
                  )}
                  <span className="tdk-id">
                    {p ? (
                      <>
                        <span className="tdk-nm"><a href={'/player/' + p.player_id}>{p.full_name}</a><PlayerTags p={p} /></span>
                        <span className="tdk-ln">
                          {p.player_position} &bull; {p.nfl_team || 'FA'} &middot; <RankChip p={p} /> &middot; <b>{formatCost(p.cap_hit)}</b> cap
                        </span>
                        <span className="tdk-ln"><ContractStrip p={p} explain /> {contractWords(p)}</span>
                      </>
                    ) : (
                      <>
                        <span className="tdk-nm">{k ? k.seasonYear + ' round ' + k.round + ' pick' : 'A pick'}</span>
                        {k && k.originalTeam ? <span className="tdk-ln">from {k.originalTeam}</span> : null}
                      </>
                    )}
                    {!twoTeams ? (
                      <label className="tdk-dest">
                        <span className="rsb-vh">Goes to</span>
                        <select value={a.toTeamId || ''} disabled={busy} onChange={function (e) { setDestination(key, e.target.value); }}>
                          <option value="">To which team?</option>
                          {involved.filter(function (x) { return x !== teamId; }).map(function (x) {
                            return <option key={x} value={x}>{(teamById[x] || {}).name}</option>;
                          })}
                        </select>
                      </label>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="tdk-rmv"
                    aria-label={'Take ' + (p ? p.full_name : 'this pick') + ' out'}
                    disabled={busy}
                    onClick={function () { removeAsset(key); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
                  </button>
                </div>
              );
            })}

            <div className="tdk-abox">
              <label className="tdk-search">
                <span className="rsb-vh">Add another player or pick from {mine ? 'your team' : t.name}</span>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                <input
                  type="search"
                  placeholder="Add another player or pick"
                  value={addFor === teamId ? addText : ''}
                  onFocus={function () { if (addFor !== teamId) { setAddFor(teamId); setAddText(''); setAddKind('all'); } }}
                  onChange={function (e) { setAddFor(teamId); setAddText(e.target.value); }}
                  onKeyDown={function (e) { if (e.key === 'Escape') { setAddFor(null); setAddText(''); } }}
                />
              </label>
              {m ? (
                <div className="tdk-dd" role="group" aria-label="Matches">
                  <div className="tdk-seg">
                    {['all', 'players', 'picks'].map(function (kk) {
                      return (
                        <button key={kk} type="button" className={addKind === kk ? 'is-on' : ''} aria-pressed={addKind === kk ? 'true' : 'false'} onClick={function () { setAddKind(kk); }}>
                          {kk === 'all' ? 'All' : kk === 'players' ? 'Players' : 'Picks'}
                        </button>
                      );
                    })}
                    <button type="button" className="tdk-close" aria-label="Close the matches" onClick={function () { setAddFor(null); setAddText(''); }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                    </button>
                  </div>
                  {m.players.length === 0 && m.picks.length === 0 ? <p className="tdk-sm tdk-pad">No match.</p> : null}
                  {m.players.map(function (p) {
                    return (
                      <button type="button" className="tdk-ddr" key={p.contract_id} onClick={function () { addFrom(teamId, p, 'player'); }}>
                        <RosterFace sleeperId={p.sleeper_player_id} name={p.full_name} />
                        <span className="tdk-id">
                          <span className="tdk-nm">{p.full_name}<PlayerTags p={p} /></span>
                          <span className="tdk-ln">{p.player_position} &bull; {p.nfl_team || 'FA'} &middot; <RankChip p={p} /> &middot; <b>{formatCost(p.cap_hit)}</b> cap</span>
                        </span>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                      </button>
                    );
                  })}
                  {m.morePlayers > 0 ? <p className="tdk-sm tdk-pad">{m.morePlayers} more: type a name or a position to narrow the list.</p> : null}
                  {m.picks.map(function (k) {
                    return (
                      <button type="button" className="tdk-ddr" key={k.id} onClick={function () { addFrom(teamId, k, 'pick'); }}>
                        <span className="tdk-pk" aria-hidden="true"><b>R{k.round}</b>{String(k.seasonYear).slice(-2)}</span>
                        <span className="tdk-id">
                          <span className="tdk-nm">{k.seasonYear} round {k.round} pick</span>
                          {k.originalTeam ? <span className="tdk-ln">from {k.originalTeam}</span> : null}
                        </span>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        );
      }) : null}

      {partners.length > 0 && assets.length > 0 ? (
        <div className="tdk-card tdk-does">
          <div className="tdk-eyb-row edfl-explain-host">
            <span className="tdk-eyb">What this trade does</span>
            <ExplainButton label="How these figures are worked out" title="How these figures are worked out">
              <ul>
                <li>Starters are worked out as on your needs: the players in the trade are counted on their new team, this week and in every later week to the end of the regular season.</li>
                <li>Money by season comes from the league&rsquo;s own trade calculation once you review the trade: salary you take on, salary that leaves with your players, and dead money you keep.</li>
                <li>Rule checks (cap ceiling, cash, roster limits, trade-backs) run when you review. Nothing is sent until you press Send.</li>
              </ul>
            </ExplainButton>
          </div>

          {afterError ? <div className="form-error">Starters after the trade could not be worked out: {afterError}</div> : null}
          {needs && after ? (
            <ul className="tdk-lines">
              {involved.map(function (teamId) {
                const c = changeLines(teamId);
                if (!c) return null;
                const who = teamId === myTeamId ? 'You' : (teamById[teamId] || {}).name;
                return (
                  <li key={teamId}>
                    <i className={teamId === myTeamId ? 'is-n' : ''} />
                    <span>
                      <b>{who}:</b>{' '}
                      {c.now ? c.now + ' this week.' : 'no change to the starters this week.'}{' '}
                      {c.later ? 'After the trade: ' + c.later : 'After the trade, short nowhere to the end of the regular season.'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : moves.length === 0 ? (
            <p className="tdk-sm">Only picks are moving, so nobody&rsquo;s starters change.</p>
          ) : !afterError ? (
            <p className="tdk-sm">Working out the starters after the trade&hellip;</p>
          ) : null}

          {after ? (
            <>
              <div className="tdk-eyb tdk-mt">Starters by position after the trade</div>
              {involved.map(function (teamId) {
                return (
                  <div key={teamId}>
                    <div className="tdk-sm tdk-mt6"><b>{teamId === myTeamId ? 'You' : (teamById[teamId] || {}).name}</b></div>
                    <NeedsTiles rows={after} teamId={teamId} label={(teamId === myTeamId ? 'Your' : (teamById[teamId] || {}).name + '’s') + ' starters after the trade'} />
                  </div>
                );
              })}
              <NeedsKey />
            </>
          ) : null}

          {preview && !stale && moneyYears.length > 0 ? (
            <div className="tdk-money">
              <div className="tdk-eyb">Your money by season</div>
              {moneyYears.map(function (y) {
                return (
                  <div className="tdk-chrow" key={y.season_year}>
                    <span className="tdk-y">{y.season_year}</span>
                    <span className="tdk-chbars">
                      {Number(y.cap_added) > 0 ? (
                        <span className="tdk-chbar"><i className="is-in" style={{ width: barWidth(y.cap_added) }} />take on {formatCost(y.cap_added)}</span>
                      ) : null}
                      {Number(y.cap_if_kept) > 0 ? (
                        <span className="tdk-chbar"><i className="is-out" style={{ width: barWidth(y.cap_if_kept) }} />leaves {formatMoney(y.cap_if_kept)}</span>
                      ) : null}
                      {Number(y.dead_cap) > 0 ? (
                        <span className="tdk-chbar"><i className="is-dead" style={{ width: barWidth(y.dead_cap) }} />dead {formatCost(y.dead_cap)}</span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              <div className="tdk-leg3">
                <span><i className="is-in" />Salary you take on</span>
                <span><i className="is-out" />Salary that leaves with your player</span>
                <span><i className="is-dead" />Dead money you keep</span>
              </div>
            </div>
          ) : null}
          {!preview || stale ? (
            <div className="tdk-sm tdk-mt6">Money by season and the rule checks (cap ceiling, cash, roster limits) appear when you review.</div>
          ) : null}
        </div>
      ) : null}

      {partners.length > 0 && assets.length > 0 ? (
        <label className="tdk-note">
          <span className="tdk-fl">Note for the other owners (optional)</span>
          <input type="text" value={note} disabled={busy} onChange={function (e) { setNote(e.target.value); }} />
        </label>
      ) : null}

      {unrouted.length > 0 ? (
        <p className="tdk-sm">
          {unrouted.length} asset{unrouted.length === 1 ? ' still needs' : 's still need'} a destination team.
        </p>
      ) : null}

      {preview && stale ? (
        <p className="form-notice">
          You have changed the trade since this review. Review it again before sending: the figures below are for the previous version.
        </p>
      ) : null}

      {preview ? (
        <TradeImpactCards rows={preview.impact} legality={preview.legality} savings={preview.savings} savingsError={preview.savingsError} />
      ) : null}

      {partners.length > 0 ? (
        <div className="tdk-bdock">
          {!preview || stale ? (
            <>
              <button type="button" className="btn" onClick={handleReview} disabled={busy || !canReview}>
                {busy ? 'Working…' : preview ? 'Review again' : 'Review trade'}
              </button>
              <div className="tdk-sm">Nothing is sent until you review it.</div>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={handleSend} disabled={busy || legalityBlocking}>
                {busy ? 'Working…' : confirmingSend ? 'Press again to send' : 'Send to ' + partnerNames.join(' and ')}
              </button>
              {legalityBlocking ? (
                <div className="tdk-sm">This trade cannot be sent while it breaks a rule. Change the assets and review again.</div>
              ) : confirmingSend ? (
                <div className="tdk-sm">
                  Sending shows the trade to the other owners in it and counts as your acceptance. You may offer the same players or picks in other trades; once one naming them is accepted by every party, the others are cancelled.
                </div>
              ) : null}
            </>
          )}
          {tradeId || assets.length > 0 ? (
            <button type="button" className="btn btn-quiet" onClick={handleDiscard} disabled={busy}>
              {tradeId ? 'Discard draft' : 'Start over'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
