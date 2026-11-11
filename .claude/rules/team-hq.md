---
paths:
  - "app/team/**"
  - "components/PoachAlert.js"
  - "components/ComplianceBanner.js"
  - "components/ComplianceCountdown.js"
  - "components/TaxiReturnNotice.js"
  - "components/PracticeSquadWarning.js"
  - "components/DraftPicksPanel.js"
---

# Team HQ

The owner's front door: its four views, the Overview's blocks, the roster bar, the roster rows, the On Waivers section, alerts and the Media view.

- **Team HQ has four views and NO TAB ROW** (UI test batch 7, November 11, 2026, Lewis on the
  Team HQ canvas: "Drop these tabs, they have been replaced by the new tabs at the top and
  bottom"). The view is the URL's `?tab=`: none is the Overview (Home; `/` sends a linked owner
  there), `roster`, `money`, and `media` on the owner's own team only (MEDIA-1: another owner's
  HQ falls back to Overview). `TeamCapSheet` takes it as a constant from `page.js`; every way in
  is a plain link: the view row's Roster and Media (own team), the Owner's Office "Money" tile,
  and on ANY team's Overview the Roster heading and meters (`?tab=roster`) and "Exact figures on
  Money" under the cap bar (`?tab=money`). **Do not bring the tab row back, and do not make a
  view reachable only by an in-page button.** Money is the old Overview grid unchanged.
