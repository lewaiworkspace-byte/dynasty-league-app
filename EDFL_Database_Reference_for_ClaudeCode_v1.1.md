# EDFL Database Reference — for Claude Code

**v1.1 — August 28, 2026.** *Generated directly from `kghjiqfxmzbpftotkbsf`. Every fact here was
read out of the live database, not recalled.*

*v1.1 corrects two errors in v1.0 that Claude Code caught by reading the repo. Both are noted
inline. Claude Code owns the application; this file owns the database; where they disagree,
whoever can actually read the thing in question wins.*

**Claude Code has no database access and cannot verify anything in this file.** That is exactly
why it exists. Treat it as the authority on what the database contains, and re-request a
regenerated copy rather than inferring schema from application code — the app has been wrong
about the database before.

**Do not write SQL.** All schema and function changes are made in the project chat through the
Supabase MCP connection. If a feature appears to need a new table, view, column or function,
stop and say so.

---

## 1. The identity model — get this wrong and the UI silently locks people out

Three different UUIDs describe one human being. They are not interchangeable, and confusing them
is not a compile error — it produces a page that renders fine and refuses the right person.

| Value | Source | Meaning |
|---|---|---|
| `session.user.id` / `auth.uid()` | Supabase Auth | the login |
| `team_owners.id` | league table | the owner record |
| `team_owners.team_id` → `teams.id` | league table | the franchise |

`team_owners` columns: `id`, `team_id`, `email`, `user_id`, `is_commissioner`, `is_co_commissioner`.

**Which column stores which:**

| Column | Holds |
|---|---|
| `trades.proposed_by` | `team_owners.id` |
| `trades.proposing_team_id` | `teams.id` |
| `trade_parties.team_id` | `teams.id` |
| `trades.approved_by`, `reversed_by` | `team_owners.id` |
| `trade_parties.accepted_by`, `declined_by` | `team_owners.id` |
| `commissioner_actions.owner_id` | `team_owners.id` |
| `team_cash_transactions.created_by` | `team_owners.id` |

The correct viewer checks, given `myOwner` = the row from `team_owners` where
`user_id = session.user.id`:

```
am I the proposer?   trade.proposed_by === myOwner.id
am I a party?        parties.some(function (p) { return p.team_id === myOwner.team_id })
am I commissioner?   myOwner.is_commissioner
am I co-commissioner? myOwner.is_co_commissioner
```

**Corrected in v1.1.** v1.0 asserted that the trade detail page compared an owner id against a
login id. It did not. The real cause, found by reading the code in `276c1ae`, was a
`status !== 'draft'` test with no proposer branch — the page never asked whether the viewer built
the draft. The symptom was real and is fixed; the cause stated here was a hypothesis written up
as a finding, which is exactly the failure this file exists to prevent.

The rule still stands on its own merits: never compare a `*_by` column against
`session.user.id`. They are different UUIDs and such a comparison can never be true.

`team_owners` RLS returns **only the viewer's own row** (commissioners and co-commissioners see
all ten). So a client-side lookup of "who am I" returns exactly one row, and a client-side
lookup of "who owns team X" returns **nothing** for an ordinary owner. Do not build UI that
depends on reading other owners' rows.

---

## 2. Security posture — where the real gate is

The anon key ships in the browser bundle. Anyone who opens devtools can call PostgREST directly
as `authenticated`. **An app-layer check protects nothing.** The gate must be in the database.

### Verified by penetration test, August 28, 2026

Executing as a plain (non-commissioner) owner's session, all six of these were refused:

| Attempt | Result |
|---|---|
| insert cash for own team | refused — RLS policy violation |
| update own cash rows | 0 rows |
| raise `league_cap_settings.fantasy_salary_cap` | 0 rows |
| raise `league_config.active_roster_size` | 0 rows |
| move the 5.5(f) cap enforcement date | 0 rows |
| set `is_commissioner = true` on own row | 0 rows |

A control read succeeded in the same session, proving the role switch took effect and the
refusals are real rather than an artifact.

**What this means for `/admin/cash`:** the page's commissioner check is app-layer only, but the
database default-denies every write to `team_cash_transactions` from a browser session
regardless. The remaining exposure is only through a Server Action holding the service-role key,
which never reaches the browser. Confirm that page's Server Action checks `is_commissioner`
before writing; do not treat it as an open hole.

### Every table has RLS enabled

