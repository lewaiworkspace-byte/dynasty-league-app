'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * THE "EXPLAIN THIS" ICON -- November 11, 2026 (UI test batch 7).
 *
 * Lewis, on the Team HQ design canvas: "Don't include this explanation, but
 * create a small 'Tell me more' or 'explain this' icon that users can click on
 * to understand how something is calculated. It needs to be a simple symbol
 * that will be used throughout the app. It should be subtle and owners will
 * know to look for it because it will be prevalent throughout the app. But I
 * don't want it taking up a lot of space or be distracting like this."
 *
 * So: one circled "i" (16px, drawn in --ink-3, a 44px touch target) beside a
 * heading or a figure; pressing it opens a small card titled "How this is
 * calculated" with an X to close. Escape, a press outside the card, or the
 * icon again also close it. The explanation lives in the card, never as a
 * paragraph on the page. ui-patterns.md carries the rule; use THIS component
 * for every explanation, never a second icon.
 *
 * WHERE THE CARD OPENS. The card is positioned against the nearest ancestor
 * carrying `edfl-explain-host` (position: relative): full width of that host
 * on a phone, 440px from its left edge from 700px up. Put the class on the row
 * that holds the heading and this button (`.edfl-explain-h`), never on a
 * narrow inline element, or the card will be squeezed.
 *
 * Props:
 *   label     the button's accessible name, e.g. "How Position rankings is
 *             calculated" (required: the icon has no visible text)
 *   title     the card's heading (default "How this is calculated")
 *   children  the explanation: a <ul> of short bullets is the house style
 *
 * It reads nothing and decides nothing; the caller hands it the words.
 */
export default function ExplainButton(props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popId = useId();
  const title = props.title || 'How this is calculated';

  useEffect(
    function () {
      if (!open) return undefined;
      function onKey(e) {
        if (e.key === 'Escape') setOpen(false);
      }
      function onDown(e) {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener('keydown', onKey);
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
      return function () {
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('touchstart', onDown);
      };
    },
    [open]
  );

  return (
    <span className="edfl-explain-wrap" ref={wrapRef}>
      <button
        type="button"
        className="edfl-explain"
        aria-label={props.label}
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? popId : undefined}
        onClick={function () {
          setOpen(!open);
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="6.6" />
          <path d="M8 7.2v4" />
          <circle cx="8" cy="4.9" r="0.55" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open ? (
        <div className="edfl-explain-pop" role="dialog" aria-label={title} id={popId}>
          <div className="edfl-explain-head">
            <span>{title}</span>
            <button
              type="button"
              className="edfl-explain-close"
              aria-label="Close"
              onClick={function () {
                setOpen(false);
              }}
            >
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
            </button>
          </div>
          <div className="edfl-explain-body">{props.children}</div>
        </div>
      ) : null}
    </span>
  );
}