- **The Overview's blocks, in order: Salary cap, This week, Position rankings, Roster, Coming
  up** (batch 7). "Your recent moves" and its two buttons left (Lewis: "Drop 'Your recent moves'
  from the Home Page"; `/transactions` is in League Office, `/draft-picks` in Analyst's Office),
  and so did the owner directory (it is `/office/owners`; an owner edits his own card in
  Settings): **do not put either back on Team HQ.** **No rule numbers on the Overview** (Lewis:
  "Drop this rule reference"): the roster note and the nine boxes' hover text say what a figure
  means, never which clause.
- **Position rankings (`PositionRankings.js`) decides nothing and adds nothing up.** Every
  figure, rank and difference is a column of `edfl_team_position_rankings(p_season)` (SECURITY
  DEFINER, `authenticated` only, read with the **session** client); `page.js` keeps the team's
  seven rows (QB, RB, WR, TE, K, FLEX, ALL) and the number of teams returned. Lewis's design,
  November 11: rows lead with **production** (points a week from that position's starting
  spots, rank pill, league average); **only the "vs league" chip is coloured, against the
  league, never against 100% of projected**; beating projections is a small uncoloured line
  (every rostered player, against the league's same figure); FLEX is the **Depth** row with
  which positions filled it, and the blurb under the table follows the read-back thresholds
  (every / nearly every at 90% / most at 60% / split), descriptive only. The explanation is in
  the explain icon's card, never a paragraph on the page. **Do not compute a rank, an average or
  a percentage here**, and do not colour by projection.
- **There is no compliance banner on Team HQ** (Lewis, October 18, batch 2: removed in
  both states; the app bar's pill says in or out and opens `/roster-audit`).
  `ComplianceBanner.js` stays for its `ComplianceChip` on `/cap-sheet`. The Overview's roster
  counts are columns of `team_inseason_compliance`, so **no roster is counted in
  JavaScript**. A count at its limit is gold, over is rust, and
  **under a limit is not a failure** — short of 25 is legal, by ruling.
- **The Overview roster bar is four linked meters and five linked position rows, and decides
  nothing** (UI test batch 1, October 17, 2026, from Lewis's October 12 comment on the nine
  boxes: "find a cleaner way to present these buttons"; of the meters and the table, "that is
  better"). The four squads against their limits carry a bar whose width is used over limit,
  a ratio of two view integers; QB/RB/WR/TE/K are rows under an Active · IR · PS header. Every
  figure is a column of `team_inseason_compliance` (`qb_ir_count`, `qb_taxi_count` …, appended
  by `psx_04`). **Red is the view's verdict only**: `*_over_by`, `ir_no_designation_count`,
  `*_short`, `flex_short`; an over row or box takes the red notice ground. Each is an `<a>` to
  `/team/<id>?tab=roster&show=<key>`; `page.js` reads `searchParams` and `TeamCapSheet` opens
  on that tab and filter (`ROSTER_FILTERS` is the vocabulary — add a box there and in
  `rosterHref`, never a second list). **Do not turn them back into `<div>`s, do not add a
  `/ 3` to QB or K** (RB/WR/TE have no limit and the row would read as a target), and do not
  compute a shortfall in JavaScript — the view already did.
- **The Roster view has no team banner and no Cap Room / Cash / Record / Waiver strip** (UI
  test batch 10, November 11, 2026, Lewis on the Roster canvas: "Remove" / "Remove all of
  this", Roster only). `page.js` draws `.edfl-hero` and `.edfl-railband` on every other view.
  **Do not draw them on `?tab=roster`.**
- **The Roster tab's "not on a rookie deal" filter (the meter's link, `?show=taxi-nonrookie`, applied by `RosterList.js`) reads `taxi_eligibility_status.ps_rule_subject`,
  not `contract_type`.** RB 3.3(b) counts an out-of-class rookie as a non-rookie, and so does
  the view's `ps_non_rookie_count`; a `contract_type` test would disagree with the box that
  linked here. `page.js` keeps **every** row of that view in `taxiByContract` for the same
  reason (it used to keep only rows with a `warning`); the weeks badge still renders on
  `warning` alone.
- **The two practice squad designations are one Server Action each and both are second
  calls** (their buttons are on the Mini Player Card since batch 10). `setPoachExemption` → `ps_exempt_set()`; `setTaxiHold` →
  `taxi_hold_set()`. The Move dialog's hold checkbox fires **after** `set_roster_status` has
  succeeded and its refusal is shown beside the result — **never undo a promotion because a
  hold was refused**. The two-at-a-time exemption limit, the 24-hour grace, "is he elevated",
  "is he locked" are all the database's (`edfl_ps_poach_exempt`, `edfl_ps_poachable_from`,
  `edfl_taxi_revert_subject`, `edfl_taxi_locked`); the controls are offered where the view says
  they apply and count nothing. `/poaching`'s **Your exposure** mounts the same
  `setPoachExemption` — one caller per surface, no second RPC. The `EXEMPT` chip is shown to
  every owner **by ruling**; do not hide it behind `isMine`.
- **`PracticeSquadWarning` renders `hold_note` as well as `warning`, and either is a render
  condition.** A held player with no counted weeks has a `hold_note` and no `warning`; the
  owner still needs to see why the Tuesday return did not move him.
- **Team HQ's waiver tile shows the order the next scheduled run will use.** It finds the run
  with `nextScheduledWaiverRun()` and calls `waiver_priority_order()` with
  `waiverPriorityArgs()` (both `lib/waiverPriority.js`), exactly as the wire's chip does, so
  the arguments are the run's own (the weeks before its own). That run read is separate from
  "Coming up", which skips an overdue run. **Never call the function bare here:** the
  defaults, "this season, every week scored so far", are not the run's order. With no
  scheduled run the tile reads "no waiver run scheduled"; a failed run read says "could not
  be read". The order moves with every sync while a
  week is unfinished, so **any surface showing it says provisional**. Priority is **lowest
  points for**, never record. (Settled October 7, 2026, batch 3; it replaces the October 6
  *Under review* entry.)
- **The Roster tab is Option C** (UI test batch 10, November 11, 2026: Lewis's pick on the
  Claude Design canvas "EDFL Roster tab (test site)", with every markup he made on it;
  `RosterList.js`). Top: Season dropdown with the explain icon (the ordering sentence, the rank
  bands and the colour key live in its card, never on the page); the **squad switch** (Active /
  Practice squad / IR, one at a time, counts from `team_inseason_compliance`) **above** the
  position pills; **seven equal pills** (All QB RB WR TE Flex K) in one grid line; "WEEK n ·
  PTS / PROJ". One row per player: position badge (QB orange, RB blue, WR green, TE yellow, K
  pink), photo, name; `POS • TEAM (bye) · QB5` with the rank coloured by band; `Start 78%` or
  `Start: RB 67%, FLEX 22%`; this week's game (`Sun 1:00 PM @ GB (2nd)`, `(N, 32nd)` neutral,
  `Bye week`, `No NFL team`); this week's points (– before he plays) over the projection. **No
  money, contract year, status tag, footnote or button on the row** (Lewis: "Remove this line",
  "Remove this"): tags, the roster spot and the designations are on the Mini Player Card
  (player-card.md), Cut on the full card (its link lands on `?tab=roster&cut=<contract>`, which
  opens the Cut dialog). **The white injury pill** (cross and QUES / DOUBT / OUT / IR / PUP) sits
  in the row's top-left corner with the badge slid down below it, and opens
  `/player/<id>/injury`. **Row tints:** red for IR, Out, Doubtful or PUP; yellow for any other
  designation; grey on a bye week, **a bye winning over an injury tint** (the pill still shows).
  Tint and rank inks are kit.css tokens re-pointed on tinted rows **and on the selected row**
  to clear 4.5:1 (SR-61; the dark red rank measured 3.97 on the selected fill before). Under
  375px the detail lines wrap instead of ellipsizing (the name alone keeps its ellipsis). **One
  face component, `RosterFace` in `RosterList.js`**, is used by the rows, the Mini Player Card
  and the injury report; it keeps the old roster face's check of a headshot that failed before
  hydration (`complete && naturalWidth === 0`): without it a missing photo shows a broken image.
  **Every rank, band, percentage, bye, opponent, opponent rank, points figure, short label and
  tint is a column of `edfl_team_roster_rows(team, season, week)`** (`page.js`, session
  client): **do not rank, divide, band or tint in JavaScript.** A tap on a row opens the Mini
  Player Card: the sheet on a phone (the row is a plain `/player/<id>` link); from 1024px a
  panel beside the list (an iframe of `/player/<id>/mini` named `edfl-panel`), refreshed from
  the panel's `edflPanel: 'changed'` message. **Do not bring the old columns, buttons or tags
  back onto the row.** The On Waivers section is still a table.
- **The roster's order is the projection, set in `page.js` and never re-sorted** (Lewis's
  ruling, batch 5: "the row order should be by highest projected fantasy points"). Highest
  `player_week_projections.proj_points` for the projection week first (the matchup tile's week,
  or the next once it is final; withdrawn rows excluded); **no projection last, by cap hit**;
  then by name. The same order in every season and under every pill. Projections are
  `authenticated` only, so they are read with the **session** client for a signed-in viewer;
  a signed-out visitor gets cap-hit order and a line saying so, and a failed read says so in
  red. **There is no sort control** — do not add one back.
