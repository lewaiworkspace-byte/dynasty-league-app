---
paths:
  - "app/stats/**"
  - "app/admin/import-stats/**"
  - "app/admin/sync-players/**"
  - "app/admin/sleeper-sync/**"
  - "app/api/cron/stats-sync/**"
  - "lib/statsImport.js"
  - "lib/statsHelpers.js"
---

# Stats, imports and the player sync

One importer, two season lists from one source, and two 2026 numbers that are not the same.

- **Importable and publishable seasons come from `importableSeasons()`** (read from
  `league_config` via `seasonWindow()`): importable adds the season in progress, publishable is
  completed years only -- see the `seasonWindow()` entry below. **Never hardcode a season list.**
- **The player sync never overwrites a `gsis_id` a row already has** — Sleeper has carried
  wrong ones; the crosswalk trigger fills what is missing.
- **The league id is read from config, never hardcoded.**

- **`lib/statsImport.js` is the one importer**; the Import buttons on `/admin/import-stats` and
  the daily cron `/api/cron/stats-sync` (vercel.json `0 11 * * *`, `CRON_SECRET`, fails closed)
  both call `importSeason()`. Both write through the service-role client, so each caller's own
  check is the whole gate. **Do not move it back into a `'use server'` file** -- every export
  there is a callable endpoint.
- **Importable and publishable are now two lists from one source.** `seasonWindow()` reads
  `league_config`: importable = every completed league year **plus the current one**;
  publishable = completed only. `publish_edfl_season_results()` refuses a season
  `>= current_season_year` in the database too (`stats_live_01`), because "stats exist" no
  longer means "the season is over". **Never offer Publish for the current season.**
- **Player identity on import: gsis, then a guarded name match, then create.** A Sleeper row
  with no valid gsis id (rookies, recent signings, Sleeper's wrong ids) used to get a second,
  stats-only player row -- the mechanism behind the August duplicates. The importer now books
  those stats on the single Sleeper row with the same normalised name (suffixes dropped) that
  agrees on position **or** NFL team, and reports every such match by name. **It never writes
  `gsis_id`** onto that row; identity columns stay the sync's and the crosswalk trigger's.
- **Two 2026 numbers, and they are not the same number.** `player_week_scores` is the official
  EDFL score (rostered players, decides matchups): Sleeper's own points for Weeks 1–2, and from
  Week 3 the league's own scoring of raw stat lines (`edfl_score_final_stats()`, written by the
  `edfl_final_stats_sync` job). Every week is attributed by the player's roster spot at his own
  kickoff (`edfl_roster_at()`), never by a later sync. `edfl_game_fantasy_points`
  / `edfl_player_season_stats` are nflverse stat lines scored by the view (every player). They
  can differ after a stat correction; the pages say so. **Do not merge them.**
- **The `/stats` season buttons are read** (`fetchStatSeasons()`, `league_config`), not a
  constant. The free agents dataset carries this season's production (`cur_*`) beside last
  season's; `stats_games` now defaults to the season in progress.
