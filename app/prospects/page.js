import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import ProspectBoard from './ProspectBoard';
import { formatShortDateTime } from '../../lib/formatDate';

export const revalidate = 0;
export const metadata = { title: 'Draft Prospects' };

// DRAFT PROSPECTS -- the chart. Spec v0.8 section 4.7, rulings PR-1..PR-3,
// September 19 2026.
//
// WHAT IS ON IT. ESPN's draft board for the OPEN class, exactly as published
// (PR-2): grade, overall rank, position rank, college, height and weight.
// Filtered to QB/RB/WR/TE/K when it was loaded (PR-3), so everyone on it is
// someone an EDFL team could draft. The Commissioner Portal refreshes it; no
// cron, no clock on this page.
//
// WHAT IT IS NOT. A player table. A prospect has no contract, no cap row and
// no roster slot. Once Sleeper adds the rookie, the row carries his Sleeper
// record beside it (PR-1) and a rumour about him follows him there. After the
// EDFL rookie draft closes the commissioner rolls the class and this page
// sits empty until ESPN publishes the next one.
//
// GRADE IS NOT MONEY (SR-63). It is a bare score and is drawn as one.
//
// LOGIN-GATED, second line. middleware.js closes the route already.
export default async function ProspectsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/prospects');

  const authed = await createSupabaseServerClient();
  const [{ data: rows, error }, { data: classes }] = await Promise.all([
    authed
      .from('draft_prospect_board')
      .select('prospect_id, class_year, full_name, position, college, height, weight, espn_grade, espn_overall_rank, espn_position_rank, nfl_team, draft_round, draft_overall, matched_player_id, sleeper_name, refreshed_at')
      .order('espn_overall_rank', { ascending: true, nullsFirst: false })
      .limit(500),
    authed
      .from('draft_prospect_classes')
      .select('class_year, opened_at, rolled_at')
      .order('class_year', { ascending: false })
      .limit(3),
  ]);

  const open = (classes || []).find((c) => !c.rolled_at) || null;
  const lastRolled = (classes || []).find((c) => c.rolled_at) || null;
  const refreshed = rows && rows.length > 0 ? formatShortDateTime(rows[0].refreshed_at) : null;

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Draft Prospects' }]} />
      <p className="eyebrow">Players &middot; Rookie draft</p>
      <h1>Draft Prospects</h1>
      <p className="subhead">
        ESPN&rsquo;s board, as published. Grade and rank are theirs, not ours. QB, RB, WR, TE and K
        only &mdash; the positions the league plays.
      </p>

      {error ? <div className="form-error">The board could not be read: {error.message}</div> : null}

      <ProspectBoard
        rows={rows || []}
        classYear={open ? open.class_year : null}
        refreshed={refreshed}
        lastRolledYear={lastRolled ? lastRolled.class_year : null}
      />
    </main>
  );
}
