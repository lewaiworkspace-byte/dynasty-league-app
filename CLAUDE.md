# CLAUDE.md — EDFL Dynasty League App

**Generated September 8, 2026; last revised September 19, 2026 (America/New_York)** from Project
Reference v8.2, Technical Manual v21 and Standing Rules v1.11, with database conventions re-checked
against Database Reference v2.1. **If today is more than about a week after that date, say so
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

### The app has no public face, and `middleware.js` is the whole of that

**Every path requires a session except three:** `/login`, `/auth/callback` and
`/api/cron/*`. Everything else redirects to `/login?next=…`. One gate and one allowlist
replaced twenty per-page redirects beside twenty-five pages that had none — **a new route
is now closed by default, which is the point.**

**Thirteen page routes have no gate of their own and depend on that file alone:**
`/actions` `/bids` `/bids/results/[tierId]` `/calendar` `/cap-sheet` `/draft-picks`
`/league` `/scoreboard` `/standings` `/stats` `/stats/player/[playerId]`
`/team/[teamId]` `/waivers`, plus the two export routes. They were the public pages before
the front door closed, so they still read through the anon client. **Editing that allowlist
un-gates all thirteen at once, with nothing behind them.** The other thirty keep their own
redirect as a second line — belt and braces on purpose; removing one because "the
middleware covers it" is the wrong direction.

**The anon GRANTS behind those thirteen are still open**, so anyone with the publishable
key can read those views outside the app. Closing that is a sequence: move the pages to the
session client, deploy, confirm, *then* revoke. **Revoking first blanks thirteen pages.**

