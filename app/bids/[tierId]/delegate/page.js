import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../../lib/getCurrentTeamOwner';
import { buildWeightLookup } from '../../../../lib/bidMath';
import { formatDateTime } from '../../../../lib/formatDate';
import DelegateForm from './DelegateForm';

// Gated at both layers, matching /cash: this page redirects when
// getCurrentTeamOwner() returns null, and every Server Action it calls
// (app/bids/delegationActions.js) independently re-checks too, since a
// Server Action is a callable endpoint regardless of what the UI renders.
export const revalidate = 0;

export default async function DelegatePage({ params }) {
  const { tierId } = await params;

  const teamOwner = await getCurrentTeamOwner();
  if (!teamOwner) {
    redirect('/login?next=/bids/' + tierId + '/delegate');
  }

  const supabase = await createSupabaseServerClient();

  const [
    { data: tierRow },
    { data: tierPlayers },
    { data: weightRows },
    { data: interestLevelRows },
    { data: existingBids },
    { data: existingDelegations },
  ] = await Promise.all([
    supabase
      .from('auction_tiers')
      .select('id, name, season_year, closes_at, resolved_at')
      .eq('id', tierId)
      .maybeSingle(),
    supabase
      .from('auction_tier_players')
      .select('player_id, players(id, full_name, position, nfl_team)')
      .eq('tier_id', tierId),
    supabase
      .from('ppv_weight_table')
      .select('contract_year_number, guaranteed_weight, non_guaranteed_weight, roster_bonus_weight, option_bonus_weight')
      .order('contract_year_number'),
    supabase.from('bid_interest_levels').select('*'),
    // This owner's own MANUAL bids in this tier -- used to exclude those
    // players from delegation. upsert_bid_delegation() refuses a
    // delegation on a player already bid on by hand; the UI shouldn't
    // offer that option and then fail at approval time.
    //
    // Must read team_manual_bids, NOT bids. Arming calls submit_bid(),
    // which writes a real row into bids for every delegated player -- so
    // querying bids directly marks the owner's own Auto-Bid submissions
    // as "already bid on manually" the moment they come back to this page
    // via the Edit button, greying out their entire slate and making it
    // unrevisable. team_manual_bids excludes any bid that a
    // bid_delegations row points at via submitted_bid_id, which is the
    // same distinction upsert_bid_delegation() itself now makes. It's
    // security_invoker, so the sealed-bid RLS on bids still applies and
    // this sees only this owner's own bids before close -- identical
    // visibility to the query it replaces.
    supabase
      .from('team_manual_bids')
      .select('player_id')
      .eq('tier_id', tierId)
      .eq('team_id', teamOwner.team_id),
    // This owner's existing delegations in this tier. Propose mode needs
    // them to decide which rows may auto-check: re-arming an already
    // 'submitted' delegation makes submit_bid() upsert the bid with a
    // fresh submitted_at, which is the tie-break on equal total PPV -- so
    // silently re-firing one would move that bid to the BACK of the queue
    // on that player and lose ties the owner had already won.
    //
    // Read through the session-aware client; bid_delegations RLS is
    // own-team-only, so no team_id filter is needed here (and the admin
    // client is never used in this feature -- the table exposes
    // willingness-to-pay ceilings and the commissioner is a competing
    // owner).
    supabase
      .from('bid_delegations')
      .select('id, player_id, status, submitted_bid_id')
      .eq('tier_id', tierId)
      .order('player_id'),
  ]);

  if (!tierRow) {
    return (
      <div className="page">
        <p className="form-error">No such auction tier.</p>
        <p><a href="/bids">← Back to Auction</a></p>
      </div>
    );
  }

  if (tierRow.resolved_at) {
    return (
      <div className="page">
        <p className="form-error">
          {tierRow.name + ' has already been resolved — bidding is over.'}
        </p>
        <p><a href="/bids">← Back to Auction</a></p>
      </div>
    );
  }

  const tierClosed = new Date() >= new Date(tierRow.closes_at);
  if (tierClosed) {
    return (
      <div className="page">
        <p className="form-error">
          {'Bidding for ' +
            tierRow.name +
            ' closed at ' +
            formatDateTime(tierRow.closes_at) +
            '. Auto-Bid can no longer be set up for this tier.'}
        </p>
        <p><a href="/bids">← Back to Auction</a></p>
      </div>
    );
  }

  const players = (tierPlayers || [])
    .map((tp) => ({
      id: tp.player_id,
      fullName: (tp.players && tp.players.full_name) || 'Unknown Player',
      position: (tp.players && tp.players.position) || '',
      nflTeam: (tp.players && tp.players.nfl_team) || '',
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const alreadyBidPlayerIds = Array.from(new Set((existingBids || []).map((b) => b.player_id)));

  return (
    <DelegateForm
      tier={{
        id: tierRow.id,
        name: tierRow.name,
        seasonYear: tierRow.season_year,
        closesAt: tierRow.closes_at,
      }}
      players={players}
      alreadyBidPlayerIds={alreadyBidPlayerIds}
      existingDelegations={existingDelegations || []}
      weights={buildWeightLookup(weightRows)}
      interestLevelRows={interestLevelRows || []}
    />
  );
}
