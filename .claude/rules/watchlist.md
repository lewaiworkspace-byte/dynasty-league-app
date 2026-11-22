---
paths:
  - "app/watchlist/**"
---

# The Watchlist tab

The owner's watchlist behind the view row's Watchlist button. Loads with `app/watchlist/`.

- **The Watchlist is a source of the Players tab** (UI test batch 33, November 21, 2026,
  Lewis's canvas "EDFL compact top bar options", Round 3, Option 6; players.md): the view
  row's Players button is lit here and the clipboard chip on the filter line opens it. It was
  its own view button from UI test batch 22 (Lewis's canvas "EDFL Watchlist (main tab) --
  layout options"). **No page title** (the app-wide rule); the trail is Home › Watchlist.
- **The page decides nothing and computes nothing.** One read, `edfl_watchlist_rows()`
  (SECURITY DEFINER, `authenticated` only, read with the **session** client: it finds the
  viewer's team through `auth.uid()`), returns each watched player's Players columns (status,
  action, rank, band, tint, injury, game, `sort_value`), its `watch_group` (poach / fa /
  waivers / trade), the marker's tier and `effective_visibility`, the shared-with team, the
  added time, `cap_years` (this season and the next four; null for a void or missing season),
  and for a wire player the claim figures from `edfl_waiver_claim_preview()` and the signing
  bonus. It filters (view, position, team, contract runs through, injured) and sorts (the
  Players sort keys) itself. **Do not filter, sort, group-by-rule or compute in JavaScript**;
  the page only splits the rows by the `watch_group` the database named, in its order. The
  viewer's own players never come back, and an observer or a login with no team gets none.
- **The layout is Lewis's** and each piece is his decision. **Since batch 33 the controls are
  `components/PlayersBar.js`'s** (players.md): the clipboard chip and the positions on the filter
  line; the title line "Watchlist · <view> · <n>" with the menu All · Trade · Free agents ·
  Poachable · Waivers, search ("Search your watchlist", `?find=1`), the **"+" that adds
  players** (opens `/players?find=1`) and the sort; and the **Filters tab and sheet**
  (`?sheet=filters`; the old `?sheet=filter` opens it): which list, the view, team (the other
  teams plus Free agents, read from `teams`), contract runs through (from `league_config`'s
  season, never a literal year), and leave out injured or IR. The sort sheet is the Players
  tab's, exactly; **do not add watchlist sorts** (contract end, cap, date added are out unless
  Lewis asks). **Act now** comes first (Poachable, Free agents, On waivers, each with its
  one-line empty state), then **Trade targets**.
- **Cards.** Act now: option C's scout card (two tiles, the poach-floor box, the claim box).
  A trade target: the Players row (`rc-row` / `pl-row`, so the two lists cannot drift) with
  C's year-by-year cap strip under it; **A's contract text is dropped**. **No PPV anywhere but
  the poach floor.** Money goes through `formatCost`. The claim box's wording follows 5.15(i):
  the salary he would take on, and that his signing bonus stays with the waiving team.
- **The who-sees-it chip is on every card** and opens the tier sheet (`?sheet=tier&p=<id>`):
  Private, Shared with <holder>, League, worded as on the canvas (WL-2/3/4/5/8). The chip
  shows `effective_visibility` (a shared marker reverts to private when he changes teams).
  Shared is disabled when no team holds him. The choice calls `watchlist_set()`; its refusal is
  shown verbatim.
- **The clipboard removes him, with an Undo bar** (`WatchControls.js`): `watchlist_remove()`,
  then `watchlist_restore()` brings back the same marker, tier and added date within 15
  minutes. The three writes are `actions.js`, on the session client, returning refusals.
- **What the buttons open:** Trade → `/trades/new?with=<contract id>` (the builder with him on
  his team's side); Make an offer → `/free-agency?offer=<id>`; Poach → `/poaching?bid=<id>`
  (today's forms; the offer sheet waits for the contract-building chat); Claim →
  `/players/claim/<placement>`; Player card → `/player/<id>` (the Mini Player Card).
- **Out of scope until Lewis asks:** change flags ("Now poachable", "Traded to ROO"), a
  per-team "Build a trade", a laptop-specific layout (one centred column), and any reading of
  the watchlist by Dianna (WL-10: never).
