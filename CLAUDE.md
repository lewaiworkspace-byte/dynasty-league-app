# CLAUDE.md — EDFL Dynasty League App

Briefing for Claude Code. Accurate as of the **free agent pool board batch,
September 8, 2026** (the first batch after the four of September 7 — App Bar,
Scoreboard and Standings, in-season free agency, and its option-bonus follow-up).
If the repo disagrees with anything below, the repo wins — report the discrepancy,
don't silently reconcile it.

*(Two notes on that stamp. It read "the trade reversal batch (`07ad0a6`, August 27,
2026)" until September 6, while the file below already documented the September 4
restructure, fifth-year-option and admin-surface work — **the stamp went stale about
itself**, the fourth time this project has recorded that failure. And it **no longer
names a hash**: this file is updated in the same commit as the batch it describes, and
a commit cannot contain its own hash — the first attempt stamped one, was amended, and
the stamp was immediately wrong. Name the batch and the date; `git log` carries the
hash. **Do not "complete" this line by pasting one in.**)*

**Database facts live in `EDFL_Database_Reference_for_ClaudeCode_v1.4.md`
(re-cut September 8, 2026; it replaced v1.1 in this repo the same day), generated
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

## Current league state (as of September 8, 2026)

This section is the one part of this file that describes *data* rather than code. It
is here because its absence is what let a reader infer a live auction that did not
exist. Treat it as a snapshot with a date on it, not as a permanent fact, and
re-verify chat-side before betting a build on it.

*(Re-stamped September 8 from the chat-side generated free agent pool package, which
read the live database that day. It stood at August 25 for two weeks while tier 5 ran
and in-season free agency opened — the same silence this section exists to prevent.)*

**No auction tier is open.** Nothing has `verified_at IS NULL`. Re-confirmed September
8: "all four auction tiers (1, 2, 4, 5) are resolved and none is open."

- **Tier 3 does not exist.** It was created August 13, stayed open **43 minutes**,
  took **zero** bids, and was deleted August 14 so a repriced Player Value Chart
  could be applied to its players. It is not open, not upcoming, and not coming
  back. Any reasoning that starts "tier 3 is live" is starting from a deleted row.
- **Tier 4 ran August 14–16 and was VERIFIED August 16 at 22:07 ET**, creating
  **47 contracts**.
- **Tier 5 has since run and is RESOLVED AND VERIFIED** (v1.4 live counts: "tiers 1,
  2, 4, 5 — all resolved and verified; none open"). That is the whole of what this repo
  knows about it: its dates, bid count and contracts created are not recorded here. Ask
  chat-side before reasoning about it; do not infer them from the contract counts below.
  `bids` stands at **485** (308 lost · 161 winner · 11 withdrawn · 5 passed over · **0
  pending**).
- **`tier_number` 4 is owner-facing "Tier 2 of Free Agent Quality Spread", and that
  mismatch is permanent.** The internal number and the league-facing label do not
  and will not agree. Never render `tier_number` as the name, and never "correct"
  one to match the other.

**Standing constraints are DISARMED**, and they re-arm on their own the moment a tier
exists with `verified_at IS NULL` — nobody flips a switch. Anything gated on "a tier
is open" is currently dormant, not removed, so a dormant code path reading as dead
code is expected and must not be deleted on that basis.

**Contracts: 323 total, 278 active** (v1.4 live counts, September 8 — 12 `cut`, 1
`cut_june1`, **32 `traded_away`**; of the active ones 255 active-roster, **22 taxi**,
1 IR). Up from 234 / 233 on August 25. **`contract_events` is at 54** — 34 traded, 13
released, 5 option exercises, 1 decline, 1 restructure — so every dead-money path has
live data through it. **`trades` is at 25 and `proposed` is 0.**

**In-season free agency is OPEN** (5.14(a), opened early September 7) and
**`free_agent_windows` / `free_agent_offers` are both at 0** — the feature is live but
nothing signed through it has survived; the commissioner's live tests were removed by
logged action. The 5.14(b) first-offer exemption **ends at 00:00 ET on September 14,
2026**. Both are calendar rows, not constants — see the free agency section.

**The 2026 In-Season boundary is 8:00 PM ET on September 8** (v1.4 §0, migration
`inseason_start_2026_only`). The roster-move section lower in this file still names
**00:01 ET September 7** for `1.4(c)` — that was accurate when written and is now
superseded; the dialog reads the calendar row and needed no change. Reported here
rather than silently edited there.

**`team_week_scores` is empty.** The scoreboard, standings and waiver priority all read
it and all return nothing today; that is a quiet preseason, not a broken page.

**Player identity is split across two `players` rows for 62 skill-position players**,
found September 8 and not yet repaired. See the open items; it affects any join between
stats and contracts.

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
2. **You have no database access. `EDFL_Database_Reference_for_ClaudeCode_v1.4.md`
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
| `/` `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/calendar` `/actions` `/scoreboard` `/standings` | Public pages | Deliberately ungated — do NOT add auth |
| The **Refresh from Sleeper** control *on* `/scoreboard` | Signed-in control on a public page — **not officer-gated, deliberately** | Any logged-in owner |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` `/player/[playerId]` `/trades` `/trades/new` `/trades/[tradeId]` `/restructure` `/fifth-year-option` `/transactions` | Owner pages | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash`  `/admin/owner-activity` `/admin/trades` `/admin/restructure` `/admin/fifth-year-option` `/admin/sleeper-sync` | Widened admin pages | **Commissioner OR co-commissioner** |
| `/admin/sync-players` `/admin/import-stats` | Strict admin pages | **Commissioner only — do not widen** |
| The appointment control *on* `/admin/owner-activity` | Strict control on a widened page | **Commissioner only** |
| The **Owner Info tab** *on* `/team/[teamId]` | Login-gated tab on a PUBLIC page — the button is not drawn signed out. **Self-edit only, for everyone** | Any logged-in owner |
| The **Owner Directory** *on* `/admin/owner-activity` | The same component at `editScope="all"` — the one place officer editing of another owner's card lives | **Commissioner OR co-commissioner** |
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
- **THERE ARE NOW TWO SLEEPER LINKS IN THIS BLOCK AND THEY ARE GATED
  DIFFERENTLY.** Sync Players is inside `isCommish`; **Sleeper Sync (Sep 6 2026)
  is not** — it is widened to co-commissioners to match
  `require_commissioner_or_co()` in the database. They will read as an
  inconsistency and they are not one. **Do not tuck Sleeper Sync inside the
  `isCommish` conditional to match its neighbour**, and do not lift Sync Players
  out to match Sleeper Sync. Different pages, different gates — see the Sleeper
  Sync section.
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
| `/team/[teamId]` Owner Info tab | first draft drew **"Edit as officer"** on every card | self-edit only, for everyone. Officer editing moved to `/admin/owner-activity` |

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
Teams surface — **that sentence is still true, this rule has no exceptions, and
none should be written into it.**

**THE OWNER INFO TAB IS THE FOURTH APPLICATION, AND THE FIRST CAUGHT BEFORE IT
REACHED PRODUCTION (Sep 6 2026).** Its first draft drew an **"Edit as officer"**
button on every owner card on `/team/[teamId]` — precisely the shape this rule
exists to prevent, and precisely what `/restructure` had to be corrected for on
the day it shipped. It was flagged in review, ruled on by the commissioner, and
the capability moved to `/admin/owner-activity` **before anything was pushed**.
The three earlier moves were all corrections after the fact; this one was not.

**The mechanism is a prop, not a second component.** `OwnerInfoPanel` takes
`editScope`, which **defaults to `'self'`**, and only `/admin/owner-activity`
passes `'all'`. A future mount that forgets the prop gets self-edit, never
officer editing by accident. See the Owner Info section for the rest.
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

### The Fifth Year Option (`/fifth-year-option`, shipped Sep 4 2026)

Rule 5.9. A Round 1 rookie's fourth season carries an option on a fifth, priced
by tier from EDFL Pro Bowl selections in his first three seasons. **Database side
was built, migrated and tested chat-side — no SQL in this repo and none should be
written for it.** The objects are listed in the database reference.

**EXERCISING EXTENDS THE ROOKIE CONTRACT. It does not create a second one**
(`fyo_13` / `fyo_14`, superseding the original design). `total_years` goes
1 → 2, one season row is written at the tier price fully guaranteed, and
`contract_years.added_by = 'fifth_year_option'` records why. **A player holds one
active contract, as before.**

Two contracts were not independent, which is why it changed: cutting the rookie
deal left the option contract active, so a team could cut a player and still
carry his option money and his roster spot the next season. The guarantee now
bites — Achane's 2026 `dead_cap_if_cut` is **229** (51 salary + the 178
guaranteed option) where under two contracts it was 51 and the option survived a
cut untouched.

**Consequences for this repo, all of them absences:**

- **No player-card change was needed, and a two-contract fix was drafted and
  retracted before it was built.** The terms strip and the summary sentence read
  `total_years` and derive the span from it, so a two-year deal renders as
  "2 yr / 2026–2027" with no code change. **Verified, not assumed** — `realYears`
  in `ContractTab.js` is `Number(shown.total_years)`.
- **`player_card_header.next_contract_type` / `next_contract_start` were added
  and dropped (`fyo_15`). Nothing here ever read them; do not start.**
- **There is no `contract_type = 'fifth_year_option'`.** Two files test for that
  string — `app/admin/new-contract/ContractForm.js` and
  `lib/thirtyPercentRule.js`, both for the 30% exemption. Those arms are now
  unreachable, and **leaving them is the safe state**: see the trap below.
- **`fifth_year_option_contract` is gone from `FEED_TONES`.** It existed only to
  label the second contract's signing row and can no longer occur.

**THE 30% TRAP, for whoever builds the negotiated extension.** The option year
escapes the 30% Rule today only because the contract is typed `rookie` and
`check_contract_30pct_rule` exempts that type. **A negotiated extension must NOT
be exempt.** Key any exemption on `contract_years.added_by` — the *reason* a
season exists — and never on `contracts.contract_type`, or the first veteran
extension inherits the rookie exemption silently. `lib/thirtyPercentRule.js` is
the client mirror and would have to move the same way, in the same change.

| File | What |
|---|---|
| `app/fifth-year-option/page.js` | League route. **Login only — no commissioner check** |
| `app/fifth-year-option/actions.js` | Four actions, all returning refusals |
| `app/fifth-year-option/FifthYearOptionBoard.js` | Table, confirm dialog |
| `app/admin/fifth-year-option/page.js` | Admin route. `isCommissionerOrCo`, reversal only |
| `app/admin/fifth-year-option/AdminFifthYearOptionPanel.js` | Decision ledger + reversal dialog |

**THE ACTIONS ARE COLOCATED, NOT IN `app/actions/`.** The delivery placed them at
`app/actions/fifthYearOption.js`, and that path is a **route** — `app/actions/`
holds the public `/actions` page, the Commissioner Action Log. Every feature in
this repo colocates its `actions.js` beside the page that calls it, and the
handoff's suggested sibling `app/actions/restructure.js` does not exist; the
restructure actions live at `app/restructure/actions.js`. The delivered import
`../../lib/supabase/server` does not exist either — the session-aware client is
`createSupabaseServerClient` from `lib/supabaseServerClient.js`.

**A LEAGUE SURFACE, so it treats the commissioner as an ordinary owner** — the
standing rule. The board returns `is_officer`, and **neither the page nor the
board reads it.** Officer-only reversal is a separate control that does not exist
yet, and when it is built it belongs in the Admin section. Do not use
`is_officer` to widen what this page can do; that is exactly what `/restructure`
had to be corrected for on the day it shipped.

**There is deliberately NO ownership check and NO commissioner check in
`app/fifth-year-option/actions.js`** — the same reasoning as the restructure
actions. The database distinguishes *"that player is not on your roster"* from
*"a decision is already recorded"* from *"he is not option-eligible"* with
different sentences, and an app-layer check would collapse all three into one
generic refusal.

**`can_decide` decides what is DRAWN, never what is permitted.** It is true only
when the row is eligible, undecided, and on the caller's own roster. The
functions refuse a foreign roster by name regardless.

**Three states that are not decided are kept THREE states, not one.** A row that
is ineligible shows its `ineligible_reason`; a row that is eligible but somebody
else's shows a bare "Undecided"; a row the viewer may act on shows buttons.
Collapsing the first two into one label is what the restructure picker had to be
corrected for — an eligibility refusal and a permission refusal are different
facts and the UI must keep them different.

**NOTHING IN THE BOARD COMPUTES MONEY.** The option value, the tier and the
current cap charge all come from `fifth_year_option_board()`. The tier is
assigned in the database from Pro Bowl selections and the price is looked up in
`edfl_tag_values`; there is no client mirror of either and there must not be one.

**The session client, never `adminClient()`** — the functions gate themselves on
`auth.uid()`, which is NULL through the service-role client. Same trap as the
restructure actions.

**Reversal lives at `/admin/fifth-year-option`, NOT on the board** — the
standing rule again. `app/admin/fifth-year-option/page.js` gates on
`isCommissionerOrCo` and reads **the same `fifth_year_option_board()` the League
page reads**, filtering to rows that carry a decision; there is no second query
and no second shaping pass to keep in step. `AdminFifthYearOptionPanel.js` is
the one caller of `reverseFifthYearOption`.

