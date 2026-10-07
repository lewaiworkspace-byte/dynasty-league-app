// THE ARGUMENTS FOR THE ORDER A WAIVER RUN USES -- October 7, 2026 (batch 3).
//
// waiver_priority_order(p_season, p_through_week) defaults both parameters to null, which
// means "this season, every week scored so far". A run does not ask for that.
// waiver_run_preview() -- the function waiver_run_apply() calls, and whose answer it stores
// on the run as priority_snapshot -- asks:
//
//     waiver_priority_order(r_run.season_year, greatest(r_run.week_number - 1, 1))
//
// so a week 6 run is ordered on weeks 1 to 5, and a later week's scores never count.
//
// Every page that shows an owner's waiver priority finds the run with nextScheduledWaiverRun()
// and passes the arguments built by waiverPriorityArgs(), both below, so the wire's chip and
// Team HQ's tile are the same call by construction (SR-65). Called bare, a page shows an order
// no run uses: after the last regular-season run it would rank teams on playoff weeks, and
// while a run is overdue it would count the next week's scores.
//
// If waiver_run_preview() ever changes the arguments it passes, this function changes with
// it, in the same batch as the migration.
//
// `run` is a waiver_runs row with season_year and week_number.
export function waiverPriorityArgs(run) {
  return {
    p_season: run.season_year,
    p_through_week: Math.max(run.week_number - 1, 1),
  };
}

// THE RUN WHOSE ORDER A PAGE SHOWS: the earliest run still 'scheduled', whatever its time. A run
// past its runs_at that has not executed (overdue, as the Week 5 run was for 45 minutes on
// October 7, 2026) is still the next run to use an order, so there is deliberately no time
// filter here. Team HQ's "Coming up" list has its own read, which does filter on time: that
// list is about what happens next on the calendar, not about which order applies.
//
// waiver_runs is public (RLS "public read"), so any client may ask. Returns the query, which
// resolves to { data, error } like every supabase-js read; data is null when no run is left.
export function nextScheduledWaiverRun(client) {
  return client
    .from('waiver_runs')
    .select('id, season_year, week_number, runs_at, status')
    .eq('status', 'scheduled')
    .order('runs_at', { ascending: true })
    .limit(1)
    .maybeSingle();
}