| Route | What | Access |
|---|---|---|
| `/` | **Renders nothing.** Redirects a linked owner to `/team/<their team>` and anyone else to `/league`. There is no index page | Any logged-in owner |
| `/league` | This week's scores and the standings table. A glance; `/scoreboard` and `/standings` are the full pages and are linked from it | Any logged-in owner |
| `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/calendar` `/actions` `/scoreboard` `/standings` | Formerly public, now gated by the middleware alone — **no redirect of their own** | Any logged-in owner |
| The **Refresh from Sleeper** control on `/scoreboard` | **Not officer-gated, deliberately** — waiver priority went stale whenever the commissioner was away on a Tuesday | Any logged-in owner |
| `/waivers` | **No gate of its own**, like the Scoreboard — the page never redirects, and the database decides whether the wire is open at all (`edfl_wire_live()`), drawing one line when it is not. **Do not add a page-level gate**; the middleware is the front door | Any logged-in owner |
| The **claim controls** on `/waivers` (Claim, reorder, Withdraw) | Sealed: an owner sees only their own claims until the run executes — RLS on `waiver_claims`, not the page. **No count and no names of who else is in**, the same ruling as free agency's contested flag | Any logged-in owner |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` `/player/[playerId]` `/trades` `/trades/new` `/trades/[tradeId]` `/restructure` `/fifth-year-option` `/transactions` `/injury-report` `/injury-report/export` `/search` `/league-finances` | Owner pages | Any logged-in owner |
| `/league-finances` | **Every team's fines, itemised, to every signed-in owner** — not own-team-only and not public. The two views it reads (`league_fines`, `league_fund`) have no `anon` grant. Read-only: fines are posted by the database, never from a form | Any logged-in owner |
| `/draft-picks` | **Login-gated BODY, no page redirect** — the board view has no `anon` grant, so the read is skipped and explained rather than refused. That branch now only fires for a signed-in login with **no `team_owners` row**, which is a real state, not dead code | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash` `/admin/owner-activity` `/admin/trades` `/admin/restructure` `/admin/fifth-year-option` `/admin/sleeper-sync` `/admin/injury-sync` `/admin/sync-players` `/admin/import-stats` | Widened admin pages. **`/admin/sync-players` and `/admin/import-stats` write through the service-role client, so their Server Action checks are the whole gate** — no database function stands behind them | Commissioner **or** co-commissioner |
| The **Publish Season Results** panel on `/admin/import-stats` | Officer control; `publish_edfl_season_results()` gates on `auth.uid()` itself and refuses an overwrite unless republish is passed. Republish is a separate two-step control | Commissioner **or** co-commissioner |
| `/admin/calendar` | **Calendar Loader** — edits league weeks and calendar entries. Strict by the default-DENY rule; every `calendar_*` function calls `require_commissioner()` | Commissioner only |
| The **officer action banner** | **On `/admin`, not on `/`** — it moved to the portal on September 17, 2026 with the thirteen admin buttons. `officer_action_items()` REFRESHES a state table on every call, so it belongs on a page two people open, not on a home page the whole league loads. The app bar's pill reads `officer_action_badge()` instead: two integers, no refresh, no titles | Commissioner **or** co-commissioner |
| The **commissioner pill** in the app bar | The **only** door to `/admin`, drawn only for an officer. Hiding it protects nobody — `officer_action_badge()` refuses a non-officer itself, the portal layout re-checks, and every `/admin` page redirects. It stops showing people doors they cannot open | Commissioner **or** co-commissioner |
| `/api/cron/injury-sync` | Not a page and not owner-reachable | **Vercel Cron only** — bearer `CRON_SECRET`, 503 if unset |
| The appointment control on `/admin/owner-activity` | Strict control on a widened page | Commissioner only |
| The **Owner directory** on `/team/[teamId]` | **A block at the foot of the Overview tab**, not a tab of its own — Team HQ has three tabs (Overview, Roster, Money) and this was one of the two that went. It is the only place an ordinary owner can edit their own card. **Self-edit only, for everyone** | Any logged-in owner |
| The **Designated cuts** block on `/team/[teamId]` | Own-team-only block under the tabs: end-of-week cuts not yet fired, with Withdraw. Read through the session client, filtered on the team's own contract ids. **Omitted when empty; a failed read renders its message**, never nothing | The team's own owner |
| The **Owner Directory** on `/admin/owner-activity` | The same component at `editScope="all"` — the one place officer editing of another owner's card lives | Commissioner or co-commissioner |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

> Page gates are recorded above as the **code** currently gates them. Whether a page
> *should* be strict is a league question that has moved before — check with the
> commissioner before widening or narrowing one, and change the page gate, every Server
> Action gate and the drawer line in the same commit.

**Every page with its own gate uses both layers, always:** the three-line gate
(`getCurrentTeamOwner()` → `redirect('/login?next=…')` signed out → `redirect('/')`
non-officer) **and** an independent re-check inside every Server Action. `next=` targets
pass through `safeNext()`. The thirteen routes listed above have no page gate; their
Server Actions still re-check, and the ones that write still refuse in the database.

**`getCurrentTeamOwner()` returning null no longer means "signed out."** The middleware
means nobody unauthenticated reaches a page at all, so a null owner is a real login with
**no `team_owners` row** — a state the app bar has rendered deliberately since September 7.
Copy written for that branch should say the login is not linked to a team, not "sign in".

### Hiding a link is presentation, not access control

The principle is unchanged and the surfaces it applies to have moved. Owners once clicked
admin buttons drawn for everyone, bounced home, and concluded the app was broken. **The
redirect and the Server Action re-check remain the real gates.** Never treat a hidden link
as a substitute for either, and **never disable a write path by hiding its link** — the
function behind it will run happily.

- **`app/page.js` renders nothing at all.** It is a redirect. Every admin link, caption and
  officer block that this section used to describe there is gone: the links are the
  Commissioner Portal, the officer banner is on `/admin`, and the pill in the app bar is
  the door. **Do not put a link of any kind back on `/`** — there is no page to put it on.
- **`components/NavDrawer.js` is the app's only index.** It is a static list with no server
  query; the app bar hands it `owner.team_id` for the Team HQ line and nothing else.
  Anything missing from it is genuinely hard to find — **check a route against the drawer
  before deciding it has a door.** `/bids` deliberately has none while the auction is
  dormant, and it is currently the only one.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`). **Never swap it for
  the helper.** If a strict page's gate ever widens, widen this in the same commit — not
  before.
