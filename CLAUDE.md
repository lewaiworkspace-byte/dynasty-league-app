# CLAUDE.md — EDFL Dynasty League App

Briefing for Claude Code. Accurate as of the trade reversal batch (`07ad0a6`, August 27, 2026).
If the repo disagrees with anything below, the repo wins — report the discrepancy,
don't silently reconcile it.

**Database facts live in `EDFL_Database_Reference_for_ClaudeCode_v1.1.md`, generated
from the live database. You have no database access and cannot verify any of it.
Do not infer schema from application code, and do not write SQL — schema changes
are made in the project chat.**

This file describes the **repo**: what the app does, why it does it that way, and
which decisions must not be undone. It no longer describes tables, views, columns
or function signatures — that content moved to the reference above, because two
copies of a schema is how one of them goes stale. Where a design note here depends
on a database fact, it names the fact and the rule it serves; look up the shape in
the reference.

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
2. **You have no database access. `EDFL_Database_Reference_for_ClaudeCode_v1.1.md`
   is the authority on what the database contains** — signatures, views, columns,
   RLS, row counts and config values all live there, generated from the live
   database rather than recalled.
   **Do not write SQL, and do not propose a migration.** Schema and function
   changes are made in the project chat. If a task appears to need a new table,
   view, column or function, **stop and say so** rather than designing around a
   guess.
   **Do not infer schema from application code.** The app has been wrong about the
   database before — that is how this project lost a full session.
   If the reference does not name something you need, ask for a regenerated copy.
   A missing name there means the reference needs re-cutting, not that you should
   go looking for the object yourself.
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
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` `/player/[playerId]` `/trades` `/trades/new` `/trades/[tradeId]` `/restructure` | Owner pages | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash`  `/admin/owner-activity` `/admin/trades` `/admin/restructure` | Widened admin pages | **Commissioner OR co-commissioner** |
| `/admin/sync-players` `/admin/import-stats` | Strict admin pages | **Commissioner only — do not widen** |
| The appointment control *on* `/admin/owner-activity` | Strict control on a widened page | **Commissioner only** |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

Every gated page: the three-line gate (`getCurrentTeamOwner()` →
`redirect('/login?next=…')` signed out → `redirect('/')` non-commissioner) AND every
Server Action independently re-checks. Both layers, always. `next=` targets pass
`safeNext()`.

**`app/page.js` and `app/cap-sheet/page.js` now gate what they RENDER
(Aug 30 2026).** Until then every admin button was drawn for every logged-in
owner and only the destination page turned them away — an owner who clicked one
landed back on the home page with no explanation and reasonably concluded the app
was broken.

**This is presentation, not access control.** Each admin page still redirects and
each Server Action still re-checks independently, and **those remain the real
gates** — nothing about them changed in this batch. Hiding a link protects
nobody; it stops showing people doors they cannot open. Never treat a hidden
link as a substitute for either layer.

