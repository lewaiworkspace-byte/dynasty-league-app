'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeFromWatchlist, restoreToWatchlist, setWatchTier } from './actions';

// THE WATCHLIST'S CLIENT PIECES -- UI test batch 22, November 15, 2026.
//
// Lewis's canvas "EDFL Watchlist (main tab) -- layout options", board
// Combined-390 (and States-390 for the Undo bar and the tier sheet). Each piece
// asks the database (./actions.js) and then has the server read the page again
// (router.refresh / router.replace); none of them decides or computes anything.
//
//   RemoveButton  the full-colour clipboard on a card. Hides the card at once,
//                 takes him off (watchlist_remove), and tells the Undo bar.
//                 A refusal puts the card back with the database's sentence.
//   UndoBar       mounted once on the page. "<name> removed from your
//                 watchlist · Undo" for 8 seconds; Undo calls
//                 watchlist_restore, which brings back the same marker at the
//                 same tier with the same added date.
//   TierChoices   the three rows of the "Who sees it" sheet. A choice calls
//                 watchlist_set and closes the sheet; a refusal stays in the
//                 sheet, verbatim.
//   WatchlistSearch  "Search your watchlist": the term goes into the URL (?q=)
//                 and the page reads again, keeping every other choice.

const EVT = 'edfl-watchlist-removed';

export function RemoveButton({ playerId, name }) {
  const router = useRouter();
  const ref = useRef(null);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    const card = ref.current ? ref.current.closest('[data-wl-card]') : null;
    if (card) card.setAttribute('data-wl-gone', 'true');
    setMsg('');
    startTransition(async function () {
      const res = await removeFromWatchlist(playerId);
      if (!res || res.ok !== true) {
        if (card) card.removeAttribute('data-wl-gone');
        setMsg((res && res.message) || 'He could not be taken off your watchlist.');
        return;
      }
      window.dispatchEvent(new CustomEvent(EVT, { detail: { playerId: playerId, name: name } }));
      router.refresh();
    });
  }

  return (
    <span className="wl-rmwrap">
      <button
        ref={ref}
        type="button"
        className="wl-rm"
        aria-pressed="true"
        aria-label={'On your watchlist. Remove ' + name}
        title="On your watchlist · tap to remove"
        onClick={onClick}
      >
        <img src="/brand/watchlist-on.webp" width="30" height="30" alt="" />
      </button>
      {msg ? (
        <span className="wl-rmmsg" role="status">
          {msg}
        </span>
      ) : null}
    </span>
  );
}

export function UndoBar() {
  const router = useRouter();
  const [last, setLast] = useState(null);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();
  const timer = useRef(null);

  useEffect(function () {
    function onRemoved(e) {
      clearTimeout(timer.current);
      setMsg('');
      setLast(e.detail || null);
      timer.current = setTimeout(function () {
        setLast(null);
      }, 8000);
    }
    window.addEventListener(EVT, onRemoved);
    return function () {
      window.removeEventListener(EVT, onRemoved);
      clearTimeout(timer.current);
    };
  }, []);

  if (!last) return null;

  function undo() {
    if (pending) return;
    clearTimeout(timer.current);
    startTransition(async function () {
      const res = await restoreToWatchlist(last.playerId);
      if (!res || res.ok !== true) {
        setMsg((res && res.message) || 'He could not be put back.');
        timer.current = setTimeout(function () {
          setLast(null);
          setMsg('');
        }, 6000);
        return;
      }
      setLast(null);
      router.refresh();
    });
  }

  return (
    <div className="wl-snack" role="status">
      <span>{msg || last.name + ' removed from your watchlist'}</span>
      {msg ? null : (
        <button type="button" onClick={undo} disabled={pending}>
          Undo
        </button>
      )}
    </div>
  );
}

const TIER_ICON = {
  private: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  ),
  shared: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="3" />
      <circle cx="14" cy="8" r="2.5" />
      <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
      <path d="M12.5 12.5c2.5 0 5 1.5 5 4.5" />
    </svg>
  ),
  league: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8v4l9 4V4z" />
      <path d="M12 7c2 0 3 1.3 3 3s-1 3-3 3" />
    </svg>
  ),
};

export function TierIcon({ tier }) {
  return TIER_ICON[tier] || null;
}

// options: [{ key, label, desc, disabled }]; current: the marker's tier.
export function TierChoices({ playerId, options, current, closeHref }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();

  function pick(key) {
    if (pending) return;
    if (key === current) {
      router.replace(closeHref, { scroll: false });
      return;
    }
    setMsg('');
    startTransition(async function () {
      const res = await setWatchTier(playerId, key);
      if (!res || res.ok !== true) {
        setMsg((res && res.message) || 'Who sees it could not be changed.');
        return;
      }
      router.replace(closeHref, { scroll: false });
      router.refresh();
    });
  }

  return (
    <>
      <div className="wl-optbox">
        {options.map(function (o) {
          const on = o.key === current;
          return (
            <button
              key={o.key}
              type="button"
              className={'wl-opt' + (on ? ' is-on' : '')}
              aria-pressed={on ? 'true' : 'false'}
              disabled={o.disabled || pending}
              onClick={function () {
                pick(o.key);
              }}
            >
              {TIER_ICON[o.key]}
              <span>
                <b>{o.label}</b>
                <span>{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {msg ? (
        <div className="form-error" role="status">
          {msg}
        </div>
      ) : null}
    </>
  );
}

export function WatchlistSearch({ value, base }) {
  const router = useRouter();
  const [term, setTerm] = useState(value || '');
  const timer = useRef(null);
  const first = useRef(true);

  function go(t) {
    const q = t.trim();
    const parts = base ? [base] : [];
    if (q) parts.push('q=' + encodeURIComponent(q));
    router.replace('/watchlist' + (parts.length ? '?' + parts.join('&') : ''), { scroll: false });
  }

  useEffect(
    function () {
      setTerm(value || '');
    },
    [value]
  );

  useEffect(
    function () {
      if (first.current) {
        first.current = false;
        return undefined;
      }
      if (term.trim() === (value || '')) return undefined;
      if (term.trim().length === 1) return undefined;
      timer.current = setTimeout(function () {
        go(term);
      }, 400);
      return function () {
        clearTimeout(timer.current);
      };
    },
    // value and base change only with a navigation this box caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [term]
  );

  return (
    <form
      className="pl-search wl-search"
      role="search"
      action="/watchlist"
      method="get"
      onSubmit={function (e) {
        e.preventDefault();
        clearTimeout(timer.current);
        go(term);
      }}
    >
      <label className="pl-vh" htmlFor="wl-q">
        Search your watchlist
      </label>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M13 13l4 4" />
      </svg>
      <input
        id="wl-q"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search your watchlist"
        value={term}
        maxLength={60}
        onChange={function (e) {
          setTerm(e.target.value);
        }}
      />
    </form>
  );
}