It shipped for one turn with no caller at all — the exact shape of the August 27
trade-draft defect. **If a future change removes the panel, remove the wrapper
with it** rather than leaving it dangling again.

**Reverse is offered on EVERY decided row and no JS reads a reversibility
flag.** `reverse_fifth_year_option()` owns the officer check and the window and
refuses with a sentence naming the reason — the same choice `RosterMoveDialog`
makes. **The window is deliberately not counted down on screen**, unlike
`/admin/cuts`: `cut_history` returns `reversal_hours_left`, the option board
returns no equivalent, and deriving one from `decided_at` would mean hardcoding
96 hours in JavaScript against a value that lives in `league_config`.

**The delivered board was restyled, not adopted as sent.** It arrived with every
colour inline and hardcoded light (`#15181b`, `#fff`, a hand-rolled scrim and
modal). This app themes light/dark via `data-theme`, so that page would have
rendered permanently light for a dark-mode owner and its buttons would have
matched nothing else. It now uses the existing primitives — `.ledger` with
`data-label`, `.table-scroll`, `.modal-*`, `.status` chips, `.btn` / `.btn-quiet`
/ `.btn-danger`, `.v-cap` for cap figures — and **adds no CSS at all.**
Player names go through `PlayerLink` like every other name in the app.

**The roster-count change in the handoff's §5 is a NO-OP in this repo.** Nothing
in the app counts roster in JavaScript: `taxi_used` / `active_after` on
`RosterMoveDialog` are read from `set_roster_status()`'s return value, and the
team page selects `roster_status` per contract for display only. The
`team_roster_by_season` switch was a database-side fix to `trade_impact`. **Do
not go looking for a JS roster count to change — there isn't one.** What the team
page WILL do is list an exercised option's contract as a roster row, because its
contract query filters on `status` and not on season; the cap figures are
unaffected, since they come from `team_cap_by_season`.

**THE FEED WAS A LIVE DEFECT AND THE FIX WAS A MIGRATION (`fyo_07`), NOT REPO
CODE.** The first handoff said both event types "already flow through with no
query change." **False.** `player_transaction_feed`'s `contract_events` branch is
a whitelist with an `ELSE`, not a fallthrough — both option events landed in it
and an exercised option rendered as kind `released`, title **"Released"**,
description **"Released by The Inside Traders"**. The reversal branch had the
same shape and read "Release reversed".

`fyo_07` gives the option kinds explicit branches, each with its own title and
description: `fifth_year_option_exercised`, `fifth_year_option_declined`,
`fifth_year_option_reversed` — **three, not the four it shipped with.**
`fifth_year_option_contract` labelled the second contract's signing row and
became unreachable when `fyo_13` made the option extend the rookie deal. It also
fixed two pre-existing bugs in passing — `event_type = 'expired'` also fell into
the `ELSE` and read "Released" (**this matters at the March 2027 rollover, when
62 contracts expire**), and the option contract itself read a generic
"Extended".

**So the client needs a TONE MAP AND NOTHING ELSE.** `cardHelpers.js` carries the
four kinds; `TransactionsTab.js` has **no money branch and no fallback
description** for them, because the view's description already carries the figure
and the season and a second wording would be a copy nobody would keep in step.
The snapshot is at `detail.fifth_year_option` if a summary ever needs one.

**A SPECULATIVE SPELLING IS WORSE THAN NO SPELLING, and this batch is the
example.** The first pass carried `option_exercised` / `option_declined`
fallbacks "in case" the view spelled them short. **The view emitted neither, so
they matched nothing** — and because an unmapped kind falls through to
`status-off` rather than failing, the map looked defensive while catching
exactly zero. The real defect was upstream and a dual-spelling guess could never
have reached it. **Do not add a spelling that has not been confirmed against the
view.**

**The same defect was already in the restructure pair and is now gone.**
`FEED_TONES` carried both `restructure` and `restructured`, and
`isRestructure()` compared against both, on the identical "the view's naming
could not be checked from here" reasoning. The September 6 handoff published the
feed's **complete kind vocabulary**, `restructure` is not in it, and both arms
were removed.

**FEED_TONES IS RECONCILED ONE-FOR-ONE AGAINST THAT VOCABULARY — 21 keys, no
dead entries, nothing emitted left unmapped.** If a kind is added to the view,
add it here; if one is retired, remove it. Reconcile the two lists rather than
accreting spellings, and note that ten of the twenty-one are *defined but not
yet triggered* in production, so "I have never seen it render" is not evidence a
key is dead.

**It was 22 for one day.** `fifth_year_option_contract` was correct under the
two-contract design and became unreachable when `fyo_13` made the option extend
the rookie deal. **That is the reconciliation earning its keep**: the key was
removed because the published vocabulary changed, not because anyone noticed a
row failing to render — and it never would have, since an unmapped kind falls
through silently.

**`expired` is mapped to `status-off`** — its kind string is confirmed. A
contract reaching its natural end is not a release: nothing was taken away and
nobody decided anything. Before `fyo_07` it fell into the feed's `ELSE` and
rendered as "Released", wrong on both the word and the tone. **Not cosmetic at
the March 2027 rollover, when 62 contracts expire at once.**

**Exercised and the option contract read `status-good`; declined reads
`status-bad`** — a guaranteed season arriving versus a player leaving after this
one. **`fifth_year_option_reversed` reads `status-live`, deliberately unlike
`cut_reversed` and `restructure_reversed`**, which are `status-good`: those undo
one thing in one direction, while an option reversal can undo an exercise *or* a
decline, so neither good nor bad is honest. It is a correction.

**No decision deadline exists.** Rule 5.9 sets none and the League Calendar has
no event, so the board says so on screen rather than implying one. When the
commissioner sets a deadline it belongs on `/calendar` and should be **passed to
the page pre-formatted in Eastern**, never formatted client-side.

**The option is priced in 2026 dollars** (commissioner ruling) — a lookup, not a
percentage of the provisional 2027 cap. **Round 1 membership is still derived**
from `signing_bonus_total` against `rookie_wage_scale_slots`, because
`contracts.draft_round` is NULL on all 299 rows; the derivation fails open. Both
are database-side and neither is something app code should try to reproduce.

### `fyo_08` — the board shipped broken, and the rule that came out of it

**`fifth_year_option_board()` took 48,547 ms against Supabase's 8 s
`statement_timeout` for `authenticated`.** The page returned `canceling
statement due to statement timeout` and nothing else — 11.7 million buffer hits
for a ten-row page. It was fixed database-side by materialising the season
composite (`edfl_player_season_composite`) and calling status once per row
instead of four times: **48,547 ms → 394 ms, 11.7 M buffers → 8,102**, with
byte-identical output.

**WHY EVERY TEST MISSED IT, and this is the part worth keeping.** All ten checks
were *correctness* checks, run as a privileged role with no statement timeout,
and **none of them called the board.** Correct and shippable are different
questions. `authenticated` is capped at 8 s and `anon` at 3 s, so:

> **Time anything that fans out, as `authenticated`, before shipping it** —
> `explain (analyze, buffers) select …` under `set local role authenticated`.
> A function that is correct under a superuser role is not thereby usable.

This is a chat-side rule (ground rule 2 — no SQL here), but it belongs in this
file because **the app is where the timeout surfaces**: a page that renders a
bare refusal string is indistinguishable from a permissions bug, and the repo
would have been searched first.

**`fyo_09` REPLACED THAT FIX AND DELETED THE OBLIGATION IT CREATED.** On
commissioner ruling, the app has no business recomputing Pro Bowl rosters at
all: a season's result is settled once, after the season ends, and never
changes. `edfl_season_results` is a **published table** (3,228 rows, 2021–2025,
all five published) and `edfl_pro_bowl` is a plain read of it.
**48,547 ms → 394 ms → 50 ms**, board output byte-identical at every step.

**`edfl_player_season_composite` and `refresh_edfl_player_season_composite()`
are GONE. Do not reference either.**

That closed an integrity hole speed alone would have left open: a stat
correction in November could have moved a player's tier — and therefore his
option price — after his owner had already decided. **A published record does
not move.**

**THIS REPO SHIPPED AGAINST THE DELETED FUNCTION** (`f750209`) and it is worth
knowing why, because nothing was misread. `fyo_08`'s handoff created the refresh
obligation; `fyo_09` deleted it about an hour later; the handoff section was not
corrected in between. **A document went stale about itself** — the third time
this project has recorded that failure, after the restructure and rollover
specs. The refusal was correctly non-fatal, so imports kept working; the symptom
was a false refresh-failure warning pointing at a function that will never
exist. Removed in the following commit.

**THERE IS NOTHING TO DO ON THE STATS IMPORT, and no per-import call may be
reintroduced.** Importing stats does not move a published season, by design.
What `app/admin/import-stats/actions.js` calls now is
`edfl_season_results_status(p_season)`, purely to state that: its `message` is
written for verbatim display and `ImportForm` renders it unchanged — **do not
paraphrase it or rebuild the sentence from the counts beside it.**

**That call's failure is QUIET, and that is not the swallowed-error mistake.** A
failed refresh had a real consequence (tiers silently stale) and was reported
loudly. A failed status read has no consequence at all — it is a courtesy note
about a record the import cannot affect. The error is captured rather than
discarded and rendered as a quiet note. Crying wolf over a failed courtesy is
what made the previous version of this block wrong.

**The session client, NOT `adminClient()`** — Class B, granted to
`authenticated`, and **`service_role` is not a member of `authenticated`.** That
role reasoning was right for the refresh call and survives it.

**The one recurring obligation is ANNUAL, not per-import:**
`publish_edfl_season_results(p_season, p_republish)`, commissioner or co, after
the season ends. It logs a `commissioner_actions` row and refuses to overwrite a
published season without `p_republish => true`. **It belongs on an admin control
and in the March 1 rollover checklist beside `advance_league_year()` — never on
the import path.** No such control exists yet; see the open items.

### Sleeper Sync (`/admin/sleeper-sync`, shipped Sep 6 2026)

Finds where the app and Sleeper disagree, lets an officer decide each
disagreement, and applies only what is approved. **The database half was built,
migrated and tested chat-side** — migrations `sync_01_schema_and_rls` through
`sync_05_ghost_only_for_staged_rosters`. **No SQL in this repo and none should be
written for it.**

| File | What |
|---|---|
| `app/admin/sleeper-sync/page.js` | Admin route. `isCommissionerOrCo`, redirect gate |
| `app/admin/sleeper-sync/actions.js` | Six actions, all returning refusals |
| `app/admin/sleeper-sync/SleeperSyncPanel.js` | Client component: review and apply |

**TWO SLEEPER PAGES, TWO DIFFERENT GATES, ON PURPOSE.** `/admin/sync-players` is
**strict commissioner-only** and stays that way — it rewrites the player pool
from Sleeper's full player list. `/admin/sleeper-sync` is **widened to
co-commissioners**, matching `require_commissioner_or_co()` in the database; it
reconciles rosters and writes almost nothing. **Do not merge them, and do not
align their gates.** The home-page link sits inside the `canAdmin` block and
**outside the `isCommish` conditional** — deliberately unlike the Sync Players
link two rows above it.

**`createSupabaseServerClient`, NOT `adminClient()`** — the same trap as the
restructure and fifth-year-option actions, and it bites harder here because the
neighbouring page does the opposite. Every `sleeper_sync_*` function calls
`require_commissioner_or_co()`, which resolves the caller through `auth.uid()`;
the service-role client has no `auth.uid()`, so **every call would be refused
regardless of who is signed in.** `/admin/sync-players` legitimately uses
`adminClient` because it writes `players` directly. **Do not copy that pattern
across the two-file gap.**

**THREE ACTS, NAMED DIFFERENTLY ON PURPOSE.** Pull-and-compare writes nothing to
any league table — it stages the feeds and runs detection. Review records a
decision per conflict or per group. Approve-and-apply is the only act that
changes league state. **They are not the same button and must never become one.**

**PREVIEW RETURNS A `confirm_token` THAT BINDS THE EXACT REVIEWED STATE**, and
apply refuses if anything moved since. The panel drops its held preview to `null`
on every resolution, so a token can never outlive the review it describes.

**REFUSALS ARE MATCHED ON `error.code`, NEVER ON MESSAGE TEXT** — `EDFS1`
blocking conflicts unresolved, `EDFS2` the league moved since the run opened,
`EDFS3` the conflict set changed since the preview. Each maps to its own hint
sentence. **This is the `EDFL1` rule from trade reversal, applied a second time**:
matching on wording breaks the moment a sentence is reworded. A new forceable or
distinguishable condition needs its own SQLSTATE, not a string match.

**NO RULE IS MIRRORED CLIENT-SIDE.** Which conflicts block, what may be written,
and whether an approval is still valid are all the database's call. `armed` comes
from `edfl_sync_enforcement_armed()` and is **rendered as a sentence, never used
to gate a control** — the panel offers the choices and prints the refusal.

**THE CHOICE LABEL BECOMES THE LOGGED NOTE.** Every resolution records the wording
of the button that was pressed, so the Commissioner Action Log reads as a sentence
rather than a code. There is deliberately **no free-text box** — a note nobody
fills in is worse than one that always says what was decided. `TYPE_GUIDE` is
therefore not just copy: **editing a label rewrites what future log entries say.**
An unrecognised `conflict_type` falls through to a generic three-choice guide
rather than being dropped — the same principle as `tierRows`.