- `app/page.js` — the **whole Admin section** is inside a single `canAdmin`
  block (`isCommissionerOrCo(teamOwner)`). **A new admin link goes INSIDE that
  block, not beside it** — one added as a sibling renders for the entire league
  and silently undoes this.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`), used for the
  Sync Players link alone because `/admin/sync-players` is strict. **Never swap
  it for the helper.** If that page's gate ever widens, widen this in the same
  commit — not before.
- The caption under the links differs by role and names what each may not do.
  **Keep it in step with the gates**; it went stale once already when it still
  read "Manage Owner Cash is commissioner-only."
- `app/cap-sheet/page.js` — the page stays public; only **"+ New Contract"** is
  behind `canAdmin`. That page had no permission check of any kind before this.

`/admin/import-stats` is linked from nowhere (known gap, on the to-do list) —
when it gains a link it belongs inside the `canAdmin` block **and** behind
`isCommish`, since that page is strict.

### League surfaces treat the commissioner as an ordinary owner (Sep 4 2026)

**STANDING RULE.** A page in the **League** section — and a team page — shows and
does the same thing for every owner. Any elevated ability belongs in the **Admin**
section, **duplicated there if necessary.** The rule exists because a commissioner
restructured another team's contract from `/restructure` without meaning to: an
admin power sitting on an owner-facing page is reachable by accident.

Applied so far:

| Surface | Was | Now |
|---|---|---|
| `/restructure` | commissioner saw every team | own roster only, for everyone. `isCommissionerOrCo` is **not imported** in that file — if it reappears, something drifted |
| `/cap-sheet` | drew a "+ New Contract" admin link | no role check at all |
| `/team/[teamId]` | `canCut` / `canMove` = own team **or** commissioner | own team only. Cut-from-any-roster moved to `/admin/cuts` |

**`/admin/cuts` is now three things**: the cut-any-roster control, the ledger, and
the reversal dialog. `AdminCutPanel.js` **imports the team page's
`CutPlayerDialog` rather than copying it** — its own imports resolve relative to
itself, so `previewCut` / `executeCut` still come from
`app/team/[teamId]/actions.js` wherever it is mounted. Two dialogs would be two
settlement summaries to keep in step, which is the thing
`compute_cut_charges()` being the single implementation exists to prevent.
The page shapes its rows to the contract that dialog already expects
(`id, name, position, typeLabel, span`); **matching that shape is what makes one
dialog serve both surfaces.**

`executeCut` now revalidates `/admin/cuts` too — the cut can be made *from* that
page and the ledger sits under the picker.

**`/admin/trades` is the commissioner's side of trades.** Approve-and-execute,
veto and reverse moved off `/trades/[tradeId]`, which now carries **only** what
a party does: send, discard, accept, decline. `AdminTradePanel` imports
`executeTrade` / `vetoTrade` from `app/trades/actions.js` and mounts
`ReverseTradeDialog` — the gates were already right, only where the buttons are
drawn changed.

**THE QUEUE IS `accepted` AND `executed`, AND THE MISSING THIRD IS NOT AN
OVERSIGHT.** The September 3 visibility ruling gives the commissioner **no
special read on a proposal**: a trade at `proposed` is visible only to its
parties. A non-party commissioner cannot see one, so veto-while-proposed is
unreachable for them by design, and there is nothing to approve until every
party has agreed anyway. Do not widen the read to "fix" it.

The three controls there are gated three different ways and look inconsistent on
purpose — execute is commissioner **or** co (7.7(c)); veto is commissioner
**only** (7.7(d)); reverse lets the commissioner act on his own team's trade but
not a co-commissioner (Aug 27 ruling). Never align them.

**All three moves are done.** Restructure-for-another-team was the last, and it
lives at `/admin/restructure` (Sep 4). Nothing elevated remains on a League or
Teams surface.
Roster moves followed the same path in the same batch: `AdminCutPanel` mounts
`RosterMoveDialog` too, and `setRosterStatus` revalidates `/admin/cuts`. Both
dialogs are **imported from `app/team/[teamId]/`, never copied.**

### The Cut Player feature (shipped `f8fec0b` + `bdd2d0f`, Aug 10 2026)

- `app/team/[teamId]/page.js` — server component; now resolves the viewer via
  `getCurrentTeamOwner()` and passes `canCut` (**own team only** since Sep 4
  2026 — it was own team OR commissioner from Aug 25). Reads
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

### The Player Card (shipped Aug 27 2026)

`/player/[playerId]`, login-gated, opened in a **new window** from every player
name in the app. Delivered chat-side as a verified file set (22 files, all
SHA-256 checked against the manifest before install) and compiled with
`next build` on the chat side — **the only batch in this repo's history that
reached main pre-compiled.** Ground rule 5 still holds for everything else.

The views and RPC it reads are listed in the database reference. The transaction
feed is a `security_invoker` view, so what an owner sees is decided by RLS, not
by app code — do not add a filter, do not switch the view to SECURITY DEFINER,
and **do not cache one viewer's feed and serve it to another.** Since September
3, 2026 losing bids on verified tiers are visible to every owner and name the
bidding team (league decision on transparent results); withdrawn bids still show
only to the team that withdrew and to the commissioner.

**`components/PlayerLink.js` is the one way a player name becomes a link**, and
it is the first file in `components/` — a new top-level directory beside `lib/`.
Two decisions in it are load-bearing:

- **Null-safe by design.** A missing `playerId` renders the bare name, no dead
  link. Chart rows for unmapped players and legacy rows carry no `player_id`, so
  call sites never branch. Do not add a ternary around a `PlayerLink`.
- **A plain `<a>`, deliberately not `next/link`.** `next/link` with
  `target="_blank"` works but prefetches every player page on a 40-row cap
  sheet, and the card is a full data fetch per player. Do not "upgrade" it.

**The five chart colours are NOT the app's four currency tokens.** `--pc-gtd`
`--pc-non` `--pc-opt` `--pc-sign` `--pc-rost` exist because a five-slot
categorical palette must keep every **adjacent stacked pair** separable under
colour-vision deficiency, and the currency tokens fail that (rust/gold ΔE 1.5
deutan, green/gold 2.1 protan — measured). They sit in the same hue families but
were re-stepped until all six checks pass in both themes, **in the stacking
order gtd, non-gtd, option, signing, roster.** Changing a hex or an order means
re-validating. Do not eyeball it, and do not "unify" them with the currency
tokens — that is the thing they were built to avoid.

**One known inconsistency, left as-is:** `app/team/[teamId]/CutPlayerDialog.js`
renders the player's name as plain text in its title. It was not in the delivery
set, so it is the one player name in the app that is not a link. Harmless;
wrap it with `PlayerLink` when next in that file.

### The roster move control (shipped Aug 26 2026)

Move a player between the active roster, the practice squad and injured
reserve, from `/team/[teamId]` beside the Cut control.

- `app/team/[teamId]/RosterMoveDialog.js` — the dialog, second consumer of the
  `.modal-*` primitives. **`.modal-actions` does not exist**; the button row is
  `.page-actions` inside `.modal-card`, which is what carries the mobile
  column-reverse. Copy that, not a new class.
- `setRosterStatus` appended to `app/team/[teamId]/actions.js` — returns
  refusals, so the file is still at zero throws.
- The contract's roster status is selected on the team page and carried on each
  roster row as `rosterStatus`.

**THE RULES HAVE TWO OWNERS AND ONE OF THEM IS NOT THE FUNCTION.**
`set_roster_status()` enforces the squad limits, but practice-squad
**ELIGIBILITY** is a separate trigger on `contracts`, anchored to the player's
draft year and fired by the update the function performs. **No JS mirrors either
of them** — the dialog offers every destination except the one the player already
occupies and lets the database refuse. Its refusals name the rule and, for
eligibility, the draft year, so they are surfaced verbatim. A client pre-check
would be a second copy of a rule the database owns, and the trigger would win
every time they disagreed.

**Rule 3.6 IS NOT ENFORCED YET AND THAT IS CORRECT.** `active_limit_enforced`
comes back false and flips true at the In-Season boundary, keyed on `rule_ref`
`1.4(c)` — **2026-09-07 00:01 ET**.
Offseason roster size is unlimited under 3.6(a). The dialog says so on every
result rather than letting a 25-man limit appear from nowhere mid-week, and it
**links to `/calendar` instead of hardcoding the date**, which would go stale
every September. If you want the date named in the dialog, pass it from the
server pre-formatted in Eastern — never format it client-side (see `/calendar`).

`taxi_used` / `taxi_limit` / `active_after` are rendered **from the return
value**, not counted client-side: the function counts the roster as it stands
after the move.

**Roster status shows as a tag beside the player name, only when it is not
`active`** — the same idiom as the `VOID YR` tag it sits next to. A "Squad"
column would be a column of "Active" on nearly every row. As of Aug 26 all 233
active contracts are `active`, so nothing renders a tag yet.

**`canMove` is a separate prop from `canCut`** although the two conditions are
identical today (own roster, unless commissioner or co-commissioner). They are
different permissions in the rule book and one changing must not silently change
the other.

### Contract restructure (`/restructure`, shipped and DISABLED Sep 4 2026)

**`RESTRUCTURE_ENABLED` in `lib/featureFlags.js` is the kill switch, and it is
currently `true`.** It was flipped off for part of September 4 after two issues
surfaced — a League page let the commissioner act on another team's contract,
and fractional dollars were reachable — and back on once both were fixed. Set it
to `false` to switch the feature off again; nothing else needs editing.

**Three layers read the flag and only one of them is the real switch.**
`app/page.js` hides the link and `app/restructure/page.js` renders an
explanation — both presentation. **`app/restructure/actions.js` refuses in all
four actions, and that is what actually disables the feature**, because a
Server Action is a callable endpoint whatever the page renders: an owner with
the page already open, or anyone crafting the call, would otherwise still reach
`restructure_contract()`, which knows nothing about the flag and would run
happily. **Never disable a write path by hiding its link.**

The disabled page explains rather than redirecting. An owner following a
bookmark should learn the feature exists and is temporarily off, not get bounced
to the home page with no reason — the same principle as the admin-link work.

Converts unpaid current-season salary into a **new** signing bonus with its own
proration window; the original signing bonus is untouched. Database side was
built, migrated and tested chat-side — **no SQL in this repo and none should be
written for it.**

| File | What |
|---|---|
| `app/restructure/page.js` | League route. **Login only — no commissioner check** |
| `app/restructure/actions.js` | Four actions, all returning refusals |
| `app/admin/restructure/page.js` | Admin route. `isCommissionerOrCo`, any team |
| `app/admin/restructure/actions.js` | One action: the all-teams roster loader |
| `lib/restructureRoster.js` | The roster query and eligibility pass, shared |
| `components/RestructureForm.js` | Picker, controls, live preview, execute |

**TWO ROUTES, ONE FORM, ONE LOADER, TWO GATES.** `/restructure` serves an owner
their own roster; `/admin/restructure` serves the commissioner every team. The
only difference is the loader the page hands to `RestructureForm` — the query,
the eligibility pass and the shaping live once in `lib/restructureRoster.js`,
which **holds no authorisation at all**: it takes a client and a team scope and
answers. Deciding who may ask is the caller's job, and the two callers are the
two gates. **Do not add a role check inside that lib file.**

**`max_restructure`, `compute_restructure_charges` and `restructure_contract`
are NOT redeclared for the Admin route.** The form calls the League versions on
both pages, because `restructure_contract()` already permits a commissioner to
act on any team and enforces that itself — the same shape as `cut_player`.
Redeclaring them would give one rule two homes and one of them would go stale.

**EVERY OWNER MAY RESTRUCTURE ON THEIR OWN ROSTER** (rule change, Sep 4 2026);
commissioner and co-commissioner may act for any team, exactly as `cut_player`
works. It first shipped commissioner-only on `/admin/new-contract` behind a mode
selector, and **that was wrong within hours** — that page is commissioner-gated
at both layers, so an ordinary owner could not reach the feature at all. The
selector was removed and the feature moved here. **Do not put it back on
`/admin/new-contract`**; new contracts stay commissioner-only.

**There is deliberately NO commissioner check in `app/restructure/actions.js`.**
The database is the gate and it distinguishes *"this contract belongs to Awful
Lot"* from *"not eligible until 2027"* with different messages. An app-layer
commissioner check would collapse both into one generic refusal and lock out the
owners the rule change exists for. `isCommissionerOrCo` appears in that file
once, for **picker scoping only** — never as a gate.

**Picker scoping:** an ordinary owner sees only their own team's active
contracts, and other teams' players are **absent, not greyed**. A permission
refusal from `can_restructure` removes the row entirely; an eligibility refusal
greys it and shows its reason. Those are different answers and the UI must keep
them different.

**RESTRUCTURE IS NOT A `contract_type`.** `contract_type` drives the 30%
exemption, PPV weighting, the minimum-salary exemptions and option-bonus
eligibility — a restructured veteran deal is still a veteran deal, and giving it
its own enum value would silently change how four unrelated rules read it.
**Do not add one.**

**The team cap panel comes from `team_impact`, and only from there.** Five
seasons, always. **Do not sum `seasons[]` to get a team figure and do not fetch
the cap sheet separately** — two routes to one number disagree the moment
anything else moves, and an owner has no way to tell which is right.
`ceiling` / `room_after` / `over_ceiling` are **null** for a season with no
`league_cap_settings` row (2028 onward today) and render as an em dash, never
zero: "no ceiling set" and "a ceiling of nothing" are opposite claims. A
provisional ceiling is marked. **Over the ceiling is marked and never blocks
submission** — league policy is that an owner may run a future cap as tight as
they like, and the database enforces the ceiling only in the current season once
5.5(f) has armed.

**WHOLE DOLLARS, AND THE FORM ADDS NO DISPLAY ROUNDING** (Addendum 3, Sep 4).
Whole dollars are enforced in the **data** — a table constraint plus checks in
`restructure_contract()` — not by formatting. The form uses
**`formatExactMoney`**, not `formatMoney`: `formatMoney` rounds, and rounding
here is how a reader sees "$1,500 of $1,500" while the database refuses them at
1500.33.

**A FRACTION ON THAT SCREEN IS NOT AUTOMATICALLY A BUG**, and an earlier version
of this note said it was — which would have sent someone hunting a defect that
is not there:

| Figure | Expect | A fraction means |
|---|---|---|
| `cap_change`, `per_season_charge`, `final_season_charge`, `void_acceleration_amount`, `team_impact.change` — **generated** by the restructure | always whole | a defect, report it |
| `cap_before`, `cap_after`, `dead_cap_before`, `dead_cap_after`, `team_cap_before/after` — **inherited** | may be fractional | normal on the 48 affected contracts |

**156 contract-year rows across 48 active contracts** carry signing-bonus
proration from before the whole-dollar rule. Jonathan Taylor renders `$296.33`
and nothing is wrong; that is rule 1.9, still open. The response carries
`has_inherited_fractional_proration` and a ready-made `inherited_note`, shown as
a footnote under the season tables **only when the flag is true** — so it
explains a real oddity rather than pre-empting one nobody saw.

`compute_restructure_charges` briefly rounded those inherited values itself
before returning them, which no client formatter could have recovered. Fixed
database-side the same day; `values_are_exact: true` on the response is how that
is checkable.

`formatExactMoney` is the third export of `lib/formatMoney.js` and is **for
restructure surfaces only.** Do not adopt it elsewhere to tidy a fractional
figure — those values are real, and `formatMoney` is correct for them.

**Proration divides by floor, and the FINAL season absorbs the remainder** — 100
over 3 is 33 / 33 / **34**, summing to exactly 100. Naive per-season rounding
would have drifted existing proration by $21. `proration_note` explains it on
screen and is **null when the amount divides evenly**, so the note appears only
when there is something to explain.

**Inputs are `step="1"` and floored before they reach state**, so the value
submitted is the value on screen. **The guaranteed field is clamped to
`limits.unpaid_guaranteed`** — without it the guaranteed-first default trips
*"This contract has only 0 of guaranteed salary in 2026; you asked to convert 6
of it"* on any contract whose current season is all non-guaranteed.

**A restructure is cash-neutral**, and the checklist says so from the response's
own `cash_note` rather than asserting it here. Salary already owed this season
becomes a bonus paid this season; cash spent is identical before and after.
There is no cash check to add.

**`reverse_restructure` stays commissioner/co only**, matching `reverse_cut`. An
owner who wants one undone inside the 96-hour window asks the commissioner.
**No reversal UI exists yet** — that is a gap, not a decision.

**NOTHING IN THE FORM COMPUTES MONEY.** The slider bound, the binding limit, the
cap saving, the per-season schedule, the dead-cap movement, the PPV delta and
every rule verdict come from `max_restructure()` and
`compute_restructure_charges()`. There is no client mirror of the cap formula,
the Deion Rule, the minimum salary or the PPV test, and there must not be one.
The only arithmetic in the file is splitting a typed amount between the
guaranteed and non-guaranteed buckets, which is input handling.

**The 30% Rule (5.22) does NOT apply to a restructure**, and the form says so on
screen rather than staying silent — so nobody adds a check for it later.

**Dead money is on screen, not behind a toggle.** Converting salary into
proration pushes dead cap into later seasons, and that is the figure owners
least expect to move; an owner who reads only the cap saving would not discover
it until they tried to cut the player.

**THE DEAD-MONEY TABLE SHOWS ONLY SEASONS WHERE `cuttable` IS TRUE** (Addendum 4,
Sep 4). It used to list void seasons, showing Jonathan Taylor declining $46.40 →
$5.00 across 2029–2032. Wrong twice: he **cannot be cut in a void season**, the
deal having ended, and a gradual wind-down contradicts **rule 5.10(c)**, under
which everything accelerates onto the season after the last real one at once.
It was a database bug — `dead_cap_if_cut` summed forward through void rows — and
is fixed; those 165 rows are NULL now.
Void rows are **dropped, not dashed**: the table asks what a cut costs, and after
the contract ends the question has no meaning. **Never render `$0` there** —
"free to cut" is worse than the original bug. `dead_cap_before` / `dead_cap_after`
are nullable now and `formatExactMoney` returns an em dash for null.
`dead_cap_note` from the response explains it beneath the table.

**The CAP tables keep their void seasons**, and that is not an inconsistency: a
void season's cap charge is real even though a cut is not possible there.

**Out-year cap position is displayed, never blocked.** League policy is that an
owner may run a future cap as tight as they like. Future seasons are marked
"est." because the next season's cap is provisional.

**The restructure actions use the SESSION client, not `adminClient()`, and this
matters more now than it did.** The functions gate themselves on `auth.uid()`;
through the service-role client `auth.uid()` is NULL, so with ordinary owners
calling these directly **every call would fail** with "No owner record is linked
to this login." `createContract` on the admin page uses `adminClient` for its
direct table writes — **that is a different situation; do not copy it here.**

**The roster loads inside the form, not as page data.** `can_restructure` is one
round trip per contract — about 23 for an owner, every active contract for the
commissioner — so `loadRestructureRoster` runs at concurrency 10 when the form
mounts. It returns permission and eligibility in one call; the older
`restructure_ineligible_reason` still exists but is no longer used here.

### The Tier Results Export (shipped `318c99c`, Aug 11 2026)

- `app/bids/results/[tierId]/export/route.js` — **the app's second Route
  Handler** (after `/auth/callback`) and the first that returns a file. Public
  and ungated on purpose: the results page is public and the exported data is
  already published on it. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`.
  Takes `?format=csv|xlsx|pdf`; anything else is a 400. An **unverified tier
  returns 409** carrying the page's own wording, rather than the empty file the
  views would otherwise hand back.
