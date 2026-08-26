# CLAUDE.md — EDFL Dynasty League App

Briefing for Claude Code. Accurate as of the co-commissioner batch (August 25, 2026).
If the repo disagrees with anything below, the repo wins — report the discrepancy,
don't silently reconcile it.

**This file went stale between `158d3c8` and `1f1ebc1` and it cost a full session.**
On August 22 it produced **five confident wrong conclusions from otherwise correct
analysis** — it left the reader to assume an auction tier that had been deleted was
still open, that a database bug fixed eight days earlier was live, and that
`contract_events` had never been written to. The reasoning was sound every time; the
premises were not. The "Current league state" section directly below exists so that
never happens again — **read it before reasoning about anything auction-, cut- or
contract-count-shaped.**

---

## What this is

Companion app for a 10-team dynasty fantasy football league (EDFL) run alongside
Sleeper. The app is the system of record for contracts, salary cap, and Owner Cash —
none of which Sleeper tracks. Live at dynasty-league-app-gold.vercel.app.

**Stack:** Next.js 14, App Router, plain JavaScript (no TypeScript), Supabase
(Postgres + RLS), Vercel.

---

## Current league state (as of August 25, 2026)

This section is the one part of this file that describes *data* rather than code. It
is here because its absence is what let a reader infer a live auction that did not
exist. Treat it as a snapshot with a date on it, not as a permanent fact, and
re-verify chat-side before betting a build on it.

**No auction tier is open.** Nothing has `verified_at IS NULL`.

- **Tier 3 does not exist.** It was created August 13, stayed open **43 minutes**,
  took **zero** bids, and was deleted August 14 so a repriced Player Value Chart
  could be applied to its players. It is not open, not upcoming, and not coming
  back. Any reasoning that starts "tier 3 is live" is starting from a deleted row.
- **Tier 4 ran August 14–16 and was VERIFIED August 16 at 22:07 ET**, creating
  **47 contracts**.
- **`tier_number` 4 is owner-facing "Tier 2 of Free Agent Quality Spread", and that
  mismatch is permanent.** The internal number and the league-facing label do not
  and will not agree. Never render `tier_number` as the name, and never "correct"
  one to match the other.

**Standing constraints are DISARMED**, and they re-arm on their own the moment a tier
exists with `verified_at IS NULL` — nobody flips a switch. Anything gated on "a tier
is open" is currently dormant, not removed, so a dormant code path reading as dead
code is expected and must not be deleted on that basis.

**Contracts: 234 total, 233 active.**

**`contract_events` is NOT empty.** Zach Charbonnet was cut August 13 — **one row,
not reversed.** Every statement that no cut has ever happened in production is
wrong, and so is every conclusion drawn from one. The dead-money paths in
`team_cap_summary` and in `app/team/[teamId]/page.js` have live data flowing through
them.

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
9. **Server Actions RETURN refusals; they do not throw them.** Next.js masks every
   error thrown out of a Server Action in a **production build**, replacing the
   message with a generic "an error occurred in the Server Components render"
   string. A carefully-worded database refusal reaches the owner as that string and
   nothing else. So: return `{ ok: false, message }`, the caller checks `.ok`, and
   `.catch` is reserved for **genuine transport failures** only. This is invisible
   in dev, where the real message still appears — you cannot catch it locally, and
   there is no build step here to catch it either (rule 5).
   Converted so far: `app/team/[teamId]/actions.js`, `app/bids/actions.js`,
   `app/bids/hideActions.js` — all three at zero throws. **43 throws remain across
   10 files** (see the conversion table below).
   This pattern has already paid for itself: a readable
   `bid_void_reason_matches_flag` refusal made an August 14 production defect
   diagnosable in one message. The counter-example is
   `app/admin/tier-results/actions.js`, which still throws — tier-4 verification
   failed **twice** behind a generic string, and the real error had to be extracted
   with a rolled-back SQL harness. **That file is the highest-priority remaining
   conversion.**
10. **A rule that reads a table other than its own must be a deferred constraint
    trigger.** A non-deferred BEFORE trigger reading a table that is populated later
    in the same transaction sees an empty or half-written table and refuses legal
    input. This is not hypothetical: `enforce_deion_rule` did exactly that and
    blocked an entire tier (defect 3 below).
11. **Enumerating write paths means following the data, not grepping for
    `.insert(`.** The bid path writes `bid_years` through an **RPC argument**, which
    no insert-statement search surfaces. A grep-shaped inventory of "everything that
    writes table X" will silently omit every RPC-mediated write, and it did.

---

## File map

### App routes (`app/`)

| Route | What | Access |
|---|---|---|
| `/` `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/calendar` `/actions` | Public pages | Deliberately ungated — do NOT add auth |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` | Owner pages | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash` `/admin/owner-activity` | Widened admin pages | **Commissioner OR co-commissioner** |
| `/admin/sync-players` `/admin/import-stats` | Strict admin pages | **Commissioner only — do not widen** |
| The appointment control *on* `/admin/owner-activity` | Strict control on a widened page | **Commissioner only** |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

Every gated page: the three-line gate (`getCurrentTeamOwner()` →
`redirect('/login?next=…')` signed out → `redirect('/')` non-commissioner) AND every
Server Action independently re-checks. Both layers, always. `next=` targets pass
`safeNext()`.

