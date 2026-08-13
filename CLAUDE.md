# CLAUDE.md — EDFL Dynasty League App

Briefing for Claude Code. Accurate as of commit `30f5b22` (August 12, 2026).
If the repo disagrees with anything below, the repo wins — report the discrepancy,
don't silently reconcile it.

---

## What this is

Companion app for a 10-team dynasty fantasy football league (EDFL) run alongside
Sleeper. The app is the system of record for contracts, salary cap, and Owner Cash —
none of which Sleeper tracks. Live at dynasty-league-app-gold.vercel.app.

**Stack:** Next.js 14, App Router, plain JavaScript (no TypeScript), Supabase
(Postgres + RLS), Vercel.

---

## Ground rules for every task

1. **Audit first.** Read the actual current state of every file you're about to touch,
   and check `origin/main`, before writing anything. Report findings before making
   changes. Documentation (including this file) has been wrong about repo state
   before; the repo is the truth.
2. **You have NO database access.** All database work happens chat-side via Supabase
   MCP. Never write code that assumes you can run a migration; if a task needs schema
   work, say so and stop. **Corollary: do not re-litigate database facts.** If the
   chat handoff states an RPC/view/column exists, it was verified against the live
   database — flag it once if you must, but a missing name in THIS file means this
   file is stale, not that the object is missing. (This exact loop cost three
   round-trips in the Cut Player build.)
3. **Complete files only** in any report or handoff — never diffs or "change this
   line" instructions. When asked to paste a file verbatim, paste it verbatim —
   summaries in place of contents have stalled builds twice.
4. **Confirm every push with a commit hash** in your report.
5. **No build verification is possible here** — no Node runtime, no node_modules.
   Do not claim anything "builds." The Vercel deploy is the only real check; flag
   anything needing a post-deploy click-through. (Standing to-do: this gap means no
   frontend change is ever compiled before deploy.)
6. **No path alias exists.** All imports are relative.
7. **Backtick caution applies to code received in chat handoffs**, not to template
   literals already in repo files.
8. **`grep '^\.'` against globals.css is not a class inventory** — it misses every
   rule inside media queries and every indented line. Search anywhere on the line.
   (This produced a false "class missing" report once.)

---

## File map

### App routes (`app/`)