- Reads `auction_tier_results` and `auction_tier_result_years` only — both
  SECURITY DEFINER, both filtered to verified tiers, which is what keeps an
  unverified tier's bids sealed while published results stay public. `bids`,
  `bid_years` and `bid_option_bonuses` are never queried here: the views are the
  published record, and reaching around them would let an unverified tier leak.
  Since September 3, 2026 every row of `auction_tier_results` names its team and
  carries `option_bonus_total` / `option_bonuses`.
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
oversight to be tidied up later: a hide reveals bidding intent, and a hide is a
viewing preference, not a result — the September 3, 2026 transparency decision
covers published results only. In production already — **61 rows across 3 teams in
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

- **`lib/bidPayload.js` deliberately omits the void-reason field, and that is
  correct.** The database derives it server-side, because the same column also
  applies to void rows a trigger generates on its own — rows the client has no
  business labelling. **Do not "fix" `buildBidPayload()` by adding the key.**
- **The second JS dead-money aggregation in `app/team/[teamId]/page.js` is GONE
  as of September 4, 2026, and it was not a harmless exception.** From `769a772`
  this file mirrored two `contract_events` terms in JavaScript so the "of which
  dead money" row had a number, and the same block then seeded the Overview's
  Cap Hit and Cash Committed before adding each contract's `cap_charge` and
  `cash_value` on top. **The contract read discarded its error** — a bare
  `const { data } = ...` — so any failure left the year rows empty, every
  `find()` missed, and **the totals silently collapsed to dead money alone**.
  Cash Over Cap showed a Cap Hit of $31 against a true 1,461.67 and $1,470 of
  cap space against a true $38.33; six teams with no `contract_events` at all
  read $0 committed and a full $1,500 free, two of them actually over the cap,
  three days before the September 7 hard block. The page even contradicted
  itself on screen: Cash Available was correct and could not be reconciled with
  the Cash Committed row above it.
  **Every Overview total is now READ from `team_cap_by_season`** — cap hit, dead
  cap, cap space, min required spend, cash used, dead cash — and nothing on that
  grid is summed in JS. **Cap Space in particular is read, not `cap − capHit`**,
  which is what let a wrong cap hit propagate into a wrong headroom figure.
  `team_cap_summary` could not be used: it CROSS JOINs `league_cap_settings`,
  which holds 2026 and 2027 only, so it returns nothing for the later seasons
  this five-season grid shows. **Do not reintroduce a JS aggregation here for a
  season the view seems to be missing** — that is a view question, not a page
  one. Both reads now capture their error and the page renders a banner rather
  than letting a partial answer pass as a whole one.
  The team page also uses **`formatExactMoney`**, not `formatMoney`: rounding
  1,500.33 to $1,500 against a $1,500 cap hides a real overage. `/cap-sheet`
  still rounds, so the two pages show the same values at different precision —
  known and accepted, not a bug to reconcile without a ruling.

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
`canCut` in `app/team/[teamId]/page.js`. At the time, "cut from any roster" did
not live on `/admin/cuts` — that page was only the ledger and the reversal
dialog, so widening it alone would have handed a co-commissioner the paperwork
and not the action.

