'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveWeek, generateWeeks, saveEvent, deleteEvent, copySeasonForward } from './actions';

// CALENDAR LOADER -- the client half. See ./page.js and ./actions.js.
//
// NOTHING HERE DECIDES A RULE. Order checks, the started-week lock, the
// rule-reference guard and the Tuesday check all live in the calendar_*
// functions; this file collects input and prints the database's answer
// verbatim. The "Locked" and "Read by the app" notes are presentation drawn
// from the view's own flags, not a second copy of those checks.
//
// Times are datetime-local strings in Eastern wall-clock, passed through
// untouched. Never convert them here.

// Mirrors the CHECK constraint on league_calendar_events.category. If the
// constraint changes, change this list in the same batch; an unknown value is
// refused by the database either way.
const CATEGORIES = [
  'season',
  'money',
  'contracts',
  'cuts',
  'trades',
  'auction',
  'draft',
  'roster',
  'gameplay',
  'governance',
];

const fieldRow = { display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '12px' };
const checkLabel = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  flex: '0 0 auto',
  minWidth: 0,
};
const checkInput = { minHeight: 0, width: '18px', height: '18px', padding: 0 };
const cardStyle = {
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '10px 14px',
  marginBottom: '10px',
  background: 'var(--bg-elevated)',
};
const summaryStyle = { cursor: 'pointer', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' };
const dimStyle = { color: 'var(--text-dim)', fontSize: '13px' };

function Result({ result }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <p className="empty-note" style={{ color: 'var(--accent-gold)' }}>
        {result.message}
      </p>
    );
  }
  return <div className="form-error">{result.message}</div>;
}

function readable(local) {
  if (!local) return '—';
  return local.replace('T', ' ');
}

function blankWeek(season, weekNumber) {
  return {
    season_year: season,
    week_number: weekNumber,
    first_game_label: '',
    is_provisional: true,
    counts_toward_taxi_weeks: weekNumber > 1,
    charge_local: '',
    first_game_local: '',
    wire_local: '',
    compliance_local: '',
    last_game_local: '',
    locked: false,
  };
}

function WeekForm({ week, isNew, onSaved }) {
  const [v, setV] = useState({
    firstGameLabel: week.first_game_label || '',
    chargeLocal: week.charge_local || '',
    firstGameLocal: week.first_game_local || '',
    wireLocal: week.wire_local || '',
    complianceLocal: week.compliance_local || '',
    lastGameLocal: week.last_game_local || '',
    isProvisional: Boolean(week.is_provisional),
    countsTowardTaxiWeeks: Boolean(week.counts_toward_taxi_weeks),
  });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const locked = Boolean(week.locked);

  function set(key) {
    return function (e) {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setV(function (prev) {
        const next = { ...prev };
        next[key] = value;
        return next;
      });
    };
  }

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const r = await saveWeek({
      seasonYear: week.season_year,
      weekNumber: week.week_number,
      firstGameLabel: v.firstGameLabel,
      chargeLocal: v.chargeLocal,
      firstGameLocal: v.firstGameLocal,
      wireLocal: v.wireLocal,
      complianceLocal: v.complianceLocal,
      lastGameLocal: v.lastGameLocal,
      isProvisional: v.isProvisional,
      countsTowardTaxiWeeks: v.countsTowardTaxiWeeks,
    }).catch(function (err) {
      return { ok: false, message: 'The save did not reach the server: ' + (err && err.message ? err.message : String(err)) };
    });
    setPending(false);
    setResult(r);
    if (r.ok) onSaved();
  }

  return (
    <form className="admin-form" onSubmit={submit} style={{ marginTop: '10px' }}>
      {locked && (
        <p className="form-notice">
          This week has started and salary has been charged against it. Only the first-game label
          and the provisional flag can change.
        </p>
      )}
      <div style={fieldRow}>
        <label>
          Salary charge (Tue)
          <input type="datetime-local" value={v.chargeLocal} onChange={set('chargeLocal')} disabled={locked} required />
        </label>
        <label>
          Waiver run (Wed)
          <input type="datetime-local" value={v.wireLocal} onChange={set('wireLocal')} disabled={locked} />
        </label>
        <label>
          First game day / compliance
          <input type="datetime-local" value={v.firstGameLocal} onChange={set('firstGameLocal')} disabled={locked} required />
        </label>
      </div>
      <div style={fieldRow}>
        <label>
          Compliance deadline
          <input type="datetime-local" value={v.complianceLocal} onChange={set('complianceLocal')} disabled={locked} />
        </label>
        <label>
          Last game ends
          <input type="datetime-local" value={v.lastGameLocal} onChange={set('lastGameLocal')} disabled={locked} required />
        </label>
      </div>
      <div style={fieldRow}>
        <label style={{ flex: '2 1 320px' }}>
          First-game label
          <input
            type="text"
            value={v.firstGameLabel}
            onChange={set('firstGameLabel')}
            placeholder="e.g. Lions at Bills — Thu 8:15 PM ET"
          />
        </label>
      </div>
      <div style={fieldRow}>
        <label style={checkLabel}>
          <input type="checkbox" style={checkInput} checked={v.isProvisional} onChange={set('isProvisional')} />
          Provisional (awaiting the NFL schedule)
        </label>
        <label style={checkLabel}>
          <input
            type="checkbox"
            style={checkInput}
            checked={v.countsTowardTaxiWeeks}
            onChange={set('countsTowardTaxiWeeks')}
            disabled={locked}
          />
          Counts toward the practice squad week limit
        </label>
      </div>
      <Result result={result} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Saving…' : isNew ? 'Add Week ' + week.week_number : 'Save Week ' + week.week_number}
      </button>
    </form>
  );
}