**Home-page admin links:** seven render for everyone (page gates bounce the
unauthorised on click). **The Cuts link is the one exception** — guarded
`{isCommissionerOrCo(teamOwner) && …}` in `app/page.js`, the only hidden admin
link. It was `{teamOwner?.is_commissioner && …}` until August 25, 2026; the
helper is null-safe, so it replaces the optional chain rather than needing one
(`teamOwner` is null signed-out). The caption below the links names
`/admin/sync-players` and `/admin/owner-activity` as the commissioner-only pair —
**keep it in step with the gates**, it went stale once already when it still read
"Manage Owner Cash is commissioner-only."
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

### The League Calendar (shipped `33a9340`, Aug 11 2026)

- `app/calendar/page.js` — public, ungated, server component. Reads the
  `league_calendar` view (public read, security_invoker, granted to anon)
  filtered to `current_season_year`, bounded to an explicit **300 rows** with a
  visible truncation notice — *bound-and-warn*, correct here because this is a
  page a human scrolls, not a file anyone downloads.
- `app/calendar/CalendarView.js` — client component owning the category filter
  and the show/hide-past toggle. Groups into months by walking the
  already-sorted list; the view returns rows ordered by `starts_at`,
  `sort_hint`, `title`, so adjacency is sufficient. **Do not re-sort or re-key
  by month here.**
- **NEVER format a timestamp client-side on this page.** Every date and time
  string (`day_label`, `time_label`, `end_day_label`, `month_label`) is
  pre-rendered in America/New_York by the view. A 00:01 ET entry passed through
  `Date()` or `toLocaleDateString()` in the browser displays a day early for
  any owner west of Eastern. If a date renders as a raw ISO string, the fix
  belongs in the view, not here.
- **"Next up" is computed against the UNFILTERED list on purpose** so the
  marker means "the next thing that happens in the league", not "the next thing
  in this filter". Do not move it inside the visible list.
- Unrecognised categories fall through to their raw value rather than being
  dropped — same principle as `tierRows`.
- CSS: 181 lines of `.cal-*` rules appended to globals.css. No new custom
  properties; gold (`--accent-gold`, `--st-live-*`) is used only for the
  next-up row and the provisional chip. **Currency tokens are deliberately
  unused** — categories are distinguished by label text, so nothing on this
  page can be misread as money. First consumers of `.page-narrow` and
  `.legend`.

### The Aug 12 client batch — 30% Rule and real option bonuses (`426757a` + `0ca063f`)

- **NEW `lib/thirtyPercentRule.js`** — the shared client mirror of the v13 5.22
  triggers. `computeCompensationBySeason()` and `validateThirtyPercent()`. All
  three forms import it; nothing else reimplements the arithmetic.
- `contractAssistant.js` — `back_loaded`'s old `[1,2,3,…]` ramp was illegal on
  every multi-year deal (Year 2 ≈ 2× Year 1). Salary now climbs at **half** the
  legal step and the option recommendations fill the remaining headroom exactly.
  A 30% repair pass runs after the floor top-ups (the one path by which
  `front_loaded` could manufacture a violation) and reports via
  `thirtyPercentNote`.
- `contractMath.js` / `bidMath.js` — real option semantics: ÷5 proration across
  five seasons from the exercise year, automatic option-void rows in the preview
  tagged `voidReason`, signing bonus prorating over the **owner span only**.
- `ContractForm.js` / `BidForm.js` / `DelegateForm.js` — all three run the 30%
  check and render from `preview.rows`, so a nine-season deal shows nine rows.
  ContractForm applies the assistant's option recommendations directly now that
  they persist.
- `app/admin/new-contract/actions.js` — two inserts in **two separate PostgREST
  transactions**: `contract_years` (void rows carry `void_reason`
  `'signing_bonus'`; legacy `option_bonus` always 0), then
  `contract_option_bonuses`. If the second is rejected the contract is already
  saved without its options, and the error says so and tells the commissioner to
  delete and re-enter. That partial-save path is the one to watch.

### The Aug 13 batch — the assistant solves for option-inclusive PPV (`b394123`)

Nine files, one commit. Three new `lib/` modules imported by six rewrites, so a
partial application does not build.

- `contractAssistant.js` — **the assistant now solves for the target INCLUDING
  weighted option PPV.** It used to solve on salary and signing bonus alone and
  then size option recommendations against leftover 30% headroom, so a 250-PPV
  request produced a bid the auction scored at ~347 under a label reading
  251.45. Commissioner ruling Aug 12, 2026: build as close to the owner's stated
  goal as reasonably possible; an Aggressive deal still uses every aggressive
  tool, scaled to fit rather than exceed. **Shape, ramp and option sizing are
  untouched — only scale changes.** `buildShape()` is the whole of the old
  `generateContract()`; the solve calls it repeatedly. `front_loaded` and
  `pay_as_you_go` recommend no options, so they take the single-build path and
  behave exactly as before.
- **`achievedPPV` keeps its old salary-and-signing-bonus meaning** because
  `DelegateForm` persists it as `bid_delegations.generatedPpv`, and silently
  repurposing a stored field is worse than adding one. **`achievedTotalPPV` is
  the number to display**, `optionBonusPPV` is the difference, and
  `targetDependsOnOptions` tells a form to warn that deleting an option drops
  the deal below target. All three forms render the new field.
- **NEW `lib/ppvMath.js`** — one client source for PPV weights and per-row PPV.
  The 5.2 table previously existed in three places. `buildWeightLookup()`,
  `weightFor()`, `rowPpv()`, plus `FALLBACK_WEIGHTS` for a failed fetch.
