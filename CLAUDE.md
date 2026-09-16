# CLAUDE.md — EDFL Dynasty League App

**Generated September 8, 2026; last revised September 16, 2026 (America/New_York)** from Project
Reference v7.6, Technical Manual v17 and Standing Rules v1.6, with database conventions re-checked
against Database Reference v2.0. **If today is more than about a week after that date, say so
before acting on anything below**, and ask for a regenerated copy. This file is a briefing, not a
source of truth: it describes conventions and decisions in *this repo* that a reader cannot
recover by looking at the code.

**If the repo disagrees with anything here, the repo wins.** Report the discrepancy;
do not silently reconcile it.

---

## What this file is, and what it deliberately is not

This file holds three things and nothing else:

1. **How to behave** in this repo — the ground rules below.
2. **Conventions and structure** — which module owns what, which CSS class does which
   job, how gating is layered.
3. **Decisions that must not be undone** — the "do not undo this" list. Every entry
   describes *code*, and each says why, because a rule without a reason gets tidied away
   by the next reader.

It contains **no league state, no counts, no version numbers, no dates for things that
change, and no record of what was built when.** All of that lives in the governing
documents and in the database, both of which move without asking this file's permission.
A previous version of this file carried all of it, went stale in place, and gave several
sessions confident wrong premises. Do not add any of it back.

**In particular it names no folder or checkout.** If you need to know where you are:

```
git rev-parse --show-toplevel && git log --oneline -1
```

That is a fact you can establish in one command and it can never rot. A path written
into a document can, and did — an earlier version of this file named a checkout in two
places, in capital letters, and kept sending sessions back to a folder that had been
retired.

---

## What this is

Companion app for a 10-team dynasty fantasy football league (EDFL) run alongside
Sleeper. The app is the system of record for contracts, salary cap, and Owner Cash —
none of which Sleeper tracks. Live at dynasty-league-app-gold.vercel.app.

**Stack:** Next.js 14, App Router, plain JavaScript (no TypeScript), Supabase
(Postgres + RLS), Vercel.

**Database facts live in `EDFL_Database_Reference_for_ClaudeCode.md`**, checked into
this repo. Signatures, views, columns, RLS, row counts and config values are all there,
generated from the live database rather than recalled.

**The filename is unversioned on purpose.** The upstream copy is replaced in place, so
a versioned mirror name goes wrong the moment the next cut is copied over, and a
filename that lies about its contents is a failure this project keeps repeating. **The
version is on line 3 of the file itself.** Read it there; never rename the file to match.

**The upstream copy is canonical and the repo copy is a mirror.** Install a new cut by
copying the file over whole and confirming the bytes match. **Never hand-transcribe it**
— that is how a mirror silently comes to differ from its authority. Never edit it in
place.

---

## Ground rules for every task

1. **Audit first, starting from `origin/main`.** This checkout is not the only thing that
   pushes — a session started from a phone runs in the cloud, pushes to `origin`, and never
   touches this working tree. **A clean tree can still be behind.** So before reading or
   writing anything:
   - `git fetch origin`, then compare local `main` with `origin/main`.
   - **Behind only:** `git merge --ff-only origin/main`.
   - **Ahead or diverged:** stop and report. Do not merge, rebase or push.
   - A handoff names the commit it was written against. If `HEAD` is not that commit, diff
     every target file between the two before replacing any of them — a complete file read
     from an older commit silently deletes whatever was added since.

   Then read the actual current state of every file you are about to touch and report
   findings before making changes. Documentation — including this file — has been wrong
   about repo state before. The repo is the truth. **Never force-push.**

2. **You have no database access, and the reference is the authority on what the
   database contains.**
   - **Do not write SQL and do not propose a migration.** Schema and function changes
     are made in the project chat. If a task appears to need a new table, view, column
     or function, **stop and say so** rather than designing around a guess.
   - **Do not infer schema from application code.** The app has been wrong about the
     database before; that is how this project lost a full session.
   - If the reference does not name something you need, **ask for a regenerated copy**.
     A missing name means the reference needs re-cutting, not that you should go looking
     for the object yourself.
   - **The absence of an object from the reference is not proof it does not exist.**

