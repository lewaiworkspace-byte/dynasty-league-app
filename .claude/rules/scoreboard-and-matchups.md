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

- **The Refresh from Sleeper control is signed-in but not officer-gated, deliberately** —
  it will read as an omission. **Do not add an officer check.** Waiver priority went stale
  whenever the commissioner was away on a Tuesday.
- **That control currently does nothing.** `app/scoreboard/actions.js` calls
  `edfl_sync_week_scores()`, which reaches `edfl_apply_matchups_payload()` — the old
  Sleeper-points engine, retired for the whole 2026 season (Weeks 1–2 were restated under
  scoring at kickoff). The league's own scorer has an owner-callable wrapper,
  `edfl_sync_final_stats()`, that nothing calls yet. **Repointing the action is an open change,
  not a decision**: do not describe the button as working, and do not "fix" it by loosening the
  old engine's guard (SR-72).

- **"Final" is the view's `week_is_final`**, which compares the week's last sync with its
  last NFL kickoff. Never derive it from a clock in the component. Three surfaces read it
  now — the Scoreboard, `/league` and Team HQ's matchup tile — and **a week with scores
  that is not final is drawn in gold and says IN PROGRESS**, because a number still moving
  must never look like a settled one. On such a week the "leader" is only whoever was ahead
  at the last sync, and each surface says so.
- **`/league` is a glance; `/scoreboard` and `/standings` are the pages.** It reads the same
  two views and links to both. **Do not give it week tabs, a refresh control, or the columns
  those pages own.**

- **A player over an Active Roster limit can score 0** (`scoring_ineligible`). Both lineup
  builders — `edfl_best_ball_lineup` and `edfl_matchup_detail` — ask
  `edfl_scoring_ineligible()`; the Matchup page shows him on the bench at 0 with no label of
  its own yet. **Do not filter ineligible players in JavaScript.**

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
  through `edfl_sync_week_projections`. Do not add either.
- **The matchup card on `/scoreboard` is not one big anchor.** Each side is already a link to
  its team, and nested anchors are invalid HTML that browsers recover from by dropping the
  inner ones — one matchup link would cost both team links. The `Matchup →` link sits in the
  note row.
- **`/standings` never filters weeks in JavaScript.** `league_standings` counts only weeks
  `league_week_status` calls final, so `/standings`, `/league` and the Team HQ tile cannot
  disagree about a record; the page adds one sentence naming the week still being played,
  read **outside** the `Promise.all` so an explanatory line can never take the table down.
  **Do not change `league_scoreboard`'s column list** — three pages select from it by name.
