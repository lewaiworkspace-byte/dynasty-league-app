'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * THE SKETCH SHELL'S TWO ROWS -- October 17, 2026 (UI test batch 1).
 *
 * Lewis's sketch (EDFL App Redesign Sketch.pptx, October 12) has one fixed
 * frame on every screen: four VIEW buttons above the page (Roster · Watchlist ·
 * League · Matchups since UI test batch 22; Players until then, and Media until
 * batch 20) and four OFFICE
 * buttons below it (The Book · Owner's Suite · Analyst's · League Office since
 * UI test batch 24; GM's · Owner's until then). The page in between is the
 * "preview window". This file draws both rows; AppBar mounts the view row under the compliance pill and
 * OfficeBar mounts the office row fixed to the foot of the screen.
 *
 * WHAT A BUTTON OPENS. Nothing here is a new page for its own sake: a view
 * or office button opens the page that already holds that content, or a new
 * hub page (/gm, /owner, /analyst, /office) that links to the existing pages
 * and names what does not exist yet. The drawer is gone; League Office carries
 * the full index of routes in its place (lib/siteIndex.js).
 *
 *   Roster    /team/<own team>?tab=roster   a login with no team: /cap-sheet
 *   Watchlist /watchlist                    the owner's watchlist (UI test batch
 *                                           22, November 15, 2026, Lewis's Watchlist
 *                                           canvas: it took Players' place in the
 *                                           row; Players is an Owner's Suite tile)
 *   League    /league                       the league's pages and the table
 *   Matchups  /matchups                     every week's games and box scores
 *                                           (UI test batch 20, November 15,
 *                                           2026: it took Media's place in the
 *                                           row; the Media tab itself and its
 *                                           pages are untouched, and Lewis has
 *                                           not decided where its door goes)
 *   The Book / Owner's Suite / Analyst's / League Office: the office row
 *                                           (UI test batch 24: The Book, /book, took
 *                                           GM's Office's place; GM's Office's
 *                                           tiles moved into Owner's Suite, /owner,
 *                                           and /gm redirects there)
 *
 * WHICH BUTTON IS LIT is read from the URL, so it is right on a hard reload
 * and after a redirect, and it is a prefix match: every week and Matchup page
 * lights Matchups. Since batch 24 the Players list, the three market pages,
 * the trade pages and Restructure light Owner's Suite (they were GM's Office's
 * since batch 22), /book lights The Book, and Statistics, the Value Chart,
 * Draft Prospects and Player Search light Analyst's Office (its tiles); a
 * player's card lights nothing. Plain <a>, not next/link, for
 * the same reason the drawer used them (server-rendered pages, revalidate 0).
 *
 * This is presentation. Every destination keeps its own gate; a button that
 * is drawn opens nothing the owner could not already reach.
 */

const WATCHLIST_PREFIXES = ['/watchlist'];
const LEAGUE_PREFIXES = [
  '/league',
  '/standings',
  '/calendar',
  '/cap-sheet',
  '/league-finances',
  '/draft-picks',
  '/injury-report',
  '/transactions',
  '/actions',
];
const MATCHUPS_PREFIXES = ['/matchups', '/matchup', '/scoreboard'];
// UI test batch 24 (November 15, 2026, Lewis): everything in GM's Office moved
// into Owner's Office, renamed Owner's Suite, so its pages light Owner's Suite
// (/gm itself now redirects to /owner). The Book took GM's Office's place.
const BOOK_PREFIXES = ['/book'];
const OWNER_PREFIXES = [
  '/owner',
  '/cash',
  '/fifth-year-option',
  '/gm',
  '/restructure',
  '/trades',
  '/players',
  '/free-agency',
  '/poaching',
  '/waivers',
  '/bids',
];
const ANALYST_PREFIXES = ['/analyst', '/stats', '/values', '/prospects', '/search'];
const OFFICE_PREFIXES = ['/office', '/library', '/data', '/install', '/admin', '/roster-audit'];