**No money formatter, and that is by design.** Nothing on the page is a cap or
cash figure. A taxi decision has a cap consequence, but that is computed when the
roster move is actually made, not here.

**THE CONFLICT TABLE IS A `.ledger`, NOT A `.grid-table`, AND THAT WAS A REAL
BUG** (fixed Sep 6 2026 after the first deploy). `.grid-table` is the **numeric**
primitive — right-aligned, `tabular-nums`, `white-space: nowrap` headers — and its
seven other consumers are all cap or cash figures (`ContractTab` ×4, `EarningsTab`,
`MarketValueTab`, `TeamCapSheet`). This table holds sentences and up to three
choice buttons per row. Measured in the shipped version: the taxi group wanted
**1,334px inside a 1,002px box — a 332px sideways scroll** on a full desktop.
`.ledger` is what every other admin panel uses, it is left-aligned, and it brings
the card-flip. **Do not move this table back**, and do not reach for `.grid-table`
for anything that is not a column of numbers.

**`.sync-choices` stacks the per-row buttons vertically, and that is what actually
fixes the width** — a cell's natural width becomes the widest *single* button
instead of the sum of three. Each `.btn` is an `inline-flex` that sizes to its whole
label on one line, so three side by side is ~900px of one cell.

**EVERY MODIFIER BUTTON ON THIS PAGE WAS MISSING THE BASE `.btn` CLASS.** The repo
idiom is `"btn btn-quiet"` (25 uses) / `"btn btn-danger"` (9); `.btn` carries the
border, the `min-height: var(--tap)` touch target, the radius and the uppercase,
while the modifiers only recolour. This page shipped with the six bare
`"btn-quiet"` / `"btn-secondary"` / `"btn-danger"` in the whole repo, so its buttons
rendered as unstyled browser defaults at a **38px** tap target — and
**"Throw this comparison away" had no red outline at all**, because `.btn-danger`
sets `border-color` and never got a `border-width` to hang it on. Fixed; the repo is
back to zero bare modifiers. **If you add a button here, write `btn` first.**

**THIS TABLE FLIPS TO CARDS AT 760px, NOT AT `.ledger`'s 640px, DELIBERATELY.**
Between 641 and 760 it is still three columns, and the choice column will not
compress below ~240px because that is its longest word — measured, it needed ~615px
of a 602px box at a 700px viewport, which no column cap can fix. So it flips before
it gets there. Below 640 the `.ledger` rules say the same thing and the two simply
agree.

**`display: block` is repeated on `.sync-table tbody td` and the repetition is
load-bearing.** `.ledger tbody td` sets `display: flex` for its own two-up card
layout at specificity (0,1,2); the group selector `.sync-table td` is (0,1,1) and
loses to it. Without the explicit repeat the label sits *beside* a wrapped sentence
instead of above it, and the row overflows again. **Do not tidy it into the group
selector.**

**Verified by measurement, not by eye** — `scrollWidth − clientWidth` at 1440, 1280,
1100, 1024, 900, 820, 800, 761, 700, 660 and 375: zero at every one. That was done
against a static harness carrying the real `globals.css`, since the page itself is
officer-gated and there is no Node here (ground rule 5). **The harness is not
checked in.** Fonts fall back in it, so widths are close but not identical to
production — treat the zeros as sound and the *typography* as unverified.

**THE "LAST THING THE APP DID" COLUMN IS A SNAPSHOT, NOT A LIVE LOOKUP**
(`sync_06_last_app_action`, Sep 6 2026). `sleeper_sync_conflicts.last_action` /
`last_action_at` are filled by a BEFORE INSERT trigger reading
**`player_transaction_feed`** — the same view the player card uses, so there is no
second feed vocabulary to keep in step with the first. It is deliberately frozen at
detection time: it is what the officer saw when he decided, and it travels into the
`commissioner_actions` snapshot with the rest of the run. **Do not "improve" it into
a live read** — that would change what the log records after the fact.

**The column is conditional per group, and the empty state inside it is a separate
case.** `showLastAction` is `g.rows.some(r => r.last_action)`, so a group where no
row has one drops the column entirely rather than printing a dash down it — team
mapping and team-name rows have no player, so they have no action. Within a group
that *does* show the column, an individual row lacking one reads "Nothing on
record". **Those are two different answers and the UI keeps them different**, the
same principle as the three undecided states on the option board.

**`formatShortDateTime` from `lib/formatDate.js`, never local formatting.** This is
a **client component**, so a bare `toLocaleString()` would render in the viewer's
own zone — the exact bug that module's header documents, where one instant showed
four hours apart depending on which page drew it. `formatShortDateTime` pins
`America/New_York` by IANA name (handling the EDT/EST switch on its own) and returns
an em dash for a null or unparseable timestamp, so a missing value cannot surface as
"Invalid Date". Verified in the file, not taken from the handoff.

**The league id is read from `league_config.sleeper_league_id`, never hardcoded**,
and the conflict read is filtered by `run_id` — bounded by rostered players, under
300 today, so the 1,000-row PostgREST ceiling cannot bite.

**Three `throw new Error` in `actions.js` are NOT ground-rule-9 violations** — see
the note under the conversion table. They are in non-exported helpers, caught in
`pullAndCompare`.

**Not verified — ground rule 5 applies, plus two the handoff flagged itself:**
nothing has run in a browser; and **`supabase.rpc()` passing a JS array as a
`jsonb` argument (`p_feeds`, `p_payload`) has never been exercised through the
client library.** If `sleeper_sync_stage` refuses the payload, that is the first
thing to check. The Sleeper fetch also has **no timeout** — a hung request hangs
the action.

### The League Transaction Log (`/transactions`, shipped Sep 6 2026)

Every roster move in the league, for every logged-in member. **340 rows today
across 9 kinds.** The database half was built, migrated and tested chat-side —
`txnlog_01_league_transaction_log`, `txnlog_02_reader`,
`txnlog_03_date_filters_are_eastern_dates`. **No SQL in this repo and none should
be written for it.**

| File | What |
|---|---|
| `app/transactions/page.js` | League route. **Login only — no commissioner check** |
| `app/transactions/actions.js` | Three actions, all returning refusals. **Zero throws** |
| `app/transactions/TransactionLog.js` | Client component: filters, sort, cursor paging |

**A LEAGUE SURFACE, and the purest one in the app** — the standing rule needs no
applying here, because there is no elevated control to move. Every owner sees the
same rows in the same order and there is no per-viewer branch anywhere on the page.
**Do not add an officer-only column, filter or action to it.** If one is ever
wanted, it belongs in the Admin section, like every other elevated ability.

**IT REUSES `player_transaction_feed` RATHER THAN ASSEMBLING A SECOND FEED.** That
view is already the player card's data layer and Sleeper Sync's "last thing the app
did" column, and it carries all the wording. A parallel query would have been a
third vocabulary to keep in step with the first two. **Do not build one.**

**THE LEAK CHECK PASSED IN THE VIEW DEFINITION, NOT IN RLS, AND THAT IS WHY THIS
IS SAFE TO READ LEAGUE-WIDE.** A log of everything could have exposed trade
proposals, which are parties-only under the September 3 ruling. It cannot: the
feed's trade branch joins `trades` with `status = 'executed'` **in its own SQL**,
so an unexecuted trade has no row to leak. That was verified by reading the view
source before anything was built on top of it. **If that join is ever loosened,
this page becomes a disclosure bug** — it is the thing holding the door shut.

**EXCLUDING BIDS IS WHAT MAKES THE LOG IDENTICAL FOR EVERY VIEWER, AND THAT IS A
DESIGN REQUIREMENT, NOT A SPACE SAVING.** `bid_withdrawn` is visible only to the
team that withdrew, so the feed as a whole is **not** the same for everyone.
Dropping every bid kind removes the feed's only per-viewer branch — which is what
lets one cached answer serve the league and a bot. The stated reason is also true
(319 bid rows against 340 roster moves would drown the page), but **the
per-viewer point is the load-bearing one.** Losing bids stay on tier results and
the player card, where they are already published.

**ROSTER KINDS ARE MATCHED BY PREFIX (`roster\_%`), NEVER ENUMERATED**, because the
feed builds them as `'roster_' || to_status`. Listing them would silently drop every
row of any roster status added later, and **`suspended` is a queued feature that
would have hit exactly that.** `league_transaction_log_unmapped_kinds()` returns any
feed kind that is neither included nor deliberately excluded and **should always
return zero rows** — check it after any change to the feed's vocabulary. This is the
`FEED_TONES` reconciliation rule in a different shape: two lists that must agree,
with a function that says when they don't.

**FILTERING AND SORTING HAPPEN IN THE DATABASE, NEVER IN THE CLIENT.** Every
control becomes an argument to `league_transactions()`. Filtering the loaded page in
JavaScript would silently mean *"filter the 100 rows I happen to have"* — a
different answer that **looks identical on screen**, which is what makes it
dangerous rather than merely wrong.

**PAGING IS BY CURSOR, NOT OFFSET, AND THE CURSOR IS COMPOSITE.** 130 rookie
signings share one timestamp **to the microsecond**, so an offset boundary landing
inside that block repeats or skips rows, and a cursor on `occurred_at` alone would
replay 129 of them. The cursor is `(occurred_at, log_id)`; `log_id` is a stable
composite (`source:uuid`) and is unique across the log. Tested by walking all 340
rows straight through that block with no repeats and no skips. **Never cursor on
the timestamp alone.**

**Load more appears only for the time sorts.** The database refuses a cursor with a
name sort rather than pretending it means something, so the button is not offered
there — `canPage` in the client mirrors that, and the two must stay in step.

**DATE FILTERS ARE BARE CALENDAR DATES PASSED STRAIGHT THROUGH.**
`league_transactions()` takes `date` and resolves it in Eastern. **The first draft
did this arithmetic in JavaScript and was wrong** — the browser's zone on the
client, UTC on the server, which is the exact bug `lib/formatDate.js` exists to
document. The test case is the Charbonnet release: **August 13 Eastern, August 14
UTC.** Filtering "to August 13" must include it. The "to" date is inclusive of the
whole day named. **Do not move any part of this back into JS.**

**`createSupabaseServerClient`, NOT the shared anon client** — the same trap as the
restructure, fifth-year-option and Sleeper Sync actions. `league_transactions()` has
no `anon` grant, so an anon read is **refused** rather than quietly returning an
empty list.

**The kind list is read from the database** (`league_transaction_kinds()`), so a
kind added to the log later appears in the filter control with no app change.
`KIND_LABELS` supplies friendlier wording only, and an unmapped kind **falls through
to its own raw string with underscores replaced by spaces** — the same principle as
`tierRows`, and the reason a new kind cannot silently vanish from the filter.

**The handoff described that fallback as "the database's own label" and it is not.**
`kindLabel()` is `KIND_LABELS[kind] || kind.replace(/_/g, ' ')`, and the RPC's rows
are read only for `k.kind` and `k.rows` — **no label column is consumed even if one
is returned.** So an unmapped kind renders as `roster suspended`, not as whatever
the database would call it. Harmless today and arguably the better default, since it
cannot drift from the real kind string; recorded because the two statements would
send someone looking for a label pipeline that does not exist. **If you want the
database's wording, that is a change, not a repair.**

**No new CSS**, and no money formatter — nothing on the page is a cap or cash
figure.

**THE BOT CONTRACT IS PART OF THE DESIGN, NOT A FUTURE CONCERN.** The reader is
shaped so a Discord bot polling `p_sort => 'oldest'` with both cursor values can
walk everything since last time without a breaking change later. **Store both
cursor values from the last row of each page**; repeat until a page comes back
short. **Still open, and it is a decision rather than a gap:** execute is granted to
`authenticated` and to nobody else, so a bot needs its own Supabase user or a
service-role key held server-side. It is **deliberately not open to `anon`** — do
not "fix" a bot's auth problem by widening that grant.

**PERFORMANCE — THE NUMBER TO WATCH IS THE BUFFER COUNT, NOT THE CLOCK.** Timed as
`authenticated` per the `fyo_08` rule: 137 ms unfiltered, 74 ms filtered to one
player and kind. Comfortable. But **20,717 shared buffer hits to return 340 rows**
means the whole underlying feed is materialised on every call — including the 319
bid rows this log filters out, and `player_transaction_feed`'s per-contract
`total_cash` / `total_cap` subqueries over `contract_year_computed`. **That cost
grows with every transaction and every contract, not with the page size**, and no
filter reduces it much because the filtering happens after the union. If this page
ever feels slow, the fix is pushing the kind filter down into the feed or
materialising the log — **not adding an index.**

### The Owner Info directory (shipped Sep 6 2026)

A directory of all ten owners — name, contact handles, a live clock in each
owner's own zone, and a coarse last-active band — **mounted on two surfaces**: a
third tab on `/team/[teamId]` for any signed-in owner, and an Owner Directory
section on `/admin/owner-activity` for an officer. **The database half was built,
migrated and tested chat-side** — migrations `owner_profiles_01` through
`owner_profiles_08`. **No SQL in this repo and none should be written for it.**