function GenerateWeeks({ season, onSaved }) {
  const [date, setDate] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const r = await generateWeeks({ seasonYear: season, week1ChargeDate: date }).catch(function (err) {
      return { ok: false, message: 'The request did not reach the server: ' + (err && err.message ? err.message : String(err)) };
    });
    setPending(false);
    setResult(r);
    if (r.ok) onSaved();
  }

  return (
    <form className="admin-form" onSubmit={submit} style={cardStyle}>
      <p style={{ marginTop: 0 }}>
        No league weeks are loaded for {season}. Draft all fourteen from the Tuesday Week 1 salary is
        charged. Each drafted week is provisional and follows the usual shape — Tuesday charge,
        Wednesday waiver run, Thursday first game and compliance, games through Monday night — so
        check every week against the NFL schedule before clearing its flag.
      </p>
      <div style={fieldRow}>
        <label>
          Week 1 salary charge (a Tuesday)
          <input type="date" value={date} onChange={function (e) { setDate(e.target.value); }} required />
        </label>
      </div>
      <Result result={result} />
      <button type="submit" className="btn" disabled={pending}>
        {pending ? 'Drafting…' : 'Draft 14 provisional weeks'}
      </button>
    </form>
  );
}

function blankEvent(season) {
  return {
    id: null,
    season_year: season,
    title: '',
    detail: '',
    category: 'season',
    rule_ref: '',
    is_provisional: false,
    time_is_exact: false,
    sort_hint: 0,
    starts_local: '',
    ends_local: '',
    is_past: false,
  };
}

