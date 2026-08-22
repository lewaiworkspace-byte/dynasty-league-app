import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import TierPlayerList from './TierPlayerList';
import { isStandingBidNote } from '../../lib/delegationNotes';
import { buildTierRows, tierRowStatus, tierRowTone } from '../../lib/tierRows';
import { formatDateTime, formatShortDateTime } from '../../lib/formatDate';
import { formatMoney } from '../../lib/formatMoney';

// Bid counts and tier windows must never be stale
export const revalidate = 0;

const MODE_LABELS = {
  execute: 'Execute',
  propose: 'Propose',
  discretionary: 'Discretionary',
};

function hasValue(v) {
  return v !== null && v !== undefined;
}

// Renders for a logged-in owner viewing the currently-open tier only.
// Nothing at all for a logged-out visitor or an owner whose team_owners
// row isn't linked -- teamOwner null covers both cases, per
// getCurrentTeamOwner()'s own contract.
//
// Slate-level facts only: mode, when it was armed, how big the slate is,
// the exposure ceiling, and the Edit button. Per-player state belongs to
// the single table below, which now carries every player in the tier.
function DelegationPanel({ activeTier, teamOwner, delegationRows, settings }) {
  if (!teamOwner) return null;

  const rows = delegationRows || [];

  if (rows.length === 0) {
    return (
      <div className="assistant-box" style={{ marginBottom: 32 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          Too busy to bid live? Set up Auto-Bid for this tier.
        </p>
        <p className="empty-note" style={{ marginTop: 8, marginBottom: 16 }}>
          Set a target for each player you&apos;re interested in and let it bid on your behalf when
          the tier closes.
        </p>
        <a href={'/bids/' + activeTier.id + '/delegate'} className="btn">
          Set Up Auto-Bid
        </a>
      </div>
    );
  }

  const mode = rows[0] ? rows[0].mode : null;

  // A cancelled entry is not queued -- it is not going to do anything.
  const activeEntries = rows.filter((d) => d.status !== 'cancelled');

  // "Produced a bid" is submitted_bid_id, not status === 'submitted'.
  // upsert_bid_delegation()'s ON CONFLICT resets status to 'draft' without
  // clearing submitted_bid_id, so an entry can be draft, failed or skipped
  // while still pointing at a bid it created. Status would undercount.
  const entriesWithBid = activeEntries.filter((d) => Boolean(d.submitted_bid_id));

  // The exposure ceiling lives on bid_delegation_settings, one row per
  // (tier_id, team_id) -- NOT on the individual delegation rows. A missing
  // row is a real and expected state: the owner has authored delegations
  // but never armed them.
  const ceilingParts = [];
  if (settings) {
    if (hasValue(settings.max_bids)) {
      ceilingParts.push('max ' + settings.max_bids + ' bid' + (Number(settings.max_bids) === 1 ? '' : 's'));
    }
    if (hasValue(settings.max_total_cash)) {
      ceilingParts.push('max ' + formatMoney(settings.max_total_cash) + ' cash');
    }
    if (hasValue(settings.max_total_cap)) {
      ceilingParts.push('max ' + formatMoney(settings.max_total_cap) + ' cap');
    }
  }

  const armedAt = settings && settings.armed_at ? settings.armed_at : null;

  return (
    <div className="assistant-box" style={{ marginBottom: 32 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Auto-Bid — {MODE_LABELS[mode] || mode || 'Unknown mode'}
      </p>

      <p
        className="empty-note"
        style={{ marginTop: 8, marginBottom: 4, color: armedAt ? 'var(--accent-gold)' : 'var(--text-dim)' }}
      >
        {armedAt
          ? 'Armed ' + formatDateTime(armedAt) + ' — these bids are submitted and sealed.'
          : 'Not armed yet — nothing has been submitted for this tier.'}
      </p>

      <p className="empty-note" style={{ marginTop: 4, marginBottom: 16 }}>
        {activeEntries.length +
          ' Auto-Bid entr' +
          (activeEntries.length === 1 ? 'y' : 'ies') +
          ' · ' +
          entriesWithBid.length +
          ' produced a bid · '}
        {ceilingParts.length > 0
          ? 'Worst-case exposure: ' + ceilingParts.join(', ')
          : 'No exposure ceiling set'}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <a href={'/bids/' + activeTier.id + '/delegate'} className="btn">
          Edit
        </a>
      </div>
    </div>
  );
}

// Read-only recap of a tier that has closed but is not yet verified.
//
// Between close and verification an owner otherwise sees nothing at all:
// /bids only finds activeTier inside the open window. That gap can last
// days, and it is exactly the window in which an owner may be told to clear
// a cap or cash flag within 24 hours.
//
// Statuses are the REAL ones (winner / lost / passed_over), not masked.
// Sealed-bid RLS already lets an owner read their own rows at any time.
// Because pass-over can still turn a lost bid into a winning one, the
// warning below is load-bearing, not decoration.
function ClosedTierRecap({ tier, teamOwner, bidRows, delegationRows, playerNames }) {
  if (!tier || !teamOwner) return null;

  const rows = buildTierRows({
    bids: bidRows,
    delegations: delegationRows,
    playerNames,
  });

  if (rows.length === 0) return null;

  const tierLabel = tier.name || 'Tier ' + tier.tier_number;

  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">{tierLabel + ' — Your Results'}</h2>
      <p className="empty-note" style={{ marginTop: 0 }}>
        {'Bidding closed ' + formatShortDateTime(tier.closes_at) + '. Awaiting the Commissioner.'}
      </p>

      <p style={{ color: 'var(--accent-rust)', fontWeight: 600, margin: '12px 0 16px' }}>
        Results are not final until verified by the Commissioner.
      </p>

      <table className="ledger year-table">
        <thead>
          <tr>
            <th>Player</th>
            <th className="col-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td data-label="Player">
                <div className="team-name">
                  {row.playerName}
                  {row.delegation && <span className="void-tag"> AUTO-BID</span>}
                </div>
                {row.delegation && row.delegation.error_message && (
                  <p
                    className={
                      isStandingBidNote(row.delegation.error_message)
                        ? 'row-note warn'
                        : 'row-note'
                    }
                  >
                    {row.delegation.error_message}
                  </p>
                )}
              </td>
              <td className="col-status" data-label="Status">
                <span className={'status status-' + tierRowTone(row)}>{tierRowStatus(row)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function BidsPage() {
  const now = new Date().toISOString();

  const [{ data: tiers, error: tiersError }, { data: config }, { data: verifiedTiers }, teamOwner] =
    await Promise.all([
      supabase
        .from('auction_tiers')
        .select('id, season_year, tier_number, name, opens_at, closes_at, resolved_at')
        .is('resolved_at', null)
        .order('opens_at'),
      supabase.from('league_config').select('league_short_name').eq('id', true).single(),
      supabase
        .from('auction_tiers')
        .select('id, season_year, tier_number, name, verified_at')
        .not('verified_at', 'is', null)
        .order('verified_at', { ascending: false }),
      getCurrentTeamOwner(),
    ]);

  const leagueName = config?.league_short_name || 'Dynasty League';

  const publishedResults = (verifiedTiers || []).length > 0 && (
    <section style={{ marginTop: 32 }}>
      <h2 className="section-heading">Published Results</h2>
      <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
        {verifiedTiers.map((t) => (
          <li key={t.id} style={{ marginBottom: 6 }}>
            {(t.name || 'Tier ' + t.tier_number) + ' (' + t.season_year + ') —'}{' '}
            <a href={'/bids/results/' + t.id}>View Results</a>
          </li>
        ))}
      </ul>
    </section>
  );

  if (tiersError) {
    return (
      <main className="page">
        <p className="subhead"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">{leagueName} · Free Agency</p>
        <h1>Blind Bid Auction</h1>
        <p className="subhead">Couldn&apos;t load tiers: {tiersError.message}</p>
      </main>
    );
  }

  const activeTier = (tiers || []).find((t) => t.opens_at <= now && t.closes_at >= now);
  const upcomingTiers = (tiers || []).filter((t) => t.opens_at > now);

  // The most recent tier that has closed but is not yet verified. Cannot
  // come from the tiers query above: that filters .is('resolved_at', null),
  // so the tier vanishes the moment the commissioner evaluates -- precisely
  // when an owner most needs to see it.
  let closedTierQuery = supabase
    .from('auction_tiers')
    .select('id, season_year, tier_number, name, closes_at')
    .lt('closes_at', now)
    .is('verified_at', null)
    .order('closes_at', { ascending: false })
    .limit(1);
  if (activeTier) {
    closedTierQuery = closedTierQuery.neq('id', activeTier.id);
  }
  const { data: closedTierRows } = await closedTierQuery;
  const closedTier = (closedTierRows || [])[0] || null;

  let closedBidRows = [];
  let closedDelegationRows = [];
  let closedPlayerNames = new Map();
  if (closedTier && teamOwner) {
    const sessionSupabase = await createSupabaseServerClient();
    const [{ data: closedBids }, { data: closedDelegations }, { data: closedTierPlayers }] =
      await Promise.all([
        sessionSupabase
          .from('bids')
          .select('id, player_id, status')
          .eq('tier_id', closedTier.id)
          .eq('team_id', teamOwner.team_id),
        sessionSupabase
          .from('bid_delegations')
          .select('id, player_id, status, error_message')
          .eq('tier_id', closedTier.id)
          .eq('team_id', teamOwner.team_id)
          .order('priority'),
        sessionSupabase
          .from('auction_tier_players')
          .select('player_id, players(full_name)')
          .eq('tier_id', closedTier.id),
      ]);
    closedBidRows = closedBids || [];
    closedDelegationRows = closedDelegations || [];
    closedPlayerNames = new Map(
      (closedTierPlayers || []).map((tp) => [
        tp.player_id,
        (tp.players && tp.players.full_name) || 'Unknown Player',
      ])
    );
  }

  const closedTierRecap = (
    <ClosedTierRecap
      tier={closedTier}
      teamOwner={teamOwner}
      bidRows={closedBidRows}
      delegationRows={closedDelegationRows}
      playerNames={closedPlayerNames}
    />
  );

  // No tier open right now
  if (!activeTier) {
    return (
      <main className="page">
        <p className="subhead"><a href="/">&larr; Home</a></p>
        <p className="eyebrow">{leagueName} · Free Agency</p>
        <h1>Blind Bid Auction</h1>
        <p className="subhead">No bidding tier is currently open.</p>
        {upcomingTiers.length > 0 && (
          <div className="assistant-box">
            <p className="empty-note" style={{ marginTop: 0 }}>Upcoming tiers:</p>
            <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', fontSize: 14 }}>
              {upcomingTiers.map((t) => (
                <li key={t.id}>
                  {(t.name || 'Tier ' + t.tier_number) + ' — opens ' + formatShortDateTime(t.opens_at) + ', closes '}
                  {formatShortDateTime(t.closes_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {closedTierRecap}
        {publishedResults}
      </main>
    );
  }

  // Active tier: load its players and the anonymous interest counts
  const [{ data: tierPlayers, error: tpError }, { data: interest }] = await Promise.all([
    supabase
      .from('auction_tier_players')
      .select('player_id, players(id, full_name, position, nfl_team)')
      .eq('tier_id', activeTier.id),
    supabase.from('auction_interest').select('player_id, bid_count').eq('tier_id', activeTier.id),
  ]);

  const countByPlayer = new Map((interest || []).map((r) => [r.player_id, r.bid_count]));

  const playerNames = new Map(
    (tierPlayers || []).map((tp) => [tp.player_id, tp.players?.full_name || 'Unknown Player'])
  );

  // Whether bidding is genuinely live right now. Computed explicitly rather
  // than inferred from activeTier existing: the tier can close between this
  // render and the owner clicking.
  const nowMs = Date.now();
  const tierIsOpen =
    !activeTier.resolved_at &&
    nowMs >= new Date(activeTier.opens_at).getTime() &&
    nowMs <= new Date(activeTier.closes_at).getTime();

  // Own-team reads for this tier, through the session-aware client so RLS
  // applies as this owner -- these tables' RLS is own-team-only with no
  // commissioner clause, deliberately, since they expose willingness-to-pay
  // and now also which players an owner has ruled out. The admin client is
  // never used here.
  let delegationRows = null;
  let delegationSettings = null;
  let ownBidRows = null;
  let hiddenIds = [];
  let withdrawalAllowance = 0;
  let withdrawalsUsed = 0;
  if (teamOwner) {
    const sessionSupabase = await createSupabaseServerClient();
    const [
      { data: delegations },
      { data: settingsRow },
      { data: ownBids },
      { data: hideRows },
      { data: allowanceValue },
      { count: usedCount },
    ] = await Promise.all([
      sessionSupabase
        .from('bid_delegations')
        .select('*')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id)
        .order('priority'),
      sessionSupabase
        .from('bid_delegation_settings')
        .select('max_bids, max_total_cash, max_total_cap, armed_at')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id)
        .maybeSingle(),
      sessionSupabase
        .from('bids')
        .select('id, player_id, status')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id),
      // Which players this owner has hidden in this tier. Own-team only by
      // RLS; there is no commissioner clause on this table at all.
      sessionSupabase
        .from('bid_player_hides')
        .select('player_id')
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id),
      // The allowance comes from the database, never from JavaScript. The
      // players-divided-by-five rule lives in tier_withdrawal_allowance().
      sessionSupabase.rpc('tier_withdrawal_allowance', { p_tier_id: activeTier.id }),
      sessionSupabase
        .from('bid_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('tier_id', activeTier.id)
        .eq('team_id', teamOwner.team_id),
    ]);
    delegationRows = delegations;
    delegationSettings = settingsRow;
    ownBidRows = ownBids;
    hiddenIds = (hideRows || []).map((h) => h.player_id);
    withdrawalAllowance = Number(allowanceValue) || 0;
    withdrawalsUsed = Number(usedCount) || 0;
  }

  // ONE row per player in the tier, with this owner's own state attached.
  //
  // buildTierRows() merges bids and delegations and returns only the
  // players this owner touched -- that is what it is for. Indexing it and
  // joining onto the full tier roster is what turns two lists into one:
  // every player appears exactly once, and a player bid on carries his
  // status and controls in place rather than being repeated in a separate
  // panel under a different vocabulary.
  const ownRowByPlayer = new Map(
    buildTierRows({
      bids: ownBidRows,
      delegations: delegationRows,
      playerNames,
    }).map((r) => [r.playerId, r])
  );

  const listRows = (tierPlayers || []).map((tp) => {
    const own = ownRowByPlayer.get(tp.player_id) || null;
    return {
      playerId: tp.player_id,
      playerName: tp.players?.full_name || 'Unknown Player',
      position: tp.players?.position || '',
      nflTeam: tp.players?.nfl_team || '',
      bidCount: countByPlayer.get(tp.player_id) || 0,
      bid: own ? own.bid : null,
      delegation: own ? own.delegation : null,
    };
  });

  return (
    <main className="page">
      <p className="subhead"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">{leagueName} · Free Agency · {activeTier.season_year}</p>
      <h1>{activeTier.name || 'Tier ' + activeTier.tier_number}</h1>
      <p className="subhead">
        Bidding open now — closes {formatShortDateTime(activeTier.closes_at)}. Interest levels show
        roughly how contested each player is; bid amounts and bidders stay sealed until the tier
        resolves.
      </p>

      <DelegationPanel
        activeTier={activeTier}
        teamOwner={teamOwner}
        delegationRows={delegationRows}
        settings={delegationSettings}
      />

      {/* This page stays public; the Submit Bid links land on
          /bids/[tierId]/[playerId], which routes anyone not signed in
          through /login itself. */}

      {tpError && <p className="form-error">Couldn&apos;t load players: {tpError.message}</p>}

      <TierPlayerList
        tierId={activeTier.id}
        tierIsOpen={tierIsOpen}
        canAct={Boolean(teamOwner)}
        rows={listRows}
        allowance={withdrawalAllowance}
        used={withdrawalsUsed}
        initialHiddenIds={hiddenIds}
      />

      {listRows.length === 0 && (
        <p className="empty-note">
          This tier has no players assigned yet — the commissioner adds them from the tier
          builder.
        </p>
      )}

      {closedTierRecap}
      {publishedResults}
    </main>
  );
}
