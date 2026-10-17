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
 *   The search box      a search icon that opens /search, which has its own
 *                       box. Drawn for an owner or observer, who /search admits.
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
  if (owner && owner.team_id) {
    const { data: team } = await supabase.from('teams').select('name').eq('id', owner.team_id).maybeSingle();
    teamName = (team && team.name) || 'Unclaimed Team';
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
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
            </svg>
            <span className="edfl-settingsbtn-label">Settings</span>
          </a>
          {owner || observer ? (
            <a className="edfl-iconbtn" href="/search" aria-label="Player search">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="M13 13l4 4" />
              </svg>
            </a>
          ) : null}
        </div>

        <div className="edfl-bar-spacer" />

        <div className="edfl-bar-side">
          {!user ? (
            <a href="/login" className="edfl-whoami edfl-whoami-link">
              Login
            </a>
          ) : null}

          {linked ? (
            <a className="edfl-whoami edfl-whoami-team" href={'/team/' + owner.team_id}>
              {teamName}
            </a>
          ) : null}

          {user && observer ? <span className="edfl-whoami">Read-only observer</span> : null}

          {user && !observer && !linked ? <span className="edfl-whoami">{user.email}</span> : null}

          {user ? <SignOutButton /> : null}
        </div>
      </header>

      <div className="edfl-leaguetitle">
        <span className="edfl-leaguemark" aria-hidden="true">
          EDFL
        </span>
        <h1 className="edfl-leaguename">{leagueName}</h1>
        <span className="edfl-leaguemark" aria-hidden="true">
          EDFL
        </span>
      </div>

      {linked ? <CompliancePill alert={compliance.alert} failed={compliance.failed} /> : null}
      {linked ? <ComplianceAlert alert={compliance.alert} failed={compliance.failed} /> : null}

      {user ? <ViewRow teamId={teamId} /> : null}
    </>
  );
}
