---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
  - "lib/formatMoney.js"
  - "lib/formatDate.js"
---

# Money and dates

How every figure and timestamp is rendered. Loads once you open app code.

### Money

- **`lib/formatMoney.js` is the single money formatter** — it replaced eleven copies, and
  every money call site changes by editing it. `formatMoney` rounds to whole dollars, half
  away from zero, locale pinned `en-US`; `formatMoneyDelta` is the signed version.
- **Displayed money never flatters, and the direction is in the function NAME, not a
  flag.** A flag gets copied from the line above it, so there is none. Each call site says
  what the figure **is**:
  - `formatCost` — a charge, salary, dead money, cash spent, a bid, a fine. Anything the
    league takes. `Math.ceil` on the **signed** value.
  - `formatRoom` — cap space, cash available, room under the spend floor. Anything still
    spendable. `Math.floor` on the **signed** value.
  - `formatMoney` — neither: a ledger fact. A contract's total value, career earnings, a
    closed season. Half away from zero, **unchanged**.

  Signed rather than magnitude is what makes this hold in all four quadrants: a $4.20 charge
  prints `$5`, a $4.20 credit `-$4`. It also means `ceil(used) + floor(room)` can never
  exceed the cap, and a team at 1,500.33 against 1,500 now prints `-$1` of room rather than
  the `$0` that read as exactly at the cap. **`formatMoneyDelta` is deliberately NOT
  directional** — a delta already happened, so no direction flatters it. **Migrating an
  existing `formatMoney` call site is deliberate, one at a time; do not bulk rename.** That
  sweep ran as three batches and is **finished except for
  `app/free-agency/FreeAgencyBoard.js`**, whose twelve sites belong to the batch that rewrites
  that file. Two files were read and deliberately left half-away —
  `/bids/results/[tierId]` and `admin/fix-contracts/FixContractsTable` print records of
  settled auctions, not budgets.
- **Two screens reading the same column must round the same way, and the gap between the
  first one moving and the last is live.** `/cap-sheet` and `/team/[teamId]` both read
  `team_cap_summary`; for two days one said a team had `$1,477` used and `$23` of room while
  the other said `$1,478` and `$22`. The player card said `$297` on one tab and `$296` on the
  next. The cut dialog said `$355` where the card said `$356` — on the last screen before a
  destructive button. **When you move one reader of a figure, find the others in the same
  batch.**
- **A figure is not money because it has a magnitude.** `per_year_value` is a Player Value
  Chart figure in PPV, the league's own unit, and it wore a dollar sign on the player card
  until September 18 — the same field reading `145` in one column and `$145` in the next, and
  disagreeing with `/values` and with the value strip one tab away on the same screen. **PPV
  is drawn as a bare number**, with `.v-ppv` for colour. This is the headcount mistake one
  class over.
- **`formatExactMoney` is the no-rounding export, and its consumer list is closed** — the
  restructure form, the **Money tab** on `/team/[teamId]`, and the fifth-year-option board.
  A value that is whole by construction must show a fraction if one appears, and those
  figures must agree exactly with the grid beside them. **Do not spread it further and do
  not make it directional** — exact is exact.
- **The rounded and the exact figures on Team HQ are supposed to differ, and both are
  right.** The rail and the cap bar are a glance and round away from the owner's favour; the
  Money tab prints to the cent, and the bar says where to find it. **If the two ever round
  the same way, something has gone wrong.**
- **The PDF export's own money renderer is the one deliberate exception** and stays
  separate: the PDF is the human-readable member of a download whose CSV and XLSX carry
  raw values. A rounding sweep should not quietly take it along.
- **Apply a formatter by what the number *is*, not to every number in a list.** The
  reverse-trade dialog formats by breach kind — cap and cash are money, a roster breach
  is a headcount, and running a headcount through a money formatter prints "$26" for
  twenty-six players. An unrecognised kind falls through to the plain number rather than
  being guessed at as currency.
- **No cash row and a zero balance are different facts.** So are "no games yet" and
  "zero points per game" — that field reads `--` before a game is played, never `0.00`.
- **Never render `$0` for a question that has no meaning.** Void rows are dropped, not
  dashed to zero; "free to cut" is worse than the original bug.
- **A blank must never read as compliant.** A failed read renders an error; a missing row
  renders a notice; a missing team renders a grey `Unknown` chip. A swallowed error whose
  fallback looks like a real answer has burned this app once already.

### Dates and times

- **Never format a timestamp client-side on a page whose view pre-renders them.** Several
  views return day, time and month labels already rendered in America/New_York. A client
  component calling `toLocaleString()` renders in the *viewer's* zone.
- **Use `lib/formatDate.js`, not local formatting**, wherever a timestamp is rendered by
  hand. Pin the zone rather than repeating the string, and return null for an unparseable
  timestamp rather than surfacing "Invalid Date".
- **Dated rules are calendar rows, not constants.** Moving a deadline is an UPDATE to one
  row. **Never hardcode a rule's date into a component**, and let the row's own
  past/future flag switch the wording between tenses.
- **The polarity of "is past" differs by rule and belongs at the call site.** For one rule
  past means "the market has opened"; for another it means "the exemption is over."
  **Do not write a generic `isRulePast(ref)` helper** — if one is ever written, the
  polarity stays at each call site with a comment, never inside the helper.
- **A server component reading `Date.now()` is correct** — it never hydrates. A client
  component doing the same is a hydration bug. **Do not unify the two to tidy them.**
