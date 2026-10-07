---
paths:
  - "app/team/**"
  - "components/NegotiationWindows.js"
  - "components/PoachAlert.js"
  - "components/ComplianceBanner.js"
  - "components/ComplianceCountdown.js"
  - "components/TaxiReturnNotice.js"
  - "components/PracticeSquadWarning.js"
  - "components/DraftPicksPanel.js"
---

# Team HQ

The owner's front door: tabs, the roster bar, the On Waivers section, the windows block, alerts and the Media tab.

### Pages and components

- **Team HQ is three tabs for a visitor — Overview, Roster, Money — and four for the
  owner himself**, the fourth being Media (MEDIA-1, September 19). Money is the old Overview
  grid unchanged. Draft Picks went back to `/draft-picks`, which it duplicated; Owner Info
  became a block on Overview, the only place an ordinary owner edits their own card. **Do not
  draw Media on another owner's HQ, and do not add a fifth tab without deciding what comes
  off.** The compliance banner sits **above** the tabs so
  it does not vanish when one is switched; the Overview's roster counts are columns of
  `team_inseason_compliance`, the same row that banner reads, so **no roster is counted in
  JavaScript** and the two cannot disagree. A count at its limit is gold, over is rust, and
  **under a limit is not a failure** — short of 25 is legal, by ruling.
- **The Overview roster bar is nine linked boxes and decides nothing** (September 21). Four
  squads against their limits, then QB/RB/WR/TE/K as `Active/IR/PS`, every figure a column of
  `team_inseason_compliance` (`qb_ir_count`, `qb_taxi_count` …, appended by `psx_04`). **Red is
  the view's verdict only**: `*_over_by`, `ir_no_designation_count`, `*_short`, `flex_short`.
  Each box is an `<a>` to `/team/<id>?tab=roster&show=<key>`; `page.js` reads `searchParams`
  and `TeamCapSheet` opens on that tab and filter (`ROSTER_FILTERS` is the vocabulary — add a
  box there and in `rosterHref`, never a second list). **Do not turn the boxes back into
  `<div>`s, do not add a `/ 3` to QB or K** (RB/WR/TE have no limit and the row would read as
  a target), and do not compute a shortfall in JavaScript — the view already did.
- **The Roster tab's "not on a rookie deal" filter reads `taxi_eligibility_status.ps_rule_subject`,
  not `contract_type`.** RB 3.3(b) counts an out-of-class rookie as a non-rookie, and so does
  the view's `ps_non_rookie_count`; a `contract_type` test would disagree with the box that
  linked here. `page.js` keeps **every** row of that view in `taxiByContract` for the same
  reason (it used to keep only rows with a `warning`); the weeks badge still renders on
  `warning` alone.
- **The two practice squad designations are one Server Action each and both are second
  calls** (September 21). `setPoachExemption` → `ps_exempt_set()`; `setTaxiHold` →
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
- **`waiver_priority_order()` is called with no arguments on Team HQ.** Both parameters
  default to "this season, every week scored so far", **which is not the order the run
  uses**: the run orders on the weeks before its own (see `waivers.md` and
  `app/waivers/actions.js`). The order moves with every sync while a week is unfinished, so
  **any surface showing it says provisional**. Priority is **lowest points for**, never record.
  > **Under review (October 6, 2026):** the earlier text said the defaults *were* the run's
  > order, contradicting the waivers rule and the code. Team HQ's figure can therefore differ
  > from the wire's chip mid-week. Whether Team HQ should show the run's order is an open
  > item; do not change the call until it is settled.
- **The roster table is wrapped in `.table-scroll`.** Nine nowrap columns need about
  1,080px against a 992px page column, so between 640px — where `globals.css` flips
  `.ledger` to cards — and roughly 1,120px it pushed the whole page sideways. **Do not
  unwrap it.**
- **The practice squad badge and warning read `locked` and `last_demotion_available`.**
  Three counted weeks do not end eligibility; they buy one last demotion. The urgent tone
  belongs to `last_demotion_available`, not to a week count.

### The On Waivers section on the Roster tab

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

### Open negotiating windows on Team HQ

- **Team HQ has an "Open negotiating windows" section ABOVE THE TABS**, between the compliance
  banner and the Overview / Roster / Money / Media tabs (`components/NegotiationWindows.js`,
  mounted by `app/team/[teamId]/page.js`). It sat on the Overview tab for one deploy
  (`07c0427`); the commissioner moved it on October 6 so it shows whichever tab is open —
  **do not put it back inside a tab.** It lists every
  in-season free agency and poach window still taking offers, **league-wide and identical on
  every team's HQ**, and with none open it prints the commissioner's sentence: "There are
  currently no open negotiating windows." A failed read prints an error, never the empty
  sentence.
- **`open_negotiation_windows()` is the only source** (migration
  `hq_windows_01_open_negotiation_windows`; SECURITY DEFINER, `authenticated` only, no
  `anon`). It reads `free_agent_window_board`, so **the opener is never returned (PN-3) and
  "contested" is a boolean, never a count (FA-D)**. The only sealed fact it reads is whether the
  **caller's own** team has a submitted offer (`i_have_offer`). The Eastern deadline is
  `closes_label` from `edfl_et_label`; the countdown only subtracts. **Do not look up the
  opener, an offer count or another team's offer to enrich this block.**
- **It does not replace `PoachAlert`.** The red strip above the tabs is still the "someone is
  poaching *your* player" alarm on the owner's own HQ; this block is the league-wide list.

### Poach alerts

- **`components/PoachAlert.js` decides nothing and is drawn on the owner's OWN Team HQ only**,
  above the compliance banner (ruling: the team being poached is told "on the app home page",
  and Team HQ is the front door). It calls `my_poach_alerts()` through the **session** client —
  the function reads `auth.uid()` and returns only that owner's open poach windows, his own
  "have I bid" flag, the Eastern deadline label and the "how to keep him" sentence. **It never
  returns who opened the window, another team's bid, or any terms**, and the component must not
  look any of them up. A failed read renders a quiet line, never nothing.

### The wires, Insider Threat, the injury cross, Phase 2G

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
