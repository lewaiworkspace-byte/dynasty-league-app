'use client';

import { useMemo, useState } from 'react';
import { Dot, EventCard, EntryRow, CategoryTag } from './CalendarBits';
import {
  categoriesFor,
  isDeadline,
  monthCells,
  monthLong,
  monthShort,
  monthsOfYear,
  dayTile,
} from './calendarModel';

/**
 * THE CALENDAR VIEW -- the month grid (Option B on the canvas; Lewis,
 * November 11, 9:00 AM: "I like this view. Ensure clicking on an event opens
 * an explanation of the event with a link to the relevant sections of the
 * rule book"; 9:27 AM: no category filter row on this view, the colour key
 * stays).
 *
 * A phone shows a dot per event in each day and the whole day is the tap
 * target; from 900px each event is written in its day as its own button.
 * Today is ringed; the open event's day is filled. A window that covers the
 * whole month is a band above the grid. Beside the grid (below it on a
 * phone): the open event's card, the rest of the month as a list, and jump
 * buttons, with "Whole year as a list" handing over to the Timeline.
 *
 * An event sits on the day it STARTS (its local_date, rendered by the view
 * in Eastern); its card says when it runs through.
 */
export default function MonthView({ entries, todayKey, nextId, onWholeYear }) {
  const months = useMemo(() => monthsOfYear(entries), [entries]);
  const todayMonth = todayKey ? todayKey.slice(0, 7) : null;

  const byDay = useMemo(
    function () {
      const map = {};
      for (const e of entries) {
        if (!e.local_date) continue;
        (map[e.local_date] = map[e.local_date] || []).push(e);
      }
      return map;
    },
    [entries]
  );

  const firstMonth = months.includes(todayMonth) ? todayMonth : months[0];
  const next = nextId ? entries.find((e) => e.entry_id === nextId) : null;

  const [month, setMonth] = useState(firstMonth);
  const [selectedId, setSelectedId] = useState(
    next && next.local_date && next.local_date.slice(0, 7) === firstMonth ? next.entry_id : null
  );

  const idx = months.indexOf(month);
  const cells = monthCells(month);
  const monthEntries = entries.filter((e) => e.local_date && e.local_date.slice(0, 7) === month);
  const selected = selectedId ? entries.find((e) => e.entry_id === selectedId) : null;

  // A window with its own end that covers every day of this month.
  const firstDay = cells.find((c) => c !== null);
  const lastDay = cells.filter((c) => c !== null).slice(-1)[0];
  const bands = entries.filter(
    (e) => e.end_local_date && e.local_date < firstDay && e.end_local_date >= lastDay
  );

  // The rest of the month. When anything in it is still ahead, the list
  // shows only what is ahead (the canvas); a month wholly past lists it all.
  const others = monthEntries.filter((e) => e.entry_id !== selectedId);
  const ahead = others.filter((e) => !e.is_past);
  const listed = ahead.length > 0 ? ahead : others;

  const jumpMonths = months.filter((m) => (todayMonth ? m >= todayMonth : true) && m !== month);

  function go(m) {
    setMonth(m);
    setSelectedId(null);
  }

  function pickDay(day) {
    const list = byDay[day];
    if (list && list.length) setSelectedId(list[0].entry_id);
  }

  return (
    <div className="lc-b-wrap">
      <div>
        <div className="lc-b-nav">
          <button
            type="button"
            className="lc-b-arrow"
            aria-label={idx > 0 ? monthLong(months[idx - 1]) : 'No earlier month'}
            disabled={idx <= 0}
            onClick={() => idx > 0 && go(months[idx - 1])}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5l-5 5 5 5" />
            </svg>
          </button>
          <h2>{monthLong(month)}</h2>
          <button
            type="button"
            className="lc-b-arrow"
            aria-label={idx < months.length - 1 ? monthLong(months[idx + 1]) : 'No later month'}
            disabled={idx >= months.length - 1}
            onClick={() => idx < months.length - 1 && go(months[idx + 1])}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M8 5l5 5-5 5" />
            </svg>
          </button>
        </div>

        {bands.map((e) => (
          <button key={e.entry_id} type="button" className="lc-b-span" onClick={() => setSelectedId(e.entry_id)}>
            <Dot category={e.category} />
            <span>
              <b>{e.title}</b> all month · until {e.end_day_label}
            </span>
          </button>
        ))}

        <div className="lc-b-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="lc-b-dow">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) {
              return <div key={'x' + i} className={'lc-b-cell is-out' + (i < 7 ? ' is-wk1' : '')} />;
            }
            const list = byDay[day] || [];
            const cls =
              'lc-b-cell' +
              (i < 7 ? ' is-wk1' : '') +
              (todayKey && day < todayKey ? ' is-past' : '') +
              (day === todayKey ? ' is-today' : '') +
              (selected && selected.local_date === day ? ' is-sel' : '');
            const n = String(+day.slice(8, 10));
            return (
              <div key={day} className={cls}>
                {list.length > 0 && (
                  <button
                    type="button"
                    className="lc-b-hit"
                    aria-label={monthShort(month) + ' ' + n + ': ' + list.map((e) => e.title).join('; ')}
                    onClick={() => pickDay(day)}
                  />
                )}
                <span className="lc-b-n">{n}</span>
                <span className="lc-b-dots" aria-hidden="true">
                  {list.slice(0, 4).map((e) => (
                    <Dot key={e.entry_id} category={e.category} />
                  ))}
                </span>
                {list.map((e) => (
                  <button
                    key={e.entry_id}
                    type="button"
                    className={
                      'lc-b-ev' +
                      (isDeadline(e) ? ' is-dl' : '') +
                      (e.entry_id === selectedId ? ' is-on' : '')
                    }
                    onClick={() => setSelectedId(e.entry_id)}
                  >
                    <Dot category={e.category} />
                    <span>{e.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div className="lc-b-legend">
          {categoriesFor(entries).map((c) => (
            <CategoryTag key={c} category={c} />
          ))}
        </div>
      </div>

      <div className="lc-b-side">
        {selected && (
          <EventCard e={selected} isNext={selected.entry_id === nextId} onClose={() => setSelectedId(null)} />
        )}

        <div>
          <p className="lc-label">
            {selected ? 'Also in ' : 'In '}
            {monthLong(month).split(' ')[0]}
            {listed.length > 0 ? ' · tap one to open it' : ''}
          </p>
          {listed.length === 0 ? (
            <p className="lc-empty">
              {selected ? 'Nothing else is dated this month.' : 'Nothing is dated this month.'}
            </p>
          ) : (
            <div className="lc-list">
              {listed.map((e) => (
                <EntryRow
                  key={e.entry_id}
                  e={e}
                  tile={dayTile(e)}
                  open={false}
                  past={e.is_past}
                  onToggle={() => setSelectedId(e.entry_id)}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="lc-label">Jump to</p>
          <div className="lc-b-jump">
            {jumpMonths.map((m) => {
              const count = entries.filter((e) => e.local_date && e.local_date.slice(0, 7) === m).length;
              return (
                <button key={m} type="button" className="lc-chip" onClick={() => go(m)}>
                  {monthShort(m)} <span className="lc-chip-n">{count}</span>
                </button>
              );
            })}
            <button type="button" className="lc-chip" onClick={onWholeYear}>
              Whole year as a list
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
