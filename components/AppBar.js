import ComplianceAlert from './ComplianceAlert';
import CompliancePill from './CompliancePill';
import WindowsPill from './WindowsPill';
import TopBarNav from './SectionNav';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';
import { getAuthUser } from '../lib/authUser';
import { getLeagueShortName } from '../lib/leagueName';

/**
 * THE APP BAR. Rewritten October 17, 2026 for the UI test site (UI test
 * batch 1), from Lewis's sketch of October 12 and his comments on the
 * "Sketch options" canvas page. It now draws the whole top of the sketch's
 * frame, on every page:
 *
 *   row 1   Settings (the football-gear logo, left) ... [Commissioner Portal] team
 *           tri-graph · Sign out (right)
 *   row 2   the league's name, with the EDFL mark either side
 *   row 3   the compliance pill: "In compliance" (green) or "Out of
 *           compliance" (red), which opens /roster-audit -- and, beside it
 *           since UI test batch 5, the windows pill (below)
 *   then    the in-app compliance alert strip (unchanged; always on by the
 *           October 1 ruling) and the VIEW row: Roster · Players · League ·
 *           Matchups (Media until UI test batch 20; components/SectionNav.js)
 *
 * WHAT LEFT THE BAR, AND WHERE IT WENT:
 *   The MENU drawer     gone. League Office (/office) carries the index of
 *                       every route in its place (lib/siteIndex.js). The
 *                       sketch has no hamburger.
 *   The COMMISH pill    out of the bar October 12, and BACK IN IT October 19
 *                       (UI test batch 3) as the Commissioner Portal button:
 *                       see below.
 *   The theme switch    on the Settings page. The theme follows the phone
 *                       (October 10) and the switch is the override.
 *   "Logged in as"      dropped (Lewis, October 12); the team name alone.
 *   The avatar disc     the team name is the link to Team HQ now.
 *   The search box      gone from the bar (Lewis, October 18, batch 2). Player
 *                       Search is in the League Office index (lib/siteIndex.js).
 *
 * OCTOBER 18, 2026 (UI test batch 2), Lewis's rulings in the batch-2 chat:
 *   the team TRI-GRAPH (teams.abbrev) stands in the bar instead of the team
 *   name, to save room; the full name is its accessible label and tooltip.
 *   A team logo goes beside it once every team has one. The Settings button
 *   wears his football-gear logo and the league title his EDFL logo, both
 *   from Drive > EDFL 2.0 > EDFL App Graphics, resized into public/brand/.
 *   THE BREADCRUMB SLOT sits between this bar and the league title: every
 *   page's <Breadcrumbs> portals its trail into #edfl-crumbtarget
 *   (components/CrumbPortal.js). Until a page's trail arrives, or on a page
 *   with none, the slot shows a plain "Home" link, so the row never jumps.
 *
 * OCTOBER 19, 2026 (UI test batch 3). THE COMMISSIONER PORTAL BUTTON. Lewis:
 * "Commissioner portal will be a button and link in the top banner only for
 * those with an assigned commissioner role"; read back the same day as the
 * commissioner and the co-commissioner, which is isCommissionerOrCo() on the
 * team_owners row this bar already reads (no extra round trip to decide). It
 * sits first in the right-hand group, before the tri-graph, and it is the
 * only door to /admin: League Office and Settings no longer draw it. The pill
 * itself (components/CommishPill.js) keeps its three states and its count;
 * only an officer's page load pays for its officer_action_badge() read.
 * Presentation, not access control: every /admin page and action re-checks.
 *
 * OCTOBER 22, 2026 (UI test batch 5), Lewis's notes on the Roster design
 * canvas, read back and approved the same day:
 *   SETTINGS IS THE FOOTBALL-GEAR LOGO ALONE. "The word 'Settings' is
 *   unnecessary." The link keeps aria-label "Settings", so a screen reader
 *   and a tooltip-less tap still name it.
 *   THE WINDOWS PILL sits beside the compliance pill, in the same row, for a
 *   linked owner only (components/WindowsPill.js): green "No open windows",
 *   or a red link per kind of window open -- "Free agency: N open" to
 *   /free-agency, "Poaching: N open" to /poaching. It replaces the "Open
 *   negotiating windows" block that sat above Team HQ's tabs. The read is
 *   open_negotiation_windows() through the session client, made here once per
 *   page; a failed read draws a grey "Windows unknown" with both links, never
 *   a green.
 *
 * WHAT DID NOT CHANGE: the bar is STICKY, not fixed, so it takes its own
 * height and covers nothing. The login badge keeps its four states: team name
 * for a linked owner, "Read-only observer" for a registered observer, the
 * email for a signed-in login with no team (the September 7 ruling), Login for
 * nobody. Hiding a control is presentation, never access control.
 *
 * ONE READ FOR TWO SURFACES. my_compliance_alert() is called once here
 * (lib/complianceAlert.js) and handed to both the pill and the strip, so the
 * two cannot disagree and no page pays a second round trip for it.
 *
 * NOVEMBER 15, 2026 (UI test batch 17), Lewis on the Players canvas ("PICK
 * ONE" board, choice 1, and its "logo tapped" panel, approved):
 *   THE BAR IS BLACK and keeps its height: Settings (the football-gear,
 *   redrawn as a football, public/brand/settings-football.svg, with no light
 *   circle) on the left; the lettering from inside the league sign (El, the
 *   crown, DYNASTY, Futbol League-O; no EDFL oval, no frame;
 *   public/brand/edfl-wordmark.webp, widened about 1.5x) in the middle; the
 *   owner's TEAM LOGO on the right (components/TeamDisc.js).
 *   THE LEAGUE TITLE ROW IS GONE; its name is the wordmark's alt text.
 *   SIGN OUT LEFT THE BAR: tapping the team logo opens a small "Sign out of
 *   EDFL?" box (components/AccountMenu.js). The logo no longer opens Team HQ.
 *   A signed-in login with no team keeps the plain Sign Out (no logo to tap).
 *   THE COMMISSIONER PORTAL BUTTON LEFT THE BAR: "commissioner access will
 *   move to the League Office tab for those that have Commissioner/
 *   Co-Commissioner access". app/office/page.js draws it for an officer.
 *   This supersedes the October 19 and October 22 notes above where they
 *   differ (the portal in the bar; the tri-graph and Sign out at the right).
 *
 * NOVEMBER 22, 2026 (UI test batch 38), Lewis's canvas "EDFL compact top
 * bar options", Round 2, option F: ONE ROW, 60px, black, every tab in it.
 *   The league logo on the left opens League Office; Players · Team · League ·
 *   Matchups · EDFL Bets in the middle; the team logo on the right opens
 *   Settings and carries a compliance dot. components/SectionNav.js draws
 *   them and decides which is lit. The football-gear Settings button, the
 *   wordmark, the view row under the bar and the office row at the foot
 *   (components/OfficeBar.js) are gone, and so is the team logo's sign-out
 *   pop-up (components/AccountMenu.js): Sign out is on the Settings page.
 *   A signed-in login with no team gets the football-gear mark on the right
 *   (it opens Settings, where Sign out is); nobody signed in gets the league
 *   logo and Login. The crumb slot, the compliance and windows pills and the
 *   compliance strip still sit under the bar, unchanged.
 *   This supersedes the November 15 note above where they differ.
 *
 * NOVEMBER 22, 2026 (UI test batch 40): ONE READ. The bar used to make five
 * requests on every page, one after another -- team_owners, league_config,
 * teams, then my_compliance_alert() and open_negotiation_windows() -- plus
 * its own Auth call. Now it asks lib/authUser.js who is signed in (no Auth
 * call: the middleware already asked) and makes ONE call,
 * edfl_topbar_state(), through the SESSION client. That function calls
 * my_compliance_alert() and open_negotiation_windows() unchanged and flags
 * each part ok or not ok, so the pills still say "unknown" on a failed part
 * and never turn a failure into green. If the call itself fails the bar
 * draws as for a login with no team (no pills), as a failed owner read did
 * before. Signed out, the league name comes from lib/leagueName.js.
 *
 * This is an async Server Component and reads cookies(), which makes every
 * route dynamic -- as every route already was, because of the root layout's
 * revalidate = 0.
 */

