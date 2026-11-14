import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../lib/getCurrentTeamOwner';
import PlayerCard from './PlayerCard';
import { loadPlayerCard } from './loadCard';

export const revalidate = 0;

// The Player Card. One page per player.
//
// UI TEST BATCH 6 (November 2026): ONE PAGE, NO TABS. Lewis's pick on the
// Claude Design canvas "EDFL Player Card (test site)" (Option C with Option
// B's "Contract, year by year"), read back and approved November 10, 2026.
// The card is a header (photo, name, start rate) and six boxes in this order
// -- Actions, This season, Contract, Value, Stats, History -- with jump
// buttons. Everything the old Contract tab carried beyond the year-by-year
// box (the Cap / Cash / Visual breakdowns, contract history, season-by-season
// earnings, value-chart history) is unchanged on ./contract, behind "Full
// contract details". PlayerCard.js says where each old block went.
//
// The reads live in ./loadCard.js, shared with ./contract so the two pages
// cannot disagree about a contract (SR-62).

export default async function PlayerPage({ params, searchParams }) {
  const { playerId } = params;
  // ?tab=actions -- how the ••• on a roster row lands on the card's Actions
  // box (October 17, 2026). Validated in PlayerCard: only the owner's own
  // player has an Actions box to land on.
  const sp = searchParams || {};
  const initialTab = typeof sp.tab === 'string' ? sp.tab : null;

  // READ-ONLY OBSERVER (October 6, 2026): a registered observer login may read this
  // page as well as an owner. getCurrentViewer() in lib/getCurrentTeamOwner.js says why
  // the gate, and only the gate, widens; every write on the page still refuses it.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/player/' + playerId);

  const card = await loadPlayerCard(playerId, { season: true });
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
    <main className="page edfl-pc-page">
      <PlayerCard
        leagueName={card.leagueName}
        currentSeasonYear={card.currentSeasonYear}
        header={header}
        contracts={card.contracts}
        years={card.years}
        livePreview={card.livePreview}
        earnings={card.earnings}
        feed={card.feed}
        valueHistory={card.valueHistory}
        capSettings={card.capSettings}
        taxiStatus={card.taxiStatus}
        waiver={card.waiver}
        waiverError={card.waiverError}
        summary={card.summary}
        weeks={card.weeks}
        seasonError={card.seasonError}
        weeklyLine={card.weeklyLine}
        weeklyError={card.weeklyError}
        isMine={Boolean(
          viewer.owner && viewer.owner.team_id && header.current_team_id && viewer.owner.team_id === header.current_team_id
        )}
        initialTab={initialTab}
      />
    </main>
  );
}
