import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import Breadcrumbs from '../../components/Breadcrumbs';
import {
  FinanceTabs,
  SeasonPicker,
  OverviewTab,
  LedgerTab,
  OutlookTab,
  SeasonsTab,
} from './FinancePanels';

export const revalidate = 0;

export const metadata = { title: 'League Finances' };

/**
 * LEAGUE FINANCES -- redrawn November 15, 2026 (UI test batch 27).
 *
 * Lewis: "Revamp the League Finances page for overall Owner Cash. This should
 * include a transactions ledger of all League Funds (dispersed, collected, on
 * hand), 5 year projections and set up to show record and display historical
 * data. The accounts will be reconciled each year at the end of the League
 * Year." He chose Option B of the canvas "EDFL League Finances (Owner Cash) --
 * layout options" (WqY9RDJWktnpcft1tQAtr8): four tabs, Overview, Ledger,
 * Outlook and Seasons, and asked for the team accounts table at the foot of
 * the Outlook tab. league-finances.md carries the decisions that protect this
 * folder.
 *
 * SIGNED-IN OWNERS ONLY, ALL TEAMS ITEMISED (rulings PF-1 / PF-3, September 16
 * 2026, widened to the whole Owner Cash ledger by the approved design). Every
 * read is one of the six league_finance_* views, granted to authenticated only
 * and read through the SESSION client: through the anon client they refuse.
 * An observer login reads as well as an owner; nothing here writes.
 *
 * NOTHING IS ADDED UP HERE (SR-23). Every total, share, bar width, shade and
 * sentence comes from the views. The page picks rows, groups ledger rows under
 * their month and draws them.
 *
 * HOW EACH READ FAILS. The season row is the page: without it, an error and
 * nothing else. Each tab's own read fails on its own with a line saying what
 * is missing; a failed read never draws as an empty ledger or a $0 account.
 */