| File | What |
|---|---|
| `components/OwnerInfoPanel.js` | **new.** The cards, the clock, the scoped CSS, the `editScope` decision |
| `components/OwnerInfoDialog.js` | **new.** The edit form |
| `components/ownerInfoActions.js` | **new.** Three actions, all returning refusals. **Zero throws** |
| `app/team/[teamId]/page.js` | **replaced.** Three additions: the session-client import, the `owner_directory()` read, three props |
| `app/team/[teamId]/TeamCapSheet.js` | **replaced.** Four additions: the import, the props, the tab button, the panel at the **default** scope |
| `app/admin/owner-activity/page.js` | **replaced.** Two imports, the directory read, one rewritten comment, the Owner Directory section at `editScope="all"` |

**Delivered chat-side as a verified file set** — six files, all SHA-256 checked
against the manifest before install, and all three replaced files diffed against
`885dce3` to confirm only the claimed hunks moved. **Not compiled** (ground rule
5); the Player Card is still the only batch that reached main pre-compiled.

**A FIRST VERSION OF THIS FEATURE EXISTS AND WAS NEVER PUSHED.** It put the three
new files under `app/team/[teamId]/` (including an `ownerActions.js`) and drew
"Edit as officer" on the team page. It was superseded before it left a local
clone. **If you find `EDFL_OwnerInfo_Sep6.zip` or an
`app/team/[teamId]/ownerActions.js` anywhere, both are the dead v1** — the live
layout is the table above.

**`editScope` DEFAULTS TO `'self'` AND THAT DEFAULT IS THE SAFETY PROPERTY.** It is
the only difference between the two mounts. `/team/[teamId]` passes nothing;
`/admin/owner-activity` passes `'all'`. A future mount that forgets the prop gets
self-edit only, never officer editing by accident. **Do not change the default, and
do not pass `'all'` anywhere else.**

**THAT NARROWING IS A DRAWING DECISION, NOT A GATE, AND THE DIFFERENCE MATTERS.**
`save_owner_profile()` permits an officer to edit any card from anywhere and will
keep permitting it — which is correct, because the Admin surface needs it. The
client narrowing is what keeps the capability in **one** place; it is not what
makes it safe. The database check is the gate, exactly as with `cut_player`.

**THE ACTIONS LIVE IN `components/`, NOT BESIDE A ROUTE, AND THIS IS A DELIBERATE
DEPARTURE FROM THE COLOCATION IDIOM.** Every other feature in this repo colocates
`actions.js` beside the page that calls it — the fifth-year-option section says so
in capitals. Here **two surfaces mount the same component**, so beside-which-route
has no answer, and two copies would be two places to keep in step with
`save_owner_profile()` and its twenty arguments. A `'use server'` module is a plain
module and can live anywhere. **This is the same shape as `lib/restructureRoster.js`**
serving `/restructure` and `/admin/restructure`: one implementation, no
authorisation inside it, two callers who decide who may ask.

**Consequence for counting: `components/ownerInfoActions.js` IS the first
`'use server'` file outside `app/`.** A glob that only walks `app/` will miss it and
the conversion arithmetic will be silently wrong. Count `app lib components`.

**`app/team/[teamId]/page.js` USES `createSupabaseServerClient()` FOR THIS ONE READ
AND THE ANON CLIENT FOR EVERY OTHER READ ON THE PAGE.** That mixture is deliberate
and will read as an inconsistency. Everything else there is public under RLS;
`owner_directory()` resolves the caller through `auth.uid()`, so through the anon
client it would fail **on every request, for everyone**. Same trap as the
restructure, fifth-year-option, Sleeper Sync and transaction-log actions — the
fifth time. **Do not unify the two clients on that page.** The read is skipped
entirely when `me` is falsy, and its error is **captured, not discarded** — the same
lesson as `yearRows` two hunks above it.

**EVERY MASKING DECISION IS THE DATABASE'S. NO VISIBILITY LOGIC MAY ENTER THE
CLIENT.** `owner_directory()` returns NULL for a field this viewer may not see and
names that field in `hidden_fields`. A client copy of the toggle rules would be a
second place to keep in step, and it would be the copy that leaks.

**`hidden_fields` IS WHAT KEEPS "hidden by owner" AND "not set" APART**, and that is
the whole point. Both are NULL on the wire. Without the array an owner chasing a
trade cannot tell whether asking is worth it. **Three states, kept three** — the same
principle as the option board's three undecided states and Sleeper Sync's
absent-column-versus-empty-cell split. If a masked field and an empty one ever read
identically, **the array is not arriving**; that is the first thing to check, not a
wording bug.

**`save_owner_profile()` REPLACES THE ROW, IT DOES NOT PATCH IT.** The dialog holds
and resends **all twenty fields including the seven toggles**, every time, which is
why it loads the raw row first and never opens on an empty state. A partial payload
silently blanks whatever it omits. **If you refactor the form, keep that.** The
replace-shaped write is itself deliberate — a patch gives an owner no way to blank a
field he filled in by mistake.

**THE CLOCK'S FIRST PAINT COMES FROM THE SERVER AND THE BROWSER ONLY TAKES OVER
AFTER MOUNT.** `local_time_now` is what both the server render and the first client
render use; computing the initial value client-side is a hydration mismatch and
React discards the subtree. After mount the time is formatted from the **IANA zone
name, never from `utc_offset_minutes`** — the offset is a snapshot and would be an
hour wrong from the first Sunday in November. The offset survives only for the
"3 hours behind you" phrase, where being briefly stale is harmless. Same reasoning
as `lib/formatDate.js`.

**`login_email` is never exposed by a toggle** and has none. It is the credential
half of the login, not a way to reach somebody; it renders on your own card and to
the officers, labelled as the account address. **Do not give it a visibility
switch.**

**The last-active band is a band, never a time**, for everyone but yourself and the
officers — the same restraint as the bid list's *rough interest level*.
`over_a_week` takes **amber (`status-live`), not red**: a quiet owner is a fact, not
a fault. `status-bad` is reserved for "never signed in", the one that actually needs
somebody to do something.

**THE CSS IS SCOPED INSIDE `OwnerInfoPanel.js` AND `app/globals.css` IS UNTOUCHED.**
Every class is `oi-` prefixed (verified: zero `oi-` occurrences in globals.css) and
every colour is an existing custom property, so both themes follow the app with no
second palette. This is a **deliberate departure** from the append-a-block idiom the
Calendar, trade and Sleeper Sync features follow — a self-contained feature was not
worth a diff across a 34 KB shared file. **If this styling is ever wanted elsewhere,
move it into globals.css then, not before.** All eleven custom properties it reaches
for were confirmed present before install, as was `.section-heading` on the admin
page.

**Every button carries the base `.btn`** (`btn btn-quiet`, `btn`) — the repo is still
at zero bare modifiers after the Sleeper Sync repair. `.oi-copy` is not an exception:
it is a distinct primitive with its own border and sizing, not a `.btn` modifier used
bare.

### The app bar (shipped Sep 7 2026)

One sticky strip across the top of **every** page, mounted once in
`app/layout.js`. Home and the theme toggle on the left; who you are, and a Sign
Out button, on the right. **Nothing in this batch touches the database** — no
SQL, no migration, no schema change.

| File | What |
|---|---|
| `components/AppBar.js` | **new.** The bar. An async Server Component |
| `components/SignOutButton.js` | **new.** The app's first logout |
| `app/layout.js` | **changed.** The fixed top-right dock is gone; `<AppBar />` replaces it |
| `app/calendar/page.js` | **changed.** Gains the inline `← Home` its siblings already carry |
| `app/player/[playerId]/PlayerCard.js` | **changed.** Gains `← Return to Cap Sheet` above the name |
| `app/player/[playerId]/page.js` | **changed.** Player Not Found gains a Cap Sheet link. One line |

**THE APP HAD NO LOGOUT AT ALL BEFORE THIS.** Owners share screens and borrow
browsers and the session cookie is long-lived, so "log in as somebody else"
meant clearing site data.

**SIGN OUT WORKS ONLY BECAUSE `lib/supabaseClient.js` IS `createBrowserClient`
FROM `@supabase/ssr`, AND THAT WAS VERIFIED IN THE FILE, NOT ASSUMED.** That
client owns the same auth cookie `createSupabaseServerClient()` reads, so
`signOut()` clears the thing the app bar's server-side `getUser()` looks at. A
`signOut()` through any other client would clear a session the server never
sees, and the corner would go on naming a team nobody is signed in as. **If the
browser client is ever swapped for a plain `createClient`, this button silently
stops working** — and it fails in the most misleading possible way, by appearing
to succeed.

**`router.refresh()` THEN `router.push('/')`, IN THAT ORDER**, mirroring
`app/login/page.js` on the way in (its lines 136–137 do the same). Refresh first
so the Server Components — the bar among them — re-render against the now-empty
cookie; push second so an owner who was standing on a gated page lands somewhere
public instead of watching that page's own redirect bounce them to `/login`. The
`catch` around `signOut()` is not decoration: a failed round trip must not strand
the button on "Signing out" with a cleared local session and no way forward.

**STICKY, NOT FIXED, AND THAT IS THE POINT OF THE REWRITE.** The old dock was
`position: fixed` at 12px from the top and overlaid the page — on a scrolled page
it sat on the eyebrow line. Sticky keeps the bar in the document flow so it takes
its own height and covers nothing. **Do not convert it back to fixed** to reclaim
the space.

**NO `globals.css` CHANGE, AND THE FILE IS BYTE-IDENTICAL AFTER THIS BATCH.** The
Home, Login and Sign Out controls reuse the existing **`.theme-toggle`** class, so
they inherit its border, mono type, uppercase and hover and line up with the
toggle because they *are* the toggle's styling. Everything else is inline style
over the theme's own custom properties (`--bg`, `--border`, `--text-dim`,
`--accent`, and `--font-mono`, which comes from `next/font` on `<html>` and is
used the same way five times in globals.css). **`.theme-toggle` therefore has
three new consumers that are not toggles** — that is deliberate reuse, not drift.

**THE RIGHT SIDE HAS THREE STATES AND THE THIRD IS THE INTERESTING ONE.** Signed
out: a single LOGIN button. Signed in with a `team_owners` row: "You are logged in
as <team>", the team name linking to `/team/[teamId]`, plus Sign Out. **Signed in
with NO `team_owners` row: the email address and Sign Out — never a LOGIN button**,
which would send that owner round the same loop again (commissioner ruling, Sep 7).
Telling the second and third apart is why the bar calls `auth.getUser()` itself
rather than `getCurrentTeamOwner()`, which returns null for both. **All ten owners
are linked today, so the third branch has never been produced by real data.**

**THE BAR IS NOT A GATE AND MUST NEVER BECOME ONE.** It draws what it draws; every
page keeps its own `getCurrentTeamOwner()` redirect and every Server Action keeps
its own re-check. Hiding or showing a badge is not access control — the same
principle as the September 4 admin-link work on `app/page.js`.

**THE LOGIN BUTTON CARRIES NO `?next=`, AND THAT IS A LIMITATION, NOT AN
OVERSIGHT.** A root layout cannot read the pathname on the server, so signing in
from the bar lands on `/` via `safeNext`'s default. The `?next=` path from a gated
page's *own* redirect is untouched and still works. Do not try to fix this by
making the layout a client component.

**THE HOME LINK LIVES IN THE LAYOUT, NOT IN TEN PAGE FILES.** Ten routes had no way
back to the index in the page body — `/calendar`, `/admin/fix-contracts`,
`/admin/import-stats`, `/admin/sync-players`, `/admin/tier-results/[tierId]`, both
`/bids/[tierId]/…` pages, `/trades/[tradeId]`, `/trades/new`, and the Player Card.
One component answers all ten **and every route added after this one**, which
editing ten files would not.

**THE TWENTY-FOUR EXISTING INLINE `← Home` LINKS STAY.** They sit in each page's own
action row beside page-specific links (`← Auction`, `Cap Sheet`), and removing them
would mean editing twenty-four files to delete something nobody complained about.
**A second way home is not a defect.** `/calendar` gained one so it matches its
siblings.

**`← Return to Cap Sheet` ON THE PLAYER CARD IS NOT A BACK BUTTON.** `PlayerLink`
opens the card with `target="_blank"` (August 27 ruling — the card is a reference
document and a reader should not lose their place), so from a cap sheet row the cap
sheet is still sitting in the tab they came from. The link exists for the *other*
arrivals: a pasted URL, a bookmark, a link followed from another card, a phone's
history. Those had no way out except the identity line's team link.

**EVERY ROUTE NOW COSTS ONE `auth.getUser()` PLUS A `team_owners` LOOKUP PER
RENDER**, public pages included, and a `teams` read when the owner has a team. That
is stated plainly rather than buried: `middleware.js` already calls
`auth.getUser()` on every matched request to refresh the session, so this is a
second auth call per page, not the first. Every route was already dynamic
(`revalidate = 0` in the layout), so **nothing became dynamic that was not**. If a
build ever reports something new about static generation, that is the thing to
look at.

**Not compiled and not seen running** (ground rule 5) — there is no Node runtime
and no `node_modules` in this environment, so the batch's own instruction to run
`npm run build` could not be carried out. The Vercel deploy is the only check.

