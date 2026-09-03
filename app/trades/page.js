import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import { formatDateTime } from '../../lib/formatDate';
import DiscardDraftButton from './DiscardDraftButton';
import {
  tradeStatusLabel,
  tradeStatusClass,
  tradeSection,
  SECTION_AWAITING_YOU,
  SECTION_YOUR_DRAFTS,
  SECTION_IN_FLIGHT,
  SECTION_COMPLETED,
} from '../../lib/tradeStatus';

export const revalidate = 0;

export const metadata = { title: 'Trades' };

// VISIBILITY IS DECIDED BY RLS, NOT HERE. Commissioner ruling of September 3,
// 2026: an offer is visible only to the teams party to it until every party
// has accepted; from acceptance onward (accepted / executed / vetoed /
// reversed) it is visible to any signed-in owner. Drafts stay proposer-only.
// Declined and cancelled offers stay between the owners who exchanged them.
// The commissioner and co-commissioner get NO special read on proposals --
// both are competing owners, and there is nothing to approve until every
// party has agreed. can_view_trade() in the database is the single judge, so
// this page needs no visibility filtering of its own -- do not add any.

// The list is a ledger a human scrolls, so it is BOUND-AND-WARN: an explicit
// range plus a visible notice at the cap. Parties and assets are different --
// they describe the rows already on screen, and a truncated asset list would
// silently mis-state what a trade contains. Those page until exhausted.
const TRADE_LIMIT = 200;

// Not lib/statsHelpers.js's fetchAllPages: that one is bound to the browser
// client and hardcodes an order by player_id. Same pattern, different client.
async function fetchAllRows(buildQuery, orderColumn) {
  const pageSize = 1000;
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await buildQuery()
      .order(orderColumn)
      .range(from, from + pageSize - 1);
    if (error) return { rows: all, error };
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return { rows: all, error: null };
}

function describePick(pick) {
  if (!pick) return 'Draft pick';
  return String(pick.season_year) + ' round ' + String(pick.round);
}

function TradeRow({ trade, teamNames, parties, assets, players, picks, myTeamId, showDiscard }) {
  const teamsInvolved = (parties || [])
    .map(function (p) {
      return teamNames[p.team_id] || 'Unknown team';
    })
    .sort();

  const playerCount = (assets || []).filter(function (a) {
    return a.asset_type === 'player';
  }).length;
  const pickCount = (assets || []).filter(function (a) {
    return a.asset_type === 'pick';
  }).length;

  const awaiting = (parties || []).filter(function (p) {
    return !p.accepted_at && !p.declined_at;
  }).length;

  // What this owner would give up and get back, named rather than counted.
  // A count tells them a trade is big; the names tell them whether they care.
  const mine = { out: [], in: [] };
  (assets || []).forEach(function (a) {
    const label =
      a.asset_type === 'player'
        ? players[a.player_id] || 'A player'
        : describePick(picks[a.draft_pick_id]);
    if (a.from_team_id === myTeamId) mine.out.push(label);
    if (a.to_team_id === myTeamId) mine.in.push(label);
  });

  return (
    <tr>
      <td className="team-name" data-label="Teams">
        <a href={'/trades/' + trade.id}>{teamsInvolved.join(' ↔ ')}</a>
      </td>
      <td data-label="Assets">
        {playerCount} player{playerCount === 1 ? '' : 's'}
        {pickCount > 0 ? ' · ' + pickCount + ' pick' + (pickCount === 1 ? '' : 's') : ''}
        {(mine.out.length > 0 || mine.in.length > 0) && (
          <div className="row-note">
            {mine.out.length > 0 && <span>You send: {mine.out.join(', ')}. </span>}
            {mine.in.length > 0 && <span>You get: {mine.in.join(', ')}.</span>}
          </div>
        )}
      </td>
      <td data-label="When">
        {trade.executed_at
          ? formatDateTime(trade.executed_at)
          : trade.effective_at
            ? formatDateTime(trade.effective_at)
            : trade.proposed_at
              ? formatDateTime(trade.proposed_at)
              : formatDateTime(trade.created_at)}
      </td>
      <td className="col-status" data-label="Status">
        <span className={tradeStatusClass(trade.status)}>{tradeStatusLabel(trade.status)}</span>
        {trade.status === 'proposed' && awaiting > 0 && (
          <div className="row-note">
            {awaiting} still to accept
          </div>
        )}
        {trade.status === 'vetoed' && trade.resolution_reason && (
          <div className="row-note">Vetoed: {trade.resolution_reason}</div>
        )}
        {trade.status === 'declined' && trade.resolution_reason && (
          <div className="row-note">Declined: {trade.resolution_reason}</div>
        )}
        {/*
          'cancelled' is set by accept_trade() when a DIFFERENT trade naming one
          of the same players or picks was accepted by every party (ruling of
          September 3, 2026). The reason names the asset and the moment, so the
          row explains itself without a click.
        */}
        {trade.status === 'cancelled' && trade.resolution_reason && (
          <div className="row-note">{trade.resolution_reason}</div>
        )}
        {/*
          Only on rows under "Your drafts". RLS already guarantees a draft is
          visible to nobody but its proposer, so anything reaching this branch
          is the viewer's own -- but discard_trade_draft() re-checks ownership
          anyway and is the real gate.
        */}
        {showDiscard && (
          <div className="row-note">
            <DiscardDraftButton tradeId={trade.id} />
          </div>
        )}
      </td>
    </tr>
  );
}

