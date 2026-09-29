# EL DYNASTY FUTBOL LEAGUE-O

## EDFL TECHNICAL MANUAL

**Version 24 — September 21, 2026**

*"I didn't make the rules, I just copied them from the NFL"*

---

### What this manual is

This manual describes the EDFL league application: what it is, how it is built,
and **how it enforces each rule of the EDFL Rule Book**. It is exclusive to this
league's application. Nothing in it is portable to another league, and nothing in
it is a rule.

Unlike the Rule Book, this manual **explains itself**. It says why a mechanism was
built the way it was, what was tried first, what broke, and what a future change
would cost. That commentary is the point of the document: it is the record of a
decision, kept so that the decision is not quietly undone by someone who cannot
see the reason for it.

### What governs

**The Rule Book governs.** Where this manual and the Rule Book differ, the Rule
Book is the rule and this manual is a defect to be fixed. This reverses the order
that stood from Version 17 to Version 22, when this document was the binding
statement of the rules and the Rule Book was a shorter owner-facing summary of
it.

The reversal is deliberate and it is the whole of the Version 23 reorganisation.
The rules of play now live in one place, written to be read by an owner and to be
portable to any league; this manual now describes one piece of software and its
conformance to them.

| Document | Answers | Governs |
|---|---|---|
| **EDFL Rule Book** | What are the rules? | Yes, over both others |
| **EDFL Technical Manual** (this) | How does the app work, and how does it enforce the rules? | Over the How-To Manual |
| **EDFL Owner How-To Manual** | How do I do a thing in the app? | No |

### How to read this manual

Part II is numbered to match the Rule Book exactly. **TM 5.17 tells you how RB
5.17 is enforced.** Where a Rule Book clause needs no enforcement — because it
binds a person rather than a system — Part II says so and stops. Where the app
does something the Rule Book does not require, Part I says so.

Each enforcement entry carries a **status**:

| Status | Meaning |
|---|---|
| **BUILT** | The rule is enforced by the app or the database, and has been verified against the live database. |
| **BUILT, PARTIAL** | Some limbs of the rule are enforced; the entry names which are not. |
| **NOT BUILT** | The rule is settled but nothing enforces it. Every one of these also appears in Part IV. |
| **NOT ENFORCED BY DESIGN** | The rule binds a person, not a system, and the app states it without policing it. |
| **ADVISORY** | The app warns but does not block, on purpose. The entry says why. |

### Verification standing

*Generated against the live database on September 21, 2026, after migrations
through `poach_08b` and `psx_04`, with the client at commit `fe9ec12` and the
September 21 batch (`EDFL_PSDesignations_RosterBar_2026-09-21`) cut against it
and awaiting its push. If today is more than about a week after that date,
verify against `pg_proc`, `pg_views` and `information_schema` before acting on
anything here. A document is not evidence about a database.*

---

# PART I — THE SYSTEM

## 0.1 What the application is

A companion application for a ten-team dynasty fantasy football league, run
alongside a third-party fantasy platform. The platform carries lineups and
publishes statistics. The application carries everything the platform cannot:
contracts, the salary cap, Owner Cash, the practice squad as this league defines
it, waivers, free agency, poaching, trades, dead money and the league calendar.

**Stack:** Next.js 14 (App Router, plain JavaScript, no TypeScript), Supabase
(Postgres with row-level security), Vercel. Live at
`dynasty-league-app-gold.vercel.app`.

**Designated providers under RB 1.13.** The statistics provider, the position
authority and the injury authority are all Sleeper. The prospect source is ESPN's
published grades and ranks. Weekly projections are Sleeper's carriage of
Rotowire's projected stat lines. These are the current designations; the rule
that names the role, not the vendor, is RB 1.13, and changing a vendor is a
designation change and a data-source change, never a rule change.

## 0.2 The system of record, and the seam with the platform

**The application is the system of record.** RB 1.13(b) states the rule; this is
how it holds in practice.

- Every acquisition, cut, trade, restructure and roster move is made in the
  application first and is mirrored into Sleeper by hand.
- Sleeper's number is the official **score** (Part II, 8.5) and Sleeper is the
  **position authority** for RB 3.1(b) and RB 3.5(c). Everything else the
  application decides for itself.
- The two can therefore disagree about a roster until the commissioner syncs
  them. When they do, the application is right and Sleeper is corrected.
- **Sleeper lineups no longer affect EDFL scoring at all.** Best ball is computed
  here from the full roster (Part V, T.1). Setting a Sleeper lineup is cosmetic.

## 0.3 The database boundary

**Every rule that decides an outcome lives in the database.** The application's
job is to collect input, call a function, and surface the refusal it gets back
verbatim. This is the line the project has crossed most expensively, and it has
its own section for that reason.

- A refusal message names the season, the figure and the limit. It is surfaced
  as written rather than paraphrased, because the database owns the rule and
  therefore owns the wording of the rule.
- **A cut is settled in the database only.** One function is the single
  implementation of the settlement rules in RB 5.18. No JavaScript reproduces any
  part of it, and the cut dialog re-queries on every designation toggle rather
  than recalculating.
- **Two dead-cap numbers exist and are different questions.** The engine answers
  "what does cutting this existing contract cost". `lib/deadCapPreview.js` answers
  "what would this contract, still being typed, cost to exit" — before any row
  exists to query. It mirrors the computed view, is date-blind, carries no
  roster-bonus term deliberately, and is labelled an estimate on screen. It must
  never call the engine.
- **Reversed events are never deleted.** Every consumer of `contract_events`
  filters `reversed_at IS NULL`, or uses the history view's active flag, or it
  resurrects reversed dead money. This is permanent and holds whatever the Rule
  Book says about reversal.
- **Void seasons come in two kinds and only one belongs to owners.**
  Owner-elected void seasons spread a signing bonus (RB 5.7(b)). Option-bonus void
  seasons are created automatically by triggers (RB 5.7(c)). Client code must
  never create, count or limit option void seasons; counting them from the
  contract row is wrong, not merely fragile.
- **Some functions authorise nothing themselves and trust their caller.** They
  must stay unreachable from the API: never granted to `anon` or `authenticated`,
  and never protected by a second copy of the gate.
- **The session client is used for anything gating on `auth.uid()`.** That value
  is NULL through the service-role client, so a function called that way refuses
  or mis-attributes. A few admin paths use the service-role client because they
  write tables no gated function covers; their own Server Action check is then the
  whole gate.

## 0.4 Access, and the shape of the gate

**The application has no public face.** `middleware.js` is the whole of that:
every path requires a session except `/login`, `/auth/callback`, `/install`,
`/api/cron/*` and three static files. Everything else redirects to
`/login?next=…`. **A new route is closed by default**, which is the point of the
design.

Authentication is a two-step one-time password: the owner submits an email
address and receives a six-digit code.

Thirteen page routes have no gate of their own and depend on the middleware
alone — the pages that were public before the front door closed. They still read
through the anonymous client, and the anonymous grants behind them are still
open, so anyone holding the publishable key can read those views outside the
application. Closing that is a sequence: move the pages to the session client,
deploy, confirm, **then** revoke. Revoking first blanks thirteen pages.

Three gate levels exist:

| Gate | Test | Applies to |
|---|---|---|
| **Owner** | a signed-in login with a `team_owners` row | most pages |
| **Widened officer** | `isCommissionerOrCo` | most `/admin` pages |
| **Strict** | `is_commissioner` | the Calendar Loader, the appointment control, and the powers in RB Appendix A.2 |

Every page with its own gate uses two layers: the page redirect **and** an
independent re-check inside every Server Action. **Hiding a link is presentation,
not access control.** The redirect and the Server Action re-check are the real
gates, and a write path is never disabled by hiding its link — the function behind
it will run happily.

`getCurrentTeamOwner()` returning null no longer means "signed out". The
middleware means nobody unauthenticated reaches a page at all, so a null owner is
a real login with **no `team_owners` row** — a real state, and copy written for it
says the login is not linked to a team rather than "sign in".

## 0.5 The sealed groups

Six groups of tables are sealed, meaning that an owner — **the commissioner
included, because he is a competing owner** — may not read them while a
competitive window is open:

1. `waiver_claims`
2. `free_agent_offers` (and the poach bids that run through them)
3. the auction bid tables — `bids`, `bid_years`, `bid_delegations`,
   `bid_withdrawals`, `bid_player_hides`
4. Auto-Bid tags, targets and exposure limits (RB 6.4(b))
5. trade proposals not yet fully accepted (RB 7.6(b))
6. `watchlist_markers` at the private tier (RB 7.9(b)(ii))

**The seal is a property of the grants, not of anyone's discretion.** It survives
a tool that bypasses row-level security: the Supabase MCP connection runs as
service role and bypasses RLS entirely, so it is never pointed at a sealed table
while a window is open. This constraint is load-bearing and not advisory.

`preview_fa_window` is the shape of the risk: it runs the award engine and rolls
it back, and its ranking *is* the sealed offers. It refuses a non-officer and
refuses before `closes_at`. Until September 16, 2026 it did neither, and any
signed-in owner could read an open window's offers through it.

## 0.6 The surfaces

| Route | What it is |
|---|---|
| `/` | Renders nothing. Redirects a linked owner to his Team HQ and anyone else to `/league`. |
| `/team/[teamId]` | **Team HQ.** Three tabs — Overview, Roster, Money — plus a Media tab on the owner's own HQ only. The owner directory is a block at the foot of Overview. |
| `/league` | This week's scores and the standings table, at a glance. |
| `/scoreboard` `/standings` | The full pages. The Refresh from Sleeper control on `/scoreboard` is deliberately **not** officer-gated — waiver priority went stale whenever the commissioner was away on a Tuesday. |
| `/matchup/[week]/[matchupId]` | Both sides of a pairing from one read. Shows per-player production, so it is never made public. |
| `/cap-sheet` | The league cap sheet, with a compliance Status column. |
| `/calendar` | Every dated instant, each citing its rule. |
| `/player/[playerId]` | The player card: contract, history, cap and cash, warnings. |
| `/free-agency` | Live windows as cards with countdowns, the resolved list, and the shared offer form. |
| `/poaching` | The market's state, the owner's own exposure first, then every squad with the rookie bar. |
| `/waivers` | The wire and the owner's own claims. Claims are sealed until the run. |
| `/trades` `/trades/new` `/trades/[tradeId]` | Propose, accept, and view. |
| `/restructure` `/fifth-year-option` | Contract operations. |
| `/transactions` | The league transaction log. |
| `/draft-picks` | The pick board with full ownership chains. |
| `/injury-report` | The league injury report. |
| `/league-finances` | Every team's fines, itemised, to every signed-in owner. |
| `/prospects` | The rookie prospect board. |
| `/actions` | The public Action Log (RB 1.11). |
| `/install` | How to put the application on a phone. Reads nothing — no database, no session, no league state — which is the only reason it is safe to serve signed-out. |
| `/admin` | The Commissioner Portal, and the only door to the thirteen admin pages. |
| `/bids` | The auction. Dormant, and deliberately absent from the navigation drawer. |

`components/NavDrawer.js` is the application's only index. It is a static list
with no server query. **Anything missing from it is genuinely hard to find**, so a
new route is checked against the drawer before it is called reachable.

## 0.7 The installed application

The application is installable on a phone home screen. **It creates no second
version**: one repository, one deployment, one commit. The manifest, the service
worker, the offline card, the icon set and the install page are metadata and a
how-to page, not a second build. There is no static export and there must never
be.

- **The service worker caches the shell and only the shell** — content-hashed
  static assets, icons, the offline card. No route HTML, no API response, nothing
  cross-origin, nothing but GET. **A cached dollar amount is a wrong dollar
  amount.** No route is ever added to that list to make the application feel
  faster offline.