### Scoreboard and Standings (shipped Sep 7 2026)

Two public routes plus two home-page links. **The database half was built,
migrated and tested chat-side** — `waivers_01_team_week_scores` and
`waivers_02_scoreboard_standings_priority`. **No SQL in this repo and none should
be written for it.**

| File | What |
|---|---|
| `app/scoreboard/page.js` | **new.** Public route. Reads `league_weeks` + `league_scoreboard` as anon |
| `app/scoreboard/Scoreboard.js` | **new.** Week tabs, matchup cards, the refresh control |
| `app/scoreboard/actions.js` | **new.** One action, returns refusals. **Zero escaping throws** |
| `app/standings/page.js` | **new.** Public route, server-rendered table, no client component |
| `app/page.js` | **changed.** Two `<a className="btn">` after League Calendar. Nothing else moved |

**No CSS was added and `globals.css` is byte-identical** — the third batch running
to that pattern. Everything reuses existing classes; the card grid and the matchup
rows are inline style over `--border`, `--bg-elevated`, `--text-dim` and `--text`,
so both themes follow. All nineteen classes and four tokens were confirmed present
before install.

**A 0.00–0.00 PAIRING IS AN UNPLAYED WEEK, NOT A TIE.** `has_scores` comes from the
view and is the only thing that decides whether a card shows a result. **Every week
of a season exists in `league_weeks` from the day the calendar is loaded**, so
anything that ignores that flag renders the entire preseason as ten drawn games.
The card reads "Not played", the score reads `--`, and `Side` dims the number.

**THE WEEK TABS COME FROM `league_weeks`, NEVER FROM A COUNT OF FOURTEEN.** Week 12
of 2026 begins on a **Wednesday** (Thanksgiving), and weeks 13 and 14 are still
`is_provisional`. A tab strip built by assuming fourteen Thursdays is wrong twice.
This is also the same table the dead-money engine charges against, so the
scoreboard and the salary clock cannot disagree about when a week is.

**THE REFRESH BUTTON IS NOT OFFICER-GATED, AND THAT IS DELIBERATE.**
`edfl_sync_week_scores()` admits any signed-in team owner. The function only
mirrors Sleeper, Sleeper's number *is* the official points for, so there is nothing
to adjudicate and no advantage to whoever presses it. Commissioner-only would have
meant the waiver priority order going stale whenever he was away on a Tuesday.
**Do not add an `isCommissionerOrCo` check.** This is the one control in the app
that is signed-in-but-not-officer, and it will read as an omission.

**THE DATABASE NEVER MAKES AN OUTBOUND CALL.** Sleeper is fetched in the Server
Action and the array is handed to the RPC as `jsonb`, exactly as
`/admin/sleeper-sync` does it. **Never `pg_cron`, and never a fetch from inside
Postgres.**

**`createSupabaseServerClient`, NOT `adminClient()`** — the RPC has no anon grant
and resolves its caller through `auth.uid()`, so a service-role call is refused no
matter who is signed in. The **sixth** instance of this trap, after restructure,
fifth-year-option, Sleeper Sync, the transaction log and the owner directory.

**`unmatched_rosters` MUST STAY VISIBLE.** A Sleeper roster with no matching
`teams.sleeper_roster_id` is silently absent from every score, which reads as a
quiet week rather than a broken mapping. The refresh notice names it; so does a
`corrections` count, which points at the action log. **Do not tidy either out of
the notice.**

**STANDINGS RANK ON OVERALL RECORD, THEN POINTS FOR** (commissioner ruling, Sep 7).
The league carries two Sleeper divisions and **they are a label here** —
`division_rank` exists in the view and is deliberately not what orders the page.
**If divisions are ever given seeding weight, that changes in the view, not in the
component.**

**POINTS AGAINST IS DERIVED, NOT MIRRORED.** Sleeper's rosters feed reports `fpts`
and has **no `fpts_against` at all**, so the view pairs each team with its opponent
through `matchup_id`. That derivation is also what makes the points-against
tiebreak in the waiver priority order possible. The page says so in a footnote
rather than leaving a reader to assume Sleeper supplied it.

**`PPG` reads `--` before a game is played, never `0.00`** — the same
dash-not-zero rule the restructure dead-cap table follows. "No games yet" and "zero
points per game" are opposite claims.

**No money appears on either page**, so no formatter is imported and
`formatExactMoney` does not apply. **Do not introduce one.**

**THE TWO TIMESTAMPS ARE FORMATTED IN THE COMPONENT, NOT VIA
`lib/formatDate.js`.** `Scoreboard.js` hand-rolls `toLocaleDateString` and
`toLocaleString`, both with `timeZone: 'America/New_York'` pinned explicitly, so
they are **behaviourally correct** and cannot drift by viewer. But
`formatShortDateTime` exists for exactly this and the Sleeper Sync section says to
use it. Seven other files already hand-roll it, so this is pre-existing drift
rather than new, and it is recorded here so nobody reads the pinned zone as an
accident. If `formatDate.js` is ever adopted across these, this is one of the call
sites.

**`league_weeks` WAS UNDOCUMENTED ON BOTH SIDES WHEN THIS SHIPPED, AND THIS BATCH IS
ITS FIRST CONSUMER.** Nothing in the repo had ever read that table before that day, and
`EDFL_Database_Reference_for_ClaudeCode_v1.1.md` (August 28) did not mention it,
`charge_at`, `is_provisional`, or any of the new scoreboard objects. **v1.4 (September
8) catalogues it** — 14 rows, one per (season_year, week_number 1–14), `charge_at` at
00:01 Eastern on the day of that week's first game — and every `waivers_*` object with
it, so the database half of this warning is closed; the column list is in its §5. The handoff
published the live signatures for `league_scoreboard`, `league_standings` and the
RPC — but **not for `league_weeks`**, whose `charge_at` and `is_provisional` the
week tabs and the landing-week calculation both depend on. **If those column names
are wrong the page does not crash — it renders "Couldn't load the scoreboard", or
the empty-calendar note, either of which reads like missing data rather than a
wrong query.** That is the first thing to check if the page comes up bare, and the
reference needs re-cutting regardless (ground rule 2).

**Not compiled** (ground rule 5) — no Node runtime and no `node_modules` here, so
the batch's own instruction to run `next build` could not be carried out.

### In-season free agency (`/free-agency`, shipped Sep 7 2026)

One route, one home-page link, and **eighteen migrations built, applied and tested
chat-side** — `proration_01` … `proration_07`, `cap_ceiling_transfer_bypass_and_by_season`,
`taxi_slot_limits_trigger`, `waivers_01`/`waivers_02` (the scoreboard batch above), and
`freeagency_01` … `freeagency_07`. **No SQL in this repo and none should be written for
it.** The database owns every rule; this page owns none of them.

| File | What |
|---|---|
| `app/free-agency/page.js` | **new.** Server component. Login-gated, reads the calendar, decides open/closed |
| `app/free-agency/FreeAgencyBoard.js` | **new.** Board, offer form, commissioner Preview/Resolve panel |
| `app/free-agency/actions.js` | **new.** Six actions, all returning refusals. **Zero escaping throws** |
| `app/page.js` | **changed.** One `teamOwner`-gated `<a className="btn">` after Blind Bid Auction |

**No CSS was added and `globals.css` is byte-identical** — the fourth batch running to
that pattern.

**AN OFFER IS SEALED AND RLS IS WHAT SEALS IT.** While a window is live nobody sees any
offer's terms or who made them — **including the commissioner** (FA-3, and SR-31 forbids a
commissioner read on a sealed group). The policy on `free_agent_offers` is "own team or
resolved", so an owner reading the table straight through PostgREST sees exactly what the
page shows and nothing more. **The board shows a contested flag and never a count**: in a
ten-team league a count leaks who is in. **Do not add one, and do not add a
commissioner-only peek.**

**THERE IS ONE AWARD ENGINE AND BOTH PATHS RUN IT.** `edfl_fa_award_window(window, actor,
source)` holds the cash gate, the practice-squad slot gate, the ceiling bypass and the
contract write. `resolve_fa_window()` is now the officer test, the clock test, and a call
to it; the first-offer path calls it with the window already closed. **It is revoked from
`public`, `anon` AND `authenticated`** — it authorises nothing itself and trusts its
caller, so it must stay unreachable from the API. **Never grant it, and never write a
second copy of those gates.**

**THE CEILING DOES NOT GATE AN AWARD (M-1), AND THE FLAG THAT SAYS SO MUST OUTLIVE THE
INSERT.** `enforce_cap_ceiling` on `contract_years` is **DEFERRABLE INITIALLY DEFERRED** —
it runs at COMMIT, not at the insert. The first version of `resolve_fa_window` set
`edfl.award_in_progress` and cleared it immediately after the insert, so by commit time the
flag was off and **every over-ceiling award would have been refused**, which is exactly what
M-1 forbids. It is now set once and never cleared, the same shape `execute_trade()` has
always used. **Do not "tidy up" by resetting it.** The bug was found only because a control
that should have been trivially true failed; a positive test alone would have passed.

**A DEFERRED TRIGGER DOES NOT FIRE IN A ROLLED-BACK TEST WITHOUT `set constraints all
immediate`.** The first run of that same test passed both the positive and its control for
the wrong reason. Any chat-side test touching `contract_years` needs that line.

**5.14(b) — THE FIRST-OFFER EXEMPTION IS A CALENDAR ROW, NOT A CONSTANT.** Until the
`5.14(b)` instant (00:00 ET, Sep 14 2026), an offer on a player who has **never held an
EDFL contract** wins him outright: `submit_fa_offer` opens the window and settles it in the
same transaction. Moving that date is an UPDATE to one row. The same pattern carries
`5.14(a)`, the startup mitigation that opened the market early on Sep 7. **"Never held a
contract" means no row in `contracts`, any status, any season** — `edfl_season_results`
holds 2021–2025 scoring with no team attribution and cannot answer the question.

Three consequences that will otherwise read as bugs:

- **"First *valid* offer", not "first offer."** If the offer fails owner cash or a
  practice-squad slot the window goes **void**, the player stays free, and the next offer
  becomes the first valid one. The owner is told which gate stopped him.
- **The engine ranks by the clock on this path and by PPV on the resolve path.** That is
  the ruling, not an oversight.
- **A live window suppresses the exemption.** Honouring it inside a running contest would
  hand the player to a late offer ahead of the owner who opened the window.

**FA-11 PRO-RATION LIVES IN `contract_year_computed`, NEVER IN THE ROW.** An in-season
signing writes the **full** season salary and the view multiplies by
`edfl_signing_fraction(first_season_week)`. Writing the discounted figure instead would let
the minimum-salary trigger and the 30% Rule test a number nobody agreed to. **`ppv`, the
signing bonus, later seasons and `dead_cap_if_cut` are deliberately untouched by the
fraction.**

**TWO MECHANISMS PUT MONEY ON A MID-SEASON CONTRACT AND THEY MUST NOT MEET (M-2).** A
waiver claim writes a **reduced** year 1 through `compute_trade_charges()`; free agency
writes a **full** year 1 and pro-rates in the view. `first_season_week` must stay **NULL**
on a transferred contract or the discount applies twice — `check_first_season_week_rules()`
enforces that.

**THE TABLES ARE `.ledger` AND THE FIRST VERSION GOT THIS WRONG.** Both shipped as
`.grid-table` because the class was confirmed present in `globals.css` and this file was
never consulted about which primitive the table wanted. The Theme section says it twice:
`.grid-table` is for numbers, `.ledger` is for rows a human reads, and the Sleeper Sync
table scrolled sideways by 332px learning it. These hold player names, team names, a status
phrase and up to two buttons per row — the same shape. **Every cell carries `data-label`**,
because the card flip at 640px reads it from that attribute and styles `td` only: the
`<th scope="row">` cells the first version used would not have flipped at all. Per-row
buttons are **stacked**, so a cell's width is the widest single button rather than the sum
(the `.sync-choices` lesson). **Check this file before picking a table primitive.**

**THE CLOCK IS STATE, NOT `Date.now()` IN THE RENDER BODY.** `FreeAgencyBoard` is a client
component, which Next.js still renders once on the server; a countdown reading the clock
during render gives the server one answer and the browser another, which React reports as a
hydration mismatch. `now` is `null` on the server and on the first client paint, set on
mount, and ticked every thirty seconds. Before mount the "closes in" column shows the
**absolute** closing time — a real reading, not a placeholder. **`page.js` still reads
`Date.now()` three times and that is correct**: it is a server component and never
hydrates. **Do not "fix" it.**

**THE FORM RE-IMPLEMENTS NO RULE.** The league minimum, the Deion Rule, the 30% Rule,
FA-14's roster-bonus prohibition and FA-7's practice-squad cap are all enforced in
`submit_fa_offer` and come back as plain-language errors. The form cannot drift from a rule
it does not restate. **Max five contract years, no void years** — five is what
`app/bids/BidForm.js` caps real-plus-void at, read from that file rather than picked.

