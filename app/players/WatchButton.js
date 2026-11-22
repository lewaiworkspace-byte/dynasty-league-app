'use client';

import { useState, useTransition } from 'react';
import { toggleWatchlist } from './actions';

// THE WATCHLIST ICON ON A PLAYERS ROW -- UI test batch 21, November 15, 2026.
//
// Lewis's art (Drive > EDFL 2.0 > EDFL App Graphics > Watchlist_Icon.png):
// public/brand/watchlist-off.webp is the clipboard faint and with no check
// (the default); public/brand/watchlist-on.webp is the full-colour clipboard
// with the green check (on the team's watchlist). Tapping flips it at once and
// asks the database (app/players/actions.js); a refusal puts it back and shows
// the database's sentence under the icon.
//
// Drawn only for a login with a team, and never on the owner's own players
// (batch 22: the page keeps an empty spot there); an observer has no watchlist. The page
// hands in `initial` from edfl_watchlist_ids().

export default function WatchButton({ playerId, name, initial }) {
  const [on, setOn] = useState(Boolean(initial));
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    const was = on;
    setOn(!was);
    setMsg('');
    startTransition(async function () {
      const res = await toggleWatchlist(playerId);
      if (!res || res.ok !== true) {
        setOn(was);
        setMsg((res && res.message) || 'The watchlist could not be changed.');
        return;
      }
      setOn(res.watching);
    });
  }

  return (
    <span className="pl-watchwrap">
      <button
        type="button"
        className={'pl-watch' + (on ? ' is-on' : '')}
        aria-pressed={on ? 'true' : 'false'}
        aria-label={on ? 'On your watchlist: ' + name + '. Tap to take him off' : 'Add ' + name + ' to your watchlist'}
        title={on ? 'On your watchlist' : 'Add to your watchlist'}
        onClick={onClick}
      >
        <img
          src={on ? '/brand/watchlist-on.webp' : '/brand/watchlist-off.webp'}
          width="28"
          height="28"
          alt=""
        />
      </button>
      {msg ? (
        <span className="pl-watchmsg" role="status">
          {msg}
        </span>
      ) : null}
    </span>
  );
}
