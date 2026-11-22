---
paths:
  - "components/SectionNav.js"
  - "components/OfficeBar.js"
  - "lib/siteIndex.js"
  - "components/AppBar.js"
  - "components/WindowsPill.js"
  - "components/CompliancePill.js"
  - "components/CommishPill.js"
  - "components/Breadcrumbs.js"
  - "components/CrumbPortal.js"
  - "components/OfficerActionBanner.js"
  - "components/SignOutButton.js"
  - "app/page.js"
  - "app/admin/page.js"
---

# Links, the drawer and the app bar

What is drawn is not what is permitted. Loads with the navigation components and the two index pages.

### Hiding a link is presentation, not access control

The principle is unchanged and the surfaces it applies to have moved. Owners once clicked
admin buttons drawn for everyone, bounced home, and concluded the app was broken. **The
redirect and the Server Action re-check remain the real gates.** Never treat a hidden link
as a substitute for either, and **never disable a write path by hiding its link** — the
function behind it will run happily.

- **`app/page.js` renders nothing at all.** It is a redirect. Every admin link, caption and
  officer block that this section used to describe there is gone: the links are the
  Commissioner Portal, the officer banner is on `/admin`, and the Commissioner Portal button on
  League Office is the door. **Do not put a link of any kind back on `/`** — there is no page to put it on.
- **`lib/siteIndex.js` is the app's only index** (UI test batch 1, October 17, 2026: the MENU
  drawer is retired, since Lewis's sketch has no hamburger). League Office (`/office`) draws
  it whole as "Every page", and the hub pages draw their own lines. It is a static list with no
  server query; the caller hands in the owner's team id for the Team HQ line and nothing else.
  Anything missing from it is genuinely hard to find — **check a route against it before
  deciding it has a door.** `/bids` deliberately has none while the auction is dormant.
