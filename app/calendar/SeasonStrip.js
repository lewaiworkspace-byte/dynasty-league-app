'use client';

import { useMemo } from 'react';
import ExplainButton from '../../components/ExplainButton';
import { RuleLink } from './CalendarBits';
import { yearSpan, phasesFor, lanesFor, pct, joinRules, monthsOfYear, monthShort } from './calendarModel';

/**
 * THE SEASON AT A GLANCE -- the top of the League Calendar (Lewis, November
 * 11, 9:07 AM: "I want this at the top of the League Calendar page then the
 * calendar/timeline").
 *
 * The month labels, the phase bar (Off-season, In-Season, Playoffs, Dead
 * Season), a line for today, and one lane per window (Trades, Restructures,
 * Extensions, Poaching, June 1 split) whose bars line up with the phase bar.
 * Each lane's title is centred above it with the explain icon beside it; the
 * card is the detail text of the rows that open the lane's windows, verbatim,
 * and a link to the lane's Rule Book section. Everything is placed from the
 * rows (calendarModel.js says how); no date is written here.
 *
 * On a phone the Playoffs segment is a trophy (Lewis, 9:06 AM and 9:25 AM:
 * a gold-cup-style trophy with a "1", an original drawing) and the Dead Season
 * reads "Dead"; from 900px the words are written out.
 */
function Trophy() {
  return (
    <svg className="lc-trophy" width="16" height="16" viewBox="0 0 20 20" role="img" aria-label="Playoffs">
      <path
        d="M3.2 3.6h2.4v1.6H4.4v.6a2.6 2.6 0 0 0 2 2.5l.2 1.5A4.1 4.1 0 0 1 2.9 5.8V4.4a.8.8 0 0 1 .3-.8zM16.8 3.6h-2.4v1.6h1.2v.6a2.6 2.6 0 0 1-2 2.5l-.2 1.5a4.1 4.1 0 0 0 3.7-4V4.4a.8.8 0 0 0-.3-.8z"
        fill="currentColor"
      />
      <path d="M5.2 2h9.6v5.2a4.8 4.8 0 0 1-9.6 0z" fill="currentColor" />
      <path d="M8.9 11.6h2.2v3H8.9z" fill="currentColor" />
      <path
        d="M6.4 14.4h7.2a.8.8 0 0 1 .8.8v1.4H5.6v-1.4a.8.8 0 0 1 .8-.8zM4.6 16.6h10.8V18H4.6z"
        fill="currentColor"
      />
      <path d="M9.3 4.6l1.3-.8h.6v5.2h-1.2V5.5l-.7.4z" fill="var(--brass)" />
    </svg>
  );
}

function PhaseLabel({ phase }) {
  if (phase.key === 'po') {
    return (
      <>
        <span className="lc-lg">{phase.label}</span>
        <span className="lc-sh">
          <Trophy />
        </span>
      </>
    );
  }
  if (phase.key === 'dead') {
    return (
      <>
        <span className="lc-lg">{phase.label}</span>
        <span className="lc-sh">Dead</span>
      </>
    );
  }
  return phase.label;
}

export default function SeasonStrip({ entries, season, nowMs, todayLabel }) {
  const model = useMemo(
    function () {
      const span = yearSpan(entries);
      if (!span) return null;
      return {
        span: span,
        months: monthsOfYear(entries),
        phases: phasesFor(entries, span),
        lanes: lanesFor(entries, span),
        today: nowMs >= span.start && nowMs <= span.end ? pct(nowMs, span) : null,
      };
    },
    [entries, nowMs]
  );

  // Rows that cannot be placed on a timeline draw no strip; the views below
  // still show every row.
  if (!model) return null;

  const todayStyle = model.today === null ? null : { left: model.today + '%' };

  return (
    <div className="lc-card lc-strip">
      <p className="lc-label">The {season} league year at a glance</p>
      <div className="lc-months" style={{ gridTemplateColumns: 'repeat(' + model.months.length + ', 1fr)' }}>
        {model.months.map((m) => (
          <span key={m}>{monthShort(m)}</span>
        ))}
      </div>
      <div className="lc-phases">
        {model.phases.map((p) => (
          <span
            key={p.key}
            className={'lc-ph lc-ph-' + p.key}
            style={{ left: p.left + '%', width: p.width + '%' }}
          >
            <PhaseLabel phase={p} />
          </span>
        ))}
        {todayStyle && <span className="lc-today" style={todayStyle} />}
      </div>
      <div className="lc-lanes">
        {model.lanes.map((lane) => (
          <div className="lc-lane" key={lane.key}>
            <div className="lc-lt edfl-explain-host">
              <span>{lane.title}</span>
              <ExplainButton label={lane.label} title={lane.title}>
                {lane.openers.length > 0 && (
                  <ul>
                    {lane.openers
                      .filter((e) => e.detail)
                      .map((e) => (
                        <li key={e.entry_id}>{e.detail}</li>
                      ))}
                  </ul>
                )}
                {lane.rules.length > 0 && (
                  <RuleLink refText={joinRules(lane.rules)} href={lane.rules[0].href} />
                )}
              </ExplainButton>
            </div>
            <span className="lc-track" aria-hidden="true">
              {lane.bars.map((b, i) => (
                <span
                  key={i}
                  className={'lc-bar lc-k-' + b.category}
                  style={{ left: b.left + '%', width: b.width + '%' }}
                />
              ))}
              {todayStyle && <span className="lc-todayline" style={todayStyle} />}
            </span>
          </div>
        ))}
      </div>
      {todayStyle && (
        <p className="lc-note">
          The upright line is today, {todayLabel}. Tap the i beside a row to see what it means.
        </p>
      )}
    </div>
  );
}
