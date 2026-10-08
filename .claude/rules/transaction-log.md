---
paths:
  - "app/transactions/**"
  - "app/actions/**"
  - "app/player/**"
---

# The transaction log and the player feed

One rendering for everyone, and a kind vocabulary written twice.

- **The transaction log renders identically for everyone.** There is no per-viewer branch
  anywhere on the page. **Do not add an officer-only column, filter or action to it.** If
  one is ever wanted it belongs in the Admin section.

- **The feed's kind vocabulary is written twice and reconciled by diff, never by eye.**
  The database whitelist and the transaction log's label map are one list in two
  languages, and a disagreement is **silent** — a dropped kind never reaches the page.
  Change both in the same commit and compare them one-for-one; the database's
  unmapped-kinds function is the standing alarm.
- **A spelling the view cannot emit is deleted from the map, not kept as a fallback.**
  A dead entry makes the map look more complete than it is, which is the defect that hid
  a whole acquisition route once. If a retired kind ever returns, the unmapped-kinds
  alarm reports it — that is what the alarm is for.
- **`signed_poach` is emitted by the player feed and deliberately excluded from the
  league log's whitelist** — the `poached` event row already carries the move. It is
  mapped on the player page's tone map and absent from the league log's label map, and
  that asymmetry is correct.
- **Map a kind before its first occurrence, not after.** Several kinds are labelled while
  still holding zero rows. They read as dead code and are not: the first time one occurs
  is a bad moment to discover the league log has no word for it.
- **The Action Log's type map (`app/actions/page.js`) is a third list of the same kind.**
  `commissioner_actions.action_type` is free text with no check, and there is no
  unmapped-types alarm, so an unlabelled type shows its raw spelling silently. Diff the map
  against every literal a database function logs plus every type already in the table
  (some were written once by hand in a correction), in the same batch as the change that
  adds a type. Retired types stay mapped while their rows remain in the log.
- **The Action Log's load error and its empty-state sentence are exclusive.** The sentence
  renders only after a read that succeeded with no rows. A failed read leaves no rows too, and
  printing "No commissioner actions have been recorded yet." under the error tells every owner
  the commissioner has done nothing. Do not fold the two branches back together.