3. **You do not know the current state of the league** — not the standings, the rosters,
   who is over the cap, what has shipped, or what any rule currently says. **Do not infer
   any of it or reason from a remembered figure**; if a task depends on league state, stop
   and ask. A stale snapshot in a briefing once produced five confident wrong conclusions
   from otherwise correct reasoning.

4. **Complete files only** in any report or handoff — never diffs, never "change this
   line" instructions. When asked to paste a file verbatim, paste it verbatim.
   Summaries in place of contents have stalled builds twice.

5. **Confirm every push with a commit hash** in your report.

6. **Do not claim anything "builds" unless a build ran here.** There is no `.env.local`,
   and a Node runtime may or may not be present on this machine. If `npm run build` is
   available, run it and report the result; if it is not, say so. Either way the Vercel
   deploy is the real check. Flag anything needing a post-deploy click-through.

7. **No path alias exists.** All imports are relative.

8. **Never `git add -A` or `git add .`** — add files by name, always. `.gitignore` covers
   only `node_modules`, `.next`, `.env.local` and `.vercel`, so **anything else that lands
   in the working tree is a candidate for the index**, including files a script or an
   import writes.

9. **Line endings are normalised on checkout.** To compare a file against a source,
   hash the committed blob (`git show HEAD:<file>`), never the working copy — the
   working copy's byte count will differ and mean nothing.

10. **Server Actions RETURN refusals; they do not throw them.** A **production build**
    masks every thrown message behind a generic render error, so a carefully-worded
    database refusal never reaches the owner — and dev shows the real message, so this
    cannot be caught locally. Return `{ ok: false, message }`, check `.ok` at the caller,
    and keep `.catch` for **genuine transport failures only**. No exported action throws;
    an internal helper may, only where every exported caller catches it.

11. **A database rule that reads a table other than its own must be a deferred
    constraint trigger.** A non-deferred BEFORE trigger reading a table populated later
    in the same transaction sees an empty or half-written table and refuses legal input.
    This is not hypothetical — it once blocked an entire auction tier.

12. **Enumerating write paths means following the data, not grepping for `.insert(`.**
    Some writes go through an RPC argument, which no insert-statement search surfaces. A
    grep-shaped inventory of "everything that writes table X" will silently omit every
    RPC-mediated write, and it did.

13. **`grep '^\.'` against `globals.css` is not a class inventory** — it misses every
    rule inside a media query and every indented line. Search anywhere on the line. This
    produced a false "class missing" report once.

14. **Backtick caution applies to code received in chat handoffs**, not to template
    literals already in repo files.

---

## Routes and access