- **Sync Players, Import Stats, Sleeper Sync and the Injury tools are all `canAdmin`.** The
  first two were strict until the commissioner's ruling that struck Technical Manual
  Appendix A.2(c); their pages and actions widened in the same commit.
- **The Calendar Loader sits inside `isCommish`**, with the page, its actions and the
  database all strict. Widen all four together or none.
- **The officer action banner renders what the database composed, verbatim.**
  `components/OfficerActionBanner.js` never reads and never decides; **`app/admin/page.js`**
  calls `officer_action_items()` through the **session** client (the function gates on
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

### The design system

`app/layout.js` loads `globals.css`, then `tokens.css`, then `kit.css`. **`globals.css` is
untouched and stays that way**: every rule in it reads its colours through variables, so
`tokens.css` repaints all 1,765 lines without editing one. The old look is two one-line
deletions away in `app/layout.js` — drop the `tokens.css` import for the old palette, drop
`className="edfl-app"` from `<body>` for the old shapes — and either works alone.

- **Both token blocks are `html:root`-prefixed**, making them (0,2,1) against
  `globals.css`'s own (0,2,0). They win on **specificity**, not on the order Next.js
  concatenates CSS chunks in, which nothing guarantees. **Do not drop the `html`.**
- **Dark is the base**, via `:not([data-theme="light"])`, which also matches the
  no-attribute case — so the palette does not depend on the inline theme script having run.
- **`--bar-*` and the hero carry the SAME values in both themes.** Both sit on `--hero`,
  which is `#0A0D12` in light and dark alike, so anything on them that reads a theme token
  turns dark-grey-on-near-black the moment an owner picks light. Phase 1 shipped exactly
  that and nobody saw it because the league was in dark. The bar uses tokens because it is
  on every page; `.edfl-hero` and `.edfl-rail` use **literal hexes copied from the dark
  palette** because they are one page — **if that palette moves, move them by hand.**
- **The reflow is scoped to `.edfl-app` on `<body>`.** Its one idea: **a link navigates, a
  button acts** — `a.btn` is a quiet tile, `button.btn` is the neon action. It needed no
  page edits because the markup already distinguished them.
- **Neon is the action colour and nothing else wears it**; one per screen, and it is the
  thing you can press. **Gold is attention** — a figure still moving, a count at its limit.
  Hence a matchup leader is *brighter* rather than coloured, and a bare link is body ink
  with an underline and neon only on hover.
- **Colour on a roster row means CONTRACT TYPE, never position**, and marks the exceptions:
  rookie teal, practice squad dimmed and dashed, veteran free agency unmarked. Keyed on
  `contract_type`, **not `roster_status`** — different facts, and the table shows the second
  as its own tag. The three-colour version is rejected permanently: its blue and violet
  were `--c-cap` and `--c-ppv`, and a currency colour means one thing everywhere.
- **`globals.css` has no rule for an unclassed `<a>`**, so every bare link rendered in the
  browser's default blue. `kit.css` fixes it with `.edfl-app a:not([class])`, and
  **`:not([class])` is the whole of the scoping** — anything with a class already has a
  rule and this must not reach it.
- **The app bar is one flex row with no wrap.** For a signed-in officer its children
  measured 605px against a 400px viewport until `kit.css` hid the search box below 640 and
  the pill's label below 480 — targeted by shape (the only `form[role="search"]`, the only
  unclassed `<span>`) rather than by adding classes. **Adding a control to the bar means
  measuring it at 400px**, not looking at it.

- **`kit.css` grows by APPENDING a dated block and touching nothing above it.** Every batch
  since the design layer has done that, and it is the only reason an SR-38 complete-file
  replacement of a 45KB stylesheet is checkable: the diff is one hunk at the end. **A new
  component class carries an owned prefix** — `.kit-`, `.edfl-`, `.mk-` — and is defined
  there. **Never add a rule to `globals.css`, and never redefine a class it owns**: `.pc-*`
  alone is nineteen classes worn by files your batch may not be touching.
- **To change how an existing class looks, scope the override to `.edfl-app`** and say in the
  comment what it overrides and why.
- **Prefer a real class to `:has()`** for a layout rule. It works in every browser this app
  supports, but a layout rule that silently does nothing on an older one is not worth the
  elegance when a class on the element costs nothing.
