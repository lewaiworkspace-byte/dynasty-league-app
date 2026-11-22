'use client';

import { useState, useTransition } from 'react';
import ExplainButton from '../../../components/ExplainButton';
import { toggleWatchlist } from '../../players/actions';

// THE CARDS' ACTION BOXES -- UI test batch 32, November 21, 2026.
//
// Lewis's canvas "EDFL Player Cards (test site): Mini and Full" and his notes
// on it: "This is the actions box if the player belongs to the owner. If the
// player belongs to another owner, change this to 4 options Watch List, Trade,
// Poach, and Claim (grey out if those options are not available to the
// owner)", "Change Watch List and Trade to the icons we used on roster with
// the same color schemes pending the status and preferences of the owners",
// "Use the Trade Icon here too", "add info icons", and (Nov 21) "Just grey out
// things that aren't a capability yet".
//
// THESE BUTTONS DECIDE NOTHING. Every state arrives as a prop from the
// database's own columns (loadActions.js); a button the app cannot do yet, or
// that the viewer cannot use right now, is drawn GREYED (dashed border, grey
// ink, disabled), never hidden and never a link that opens on nothing.
//
//   OwnActions    the owner's own player: Restructure, Extend, Pay cut, Trade
//                 block, Trade, Cut/Waive. Extend, Pay cut and Trade block are
//                 not built (greyed). Trade opens the Trade desk (the Mini card
//                 shows it as his trade-block icon, the Full card as a word).
//   OtherActions  another owner's player: Watch (the Roster/Players
//                 clipboard), Trade (his trade-block icon; opens the desk with
//                 him added), Poach (opens the bid form at his floor), Claim
//                 (opens the waiver claim). Poach and Claim are open only when
//                 the Players screen would offer them.

const TRADE_ICON = {
  none: { src: '/icons/trade-block/trade-block-none.png', words: 'not on the trade block, no interest' },
  interest: { src: '/icons/trade-block/trade-block-interest.png', words: 'not on the trade block, other owners interested' },
  block: { src: '/icons/trade-block/trade-block-block.png', words: 'on the trade block, no interest yet' },
  both: { src: '/icons/trade-block/trade-block-both.png', words: 'on the trade block, other owners interested' },
};

function TradeImg({ state }) {
  const t = TRADE_ICON[state] || TRADE_ICON.none;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={'ca-ico' + (state === 'none' || !TRADE_ICON[state] ? ' is-faint' : '')} src={t.src} width="30" height="30" alt="" />
  );
}

function tradeWords(state) {
  return (TRADE_ICON[state] || TRADE_ICON.none).words;
}

export function OwnActions({ variant, teamId, contractId, tradeIcon }) {
  const mini = variant === 'mini';
  return (
    <div className={'ca-grid is-three' + (mini ? ' is-mini' : '')}>
      <a className="ca-btn is-primary" href="/restructure" title="Turn salary into a signing bonus to free cap room.">
        Restructure
      </a>
      <button type="button" className="ca-btn is-off" disabled title="Add years to his contract. Not built yet.">
        Extend
      </button>
      <button type="button" className="ca-btn is-off" disabled title="Take less money for the rest of his contract. Not built yet.">
        Pay cut
      </button>
      <button type="button" className="ca-btn is-off" disabled title="Tell the league he is available. Not built yet.">
        Trade block
      </button>
      {mini ? (
        <a
          className="ca-btn is-icon"
          href="/trades/new"
          aria-label={'Trade. He is ' + tradeWords(tradeIcon) + '.'}
          title={'Opens the Trade desk. He is ' + tradeWords(tradeIcon) + '.'}
        >
          <TradeImg state={tradeIcon} />
        </a>
      ) : (
        <a className="ca-btn" href="/trades/new" title="Opens the Trade desk.">
          Trade
        </a>
      )}
      {teamId ? (
        <a
          className="ca-btn"
          href={'/team/' + teamId + '?tab=roster' + (contractId ? '&cut=' + contractId : '')}
          title="On your Roster tab: the Cut dialog shows dead money and savings before you confirm."
        >
          Cut/Waive
        </a>
      ) : (
        <button type="button" className="ca-btn is-off" disabled>
          Cut/Waive
        </button>
      )}
    </div>
  );
}

