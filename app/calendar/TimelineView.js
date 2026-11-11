'use client';

import { useMemo, useState } from 'react';
import { EntryRow, CategoryTag, Dot } from './CalendarBits';
import { categoriesFor, currentWeek, dayTile, daysBetween, labelFor } from './calendarModel';

/**
 * THE TIMELINE VIEW (Option A on the canvas; Lewis, November 11, 9:02 AM:
 * "give the user a toggle option ... for calendar view or timeline view").
 *
 * Right now (the current game week and any window open now), Next up with a
 * day countdown, then every entry from today forward grouped by month. Rows
 * open in place to show what they are and a link to their rule. Entries
 * already past fold behind one button. A phone filters by category with a
 * row of chips that slides sideways; from 900px a left rail carries Right
 * now, Next up and a "Show" list with counts.
 *
 * "Next up" is the first entry that has not STARTED. A window that is open
 * now is listed under Right now, never as next (F16: the old page flagged
 * "Poaching open" as next up for twelve weeks because a running window is
 * not past). Both are judged against the server's one clock reading.
 */
export default function TimelineView({ entries, todayKey, next, showEarlier, setShowEarlier }) {
  const [category, setCategory] = useState('all');
  const [openId, setOpenId] = useState(null);

  const week = useMemo(() => currentWeek(entries), [entries]);
  const running = useMemo(() => entries.filter((e) => e.running), [entries]);
  const past = useMemo(() => entries.filter((e) => e.is_past), [entries]);

  // Folded: what has not started yet. Unfolded: the whole year, in the
  // view's own order (never re-sorted here).
  const scope = showEarlier ? entries : entries.filter((e) => !e.started);
  const cats = categoriesFor(entries);
  const counts = {};
  for (const e of scope) counts[e.category] = (counts[e.category] || 0) + 1;

  const visible = scope.filter((e) => category === 'all' || e.category === category);

  // Group into months by walking the already-sorted list; adjacency is
  // enough because the view orders by starts_at.
  const months = [];
  for (const e of visible) {
    const last = months[months.length - 1];
    if (last && last.key === e.month_key) last.rows.push(e);
    else months.push({ key: e.month_key, label: e.month_label, rows: [e] });
  }

  const daysToNext = next && todayKey && next.local_date ? daysBetween(todayKey, next.local_date) : null;

  const filterChips = (
    <div className="lc-chips" role="group" aria-label="Show">
      <button
        type="button"
        className={'lc-chip' + (category === 'all' ? ' is-on' : '')}
        aria-pressed={category === 'all'}
        onClick={() => setCategory('all')}
      >
        All
      </button>
      {cats.map((c) => (
        <button
          key={c}
          type="button"
          className={'lc-chip' + (category === c ? ' is-on' : '')}
          aria-pressed={category === c}
          onClick={() => setCategory(c)}
        >
          <Dot category={c} />
          {labelFor(c)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="lc-a-grid">
      <div className="lc-a-rail">
        {(week || running.length > 0) && (
          <div className="lc-card lc-now">
            <p className="lc-label">Right now</p>
            {week && (
              <div className="lc-nowrow">
                <span className="lc-live" aria-hidden="true" />
                <div>
                  <div className="lc-nowt">Week {week.week_number} of the regular season</div>
                  <div className="lc-nowd">
                    Began {week.day_label}
                    {week.time_label ? ', ' + week.time_label : ''}
                  </div>
                </div>
              </div>
            )}
            {running.map((e) => (
              <div className="lc-nowrow" key={e.entry_id}>
                <span className="lc-live" aria-hidden="true" />
                <div>
                  <div className="lc-nowt">{e.title}</div>
                  <div className="lc-nowd">Open until {e.end_day_label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {next && (
          <div className="lc-next">
            <p className="lc-label">Next up</p>
            <p className="lc-next-t">{next.title}</p>
            <div className="lc-next-when">
              <span className="lc-next-date">
                {next.day_label}
                {next.time_label ? ' · ' + next.time_label : ''}
              </span>
              {daysToNext !== null && daysToNext >= 0 && (
                <span className="lc-count">
                  {daysToNext === 0 ? 'Today' : daysToNext}
                  {daysToNext > 0 && <small>{daysToNext === 1 ? 'day' : 'days'}</small>}
                </span>
              )}
            </div>
            <div className="lc-meta">
              <CategoryTag category={next.category} />
              {next.rule_ref && <span className="lc-rule">Rule {next.rule_ref}</span>}
            </div>
          </div>
        )}

        <div className="lc-a-filters" role="group" aria-label="Show">
          <p className="lc-label lc-label-top">Show</p>
          <button
            type="button"
            className={'lc-a-filter' + (category === 'all' ? ' is-on' : '')}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            <span className="lc-cd lc-cd-all" aria-hidden="true" />
            <span>All</span>
            <span className="lc-a-n">{scope.length}</span>
          </button>
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={'lc-a-filter' + (category === c ? ' is-on' : '')}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              <Dot category={c} />
              <span>{labelFor(c)}</span>
              <span className="lc-a-n">{counts[c] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lc-a-list">
        {filterChips}

        {past.length > 0 && (
          <button type="button" className="lc-earlier" aria-expanded={showEarlier} onClick={() => setShowEarlier(!showEarlier)}>
            {showEarlier
              ? 'Hide the ' + past.length + ' earlier ' + (past.length === 1 ? 'entry' : 'entries')
              : 'Show ' +
                past.length +
                ' earlier ' +
                (past.length === 1 ? 'entry' : 'entries') +
                ' (' +
                past[0].day_label +
                ' – ' +
                past[past.length - 1].day_label +
                ')'}
          </button>
        )}

        {visible.length === 0 && <p className="lc-empty">Nothing matches that filter.</p>}

        {months.map((m) => (
          <section key={m.key}>
            <h2 className="lc-month">
              {m.label}
              <span>
                {m.rows.length} {m.rows.length === 1 ? 'entry' : 'entries'}
              </span>
            </h2>
            <div className="lc-list">
              {m.rows.map((e) => (
                <EntryRow
                  key={e.entry_id}
                  e={e}
                  tile={dayTile(e)}
                  past={e.is_past}
                  open={openId === e.entry_id}
                  onToggle={() => setOpenId(openId === e.entry_id ? null : e.entry_id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
