import ThemeToggle from './ThemeToggle';
import SignOutButton from './SignOutButton';
import SearchBox from './SearchBox';
import NavDrawer from './NavDrawer';
import CommishPill from './CommishPill';
import { isCommissionerOrCo } from '../lib/getCurrentTeamOwner';
import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';

/**
 * THE APP BAR. Rewritten September 17, 2026 for the UI redesign (phase 1).
 *
 * WHAT CHANGED, AND WHY EACH THING MOVED:
 *
 * The "Home" text link is gone. The EDFL mark is Home now, the way it is on
 * every site the owners already use. This is not decoration: the mark also
 * has to appear somewhere, and spending a second slot on a word that the logo
 * already means is how a phone bar runs out of room.
 *
 * The MENU arrived. Until today the only route to most of the app was the home
 * page's wall of buttons -- 43 of them for the commissioner -- and nearly
 * everything had to route back through it. components/NavDrawer.js carries the
 * five groups. The 24 inline "Home" links in the page files still work and are
 * deliberately left alone; they are harmless and removing them would touch
 * two dozen files for nothing.
 *
 * The COMMISSIONER PILL arrived, and it is the only door to /admin. It is
 * rendered ONLY for an officer -- which decides what is DRAWN, not what may be
 * reached: officer_action_badge() refuses a non-officer by itself, the portal
 * layout re-checks, and every /admin page still redirects. Hiding a link
 * protects nobody; it stops showing people doors they cannot open, which is
 * exactly the reasoning the home page's Admin section was written under in
 * August and which now lives here instead.
 *
 * WHAT DID NOT CHANGE, and must not:
 *
 * THE BAR IS STICKY, NOT FIXED. Sticky keeps it in the document flow so it
 * takes its own height and covers nothing. Do not convert it back.
 *
 * The theme toggle stays on the LEFT (ruling, September 7).
 *
 * The login badge keeps all three of its states: team name for a linked owner,
 * the email address for a signed-in owner with no team, and a LOGIN link for
 * nobody. The second of those is not a bug -- it was ruled explicitly on
 * September 7 and must never collapse into the LOGIN case.
 *
 * SearchBox is gated on `owner`, not on `user`: /search redirects anyone
 * getCurrentTeamOwner() returns null for, and a control that always bounces is
 * the failure the September 4 admin-link work was written to stop.
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
    // is_commissioner and is_co_commissioner joined the select for the pill.
    // Same row, same round trip -- the bar does not gain a second query.
    const { data } = await server
      .from('team_owners')
      .select('id, team_id, is_commissioner, is_co_commissioner')
      .eq('user_id', user.id)
      .maybeSingle();
    owner = data || null;
  }

  let teamName = null;
  let teamAbbrev = null;
  if (owner && owner.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name, abbrev')
      .eq('id', owner.team_id)
      .maybeSingle();
    teamName = (team && team.name) || 'Unclaimed Team';
    // A team added after September 17 may have no trigraph yet. Two letters of
    // the name is a poor substitute but it is better than an empty disc, and
    // the column is nullable on purpose so an insert never fails for want of
    // one. Fill it in the database rather than improving this fallback.
    teamAbbrev = (team && team.abbrev) || (teamName ? teamName.slice(0, 2).toUpperCase() : null);
  }

  const isOfficer = isCommissionerOrCo(owner);

  return (
    <header className="edfl-bar">
      <div className="edfl-bar-side">
        <NavDrawer />
        <a className="edfl-mark" href="/" aria-label="EDFL home">
          EDFL
        </a>
        <ThemeToggle />
        {owner ? <SearchBox /> : null}
      </div>

      <div className="edfl-bar-spacer" />

      <div className="edfl-bar-side">
        {isOfficer ? <CommishPill /> : null}

        {!user ? (
          <a href="/login" className="theme-toggle" style={{ textDecoration: 'none' }}>
            Login
          </a>
        ) : null}

        {user && owner && owner.team_id ? (
          <>
            <span className="edfl-whoami">
              You are logged in as{' '}
              <a href={'/team/' + owner.team_id} style={{ color: 'var(--accent)', fontWeight: 500 }}>
                {teamName}
              </a>
            </span>
            <a className="edfl-avatar" href={'/team/' + owner.team_id} aria-label={teamName}>
              {teamAbbrev}
            </a>
          </>
        ) : null}

        {user && (!owner || !owner.team_id) ? (
          <span className="edfl-whoami">
            You are logged in as{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{user.email}</span>
          </span>
        ) : null}

        {user ? <SignOutButton /> : null}
      </div>
    </header>
  );
}
