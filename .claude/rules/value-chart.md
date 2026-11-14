---
paths:
  - "app/values/**"
  - "app/player/**/WeeklyValueLine.js"
---

# The Player Value Chart page and the weekly chart

Two charts, one page: the commissioner's published editions and the weekly chart the database builds.

- **`/values` has two views** (UI test batch 12, November 13, 2026): `?view=weekly` (with
  `&date=YYYY-MM-DD`) and `?view=published` (with `&snapshot=<id>`, the editions the commissioner
  publishes, unchanged). Weekly is the default once a weekly edition exists; a `snapshot`
  parameter means published. The switch is two links (`.edfl-pvw-switch`): a link navigates.
- **The weekly chart is the database's, figure for figure.** Rulings PVC-1 to PVC-15 (Decision
  Records, `EDFL_PlayerValueChart_Rulings_2026-11-11.md` and Addenda 1-2): built every Thursday
  at 6:00 AM ET by `edfl_pvc_build()` (formula v0.3) for every player ever signed. The page reads
  `edfl_pvc_weekly_editions()` and `edfl_pvc_weekly_chart(date)`; every value, total, rank,
  change (this week and since the anchor chart), market floor, youth protection and injury
  factor is a column of that reader. **Do not compute a change, a total or a rank in the
  browser** (SR-23); filtering and sorting the rows is all the component does.
- **The weekly chart is not the published chart.** It lives in `player_value_weekly*`, apart
  from `player_value_snapshots` / `player_value_history`, so no published edition, auction
  reference or Market value history changes. Never merge the two lists or mix their figures.
- **PPV is not money** (money-and-dates.md): bare numbers with `.v-ppv`, no dollar sign; a
  change is the reader's signed integer.
- **The explanation sits behind the one explain icon** (`components/ExplainButton.js`), in plain
  words that match the method record (v0.2 + the v0.3 addendum). Change the words when the
  formula's version changes, never the other way round.
- **A failed read shows its error** (L14): the editions read and the chart read each have their
  own error line; "no weekly chart yet" is shown only when the read succeeded with no rows.
- **The card's weekly line** (`app/player/[playerId]/WeeklyValueLine.js`) reads
  `edfl_pvc_player_line(player_id)` through `loadPlayerCard` (the card only, not the contract
  details page): the anchor value, then one row per posted Thursday. It shows the latest
  figure and its rank and a small line; it subtracts nothing. A player never signed has no rows
  and no line.
- **These readers exist on the test database only** until the weekly chart is built on live
  (Lewis's ruling on when owners see it is still open); the Database Reference §15 lists them.
