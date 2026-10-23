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

The owner's front door: tabs, the roster bar, the roster rows, the On Waivers section, alerts and the Media tab.

- **Team HQ is three tabs for a visitor — Overview, Roster, Money — and four for the
  owner himself**, the fourth being Media (MEDIA-1, September 19). Money is the old Overview
  grid unchanged. Draft Picks went back to `/draft-picks`, which it duplicated; Owner Info
  became a block on Overview, the only place an ordinary owner edits their own card. **Do not
  draw Media on another owner's HQ, and do not add a fifth tab without deciding what comes
  off.** **There is no compliance banner on Team HQ** (Lewis, October 18, batch 2: removed in
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
- **The ••• on an own-roster row is a link to the player card's Actions tab**
  (`/player/<id>?tab=actions`), drawn under the same gate as Move; Move and Cut stay on the row
  (player-card.md).
- **The Roster tab's "not on a rookie deal" filter (the meter's link) reads `taxi_eligibility_status.ps_rule_subject`,
  not `contract_type`.** RB 3.3(b) counts an out-of-class rookie as a non-rookie, and so does
  the view's `ps_non_rookie_count`; a `contract_type` test would disagree with the box that
  linked here. `page.js` keeps **every** row of that view in `taxiByContract` for the same
  reason (it used to keep only rows with a `warning`); the weeks badge still renders on
  `warning` alone.
- **The two practice squad designations are one Server Action each and both are second
  calls**. `setPoachExemption` → `ps_exempt_set()`; `setTaxiHold` →
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
- **The Roster tab is Sleeper-style rows, not a table, at every width** (UI test batch 5,
  October 22, 2026, Lewis on the Roster design canvas: "I want the players displayed like
  Sleeper displays them"). Each `li.edfl-rr`: headshot (Sleeper CDN by URL, initials beneath,
  player-card.md), the name with "POS • NFL" under it, and a box at the right with **Cap Hit,
  Cash and "Yr x/y" for the season shown** — only those (contract type, the years span, PPV
  and Dead If Cut are not in this view, by his note). Under them the **stats line**: this
  week's projection first ("PROJ"), then the current season's totals from
  `edfl_player_season_stats` (QB pass yd, pass TD, INT, rush yd, rush TD; RB rush yd, rush TD,
  rec, rec yd, rec TD; WR/TE targets, rec, rec yd, rec TD; K FG and XP made/att), then EDFL
  points and per game. Kept unchanged: the injury cross, every status tag, the R-10 marker
  (the name's colour and the row's left edge) and the own-roster controls under their gates.
  The page no longer reads `team_cut_previews` (the Cut dialog asks the engine itself).
  **Do not bring the columns back into the row.** The On Waivers section is still a table.
- **The roster's order is the projection, set in `page.js` and never re-sorted** (Lewis's
  ruling, batch 5: "the row order should be by highest projected fantasy points"). Highest
  `player_week_projections.proj_points` for the projection week first (the matchup tile's week,
  or the next once it is final; withdrawn rows excluded); **no projection last, by cap hit**;
  then by name. The same order in every season and under every pill. Projections are
  `authenticated` only, so they are read with the **session** client for a signed-in viewer;
  a signed-out visitor gets cap-hit order and a line saying so, and a failed read says so in
  red. **There is no sort control** — do not add one back.
- **The filter is a row of pills, one on at a time** (batch 5): All · QB · RB · WR · TE · Flex
  · K · Active · IR · PS, All by default, `aria-pressed` buttons. Flex is RB, WR and TE. The
  Active, IR and PS pills read `roster_status` and are drawn on the current season only; the
  position pills filter every season. The Season dropdown stays. **`ROSTER_FILTERS` is still
  the one vocabulary**; its `taxi-nonrookie` key has no pill but stays, because the roster
  bar's PS NON-ROOKIE meter links to it — arriving that way lights PS and says which narrower
  list is showing.
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