Most carry a single SELECT policy and **no write policy at all**, which is a deliberate
default-deny: writes go through SECURITY DEFINER functions, never through PostgREST.
`trades`, `trade_parties`, `trade_assets` and `draft_picks` follow this pattern.

Four tables have zero policies — `dedupe_contracts_backup`, `dedupe_plan`,
`dedupe_players_backup`, `dedupe_stats_backup`, `player_game_stats_snapshot_20260730`,
`players_snapshot_20260730`. RLS is on with no policy, so they are invisible to the app. They
are migration backups. Do not read them, do not surface them.

### Draft trades are private to their proposer

`trades`, `trade_parties` and `trade_assets` all carry the same rule: a row with
`status = 'draft'` is visible **only** to the owner whose `team_owners.id` equals
`trades.proposed_by`. Counterparties see nothing until the trade is submitted. Build the drafts
list on that assumption — you do not need to filter for it, and you must not work around it.

---

## 3. Views

Read money from views. **Never compute money in JavaScript** — every dollar in these views is
already rounded per rule 1.9 and reflects taxi treatment, June 1 splits and proration rules that
JS subtraction gets wrong.

### `security_invoker = true` — these inherit RLS, the viewer sees only what they may see

`auction_tier_flag_recommendations`, `auction_tier_team_flags`, `bid_total_ppv`,
`league_calendar`, `player_card_header`, `player_career_earnings`, `player_contract_history`,
`player_contract_year_breakdown`, `player_transaction_feed`, `player_value_history`,
`player_value_removals`, `published_value_snapshots`, `team_cash_window_progress`,
`team_manual_bids`, `tier_reference_values`

Consequence worth designing around: **`player_transaction_feed` is not identical for every
viewer.** Signings, trades, cuts and roster moves are the same for everyone; losing bids are
visible only to the team that made them, and are anonymised for everyone under rule 6.1(g). Do
not cache one viewer's feed and serve it to another.

### `security_invoker = false` — these bypass RLS for whoever reads them

`auction_interest`, `auction_tier_result_years`, `auction_tier_results`,
`contract_year_computed`, `cut_history`, `edfl_game_fantasy_points`, `edfl_player_season_stats`,
`team_cap_compliance`, `team_cap_summary`, `team_cash_available`

Every underlying table is public-read today, so nothing leaks. The three `auction_*` views are
the ones to raise before the next tier opens — they are the only ones over data meant to be
private while a tier is live.

### Key view semantics

| View | Filter on | Note |
|---|---|---|
| `team_cap_summary` | `team_id`, `league_season_year` | `cap_used`, `cap_space_remaining`, `min_required_spend`, `total_cash_spent`. Counts dead money and `traded_away` contracts |
| `team_cash_available` | `team_id`, `season_year` | the cash side |
| `contract_year_computed` | `contract_id`, `league_season_year` | `cap_charge` and `cash_value` per season |
| `player_contract_year_breakdown` | `player_id` | per-season cap and cash **components**; the `cap_*` columns sum exactly to `cap_charge` on all 715 live rows |
| `player_card_header` | **`player_id` — always** | 3,253 players behind it |
| `player_value_history` | `player_id`, order by `recency_rank` | `recency_rank = 1` is most recent |

---

## 4. Functions

All are SECURITY DEFINER with `search_path` pinned. Everything listed is granted to
`authenticated` unless noted.

### Trades

| Function | Who may call | Refuses when |
|---|---|---|
| `propose_trade(p_assets jsonb, p_note text, p_as_draft boolean)` | any owner | — |
| `update_trade_draft(p_trade_id, p_assets, p_note)` | the proposer | not a draft; not yours |
| `submit_trade(p_trade_id)` | the proposer | not a draft |
| `discard_trade_draft(p_trade_id)` | the proposer | not a draft; not yours. **Hard-deletes**, cascades to parties and assets, no undo |
| `accept_trade(p_trade_id)` | a party | the **last** acceptance freezes `effective_at` and writes settlements |
| `decline_trade(p_trade_id, p_reason)` | a party | takes a reason; the proposer may also decline their own sent trade |
| `execute_trade(p_trade_id)` | commissioner **or** co-commissioner | any team non-compliant after the trade; 7.7(e) recusal |
| `veto_trade(p_trade_id, p_reason)` | **commissioner only** (7.7(d)) | refuses when the commissioner's own team is a party — that can only be disapproved by a grievance vote, which the app does not run. Confirmed unchanged in v1.1. Requires a reason of 10+ characters |
| `reverse_trade(p_trade_id, p_reason, p_force)` | commissioner **or** co-commissioner | **corrected in v1.1** — v1.0 said commissioner only. The commissioner may reverse **any** trade including one involving his own team (reversal is a correction tool, not an approval); the co-commissioner may reverse any trade **except** one involving his own team. Five guards fire before the window check — see §7 |
| `trade_impact(p_trade_id)` | any owner | returns one row per involved team — see below |
| `trade_legality(p_trade_id)` | any owner | returns zero rows when legal |
| `trade_window_at(p_at)` | any owner | keys on `rule_ref`, never on event titles |

