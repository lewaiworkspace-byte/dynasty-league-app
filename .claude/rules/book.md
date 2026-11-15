---
paths:
  - "app/book/**"
---

# The Book (betting tab, test site)

Loads with `app/book/`. UI test batch 24, November 15, 2026: Lewis's approved Phase 1 design
(canvas BpZzrSduVRZtxsfRu5D98e, version 1794772617-41fa) on the test site only (ruling BT-9).

- **The database decides every bet.** `book_place_bet`, `book_deposit` and `book_cash_out`
  (test database, migrations `book_02`, `book_06_weekly_limit`, `book_07_tuesday_open`) judge the
  stake, price, lock, Pete's Picks, the weekly limit, the $75 cap, the balance and the House
  floor, and RETURN `{ ok: false, reason, ... }`. `app/book/actions.js` passes that through and
  `bookFormat.js` `refusalText()` words it. **Three things are mirrored for early warnings only**
  (`toWin`, `maxStakeFor`, `petesPicksAllows`, plus the lock greying); when they disagree with
  the database, the database is right. **Never add a fourth rule in JavaScript.**
- **All five views are one route, `/book?view=board|bets|account|records|house`**, with `week`,
  `team` and `f` parameters, read in `page.js` through the SESSION client (every `book_` function
  is SECURITY DEFINER, `authenticated` only, and resolves the team from `auth.uid()`).
  `book_week_board(week)` is the spine: it settles what is due, posts a week's lines once the
  week is open, and returns the board, `limits`, `rules`, `weeks`, `account`, `house` and
  `my_tickets`. **A failed board read draws nothing that could pass for a line or a balance.**
- **The weekly limit is 50% of the account at the week's Tuesday 12:00 AM opening** (BT-47–52,
  BT-61–62): `limits.limit`, `limits.staked`, `limits.left`, all from the database. **Do not
  bring back "x of 5 bets"**: the 5-bet count was retired by BT-47. In the playoffs
  `limits.playoffs` is true and the limit and max win are null: the strip reads "None" and the
  slip's cap bar reads "No max win in the playoffs · House floor still applies".
- **A week opens at its Tuesday pay instant and never before** (BT-61): before then the board
  draws "Week N opens Tuesday" with `opens_at`, not an empty board.
- **Money is cents on every Book screen** (`formatCents`, `formatCentsDelta`); a caption that
  adds or subtracts two database figures does it in whole cents. Profit shown is the database's
  `net_result` ("Net so far"), never a sum of tickets.
- **The approved layout** (do not rework without a new design): the week pager, the Book's own
  header (the 60px betting logo, "The Book", "Owner Cash only · no real money"; no big page
  title), the pills Board · My bets · Account · Records, then on the Board the account strip
  (Balance · Left this week · Max win), the tabs Games · Players (Later) · Futures (Later), and
  Board 2's matchup cards: your own first with a teal 2px border and "Pete's Picks", then by
  lock time. The four button states are selected (filled teal), held (teal outline), locked
  (dashed, lock, "Locked") and Pete's-Picks-blocked (dashed, struck through, ban icon, "Your
  game", which opens "Can't take this bet"). No plain-English sentence under the win-chance bar
  (Lewis removed it). The slip is a bottom sheet on a phone and docked right from 1024px above
  "My open bets". The House opens from Account's link card and lights Account.
- **House health** (presentation, Claude's call): Can't take bets when `house.room` ≤ 0, Tight
  below ten single max wins, Healthy above.
- **Not built in Phase 1:** Players, Futures and parlays are placeholders ("Later"); the
  pre-season board is Phase 3; the trade screen's "an open bet on that team becomes a push"
  warning waits for the database side of BT-36. **Explanations are `ExplainButton` cards**, never
  paragraphs (ui-patterns.md).
