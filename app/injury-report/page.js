import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';
import InjuryReportTable from './InjuryReportTable';

export const revalidate = 0;
export const metadata = { title: 'Injury Report' };

const READ_PAGE_SIZE = 1000; // PostgREST's default row ceiling

// SR-29. Roughly 300 players carry a designation in a normal week, but a Sunday
// in December with the seven-day cleared window full is not a normal week, and
// an unbounded select truncates at 1,000 with no error -- an injury report that
// silently stops at the letter M is worse than one that fails to load. Ordered
// on player_id, which is unique, so pages can never overlap or skip.
async function fetchAllReportRows(supabase) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('league_injury_report')
      .select(
        'player_id, full_name, position, nfl_team, nfl_roster_status, injury_status, injury_body_part, injury_notes, injury_start_date, prev_injury_status, injury_changed_at, edfl_team_id, edfl_team, edfl_roster_status, is_rostered, change_flag'
      )
      .order('player_id')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

// A League surface, like /transactions: every member sees the same rows in the
// same order, and a member is somebody who has logged in. The view is granted
// to authenticated only, so this redirect and the grant agree.
export default async function InjuryReportPage() {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/injury-report');

  const supabase = await createSupabaseServerClient();

  let rows = [];
  let loadError = null;
  try {
    rows = await fetchAllReportRows(supabase);
  } catch (err) {
    loadError = err && err.message ? err.message : String(err);
  }

  // THE BANNER'S TIMESTAMP, AND THE ONLY PLACE IT COMES FROM. completed_at on
  // the newest completed run -- when the write finished, not when somebody
  // pressed a button and not when this page rendered. If the pull half-failed,
  // its run is 'failed' and never becomes the banner, so the banner can only
  // ever be older than the truth, never newer.
  const { data: lastRun } = await supabase
    .from('injury_sync_runs')
    .select('id, completed_at, trigger_source, injured_after, players_changed')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const teams = Array.from(
    new Set(
      rows
        .filter(function (r) { return r.edfl_team; })
        .map(function (r) { return r.edfl_team; })
    )
  ).sort();

  return (
    <main className="page">
      <p className="page-actions"><a href="/">&larr; Home</a></p>
      <p className="eyebrow">League</p>
      <h1>Injury Report</h1>

      {loadError && (
        <div className="form-error">Couldn&apos;t load the report: {loadError}</div>
      )}

      <InjuryReportTable rows={rows} teams={teams} lastRun={lastRun || null} />
    </main>
  );
}
