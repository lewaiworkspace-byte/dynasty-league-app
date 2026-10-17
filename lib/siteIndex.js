/**
 * THE SITE INDEX -- October 17, 2026 (UI test batch 1).
 *
 * The list the MENU drawer used to carry (components/NavDrawer.js, retired by
 * this batch). It is the app's only index of routes: Lewis's sketch has no
 * hamburger, so League Office (/office) draws this list at its foot as "Every
 * page", and the four hub pages draw the lines that belong to them. Anything
 * missing from here is genuinely hard to find -- check a route against this
 * file before deciding it has a door.
 *
 * Static, no server query: the caller hands in the owner's team id for the
 * Team HQ line and nothing else. /admin is not here (the Commissioner Portal
 * pill is its door, drawn on League Office and Settings for an officer), and
 * /bids has no line while the auction is dormant (FA-19); both are unchanged
 * from the drawer.
 *
 * @param {string|null} teamId  the viewer's own team, or null
 * @returns {{ title: string, links: { href: string, label: string }[] }[]}
 */
export function siteIndex(teamId) {
  const myTeam = [];
  if (teamId) {
    myTeam.push({ href: '/team/' + teamId, label: 'Team HQ' });
  }
  myTeam.push({ href: '/cash', label: 'Cash account' });
  myTeam.push({ href: '/restructure', label: 'Restructure a contract' });
  myTeam.push({ href: '/fifth-year-option', label: 'Fifth Year Option' });
  myTeam.push({ href: '/trades/new', label: 'Propose a trade' });
  myTeam.push({ href: '/settings', label: 'Settings' });
  myTeam.push({ href: '/install', label: 'Put EDFL on your phone' });

  return [
    { title: 'My team', links: myTeam },
    {
      title: 'League',
      links: [
        { href: '/league', label: 'League' },
        { href: '/cap-sheet', label: 'Cap Sheet' },
        { href: '/standings', label: 'Standings' },
        { href: '/scoreboard', label: 'Scoreboard' },
        { href: '/calendar', label: 'Calendar' },
        { href: '/league-finances', label: 'League Finances' },
        { href: '/draft-picks', label: 'Draft Picks' },
        { href: '/injury-report', label: 'Injury Report' },
        { href: '/transactions', label: 'Transactions' },
        { href: '/actions', label: 'Action Log' },
        { href: '/library', label: 'Rule Book & Manuals' },
        { href: '/data', label: 'Data Center' },
      ],
    },
    {
      title: 'Players',
      links: [
        { href: '/search', label: 'Player Search' },
        { href: '/values', label: 'Player Value Chart' },
        { href: '/stats', label: 'Statistics' },
        { href: '/free-agency', label: 'Free Agency' },
        { href: '/poaching', label: 'Poaching' },
        { href: '/waivers', label: 'Waiver Wire' },
        { href: '/prospects', label: 'Draft Prospects' },
      ],
    },
    {
      title: 'Trades',
      links: [
        { href: '/trades', label: 'All trades' },
        { href: '/trades/new', label: 'Propose a trade' },
      ],
    },
  ];
}
