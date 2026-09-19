import { supabase } from '../../lib/supabaseClient';
import { formatCost, formatRoom } from '../../lib/formatMoney';
import { ComplianceChip } from '../../components/ComplianceBanner';


// Always fetch fresh data -- cap numbers should never be cached/stale
export const revalidate = 0;

// ---------------------------------------------------------------------------
// ROUNDING DIRECTION -- R-12, applied here in phase 2E-2 (September 19 2026).
//
// EVERY FIGURE IN THIS TABLE IS DIRECTIONAL. There is no ledger column here:
// each of the five is either something the league takes or something a team
// may still spend, so formatMoney does not appear in this file at all.
//
//   Cap Used        cost   ceil   a charge already owed
//   Cap Space       room   floor  what is left to spend
//   Min Spend       cost   ceil   a floor a team must REACH; reading it low
//                                 would say a team had cleared 5.5(g) when it
//                                 had not
//   Cash Spent      cost   ceil   R-12 names "cash spent"
//   Cash Remaining  room   floor  team_cash_available.cash_available
//
// WHY THIS PAGE MATTERED ENOUGH TO GO EARLY IN THE SWEEP. /team/[teamId] moved
// to formatCost/formatRoom in phase 2B. This page did not. They read the same
// two columns of team_cap_summary, so since 2B they have been able to disagree
// by a dollar on the same team on the same day -- and on the live data when
// this was written they disagreed for six of the ten teams. Cash Over Cap is
// the worked example R-12's own note uses: 1,477.31 used and 22.69 of space,
// which half-away printed as 1,477 and 23. Those sum to exactly 1,500 BY LUCK,
// so the page showed a team at precisely its ceiling while Team HQ showed
// 1,478 and 22. ceil(used) + floor(room) can never exceed the cap; half-away
// could, and here it was one lucky coincidence away from doing so.
//
// D'Ats What She Said is the other one to keep in mind: 0.067 of space today.
// Half-away prints "$0" at 0.33 OVER the cap as well -- the SR-22 failure mode
// exactly. floor prints "-$1" and the reader sees the overage.
// ---------------------------------------------------------------------------

// Fallback only, for the case where league_config can't be read. Every
// other season reference on this page derives from current_season_year.
const FALLBACK_SEASON = 2026;

async function loadSeasonContext() {
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name, current_season_year')
    .eq('id', true)
    .single();

  return {
    leagueName: (config && config.league_short_name) || 'Dynasty League',
    seasonYear: (config && Number(config.current_season_year)) || FALLBACK_SEASON,
  };
}

export async function generateMetadata() {
  const ctx = await loadSeasonContext();
  return {
    title: ctx.leagueName + ' — Cap Sheet',
  };
}

