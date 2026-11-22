import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../lib/getCurrentTeamOwner';
import PlayerCard from './PlayerCard';
import { loadPlayerCard } from './loadCard';
import { loadCardActions } from './loadActions';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';

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
          No player exists with this id. <a href="/cap-sheet">&larr; Salary Cap</a>{' '}
          &middot; <a href="/league">League</a>
        </p>
      </main>
    );
  }

  const isMine = Boolean(
    viewer.owner && viewer.owner.team_id && header.current_team_id && viewer.owner.team_id === header.current_team_id
  );

  // UI test batch 32 (Nov 21): the Actions box's states and, for another
  // owner's player, his team's abbreviation for the logo. Database columns
  // only; see loadActions.js. A failed read greys the buttons and says why.
  const supabase = await createSupabaseServerClient();
  // UI test batch 34 (Nov 21): the Active / IR / PS control under the header on
  // the owner's own player, as on the Mini card (RosterSpot.js): where he can go
  // (edfl_roster_spot_options, the engine's dry run) and the practice squad
  // designations' state (taxi_eligibility_status). Not read while he is on
  // waivers, when he holds no roster spot.
  const wantSpot = Boolean(isMine && header.current_contract_id && !card.waiver);
  // UI test batch 37 (Nov 22): the Contract box's "Amount saved" table
  // (edfl_player_amount_saved, test database only; AmountSaved.js says why).
  const [actions, holderRes, spotRes, spotTaxiRes, savedRes] = await Promise.all([
    loadCardActions(supabase, {
      playerId: playerId,
      season: card.currentSeasonYear,
      holderTeamId: header.current_team_id,
      isMine: isMine,
      hasTeam: Boolean(viewer.owner && viewer.owner.team_id),
    }),
    header.current_team_id
      ? supabase.from('teams').select('abbrev').eq('id', header.current_team_id).maybeSingle()
      : Promise.resolve({ data: null }),
    wantSpot
      ? supabase.rpc('edfl_roster_spot_options', { p_contract_id: header.current_contract_id })
      : Promise.resolve({ data: null, error: null }),
    wantSpot
      ? supabase
          .from('taxi_eligibility_status')
          .select('weeks_used, weeks_max, warning, locked, last_demotion_available, eligibility_spent, held, hold_note, poach_exempt, elevated')
          .eq('contract_id', header.current_contract_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    header.current_contract_id
      ? supabase.rpc('edfl_player_amount_saved', { p_contract_id: header.current_contract_id })
      : Promise.resolve({ data: null, error: null }),
  ]);

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
        valueBox={card.valueBox}
        valueSeries={card.valueSeries}
        valueBoxError={card.valueBoxError}
        actions={actions}
        canWatch={Boolean(viewer.owner && viewer.owner.team_id)}
        holderAbbrev={holderRes && holderRes.data ? holderRes.data.abbrev : null}
        spotOptions={spotRes.data || null}
        spotOptionsError={spotRes.error ? spotRes.error.message : null}
        spotTaxi={spotTaxiRes.data || null}
        amountSaved={savedRes.data || null}
        amountSavedError={savedRes.error ? savedRes.error.message : null}
        isMine={isMine}
        initialTab={initialTab}
      />
    </main>
  );
}
