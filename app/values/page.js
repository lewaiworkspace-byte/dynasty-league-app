import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import ValuesTable from './ValuesTable';

// Gated (any logged-in owner, not public) -- the chart is distributed to
// league owners, not to the world. Session-aware reads below mean RLS
// applies as that owner; an unpublished snapshot is invisible to them by
// policy, which is why this page never needs to filter on a "published"
// flag itself.
export const revalidate = 0;

export const metadata = { title: 'Player Value Chart' };

// CRITICAL: player_value_history has 500 rows per snapshot. The second
// published chart reaches exactly 1,000 rows across snapshots and the
// third exceeds it -- past PostgREST's 1,000-row default ceiling, where an
// unbounded select truncates silently with no error. Every query against
// this table below is filtered to a single snapshot_id for that reason,
// and every query carries a stable .order() so row order can never shift
// between requests. Do not remove either without re-reading this comment.
export default async function ValuesPage({ searchParams }) {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/values');

  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const requestedSnapshotId = sp?.snapshot || null;

  const { data: snapshots, error: snapshotsError } = await supabase
    .from('published_value_snapshots')
    .select('id, label, as_of_date, published_at, source_note, recency_rank, prev_snapshot_id')
    .order('recency_rank');

  if (snapshotsError) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          &larr; Home
        </a>
        <p className="eyebrow">EDFL</p>
        <h1>Player Value Chart</h1>
        <p className="subhead">Couldn&apos;t load published charts: {snapshotsError.message}</p>
      </main>
    );
  }

  const allSnapshots = snapshots || [];

  if (allSnapshots.length === 0) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          &larr; Home
        </a>
        <p className="eyebrow">EDFL</p>
        <h1>Player Value Chart</h1>
        <p className="subhead">
          No chart has been published yet. A chart may be loaded but not yet published --
          published charts appear here as soon as the commissioner publishes one.
        </p>
      </main>
    );
  }

  let selectedSnapshot = null;
  if (requestedSnapshotId) {
    selectedSnapshot = allSnapshots.find((s) => String(s.id) === String(requestedSnapshotId)) || null;
  }
  if (!selectedSnapshot) {
    selectedSnapshot = allSnapshots.find((s) => Number(s.recency_rank) === 1) || allSnapshots[0];
  }

  const [{ data: historyRows, error: historyError }, { data: removalRows, error: removalsError }] =
    await Promise.all([
      supabase
        .from('player_value_history')
        .select(
          'chart_position, chart_rank, chart_name, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, player_id, match_status, prev_total_ppv, prev_per_year_value, prev_likely_years, total_ppv_delta, likely_years_delta, is_new_this_snapshot'
        )
        .eq('snapshot_id', selectedSnapshot.id)
        .order('chart_position')
        .order('chart_rank'),
      supabase
        .from('player_value_removals')
        .select('chart_position, chart_name, chart_nfl_team, last_total_ppv')
        .eq('snapshot_id', selectedSnapshot.id)
        .order('chart_position'),
    ]);

  if (historyError) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          &larr; Home
        </a>
        <p className="eyebrow">EDFL</p>
        <h1>Player Value Chart</h1>
        <p className="subhead">Couldn&apos;t load chart rows: {historyError.message}</p>
      </main>
    );
  }

  return (
    <main className="page">
      <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
        &larr; Home
      </a>
      <p className="eyebrow">EDFL</p>
      <h1>Player Value Chart</h1>
      <p className="subhead">
        Player values for extension and free agency reference. Distributed to every owner by email
        alongside this page.
      </p>

      <ValuesTable
        snapshots={allSnapshots}
        selectedSnapshot={selectedSnapshot}
        historyRows={historyRows || []}
        removalRows={removalRows || []}
        removalsError={removalsError ? removalsError.message : null}
      />
    </main>
  );
}