function startsWithAny(path, prefixes) {
  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i];
    if (path === p || path.indexOf(p + '/') === 0) return true;
  }
  return false;
}

function Row(props) {
  return (
    <nav className={props.className} aria-label={props.label}>
      {props.items.map(function (it) {
        return (
          <a
            key={it.key}
            className={'edfl-secbtn' + (it.on ? ' is-on' : '')}
            href={it.href}
            aria-current={it.on ? 'page' : undefined}
          >
            {it.icon ? <img className="edfl-secbtn-ico" src={it.icon} alt="" width="22" height="22" /> : null}
            {it.label}
          </a>
        );
      })}
    </nav>
  );
}

function ViewRowInner(props) {
  const path = usePathname() || '';
  const sp = useSearchParams();
  const tab = sp ? sp.get('tab') : null;
  const teamId = props.teamId || null;
  const onOwnTeam = Boolean(teamId) && path === '/team/' + teamId;

  const items = [
    {
      key: 'roster',
      label: 'Roster',
      href: teamId ? '/team/' + teamId + '?tab=roster' : '/cap-sheet',
      // Lit on the Roster view only (UI test batch 7, November 11, 2026). It
      // used to light on every Team HQ view but Media, Overview included,
      // because the tab row below it named the view; with that row gone the
      // Overview is Home and lights nothing here, and Money (the Owner's
      // Office tile) lights nothing either.
      on: teamId ? onOwnTeam && tab === 'roster' : path === '/cap-sheet',
    },
    { key: 'watchlist', label: 'Watchlist', href: '/watchlist', on: startsWithAny(path, WATCHLIST_PREFIXES) },
    { key: 'league', label: 'League', href: '/league', on: startsWithAny(path, LEAGUE_PREFIXES) },
    { key: 'matchups', label: 'Matchups', href: '/matchups', on: startsWithAny(path, MATCHUPS_PREFIXES) },
  ];
  return <Row className="edfl-viewrow" label="Views" items={items} />;
}

export function ViewRow(props) {
  // useSearchParams needs a Suspense boundary above it in the app router;
  // the fallback is the same row with nothing lit, so nothing moves.
  return (
    <Suspense fallback={<ViewRowFallback teamId={props.teamId} />}>
      <ViewRowInner teamId={props.teamId} />
    </Suspense>
  );
}

function ViewRowFallback(props) {
  const teamId = props.teamId || null;
  const items = [
    { key: 'roster', label: 'Roster', href: teamId ? '/team/' + teamId + '?tab=roster' : '/cap-sheet', on: false },
    { key: 'watchlist', label: 'Watchlist', href: '/watchlist', on: false },
    { key: 'league', label: 'League', href: '/league', on: false },
    { key: 'matchups', label: 'Matchups', href: '/matchups', on: false },
  ];
  return <Row className="edfl-viewrow" label="Views" items={items} />;
}

export function OfficeRow() {
  const path = usePathname() || '';
  // Nobody is signed in on the login page or the auth callback, and the
  // offices are all gated; drawing four doors that bounce is the failure the
  // September 4 admin-link work was written to stop.
  if (path === '/login' || path.indexOf('/auth/') === 0) return null;
  // UI test batch 24 (Lewis, November 15, 2026): The Book · Owner's Suite ·
  // Analyst's Office · League Office. The Book shows the betting logo before its
  // label. While the Book is open nothing in the view row above is lit.
  const items = [
    { key: 'book', label: 'The Book', href: '/book', icon: '/brand/betting-logo.webp', on: startsWithAny(path, BOOK_PREFIXES) },
    { key: 'owner', label: 'Owner’s Suite', href: '/owner', on: startsWithAny(path, OWNER_PREFIXES) },
    { key: 'analyst', label: 'Analyst’s Office', href: '/analyst', on: startsWithAny(path, ANALYST_PREFIXES) },
    { key: 'office', label: 'League Office', href: '/office', on: startsWithAny(path, OFFICE_PREFIXES) },
  ];
  return <Row className="edfl-officerow" label="Offices" items={items} />;
}
