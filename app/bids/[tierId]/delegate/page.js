import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../../lib/getCurrentTeamOwner';
import { buildWeightLookup } from '../../../../lib/bidMath';
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
    // This owner's own manual bids in this tier -- used to exclude those
    // players from delegation. submit_bid() refuses a delegated bid on a
    // player already bid on manually; the UI shouldn't offer that option
    // and then fail at approval time.
    supabase.from('bids').select('player_id').eq('tier_id', tierId).eq('team_id', teamOwner.team_id),
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
            new Date(tierRow.closes_at).toLocaleString() +
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
      weights={buildWeightLookup(weightRows)}
      interestLevelRows={interestLevelRows || []}
    />
  );
}
