import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import { HubTiles } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'Owner’s Office' };

/**
 * OWNER'S OFFICE -- October 17, 2026 (UI test batch 1).
 *
 * The money office of Lewis's sketch: the five-season cap and cash table
 * (today's Money tab on Team HQ), the cash account, the Fifth Year Option,
 * and two things the sketch names that the app does not have -- a FINES band
 * and a REVENUE ESTIMATE ("to be built") -- drawn as placeholders. Fines today
 * are lines in the cash account's history, which the Cash account tile opens.
 *
 * A hub: every figure stays on the page that computes it in the database.
 * Gate: login only. A login with no team sees the league-wide money pages.
 */
export default async function OwnerOfficePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/owner');

  const teamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const tiles = [];
  if (teamId) {
    tiles.push({ href: '/team/' + teamId + '?tab=money', label: 'Money', note: 'Cap and cash, five seasons' });
    tiles.push({ href: '/cash', label: 'Cash account', note: 'Adjustments and history' });
    tiles.push({ href: '/fifth-year-option', label: 'Fifth Year Option' });
  }
  tiles.push({ href: '/cap-sheet', label: 'Cap Sheet', note: 'All ten teams' });
  tiles.push({ href: '/league-finances', label: 'League Finances' });
  tiles.push({ label: 'Fines', note: 'Coming soon · your fines this season in one place (they are in your cash history today)' });
  tiles.push({ label: 'Revenue estimate', note: 'To be built' });

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Owner’s Office' }]} />
      <p className="eyebrow">Office</p>
      <h1>Owner&rsquo;s Office</h1>
      <p className="subhead">Your cap, your cash and what the league charges you.</p>
      {!teamId ? (
        <p className="empty-note">Your login is not linked to a team, so your own money pages are not drawn.</p>
      ) : null}
      <HubTiles tiles={tiles} />
    </main>
  );
}
