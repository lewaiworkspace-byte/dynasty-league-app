import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';
import OfficerActionBanner from '../../components/OfficerActionBanner';

/**
 * THE COMMISSIONER PORTAL HUB -- /admin, which until today had no page at all.
 *
 * WHAT MOVED HERE. The home page's "Admin" section (thirteen buttons with no
 * descriptions, drawn under the league's own links) and the officer action
 * banner that item A put on Home on September 16. Both are gone from
 * app/page.js. That removes an officer_action_items() call from every single
 * home page load for the two officers -- the function refreshes the state table
 * on each call, so this is a real saving and not only tidiness.
 *
 * THE BANNER COMPONENT IS UNCHANGED. It still decides nothing: every item, its
 * severity, its sentence and its link are composed by officer_action_items() in
 * the database and printed verbatim. A failed read still says "could not check"
 * rather than "all clear".
 *
 * TWO GATES, and the difference is the one lib/getCurrentTeamOwner.js records:
 *   canAdmin  -- isCommissionerOrCo -- the widened set, opens the portal
 *   isCommish -- me.is_commissioner -- STRICT, never the helper
 * The Calendar Loader is the strict one and is HIDDEN from the co-commissioner
 * rather than shown disabled. Every calendar_* write calls require_commissioner()
 * in the database, so a greyed-out row would advertise a door that cannot open.
 * Appointing a co-commissioner is also strict, but it lives INSIDE Owner
 * Administration -- a page's gate does not cover everything drawn on it.
 *
 * WHAT IS NOT HERE YET. The weekly cycle strip (Tue pay, Wed wire, Thu
 * compliance, Sun scores, each showing whether it has run) needs reads of
 * league_weeks, waiver_runs and the compliance run; it is phase 1B, kept out of
 * this batch so a first portal can be verified on its own.
 */

export const revalidate = 0;

const GROUPS = [
  {
    title: 'THIS WEEK',
    links: [
      { href: '/admin/sleeper-sync', label: 'Sleeper Sync', note: 'Pull rosters, adjudicate conflicts' },
      { href: '/admin/injury-sync', label: 'Injury Sync', note: 'Pull injury designations from Sleeper' },
      { href: '/admin/import-stats', label: 'Import Stats & Publish Results', note: 'Weekly scoring, season results' },
      { href: '/admin/sync-players', label: 'Sync Players', note: 'Refresh the player list from Sleeper' },
    ],
  },
  {
    title: 'ROSTER & CONTRACTS',
    links: [
      { href: '/admin/new-contract', label: 'New Contract', note: 'Write a contract for any team' },
      { href: '/admin/cuts', label: 'Cuts & Roster Moves', note: 'Cut from any roster; the cut ledger' },
      { href: '/admin/fix-contracts', label: 'Fix Contracts', note: 'Correct a contract entered wrong' },
      { href: '/admin/restructure', label: 'Restructure (any team)', note: 'On behalf of an owner' },
      { href: '/admin/fifth-year-option', label: 'Option Reversals', note: 'Fifth Year Option decisions' },
    ],
  },
  {
    title: 'MARKET',
    links: [
      { href: '/admin/new-tier', label: 'Build a Free Agent Tier', note: 'Opens a sealed auction tier' },
      { href: '/admin/tier-results', label: 'Tier Results', note: 'Verify and publish a finished tier' },
      { href: '/admin/trades', label: 'Trade Approvals', note: 'Execute, veto and reverse' },
      // September 19 2026: the rookie draft prospect board (spec v0.8 4.7).
      { href: '/admin/prospects', label: 'Draft Prospects', note: 'Load ESPN\u2019s board, match to Sleeper, close the rookie draft' },
    ],
  },
  {
    title: 'MONEY',
    links: [
      { href: '/admin/cash', label: 'Manage Owner Cash', note: 'Adjustments, fines, the League Fund' },
    ],
  },
];

