---
paths:
  - "app/trades/**"
  - "app/admin/trades/**"
  - "lib/tradeStatus.js"
---

# Trades

The shared impact cards and what each trade table answers.

- **A shared impact component stays shared.** An owner reads those figures before
  accepting; the officer reads them before executing. Two renderers would drift and an
  owner would accept one set of numbers while another was acted on.
- **Do not fold the "what did I give up" table into the "what do I have" table.** They are
  different questions and one table with a flag answers neither cleanly.
- **`TradeImpactCards`' `money` prop is the FORMATTER, not a boolean.** Its three rows round
  differently and must: cap before/after are `cap_used`, a charge, so `formatCost`; cash
  before/after are `cash_available`, room, so `formatRoom`; the roster row is a headcount and
  passes `false`. The cap ceiling is a league constant and stays half-away. The cash
  direction is the load-bearing one — `trade_impact()` sets `cash_ok` from
  `(cash_after >= 0)`, so a team at `-$0.33` must not print `$0` beside a Blocked chip.
  **`ImpactRow` is module-private with exactly three call sites; check that before changing
  its props.**
