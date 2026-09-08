import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../../lib/getCurrentTeamOwner';
import InjurySyncPanel from './InjurySyncPanel';

export const revalidate = 0;

// The Sleeper player feed is a large document and parsing it is not instant.
// Vercel's default function ceiling is well under what a bad afternoon on
// Sleeper's side can take, and a pull cut off at the default leaves a stranded
// 'running' row for the reaper to clean up fifteen minutes later -- correct,
// but it looks like a failure to whoever pressed the button. Route segment
// config applies to the Server Actions this page hosts.
export const maxDuration = 60;

export const metadata = { title: 'Injury Status Sync' };

// Widened to the co-commissioner -- see the block comment in ./actions.js for
// why this one is not strict like /admin/sync-players. The redirect decides
// what is DRAWN; the Server Action re-checks and is the real gate.
export default async function InjurySyncPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/injury-sync');
  if (!isCommissionerOrCo(me)) redirect('/');

  const supabase = await createSupabaseServerClient();

  // Bounded on purpose (SR-29): the ledger grows by at least one row a night
  // and an unbounded select would sail past PostgREST's 1,000-row ceiling in
  // under three years, silently.
  const { data: runs } = await supabase
    .from('injury_sync_runs')
    .select(
      'id, started_at, completed_at, status, trigger_source, players_examined, players_changed, injured_after, unmatched_count, error_message'
    )
    .order('started_at', { ascending: false })
    .limit(15);

  const lastCompleted =
    (runs || []).find(function (r) {
      return r.status === 'completed' && r.completed_at;
    }) || null;

  return (
    <main className="page">
      <InjurySyncPanel runs={runs || []} lastCompleted={lastCompleted} />
    </main>
  );
}
