'use client';

import { useEffect, useState } from 'react';

/**
 * THE THEME SWITCH.
 *
 * WHAT CHANGED AND WHY. The previous control was a single button printing the
 * theme you would switch TO -- it said "Dark" while you were in light. That is
 * a coin-flip to read, and it cost a real round of this project: the app bar
 * said DARK, the page was light, and the conclusion was that a deploy had not
 * landed. This shows BOTH positions with the live one filled. Nothing to infer.
 *
 * WHAT DID NOT CHANGE, and must not:
 *   - the storage key is still 'edfl-theme', still 'light' | 'dark';
 *   - the attribute is still data-theme on <html>;
 *   - the pre-paint inline script in app/layout.js is what sets the attribute
 *     on first load. This component never runs before paint and must not try
 *     to -- reading the attribute in an effect is deliberate.
 *   - it lives on the LEFT of the app bar (ruling, September 7).
 *
 * theme === null is the pre-hydration state. It renders a same-sized invisible
 * placeholder rather than nothing, so the bar does not reflow when it mounts.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(function () {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  function choose(next) {
    if (next === theme) return;
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('edfl-theme', next);
    } catch (e) {
      // Storage blocked (private window, blocked site data). The theme still
      // changes for this visit; it just will not survive a reload.
    }
    setTheme(next);
  }

  if (theme === null) {
    return <span className="edfl-themeswitch is-placeholder" aria-hidden="true" />;
  }

  return (
    <div className="edfl-themeswitch" role="group" aria-label="Colour theme">
      <button
        type="button"
        className={theme === 'light' ? 'edfl-themebtn is-on' : 'edfl-themebtn'}
        aria-label="Light"
        aria-pressed={theme === 'light'}
        onClick={function () {
          choose('light');
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="10" cy="10" r="3.5" />
          <path d="M10 2.6v1.7M10 15.7v1.7M2.6 10h1.7M15.7 10h1.7M4.8 4.8l1.2 1.2M14 14l1.2 1.2M15.2 4.8L14 6M6 14l-1.2 1.2" />
        </svg>
      </button>
      <button
        type="button"
        className={theme === 'dark' ? 'edfl-themebtn is-on' : 'edfl-themebtn'}
        aria-label="Dark"
        aria-pressed={theme === 'dark'}
        onClick={function () {
          choose('dark');
        }}
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 11.4A6.6 6.6 0 018.6 4a6.8 6.8 0 103.7 12.6 6.6 6.6 0 013.7-5.2z" />
        </svg>
      </button>
    </div>
  );
}