- **NEW `lib/deadCapPreview.js`** — one dead-cap definition for both builders.
  See the amended dead-money rule below; this is a preview, never the engine.
- **NEW `lib/optionBonusApply.js`** — one recommendation guard and one void-row
  label, replacing three hand-copied guards. Only `BidForm` had tracked what it
  skipped; the other two dropped a failing recommendation silently, handing the
  owner a deal quietly worth less than intended. `voidRowLabel()` also fixes a
  real mislabel: an owner-elected void year overlapped by an option's
  five-season window always read "signing-bonus proration only" while carrying
  option money too.
- `bidMath.js` / `contractMath.js` — both now delegate PPV to `ppvMath` and dead
  cap to `deadCapPreview`. **`bidMath` no longer rounds `totalPpv`**:
  `bid_total_ppv` sums raw and decides who wins under 6.1, so the form was
  showing a number the auction would never use and two bids 0.45 apart displayed
  identically. Per-row cap/cash rounding is deliberately untouched — that is the
  open option-proration rounding question and must be settled in one change
  across both views, both preview modules and the 30% Rule together.
- `bidMath.js` **still re-exports `buildWeightLookup` and `FALLBACK_WEIGHTS`**
  from `ppvMath` so `app/bids/[tierId]/[playerId]/page.js` and
  `app/bids/[tierId]/delegate/page.js` keep importing them unchanged. Do not
  "clean up" those re-exports.
- The bid builder gains a **Dead Cap if Cut** column; the New Contract form
  gains a **PPV** column and fetches `ppv_weight_table` client-side (first
  client-side read of that table; degrades to `FALLBACK_WEIGHTS` on error).
- `DelegateForm`'s persisted `assistantNote` now **joins** every note via
  `joinAssistantNotes()` instead of `compromiseNote || floorTopUpNote || null`.
  The old expression dropped `thirtyPercentNote`, the only disclosure that the
  30% repair pass added real cash above target — invisible to the owner and
  absent from the delegation record on the one path where nobody was watching.

### The Aug 14–22 batch — nine commits (`9135fc1` → `1f1ebc1`)

This file was accurate through `158d3c8` and silent after it. Nine commits landed in
that silence.

| Commit | What |
|---|---|
| `9135fc1` | Cut actions return refusals as values; dialog consumes result objects; `/team/[teamId]` revalidates the **route pattern**, not the acting owner's team |
| `722c637` | Bid submission returns refusals as values |
| `56db266` | Cap sheet decimals capped at two places |
| `b3973a1` | Bid list rework — `TierPlayerList.js` and `hideActions.js` added, `page.js` replaced, **`YourBidsPanel.js` deleted** |
| `769a772` | Dead money included in team page cap and cash totals |
| `321c515` | `lib/formatMoney.js` added; adopted on both cap surfaces |
| `1f105a8` | Cut dialog adopts the shared formatter |
| `13e6eb9` | Cuts ledger and both cash pages adopt it |
| `1f1ebc1` | Remaining four pages adopt it — sweep complete |

**`app/bids/TierPlayerList.js`** — the single merged table for a tier. Every player
appears **once**, with the owner's own bid status and controls inline. It replaced a
two-table split in which a player who had been bid on appeared **twice, under two
different vocabularies** — the duplication was the visible half of the problem and
the divergent status language was the worse half. This file now owns the
control-precedence rule (see below).

**`app/bids/hideActions.js`** + the **`bid_player_hides`** table — per-owner,
per-tier, **display-only**. A hidden player stays in the tier and still counts toward
its public interest level; hiding is a viewing preference, never a withdrawal.
**RLS is own-team-only with no commissioner clause at any time.** That is not an
oversight to be tidied up later: a hide reveals bidding intent, and bidding intent is
never published under 6.1(g). In production already — **61 rows across 3 teams in
tier 4.**

**Banded interest.** The list shows *No bids yet · Some interest · Heating up ·
Highly competitive* rather than a raw count, and **sorting keys off the band, never
the underlying count.** Rule 6.1 permits a "rough interest level" and nothing more;
sorting 48 players by an exact count is a precise contestedness ranking, which is
exactly what "rough" is withholding. Sorting by the hidden count would leak the whole
ordering while displaying a band — the leak would be invisible on screen.

**`lib/formatMoney.js`** (added `321c515`) — **the** money formatter for the app.
Eleven local copies in **six mutually incompatible groups** were removed across
`321c515`, `1f105a8`, `13e6eb9`, `1f1ebc1`; they differed on null handling, negative
signs, rounding and locale, and **three of them silently dropped the minus sign** —
a dead-money figure rendering as a positive number. Money is tracked exactly and
displayed in **whole dollars, rounded standard, locale pinned to `en-US`.**
**`pdfMoney` in `app/bids/results/[tierId]/export/route.js` is the one deliberate
exception** and stays that way: the PDF is the human-readable member of a download
whose CSV and XLSX carry raw values, so changing it is a decision about what a
published result *is*, not a formatting cleanup.

**Server Action conversion status.** Counted with a glob over every file containing
`'use server'` — **not** `**/actions.js`, which previously missed
`app/bids/delegationActions.js` entirely and undercounted by five. 13 files declare
`'use server'`; three are converted, ten still throw.