const TABS = ['overview', 'ledger', 'outlook', 'seasons'];
const FILTERS = ['all', 'collected', 'dispersed', 'reversed'];

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LeagueFinancesPage({ searchParams }) {
  // READ-ONLY OBSERVER (October 6, 2026): an observer login may read this
  // page as well as an owner. getCurrentViewer() is the gate; nothing here writes.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/league-finances');
  const myTeamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const sp = searchParams || {};
  const tabParam = String(one(sp.tab) || '');
  const tab = TABS.indexOf(tabParam) >= 0 ? tabParam : 'overview';
  const filterParam = String(one(sp.f) || '');
  const filter = FILTERS.indexOf(filterParam) >= 0 ? filterParam : 'all';
  const teamParam = String(one(sp.team) || '').toUpperCase();

  const sb = await createSupabaseServerClient();

  const [{ data: config }, seasonsRes, teamsRes] = await Promise.all([
    supabase.from('league_config').select('current_season_year').eq('id', true).single(),
    sb.from('league_finance_season').select('*').order('season_year', { ascending: true }),
    supabase.from('teams').select('id, abbrev, name').order('abbrev', { ascending: true }),
  ]);

  const seasons = seasonsRes.data || [];
  const current = config && config.current_season_year ? config.current_season_year : null;
  const seasonParam = parseInt(String(one(sp.season) || ''), 10);
  let row = seasons.find(function (s) {
    return s.season_year === seasonParam;
  });
  if (!row) {
    row =
      seasons.find(function (s) {
        return s.season_year === current;
      }) || seasons[seasons.length - 1];
  }

  const crumbs = (
    <Breadcrumbs trail={[{ label: 'League Office', href: '/office' }, { label: 'League Finances' }]} />
  );

  if (seasonsRes.error || !row) {
    return (
      <main className="page lf-page">
        {crumbs}
        <h1 className="it-visually-hidden">League Finances</h1>
        <p className="form-error">
          {seasonsRes.error
            ? "Couldn't load the league's Owner Cash accounts: " + seasonsRes.error.message + '.'
            : 'No season has Owner Cash accounts yet.'}{' '}
          Nothing on this page is answering the question &mdash; do not read it as an empty ledger.
        </p>
      </main>
    );
  }

  const season = row.season_year;
  const teams = (teamsRes.data || []).filter(function (t) {
    return t.abbrev;
  });
  const pickedTeam = teams.find(function (t) {
    return t.abbrev === teamParam;
  });

  // Each tab reads only what it draws.
  let body = null;
  if (tab === 'overview') {
    const acctRes = await sb
      .from('league_finance_team_accounts')
      .select('team_id, abbrev, name, on_hand, pct_of_most_on_hand')
      .eq('season_year', season)
      .order('on_hand', { ascending: false })
      .order('name', { ascending: true });
    body = (
      <OverviewTab
        row={row}
        accounts={acctRes.data || []}
        accountsError={acctRes.error ? acctRes.error.message : null}
        myTeamId={myTeamId}
      />
    );
  } else if (tab === 'ledger') {
    let q = sb
      .from('league_finance_ledger')
      .select(
        'group_key, posted_at, month_label, month_name, day_label, kind, item_count, team_count,' +
          ' all_teams, teams, collected, dispersed, fund_after, reversed, title, detail, direction'
      )
      .eq('season_year', season);
    if (filter !== 'all') q = q.eq('direction', filter);
    if (pickedTeam) q = q.contains('teams', [pickedTeam.abbrev]);
    q = q.order('posted_at', { ascending: false }).order('group_key', { ascending: false });
    let iq = sb
      .from('league_finance_ledger_items')
      .select('id, group_key, posted_at, abbrev, team_name, kind, dispersed, collected, note')
      .eq('season_year', season);
    // Every member of a row, whichever team is picked: a row's total covers them all.
    iq = iq.order('posted_at', { ascending: true }).order('abbrev', { ascending: true });
    const [ledgerRes, itemsRes] = await Promise.all([q, iq]);
    body = (
      <LedgerTab
        row={row}
        groups={ledgerRes.data || []}
        ledgerError={ledgerRes.error ? ledgerRes.error.message : null}
        items={itemsRes.data || []}
        itemsError={itemsRes.error ? itemsRes.error.message : null}
        filter={filter}
        teams={teams}
        team={pickedTeam ? pickedTeam.abbrev : ''}
      />
    );
  } else if (tab === 'outlook') {
    const [outRes, byTeamRes, acctRes] = await Promise.all([
      sb
        .from('league_finance_outlook')
        .select(
          'season_year, is_base, paid, held, promised, reference_issued, pct_paid, pct_held,' +
            ' pct_promised, pct_reference'
        )
        .eq('base_year', season)
        .order('season_year', { ascending: true }),
      sb
        .from('league_finance_outlook_by_team')
        .select('team_id, abbrev, name, season_year, promised, shade')
        .eq('base_year', season)
        .order('abbrev', { ascending: true })
        .order('season_year', { ascending: true }),
      sb
        .from('league_finance_team_accounts')
        .select('team_id, abbrev, name, issued, paid, fines_net, on_hand, pct_left')
        .eq('season_year', season)
        .order('abbrev', { ascending: true }),
    ]);
    body = (
      <OutlookTab
        row={row}
        outlook={outRes.data || []}
        outlookError={outRes.error ? outRes.error.message : null}
        byTeam={byTeamRes.data || []}
        byTeamError={byTeamRes.error ? byTeamRes.error.message : null}
        accounts={acctRes.data || []}
        accountsError={acctRes.error ? acctRes.error.message : null}
        myTeamId={myTeamId}
      />
    );
  } else {
    const outRes = await sb
      .from('league_finance_outlook')
      .select('season_year, promised')
      .eq('base_year', season)
      .eq('season_year', season + 1)
      .maybeSingle();
    body = (
      <SeasonsTab
        row={row}
        seasons={seasons}
        nextPromised={outRes.data ? outRes.data.promised : null}
        nextError={outRes.error ? outRes.error.message : null}
      />
    );
  }

  return (
    <main className="page lf-page">
      {crumbs}
      <h1 className="it-visually-hidden">League Finances</h1>
      <div className="lf-head">
        <b className="lf-title">League Finances</b>
        <SeasonPicker seasons={seasons} season={season} tab={tab} />
      </div>
      <FinanceTabs tab={tab} season={season} />
      {body}
    </main>
  );
}
