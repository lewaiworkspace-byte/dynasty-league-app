import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import { HubTiles } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'GM’s Office' };

/**
 * GM'S OFFICE -- October 17, 2026 (UI test batch 1).
 *
 * The first of the four offices at the foot of Lewis's sketch (October 12):
 * everything a general manager does to his own roster. The sketch draws it as
 * the roster with five actions per player -- Restructure, Extend, Cut, Move,
 * Trade Block -- and a Watch List. Today's app has three of those actions:
 * Move and Cut are the buttons on the Roster tab, and Restructure is its own
 * page. Extend, Trade block and the Watch list do not exist yet and are drawn
 * as placeholders (Lewis, October 17: keep them as placeholders). A player's
 * card now has an ACTIONS tab (own players only) that gathers the same five;
 * the ••• on each roster row opens it.
 *
 * A HUB, NOT A SECOND ROSTER. The roster table and its dialogs stay on Team
 * HQ, which is where every rule about them lives (team-hq.md); this page
 * links there rather than mounting a copy.
 *
 * Gate: login only, like the drawer lines it replaces. A login with no team
 * sees the league-wide pages and an explanation; the observer the same.
 */
export default async function GmOfficePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/gm');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const tiles = [];
  if (teamId) {
    tiles.push({ href: '/team/' + teamId + '?tab=roster', label: 'Your roster', note: 'Move and Cut; ••• opens a player’s actions' });
    tiles.push({ href: '/restructure', label: 'Restructure a contract', note: 'Turn salary into signing bonus' });
    tiles.push({ href: '/trades/new', label: 'Propose a trade' });
  }
  tiles.push({ href: '/trades', label: 'All trades' });
  tiles.push({ href: '/free-agency', label: 'Free agency', note: 'Open windows and the pool' });
  tiles.push({ href: '/poaching', label: 'Poaching' });
  tiles.push({ href: '/waivers', label: 'Waiver wire' });
  tiles.push({ label: 'Extend a contract', note: 'Coming soon · contract extensions are not built yet' });
  tiles.push({ label: 'Trade block', note: 'Coming soon · tell the league a player is available' });
  tiles.push({ label: 'Watch list', note: 'Coming soon · players you are tracking on other teams' });

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'GM’s Office' }]} />
      <p className="eyebrow">Office</p>
      <h1>GM&rsquo;s Office</h1>
      <p className="subhead">
        Your roster and what you can do with it. Moves and cuts are on the Roster tab; tap the
        ••• on any of your players for his actions.
      </p>
      {!teamId ? (
        <p className="empty-note">Your login is not linked to a team, so the roster actions are not drawn.</p>
      ) : null}
      <HubTiles tiles={tiles} />
    </main>
  );
}