> **SUPERSEDED September 4, 2026.** `canCut` is own-team-only again, and
> cut-from-any-roster now *does* live on `/admin/cuts`. See "League surfaces
> treat the commissioner as an ordinary owner" above. The reasoning below still
> explains why the Aug 25 widening was right *then*; do not act on it now.

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

### The Trade UI (shipped Aug 25 2026)

Three routes, all login-required.

**Visibility (ruling of September 3, 2026).** An offer is visible only to the
teams party to it until every party has accepted; from acceptance onward
(`accepted`, `approved`, `executed`, `vetoed`, `reversed`) it is visible to any
signed-in owner. Drafts stay proposer-only. Declined and cancelled offers stay
between the owners who exchanged them. **The commissioner and co-commissioner
have no special read on proposals** — deliberate, same family as
`bid_player_hides`; do not add one. `can_view_trade()` in the database is the
single judge and the pages do no filtering of their own.

**Overlapping offers (same ruling).** An owner may name the same player or pick
in any number of open proposals, to the same owner or different owners. Only a
trade every party has accepted (`accepted`/`approved`) reserves an asset. The
last acceptance cancels every other `proposed` trade naming any of the same
players or picks — status `cancelled`, `resolution_reason` beginning
`Superseded:` — and `accept_trade()` returns `offers_cancelled`. Drafts are not
cancelled; `submit_trade()` refuses them while the asset stays committed. The
builder must never exclude or grey out a player because he is in another
proposal.