- The offline card carries no figure, no name and no date, deliberately.
- **The kill switch is two halves and both are load-bearing:** a flag in the
  worker, plus `Cache-Control: no-cache` on the worker file and
  `updateViaCache: 'none'` at registration. Remove either half and flipping the
  flag can take a day to reach a phone.
- `viewport-fit=cover` is a bug fix, not decoration: the safe-area insets the app
  bar has paid since phase 1 were returning zero on every iPhone because nothing
  asked for the full screen.

## 0.8 The three wires

The application publishes to three Discord channels. RB 1.10(c) states the rule in
vendor-neutral terms; these are the three implementations.

| Wire | Channel | Publishes | Prose | Listens |
|---|---|---|---|---|
| **Mort_Report** | `#mort-report` | every entry of the transaction log; the losing bidders of a contested free agency window once it resolves | templated | no |
| **The League Office** (Robo Goodell) | `#league-office` | calendar notices at seven days, one day and the hour; every fine in full; the commissioner's memos | templated, deterministic | not yet |
| **Dianna** | `#insider-threat` | what owners submit to the rumour desk under RB 7.9(c) | model-written | not yet |

Structurally the three are one pattern, and the next wire should be too (Part V,
T.11): a broadcast ledger keyed so a thing is said exactly once; a line builder in
SQL, so the league's wording lives in one place; a `_say()` posting through
`pg_net` to a webhook read from Vault, never from the repository or a chat; and a
`_dispatch()` on a five-minute `pg_cron` tick with a **24-hour age floor**, so a
wire switched on, or a kind unmuted, is followed by silence rather than a flood of
backlog.

**No wire mentions anyone**, and nothing in the application can make a wire speak.
Execute on every wire function is revoked from `anon` **and `authenticated`** —
Supabase's default privilege lands on both, and the first Robo Goodell grant sweep
revoked only `PUBLIC`, leaving every signed-in owner able to post arbitrary text
as the League Office until `goodell_05` closed it.

Only Dianna's prose is model-written, and every number, name, team, position and
pick in it is substituted from the database **after** the model has written its
sentence. Robo Goodell's is templated and deterministic — the same event always
draws the same phrasing — because his subject matter is a public record and a
requeue must read identically to the first attempt.

## 0.9 Scheduling

Seven `pg_cron` jobs run every five minutes and act only on what is due. **Five
minutes rather than a fixed hour** because `pg_cron` runs in UTC, the league
calendar is Eastern, and the offset changes on November 1 — a job pinned to a UTC
hour would drift by an hour twice a year against instants that must not move.

`league_config.wire_starts_at` gates the entire weekly cycle. Null or in the
future and nothing happens; every scheduled job returns *"skipped: wire dark"*.

Nothing resolves a free agency or poach window unattended (RB 5.14(h)), and
nothing performs a league year rollover unattended (RB 1.12(a)). Those are
deliberate: both are officer judgements, and a scheduler cannot exercise one.

---

# PART II — ENFORCEMENT, RULE BY RULE

*Numbered to match the Rule Book. TM 5.17 is how RB 5.17 is enforced.*

## 1. General

### 1.1 Intent and loopholes — NOT ENFORCED BY DESIGN

A rule about how rules are read. Nothing enforces it and nothing should try to.

### 1.2 Officers — BUILT

The co-commissioner is a real role with its own permission set, built August 25,
2026. The appointment is recorded in the public Action Log under RB 1.11(a).

The **approvers** in RB 1.2(d) do not exist in the application, because the offices
are vacant. This matters in one place: RB 7.7(c) routes approval to them where both
officers are parties to a trade, and the application has no path for that case. It
is Part IV, item 12.

The distinction between the **widened** and **strict** officer gates is the
application's expression of RB Appendix A.2. Where a power is reserved to the
commissioner, the page, its Server Actions and the database function behind it are
all strict, and they are widened or narrowed together or not at all.

### 1.3 Grievances — NOT ENFORCED BY DESIGN

A human process. The application records outcomes it is told about; it adjudicates
nothing.

### 1.4 The season and the weekly cycle — BUILT

**The four instants are data, not arithmetic.** `league_weeks` carries `charge_at`
(pay), `first_game_at` (start of play), `wire_runs_at`, `compliance_at` and
`last_game_at`, stored per week. **Nothing computes a weekday.** This is the whole
of RB 1.4(f): the NFL moves games, and a rule derived from "Tuesday" rather than
from a stored instant is wrong in any week the NFL rearranges.

`charge_at` previously doubled as the start-of-play marker and no longer does.
Anything asking "when does this week begin" reads `first_game_at`.

The 2026 calendar pays Weeks 2 through 14 on the Tuesday preceding their first
game. Week 1 of 2026 charged on Wednesday, September 9 under the prior wording and
is not restated.

*Why the letter is (f) and not (e):* the change set of September 13, 2026 numbered
this clause (e). It is (f) because (e) carried the 2026 In-Season transition and
was cited by what is now RB Schedule A.1. The Rule Book holds (e) open for the
same reason.

**Schedule A.1 needed no code.** Every season boundary lives on the League Calendar
and every consumer keys on the rule reference rather than on a stored date, so the
2026 transition was applied as four calendar rows — 1.4(b) "Off-season ends",
1.4(c), 3.6(a) and 5.5(f) — carrying 8:00 PM ET September 8, 2026. The 2027 rows
were not touched and still describe the standard calendar.

### 1.5 The League Calendar — BUILT

`/calendar` reads a database view that unions the dated rule-book events, each
carrying its rule citation, with the season's weekly charge calendar, all rendered
in Eastern.

**The calendar is the authoritative home for dates and the rule text is the
authoritative home for the rule** (RB 1.5(b)–(c)). A quick-reference date table
used to live inside the governing document and had already drifted from the rules
once; it was retired at Version 13 and must not come back. Where a calendar row
and a rule disagree, the row is the defect. That happened on September 15, 2026:
the trade deadline row still read the former instant (00:01 ET Tuesday, December 1)
and was corrected to 23:59 ET Monday, November 30 the following day.

The Calendar Loader at `/admin/calendar` is **commissioner-only** — page, Server
Actions and every `calendar_*` function — which is RB Appendix A.2(e).

### 1.6–1.7 Rule changes — NOT ENFORCED BY DESIGN

Votes are held outside the application.

### 1.8 Teams — BUILT, PARTIAL

Ten teams exist. The three-letter code in RB 1.8(c) exists and is what the
alphabetical coin-toss tie-break in RB 9.1(c)(iv) reads. A team rename is a
commissioner action; nothing in the application prevents one, and RB 1.8(b) binds
the owner rather than the system.

### 1.9 Rounding — BUILT

`lib/formatMoney.js` is the **single** money formatter. It replaced eleven copies,
and every money call site changes by editing it. It rounds to whole dollars, half
away from zero, with the locale pinned. Rule-level rounding — round **up**, per RB
1.9 — is done in the database wherever a rule computes a figure; the formatter
presents, it does not decide.

### 1.10 Correspondence and publication — BUILT

(a) and (b) bind owners. (c), the three wires, is Part I, 0.8 and Part V, T.11.

RB 1.10(c)(ii) requires the league office wire to announce a calendar entry three
times. Two consequences follow that are the application's call rather than the
commissioner's:

- **An entry whose time is not exact gets no at-the-hour notice.** Firing one
  would announce a precision the calendar row does not have. Those entries get the
  seven-day and one-day notices, and the prose reads *"Friday, December 18 (time to
  be confirmed)"* rather than a clock time.
- **A provisional entry says so on its own line, every time.** Most of the playoff
  calendar is provisional and the wire must not harden it by accident.

**The idempotency key is the whole design.** `goodell_broadcasts.broadcast_key` is
a text primary key and it is the only thing standing between the league and a bot
that says the same thing forever:

```
evt:<event uuid>:7d    evt:<event uuid>:1d    evt:<event uuid>:now
fine:<cash tx uuid>
memo:<memo uuid>
```

One function builds the candidate list and **the dispatcher, the seeder and the
officer preview all read it**, so what the wire is about to say and what it does
say cannot drift apart.

**The memo desk** is `/admin/league-office`, on the widened gate, because drafting a
memo is an operation and not a ruling. Three delays only — now, tonight (20:00 ET,
rolling to 09:00 tomorrow if it is already past eight), tomorrow (09:00 ET) —
computed from Eastern local time so that daylight saving needs no arithmetic. The
body is capped at **1,800 characters, not 2,000**: Discord's limit is 2,000 and the
wire adds its own opener and closer. The cap is a CHECK constraint, re-checked in
the function, and enforced again on the textarea — three layers, because the
failure mode is a Discord 400 that would leave the memo marked as posted.

**Withdrawal is real but it expires.** A memo may be pulled until a broadcast row
exists for it, after which the refusal is the only honest sentence available:
*"Too late. He already said it. Discord has no take-backs from here."* Nothing in
the application posts to Discord — only the five-minute sweep does — which is why a
pulled memo is genuinely never said and why the window is exactly as long as the
next tick.

### 1.11 Transparency and the Action Log — BUILT

Every officer action writes to the log automatically, with the time and the reason
given at the time. The log is readable with no login.

**Deletion preserves a full snapshot of whatever was removed inside the log
entry**, so the record survives the thing it describes. That is what makes RB
1.11(b) a correction tool rather than a hole.

### 1.12 League year rollover — BUILT

Built September 4, 2026. A **dry run** reports what would expire, what would
accelerate, and each team's roster before and after, without writing.

Tested by prototyping the 2027 and 2028 rollovers and rolling them back: 62
contracts expire into 2027 carrying no acceleration, 68 into 2028 carrying 417.13,
and **no team's cap for the new season moved by a cent across the rollover** — the
charge hands off from the contract to the expiry event exactly.

The rollover is invoked by an officer from an admin page, **never by a scheduler**.
The league year has never been advanced; the first live rollover is March 1, 2027.
Before this was built, the contract status list had an "expired" value that nothing
ever set.

### 1.13 Designated providers — BUILT

The current designations are in Part I, 0.1. Three notes on the seam:

- Position eligibility (RB 3.1(b), RB 3.5(c)) is Sleeper's. The compliance banner
  counts the contracts the application holds, so the banner and Sleeper can
  disagree about position limits until rosters are synced.
- Injury designations arrive through the daily injury pull at 17:00 ET.
- `nfl_games` says `LA` where `players.nfl_team` says `LAR`. Byes are read through
  `edfl_nfl_team_code()` for that reason, and anything comparing the two without it
  is wrong.

## 2. Fees and Prizes

### 2.1–2.2 Fees and prizes — NOT ENFORCED BY DESIGN

Dues and prize money are real money, collected and paid by the treasurer outside
the application.

**2.1(c) has one application-side half.** A purchase of Owner Cash is recorded as a
`team_cash_transactions` row and is automatically written to the Action Log under
RB 1.11 and RB 10.1(b). The real-money side is the treasurer's.

**2.1(b)(ii) auto-drive is not a mode in the application.** An auto-drive team is an
ordinary team whose transactions an officer makes; nothing marks it, and nothing
restricts it. That is a gap rather than a decision, and it has never bitten because
no team has gone unpaid.

### 2.3 Monetization — NOT ENFORCED BY DESIGN

## 3. Roster

### 3.1–3.2 Starting lineup and bench — BUILT

The twelve-slot template is the league's own and lives in `edfl_best_ball_lineup()`
(Part V, T.1), not in Sleeper's lineup settings. Sleeper decides only which
position a player may fill.

### 3.3 Practice squad

**(a)–(b) Size and eligibility — BUILT.**

