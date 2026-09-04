import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { formatDateTime } from '../../../lib/formatDate';
import { tradeStatusLabel, tradeStatusClass } from '../../../lib/tradeStatus';
import TradeImpactCards from '../../trades/TradeImpactCards';
import AdminTradePanel from './AdminTradePanel';

export const revalidate = 0;
export const metadata = { title: 'Trade Approvals' };

// THE COMMISSIONER'S SIDE OF TRADES, MOVED OFF /trades/[tradeId] (Sep 4 2026).
//
// Approve-and-execute, veto and reverse used to sit on the trade detail page,
// which every owner reads. Under the standing rule a League surface treats the
// commissioner as an ordinary owner, so those three controls live here and the
// detail page keeps only what a party does: accept, decline, send, discard.
//
// WHAT THIS PAGE CAN SEE IS DECIDED BY RLS, NOT BY THIS QUERY, AND THAT MATTERS
// MORE HERE THAN ANYWHERE ELSE. The September 3 visibility ruling gives the
// commissioner NO special read on a proposal: a trade at 'proposed' is visible
// only to its parties. So a non-party commissioner cannot see a proposal at
// all, and the veto-while-proposed path is unreachable for them by design --
// there is nothing to approve until every party has agreed anyway. The queue
// below is therefore 'accepted' (execute or veto) and 'executed' (reverse).
// Do not "fix" this by widening the read; the ruling is the reason.

const QUEUE_LIMIT = 200;

function describePick(pick) {
  if (!pick) return 'Draft pick';
  return String(pick.season_year) + ' round ' + String(pick.round);
}

