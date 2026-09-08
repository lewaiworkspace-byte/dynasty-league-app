import ThemeToggle from './ThemeToggle';
import SignOutButton from './SignOutButton';
import SearchBox from './SearchBox';
import { supabase } from '../lib/supabaseClient';
import { createSupabaseServerClient } from '../lib/supabaseServerClient';

// THE APP BAR -- one strip across the top of every page, mounted once in
// app/layout.js. September 7, 2026.
//
// It replaces the fixed theme-toggle dock that used to float in the top
// right corner. Two things live here now:
//
//   LEFT   Home link, then the light/dark toggle. The commissioner asked
//          for a return-to-home link on "every page" -- ten routes had
//          none, /calendar among them. Putting it in the layout answers
//          all ten at once and answers every route added after this one,
//          which editing ten page files would not.
//   RIGHT  Who you are. "You are logged in as <team>", or a LOGIN button.
//
// The inline "<- Home" links already sitting in twenty-four page bodies
// are LEFT ALONE ON PURPOSE. They are inside the page's own action row,
// next to page-specific links ("<- Auction", "Cap Sheet"), and stripping
// them would mean touching twenty-four files to remove something nobody
// complained about. A second way home is not a defect.
//
// STICKY, NOT FIXED. The old dock was position: fixed and overlaid the
// page; at 12px from the top it sat on the eyebrow line of a scrolled
// page. Sticky keeps the bar in the document flow, so it takes its own
// height and nothing underneath it is covered.
//
// NO globals.css CHANGE. The buttons reuse the existing .theme-toggle
// class -- same border, same mono type, same uppercase, same hover, and
// they line up with the toggle because they ARE the toggle's styling.
// Everything else is inline style over the theme's own custom properties,
// so the bar follows light and dark without a new rule.

const barStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  padding:
    'calc(10px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 10px calc(16px + env(safe-area-inset-left))',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
};

const sideStyle = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
};

const badgeStyle = {
  fontFamily: 'var(--font-mono), monospace',
  fontSize: '12px',
  letterSpacing: '0.04em',
  color: 'var(--text-dim)',
};

const badgeNameStyle = {
  color: 'var(--accent)',
  fontWeight: 500,
};

export default async function AppBar() {
  // One auth round trip, not two. getCurrentTeamOwner() would answer the
  // team question but returns null for BOTH "signed out" and "signed in
  // with no team_owners row", and the commissioner ruled on September 7
  // that those two must not look the same in the corner of the screen:
  // an owner who is authenticated but unlinked sees "You are logged in"
  // with their email, never a LOGIN button that would send them round the
  // same loop again. Telling the two apart needs the auth user itself.
  const server = await createSupabaseServerClient();

  const {
    data: { user },
  } = await server.auth.getUser();

  let owner = null;
  if (user) {
    const { data } = await server
      .from('team_owners')
      .select('id, team_id')
      .eq('user_id', user.id)
      .maybeSingle();
    owner = data || null;
  }

  // The team name comes from the shared anon client, the same way
  // app/page.js reads the team list: SELECT on teams is public, so this
  // needs no session and cannot fail on RLS. Filtered by id -- SR-29.
  let teamName = null;
  if (owner && owner.team_id) {
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', owner.team_id)
      .maybeSingle();
    teamName = (team && team.name) || 'Unclaimed Team';
  }

  return (
    <header style={barStyle}>
      <div style={sideStyle}>
        <a href="/" className="theme-toggle" style={{ textDecoration: 'none' }}>
          Home
        </a>
        <ThemeToggle />
        {/*
          THE SEARCH BOX, September 8 2026. search_players() had been live in
          the database since August 27 with no caller anywhere -- so the only
          way to reach a player card was to click a name the app had already
          drawn on a page you were already looking at, and there was no way to
          look up a player you were not already staring at.

          Gated on owner, not on user. /search redirects anyone
          getCurrentTeamOwner() returns null for, which includes the signed-in
          but unlinked owner of the third branch below -- and a control that
          always bounces is the failure the September 4 admin-link work was
          written to stop. This is presentation, not access control: the page
          keeps its redirect and the function keeps its grant.
        */}
        {owner && <SearchBox />}
      </div>

      <div style={sideStyle}>
        {!user && (
          <a href="/login" className="theme-toggle" style={{ textDecoration: 'none' }}>
            Login
          </a>
        )}

        {user && owner && owner.team_id && (
          <span style={badgeStyle}>
            You are logged in as{' '}
            <a href={'/team/' + owner.team_id} style={badgeNameStyle}>
              {teamName}
            </a>
          </span>
        )}

        {user && (!owner || !owner.team_id) && (
          <span style={badgeStyle}>
            You are logged in as <span style={badgeNameStyle}>{user.email}</span>
          </span>
        )}

        {user && <SignOutButton />}
      </div>
    </header>
  );
}
