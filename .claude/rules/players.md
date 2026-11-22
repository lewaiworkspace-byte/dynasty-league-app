---
paths:
  - "app/players/**"
  - "components/PlayersBar.js"
---

# The Players screen

One player list behind the Players button, and the claim sheet. Loads with `app/players/`.

- **Players is ONE TAB, a top-bar tab** (UI test batch 33, a view-row button until batch 38, November 21, 2026: Lewis's canvas
  "EDFL compact top bar options", page "Round 3", Option 6, with his comments; navigation.md).
  Its sources are **My roster** (Team HQ `?tab=roster` on the owner's own team, team-hq.md), the
  **Watchlist** (`/watchlist`, watchlist.md) and **the market lists** (this page). Each source
  keeps its own page, data and rules; **all three draw `components/PlayersBar.js`**, so the
  controls are the same everywhere: (1) **the filter line**, one line that never scrolls
  sideways: the jersey (My roster), the watchlist clipboard (`watchlist-on.webp`, Lewis: "match
  our watch list icon"), a divider, then QB RB WR TE Flex K. **No "All" chip**: nothing lit is
  every position, and tapping the lit chip clears it. Each chip is drawn 32px inside a 44px tap
  area (Lewis: the pills were "too big"; all six positions must fit, "Kicker filter isn't
  here"). (2) **The title line**: the list's name and count, a menu where the source has one
  (the squad on My roster, the view on the Watchlist and here), an explain icon where the list
  has one, search, the Watchlist's "+" and the sort. (3) **The Filters tab** at the foot of the
  screen (Lewis: "a small Filters thing ... that lets the user know there is a drawer here to
  pull up") opening **the Filters sheet**: which list to show, then the source's own filters.
  PlayersBar is presentation only (no hooks; links on server pages, buttons on the roster
  list). The trail is Home › Players.
- **The Players button opens `/players`** (UI test batch 11, November 11, 2026: Lewis's Option A
  on the Claude Design canvas "EDFL Players section (test site)", "Use this as the Player tab").
  One list of four views (All / Free agents / Waivers / Poachable; **All first and the
  default**, Lewis, batch 17), position, "Remove players on: IR · Injured · Bye", a sort (this
  week's projection by default, Lewis). Since batch 33 the views are the title line's menu and
  the Filters sheet's Show group (`?sheet=filters`); the positions are the filter line; IR /
  Injured / Bye are the sheet's "Leave out" group; **the three market cards left the page and
  their wording is the Show group's notes**; search opens from the title line (`?find=1`, and
  stays open while a term is set). **No page title and
  no (i) on the page** (batch 17, Lewis: "Remove all of these info icons that just explain what
  the overall page is"; the title is redundant with the lit button and the trail, an app-wide
  rule); a figure's own "explain this" icon is a different thing and is welcome.
- **The sort is a sheet** (batch 17, `?sheet=sort`, drawn by the server; every choice is a
  link): this week's projection, season points, and completion %, passing yards, passing TD,
  interceptions, rushing attempts, rushing yards, rushing TD, receptions, targets, receiving TD
  and fumbles, High to low or Low to high (`dir=asc`). Lewis: "all for the current season or
  latest season if during the offseason". Snap % was asked for and has no source in the
  database: **do not draw it until a source exists.** The read is `edfl_players_rows_v2()`
  (`p_desc`; returns `sort_value` and `stat_season`); while a stat is the sort, the row's
  figure column shows that stat as the database returned it.
- **The watchlist icon is on every row, in every view, for a login with a team** (batch 21,
  Lewis, November 15: faint clipboard with no check by default; the full-colour clipboard with
  the green check once added; Offer / Claim / Poach moved below it on a phone, beside it on a
  laptop). `WatchButton.js` flips it at once and calls `actions.js` ->
  `edfl_watchlist_toggle()`, which resolves the team from `auth.uid()` and returns
  `{ ok, watching }` or a refusal; a refusal puts the icon back. One watchlist per team, read
  once per page with `edfl_watchlist_ids()`. **The store is Rule 7.9's `watchlist_markers`**
  (batch 22, test migration watchlist_01 re-pointed both functions: adding makes a private
  marker through `watchlist_set`, taking off is `watchlist_remove`); batch 21's
  `player_watchlist` table is retired. **Do not add a second store.** **Your own players show
  no clipboard** (status `mine`, an empty spot `.pl-watch-none` keeps the column): the
  watchlist is for other rosters and `watchlist_set` refuses your own. A trade-block button
  there is Lewis's open question; do not add one until he answers. The Watchlist tab is
  watchlist.md. `/free-agency`, `/poaching` and `/waivers`
  stay as they were and are still reached from League Office's index and the windows pill.
- **The page decides nothing and computes nothing.** Every status (free agent, on waivers,
  poachable, rostered, mine), action (offer, claim, poach), rank, band, tint, floor, count and
  the order is a column of `edfl_players_rows_v2()` or `edfl_players_counts()` (SECURITY DEFINER,
  `authenticated` only, read with the **session** client: they find the viewer's team through
  `auth.uid()`). **Do not filter, sort, rank or decide a button in JavaScript**, and do not
  re-sort the rows. "Injured" means Questionable, Doubtful, Out or PUP (Lewis's reading,
  November 11); the database applies it. A search term searches every player whatever the
  switch says ("Search every player").
- **The URL is the state.** Every control is a plain link that changes the query string and the
  server reads again; only the search box is a client component. A failed list read shows its
  error and no list (a content read fails closed, ui-patterns.md); a failed counts read says the market status is unknown.
- **Rows reuse the Roster tab's row** (`.rc-*` classes and `RosterFace` from
  `app/team/[teamId]/RosterList.js`), so the two lists cannot drift: the face is ringed in the
  position colour (the Roster badge tokens) and the badge is drawn only on a laptop;
  projection big over 2026 points small (Lewis); the injury pill and tints as on Roster. No
  value chart line and no research tiles (Lewis struck both); Value Chart, Statistics and Draft
  Prospects are reached from League Office's index only, for now (Lewis).
- **What the buttons open.** The canvas's offer sheet is ON HOLD for a separate
  contract-building chat (Lewis, November 11), so **Offer** goes to `/free-agency?offer=<id>`
  and **Poach** to `/poaching?bid=<id>`, which open today's form on that player. Do not build
  an offer sheet here until that chat rules. **Claim** opens `/players/claim/<placement>` in
  the pop-up sheet. A rostered player has no button; an observer has none (the database gives
  him no action).
- **The claim sheet shows what a claimant takes on, from the engine:**
  `edfl_waiver_claim_preview()` is the receiver side of `compute_trade_charges()`, the call
  `waiver_settle_claim()` makes at the run. Its box reads, by Lewis's agreed wording (Rule Book
  5.15(i)): "If I win this claim, I take on his salary from the waive onward, including the full
  week I get him. His signing bonus stays with <waiving team>." **Do not reword it to "take
  over his contract"**: the bonus proration stays with the waiving team. Submit stays off until
  the box is ticked (presentation); it submits through `app/waivers/actions.js` `submitClaim`,
  the one path into `submit_waiver_claim()`, and shows the refusal verbatim. Money on the sheet
  is `formatCost`, each figure as the database gives it; nothing is added up in JavaScript.