export default async function AdminTradesPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/trades');
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  const [{ data: trades, error: tradesError }, { data: config }] = await Promise.all([
    supabase
      .from('trades')
      .select(
        'id, season_year, status, proposed_by, proposing_team_id, note, proposed_at, effective_at, approved_at, executed_at, reversed_at, reversal_reason, resolution_reason, trade_window, created_at'
      )
      .in('status', ['accepted', 'executed'])
      .order('created_at', { ascending: false })
      .range(0, QUEUE_LIMIT - 1),
    supabase
      .from('league_config')
      .select('trade_reversal_window_hours')
      .eq('id', true)
      .maybeSingle(),
  ]);

  if (tradesError) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/">&larr; Home</a></p>
        <h1>Trade Approvals</h1>
        <p className="form-error">Couldn&apos;t load trades: {tradesError.message}</p>
      </main>
    );
  }

  const tradeList = trades || [];
  const ids = tradeList.map(function (t) { return t.id; });

  const [{ data: parties }, { data: assets }, { data: teams }] = await Promise.all([
    ids.length > 0
      ? supabase
          .from('trade_parties')
          .select('id, trade_id, team_id, accepted_at, declined_at')
          .in('trade_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase
          .from('trade_assets')
          .select('id, trade_id, asset_type, player_id, draft_pick_id, from_team_id, to_team_id')
          .in('trade_id', ids)
      : Promise.resolve({ data: [] }),
    supabase.from('teams').select('id, name'),
  ]);

  const assetList = assets || [];
  const playerIds = Array.from(
    new Set(assetList.map(function (a) { return a.player_id; }).filter(Boolean))
  );
  const pickIds = Array.from(
    new Set(assetList.map(function (a) { return a.draft_pick_id; }).filter(Boolean))
  );

  const [{ data: playerRows }, { data: pickRows }] = await Promise.all([
    playerIds.length > 0
      ? supabase.from('players').select('id, full_name').in('id', playerIds)
      : Promise.resolve({ data: [] }),
    pickIds.length > 0
      ? supabase.from('draft_picks').select('id, season_year, round').in('id', pickIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teamNames = {};
  (teams || []).forEach(function (t) { teamNames[t.id] = t.name; });
  const players = {};
  (playerRows || []).forEach(function (p) { players[p.id] = p.full_name; });
  const picks = {};
  (pickRows || []).forEach(function (p) { picks[p.id] = p; });

  const partiesByTrade = {};
  (parties || []).forEach(function (p) {
    if (!partiesByTrade[p.trade_id]) partiesByTrade[p.trade_id] = [];
    partiesByTrade[p.trade_id].push(p);
  });
  const assetsByTrade = {};
  assetList.forEach(function (a) {
    if (!assetsByTrade[a.trade_id]) assetsByTrade[a.trade_id] = [];
    assetsByTrade[a.trade_id].push(a);
  });

  // Impact and legality are fetched ONLY for trades awaiting execution -- the
  // ones where the commissioner has to check compliance before acting. An
  // executed trade's figures are frozen and shown on its detail page, and
  // calling trade_impact on a reversed one would recompute a hypothetical.
  const awaiting = tradeList.filter(function (t) { return t.status === 'accepted'; });
  const impactResults = await Promise.all(
    awaiting.map(function (t) {
      return Promise.all([
        supabase.rpc('trade_impact', { p_trade_id: t.id }),
        supabase.rpc('trade_legality', { p_trade_id: t.id }),
      ]);
    })
  );
  const impactByTrade = {};
  awaiting.forEach(function (t, i) {
    impactByTrade[t.id] = {
      impact: impactResults[i][0].error ? [] : impactResults[i][0].data || [],
      legality: impactResults[i][1].error ? [] : impactResults[i][1].data || [],
      error: impactResults[i][0].error ? impactResults[i][0].error.message : null,
    };
  });

  const windowHours =
    config && config.trade_reversal_window_hours !== null &&
    config.trade_reversal_window_hours !== undefined
      ? Number(config.trade_reversal_window_hours)
      : null;

  const rows = tradeList.map(function (trade) {
    const tradeParties = partiesByTrade[trade.id] || [];
    const isParty = tradeParties.some(function (p) { return p.team_id === me.team_id; });

    // RECUSAL, RULE 7.7(e). execute_trade() refuses when the approver's own
    // team is a party. Detected here so the control is not offered rather than
    // letting the commissioner discover it as a refusal -- the database check
    // is still the real gate.
    const conflicted = isParty;

    // WHO MAY REVERSE IS NOT WHO MAY APPROVE, DELIBERATELY. 7.7(e) recuses both
    // roles from APPROVING their own team's trade. The reversal ruling of
    // August 27 recuses only the CO-commissioner: the commissioner may reverse
    // any trade including his own, because reversing undoes a decision rather
    // than making one. Do not collapse these two into one flag.
    const canReverse =
      trade.status === 'executed' && (Boolean(me.is_commissioner) || !isParty);

    let hoursLeft = null;
    if (trade.status === 'executed' && trade.executed_at && windowHours !== null) {
      const ms = new Date(trade.executed_at).getTime();
      if (Number.isFinite(ms) && Number.isFinite(windowHours)) {
        hoursLeft = windowHours - (Date.now() - ms) / 3600000;
      }
    }

    const teamsInvolved = tradeParties
      .map(function (p) { return teamNames[p.team_id] || 'Unknown team'; })
      .sort();

    const assetLabels = (assetsByTrade[trade.id] || []).map(function (a) {
      const label =
        a.asset_type === 'player'
          ? players[a.player_id] || 'A player'
          : describePick(picks[a.draft_pick_id]);
      return (
        label +
        ' — ' +
        (teamNames[a.from_team_id] || '?') +
        ' to ' +
        (teamNames[a.to_team_id] || '?')
      );
    });

    return {
      trade: trade,
      teamsInvolved: teamsInvolved,
      assetLabels: assetLabels,
      isParty: isParty,
      conflicted: conflicted,
      canReverse: canReverse,
      hoursLeft: hoursLeft,
      myTeamName: teamNames[me.team_id] || 'your team',
    };
  });

  const awaitingRows = rows.filter(function (r) { return r.trade.status === 'accepted'; });
  const executedRows = rows.filter(function (r) { return r.trade.status === 'executed'; });

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">Commissioner</p>
      <h1>Trade Approvals</h1>

      <p className="empty-note">
        Approve, veto and reverse live here rather than on the trade pages owners read. A
        proposal that has not been fully accepted is not listed: it is visible only to its
        parties until every one of them has agreed, and there is nothing to approve until then.
      </p>

      <h2 className="section-heading">
        Awaiting approval ({awaitingRows.length})
      </h2>
      {awaitingRows.length === 0 ? (
        <p className="empty-note">Nothing is waiting on you.</p>
      ) : (
        awaitingRows.map(function (r) {
          const figures = impactByTrade[r.trade.id] || { impact: [], legality: [], error: null };
          return (
            <section key={r.trade.id} style={{ marginTop: 24 }}>
              <h3 className="team-name">
                <a href={'/trades/' + r.trade.id}>{r.teamsInvolved.join(' ↔ ')}</a>{' '}
                <span className={tradeStatusClass(r.trade.status)}>
                  {tradeStatusLabel(r.trade.status)}
                </span>
              </h3>
              {r.trade.effective_at && (
                <p className="empty-note">
                  Figures frozen {formatDateTime(r.trade.effective_at)} — settled when the last
                  party accepted, and approving does not re-price them.
                </p>
              )}
              <ul className="trade-asset-list">
                {r.assetLabels.map(function (label, i) {
                  return <li key={i}><span>{label}</span></li>;
                })}
              </ul>
              {figures.error ? (
                <p className="form-error">The impact could not be calculated: {figures.error}</p>
              ) : (
                <TradeImpactCards rows={figures.impact} legality={figures.legality} />
              )}
              <AdminTradePanel
                tradeId={r.trade.id}
                status={r.trade.status}
                conflicted={r.conflicted}
                isCommissioner={Boolean(me.is_commissioner)}
                canReverse={r.canReverse}
                hoursLeft={r.hoursLeft}
                myTeamName={r.myTeamName}
              />
            </section>
          );
        })
      )}

      <h2 className="section-heading" style={{ marginTop: 40 }}>
        Executed ({executedRows.length})
      </h2>
      {executedRows.length === 0 ? (
        <p className="empty-note">No executed trades.</p>
      ) : (
        executedRows.map(function (r) {
          return (
            <section key={r.trade.id} style={{ marginTop: 24 }}>
              <h3 className="team-name">
                <a href={'/trades/' + r.trade.id}>{r.teamsInvolved.join(' ↔ ')}</a>{' '}
                <span className={tradeStatusClass(r.trade.status)}>
                  {tradeStatusLabel(r.trade.status)}
                </span>
              </h3>
              <p className="empty-note">
                Executed {r.trade.executed_at ? formatDateTime(r.trade.executed_at) : ''}.
              </p>
              <ul className="trade-asset-list">
                {r.assetLabels.map(function (label, i) {
                  return <li key={i}><span>{label}</span></li>;
                })}
              </ul>
              <AdminTradePanel
                tradeId={r.trade.id}
                status={r.trade.status}
                conflicted={r.conflicted}
                isCommissioner={Boolean(me.is_commissioner)}
                canReverse={r.canReverse}
                hoursLeft={r.hoursLeft}
                myTeamName={r.myTeamName}
              />
            </section>
          );
        })
      )}

      {tradeList.length >= QUEUE_LIMIT && (
        <p className="form-notice">
          Showing the {QUEUE_LIMIT} most recent. Older ones are not listed.
        </p>
      )}
    </main>
  );
}