| Route | What | Access |
|---|---|---|
| `/` `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/calendar` `/actions` `/scoreboard` `/standings` | Public pages | Deliberately ungated — do NOT add auth |
| The **Refresh from Sleeper** control on `/scoreboard` | Signed-in control on a public page — **not officer-gated, deliberately** | Any logged-in owner |
| `/waivers` | **Public page, like the Scoreboard** — a signed-out reader gets the wire and the last executed run; no redirect. The database decides whether the wire is open at all (`edfl_wire_live()`), and the page draws one line when it is not | Deliberately ungated — do NOT add auth |
| The **claim controls** on `/waivers` (Claim, reorder, Withdraw) | Signed-in controls on a public page. Sealed: an owner sees only their own claims until the run executes — RLS on `waiver_claims`, not the page. **No count and no names of who else is in**, the same ruling as free agency's contested flag | Any logged-in owner |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` `/player/[playerId]` `/trades` `/trades/new` `/trades/[tradeId]` `/restructure` `/fifth-year-option` `/transactions` `/injury-report` `/injury-report/export` `/search` `/league-finances` | Owner pages | Any logged-in owner |
| `/league-finances` | **Every team's fines, itemised, to every signed-in owner** — not own-team-only and not public. The two views it reads (`league_fines`, `league_fund`) have no `anon` grant. Read-only: fines are posted by the database, never from a form | Any logged-in owner |
| `/draft-picks` | **Public route, login-gated BODY** — a signed-out visitor gets the page and an explanation, never a redirect. The board view has no `anon` grant, so the read is skipped rather than refused | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash` `/admin/owner-activity` `/admin/trades` `/admin/restructure` `/admin/fifth-year-option` `/admin/sleeper-sync` `/admin/injury-sync` `/admin/sync-players` `/admin/import-stats` | Widened admin pages. **`/admin/sync-players` and `/admin/import-stats` write through the service-role client, so their Server Action checks are the whole gate** — no database function stands behind them | Commissioner **or** co-commissioner |
| The **Publish Season Results** panel on `/admin/import-stats` | Officer control; `publish_edfl_season_results()` gates on `auth.uid()` itself and refuses an overwrite unless republish is passed. Republish is a separate two-step control | Commissioner **or** co-commissioner |
| `/admin/calendar` | **Calendar Loader** — edits league weeks and calendar entries. Strict by the default-DENY rule; every `calendar_*` function calls `require_commissioner()` | Commissioner only |
| The **officer action banner** on `/` | Officer-only block on a PUBLIC page, above the link sections. Drawn only when `canAdmin`; `officer_action_items()` refuses anyone else on its own | Commissioner **or** co-commissioner |
| `/api/cron/injury-sync` | Not a page and not owner-reachable | **Vercel Cron only** — bearer `CRON_SECRET`, 503 if unset |
| The appointment control on `/admin/owner-activity` | Strict control on a widened page | Commissioner only |
| The **Owner Info tab** on `/team/[teamId]` | Login-gated tab on a PUBLIC page; the button is not drawn signed out. **Self-edit only, for everyone** | Any logged-in owner |
| The **Designated cuts** block on `/team/[teamId]` | Own-team-only block on a PUBLIC page, under the roster: end-of-week cuts not yet fired, with Withdraw. Read through the session client, filtered on the team's own contract ids. **Omitted when empty; a failed read renders its message**, never nothing | The team's own owner |
| The **Owner Directory** on `/admin/owner-activity` | The same component at `editScope="all"` — the one place officer editing of another owner's card lives | Commissioner or co-commissioner |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

> Page gates are recorded above as the **code** currently gates them. Whether a page
> *should* be strict is a league question that has moved before — check with the
> commissioner before widening or narrowing one, and change the page gate, every Server
> Action gate and the home-page link in the same commit.

**Every gated page uses both layers, always:** the three-line gate
(`getCurrentTeamOwner()` → `redirect('/login?next=…')` signed out → `redirect('/')`
non-officer) **and** an independent re-check inside every Server Action. `next=` targets
pass through `safeNext()`.

### Hiding a link is presentation, not access control

`app/page.js` and `app/cap-sheet/page.js` gate what they *render* — owners once clicked
admin buttons drawn for everyone, bounced home, and concluded the app was broken. **The
redirect and the Server Action re-check remain the real gates.** Never treat a hidden link
as a substitute for either, and **never disable a write path by hiding its link** — the
function behind it will run happily.

- `app/page.js` — the **whole Admin section** sits inside a single `canAdmin` block
  (`isCommissionerOrCo`). **A new admin link goes INSIDE that block, not beside it.** One
  added as a sibling renders for the entire league and silently undoes this.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`). **Never swap it for
  the helper.** If a strict page's gate ever widens, widen this in the same commit — not
  before.
- **Sync Players, Import Stats, Sleeper Sync and the Injury link are all `canAdmin`.** The
  first two were strict until the commissioner's ruling that struck Technical Manual
  Appendix A.2(c); their pages and actions widened in the same commit as the links.