export default async function CommissionerPortalPage() {
  const me = await getCurrentTeamOwner();

  // Signed out is already handled by middleware.js, which sends every
  // unauthenticated request to /login. This is the second line, and it is the
  // one that answers the different question: signed in, but not an officer.
  if (!me) redirect('/login?next=/admin');

  const canAdmin = isCommissionerOrCo(me);
  if (!canAdmin) redirect('/');

  const isCommish = Boolean(me.is_commissioner);

  // SESSION CLIENT: officer_action_items() gates on auth.uid(), which is null
  // through the service-role client and would refuse every call.
  const sessionClient = await createSupabaseServerClient();
  const { data, error } = await sessionClient.rpc('officer_action_items');
  const actionItems = data || [];
  const actionItemsError = error ? error.message : null;

  return (
    <main className="portal-body">
      <h1>Commissioner Portal</h1>
      <p className="subhead">
        Everything an officer does lives here. Owners never see this page, and nothing on it is
        drawn anywhere else in the app.
      </p>

      <div style={{ marginTop: 24 }}>
        <OfficerActionBanner items={actionItems} error={actionItemsError} />
      </div>

      {GROUPS.map(function (g) {
        return (
          <section className="portal-group" key={g.title}>
            <div className="portal-group-title">{g.title}</div>
            <div className="kit-rows">
              {g.links.map(function (l) {
                return (
                  <a className="kit-row" href={l.href} key={l.href}>
                    <div className="kit-row-main">
                      <div className="kit-row-title">{l.label}</div>
                      <div className="kit-row-meta">{l.note}</div>
                    </div>
                    <span className="kit-row-right" aria-hidden="true">
                      &rsaquo;
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="portal-group">
        <div className="portal-group-title">LEAGUE</div>
        <div className="kit-rows">
          {/*
            STRICT, not the helper. Hidden from the co-commissioner entirely:
            every calendar_* function calls require_commissioner(), so a row
            drawn for Brian would be a door that cannot open. If this is ever
            widened, widen the page, its actions and those functions together.
          */}
          {isCommish ? (
            <a className="kit-row" href="/admin/calendar">
              <div className="kit-row-main">
                <div className="kit-row-title">
                  Calendar Loader
                  <span className="portal-strict">YOU ONLY</span>
                </div>
                <div className="kit-row-meta">Weeks, instants and calendar entries</div>
              </div>
              <span className="kit-row-right" aria-hidden="true">
                &rsaquo;
              </span>
            </a>
          ) : null}

          {/*
            September 19 2026: Robo Goodell's desk. WIDENED gate, like the rest
            of the portal -- ruling RG-4 lets the co-commissioner draft a memo,
            pull one back and mute a wire kind. Every write on that page calls
            is_commissioner_or_co() in the database, so this row is a door and
            not the lock.
          */}
          <a className="kit-row" href="/admin/league-office">
            <div className="kit-row-main">
              <div className="kit-row-title">League Office</div>
              <div className="kit-row-meta">
                Robo Goodell&rsquo;s wire: calendar notices, fines, and memos you draft for him
              </div>
            </div>
            <span className="kit-row-right" aria-hidden="true">
              &rsaquo;
            </span>
          </a>

          <a className="kit-row" href="/admin/owner-activity">
            <div className="kit-row-main">
              <div className="kit-row-title">Owner Administration</div>
              <div className="kit-row-meta">
                Owner activity and roles. Appointing a co-commissioner inside is commissioner-only.
              </div>
            </div>
            <span className="kit-row-right" aria-hidden="true">
              &rsaquo;
            </span>
          </a>

          <a className="kit-row" href="/actions">
            <div className="kit-row-main">
              <div className="kit-row-title">League Action Log</div>
              <div className="kit-row-meta">
                Every commissioner action, on a page the whole league can read
              </div>
            </div>
            <span className="kit-row-right" aria-hidden="true">
              &rsaquo;
            </span>
          </a>
        </div>
      </section>
    </main>
  );
}
