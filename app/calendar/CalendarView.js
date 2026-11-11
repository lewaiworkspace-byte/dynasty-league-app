'use client';

import { useMemo, useState } from 'react';
import SeasonStrip from './SeasonStrip';
import MonthView from './MonthView';
import TimelineView from './TimelineView';
import { nextUp } from './calendarModel';

/**
 * THE LEAGUE CALENDAR BELOW ITS HEADING -- November 11, 2026 (UI test batch 9).
 *
 * Top to bottom, as Lewis picked on the canvas: the season strip, then the
 * Calendar / Timeline switch, then the chosen view. The page opens on
 * Timeline and the switch remembers nothing between visits (the read-back
 * put to Lewis on November 11). "Whole year as a list" on the Calendar view opens
 * the Timeline with the earlier entries unfolded.
 *
 * "Next up" is computed against the UNFILTERED list on purpose, so it means
 * "the next thing that happens in the league", not "the next thing in this
 * filter". Do not move it inside a filtered list.
 */
export default function CalendarView({ entries, season, nowMs, todayKey, todayLabel }) {
  const [view, setView] = useState('timeline');
  const [showEarlier, setShowEarlier] = useState(false);
  const next = useMemo(() => nextUp(entries), [entries]);

  return (
    <>
      <SeasonStrip entries={entries} season={season} nowMs={nowMs} todayLabel={todayLabel} />

      <div className="lc-view" role="group" aria-label="Choose a view">
        <button
          type="button"
          className={'lc-viewbtn' + (view === 'calendar' ? ' is-on' : '')}
          aria-pressed={view === 'calendar'}
          onClick={() => setView('calendar')}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
            <path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" />
          </svg>
          <span>Calendar</span>
        </button>
        <button
          type="button"
          className={'lc-viewbtn' + (view === 'timeline' ? ' is-on' : '')}
          aria-pressed={view === 'timeline'}
          onClick={() => setView('timeline')}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M8 5h9M8 10h9M8 15h9" />
            <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span>Timeline</span>
        </button>
      </div>

      {view === 'calendar' ? (
        <MonthView
          entries={entries}
          todayKey={todayKey}
          nextId={next ? next.entry_id : null}
          onWholeYear={() => {
            setShowEarlier(true);
            setView('timeline');
          }}
        />
      ) : (
        <TimelineView
          entries={entries}
          todayKey={todayKey}
          next={next}
          showEarlier={showEarlier}
          setShowEarlier={setShowEarlier}
        />
      )}
    </>
  );
}
