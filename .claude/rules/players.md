---
paths:
  - "app/players/**"
---

# The Players screen

One player list behind the Players button, and the claim sheet. Loads with `app/players/`.

- **The Players button opens `/players`** (UI test batch 11, November 11, 2026: Lewis's Option A
  on the Claude Design canvas "EDFL Players section (test site)", "Use this as the Player tab").
  One list with a switch (Free agents / Waivers / Poachable / All), seven position pills,
  "Remove players on: IR · Injured · Bye", a sort (this week's projection by default, Lewis; 2026
  points the other choice) and three market cards. `/free-agency`, `/poaching` and `/waivers`
  stay as they were and are still reached from League Office's index and the windows pill.
- **The page decides nothing and computes nothing.** Every status (free agent, on waivers,
  poachable, rostered, mine), action (offer, claim, poach), rank, band, tint, floor, count and
  the order is a column of `edfl_players_rows()` or `edfl_players_counts()` (SECURITY DEFINER,
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