- **The Commissioner Portal button lives on League Office, and only there** (Lewis, November
  15, 2026, UI test batch 17: "commissioner access will move to the League Office tab for those
  that have Commissioner/Co-Commissioner access"; it was in the top bar from October 19).
  `app/office/page.js` draws `components/CommishPill.js` above the tiles when
  `isCommissionerOrCo(viewer.owner)` is true; the bar and Settings do not draw it, so **do not
  add a second door.** It reads "Commissioner Portal" — never "Admin", never COMMISH — in full
  at every width there. Its three states and count are unchanged.
- **Sign out is behind the team logo** (batch 17, Lewis: "If an owner wants to sign out, they
  can click on their logo and it will create a popup box asking if they want to sign out").
  `components/AccountMenu.js` opens "Sign out of EDFL?" with Cancel and Sign out; the logo no
  longer links to Team HQ (the Roster button and Home do). A signed-in login with no team keeps
  `SignOutButton.js` in the bar. The view row and the office bar (`components/SectionNav.js`) light a button
  by URL prefix and open nothing an owner could not already reach. **The view row is Players ·
  League · Matchups** (UI test batch 33, November 21, 2026, Lewis's canvas "EDFL compact top
  bar options", Round 3, Option 6: one Players tab replaces Roster and Watchlist; players.md).
  **Players opens My roster** (`/team/<own>?tab=roster`; `/players` for a login with no team)
  and **is lit on My roster, `/watchlist` and `/players`** (its three sources). Team HQ's
  Overview is Home and lights nothing in the row (batch 7), and Money lights nothing either.
  The new top bar (Round 2 option F: League Office behind the league logo, Settings behind the
  team logo, EDFL Bets) is the next batch; until it lands the office row stays. The row was
  Roster · Watchlist · League · Matchups from UI test batch 22 to 32. **GM's Office
  itself is gone** (UI test batch 24, November 15, 2026, Lewis: "Everything in GM's Office moves
  into Owner's Office", renamed **Owner's Suite**): its tiles are the first group on `/owner`
  (`app/owner/page.js`; Players left them in batch 33), and **`/gm` only redirects to `/owner`**
  so old links land. `/owner`, `/cash`, `/fifth-year-option`, `/gm`, `/free-agency`,
  `/poaching`, `/waivers`, `/bids`, `/trades` and `/restructure` light Owner's Suite; `/stats`, `/values`,
  `/prospects` and `/search` light Analyst's Office (its tiles), and a player's card lights
  nothing. **Do not split Players back into Roster and Watchlist buttons, and do not bring back
  a GM's Office hub.** **The office row is The Book · Owner's Suite · Analyst's Office · League Office**
  (batch 24): The Book (`/book`, test site only) took GM's Office's place and shows the betting
  logo (`public/brand/betting-logo.webp`, 22px round) before its label; while it is open
  nothing in the view row is lit. Crumbs that said "GM's Office" say "Owner's Suite" and link
  to `/owner`.
  **Matchups opens `/matchups`** and is lit there, on every
  `/matchup/<week>/<id>` page and on the old `/scoreboard` (which redirects); League no longer
  lights on those. **The Media button left the row**; the Media tab and its pages are untouched
  and Lewis has not decided where its door goes, so **do not add one** until he does.
  The index lists `/players` first under Players and `/watchlist` under My team (a linked
  owner only).
- **League Office's "Owner Contacts" tile and the index's "Owner directory" line open
  `/office/owners`** (batch 7), every owner's card read-only; an owner edits his own in
  Settings (settings-and-owner-info.md).
- **League Office's "Draft Board" tile opens `/draft-picks`** (UI test batch 18, November 15,
  2026, Lewis: "Create a League Draft Board page under League Office"); the route keeps its name,
  the Analyst's Office tile and the index's line say "Draft Board" too. The page draws a finished
  draft by team and a draft still to come round by round (comment block in
  `app/draft-picks/DraftPicksBoard.js`); the year list comes from the rows. A finished draft
  has **Team View** (opens first: by team) and **Player View** (UI test batch 29, Nov 21: a bar
  per round split by position, then each round's picks in draft order, as the rows arrive).
- **The windows pill sits beside the compliance pill, in one row, for a linked owner on
  every page** (UI test batch 5, October 22, 2026, Lewis: "Make it green if there are no open
  windows. If there are open windows, make it red and link it to the page that hosts the
  applicable windows. If there are poaching and in-season free agency open windows, make two
  separate links."). `AppBar.js` calls `open_negotiation_windows()` once through the
  **session** client (SECURITY DEFINER, `authenticated` only) alongside `my_compliance_alert()`,
  and `components/WindowsPill.js` decides nothing: no rows → green "No open windows", not a
  link; `kind = 'poach'` rows → red "Poaching: N open" to `/poaching`; any other rows → red
  "Free agency: N open" to `/free-agency`; both → two pills. **A failed read is grey "Windows
  unknown" with a link to each page, never a green.** N is the number of rows the function
  returned; **do not look up an opener, an offer or an offer count to enrich it** (PN-3,
  FA-D). The row (`.edfl-cpill-row`) is `AppBar.js`'s and wraps; `CompliancePill` renders
  its link only.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`). **Never swap it for
  the helper.** If a strict page's gate ever widens, widen this in the same commit — not
  before.
- **Sync Players, Import Stats and the Injury tools are all `canAdmin`.** The
  first two were strict until the commissioner's ruling that struck Technical Manual
  Appendix A.2(c); their pages and actions widened in the same commit.
- **The Sleeper Sync is retired** (October 7, 2026, batch 3): the `/admin/sleeper-sync`
  page, its roster pull and its conflict adjudication are gone, and its officer items left
  `edfl_officer_action_items_compute()` in migration `sync_08`. Sleeper rosters are not
  maintained and decide nothing (commissioner ruling, October 6, 2026), so **do not rebuild
  a roster sync or re-add the link.** Sleeper's player facts stay: Sync Players, the injury
  sync and the stats import.
- **The Calendar Loader sits inside `isCommish`**, with the page, its actions and the
  database all strict. Widen all four together or none.
- **The officer action banner renders what the database composed, verbatim.**
  `components/OfficerActionBanner.js` never reads and never decides; **`app/admin/page.js`**
  calls `officer_action_items()` through the **session** client (the function gates on
  `auth.uid()`) and hands it the rows. **A failed read renders an error, never "All
  clear"** — those are different facts. New kinds of action item are added in the
  database function, not in the component.


### Breadcrumbs

- **`components/Breadcrumbs.js` never reads.** Every crumb label comes from data the calling
  page already loaded under its own gate. A crumb that looked a name up for itself would be
  a second copy of that gate, and could say what the page refuses to — the trade detail
  page's not-found wording deliberately does not reveal whether a private draft exists.
  It also stays hook-free with no `'use client'` (server pages and client components both
  mount it), uses plain `<a>`, and **drops any non-final crumb without an `href`**: a middle crumb links only to a route with a
  `page.js`, and several URL segments here have none. **Error and not-found branches keep
  their own link rows on purpose.**
- **No trail carries a Cap Sheet crumb** (Lewis, November 10, 2026, UI test batch 6: "Home" is
  the signed-in owner's own team). Home goes to `/`, which sends a linked owner to his Team HQ, so
  his own team page's trail is Home alone, another team's is Home > that team, and the Player
  Card's is Home > his team > him (Home > him for a free agent). **Do not put Cap Sheet back in a
  trail**; it lives on the Owner's office tile and in League Office's page index.
- **The trail is drawn under the app bar** (Lewis, October 18, batch 2; the league title row below it left in batch 17),
  in 12px on one line, the current page ellipsing (and, since batch 6, any middle crumb, so two
  long names cannot push the row past a phone; Home never shrinks). Pages still mount `<Breadcrumbs>` where they
  always did; it hands the trail to `components/CrumbPortal.js`, which portals it into
  `#edfl-crumbtarget` in `AppBar.js` after mount. The slot shows "Home" until then, so the row
  never changes height. A page without the bar gets the trail inline, as before.
