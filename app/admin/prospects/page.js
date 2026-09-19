import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import ProspectsAdmin from './ProspectsAdmin';
import { formatShortDateTime } from '../../../lib/formatDate';

// /admin/prospects -- the prospect board's officer page. Spec v0.8 section 4.7.
// WIDENED gate (isCommissionerOrCo), the same as /admin/sync-players, because
// loading a board and closing the rookie draft are operations, not rulings.
// The database functions carry their own gates.
//
// The ESPN refresh resolves several hundred athlete records in one action, so
// this segment asks Vercel for the longest Hobby-plan duration. It is the only
// route in the app that needs it.
export const revalidate = 0;
export const maxDuration = 60;
export const metadata = { title: 'Draft Prospects · Portal' };

export default async function AdminProspectsPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/prospects');
  if (!isCommissionerOrCo(me)) redirect('/');

  const authed = await createSupabaseServerClient();
  const [{ data: classes }, { data: unmatched }, { count: boardCount }] = await Promise.all([
    authed
      .from('draft_prospect_classes')
      .select('class_year, opened_at, rolled_at, note')
      .order('class_year', { ascending: false })
      .limit(5),
    authed
      .from('draft_prospect_board')
      .select('prospect_id, full_name, position, college, espn_overall_rank')
      .is('matched_player_id', null)
      .order('espn_overall_rank', { ascending: true, nullsFirst: false })
      .limit(500),
    authed.from('draft_prospect_board').select('prospect_id', { count: 'exact', head: true }),
  ]);

  const open = (classes || []).find((c) => !c.rolled_at) || null;

  return (
    <ProspectsAdmin
      openClassYear={open ? open.class_year : null}
      openedAt={open ? formatShortDateTime(open.opened_at) : null}
      classes={(classes || []).map((c) => ({
        class_year: c.class_year,
        opened: formatShortDateTime(c.opened_at),
        rolled: c.rolled_at ? formatShortDateTime(c.rolled_at) : null,
        note: c.note,
      }))}
      unmatched={unmatched || []}
      boardCount={boardCount || 0}
      suggestedYear={open ? open.class_year : new Date().getFullYear() + 1}
    />
  );
}
