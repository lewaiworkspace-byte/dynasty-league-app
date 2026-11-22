import { supabase } from '../../lib/supabaseClient';
import { easternDateKey, formatWeekdayDate } from '../../lib/formatDate';
import ExplainButton from '../../components/ExplainButton';
import CalendarView from './CalendarView';

// Calendar reflects now() (is_past, is_today_or_active) — never cache.
export const revalidate = 0;

const ROW_CAP = 300;

/**
 * THE LEAGUE CALENDAR -- redrawn November 11, 2026 (UI test batch 9) from the
 * "Your pick" page of the Claude Design canvas "EDFL Calendar (test site)".
 * Lewis, top to bottom: the season-at-a-glance strip, then a Calendar /
 * Timeline switch and the chosen view. The intro paragraph and the two
 * footnotes moved behind the explain icon beside the heading.
 *
 * The clock is read HERE, once, on the server (money-and-dates.md: a server
 * component reading Date.now() is correct; a client component doing it is a
 * hydration bug). The client gets nowMs, today's Eastern date key and its
 * label as props and never reads the clock itself. A row's `started` flag is
 * computed against the same nowMs, so "Right now", "Next up" and the today
 * line can never disagree with each other.
 *
 * Every label on screen is still pre-rendered in America/New_York by the
 * league_calendar view; the raw instants are read only to place bars on the
 * season strip and to order "started" against now.
 */
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
      'entry_id, title, detail, category, rule_ref, is_provisional, source, week_number,' +
        ' starts_at, ends_at, time_is_exact, local_date, end_local_date,' +
        ' month_key, month_label, day_label, time_label, end_day_label,' +
        ' is_today_or_active, is_past'
    )
    .eq('season_year', season)
    .order('starts_at', { ascending: true })
    .order('sort_hint', { ascending: true })
    .order('title', { ascending: true })
    .range(0, ROW_CAP - 1);

  const nowMs = Date.now();
  const todayKey = easternDateKey(nowMs);
  const todayLabel = formatWeekdayDate(nowMs);

  const entries = (data || []).map(function (e) {
    const startMs = Date.parse(e.starts_at);
    const endMs = e.ends_at ? Date.parse(e.ends_at) : null;
    const started = startMs <= nowMs;
    return Object.assign({}, e, {
      startMs: startMs,
      endMs: endMs,
      started: started,
      // A window with its own end that has opened and not yet closed. It is
      // "open now", never "next up" (F16, November 11: the old page flagged
      // "Poaching open" as next for twelve weeks because it was not past).
      running: started && endMs !== null && endMs >= nowMs,
    });
  });
  const truncated = entries.length === ROW_CAP;

  return (
    <main className="lc-page">
      <p className="eyebrow">
        {leagueName} · {season} League Year
      </p>
      <div className="lc-head edfl-explain-host">
        <h1>League Calendar</h1>
        <ExplainButton label="About this calendar" title="About this calendar">
          <ul>
            <li>
              Every dated deadline in the rule book, March 1 {season} through the end of
              February {season + 1}.
            </li>
            <li>
              Game weeks are read from the same rows the dead-money engine charges against, so
              the calendar and the salary clock cannot disagree.
            </li>
            <li>Times are U.S. Eastern.</li>
            <li>
              Provisional -- the date is not yet locked. NFL flex scheduling can move a game
              week, and playoff weeks follow the NFL schedule rather than a fixed day.
            </li>
            <li>
              Reference only -- the binding rule for each date lives in the cited rule book
              section.
            </li>
          </ul>
        </ExplainButton>
      </div>

      {/* A failed read is a banner, never an empty calendar (ui-patterns.md:
          the read IS the page's content, so it fails closed). */}
      {error && <p className="empty-note">Couldn&apos;t load the calendar: {error.message}</p>}

      {!error && entries.length === 0 && (
        <p className="empty-note">No calendar entries have been recorded for {season}.</p>
      )}

      {truncated && (
        <p className="form-notice">
          Showing the first {ROW_CAP} entries only. Later entries are not displayed.
        </p>
      )}

      {!error && entries.length > 0 && (
        <CalendarView
          entries={entries}
          season={season}
          nowMs={nowMs}
          todayKey={todayKey}
          todayLabel={todayLabel}
        />
      )}
    </main>
  );
}
