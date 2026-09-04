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

  const [{ data: config }, { data: cuts }, { data: contracts }] = await Promise.all([
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
    // Every active contract in the league -- 233 today, well inside the
    // 1,000-row ceiling, and filtered by status so it stays that way. Unlike
    // the restructure picker this needs no per-row RPC: cut_player() decides
    // legality when the dialog submits, so there is nothing to pre-check.
    supabase
      .from('contracts')
      .select('id, team_id, contract_type, status, roster_status, start_year, total_years, void_years, players(id, full_name, position), teams(name)')
      .eq('status', 'active'),
  ]);

  const seasonYear = config?.current_season_year || 2026;
  const windowHours = Number(config?.cut_reversal_window_hours) || 96;

  // Shaped to the contract CutPlayerDialog already expects from the team page:
  // id, name, position, typeLabel, span. Matching that shape is what lets the
  // same dialog serve both surfaces instead of a second copy of it existing.
  const rosterPlayers = (contracts || []).map(function (c) {
    return {
      id: c.id,
      playerId: c.players ? c.players.id : null,
      name: (c.players && c.players.full_name) || 'Unknown player',
      position: (c.players && c.players.position) || '',
      teamId: c.team_id,
      teamName: (c.teams && c.teams.name) || 'Unknown team',
      typeLabel: contractTypeLabel(c.contract_type),
      span: contractSpan(c),
      rosterStatus: c.roster_status || 'active',
    };
  });

  rosterPlayers.sort(function (a, b) {
    if (a.teamName !== b.teamName) return a.teamName.localeCompare(b.teamName);
    return a.name.localeCompare(b.name);
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
