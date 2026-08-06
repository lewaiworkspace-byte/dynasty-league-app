# CLAUDE.md — EDFL Dynasty League App

Briefing for Claude Code. Accurate as of commit `7f412e4ac97dbe34b35bbdf755a9f1b7fd7d3fca` (August 6, 2026).
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
2. **You have NO database access.** All SQL goes through the commissioner pasting
   into the Supabase SQL Editor. Never write code that assumes you can run a
   migration; if a task needs schema work, say so and stop.
3. **Complete files only** in any report or handoff — never diffs or "change this
   line" instructions.
4. **Confirm every push with a commit hash** in your report. A change without a
   reported hash is not done. (One theme-session commit lost its hash this way;
   don't repeat it.)
5. **No build verification is possible here** — there is no Node runtime in this
   environment. Do not claim anything "builds" or "runs." The Vercel deploy is the
   only real check; flag anything that needs a post-deploy click-through.
6. **No path alias exists.** No jsconfig.json or tsconfig.json — all imports are
   relative (`../components/ThemeToggle`, `../../lib/tierRows`).
7. **Backtick caution applies to code you receive in chat handoffs**, not to
   template literals already living in repo files. Leave existing literals alone.

---

## File map

### App routes (`app/`)

| Route | What | Access |
|---|---|---|
| `/` `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/actions` | Public pages | Deliberately ungated — do NOT add auth |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` | Owner pages | Any logged-in owner |
| `/admin/*` (new-contract, new-tier, sync-players, import-stats, cash, tier-results, fix-contracts) | Commissioner pages | Commissioner only |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler — kept alive only for links already in inboxes | Public |

Every gated page redirects (`/login?next=<path>` signed out, `/` for
non-commissioners) AND every Server Action independently re-checks. Both layers,
always. Redirect targets from `next=` must pass `safeNext()`.

### Key libraries (`lib/`)

- `supabaseClient.js` — browser client (@supabase/ssr)
- `supabaseServerClient.js` — session-aware server client; RLS applies as the user
- `supabaseAdmin.js` — service-role factory; use sparingly, it bypasses RLS
- `getCurrentTeamOwner.js` — logged-in team_owners row or null
- `safeNext.js` — validates `?next=` before any redirect (rejects non-strings,
  anything not starting `/`, `//`, `/\`, newlines). Every redirect through next=
  goes through this
- `tierRows.js` — THE single vocabulary for owner-facing bid/delegation rows:
  `buildTierRows()` (full-outer-merge on player_id), `tierRowStatus()` (labels),
  `tierRowTone()` (chip tones), private `resolveRowSource()` (precedence). Pure
  functions, no React. Consumed by both `app/bids/page.js` (ClosedTierRecap) and
  `app/bids/YourBidsPanel.js`. Never let a surface invent its own status wording
  or colour
- `bidMath.js` — bid preview math (option bonus weighting 90/80/70/60 by year);
  deliberately separate from `contractMath.js` (legacy flat option-bonus field)
- `contractMath.js` — contract-side math
- `contractAssistant.js` — `generateContract()` GM-philosophy generator, shared by
  the New Contract form, BidForm, and delegation authoring
- `leagueMinimum.js` — `seasonCash()` / `meetsMinimumSalary()`; the ONLY client
  implementation of the cash minimum-salary rule. Its constants ($9 base, 5%
  escalation) pair with the database and must change together with it
- `bidPayload.js` — the one form→RPC transform
- `delegationNotes.js` — delegation note helpers
- `formatDate.js` — the ONLY date formatter; forces `America/New_York` on every
  timestamp so a server-rendered time and a client-rendered one can't disagree.
  `formatDate()` deliberately treats a bare `YYYY-MM-DD` as a calendar date and
  formats it in UTC — converting a DATE column to Eastern shifts it a day
  backwards. Never call `toLocaleString()` directly
- `statsHelpers.js` — stats column definitions, paginated fetching, Excel export
- `tierRows.js` / `bidPayload.js` / `leagueMinimum.js` / `formatDate.js` are
  single-implementation by design: if you find the same logic appearing a second
  place, that's a bug

### Components

- `components/ThemeToggle.js` — client component, mounted from the server layout
- `app/bids/YourBidsPanel.js` — the owner's one-table-per-tier surface: withdraw,
  revise, cancel controls
- `app/bids/BidForm.js` — contract-builder bid form with live preview and
  client-side Deion validation
- `app/bids/DelegationPanelActions.js` — **DELETED. Do not recreate.** Its jobs
  live in YourBidsPanel

---

## Rules encoded in this codebase — do not break these

**The live-bid test is `submitted_bid_id`, never `status`.**
`upsert_bid_delegation()` resets status to 'draft' without clearing
submitted_bid_id, so a delegation can sit at draft/failed/skipped while its bid is
live. Three separate bugs came from checking status instead of the FK. Re-firing
submit_bid() on such a row resets submitted_at — the auction tie-break — silently
costing the owner won ties. Any eligibility, "produced a bid," or precedence check
reads the FK.

**Any query against a large table must be narrowed or paged.** PostgREST caps an
unbounded `.select()` at 1,000 rows and returns **no error and no warning** — the
code looks correct until the table outgrows the ceiling, then serves incomplete
data forever. This has already caused two production bugs: Fix Contracts showed
"Unknown player" for everyone past row 1,000, and the Sleeper sync inserted
hundreds of duplicate players because its existing-players read was truncated.
Big enough to matter: `players` (~3,190), `player_game_stats`, `nfl_games`,
`edfl_player_season_stats`, `auction_tier_result_years`, `player_value_history`
(500 rows per snapshot). Narrow with `.eq()`/`.in()`/`.single()`, or page with
`.range()` in a loop — and always `.order()` on something stable and unique, or
pages can overlap or skip rows. `.limit(5000)` is not a fix; it relocates the
invisible ceiling. Live examples: `fetchAllPages()` in `statsHelpers.js`,
`fetchAllExistingPlayers()` in `admin/sync-players/actions.js`,
`fetchAllResultYears()` in `bids/results/[tierId]/page.js`.

**Control precedence in YourBidsPanel is ordered, and 2-before-3 is load-bearing:**
(1) tier closed → nothing; (2) live bid (pending) → Withdraw + Revise;
(3) cancellable delegation → Cancel; (4) nothing. A delegation can be draft while
its bid is live; offering Cancel there implies removing the entry removes the bid.

**One intended mismatch in tierRows is documented in the source — do not "fix" it:**
withdrawn bid + superseded delegation reads "Withdrawn" while still offering
Cancel. The Cancel is slate housekeeping on a dead entry.

**Server Actions that can fail live in client components.** A throw from a Server
Component form action has no client boundary and escapes to the full-page error
screen — the app's worst historical owner-facing bug. Return `{status:'error'}`
patterns (see ImportForm, SyncForm) or catch in a client component.

**Withdrawal arithmetic lives in the database only.** The allowance formula
(players ÷ 5, rounded up, min 1, max 5) is `tier_withdrawal_allowance()`; the UI
reads it via RPC and never reproduces it in JavaScript.

**Unrecognised statuses fall through to the raw string** in tierRows — a status
added later should look odd on screen, not vanish. Keep that behavior.

**PPV weights are fetched from `ppv_weight_table`, never hardcoded.** Same
pattern for anything with a database-canonical value.

**The chart's length multipliers are not the app's PPV weighting.** Only the
`chart_bid_target()` RPC may use them; nothing client-side reproduces that
arithmetic. `computeBidPreview()` is the only way to value an actual contract.

---

## Theme & UI system

Light/dark via `data-theme` on `<html>`, set by a pre-paint inline script in
`app/layout.js`: localStorage `edfl-theme` if light/dark, else device preference.
CSS covers JS-off via the media query. `suppressHydrationWarning` on `<html>` is
required by the pre-paint script — leave it.

**Currency colour convention — one colour per currency, everywhere:**
`--c-cap` (blue) · `--c-cash` (green) · `--c-ppv` (purple) · `--c-dead` (rust),
applied via `.v-cap` / `.v-cash` / `.v-ppv` / `.v-dead`. Never introduce a new
colour for money and never repurpose these. **Gold is reserved for
pending/attention states only** — using it decoratively destroys it as a signal.

**Status chips:** `tierRowTone()` maps every label to `.status-live` (gold) /
`.status-good` (green) / `.status-bad` (red) / `.status-off` (grey). Two
deliberate calls: draft is gold (an unarmed entry never fires — the most important
thing to catch), skipped is red (the ceiling already applied, nothing further
happens). Tone and label resolve from the same `resolveRowSource()` — never let
them diverge.

**Defined but not yet consumed** (safe to start using): `.btn-secondary`
`.btn-quiet` `.btn-danger` `.btn-block` `.action-bar` `.legend` `.form-notice`
`.page-narrow` `.table-scroll` `.col-num` `.admin-form input.num-input`. Mobile
card tables read `data-label` from each `<td>`; no page supplies the attributes
yet.

Fonts: Oswald / Inter / IBM Plex Mono via next/font/google. A Geist switch was
proposed and rejected — don't re-propose.

---

## Database boundary (context, not access)

Postgres enums vs text: `contracts.contract_type` is an enum, `bids.contract_type`
is text — server code copying between them needs `::contract_type`.
`teams.sleeper_roster_id` is text. Sealed-bid RLS: before close a bid is visible
only to its own team (not even the commissioner); delegations are sealed harder
(no commissioner read ever). `fire_mode: 'at_close'` exists in schema but has no
executor — do not surface it in any UI.

Functions the app calls by RPC: `submit_bid`, `withdraw_bid`,
`tier_withdrawal_allowance`, `upsert_bid_delegation`, `arm_bid_delegations`,
`cancel_bid_delegation`, `chart_bid_target`, `minimum_legal_bid_ppv`,
`evaluate_auction_tier`, `pass_over_winner`, `verify_auction_tier`.

**Dropped by intent — never recreate or reference:** `attempt_award_bid`,
`resolve_auction_tier`, `award_bid_to_next_best`.

Login has dashboard-side state invisible to this repo (email template serves a
6-digit token only, OTP length = 6, Gmail SMTP). Don't restructure login code
without flagging that the dashboard half must stay in sync.

---

## Known open items that live in code

- Post-deploy verification of the four theme commits has never been done
- Currency colours wired on `/team/[teamId]` only — cap sheet untouched
- `.col-status` 180px may squeeze on ~700–1000px windows (fix: 140px or
  width:auto in a media query)
- `data-label` attributes missing on all mobile card tables
- Hardcoded 2026 season years: Cap Sheet, `/cash`, `/admin/cash`, and
  `/team/[teamId]` — one rollover batch, don't fix piecemeal
- `payloadToValidatorShape` takes four consecutive positional numbers — convert
  to an object parameter alongside any future bidPayload.js edit
- `contractAssistant` floor top-up reads `y.optionBonus`, which never exists on
  its input (harmless, conservative direction) — make explicit with
  `optionBonus: 0` and a comment when touching that file
- `meetsMinimumSalary()` in leagueMinimum.js is exported but never called —
  wire in or remove when nearby
- `/login` does not forward its own `?next=` into the OTP flow, so every deep
  link lands on `/` after sign-in. Twelve pages pass `next=` and the callback
  honours it; the break is in `app/login/page.js` alone

---

## Keeping this file honest

When a batch changes established behavior, update this file in the same batch and
include its change in the same commit. Report the hash. This file has drifted
badly once (it knew nothing for two full sessions); the cost was real.
