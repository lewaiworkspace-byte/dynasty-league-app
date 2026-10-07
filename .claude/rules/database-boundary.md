---
paths:
  - "app/**/actions.js"
  - "app/**/route.js"
  - "app/api/**"
  - "lib/**"
  - "app/admin/**"
  - "components/*Form.js"
  - "components/ownerInfoActions.js"
---

# The database boundary

Every rule that decides an outcome lives in the database. Loads with Server Actions, route handlers, `lib/` and the admin pages.

This is the line the project has crossed most expensively, so it gets its own section.

**Every rule that decides an outcome lives in the database.** The app's job is to
collect input, call a function, and surface the refusal it gets back. Refusal messages
name the season, the figure and the limit; they are worth surfacing **verbatim** rather
than paraphrasing.

- **A real cut is settled in the database only.** One function is the single
  implementation of the settlement rules. **No JS reproduces any of it**, and the cut
  dialog re-queries on every designation toggle rather than recalculating.
- **The two dead-cap numbers are different questions — do not merge them.** The engine
  answers "what does cutting this existing contract cost." `lib/deadCapPreview.js`
  answers "what would this contract still being *typed* cost to exit," before it has any
  row to query. It mirrors the computed view exactly, is date-blind, carries **no
  roster-bonus term** deliberately, and is labelled an estimate on screen. It must not
  call the engine.
- **Cut gates live in the database** — the opening date, the League Reset freeze,
  ownership. The UI surfaces their error messages; it does not duplicate them.
- **Read the designation-remaining function; never count events in JS.**
- **Reversed events are never deleted.** Every consumer of `contract_events` must filter
  `reversed_at IS NULL` (or use the history view's active flag) or it resurrects reversed
  dead money. This is permanent and applies regardless of what any rule book says about
  reversal.
- **Cut-reversal machinery exists in the database and the app.** Do not read a rule-book
  change as permission to delete it, and do not read its existence as evidence about
  what the rules currently say.
- **Void years come in two kinds and only one belongs to owners.** Owner-elected void
  years spread a signing bonus. Option-bonus void years are created **automatically by
  triggers**. **Client code must never create, count or limit option void years** — the
  database owns them start to finish, and any JS that polices them will disagree with the
  trigger the moment a bonus moves. **Counting them from the contract row is wrong**, not
  merely fragile.
- **The 30% Rule is enforced in the database, on contracts AND on bids**, with a separate
  pair of triggers for the delegation path (which stores its years as JSONB, invisible to
  the ordinary triggers). **Do not collapse those two triggers into one.** A hand-picked
  set of contracts is permanently grandfathered by a flag — **never re-derive that set
  and never copy the flag onto a new contract.**
- **Withdrawal arithmetic lives in the database only.**
- **The live-bid test is `submitted_bid_id`, never `status`.** Three bugs came from
  violating it.
- **Some functions authorise nothing themselves and trust their caller**, so they must
  stay unreachable from the API. **Never grant them to `anon` or `authenticated`, and
  never write a second copy of the gates that protect them.**
- **Use the session client, never the service-role client, for anything that gates on
  `auth.uid()`** — that is NULL through the service-role client, so the function refuses
  or mis-attributes. A few admin paths use the service-role client because they write
  tables no gated function covers; their own Server Action check is then the whole gate.
  **Do not add another without that reason.**
- **Do not add a role check inside a shared lib helper.** Deciding who may ask is the
  caller's job.


### Sentences the database owns

**A refusal the database composes is passed through unchanged.** `insider_submit()` and
`goodell_memo_submit()` **return** their refusal as a sentence rather than throwing, and every
Server Action in front of them hands that sentence to the form as `{ ok: false, message }`.
Do not compose your own wording for a rule the database owns, do not translate the sentence,
and do not add a client-side check that would stop a submission the database would have
explained better. The form may mirror a rule to warn early (the poach floor, the third-party
tier lock); when the two disagree the database is right and the form is the defect.

**A prose line the league reads is built in SQL, once.** `mort_line()`, the Goodell line
builders and `league_transaction_log.description` are where the wording lives; nothing in the
app composes a second version of the same sentence. The three Discord wires run in Postgres —
`pg_cron` → `_dispatch()` → `_say()` → `pg_net` → a webhook in Vault — and **nothing in this
repo posts to Discord or holds a webhook**. `DISCORD_WEBHOOK_URL` in Vercel is unused.


### Database behaviour worth knowing

- **A database rule that reads a table other than its own must be a deferred
  constraint trigger.** A non-deferred BEFORE trigger reading a table populated later
  in the same transaction sees an empty or half-written table and refuses legal input.
  This is not hypothetical — it once blocked an entire auction tier.

- **A trigger that has never fired is not a trigger that works.** Whole paths in this app
  were untested code until an owner walked into them. Treat any never-exercised path as
  unverified.