| File | What |
|---|---|
| `app/trades/page.js` | List, four sections via `tradeSection()`. Bound-and-warn at 200; parties and assets page until exhausted |
| `app/trades/actions.js` | All ten RPC wrappers. **Zero throws** — every one returns `{ok, message}` |
| `app/trades/TradeImpactCards.js` | **Shared by the builder and the detail page** |
| `app/trades/new/page.js` + `TradeBuilder.js` | Proposal builder |
| `app/trades/[tradeId]/page.js` + `TradePanel.js` | Detail and PARTY controls only — approve/veto/reverse moved to `/admin/trades` Sep 4 |
| `app/trades/DiscardDraftButton.js` | Discard, on drafts rows and the draft detail page (`276c1ae`) |
| `app/trades/[tradeId]/ReverseTradeDialog.js` | Commissioner reversal, with the forceable-breach path (`07ad0a6`) |
| `lib/tradeStatus.js` | Status vocabulary — labels and tones only |

**`TradeImpactCards.js` is shared on purpose and must stay shared.** An owner
reads those figures before accepting; the commissioner reads them before
executing. Two separate renderers could drift, and an owner would accept one set
of numbers and see another — the exact failure the design exists to prevent.

**NOTHING IN THE TRADE UI COMPUTES MONEY.** Every cap, cash and roster figure
comes from `trade_impact()`. There is deliberately **no `lib/` module mirroring
it** and one must not be written — this is the same rule as `compute_cut_charges`,
and it is stronger here because preview and execution must agree by construction.
The only arithmetic in the whole feature is `cap_after − cap_ceiling` to say how
far over a team is: a difference between two returned numbers, which is
presentation. Deriving what a cap *would* be is not.

