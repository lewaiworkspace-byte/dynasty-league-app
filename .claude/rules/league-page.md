---
paths:
  - "app/league/**"
---

# The League page

Five summary boxes, each linking to its full page (UI test batch 15, Lewis, November 14,
2026, Option B of the Claude Design canvas "EDFL League tab (test site)").

- **The boxes and their order are Lewis's**: Standings, Key Injuries, Recent Transactions,
  Cap Space, Key Dates (phone order; from 1024px the grid puts Standings, Key Injuries and Cap
  Space across the top). **Matchups and scores are not on this page** and do not come back
  here: they get a section of their own. Each box is a summary; the full page it links to
  is the authority, and a figure here never disagrees with it because both read the same view.
- **Every read is one call, `edfl_league_page_reads(since, now, tx_cap)`, through the session
  client** (UI test batch 44, November 22, 2026; it was eleven requests in three rounds). It runs
  as the signed-in viewer (SECURITY INVOKER), and each part is `{ data, error }`, so each box
  still fails on its own. `league_injury_report`, `league_transaction_log` and
  `player_week_projections` are granted to `authenticated` only: through the anon client they
  return nothing, and an empty Key Injuries box reads as "nobody is hurt". **Do not move the call
  to `lib/supabaseClient.js`.** A new box's read becomes a part of the function (in the project
  chat), not a request of its own. If the whole call fails, every box shows its message.
- **Each box fails on its own.** A read that is a box's content fails that box closed (an error
  line in the box); a failed points read leaves the list in place and says it is not in points
  order. **Do not wrap the page in one error banner** -- one bad view would blank five boxes.
- **The orderings are Lewis's display choices, not league rules**, and live in
  `leagueModel.js`, nowhere else: Key Injuries by 2026 EDFL points (rostered players with a
  designation); Recent Transactions over the last seven days, signings and practice-squad
  promotions (`roster_active` with `detail.from_status = 'taxi'`) by next week's projection,
  every other move by points per game, extensions with the other moves, a player once on his
  newest move, and never in both groups; lost and withdrawn offers left out. "Next week" is the
  first league week whose `first_game_at` is still ahead.
- **Key Dates read `league_calendar` rows with `source = 'event'` only**; the weekly "Week N
  begins" rows are `source = 'week'` and Lewis asked for them to stay off. A window open now is
  listed at the day it closes. Every date label is the view's own Eastern string.
- **The cap in the Cap Space title is `league_cap_settings.fantasy_salary_cap` for the current
  season, never a literal** (Lewis: "set it up so that it automatically updates each year").
  Room is `formatRoom`, as on the Salary Cap page.
- **The Per game | Total switch is two radio inputs and CSS** (kit.css, November 14 block). It
  needs no client code and reads no clock; keep it that way. Figures are whole numbers cut
  toward zero (Lewis: "round down to whole numbers"), so a -56.21 difference reads -56.
- **The explanations are behind the explain icon beside the heading**, never a paragraph on the
  page (ui-patterns.md). A team count in them comes from data, never a literal.