**PER-SEASON DEFAULTS COME FROM `lib/leagueMinimum.js`, NOT FROM AN RPC.** The first version
made five `league_minimum_salary()` round trips per page load; `leagueMinimumSalary()`
already exists for exactly this and its own header says every JavaScript caller should go
through that module. The two were verified to agree for 2026–2031 (9, 10, 10, 11, 11, 12)
before the switch. The database still re-tests on submit, so the module only shapes a
default — but **a later year defaulted to the first year's figure is refused on submit**,
which reads to an owner as a broken app. That is why the defaults are per-season at all.

**`formatMoney` AND `formatDate` ARE IMPORTED, NOT HAND-ROLLED.** The first version carried
a local `money()` that printed `--` for a null balance where the repo's prints an em dash —
no cash row and a zero balance are different facts, and `lib/formatMoney.js` says so. These
three files are the first in a while that **do not** add to the seven-file hand-rolled-date
drift the Scoreboard section records.

**`createSupabaseServerClient`, NOT `adminClient()`** — every FA function resolves its
caller through `auth.uid()`, so a service-role call is refused no matter who is signed in.
The **seventh** instance of this trap.

**ONE OFFER IS SHOWN PER WINDOW AND A LIVE OFFER ALWAYS WINS THAT SLOT.** Offers arrive
newest-first; a plain assignment let an older withdrawn offer overwrite the live one an
owner re-submitted afterwards, so the row read "withdrawn" and the Withdraw button vanished
from an offer that was still standing. **Do not simplify that reducer.**

**OPTION BONUSES AND VOID YEARS SHIPPED LATER THE SAME NIGHT** (`fe3edf9`, migrations
`freeagency_09` … `freeagency_12`), after the first live use showed the form offering less
than the rules allow.

`free_agent_offer_option_bonuses` is a **sibling table, not a column on
`free_agent_offer_years`** — `bids`/`bid_years`/`bid_option_bonuses` maps one to one onto
`free_agent_offers`/`free_agent_offer_years`/this, and the offer tables were already
column-identical to the bid tables. It also leaves `edfl_delegation_years_valid()`'s **exact
seven-key** contract alone; that validator is shared with the auction's delegation path, so
an eighth key to suit free agency would have reached into the auction. Sealed under the same
RLS policy as the offer and its years, copied verbatim so the three cannot drift.

**`submit_fa_offer` gained `p_option_bonuses` LAST, with a default of `[]`.** A parameter
cannot be added with CREATE OR REPLACE, so it was dropped and recreated; the default is what
let the already-deployed client — which does not send the argument — keep working while the
new one was installed. **A control proved that six-argument call still works before the
migration was allowed to stand.** Any future argument goes on the end with a default for the
same reason.

**Owner-elected void years are capped at five slots, real plus void** (commissioner ruling,
Sep 7), which is what `app/bids/BidForm.js` already enforced. Read from that form, not
picked.

**NOTHING IN THE APP COMPUTES OPTION BONUS PRORATION.** Inserting `contract_option_bonuses`
fires `trg_rebuild_option_void_years`, which derives `contracts.option_void_years` and writes
the option void `contract_years` rows itself — five seasons from the year the bonus triggers.
`verify_auction_tier` has always relied on exactly that and the award now does the same, in
the same order: contract, then years, then bonuses. **Do not invert that order** — the
bonuses must land after the years they belong to, and the deferred Deion and minimum-salary
triggers read `contract_option_bonuses` at COMMIT, by which time they are there.

**TWO LATENT DEFECTS SURFACED THE FIRST TIME REAL OWNERS TOUCHED THIS, AND BOTH WERE IN CODE
THAT HAD NEVER RUN ONCE.** They are recorded together because the pattern matters more than
either bug:

- **`check_practice_squad_value` was reading a stale scalar.** It took
  `league_config.practice_squad_max_value`, still holding **3** from the original design,
  while FA-7 sets the practice squad cap at the league minimum — **9** in 2026. No
  `practice_squad` contract had ever existed league-wide, so the trigger had never fired.
  The first one ever attempted was an instant 5.14(b) signing at the correct $9, and this
  refused it. `freeagency_08` points it at `league_minimum_salary(league_season_year)`. **A
  single scalar cannot carry this rule** — the minimum escalates 5% a season — so the column
  is left in place, `COMMENT`ed as dead, and read by nothing. Proven per season by control:
  $10 refused in 2026, the same $10 legal in 2027.
- **Owner-elected void years would have failed at award time, every time.**
  `contract_years` carries `void_reason_matches_flag`; `submit_fa_offer` never wrote
  `void_reason`, so it stayed NULL and the award copied a NULL into a void row.
  `freeagency_12` **derives** it (`'signing_bonus'` — the only thing an owner-elected void
  year does on this form) rather than accepting it from the client, since the seven-key
  payload has no room for it. Found by a control, not by the positive test.

**The lesson both times: a trigger that has never fired is not a trigger that works.** The
whole `practice_squad` path and the whole void-year path were untested code until an owner
walked into them. The promotion counter is the next piece of the practice squad path nobody
has ever run.

**Two things a commissioner needs to know about option bonuses**, because neither is
obvious from the form: one counts as that season's compensation for the **30% Rule**, so
adding it to a later year can break a step that salary alone cleared; and it extends the
contract's cap footprint past its last real season, by exactly as many void seasons as the
proration needs, with no say from the owner.

**The home page link reads "In-Season Free Agency"**, not "Free Agency" — off-season free
agency is a separate later build (FA-17) and the two must not read as one surface.

**Not compiled** (ground rule 5) — no Node runtime and no `node_modules` here, so this
batch's own `next build` step could not be carried out. Three static passes stood in:
imports resolve to real exports, all twenty-one CSS classes exist, no bare `btn` modifiers.

### The free agent pool board (shipped Sep 8 2026)

The **Available players** section on `/free-agency`: the league's ranked top-150 free
agent pool, sortable, filterable by position and name, with an **Offer** button that
drops a player straight into the existing offer form. Built for the owner who wants
*depth at a position* rather than a name — search alone needed two letters and gave
twelve names alphabetically, so "I need a TE" had no answer. **The ranking is
subjective and the owners know it** (commissioner, Sep 8).

The data came as a chat-side package, `EDFL_FreeAgentPool_Top150_2026-09-08`
(JSON, CSV, MD and a read-only rebuild query), generated against the live database.
**No SQL in this repo and none should be written for it.** The rebuild query is kept
outside the repo like `EDFL_Invariant_Audit.sql`.

| File | What |
|---|---|
| `lib/freeAgentPool.js` | **new.** 150 rows plus provenance constants. **Generated, never hand-edited** — its header names the exact field list |
| `app/free-agency/actions.js` | **changed.** Private `fetchContractIndex()` (page-until-exhausted); `loadFreeAgencyState` joins the pool live and returns `pool` / `poolTotal`; `searchFreeAgents` requires a Sleeper link. **Still zero throws** |
| `app/free-agency/FreeAgencyBoard.js` | **changed.** `AvailablePlayers` (same file, not exported), `pickFromPool`, `PlayerLink` on the windows table |
| `app/free-agency/page.js` | **changed.** Two props through |
| `app/globals.css` | **changed.** `.pool-table` block appended, 85 lines — the byte-identical run ends at four |
| `EDFL_Database_Reference_for_ClaudeCode_v1.4.md` | **replaces v1.1** in the same commit |

**THE FILE CARRIES ONLY THE SLOW-MOVING FACTS, AND AVAILABILITY IS JOINED LIVE.** A
static list of free agents is stale the moment somebody signs, and in the 5.14(b)
week that is not hypothetical. So `lib/freeAgentPool.js` holds rank, chart tier and
PPV, and published 2025 production — things that move when a chart is published —
and `loadFreeAgencyState` inner-joins it against the live contract index on every
render. **A player signed ten minutes after the list was built is gone on the next
load, with no regeneration.** `acquisition_path`, `first_offer_exempt`,
`has_prior_contract` and `nfl_status` were **stripped from the module on purpose** so
the frozen snapshot can never be rendered: the first-offer state is derived from the
same live read the search results use, through the same `signsInstantly`. **If you
regenerate the file, keep those fields out.** The board is also empty for any season
the list was not built for, and says why.

**THE PACKAGE FOUND A LIVE DEFECT IN THE SEARCH, AND THE FIX IS ONE FILTER.**
`searchFreeAgents` queried `players` with no `sleeper_player_id` requirement. Player
identity is split across two rows for 62 players (v1.4 §11): the stats-loader row has
no contract of its own, so it passed the "taken" test and "Marvin Harrison Jr." was
offered as a free agent while Marvin Harrison is under contract. `.not('sleeper_player_id',
'is', null)` closes it; the pool file is Sleeper-linked by construction. **This is
containment, not repair** — the merge is chat-side.

**`.limit(5000)` ON `contracts` IS GONE.** CLAUDE.md names that number as neither
row-ceiling pattern, and this read decides who is *taken* — a silent truncation shows
a rostered player as free. `fetchContractIndex()` pages until exhausted, ordered on the
uuid primary key, and returns both sets (active now / ever contracted) because 5.14(b)
asks the second question. It returns refusals like everything else in the file; **the
`'use server'` count is 22 now** (was 21) and the throw backlog is unchanged at 43.

**SORTING AND FILTERING ARE CLIENT-SIDE, AND THAT IS HONEST HERE — UNLIKE
`/transactions`.** That page pushes every control to the database because it holds one
page of a larger set. This board holds the **whole** pool in props, at most 150 rows,
so a client sort is a sort of everything. The comment above `AvailablePlayers` says so;
if the pool ever comes from a paged read, move the controls to the query. Nulls — an
off-chart player's PPV or tier — sort **last in both directions**, so flipping a column
never floats "no value" to the top.

**NOT A PRICE LIST.** `per_year_value` and `likely_years` are in the data and
**deliberately not drawn**: a "$/yr" column reads as a price, and the package's own
brief says `chart_bid_target()` is the only authority on that. The header reads "Chart
PPV" so it cannot be mistaken for an offer's PPV. No money formatter is imported.

**THE TABLE IS `.ledger pool-table`, AND `.pool-table` EXISTS BECAUSE TEN COLUMNS
CANNOT LIVE INSIDE `.ledger`'S 640px FLIP.** Measured in a static harness carrying the
real stylesheet (served over `localhost` by a PowerShell listener — the file:// route is
inert to the page tools; the harness is **not checked in**, fonts fall back): the
table's floor is **926px** with `.ledger`'s nowrap headers and **758px** with them
allowed to wrap, and **320px of that is cell padding alone**, so no column sizing fits
it below a ~820px viewport. The block wraps the headers, narrows the figures (`col-num`
88, `.pool-rank` 64, `col-status` 110) and **flips to cards at 840px**, the `.sync-table`
decision for the `.sync-table` reason. `scrollWidth − clientWidth` was **zero at 1440,
1280, 1100, 1024, 900, 860, 841, 840, 800, 700, 660 and 375**; before the block it was
89–314 between 660 and 900. `display: block` is repeated on `.pool-table tbody td` for
the same specificity reason `.sync-table` records — **do not tidy it.** No inline
sizing remains in the JSX.

**FIRST OFFER WINS is a tag, drawn only while true**, the VOID YR idiom. After the
5.14(b) instant it never appears, and "8h window" on every other row would be the
column-of-Active problem. It reads `hasPriorContract`, which is derived live per row —
never from the file.

**THE DATABASE TURNS THAT TAG ON AND THE CLOCK CAN ONLY TURN IT OFF** (same day, second
commit). A follow-up handoff arrived asserting the module carried `acquisition_path` as a
baked field that would go wrong for 142 players at midnight on the 14th. **It did not** —
the field had been stripped and the tag was already gated on the calendar row — but the
handoff's remedy was still the better mechanism, so it was adopted: `loadFreeAgencyState`
reads the 5.14(b) row through the **`league_calendar` view** for its server-evaluated
`is_past`, returns `firstOfferExemptionActive` (**fails closed** — a missing row or a
failed read is `false`), and the page notice, the search results' "signs instantly", the
form notice and the pool tags all key on it. So the tag renders on the server and the
first paint instead of appearing after mount; the 30-second ticker's only remaining job is
to withdraw it if the page is still open when the instant passes, by comparing against
the row's own `starts_at`. **No hardcoded date remains in the feature** — the two
"September 14" strings in the board's copy became `formatDate(firstOfferUntil)` and a
plain "the first-offer exemption". `Date.now()` is still read in `page.js`, for the
open/closed test — a server component, and unchanged. The handoff also assumed
`has_prior_contract` was baked and could go stale on a sign-then-release; here it is
derived per row from the live contract index, so that edge case does not exist.

**The board is always drawn; only Offer is gated on `isOpen`**, because the form it
feeds is not rendered until the market opens. An owner planning for a gap can browse
while the market is shut. `pickFromPool` sets the same `player` shape the search sets,
so the signs-instantly notice and the submit payload are one path, then scrolls to
`#fa-offer-form` — in a click handler, so it never touches `document` in render.

**The windows table now wraps `player_name` in `PlayerLink`** — it had `player_id` and
was the one plain-text player name on the page. One-line change while in the file, per
the standing "wrap it when next in that file" note.

