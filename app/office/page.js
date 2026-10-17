import { redirect } from 'next/navigation';
import { getCurrentViewer, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';
import { siteIndex } from '../../lib/siteIndex';
import Breadcrumbs from '../../components/Breadcrumbs';
import CommishPill from '../../components/CommishPill';
import { HubTiles } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'League Office' };

/**
 * LEAGUE OFFICE -- October 17, 2026 (UI test batch 1).
 *
 * The fourth office of Lewis's sketch: a grid of tiles for everything that is
 * the league's rather than one team's. The seventeen tiles are the sketch's,
 * in its order, as the "A · League Office" board on the canvas drew them
 * (Lewis, October 12: "I prefer this version"). Twelve open pages the app
 * has; five name pages it does not (League Dues, Playoff Preview, Rule Change
 * Proposals, EDFL Hall of Fame, App Feedback) and are placeholders.
 *
 * TWO THINGS THE SKETCH DID NOT PLACE live here until Lewis says where:
 *   the Commissioner Portal pill, for an officer only (the only door to
 *   /admin, out of the bar on his instruction); and "Every page", the index
 *   the MENU drawer used to carry (lib/siteIndex.js), so no route lost its
 *   door when the hamburger went.
 *
 * Owner Contacts is the owner directory, which lives on Team HQ's Overview
 * (the only place an owner edits his own card); League Schedule is the
 * Scoreboard's week list. Both are links, not copies.
 */
export default async function LeagueOfficePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/office');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;
  const isOfficer = isCommissionerOrCo(viewer.owner);

  const tiles = [
    { href: '/calendar', label: 'Calendar' },
    { href: '/values', label: 'Player Value Chart' },
    { href: '/library/rule-book', label: 'League Rule Book' },
    { href: '/library/how-to', label: 'App User Guide' },
    { href: '/library/technical-manual', label: 'App Technical Manual' },
    { href: '/injury-report', label: 'Injury Report' },
    { href: '/league-finances', label: 'League Financials' },
    { label: 'League Dues', note: 'Coming soon' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/actions', label: 'Commish Action Log' },
    { href: teamId ? '/team/' + teamId : '/league', label: 'Owner Contacts', note: teamId ? 'The directory on your Team HQ' : undefined },
    { href: '/scoreboard', label: 'League Schedule' },
    { label: 'Playoff Preview', note: 'Coming soon' },
    { label: 'Rule Change Proposals', note: 'Coming soon' },
    { label: 'EDFL Hall of Fame', note: 'Coming soon' },
    { label: 'App Feedback', note: 'Coming soon · feedback on a manual is on its Library page' },
    { href: '/install', label: 'Add EDFL to your phone' },
  ];

  const groups = siteIndex(teamId);

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'League Office' }]} />
      <p className="eyebrow">Office</p>
      <h1>League Office</h1>
      <p className="subhead">The league&rsquo;s pages, records and documents.</p>

      {isOfficer ? (
        <div className="edfl-officer-door">
          <CommishPill />
          <span className="empty-note">Officers only. Everything an officer does lives behind it.</span>
        </div>
      ) : null}

      <HubTiles tiles={tiles} columns={3} />

      <h2 className="section-heading" style={{ marginTop: 28 }}>
        Every page
      </h2>
      <p className="empty-note">The full index, in case something above is not where you expected it.</p>
      <div className="edfl-index">
        {groups.map(function (g) {
          return (
            <div className="edfl-index-group" key={g.title}>
              <h3 className="edfl-index-title">{g.title}</h3>
              <ul className="edfl-index-list">
                {g.links.map(function (l) {
                  return (
                    <li key={g.title + l.href + l.label}>
                      <a href={l.href}>{l.label}</a>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </main>
  );
}