| Route | What | Access |
|---|---|---|
| `/` `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/actions` | Public pages | Deliberately ungated — do NOT add auth |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` | Owner pages | Any logged-in owner |
| `/admin/*` (new-contract, new-tier, sync-players, import-stats, cash, tier-results, fix-contracts, **owner-activity**, **cuts**) | Commissioner pages | Commissioner only |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

Every gated page: the three-line gate (`getCurrentTeamOwner()` →
`redirect('/login?next=…')` signed out → `redirect('/')` non-commissioner) AND every
Server Action independently re-checks. Both layers, always. `next=` targets pass
`safeNext()`.

**Home-page admin links:** seven render for everyone (page gates bounce
non-commissioners on click). **The Cuts link is the one exception** — guarded
`{teamOwner?.is_commissioner && …}` in `app/page.js`, the first hidden admin link.
The optional chain is load-bearing (`teamOwner` is null signed-out).
`/admin/import-stats` is linked from nowhere (known gap, on the to-do list).

### The Cut Player feature (shipped `f8fec0b` + `bdd2d0f`, Aug 10 2026)

- `app/team/[teamId]/page.js` — server component; now resolves the viewer via
  `getCurrentTeamOwner()` and passes `canCut` (own team OR commissioner). Reads
  `team_cut_previews` RPC for the current season's authoritative Dead If Cut;
  future seasons fall back to `dead_cap_if_cut` and are stamped "est." in the UI.
  `canCut` uses `===` between the URL param and `me.team_id` — **safe because
  `teams.id` is uuid** (PostgREST returns it as a string). Verified from the
  database; do not "fix" with String() wrappers, and do not copy this pattern to
  any integer-keyed table.
- `app/team/[teamId]/TeamCapSheet.js` — Cut button on own-team current-season
  rows only (cutting is present-tense). Dead If Cut shows the live engine figure
  with a "+$X next yr" tag when a June 1st split applies.
- `app/team/[teamId]/CutPlayerDialog.js` — **first dialog primitive in the
  codebase** (`.modal-*` classes in globals.css). Every figure comes from
  `compute_cut_charges` via the `previewCut` action; **nothing is computed
  client-side, by design — keep it that way.** Two-press confirm. June 1st
  checkbox renders only when the election window is open, with the remaining
  count.
- `app/team/[teamId]/actions.js` — `previewCut` / `executeCut` wrappers.
- `app/admin/cuts/` — commissioner ledger of every cut. `CutsPanel.js`: rows the
  database says are irreversible show WHY (same precedence order as the DB
  guards) instead of a dead button; reversal dialog requires a typed reason.
  Reads `cut_history` with an explicit `.range(0, 499)` and shows a truncation
  notice at the cap — the *bound-and-warn* half of the row-ceiling rule below.
- CSS: `.modal-backdrop` `.modal-card` `.modal-title` `.modal-section`
  `.modal-check` `.modal-summary` appended to globals.css. First consumers of
  `.btn-danger` and `.form-notice`.

### The Tier Results Export (shipped `318c99c`, Aug 11 2026)

- `app/bids/results/[tierId]/export/route.js` — **the app's second Route
  Handler** (after `/auth/callback`) and the first that returns a file. Public
  and ungated on purpose: the results page is public and the exported data is
  already published on it. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
  Takes `?format=csv|xlsx|pdf`; anything else is a 400. An **unverified tier
  returns 409** carrying the page's own wording, rather than the empty file the
  views would otherwise hand back.
- Reads `auction_tier_results` and `auction_tier_result_years` only — both
  SECURITY DEFINER, both filtered to verified tiers, which is what lets
  published results be public while the raw bid tables stay sealed. `bids`,
  `bid_years` and `bid_option_bonuses` are never queried; reaching around the
  views does not merely return nothing, it defeats the anonymity guarantee.
- Every figure is passed through from the views as-is. Nothing is recomputed,
  rounded or rescaled in JS. The PDF adds thousands separators for display
  only; CSV and XLSX carry raw values. Sort is identical in all three formats:
  player name, winners before losers, then total PPV descending.
- Three download links on `app/bids/results/[tierId]/page.js`, also ungated.
- **Dependencies:** `jspdf ^2.5.2` + `jspdf-autotable ^3.8.4` (~450 KB), chosen
  over `pdf-lib` because autotable owns the table pagination and nothing in the
  Claude Code environment can render a PDF to check that hand-rolled pagination
  worked. puppeteer (~250 MB, Chromium) and pdfkit were rejected. `xlsx
  ^0.18.5` was already present for the client-side stats export; its two
  advisories are parsing-only and do not apply to a write-only path — **do not
  bump that pin casually**, 0.18.5 is the last version SheetJS published to npm.
- Two gotchas worth keeping: `XLSX.writeFile()` targets a filesystem path and
  does nothing useful in a Route Handler — the server path is
  `XLSX.write(wb, { type: 'buffer' })`. And **freeze panes are a SheetJS Pro
  feature**; the community build silently ignores them, so both sheets set
  `!autofilter` and `!cols` instead. Do not re-attempt freeze panes expecting
  them to take.

### Key libraries (`lib/`)

Unchanged: `supabaseClient.js` (browser), `supabaseServerClient.js` (session-aware
server), `supabaseAdmin.js` (service role, sparingly), `getCurrentTeamOwner.js`,
`safeNext.js`, `tierRows.js` (THE status vocabulary), `bidMath.js`,
`contractMath.js`, `contractAssistant.js`, `leagueMinimum.js`, `bidPayload.js`,
`delegationNotes.js`. Single-implementation modules stay single-implementation.

---

## Rules encoded in this codebase — do not break these

**Dead money is computed in the database only.** `compute_cut_charges()` is the
single implementation of the settlement rules (rule book v12 5.18): weekly salary
accrual at 1/14 per game week charged 00:01 Eastern on the day of that week's
**first game — never assume Thursday**; unearned non-guaranteed forgiven; ALL
remaining guaranteed salary accelerating cap AND cash to the current season
(never splittable); prorations accelerating or splitting under June 1st
treatment; untriggered option bonuses vaporizing; roster bonus keyed to Sep 2.
No JS reproduces any of this arithmetic. The dialog re-queries on every
designation toggle rather than recalculating.

**Cut gates live in the database:** `cuts_open_after` (Aug 12 2026), the
unverified-auction-tier block, the League Reset freeze (Feb 21–end Feb),
ownership. The UI's job is to surface their error messages, not to duplicate
them.

**June 1st designations: 2 per team per league year** (`league_config`), elections
only (Mar 1–May 31); automatic post-June-1 splits consume nothing. Read
`june1_designations_remaining()`; never count events in JS.

**Cut reversal** (`reverse_cut()`): commissioner-only, 96h window SUBORDINATE to
the cross-season and player-signed-elsewhere guards — when multiple apply, the
superior guard's message wins, and `CutsPanel.blockedReason()` mirrors that
order. Reversed events are never deleted; **every consumer of `contract_events`
must filter `reversed_at IS NULL`** (or use `cut_history.is_active_cut`) or it
resurrects reversed dead money.

**`contract_year_computed.dead_cap_if_cut` is superseded** — a static estimate
the team page only uses for future seasons, labeled "est." Do not extend its use;
the authoritative number is `compute_cut_charges` / `team_cut_previews`.

**Void years come in two kinds, and only one of them belongs to owners.**
*Owner-elected* void years spread a signing bonus: maximum 2, the span must
still fit inside 5 years, and they are the existing `void_years` columns and
their constraints. *Option-bonus* void years are created AUTOMATICALLY by
database triggers whenever an option bonus is scheduled — `rebuild_option_void_years`
on contracts, `rebuild_bid_option_void_years` on bids — and carry
`void_reason = 'option_bonus'`, never signing-bonus proration. They can extend a
contract's span to at most 9 years. **Client code must never create, count or
limit option void years**; the database owns them start to finish, and any JS
that tries to police them will disagree with the trigger the moment an option
bonus moves. Rule book v13 5.7 / 5.20.

**The 30% Rule is enforced in the database, on contracts AND on bids.**
Compensation for the test = guaranteed + non-guaranteed + roster bonus +
option-bonus proration (the amount ÷ 5, spread across its five seasons); signing
bonus is excluded. Each season may exceed the prior season by at most 30% of
Year 1 compensation. Deferred triggers reject a violation at submit and name the
season, the step and the maximum, so the error text is worth surfacing verbatim
rather than paraphrasing. Rookie and fifth-year-option contracts are exempt, and
`contracts.exempt_30pct` marks 8 permanently grandfathered contracts — **never
re-derive that set and never copy the flag onto a new contract.** A client
pre-check will mirror this later on the Deion pattern (client warns, database
decides); until it ships, database rejection is the only feedback an owner gets.
Rule book v13 5.22.

**Losing bidders are anonymous permanently, and the labelling is what enforces
it.** Rule 6.1(g), and it holds after publication, not just until it. Anonymous
labels restart at 1 **within each player**: "Bid 2" on one player has no
relationship to "Bid 2" on another, and a pseudonym that persisted across
players would let anyone reconstruct a team's entire slate by elimination —
which is the exact thing the rule exists to prevent. Losers are numbered in
their own sequence from 1; a winner never occupies slot 1, because implying an
ordering between the named row and the anonymous ones suggests a relationship
that does not exist. `bid_id`, `team_id` and `player_id` are grouping and join
keys only and must never reach any output, in any format — a UUID means nothing
alone but is a stable identifier, and printing it invites correlation against
anything that ever leaks. This fails silently: the export still builds, it just
leaks. Winners are named, and that is intended.

**Two row-ceiling patterns, and picking the wrong one is a silent bug.**
PostgREST caps an unbounded `.select()` at 1,000 rows with no error and no
warning. Two responses are correct and they are not interchangeable.
*Bound-and-warn* — an explicit `.range()` plus a visible truncation notice — is
for a ledger a human reads and scrolls, where the newest rows are the ones that
matter: `/admin/cuts` at `.range(0, 499)`. *Page-until-exhausted* — a `.range()`
loop with a stable, unique `.order()`, stopping on a short page — is for
anything that must be complete: `fetchAllPages()` in `statsHelpers.js`,
`fetchAllResultYears()` on the results page and again in the export,
`fetchAllExistingPlayers()` in the sync. **A file someone downloads and keeps
must never be bound-and-warn** — a truncated export looks complete forever, and
that has already caused two production bugs elsewhere. `.limit(5000)` is neither
pattern; it only relocates the invisible ceiling.

**The live-bid test is `submitted_bid_id`, never `status`.** (Unchanged; three
bugs came from violating it.)

**Control precedence in YourBidsPanel is ordered; 2-before-3 is load-bearing.**
(Unchanged.)

**One intended mismatch in tierRows is documented in the source — do not "fix"
it.** (Unchanged.)

**Server Actions that can fail live in client components.** The cut and reversal
dialogs follow this: every action call is `.then/.catch` in a client component,
errors land in `.form-error`. (Unchanged rule, two new conforming examples.)

**Withdrawal arithmetic lives in the database only.** (Unchanged.)

**Unrecognised statuses fall through to the raw string** in tierRows. (Unchanged.)

**PPV weights are fetched from `ppv_weight_table`, never hardcoded.** (Unchanged.)

**The chart's length multipliers are not the app's PPV weighting.** (Unchanged.)

---

## Theme & UI system

Light/dark via `data-theme` on `<html>`, pre-paint inline script, localStorage
`edfl-theme`, media-query fallback, `suppressHydrationWarning` required.

**Currency colours — one colour per currency, everywhere:** `--c-cap` blue ·
`--c-cash` green · `--c-ppv` purple · `--c-dead` rust, via `.v-cap` / `.v-cash` /
`.v-ppv` / `.v-dead`. Gold is reserved for pending/attention states.

**Status chips:** `tierRowTone()` mapping unchanged. `/admin/cuts` uses
`.status-live` for active cuts and `.status-off` for reversed.

**Dialogs:** `.modal-*` primitives exist now (see Cut Player above). Mobile: the
backdrop scrolls, the action row stacks column-reverse so the destructive button
is not under the thumb. `data-label` attributes are supplied by the cut dialog
and CutsPanel tables; older tables still lack them.

**Defined but not yet consumed:** `.btn-secondary` `.btn-block` `.action-bar`
`.legend` `.page-narrow` `.admin-form input.num-input`. (`.btn-danger`
`.form-notice` `.btn-quiet` `.table-scroll` `.col-num` now have consumers.)

**Salary Ceiling on the team page is a known live defect** — flat ×1.11 across
all seasons, abolished by rule book v11 5.5. The `CEILING_MULTIPLIER` comment in
`TeamCapSheet.js` records this honestly (kept display-identical on purpose);
the rebuild is to-do item 2 and needs per-team rollover data. Do not "clean up"
the constant or the comment outside that item.

Fonts: Oswald / Inter / IBM Plex Mono via next/font/google. Geist was rejected —
don't re-propose.

---

## Database boundary (context, not access)

Enums vs text: `contracts.contract_type` enum, `bids.contract_type` text —
copying needs `::contract_type`. `contract_status` includes `cut` and
`cut_june1`. `teams.id` is **uuid**. `teams.sleeper_roster_id` is text.
Sealed-bid RLS unchanged. `fire_mode: 'at_close'` still has no executor — do
not surface it.

Functions the app calls by RPC: `submit_bid`, `withdraw_bid`,
`tier_withdrawal_allowance`, `upsert_bid_delegation`, `arm_bid_delegations`,
`cancel_bid_delegation`, `chart_bid_target`, `minimum_legal_bid_ppv`,
`evaluate_auction_tier`, `pass_over_winner`, `verify_auction_tier`,
`commissioner_delete_contract`, `commissioner_delete_bid`, **and from the Cut
Player feature: `compute_cut_charges`, `cut_player`, `team_cut_previews`,
`reverse_cut`** (plus `june1_designations_remaining` and
`cut_reversal_hours_left`, currently read through the `cut_history` view and
the preview payload rather than called directly).

Views the app reads that carry cut logic: `cut_history` (includes
`is_reversible`, `reversal_hours_left`, `is_active_cut`), `team_cap_summary`
(counts dead money, honors reversals — rewritten three times Aug 10; the
downloaded "phase2" SQL file is obsolete and dangerous). `league_config` now
carries `cuts_open_after`, `june1_designations_per_year`,
`cut_reversal_window_hours`. `league_weeks` exists and is empty until the
schedule loader ships (empty = zero weeks charged, correct pre-season).

**Verified against the live database Aug 11, 2026 — do not re-flag these as
unverified.** New columns: `contract_years.void_reason`, `bid_years.void_reason`,
`contracts.option_void_years`, `bids.option_void_years`, `contracts.exempt_30pct`.
`contract_year_number` now allows **1–9**, not 1–7. `contract_years.option_bonus`
and `contract_years.prorated_option_bonus` are **legacy and zero on every row** —
`contract_option_bonuses` is the source of truth and the legacy columns must not
be read. **The New Contract form writes real option bonuses to
`contract_option_bonuses` as of the Aug 12 client batch**; it writes the legacy
`contract_years.option_bonus` as a literal 0 on every row, and that column must
never be read as data. Writing both would double-charge the cap and hide the
money from the 30% Rule trigger, which reads only the real table. `contract_year_computed.dead_cap_if_cut` now also includes a bonus that
triggered in the cut season; it remains the superseded estimate described above.
**$657.20 of real cap charges now sit in seasons 2031–2034**, which no five-year
grid in the app renders — open to-do, not a data error.

**Dropped by intent — never recreate:** `attempt_award_bid`,
`resolve_auction_tier`, `award_bid_to_next_best`.

Login dashboard-side state unchanged (6-digit OTP, Gmail SMTP).

---

## Known open items that live in code

- **Schedule loader unbuilt** — in-season cuts RAISE after Sep 1 with
  `league_weeks` unseeded. The to-do list's item 1.
- Salary Ceiling ×1.11 defect (item 2, see above)
- Post-deploy click-throughs pending: `/admin/cuts` render + hidden-link check;
  `/bids` status chips; dark-mode white-flash
- The cut dialog's June 1st election flow is browser-testable only from
  March 1, 2027 (window closed until then)
- Currency colours wired on `/team/[teamId]` only; cap sheet untouched
- Hardcoded 2026 season years: Cap Sheet, `/cash`, `/admin/cash` — one rollover
  batch with the `/cap-sheet` duplicate-row fix (fires March 1, 2027)
- `.col-status` 180px squeeze · `payloadToValidatorShape` positional args ·
  `contractAssistant` `y.optionBonus` · `meetsMinimumSalary()` unwired —
  all unchanged
- `/admin/import-stats` linked from nowhere
- **`DelegateForm.js` was not in the Aug 12 client batch and is now the odd one
  out.** It applies `optionBonusRecommendations` (line 279) exactly as BidForm
  does, so it inherits the corrected generator — but it validates with
  `validateBidDeion` + `validateBidMinimumSalary` only and **never calls
  `validateThirtyPercent`**. A delegated bid the owner edits by hand can still
  reach the database in violation and be rejected there with no client warning,
  which is the gap the batch closed everywhere else. 934 lines; needs the same
  three-line treatment ContractForm and BidForm got.
- The rule book is at **v13**. Sections cited above that predate it (the v11 and
  v12 references) are the version that rule was written under, not a claim that
  v13 left them alone.

---

## Keeping this file honest

When a batch changes established behavior, update this file in the same batch and
include its change in the same commit. Report the hash. This file has drifted
badly twice — once for two full sessions, and once within a single day (it didn't
know the cut RPCs existed while the UI calling them was being built, producing
repeated false "unverified RPC" flags). The repo wins on repo facts; **the chat
handoff wins on database facts.**