**Not compiled** (ground rule 5). Static passes: imports resolve to real exports, all
fifteen CSS classes exist, zero bare `btn` modifiers, zero throws in `actions.js`,
brace and paren counts balance, no template literals. The width figures above are real
measurements; nothing else has run.

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
`app/bids/delegationActions.js` entirely and undercounted by five. **13 files
declared `'use server'` when this table was written; it is 21 as of September 7,
2026** — recounted, not assumed. **The glob must walk `components/` as well as
`app/`**, because `components/ownerInfoActions.js` is the first such file outside
`app/`. Twelve of them contain the keyword; ten of those
are real backlog. The per-file rows below are still accurate for the files they
name.

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

**THE NAIVE GREP NOW RETURNS 46, AND THE CONVERSION BACKLOG IS STILL 43.**
`app/admin/sleeper-sync/actions.js` (Sep 6 2026) contains three `throw new Error`
statements and **none of them is an unconverted refusal.** All three are in
`leagueId()` and `fetchJson()` — **module-private helpers, not exported, therefore
not Server Actions** — and both are called only inside the `try` in
`pullAndCompare`, whose `catch` turns them into `{ ok: false, message }`. Nothing
throws out of an exported action in that file; it belongs in the zero-throw group
with the other four.

That is the distinction the count has to preserve: **ground rule 9 is about what
escapes an exported Server Action, not about the keyword appearing in the file.**
A throw caught in the same function is ordinary control flow. When you recount,
subtract this file's three, or the backlog will look like it grew while three
refusals were actually added.

**`app/transactions/actions.js` (Sep 6 2026) adds a file to the glob and NOTHING to
the backlog** — three exported actions, **zero throws**, all returning
`{ ok, message }`. **`components/ownerInfoActions.js` (Sep 6 2026) does the same** —
three exported actions, zero throws.

**`app/scoreboard/actions.js` (Sep 7 2026) is the SECOND file to carry the keyword
without adding to the backlog.** Its three `throw new Error` statements are in
`leagueId()` and `fetchJson()` — **module-private helpers, not exported, therefore
not Server Actions** — and both are called only inside the `try` in
`refreshWeekScores`, whose `catch` returns `{ ok: false, message }`. It is the same
shape as Sleeper Sync, file for file. **When you recount, subtract SIX now, across
two files, not three across one.**

**Recounted from the tree on September 7, 2026, and the arithmetic is worth keeping
because three of these numbers disagree on purpose:** **22** files declare
`'use server'` (recounted September 8 — the September 7 count of 21 had missed
`app/free-agency/actions.js`, added that same day); **12** contain `throw new Error`;
the keyword appears **49** times; subtracting the six non-escaping helper throws in
Sleeper Sync and the scoreboard leaves the backlog at **43 across 10 files**, unchanged
since August. The ten files with no throws at all are
`app/team/[teamId]`, `app/bids`, `app/bids/hideActions`, `app/trades`,
`app/restructure`, `app/admin/restructure`, `app/fifth-year-option`,
`app/transactions`, `app/free-agency` and `components/ownerInfoActions` — the table
above predates the last seven of those and lists only the first three. **Do not read
the table's three ✅ rows as the whole converted set.**

**THE GLOB MUST REACH OUTSIDE `app/` NOW.** `components/ownerInfoActions.js` is the
first `'use server'` file that is not under a route folder, and it is there because
two surfaces mount the same component (see the Owner Info section). A count that
walks `app/` alone returns 19 and looks plausible.

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
- **The Owner Directory is WIDENED** (Sep 6 2026) — `OwnerInfoPanel` mounted at
  `editScope="all"`, which is what draws "Edit as officer". **This is the one
  place in the app an officer edits another owner's card.**
- **The appointment control is COMMISSIONER ONLY**, on a page co-commissioners can
  reach. A co-commissioner able to appoint co-commissioners could appoint
  themselves peers, and the role would stop being the commissioner's to give.

**THREE SECTIONS, THREE DIFFERENT WIDTHS, ON ONE PAGE**, which is the reason this
section exists at all. The page gate is commissioner-or-co; the directory rides on
that gate; the appointment control is **narrower than the page it sits on**.

**The directory is read at page load, deliberately unlike the activity report**,
which still loads behind a button so a visit does not query the auth tables every
time. The directory is ten rows from one function and is the thing an officer came
to this page to change, so a button to reveal a contact list would be a click for
its own sake. **Do not "make it consistent" by putting it behind a button.**

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
rounding. It has **exactly three consumers and the list is closed**:
`components/RestructureForm.js`, `app/team/[teamId]/TeamCapSheet.js` and
`app/fifth-year-option/FifthYearOptionBoard.js`. See the restructure section for
why a second formatter exists at all and why it must not spread further. **The
option board joined on Sep 4** for the same two reasons in one place: an option
value out of `edfl_tag_values` is whole by construction, so a fraction on one is
a defect and rounding hides it; and the current cap charge beside it comes from
`contract_year_computed`, may legitimately be fractional on one of the 48
pre-rule-1.9 contracts, and must agree exactly with the team Overview grid
showing the same number.

**Twenty files import this module as of Sep 4.** Seventeen take the rounding
`formatMoney` — cap and cash: `/cap-sheet`, `CutPlayerDialog`, `/cash`,
`/admin/cash`, `CutsPanel`, `FixContractsTable`; bids: `/bids`,
`/bids/results/[tierId]`, `TierResultsPanel`; Player Card: `ContractTab`,
`EarningsTab`, `MarketValueTab`, `PlayerCard`, `TransactionsTab`,
`VisualBreakdown`; trades: `TradeImpactCards`, `ReverseTradeDialog`. The other
three take `formatExactMoney` and are named above. **`TeamCapSheet` moved from the
first list to the second on Sep 4** — it is no longer a `formatMoney` call site.

`TransactionsTab` stays a **`formatMoney`** call site even though it now renders
an option value: the Player Card rounds throughout, and switching one row of one
feed to exact precision would make that page disagree with itself.

**All twenty change together by editing this one file**, which is the entire
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

**The toggle now lives in the app bar, not in a fixed corner dock** (Sep 7 2026).
`app/layout.js` no longer imports `ThemeToggle` directly — `components/AppBar.js`
does, and the layout mounts the bar. The `dockStyle` object and its
`position: fixed` wrapper are gone. **`.theme-toggle` is now worn by four
controls** — the toggle plus Home, Login and Sign Out — which is why those line up
with it exactly and why the app bar needed no new CSS. See the app bar section.

**Currency colours — one colour per currency, everywhere:** `--c-cap` blue ·
`--c-cash` green · `--c-ppv` purple · `--c-dead` rust, via `.v-cap` / `.v-cash` /
`.v-ppv` / `.v-dead`. Gold is reserved for pending/attention states.

**Status chips:** `tierRowTone()` mapping unchanged. `/admin/cuts` uses
`.status-live` for active cuts and `.status-off` for reversed.

**Dialogs:** `.modal-*` primitives exist now (see Cut Player above). Mobile: the
backdrop scrolls, the action row stacks column-reverse so the destructive button
is not under the thumb. `data-label` attributes are supplied by the cut dialog
and CutsPanel tables; older tables still lack them.

**Defined but not yet consumed:** `.btn-block` `.action-bar`
`.admin-form input.num-input`. (`.btn-danger` `.form-notice` `.btn-quiet`
`.table-scroll` `.col-num` gained consumers in the Cut/export work;
`.page-narrow` and `.legend` gained theirs on `/calendar`; **`.btn-secondary`
gained its first on `/admin/sleeper-sync`, Sep 6 2026** — it is the bulk
"same answer for all" control, one step quieter than `.btn` and one louder
than the per-row `.btn-quiet`.)

