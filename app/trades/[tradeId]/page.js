import { redirect } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
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
      'id, season_year, status, proposed_by, proposing_team_id, note, proposed_at, effective_at, approved_at, executed_at, reversed_at, reversal_reason, resolution_reason, trade_window, created_at'
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

  // A REVERSED TRADE HAS NO LIVE IMPACT, AND ASKING FOR ONE PRODUCES A LIE.
  //
  // reverse_trade() clears the frozen settlement. trade_impact() does not read
  // that settlement -- it computes -- so calling it on a reversed trade returns
  // a perfectly real set of numbers answering "what would this cost if it
  // happened today", which is a question nobody asked and which an owner would
  // read as what the trade DID cost. Both RPCs are skipped below rather than
  // filtered afterwards, so the wrong number is never fetched at all.
  const isReversed = trade.status === 'reversed';

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

  const [{ data: playerRows }, { data: pickRows }, impactResult, legalityResult, configResult] =
    await Promise.all([
      playerIds.length > 0
        ? supabase.from('players').select('id, full_name').in('id', playerIds)
        : Promise.resolve({ data: [] }),
      pickIds.length > 0
        ? supabase.from('draft_picks').select('id, season_year, round').in('id', pickIds)
        : Promise.resolve({ data: [] }),
      isReversed
        ? Promise.resolve({ data: [], error: null })
        : supabase.rpc('trade_impact', { p_trade_id: tradeId }),
      isReversed
        ? Promise.resolve({ data: [], error: null })
        : supabase.rpc('trade_legality', { p_trade_id: tradeId }),
      supabase.from('league_config').select('trade_reversal_window_hours').maybeSingle(),
    ]);

  const teamNames = {};
  (teams || []).forEach(function (t) { teamNames[t.id] = t.name; });
  const players = {};
  (playerRows || []).forEach(function (p) { players[p.id] = p.full_name; });
  const picks = {};
  (pickRows || []).forEach(function (p) { picks[p.id] = p; });

  // THREE IDENTITIES, AND THEY ARE NOT INTERCHANGEABLE. Getting these crossed
  // is what left a proposer reading "only its parties can act on it" on their
  // own draft.
  //
  //   session.user.id   -- Supabase Auth uid. Used ONLY to look up the row
  //                        below, never compared to a trade column.
  //   team_owners.id    -- what trades.proposed_by stores.
  //   teams.id          -- what trade_parties.team_id stores.
  //
  // getCurrentTeamOwner() already resolves the auth uid to the team_owners
  // row, so me.id is a team_owners.id and me.team_id is a teams.id.
  // Compare each against its own kind and nothing else.
  const myParty = partyList.find(function (p) { return p.team_id === me.team_id; });
  const isParty = Boolean(myParty);
  const isProposer = trade.proposed_by === me.id;
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

  // How long is left to reverse. The window length is read from league_config,
  // never hardcoded -- 96 hours is the current value, not a constant of the
  // league, and the cut reversal window already taught this lesson once.
  //
  // Unknown is a real answer and is represented as null: if the config read
  // fails or the column is empty, the countdown is simply not shown. The
  // database is the authority on whether the window is open, and the dialog
  // says so rather than this page guessing.
  let reversalHoursLeft = null;
  if (
    trade.status === 'executed' &&
    trade.executed_at &&
    !configResult.error &&
    configResult.data &&
    configResult.data.trade_reversal_window_hours !== null &&
    configResult.data.trade_reversal_window_hours !== undefined
  ) {
    const windowHours = Number(configResult.data.trade_reversal_window_hours);
    const executedAtMs = new Date(trade.executed_at).getTime();
    if (Number.isFinite(windowHours) && Number.isFinite(executedAtMs)) {
      const elapsedHours = (Date.now() - executedAtMs) / 3600000;
      reversalHoursLeft = windowHours - elapsedHours;
    }
  }

  // WHO MAY REVERSE IS NOT WHO MAY APPROVE, AND THE DIFFERENCE IS DELIBERATE.
  //
  // Rule 7.7(e) recuses BOTH the commissioner and a co-commissioner from
  // approving a trade their own team is party to -- see approverIsConflicted
  // above. The reversal ruling of August 27, 2026 recuses only the
  // CO-commissioner. The commissioner may reverse any trade including one of
  // his own, because reversing is undoing a decision rather than making one,
  // and a commissioner who executed a trade in error must be able to take it
  // back without needing someone else to do it for him.
  //
  // Do NOT "fix" this to match approverIsConflicted. They look inconsistent
  // and are not.
  const canReverse =
    canApprove &&
    trade.status === 'executed' &&
    (Boolean(me.is_commissioner) || !isParty);

  const assetsFrom = {};
  partyList.forEach(function (p) { assetsFrom[p.team_id] = { out: [], in: [] }; });
  assetList.forEach(function (a) {
    const label =
      a.asset_type === 'player'
        ? players[a.player_id] || 'A player'
        : describePick(picks[a.draft_pick_id]);
    const entry = {
      label: label,
      condition: a.condition_text || null,
      playerId: a.asset_type === 'player' ? a.player_id : null,
    };
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
      {/*
        Not shown on a reversed trade: the settlement those figures described
        has been cleared, so "figures frozen" would point at nothing.
      */}
      {trade.effective_at && !isReversed && (
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
      {/*
        A cancelled offer was not refused by anyone here. accept_trade() cancels
        every other open offer naming a player or pick the moment a trade with
        that asset is accepted by all of its parties (ruling of September 3,
        2026). Nothing about this offer can be revived; the owners build a new
        one if the asset comes free again.
      */}
      {trade.status === 'cancelled' && (
        <div className="form-error">
          <strong>This offer was cancelled.</strong>{' '}
          {trade.resolution_reason ||
            'A player or pick in it was committed to another trade that every party accepted.'}
        </div>
      )}

      {/*
        The reversal notice carries the whole story because nothing else on the
        page can. The impact cards are gone, the frozen-figures banner is gone,
        and what remains is a record of assets that moved and then moved back --
        which reads as a live trade unless this says otherwise.
      */}
      {isReversed && (
        <div className="form-error">
          <p>
            <strong>
              This trade was reversed
              {trade.reversed_at ? ' ' + formatDateTime(trade.reversed_at) : ''}.
            </strong>
          </p>
          {trade.reversal_reason && <p>{trade.reversal_reason}</p>}
          <p>
            Every player went back to the roster that sent him, on his original contract, and
            every pick went back too. The settlement that moved the money is marked reversed
            rather than deleted, so <strong>neither team is carrying any cap or cash from this
            trade</strong>. It stays on the record here and in the{' '}
            <a href="/actions">Commissioner Action Log</a> rather than disappearing.
          </p>
          <p>
            <strong>Sleeper was not touched.</strong> Nothing in this app can change a Sleeper
            roster. If these players were already moved there, they have to be moved back by
            hand.
          </p>
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
                {/*
                  A STATUS, NOT A CONTROL. This used to wear .status, the same
                  bordered pill the clickable chips elsewhere use, and it read
                  as a button. Status and verdict now share one non-interactive
                  visual language -- coloured text with a glyph, no border, no
                  pill, no hover, no focus. See .trade-state in globals.css.
                */}
                <span
                  className={
                    p.declined_at
                      ? 'trade-state trade-state-bad'
                      : p.accepted_at
                        ? 'trade-state trade-state-ok'
                        : 'trade-state trade-state-wait'
                  }
                >
                  {p.declined_at ? '✗ Declined' : p.accepted_at ? '✓ Accepted' : '• Awaiting'}
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
                          <PlayerLink playerId={e.playerId}>{e.label}</PlayerLink>
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
                          <PlayerLink playerId={e.playerId}>{e.label}</PlayerLink>
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

      {/* Heading and cards both hidden on a reversed trade -- see isReversed. */}
      {!isReversed && (
        <>
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
        </>
      )}

      <TradePanel
        tradeId={trade.id}
        status={trade.status}
        isParty={isParty}
        isProposer={isProposer}
        hasAccepted={Boolean(myParty && myParty.accepted_at)}
        hasDeclined={Boolean(myParty && myParty.declined_at)}
        canApprove={canApprove}
        isCommissioner={Boolean(me.is_commissioner)}
        approverIsConflicted={approverIsConflicted}
        stalledOnRecusal={stalledOnRecusal}
        isFinal={isFinalStatus(trade.status)}
        canReverse={canReverse}
        reversalHoursLeft={reversalHoursLeft}
        myTeamName={teamNames[me.team_id] || 'your team'}
      />
    </main>
  );
}