`trade_impact()` returns `team_id, team_name, cap_before, cap_delta, cap_after, cap_ceiling,
cap_ok, cash_before, cash_delta, cash_after, cash_ok, roster_before, roster_after, roster_limit,
roster_ok, dead_cap_next_year, players_in, players_out, picks_in, picks_out`.

The `_ok` booleans are **verdicts, not controls**. Render them as status, never as anything
clickable. They also respect enforcement dates: `cap_ok` is unconditionally true before 5.5(f)
arms, `roster_ok` before 1.4(c). A `true` in August does not mean a `true` in September.

`trade_legality()` returns `(code, detail)` with codes `outside_window`, `trade_back_direct`,
`trade_back_same_window`, `trade_back_multi_team`, `calendar_missing`.

### Roster and contracts

| Function | Who may call |
|---|---|
| `set_roster_status(p_contract_id, p_status, p_note)` | owner of the contract, or commissioner/co |
| `cut_player(p_contract_id, p_june1_designation, p_salary_obligation_transfers, p_to_team_id, p_note)` | owner, or commissioner/co |
| `reverse_cut(p_event_id, p_reason)` | commissioner/co |
| `compute_cut_charges(p_contract_id, p_june1_designation)` | any owner — preview only |
| `compute_trade_charges(p_contract_id, p_to_team_id, p_effective_at)` | any owner — preview only |
| `team_cut_previews(p_team_id)` | any owner |
| `team_compliance_options(p_team_id)` | any owner |
| `june1_designations_remaining(p_team_id)` | any owner |

A `roster_status` change on `contracts` fires `trg_log_roster_move`, which writes `roster_moves`
from **any** write path. `roster_moves` is empty — nobody has been on taxi or IR yet, so the
first assignment is the first live test of that trigger and of the feed branch that reads it.

### Commissioner-gated

`commissioner_delete_bid`, `commissioner_delete_contract`, `commissioner_owner_activity`,
`evaluate_auction_tier`, `verify_auction_tier`, `pass_over_winner`, `publish_player_value_snapshot`,
`set_tier_value_snapshot`, `map_chart_name`, `set_co_commissioner`.

`set_co_commissioner` is **commissioner only** — a co-commissioner cannot appoint another.
`commissioner_owner_activity` is open to commissioner **and** co-commissioner.

### Player card

`search_players(query, limit)` — the card's entry point. Requires 2+ characters, capped at 50
rows so the PostgREST ceiling can never bite. Contracted players sort first.

`winning_bid_link(p_contract_id)` — exposes only winner ↔ contract ↔ tier linkage on verified
tiers, so "Won at auction" reads identically for every viewer. Winner identity is public by
rule; losing bidders never are.

---

## 5. Row-count hazards

PostgREST returns **1,000 rows by default**. These will silently truncate:

| Table / view | Rows | Rule |
|---|---|---|
| `player_game_stats` | 33,555 | never unfiltered — filter by player |
| `players` | 3,253 | never unfiltered — filter, or use `search_players()` |
| `nfl_games` | 1,424 | filter by season/week |
| `player_values` | 1,000 | **exactly at the ceiling** — two published snapshots of 500. Always filter by `snapshot_id`, or you will get one snapshot and half of nothing |
| `contract_years` | 715 | safe today, will not stay safe |
| `player_transaction_feed` | 496 | always filter by `player_id` |

`/admin/fix-contracts` already failed this way once — names rendered as "unknown" because the
join partner had been truncated. A silently short result is the failure mode, not an error.

Live counts: 234 contracts (233 active), 360 bids, 120 draft picks, 44 calendar events, 10 teams,
10 owners, 1 trade (a draft).

---

## 6. Configuration — read it, never hardcode it

`league_config` (single row): `current_season_year` 2026, `active_roster_size` **25**,
`taxi_squad_size` **7**, `min_spend_pct` 0.89, `practice_squad_max_value` 3,
`cut_reversal_window_hours` 96, `trade_reversal_window_hours` 96.

