import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';
import CalendarAdmin from './CalendarAdmin';

export const revalidate = 0;
export const metadata = { title: 'Calendar Loader' };

// CALENDAR LOADER -- To-Do item 9, September 16, 2026.
//
// STRICT: me.is_commissioner, never the widened helper. See ./actions.js for
// why, and change both files and the calendar_* functions together if this is
// ever widened. The redirect decides what is drawn; the actions re-check; the
// database is the real gate.
//
// READS go through the session client. calendar_admin_weeks and
// calendar_admin_events are security_invoker views granted to authenticated
// only, and they hand back Eastern wall-clock strings ready for a
// datetime-local input, so this page does no time-zone arithmetic.

const EVENT_CAP = 300;

export default async function CalendarLoaderPage({ searchParams }) {
  const me = await getCurrentTeamOwner();
  if (!me) redirect('/login?next=/admin/calendar');
  if (!me.is_commissioner) redirect('/');

  const supabase = await createSupabaseServerClient();

  const { data: config, error: configError } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .maybeSingle();

  // Settings read fails OPEN (CLAUDE.md, "a page's reads do not all fail the
  // same way"): the page still works on a fallback year and says so.
  const current = config && config.current_season_year ? Number(config.current_season_year) : 2026;
  const requested = searchParams && searchParams.season ? Number(searchParams.season) : current;
  const season = Number.isFinite(requested) ? requested : current;
  const seasons = [current - 1, current, current + 1];

  const [weeksRes, eventsRes, nextEventsRes] = await Promise.all([
    supabase
      .from('calendar_admin_weeks')
      .select('*')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
    supabase
      .from('calendar_admin_events')
      .select('*')
      .eq('season_year', season)
      .order('starts_local', { ascending: true })
      .order('sort_hint', { ascending: true })
      .order('id', { ascending: true })
      .range(0, EVENT_CAP - 1),
    supabase
      .from('calendar_admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('season_year', season + 1),
  ]);

  const events = eventsRes.data || [];

  return (
    <main className="page">
      <p className="page-actions">
        <a href="/">&larr; Home</a>
        <a href="/calendar">League Calendar</a>
      </p>
      <p className="eyebrow">Commissioner</p>
      <h1>Calendar Loader</h1>
      <p className="subhead">
        Load and correct league weeks and calendar entries. Every time is U.S. Eastern. Every save
        is checked by the database and written to the public action log.
      </p>

      {configError && (
        <div className="form-notice">
          The league settings could not be read ({configError.message}), so the current league
          year is assumed to be {current}. Check the year selector before saving anything.
        </div>
      )}

      <div className="page-actions">
        {seasons.map(function (y) {
          return (
            <a
              key={y}
              href={'/admin/calendar?season=' + y}
              className={'btn' + (y === season ? '' : ' btn-secondary')}
            >
              {y} League Year
            </a>
          );
        })}
      </div>

      {weeksRes.error ? (
        <div className="form-error">League weeks could not be loaded: {weeksRes.error.message}</div>
      ) : null}
      {eventsRes.error ? (
        <div className="form-error">Calendar entries could not be loaded: {eventsRes.error.message}</div>
      ) : null}

      <CalendarAdmin
        season={season}
        weeks={weeksRes.error ? null : weeksRes.data || []}
        events={eventsRes.error ? null : events}
        eventsTruncated={events.length === EVENT_CAP}
        nextSeasonHasEvents={nextEventsRes.error ? null : (nextEventsRes.count || 0) > 0}
      />
    </main>
  );
}
