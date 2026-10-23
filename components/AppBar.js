import SignOutButton from './SignOutButton';
import ComplianceAlert from './ComplianceAlert';
import CompliancePill from './CompliancePill';
import WindowsPill from './WindowsPill';
import CommishPill from './CommishPill';
import { ViewRow } from './SectionNav';
import { readComplianceAlert } from '../lib/complianceAlert';
import { isCommissionerOrCo } from '../lib/getCurrentTeamOwner';
import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';

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
 *           Media (components/SectionNav.js)
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
 * This is an async Server Component and reads cookies(), which makes every
 * route dynamic -- as every route already was, because of the root layout's
 * revalidate = 0.
 */

export default async function AppBar() {
  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  let owner = null;
  if (user) {
    const { data } = await server
      .from('team_owners')
      .select('id, team_id, is_commissioner, is_co_commissioner')
      .eq('user_id', user.id)
      .maybeSingle();
    owner = data || null;
  }

  // Asked only of a signed-in login with no team -- an owner never pays for it.
  // Fails closed: a failed read draws the ordinary no-team badge.
  let observer = false;
  if (user && !owner) {
    const { data: isObserver } = await server.rpc('edfl_is_observer');
    observer = isObserver === true;
  }

  // The league's name for the title row. The same column the tab title reads.
  const { data: config } = await supabase
    .from('league_config')
    .select('league_short_name')
    .eq('id', true)
    .maybeSingle();
  const leagueName = (config && config.league_short_name) || 'Dynasty League';

  let teamName = null;
  let teamAbbrev = null;
  if (owner && owner.team_id) {
    const { data: team } = await supabase.from('teams').select('name, abbrev').eq('id', owner.team_id).maybeSingle();
    teamName = (team && team.name) || 'Unclaimed Team';
    teamAbbrev = (team && team.abbrev) || null;
  }

  const linked = Boolean(user && owner && owner.team_id);
  const isOfficer = isCommissionerOrCo(owner);
  const teamId = linked ? owner.team_id : null;
  let compliance = { alert: null, failed: false };
  // OPEN NEGOTIATING WINDOWS (batch 5). League-wide, the same rows on every
  // page; captured, not discarded -- an empty list after a failed read would
  // say "no open windows", a plausible wrong answer.
  let windows = { rows: [], failed: false };
  if (linked) {
    const [complianceRes, windowsRes] = await Promise.all([
      readComplianceAlert(server),
      server.rpc('open_negotiation_windows').then(
        function (r) {
          if (r.error) {
            console.error('open_negotiation_windows failed:', r.error);
            return { rows: [], failed: true };
          }
          return { rows: Array.isArray(r.data) ? r.data : [], failed: false };
        },
        function (e) {
          console.error('open_negotiation_windows threw:', e);
          return { rows: [], failed: true };
        }
      ),
    ]);
    compliance = complianceRes;
    windows = windowsRes;
  }

  return (
    <>
      <header className="edfl-bar edfl-topbar">
        <div className="edfl-bar-side">
          <a className="edfl-settingsbtn" href="/settings" aria-label="Settings">
            <img className="edfl-settingsbtn-icon" src="/brand/settings.webp" width="28" height="28" alt="" />
          </a>
        </div>

        <div className="edfl-bar-spacer" />

        <div className="edfl-bar-side">
          {isOfficer ? <CommishPill /> : null}

          {!user ? (
            <a href="/login" className="edfl-whoami edfl-whoami-link">
              Login
            </a>
          ) : null}

          {linked ? (
            <a
              className={'edfl-whoami edfl-whoami-team' + (teamAbbrev ? ' edfl-whoami-abbrev' : '')}
              href={'/team/' + owner.team_id}
              aria-label={teamName + ', Team HQ'}
              title={teamName}
            >
              {teamAbbrev || teamName}
            </a>
          ) : null}

          {user && observer ? <span className="edfl-whoami">Read-only observer</span> : null}

          {user && !observer && !linked ? <span className="edfl-whoami">{user.email}</span> : null}

          {user ? <SignOutButton /> : null}
        </div>
      </header>

      {user ? (
        <div className="edfl-crumbslot">
          <div className="edfl-crumbtarget" id="edfl-crumbtarget" />
          <nav aria-label="Breadcrumb" className="edfl-crumbs edfl-crumbs-default">
            <a href="/">Home</a>
          </nav>
        </div>
      ) : null}

      <div className="edfl-leaguetitle">
        <img className="edfl-leaguelogo" src="/brand/edfl-logo.webp" width="40" height="40" alt="" />
        <h1 className="edfl-leaguename">{leagueName}</h1>
        <img className="edfl-leaguelogo" src="/brand/edfl-logo.webp" width="40" height="40" alt="" />
      </div>

      {linked ? (
        <div className="edfl-cpill-row">
          <CompliancePill alert={compliance.alert} failed={compliance.failed} />
          <WindowsPill rows={windows.rows} failed={windows.failed} />
        </div>
      ) : null}
      {linked ? <ComplianceAlert alert={compliance.alert} failed={compliance.failed} /> : null}

      {user ? <ViewRow teamId={teamId} /> : null}
    </>
  );
}
