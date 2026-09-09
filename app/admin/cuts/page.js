import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import CutsPanel from './CutsPanel';
import AdminCutPanel from './AdminCutPanel';
import { contractTypeLabel, contractSpan } from '../../player/[playerId]/cardHelpers';

export const revalidate = 0;
export const metadata = { title: 'Cuts' };

// A FAILED READ MUST NOT RENDER AS AN EMPTY TABLE. September 9 2026.
//
// All three reads on this page discarded their error and passed 'data || []'
// down. A refused or broken read therefore produced a page that looked exactly
// like a working one with nothing in it -- "No active contracts match that
// filter" under the picker, "No cuts have been made yet" under the ledger.
//
// That is the failure CLAUDE.md means by "a blank must never read as
// compliant", and this page is the worst place in the app for it. An officer
// opens /admin/cuts to work out who a team drops to get legal. An empty picker
// tells him there is nobody to drop. He is not going to suspect the database.
//
// So: each read's error is captured, and a panel is rendered ONLY from data
// that actually arrived. Where it did not, the panel is replaced by a banner
// naming which read failed and what the database said. An empty panel now
// means empty; it can no longer mean broken.
//
// THE CONFIG READ IS DIFFERENT and is handled differently on purpose. It is
// not the page's content, it is two numbers the other panels are measured
// against, and falling back to 2026 / 96 keeps the page usable. But the
// fallback is not harmless: current_season_year is what blockedReason() tests
// to decide whether a cut is too old to reverse, so a wrong year silently
// changes which Reverse buttons appear. The page keeps working and says so,
// rather than choosing between breaking and lying.

function readError(error) {
  if (!error) return null;
  return error.message || String(error);
}

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

  const [configRes, cutsRes, rosterRes] = await Promise.all([
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
    // All of it belongs in the database, and the view is security_invoker so it
    // inherits RLS rather than re-implementing it.
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

  const configError = readError(configRes.error);
  const cutsError = readError(cutsRes.error);
  const rosterError = readError(rosterRes.error);

  const config = configRes.data;
  const seasonYear = config?.current_season_year || 2026;
  const windowHours = Number(config?.cut_reversal_window_hours) || 96;

  // Shaped to the contract CutPlayerDialog already expects from the team page:
  // id, name, position, typeLabel, span. Matching that shape is what lets the
  // same dialog serve both surfaces instead of a second copy of it existing.
  // The acquisition and roster-move fields ride alongside; the dialog ignores
  // what it does not read.
  const rosterPlayers = (rosterRes.data || []).map(function (r) {
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

      {configError && (
        <div className="form-error">
          Could not read the league configuration, so this page is using{' '}
          {seasonYear} and a {windowHours}-hour reversal window as a fallback.
          If the current season is not {seasonYear}, the Reverse buttons below
          are being offered against the wrong year and should not be trusted
          until this is fixed. The database said: {configError}
        </div>
      )}

      {rosterError ? (
        <div className="form-error">
          Could not read the league&rsquo;s active contracts, so the cut and
          move controls are not shown. <strong>This is not an empty
          league</strong> &mdash; it is a failed read, and no conclusion about
          any team&rsquo;s roster should be drawn from this page until it
          succeeds. The database said: {rosterError}
        </div>
      ) : (
        <AdminCutPanel players={rosterPlayers} seasonYear={seasonYear} />
      )}

      <h2 className="section-heading" style={{ marginTop: 40 }}>Cut history</h2>

      {cutsError ? (
        <div className="form-error">
          Could not read the cut history. <strong>This does not mean no cuts
          have been made</strong> &mdash; the ledger is unavailable, and so is
          the ability to reverse a cut from this page. The database said:{' '}
          {cutsError}
        </div>
      ) : (
        <CutsPanel
          cuts={cutsRes.data || []}
          seasonYear={seasonYear}
          windowHours={windowHours}
        />
      )}
    </main>
  );
}