Eligibility under RB 3.3(b)(i) — draft class, not contract start — **has been one
function since September 20, 2026**: `edfl_taxi_rule_subject(contract_type,
draft_year, start_year, season)`. Every reader of the rule calls it: the gate
(`check_taxi_eligibility`), the week counter (`taxi_weeks_credit_due`) and the
status view (`taxi_eligibility_status`).

*Why it is one function.* Until that date only the gate read the draft class; the
counter and the status view keyed on contract **type**. For one week every rookie
contract accrued a three-week credit and carried a warning whether or not the
player was eligible — 47 active rookie contracts from the 2023 and 2024 classes, 43
of them credited for Week 2. The 43 credits were voided with a reason by
commissioner ruling of September 20, 2026 (`psclass_05`); no lock had fired and no
player was wrongly held. **A rookie contract must now carry a `draft_year`** (check
constraint, `psclass_01`), so the rule can never be asked about a contract with no
class.

This is the clearest case in the project of the principle behind RB's insistence on
one statement of a rule: three readers of one rule, two of them reading a proxy for
it, and the proxy was wrong for a whole week without anyone noticing.

**(c) Cap and cash — BUILT.** Built August 26, 2026. `cap_charge` in
`contract_year_computed` omits non-guaranteed salary while a contract's
`roster_status` is taxi; `cash_value` never does. **The two halves of this clause
pull opposite ways and sit one line apart in the same view**, which is deliberate:
they are one rule and must change together.

Measured effect of filling a practice squad to seven: roughly \$17 to \$27 of cap
per team, against seven players off the active roster. **This is a roster
instrument, not a cap instrument**, and an owner who treats it as cap relief has
misread it.

**(d)–(e) Automatic return — BUILT.** The return runs from `pg_cron` and bypasses
the practice squad slot check through a transaction-local flag, so **it can never
half-complete** — which is what RB 3.3(e) requires. It is stamped once per week on
`league_weeks.taxi_reverted_at`, which is what stops it undoing an owner's
deliberate re-elevation later the same day.

Transition: the six rookies elevated on September 9, 2026 are grandfathered where
they sit via `league_config.taxi_revert_baseline_at`. The two practice squad
contracts elevated the same week are not, and returned on the first run.

**(d)(i) The hold — BUILT** September 21, 2026 (`psx_01`, `psx_03`, `psx_04`).
`taxi_active_holds` holds one live row per contract; `edfl_taxi_held(contract)` is
the predicate; `taxi_hold_set(contract, hold, note)` is the owner's (or an
officer's) write path and refuses with the rule's sentence — not on the active
roster, not a 3.3(b) subject, locked, or not elevated from the practice squad.
**The return skips a held player because the list it iterates does**:
`edfl_taxi_origin_actives()` now reads `edfl_taxi_revert_subject(contract)` — the
one statement of "would the return move him" (SR-70), which the roster's Hold
control also reads as `taxi_eligibility_status.elevated` — and then excludes
`edfl_taxi_held()`. **A hold is a property of one elevation.** An `AFTER UPDATE`
trigger on contracts clears it, with a reason, the moment the player leaves the
active roster by any path or his contract ends; the fourth-week lock in
`taxi_weeks_credit_due()` clears it with `locked (fourth week)`. RB 3.3(i) is
untouched by design: the counter never asked whether a player was held and still
does not. The Move dialog offers the hold as a checkbox on a practice squad →
active move and makes it as a **second call after the move has succeeded**, so a
refused hold never undoes a promotion.

**(f) Practice squad and injured reserve — NOT BUILT for 2027.** There is no
eligibility gate on the injured reserve path in 2026, only the ten-slot count, and
a move between the practice squad and injured reserve in either direction is not a
promotion under RB 3.3(i)(i). Four rookie contracts moved practice squad to injured
reserve during 2026 and are exempt under RB Schedule A.6. Enforcement is owed for
League Year 2027 and needs the 2027 calendar seeded first. Part IV, item 10.

*What was tried and withdrawn:* a wider amendment counting practice squad contracts
on injured reserve against the RB 3.3(b) slots was withdrawn on September 10, 2026.
The NFL does not allow practice squad players on injured reserve, which is where
the clause came from, and the amendment would have built a structure around a case
the rule exists to prevent.

**(g) Poaching — BUILT.** See TM 5.17. Version 22 struck a trailing phrase here —
"without the player clearing waivers" — that described a route RB 5.17 does not
create.

**(h) Conversion — BUILT.** The conversion branch of `set_roster_status()` opens for
an officer, or while a calendar window under RB 3.3(h)(ii) is open. **Six
convertibility tests run first and the slot checks run above them**, which is how RB
3.3(h)(i)'s "every eligibility test binds the officer exactly as it binds an owner"
is made true rather than merely asserted. A **seventh** test, added September 15,
refuses a player locked under RB 3.3(i), so the standing conversion power cannot
undo a lock.

The Action Log records **which authority was relied on** — commissioner power
outside a window, relief window inside one. `edfl_practice_squad_convertibility()`
lists, for an officer, every active contract with the reason it fails or the slot
counts it would need. The conversion is the ordinary Move control on the roster;
there is no separate officer page.

**(i) The three-week limit and the lock — BUILT.** The counter was built September
13, 2026 and the lock on September 15.

`taxi_week_credits` holds one row per player per counted week; `taxi_active_locks`
holds one live row per player per season. **Both are keyed on `player_id` rather
than `contract_id`**, so a trade or a claim cannot hand a player a fresh three weeks
or wash off a lock.

**Limb (A) is a trigger, not a branch.** It is a `BEFORE UPDATE` trigger on
contracts rather than a branch inside the roster-move function, because the waiver
run, a claim award and any future administrative path all promote players and every
one of them must lock alike. The trigger's WHEN clause — old status taxi, new status
active — is also what makes a move to or from injured reserve incapable of firing
it, which is RB 3.3(i)(i). Limb (B) runs inside the weekly credit job.

`edfl_taxi_eligibility_spent()` was redefined to mean **locked** and no longer means
three credits. That is what allows the last demotion RB 3.3(i) grants, and what
stopped the Tuesday automatic return raising on the first player to reach three.
Anything that branched on the old meaning is wrong — see Part V, T.3 for the two
surfaces that still read the old sentence.

**Clearing waivers voids the credits and the lock together**, through a trigger on
`waiver_placements`, so any future path that clears a player resets both without
needing to know about it. The self-claim carve-out in RB 3.3(i)(v) shipped September
16, 2026 with its own reason text.

*Why a re-signed rookie cannot come back on a rookie contract* (RB 3.3(i)(iv)):
`free_agent_offers` permits only active or practice-squad offers, and there is no
path in the application that mints a rookie contract outside the draft. **The rule
is structural, not a convention.**

**(j) Promotion never costs money — BUILT.** This is why the lock is a change of
contract type and nothing more. Every practice squad contract in the league already
sits at the league minimum for the season, so there is nothing to top up, and
rewriting the deal as a fresh prorated minimum would have **reduced** what several
of them carry. Guarantees survive as written. Tested September 15: the cash total
and the contract-year row count are identical either side of a conversion, on both
the promotion limb and the fourth-week limb.

### 3.4 Injured reserve — BUILT (ADVISORY on eligibility)

Built September 20, 2026 (`injflag_01`–`04`). **The designation set is one
predicate**, `edfl_injury_designation_qualifies(text)`, read by the roster, the
player card, the Matchup page and the compliance view. One set answers both
questions RB 3.4(b) asks — the roster mark and the slot — so the two can never
drift apart.

The red cross the application draws (`components/InjuryCross.js`) **decides
nothing**; it renders the view's label.

**RB 3.4(b)(i) is flagged, never blocked, and the choice was deliberate.** Blocking
cannot handle the commoner case — a player placed on injured reserve legitimately
whose designation clears the week after. A block would refuse the legitimate
placement and would have to be unwound by hand; a flag lets the owner cure it at the
compliance instant like any other overage. `set_roster_status()` was not touched.

*What the ruling replaced:* the former list was Doubtful, DNR, Holdout and Opt-Out,
which omitted the two designations most injured reserve slots are actually held on.
PUP was ruled in because a player on the physically-unable-to-perform list cannot
practise, which is the fact an injured reserve slot exists to hold. Questionable and
NA are in neither half. At the ruling, 17 of the 18 injured reserve slots in use
were held on IR or Out; one rostered player carried NA and was not on injured
reserve.

### 3.5 Position limits — BUILT, PARTIAL

The counts are enforced by the compliance view. **Position itself is Sleeper's**
(RB 3.5(c)), so the banner and Sleeper can disagree until rosters are synced.

### 3.6 Compliance — BUILT

Built September 8, 2026. Each team page carries a compliance banner and the league
cap sheet a Status column, **both reading one database view that composes the
reasons in words**. Before the In-Season boundary the live test showed as a warning
naming the deadline; from the boundary it is the rule.

The ten-player injured reserve limit is read from league configuration rather than
from code. The injured reserve designation test was added to the view on September
20, 2026, with every team reading compliant before and after.

**The Team HQ roster bar reads this view and counts nothing** (September 21, 2026).
`psx_04` appended per-squad position counts (`qb_ir_count`, `qb_taxi_count` … for
all five positions), the `*_over_by` figures and the `*_short` / `flex_short`
shortfalls the view was already computing for its `reasons`. The bar's nine boxes
— four squads against their limits, five positions as Active / IR / Practice Squad
— turn red only when one of those columns says so, and each box links to the
Roster tab filtered to that section. The 3.3(b) "not on a rookie deal" filter on
that tab reads `taxi_eligibility_status.ps_rule_subject`, so an out-of-class
rookie is counted where the view counts him.

**(e) Award-and-oblige — BUILT.** The award engine trial-awards each candidate inside
a savepoint and reads the result back **through the same views the cap sheet uses** —
`team_cash_available`, `team_cap_by_season` and the roster counts — so the gate and
the page cannot disagree. A former ceiling bypass during an award is gone, and the
deferred ceiling trigger backs the gate up.

*Why (d) is reserved:* the change set of September 13, 2026 numbered this clause
(e); (d) is held open so that its cross-references stand. The Rule Book holds the
same letter for the same reason.

## 4. Rookie Draft

### 4.1 Process — NOT ENFORCED BY DESIGN

The draft is conducted in Sleeper. The application records its results.

### 4.2 Pick assignment — BUILT, PARTIAL

Draft pick **ownership** exists for 2023 through 2029: the four completed drafts
(2023–2026, 130 selections) are recorded pick by pick, and picks for 2027, 2028 and
2029 are seeded for all ten teams across four rounds, tracking ownership only, with
each pick remembering the team whose standing determines its draft position.

A league-wide pick board and a Draft Picks tab on each team page show every pick
with its full chain of ownership (September 8, 2026).

**The order itself — RB 4.2(b)–(d) — is computed at the end of a season and has never
run**, because no season has ended.

### 4.3 Eligibility — BUILT

Rookie contract auto-fill is driven by the draft slot; the eligibility question in
RB 4.3 is the commissioner's and is recorded rather than enforced.

## 5. Contracts

### 5.1 Contract dollars — NOT ENFORCED BY DESIGN

### 5.2 Cap, Cash and PPV — BUILT

The PPV weighting in RB 5.2(d) is exactly the weighting the application has always
used to compute PPV on every contract. It is computed in the database and never in
JavaScript.

### 5.3 Salary cap — BUILT, PARTIAL

The base cap is a figure the commissioner sets each season. `/cap-sheet` and the
Money tab read it.

**What is not built is the derivation of a team's ceiling from the preceding
season** — see TM 5.5.

### 5.4 Salary floors — NOT BUILT

Nothing enforces either floor, and there is nothing to enforce yet.

- **The Season Cap Floor (RB 5.4(a)–(b))** is measured at the December 15 close,
  which does not exist. Part IV, item 4.
