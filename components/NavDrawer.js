'use client';

import { useState } from 'react';

/**
 * NAV DRAWER -- the five doors, and the end of the wall of buttons.
 *
 * Before this, every route in the app was reached from a home page that drew
 * the commissioner 43 buttons and an owner about 30, all in the same style,
 * and nearly everything routed back through it. The groups below are the
 * redesign brief's §3.2, which places all 45 routes.
 *
 * WHAT IS AND IS NOT HERE:
 *   - /admin is NOT in this drawer. The portal has its own door in the bar --
 *     the pill -- which owners never see at all. Putting it here would draw a
 *     group that nine of ten owners cannot open.
 *   - /bids is not in the menu while the auction is dormant (FA-19). The route
 *     still works and every existing link to it still resolves; it simply does
 *     not take a line in a menu that has to fit on a phone.
 *   - Player Search is the bar's search control, not a menu line.
 *
 * PLAIN <a>, NOT next/link. The app bar is rendered by the root layout on
 * every route and these destinations are server-rendered pages with revalidate
 * = 0; a client-side transition buys nothing here and next/link inside a
 * client component mounted by a server layout is the shape that caused the
 * breadcrumbs component to be rewritten in September.
 *
 * The drawer takes no server data on purpose: it is a static list, so it can
 * be a client component without dragging a query into every page load.
 */

const GROUPS = [
  {
    title: 'MY TEAM',
    links: [
      { href: '/cash', label: 'Cash account' },
      { href: '/restructure', label: 'Restructure a contract' },
      { href: '/fifth-year-option', label: 'Fifth Year Option' },
      { href: '/trades/new', label: 'Propose a trade' },
    ],
  },
  {
    title: 'LEAGUE',
    links: [
      { href: '/cap-sheet', label: 'Cap Sheet' },
      { href: '/standings', label: 'Standings' },
      { href: '/scoreboard', label: 'Scoreboard' },
      { href: '/calendar', label: 'Calendar' },
      { href: '/league-finances', label: 'League Finances' },
      { href: '/draft-picks', label: 'Draft Picks' },
      { href: '/injury-report', label: 'Injury Report' },
      { href: '/transactions', label: 'Transactions' },
      { href: '/actions', label: 'Action Log' },
    ],
  },
  {
    title: 'PLAYERS',
    links: [
      { href: '/search', label: 'Player Search' },
      { href: '/values', label: 'Player Value Chart' },
      { href: '/stats', label: 'Statistics' },
      { href: '/free-agency', label: 'Free Agency' },
      { href: '/waivers', label: 'Waiver Wire' },
    ],
  },
  {
    title: 'TRADES',
    links: [
      { href: '/trades', label: 'All trades' },
      { href: '/trades/new', label: 'Propose a trade' },
    ],
  },
];

export default function NavDrawer() {
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="edfl-iconbtn"
        aria-label="Open the menu"
        aria-expanded={open}
        onClick={function () {
          setOpen(true);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h14M3 10h14M3 14h14" />
        </svg>
      </button>

      {open ? (
        <>
          {/* A real button, so Escape and Tab reach it and a screen reader can
              say what it does. A div with onClick would be invisible to both. */}
          <button type="button" className="drawer-scrim" aria-label="Close the menu" onClick={close} />

          <nav className="drawer-panel" aria-label="Main menu">
            <div className="drawer-head">
              <span className="drawer-group-title" style={{ padding: 0 }}>
                MENU
              </span>
              <button type="button" className="edfl-iconbtn" aria-label="Close the menu" onClick={close}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {GROUPS.map(function (g) {
              return (
                <div className="drawer-group" key={g.title}>
                  <span className="drawer-group-title">{g.title}</span>
                  {g.links.map(function (l) {
                    return (
                      <a className="drawer-link" href={l.href} key={g.title + l.href + l.label} onClick={close}>
                        {l.label}
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </>
      ) : null}
    </>
  );
}
