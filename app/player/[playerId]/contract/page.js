import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../../lib/getCurrentTeamOwner';
import { loadPlayerCard } from '../loadCard';
import ContractDetails from './ContractDetails';

export const revalidate = 0;

// FULL CONTRACT DETAILS -- UI test batch 6, November 2026.
//
// Lewis, November 10, 2026: today's extra Contract detail -- the Cap / Cash /
// Visual breakdowns, the contract history, season-by-season earnings and the
// value-chart history -- lives behind a "Full contract details" link in the
// card's Contract box; the card itself stays as drawn. This page is that
// link: everything the old Contract tab showed, UNCHANGED (ContractTab,
// EarningsTab and MarketValueTab are not edited), with a way back to the card.
//
// Same gate as the card (middleware.js closes the path; this page re-checks),
// and the same reads (../loadCard.js) without the season ones it does not use.

export default async function PlayerContractPage({ params }) {
  const { playerId } = params;

  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/player/' + playerId + '/contract');

  const card = await loadPlayerCard(playerId, { season: false });
  const header = card.header;

  if (!header) {
    return (
      <main className="page page-narrow">
        <p className="eyebrow">{card.leagueName}</p>
        <h1>Player Not Found</h1>
        <p className="subhead">
          No player exists with this id. <a href="/cap-sheet">&larr; Cap Sheet</a>{' '}
          &middot; <a href="/league">League</a>
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <ContractDetails
        leagueName={card.leagueName}
        currentSeasonYear={card.currentSeasonYear}
        header={header}
        contracts={card.contracts}
        years={card.years}
        livePreview={card.livePreview}
        earnings={card.earnings}
        valueHistory={card.valueHistory}
        capSettings={card.capSettings}
      />
    </main>
  );
}
