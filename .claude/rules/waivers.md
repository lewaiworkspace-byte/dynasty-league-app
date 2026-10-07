---
paths:
  - "app/waivers/**"
---

# The waiver wire

The wire shows what the run will do.

- **The waiver wire's priority chip calls `waiver_priority_order` with the RUN's arguments,
  not the defaults.** The function defaults both parameters to null, meaning "this season,
  every week so far". `waiver_run_preview()` — which `waiver_run_apply()` calls, and whose
  answer it stores as `priority_snapshot` — asks for `(season_year, week_number - 1)`. Called
  bare, the chip would disagree with the run the moment the current week's scores landed.
  **When a page shows the result of a function the engine also calls, pass the engine's
  arguments.**
