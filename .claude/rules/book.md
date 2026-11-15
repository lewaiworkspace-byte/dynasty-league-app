---
paths:
  - "app/book/**"
---

# The Book (betting tab, test site)

Loads with `app/book/`. UI test batch 24, November 15, 2026: Lewis's approved Phase 1 design
(canvas BpZzrSduVRZtxsfRu5D98e, version 1794772617-41fa) on the test site only (ruling BT-9).
UI test batch 25, the same day: Phase 2, player bets and parlays (canvas YLHTHMMNbmi7fwWyLvRND6,
handoff EDFL_Book_Design_Phase2_Handoff_2026-11-15.zip; the boards marked BUILD in its §1).

- **The database decides every bet.** `book_place_ticket` (every bet, single or parlay),
  `book_deposit` and `book_cash_out` (test database, migrations `book_02`, `book_06_weekly_limit`,
  `book_07_tuesday_open`, `book_09_phase2_engine`) judge the stake, price, lock, Pete's Picks, the
  weekly limit, the caps, the balance, the House floor and the Longshot Reserve, and RETURN
  `{ ok: false, reason, leg?, ... }`. `app/book/actions.js` passes that through and `bookFormat.js`
  `refusalText()` words it. `book_place_bet` is now only the database's one-leg wrapper: the app
  does not call it. **Mirrored for early warnings only:** `toWin`/`parlayToWin`, `maxStakeFor`/
  `parlayMaxStake`, `petesPicksAllows`, the lock greying, and `legBlock` (why a price can't join the
  parlay: Full, 1 per game, 1 per player, Feeds a leg, Your player, Your game, Locked). When a mirror
  disagrees with the database, the database is right. **Never add another rule in JavaScript.**
- **All five views are one route, `/book?view=board|bets|account|records|house`**, with `week`,
  `team` and `f` parameters, read in `page.js` through the SESSION client (every `book_` function
  is SECURITY DEFINER, `authenticated` only, and resolves the team from `auth.uid()`).
  `book_week_board(week)` is the spine: it settles what is due, posts a week's game and player lines
  once the week is open, and returns the board, `limits`, `rules`, `weeks`, `account`, `house` and
  `my_tickets`. The board view also reads `book_week_props(week)` for the Players tab; if that read
  fails, Games still works and Players says so. **A failed board read draws nothing that could pass
  for a line or a balance.**
- **The weekly limit is 50% of the account at the week's opening** (BT-47–52, BT-61–62):
  `limits.limit`, `limits.staked`, `limits.left`, all from the database. Every stake counts, parlays
  included. **Do not bring back "x of 5 bets"**: retired by BT-47. In the playoffs `limits.playoffs`
  is true and the limit and every max win are null.
- **A week opens at its Tuesday pay instant and never before** (BT-61): before then the board draws
  "Week N opens Tuesday" with `opens_at`. The opening instant is `book_week_opens_at()`; on the test
  database a row in `book_demo_opens` may open a week earlier for a demo (2026 Week 11, Lewis,
  November 15). The app reads `opens_at`/`market_open` and never `league_weeks.charge_at` itself.
- **Money is cents on every Book screen** (`formatCents`, `formatCentsDelta`); a caption that adds or
  subtracts two database figures does it in whole cents. Profit shown is the database's
  `net_result` ("Net so far"), never a sum of tickets; a won ticket shows `paid` (after pushed legs).
- **The approved layout** (do not rework without a new design): the week pager, the Book's own
  header, the pills Board · My bets · Account · Records, then on the Board the account strip, the
  tabs **Games · Players · Futures (Later)**, and Board 2's matchup cards (own first with a teal 2px
  border and "Pete's Picks", then by lock time). The four Phase 1 button states (selected, held,
  locked, Pete's-Picks-blocked) stay; Phase 2 adds **in the parlay** (filled teal) and **can't join**
  (dashed, struck through, the reason in place of the price; a tap says why). The slip is a bottom
  sheet on a phone and docked right from 1024px above "My open bets".
- **Players board** (Phase 2): search, position buttons, Group (By matchup / By team) and Sort, the
  stat chips Points · Yards · TDs · Catches · Kicks (Yards = QB passing, RB total, WR and TE
  receiving; TDs = QB passing, total for the rest; `chipMarket()`), one card per matchup with yours
  first, the top 8 then "Show all N players". A missing line reads "No line this week". Tap a name
  for every bet on him (the player sheet). From 1024px it is a table: Points · Yards · TDs · kicks ·
  Catches. **Your own players are overs only** (BT-31): the under is greyed "Your player".
- **Parlays are option B, the tray** (Phase 2): the single slip's "Add to a parlay" starts it; while
  the tray holds a leg, a tap adds or removes that leg. `BookBoard.js` stays mounted across the
  Games and Players tabs so the tray survives a switch. The tray rides above the office row on a
  phone; from 1024px the parlay slip is docked instead. The parlay slip: legs with remove, Add a leg,
  combined price, stake and to-win, quick stakes, the max-win ladder (1-5 legs; 4-5 in the Reserve
  colour), the weekly-limit bar, Balance after, Backed by, Locks, Place parlay. A stake over the cap
  is trimmed with a message; over the limit or balance is red and disabled; more than the House or
  Reserve can cover offers the largest stake it can take.
- **My bets lists every leg of a parlay** (MB-list-390): ✓ won, ✗ lost, – pushed (struck through,
  with the reason), ● live, ○ not started; a pushed leg adds "Now a N-leg parlay: old → new price,
  max win".
- **Not built yet:** Futures (Phase 3, placeholder "Later"); season-long player bets and long-range
  parlays come with the pre-season board in Phase 3 (they are pre-season only, BT-43); the trade
  screen's "an open bet on that team becomes a push" warning. **Explanations are `ExplainButton`
  cards**, never paragraphs (ui-patterns.md).
- **Contrast** (Phase 2 handoff §7): teal text on a tinted surface uses `--bk-neon-text`, never
  `--neon`; filled teal buttons set `--neon-ink` explicitly.