function Section({ title, note, trades, ...rest }) {
  if (trades.length === 0) return null;
  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="section-heading">
        {title} ({trades.length})
      </h2>
      {note && <p className="empty-note">{note}</p>}
      <table className="ledger">
        <thead>
          <tr>
            <th>Teams</th>
            <th>Assets</th>
            <th>When</th>
            <th className="col-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map(function (t) {
            return <TradeRow key={t.trade.id} trade={t.trade} {...t.extra} {...rest} />;
          })}
        </tbody>
      </table>
    </section>
  );
}

export default async function TradesPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/trades');

  const supabase = await createSupabaseServerClient();

  const { data: trades, error: tradesError } = await supabase
    .from('trades')
    .select(
      'id, season_year, status, proposed_by, proposing_team_id, note, proposed_at, effective_at, executed_at, resolution_reason, trade_window, created_at'
    )
    .order('created_at', { ascending: false })
    .range(0, TRADE_LIMIT - 1);

  if (tradesError) {
    return (
      <main className="page">
        <p className="page-actions"><a href="/">&larr; Home</a></p>
        <h1>Trades</h1>
        <p className="form-error">Couldn&apos;t load trades: {tradesError.message}</p>
      </main>
    );
  }

  const tradeList = trades || [];
  const ids = tradeList.map(function (t) {
    return t.id;
  });

  let parties = [];
  let assets = [];
  if (ids.length > 0) {
    const partiesResult = await fetchAllRows(function () {
      return supabase
        .from('trade_parties')
        .select('id, trade_id, team_id, accepted_at, declined_at')
        .in('trade_id', ids);
    }, 'id');
    const assetsResult = await fetchAllRows(function () {
      return supabase
        .from('trade_assets')
        .select('id, trade_id, asset_type, contract_id, player_id, draft_pick_id, from_team_id, to_team_id')
        .in('trade_id', ids);
    }, 'id');
    parties = partiesResult.rows;
    assets = assetsResult.rows;
  }

  const playerIds = Array.from(
    new Set(
      assets
        .map(function (a) {
          return a.player_id;
        })
        .filter(Boolean)
    )
  );
  const pickIds = Array.from(
    new Set(
      assets
        .map(function (a) {
          return a.draft_pick_id;
        })
        .filter(Boolean)
    )
  );

  const [{ data: teams }, { data: playerRows }, { data: pickRows }] = await Promise.all([
    supabase.from('teams').select('id, name'),
    playerIds.length > 0
      ? supabase.from('players').select('id, full_name').in('id', playerIds)
      : Promise.resolve({ data: [] }),
    pickIds.length > 0
      ? supabase.from('draft_picks').select('id, season_year, round').in('id', pickIds)
      : Promise.resolve({ data: [] }),
  ]);

  const teamNames = {};
  (teams || []).forEach(function (t) {
    teamNames[t.id] = t.name;
  });
  const players = {};
  (playerRows || []).forEach(function (p) {
    players[p.id] = p.full_name;
  });
  const picks = {};
  (pickRows || []).forEach(function (p) {
    picks[p.id] = p;
  });

  const partiesByTrade = {};
  parties.forEach(function (p) {
    if (!partiesByTrade[p.trade_id]) partiesByTrade[p.trade_id] = [];
    partiesByTrade[p.trade_id].push(p);
  });
  const assetsByTrade = {};
  assets.forEach(function (a) {
    if (!assetsByTrade[a.trade_id]) assetsByTrade[a.trade_id] = [];
    assetsByTrade[a.trade_id].push(a);
  });

  const buckets = {};
  buckets[SECTION_AWAITING_YOU] = [];
  buckets[SECTION_YOUR_DRAFTS] = [];
  buckets[SECTION_IN_FLIGHT] = [];
  buckets[SECTION_COMPLETED] = [];

  tradeList.forEach(function (trade) {
    const tradeParties = partiesByTrade[trade.id] || [];
    const myParty = tradeParties.find(function (p) {
      return p.team_id === me.team_id;
    });
    const section = tradeSection(trade, myParty);
    buckets[section].push({
      trade: trade,
      extra: {
        parties: tradeParties,
        assets: assetsByTrade[trade.id] || [],
      },
    });
  });

  const shared = { teamNames: teamNames, players: players, picks: picks, myTeamId: me.team_id };
  const nothing =
    buckets[SECTION_AWAITING_YOU].length === 0 &&
    buckets[SECTION_YOUR_DRAFTS].length === 0 &&
    buckets[SECTION_IN_FLIGHT].length === 0 &&
    buckets[SECTION_COMPLETED].length === 0;

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">EDFL</p>
      <h1>Trades</h1>

      <p className="page-actions">
        <a href="/trades/new" className="btn">
          + Propose a Trade
        </a>
      </p>

      {nothing && (
        <p className="empty-note">
          No trades yet. Anything you build stays a private draft until you send it.
        </p>
      )}

      <Section
        title="Awaiting your acceptance"
        note="These need an answer from you before they can go anywhere."
        trades={buckets[SECTION_AWAITING_YOU]}
        {...shared}
      />
      <Section
        title="Your drafts"
        note="Visible only to you. A draft reserves nothing — the players and picks in it can still be traded by someone else until you send it. Discarding one deletes it permanently."
        trades={buckets[SECTION_YOUR_DRAFTS]}
        showDiscard
        {...shared}
      />
      <Section
        title="In flight"
        note="Sent or accepted, and not yet finished."
        trades={buckets[SECTION_IN_FLIGHT]}
        {...shared}
      />
      <Section
        title="Completed"
        trades={buckets[SECTION_COMPLETED]}
        {...shared}
      />

      {tradeList.length >= TRADE_LIMIT && (
        <p className="form-notice">
          Showing the {TRADE_LIMIT} most recent trades. Older ones are not listed.
        </p>
      )}
    </main>
  );
}
