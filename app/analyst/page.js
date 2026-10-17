import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import { HubTiles, ComingSoon } from '../../components/HubTiles';

export const revalidate = 0;
export const metadata = { title: 'Analyst’s Office' };

/**
 * ANALYST'S OFFICE -- October 17, 2026 (UI test batch 1).
 *
 * "In progress" in Lewis's sketch (October 12): the office exists in the
 * frame and nothing is designed for it yet. Drawn as a placeholder that says
 * so, with the app's existing analysis pages beneath it so the button is not
 * a dead end. What finally lives here is Lewis's call.
 */
export default async function AnalystOfficePage() {
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/analyst');

  const tiles = [
    { href: '/stats', label: 'Statistics', note: 'Fantasy scoring, every player' },
    { href: '/values', label: 'Player Value Chart' },
    { href: '/prospects', label: 'Draft Prospects' },
    { href: '/draft-picks', label: 'Draft Picks' },
    { href: '/data', label: 'Data Center', note: 'Downloads and the Claude connector' },
  ];

  return (
    <main className="page">
      <Breadcrumbs trail={[{ label: 'Analyst’s Office' }]} />
      <p className="eyebrow">Office</p>
      <h1>Analyst&rsquo;s Office</h1>
      <ComingSoon title="This office is still being designed.">
        It is in the frame so the layout can be reviewed. Until it is designed, the league&rsquo;s
        numbers pages are here.
      </ComingSoon>
      <HubTiles tiles={tiles} />
    </main>
  );
}