- **The Calendar Loader link sits inside `isCommish`**, with the page, its actions and the
  database all strict. Widen all four together or none.
- The caption under the links names what each role may not do. **Keep it in step with
  the gates** — it went stale once already.
- **The officer action banner renders what the database composed, verbatim.**
  `components/OfficerActionBanner.js` never reads and never decides; `app/page.js` calls
  `officer_action_items()` through the **session** client (the function gates on
  `auth.uid()`) and hands it the rows. **A failed read renders an error, never "All
  clear"** — those are different facts. New kinds of action item are added in the
  database function, not in the component.

---

## The database boundary

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

---

## Cross-cutting conventions

### Money

- **`lib/formatMoney.js` is the single money formatter** — it replaced eleven copies, and
  every money call site changes by editing it. `formatMoney` rounds to whole dollars, half
  away from zero, locale pinned `en-US`; `formatMoneyDelta` is the signed version.
- **`formatExactMoney` is the no-rounding third export, and its consumer list is
  closed** — the restructure form, the team cap sheet and the fifth-year-option board.
  It exists because a value that is whole by construction must show a fraction if one
  appears (rounding would hide the defect), and because those figures must agree exactly
  with the grid beside them. **Do not spread it further.**
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

### CSS and UI

- **`.grid-table` is for NUMBERS. `.ledger` is for ROWS A HUMAN READS.** The tell is
  always the same: a column holding a sentence rather than a figure. This exact mistake
  has been made three times. Check which question your table answers before you pick.
- **`.subhead` is NOT a section heading, and it looks like one in the stylesheet.** It is
  the dim page subtitle under an `<h1>`, worn by a `<p>`. A section heading inside a page
  is `<h2 className="section-heading">`. **A class existing is not evidence it is the
  right class.**
- **Currency colours, one per currency, everywhere:** `--c-cap` blue, `--c-cash` green,
  `--c-ppv` purple, `--c-dead` rust, via `.v-cap` / `.v-cash` / `.v-ppv` / `.v-dead`.
  Gold is reserved for pending and attention states.
- **`globals.css` grows by append.** Feature blocks sit at the end in shipped order.
  **Append new blocks; do not reflow what is above.**
- **Shared CSS blocks have more than one consumer.** Before changing a feature block,
  check who else wears it — at least one has quietly acquired a second page.
- **Some `display` repetitions exist for specificity** and are commented. **Do not tidy them.**
- **Theme:** light/dark via `data-theme` on `<html>`, pre-paint inline script,
  localStorage `edfl-theme`, media-query fallback, `suppressHydrationWarning` required.
  The toggle lives in the app bar. **The bar is sticky, not fixed** — sticky keeps it in
  the document flow so it takes its own height and covers nothing. **Do not convert it
  back to fixed** to reclaim the space.
- **Non-interactive elements stay non-interactive.** Some status markers are plain
  `<span>`s with no `role` and no `tabindex`, deliberately outside the tab order. **Do
  not give them a border, a background, a hover state or a handler.** A real control
  wears `.btn` like every other control in the app.
- Fonts: Oswald / Inter / IBM Plex Mono via `next/font/google`. **Geist was rejected —
  do not re-propose it.**

---

## Do not undo these

Each of these is a decision that reads as an inconsistency or an oversight and is not
one. They describe code, so they stay true until the code changes.

**Permissions and visibility**

- **The Refresh from Sleeper control is signed-in but not officer-gated, deliberately** —
  it will read as an omission. **Do not add an officer check.** Waiver priority went stale
  whenever the commissioner was away on a Tuesday.
- **Adjacent buttons with different gates are intentional.** Approval is shared; the
  competitive-balance veto is commissioner-only. **Never widen the veto to match the
  button beside it**, and never call the officer helper anywhere in the appointment path
  — that action refuses first, on its own strict test.
- **The transaction log renders identically for everyone.** There is no per-viewer branch
  anywhere on the page. **Do not add an officer-only column, filter or action to it.** If
  one is ever wanted it belongs in the Admin section.
