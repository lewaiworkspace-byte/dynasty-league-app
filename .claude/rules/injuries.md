---
paths:
  - "app/injury-report/**"
  - "app/admin/injury-sync/**"
  - "app/api/cron/injury-sync/**"
  - "lib/injuryReport.js"
  - "lib/injurySync.js"
  - "components/InjuryCross.js"
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
  page and the compliance banner. **Do not test `injury_status` strings in JavaScript**, and do
  not add a second red anywhere for an injury: an unflagged designation is neutral dim text.
  The cross sits **outside** the `.ct-name` span so it keeps its own red, its wrapper has
  `line-height: 0` so an injured row is no taller than its neighbours, and it is gated on the
  current season like the practice squad badge — an injury is a fact about now. A `✚` glyph
  was rejected because some platforms substitute a colour emoji that ignores `currentColor`.
