---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
  - "lib/**"
---

# Data fetching

Reads that look complete and are not. Loads once you open app code.

### Data fetching

**PostgREST caps an unbounded `.select()` at 1,000 rows with no error and no warning.**
Two responses are correct and they are **not** interchangeable:

- **Bound-and-warn** — an explicit `.range()` plus a visible truncation notice — for a
  ledger a human reads and scrolls, where the newest rows are the ones that matter.
- **Page-until-exhausted** — a `.range()` loop with a stable, unique `.order()`, stopping
  on a short page — for anything that must be complete.

**A file someone downloads and keeps must never be bound-and-warn.** A truncated export
looks complete forever, and that has already caused production bugs. **`.limit(5000)` is
neither pattern**; it only relocates the invisible ceiling.

**Never cursor on a timestamp alone** — many rows share one; use the composite key.

**Do not select from the players table on a user-facing surface.** It is thousands of
rows and an admin page has already failed that way.
