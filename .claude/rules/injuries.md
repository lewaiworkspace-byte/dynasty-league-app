---
paths:
  - "app/injury-report/**"
  - "app/admin/injury-sync/**"
  - "app/api/cron/injury-sync/**"
  - "lib/injuryReport.js"
  - "lib/injurySync.js"
  - "components/InjuryCross.js"
  - "app/player/*/injury/**"
  - "vercel.json"
---

# Injuries

The injury pull, its schedule and the red cross.

- **Do not collapse the two arrays in the injury sync into one**, and note it refuses a
  feed that returned zero tracked players — an empty feed would otherwise clear every
  designation in the league.
- **The injury route is scheduled twice (`0 21` and `0 22` UTC) and pulls only in the 5 PM
  Eastern hour** — Hobby crons are UTC and fire anywhere in the hour, so exactly one lands
  in 17:xx ET and the other returns a 200 `skipped`. **Do not collapse the schedules or
  drop the hour check**; either moves the pull onto the 4:00 PM ET filing deadline for half
  the year. The admin page's button is the manual pull.
- **The injury pull stays a Vercel cron calling a route**; the array is handed to the RPC
  as `jsonb`. The database's own `pg_cron` jobs are made in the project chat and are not a
  reason to move this one.

- **`components/InjuryCross.js` decides nothing.** It renders the view's `injury_label`. Which
  designations count is `edfl_injury_designation_qualifies()` — one predicate read by the
  roster (`roster_injury_status`), the card (`player_card_header.injury_flagged`), the Matchup
  page and `team_inseason_compliance`. **Do not test `injury_status` strings in JavaScript**, and do
  not add a second red anywhere for an injury: an unflagged designation is neutral dim text.
  The cross sits **outside** the `.ct-name` span so it keeps its own red, its wrapper has
  `line-height: 0` so an injured row is no taller than its neighbours, and it is gated on the
  current season like the practice squad badge — an injury is a fact about now. A `✚` glyph
  was rejected because some platforms substitute a colour emoji that ignores `currentColor`.
- **The weekly injury history is nflverse's, kept by the database** (UI test batch 10, November
  11, 2026): `nfl_injury_weeks`, filled by `edfl_nfl_injury_refresh_due()` from
  `injuries_<season>.csv` (the NFL's game report: Questionable / Doubtful / Out) and
  `roster_weekly_<season>.csv` (IR, PUP and the other reserve lists, which the game report never
  lists). `edfl_player_injury_weeks()` labels each week (`edfl_nfl_week_status_label`). **Sleeper
  stays the injury authority for designations and every rule** (RB 1.13(a)); the weekly record
  is history for the injury report only. Do not label a week in JavaScript.
- **The injury report's Prognosis line reads `player_injury_prognosis`** (November 14, 2026).
  The view is `security_invoker` and granted to `authenticated` only, so **it must be read
  through the session client** (`createSupabaseServerClient`) — through the service-role
  client it returns nothing and every player read "No source yet". The agent leads
  (`agent_est_return_text` as the headline, `agent_outlook` under it, the checked date, the
  `agent_sources` links); ESPN's estimated return and comment are the fallback; "No source
  yet" only when both are empty, and a failed read is an error line, never "No source yet".
  Source links open in a new tab and only `http(s)` addresses become links.
