'use client';

import { useMemo, useState } from 'react';

// Display labels only. The database CHECK constraint on
// league_calendar_events.category is the source of truth for which categories
// exist; an unrecognised one falls through to its raw value rather than being
// dropped -- same principle as tierRows.
const CATEGORY_LABELS = {
  season: 'Season',
  money: 'Cap & Cash',
  contracts: 'Contracts',
  cuts: 'Cuts',
  trades: 'Trades',
  draft: 'Draft',
  roster: 'Roster',
  gameplay: 'Gameplay',
  governance: 'Governance',
};

function labelFor(category) {
  return CATEGORY_LABELS[category] || category;
}

export default function CalendarView({ entries }) {
  const [category, setCategory] = useState('all');
  const [showPast, setShowPast] = useState(true);

  const categories = useMemo(() => {
    const seen = [];
    for (const e of entries) {
      if (!seen.includes(e.category)) seen.push(e.category);
    }
    return seen.sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
  }, [entries]);

  // "Next up" is computed against the UNFILTERED list on purpose, so the marker
  // means "the next thing that happens in the league", not "the next thing in
  // this filter". Filtering to Trades must not promote a trade deadline to
  // "next up" when a game week lands first. Do not move this inside the visible list.
  const nextId = useMemo(() => {
    const next = entries.find((e) => !e.is_past);
    return next ? next.entry_id : null;
  }, [entries]);

  const pastCount = useMemo(() => entries.filter((e) => e.is_past).length, [entries]);

  const visible = entries.filter(
    (e) => (category === 'all' || e.category === category) && (showPast || !e.is_past)
  );

  // Group into months by walking the already-sorted list. The entries prop arrives
  // ordered by starts_at, sort_hint, title from the view, so adjacency is
  // sufficient -- do not sort or re-key by month here.
  const months = [];
  for (const e of visible) {
    const last = months[months.length - 1];
    if (last && last.key === e.month_key) last.rows.push(e);
    else months.push({ key: e.month_key, label: e.month_label, rows: [e] });
  }

  return (
    <>
      <div className="cal-controls">
        <button
          type="button"
          className="cal-filter"
          aria-pressed={category === 'all'}
          onClick={() => setCategory('all')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className="cal-filter"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {labelFor(c)}
          </button>
        ))}

        <span className="cal-spacer" />

        {pastCount > 0 && (
          <button
            type="button"
            className="cal-filter"
            aria-pressed={!showPast}
            onClick={() => setShowPast(!showPast)}
          >
            {showPast ? 'Hide ' + pastCount + ' past' : 'Show ' + pastCount + ' past'}
          </button>
        )}
        <span className="cal-count">{visible.length} shown</span>
      </div>

      {visible.length === 0 && <p className="empty-note">Nothing matches that filter.</p>}

      {months.map((m) => (
        <section key={m.key}>
          <h2 className="cal-month">{m.label}</h2>
          {m.rows.map((e) => {
            const isNext = e.entry_id === nextId;
            const cls =
              'cal-row' + (e.is_past ? ' is-past' : '') + (isNext ? ' is-next' : '');
            return (
              <article key={e.entry_id} className={cls}>
                <div className="cal-when">
                  {/* Every string below is pre-rendered in America/New_York by
                      the league_calendar view. Never pass these through Date()
                      or toLocaleDateString() -- a 00:01 ET entry reformatted in
                      the browser displays a day early west of Eastern. */}
                  <span className="cal-date">{e.day_label}</span>
                  {e.end_day_label && (
                    <span className="cal-thru">through {e.end_day_label}</span>
                  )}
                  {e.time_label && <span className="cal-time">{e.time_label}</span>}
                </div>
                <div className="cal-body">
                  {isNext && <span className="cal-nextflag">Next up</span>}
                  <h3 className="cal-title">{e.title}</h3>
                  {e.detail && <p className="cal-detail">{e.detail}</p>}
                  <div className="cal-meta">
                    <span className="cal-tag">{labelFor(e.category)}</span>
                    {e.rule_ref && <span className="cal-rule">Rule {e.rule_ref}</span>}
                    {e.is_provisional && <span className="cal-prov">Provisional</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ))}

      <div className="legend">
        <span>
          Provisional -- the date is not yet locked. NFL flex scheduling can move a game week,
          and playoff weeks follow the NFL schedule rather than a fixed day.
        </span>
        <span>
          Reference only -- the binding rule for each date lives in the cited rule book section.
        </span>
      </div>
    </>
  );
}