- **The Multi-Season Cash Floor (RB 5.4(d)–(h))** cannot be tested until February
  21, 2029. What exists today is the `team_cash_transactions` ledger and the
  `team_cash_available` view, both keyed by season, both already recording 2026
  spending correctly. What is missing is a cash budget for any season after 2026 and
  a window-level aggregate. Both should be built as part of the season rollover
  work rather than piecemeal.

*Where the multi-season floor comes from, and why it is shaped as it is.* RB
5.4(d)–(h) are modelled on the NFL CBA. Article 13, Section 6(b)(v) lets a club
carry unused cap room forward with no limit and no expiry, exactly as RB 5.5 now
does, and the NFL has no per-season spending floor at all. What prevents a club from
hoarding that room is Article 12, Section 9, which requires Minimum Team Cash
Spending of 90% of the salary caps across multi-year periods — three or four League
Years at a time — with any shortfall paid directly to the players. The CBA expressly
states that carrying over room does not affect that obligation, which is what RB
5.4(h) reproduces. EDFL uses 89% rather than 90% to match the Season Cap Floor, and
three-season windows throughout rather than the CBA's mix of three- and four-year
periods.

### 5.5 Salary Ceiling — BUILT, PARTIAL

**Built:** the hard block in RB 5.5(f), which enforces nothing before the season
start date, exactly as the rule says; and the 125% auction allowance in RB 5.5(g).

**Not built:** rollover. `league_cap_settings.cap_ceiling` is a single figure the
commissioner sets by hand each season and is currently NULL, so every team's ceiling
reads as the \$1,500 base cap. The application does not compute rollover and does not
derive any season's ceiling from the preceding season, as RB 5.5(a)–(e) describe.
The December 15 close that RB 5.5(c) names is Part IV, item 4.

The five-season grid on the team page showed a flat 111% ceiling for every season
until September 16, 2026, when it was changed to show the **enforced** ceiling.

*A consequence of the hard cap worth stating.* With RB 5.5(f) as written, cap
non-compliance is almost unreachable by an owner's own action; it arrives chiefly
through dead money. A 105% allowance was discussed on September 13, 2026 and
withdrawn the same day. It never entered the governing documents, and no percentage
allowance was ever deleted from RB 5.5 — none existed apart from the auction
exception in (g).

### 5.6 Minimum salary — BUILT

Enforced as **deferrable database triggers on both bids and contracts**, and as a
client-side check in the contract builder, the bid form and the Auto-Bid page, all
computing the same cash figure. The Contract Assistant tops up any season it would
otherwise generate below the floor, and says so when it does.

*Historical note, kept because it bounds what the audit trail can be asked:* the
contract-side trigger did not exist until August 5, 2026. Contracts created before
that date were never checked. An audit at the time confirmed every existing
non-exempt contract satisfies the cash rule.

The 5% growth rate in RB 5.6(a) is an assumed rate, not one derived from real NFL
figures. It exists so the floor keeps pace with an inflating cap rather than
shrinking in real terms every year.

### 5.7 Contract length — BUILT

Built and enforced August 11, 2026, and applied retroactively to every option bonus
then existing — **42 automatic void seasons added across 11 contracts**.

**The database distinguishes the two kinds of void season explicitly** and refuses
an option bonus scheduled into a void season. Client code must never create, count
or limit option void seasons (Part I, 0.3).

### 5.8–5.9 Rookie contracts and the Rookie Wage Scale — BUILT

The pick-by-pick values are a reference table in the application; selecting a
drafted rookie's draft slot fills in his entire contract automatically.

**The Fifth Year Option (RB 5.9(e)–(g)) was built September 4–6, 2026** (`fyo_01`
through `fyo_16`). The option is decided from the player's card by the owning team
and reversed by an officer from `/admin/fifth-year-option`. **The tag-value table
stores the cap percentage, not the dollar figure**, so later seasons derive from
their own cap rather than from the 2027 figures being re-typed.

Seven of the ten 2023 Round 1 decisions were taken September 6–8, 2026: exercised
for De'Von Achane, Jahmyr Gibbs, Bijan Robinson, Rashee Rice and Jaxon
Smith-Njigba; declined for Zay Flowers and Jayden Reed. Puka Nacua, Chase Brown and
Tucker Kraft were undecided at this version.

**The EDFL Pro Bowl (RB 5.9(g)) is a published record, not a live computation.** The
2021–2025 record was published September 6, 2026. That it is published once and
never recomputed is the whole reason a team can decide an option without the tier
moving underneath it.

*Why the guarantee profile in RB 5.9(c) is shaped as it is:* the real difference
between an early and a late pick is not the size of the contract but how much of it
is guaranteed. A first-round pick's deal is fully guaranteed, as a real first-round
rookie's is; the protection shrinks through the draft until the last picks are paid
the minimum with no guarantee at all and can be cut with no penalty — the same as a
real late-round rookie who earns his place every season.

### 5.10 Free agent contract calculation — BUILT

Signing bonus proration and both kinds of void season are fully built and live. The
contract and bid builders carry a disclaimer that their void-season control applies
to signing bonuses only.

**Void acceleration under RB 5.10(c) was built September 4, 2026 and applied to
every existing contract with no grandfathering** — 46 contracts were carrying
2,508.43 of proration in seasons past their own end when it ran. Total cap charged
league-wide did not change; only its distribution did.

**It is computed from the contract's shape rather than by a scheduled job**, so it
cannot fall out of step with the cap sheets and player cards. This is the general
pattern: a figure derived on read cannot drift from its inputs, and a figure written
by a job can.

### 5.11 Extensions — NOT BUILT

The date windows are a straightforward calendar check. The value test in RB 5.11(d)
reuses PPV maths the application already runs on every contract. The one new piece
is tracking rookie eligibility off each player's original real NFL draft year, which
already exists on every rookie contract — so this is a rule to enforce, not new data
to collect.

**One trap is already known.** `contract_status = 'extended'` has no matching event
type. Whoever builds extensions adds it in the same migration or reopens a cap hole.
Part IV, item 7.

### 5.12 Retiring players — NOT ENFORCED BY DESIGN

The commissioner retires players in the application. The cash and cap restoration in
RB 5.12(d)–(e) is done as a correction, not by a dedicated path.

### 5.13 Franchise and transition tags — NOT BUILT

All three tag types exist in the data model. **The pricing logic — the position
averages, the 120% floor, and draft-pick compensation bookkeeping — is not built.**
Tags are unusable in 2026 under RB Schedule A.11 in any case: there is not yet a
market of signed EDFL contracts to compute a fair position average from.

### 5.14 In-Season free agency — BUILT

Built September 7, 2026 (`proration_01`–`07`, `freeagency_01`–`12`) and in
production the same evening: by 10:17 UTC on September 8, twenty-three players had
been signed, every one on the first-offer path in RB Schedule A.2, six of them
straight to the practice squad.

**The offer tables are a sealed group** (Part I, 0.5) and have no commissioner read
while a window is open.

**One award engine serves every path.** First-offer awards rank by clock; resolved
windows rank by PPV; a poach bid is an ordinary `submit_fa_offer` call routed by the
database. The engine trial-awards inside a savepoint and reads the result back
through the cap sheet's own views, so the gate and the page cannot disagree.
`preview_fa_window` runs the same code and rolls it back.

**The proration in RB 5.14(g) lives in the contract views, never in the stored
contract**, so every rule on the writing of a contract tests the contract *as
written* — which is what RB 5.14(g) requires and what makes a mid-season signing
testable against the 30% Rule at all.

**There is no Withdraw, on purpose.** RB 5.14(d) permits only upward revision.
`withdraw_fa_offer` still exists and **refuses every call by design**; the button is
gone. Historical withdrawn rows and the `fa_offer_withdrawn` feed kind remain and
stay mapped. Do not "fix" the function and do not re-add the button.

**A revision must carry strictly higher total PPV than the offer it replaces, keeps
the original `submitted_at`, and cannot turn an active offer into a practice squad
offer.** That is RB 5.14(d) and (e) in one place.

**Who opened a window is sealed until it resolves.** The board view returns
`opened_by` null while a window is open or closed-unresolved, and the column is
sealed by grant. The page prints "Sealed".

The 24-hour window shipped September 14, 2026 (`freeagency_13_window_24_hours`).
Every one of the season's 34 windows to this version has resolved, and windows have
closed on their own clock since the first-offer exemption ended.

`/free-agency` was redrawn September 19: every live window as a card with a
countdown, the resolved list, and **one shared offer form** that both it and
`/poaching` mount.

*Not yet exercised at this version:* an offer refused live for Owner Cash or for the
ceiling.

### 5.15 Waivers — BUILT (with the playoff wire NOT BUILT)

Implemented and tested September 13, 2026, replacing the September 7 draft in full.

**The run is a pure resolver that writes nothing, and an apply step that persists
exactly what the resolver returned.** There is one implementation of the rules, so a
preview and the run itself cannot disagree.

**Claims are sealed by RLS until the run executes.** The commissioner is a competing
owner: no tool, the service-role connection included, reads `waiver_claims` between
a wire opening and its run.

**On RB 5.15(h), the frozen week count.** `waiver_placements.weeks_charged_at_waive`
is captured at the waive and read by the settlement. A live count would sweep up the
Tuesday salary instant on the way to a Wednesday run, for a player the team no
longer has.

**On RB 5.15(c), the frozen priority.** `waiver_runs.priority_snapshot` freezes the
order at the run instant, so a later scoring correction can never retroactively
change who won a claim.

**On RB 5.15(n), the self-claim.** The refusal was removed September 16, and the
same migration fixed a defect that would have aborted the whole September 23 run for
all ten teams on the first self-claim awarded: the settlement reuses
`compute_trade_charges`, which refuses a transfer to the team already holding the
contract. That guard now stands aside only while a self-claim settles, through a
transaction-local flag reachable by the service role alone. The `/waivers` page
already offered Claim on every wire row, own cuts included, so no client change was
needed.

**On RB 5.15(m) and Schedule A.4.** `waiver_runs` is seeded for weeks 3–14,
September 23 to December 9. `edfl_next_waiver_run()` assigns a cut to the run of the
first week whose pay instant falls after it, so a cut at any time from September 15
00:00 to September 21 23:59 lands on the September 23 run.

**RB 5.15(l), the playoff wire, is NOT BUILT** and it has a deadline. Weeks 15–17 are
not in `league_weeks`, and the fixed 6, 5, 4, 3, 2, 1, 7, 8, 9, 10 priority order
does not exist. `waiver_runs` ends with Week 14, so **once Week 14's pay instant
passes — 00:00 ET Tuesday, December 8, 2026 — an in-season cut has no run to join,
and no cut can be made until this is built.** Part IV, items 1 and 2.

**The wire's transaction-feed kinds.** `waiver_run_apply` writes `waived_unclaimed`;
`waiver_settle_claim` writes `waived_claimed`. **Three objects carry them and all
three must move together**: `player_transaction_feed` maps event type to kind, label
and description; `league_transaction_log` **filters on an allowlist**, so a kind
missing from it is not mislabelled but invisible; and
`league_transaction_log_unmapped_kinds()` carries its own allowlist and would
otherwise report the new kinds as unmapped.

**A player on the wire occupies no roster place, in the gates as well as the views.**
RB 5.15(g) says the place is already open. The views were taught this when the wire
shipped; the four functions that *gate* a move were not, which would have shown an
owner an open slot and refused the replacement. `set_roster_status`,
`check_taxi_slot_limits`, `trade_impact` and `reverse_trade` now count rosters with
`AND NOT edfl_on_waivers(...)`. `check_taxi_eligibility` deliberately does not — it
tests eligibility and draft anchor, not occupancy.

