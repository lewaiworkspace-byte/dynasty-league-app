import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import { formatDateTime } from '../../../lib/formatDate';
import { tradeStatusLabel, tradeStatusClass, isFinalStatus } from '../../../lib/tradeStatus';
import TradeImpactCards from '../TradeImpactCards';
import TradePanel from './TradePanel';

export const revalidate = 0;

export const metadata = { title: 'Trade' };

function describePick(pick) {
  if (!pick) return 'Draft pick';
  return String(pick.season_year) + ' round ' + String(pick.round);
}

export default async function TradeDetailPage({ params }) {
  const { tradeId } = await params;

  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/trades/' + tradeId);

  const supabase = await createSupabaseServerClient();

  const { data: trade, error: tradeError } = await supabase
    .from('trades')
    .select(
      'id, season_year, status, proposed_by, proposing_team_id, note, proposed_at, effective_at, approved_at, executed_at, resolution_reason, trade_window, created_at'
    )
    .eq('id', tradeId)
    .maybeSingle();

  if (tradeError) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/trades">&larr; Trades</a></p>
        <p className="form-error">Couldn&apos;t load this trade: {tradeError.message}</p>
      </main>
    );
  }

  // RLS hides a draft from everyone but its proposer, so "not found" here can
  // mean either no such trade or somebody else's draft. Saying which would
  // leak the existence of a private draft, so the wording covers both.
  if (!trade) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/trades">&larr; Trades</a></p>
        <h1>Trade</h1>
        <p className="empty-note">
          No trade here. It may not exist, or it may be another owner&apos;s private draft.
        </p>
      </main>
    );
  }

  const [{ data: parties }, { data: assets }, { data: teams }] = await Promise.all([
    supabase
      .from('trade_parties')
      .select('id, team_id, accepted_at, declined_at')
      .eq('trade_id', tradeId),
    supabase
      .from('trade_assets')
      .select('id, asset_type, contract_id, player_id, draft_pick_id, from_team_id, to_team_id, condition_text')
      .eq('trade_id', tradeId),
    supabase.from('teams').select('id, name'),
  ]);

  const assetList = assets || [];
  const partyList = parties || [];

  const playerIds = Array.from(
    new Set(assetList.map(function (a) { return a.player_id; }).filter(Boolean))
  );
  const pickIds = Array.from(
    new Set(assetList.map(function (a) { return a.draft_pick_id; }).filter(Boolean))
  );

  const [{ data: playerRows }, { data: pickRows }, impactResult, legalityResult] =
    await Promise.all([
      playerIds.length > 0
        ? supabase.from('players').select('id, full_name').in('id', playerIds)
        : Promise.resolve({ data: [] }),
      pickIds.length > 0
        ? supabase.from('draft_picks').select('id, season_year, round').in('id', pickIds)
        : Promise.resolve({ data: [] }),
      supabase.rpc('trade_impact', { p_trade_id: tradeId }),
      supabase.rpc('trade_legality', { p_trade_id: tradeId }),
    ]);

  const teamNames = {};
  (teams || []).forEach(function (t) { teamNames[t.id] = t.name; });
  const players = {};
  (playerRows || []).forEach(function (p) { players[p.id] = p.full_name; });
  const picks = {};
  (pickRows || []).forEach(function (p) { picks[p.id] = p; });

  const myParty = partyList.find(function (p) { return p.team_id === me.team_id; });
  const isParty = Boolean(myParty);
  const canApprove = isCommissionerOrCo(me);

  // RECUSAL, RULE 7.7(e). execute_trade() refuses when the approver's own team
  // is a party. Detected here from the party list rather than by letting an
  // owner discover it as a raw refusal -- but the database check is still the
  // real gate, and executeTrade() surfaces it if it ever fires anyway.
  const approverIsConflicted = canApprove && isParty;

  // WHAT THE PARTIES ARE TOLD IS DELIBERATELY VAGUER THAN WHAT THE APPROVER IS
  // TOLD, AND IT IS AN RLS CONSEQUENCE, NOT AN OVERSIGHT.
  //
  // Naming the conflicted team means reading is_commissioner off team_owners,
  // and RLS on that table is "your own row, or you are commissioner/co". A
  // regular owner querying it sees only themselves, so they cannot be shown
  // who holds the role. The alternatives were to reach around RLS with the
  // service-role client or to add a SECURITY DEFINER function; both widen data
  // access to improve a notice, which is not a trade this file should make on
  // its own. So a party gets the accurate general statement and an approver
  // gets the specific one.
  const stalledOnRecusal = trade.status === 'accepted';

  const assetsFrom = {};
  partyList.forEach(function (p) { assetsFrom[p.team_id] = { out: [], in: [] }; });
  assetList.forEach(function (a) {
    const label =
      a.asset_type === 'player'
        ? players[a.player_id] || 'A player'
        : describePick(picks[a.draft_pick_id]);
    const entry = { label: label, condition: a.condition_text || null };
    if (assetsFrom[a.from_team_id]) assetsFrom[a.from_team_id].out.push(entry);
    if (assetsFrom[a.to_team_id]) assetsFrom[a.to_team_id].in.push(entry);
  });

  return (
    <main className="page">
      <p className="page-actions"><a href="/trades">&larr; Trades</a></p>
      <p className="eyebrow">EDFL · {trade.season_year}</p>
      <h1>Trade</h1>

      <p>
        <span className={tradeStatusClass(trade.status)}>{tradeStatusLabel(trade.status)}</span>
      </p>

      {trade.note && <p className="subhead">{trade.note}</p>}

      {/*
        THE FREEZE POINT. Cap and cash implications are fixed when the LAST
        party accepts, not when the commissioner approves. An owner who sees
        figures settle at acceptance and then approval happen later will assume
        the numbers moved unless the page says plainly that they did not.
      */}
      {trade.effective_at && (
        <div className="form-notice">
          <strong>Figures frozen {formatDateTime(trade.effective_at)}.</strong> The cap and
          cash implications below were settled at the moment the last party accepted, and
          they do not change afterwards. Approving this trade will not re-price it.
          {trade.trade_window && ' Trade window: ' + trade.trade_window + '.'}
        </div>
      )}

      {trade.status === 'vetoed' && trade.resolution_reason && (
        <div className="form-error">
          <strong>Vetoed under rule 7.7(d).</strong> {trade.resolution_reason}
        </div>
      )}
      {trade.status === 'declined' && trade.resolution_reason && (
        <div className="form-error">
          <strong>Declined.</strong> {trade.resolution_reason}
        </div>
      )}

      <h2 className="section-heading">Who gets what</h2>
      <div className="trade-cards">
        {partyList.map(function (p) {
          const side = assetsFrom[p.team_id] || { out: [], in: [] };
          return (
            <article className="trade-card" key={p.id}>
              <header className="trade-card-head">
                <h3 className="team-name">{teamNames[p.team_id] || 'Unknown team'}</h3>
                <span
                  className={
                    p.declined_at
                      ? 'status status-bad'
                      : p.accepted_at
                        ? 'status status-good'
                        : 'status status-live'
                  }
                >
                  {p.declined_at ? 'Declined' : p.accepted_at ? 'Accepted' : 'Awaiting'}
                </span>
              </header>
              <div className="trade-side">
                <p className="trade-side-label">Sends</p>
                {side.out.length === 0 ? (
                  <p className="empty-note">Nothing</p>
                ) : (
                  <ul>
                    {side.out.map(function (e, i) {
                      return (
                        <li key={'o' + i}>
                          {e.label}
                          {e.condition && <span className="row-note"> {e.condition}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="trade-side-label">Receives</p>
                {side.in.length === 0 ? (
                  <p className="empty-note">Nothing</p>
                ) : (
                  <ul>
                    {side.in.map(function (e, i) {
                      return (
                        <li key={'i' + i}>
                          {e.label}
                          {e.condition && <span className="row-note"> {e.condition}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {p.accepted_at && (
                <p className="empty-note">Accepted {formatDateTime(p.accepted_at)}</p>
              )}
            </article>
          );
        })}
      </div>

      <h2 className="section-heading">Impact</h2>
      {impactResult.error ? (
        <p className="form-error">
          The impact could not be calculated: {impactResult.error.message}
        </p>
      ) : (
        <TradeImpactCards
          rows={impactResult.data || []}
          legality={legalityResult.error ? [] : legalityResult.data || []}
        />
      )}
      {legalityResult.error && (
        <p className="form-error">
          Rule legality could not be checked: {legalityResult.error.message}
        </p>
      )}

      <TradePanel
        tradeId={trade.id}
        status={trade.status}
        isParty={isParty}
        hasAnswered={Boolean(myParty && (myParty.accepted_at || myParty.declined_at))}
        canApprove={canApprove}
        isCommissioner={Boolean(me.is_commissioner)}
        approverIsConflicted={approverIsConflicted}
        stalledOnRecusal={stalledOnRecusal}
        isFinal={isFinalStatus(trade.status)}
        myTeamName={teamNames[me.team_id] || 'your team'}
      />
    </main>
  );
}
