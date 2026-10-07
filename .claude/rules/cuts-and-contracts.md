---
paths:
  - "app/team/**"
  - "app/admin/cuts/**"
  - "app/admin/new-contract/**"
  - "app/admin/fix-contracts/**"
  - "app/admin/restructure/**"
  - "app/restructure/**"
  - "app/fifth-year-option/**"
  - "app/admin/fifth-year-option/**"
  - "components/RestructureForm.js"
  - "lib/contractMath.js"
  - "lib/deadCapPreview.js"
  - "lib/optionBonusApply.js"
  - "lib/ppvMath.js"
  - "lib/leagueMinimum.js"
  - "lib/restructureRoster.js"
  - "lib/thirtyPercentRule.js"
---

# Cuts, contracts, restructures and options

Contract writes, the cut dialog, PPV weights and the fifth-year-option board.

- **What is drawn and what is permitted are different tests.** The fifth-year-option
  board's own flag decides what is *drawn*; the functions refuse a foreign roster by name
  regardless.

- **Contract writes happen in a fixed order** — contract, then years, then bonuses. **Do
  not invert it.** Bonuses must land after the years they belong to, because the deferred
  triggers read them at COMMIT.
- **A transaction-local flag is set once and never cleared.** Clearing it before commit is
  what made deferred triggers fire with the flag already gone. **Do not "tidy up" by
  resetting it.**

- **Rule 5.23(d) is the database's, and the cut dialog only reports it.** Once the
  player's NFL game this week has kicked off, `cut_player()` turns an immediate cut into
  an end-of-week designation by itself. The dialog calls `edfl_cut_timing_forced()` with
  the preview, shows its sentence verbatim and disables "Cut now". **Do not compute a
  kickoff in JavaScript** and do not offer "Cut now" when the sentence is present.
- **PPV weights are fetched from their table, never hardcoded.** The fallback constant is
  a failed-fetch cushion, **not** a source of truth, and must be kept equal to the table
  by hand. Three copies of those weights is what once let a form label a 680 deal as 501.
- **`CutPlayerDialog`'s forgiven rows are half-away and its settlement rows round up.** That
  line was drawn in the file before R-12 existed — its own comment calls a forgiven amount
  "a roll-up and not a settlement figure" — and R-12 agrees with it. The four `.row-note`
  rows are money nobody is charged and nobody may spend.