- **Sealed things stay sealed, including from officers.** Open-window offers show a
  contested flag and never a count — in a ten-team league a count leaks who is in. **Do
  not add a count, and do not add a commissioner-only peek.**
- **The two acquisition systems disagree about losing bidders on purpose** (a commissioner
  ruling). A losing *auction* bid is anonymised at the view layer; a losing, withdrawn or
  passed-over *free agency* offer **names the team** once its window resolves. **Do not
  anonymise the offer or de-anonymise the bid.** Offer rows stay sealed until the window
  resolves — every join carries that predicate, and dropping it would make the league log
  differ by viewer.
- **Poaching is free agency on a practice squad player, not a separate system.** A poach
  bid is an ordinary `submit_fa_offer` call; the database routes it and opens a window
  with `window_kind = 'poach'`. **Poach-ness is read from the window's kind, never from
  the offer** — `offer_kind` is `'active'` on every poach bid. Do not add a poach flag to
  the offer or a second RPC.
- **There is no Withdraw, on purpose.** Rule 5.14(d): an offer can only be replaced by a
  higher one. `withdraw_fa_offer` still exists and **refuses every call by design** — do
  not "fix" it and do not re-add the button. Historical `withdrawn` rows and the
  `fa_offer_withdrawn` feed kind remain and stay mapped.
- **Who opened a window is sealed until it resolves.** The board view returns
  `opened_by` null while a window is open or closed-unresolved, and the table column is
  sealed by grant. The page prints "Sealed". Do not look the opener up another way.
- **The preview gate lives in the database.** `preview_fa_window` refuses a non-officer
  and refuses before `closes_at`, because its ranking *is* the sealed offers. The page's
  officer check is presentation. Preview and resolve run the same award code, so they
  cannot disagree — do not reimplement the ranking in the client.
- **The poach checks on the offer form are advisory.** `edfl_poach_offer_valid` is the
  rule; the form mirrors it so an owner sees the problem before submitting. When the two
  disagree, the database is right and the form is the defect.
- **The practice squads list comes from `poachable_players`, authenticated only.** Its
  `poaching_open` flag is the calendar test; the section's visibility is never a clock in
  JavaScript.
- **Resolve notices key off `outcome`, not `result`.** `outcome` is one of `awarded`,
  `voided`, `poached`, `retained_by_bid`, `retained_on_rookie_contract`; `result` only
  says awarded or void and cannot tell a poach from a retention.
- **The last-active band is a band, never a time**, for everyone but yourself and the
  officers.
- **The login email has no visibility toggle and must not be given one.** It is the
  credential half of the login, not a way to reach somebody.
- **Owner-card editing defaults to self-edit only.** A future mount that forgets the prop
  gets self-edit, never officer editing by accident. **Do not change the default and do
  not pass the all-scope value anywhere else.**
- **A widened page can carry a strict control**, and the contact list on it is shown
  rather than hidden behind a button. **Do not "make it consistent."**
- **What is drawn and what is permitted are different tests.** The fifth-year-option
  board's own flag decides what is *drawn*; the functions refuse a foreign roster by name
  regardless.

**Settlement, contracts and money**

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
- **Contract writes happen in a fixed order** — contract, then years, then bonuses. **Do
  not invert it.** Bonuses must land after the years they belong to, because the deferred
  triggers read them at COMMIT.
- **A transaction-local flag is set once and never cleared.** Clearing it before commit is
  what made deferred triggers fire with the flag already gone. **Do not "tidy up" by
  resetting it.**
- **A trigger that has never fired is not a trigger that works.** Whole paths in this app
  were untested code until an owner walked into them. Treat any never-exercised path as
  unverified.

**Pages and components**

- **Rule 5.23(d) is the database's, and the cut dialog only reports it.** Once the
  player's NFL game this week has kicked off, `cut_player()` turns an immediate cut into
  an end-of-week designation by itself. The dialog calls `edfl_cut_timing_forced()` with
  the preview, shows its sentence verbatim and disables "Cut now". **Do not compute a
  kickoff in JavaScript** and do not offer "Cut now" when the sentence is present.
