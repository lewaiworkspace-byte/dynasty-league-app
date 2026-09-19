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
 * FROM PHASE 2C THIS IS THE ONLY INDEX. R-8 redirects `/` to the owner's own
 * Team HQ, so the page that used to list everything no longer exists. Anything
 * missing from this drawer is now genuinely hard to find -- check it against
 * the routes list before removing a line.
 *
 * WHAT IS AND IS NOT HERE:
 *   - /admin is NOT in this drawer. The portal has its own door in the bar --
 *     the pill -- which owners never see at all. Putting it here would draw a
 *     group that nine of ten owners cannot open.
 *   - /bids is not in the menu while the auction is dormant (FA-19). The route
 *     still works and every existing link to it still resolves; it simply does
 *     not take a line in a menu that has to fit on a phone. It is now the ONE
 *     route with no drawn door anywhere, which is worth knowing when the
 *     auction wakes up.
 *   - Player Search is the bar's search control, and is also a line under
 *     PLAYERS because the drawer is now the index.
 *   - Team HQ is drawn only when the viewer's login is linked to a team.
 *     getCurrentTeamOwner() returns null for a real login with no team_owners
 *     row -- a state the bar has rendered deliberately since September 7 -- and
 *     /team/null is a 404.
 *
 * PLAIN <a>, NOT next/link. The app bar is rendered by the root layout on
 * every route and these destinations are server-rendered pages with revalidate
 * = 0; a client-side transition buys nothing here and next/link inside a
 * client component mounted by a server layout is the shape that caused the
 * breadcrumbs component to be rewritten in September.
 *
 * The drawer still takes no server QUERY -- teamId arrives as a prop from the
 * app bar, which had already read that row for the avatar. No page load gains
 * a round trip.
 */

function groupsFor(teamId) {
  const myTeam = [];
  if (teamId) {
    myTeam.push({ href: '/team/' + teamId, label: 'Team HQ' });
  }
  myTeam.push({ href: '/cash', label: 'Cash account' });
  myTeam.push({ href: '/restructure', label: 'Restructure a contract' });
  myTeam.push({ href: '/fifth-year-option', label: 'Fifth Year Option' });
  myTeam.push({ href: '/trades/new', label: 'Propose a trade' });

  return [
    { title: 'MY TEAM', links: myTeam },
    {
      title: 'LEAGUE',
      links: [
        // First, because it is what `/` now means for anyone whose login is not
        // linked to a team, and because it is the shortest answer to "what
        // happened this week".
        { href: '/league', label: 'League' },
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
        // 2D-3: poaching became its own route. This drawer is the app's only
        // index, so a route without a line here is genuinely hard to find --
        // /free-agency also carries a tile to it, but the drawer is the door.
        { href: '/poaching', label: 'Poaching' },
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
}

export default function NavDrawer(props) {
  const [open, setOpen] = useState(false);
  const groups = groupsFor(props && props.teamId ? props.teamId : null);

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

            {groups.map(function (g) {
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
