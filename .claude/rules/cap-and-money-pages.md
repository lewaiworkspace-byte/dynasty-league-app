---
paths:
  - "app/cap-sheet/**"
  - "app/team/**"
  - "app/cash/**"
  - "app/league-finances/**"
  - "app/admin/cash/**"
---

# Cap and money pages

One source per team figure, and every season it carries.

- **Out-year cap position is displayed, never blocked.** League policy is that an owner
  may run a future cap as tight as they like.
- **The team cap panel comes from one source and only that source.** **Do not sum a
  seasons array to get a team figure, and do not fetch the cap sheet separately** — two
  routes to one number disagree the moment anything else moves, and an owner cannot tell
  which is right.
- **Do not reintroduce a JS dead-money aggregation** for a season a view appears to be
  missing. That is a view question, not a page one. Both reads capture their error and
  render a banner.
- **The compliance view reads the by-season cap view, never the summary view**, which
  cross-joins a two-row table and has broken two pages that way.

- **The team grid spans every season `team_cap_by_season` carries money in (at least
  five)** — a fixed horizon hid charges past a contract's last void year. **The Cap
  Ceiling row shows the enforced ceiling** (set ceiling, else base cap), **never a
  multiplier**. PROV on a year tag is `league_cap_settings.is_provisional`.
- **`/cap-sheet`'s table is wrapped in `.table-scroll` and must stay wrapped.** Eight
  columns, 1,048px of natural width with the real fonts: bare, it scrolled the whole page
  sideways between the 640px card flip and about 1,100px. The wrapper confines the scroll to
  the table and costs no CSS. Below 640 `.ledger` flips to cards and the wrapper has nothing
  to do — **do not "simplify" it away on the strength of a phone screenshot.**
- **The page at `/cap-sheet` is called "Salary Cap"** (Lewis, November 14, 2026, UI test batch
  15): its heading, its tab title and every link to it say Salary Cap. **The route stays
  `/cap-sheet`** so the redirects, `revalidatePath` calls and bookmarks that name it keep
  working; renaming the route is a separate change with all of those in it.
- **`/cash` is "Owner Cash Accounting"** (Lewis, November 15, 2026, UI test batch 26; Option A of
  canvas YHL8z13zcDgpD1zC7tzsXg). **One read, `owner_cash_statement()`** (test database for now),
  through the SESSION client: the statement, the revenue / expense ledger, the salary weeks, the
  Book account, the five seasons and the Cash Windows all come from it, and **the page adds no money
  up** (SR-23) -- the top line, the meters' shares and every total are fields of it. **Salary is a
  row per week** (Rule Book 5.18(a): (guaranteed + non-guaranteed) / 14 per charged week, charged
  at `league_weeks.charge_at`); weeks still ahead are *scheduled*. The parts tie to
  `team_cap_by_season.cash_used`; an "Other contract cash" row means they stopped tying -- fix the
  function, never hide the row. **"Left to spend" still counts the whole season's salary**, as the
  old page's Available did; "in the account now" is only what has been charged. **The what-if
  (`?whatif=`) is never stored and has no default**: future seasons' Owner Cash is voted each
  off-season (Rule Book 10.2); keeping it is an open ruling. The route stays `/cash` (every
  `revalidatePath('/cash')` keeps working).
