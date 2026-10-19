import SignOutButton from './SignOutButton';
import ComplianceAlert from './ComplianceAlert';
import CompliancePill from './CompliancePill';
import { ViewRow } from './SectionNav';
import { readComplianceAlert } from '../lib/complianceAlert';
import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';

/**
 * THE APP BAR. Rewritten October 17, 2026 for the UI test site (UI test
 * batch 1), from Lewis's sketch of October 12 and his comments on the
 * "Sketch options" canvas page. It now draws the whole top of the sketch's
 * frame, on every page:
 *
 *   row 1   Settings (gear + word, left) ... team name · Sign out (right)
 *   row 2   the league's name, with the EDFL mark either side
 *   row 3   the compliance pill: "In compliance" (green) or "Out of
 *           compliance" (red), which opens /roster-audit
 *   then    the in-app compliance alert strip (unchanged; always on by the
 *           October 1 ruling) and the VIEW row: Roster · Players · League ·
 *           Media (components/SectionNav.js)
 *
 * WHAT LEFT THE BAR, AND WHERE IT WENT:
 *   The MENU drawer     gone. League Office (/office) carries the index of
 *                       every route in its place (lib/siteIndex.js). The
 *                       sketch has no hamburger.
 *   The COMMISH pill    out of the bar (Lewis, October 12: "remove this and
 *                       we will put it somewhere else"). Until he says where,
 *                       it is drawn on League Office and on Settings, for an
 *                       officer only. It is still the only door to /admin,
 *                       and the portal still gates itself.
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
  const teamId = linked ? owner.team_id : null;
  let compliance = { alert: null, failed: false };
  if (linked) {
    compliance = await readComplianceAlert(server);
  }

  return (
    <>
      <header className="edfl-bar edfl-topbar">
        <div className="edfl-bar-side">
          <a className="edfl-settingsbtn" href="/settings" aria-label="Settings">
            <img className="edfl-settingsbtn-icon" src="/brand/settings.webp" width="28" height="28" alt="" />
            <span className="edfl-settingsbtn-label">Settings</span>
          </a>
        </div>

        <div className="edfl-bar-spacer" />

        <div className="edfl-bar-side">
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

      {linked ? <CompliancePill alert={compliance.alert} failed={compliance.failed} /> : null}
      {linked ? <ComplianceAlert alert={compliance.alert} failed={compliance.failed} /> : null}

      {user ? <ViewRow teamId={teamId} /> : null}
    </>
  );
}
