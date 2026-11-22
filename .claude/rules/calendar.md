---
paths:
  - "app/calendar/**"
---

# The League Calendar

`/calendar`: the season strip, then a Calendar / Timeline switch and the chosen view (Lewis's
pick on the Claude Design canvas, November 11, 2026, UI test batch 9). Reads the
`league_calendar` view only; it decides nothing and writes nothing.

- **The clock is read once, in `page.js`, on the server.** It hands `nowMs`, today's Eastern
  date key and its label to the client, and computes each row's `started` and `running` there.
  No client file calls `Date.now()` or `new Date()` without an argument (a hydration bug,
  money-and-dates.md), and "Right now", "Next up" and the today line all judge against that one
  reading, so they cannot disagree.
- **"Next up" is the first row that has not STARTED, judged on the unfiltered list.** A window
  with its own end that has opened is "open now" (Right now), never next. The old page used
  "not past", and a running window is not past, so "Poaching open" sat flagged as next up for
  twelve weeks (finding F16). Do not go back to `is_past` for this, and do not compute it
  inside a filtered list.
- **Every label is the view's own Eastern string** (`day_label`, `time_label`,
  `end_day_label`, `month_label`). The raw instants are read only to place bars on the strip and
  to order rows against now. The month grid's arithmetic runs in UTC on the view's
  `local_date` keys, so no zone can move a day. Never format a calendar instant in the browser.
- **The strip keys on `rule_ref`, never on a date** (`calendarModel.js`: `LANES` names which
  rules draw which lane, and how a row opens or closes a bar). A date change is a data update.
  A closing row with no exact time closes at the end of its day; one with an exact time closes
  at that instant. A bar left open runs to the end of the league year.
- **Card text is the row's own `detail`, verbatim** (event cards, and the lane cards, which list
  the details of the rows that open the lane's windows). Retitling a row or correcting its text
  is a data edit for the commissioner, never a string in this code.
- **"Deadline" is read from the title** ("deadline", "closes", "due"), because no column
  carries it. It is a label only. If rows are retitled, check the word list in
  `calendarModel.js`.
- **Rule links go to the League Library's section anchor** (`/library/rule-book#s-5-18` for
  "5.18(c)(ii)"): its headings are sections, not clauses, and the scheme is fixed (library.md).
- **No category filter on the Calendar (month) view** (Lewis, November 11: "Get rid of this");
  the colour key under the grid stays. The Timeline keeps its filter. **The page opens on
  Timeline and remembers nothing between visits.**
- **Each category colour sits beside its word**, never alone. The strip's phone Playoffs mark
  is an original cup trophy with a "1" (Lewis's request); do not swap in a league's real
  trophy shape.
- Styles are the dated `.lc-*` block at the foot of `kit.css`. The `.cal-*` rules in
  `globals.css` are left in place unworn (globals.css is not edited).
