import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import ValuesTable from './ValuesTable';
import WeeklyValuesTable from './WeeklyValuesTable';

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
// THE WEEKLY CHART (UI test batch 12, November 13, 2026). Rulings PVC-1 to
// PVC-15: a chart every Thursday at 6:00 AM ET, built by the database. The page
// has two views, `?view=weekly` (with `&date=YYYY-MM-DD`) and `?view=published`
// (the commissioner's published editions, unchanged below). Weekly is the
// default once a weekly edition exists. Both readers are SECURITY DEFINER
// functions granted to signed-in users only; a failed read shows its error,
// never an empty chart (L14).
function ViewSwitch({ view, hasWeekly }) {
  return (
    <nav className="edfl-pvw-switch" aria-label="Which chart">
      <a href="/values?view=weekly" className={view === 'weekly' ? 'is-on' : undefined} aria-current={view === 'weekly' ? 'page' : undefined}>
        Weekly chart{hasWeekly ? '' : ' (none yet)'}
      </a>
      <a href="/values?view=published" className={view === 'published' ? 'is-on' : undefined} aria-current={view === 'published' ? 'page' : undefined}>
        Published editions
      </a>
    </nav>
  );
}

function PageTop({ children }) {
  return (
    <>
      <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
        &larr; Home
      </a>
      <p className="eyebrow">EDFL</p>
      <h1>Player Value Chart</h1>
      {children}
    </>
  );
}

export default async function ValuesPage({ searchParams }) {
  // READ-ONLY OBSERVER (October 6, 2026): a registered observer login may read this
  // page as well as an owner. getCurrentViewer() in lib/getCurrentTeamOwner.js says why
  // the gate, and only the gate, widens; every write on the page still refuses it.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/values');

  const supabase = await createSupabaseServerClient();
  const sp = await searchParams;
  const requestedSnapshotId = sp?.snapshot || null;

  const { data: weeklyEditions, error: weeklyEditionsError } = await supabase.rpc('edfl_pvc_weekly_editions');
  const editions = weeklyEditions || [];
  const hasWeekly = editions.length > 0;
  const view =
    sp?.view === 'published' || sp?.view === 'weekly'
      ? sp.view
      : requestedSnapshotId
        ? 'published'
        : hasWeekly || weeklyEditionsError
          ? 'weekly'
          : 'published';

  if (view === 'weekly') {
    if (weeklyEditionsError) {
      return (
        <main className="page">
          <PageTop>
            <ViewSwitch view={view} hasWeekly={hasWeekly} />
            <p className="form-error">Couldn&apos;t load the weekly charts: {weeklyEditionsError.message}</p>
          </PageTop>
        </main>
      );
    }
    if (!hasWeekly) {
      return (
        <main className="page">
          <PageTop>
            <ViewSwitch view={view} hasWeekly={hasWeekly} />
            <p className="subhead">No weekly chart has been built yet. One is built every Thursday at 6:00 AM ET.</p>
          </PageTop>
        </main>
      );
    }
    const requestedDate = typeof sp?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
    const selected = editions.find((e) => e.chart_date === requestedDate) || editions[0];
    const { data: weeklyRows, error: weeklyRowsError } = await supabase.rpc('edfl_pvc_weekly_chart', {
      p_chart_date: selected.chart_date,
    });
    return (
      <main className="page">
        <PageTop>
          <p className="subhead">
            Every player ever signed to an EDFL contract, valued each Thursday at 6:00 AM ET from the games
            already played.
          </p>
          <ViewSwitch view={view} hasWeekly={hasWeekly} />
        </PageTop>
        {weeklyRowsError ? (
          <p className="form-error">Couldn&apos;t load this chart: {weeklyRowsError.message}</p>
        ) : (
          <WeeklyValuesTable
            editions={editions}
            selected={selected}
            rows={weeklyRows || []}
            anchorDate={selected.anchor_date}
          />
        )}
      </main>
    );
  }

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
        <ViewSwitch view={view} hasWeekly={hasWeekly} />
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
        <ViewSwitch view={view} hasWeekly={hasWeekly} />
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
        <ViewSwitch view={view} hasWeekly={hasWeekly} />
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
      <ViewSwitch view={view} hasWeekly={hasWeekly} />

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
