import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import CutsPanel from './CutsPanel';
import AdminCutPanel from './AdminCutPanel';
import { contractTypeLabel, contractSpan } from '../../player/[playerId]/cardHelpers';

export const revalidate = 0;
export const metadata = { title: 'Cuts' };

export default async function CutsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/cuts');
  // Widened to co-commissioners August 25, 2026. As of September 4 this page
  // is THREE things: the cut-any-roster control, the ledger, and the reversal
  // dialog. Cutting from another team moved here from /team/[teamId], because
  // a League surface treats the commissioner as an ordinary owner and that
  // page's Cut button is now own-roster-only.
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  const [{ data: config }, { data: cuts }, { data: roster }] = await Promise.all([
    supabase
      .from('league_config')
      .select('current_season_year, cut_reversal_window_hours')
      .eq('id', true)
      .single(),
    supabase
      .from('cut_history')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 499),
    // EVERY ACTIVE CONTRACT IN THE LEAGUE, WITH ITS TRANSACTION DATES.
    //
    // This reads league_active_roster_acquisitions (migration
    // cuts_01_active_roster_acquisitions, September 9 2026) rather than
    // 'contracts' directly. The view adds the two things this page had no way
    // to show and an officer enforcing roster compliance actually needs: WHEN
    // the player arrived on this roster and HOW, and the date of his most
    // recent taxi/IR/activation move.
    //
    // Neither could be done from a 'contracts' select. The acquisition date is
    // the trade's date for a traded contract and the row's own created_at
    // otherwise, and the route in is derived from four different sources --
    // trade_assets, winning_bid_link(), free_agent_offers and the contract type
    // itself. The last roster move is a per-contract lateral over roster_moves.
    // All of it belongs in the database (SR-23 in spirit: derive where the data
    // is), and the view is security_invoker so it inherits RLS rather than
    // re-implementing it.
    //
    // 290 active contracts today. .range() is explicit per SR-29 -- PostgREST
    // truncates at 1,000 silently, and a league that grows past that should
    // fail loudly rather than quietly drop the newest signings, which are
    // exactly the rows this page exists to surface.
    supabase
      .from('league_active_roster_acquisitions')
      .select(
        'contract_id, team_id, team_name, player_id, player_name, player_position, ' +
          'contract_type, roster_status, start_year, total_years, void_years, ' +
          'acquired_at, acquired_via, acquired_tier_name, ' +
          'last_move_at, last_move_from, last_move_to, moves_count'
      )
      .order('acquired_at', { ascending: false })
      .range(0, 999),
  ]);

  const seasonYear = config?.current_season_year || 2026;
  const windowHours = Number(config?.cut_reversal_window_hours) || 96;

  // Shaped to the contract CutPlayerDialog already expects from the team page:
  // id, name, position, typeLabel, span. Matching that shape is what lets the
  // same dialog serve both surfaces instead of a second copy of it existing.
  // The acquisition and roster-move fields ride alongside; the dialog ignores
  // what it does not read.
  const rosterPlayers = (roster || []).map(function (r) {
    return {
      id: r.contract_id,
      playerId: r.player_id,
      name: r.player_name || 'Unknown player',
      position: r.player_position || '',
      teamId: r.team_id,
      teamName: r.team_name || 'Unknown team',
      typeLabel: contractTypeLabel(r.contract_type),
      span: contractSpan(r),
      rosterStatus: r.roster_status || 'active',
      acquiredAt: r.acquired_at,
      acquiredVia: r.acquired_via,
      acquiredTierName: r.acquired_tier_name,
      lastMoveAt: r.last_move_at,
      lastMoveFrom: r.last_move_from,
      lastMoveTo: r.last_move_to,
      movesCount: Number(r.moves_count) || 0,
    };
  });

  return (
    <main className="page">
      <p className="eyebrow">Commissioner</p>
      <h1>Cuts</h1>
      <p className="subhead">
        <a href="/">&larr; Home</a>
      </p>

      <p className="empty-note">
        Every cut ever made, newest first. Reversing a cut restores the
        contract and removes its dead money from the team&rsquo;s cap and
        cash. The cut itself is never deleted &mdash; it stays on this page
        marked reversed, with the reason, so the record survives the
        correction.
      </p>

      <AdminCutPanel players={rosterPlayers} seasonYear={seasonYear} />

      <h2 className="section-heading" style={{ marginTop: 40 }}>Cut history</h2>

      <CutsPanel
        cuts={cuts || []}
        seasonYear={seasonYear}
        windowHours={windowHours}
      />
    </main>
  );
}
