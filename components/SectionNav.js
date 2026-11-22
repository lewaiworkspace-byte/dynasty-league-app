'use client';

import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import TeamDisc from './TeamDisc';

/**
 * THE TOP BAR'S DOORS -- UI test batch 38, November 22, 2026.
 *
 * Lewis's canvas "EDFL compact top bar options", page "Round 2", option F
 * (boards R2-F-*), as he directed it on November 21 and 22: every tab at the
 * top, no row at the foot, and the bar no taller than the old one. One black
 * row of 60px:
 *
 *   [league logo]  Players · Team · League · Matchups · EDFL Bets  [team logo]
 *
 *   League logo   League Office (/office). The EDFL round logo
 *                 (public/brand/edfl-logo.webp). It took the place of the
 *                 office row's League Office button.
 *   Players       My roster (/team/<own>?tab=roster; /players for a login with
 *                 no team). Lit on My roster, /players, /watchlist, /search and
 *                 /prospects (UI test batch 33's one Players tab, and the
 *                 page-map ruling of November 21: Player Search and Draft
 *                 Prospects go under Players).
 *   Team          /owner, the team hub (Owner's Suite until this batch; Lewis's
 *                 page-map ruling of November 21 sets the tabs as Players, Team,
 *                 League, Matchups, EDFL Bets). Lit on the owner's own Team HQ
 *                 (any tab but Roster), the hub and the pages its tiles open.
 *                 Not drawn for a login with no team.
 *   League        /league, as before.
 *   Matchups      /matchups, as before.
 *   EDFL Bets     /book. "The Book" was renamed EDFL Bets (Lewis, November 21).
 *                 It wears the betting logo in place of a line icon.
 *   Team logo     Settings (/settings). The owner's team logo, a teal ring when
 *                 Settings is open, and a dot for his roster compliance (green
 *                 in, red out, grey when the check failed), read from the one
 *                 my_compliance_alert() call AppBar already makes. A signed-in
 *                 login with no team gets the football-gear Settings mark here.
 *                 Sign out moved onto the Settings page (it was the logo's
 *                 pop-up, components/AccountMenu.js, retired by this batch).
 *
 * The office row (The Book · Owner's Suite · Analyst's Office · League Office,
 * components/OfficeBar.js) is gone. Analyst's Office has no door: Statistics
 * and the Value Chart are League Office's (page-map ruling, November 21), so
 * /analyst, /stats and /values light the league logo; /analyst stays for old
 * links.
 *
 * WHICH DOOR IS LIT is read from the URL, so it is right on a hard reload and
 * after a redirect, and it is a prefix match. A player's card lights nothing.
 * Plain <a>, not next/link (server-rendered pages, revalidate 0), and the
 * pop-up sheet leaves every link in the bar alone (SheetHost.js skips
 * .edfl-topbar).
 *
 * This is presentation. Every destination keeps its own gate; a door that is
 * drawn opens nothing the owner could not already reach.
 */

const PLAYERS_PREFIXES = ['/players', '/watchlist', '/search', '/prospects'];
const TEAM_PREFIXES = [
  '/owner',
  '/gm',
  '/cash',
  '/fifth-year-option',
  '/restructure',
  '/trades',
  '/free-agency',
  '/poaching',
  '/waivers',
  '/bids',
];
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
const BETS_PREFIXES = ['/book'];
const OFFICE_PREFIXES = ['/office', '/library', '/data', '/install', '/admin', '/roster-audit', '/analyst', '/stats', '/values'];
const SETTINGS_PREFIXES = ['/settings', '/notifications'];

function startsWithAny(path, prefixes) {
  for (let i = 0; i < prefixes.length; i++) {
    const p = prefixes[i];
    if (path === p || path.indexOf(p + '/') === 0) return true;
  }
  return false;
}