function WatchToggle({ playerId, name, initial }) {
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
    <>
      <button
        type="button"
        className="ca-btn is-icon"
        aria-pressed={on ? 'true' : 'false'}
        aria-label={on ? 'On your watchlist: ' + name + '. Tap to take him off' : 'Add ' + name + ' to your watchlist'}
        title={on ? 'On your watchlist' : 'Add to your watchlist'}
        onClick={onClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ca-ico" src={on ? '/brand/watchlist-on.webp' : '/brand/watchlist-off.webp'} width="30" height="30" alt="" />
      </button>
      {msg ? (
        <span className="ca-msg" role="status">
          {msg}
        </span>
      ) : null}
    </>
  );
}

function Cell({ label, about, children }) {
  return (
    <div className="ca-cell">
      {children}
      <div className="ca-cap">
        {label}
        <ExplainButton label={'About ' + label} title={label}>
          {about}
        </ExplainButton>
      </div>
    </div>
  );
}

export function OtherActions({ playerId, name, canWatch, watching, tradeHref, tradeIcon, poachHref, claimHref, error }) {
  return (
    <>
      <div className="ca-grid is-four edfl-explain-host">
        <Cell
          label="Watch"
          about={
            <p>
              Adds him to your watch list so you can follow him. You choose who sees your mark: only you, the
              player&rsquo;s owner, or the whole league (on the Watchlist tab).
            </p>
          }
        >
          {canWatch ? (
            <WatchToggle playerId={playerId} name={name} initial={watching} />
          ) : (
            <button type="button" className="ca-btn is-icon is-off" disabled title="Only a team owner keeps a watchlist.">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="ca-ico is-faint" src="/brand/watchlist-off.webp" width="30" height="30" alt="" />
            </button>
          )}
        </Cell>
        <Cell
          label="Trade"
          about={
            <p>
              Opens a trade with his owner, with him already added. The icon is his trade block status: faint, not
              on the block; red arrow, other owners are interested; green arrow, on the block; both arrows, on the
              block with interest.
            </p>
          }
        >
          {tradeHref ? (
            <a className="ca-btn is-icon" href={tradeHref} aria-label={'Trade. He is ' + tradeWords(tradeIcon) + '.'}>
              <TradeImg state={tradeIcon} />
            </a>
          ) : (
            <button type="button" className="ca-btn is-icon is-off" disabled title="He is not on a roster, so there is no one to trade with.">
              <TradeImg state="none" />
            </button>
          )}
        </Cell>
        <Cell
          label="Poach"
          about={
            <p>
              Opens a bid on him at his poach floor. It is available only when you can bid on him right now.
              Otherwise it is greyed.
            </p>
          }
        >
          {poachHref ? (
            <a className="ca-btn" href={poachHref}>
              Poach
            </a>
          ) : (
            <button type="button" className="ca-btn is-off" disabled>
              Poach
            </button>
          )}
        </Cell>
        <Cell
          label="Claim"
          about={
            <p>
              Opens a waiver claim on him. It is available only while he is on waivers. If you win, you take on his
              salary from the waive onward, and his signing bonus stays with the team that waived him.
            </p>
          }
        >
          {claimHref ? (
            <a className="ca-btn" href={claimHref}>
              Claim
            </a>
          ) : (
            <button type="button" className="ca-btn is-off" disabled>
              Claim
            </button>
          )}
        </Cell>
      </div>
      {error ? <p className="form-error">The buttons&rsquo; states could not be read: {error}. They are greyed until they can.</p> : null}
    </>
  );
}
