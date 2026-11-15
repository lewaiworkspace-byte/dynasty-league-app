import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import { HubTiles } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'Owner’s Suite' };

/**
 * OWNER'S SUITE -- UI test batch 24, November 15, 2026 (Owner's Office since
 * UI test batch 1, October 17, 2026).
 *
 * Lewis (Book design session, 14:53 ET): everything in GM's Office moves into
 * Owner's Office, which is renamed Owner's Suite, and The Book takes GM's
 * Office's place in the office row. So this hub now holds both: first what a
 * general manager does to his roster (GM's Office's tiles, in their order:
 * Players, Your roster, Restructure, Find a trade, All trades, Free agency,
 * Poaching, Waiver wire, and the Extend a contract and Trade block placeholders),
 * then the money (the five-season cap and cash table, the cash account, the Fifth
 * Year Option, the league's money pages, and the Fines and Revenue estimate
 * placeholders). /gm redirects here.
 *
 * A HUB, NOT A SECOND ROSTER OR CAP SHEET. Every figure stays on the page that
 * computes it in the database, and the roster table and its dialogs stay on Team
 * HQ (team-hq.md); this page links there.
 *
 * Gate: login only. A login with no team sees the league-wide pages and an
 * explanation; the observer the same.
 */
export default async function OwnerSuitePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/owner');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const roster = [];
  roster.push({ href: '/players', label: 'Players', note: 'Free agents, waivers, poachable and every player' });
  if (teamId) {
    roster.push({ href: '/team/' + teamId + '?tab=roster', label: 'Your roster', note: 'Move and Cut; ••• opens a player’s actions' });
    roster.push({ href: '/restructure', label: 'Restructure a contract', note: 'Turn salary into signing bonus' });
    roster.push({ href: '/trades/new', label: 'Find a trade', note: 'Your needs, every team’s players, and the trade builder' });
  }
  roster.push({ href: '/trades', label: 'All trades' });
  roster.push({ href: '/free-agency', label: 'Free agency', note: 'Open windows and the pool' });
  roster.push({ href: '/poaching', label: 'Poaching' });
  roster.push({ href: '/waivers', label: 'Waiver wire' });
  roster.push({ label: 'Extend a contract', note: 'Coming soon · contract extensions are not built yet' });
  roster.push({ label: 'Trade block', note: 'Coming soon · tell the league a player is available' });

  const money = [];
  if (teamId) {
    money.push({ href: '/team/' + teamId + '?tab=money', label: 'Money', note: 'Cap and cash, five seasons' });
    money.push({ href: '/cash', label: 'Cash account', note: 'Adjustments and history' });
    money.push({ href: '/fifth-year-option', label: 'Fifth Year Option' });
  }
  money.push({ href: '/cap-sheet', label: 'Salary Cap', note: 'Every team' });
  money.push({ href: '/league-finances', label: 'League Finances' });
  money.push({ label: 'Fines', note: 'Coming soon · your fines this season in one place (they are in your cash history today)' });
  money.push({ label: 'Revenue estimate', note: 'To be built' });

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Owner’s Suite' }]} />
      <p className="eyebrow">Office</p>
      <h1>Owner&rsquo;s Suite</h1>
      <p className="subhead">
        Your roster, your cap and your cash. Moves and cuts are on the Roster tab; tap the ••• on any of your players
        for his actions.
      </p>
      {!teamId ? (
        <p className="empty-note">Your login is not linked to a team, so your own roster and money pages are not drawn.</p>
      ) : null}
      <h2 className="section-heading">Roster and players</h2>
      <HubTiles tiles={roster} />
      <h2 className="section-heading" style={{ marginTop: 28 }}>Money</h2>
      <HubTiles tiles={money} />
    </main>
  );
}