**globals.css is now 1,739 lines and grows by append.** Feature blocks sit at
the end in shipped order: `.modal-*` (Cut Player), the sortable-header and
cap-grid rules, `.cal-*` (Calendar), `.trade-*`, `.sync-*` (Sleeper Sync,
Sep 6 2026), then `.pool-table` (the free agent pool board, Sep 8 2026 — the
second table to need a card flip wider than `.ledger`'s 640px). Append new
blocks; do not reflow what is above.

**`.grid-table` is for NUMBERS and `.ledger` is for ROWS A HUMAN READS.** The
Sleeper Sync table picked the wrong one and scrolled sideways by 332px until it
was moved (see that section). `.grid-table`'s seven consumers are all cap or
cash grids; `.ledger`'s ~31 are everything else. Check which question your table
is answering before you pick.

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
- **Fifth Year Option click-throughs, none seen running** (ground rule 5 — the
  batch was never compiled). The board rendering every league row with buttons
  on own-team rows only; an exercise showing the new charge in 2027 with the
  2026 cap unmoved; a decline unlocking that contract on `/restructure`; the
  player card reading **"Fifth Year Option exercised" and NOT "Released"** —
  that was the `fyo_07` defect and it is the single highest-value thing to look
  at; `/admin/fifth-year-option` listing a decision, reversing one, and refusing
  by name once the window has closed.
- **`/admin/fifth-year-option` shows no countdown**, unlike `/admin/cuts`. The
  option board returns no `reversal_hours_left`, and deriving one would mean
  hardcoding 96 hours against a value that lives in `league_config`. If the
  board ever gains that field the panel should show it; until then the refusal
  is the feedback.
- **The annual publish control has no home.**
  `publish_edfl_season_results(p_season, p_republish)` is the only recurring
  work the Fifth Year Option creates, and nothing in the app calls it — so
  today it is a SQL-editor task that has to be remembered once a year. It needs
  a reachable admin surface and a line in the March 1 rollover checklist beside
  `advance_league_year()`. **Do not solve this by putting it on the stats
  import**; that is the thing `fyo_09` retracted.
- **`/admin/import-stats` is still linked from nowhere.** This mattered more
  when a refresh obligation lived there; it is now a plain navigation gap. When
  it gains a link it goes inside the `canAdmin` block **and** behind
  `isCommish`, since that page is strict. The publish control above will need
  the same treatment, or a home of its own.
- **`edfl_season_results_status()` has never been called from the app** — the
  status line under an import result is unverified, like everything else in
  this batch (ground rule 5).
- **Sleeper Sync click-throughs, none seen running** (ground rule 5 — never
  compiled). **A run was already open at handoff**
  (`68200af8-a9ae-4a90-b023-6ccefc67fc4f`, 30 conflicts, detected Sep 6 03:43
  UTC), so the page should load **straight into the Review state** rather than
  showing the Pull button — that is intended, and it is the fastest way to see
  the page render real data. Worth checking in order: the thirty conflicts
  grouping into named sections with blocking ones first; a bulk "same answer for
  all" writing the button's own wording as the logged note; preview returning a
  `confirm_token` and apply refusing with the right hint after a resolution
  changes underneath it; and the abandon path requiring ten characters.
  **`supabase.rpc()` serialising a JS array into a `jsonb` argument is the single
  most likely thing to fail** — if Pull and compare refuses, check
  `sleeper_sync_stage`'s `p_payload` first, not the gate.
  Add to that list, from the follow-up batch: the **"Last thing the app did"**
  column appearing on roster groups and **absent on the two team groups**
  (backfilled on the open run as 19 player rows with an action, 11 team rows
  without); its timestamps reading **ET**; and the **three-column roster table
  against the two-column mapping table on a narrow screen** — the column counts
  now differ between groups on one page, and the widths have not been looked at.
  The existing `.table-scroll` wrapper handles overflow.
- **Calling the option season out on the player card is UNRESOLVED, and it is a
  database question first.** The terms strip already reads "2 yr / 2026–2027"
  with no change; naming *which* season the option added ("5th Year Option
  exercised for 2027") needs `contract_years.added_by` on the client.
  `app/player/[playerId]/page.js` reads year rows from
  `player_contract_year_breakdown` with `select('*')`, so **if that view exposes
  `added_by` it is already arriving and this is presentation only; if it does
  not, it is a view change and belongs chat-side.** Do not guess which — ask.
- **Two dead `contract_type === 'fifth_year_option'` arms** in
  `app/admin/new-contract/ContractForm.js` and `lib/thirtyPercentRule.js`. That
  contract type no longer exists, so both are unreachable. **Leaving them is
  deliberate**: they grant the 30% exemption, and the negotiated extension must
  key its exemption on `contract_years.added_by` instead. Remove them as part of
  that change, with the replacement in the same commit — not before, and never
  by widening them to cover extensions.
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
- **Transaction Log click-throughs, none seen running** (ground rule 5 — never
  compiled here). Worth checking in order: the page loading 100 of 340 rows
  newest-first; **Load more walking straight through the 130 identical rookie-signing
  timestamps with no repeat and no skip** — that is the cursor earning its keep and
  the one failure that would be invisible without counting; switching to a name sort
  **hiding** the Load more button and showing the narrow-your-filters note instead;
  a kind chip's count matching the rows it yields; and the Charbonnet release
  appearing under a "to August 13" filter, which is the Eastern-boundary case.
- **The date inputs are native `<input type="date">` and their rendering has not
  been looked at** in any browser. Flagged by the handoff itself, not discovered
  here.
- **How a Discord bot authenticates is unresolved, and it is a decision rather than
  a gap.** `league_transactions()` is granted to `authenticated` and to nobody else,
  so a bot needs its own Supabase user or a service-role key held server-side. It is
  deliberately not open to `anon`. **Do not resolve this by widening the grant.**
- **`/transactions` materialises the whole feed on every call** — 20,717 buffer hits
  for 340 rows, including the 319 bid rows it filters out. Fine today at 137 ms. The
  fix, when it is needed, is pushing the kind filter down into
  `player_transaction_feed` or materialising the log; **an index will not help**,
  because the filtering happens after the union. See the Transaction Log section.
- **`league_transaction_log_unmapped_kinds()` should always return zero rows** and
  nothing in the app calls it — it is a SQL-editor check, like the invariant audit.
  Run it after any change to the feed's kind vocabulary. If a future batch adds a
  feed kind, this is what says whether the log silently dropped it.
- **Owner Info click-throughs, none seen running** (ground rule 5 — never compiled).
  In order: **signed out, the Owner Info tab button must not be drawn at all**; as an
  ordinary owner, ten cards with **your own first**, your login address on **your card
  only**, a band on every card but a **timestamp on yours alone**, and **Edit on your
  card only**. Then the one that proves the whole design — **set your Discord name,
  save, hide that field, save again, and confirm another owner reads "hidden by
  owner" and not "not set"**; if those read the same, `hidden_fields` is not arriving
  and the feature is inert. Then `Asia/Tokyo`: the clock shows Tokyo time, says how
  many hours ahead, and **ticks within 10 seconds**.
- **THE REGRESSION TO WATCH FOR IS AN "Edit as officer" BUTTON ON `/team/[teamId]`.**
  As commissioner on a team page you should see every field and exact timestamps but
  **Edit on your own card only**, plus the line pointing at Owner Administration. A
  button on another owner's card there is the v1 defect returning and is the entire
  point of v2.
- **Then `/admin/owner-activity` as commissioner**: Owner Directory below the activity
  report, "Edit as officer" on other cards, the amber banner naming the team, a save
  writing a `commissioner_actions` row of type `owner_profile_edit` with a
  before/after snapshot — **and the activity report above still loading behind its
  button**, which the new page-load directory read must not have disturbed.
- **The co-commissioner path on Owner Info is the one role whose behaviour is
  inferred rather than proven.** It shares `is_commissioner_or_co()` with the
  commissioner path and was **not separately tested database-side**, per the handoff's
  own flag. Check Brian on **both** surfaces; the shared helper does not settle it.
- **Overview and Roster must read exactly as before** after all of the above. Those
  are the September 4 totals, and they are the reason the team page's `page.js` diff
  was checked hunk by hunk.
- **Owner Info, deliberately not built**, so nobody builds them later as bug fixes:
  **no Sleeper profile links** (a `sleeper.com/@handle` URL was never confirmed to
  resolve, and a speculative spelling is worse than none — handles are text with a
  copy control); **no avatars** (`teams.sleeper_owner_id` is populated on all ten
  rows, so it is cheap later, but it needs a sync column, never a per-render API
  call); **`open_to_trade_talks` has no consumer beyond its own chip** — surfacing it
  on the trade screens is a separate change and a commissioner decision; and **no
  nudge control** on a card banded "Not seen in a week", though
  `commissioner_owner_activity()` already carries the idea.

- **App bar click-throughs, none seen running, and this batch could not even be
  compiled** — there is no Node runtime and no `node_modules` here, so its own
  instruction to run `npm run build` was impossible. **Signed out, in a private
  window:** `/` shows HOME then the toggle top-left and a single LOGIN top-right;
  `/calendar` shows the same bar **plus** its new inline `← Home`; LOGIN reaches
  `/login`; the theme toggle still persists across a reload from its new home.
  **Signed in:** the corner reads "You are logged in as Cash Over Cap" with SIGN
  OUT beside it, and the team name reaches your own team.
- **THE SIGN-OUT PATH IS THE ONE TO EXERCISE PROPERLY.** Sign out from a *gated*
  page such as `/values`: you should land on `/`, the corner should flip to LOGIN
  **without a manual reload**, and going back to `/values` should bounce you to
  `/login`. Then sign back in and confirm the corner names your team again, also
  without a reload. That round trip is what proves the browser client and the
  server client are reading the same cookie — the single assumption the whole
  feature rests on.
- **The Player Card's `← Return to Cap Sheet` is best tested by NOT arriving from
  the cap sheet** — paste a `/player/<id>` URL into a fresh tab, since a click
  from a cap sheet row opens a new tab and leaves the cap sheet behind in the old
  one. Also check `/player/00000000-0000-0000-0000-000000000000` renders Player
  Not Found with both links.
- **The bar on a phone, portrait, and in both themes.** It must **wrap rather than
  overflow sideways** — it is the first full-width flex row in the app's chrome —
  and **nothing at the top of any page may be covered**, which is the whole reason
  it is sticky rather than the fixed dock it replaced. The team-name link must be
  readable in light and dark.
- **The bar's "logged in, no team" branch has never been produced by real data.**
  All ten owners carry a `team_owners` row, so the email-address state is
  unreachable without creating an unlinked auth user. It is the one branch that
  cannot be checked by clicking around, and it exists because a LOGIN button there
  would loop that owner forever.
- **The LOGIN button in the bar carries no `?next=`** and lands on `/`. A root
  layout cannot read the pathname server-side. Not a bug, and **not fixable by
  making the layout a client component** — a gated page's own redirect still
  carries `next=` and is unaffected.

- **Scoreboard and Standings click-throughs, none seen running, and this batch could
  not be compiled either** — no Node runtime, no `node_modules`, so its `next build`
  step was impossible. **`/scoreboard` signed out:** it renders, the tab strip has
  fourteen weeks, **week 12's subtitle reads a WEDNESDAY date** (Thanksgiving), weeks
  13 and 14 read "(provisional)", and there is no refresh button. **Signed in:** the
  refresh button appears; pressing it on week 1 should report `10 of 10 teams
  written` with no unmatched rosters. **Until Sleeper has real scores every card
  reads `--` and "Not played" — that is correct, not a bug**, and it is the single
  most likely thing to be misreported as broken.
- **`/standings`:** ten rows; before any week is played every team reads `0-0-0`
  with the notice above the table, and **`PPG` reads `--`, never `0.00` or `NaN`.**
- **THE FIRST THING TO CHECK IF `/scoreboard` COMES UP BARE IS `league_weeks`.** The
  page selects `charge_at` and `is_provisional` from that table, this batch was the
  **first consumer of it in the repo's history**, and at the time neither the handoff
  nor the v1.1 reference documented its columns. **v1.4 §5 now does** — check the
  page's column names against it before suspecting the data. A wrong
  column name yields "Couldn't load the scoreboard" or the empty-calendar note —
  **both of which look like missing data rather than a wrong query.** One query
  chat-side settles it.
- **`app/page.js` was rewritten, so click the shared surfaces too**, not just the two
  new routes: `/`, `/cap-sheet`, `/calendar`, `/transactions`, one `/team/[teamId]`.
  The diff was two `<a>` elements and nothing else, but that file is the app's
  front door.
- **The scoreboard's refresh control is the app's only signed-in-but-not-officer
  write.** Confirm an ordinary owner really can press it and that it writes. If
  somebody later "tidies" it behind `isCommissionerOrCo`, the waiver priority order
  goes stale whenever the commissioner is away — see the Scoreboard section.
- **The database reference was re-cut as v1.4 on September 8, 2026, and is checked
  in** in place of v1.1. It carries 58 migrations v1.1 did not know about, every
  scoreboard, sync, transaction-log, owner-profile and free-agency object, the live row
  counts at 00:35 UTC September 8, and — §11 — the split-identity defect. **Its §14 lists
  what it cannot tell you**, starting with whether a tier or window is open right now.
  Two things it flags that this file should not contradict: the `btree_gist` extension
  puts 188 functions in `public` that are not EDFL's (149 are), and the league-wide
  `cap_charge` total is a timestamp, never a regression constant.
- **`waiver_priority_order(season, through_week)` exists in the database, is granted
  to `authenticated`, and NOTHING in the app calls it.** The waiver feature has its
  own spec and its own build. **Do not add a page for it** as a follow-on to the
  scoreboard.
- **A FREE AGENCY WIN STILL LABELS ITSELF `signed` IN THE TRANSACTION FEED.** It falls
  into `player_transaction_feed`'s `ELSE` branch — verified by test, not assumed, and an
  SR-8 gap (a whitelist with an `ELSE` is not a fallthrough). It wants
  `signed_free_agent`, `signed_practice_squad`, `fa_offer_lost` and `fa_offer_passed_over`
  at least, plus something for an instant 5.14(b) signing. **Reconcile the new kinds by
  diff with the waiver build's kinds before adding either set** (SR-36) — two features
  inventing competing vocabulary for the same event is the failure to avoid.
  `league_transaction_log_unmapped_kinds()` returning zero rows is the shared baseline.
- **Free agency click-throughs — THREE OF THE FOUR HAVE NOW BEEN RUN LIVE, and the two
  that mattered both passed.** A never-contracted player was signed on the spot under
  5.14(b); he was then released, and an offer on him afterwards correctly opened an
  eight-hour window rather than signing again, because by then he had a prior contract.
  Both were done by the commissioner and the test data was removed afterwards by a logged
  commissioner action, leaving the player never-signed again. **Still unexercised: a
  window resolved on its own clock after eight hours, an offer deliberately over Owner
  Cash, and the whole option-bonus and void-year form, which shipped after those tests.**
- **NO WINDOW HAS EVER CLOSED ON ITS OWN CLOCK.** Every resolve so far has been either
  instant under the exemption or forced in a rolled-back test. Nothing runs unattended
  (FA-8), so a window that closes while the commissioner is asleep simply waits — that is
  by design, but it has never actually been observed happening.
- **`app/transactions/TransactionLog.js` uses `.grid-table` for a text-heavy log and
  carries three BARE `btn-quiet` / `btn-secondary` classes** with no base `btn`. The Theme
  section claims the repo is "back to zero bare modifiers", so either that page regressed
  after the sweep or the sweep missed it — bare modifiers render at a 38px tap target with
  no border. Found while auditing the free agency batch. **Not fixed there: different
  feature, different commit.**
- **PLAYER IDENTITY IS SPLIT ACROSS TWO `players` ROWS FOR 62 SKILL-POSITION PLAYERS,
  AND IT IS UPSTREAM OF EVERYTHING THAT JOINS STATS TO CONTRACTS.** Found September 8
  building the free agent pool. The Sleeper sync writes one row (Sleeper id, NFL team, no
  `gsis_id`, unsuffixed name — `Marvin Harrison`); the stats loader writes another
  (`gsis_id`, **all** `player_game_stats` and `edfl_season_results`, no Sleeper id,
  suffixed name — `Marvin Harrison Jr.`). Contracts hang off the Sleeper row; production
  hangs off the stats row; neither knows about the other. All 62 orphan rows carry game
  stats; a name-and-position match finds a Sleeper twin for 37, and **12 of those twins
  hold an active contract**. The first build of the pool listed Marvin Harrison Jr.,
  Kenneth Walker III, Brian Thomas Jr., Michael Penix Jr. and six other rostered players
  as free agents. **`searchFreeAgents` had the same defect live** — no Sleeper-link
  filter, so the orphan row passed the taken test — and was fixed in the pool batch.
  **The real fix is a `gsis_id`-keyed identity merge so one row carries both ids. That is
  a migration and belongs chat-side (ground rule 2). Until it lands, any query that must
  not show a rostered player as available needs `sleeper_player_id IS NOT NULL`**, and any
  query joining production to a contract must expect the production to be on the other
  row. The player card and the stats pages have not been checked against this.
- **`lib/freeAgentPool.js` IS A SNAPSHOT WITH A REGENERATION OBLIGATION.** It carries the
  ranking behind the Available players board on `/free-agency` and is regenerated, never
  hand-edited: when a new Player Value Chart snapshot is published, re-run
  `EDFL_FreeAgentPool_Top150_rebuild.sql` chat-side against the new `snapshot_id`, export
  the JSON, and regenerate the module (the field list in its header is the contract).
  The rebuild query is **not checked in** — same treatment as `EDFL_Invariant_Audit.sql`,
  a read-only SQL-editor script kept outside the repo. Availability is joined live, so
  the file going stale costs ranking accuracy, never a false "available" — see that
  section for which fields were deliberately stripped so they cannot be rendered stale.
- **Free agent pool click-throughs, none seen running** (ground rule 5). The Available
  players section rendering between the windows table and the offer form with a count
  reading `N of 150`; sorting `Chart PPV` descending putting the em-dash rows **last**,
  and clicking it again putting them last again; the position select narrowing to one
  position with `Pos #` running 1, 2, 3; the **FIRST OFFER WINS** tag on never-contracted
  players and absent on Charbonnet, Washington and the other six with prior contracts;
  **Offer** dropping the player into the form and scrolling to it, with the
  signs-instantly notice appearing for an exempt player; and, the one that proves the
  live join, **a player signed through the form disappearing from the board on the next
  load without a regeneration.** On a phone the ten columns must flip to cards with
  every label present.
- **THERE ARE TWO CHECKOUTS OF THIS REPO ON THE COMMISSIONER'S MACHINE** and one of them
  is stale. As of this batch the second copy still had the pre-September-7 `app/page.js`
  and no `app/free-agency/`. **Confirm `git remote -v` and `git status` before committing**
  — a push from the wrong clone reverts free agency, standings and the scoreboard
  together.

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