**Cards, not a table, at every breakpoint.** `trade_impact` is twenty columns for
two-to-four teams — **wide, not tall**, the opposite of the `/bids` problem the
`.ledger` card-flip solves. Flipping a twenty-column table would stack twenty
label/value pairs per team and read worse than the table. `.trade-*` is a new
appended block in globals.css (now ~1,238 lines).

**Money stays whole dollars here** (commissioner ruling, Aug 25) — `formatMoney`
unchanged, no second formatter. **Consequence to know:** at a $1,500 cap a team
can read "$1,500 of $1,500" while `cap_ok` is false, because the real figure was
$1,500.33. **The `_ok` flags come from the database and always win**; the
over-by line says "less than $1" rather than "$0" so a real overage never renders
as none. If a figure and a chip ever appear to disagree, the chip is right.

**One draft per builder session.** Preview is a *write*: the first calls
`propose_trade(as_draft=true)`, every later one calls `update_trade_draft` on the
same row. Before that function existed the only way to re-price an edit was
discard-and-recreate, stranding a draft whenever a browser died. **With
`p_as_draft` the proposer does NOT auto-accept** — that happens in
`submit_trade`, which is also where asset availability is checked, because a
draft reserves nothing.

**Two gates of different widths sit side by side.** Approve and execute is
`isCommissionerOrCo` (7.7(c)); **Veto is `me.is_commissioner` only** (7.7(d) —
"the commissioner and commissioner only"). They are adjacent buttons with
different gates. **Never widen the veto to match the button beside it.**

> **MOVED September 4, 2026.** Both controls now live on `/admin/trades`, not
> on the detail page — `TradePanel` no longer receives `canApprove` or
> `isCommissioner` at all. The gate rule above is unchanged and still applies;
> only the location did.

**Recusal is explained, not just enforced.** `execute_trade()` refuses under
7.7(e) when the approver's own team is a party, so the UI detects it from the
party list and hides the control instead of letting an owner hit the refusal.
**A conflicted approver is told which team and pointed at
`/admin/owner-activity`; a plain party is told only the general rule.** That
asymmetry is an **RLS consequence, not sloppiness**: `team_owners` is readable
only as yourself or as commissioner/co, so a regular owner cannot be shown who
holds the role. The alternatives — the service-role client, or a new SECURITY
DEFINER function — both widen data access to improve a notice. **If you want the
party-facing message to name the team, that is a deliberate decision to make,
not a bug to fix.**

### The three trade-draft defects (`276c1ae`, Aug 27 2026)

All three found by the commissioner on a live draft. Worth reading because two
of them are diagnostic lessons, not just fixes.