- **The scoreboard's "Final" is the view's `week_is_final`**, which compares the week's
  last sync with its last NFL kickoff. Never derive it from a clock in the component.
- **The team grid spans every season `team_cap_by_season` carries money in (at least
  five)** — a fixed horizon hid charges past a contract's last void year. **The Cap
  Ceiling row shows the enforced ceiling** (set ceiling, else base cap), **never a
  multiplier**. PROV on a year tag is `league_cap_settings.is_provisional`.
- **The practice squad badge and warning read `locked` and `last_demotion_available`.**
  Three counted weeks do not end eligibility; they buy one last demotion. The urgent tone
  belongs to `last_demotion_available`, not to a week count.
- **Importable and publishable seasons are one list from `importableSeasons()`** (every
  completed league year, read from `league_config`). **Never hardcode a season list.**
- **The player sync never overwrites a `gsis_id` a row already has** — Sleeper has carried
  wrong ones; the crosswalk trigger fills what is missing.
- **The Calendar Loader converts no times.** Its inputs are `datetime-local` strings in
  Eastern wall-clock, passed to the database as text; the database converts them
  (`edfl_et`) and the admin views hand them back the same way (`edfl_et_local`). Doing the
  offset in JavaScript would be wrong for half the season. Order checks, the started-week
  lock and the rule-reference guard are the database's; the page's "Started" and
  "Provisional" chips are the view's own flags.

- **A shared impact component stays shared.** An owner reads those figures before
  accepting; the officer reads them before executing. Two renderers would drift and an
  owner would accept one set of numbers while another was acted on.
- **Do not simplify the offer-status reducer.** It once read "withdrawn" for an offer that
  was still standing, because a later re-submission was not accounted for.
- **Do not fold the "what did I give up" table into the "what do I have" table.** They are
  different questions and one table with a flag answers neither cleanly.
- **Do not hard-code a year range, a count, or a first and last season** for a strip built
  from data. That assumption has been wrong twice.
- **`components/Breadcrumbs.js` never reads.** Every crumb label comes from data the calling
  page already loaded under its own gate. A crumb that looked a name up for itself would be
  a second copy of that gate, and could say what the page refuses to — the trade detail
  page's not-found wording deliberately does not reveal whether a private draft exists.
  It also stays hook-free with no `'use client'` (server pages and client components both
  mount it), uses plain `<a>`, reuses `.page-actions` rather than adding CSS, and **drops any
  non-final crumb without an `href`**: a middle crumb links only to a route with a
  `page.js`, and several URL segments here have none. **Error and not-found branches keep
  their own link rows on purpose.**
- **The Player Card's top row is not a way back.** `PlayerLink` opens the card in a new tab,
  so the page the reader came from is still open behind it. The row exists for arrivals by
  pasted URL, bookmark or phone history. **Do not replace it with a history-based or
  `?from=` back link** — the link carries `noreferrer`, so the card cannot know its origin.
- **Do not unwrap the nested elements in a history cell** — every child of that cell is a
  flex item, and bare siblings lay the lines out side by side instead of stacked.
- **A snapshot records what the officer saw when they decided.** **Do not "improve" a
  stored snapshot into a live read** — that changes what the log records after the fact.
- **A page's reads do not all fail the same way, deliberately.** A read that *is* a
  panel's content fails closed — no panel, a banner instead, because an empty table looks
  like a working one. A read that only *supplies settings* fails open — the page renders on
  its fallback and says so, naming the value in use when it changes which controls are
  offered. **Do not make these consistent** in either direction.
- **A message written for verbatim display is rendered unchanged.** Do not paraphrase it
  or rebuild the sentence from the counts beside it.