| File | `throw new Error` | Audience |
|---|---|---|
| `app/team/[teamId]/actions.js` | 0 ✅ | Owner |
| `app/bids/actions.js` | 0 ✅ | Owner |
| `app/bids/hideActions.js` | 0 ✅ | Owner |
| `app/bids/delegationActions.js` | **5** | **Owner-facing — highest owner-visible risk** |
| `app/admin/new-tier/actions.js` | 8 | Commissioner |
| `app/admin/fix-contracts/actions.js` | 6 | Commissioner |
| `app/admin/new-contract/actions.js` | 6 | Commissioner |
| `app/admin/cash/actions.js` | 5 | Commissioner |
| `app/admin/tier-results/actions.js` | **4** | **Commissioner — highest priority overall** |
| `app/admin/cuts/actions.js` | 3 | Commissioner |
| `app/admin/import-stats/actions.js` | 3 | Commissioner |
| `app/admin/owner-activity/actions.js` | 2 | Commissioner |
| `app/admin/sync-players/actions.js` | 1 | Commissioner |

**Total: 43.** `app/admin/sync-players/actions.js` additionally carries a bare
`throw error` at line 46 that the `throw new Error` count misses — 44 throw
statements in all. Count them the same way next time or the number will move for no
reason.

### Two warnings that will otherwise read as bugs

- **`lib/bidPayload.js` deliberately omits `void_reason`, and that is correct.**
  `submit_bid()` derives it server-side, because the same column also applies to void
  rows that `rebuild_bid_option_void_years()` generates on its own — rows the client
  has no business labelling. **Do not "fix" `buildBidPayload()` by adding the key.**
- **`app/team/[teamId]/page.js` now holds a second JS implementation of
  `team_cap_summary`'s dead-money aggregation**, added in `769a772`, **deliberately.**
  Its visible surface is the "of which dead money" row. It mirrors two
  `contract_events` terms — `dead_cap_current_year` to the cut's season and
  `dead_cap_next_year` to the following one for June 1st splits — both filtered on
  `reversed_at IS NULL`. A third term of the view is deliberately absent and the code
  says why. This is a knowing exception to the single-implementation principle, not a
  drift to be consolidated on sight.

Also unresolved, and worth knowing before you touch it: **`payloadToValidatorShape()`
drops `is_void_year`.** That is **safe** — void years are always trailing by
construction, and all three validators re-derive void-ness from `totalYears` by
index. Its real fragility is elsewhere: **five positional arguments, three of them
numbers in the order `startYear, totalYears, voidYears`.** Transposing two produces
no error and no warning, just a silently wrong result.

### The co-commissioner role (Aug 25 2026)

**The whole design is one sentence: `is_commissioner` did not change meaning, and
a second, wider check was added beside it.** Default-deny. Anything new that
reaches for the strict check stays commissioner-only until somebody widens it on
purpose. Never widen the strict one, in JS or in SQL.

**Database side (applied and verified 2026-08-25, chat-side):**
`team_owners.is_co_commissioner` (boolean not null default false);
`is_commissioner_or_co(uuid)`; `require_commissioner_or_co()`, which raises
*"This action requires commissioner or co-commissioner access."*; and
`set_co_commissioner(p_team_owner_id, p_enabled, p_reason)` returning jsonb,
**commissioner-only**, logging to `commissioner_actions`.
**`is_commissioner(uuid)` and `require_commissioner()` are UNCHANGED and still
mean commissioner only.** Do not modify or widen them.

**Client side — `lib/getCurrentTeamOwner.js`.** The helper now also selects
`is_co_commissioner`, and the file exports two new things beside it:

- **`isCommissionerOrCo(teamOwner)`** — a *pure predicate over a row already
  fetched*, not a query. A page and its Server Action each call it on the row
  they already hold, so widening cost zero extra round trips. Null-safe.
- **`COMMISSIONER_OR_CO_REFUSAL`** — the exact string
  `require_commissioner_or_co()` raises, shared so a client-side refusal and a
  database refusal read identically. **An owner should not be able to tell which
  layer stopped them**, because a message that differs by layer is a map of where
  the checks are.

There was never an `isCommissioner()` function to widen — call sites test
`me.is_commissioner` inline, which is why the strict sites stayed strict for free.

**Widened, both layers, 16 sites:** `/admin/tier-results` (index, `[tierId]`, and
the shared `requireCommissionerOrCo()` helper covering evaluate / pass-over /
verify), `/admin/cuts`, `/admin/new-tier`, `/admin/new-contract`,
`/admin/fix-contracts` (two actions — repair and hard delete), `/admin/cash`,
and `/admin/owner-activity` (page + `loadOwnerActivity`, but NOT the appointment
control on it — see the section below).

**Widened as a fifteenth site, and it is the one that would have been missed:**
`canCut` in `app/team/[teamId]/page.js`. **"Cut from any roster" does not live on
`/admin/cuts`** — that page is the ledger and the reversal dialog. The Cut button
is on the team page. Widening the admin page alone would have handed a
co-commissioner the paperwork and not the action.

**Deliberately NOT widened — do not "finish the job" by widening these:**
`/admin/sync-players`, `/admin/import-stats`, the appointment control described
below, and anything touching the Player Value Chart (publishing a snapshot,
mapping a chart name to a player, viewing unpublished snapshots or the name map —
all database-side; **no chart admin UI exists in this repo at all**, and `/values`
relies on RLS to hide unpublished snapshots rather than filtering in app code).

### `/admin/owner-activity` — a widened page carrying a strict control

**This is the standing example that a page's gate does not cover everything
rendered on it.** Read it before assuming any page gate is sufficient.