### 5.16 Practice squad contracts — BUILT

Both halves are built. Practice squad players have always cost Owner Cash at full
value, and since August 26, 2026 the cap charge omits non-guaranteed salary while a
contract is on the practice squad. The practice squad cash maximum is enforced on
every contract year and again on a conversion under RB 3.3(h).

RB 5.16(d), expiry on the Tuesday after Week 17, is **NOT BUILT** — see TM 5.24.

### 5.17 Poaching — BUILT

Built September 15–16, 2026 (`poach_00` through `poach_07b`); the client shipped
September 16, and poaching became its own route on September 19.

**Poach-ness lives on the window, never on the offer.**
`free_agent_windows.window_kind = 'poach'`, with `incumbent_team_id`,
`incumbent_contract_id` and `retain_bar_ppv` snapshotted at opening. Every poach
bid's `offer_kind` is `active`. `submit_fa_offer` routes a bid on a practice squad
player to the poach path itself, so there is **one offer form and one caller** in the
application. Do not add a poach flag to the offer or a second RPC.

**The bid path deliberately does not test the calendar**, which is why RB 5.17(k)'s
cutoff limits *initiation* only and a window opened before it runs its full 24 hours.

`edfl_poach_offer_valid()` is the rule behind RB 5.17(c) and (d); the form's checks
mirror it and are advisory.

The award engine is the one free agency uses, with **the rookie bar and the incumbent
tie-break added**. It records the window's outcome — `poached`, `retained_by_bid`,
`retained_on_rookie_contract` or `voided` — which the page reads.

**The freeze in RB 5.17(h) is a `BEFORE UPDATE` trigger on contracts** rather than a
check in each function, so every future path is covered without being told about it.

Settlement runs through `compute_trade_charges` and the replaced contract ends with
status `traded_away`. **A cut status would have offered an officer a Reverse cut
button**, which is the reason for the choice.

The RB 5.17(f) fine is a `team_cash_transactions` row with `fine_kind = 'poach'`,
counted in the League Fund and listed on `/league-finances` beside the compliance
fines.

**The \$2 signing-bonus floor is a literal in the validator and is a ruling owed for
2027** — three weeks of a \$10 minimum is \$2.15. Rule Book Schedule B.7.

**(l)–(m) Exemptions and the 24-hour return — BUILT** September 21, 2026
(`psx_01`, `psx_02`, `psx_04`). `practice_squad_poach_exemptions` holds one live
row per contract (history kept; a release stamps `released_at` and a reason).
`edfl_ps_poach_exempt(contract)` and `edfl_ps_poachable_from(contract)` are the
two predicates, and **`edfl_poach_eligible()` gained both tests** — after the
pending-cut test and before the own-team test — so `submit_fa_offer` refuses an
exempt or in-grace player with the rule's own sentence. Both literals are
configuration, not code: `league_config.poach_exemptions_per_team` (2) and
`league_config.poach_demotion_grace_hours` (24). The two-at-a-time limit is
enforced twice, in `ps_exempt_set()` and by a `BEFORE INSERT` trigger on the
table, so no future write path can hand a team a third. **The release is a
trigger, not a branch:** an `AFTER UPDATE` on contracts releases the exemption
with a reason the moment the player leaves the practice squad or his contract
ends, whichever path moved him — the 3.3(i) lesson again. An exemption cannot be
placed on a player with a poach window already open (`edfl_poach_frozen`), so it
can stop a window opening but never close one. The grace reads the latest
`active → taxi` row in `roster_moves`, which the Tuesday return writes like any
other move, so the two rules need no knowledge of each other. `poachable_players`
carries `poach_exempt` and `poachable_from` for the board, which labels the row
the way the function will refuse it and — by ruling — shows every owner who is
exempt.

No poach window had opened at this version. **The 2026 opening moved on September
21** from 00:00 ET Tuesday September 22 to **12:00 PM ET Wednesday September 23**
(`poach_08`): one calendar row, no code, exactly as TM 1.5 intends. The League
Office wire's one-day notice had already posted for the old instant; its ledger
row was cleared by ruling so the wire re-posts the notice for the new one
(`poach_08b`), and the at-the-hour notice keys on the row and needed nothing.

### 5.18 Dead money — BUILT (with one piece NOT BUILT)

`compute_cut_charges()` / `cut_player()` is the engine. **Every rule in RB 5.18,
including the two-designation limit, is enforced in the database, not in the
interface.** Owners cut from their team page, and the application presents the full
settlement — dead cap this season, dead cap next season under June 1st treatment,
dead cash — before the cut is confirmed. `cut_history` is the public record.

**Read the designation-remaining function; never count events in JavaScript.**

The weekly calendar in RB 5.18(a) lives in `league_weeks`, seeded each season by the
commissioner from the NFL schedule. Until it is seeded, zero weeks have charged,
which is correct before Week 1.

**`cut_player()` reserved a `salary_obligation_transfers` flag and a destination-team
parameter from day one**, so waiver claims and trades reuse this engine without a
rewrite. The trade half of that promise was delivered August 24–25, 2026:
`compute_trade_charges()` is the sibling of `compute_cut_charges()` and **the two
implement one set of rules and must always change together**. It was verified across
all 233 active contracts at five effective dates — 1,165 settlements with no dollar
dropped or double-counted.

Restructure proration accelerates on a cut exactly as signing bonus proration does,
including under June 1st treatment. An in-season free agency signing settles through
the same engine with its signing-season salary prorated under RB 5.14(g).

**NOT BUILT:** the December 15 rollover close — `books_closed_at`, and dead money
from a post-close cut landing on the following league year. Part IV, item 4.

*Removed and not to be re-added:* an auction-window block formerly sat in
`cut_player()` and was removed August 13, 2026 by commissioner ruling.

### 5.19 Contract restructuring — BUILT

Built and tested September 4, 2026, in nineteen migrations. **Enforced in the
database, not in the application:** eligibility, the convertible amount, the Deion
Rule across every affected season, the minimum salary, the PPV test, whole dollars
and the permission model are all function-level checks.

The preview shows cap saved, the five-season team cap picture, and dead money by
season before an owner commits.

**Restructure proration is held in its own table and behaves like signing-bonus
proration everywhere**: it accelerates in full on a cut, stays with the giving team
on a trade, and accelerates on void under RB 5.10(c).

*Why RB 5.19(f) is written as a test rather than a description:* because converted
money moves from weekly and contingent to paid-in-full and guaranteed, a conversion
always increases PPV. The test exists to refuse anything that does not — that is,
to catch a bug rather than a strategy.

The first restructure in league history executed September 4, 2026: George Kittle,
Cash Over Cap, 116 converted from guaranteed 2026 salary over five seasons, taking
that contract's 2026 charge from 210 to 117.

### 5.20 Option bonuses — BUILT

Rebuilt August 11, 2026. **Before that date the application silently truncated an
option bonus's proration at the contract's final season, leaving 58% of all
scheduled option-bonus money — \$811.60 of \$1,401 — uncharged to any cap
anywhere.** The automatic void seasons in RB 5.7(c) and RB 5.20(d) close that leak,
and the change was applied retroactively to all 23 bonuses then existing.

The dead-money projection was corrected at the same time so that a bonus triggering
in the season of the cut counts toward RB 5.20(e); previously it contributed zero.

The automatic-trigger model dates to an earlier rebuild checked against real NFL
contracts, including Jalen Hurts' and Bryce Huff's.

### 5.21 The Deion Rule — BUILT

Enforced in two places, deliberately kept consistent: a database trigger on every
contract year, and a client-side check before a contract can be submitted, so an
invalid contract is caught before it is saved rather than only rejected afterwards.

*Where the name comes from:* a real 1990s NFL contract-structuring loophole. The
rule prevents a team stashing almost all of a contract's cost into pure
signing-bonus proration while paying the player next to nothing in real salary.

### 5.22 The 30% Rule — BUILT

Adopted and enforced August 11, 2026. Enforced as **deferred database triggers on
contracts, contract option bonuses, bids and bid option bonuses**, with a violation
rejected naming the violating season, the attempted step and the allowed maximum.

**There is a separate pair of triggers for the delegation path**, which stores its
years as JSONB and is therefore invisible to the ordinary triggers. **Do not collapse
those two triggers into one.**

**The grandfathered set is a hand-picked flag.** Never re-derive it and never copy
the flag onto a new contract. The eight contracts were identified against the live
database on August 11, 2026 (RB Schedule A.5).

*Why RB 5.22(f) exempts restructures:* signing bonus money is already excluded from
compensation under RB 5.22(a), so converting salary into a signing bonus moves money
into a category this rule does not see. Re-testing the contract afterwards would be
testing a change the rule was written to ignore.

### 5.23 Cutting a player — BUILT

(a)–(c) were built September 13, 2026 with the wire. (d) was built September 16:
once the player's NFL game in the current league week has kicked off — read from
`nfl_games`, loaded with the full 2026 schedule the same day — `cut_player()` turns
an immediate cut into an end-of-week designation, and the cut dialog shows
`edfl_cut_timing_forced()`'s sentence and disables **Cut now**.

**A trade clears an end-of-week designation.** `execute_trade` does not move
`contracts.team_id` — it sets the outgoing contract to `traded_away` and writes a new
contract for the receiving team. An open `pending_cuts` row would therefore point at
a contract nobody holds, and the firing job gates only on `fires_at`. The designation
is **withdrawn, not deleted**, so it survives for the log, and is stamped with the
executing officer.

### 5.24 Contract expiry — NOT BUILT

Contract expiry today happens only at the League Year Rollover under RB 1.12, on
March 1. **The January 5 and February 21 instants in RB 5.24, and off-season free
agency for the seven-week gap between them, are not built.** The playoff contract
type exists with no behaviour. Part IV, items 1 and 3.

## 6. Auctions, Fines and the League Fund

### 6.1 Blind Bid Auction — BUILT, DORMANT

The whole process in RB 6.1 is built and was exercised end to end for the initial
roster build in August–September 2026: sealed bids, the Deion Rule check on every
bid, evaluation, both flags, automatic flag-clearing, the recommended pass-over
order, verification, and the public results.

**Dormant since September 7, 2026 by commissioner ruling.** The auction was built to
distribute a large number of players quickly at the league's start — 57 contracts
came out of tier 5 alone — and is **kept, not deleted**. A conflict between an
auction rule and a later feature is therefore no longer a blocker to the feature.

RB 6.1(h), transparency after verification, was built September 3, 2026. Any reader
may see a winning, losing or passed-over bid on a verified tier, with its option
bonuses; published results name the team on every row. **Withdrawn bids appear
nowhere, deliberately.** Tested as an ordinary owner: he sees every result bid and
only his own withdrawals.

There is still **no dedicated interface for the "reshape the contract at the same
PPV" option** in RB 6.1(f)(iii); that step is handled directly between the owner and
the commissioner.

### 6.2–6.3 — repealed and moved

RB 6.2 (FAAB) was struck September 7, 2026. RB 6.3 moved to RB 5.15 the same day.
Both headings are kept so that the numbers below them do not move — the same reason
the Rule Book keeps them.

### 6.4 Delegated bidding — BUILT, DORMANT

The Contract Assistant behind Auto-Bid **also serves in-season free agency offers**
under RB 5.14, by commissioner ruling of September 7, 2026. Delegated standing
offers on a named free agent are a later phase and are not built; the tie-break
question they raise — a standing offer would always be the earliest under RB
5.14(e) — is Rule Book Schedule B.9.

### 6.5 Player Value Chart — BUILT

Published and maintained by the commissioner, visible in the application including
all previously published versions. **Publishing a snapshot and mapping a chart name
to a player are commissioner-only** (RB Appendix A.2(a)–(b)), because the chart sets
the market every auction bid is priced against.