- **Verify a layout by MEASURING it, not by looking at a screenshot.** `scrollWidth` against
  `clientWidth`, and every element's `getBoundingClientRect()` against the viewport, at each
  breakpoint. A screenshot cannot show overflow because the overflow is off the frame — which
  is how the app bar overflowed every phone for a week, and how `/cap-sheet` dragged the whole
  page sideways by 68px for far longer. **An element crossing the viewport edge is only a
  defect if it is not inside a scroll container**: walk up to the nearest ancestor with
  `overflow-x: auto|scroll` before reporting it.
- **Check every ink against every surface it lands on.** The same token sits on the page
  background, on a card and on a raised cell, and those are three different contrast tests.
  `--ink-3` passed against one and failed AA against the other two.

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
- **`globals.css` grows by append, and since the redesign it does not grow at all.**
  New work goes in `app/kit.css`. If something genuinely has to go in `globals.css`, it is
  appended at the end in shipped order — **never reflow what is above**, and never rewrite
  it whole (SR-38: a complete-file replacement of it once nearly deleted 2.5 KB of another
  feature's styling).
- **Shared CSS blocks have more than one consumer.** Before changing a feature block,
  check who else wears it — at least one has quietly acquired a second page.
- **Some `display` repetitions exist for specificity** and are commented. **Do not tidy them.**
- **Theme mechanics:** `data-theme` on `<html>`, set by a pre-paint inline script in
  `app/layout.js`, stored in localStorage under `edfl-theme`, `suppressHydrationWarning`
  required. **Dark is the default** — the media-query fallback is gone, and a one-time
  reset under `edfl-theme-d1` delivered that to browsers already holding `light`. The
  toggle lives on the LEFT of the app bar. See **The design system** above for the palette.
  **The bar is sticky, not fixed** — sticky keeps it in the document flow so it takes its
  own height and covers nothing. **Do not convert it back to fixed** to reclaim the space.
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
- **"Final" is the view's `week_is_final`**, which compares the week's last sync with its
  last NFL kickoff. Never derive it from a clock in the component. Three surfaces read it
  now — the Scoreboard, `/league` and Team HQ's matchup tile — and **a week with scores
  that is not final is drawn in gold and says IN PROGRESS**, because a number still moving
  must never look like a settled one. On such a week the "leader" is only whoever was ahead
  at the last sync, and each surface says so.
- **Team HQ is three tabs: Overview, Roster, Money**, and Money is the old Overview grid
  unchanged. Draft Picks went back to `/draft-picks`, which it duplicated; Owner Info became
  a block on Overview, the only place an ordinary owner edits their own card. **Do not add a
  fourth without deciding what comes off.** The compliance banner sits **above** the tabs so
  it does not vanish when one is switched; the Overview's roster counts are columns of
  `team_inseason_compliance`, the same row that banner reads, so **no roster is counted in
  JavaScript** and the two cannot disagree. A count at its limit is gold, over is rust, and
  **under a limit is not a failure** — short of 25 is legal, by ruling.
- **The team grid spans every season `team_cap_by_season` carries money in (at least
  five)** — a fixed horizon hid charges past a contract's last void year. **The Cap
  Ceiling row shows the enforced ceiling** (set ceiling, else base cap), **never a
  multiplier**. PROV on a year tag is `league_cap_settings.is_provisional`.
- **`waiver_priority_order()` is called with no arguments.** Both parameters default to
  "current season, every week scored", which is the order the run itself uses; passing a
  through-week shows a figure the run does not. The order moves with every sync while a week
  is unfinished, so **any surface showing it says provisional**. Priority is **lowest points
  for**, never record.
- **The roster table is wrapped in `.table-scroll`.** Nine nowrap columns need about
  1,080px against a 992px page column, so between 640px — where `globals.css` flips
  `.ledger` to cards — and roughly 1,120px it pushed the whole page sideways. **Do not
  unwrap it.**
- **`/league` is a glance; `/scoreboard` and `/standings` are the pages.** It reads the same
  two views and links to both. **Do not give it week tabs, a refresh control, or the columns
  those pages own.**
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

- **`/cap-sheet`'s table is wrapped in `.table-scroll` and must stay wrapped.** Eight
  columns, 1,048px of natural width with the real fonts: bare, it scrolled the whole page
  sideways between the 640px card flip and about 1,100px. The wrapper confines the scroll to
  the table and costs no CSS. Below 640 `.ledger` flips to cards and the wrapper has nothing
  to do — **do not "simplify" it away on the strength of a phone screenshot.**
- **`TradeImpactCards`' `money` prop is the FORMATTER, not a boolean.** Its three rows round
  differently and must: cap before/after are `cap_used`, a charge, so `formatCost`; cash
  before/after are `cash_available`, room, so `formatRoom`; the roster row is a headcount and
  passes `false`. The cap ceiling is a league constant and stays half-away. The cash
  direction is the load-bearing one — `trade_impact()` sets `cash_ok` from
  `(cash_after >= 0)`, so a team at `-$0.33` must not print `$0` beside a Blocked chip.
  **`ImpactRow` is module-private with exactly three call sites; check that before changing
  its props.**
- **The player card's terms strip and its season tables round differently, and both are
  right.** The strip and the contract history describe a **deal** — its total value, its
  average, its signing bonus, its guaranteed money — which R-12 names as a ledger figure. The
  season tables are **charges** and round up. They can differ by a dollar on the same
  contract. **If they ever round the same way, one of them is wrong.**
- **`CutPlayerDialog`'s forgiven rows are half-away and its settlement rows round up.** That
  line was drawn in the file before R-12 existed — its own comment calls a forgiven amount
  "a roll-up and not a settlement figure" — and R-12 agrees with it. The four `.row-note`
  rows are money nobody is charged and nobody may spend.
- **`MarketValueTab`'s two Change cells call `formatMoneyDelta` and then strip the `$`.**
  That is deliberate: the helper is being used for its signed `+/-` and its grouping, not as
  currency, and the strip is what keeps a PPV delta from rendering as money. **Remove the
  whole call or leave it alone; do not remove the `.replace()`.**
- **The waiver wire's priority chip calls `waiver_priority_order` with the RUN's arguments,
  not the defaults.** The function defaults both parameters to null, meaning "this season,
  every week so far". `waiver_run_preview()` — which `waiver_run_apply()` calls, and whose
  answer it stores as `priority_snapshot` — asks for `(season_year, week_number - 1)`. Called
  bare, the chip would disagree with the run the moment the current week's scores landed.
  **When a page shows the result of a function the engine also calls, pass the engine's
  arguments.**
- **A read through the MCP cannot tell you what an owner is entitled to see.** That
  connection is privileged, so a `security_invoker` view returns rows no owner would get.
  Check the flag that governs visibility — `auction_tiers.verified_at`, not the rows that
  came back. And while a competitive window is open, a sealed table is not read through it at
  all: the waiver wire's render fixture was built with invented claim rows for that reason,
  and its header says so.

---

## Key libraries (`lib/`)

`getCurrentTeamOwner.js` — identity, and exports `isCommissionerOrCo()` and the shared
refusal string. The two-gate comment block in that file is the authority.

`supabaseClient.js` (browser) · `supabaseServerClient.js` (session-aware server) ·
`supabaseAdmin.js` (service role, sparingly — see the database boundary) ·
`safeNext.js` · `formatDate.js` · `formatMoney.js` (five named exports —
`formatMoney`, `formatCost`, `formatRoom`, `formatMoneyDelta`, `formatExactMoney` —
and the header comment is the authority on which to call) · `tierRows.js` (**the** status
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

**This file is over its own line and knows it.** Standing rule SR-40 says that if CLAUDE.md is
found growing past roughly 600 lines again, the rule is being ignored rather than outgrown. It
is past that. The "Do not undo these" list is the bulk of it, and the review question for every
entry there is **"does the code this entry describes still exist?"** — several describe files
the redesign replaced. **That pass is owed and is deliberately not being done unattended**:
dropping a still-live invariant is worse than carrying a dead one for another week.

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
