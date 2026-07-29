import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../../lib/getCurrentTeamOwner';
import { buildWeightLookup } from '../../../../lib/bidMath';
import BidForm from '../../BidForm';

export const revalidate = 0;

// Reshapes stored bid_years + bid_option_bonuses rows back into the
// { years: [...] } shape BidForm works with -- the inverse of what
// BidForm's handleSubmit builds when it calls the RPC.
function buildInitialBid(bid, bidYears, bidOptionBonuses) {
  if (!bid) return null;

  const span = bid.total_years + bid.void_years;
  const years = Array.from({ length: Math.max(span, 5) }, () => ({
    guaranteedSalary: 0,
    nonGuaranteedSalary: 0,
    rosterBonus: 0,
    optionBonus: 0,
  }));

  bidYears.forEach((y) => {
    const idx = y.contract_year_number - 1;
    if (!years[idx]) return;
    years[idx].guaranteedSalary = y.guaranteed_salary;
    years[idx].nonGuaranteedSalary = y.non_guaranteed_salary;
    years[idx].rosterBonus = y.roster_bonus;
  });

  bidOptionBonuses.forEach((ob) => {
    const idx = ob.exercise_season_year - bid.start_year;
    if (!years[idx]) return;
    years[idx].optionBonus = ob.bonus_amount;
  });

  return {
    startYear: bid.start_year,
    totalYears: bid.total_years,
    voidYears: bid.void_years,
    signingBonusTotal: bid.signing_bonus_total,
    years,
  };
}

export default async function BidPage({ params }) {
  const { tierId, playerId } = await params;

  const teamOwner = await getCurrentTeamOwner();
  if (!teamOwner) {
    redirect(`/login?next=/bids/${tierId}/${playerId}`);
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: tierRow }, { data: playerRow }, { data: tierPlayer }, { data: weightRows }] =
    await Promise.all([
      supabase.from('auction_tiers').select('id, name, closes_at, resolved_at').eq('id', tierId).maybeSingle(),
      supabase.from('players').select('id, full_name, position').eq('id', playerId).maybeSingle(),
      // Confirms this player is actually up for bidding in this tier --
      // without this, a hand-edited URL could open a bid form for any
      // player at all, and submit_bid() wouldn't catch it (it validates
      // the tier's window, but not tier membership).
      supabase
        .from('auction_tier_players')
        .select('id')
        .eq('tier_id', tierId)
        .eq('player_id', playerId)
        .maybeSingle(),
      supabase
        .from('ppv_weight_table')
        .select('contract_year_number, guaranteed_weight, non_guaranteed_weight, roster_bonus_weight, option_bonus_weight')
        .order('contract_year_number'),
    ]);

  if (!tierRow) {
    return <div className="page"><p className="form-error">No such auction tier.</p></div>;
  }
  if (!playerRow) {
    return <div className="page"><p className="form-error">No such player.</p></div>;
  }
  if (!tierPlayer) {
    return (
      <div className="page">
        <p className="form-error">
          {playerRow.full_name} isn't part of {tierRow.name}. <a href="/bids">Back to the auction</a>.
        </p>
      </div>
    );
  }
  if (tierRow.resolved_at) {
    return (
      <div className="page">
        <p className="form-error">
          {tierRow.name} has already been resolved — bidding is over.{' '}
          <a href="/bids">Back to the auction</a>.
        </p>
      </div>
    );
  }

  const { data: existingBid } = await supabase
    .from('bids')
    .select('id, start_year, total_years, void_years, signing_bonus_total')
    .eq('tier_id', tierId)
    .eq('player_id', playerId)
    .eq('team_id', teamOwner.team_id)
    .maybeSingle();

  let initialBid = null;
  if (existingBid) {
    const [{ data: bidYears }, { data: bidOptionBonuses }] = await Promise.all([
      supabase
        .from('bid_years')
        .select('contract_year_number, guaranteed_salary, non_guaranteed_salary, roster_bonus')
        .eq('bid_id', existingBid.id)
        .order('contract_year_number'),
      supabase
        .from('bid_option_bonuses')
        .select('exercise_season_year, bonus_amount')
        .eq('bid_id', existingBid.id),
    ]);
    initialBid = buildInitialBid(existingBid, bidYears || [], bidOptionBonuses || []);
  }

  return (
    <BidForm
      player={{ id: playerRow.id, fullName: playerRow.full_name, position: playerRow.position }}
      tier={{ id: tierRow.id, name: tierRow.name, closesAt: tierRow.closes_at }}
      weights={buildWeightLookup(weightRows)}
      initialBid={initialBid}
    />
  );
}