The application prices an unlisted player at the **cheapest legal bid** for the
chosen length under RB 5.6, not at any chart-derived figure.

### 6.6 Bid withdrawal — BUILT

**Withdrawal arithmetic lives in the database only.** The live-bid test is
`submitted_bid_id`, never `status`; three bugs came from violating that.

### 6.7 Compliance fines and the League Fund — BUILT

Implemented and tested September 13, 2026. Fines are `team_cash_transactions` rows
under a **fine** category distinct from **penalty**, so the League Fund sums only
fines. `compliance_violations` records the measurement, the cure check and the
imposition **separately**, and the occurrence count keys on a stable violation type
rather than on the sentence shown to the owner — so rewording a message cannot reset
anyone's ladder.

`fines_impose_due()` is the only thing that writes a fine, and it gates on
`edfl_wire_live()`. The poach fine under RB 6.7(e) carries `fine_kind = 'poach'`.

A compliance fine's note already carries the week, the reason, the occurrence number
and whether it was self-cured, which is why the League Office wire prints it verbatim
(RB 1.10(c)(ii)): the League Office does not need to be told how to describe a fine
the ledger has already described.

## 7. Trades

### 7.1 Tradeable assets and settlement — BUILT

Built and verified August 24–25, 2026. `compute_trade_charges()` is the settlement
engine and the sibling of `compute_cut_charges()`; **the two implement one set of
rules and must always change together.** Every rule in RB 7.1 is enforced in the
database rather than in the interface.

**A trade does not move a contract between teams.** It closes the outgoing contract,
records the settlement as an event, and creates the receiving contract — so a team's
spending history for a player it once held is preserved rather than rewritten. Every
consumer that reads contract history depends on this.

RB 7.1(h), the settlement fixed at the last acceptance, is enforced by freezing the
settlement at that instant rather than at approval or execution. A trade concurred on
September 1st and approved on September 3rd settles as a September 1st trade.

*Why RB 7.1(e) differs from a cut's June 1st treatment:* this mirrors the real NFL,
where a June 1st designation is a release mechanism and a trade's cap treatment
follows the calendar rather than an election. It is the reason clubs commonly wait
until June to consummate a deal agreed earlier.

*Why RB 7.1(i) exists:* the Deion Rule, the league minimum and the 30% Rule govern
the **writing** of a contract, not its transfer. A trade changes who owes the terms,
not the terms. Re-testing on transfer would make a contract's legality depend on who
holds it, which no rule intends.

### 7.2 Restrictions — NOT ENFORCED BY DESIGN

RB 7.2 is a list of things the application has no representation for. Owner Cash, cap
space and dead money cannot be selected as trade assets because the asset picker
offers players and picks only. The rest — real money, favors, voting rights — binds
people.

### 7.3 Conditional compensation — NOT BUILT

A condition is recorded with the trade and adjudicated by the commissioner by hand.
Building it needs a player's actual season point total and therefore waits on the
statistics sync. Part IV, item 13.

### 7.4 Trade-backs and windows — BUILT

Trade windows, the deadline and trade-back detection are all enforced, **with the
windows read from the League Calendar rather than restated in code**.

The temporary suspension in RB 7.4(c) is a League Calendar row keyed on 7.4(a), read
by a function that wraps the trade-back test inside the single trade legality check.
**Eligibility is judged on the trade's effective time — the last acceptance — not on
approval**, in keeping with RB 7.1(h). Exercised once, per RB Schedule A.8.

### 7.5 Trade deadline — BUILT

The deadline is read from the League Calendar, never restated in code. The row was
found on September 15, 2026 still reading the former instant and was corrected the
following day — see TM 1.5. The League Office wire announces it at seven days, one
day and the hour.

*Why the instant moved one minute:* the former deadline collided with the Tuesday
00:00 instant at which Week 13 salary is charged and the wire opens. Two rules firing
at the same timestamp is a race, and the cheaper fix was to move the one that did not
have to be there.

### 7.6 Notification — BUILT

Built September 3, 2026. **One function backs the read policies on the trade, party
and asset tables:** public from accepted onward; parties only while proposed,
declined, cancelled or expired; proposer only while draft.

**There is deliberately no commissioner clause.** Both officers are competing owners,
and there is nothing for either to approve until every party has agreed — the
processing power in RB 7.7 attaches to an accepted trade, not to a negotiation.
Tested as five real owners: a non-party sees only completed trades; the commissioner
sees the same and not a draft naming his own team; a counterparty sees the one
proposal made to him and no drafts.

**Overlapping offers (RB 7.6(d)), built September 3, 2026.** The proposal and
submission checks refuse only on an accepted or approved commitment. On the last
acceptance, the acceptance function **locks the asset rows in a fixed order** so that
two competing final acceptances serialise rather than both succeeding, re-checks each
asset, freezes the settlement as RB 7.1(h) requires, and then cancels the competing
proposals with a "Superseded" reason naming the assets and the time.

The reversal conditions in RB 7.7(h)(iii) treat a contract sitting in any open draft
or proposal as still live — a deliberately **wider** test. With overlapping offers
permitted it refuses more often, and the refusal tells the owner to resolve or
discard the offer first.

### 7.7 Approval, veto and reversal — BUILT, PARTIAL

An owner proposes, every involved owner accepts, and an officer approves.

**Recusal under RB 7.7(e) is automatic** — the application refuses to let an approver
execute a trade involving his own team. **Veto under RB 7.7(d) is commissioner-only,
deliberately narrower than approval**, and is refused where the commissioner's own
team is a party, because that case requires a grievance vote.

**RB 7.7(a), the 24-hour processing window, is not built.** It is currently a matter
of when the commissioner acts rather than something the application times.

**RB 7.7(f) is a platform-side rule.** The application states it; it does not enforce
it — a player mid-trade may not appear in either active lineup, and the lineups live
in Sleeper.

**Reversal (RB 7.7(h)) is built**, with the five conditions in (h)(iii) enforced and
none of them waivable, and with the forced-reversal path in (h)(v) recorded as forced
in the Action Log.

*Why reversal recuses differently from approval (RB Appendix A.3(c)):* approval is a
judgement that a trade ought to stand, which no owner can make about his own team. A
reversal withdraws a decision already taken — most often the approver's own error —
and a commissioner who has approved a trade wrongly must retain the means to take it
back. The asymmetry is deliberate and is not an oversight.

**A reversal has no effect within Sleeper.** The commissioner restores the affected
rosters there by hand, and until he has done so the two systems disagree.

### 7.8 *(reserved)*

Version 22 and earlier used this number for the trade implementation notes, which the
application cites. It is held empty in both documents so that those citations do not
move.

### 7.9 Trade block, watchlist and the rumour desk — BUILT, PARTIAL

The database shipped September 19, 2026 (`tb_01`–`tb_04`, `it_01`–`it_08`):
`trade_blocks` (one live row per contract; a reset closes the old row and opens a new
one, so history is kept), `watchlist_markers` (sealed at the private tier),
`draft_prospects` and `draft_prospect_classes`, `insider_submissions` and
`insider_broadcasts`, and the computed reads `trade_block_status`,
`watchlist_markers_effective`, `insider_live`, `insider_feed`, `morts_thoughts` and
`draft_prospect_board`.

**Block expiry and the 14-day submission lifespan are computed from timestamps, never
stored and never scheduled.** A scheduled expiry would be a second place the rule
lives.

**RB 7.9(d) is enforced at the role level, not by anyone's memory.** A database role
named `dianna` may select from exactly two relations — `dianna_trade_block` and
`dianna_prospects` — and from nothing watchlist-shaped. **No policy for that role may
be added to any other table.** The privacy boundary is a property of the grants.

**RB 7.9(c)(ii) is a CHECK constraint, not a form rule.** `insider_submit()`
re-checks every combination and **returns its refusal as a sentence**, which the
Server Action passes through unchanged. The application never composes its own
wording for a rule the database owns.

**Dianna's prose is model-written and her facts are not.** Every number, name, team,
position and pick is substituted from the database **after** the model has written
the sentence. This is the deliberate difference from the League Office wire, whose
prose is templated: gossip needs to sound alive, and a public record needs to sound
the same every time.

**NOT BUILT (batch 2):** the block and watchlist controls on the player card header,
the `/trade-block` and `/watchlist` pages, and Dianna's listener. Part IV, item 11.

*Why RB 7.9(a)(i) behaves as it does — the sustained block.* A block still standing
after its fourteenth day tells the league somebody is interested, and a rival can keep
a player on the block by leaving his interest there. Both were considered and both are
intended. The block is advisory, so neither costs anyone anything.

## 8. Gameplay

### 8.1 Format — BUILT

**Best-ball scoring is computed here, not taken from Sleeper.** See Part V, T.1 for
the full note. In summary: `player_week_scores` stores the whole roster, one row per
player per week, with `roster_status_at_sync` frozen at write time; eligibility is
applied at **lineup time** rather than write time, so a change to the eligibility
ruling is a recompute and never a re-pull, and a player moved to the practice squad in
Week 6 cannot rewrite what he was in Week 3.

**RB 8.1(c), the final-week rule, is one view.** `league_week_status` is the single
definition of a final week, and `league_standings` counts only final weeks — so
`/standings`, `/league` and the Team HQ tile cannot disagree about a record. **The
application never filters weeks in JavaScript.**

### 8.2 Schedule — BUILT

The fourteen-week table is data. Week 8's points-for matching is computed at the time.

### 8.3–8.4 Head-to-head and fractional points — BUILT

### 8.5 Scoring — BUILT

`edfl_scoring_settings` holds the table in RB 8.5 and is what
`edfl_score_projected_stats()` applies to projections. The same settings produce the
league's own best-ball score.

**Sleeper's number is the official score** for a completed week (ruling of September 7,
2026); the league's own scoring is applied to the per-player points Sleeper reports,
not to raw stat lines, for a played week. Projections are scored from stat lines — see
Part V, T.10, including why the feed's first-down fields are ignored entirely.

## 9. Standings and Playoffs

### 9.1 Regular season — BUILT, PARTIAL

Built September 7, 2026. The Scoreboard and Standings pages read each week's points
from Sleeper's matchups feed.

**The Standings page ranks league-wide on win percentage then points for, with the
division shown as a label**, by commissioner ruling. **The tie-breakers in RB 9.1(c)
and the seeding in RB 9.2 are applied when the playoffs are seeded, not by the page.**
An owner reading the standings table is reading a ranking, not a seeding, and the page
says so.

The same feed drives waiver priority under RB 5.15(c).

### 9.2 Playoffs — NOT BUILT

Seeding, the bracket and the playoff tie-breakers are not built. **Weeks 15–17 are not
in `league_weeks`, and adding them with a pay instant would break the fourteen-week
proration and the `weeks_charged` constraint** — which is why RB 9.2(l) and RB 5.24(a)
have to be built together rather than one at a time. Part IV, item 1.

*What was struck:* a former clause barred teams not in the playoffs from dropping
players after the Week 14 games until the EDFL Bowl. It was struck September 13, 2026.
Non-playoff teams may cut after Week 14, and every in-season cut passes through the
wire — which is exactly why the playoff wire in RB 5.15(l) has to exist.

### 9.3 Toilet Bowl — NOT BUILT

## 10. League Revenue

### 10.1 Owner Cash accounts — BUILT

**Available cash is always computed, never set by hand:** the season's starting amount,
plus adjustments, less cash actually spent on contracts. The ledger, the automatic
Action Log entries, the commissioner's adjustment page and the owner-facing audit page
all exist and are tested.

### 10.2 Annual revenue share — NOT BUILT

