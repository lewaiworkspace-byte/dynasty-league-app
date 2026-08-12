import { supabase } from '../../lib/supabaseClient';
import CalendarView from './CalendarView';

// Calendar reflects now() (is_past, is_today_or_active) — never cache.
export const revalidate = 0;

const ROW_CAP = 300;

export default async function CalendarPage() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name, current_season_year')
    .eq('id', true)
    .single();

  const season = config?.current_season_year || 2026;
  const leagueName = config?.league_short_name || 'Dynasty League';

  const { data, error } = await supabase
    .from('league_calendar')
    .select(
      'entry_id, title, detail, category, rule_ref, is_provisional, source, week_number, month_key, month_label, day_label, time_label, end_day_label, is_past'
    )
    .eq('season_year', season)
    .order('starts_at', { ascending: true })
    .order('sort_hint', { ascending: true })
    .order('title', { ascending: true })
    .range(0, ROW_CAP - 1);

  const entries = data || [];
  const truncated = entries.length === ROW_CAP;

  return (
    <main className="page page-narrow">
      <p className="eyebrow">
        {leagueName} · {season} League Year
      </p>
      <h1>League Calendar</h1>
      <p className="subhead">
        Every dated deadline in the rule book, March 1 {season} through the end of February{' '}
        {season + 1}. Game weeks are read from the same rows the dead-money engine charges
        against, so the calendar and the salary clock cannot disagree. Times are U.S. Eastern.
      </p>

      {error && (
        <p className="empty-note">Couldn&apos;t load the calendar: {error.message}</p>
      )}

      {!error && entries.length === 0 && (
        <p className="empty-note">No calendar entries have been recorded for {season}.</p>
      )}

      {truncated && (
        <p className="form-notice">
          Showing the first {ROW_CAP} entries only. Later entries are not displayed.
        </p>
      )}

      {entries.length > 0 && <CalendarView entries={entries} />}
    </main>
  );
}