export default async function CapSheetPage() {
  // The season has to be resolved BEFORE the queries below, because all
  // three of them filter on it. Two round trips instead of one, deliberately.
  const ctx = await loadSeasonContext();
  const leagueName = ctx.leagueName;
  const seasonYear = ctx.seasonYear;

  const [
    { data: teams, error },
    { data: cashRows },
    { data: capRow },
    { data: complianceRows, error: complianceError },
  ] = await Promise.all([
    // FILTERED BY SEASON. team_cap_summary is teams CROSS JOIN
    // league_cap_settings, so it returns one row per team PER SEASON -- an
    // unfiltered select renders every team twice the moment a second cap
    // row exists, and key={t.team_id} collides on the duplicates.
    //
    // Note what does NOT fire this: contract data. The view takes its
    // seasons from league_cap_settings, not from contract_years, so
    // charges sitting in 2031-2034 have never affected its row count. Only
    // a new cap-settings row does. That distinction was mis-stated twice
    // during the Aug 12-13 audits; it is settled by observation -- the view
    // returned 10 rows for one season while those charges already existed.
    supabase
      .from('team_cap_summary')
      .select('*')
      .eq('league_season_year', seasonYear)
      .order('team_name'),

    // Keyed by season for the same reason, matching app/cash/page.js and
    // app/admin/cash/page.js. No longer hardcoded to 2026.
    supabase
      .from('team_cash_available')
      .select('team_id, cash_available')
      .eq('season_year', seasonYear),

    // A season's cap may be an estimate entered before the league year
    // opens. The flag lives on the row rather than in this file so every
    // surface rendering a season can ask the data whether to label it.
    supabase
      .from('league_cap_settings')
      .select('season_year, is_provisional')
      .eq('season_year', seasonYear)
      .maybeSingle(),

    // IN-SEASON COMPLIANCE, rule 3.6. Ten rows, one per team.
    //
    // NOT FILTERED BY SEASON, and that is not an SR-29 oversight: the view
    // has no season axis at all. It reports on league_config's current
    // season by construction, because compliance is a present-tense question
    // -- there is no such thing as a team being in compliance in 2029. It
    // therefore cannot multiply rows the way team_cap_summary above does,
    // and it is bounded at ten rows for as long as the league has ten teams.
    supabase.from('team_inseason_compliance').select('*'),
  ]);

  const isProvisional = Boolean(capRow && capRow.is_provisional);

  // NO ROLE CHECK ON THIS PAGE, DELIBERATELY (Sep 4, 2026). The Cap Sheet is a
  // League surface, and a League surface shows every owner the same thing.
  //
  // It briefly carried a "+ New Contract" button gated on isCommissionerOrCo.
  // That was a shortcut into the Admin section drawn on a League page, and it
  // is gone: the same link already sits in the Admin block on the home page,
  // which is where an admin action belongs. Do not add it back here, and do
  // not add any other role-gated control to this page.

  // team_id -> remaining cash. Not every team necessarily has a cash-budget
  // row yet (one team's is still unset), so a missing entry renders as "—".
  const cashByTeam = new Map((cashRows || []).map((r) => [r.team_id, r.cash_available]));

  // team_id -> compliance row. A missing entry renders as an "Unknown" chip
  // rather than as green: a failed or short read must never be able to tell
  // an owner his roster is legal.
  const complianceByTeam = new Map(
    (complianceRows || []).map((r) => [r.team_id, r])
  );

  if (error) {
    return (
      <main className="page">
        <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
          ← Home
        </a>
        <p className="eyebrow">{leagueName} · {seasonYear}</p>
        <h1>Cap Sheet</h1>
        <p className="subhead">Couldn&apos;t load team data: {error.message}</p>
      </main>
    );
  }

  const rows = teams || [];
  const allEmpty = rows.length > 0 && rows.every((t) => Number(t.cap_used) === 0);

  return (
    <main className="page">
      <a href="/" className="empty-note" style={{ display: 'inline-block', marginBottom: 12 }}>
        ← Home
      </a>
      <p className="eyebrow">{leagueName} · {seasonYear}</p>
      <h1>Cap Sheet</h1>
      <p className="subhead">Salary cap standing across all 10 teams.</p>

      {isProvisional && (
        <p className="form-notice">
          The {seasonYear} salary cap is an estimate and is not final until March 1, {seasonYear}.
          Cap Space and Min Spend below are provisional. Cap Used and Cash Spent are not affected —
          those are what teams already owe, and they do not depend on the cap figure.
        </p>
      )}

      {complianceError && (
        <p className="form-error">
          Compliance status could not be loaded: {complianceError.message}. The Status column below
          is not reporting — do not read a blank as compliant.
        </p>
      )}


      {/*
        WRAPPED IN .table-scroll -- September 19 2026, found by measuring this
        page rather than looking at it, while checking the R-12 changes above.

        THE DEFECT. This table is eight columns wide and its natural width is
        1,048px with the real fonts. It was a bare <table>, so between the
        640px card flip and about 1,100px the WHOLE PAGE scrolled sideways:
        measured at a 980px viewport, document.scrollWidth was 1,048 against a
        clientWidth of 980. That is 68px of the page -- the app bar, the
        heading, the notices -- dragging left with the table.

        It is the same defect 2B found on the Team HQ roster table and fixed
        the same way. .table-scroll confines the scroll to the table, and the
        kit already styles it, so this costs no CSS. Below 640 nothing changes:
        .ledger still flips to cards there and the wrapper has nothing to do.
      */}
      <div className="table-scroll">
      <table className="ledger">
        <thead>
          <tr>
            <th>Team</th>
            <th style={{ width: 230 }}>Status</th>
            <th style={{ textAlign: 'right' }}>Cap Used</th>
            <th style={{ textAlign: 'right' }}>Cap Space</th>
            <th style={{ textAlign: 'right' }}>Min Spend</th>
            <th style={{ textAlign: 'right' }}>Cash Spent</th>
            <th style={{ textAlign: 'right' }}>Cash Remaining</th>
            <th>Cap Room</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const cap = Number(t.fantasy_salary_cap) || 0;
            const used = Number(t.cap_used) || 0;
            const pctUsed = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
            const over = Number(t.cap_space_remaining) < 0;
            const cashRemaining = cashByTeam.get(t.team_id);
            const hasCash = cashRemaining !== undefined && cashRemaining !== null;
            return (
              <tr key={t.team_id}>
                <td className="team-name">
                  <a href={'/team/' + t.team_id} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {t.team_name}
                  </a>
                </td>
                {/*
                  NOT .col-status. That class is right-aligned and 180px wide,
                  which is right for a bare chip and wrong here -- the reasons
                  sit under the chip and read as a left-aligned list.
                */}
                <td style={{ width: 230, verticalAlign: 'top' }}>
                  <ComplianceChip row={complianceByTeam.get(t.team_id) || null} />
                </td>
                <td className="num">{formatCost(t.cap_used)}</td>
                <td className={'num ' + (over ? 'negative' : 'positive')}>
                  {formatRoom(t.cap_space_remaining)}
                </td>
                <td className="num">{formatCost(t.min_required_spend)}</td>
                <td className="num">{formatCost(t.total_cash_spent)}</td>
                <td className={'num ' + (hasCash ? 'positive' : '')}>
                  {hasCash ? formatRoom(cashRemaining) : '—'}
                </td>
                <td>
                  <div className="cap-meter">
                    <div
                      className={'cap-meter-fill ' + (over ? 'over' : '')}
                      style={{ width: pctUsed + '%' }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/*
        THE STATUS COLUMN IS NOT THE CAP COLUMN, and the two can disagree on
        purpose. Cap Space above comes from team_cap_summary and answers "how
        much room is left"; Status comes from team_inseason_compliance and
        answers "is this roster legal", which folds in the 25-man limit, the
        practice squad limits, IR, the 3 QB / 3 K position caps and whether the
        team can still field a starting lineup. A team with plenty of cap room
        can be red, and on the day this shipped three of them were.
      */}
      <p className="empty-note" style={{ marginTop: 16 }}>
        Status tests the In-Season rules: salary cap 5.5(f), roster size 3.1 and 3.2, practice squad
        3.3(a) and 3.3(b), injured reserve 3.4(a), and the 3 QB / 3 K limits in 3.5. A roster under
        25 is only out of compliance when it cannot fill the starting lineup.
      </p>

      {rows.length === 0 && (
        <p className="empty-note">
          No cap row exists for {seasonYear} yet, so there is nothing to show. Add that season to
          league_cap_settings to populate this page.
        </p>
      )}

      {allEmpty && (
        <p className="empty-note">
          No contracts entered yet — every team is showing full cap space.
          This fills in as contracts get added.
        </p>
      )}
    </main>
  );
}