For 2026, ahead of any vote structure existing, each team's starting Owner Cash was set
directly by the commissioner and recorded. Rule Book Schedule B.12.

---

# PART III — OFFICER MACHINERY

*How RB Appendix A is expressed in the application. The powers are rules and live in
the Rule Book; what follows is where they are, how they are gated, and what guards
them.*

## A.1 Where each power lives

| RB power | Where | Gate |
|---|---|---|
| A.1(a) Cut reversal | `/admin/cuts`, and the post-cut correction ledger | Widened |
| A.1(b) Cut from any roster | The ordinary cut control, on any team page | Widened |
| A.1(c) Deletion | `/admin/fix-contracts` and the tier tools | Widened |
| A.1(d) Owner Cash adjustment | `/admin/cash` | Widened |
| A.1(e) Trade reversal | `/admin/trades` | Widened, with the narrower recusal in RB Appendix A.3(c) |
| A.1(f) Restructure reversal | `/admin/restructure` | Widened |
| A.1(g) Rollover and its reversal | The rollover admin page | Widened |
| A.1(h) Fifth Year Option reversal | `/admin/fifth-year-option` | Widened |
| A.1(i) Window resolution | `/free-agency`, `/poaching` | Widened |
| RB A.2(a)–(b) Player Value Chart | The chart tools | **Strict** |
| RB A.2(c) Granting officer status | `/admin/owner-activity` | **Strict** |
| RB A.2(d) Competitive-balance veto | `/admin/trades` | **Strict** |
| RB A.2(e) Calendar Loader | `/admin/calendar` | **Strict** — page, actions and every `calendar_*` function |

## A.2 The widened gate, and what moved into it

The co-commissioner mirrors the commissioner except for RB Appendix A.2. Two powers
were withheld on August 25, 2026 and **struck from the withheld list on September 8,
2026** — syncing the player pool and importing historical stats. Both are now shared;
the pages widened in the same commit as the ruling.

`/admin/sync-players` and `/admin/import-stats` **remain the only privileged writes in
the application with no database gate behind them** — the Server Action check is the
whole gate, because they write tables no gated function covers. **Do not add another
without that reason.**

The two officer pages added September 19 — `/admin/prospects` and the League Office
memo desk — are on the widened gate by ruling, and their write functions carry their
own officer checks, so the page gate is a door and not the lock.

## A.3 The officer action banner

**On `/admin`, not on `/`.** It moved to the portal on September 17, 2026 with the
thirteen admin buttons. `officer_action_items()` **refreshes a state table on every
call**, so it belongs on a page two people open rather than on a home page the whole
league loads. The app bar's pill reads `officer_action_badge()` instead: two integers,
no refresh, no titles.

**The banner renders what the database composed, verbatim.** The component never reads
and never decides. **A failed read renders an error, never "All clear"** — those are
different facts, and conflating them would tell an officer that nothing needs doing at
the moment the application cannot tell.

New kinds of action item are added in the database function, not in the component.

## A.4 The commissioner pill

The pill in the app bar is the **only** door to `/admin`, and is drawn only for an
officer. **Hiding it protects nobody** — `officer_action_badge()` refuses a non-officer
itself, the portal layout re-checks, and every `/admin` page redirects. It stops showing
people doors they cannot open, which is presentation, not access control.

## A.5 Proxy access — NOT BUILT

A proxy stood in for one team from September 7 to September 19, 2026, and one trade was
accepted on an owner's behalf. The proxy record is closed. **Neither has a rule, a
function or a gate.** Part IV, item 12; Rule Book Schedule B.13.

---

# PART IV — SPECIFIED, RULED, NOT BUILT

Commissioner rulings that are settled but not yet implemented. Each item is also
marked **NOT BUILT** at its clause in Part II. An item leaves this list in the
revision that records it as built. Re-cut in Version 23, September 20, 2026.

**1. Playoff contracts** — RB 9.2(l), RB 5.24(a).
The playoff contract type exists with no behaviour. Weeks 15–17 are not in
`league_weeks`; adding them with a pay instant would break the fourteen-week
proration and the `weeks_charged` constraint. This and item 2 have to be built
together.

**2. Playoff waiver priority** — RB 5.15(l). **This one has a deadline.**
The fixed 6, 5, 4, 3, 2, 1, 7, 8, 9, 10 order does not exist, and `waiver_runs`
ends with Week 14. Once Week 14's pay instant passes — **00:00 ET Tuesday, December
8, 2026** — an in-season cut has no run to join, and **no cut can be made until
this is built**.

**3. Contract expiry at January 5 and February 21** — RB 5.24 — **and off-season
free agency** for the seven-week gap between them.

**4. The December 15 rollover close** — RB 5.4(a)–(b), RB 5.5(c)–(d).
Needs: `books_closed_at` per season; the close routine (freeze, measure the floor
with dead money counted, compute rollover, persist, stamp); a second marker so that
post-close dead money lands on the next cap year without moving
`current_season_year`; the split of `advance_league_year` into expiry (February 21)
and the season flip (March 1); and the 2027 ceiling seeded from stored rollover.

**5.** ~~The three-week warning on screen~~ — **Built September 13, 2026.** See Part
V, T.3.

**6.** ~~The pre-signing warning~~ — **Built September 13, 2026.** See Part V, T.3.

**7. `contract_status = 'extended'` has no matching event type.**
Whoever builds contract extensions (RB 5.11) adds it in the same migration or
reopens a cap hole.

**8.** ~~The free agency window length~~ — **Ruled and shipped September 14, 2026: 24
hours.** Every one of the season's 34 windows to this version has resolved, and
windows have closed on their own clock since the first-offer exemption ended.

**9. The off-season wire** — RB 5.15(o). Intended, not yet ruled, not built. Until it
is, an off-season cut is an immediate release. Rule Book Schedule B.6.

**10. RB 3.3(f) enforcement for League Year 2027.**
A gate refusing a practice-squad-to-injured-reserve move once the 2026 exemption in
RB Schedule A.6 lapses; the 2027 League Year instant seeded on the calendar first
(it does not exist yet); and a ruling on a rookie already on injured reserve when
the exemption lapses (Rule Book Schedule B.15).

**11. Insider Threat batch 2, and the two listeners** — RB 7.9, RB 1.10(c).
The block and watchlist controls on the player card header, the `/trade-block` and
`/watchlist` pages, Dianna answering in her channel, and the League Office answering
calendar and rule-book questions.

**The League Office listener has a hard prerequisite that Version 23 changes the
shape of.** Until this reorganisation, the prerequisite was recorded as *"this book
is not in the database — there is no clause table to answer from."* That is still
true, and the work is now better defined:

- **A `rule_clauses` table** — clause reference, heading, text, source document,
  source version — **loaded from all three documents**: the Rule Book for what the
  rule is, this manual for how it is enforced, and the How-To Manual for how an
  owner does it. That is exactly the split of an owner's three possible questions,
  and it is the reason all three documents now carry stable, machine-addressable
  section identifiers.
- The table is worth building on its own merits: it is what would let the
  application link a rule reference anywhere it appears, and
  `league_calendar_events.rule_ref` is already populated and pointing at nothing.
- **A hosted gateway process with a bot token.** A webhook cannot read a channel.
  Dianna's listener needs exactly the same thing.
- **Those two listeners should be one process.** One host, one token set, one bill,
  which is what keeps the whole bot layer inside the \$10/month ceiling. Two
  processes for two bots spends the budget twice for no capability. The process reads
  the channel, routes a message by which bot it addresses, and calls a thin Postgres
  answer function per bot; the personality and the facts stay in the database where
  they already are.

**12. Owner proxy access and on-behalf acceptance** — RB Appendix A, RB 1.2(d).
A proxy stood in for one team from September 7 to September 19, 2026 and one trade
was accepted on an owner's behalf; the proxy record is closed, and neither has a
rule, a function or a gate. The two vacant approver offices are the same question
seen from the other side: RB 7.7(c) routes approval to them where both officers are
parties, and there is no path for that case. To be ruled on together.

**13. Conditional pick compensation** — RB 7.3.
Needs a player's actual season point total and therefore waits on the statistics
sync. Until then a condition is recorded with the trade and adjudicated by the
commissioner by hand.

---

# PART V — IMPLEMENTATION NOTES OF RECORD

*These describe how the application enforces clauses stated in the Rule Book. They
are kept in full because each records a decision whose reason is not recoverable from
the code.*

## T.1 Best-ball scoring is computed here, not taken from Sleeper

RB 8.1(b) says the highest-scoring eligible player at each position counts. Until
September 13, 2026 the application took Sleeper's own **starters** total and stored
it. It now computes the league's own best-ball score from the full roster.

The Sleeper matchups payload carries `players_points` — every rostered player's score
— alongside the starters total. `player_week_scores` stores the whole roster, one row
per player per week, with **`roster_status_at_sync` frozen at write time**.
Eligibility is applied at **lineup time** rather than write time, so a change to the
eligibility ruling is a recompute and never a re-pull, and a player moved to the
practice squad in Week 6 cannot rewrite what he was in Week 3.

**Commissioner rulings of September 13, 2026:** eligibility is the **active roster
only** — practice squad and injured reserve players score nothing however they
perform; best ball **replaces** the official score, so `team_week_scores.points` *is*
best ball and standings, points-for and waiver priority all follow it; the template is
the league's existing twelve slots; and Week 1 was recomputed **retroactively**.

`edfl_best_ball_lineup(season, week)` returns the chosen lineup **one row per slot,
not merely a total**, so an owner can be shown which players counted.

**Greedy selection is optimal for this shape**, which is worth stating because it looks
like it should not be: the base slots take the top N at each position and FLEX takes
the best of what remains from the flex-eligible union, so no swap between a base slot
and a flex slot can raise the total.

**Sleeper lineups no longer affect EDFL scoring.** Setting one is cosmetic.

## T.2 The scoreboard maintains itself

`edfl_scoreboard_sync` runs every two minutes and fetches the Sleeper matchups
endpoint through `pg_net`, writing both `player_week_scores` and `team_week_scores`.
It is due in three live windows — Thursday and Monday 20:00–23:59, Sunday
12:55–23:59 — and at Tuesday and Wednesday 17:00 for the completed week.

**Tuesday 17:00 is the load-bearing run.** The waiver run fires Wednesday 00:00 and
reads `waiver_priority_order()` off `team_week_scores`. Wednesday 17:00 lands after
the run and cannot influence it, which is correct — `waiver_runs.priority_snapshot`
freezes the order at the run instant so a later scoring correction can never
retroactively change who won a claim.

**The two recap runs target the week that just ended, not the current week.** Tuesday
and Wednesday fall between weeks: week N ends Monday 23:59 and week N+1 does not begin
until Thursday. Getting this backwards would hand the Wednesday run the wrong priority
order.

