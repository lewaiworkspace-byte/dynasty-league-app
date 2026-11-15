---
paths:
  - "app/matchups/**"
  - "app/scoreboard/**"
  - "app/standings/**"
  - "app/matchup/**"
  - "lib/sleeperProjections.js"
---

# Scoreboard, standings and matchups

Official scores, projections and when a week is final.

- **The Matchups tab (`app/matchups/`, UI test batch 20, November 15, 2026) replaced the
  Scoreboard**; `/scoreboard` only redirects there, and `/matchup/<week>/<id>` is unchanged.
  Lewis's canvas and decisions: your matchup is Option B's card on the week in progress and
  Option A's on a finished week or a week to come, the other four games are A's two-line cards,
  the box score is Box Score 1 (both sides side by side) in a swipe-down sheet (a panel from
  1024px), and a finished week is Choice 1 (each position's actual over a dashed projection,
  the +/- at the bar's end in green or red). **No narrative sentences anywhere on the tab**;
  labels and numbers only. URL: `/matchups?week=N[&box=M]`.
- **Every total, difference, count and flag on the tab comes from
  `edfl_matchups_week_sides()` and `edfl_matchups_week_players()`** (test database only,
  migrations `matchups_01`-`02`; session client, no `anon` grant): official scores, the live
  projected final (`edfl_live_projected_finals`, unchanged), the slotted projections' sum and
  the "vs proj" difference, yet to play, the six position groups, every player's +/-, the bye
  and projected-injured table, the red "no sub" spots, the empty spots ("Empty · QB on bye")
  and the green practice-squad names. Their header comments define each one. **The JS adds
  nothing up and re-picks nothing**; bar widths drawn from those values are the only
  arithmetic. Winner and margin come from `league_scoreboard`. The lineups are
  `edfl_matchup_detail`'s (a scored week) and `edfl_projected_lineup`'s (a week to come),
  unchanged.
- **A past week's injury label ("IR", "Out, not on IR") uses today's designation**, because
  only the current one is stored; it is shown only for a player who scored nothing. A weekly
  injury-status snapshot would make it exact (owed, not built). A week to come shows the white
  red-cross pill linking to `/player/<id>/injury`; the week in progress the small Q/D/O/IR tags.
- **The whole card opens the box score** (the old Scoreboard's card was not one anchor; that
  rule is retired with it). Your card is a `div` whose "Box score" button is the keyboard
  control, so its (i) button is not nested inside another button. Player rows are plain
  `/player/<id>` links, so the sheet host opens the Mini Player Card over the box score.
- **The tab has no refresh control, deliberately**, like the Scoreboard before it (below).
- **`/scoreboard` had no refresh control, deliberately** (batch 5, SR-72). The old Refresh
  from Sleeper button called `edfl_sync_week_scores()`, the retired Sleeper-points engine, and
  did nothing all 2026 season; scores now arrive on their own from the final-stats job. **Do
  not add a button that calls `edfl_sync_final_stats()` instead**: pressed on a week not yet
  started it writes zeroed rows into `team_week_scores`, which hides that week's projected
  fixtures; pressed on a finished week it applies a Sleeper stat correction after the waiver
  run has used the result, and a stat-correction cutoff is an open commissioner ruling. Either
  is a decision for the chat side, not a fix.
- **A week with no score yet is drawn PROJECTED, from `edfl_projected_fixtures()`**, read through
  the session client (no `anon` grant: per-player projections stay behind a session). Each
  side's total is the function's own sum of its twelve slotted players — **never add players
  up in JavaScript, and never mark a side as leading on a projected week**; a higher projection
  is not a lead. A week with no projections at all comes back NULL and is drawn as a dash, never
  `0.00`. A week switches from projected to scored the moment `league_scoreboard` has rows for
  it, never both at once. A failed fixtures read fails only the projected weeks, with its own
  message.
- **A week in progress prints each side's projected final in italic brackets after its score**,
  from `edfl_live_projected_finals()` through the session client (no `anon` grant). The figure
  is the sum of `edfl_matchup_detail`'s twelve slotted `effective_points` — the Matchup page's
  "proj" figure by construction (SR-70) — so **never add players up or re-pick a lineup in
  JavaScript**, and never print it on a final week. The score beside it stays the official
  number in its own ink; the bracket is always dim and never bold, even on the leading side.
  Its read fails open: the scores still draw and a note says the projections did not load.
- **What `effective_points` counts is decided in SQL, not here**: a finished game its actual
  points, a game under way its points so far plus the projection's share of the time left (no
  game clock exists, so time since kickoff), a player yet to play his projection; the slots
  are then re-picked on those numbers, so a player who has played keeps his slot only if no
  one behind him is projected to beat him. **Do not reproduce the formula in client code.**
