---
paths:
  - "app/scoreboard/**"
  - "app/standings/**"
  - "app/league/**"
  - "app/matchup/**"
  - "lib/sleeperProjections.js"
---

# Scoreboard, standings and matchups

Official scores, projections and when a week is final.

- **`/scoreboard` has no refresh control, deliberately** (batch 5, SR-72). The old Refresh
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
- **The Matchup page draws an unscored week from `edfl_matchup_projection()`**, which returns
  `edfl_matchup_detail`'s columns exactly, so `MatchupBoard` renders it with `projected` set and
  changes only its wording and state chip. Those two reads run only when the scored read finds
  no row. Players on bye (`game_state` `bye`) and with no NFL team (`no_team`) score nothing and
  are never slotted; that is decided in SQL, **do not filter them in JavaScript**. If the
  repo's Database Reference does not name these readers yet, ask the project chat for a fresh
  cut rather than inferring their shape from this code (ground rule 2).

- **"Final" is the view's `week_is_final`**, which compares the week's last sync with its
  last NFL kickoff. Never derive it from a clock in the component. Three surfaces read it
  now — the Scoreboard, `/league` and Team HQ's matchup tile — and **a week with scores
  that is not final is drawn in gold and says IN PROGRESS**, because a number still moving
  must never look like a settled one. On such a week the "leader" is only whoever was ahead
  at the last sync, and each surface says so.
- **`/league` is a glance; `/scoreboard` and `/standings` are the pages.** It reads the same
  two views and links to both. **Do not give it week tabs, a refresh control, or the columns
  those pages own.**

- **A player over an Active Roster limit can score 0** (`scoring_ineligible`). Every lineup
  builder — `edfl_best_ball_lineup`, `edfl_matchup_detail` and the projected lineup behind
  `edfl_matchup_projection` — asks `edfl_scoring_ineligible()`; the Matchup page shows him on
  the bench at 0 with no label of its own yet. **Do not filter ineligible players in
  JavaScript.**

- **`edfl_matchup_detail` scores nothing, ever.** It slots unplayed players on projections for
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
- **The matchup card on `/scoreboard` is not one big anchor.** Each side is already a link to
  its team, and nested anchors are invalid HTML that browsers recover from by dropping the
  inner ones — one matchup link would cost both team links. The `Matchup →` link (`Projection →`
  on a projected week) sits in the note row.
- **`/standings` never filters weeks in JavaScript.** `league_standings` counts only weeks
  `league_week_status` calls final, so `/standings`, `/league` and the Team HQ tile cannot
  disagree about a record; the page adds one sentence naming the week still being played,
  read **outside** the `Promise.all` so an explanatory line can never take the table down.
  **Do not change `league_scoreboard`'s column list** — three pages select from it by name.