`edfl_sync_week_scores` (the owner's Refresh button) and
`edfl_sync_week_scores_system` (the cron tick) both delegate to
`edfl_apply_matchups_payload`, so the button and the tick cannot compute different
numbers. A sync with `synced_by` null was automated; a sync with an owner id was a
person pressing Refresh.

## T.3 The practice squad warnings

RB 3.3(i)'s sentence is composed by `taxi_eligibility_status.warning` and rendered
verbatim in three places — the cap sheet roster tab as a badge with the sentence on
hover, the player card, and the roster-move dialog before the owner picks a
destination.

**Every sentence in that view was re-cut on September 15, 2026** for the lock, and the
view gained three columns — `locked`, `last_demotion_available` and `locked_at`,
**appended**, so a positional read of the old shape still works.

**`eligibility_spent` is kept under its old name but now means locked**, which is a
behaviour change for anything that branched on it. **The cap sheet badge still reads
PS ELIGIBILITY SPENT and still turns urgent at two weeks, and both are now wrong** —
the actionable state is three weeks, where `last_demotion_available` is true and the
owner still has a choice to make. This is an open defect, recorded here rather than
quietly carried.

The view returns NULL when there is nothing to say, and NULL is the render condition.
The badge is shown only for the current season, because the count is a single-season
figure.

RB 3.3(d)–(e)'s notice is rendered on the free agency offer form from
`edfl_taxi_origin_actives(team)`, `ps_count` and `taxi_squad_size`. **It is a warning
and never a block**: the automatic return is not an acquisition and always completes,
and the resulting overage is ordinary non-compliance curable by the compliance
instant.

## T.4 A player on the wire occupies no roster place, in the gates as well as the views

RB 5.15(g). The views were taught this when the wire shipped; **the four functions that
gate a move were not**, which would have shown an owner an open slot and then refused
the replacement. `set_roster_status`, `check_taxi_slot_limits`, `trade_impact` and
`reverse_trade` now count rosters with `AND NOT edfl_on_waivers(...)`.
`check_taxi_eligibility` deliberately does not — it tests eligibility and draft anchor,
not occupancy.

## T.5 The wire's transaction-feed kinds

`waiver_run_apply` writes `waived_unclaimed`; `waiver_settle_claim` writes
`waived_claimed`. **Three objects carry them and all three must move together:**

- `player_transaction_feed` maps event type to kind, label and description;
- **`league_transaction_log` filters on an allowlist**, so a kind missing from it is
  not mislabelled but invisible;
- `league_transaction_log_unmapped_kinds()` carries its own allowlist and would
  otherwise report the new kinds as unmapped.

## T.6 A trade clears an end-of-week designation

RB 5.23(b). `execute_trade` does not move `contracts.team_id` — it sets the outgoing
contract to `traded_away` and writes a new contract for the receiving team. An open
`pending_cuts` row would therefore point at a contract nobody holds, and
`pending_cuts_fire_due()` gates only on `fires_at`. The designation is **withdrawn,
not deleted**, so it survives for the log, and is stamped with the executing officer.

## T.7 Function grants: PUBLIC is the grant, not `anon`

Supabase's default privilege lands on **`PUBLIC`** — the leading `=X/postgres` in
`proacl` — and `anon` inherits it. Counting functions "executable by anon" therefore
counts PUBLIC grants, and **a revoke aimed at `anon` can report success and change
nothing**.

As of September 13, 2026: **141 SECURITY DEFINER functions, 6 executable by `anon`,
none retaining a PUBLIC grant.** A function's ACL is checked against the **calling**
role even inside a non-invoker view and inside an RLS policy, which is why those six
are load-bearing: `edfl_on_waivers`, `edfl_taxi_weeks_used` and
`edfl_taxi_eligibility_spent` are called from inside views the application reads
anonymously; `team_cut_previews` is called with the anonymous client; and
`is_commissioner` and `is_commissioner_or_co` are referenced by thirteen RLS policies,
most granted to PUBLIC.

**Amendment made in Version 22 and carried here:** a grant sweep must name
**`authenticated` alongside `PUBLIC`**. The first Robo Goodell sweep revoked only
`PUBLIC` and left every signed-in owner able to call `goodell_say()` and post arbitrary
text as the League Office, until `goodell_05` closed it. **Dropping and recreating a
function makes Supabase silently reassert default privilege grants**, so a grant test
must always follow a function rebuild.

## T.8 Cap relief is computed in the database

Neither `team_cut_previews` nor `compute_cut_charges` returned what a cut *frees* —
both return what it costs. `team_cut_previews` now also returns
`cap_charge_current_year` and `cap_relief_current_year`, the charge less the dead cap.

**Relief is not floored at zero.** A contract whose dead cap exceeds its charge costs a
team room to cut, and an owner ranking a conditional waiver claim needs to see that as
a negative number.

## T.9 A week is final at its last kickoff plus four hours, and the standings hold until then

Added in Version 22 (phase 2G-1, September 20, 2026). **One view,
`league_week_status`, is the single definition of a final week**: the week's last NFL
kickoff from `nfl_games` plus four hours, with a score sync landed after that instant.
`league_scoreboard` reads it instead of computing it inline, and **`league_standings`
counts only final weeks**, so a Sunday afternoon no longer shows every team with a game
played that is still being played.

**The rule lives in the view** so that `/standings`, `/league` and the Team HQ tile
cannot disagree about a record. The application never filters weeks in JavaScript.

`waiver_priority_order()` was not changed: the Wednesday run reads the week that ended
on Monday, which is final by then.

Verified at the change: every team went from two games to one while Week 2 was in
progress, which is what Sleeper showed.

## T.10 The Matchup page, and why its projection is not Sleeper's

Added in Version 22 (phases 2G-2 and 2G-3, September 20, 2026).
`/matchup/[week]/[matchupId]` draws both sides of a pairing — the twelve best-ball
slots, the bench, the live score and a projection — from one read,
`edfl_matchup_detail(season, week, matchup_id)`.

**It scores nothing.** `team_week_scores.points` and `edfl_best_ball_lineup()` remain
the official score and lineup, from actual points only. The detail function slots
unplayed players on projections for the reader's benefit, and **its big number must
always equal the scoreboard's**.

Projections are the league's own scoring of the projected stat lines Sleeper carries
from Rotowire (`player_week_projections`, pulled by an owner pressing **Refresh
projections** and never by a job; **the raw stat object is stored**, so a scoring change
is a re-score and never a re-pull).

`edfl_score_projected_stats()` applies `edfl_scoring_settings` to them — and **ignores
the feed's `pass_fd`, `rush_fd` and `rec_fd` fields entirely**, because they are yards
divided by ten, not first downs. Measured: `rec_fd = rec_yd/10` in 711 of 777 rows, and
exactly so for every quarterback.

First downs are instead **estimated from projected volume** at rates measured over every
game in `player_game_stats`: **0.5243 per completion, 0.2478 per carry, 0.5249 per
reception.**

Scoring the fields as counts had invented about **26 points per quarterback** and made
this application agree with Sleeper's own displayed projection to the second decimal —
Sleeper carries the same overstatement. **Week 1's real results decided between the
two: estimation wins at every position.** The page says so in two paragraphs above the
starters, and a missing projection is shown as missing, never as 0.00.

Byes are read through `edfl_nfl_team_code()` because `nfl_games` says `LA` where
`players.nfl_team` says `LAR`. Headshots are Sleeper's CDN thumbnails, loaded by URL and
never stored. The projection table has no anonymous grant and no write policy.

## T.11 The three wires run in the database

Added in Version 22 (September 19, 2026). See Part I, 0.8 for what each wire says and
TM 7.9 for the rumour desk's rules.

**Structurally they are one pattern, and the next wire should be too:**

- a ledger keyed so a thing is said once — `discord_broadcasts.log_id`,
  `insider_broadcasts.submission_id`, `goodell_broadcasts.broadcast_key`;
- **a line builder in SQL**, so the league's wording lives in one place;
- a `_say()` that posts through `pg_net` to a webhook read from **Vault**, never from
  the repository or a chat;
- a `_dispatch()` on a `*/5` `pg_cron` tick that posts at most a handful per run and
  **nothing older than 24 hours**, so downtime is followed by silence rather than a
  flood;
- and no mentions, ever.

`_dispatch()` **returns quietly and marks nothing when the vault secret is absent.** The
ledger stays honest while a wire is dark, which is what makes it safe to turn one on.

Execute on every one is revoked from `anon` **and `authenticated`** — see T.7.

The role `dianna` exists **so that RB 7.9(d) is a property of the grants rather than of
anyone's memory.**

Two of the three wires have a personality; only Dianna's is model-written, and every
number and name she prints is substituted from the database after the model has written
its sentence.

---

# PART VI — TECHNICAL GLOSSARY

Terms of this application. Terms of the game are in Rule Book Section 11.

**Action Log** — `/actions`. The public record required by RB 1.11, readable with no
login.

**Anonymous client** — the Supabase client carrying the publishable key and no session.
Thirteen formerly-public pages still read through it.

**Award engine** — `edfl_fa_award_window`. Trial-awards each candidate inside a
savepoint and reads the result back through the cap sheet's own views. Serves free
agency, poaching and the first-offer path.

**Compliance view** — `team_inseason_compliance`. Composes RB 3.6(c) in words; read by
the team banner and the cap sheet Status column.

**Deferred trigger** — a constraint trigger evaluated at commit rather than at
statement. Used where a rule must see the finished shape of a multi-row write.

**Dry run** — a routine that reports what it would do and writes nothing. The rollover
has one; the waiver run's resolver is one by construction.

**Idempotency key** — the text primary key on a broadcast ledger that makes a wire say a
thing exactly once.

**Officer gate, widened / strict** — `isCommissionerOrCo` / `is_commissioner`. See Part
I, 0.4 and Part III.

**Sealed group** — a table group no owner may read while a competitive window is open.
Six exist; Part I, 0.5.

**Service-role client** — the Supabase client that bypasses row-level security.
`auth.uid()` is NULL through it. Used only where no gated function covers the write.

**Session client** — the Supabase client carrying the owner's session. Required for
anything gating on `auth.uid()`.

**System of record** — this application, for everything except score, position and
injury designation. RB 1.13(b).

**Vault** — where every webhook and secret is held. Never the repository, never a chat.

**Wire** — one of the three Discord publication streams. Part I, 0.8, Part V, T.11.

---

# VERSION RECORD

| Version | Date | What changed |
|---|---|---|
| **24** | Sep 21, 2026 | Rulings of September 21: the practice squad **hold** (RB 3.3(d)(i)), poaching **exemptions** and the **24-hour return** (RB 5.17(l)–(m)), the 2026 poaching opening moved to Wednesday September 23 at noon. TM 3.3 and TM 5.17 gain their enforcement entries; `edfl_taxi_revert_subject()` becomes the one statement of the Tuesday return. `team_inseason_compliance` gains per-squad position counts and the shortfall flags for the Team HQ roster bar (TM 3.6). |
| **23** | Sep 20, 2026 | **Reorganisation.** This manual stops being the binding statement of the league's rules and becomes the description of the application and its conformance to them. The Rule Book now governs. Every rule of play is removed to the Rule Book and cited from here rather than restated; what remains is the application, its architecture and one enforcement entry per Rule Book clause, each carrying a build status. New **Part I** describes the system: the record model, the database boundary, the access model, the six sealed groups, the surfaces, the installed application, the three wires and the scheduler. **Part II** is renumbered to match the Rule Book exactly, so that TM 5.17 is how RB 5.17 is enforced. **Part III** is the officer machinery formerly in Appendix A. **Part IV** is the not-built register, re-cut, with item 11 rewritten around the three-document clause table. **Part V** carries Appendix T unchanged in substance. **Part VI** is a new glossary of application terms only. |
| 22 | Sep 20, 2026 | The rulings of September 9–20 and the builds that followed; Appendix B re-cut; Appendix T gains T.9–T.11. |
| 21 | Sep 15, 2026 | The three-week limit buys one last demotion; the lock. |
| 20 | Sep 14, 2026 | 24-hour free agency window; one claim per team per round; first waiver run September 23. |
| 19 | Sep 13, 2026 | Appendix T added — best-ball scoring, scoreboard automation, wire occupancy, feed kinds, function grants. |
| 18 | Sep 13, 2026 | The weekly transaction cycle; the wire; the compliance fine and the League Fund. |
| 17 | Sep 8, 2026 | Retitled from EDFL Rule Book to EDFL Technical Manual; the short owner Rule Book published alongside. |
| ≤16 | — | Titled the EDFL Rule Book. |

---

*End of the EDFL Technical Manual, Version 24.*
