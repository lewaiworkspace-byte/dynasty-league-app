import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../../lib/getCurrentTeamOwner';
import TierResultsPanel from './TierResultsPanel';

export const revalidate = 0;
export const metadata = { title: 'Resolve Tier' };

export default async function TierResultsPage({ params }) {
  const { tierId } = await params;

  const me = await getCurrentTeamOwner();
  if (!me) redirect(`/login?next=/admin/tier-results/${tierId}`);
  // Widened to co-commissioners August 25, 2026.
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  const { data: tier } = await supabase
    .from('auction_tiers')
    .select('id, name, season_year, tier_number, opens_at, closes_at, resolved_at, verified_at')
    .eq('id', tierId)
    .maybeSingle();

  if (!tier) {
    return <div className="page"><p className="form-error">No such tier.</p></div>;
  }

  // Bids only become readable to the commissioner once closes_at has
  // passed -- that's the sealed-bid RLS doing its job, not a bug. Before
  // then these come back empty on purpose.
  const [{ data: bids }, { data: flags }, { data: recs }, { data: teams }] = await Promise.all([
    supabase
      .from('bids')
      .select('id, player_id, team_id, status, total_years, void_years, signing_bonus_total, start_year, submitted_at')
      .eq('tier_id', tierId),
    supabase.from('auction_tier_team_flags').select('*').eq('tier_id', tierId),
    // Recommended pass-over order for any team that needs adjusting:
    // most recently submitted winning bid first.
    supabase
      .from('auction_tier_flag_recommendations')
      .select('*')
      .eq('tier_id', tierId)
      .order('recommend_order'),
    supabase.from('teams').select('id, name'),
  ]);

  // PPV comes from the same view the database ranks by, so what's shown
  // here can't disagree with who actually won.
  const bidIds = (bids || []).map((b) => b.id);
  let ppvByBid = new Map();
  if (bidIds.length > 0) {
    const { data: ppvRows } = await supabase
      .from('bid_total_ppv')
      .select('bid_id, total_ppv')
      .in('bid_id', bidIds);
    ppvByBid = new Map((ppvRows || []).map((r) => [r.bid_id, r.total_ppv]));
  }

  const playerIds = [...new Set((bids || []).map((b) => b.player_id))];
  let playersById = new Map();
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, full_name, position')
      .in('id', playerIds);
    playersById = new Map((playerRows || []).map((p) => [p.id, p]));
  }

  const nameByTeam = new Map((teams || []).map((t) => [t.id, t.name]));

  // Group by player: the winner plus every other bid, ranked, so the
  // commissioner can see who's next in line before passing a win over.
  const byPlayer = new Map();
  (bids || []).forEach((b) => {
    const player = playersById.get(b.player_id);
    if (!byPlayer.has(b.player_id)) {
      byPlayer.set(b.player_id, {
        playerId: b.player_id,
        playerName: player?.full_name || 'Unknown player',
        position: player?.position || '',
        bids: [],
      });
    }
    byPlayer.get(b.player_id).bids.push({
      id: b.id,
      teamId: b.team_id,
      teamName: nameByTeam.get(b.team_id) || '?',
      status: b.status,
      totalPpv: Number(ppvByBid.get(b.id) ?? 0),
      totalYears: b.total_years,
      voidYears: b.void_years,
      signingBonusTotal: Number(b.signing_bonus_total),
      submittedAt: b.submitted_at,
    });
  });

  const players = [...byPlayer.values()].map((p) => ({
    ...p,
    bids: p.bids.sort((a, b) => b.totalPpv - a.totalPpv || new Date(a.submittedAt) - new Date(b.submittedAt)),
  }));

  const flagsByTeam = new Map(
    (flags || []).map((f) => [f.team_id, { ...f, teamName: nameByTeam.get(f.team_id) || '?' }])
  );

  const recommendations = (recs || []).map((r) => ({
    bidId: r.bid_id,
    teamId: r.team_id,
    teamName: nameByTeam.get(r.team_id) || '?',
    playerId: r.player_id,
    playerName: playersById.get(r.player_id)?.full_name || 'Unknown player',
    submittedAt: r.submitted_at,
    recommendOrder: r.recommend_order,
    bidCap: Number(r.bid_cap),
    bidCash: Number(r.bid_cash),
    capAfter: Number(r.cap_after_this_step),
    cashNeededAfter: Number(r.cash_needed_after_this_step),
    capLimit: Number(r.cap_limit_125),
    cashAvailable: Number(r.cash_available),
    clearsHere: r.clears_at_this_step,
  }));

  return (
    <TierResultsPanel
      tier={{
        id: tier.id,
        name: tier.name,
        seasonYear: tier.season_year,
        closesAt: tier.closes_at,
        resolvedAt: tier.resolved_at,
        verifiedAt: tier.verified_at,
        isClosed: new Date(tier.closes_at) <= new Date(),
      }}
      players={players}
      flags={[...flagsByTeam.values()]}
      recommendations={recommendations}
    />
  );
}