function EventForm({ event, isNew, onSaved }) {
  const [v, setV] = useState({
    title: event.title || '',
    detail: event.detail || '',
    category: event.category || 'season',
    ruleRef: event.rule_ref || '',
    isProvisional: Boolean(event.is_provisional),
    timeIsExact: Boolean(event.time_is_exact),
    sortHint: event.sort_hint === null || event.sort_hint === undefined ? 0 : event.sort_hint,
    startsLocal: event.starts_local || '',
    endsLocal: event.ends_local || '',
  });
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  function set(key) {
    return function (e) {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setV(function (prev) {
        const next = { ...prev };
        next[key] = value;
        return next;
      });
    };
  }

  async function submit(e) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const r = await saveEvent({
      id: event.id,
      seasonYear: event.season_year,
      title: v.title,
      detail: v.detail,
      category: v.category,
      ruleRef: v.ruleRef,
      isProvisional: v.isProvisional,
      timeIsExact: v.timeIsExact,
      sortHint: v.sortHint,
      startsLocal: v.startsLocal,
      endsLocal: v.endsLocal,
    }).catch(function (err) {
      return { ok: false, message: 'The save did not reach the server: ' + (err && err.message ? err.message : String(err)) };
    });
    setPending(false);
    setResult(r);
    if (r.ok) {
      if (isNew) {
        setV({
          title: '', detail: '', category: 'season', ruleRef: '', isProvisional: false,
          timeIsExact: false, sortHint: 0, startsLocal: '', endsLocal: '',
        });
      }
      onSaved();
    }
  }

  async function remove() {
    setPending(true);
    setResult(null);
    const r = await deleteEvent({ id: event.id, reason: reason }).catch(function (err) {
      return { ok: false, message: 'The delete did not reach the server: ' + (err && err.message ? err.message : String(err)) };
    });
    setPending(false);
    setResult(r);
    if (r.ok) onSaved();
  }

  return (
    <form className="admin-form" onSubmit={submit} style={{ marginTop: '10px' }}>
      <div style={fieldRow}>
        <label style={{ flex: '2 1 320px' }}>
          Title
          <input type="text" value={v.title} onChange={set('title')} required />
        </label>
        <label>
          Category
          <select value={v.category} onChange={set('category')}>
            {CATEGORIES.map(function (c) {
              return (
                <option key={c} value={c}>
                  {c}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Rule reference
          <input type="text" value={v.ruleRef} onChange={set('ruleRef')} placeholder="e.g. 5.14(a)" />
        </label>
      </div>
      <div style={fieldRow}>
        <label>
          Starts
          <input type="datetime-local" value={v.startsLocal} onChange={set('startsLocal')} required />
        </label>
        <label>
          Ends (optional)
          <input type="datetime-local" value={v.endsLocal} onChange={set('endsLocal')} />
        </label>
        <label>
          Sort order on the same day
          <input type="number" step="1" value={v.sortHint} onChange={set('sortHint')} />
        </label>
      </div>
      <div style={fieldRow}>
        <label style={{ flex: '1 1 100%' }}>
          Detail
          <input type="text" value={v.detail} onChange={set('detail')} />
        </label>
      </div>
      <div style={fieldRow}>
        <label style={checkLabel}>
          <input type="checkbox" style={checkInput} checked={v.timeIsExact} onChange={set('timeIsExact')} />
          Show the time (otherwise the day only)
        </label>
        <label style={checkLabel}>
          <input type="checkbox" style={checkInput} checked={v.isProvisional} onChange={set('isProvisional')} />
          Provisional
        </label>
      </div>
      <Result result={result} />
      <div className="page-actions" style={{ marginBottom: 0 }}>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Working…' : isNew ? 'Add entry' : 'Save entry'}
        </button>
      </div>
      {!isNew && !event.is_past && (
        <div style={{ ...fieldRow, marginTop: '16px', alignItems: 'flex-end' }}>
          <label style={{ flex: '2 1 320px' }}>
            Reason for deleting (goes in the public action log)
            <input
              type="text"
              value={reason}
              onChange={function (e) { setReason(e.target.value); }}
              placeholder="At least ten characters"
            />
          </label>
          <button type="button" className="btn btn-danger" disabled={pending} onClick={remove}>
            Delete entry
          </button>
        </div>
      )}
    </form>
  );
}

function CopyForward({ season, onSaved }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);

  async function run() {
    setPending(true);
    setResult(null);
    const r = await copySeasonForward({ fromSeason: season }).catch(function (err) {
      return { ok: false, message: 'The request did not reach the server: ' + (err && err.message ? err.message : String(err)) };
    });
    setPending(false);
    setResult(r);
    if (r.ok) onSaved();
  }

  return (
    <div style={cardStyle}>
      <p style={{ marginTop: 0 }}>
        {season + 1} has no calendar entries yet. Draft them from this year: every entry is copied one
        calendar year later and marked provisional, for you to confirm or correct one by one.
      </p>
      <Result result={result} />
      <button type="button" className="btn" disabled={pending} onClick={run}>
        {pending ? 'Drafting…' : 'Draft ' + (season + 1) + ' entries from ' + season}
      </button>
    </div>
  );
}

export default function CalendarAdmin({ season, weeks, events, eventsTruncated, nextSeasonHasEvents }) {
  const router = useRouter();
  function refresh() {
    router.refresh();
  }

  const weekList = Array.isArray(weeks) ? weeks : null;
  const eventList = Array.isArray(events) ? events : null;
  const haveNumbers = new Set((weekList || []).map(function (w) { return w.week_number; }));
  let nextNumber = null;
  for (let n = 1; n <= 14; n += 1) {
    if (!haveNumbers.has(n)) {
      nextNumber = n;
      break;
    }
  }

  return (
    <div>
      <h2 className="section-heading">League weeks — {season}</h2>
      {weekList === null ? null : weekList.length === 0 ? (
        <GenerateWeeks season={season} onSaved={refresh} />
      ) : (
        <div>
          {weekList.map(function (w) {
            return (
              <details key={w.week_number} style={cardStyle}>
                <summary style={summaryStyle}>
                  <strong>Week {w.week_number}</strong>
                  <span style={dimStyle}>{w.first_game_label || 'No first-game label'}</span>
                  <span style={dimStyle}>
                    charge {readable(w.charge_local)} · last game {readable(w.last_game_local)}
                  </span>
                  {w.is_provisional && <span className="status status-live">Provisional</span>}
                  {w.locked && <span className="status status-off">Started</span>}
                </summary>
                <WeekForm week={w} isNew={false} onSaved={refresh} />
              </details>
            );
          })}
          {nextNumber !== null && (
            <details style={cardStyle}>
              <summary style={summaryStyle}>
                <strong>Add Week {nextNumber}</strong>
              </summary>
              <WeekForm key={'new-' + nextNumber} week={blankWeek(season, nextNumber)} isNew onSaved={refresh} />
            </details>
          )}
        </div>
      )}

      <h2 className="section-heading" style={{ marginTop: '32px' }}>
        Calendar entries — {season}
      </h2>
      {eventsTruncated && (
        <p className="form-notice">Only the first entries are shown. Later entries are not listed here.</p>
      )}
      {eventList !== null && eventList.length > 0 && nextSeasonHasEvents === false && (
        <CopyForward season={season} onSaved={refresh} />
      )}
      <details style={cardStyle}>
        <summary style={summaryStyle}>
          <strong>+ New entry</strong>
        </summary>
        <EventForm event={blankEvent(season)} isNew onSaved={refresh} />
      </details>
      {eventList !== null && eventList.length === 0 && (
        <p className="empty-note">No calendar entries are recorded for {season}.</p>
      )}
      {(eventList || []).map(function (e) {
        return (
          <details key={e.id} style={cardStyle}>
            <summary style={summaryStyle}>
              <span style={dimStyle}>{readable(e.starts_local)}</span>
              <strong>{e.title}</strong>
              {e.rule_ref && <span style={dimStyle}>Rule {e.rule_ref}</span>}
              <span style={dimStyle}>{e.category}</span>
              {e.is_provisional && <span className="status status-live">Provisional</span>}
              {e.is_past && <span className="status status-off">Past</span>}
            </summary>
            <EventForm key={e.id + ':' + e.starts_local + ':' + e.title} event={e} isNew={false} onSaved={refresh} />
          </details>
        );
      })}
    </div>
  );
}
