---
paths:
  - "app/admin/**"
---

# The Commissioner Portal

Officer pages: the Calendar Loader, stored snapshots and the League Office desk.

- **The Calendar Loader converts no times.** Its inputs are `datetime-local` strings in
  Eastern wall-clock, passed to the database as text; the database converts them
  (`edfl_et`) and the admin views hand them back the same way (`edfl_et_local`). Doing the
  offset in JavaScript would be wrong for half the season. Order checks, the started-week
  lock and the rule-reference guard are the database's; the page's "Started" and
  "Provisional" chips are the view's own flags.
- **A snapshot records what the officer saw when they decided.** **Do not "improve" a
  stored snapshot into a live read** — that changes what the log records after the fact.

- **`app/admin/league-office` touches no stylesheet.** Every class it wears already existed
  and was grepped in the live files first — that is what kept a 45KB shared file out of the
  batch. The memo cap is **1,800 characters in three layers** (a CHECK on the table, the
  function, `maxLength` on the textarea) because the failure mode is a Discord 400 that would
  leave a memo marked as posted. The three delays are computed in SQL in Eastern time.

---