- **The page and its activity report are WIDENED.** `commissioner_owner_activity()`
  gates itself on `require_commissioner_or_co()`, and `loadOwnerActivity` matches.
- **The appointment control is COMMISSIONER ONLY**, on a page co-commissioners can
  reach. A co-commissioner able to appoint co-commissioners could appoint
  themselves peers, and the role would stop being the commissioner's to give.

Three layers hold that split, and the first is the weakest:
`page.js` renders `<CoCommissionerPanel />` only under `me.is_commissioner`;
`loadOwnerRoles` and `setCoCommissioner` each re-check `me.is_commissioner`
independently and return a refusal; `set_co_commissioner()` refuses in the
database. **Conditional rendering is not a gate** — a Server Action is a callable
endpoint whatever the page draws. The database check is the backstop, not the
gate: reaching it means the owner gets a raw database error instead of a sentence
they can act on, which is why the action refuses first.
**Never call `require_commissioner_or_co()` or `isCommissionerOrCo()` anywhere in
the appointment path.**

**A stale comment in this exact file caused a wrong recommendation on Aug 25.** It
said `commissioner_owner_activity()` gated on `require_commissioner()`; it had
been widened database-side, and the page was recommended as strict on that basis.
The comment is corrected and now carries a note about its own history. **The
database is the authority on which gate an RPC carries. A comment is a copy, and
copies go stale** — this is ground rule 2 restated with a scar on it.