`league_cap_settings` holds **two rows**, and that matters — see §7. For 2026:
`fantasy_salary_cap` **$1,500**, `cap_ceiling` NULL — so the ceiling falls back to the base cap.
For 2027: `fantasy_salary_cap` $1,575 with **`is_provisional = true`**. That $1,575 is a
placeholder the commissioner has not set; nothing in the UI says so, which is a known gap. Any
screen showing a 2027 figure must mark it provisional. The **111% figure still shown on `/team/[teamId]` was
abolished in rule book v11 and is a display defect, not an allowance.** It is on the fix list.

`league_calendar_events` is the only source of truth for dates. Four database consumers already
derive their boundaries from it rather than storing copies. **Key on `rule_ref`, never on the
title** — titles get edited. The ones the UI cares about:

| `rule_ref` | Meaning |
|---|---|
| `5.5(f)` | in-season cap hard block arms |
| `1.4(c)` | In-Season begins — gates roster limits under 3.6(a) |
| `3.6(a)` | roster compliance deadline |
| `7.4(b)(i)`/`(ii)`/`(iii)` | trade windows 1, 2, 3 |
| `7.5(a)` | trade deadline |
| `5.4(a)` | Season Cap Floor tested |

`5.5(f)` and `1.4(c)` are different rules that merely coincide in 2026. Do not collapse them.

---

## 7. Facts that live nowhere else

These are the database facts that have already been mis-derived at least once. They are here so
that no rule in `CLAUDE.md` has to carry a schema detail to stay meaningful.

### `team_cap_summary` returns one row per team **per cap-settings row**

`league_cap_settings` has two rows (2026 and a provisional 2027), so an unfiltered read of
`team_cap_summary` returns **20 rows for 10 teams** — every team twice, with different numbers.
The row count is driven by cap-settings rows, not by contract data.

**Always filter `league_season_year`.** Without it the page is not slightly wrong, it is showing
a team's 2026 and 2027 figures interleaved and picking whichever sorted first. This has been
mis-derived twice.

### Void years are trigger-created — never count them from the contract row

`contract_years.is_void_year` rows are written by a trigger, from **two** different sources, and
`void_reason` says which: `option_bonus` or `signing_bonus`.

Live counts: 85 void-year rows across 25 contracts — 73 from option bonuses, 12 from signing
bonuses.

`contracts.option_void_years` counts **only the option-bonus ones**. It matches exactly on all 25
contracts, so it is not wrong — it is narrower than its name suggests. **Four contracts today
have void years while declaring `option_void_years = 0` or NULL.** Client code that reads that
column as "how many void years does this contract have" is wrong on those four, silently.

To count void years, count `contract_years where is_void_year`. Never derive them, never create
them, never let a form write them.

### `exempt_30pct` marks exactly 8 grandfathered contracts

Eight contracts carry `exempt_30pct = true`. That set was decided once, by hand, for contracts
that predate the 30% rule. **Never re-derive it** — any rule you write to reproduce that set will
disagree with it, and the flag is the authority, not the rule.

### Enforcement dates gate the compliance booleans

`trade_impact().cap_ok` is unconditionally `true` before rule `5.5(f)` arms, and `roster_ok`
before `1.4(c)`. `reverse_trade` applies the same two gates to its own post-unwind compliance
check. A screen that caches an `_ok` value across that boundary will show a stale pass.

### `reverse_trade` runs five guards, in order

Window last, deliberately, so the more specific message wins when several apply: (1) the trade
must be in the current season — never rewrite a closed season's cap; (2) every player must still
be on the contract the trade created, with no events against it and not committed to another live
trade; (3) no auction tier verified after the trade — verified results are final under 1.11(c)
and no bid can be withdrawn, so there would be no remedy; (4) every pick still held by the team
that received it and not yet used; (5) the 96-hour window.

Only guard 5 and the post-unwind compliance check are bypassable, and only with `p_force`. A
forced reversal is recorded as forced in the Commissioner Action Log.

---

## 8. Application conventions

- Server Actions **return** refusals, they never throw. Roughly 40 sites still throw; that is a
  known cleanup item.
- **No template literals** in delivered JavaScript — build strings with `+`.
- Relative imports only.
- Never compute money in JavaScript.
- Surface database error messages verbatim. They are written to be read by owners and they name
  the rule.
- One component owns player links (`components/PlayerLink.js`); do not hand-roll another.
