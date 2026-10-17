'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * THE SKETCH SHELL'S TWO ROWS -- October 17, 2026 (UI test batch 1).
 *
 * Lewis's sketch (EDFL App Redesign Sketch.pptx, October 12) has one fixed
 * frame on every screen: four VIEW buttons above the page (Roster · Players ·
 * League · Media) and four OFFICE buttons below it (GM's · Owner's · Analyst's
 * · League Office). The page in between is the "preview window". This file
 * draws both rows; AppBar mounts the view row under the compliance pill and
 * OfficeBar mounts the office row fixed to the foot of the screen.
 *
 * WHAT A BUTTON OPENS. Nothing here is a new page for its own sake: a view
 * or office button opens the page that already holds that content, or a new
 * hub page (/gm, /owner, /analyst, /office) that links to the existing pages
 * and names what does not exist yet. The drawer is gone; League Office carries
 * the full index of routes in its place (lib/siteIndex.js).
 *
 *   Roster    /team/<own team>?tab=roster   a login with no team: /cap-sheet
 *   Players   /free-agency                  the open windows and the pool
 *   League    /league                       this week's scores and the table
 *   Media     /team/<own team>?tab=media    drawn only for a linked owner,
 *                                           since Media is the owner's own tab
 *   GM's / Owner's / Analyst's / League Office: the four hubs
 *
 * WHICH BUTTON IS LIT is read from the URL, so it is right on a hard reload
 * and after a redirect, and it is a prefix match: every player page lights
 * Players, every scoreboard week lights League. Plain <a>, not next/link, for
 * the same reason the drawer used them (server-rendered pages, revalidate 0).
 *
 * This is presentation. Every destination keeps its own gate; a button that
 * is drawn opens nothing the owner could not already reach.
 */

const PLAYERS_PREFIXES = ['/free-agency', '/poaching', '/waivers', '/search', '/stats', '/values', '/prospects', '/player', '/bids'];
const LEAGUE_PREFIXES = [
  '/league',
  '/scoreboard',
  '/matchup',
  '/standings',
  '/calendar',
  '/cap-sheet',
  '/league-finances',
  '/draft-picks',
  '/injury-report',
  '/transactions',
  '/actions',
];
const GM_PREFIXES = ['/gm', '/restructure', '/trades'];
const OWNER_PREFIXES = ['/owner', '/cash', '/fifth-year-option'];
const ANALYST_PREFIXES = ['/analyst'];
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
      on: teamId ? onOwnTeam && tab !== 'media' : path === '/cap-sheet',
    },
    { key: 'players', label: 'Players', href: '/free-agency', on: startsWithAny(path, PLAYERS_PREFIXES) },
    { key: 'league', label: 'League', href: '/league', on: startsWithAny(path, LEAGUE_PREFIXES) },
  ];
  if (teamId) {
    items.push({ key: 'media', label: 'Media', href: '/team/' + teamId + '?tab=media', on: onOwnTeam && tab === 'media' });
  }
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
    { key: 'players', label: 'Players', href: '/free-agency', on: false },
    { key: 'league', label: 'League', href: '/league', on: false },
  ];
  if (teamId) items.push({ key: 'media', label: 'Media', href: '/team/' + teamId + '?tab=media', on: false });
  return <Row className="edfl-viewrow" label="Views" items={items} />;
}

export function OfficeRow() {
  const path = usePathname() || '';
  // Nobody is signed in on the login page or the auth callback, and the
  // offices are all gated; drawing four doors that bounce is the failure the
  // September 4 admin-link work was written to stop.
  if (path === '/login' || path.indexOf('/auth/') === 0) return null;
  const items = [
    { key: 'gm', label: 'GM’s Office', href: '/gm', on: startsWithAny(path, GM_PREFIXES) },
    { key: 'owner', label: 'Owner’s Office', href: '/owner', on: startsWithAny(path, OWNER_PREFIXES) },
    { key: 'analyst', label: 'Analyst’s Office', href: '/analyst', on: startsWithAny(path, ANALYST_PREFIXES) },
    { key: 'office', label: 'League Office', href: '/office', on: startsWithAny(path, OFFICE_PREFIXES) },
  ];
  return <Row className="edfl-officerow" label="Offices" items={items} />;
}