**1. Discard existed in the database and had no caller.** `discard_trade_draft()`
shipped with the trade build; `discardDraft` was in `app/trades/actions.js` from
day one; **no page ever called either**, so a draft could be created and never
deleted. **NEW `app/trades/DiscardDraftButton.js`** — used on each row under
"Your drafts" on `/trades` and beside Send on a draft's detail page. Two-press
confirm, no `window.confirm` (a native modal blocks the page and ignores the
app's Escape handling), no reason field, disabled while in flight.
**A draft is DISCARDED; a sent trade is DECLINED.** `discard_trade_draft` takes
no reason because nobody but the proposer has seen the thing; `decline_trade`
takes one because counterparties were already asked to look. The database draws
that distinction in its own refusal wording and the UI mirrors it.

**2. The proposer was locked out of their own draft — and the obvious diagnosis
was wrong.** The handoff predicted the cause was comparing `trades.proposed_by`
(a `team_owners.id`) against `session.user.id` (an auth uid). **That comparison
did not exist anywhere in the trade UI**; `proposed_by` was selected and never
read. The real cause was in `TradePanel.js`:

```
const showPartyControls = isParty && !hasAnswered && !isFinal && status !== 'draft';
```

`status !== 'draft'` excluded drafts from the only party branch, and **no
proposer branch existed at all** — Send lived only in the builder and Discard
nowhere — so a draft matched nothing and fell through to the read-only footer.
Fixed structurally: an explicit `showDraftControls` branch keyed on
`trade.proposed_by === me.id`, and gating rebuilt so **Accept** shows only while
unanswered and **Decline** for any party that has not declined. **The proposer
correctly gets Decline alone at `proposed`**, because `submit_trade` auto-accepts
for them — that is not a missing button.

**Three identities, and they are not interchangeable.** `session.user.id` is a
Supabase Auth uid used only to look up the owner row; `team_owners.id` is what
`trades.proposed_by` stores; `teams.id` is what `trade_parties.team_id` stores.
`getCurrentTeamOwner()` resolves the first into a row, so `me.id` is a
`team_owners.id` and `me.team_id` is a `teams.id`. Compare each against its own
kind.

**3. The verdict badge read as a button.** The impact card's `✓ CLEAR` /
`✗ BLOCKED` wore `.status` — the same bordered pill the clickable chips wear —
so the commissioner clicked it and reported it broken. It is a read-out of
`cap_ok` / `cash_ok` / `roster_ok` and **must never get a handler.** Verdict and
the party status chip now share **`.trade-verdict` / `.trade-state`**: coloured
text with a glyph, no border, no fill, `cursor: default`, no `:hover` rule, and
plain `<span>`s with no `role` and no `tabindex` so neither enters the tab order.
**Do not give either a border, a background, a hover state or a handler.** A
real control on a trade card wears `.btn` like every other control in the app —
that is the distinction being preserved.

### Trade reversal (`07ad0a6`, Aug 27 2026)

`reverse_trade` (signature in the database reference) undoes an **executed**
trade: every player returns to the roster that sent him on his original
contract, every pick goes back, and the settlement is marked reversed rather
than deleted so neither team carries cap or cash from it. The trade stays on the
record as `reversed`.

**It holds five guards in a deliberate order** — current season, players
untouched since, no auction verified since, picks unspent and unmoved, window
still open. Each refuses with a sentence naming the reason, and those are
surfaced verbatim. **No JS mirrors any of them**, same rule as the roster move
control and the cut engine.

**SQLSTATE `EDFL1` MARKS THE ONE FORCEABLE REFUSAL, AND THE UI READS THE CODE,
NEVER THE MESSAGE.** `p_force` bypasses the post-reversal **compliance check**
and nothing else, so that refusal alone is raised as `EDFL1`; all five guards
above raise the default `P0001` and are **not** forceable. `app/trades/actions.js`
compares `error.code` against one constant and sets `needsForce`, and
`ReverseTradeDialog` only ever offers "reverse anyway" when that flag comes back.
**Matching on message text instead would be wrong twice**: it would break the
moment a sentence is reworded, and it would offer an override that the forced
call refuses identically — a lie to the commissioner. If a second forceable
condition is ever added, it needs its own SQLSTATE, not a second string match.

**The 96-hour window lives in `league_config.trade_reversal_window_hours`** and
is read, never hardcoded. It is **deliberately a separate column from
`cut_reversal_window_hours`** so that changing one cannot silently change the
other — they are the same number today and are not the same rule. If the config
read fails or the column is empty, `reversalHoursLeft` is **null** and the
countdown is simply not shown; the database remains the authority on whether the
window is open.

**REVERSAL RECUSAL IS NOT APPROVAL RECUSAL, AND THE TWO GATES SIT LINES APART
LOOKING INCONSISTENT ON PURPOSE.** Rule 7.7(e) recuses **both** the commissioner
and a co-commissioner from *approving* a trade their own team is party to — that
is `approverIsConflicted`. **The reversal ruling of August 27, 2026 recuses only
the CO-commissioner.** The commissioner may reverse any trade **including his
own**, because reversing is undoing a decision rather than making one, and a
commissioner who executed a trade in error must be able to take it back without
needing someone else to do it for him:

```
const canReverse =
  canApprove && trade.status === 'executed' &&
  (Boolean(me.is_commissioner) || !isParty);
```

**Do not "fix" this to match the approval gate.** Both gates carry the reasoning
in a comment beside them.

**Reverse is gated on `canReverse` alone and NEVER on `isFinal`.** (`canReverse`
is computed on `app/admin/trades/page.js` since Sep 4; the rule is unchanged.)
`isFinalStatus('executed')` returns **true**, and `executed` is the exact status
reversal applies to — gating on `!isFinal` would hide the control on the only
status where it works. `isFinalStatus` answers "can a party or an approver still
act in the ordinary flow"; reversal is a commissioner correction tool outside
that flow. `reversed` is final in every sense: `reverse_trade()` refuses a
second reversal outright.

**A REVERSED TRADE SKIPS `trade_impact` AND `trade_legality` ENTIRELY.**
`reverse_trade()` clears the frozen settlement, and `trade_impact()` does not
read that settlement — **it computes**. Called on a reversed trade it returns a
perfectly real set of numbers answering "what would this cost if it happened
today", which an owner reads as what the trade *did* cost. Both RPCs are skipped
at the call site with `Promise.resolve({ data: [], error: null })` rather than
filtered afterwards, so the misleading number is never fetched. The Impact
heading and cards are hidden too, as is the "Figures frozen" banner, and a
reversal notice carries the explanation instead.

**`reversed` takes the `bad` tone, not `off`.** `off` is for a trade that quietly
never happened — a discarded draft, a cancellation, an expiry. A reversal undid
something that *did* happen, with players and money moved and moved back, and it
should carry a veto's visual weight in the completed list.

**REVERSAL DOES NOT TOUCH SLEEPER, AND BOTH THE DIALOG AND THE PAGE SAY SO.**
Nothing in this app can change a Sleeper roster. If the players were already
moved there, they have to be moved back by hand. This is the same standing gap
as everywhere else in the app, but it matters more here because a reversal is
precisely the moment somebody assumes the system put things back.

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
incompatible groups. Exports `formatMoney` (whole dollars, half away from zero,
locale pinned `en-US`) and `formatMoneyDelta` (signed, same rounding).

**`formatExactMoney` was added Sep 4** as a third export — same file, no
rounding. It has **exactly two consumers and the list is closed**:
`components/RestructureForm.js` and `app/team/[teamId]/TeamCapSheet.js`. See the
restructure section for why a second formatter exists at all and why it must not
spread further.

**Nineteen files import this module as of Sep 4.** Seventeen take the rounding
`formatMoney` — cap and cash: `/cap-sheet`, `CutPlayerDialog`, `/cash`,
`/admin/cash`, `CutsPanel`, `FixContractsTable`; bids: `/bids`,
`/bids/results/[tierId]`, `TierResultsPanel`; Player Card: `ContractTab`,
`EarningsTab`, `MarketValueTab`, `PlayerCard`, `TransactionsTab`,
`VisualBreakdown`; trades: `TradeImpactCards`, `ReverseTradeDialog`. The other
two take `formatExactMoney` and are named above. **`TeamCapSheet` moved from the
first list to the second on Sep 4** — it is no longer a `formatMoney` call site.

**All nineteen change together by editing this one file**, which is the entire
point of the consolidation and is what makes the open rule-1.9 rounding question
a one-file fix once it is settled.

**`pdfMoney` in `app/bids/results/[tierId]/export/route.js` is the twentieth
money renderer and the one deliberate exception.** It stays separate: the PDF is the
human-readable member of a download whose CSV and XLSX carry raw values, so
changing it is a decision about what a published result *is*, not a formatting
cleanup. **A rule-1.9 sweep should not quietly take it along.**

**`ReverseTradeDialog` applies the formatter BY BREACH KIND, not to every
number in the list** — `cap` and `cash` breaches are money, a `roster` breach is
a headcount, and running a headcount through `formatMoney` prints "$26" for
twenty-six players. An unrecognised kind falls through to the plain number
rather than being guessed at as currency, on the same principle as the
unrecognised-status fallback in `lib/tierRows.js`.

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
*Owner-elected* void years spread a signing bonus: maximum 2, and the span must
still fit inside 5 years. *Option-bonus* void years are created AUTOMATICALLY by
database triggers whenever an option bonus is scheduled, and can extend a
contract's span to at most 9 years. **Client code must never create, count or
limit option void years**; the database owns them start to finish, and any JS
that tries to police them will disagree with the trigger the moment an option
bonus moves. Rule book v13 5.7 / 5.20.
**Counting them from the contract row is wrong today, not just fragile** — see
§7 of the database reference, which has the live numbers and the four contracts
that break the obvious approach.

**The 30% Rule is enforced in the database, on contracts AND on bids.**
Compensation for the test = guaranteed + non-guaranteed + roster bonus +
option-bonus proration (the amount ÷ 5, spread across its five seasons); signing
bonus is excluded. Each season may exceed the prior season by at most 30% of
Year 1 compensation. Deferred triggers reject a violation at submit and name the
season, the step and the maximum, so the error text is worth surfacing verbatim
rather than paraphrasing. Rookie and fifth-year-option contracts are exempt, and
a flag marks a hand-picked set of permanently grandfathered contracts (count and
column in §7 of the database reference) — **never re-derive that set and never
copy the flag onto a new contract.** A client
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

**Verified tier results are transparent (league decision, September 3, 2026).**
Every bid on a verified tier — winner, loser, passed over — is published with its
team named, on the results page, in all three export formats, and on the player
card's transaction feed. What stays private: every bid on a tier that is not yet
verified (6.1(b), sealed from everyone including the commissioner), and
withdrawn bids (own team and the commissioner only). `bid_player_hides` also stays
own-team-only — a hide is viewing intent, not a result. `bid_id`, `team_id` and
`player_id` are still grouping and join keys in the export and must never reach
any output — that rule was never about anonymity, it is about not printing
stable identifiers.

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

**globals.css is now ~1,469 lines and grows by append.** Three feature blocks
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

## The four August option-bonus defects, and the audit that now exists

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
  filters by season. **The cause was recorded wrongly here twice**, both times
  blaming the 2031–2034 contract charges; it was never contract data. §7 of the
  database reference has the real mechanism and the live row counts. Any surface
  reading that view must filter by season — do not re-derive this a fourth time.
- **The five-year horizon is hardcoded** — `HORIZON = 5` in
  `app/team/[teamId]/page.js`, and the `contract_year_computed` query is bounded
  to it, so seasons 2031–2034 are never fetched. The Contract column still
  prints the full span correctly; the rows simply do not exist. No crash, silent
  omission.
- **A provisional cap is not surfaced on any FUTURE season an owner looks at.**
  `/cap-sheet` shows one season — the current one — so its provisional notice
  can only ever describe that season. The place an owner actually reads future
  caps is the five-season grid on `/team/[teamId]`, and that page does not read
  the provisional flag at all — §6 of the database reference has which season
  currently carries it and what the placeholder figure is. Every future season's Cap Space
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
- **The four co-commissioner gate questions are CLOSED** — all answered by querying
  the live database on Aug 25, not by reading comments. Recorded so nobody re-asks:
  `reverse_cut()`, `commissioner_delete_contract()` and `commissioner_delete_bid()`
  all call **`require_commissioner_or_co()`**; RLS on `team_cash_transactions` is
  `team_id = own OR is_commissioner_or_co(auth.uid())`, so `/admin/cash` really does
  show a co-commissioner every team's ledger; and `commissioner_owner_activity()`
  accepts a co-commissioner, which is why that page is widened.
  `set_co_commissioner()` is `require_commissioner()` — strict, as intended.
  **The method is the lesson**: one of these had a code comment asserting the
  opposite, and the comment was what produced a wrong recommendation. Ask the
  catalog, not the comment.
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
- Trade rulings of September 3, 2026 (visibility, overlapping offers) — see the
  Trade UI section.
- Transparent tier results (league decision, September 3, 2026) — see Rules
  encoded.

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