- **Do not collapse the two arrays in the injury sync into one**, and note it refuses a
  feed that returned zero tracked players — an empty feed would otherwise clear every
  designation in the league.
- **The injury route is scheduled twice (`0 21` and `0 22` UTC) and pulls only in the 5 PM
  Eastern hour** — Hobby crons are UTC and fire anywhere in the hour, so exactly one lands
  in 17:xx ET and the other returns a 200 `skipped`. **Do not collapse the schedules or
  drop the hour check**; either moves the pull onto the 4:00 PM ET filing deadline for half
  the year. The admin page's button is the manual pull.
- **The injury pull stays a Vercel cron calling a route**; the array is handed to the RPC
  as `jsonb`. The database's own `pg_cron` jobs are made in the project chat and are not a
  reason to move this one.
- **The league id is read from config, never hardcoded.**
- **Do not bump the spreadsheet library pin casually** — the pinned version is the last
  its publisher shipped to npm, and its advisories are parsing-only, which does not apply
  to a write-only path.
- **Do not re-sort or re-key an already-sorted list** returned ordered by the view.
- **Control precedence in the bid list is ordered and first-match-wins**, and the live-bid
  branch sitting before the delegation branch is load-bearing: a delegation can sit at
  draft while the bid it produced is still live. Offering Cancel there suggests removing
  the entry removes the bid, and it does not.
- **Unrecognised statuses fall through to the raw string** rather than being guessed at.
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
- **One intended mismatch in the status row builder is documented in the source.** Do not
  "fix" it.
- **PPV weights are fetched from their table, never hardcoded.** The fallback constant is
  a failed-fetch cushion, **not** a source of truth, and must be kept equal to the table
  by hand. Three copies of those weights is what once let a form label a 680 deal as 501.

---

## Key libraries (`lib/`)

`getCurrentTeamOwner.js` — identity, and exports `isCommissionerOrCo()` and the shared
refusal string. The two-gate comment block in that file is the authority.

`supabaseClient.js` (browser) · `supabaseServerClient.js` (session-aware server) ·
`supabaseAdmin.js` (service role, sparingly — see the database boundary) ·
`safeNext.js` · `formatDate.js` · `formatMoney.js` · `tierRows.js` (**the** status
vocabulary) · `bidMath.js` · `contractMath.js` · `contractAssistant.js` ·
`leagueMinimum.js` · `bidPayload.js` · `delegationNotes.js` · `thirtyPercentRule.js`
(the only client implementation of the 30% Rule; all three forms import it) ·
`ppvMath.js` · `deadCapPreview.js` · `optionBonusApply.js` · `statsHelpers.js` ·
`injuryReport.js` · `injurySync.js` · `freeAgentPool.js` · `restructureRoster.js` ·
`tradeStatus.js` · `featureFlags.js` · `playerSearch.js` (the shared minimum-query
length and result cap — the page, the Server Action and the app bar box all import
them rather than each picking a number)

**Each of these is the single client implementation of what it owns.** Several exist
specifically because the logic had been copied two or three times and had already
drifted. **Single-implementation modules stay single-implementation** — if you find
yourself writing a second copy of one, that is the signal to stop and import instead.

---

## Keeping this file honest

**Update it in the same commit as the batch that changes established behaviour, and
report the hash.** When an entry is superseded, **replace it** — this file must shrink as
often as it grows.

Two failure modes have both happened, and the second is worse: **saying something that is
no longer true** (this file once named a retired checkout, in capitals, twice), and
**saying nothing where a reader will infer** — a reader with no snapshot invents one and
reasons correctly to a wrong answer. The resolution is neither a snapshot nor silence:
**state the ignorance explicitly**, as ground rule 3 does.

**What belongs here:** conventions, structure, and decisions that must not be undone —
all of which describe code. **What does not:** league state, row counts, version numbers,
what has shipped, what any rule currently says, and any folder path. Put those in the
to-do list or the reference documents; one found here is a defect, not a fact.

**The repo wins on repo facts; the project chat wins on database facts.**