// Line icons, 22px, drawn in currentColor so the lit colour reaches them.
function Icon(props) {
  return (
    <svg
      className="edfl-mtab-ico"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

const ICONS = {
  players: (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7" />
    </Icon>
  ),
  team: (
    <Icon>
      <path d="M12 3l8 3v6c0 4.6-3.4 7.9-8 9-4.6-1.1-8-4.4-8-9V6z" />
    </Icon>
  ),
  league: (
    <Icon>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4" />
      <path d="M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4" />
      <path d="M8 20h8" />
    </Icon>
  ),
  matchups: (
    <Icon>
      <rect x="3" y="5" width="7" height="14" rx="2" />
      <rect x="14" y="5" width="7" height="14" rx="2" />
      <path d="M12 9v6" />
    </Icon>
  ),
  bets: <img className="edfl-mtab-ico is-round" src="/brand/betting-logo.webp" alt="" width="22" height="22" />,
};

function lit(path, tab, teamId) {
  const ownTeam = Boolean(teamId) && path === '/team/' + teamId;
  return {
    office: startsWithAny(path, OFFICE_PREFIXES),
    players: (ownTeam && tab === 'roster') || startsWithAny(path, PLAYERS_PREFIXES),
    team: (ownTeam && tab !== 'roster') || startsWithAny(path, TEAM_PREFIXES),
    league: startsWithAny(path, LEAGUE_PREFIXES),
    matchups: startsWithAny(path, MATCHUPS_PREFIXES),
    bets: startsWithAny(path, BETS_PREFIXES),
    settings: startsWithAny(path, SETTINGS_PREFIXES),
  };
}

const DOT_LABEL = { good: 'in compliance', bad: 'out of compliance', unknown: 'compliance unknown' };

function Bar(props) {
  const on = props.on;
  const teamId = props.teamId || null;
  const tabs = [{ key: 'players', label: 'Players', href: teamId ? '/team/' + teamId + '?tab=roster' : '/players' }];
  if (teamId) tabs.push({ key: 'team', label: 'Team', href: '/owner' });
  tabs.push({ key: 'league', label: 'League', href: '/league' });
  tabs.push({ key: 'matchups', label: 'Matchups', href: '/matchups' });
  tabs.push({ key: 'bets', label: 'EDFL Bets', href: '/book' });

  const settingsLabel = teamId
    ? 'Settings. ' + (props.teamName || props.abbrev || 'Your team') + ', ' + DOT_LABEL[props.compliance || 'unknown']
    : 'Settings';

  return (
    <>
      <a
        className={'edfl-tb-logo' + (on.office ? ' is-on' : '')}
        href="/office"
        aria-label="League Office"
        aria-current={on.office ? 'page' : undefined}
      >
        <img src="/brand/edfl-logo.webp" alt="" width="40" height="40" />
      </a>

      <nav className="edfl-mtabs" aria-label="Main">
        {tabs.map(function (t) {
          return (
            <a
              key={t.key}
              className={'edfl-mtab' + (on[t.key] ? ' is-on' : '')}
              href={t.href}
              aria-current={on[t.key] ? 'page' : undefined}
            >
              {ICONS[t.key]}
              <span className="edfl-mtab-label">{t.label}</span>
            </a>
          );
        })}
      </nav>

      <a
        className={'edfl-tb-me' + (on.settings ? ' is-on' : '')}
        href="/settings"
        aria-label={settingsLabel}
        title={teamId ? props.teamName || undefined : 'Settings'}
        aria-current={on.settings ? 'page' : undefined}
      >
        {teamId ? (
          <>
            <span className="edfl-tb-ring">
              <TeamDisc className="edfl-acctdisc is-small" abbrev={props.abbrev} fallback={props.teamName} />
            </span>
            <span className={'edfl-tb-dot is-' + (props.compliance || 'unknown')} aria-hidden="true" />
          </>
        ) : (
          <span className="edfl-tb-ring">
            <img className="edfl-tb-gear" src="/brand/settings-football.svg" width="36" height="24" alt="" />
          </span>
        )}
      </a>
    </>
  );
}

function BarLit(props) {
  const path = usePathname() || '';
  const sp = useSearchParams();
  const tab = sp ? sp.get('tab') : null;
  return <Bar {...props} on={lit(path, tab, props.teamId || null)} />;
}

/**
 * The bar's doors for a signed-in login. AppBar (a server component) draws the
 * <header> and hands in the owner's team, his logo's abbrev and his compliance
 * state ('good' | 'bad' | 'unknown'). useSearchParams needs a Suspense
 * boundary above it in the app router; the fallback is the same bar with
 * nothing lit, so nothing moves.
 */
export default function TopBarNav(props) {
  return (
    <Suspense fallback={<Bar {...props} on={{}} />}>
      <BarLit {...props} />
    </Suspense>
  );
}