**NEW `app/admin/owner-activity/CoCommissionerPanel.js`** — the appointment
control itself, rendered under the activity table (the page is now titled "Owner
Administration"). Shows who holds the role, requires a typed reason that reaches
the public log, and refuses self-targeting. Its two Server Actions **return
refusals as values** per ground rule 9. `loadOwnerActivity` in the same file
still throws; it predates the rule and converting it means changing its caller in
the same pass, which is backlog, not this batch.

**A revoked co-commissioner loses access on their next navigation**, because every
gate reads the session row at request time. There is no session to invalidate.

### The Trade feature — database only, no UI (Aug 25 2026)

**Applied and verified chat-side. Nothing in this repo references any of it yet.**
Listed here so a future session does not treat these objects as unknown or
accidental, and does not "discover" them as orphans.

Tables: `trades`, `trade_parties`, `trade_assets`, **`draft_picks`**.
Functions: `propose_trade`, `accept_trade`, `decline_trade`, `trade_impact`,
`trade_legality`, `trade_window_at`, `execute_trade`, `compute_trade_charges`.

`draft_picks` is the pick-ownership table that did not exist as of the Aug 24
recon — rule 7.1(b) makes picks tradeable three years out. The only pick data in
the repo remains **descriptive**: `contracts.draft_year` / `draft_round` /
`draft_pick` record where a signed player was taken, and `rookie_wage_scale_slots`
/ `rookie_wage_scale_years` are a price table. Neither is ownership; do not wire
them to `draft_picks` without checking what the new table actually holds.

`cut_player()` reserved `p_salary_obligation_transfers` and `p_to_team_id` from
day one for this, and `app/team/[teamId]/actions.js` already passes them as
explicit `false` / `null`. **The call signature does not change when Trade gets a
UI — only the values do.**

### Key libraries (`lib/`)

**`getCurrentTeamOwner.js` changed Aug 25** — it now selects `is_co_commissioner`
too and exports `isCommissionerOrCo()` and `COMMISSIONER_OR_CO_REFUSAL` alongside
the original function, which itself is unchanged. See the co-commissioner section
above; the two-gate comment block in that file is the authority.

Unchanged: `supabaseClient.js` (browser), `supabaseServerClient.js` (session-aware
server), `supabaseAdmin.js` (service role, sparingly),
`safeNext.js`, `tierRows.js` (THE status vocabulary), `bidMath.js`,
`contractMath.js`, `contractAssistant.js`, `leagueMinimum.js`, `bidPayload.js`,
`delegationNotes.js`, `formatDate.js`, `thirtyPercentRule.js` — the only client
implementation of the 30% Rule; all three forms import it.

**New Aug 13: `ppvMath.js`, `deadCapPreview.js`, `optionBonusApply.js`** — each
is the single client implementation of what it owns (PPV weighting, dead-cap
preview, option-recommendation application + void-row labelling). All three
exist specifically because the logic had been copied two or three times and had
already drifted. Single-implementation modules stay single-implementation.

**New Aug 22: `formatMoney.js`** — the single money formatter, and the fourth
member of that group. Same rule, same reason: it replaced eleven copies in six
incompatible groups. `pdfMoney` in the tier-results export is its one documented
exception (see the Aug 14–22 batch above). Ten files import it.

**Stale-comment cleanup item, harmless but do it when nearby:** three comments in
`lib/tierRows.js` (lines 188 and 197) and `lib/delegationNotes.js` (line 11) still
name `YourBidsPanel` — deleted in `b3973a1`. The comments' *substance* is still
accurate; only the file name is wrong. Not touched in this pass because a
documentation commit does not edit code.

---

## Rules encoded in this codebase — do not break these

**A REAL cut is settled in the database only.** `compute_cut_charges()` is the
single implementation of the settlement rules (rule book v12 5.18): weekly salary
accrual at 1/14 per game week charged 00:01 Eastern on the day of that week's
**first game — never assume Thursday**; unearned non-guaranteed forgiven; ALL
remaining guaranteed salary accelerating cap AND cash to the current season
(never splittable); prorations accelerating or splitting under June 1st
treatment; untriggered option bonuses vaporizing; roster bonus keyed to Sep 2.
**No JS reproduces any of that**, and `CutPlayerDialog` re-queries on every
designation toggle rather than recalculating.

**The two dead-cap numbers are different things — do not merge them.** The rule
above governs cutting a player who EXISTS in the database. `lib/deadCapPreview.js`
answers a different question: what a contract or bid still being TYPED would cost
to exit, before it has any row to query. It mirrors
`contract_year_computed.dead_cap_if_cut` exactly — every season from N forward's
prorated signing bonus plus guaranteed salary, plus the remaining slices of any
option already triggered by N — and it is date-blind, assuming a cut **before
March 1** of that season. It is labelled an estimate on screen via
`deadCapBasisNote()`. Two things it does NOT do, both deliberate: it does not
call the engine, and **it carries no roster-bonus term.** `contractMath.js` used
to add one whenever `today >= Sept 2` of the row's season; the view has no such
term, and the two agreed only by calendar accident — every such flag is false
until **September 2, 2026**, at which point the builder would have started
disagreeing with the database on any contract holding a 2026 roster bonus. A
before-March-1 cut precedes conversion, so that money was never earned and the
database was right. One open question remains recorded in that file's header: an
option exercising in season N is counted at N by both the view and this module,
which a strict before-March-1 reading says should contribute nothing. **They
agree with each other and may both be wrong; fixing it needs a view migration
shipped with the JS change, never one side alone.**

**Cut gates live in the database:** `cuts_open_after` (Aug 12 2026), the League
Reset freeze (Feb 21–end Feb), ownership. The UI's job is to surface their error
messages, not to duplicate them.

**The unverified-auction-tier block is GONE as of rule book v14** — cuts are now
permitted while an auction tier is open or awaiting verification. **That change is
paired with Guard 3 in `reverse_cut()` and the two must never be separated.**
Allowing a cut during an open tier without the guard that stops the cut being
reversed out from under the tier's results is the unsafe half of a safe pair. If a
future task proposes touching either one, it has to account for both.

**June 1st designations: 2 per team per league year** (`league_config`), elections
only (Mar 1–May 31); automatic post-June-1 splits consume nothing. Read
`june1_designations_remaining()`; never count events in JS.

**Cut reversal** (`reverse_cut()`): commissioner-only, 96h window SUBORDINATE to
the cross-season and player-signed-elsewhere guards — when multiple apply, the
superior guard's message wins, and `CutsPanel.blockedReason()` mirrors that
order. Reversed events are never deleted; **every consumer of `contract_events`
must filter `reversed_at IS NULL`** (or use `cut_history.is_active_cut`) or it
resurrects reversed dead money. `app/team/[teamId]/page.js` became one of these
consumers in `769a772` and does filter correctly.

**Rule book v14 removed Cut Reversal from the RULES entirely** — but
`reverse_cut()`, `cut_history.is_reversible`, the 96h window and the `/admin/cuts`
reversal dialog all still exist in the database and in the app. Do not read the
rule-book removal as permission to delete the machinery, and do not read the
surviving machinery as evidence the rule is still in the book. The
`reversed_at IS NULL` filter is required either way, permanently, because reversed
rows are never deleted.

**`contract_year_computed.dead_cap_if_cut` is superseded for saved contracts** —
a static estimate the team page only uses for future seasons, labeled "est." Do
not extend its use there; the authoritative number for anything with a database
row is `compute_cut_charges` / `team_cut_previews`. It remains the correct thing
for `lib/deadCapPreview.js` to mirror, because a contract still being typed has
no row for the engine to settle.

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

The delegation path is enforced too, and differently. `bid_delegations` stores
`years` and `option_bonuses` as JSONB, so none of the `bid_years` /
`bid_option_bonuses` triggers can see a delegation. Two dedicated triggers cover
it — `enforce_delegation_30pct_insert` and `enforce_delegation_30pct_update` —
backed by the IMMUTABLE helper `edfl_delegation_30pct_issue()`, which returns
the error text or NULL. The UPDATE trigger has a WHEN clause and fires only when
`years`, `option_bonuses`, `start_year`, `total_years` or `void_years` actually
change value: housekeeping writes from `arm_bid_delegations` (status,
error_message, submitted_bid_id) must never re-validate content, or a legacy row
blocks its own status update and takes an entire slate with it. `DelegateForm`
mirrors this client-side at the issues seam. **Do not collapse the two triggers
back into one.**

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

**Control precedence in `app/bids/TierPlayerList.js` is ordered; 2-before-3 is
load-bearing.** The rule survived the bid-list rework in `b3973a1` and moved house —
`YourBidsPanel.js` no longer exists. There are **four** branches now where the old
component had three, first match wins:

1. tier closed → nothing
2. live bid (`pending`) → Withdraw + Revise
3. cancellable delegation → Cancel
4. untouched → Submit Bid

**2 before 3 remains load-bearing.** A delegation can sit at `draft` while the bid it
produced is still live — that is exactly what revising a delegation does. Offering
Cancel there suggests that removing the entry removes the bid, and it does not.

**One intended mismatch in tierRows is documented in the source — do not "fix"
it.** (Unchanged.)

**Server Actions that can fail live in client components**, and as of `9135fc1` /
`722c637` they **return** their refusals rather than throwing them (ground rule 9).
The caller checks `.ok` and puts `.message` in `.form-error`; `.catch` now means
"the network died", not "the database said no". The cut dialog and the bid submit
path are the reference implementations.

**Withdrawal arithmetic lives in the database only.** (Unchanged.)

**Unrecognised statuses fall through to the raw string** in tierRows. (Unchanged.)

**PPV weights are fetched from `ppv_weight_table`, never hardcoded** — and as of
Aug 13 they enter the client through `lib/ppvMath.js` alone. `FALLBACK_WEIGHTS`
there is a failed-fetch cushion, NOT a source of truth, and must be kept equal to
the table by hand. Nothing else may hold a copy of the 5.2 weights; three copies
is what let the New Contract form label a 680.30 deal as 501.65.

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
`.admin-form input.num-input`. (`.btn-danger` `.form-notice` `.btn-quiet`
`.table-scroll` `.col-num` gained consumers in the Cut/export work;
`.page-narrow` and `.legend` gained theirs on `/calendar`.)

**globals.css is now ~1,056 lines and grows by append.** Three feature blocks
sit at the end in shipped order: `.modal-*` (Cut Player), the sortable-header
and cap-grid rules, then `.cal-*` (Calendar). Append new blocks; do not
reflow what is above.

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
grid in the app renders — open to-do, not a data error. Note this is a
*rendering* gap only: those charges have never affected `team_cap_summary`'s row
count, for the CROSS JOIN reason recorded under the `/cap-sheet` item below.

**`league_cap_settings.is_provisional` exists as of Aug 13, 2026** and flags a
season whose salary cap is an estimate rather than the final figure. It is a
property of the SEASON, not of any team or contract, which is why it belongs on
this row and not on a computed view. `/cap-sheet` reads it (`419fd34`) and
renders a `.form-notice` when the current season's cap is provisional — but see
the surfacing gap in the open items below before assuming an owner has been
told.

**`team_cap_summary` is `teams` CROSS JOIN `league_cap_settings`.** Its seasons
come from cap settings, never from contract data. Any consumer must filter by
season; an unfiltered select returns one row per team per season. This is the
single most re-derived-wrongly fact in this file — see the `/cap-sheet` open
item.

**Dropped by intent — never recreate:** `attempt_award_bid`,
`resolve_auction_tier`, `award_bid_to_next_best`.

Login dashboard-side state unchanged (6-digit OTP, Gmail SMTP).

### The four August option-bonus defects, and the audit that now exists

All four traced to the **August 11 option-bonus work**. All four were **found by a
live user**, in production, during a running auction. All four were **catchable by
metadata query** before anyone touched the app. **The repo did not move for any of
them — every fix was a migration**, which is precisely why a repo-only reading of
that week shows nothing wrong.

1. `submit_bid()` never wrote `bid_years.void_reason` — **every bid with an option
   bonus was refused.**
2. `verify_auction_tier()` never copied it into `contract_years` — **blocked all 47
   winners.**
3. `enforce_deion_rule` was a **non-deferred BEFORE trigger reading a table
   populated later in the same transaction** — refused a legal bid and blocked the
   tier. This is ground rule 10, learned the expensive way.
4. `auction_tier_team_flags` **double-counted wins after verification.**

Defects 1 and 2 are the same missing column on two sides of the same transfer, and
finding one should have immediately prompted a look for the other. It did not.

**`EDFL_Invariant_Audit.sql` exists and should be run before any new build.** It is
a **read-only** script executed in the Supabase SQL Editor (chat-side — ground rule
2), **not a checked-in repo file**, so `ls` will not find it and its absence from
the tree is not evidence it is missing. **22 invariants; 21 pass, 1 is an expected
REVIEW.** Four of its checks would have caught the defects above in seconds.

---

## Known open items that live in code

- **Schedule loader unbuilt** — in-season cuts RAISE after Sep 1 with
  `league_weeks` unseeded. The to-do list's item 1.
- Salary Ceiling ×1.11 defect (item 2, see above)
- **Post-deploy click-throughs — the "nothing has been seen running" framing below
  is STALE and was itself one of the five wrong conclusions.** A live auction ran
  August 14–16 and was verified, four production defects were found by a user
  using the app, and a cut was executed August 13. The bid, cut and verification
  paths have all been exercised in production. Treat the list below as
  *unverified specifics*, not as "the app has never been run".
  Still genuinely unconfirmed: `/admin/cuts` render + hidden-link check;
  `/bids` status chips;
  dark-mode white-flash; all three export formats on a verified tier;
  `/calendar` rendering rows for 2026 with pre-formatted Eastern dates; New
  Contract with an option bonus showing automatic VOID rows and saving; a
  back-loaded shape refused by the client 30% check before submit; a delegated
  slate arming clean and a hand-raised target turning a row red and blocking
  Approve.
- **Aug 13 batch click-throughs, none seen running.** A back-loaded generate on
  all three forms LANDING ON the target instead of ~39% over it; the new Dead
  Cap column on `/bids` and the new PPV column on New Contract; an owner-elected
  void year overlapped by an option window showing the both-kinds label; a
  delegated row whose stored `assistantNote` carries a `thirtyPercentNote`. This
  batch touches all three contract-building surfaces at once and **was never
  compiled** — see ground rule 5.
- The cut dialog's June 1st election flow is browser-testable only from
  March 1, 2027 (window closed until then)
- Currency colours wired on `/team/[teamId]` only; cap sheet untouched
- Hardcoded 2026 season years: `/cash` and `/admin/cash` (fires March 1, 2027).
  **Cap Sheet no longer belongs on this list** — as of `419fd34` it derives the
  season from `league_config.current_season_year`, and that is the pattern for
  the other two when they roll.
- `.col-status` 180px squeeze · `payloadToValidatorShape` positional args (the
  dropped `is_void_year` is safe; the five positional args are the real hazard —
  see the warnings under the Aug 14–22 batch) · `meetsMinimumSalary()` unwired —
  all unchanged. (`contractAssistant` `y.optionBonus` is **fixed** as of
  `426757a` — explicit 0.)
- **`/cap-sheet`'s unfiltered read is FIXED as of `419fd34`** — the query now
  filters `.eq('league_season_year', seasonYear)`. **The cause recorded here
  twice before was wrong both times, so record the right one:**
  `team_cap_summary` is `teams` CROSS JOIN `league_cap_settings`, meaning its
  row count is driven by **how many cap-settings rows exist, never by contract
  data.** A new `league_cap_settings` row — a 2027 cap — is what would have
  rendered every team twice and collided `key={t.team_id}`. The 2031–2034
  contract charges could never have fired it and were twice blamed for it.
  Confirmed by observation, not inference: the view returned 10 rows for one
  season while those charges already existed. Do not re-derive this a fourth
  time.
- **The five-year horizon is hardcoded** — `HORIZON = 5` in
  `app/team/[teamId]/page.js`, and the `contract_year_computed` query is bounded
  to it, so seasons 2031–2034 are never fetched. The Contract column still
  prints the full span correctly; the rows simply do not exist. No crash, silent
  omission.
- **A provisional cap is not surfaced on any FUTURE season an owner looks at.**
  `/cap-sheet` shows one season — the current one — so its provisional notice
  can only ever describe that season. The place an owner actually reads future
  caps is the five-season grid on `/team/[teamId]`, and that page does not read
  `league_cap_settings.is_provisional` at all. Every future season's Cap Space
  there is therefore computed against a cap that may be an estimate, with
  nothing on screen saying so. Wiring the flag into that grid is the fix; it
  pairs naturally with the `HORIZON = 5` item above, since both are changes to
  the same query.
- `/admin/import-stats` linked from nowhere
- **43 `throw new Error` remain in 10 Server Action files** (ground rule 9, table
  above). `app/admin/tier-results/actions.js` is the highest priority;
  `app/bids/delegationActions.js` is the highest owner-visible one. The Aug 25
  co-commissioner batch **did not change that count** — it rewrote the gate
  *condition* in seven action files and deliberately left each file's existing
  throw/return shape alone, because converting an action without converting its
  caller turns a refusal into a silent success. New code in that batch
  (`loadOwnerRoles`, `setCoCommissioner`) returns.
- **Three co-commissioner questions only a browser can answer**, all of the same
  shape — the UI now permits something the database may still refuse, which is
  the safe direction to be wrong but is still wrong:
  (1) does `reverse_cut()` accept a co-commissioner, or still
  `require_commissioner()`; (2) same for `commissioner_delete_contract` /
  `commissioner_delete_bid`; (3) does RLS on `team_cash_transactions` let a
  co-commissioner read **every** team's ledger, since `/admin/cash` reads it
  through the session client — if not, the page loads and shows a thin or empty
  ledger rather than refusing, which is the one failure here that looks like data
  instead of an error.
  A fourth question of the same shape was **answered** on Aug 25 and is recorded
  here so it is not re-asked: `commissioner_owner_activity()` accepts a
  co-commissioner, which is why that page is widened. It was answered by asking
  the database, not by reading the comment above the call — the comment was
  wrong. Answer the remaining three the same way.
- `loadOwnerRoles` reads `team_owners` through the session client. If a
  commissioner sees an empty owner list on `/admin/owner-activity`, the RLS
  policy on `team_owners` is the thing to look at, not the query.
- Three stale `YourBidsPanel` comments in `lib/tierRows.js` and
  `lib/delegationNotes.js` — cosmetic, listed under Key libraries above.

### Document versions

- Rule book **v14** — Cut Reversal removed from the rules entirely; cuts permitted
  while an auction tier is open or awaiting verification, paired with Guard 3 in
  `reverse_cut()`. **The two must never be separated.**
- Reference doc **v6.5** · to-do **v3.8** · Master Version Control **v1.9**.
- Sections cited above that predate v14 (the v11, v12 and v13 references) name the
  version that rule was **written under**. That is a citation, not a claim that a
  later rule book left it alone — check the current book before relying on any of
  them.

---

## Keeping this file honest

When a batch changes established behavior, update this file in the same batch and
include its change in the same commit. Report the hash. This file has now drifted
badly **three** times — once for two full sessions; once within a single day (it
didn't know the cut RPCs existed while the UI calling them was being built,
producing repeated false "unverified RPC" flags); and once across nine commits and
a live auction, August 13–24, which is the drift this revision closes.

The third one taught something the first two did not. **The damage was not in what
this file said — it was in what it did not say.** There was no false claim about
tier 3 to correct, because there was no auction-state section at all; a reader with
no snapshot to check against inferred one, reasoned correctly from it, and was
wrong five times. **Silence in a briefing document is not neutral.** That is why
"Current league state" now sits at the top with a date on it, and why it should be
re-stamped or deleted rather than left to age quietly.

The repo wins on repo facts; **the chat handoff wins on database facts.**