export default async function AppBar() {
  const user = await getAuthUser();

  let state = null;
  if (user) {
    try {
      const server = await createSupabaseServerClient();
      const { data, error } = await server.rpc('edfl_topbar_state');
      if (error) console.error('edfl_topbar_state failed:', error);
      else state = data || null;
    } catch (e) {
      console.error('edfl_topbar_state threw:', e);
    }
  }

  // The league's name: the league logo's alt text when nobody is signed in.
  const leagueName =
    (state && state.league_short_name) || (user ? null : await getLeagueShortName()) || 'Dynasty League';

  const owner = state && state.owner ? state.owner : null;

  let teamName = null;
  let teamAbbrev = null;
  if (owner && owner.team_id) {
    const team = state.team || null;
    teamName = (team && team.name) || 'Unclaimed Team';
    teamAbbrev = (team && team.abbrev) || null;
  }

  const linked = Boolean(user && owner && owner.team_id);
  const teamId = linked ? owner.team_id : null;
  let compliance = { alert: null, failed: false };
  // OPEN NEGOTIATING WINDOWS (batch 5). League-wide, the same rows on every
  // page; captured, not discarded -- an empty list after a failed read would
  // say "no open windows", a plausible wrong answer.
  let windows = { rows: [], failed: false };
  if (linked) {
    const c = state.compliance || {};
    compliance = c.ok === true ? { alert: c.alert || null, failed: false } : { alert: null, failed: true };
    const w = state.windows || {};
    windows =
      w.ok === true
        ? { rows: Array.isArray(w.rows) ? w.rows : [], failed: false }
        : { rows: [], failed: true };
  }

  // The compliance dot on the team logo reads the same answer as the pill.
  let complianceState = 'good';
  if (compliance.failed) complianceState = 'unknown';
  else if (compliance.alert && compliance.alert.at_risk) complianceState = 'bad';

  return (
    <>
      <header className="edfl-bar edfl-topbar edfl-blackbar edfl-tabbar">
        {user ? (
          <TopBarNav teamId={teamId} abbrev={teamAbbrev} teamName={teamName} compliance={complianceState} />
        ) : (
          <>
            <span className="edfl-tb-logo">
              <img src="/brand/edfl-logo.webp" alt={leagueName} width="40" height="40" />
            </span>
            <span className="edfl-tb-fill" />
            <a href="/login" className="edfl-whoami edfl-whoami-link">
              Login
            </a>
          </>
        )}
      </header>

      {user ? (
        <div className="edfl-crumbslot">
          <div className="edfl-crumbtarget" id="edfl-crumbtarget" />
          <nav aria-label="Breadcrumb" className="edfl-crumbs edfl-crumbs-default">
            <a href="/">Home</a>
          </nav>
        </div>
      ) : null}

      {linked ? (
        <div className="edfl-cpill-row">
          <CompliancePill alert={compliance.alert} failed={compliance.failed} />
          <WindowsPill rows={windows.rows} failed={windows.failed} />
        </div>
      ) : null}
      {linked ? <ComplianceAlert alert={compliance.alert} failed={compliance.failed} /> : null}
    </>
  );
}
