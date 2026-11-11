'use client';

import { catClass, labelFor, ruleHref, isDeadline, whenLine } from './calendarModel';

/**
 * Small shared pieces of the League Calendar (UI test batch 9). Each draws
 * what it is handed and decides nothing.
 */

// A category's dot and its word. The colour never stands alone (Lewis's
// read-back, November 11: every category colour sits beside its word).
export function CategoryTag({ category }) {
  return (
    <span className="lc-tag">
      <span className={'lc-cd ' + catClass(category)} aria-hidden="true" />
      {labelFor(category)}
    </span>
  );
}

export function Dot({ category }) {
  return <span className={'lc-cd ' + catClass(category)} aria-hidden="true" />;
}

export function RuleLink({ refText, href }) {
  return (
    <a className="lc-rulelink" href={href}>
      Read {refText} in the Rule Book ›
    </a>
  );
}

export function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

export function Chevron({ down }) {
  return (
    <svg
      className="lc-chev"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={down ? 'M5 8l5 5 5-5' : 'M8 5l5 5-5 5'} />
    </svg>
  );
}

// The meta line under a title: time, Deadline, category, Provisional, and
// the rule when asked for.
export function MetaLine({ e, withRule }) {
  return (
    <div className="lc-rs">
      {e.time_label && <span>{e.time_label}</span>}
      {isDeadline(e) && <span className="lc-dl">Deadline</span>}
      <CategoryTag category={e.category} />
      {withRule && e.rule_ref && <span className="lc-rule">Rule {e.rule_ref}</span>}
      {e.is_provisional && <span className="lc-prov">Provisional</span>}
      {e.running && <span className="lc-opennow">Open now</span>}
    </div>
  );
}

/**
 * The event card (Lewis, November 11, 9:00 AM: "clicking on an event opens an
 * explanation of the event with a link to the relevant sections of the rule
 * book"). "What this is" is the row's own detail, verbatim; the link names
 * the row's own rule_ref and lands on its Rule Book section.
 */
export function EventCard({ e, isNext, onClose }) {
  return (
    <div className="lc-card lc-event" role="dialog" aria-label={e.title}>
      <div className="lc-ehead">
        <p className="lc-label lc-label-flat">
          {e.day_label}
          {e.end_day_label ? ' – ' + e.end_day_label : ''}
          {isNext ? ' · next up' : ''}
        </p>
        <button type="button" className="lc-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="lc-rt lc-event-t">{e.title}</div>
      <MetaLine e={e} withRule />
      {e.detail && (
        <>
          <p className="lc-ewhat">What this is</p>
          <p className="lc-detail">{e.detail}</p>
        </>
      )}
      {e.rule_ref && <RuleLink refText={'Rule ' + e.rule_ref} href={ruleHref(e.rule_ref)} />}
    </div>
  );
}

// One row of a list: date tile, title and meta, chevron. Used by the
// Timeline and by the month view's "Also in" list. A button, so the whole
// row is the tap target.
export function EntryRow({ e, tile, open, onToggle, past }) {
  const cls =
    'lc-row' + (isDeadline(e) ? ' is-deadline' : '') + (open ? ' is-open' : '') + (past ? ' is-past' : '');
  return (
    <div className={cls}>
      <button type="button" className="lc-rowbtn" aria-expanded={open ? 'true' : 'false'} onClick={onToggle}>
        <span className={'lc-day' + (tile.range ? ' is-range' : '')}>
          <b>{tile.n}</b>
          <i>{tile.cap}</i>
        </span>
        <span className="lc-when2">{whenLine(e)}</span>
        <span className="lc-rowmain">
          <span className="lc-rt">{e.title}</span>
          <MetaLine e={e} />
        </span>
        <Chevron down={open} />
      </button>
      {open && (
        <div className="lc-rowmore">
          {e.detail && <p className="lc-detail">{e.detail}</p>}
          {e.rule_ref && <RuleLink refText={'Rule ' + e.rule_ref} href={ruleHref(e.rule_ref)} />}
        </div>
      )}
    </div>
  );
}
