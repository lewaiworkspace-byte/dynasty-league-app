'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// THE SEARCH BOX on the Players screen (UI test batch 11, November 11, 2026).
//
// "Search every player": the term goes into the URL (?q=) and the page reads
// again; edfl_players_rows() searches every player whatever the switch says.
// It decides nothing. Typing waits 400 ms before it navigates, Enter goes at
// once, and the X clears it. Without JavaScript the form still submits as a
// plain GET to /players.

export default function PlayersSearch(props) {
  const router = useRouter();
  const [value, setValue] = useState(props.value || '');
  const timer = useRef(null);
  const first = useRef(true);

  useEffect(
    function () {
      setValue(props.value || '');
    },
    [props.value]
  );

  useEffect(
    function () {
      if (first.current) {
        first.current = false;
        return undefined;
      }
      const term = value.trim();
      if (term === (props.value || '')) return undefined;
      if (term.length === 1) return undefined;
      timer.current = setTimeout(function () {
        router.replace(term ? '/players?q=' + encodeURIComponent(term) : props.clearHref);
      }, 400);
      return function () {
        clearTimeout(timer.current);
      };
    },
    // props.value and clearHref change only with a navigation this box caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value]
  );

  return (
    <form
      className="pl-search"
      role="search"
      action="/players"
      method="get"
      onSubmit={function (e) {
        e.preventDefault();
        clearTimeout(timer.current);
        const term = value.trim();
        router.replace(term ? '/players?q=' + encodeURIComponent(term) : props.clearHref);
      }}
    >
      <label className="pl-vh" htmlFor="pl-q">
        Search every player
      </label>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M13 13l4 4" />
      </svg>
      <input
        id="pl-q"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Search every player"
        value={value}
        maxLength={60}
        onChange={function (e) {
          setValue(e.target.value);
        }}
      />
    </form>
  );
}
