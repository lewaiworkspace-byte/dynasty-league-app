import { redirect } from 'next/navigation';
import { getCurrentViewer, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';
import { siteIndex } from '../../lib/siteIndex';
import Breadcrumbs from '../../components/Breadcrumbs';
import { HubTiles } from '../../components/HubTiles';
import CommishPill from '../../components/CommishPill';

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
 * ONE THING THE SKETCH DID NOT PLACE lives here until Lewis says where:
 *   "Every page", the index the MENU drawer used to carry (lib/siteIndex.js),
 *   so no route lost its door when the hamburger went.
 *
 * THE COMMISSIONER PORTAL IS BACK HERE, AND ONLY HERE (UI test batch 17,
 * November 15, 2026). Lewis: "commissioner access will move to the League
 * Office tab for those that have Commissioner/Co-Commissioner access". It
 * left the top bar (components/AppBar.js); for an officer
 * (isCommissionerOrCo) this page draws components/CommishPill.js above the
 * tiles, with its three states and count. Presentation, not access control:
 * every /admin page and action re-checks.
 *
 * THE DRAFT BOARD TILE (UI test batch 18, November 15, 2026; Lewis: "Create a
 * League Draft Board page under League Office") opens /draft-picks, the draft
 * board. It joins the sketch's tiles after Transactions.
 *
 * STATISTICS (UI test batch 38, November 22, 2026). Analyst's Office lost its
 * door with the office row, and Lewis's page-map ruling (November 21) puts
 * Statistics and the Player Value Chart under League Office; the Value Chart
 * tile was already here, so Statistics joins it.
 *
 * Owner Contacts is the owner directory, /office/owners (UI test batch 7,
 * November 11, 2026: it left Team HQ's Overview for League Office; an owner
 * edits his own card in Settings). League Schedule is the Scoreboard's week
 * list, a link, not a copy.
 */
export default async function LeagueOfficePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/office');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const tiles = [
    { href: '/calendar', label: 'Calendar' },
    { href: '/values', label: 'Player Value Chart' },
    { href: '/stats', label: 'Statistics', note: 'Fantasy scoring, every player' },
    { href: '/library/rule-book', label: 'League Rule Book' },
    { href: '/library/how-to', label: 'App User Guide' },
    { href: '/library/technical-manual', label: 'App Technical Manual' },
    { href: '/injury-report', label: 'Injury Report' },
    { href: '/league-finances', label: 'League Financials' },
    { label: 'League Dues', note: 'Coming soon' },
    { href: '/transactions', label: 'Transactions' },
    { href: '/draft-picks', label: 'Draft Board' },
    { href: '/actions', label: 'Commish Action Log' },
    { href: '/office/owners', label: 'Owner Contacts' },
    { href: '/matchups', label: 'League Schedule' },
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

      {isCommissionerOrCo(viewer.owner) ? (
        <div className="edfl-office-portal">
          <CommishPill />
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