- **The Matchup page draws an unscored week from `edfl_matchup_projection()`**, which returns
  `edfl_matchup_detail`'s columns exactly, so `MatchupBoard` renders it with `projected` set and
  changes only its wording and state chip. Those two reads run only when the scored read finds
  no row. Players on bye (`game_state` `bye`) and with no NFL team (`no_team`) score nothing and
  are never slotted; that is decided in SQL, **do not filter them in JavaScript**. If the
  repo's Database Reference does not name these readers yet, ask the project chat for a fresh
  cut rather than inferring their shape from this code (ground rule 2).

- **"Final" is the view's `week_is_final`**, which compares the week's last sync with its
  last NFL kickoff. Never derive it from a clock in the component. Two surfaces read it
  now — the Matchups tab (through its readers) and Team HQ's matchup tile — and **a week with scores
  that is not final is drawn in gold and says IN PROGRESS**, because a number still moving
  must never look like a settled one. On such a week the "leader" is only whoever was ahead
  at the last sync, and each surface says so.
- **`/league` no longer shows scores** (UI test batch 15, Lewis, November 14, 2026: matchups
  and scores get a section of their own). Its Standings box still reads `league_standings`;
  `league-page.md` carries the rest.

- **A player over an Active Roster limit can score 0** (`scoring_ineligible`). Every lineup
  builder — `edfl_best_ball_lineup`, `edfl_matchup_detail` and the projected lineup behind
  `edfl_matchup_projection` — asks `edfl_scoring_ineligible()`; the Matchup page shows him on
  the bench at 0 with no label of its own yet. **Do not filter ineligible players in
  JavaScript.**

- **`edfl_matchup_detail` scores nothing, ever.** It slots players on their projected finals for
  the reader. `team_week_scores.points` and `edfl_best_ball_lineup()` are the official score and
  lineup, and the Matchup page's big number must equal the scoreboard's — if it does not, the
  page is wrong, not the scoreboard.
- **A projection is the league's own scoring of Rotowire's stat object, never `pts_ppr`**, and
  **Rotowire's `pass_fd` / `rush_fd` / `rec_fd` are yards ÷ 10, not first downs** —
  `edfl_score_projected_stats()` ignores them deliberately and estimates first downs at rates
  that live in that function with their derivation. **Do not read those fields as counts
  anywhere, do not hard-code the rates in client code, and do not "fix" the projection to match
  Sleeper's** — Sleeper's displayed projection carries the same overstatement and Week 1's
  actual points decided against it. The page says so in two `.mu-disclaimer` paragraphs above
  the Starters heading; keep them there and do not add a third.
- **A missing projection is shown as missing, never as 0.00.** `lib/sleeperProjections.js`
  filters out players Rotowire only returned an ADP for so that a stored zero and "no
  projection" stay distinguishable.
- **`player_week_projections` has no `anon` grant and no write policy**; every write goes
  through one scorer in the database, reached by the Matchup page's Refresh projections button
  (`edfl_sync_week_projections`) and by a scheduled pull. Do not add either.
- **Projections refresh on their own**, so the button is a convenience, not the mechanism.
  A player's projection **freezes at his own kickoff**, and one Rotowire stops projecting is
  marked withdrawn by the scheduled pull and comes back from the readers as no projection.
  **Do not describe projections as pulled on demand**, and do not show a withdrawn projection
  as a number.
- **`/standings` never filters weeks in JavaScript.** `league_standings` counts only weeks
  `league_week_status` calls final, so `/standings`, `/league` and the Team HQ tile cannot
  disagree about a record; the page adds one sentence naming the week still being played,
  read **outside** the `Promise.all` so an explanatory line can never take the table down.
  **Do not change `league_scoreboard`'s column list** — three pages select from it by name.