- **One squad and one position at a time** (batch 10). `?show=` from the Overview's roster bar
  still works: `active`, `taxi`, `ir` and `taxi-nonrookie` choose the squad, a position key
  the pill. The squad switch is drawn on the current season only; another season's list is
  every contract that season, by position.
- **The practice squad badge and warning read `locked` and `last_demotion_available`.**
  Three counted weeks do not end eligibility; they buy one last demotion. The urgent tone
  belongs to `last_demotion_available`, not to a week count.

- **A player this team has waived and who is still pending on the wire is drawn ONLY in the
  Roster tab's "On waivers" section**, under the main table, in every season's view — never in
  the Active / Practice squad / IR section his `roster_status` still names. A waived contract
  stays `status = 'active'` with its old `roster_status` until the run settles it, so the
  contracts read returns it; `page.js` marks it from `waiver_placements` (`outcome =
  'pending'`, the same predicate as `edfl_on_waivers()`) and `TeamCapSheet` filters it out of
  the main table. Ruling W-10: he is off the roster immediately; the database already leaves
  him out of `team_inseason_compliance`, `team_roster_by_season` and the slot triggers, so the
  table now agrees with the roster bar. **Do not count him back into a section, and do not
  give the section Cut, Move or designation controls.** His cap hit and cash stay on the team,
  worst case, until the run — the Money tab is unchanged.
- **The wire read fails CLOSED with a banner**: without it the waived player would reappear in
  his old section, which is the exact wrong answer the section exists to prevent.

- **There is no negotiating-windows block on Team HQ** (UI test batch 5, October 22, 2026,
  Lewis's note on the Roster design canvas). The app bar's windows pill carries it on every
  page (navigation.md); `components/NegotiationWindows.js` and its two buttons are gone and
  `page.js` no longer reads `open_negotiation_windows()`. **Do not put a windows list back
  above the tabs.** `PoachAlert` is unaffected: the red strip above the tabs is still the
  "someone is poaching *your* player" alarm on the owner's own HQ.

- **`components/PoachAlert.js` decides nothing and is drawn on the owner's OWN Team HQ only**,
  above the tabs (ruling: the team being poached is told "on the app home page",
  and Team HQ is the front door). It calls `my_poach_alerts()` through the **session** client —
  the function reads `auth.uid()` and returns only that owner's open poach windows, his own
  "have I bid" flag, the Eastern deadline label and the "how to keep him" sentence. **It never
  returns who opened the window, another team's bid, or any terms**, and the component must not
  look any of them up. A failed read renders a quiet line, never nothing.

- **The Tell Dianna form can never read the watchlist**, and must never be made to
  pre-fill, suggest or display from it (WL-10). The friendliest possible convenience —
  "you're watching Bowers, want Dianna to know?" — would put a watchlist read into the code
  path that feeds a bot. An owner who wants her to know types it again. In the database the
  same boundary is a role named `dianna` with no watchlist-shaped grant; **do not add a
  policy for that role to any table.**
- **`insider_submit()` decides everything about a submission; the form decides nothing.**
  A third-party subject locks the tiers to *leak* in the form for the owner's benefit; the
  CHECK constraint is the rule.
- **`components/PracticeSquadWarning.js` renders on `warning` being non-null and nothing
  else.** The draft-class rule lives in `edfl_taxi_rule_subject()`; the view returns null for
  a player the rule does not cover. Do not add a class test to the component.
