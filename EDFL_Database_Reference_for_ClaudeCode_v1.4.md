# EDFL Database Reference — for Claude Code

**v1.4 — September 8, 2026.** *Generated directly from `kghjiqfxmzbpftotkbsf`. Every fact here was
read out of the live database, not recalled and not carried forward from v1.3 without re-reading.*

**The copy of this file in the project [The League Abides] is canonical.** The copy committed to
the repo is a mirror for Claude Code to read; it is replaced whole when a new version is cut and is
never edited in place. If the two differ, the project copy wins.

**Do not query the database from Claude Code, whether or not a tool for it appears in your tool
list. Do not write SQL.** All schema and function changes are made in the project chat through the
Supabase MCP connection. If a feature appears to need a new table, view, column or function, stop
and say so.

---

## 0. What changed since v1.3, and one number v1.3 would have got wrong

v1.3 was cut September 4 at 12:56 UTC. **58 migrations have landed since** — not the ~22 the
standing worklist estimated. In rough order:

| Batch | Migrations | What it added |
|---|---|---|
| `fyo_01`–`fyo_16` | 16 | Fifth Year Option: tag values, eligibility tiers, the Pro Bowl view, published season results, option-extends-in-place |
| `inseason_start_2026_only` | 1 | The 2026 In-Season boundary, 8:00 PM ET September 8 |
| `sync_01`–`sync_06` | 6 | Sleeper Sync: staging, conflict detection, adjudication, Class B grants |
| `txnlog_01`–`txnlog_03` | 3 | The league-wide transaction log and its Eastern-date filters |
| `owner_profiles_01`–`08` | 8 | The Owner Info directory and its per-field visibility toggles |
| `waivers_01`–`waivers_02` | 2 | `team_week_scores`, the scoreboard, standings and waiver priority |
| `cap_ceiling_transfer_bypass`, `trade_back_temporary_relief`, `taxi_slot_limits_trigger` | 3 | Cap ceiling transfer bypass, the 7.4(a) relief through Sep 8, taxi slot limits as a trigger |
| `proration_01`–`proration_07` | 7 | In-season pro-ration, and the settlement engines counting weeks **under contract** |
| `freeagency_01`–`freeagency_12` | 12 | In-season free agency, end to end and live |

### The one number to re-baseline

v1.3 recorded a league-wide `cap_charge` total of **39,465.00 across 973 rows** and asked for it to
be re-derived before reuse as a regression assertion. As of this reading it is
**41,755.00 across 1,071 rows**. Do not treat either the v1.3 figure or the v1.0 convention doc's
39,555.00 as a constant — the league has been transacting continuously, and this figure moves with
every contract written. It is a timestamp, not an invariant.

### A correction to the function count

`public` contains **337** functions, and a naive count will report that. **188 of them belong to the
`btree_gist` extension**, which is installed into `public` rather than into `extensions`. EDFL owns
**149**: 121 callable and 28 trigger functions. Every function section below counts only the 149.
Do not go looking for `gbt_*`, `gbtreekey*` — they are not yours.

---

## 1. The identity model — get this wrong and the UI silently locks people out

Unchanged from v1.3 and re-verified. Three different UUIDs describe one human being. They are not
interchangeable, and confusing them is not a compile error — it produces a page that renders fine
and refuses the right person.

| Value | Source | Meaning |
|---|---|---|
| `session.user.id` / `auth.uid()` | Supabase Auth | the login |
| `team_owners.id` | league table | the owner record |
| `team_owners.team_id` → `teams.id` | league table | the franchise |

**Which column stores which:**

| Column | Holds |
|---|---|
| `trades.proposed_by`, `approved_by`, `reversed_by` | `team_owners.id` |
| `trades.proposing_team_id`, `trade_parties.team_id` | `teams.id` |
| `trade_parties.accepted_by`, `declined_by` | `team_owners.id` |
| `commissioner_actions.performed_by` | `team_owners.id` |
| `team_cash_transactions.created_by` | `team_owners.id` |
| `contract_events.created_by` | `team_owners.id` — the **acting** owner, not always the commissioner |
| `roster_moves.created_by`, `contract_restructure_bonuses.created_by` | `team_owners.id` |
| `owner_profiles.owner_id` | `team_owners.id` |
| `free_agent_offers.team_id` | `teams.id` |
| `free_agent_windows.opened_by_team_id` | `teams.id` |

Never compare a `*_by` column against `session.user.id`. They are different UUIDs and such a
comparison can never be true.

`team_owners` RLS returns **only the viewer's own row** (officers see all ten). A client-side
lookup of "who owns team X" returns **nothing** for an ordinary owner. Since September 6 the
supported way to get another owner's contact detail is `owner_directory()`, which applies the
per-field `show_*` toggles — do not read `owner_profiles` directly from the client.

### Three permission shapes, not two

| Shape | Functions | Rule |
|---|---|---|
| **Owner-or-officer** | `restructure_contract`, `cut_player`, `set_roster_status`, `submit_fa_offer`, `withdraw_fa_offer`, `exercise_fifth_year_option`, `decline_fifth_year_option`, `save_owner_profile` | any owner acting on **his own roster**; officers acting for **any** team |
| **Officer-only** | `reverse_restructure`, `reverse_cut`, `reverse_trade`, `execute_trade`, `advance_league_year`, `reverse_league_year_rollover`, `reverse_fifth_year_option`, `resolve_fa_window`, the `sleeper_sync_*` family | commissioner or co-commissioner |
| **Commissioner-only** | `veto_trade`, `set_co_commissioner`, `commissioner_owner_activity`, chart publication | the commissioner alone |

The database distinguishes a **permission** refusal from an **eligibility** refusal with different
messages, and the UI must too: a permission refusal means the row should not be offered at all; an
eligibility refusal is informative and should be shown with its reason. `can_restructure()` and
`fifth_year_option_status()` both return the two separately so the client never has to guess.

---

## 2. Security posture — where the real gate is

The anon key ships in the browser bundle. Anyone who opens devtools can call PostgREST directly as
`authenticated`. **An app-layer check protects nothing.** The gate must be in the database.

**Every one of the 57 tables has RLS enabled** — verified, zero exceptions. Most carry a single
SELECT policy and **no write policy at all**, which is deliberate default-deny: writes go through
SECURITY DEFINER functions, never through PostgREST. There are 54 policies across 57 tables.

Six tables have RLS on and **zero policies**, so they are invisible to the app entirely — they are
migration backups. Do not read them, do not surface them:

`dedupe_contracts_backup`, `dedupe_plan`, `dedupe_players_backup`, `dedupe_stats_backup`,
`player_game_stats_snapshot_20260730`, `players_snapshot_20260730`.

### The sealed groups — there are four, and none has a commissioner read

| Group | Sealed from | Rule |
|---|---|---|
| `bid_player_hides` | everyone but the owning team | a hide reveals bidding intent |
| `trades` / `trade_parties` / `trade_assets` in `draft` | everyone but the proposer | via `can_view_trade()` |
| `bid_delegations` (the Auto-Bid slate) | everyone but the owning team | |
| **`free_agent_offers` / `free_agent_offer_years`** | everyone including the commissioner | FA-3, enforced in RLS with **no** commissioner read |

Never add a commissioner clause to any of the four. `free_agent_window_board` exposes
`is_contested` as a **boolean** — the interest count never leaves the database.

### Trade visibility is decided by one function, not by three policies

`can_view_trade(trade_id)` is a SECURITY DEFINER helper backing the SELECT policies on `trades`,
`trade_parties` and `trade_assets` — the three policies referenced each other and Postgres refuses
the recursion otherwise.

| Status | Who may see it |
|---|---|
| `draft` | the proposer only |
| `proposed`, `declined`, `cancelled`, `expired` | the parties only |
| `accepted`, `approved`, `executed`, `vetoed`, `reversed` | everyone |

### Bids on a verified tier are public

Since September 3, and it reverses rule book 6.1(g). `bids` RLS admits any reader to a `winner` /
`lost` / `passed_over` bid on a tier with `verified_at` set; `bid_years` and `bid_option_bonuses`
inherit through their EXISTS. `withdrawn` is in neither list, deliberately. **Losing bidders are
named.** Any surviving "Anonymous" string is a display defect, not a privacy control.

---

## 3. Views — 33 of them

Read money from views. **Never compute money in JavaScript.** Every dollar in these views is
already rounded per rule 1.9 and reflects taxi treatment, June 1 splits, void acceleration and
in-season pro-ration that JS subtraction gets wrong. The team Overview page rebuilt cap totals
client-side from `contract_events` as recently as September 4 and was wrong by $1,431 on one team.

Seven views are new since v1.3: `edfl_pro_bowl`, `free_agent_offer_ppv`, `free_agent_window_board`,
`league_scoreboard`, `league_standings`, `league_transaction_log`, `team_roster_by_season`.

### `security_invoker = true` — these inherit RLS; the viewer sees only what they may see

`auction_tier_flag_recommendations`, `auction_tier_team_flags`, `bid_total_ppv`, `league_calendar`, `league_transaction_log`, `player_card_header`, `player_career_earnings`, `player_contract_history`, `player_contract_year_breakdown`, `player_transaction_feed`, `player_value_history`, `player_value_removals`, `published_value_snapshots`, `team_cash_window_progress`, `team_manual_bids`, `tier_reference_values`

Consequence worth designing around: **`player_transaction_feed` and `league_transaction_log` are
not identical for every viewer.** Withdrawn bids are visible only to the team that made them.

### `security_invoker = false` — these bypass RLS for whoever reads them

`auction_interest`, `auction_tier_result_years`, `auction_tier_results`, `contract_year_computed`, `cut_history`, `edfl_game_fantasy_points`, `edfl_player_season_stats`, `edfl_pro_bowl`, `free_agent_offer_ppv`, `free_agent_window_board`, `league_scoreboard`, `league_standings`, `team_cap_by_season`, `team_cap_compliance`, `team_cap_summary`, `team_cash_available`, `team_roster_by_season`

`free_agent_window_board` is on this list and that is deliberate and safe: it exposes only
`is_contested` as a boolean. The offers themselves are never in a non-invoker view.

### The 13 views with no `anon` SELECT grant

`auction_tier_flag_recommendations`, `auction_tier_team_flags`, `league_transaction_log`, `player_career_earnings`, `player_contract_history`, `player_contract_year_breakdown`, `player_transaction_feed`, `player_value_history`, `player_value_removals`, `published_value_snapshots`, `team_cash_window_progress`, `team_manual_bids`, `tier_reference_values`.

All are readable as `authenticated`. **This list changed since v1.3:** `player_card_header` gained
an `anon` grant (`fyo_11`/`fyo_15` rebuilt it), and the new `league_transaction_log` took its place
on the list. Correct **if** every page reading them is login-gated — the Cap Sheet demonstrably
reads as `anon`, so if any player-card or transaction page also reads as `anon` it is broken today.

### Every view, with its columns

Full SQL definitions are not reproduced here (74,571 characters across the 33). Ask for a specific
view's definition in chat if the arithmetic matters.

| View | Inv | anon | Columns |
|---|---|---|---|
| `auction_interest` | no | yes | tier_id, player_id, bid_count |
| `auction_tier_flag_recommendations` | yes | **no** | tier_id, team_id, bid_id, player_id, submitted_at, season_year, recommend_order, bid_cap, bid_cash, total_wins, incoming_cap_all_wins, incoming_cash_all_wins, current_cap_used, cap_limit_125, cash_available, cap_after_this_step, cash_needed_after_this_step, clears_at_this_step |
| `auction_tier_result_years` | no | yes | bid_id, tier_id, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, roster_bonus, is_void_year, option_bonus, dead_cap_if_cut |
| `auction_tier_results` | no | yes | bid_id, tier_id, player_id, player_name, position, status, is_winner, team_id, team_name, total_ppv, total_years, void_years, signing_bonus_total, start_year, option_bonus_total, option_bonuses |
| `auction_tier_team_flags` | yes | **no** | tier_id, team_id, season_year, incoming_cap, incoming_cash, current_cap_used, cap_limit_125, cash_available, over_cap, over_cash |
| `bid_total_ppv` | yes | yes | bid_id, tier_id, player_id, team_id, submitted_at, status, total_ppv |
| `contract_year_computed` | no | yes | id, contract_id, player_id, team_id, contract_status, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, option_bonus, roster_bonus, ppv, cap_charge, cash_value, dead_cap_if_cut, is_void_year, roster_bonus_converted, contract_last_real_season, is_void_acceleration_season |
| `cut_history` | no | yes | event_id, contract_id, event_type, event_season_year, from_team_id, team_name, player_id, player_name, position, contract_type, contract_status, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year, weeks_charged, june1_split, june1_designated, notes, created_at, created_by_email, reversed_at, reversed_by_email, reversal_reason, is_active_cut, reversal_hours_left, is_reversible |
| `edfl_game_fantasy_points` | no | yes | player_id, game_id, season_year, week, season_type, position, completions, attempts, passing_yards, passing_tds, passing_first_downs, passing_2pt_conversions, interceptions_thrown, times_sacked, carries, rushing_yards, rushing_tds, rushing_first_downs, rushing_2pt_conversions, targets, receptions, receiving_yards, receiving_tds, receiving_first_downs, receiving_2pt_conversions, fumbles, fumbles_lost, kick_returns, kick_return_yards, kick_return_tds, punt_returns, punt_return_yards, punt_return_tds, fg_made_0_19, fg_made_20_29, fg_made_30_39, fg_made_40_49, fg_made_50_59, fg_made_60_plus, fg_missed_0_19, fg_missed_20_29, fg_missed_30_39, fg_missed_40_plus, pat_made, pat_missed, fantasy_points |
| `edfl_player_season_stats` | no | yes | player_id, full_name, last_name, position, season_year, games, fantasy_points, fppg, pass_attempts, completions, passing_yards, passing_tds, interceptions, rush_attempts, rushing_yards, ypc, rushing_tds, targets, receptions, receiving_yards, receiving_tds, kick_returns, kick_return_yards, kick_return_tds, punt_returns, punt_return_yards, punt_return_tds, xp_att, xp_made, fg_att, fg_made |
| `edfl_pro_bowl` | no | yes | season_year, player_id, full_name, position, games, fantasy_points, fppg, composite, slot, slot_rank |
| `free_agent_offer_ppv` | no | yes | offer_id, window_id, player_id, team_id, submitted_at, status, total_ppv |
| `free_agent_window_board` | no | yes | window_id, player_id, player_name, position, season_year, opened_at, closes_at, status, opened_by, is_contested, time_remaining |
| `league_calendar` | yes | yes | entry_id, season_year, starts_at, ends_at, time_is_exact, title, detail, category, rule_ref, is_provisional, sort_hint, source, week_number, local_date, end_local_date, month_key, month_label, day_label, time_label, end_day_label, is_today_or_active, is_past |
| `league_scoreboard` | no | yes | season_year, week_number, week_starts_at, week_is_provisional, matchup_id, home_team_id, home_team, home_owner, home_points, away_team_id, away_team, away_owner, away_points, has_scores, winner_team_id, margin, synced_at |
| `league_standings` | no | yes | season_year, team_id, team_name, owner_display_name, division, games, wins, losses, ties, points_for, points_against, win_pct, streak, point_differential, points_per_game, league_rank, division_rank |
| `league_transaction_log` | yes | **no** | log_id, occurred_at, kind, title, description, player_id, player_name, player_position, team_from_id, team_from, team_to_id, team_to, season_year, is_admin_action, detail |
| `player_card_header` | yes | yes | player_id, full_name, position, nfl_team, nfl_status, sleeper_player_id, current_contract_id, current_team_id, current_team, roster_status, current_contract_type, current_contract_start, current_contract_years, current_season_cap, current_season_cash, contracts_held, has_edfl_history, chart_total_ppv, chart_per_year_value, chart_likely_years, chart_value_tier, chart_total_ppv_delta, chart_snapshot_label, chart_snapshot_as_of |
| `player_career_earnings` | yes | **no** | player_id, contracts_held, active_contracts, teams_played_for, first_season, last_season, career_contract_value, career_cap_charged, cash_on_active_contracts, cash_on_ended_contracts, cash_through_current_season, cash_still_owed, dead_cash_charged, dead_cap_charged, teams |
| `player_contract_history` | yes | **no** | contract_id, player_id, team_id, team_name, contract_type, contract_status, roster_status, start_year, total_years, void_years, option_void_years, signing_bonus_total, draft_year, draft_round, draft_pick, extends_contract_id, created_at, current_season_year, is_current, first_season, last_season, seasons_with_money, total_cash, total_cap, current_season_cap, current_season_cash, signed_in_tier, winning_bid_id, ended_by, ended_at, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year |
| `player_contract_year_breakdown` | yes | **no** | contract_id, player_id, team_id, contract_status, roster_status, contract_year_number, league_season_year, is_void_year, void_reason, cap_signing_proration, cap_gtd_salary, cap_non_gtd_salary, cap_option_proration, cap_roster_bonus, cash_signing_bonus, cash_gtd_salary, cash_non_gtd_salary, cash_option_bonus, cash_roster_bonus, ppv, cap_charge, cash_value, dead_cap_if_cut, roster_bonus_converted, added_by |
| `player_transaction_feed` | yes | **no** | player_id, occurred_at, kind, title, description, team_from_id, team_from, team_to_id, team_to, season_year, is_admin_action, source, source_id, detail |
| `player_value_history` | yes | **no** | id, snapshot_id, snapshot_label, snapshot_as_of, published_at, recency_rank, chart_position, chart_rank, chart_name, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, player_id, match_status, prev_total_ppv, prev_per_year_value, prev_likely_years, total_ppv_delta, likely_years_delta, is_new_this_snapshot |
| `player_value_removals` | yes | **no** | snapshot_id, snapshot_label, chart_position, chart_name, chart_nfl_team, last_total_ppv, player_id |
| `published_value_snapshots` | yes | **no** | id, label, as_of_date, published_at, source_note, recency_rank, prev_snapshot_id |
| `team_cap_by_season` | no | yes | team_id, team_name, league_season_year, fantasy_salary_cap, cap_is_set, cap_is_provisional, active_cap, pre_event_cap, dead_cap, cap_used, cap_space_remaining, min_required_spend, active_cash, pre_event_cash, dead_cash, cash_used |
| `team_cap_compliance` | no | yes | team_id, team_name, league_season_year, cap_used, cap_ceiling, cap_room, over_by, compliant, ceiling_is_base_cap_fallback, cap_is_provisional, enforcement_starts_at, enforcement_active |
| `team_cap_summary` | no | yes | team_id, team_name, league_season_year, fantasy_salary_cap, cap_used, cap_space_remaining, min_required_spend, total_cash_spent |
| `team_cash_available` | no | yes | team_id, season_year, starting_cash, total_adjustments, cash_spent, cash_available |
| `team_cash_window_progress` | yes | **no** | team_id, team_name, window_start_year, window_end_year, window_length, seasons_priced, window_fully_priced, base_cap_total, floor_pct, cash_floor_required, cash_committed, cash_shortfall |
| `team_manual_bids` | yes | **no** | bid_id, tier_id, team_id, player_id, submitted_at |
| `team_roster_by_season` | no | yes | team_id, team_name, league_season_year, active_count, taxi_count, ir_count, contracts_covering_season |
| `tier_reference_values` | yes | **no** | tier_id, tier_number, snapshot_id, snapshot_label, snapshot_as_of, player_id, chart_name, chart_position, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, length_multipliers |

### Key view semantics

| View | Filter on | Note |
|---|---|---|
| `team_cap_by_season` | `team_id`, `league_season_year` | **use this for team totals.** Every season a contract or event touches; NULLs where no cap row exists |
| `team_cap_summary` | `team_id`, `league_season_year` | 2026 and 2027 **only** — it `CROSS JOIN`s `league_cap_settings`, which has two rows |
| `team_cap_compliance` | `team_id` | the ceiling test reads this family, never `team_cap_summary` |
| `team_cash_available` | `team_id`, `season_year` | the cash side |
| `team_roster_by_season` | `team_id`, season | **a player drops off on waive, not on the run** |
| `contract_year_computed` | `contract_id`, `league_season_year` | `cap_charge`, `cash_value`, `ppv`, `dead_cap_if_cut`. Folds in restructure bonuses, void acceleration **and in-season pro-ration** |
| `player_contract_year_breakdown` | `player_id` | per-season cap and cash **components** |
| `player_card_header` | **`player_id` — always** | 3,253 players behind it. Handles two active contracts since `fyo_11` |
| `player_value_history` | `player_id`, order by `recency_rank` | `recency_rank = 1` is most recent |
| `league_scoreboard` / `league_standings` | `season_year`, `week_number` | built on `team_week_scores`, which is **empty today** |
| `free_agent_window_board` | `season_year` | `is_contested` is a boolean by FA-D; there is no count |
| `edfl_pro_bowl` | `season_year` | 48 selections; feeds Fifth Year Option tiers |

**`team_cap_summary` returns one row per team per cap-settings row.** An unfiltered read returns
**20 rows for 10 teams**, every team twice with different numbers, and **nothing at all** for 2028
onward. This has been mis-derived three times. Always filter `league_season_year`; use
`team_cap_by_season` for any page showing more than two seasons.

---

## 4. Functions — 121 callable, 28 trigger

Signature, return, volatility, `SECURITY DEFINER`, and who holds EXECUTE. **Read §9 before changing
any grant** — a revoke took the Cap Sheet down once. `SD` = SECURITY DEFINER. Grants: `anon+auth`,
`auth` = authenticated only, `none` = reachable only from a definer context.

### Identity, permission and plumbing

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `can_view_trade(p_trade_id uuid)` | `boolean` | STB | yes | auth |
| `commissioner_owner_activity()` | `TABLE(team_name text, email text, has_account boolean, last_sign_in_at timestamp with time zone, last_seen_at timestamp with time zone, open_session_count bigint, signed_in_since_tier_opened boolean, nudge_suggested boolean)` | VOL | yes | auth |
| `edfl_local_clock(p_time_zone text)` | `TABLE(local_time_now text, local_date_now text, utc_offset_minutes integer)` | STB | — | auth |
| `edfl_time_zone_options()` | `TABLE(name text, abbrev text, utc_offset_minutes integer, label text)` | STB | — | auth |
| `is_commissioner(check_user_id uuid)` | `boolean` | STB | yes | anon+auth |
| `is_commissioner_or_co(check_user_id uuid)` | `boolean` | STB | yes | anon+auth |
| `log_commissioner_action(p_owner_id uuid, p_action_type text, p_target_type text, p_target_id uuid, p_summary text, p_reason text, p_snapshot jsonb)` | `uuid` | VOL | yes | none |
| `require_commissioner()` | `uuid` | VOL | yes | anon+auth |
| `require_commissioner_or_co()` | `uuid` | VOL | yes | anon+auth |
| `rls_auto_enable()` | `event_trigger` | VOL | yes | anon+auth |
| `search_players(p_query text, p_limit integer)` | `TABLE(player_id uuid, full_name text, "position" text, nfl_team text, current_team text, has_edfl_history boolean)` | STB | — | auth |
| `set_co_commissioner(p_team_owner_id uuid, p_enabled boolean, p_reason text)` | `jsonb` | VOL | yes | auth |
| `try_uuid(p text)` | `uuid` | IMM | — | anon+auth |

### Trades

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `accept_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth |
| `decline_trade(p_trade_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth |
| `discard_trade_draft(p_trade_id uuid)` | `jsonb` | VOL | yes | auth |
| `execute_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth |
| `propose_trade(p_assets jsonb, p_note text, p_as_draft boolean)` | `jsonb` | VOL | yes | auth |
| `reverse_trade(p_trade_id uuid, p_reason text, p_force boolean)` | `jsonb` | VOL | yes | auth |
| `submit_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth |
| `trade_back_relief_at(p_at timestamp with time zone)` | `boolean` | STB | yes | auth |
| `trade_impact(p_trade_id uuid)` | `TABLE(team_id uuid, team_name text, cap_before numeric, cap_delta numeric, cap_after numeric, cap_ceiling numeric, cap_ok boolean, cash_before numeric, cash_delta numeric, cash_after numeric, cash_ok boolean, roster_before integer, roster_after integer, roster_limit integer, roster_ok boolean, dead_cap_next_year numeric, players_in integer, players_out integer, picks_in integer, picks_out integer)` | STB | yes | auth |
| `trade_legality(p_trade_id uuid)` | `TABLE(code text, detail text)` | STB | yes | auth |
| `trade_window_at(p_at timestamp with time zone)` | `text` | STB | yes | auth |
| `update_trade_draft(p_trade_id uuid, p_assets jsonb, p_note text)` | `jsonb` | VOL | yes | auth |
| `veto_trade(p_trade_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth |

### Roster, cuts and cap arithmetic

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `commissioner_delete_contract(p_contract_id uuid, p_reason text)` | `uuid` | VOL | yes | auth |
| `compute_cut_charges(p_contract_id uuid, p_june1_designation boolean)` | `jsonb` | STB | yes | auth |
| `compute_trade_charges(p_contract_id uuid, p_to_team_id uuid, p_effective_at timestamp with time zone)` | `jsonb` | STB | yes | auth |
| `cut_player(p_contract_id uuid, p_june1_designation boolean, p_salary_obligation_transfers boolean, p_to_team_id uuid, p_note text)` | `uuid` | VOL | yes | auth |
| `cut_reversal_hours_left(p_event_id uuid)` | `numeric` | STB | yes | anon+auth |
| `edfl_add_real_year(p_contract_id uuid, p_season integer, p_salary numeric, p_guaranteed boolean, p_reason text)` | `jsonb` | VOL | yes | none |
| `edfl_remove_real_year(p_contract_id uuid, p_season integer)` | `jsonb` | VOL | yes | none |
| `edfl_transfer_in_progress()` | `boolean` | STB | — | anon+auth |
| `june1_designations_remaining(p_team_id uuid)` | `integer` | STB | yes | auth |
| `reverse_cut(p_event_id uuid, p_reason text)` | `uuid` | VOL | yes | auth |
| `set_roster_status(p_contract_id uuid, p_status text, p_note text)` | `jsonb` | VOL | yes | auth |
| `team_cap_used_in_season(p_team_id uuid, p_season integer)` | `numeric` | STB | yes | auth |
| `team_compliance_options(p_team_id uuid)` | `TABLE(contract_id uuid, player_name text, player_position text, contract_type text, roster_status text, cap_charge numeric, dead_cap_if_cut numeric, saved_by_cutting numeric, dead_cap_if_traded numeric, saved_by_trading numeric)` | STB | yes | auth |
| `team_cut_previews(p_team_id uuid)` | `TABLE(contract_id uuid, dead_cap_current_year numeric, dead_cap_next_year numeric, dead_cash_current_year numeric, june1_split boolean, weeks_charged integer)` | STB | yes | anon+auth |

### Restructure

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `can_restructure(p_contract_id uuid)` | `jsonb` | STB | yes | auth |
| `compute_restructure_charges(p_contract_id uuid, p_amount numeric, p_from_guaranteed numeric, p_proration_years integer)` | `jsonb` | STB | yes | auth |
| `edfl_restructure_cut_amounts(p_contract_id uuid, p_season integer, p_last_season integer, OUT rs_cur numeric, OUT rs_fut numeric, OUT rs_cash_cur numeric)` | `record` | STB | — | auth |
| `edfl_restructure_in_progress()` | `boolean` | STB | — | auth |
| `edfl_restructure_remaining(p_amount numeric, p_years integer, p_effective integer, p_from_season integer)` | `numeric` | IMM | — | anon+auth |
| `edfl_restructure_share(p_amount numeric, p_years integer, p_effective integer, p_season integer)` | `numeric` | IMM | — | anon+auth |
| `max_restructure(p_contract_id uuid, p_proration_years integer)` | `jsonb` | STB | yes | auth |
| `rebuild_restructure_void_years(p_contract_id uuid)` | `integer` | VOL | yes | none |
| `restructure_contract(p_contract_id uuid, p_amount numeric, p_from_guaranteed numeric, p_proration_years integer, p_note text)` | `jsonb` | VOL | yes | auth |
| `restructure_ineligible_reason(p_contract_id uuid)` | `text` | STB | yes | auth |
| `restructure_permission_denied(p_contract_id uuid)` | `text` | STB | yes | auth |
| `restructure_season_cash(p_contract_id uuid, p_season integer, p_from_guaranteed numeric, p_from_non_guaranteed numeric, p_new_bonus numeric)` | `numeric` | STB | yes | auth |
| `reverse_restructure(p_event_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth |

### Fifth Year Option and season results

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `decline_fifth_year_option(p_contract_id uuid, p_note text)` | `jsonb` | VOL | yes | auth |
| `edfl_fyo_is_round_one(p_contract_id uuid)` | `boolean` | STB | yes | auth |
| `edfl_fyo_pro_bowls(p_player_id uuid, p_draft_year integer)` | `integer` | STB | yes | auth |
| `edfl_fyo_startable_seasons(p_player_id uuid, p_draft_year integer)` | `integer` | STB | yes | auth |
| `edfl_season_results_status(p_season integer)` | `jsonb` | STB | yes | auth |
| `exercise_fifth_year_option(p_contract_id uuid, p_note text)` | `jsonb` | VOL | yes | auth |
| `fifth_year_option_board(p_season integer)` | `jsonb` | STB | yes | auth |
| `fifth_year_option_status(p_contract_id uuid)` | `jsonb` | STB | yes | auth |
| `publish_edfl_season_results(p_season integer, p_republish boolean)` | `jsonb` | VOL | yes | auth |
| `reverse_fifth_year_option(p_event_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth |

### In-season free agency

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `edfl_award_in_progress()` | `boolean` | STB | — | anon+auth |
| `edfl_fa_award_window(p_window_id uuid, p_actor uuid, p_source text)` | `jsonb` | VOL | yes | none |
| `edfl_fa_first_offer_exempt(p_player_id uuid)` | `boolean` | STB | yes | anon+auth |
| `edfl_fa_tier_pause(p_from timestamp with time zone, p_to timestamp with time zone)` | `interval` | STB | — | auth |
| `edfl_free_agent_eligible(p_player_id uuid)` | `boolean` | STB | yes | auth |
| `edfl_signing_fraction(p_first_week integer)` | `numeric` | IMM | — | anon+auth |
| `edfl_weeks_under_contract(p_weeks_charged integer, p_first_week integer)` | `integer` | IMM | — | auth |
| `league_minimum_salary(p_season_year integer)` | `numeric` | IMM | — | anon+auth |
| `preview_fa_window(p_window_id uuid)` | `jsonb` | STB | yes | auth |
| `resolve_fa_window(p_window_id uuid)` | `jsonb` | VOL | yes | auth |
| `season_cash_meets_minimum(p_season_year integer, p_guaranteed numeric, p_non_guaranteed numeric, p_roster_bonus numeric, p_signing_bonus numeric, p_option_bonus numeric)` | `boolean` | IMM | — | anon+auth |
| `submit_fa_offer(p_player_id uuid, p_offer_kind text, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb)` | `jsonb` | VOL | yes | auth |
| `withdraw_fa_offer(p_offer_id uuid)` | `jsonb` | VOL | yes | auth |

### Blind Bid Auction and delegation

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `arm_bid_delegations(p_tier_id uuid, p_fire_mode text, p_max_bids integer, p_max_total_cash numeric, p_max_total_cap numeric, p_note text)` | `jsonb` | VOL | yes | auth |
| `cancel_bid_delegation(p_delegation_id uuid)` | `boolean` | VOL | yes | auth |
| `chart_bid_target(p_tier_id uuid, p_player_id uuid, p_total_years integer, p_interest_level text)` | `jsonb` | STB | — | auth |
| `commissioner_delete_bid(p_bid_id uuid, p_reason text)` | `uuid` | VOL | yes | auth |
| `edfl_delegation_30pct_issue(p_years jsonb, p_option_bonuses jsonb, p_start_year integer, p_total_years integer, p_void_years integer)` | `text` | IMM | — | anon+auth |
| `edfl_delegation_option_bonuses_valid(p_bonuses jsonb, p_start_year integer, p_total_years integer)` | `boolean` | IMM | — | anon+auth |
| `edfl_delegation_years_valid(p_years jsonb, p_start_year integer, p_total_years integer, p_void_years integer)` | `boolean` | IMM | — | anon+auth |
| `evaluate_auction_tier(p_tier_id uuid)` | `void` | VOL | yes | auth |
| `minimum_legal_bid_ppv(p_start_year integer, p_total_years integer)` | `numeric` | STB | — | auth |
| `pass_over_winner(p_bid_id uuid)` | `uuid` | VOL | yes | auth |
| `rebuild_bid_option_void_years(p_bid_id uuid)` | `void` | VOL | yes | auth |
| `rebuild_option_void_years(p_contract_id uuid)` | `void` | VOL | yes | auth |
| `set_tier_value_snapshot(p_tier_id uuid, p_snapshot_id uuid)` | `boolean` | VOL | yes | auth |
| `submit_bid(p_tier_id uuid, p_player_id uuid, p_start_year integer, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb)` | `uuid` | VOL | yes | anon+auth |
| `tier_value_snapshot_id(p_tier_id uuid)` | `uuid` | STB | — | anon+auth |
| `tier_withdrawal_allowance(p_tier_id uuid)` | `integer` | STB | yes | anon+auth |
| `upsert_bid_delegation(p_tier_id uuid, p_player_id uuid, p_mode text, p_priority integer, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb, p_target_ppv numeric, p_philosophy text, p_generated_ppv numeric, p_preview_total_ppv numeric, p_preview_total_cap numeric, p_preview_total_cash numeric, p_assistant_note text, p_validated boolean, p_validation_issues jsonb, p_interest_level text, p_chart_total_ppv numeric, p_chart_derived_target numeric)` | `uuid` | VOL | yes | auth |
| `verify_auction_tier(p_tier_id uuid)` | `integer` | VOL | yes | auth |
| `winning_bid_link(p_contract_id uuid)` | `TABLE(bid_id uuid, tier_name text, tier_season_year integer)` | STB | yes | auth |
| `withdraw_bid(p_bid_id uuid)` | `jsonb` | VOL | yes | anon+auth |

### Player values

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `map_chart_name(p_chart_name text, p_chart_position text, p_player_id uuid, p_note text)` | `integer` | VOL | yes | auth |
| `publish_player_value_snapshot(p_snapshot_id uuid)` | `timestamp with time zone` | VOL | yes | auth |
| `resolve_player_values(p_snapshot_id uuid)` | `jsonb` | VOL | yes | auth |

### Sleeper sync

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `edfl_sync_enforcement_armed()` | `boolean` | STB | yes | auth |
| `edfl_sync_last_action(p_player_id uuid)` | `jsonb` | STB | yes | auth |
| `edfl_sync_week_scores(p_season integer, p_week integer, p_payload jsonb)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_abandon(p_run_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_apply(p_run_id uuid, p_confirm_token text)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_detect(p_run_id uuid)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_open(p_feeds jsonb)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_preview_apply(p_run_id uuid)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_report(p_run_id uuid)` | `TABLE(conflict_id uuid, severity text, conflict_class integer, conflict_type text, team text, player text, app_says jsonb, sleeper_says jsonb, detail text, recommended text, resolution text, note text)` | STB | yes | auth |
| `sleeper_sync_resolve(p_run_id uuid, p_conflict_id uuid, p_resolution text, p_note text)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_resolve_type(p_run_id uuid, p_conflict_type text, p_resolution text, p_note text)` | `jsonb` | VOL | yes | auth |
| `sleeper_sync_stage(p_run_id uuid, p_feed text, p_payload jsonb)` | `jsonb` | VOL | yes | auth |

### Transaction log

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `league_transaction_kinds()` | `TABLE(kind text, rows bigint, newest timestamp with time zone)` | STB | yes | auth |
| `league_transaction_log_unmapped_kinds()` | `TABLE(kind text, rows bigint)` | STB | yes | auth |
| `league_transactions(p_kinds text[], p_from date, p_to date, p_search text, p_team_id uuid, p_sort text, p_limit integer, p_cursor_at timestamp with time zone, p_cursor_id text)` | `TABLE(log_id text, occurred_at timestamp with time zone, kind text, title text, description text, player_id uuid, player_name text, player_position text, team_from_id uuid, team_from text, team_to_id uuid, team_to text, season_year integer, detail jsonb)` | STB | yes | auth |

### Owner profiles

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `owner_directory()` | `TABLE(owner_id uuid, team_id uuid, team_name text, sleeper_roster_id text, is_self boolean, viewer_can_edit boolean, is_commissioner boolean, is_co_commissioner boolean, has_account boolean, full_name text, login_email text, contact_email text, phone text, sleeper_username text, discord_username text, whatsapp_name text, time_zone text, local_time_now text, local_date_now text, utc_offset_minutes integer, preferred_contact text, favorite_nfl_team text, owner_since_year integer, bio text, open_to_trade_talks boolean, last_active_bucket text, last_active_at timestamp with time zone, hidden_fields text[])` | STB | yes | auth |
| `owner_profile_raw(p_owner_id uuid)` | `TABLE(owner_id uuid, team_id uuid, team_name text, login_email text, full_name text, contact_email text, phone text, sleeper_username text, discord_username text, whatsapp_name text, time_zone text, preferred_contact text, favorite_nfl_team text, owner_since_year integer, bio text, open_to_trade_talks boolean, show_full_name boolean, show_contact_email boolean, show_phone boolean, show_sleeper_username boolean, show_discord_username boolean, show_whatsapp_name boolean, show_time_zone boolean, is_self boolean, edited_by_officer boolean, updated_at timestamp with time zone, updated_by_team text)` | STB | yes | auth |
| `save_owner_profile(p_owner_id uuid, p_full_name text, p_contact_email text, p_phone text, p_sleeper_username text, p_discord_username text, p_whatsapp_name text, p_time_zone text, p_preferred_contact text, p_favorite_nfl_team text, p_owner_since_year integer, p_bio text, p_open_to_trade_talks boolean, p_show_full_name boolean, p_show_contact_email boolean, p_show_phone boolean, p_show_sleeper_username boolean, p_show_discord_username boolean, p_show_whatsapp_name boolean, p_show_time_zone boolean)` | `uuid` | VOL | yes | auth |

### Waivers and scoreboard

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `waiver_priority_order(p_season integer, p_through_week integer)` | `TABLE(priority integer, team_id uuid, team_name text, owner_display_name text, games integer, points_for numeric, points_against numeric)` | STB | yes | auth |

### League year rollover

| Function | Returns | Vol | SD | Grants |
|---|---|---|---|---|
| `advance_league_year(p_to_season integer)` | `jsonb` | VOL | yes | auth |
| `preview_league_year_rollover(p_to_season integer)` | `jsonb` | STB | yes | auth |
| `reverse_league_year_rollover(p_season integer, p_reason text)` | `jsonb` | VOL | yes | auth |

*121 callable functions listed.*

### Trigger functions — 28

| Function | Vol | SD | Fired by |
|---|---|---|---|
| `auction_tiers_lock_snapshot` | VOL | — | `auction_tiers.auction_tiers_lock_snapshot_trg` |
| `bid_delegation_settings_touch` | VOL | — | `bid_delegation_settings.bid_delegation_settings_touch_trg` |
| `bid_delegations_check_30pct` | VOL | — | `bid_delegations.enforce_delegation_30pct_insert`, `bid_delegations.enforce_delegation_30pct_update` |
| `bid_delegations_validate_context` | VOL | — | `bid_delegations.bid_delegations_validate_context_trg` |
| `bids_supersede_delegation` | VOL | yes | `bids.bids_supersede_delegation_trg` |
| `check_bid_30pct_rule` | VOL | yes | `bid_option_bonuses.enforce_bid_30pct_rule_ob`, `bid_years.enforce_bid_30pct_rule` |
| `check_bid_deion_rule` | VOL | — | `bid_years.enforce_bid_deion_rule` |
| `check_bid_minimum_salary` | VOL | — | `bid_years.enforce_bid_minimum_salary` |
| `check_bid_option_bonus_year` | VOL | — | `bid_option_bonuses.enforce_bid_option_bonus_year` |
| `check_cap_ceiling` | VOL | — | `contract_years.enforce_cap_ceiling` |
| `check_contract_30pct_rule` | VOL | yes | `contract_option_bonuses.enforce_contract_30pct_rule_ob`, `contract_years.enforce_contract_30pct_rule` |
| `check_contract_minimum_salary` | VOL | — | `contract_years.enforce_contract_minimum_salary` |
| `check_deion_rule` | VOL | — | `contract_years.enforce_deion_rule` |
| `check_deion_rule_on_restructure` | VOL | — | `contract_restructure_bonuses.trg_deion_on_restructure` |
| `check_first_season_week_rules` | VOL | — | `contracts.enforce_first_season_week_rules` |
| `check_inseason_signing_no_roster_bonus` | VOL | — | `contract_years.enforce_inseason_signing_no_roster_bonus` |
| `check_option_bonus_contract_type` | VOL | — | `contract_option_bonuses.enforce_option_bonus_contract_type` |
| `check_option_bonus_not_year1` | VOL | — | `contract_option_bonuses.enforce_option_bonus_not_year1` |
| `check_practice_squad_value` | VOL | — | `contract_years.enforce_practice_squad_value` |
| `check_taxi_eligibility` | VOL | — | `contracts.enforce_taxi_eligibility` |
| `check_taxi_slot_limits` | VOL | — | `contracts.enforce_taxi_slot_limits` |
| `link_team_owner_on_signup` | VOL | yes | **nothing — orphan** |
| `log_cash_transaction_action` | VOL | yes | `team_cash_transactions.log_cash_transaction` |
| `log_roster_move` | VOL | yes | `contracts.trg_log_roster_move` |
| `trg_owner_profiles_touch` | VOL | — | `owner_profiles.owner_profiles_touch` |
| `trg_rebuild_bid_option_void_years` | VOL | yes | `bid_option_bonuses.auto_bid_option_void_years` |
| `trg_rebuild_option_void_years` | VOL | yes | `contract_option_bonuses.auto_option_void_years` |
| `trg_sleeper_sync_last_action` | VOL | yes | `sleeper_sync_conflicts.sleeper_sync_conflicts_last_action` |

**1 trigger functions are attached to no trigger:** `link_team_owner_on_signup`. A trigger function that has never fired
is not a trigger function that works — `check_practice_squad_value` proved that on September 8,
when the first practice-squad signing in league history hit a stale `3` it had been carrying
since the original design. Treat any of these as untested code.

---

## 5. Tables — 57, with every column

Row counts are as of September 8, 2026 and are timestamps, not constants. Six backup tables are
listed last and must not be read. `pk` marks the primary key, `fk→` the referenced table.

#### `auction_tier_players` — 192 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `player_id` | uuid | no |  | fk→`players` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `auction_tier_players_tier_id_player_id_key` — UNIQUE (tier_id, player_id)

#### `auction_tiers` — 4 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `tier_number` | integer | no |  |  |
| `name` | text | no |  |  |
| `opens_at` | timestamp with time zone | no |  |  |
| `closes_at` | timestamp with time zone | no |  |  |
| `resolved_at` | timestamp with time zone | yes |  |  |
| `verified_at` | timestamp with time zone | yes |  |  |
| `value_snapshot_id` | uuid | yes |  | fk→`player_value_snapshots` |

*Constraints:*

- `auction_tiers_season_tier_unique` — UNIQUE (season_year, tier_number)
- `auction_tiers_no_overlap` — EXCLUDE USING gist (tstzrange(opens_at, closes_at, '[]'::text) WITH &&)
- `auction_tiers_valid_window` — CHECK ((closes_at > opens_at))

#### `bid_delegation_settings` — 7 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `tier_id` | uuid | no |  | pk fk→`auction_tiers` |
| `team_id` | uuid | no |  | pk fk→`teams` |
| `default_mode` | text | no | `'propose'::text` |  |
| `fire_mode` | text | no | `'immediate'::text` |  |
| `max_bids` | integer | yes |  |  |
| `max_total_cash` | numeric | yes |  |  |
| `max_total_cap` | numeric | yes |  |  |
| `armed_at` | timestamp with time zone | yes |  |  |
| `armed_note` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `bid_delegation_settings_default_mode_check` — CHECK ((default_mode = ANY (ARRAY['execute'::text, 'propose'::text, 'discretionary'::text])))
- `bid_delegation_settings_fire_mode_check` — CHECK ((fire_mode = ANY (ARRAY['immediate'::text, 'at_close'::text])))
- `bid_delegation_settings_max_total_cap_check` — CHECK (((max_total_cap IS NULL) OR (max_total_cap >= (0)::numeric)))
- `bid_delegation_settings_max_total_cash_check` — CHECK (((max_total_cash IS NULL) OR (max_total_cash >= (0)::numeric)))
- `bid_delegation_settings_max_wins_check` — CHECK (((max_bids IS NULL) OR (max_bids >= 0)))

#### `bid_delegations` — 78 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `team_id` | uuid | no |  | fk→`teams` |
| `player_id` | uuid | no |  | fk→`players` |
| `mode` | text | no |  |  |
| `priority` | integer | no | `100` |  |
| `start_year` | integer | no |  |  |
| `total_years` | integer | no |  |  |
| `void_years` | integer | no | `0` |  |
| `signing_bonus_total` | numeric | no | `0` |  |
| `years` | jsonb | no |  |  |
| `option_bonuses` | jsonb | no | `'[]'::jsonb` |  |
| `target_ppv` | numeric | yes |  |  |
| `philosophy` | text | yes |  |  |
| `generated_ppv` | numeric | yes |  |  |
| `preview_total_ppv` | numeric | yes |  |  |
| `assistant_note` | text | yes |  |  |
| `validated_at` | timestamp with time zone | yes |  |  |
| `validation_issues` | jsonb | no | `'[]'::jsonb` |  |
| `status` | text | no | `'draft'::text` |  |
| `submitted_bid_id` | uuid | yes |  | fk→`bids` |
| `fired_at` | timestamp with time zone | yes |  |  |
| `error_message` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `preview_total_cap` | numeric | yes |  |  |
| `preview_total_cash` | numeric | yes |  |  |
| `interest_level` | text | yes |  | fk→`bid_interest_levels` |
| `chart_total_ppv` | numeric | yes |  |  |
| `chart_derived_target` | numeric | yes |  |  |

*Constraints:*

- `bid_delegations_unique_target` — UNIQUE (tier_id, team_id, player_id)
- `bid_delegations_armed_requires_validation` — CHECK (((status = ANY (ARRAY['draft'::text, 'cancelled'::text])) OR (validated_at IS NOT NULL)))
- `bid_delegations_mode_check` — CHECK ((mode = ANY (ARRAY['execute'::text, 'propose'::text, 'discretionary'::text])))
- `bid_delegations_option_bonuses_shape` — CHECK (edfl_delegation_option_bonuses_valid(option_bonuses, start_year, total_years))
- `bid_delegations_philosophy_check` — CHECK (((philosophy IS NULL) OR (philosophy = ANY (ARRAY['front_loaded'::text, 'back_loaded'::text, 'pay_as_you_go'::text]))))
- `bid_delegations_signing_bonus_total_check` — CHECK ((signing_bonus_total >= (0)::numeric))
- `bid_delegations_status_check` — CHECK ((status = ANY (ARRAY['draft'::text, 'armed'::text, 'submitted'::text, 'superseded'::text, 'skipped'::text, 'failed'::text, 'cancelled'::text])))
- `bid_delegations_submitted_has_bid` — CHECK (((status <> 'submitted'::text) OR (submitted_bid_id IS NOT NULL)))
- `bid_delegations_target_ppv_check` — CHECK (((target_ppv IS NULL) OR (target_ppv > (0)::numeric)))
- `bid_delegations_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))
- `bid_delegations_void_years_check` — CHECK (((void_years >= 0) AND (void_years <= 5)))
- `bid_delegations_years_shape` — CHECK (edfl_delegation_years_valid(years, start_year, total_years, void_years))

#### `bid_interest_levels` — 4 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `code` | text | no |  | pk |
| `label` | text | no |  |  |
| `multiplier` | numeric | no |  |  |
| `sort_order` | integer | no |  |  |
| `description` | text | yes |  |  |

*Constraints:*

- `bid_interest_levels_multiplier_check` — CHECK ((multiplier > (0)::numeric))

#### `bid_option_bonuses` — 266 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `bid_id` | uuid | no |  | fk→`bids` |
| `exercise_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no | `0` |  |

#### `bid_player_hides` — 120 rows

> Per-owner, per-tier hidden players on the auction bid list. A display filter only -- never affects eligibility, the tier roster, or the public interest count. Sealed to the owning team with no commissioner access at any time, because a hide reveals bidding intent and is never published under 6.1(g).

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `team_id` | uuid | no |  | fk→`teams` |
| `player_id` | uuid | no |  | fk→`players` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `bid_player_hides_unique` — UNIQUE (tier_id, team_id, player_id)

#### `bid_withdrawals` — 13 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `team_id` | uuid | no |  | fk→`teams` |
| `player_id` | uuid | no |  | fk→`players` |
| `bid_id` | uuid | yes |  | fk→`bids` |
| `withdrawn_at` | timestamp with time zone | no | `now()` |  |

#### `bid_years` — 1,671 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `bid_id` | uuid | no |  | fk→`bids` |
| `contract_year_number` | integer | no |  |  |
| `league_season_year` | integer | no |  |  |
| `prorated_signing_bonus` | numeric | no | `0` |  |
| `guaranteed_salary` | numeric | no | `0` |  |
| `non_guaranteed_salary` | numeric | no | `0` |  |
| `roster_bonus` | numeric | no | `0` |  |
| `is_void_year` | boolean | no | `false` |  |
| `void_reason` | text | yes |  |  |

*Constraints:*

- `bid_years_unique_year` — UNIQUE (bid_id, contract_year_number)
- `bid_void_reason_matches_flag` — CHECK (((is_void_year AND (void_reason IS NOT NULL)) OR ((NOT is_void_year) AND (void_reason IS NULL))))
- `bid_years_void_reason_check` — CHECK ((void_reason = ANY (ARRAY['signing_bonus'::text, 'option_bonus'::text])))

#### `bids` — 485 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `player_id` | uuid | no |  | fk→`players` |
| `team_id` | uuid | no |  | fk→`teams` |
| `contract_type` | text | no | `'veteran_free_agent'::text` |  |
| `total_years` | integer | no |  |  |
| `void_years` | integer | no | `0` |  |
| `signing_bonus_total` | numeric | no | `0` |  |
| `submitted_at` | timestamp with time zone | no | `now()` |  |
| `status` | text | no | `'pending'::text` |  |
| `contract_id` | uuid | yes |  | fk→`contracts` |
| `start_year` | integer | yes |  |  |
| `option_void_years` | integer | no | `0` |  |

*Constraints:*

- `bids_one_per_team_per_player_per_tier` — UNIQUE (tier_id, player_id, team_id)
- `bids_check` — CHECK (((void_years >= 0) AND (void_years <= (5 - total_years))))
- `bids_contract_type_check` — CHECK ((contract_type = 'veteran_free_agent'::text))
- `bids_option_void_years_check` — CHECK (((option_void_years >= 0) AND (option_void_years <= 4)))
- `bids_status_check` — CHECK ((status = ANY (ARRAY['pending'::text, 'winner'::text, 'lost'::text, 'withdrawn'::text, 'passed_over'::text])))
- `bids_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))

#### `commissioner_actions` — 57 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `performed_by` | uuid | yes |  | fk→`team_owners` |
| `action_type` | text | no |  |  |
| `target_type` | text | yes |  |  |
| `target_id` | uuid | yes |  |  |
| `summary` | text | no |  |  |
| `reason` | text | yes |  |  |
| `snapshot` | jsonb | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

#### `contract_events` — 54 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `event_type` | text | no |  |  |
| `event_season_year` | integer | no |  |  |
| `from_team_id` | uuid | yes |  | fk→`teams` |
| `to_team_id` | uuid | yes |  | fk→`teams` |
| `dead_cap_current_year` | numeric | no | `0` |  |
| `dead_cap_next_year` | numeric | no | `0` |  |
| `notes` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `season_week` | integer | yes |  |  |
| `dead_cash_current_year` | numeric | no | `0` |  |
| `dead_cash_next_year` | numeric | no | `0` |  |
| `weeks_charged` | integer | yes |  |  |
| `june1_split` | boolean | no | `false` |  |
| `salary_obligation_transfers` | boolean | no | `false` |  |
| `created_by` | uuid | yes |  | fk→`team_owners` |
| `snapshot` | jsonb | yes |  |  |
| `june1_designated` | boolean | no | `false` |  |
| `reversed_at` | timestamp with time zone | yes |  |  |
| `reversed_by` | uuid | yes |  | fk→`team_owners` |
| `reversal_reason` | text | yes |  |  |
| `effective_at` | timestamp with time zone | yes |  |  |

*Constraints:*

- `contract_events_event_type_check` — CHECK ((event_type = ANY (ARRAY['released'::text, 'waived_unclaimed'::text, 'waived_claimed'::text, 'traded'::text, 'retired'::text, 'restructure'::text, 'expired'::text, 'fifth_year_option_exercised'::text, 'fifth_year_option_declined'::text])))
- `contract_events_weeks_charged_check` — CHECK (((weeks_charged IS NULL) OR ((weeks_charged >= 0) AND (weeks_charged <= 14))))
- `season_week_range` — CHECK (((season_week IS NULL) OR ((season_week >= 1) AND (season_week <= 14))))

#### `contract_option_bonuses` — 105 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `exercise_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `contract_option_bonuses_bonus_amount_check` — CHECK ((bonus_amount > (0)::numeric))

#### `contract_restructure_bonuses` — 1 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `effective_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no |  |  |
| `proration_years` | integer | no |  |  |
| `from_guaranteed` | numeric | no | `0` |  |
| `from_non_guaranteed` | numeric | no | `0` |  |
| `weeks_charged_at_execution` | integer | no | `0` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `created_by` | uuid | yes |  | fk→`team_owners` |

*Constraints:*

- `contract_restructure_bonuses_bonus_amount_check` — CHECK ((bonus_amount > (0)::numeric))
- `contract_restructure_bonuses_from_guaranteed_check` — CHECK ((from_guaranteed >= (0)::numeric))
- `contract_restructure_bonuses_from_non_guaranteed_check` — CHECK ((from_non_guaranteed >= (0)::numeric))
- `contract_restructure_bonuses_proration_years_check` — CHECK (((proration_years >= 2) AND (proration_years <= 5)))
- `restructure_amounts_are_whole_dollars` — CHECK (((bonus_amount = floor(bonus_amount)) AND (from_guaranteed = floor(from_guaranteed)) AND (from_non_guaranteed = floor(from_non_guaranteed))))
- `restructure_split_sums_to_amount` — CHECK ((abs(((from_guaranteed + from_non_guaranteed) - bonus_amount)) < 0.005))

#### `contract_years` — 1,071 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `contract_year_number` | integer | no |  |  |
| `league_season_year` | integer | no |  |  |
| `prorated_signing_bonus` | numeric | no | `0` |  |
| `guaranteed_salary` | numeric | no | `0` |  |
| `non_guaranteed_salary` | numeric | no | `0` |  |
| `option_bonus` | numeric | no | `0` |  |
| `roster_bonus` | numeric | no | `0` |  |
| `is_void_year` | boolean | no | `false` |  |
| `prorated_option_bonus` | numeric | no | `0` |  |
| `void_reason` | text | yes |  |  |
| `added_by` | text | yes |  |  |

*Constraints:*

- `contract_years_contract_id_contract_year_number_key` — UNIQUE (contract_id, contract_year_number)
- `contract_years_added_by_check` — CHECK (((added_by IS NULL) OR (added_by = ANY (ARRAY['fifth_year_option'::text, 'extension'::text]))))
- `contract_years_contract_year_number_check` — CHECK (((contract_year_number >= 1) AND (contract_year_number <= 9)))
- `contract_years_void_reason_check` — CHECK ((void_reason = ANY (ARRAY['signing_bonus'::text, 'option_bonus'::text, 'restructure'::text])))
- `void_reason_matches_flag` — CHECK (((is_void_year AND (void_reason IS NOT NULL)) OR ((NOT is_void_year) AND (void_reason IS NULL))))
- `void_year_no_real_salary` — CHECK (((NOT is_void_year) OR ((guaranteed_salary = (0)::numeric) AND (non_guaranteed_salary = (0)::numeric) AND (option_bonus = (0)::numeric) AND (roster_bonus = (0)::numeric))))

#### `contracts` — 323 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `team_id` | uuid | no |  | fk→`teams` |
| `contract_type` | contract_type | no |  |  |
| `status` | contract_status | no | `'active'::contract_status` |  |
| `roster_status` | roster_status | no | `'active'::roster_status` |  |
| `start_year` | integer | no |  |  |
| `total_years` | integer | no |  |  |
| `draft_year` | integer | yes |  |  |
| `draft_round` | integer | yes |  |  |
| `draft_pick` | integer | yes |  |  |
| `signing_bonus_total` | numeric | no | `0` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `void_years` | integer | no | `0` |  |
| `extends_contract_id` | uuid | yes |  | fk→`contracts` |
| `option_void_years` | integer | no | `0` |  |
| `exempt_30pct` | boolean | no | `false` |  |
| `first_season_week` | integer | yes |  |  |

*Constraints:*

- `contracts_first_season_week_range` — CHECK (((first_season_week IS NULL) OR ((first_season_week >= 1) AND (first_season_week <= 14))))
- `contracts_option_void_years_check` — CHECK (((option_void_years >= 0) AND (option_void_years <= 4)))
- `contracts_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))
- `void_years_only_for_free_agents` — CHECK (((void_years = 0) OR (contract_type = 'veteran_free_agent'::contract_type)))
- `void_years_range` — CHECK (((void_years >= 0) AND (void_years <= (5 - total_years))))

#### `draft_picks` — 120 rows

> Future rookie draft pick ownership, rule 7.1(b) and 7.8(b). Ownership only - a pick has no cap or cash value until a player is drafted with it. original_team_id is retained because draft order derives from that team's standings.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `round` | integer | no |  |  |
| `original_team_id` | uuid | no |  | fk→`teams` |
| `current_team_id` | uuid | no |  | fk→`teams` |
| `pick_number` | integer | yes |  |  |
| `used_by_contract_id` | uuid | yes |  | fk→`contracts` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `draft_picks_season_year_round_original_team_id_key` — UNIQUE (season_year, round, original_team_id)

#### `edfl_scoring_settings` — 1 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | integer | no | `nextval('edfl_scoring_settings_id_seq'::r...` | pk |
| `effective_season_year` | integer | no |  |  |
| `passing_yards_points_per_yard` | numeric(10,6) | no | `(1.0 / (12)::numeric)` |  |
| `passing_td_points` | numeric(6,2) | no | `6` |  |
| `passing_first_down_points` | numeric(6,2) | no | `1` |  |
| `passing_2pt_points` | numeric(6,2) | no | `2` |  |
| `interception_thrown_points` | numeric(6,2) | no | `'-2'::integer` |  |
| `completion_points` | numeric(6,2) | no | `0.25` |  |
| `incomplete_pass_points` | numeric(6,2) | no | `'-0.05'::numeric` |  |
| `qb_sacked_points` | numeric(6,2) | no | `'-1'::integer` |  |
| `rushing_yards_points_per_yard` | numeric(10,6) | no | `(1.0 / (12)::numeric)` |  |
| `rushing_td_points` | numeric(6,2) | no | `5` |  |
| `rushing_first_down_points` | numeric(6,2) | no | `1` |  |
| `rushing_2pt_points` | numeric(6,2) | no | `2` |  |
| `reception_points` | numeric(6,2) | no | `0.5` |  |
| `receiving_yards_points_per_yard` | numeric(10,6) | no | `(1.0 / (10)::numeric)` |  |
| `receiving_td_points` | numeric(6,2) | no | `6` |  |
| `receiving_first_down_points` | numeric(6,2) | no | `1` |  |
| `reception_bonus_wr_points` | numeric(6,2) | no | `0.25` |  |
| `reception_bonus_te_points` | numeric(6,2) | no | `0.50` |  |
| `receiving_2pt_points` | numeric(6,2) | no | `2` |  |
| `fumble_points` | numeric(6,2) | no | `'-0.5'::numeric` |  |
| `fumble_lost_points` | numeric(6,2) | no | `'-1.5'::numeric` |  |
| `punt_return_points_per_yard` | numeric(10,6) | no | `(1.0 / (8)::numeric)` |  |
| `kick_return_points_per_yard` | numeric(10,6) | no | `(1.0 / (15)::numeric)` |  |
| `fg_made_0_39_points` | numeric(6,2) | no | `3` |  |
| `fg_made_50_59_points` | numeric(6,2) | no | `4` |  |
| `fg_made_60_plus_points` | numeric(6,2) | no | `4.5` |  |
| `fg_missed_0_19_points` | numeric(6,2) | no | `'-3'::integer` |  |
| `fg_missed_20_29_points` | numeric(6,2) | no | `'-2'::integer` |  |
| `fg_missed_30_39_points` | numeric(6,2) | no | `'-1'::integer` |  |
| `pat_made_points` | numeric(6,2) | no | `1` |  |
| `pat_missed_points` | numeric(6,2) | no | `'-1'::integer` |  |
| `created_at` | timestamp with time zone | yes | `now()` |  |
| `fg_made_40_49_points` | numeric(6,2) | no | `3` |  |
| `kick_return_td_points` | numeric(6,2) | no | `6` |  |
| `punt_return_td_points` | numeric(6,2) | no | `6` |  |

#### `edfl_season_results` — 3,228 rows

> Published EDFL season results - one row per player-season, settled once after the season ends and never recomputed. composite = 0.75 * season points + 0.25 * (FPPG * 17). pos_rank ranks every player at the position. pro_bowl_slot is non-null for the 48 selections (4 QB / 8 RB / 16 WR / 8 TE / 8 FLEX / 4 K, minimum 6 games, FLEX filled last). Written by publish_edfl_season_results(). This is a RECORD, not a derivation: a later stats correction does not move it, which is what stops a Fifth Year Option tier changing after an owner has decided. Spec: claude/EDFL_ProBowl_Spec_v1.0.md.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `player_id` | uuid | no |  | pk fk→`players` |
| `position` | text | no |  |  |
| `games` | integer | no |  |  |
| `fantasy_points` | numeric | no |  |  |
| `fppg` | numeric | no |  |  |
| `composite` | numeric | no |  |  |
| `pos_rank` | integer | no |  |  |
| `pro_bowl_slot` | text | yes |  |  |
| `pro_bowl_slot_rank` | integer | yes |  |  |
| `published_at` | timestamp with time zone | no | `now()` |  |
| `published_by` | uuid | yes |  | fk→`team_owners` |

#### `edfl_tag_values` — 20 rows

> Fifth Year Option and franchise/transition tag values, per season, position and tier. Tier 4 = franchise tag = top-5 average of cap charges at the position; tier 3 = transition tag = top-10; tier 2 = 3rd-20th; tier 1 = 3rd-25th. Computed by the five-year cap-percentage method with a back-cast salary history (real NFL cap growth 2022-2026), giving a uniform 0.842497 factor. Source: claude/EDFL_Tag_and_FYO_Pricing_v0.2.md. cap_pct is carried so a future season can be derived from its own cap; value is the ratified dollar figure and is what the app charges.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `position` | text | no |  | pk |
| `tier` | integer | no |  | pk |
| `cap_pct` | numeric(6,4) | no |  |  |
| `value` | numeric | no |  |  |
| `basis_note` | text | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `edfl_tag_values_pos_ck` — CHECK (("position" = ANY (ARRAY['QB'::text, 'RB'::text, 'WR'::text, 'TE'::text, 'K'::text])))
- `edfl_tag_values_tier_ck` — CHECK (((tier >= 1) AND (tier <= 4)))
- `edfl_tag_values_whole_ck` — CHECK ((value = trunc(value)))

#### `fantasy_game_scores` — 0 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `player_id` | uuid | no |  | pk fk→`players` |
| `game_id` | text | no |  | pk fk→`nfl_games` |
| `scoring_settings_id` | integer | no |  | pk fk→`edfl_scoring_settings` |
| `fantasy_points` | numeric(8,2) | no |  |  |
| `scoring_breakdown` | jsonb | yes |  |  |
| `calculated_at` | timestamp with time zone | yes | `now()` |  |

#### `free_agent_offer_option_bonuses` — 0 rows

> Option bonuses attached to an in-season free agency offer. Mirrors bid_option_bonuses. Written only by submit_fa_offer(); copied into contract_option_bonuses by edfl_fa_award_window(), which is where trg_rebuild_option_void_years then derives the proration and the option void years.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `offer_id` | uuid | no |  | fk→`free_agent_offers` |
| `exercise_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no |  |  |

*Constraints:*

- `free_agent_offer_option_bonus_offer_id_exercise_season_year_key` — UNIQUE (offer_id, exercise_season_year)
- `free_agent_offer_option_bonuses_bonus_amount_check` — CHECK ((bonus_amount > (0)::numeric))

#### `free_agent_offer_years` — 0 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `offer_id` | uuid | no |  | fk→`free_agent_offers` |
| `contract_year_number` | integer | no |  |  |
| `league_season_year` | integer | no |  |  |
| `prorated_signing_bonus` | numeric | no | `0` |  |
| `guaranteed_salary` | numeric | no | `0` |  |
| `non_guaranteed_salary` | numeric | no | `0` |  |
| `roster_bonus` | numeric | no | `0` |  |
| `is_void_year` | boolean | no | `false` |  |
| `void_reason` | text | yes |  |  |

*Constraints:*

- `free_agent_offer_years_offer_id_contract_year_number_key` — UNIQUE (offer_id, contract_year_number)

#### `free_agent_offers` — 0 rows

> One row per team per window. A revision UPDATES this row and resets submitted_at, which is what FA-4 means by a revision resetting tie-break position. A withdrawal (FA-A) sets status to withdrawn and may be replaced by a fresh offer.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `window_id` | uuid | no |  | fk→`free_agent_windows` |
| `player_id` | uuid | no |  | fk→`players` |
| `team_id` | uuid | no |  | fk→`teams` |
| `offer_kind` | text | no |  |  |
| `contract_type` | contract_type | no |  |  |
| `start_year` | integer | no |  |  |
| `total_years` | integer | no |  |  |
| `void_years` | integer | no | `0` |  |
| `option_void_years` | integer | no | `0` |  |
| `signing_bonus_total` | numeric | no | `0` |  |
| `submitted_at` | timestamp with time zone | no | `now()` |  |
| `status` | text | no | `'submitted'::text` |  |
| `contract_id` | uuid | yes |  | fk→`contracts` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `free_agent_offers_offer_kind_check` — CHECK ((offer_kind = ANY (ARRAY['active'::text, 'practice_squad'::text])))
- `free_agent_offers_ps_one_year` — CHECK (((offer_kind <> 'practice_squad'::text) OR (total_years = 1)))
- `free_agent_offers_status_check` — CHECK ((status = ANY (ARRAY['submitted'::text, 'withdrawn'::text, 'lost'::text, 'won'::text, 'passed_over'::text])))
- `free_agent_offers_total_years_check` — CHECK ((total_years >= 1))

#### `free_agent_windows` — 0 rows

> One eight-hour sealed window per player (FA-1). closes_at is opened_at + 8h, extended by any overlap with an open auction tier (FA-10). Resolution is by hand (FA-8).

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `season_year` | integer | no |  |  |
| `opened_at` | timestamp with time zone | no | `now()` |  |
| `opened_by_team_id` | uuid | no |  | fk→`teams` |
| `closes_at` | timestamp with time zone | no |  |  |
| `closed_at` | timestamp with time zone | yes |  |  |
| `resolved_at` | timestamp with time zone | yes |  |  |
| `resolved_by` | uuid | yes |  |  |
| `status` | text | no | `'open'::text` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `free_agent_windows_status_check` — CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'resolved'::text, 'void'::text])))

#### `league_calendar_events` — 49 rows

> Rule book 1.5 League Calendar. One row per dated milestone in a league year (Mar 1 - end of Feb). Reference only: the binding rule for each date lives in its own rule book section, cited in rule_ref. Public read, no write policy - the commissioner edits via SQL until a calendar admin page ships.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `starts_at` | timestamp with time zone | no |  |  |
| `ends_at` | timestamp with time zone | yes |  |  |
| `time_is_exact` | boolean | no | `false` |  |
| `title` | text | no |  |  |
| `detail` | text | yes |  |  |
| `category` | text | no |  |  |
| `rule_ref` | text | yes |  |  |
| `is_provisional` | boolean | no | `false` |  |
| `sort_hint` | integer | no | `0` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `league_calendar_events_category_check` — CHECK ((category = ANY (ARRAY['season'::text, 'money'::text, 'contracts'::text, 'cuts'::text, 'trades'::text, 'auction'::text, 'draft'::text, 'roster'::text, 'gameplay'::text, 'governance'::text])))
- `league_calendar_events_span_check` — CHECK (((ends_at IS NULL) OR (ends_at >= starts_at)))

#### `league_cap_settings` — 2 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `nfl_salary_cap` | numeric | yes |  |  |
| `fantasy_salary_cap` | numeric | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `in_season_starts_at` | date | yes |  |  |
| `cap_ceiling` | numeric | yes |  |  |
| `is_provisional` | boolean | no | `false` |  |

#### `league_config` — 1 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | boolean | no | `true` | pk |
| `league_name` | text | no | `'Dynasty League'::text` |  |
| `sleeper_league_id` | text | yes |  |  |
| `current_season_year` | integer | no |  |  |
| `taxi_squad_size` | integer | no | `7` |  |
| `active_roster_size` | integer | no | `25` |  |
| `min_spend_pct` | numeric | no | `0.89` |  |
| `league_short_name` | text | yes |  |  |
| `practice_squad_max_value` | numeric | no | `3` |  |
| `cuts_open_after` | timestamp with time zone | no | `'2026-09-01 04:00:00+00'::timestamp with ...` |  |
| `june1_designations_per_year` | integer | no | `2` |  |
| `cut_reversal_window_hours` | numeric | no | `96` |  |
| `trade_reversal_window_hours` | numeric | no | `96` |  |
| `taxi_non_rookie_slots` | integer | no | `3` |  |

*Constraints:*

- `single_row` — CHECK (id)

#### `league_weeks` — 14 rows

> Weekly salary charge calendar. One row per (season_year, week_number 1-14). charge_at = 00:01 Eastern on the day of that week's FIRST NFL game — usually Thursday, but not always (e.g. a Wednesday season opener). Seeded by the commissioner from the NFL schedule via the schedule-loader feature (prompted July 1 each year). Empty for a season = off-season state, zero weeks charged.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `week_number` | integer | no |  | pk |
| `charge_at` | timestamp with time zone | no |  |  |
| `first_game_label` | text | yes |  |  |
| `is_provisional` | boolean | no | `false` |  |

*Constraints:*

- `league_weeks_week_number_check` — CHECK (((week_number >= 1) AND (week_number <= 14)))

#### `nfl_games` — 1,424 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `game_id` | text | no |  | pk |
| `season_year` | integer | no |  |  |
| `week` | integer | no |  |  |
| `season_type` | text | no | `'REG'::text` |  |
| `game_date` | date | yes |  |  |
| `home_team` | text | yes |  |  |
| `away_team` | text | yes |  |  |

#### `owner_profiles` — 10 rows

> Owner Info tab (app/team/[teamId]). One row per team_owners row. Contact detail carries a per-field show_* toggle the owner controls; the commissioner and co-commissioner see every field regardless, by ruling of September 6 2026. Edit is owner-or-officer. Reads go through owner_directory() and owner_profile_raw(); direct table access is restricted by RLS to the owner and officers. time_zone is an IANA name validated on write against pg_timezone_names -- it is not a check constraint because that lookup is not IMMUTABLE.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `owner_id` | uuid | no |  | pk fk→`team_owners` |
| `full_name` | text | yes |  |  |
| `contact_email` | text | yes |  |  |
| `phone` | text | yes |  |  |
| `sleeper_username` | text | yes |  |  |
| `discord_username` | text | yes |  |  |
| `whatsapp_name` | text | yes |  |  |
| `time_zone` | text | yes |  |  |
| `preferred_contact` | text | yes |  |  |
| `favorite_nfl_team` | text | yes |  |  |
| `owner_since_year` | integer | yes |  |  |
| `bio` | text | yes |  |  |
| `open_to_trade_talks` | boolean | no | `true` |  |
| `show_full_name` | boolean | no | `true` |  |
| `show_contact_email` | boolean | no | `false` |  |
| `show_phone` | boolean | no | `false` |  |
| `show_sleeper_username` | boolean | no | `true` |  |
| `show_discord_username` | boolean | no | `true` |  |
| `show_whatsapp_name` | boolean | no | `true` |  |
| `show_time_zone` | boolean | no | `true` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `updated_by` | uuid | yes |  | fk→`team_owners` |

*Constraints:*

- `owner_profiles_bio_len` — CHECK (((bio IS NULL) OR (char_length(bio) <= 500)))
- `owner_profiles_contact_email_len` — CHECK (((contact_email IS NULL) OR ((char_length(contact_email) >= 3) AND (char_length(contact_email) <= 254))))
- `owner_profiles_contact_email_shape` — CHECK (((contact_email IS NULL) OR (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text)))
- `owner_profiles_discord_len` — CHECK (((discord_username IS NULL) OR ((char_length(discord_username) >= 2) AND (char_length(discord_username) <= 40))))
- `owner_profiles_favorite_team_len` — CHECK (((favorite_nfl_team IS NULL) OR ((char_length(favorite_nfl_team) >= 2) AND (char_length(favorite_nfl_team) <= 40))))
- `owner_profiles_full_name_len` — CHECK (((full_name IS NULL) OR ((char_length(full_name) >= 1) AND (char_length(full_name) <= 80))))
- `owner_profiles_phone_len` — CHECK (((phone IS NULL) OR ((char_length(phone) >= 5) AND (char_length(phone) <= 32))))
- `owner_profiles_preferred_contact_ok` — CHECK (((preferred_contact IS NULL) OR (preferred_contact = ANY (ARRAY['discord'::text, 'whatsapp'::text, 'email'::text, 'text'::text, 'sleeper'::text, 'app'::text]))))
- `owner_profiles_since_year_range` — CHECK (((owner_since_year IS NULL) OR ((owner_since_year >= 2000) AND (owner_since_year <= 2100))))
- `owner_profiles_sleeper_len` — CHECK (((sleeper_username IS NULL) OR ((char_length(sleeper_username) >= 1) AND (char_length(sleeper_username) <= 40))))
- `owner_profiles_time_zone_len` — CHECK (((char_length(time_zone) >= 3) AND (char_length(time_zone) <= 64)))
- `owner_profiles_whatsapp_len` — CHECK (((whatsapp_name IS NULL) OR ((char_length(whatsapp_name) >= 1) AND (char_length(whatsapp_name) <= 60))))

#### `player_game_stats` — 33,555 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `nextval('player_game_stats_id_seq'::regcl...` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `game_id` | text | no |  | fk→`nfl_games` |
| `team` | text | yes |  |  |
| `opponent_team` | text | yes |  |  |
| `position` | text | yes |  |  |
| `completions` | integer | yes | `0` |  |
| `attempts` | integer | yes | `0` |  |
| `passing_yards` | integer | yes | `0` |  |
| `passing_tds` | integer | yes | `0` |  |
| `passing_first_downs` | integer | yes | `0` |  |
| `passing_2pt_conversions` | integer | yes | `0` |  |
| `interceptions_thrown` | integer | yes | `0` |  |
| `times_sacked` | integer | yes | `0` |  |
| `carries` | integer | yes | `0` |  |
| `rushing_yards` | integer | yes | `0` |  |
| `rushing_tds` | integer | yes | `0` |  |
| `rushing_first_downs` | integer | yes | `0` |  |
| `rushing_2pt_conversions` | integer | yes | `0` |  |
| `targets` | integer | yes | `0` |  |
| `receptions` | integer | yes | `0` |  |
| `receiving_yards` | integer | yes | `0` |  |
| `receiving_tds` | integer | yes | `0` |  |
| `receiving_first_downs` | integer | yes | `0` |  |
| `receiving_2pt_conversions` | integer | yes | `0` |  |
| `fumbles` | integer | yes | `0` |  |
| `fumbles_lost` | integer | yes | `0` |  |
| `punt_return_yards` | integer | yes | `0` |  |
| `kick_return_yards` | integer | yes | `0` |  |
| `fg_made_0_19` | integer | yes | `0` |  |
| `fg_made_20_29` | integer | yes | `0` |  |
| `fg_made_30_39` | integer | yes | `0` |  |
| `fg_made_40_49` | integer | yes | `0` |  |
| `fg_made_50_59` | integer | yes | `0` |  |
| `fg_made_60_plus` | integer | yes | `0` |  |
| `fg_missed_0_19` | integer | yes | `0` |  |
| `fg_missed_20_29` | integer | yes | `0` |  |
| `fg_missed_30_39` | integer | yes | `0` |  |
| `fg_missed_40_plus` | integer | yes | `0` |  |
| `pat_made` | integer | yes | `0` |  |
| `pat_missed` | integer | yes | `0` |  |
| `source` | text | no | `'nflverse'::text` |  |
| `created_at` | timestamp with time zone | yes | `now()` |  |
| `kick_returns` | integer | yes | `0` |  |
| `punt_returns` | integer | yes | `0` |  |
| `kick_return_tds` | integer | yes | `0` |  |
| `punt_return_tds` | integer | yes | `0` |  |

*Constraints:*

- `player_game_stats_player_id_game_id_key` — UNIQUE (player_id, game_id)

#### `player_value_name_map` — 10 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `chart_name` | text | no |  | pk |
| `chart_position` | text | no |  | pk |
| `player_id` | uuid | yes |  | fk→`players` |
| `is_absent` | boolean | no | `false` |  |
| `resolved_at` | timestamp with time zone | no | `now()` |  |
| `resolved_by` | uuid | yes |  | fk→`team_owners` |
| `note` | text | yes |  |  |

*Constraints:*

- `player_value_name_map_resolution` — CHECK (((player_id IS NOT NULL) OR is_absent))

#### `player_value_snapshots` — 4 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `label` | text | no |  |  |
| `as_of_date` | date | no |  |  |
| `source_note` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `published_at` | timestamp with time zone | yes |  |  |
| `length_multipliers` | numeric[] | no | `ARRAY[1.0, 1.9, 2.7, 3.4, 4.0]` |  |

*Constraints:*

- `player_value_snapshots_label_key` — UNIQUE (label)
- `player_value_snapshots_multiplier_length` — CHECK ((array_length(length_multipliers, 1) = 5))

#### `player_values` — 2,000 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `snapshot_id` | uuid | no |  | fk→`player_value_snapshots` |
| `chart_position` | text | no |  |  |
| `chart_rank` | integer | no |  |  |
| `chart_name` | text | no |  |  |
| `chart_nfl_team` | text | yes |  |  |
| `per_year_value` | numeric | no |  |  |
| `likely_years` | integer | no |  |  |
| `total_ppv` | numeric | no |  |  |
| `value_tier` | text | yes |  |  |
| `notes` | text | yes |  |  |
| `player_id` | uuid | yes |  | fk→`players` |
| `match_status` | text | no | `'unmatched'::text` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `player_values_unique_in_snapshot` — UNIQUE (snapshot_id, chart_position, chart_name)
- `player_values_chart_position_check` — CHECK ((chart_position = ANY (ARRAY['QB'::text, 'RB'::text, 'WR'::text, 'TE'::text, 'K'::text])))
- `player_values_likely_years_check` — CHECK (((likely_years >= 1) AND (likely_years <= 5)))
- `player_values_match_status_check` — CHECK ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'ambiguous'::text, 'absent'::text])))
- `player_values_per_year_value_check` — CHECK ((per_year_value >= (0)::numeric))
- `player_values_total_ppv_check` — CHECK ((total_ppv >= (0)::numeric))

#### `players` — 3,253 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `sleeper_player_id` | text | yes |  |  |
| `full_name` | text | no |  |  |
| `position` | text | yes |  |  |
| `nfl_team` | text | yes |  |  |
| `status` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `gsis_id` | text | yes |  |  |

*Constraints:*

- `players_gsis_id_key` — UNIQUE (gsis_id)
- `players_sleeper_player_id_key` — UNIQUE (sleeper_player_id)

#### `ppv_weight_table` — 7 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `contract_year_number` | integer | no |  | pk |
| `guaranteed_weight` | numeric | no |  |  |
| `non_guaranteed_weight` | numeric | no |  |  |
| `roster_bonus_weight` | numeric | no | `0` |  |
| `option_bonus_weight` | numeric | yes |  |  |

*Constraints:*

- `ppv_weight_table_contract_year_number_check` — CHECK (((contract_year_number >= 1) AND (contract_year_number <= 7)))

#### `rookie_wage_scale_slots` — 130 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `draft_year` | integer | no |  | pk |
| `round` | integer | no |  | pk |
| `pick` | integer | no |  | pk |
| `overall` | integer | no |  |  |
| `structure` | text | no |  |  |
| `aav` | numeric | no |  |  |
| `kept_years` | integer | no |  |  |
| `signing_bonus_total` | numeric | no |  |  |

*Constraints:*

- `rookie_wage_scale_slots_structure_check` — CHECK ((structure = ANY (ARRAY['rookie_scale'::text, 'league_minimum'::text])))

#### `rookie_wage_scale_years` — 360 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `draft_year` | integer | no |  | pk fk→`rookie_wage_scale_slots` |
| `round` | integer | no |  | pk fk→`rookie_wage_scale_slots` |
| `pick` | integer | no |  | pk fk→`rookie_wage_scale_slots` |
| `contract_year_number` | integer | no |  | pk |
| `season_year` | integer | no |  |  |
| `prorated_signing_bonus` | numeric | no | `0` |  |
| `guaranteed_salary` | numeric | no | `0` |  |
| `non_guaranteed_salary` | numeric | no | `0` |  |
| `roster_bonus` | numeric | no | `0` |  |

#### `roster_moves` — 34 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `player_id` | uuid | no |  | fk→`players` |
| `team_id` | uuid | no |  | fk→`teams` |
| `from_status` | roster_status | no |  |  |
| `to_status` | roster_status | no |  |  |
| `season_year` | integer | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `effective_at` | timestamp with time zone | no | `now()` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

#### `sleeper_sync_conflicts` — 30 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `run_id` | uuid | no |  | fk→`sleeper_sync_runs` |
| `conflict_class` | integer | no |  |  |
| `conflict_type` | text | no |  |  |
| `severity` | text | no |  |  |
| `team_id` | uuid | yes |  | fk→`teams` |
| `counterparty_team_id` | uuid | yes |  | fk→`teams` |
| `player_id` | uuid | yes |  | fk→`players` |
| `contract_id` | uuid | yes |  | fk→`contracts` |
| `sleeper_player_id` | text | yes |  |  |
| `app_value` | jsonb | yes |  |  |
| `sleeper_value` | jsonb | yes |  |  |
| `detail` | text | no |  |  |
| `recommended_resolution` | text | yes |  |  |
| `resolution` | text | yes |  |  |
| `resolution_note` | text | yes |  |  |
| `resolved_by` | uuid | yes |  | fk→`team_owners` |
| `resolved_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `last_action` | text | yes |  |  |
| `last_action_at` | timestamp with time zone | yes |  |  |

*Constraints:*

- `sleeper_sync_conflicts_res_ck` — CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['app_wins'::text, 'sleeper_wins'::text, 'worklist'::text, 'acknowledged'::text, 'deferred'::text]))))
- `sleeper_sync_conflicts_sev_ck` — CHECK ((severity = ANY (ARRAY['blocking'::text, 'advisory'::text])))

#### `sleeper_sync_runs` — 1 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `initiated_by` | uuid | no |  | fk→`team_owners` |
| `feeds` | jsonb | no | `'[]'::jsonb` |  |
| `status` | text | no | `'staged'::text` |  |
| `sleeper_fetched_at` | timestamp with time zone | yes |  |  |
| `db_snapshot_at` | timestamp with time zone | no | `now()` |  |
| `payload_digest` | jsonb | no | `'{}'::jsonb` |  |
| `detected_at` | timestamp with time zone | yes |  |  |
| `applied_at` | timestamp with time zone | yes |  |  |
| `applied_by` | uuid | yes |  | fk→`team_owners` |
| `abandoned_reason` | text | yes |  |  |
| `summary` | jsonb | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `sleeper_sync_runs_status_ck` — CHECK ((status = ANY (ARRAY['staged'::text, 'detected'::text, 'adjudicated'::text, 'applied'::text, 'abandoned'::text])))

#### `sleeper_sync_staging` — 20 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `nextval('sleeper_sync_staging_id_seq'::re...` | pk |
| `run_id` | uuid | no |  | fk→`sleeper_sync_runs` |
| `feed` | text | no |  |  |
| `natural_key` | text | no |  |  |
| `payload` | jsonb | no |  |  |

*Constraints:*

- `sleeper_sync_staging_run_id_feed_natural_key_key` — UNIQUE (run_id, feed, natural_key)
- `sleeper_sync_staging_feed_ck` — CHECK ((feed = ANY (ARRAY['rosters'::text, 'players'::text, 'users'::text, 'stats'::text])))

#### `team_cash_budgets` — 10 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `starting_cash` | numeric | no |  |  |

*Constraints:*

- `team_cash_budgets_one_per_season` — UNIQUE (team_id, season_year)

#### `team_cash_transactions` — 12 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `amount` | numeric | no |  |  |
| `category` | text | no |  |  |
| `note` | text | yes |  |  |
| `created_by` | uuid | yes |  | fk→`team_owners` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `team_cash_transactions_category_check` — CHECK ((category = ANY (ARRAY['cash_purchase'::text, 'penalty'::text, 'adjustment'::text, 'other'::text])))

#### `team_owners` — 10 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `email` | text | no |  |  |
| `user_id` | uuid | yes |  | fk→`auth.users` |
| `is_commissioner` | boolean | no | `false` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `is_co_commissioner` | boolean | no | `false` |  |

*Constraints:*

- `team_owners_email_key` — UNIQUE (email)
- `team_owners_team_id_key` — UNIQUE (team_id)
- `team_owners_user_id_key` — UNIQUE (user_id)

#### `team_week_scores` — 0 rows

> Weekly team scores mirrored from Sleeper /league/{id}/matchups/{week}. Points are stored at Sleeper's own precision (ruling, Sep 7 2026). matchup_id pairs two teams in a week; points against is derived from the opponent rather than stored, because Sleeper's rosters feed does not carry fpts_against.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `week_number` | integer | no |  | pk |
| `team_id` | uuid | no |  | pk fk→`teams` |
| `matchup_id` | integer | yes |  |  |
| `points` | numeric(8,2) | no | `0` |  |
| `synced_at` | timestamp with time zone | no | `now()` |  |
| `synced_by` | uuid | yes |  |  |

#### `teams` — 10 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `name` | text | no |  |  |
| `owner_display_name` | text | yes |  |  |
| `sleeper_roster_id` | text | yes |  |  |
| `sleeper_owner_id` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `sleeper_team_name` | text | yes |  |  |
| `division` | integer | yes |  |  |

*Constraints:*

- `teams_sleeper_roster_id_unique` — UNIQUE (sleeper_roster_id)

#### `trade_assets` — 96 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `trade_id` | uuid | no |  | fk→`trades` |
| `asset_type` | trade_asset_type | no |  |  |
| `contract_id` | uuid | yes |  | fk→`contracts` |
| `player_id` | uuid | yes |  | fk→`players` |
| `draft_pick_id` | uuid | yes |  | fk→`draft_picks` |
| `from_team_id` | uuid | no |  | fk→`teams` |
| `to_team_id` | uuid | no |  | fk→`teams` |
| `condition_text` | text | yes |  |  |
| `condition_status` | text | yes |  |  |
| `settlement` | jsonb | yes |  |  |
| `resulting_contract_id` | uuid | yes |  | fk→`contracts` |
| `contract_event_id` | uuid | yes |  | fk→`contract_events` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `trade_asset_moves` — CHECK ((from_team_id <> to_team_id))
- `trade_asset_shape` — CHECK ((((asset_type = 'player'::trade_asset_type) AND (contract_id IS NOT NULL) AND (player_id IS NOT NULL) AND (draft_pick_id IS NULL)) OR ((asset_type = 'pick'::trade_asset_type) AND (draft_pick_id IS NOT NULL) AND (contract_id IS NULL) AND (player_id IS NULL))))

#### `trade_parties` — 50 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `trade_id` | uuid | no |  | fk→`trades` |
| `team_id` | uuid | no |  | fk→`teams` |
| `accepted_at` | timestamp with time zone | yes |  |  |
| `accepted_by` | uuid | yes |  | fk→`team_owners` |
| `declined_at` | timestamp with time zone | yes |  |  |
| `declined_by` | uuid | yes |  | fk→`team_owners` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `trade_parties_trade_id_team_id_key` — UNIQUE (trade_id, team_id)
- `trade_party_not_both` — CHECK (((accepted_at IS NULL) OR (declined_at IS NULL)))

#### `trades` — 25 rows

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `status` | trade_status | no | `'draft'::trade_status` |  |
| `proposed_by` | uuid | yes |  | fk→`team_owners` |
| `proposing_team_id` | uuid | yes |  | fk→`teams` |
| `note` | text | yes |  |  |
| `proposed_at` | timestamp with time zone | yes |  |  |
| `effective_at` | timestamp with time zone | yes |  |  |
| `approved_at` | timestamp with time zone | yes |  |  |
| `approved_by` | uuid | yes |  | fk→`team_owners` |
| `commissioner_recused` | boolean | no | `false` |  |
| `executed_at` | timestamp with time zone | yes |  |  |
| `resolution_reason` | text | yes |  |  |
| `trade_window` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `reversed_at` | timestamp with time zone | yes |  |  |
| `reversed_by` | uuid | yes |  | fk→`team_owners` |
| `reversal_reason` | text | yes |  |  |

### Backup tables — RLS on, zero policies, invisible to the app. Do not read.

| Table | Rows |
|---|---|
| `dedupe_contracts_backup` | 130 |
| `dedupe_plan` | 0 |
| `dedupe_players_backup` | 3,253 |
| `dedupe_stats_backup` | 33,555 |
| `player_game_stats_snapshot_20260730` | 33,555 |
| `players_snapshot_20260730` | 3,253 |

---

## 6. Enums

| Type | Values |
|---|---|
| `contract_status` | `active`, `cut`, `cut_june1`, `traded_away`, `expired`, `retired`, `extended` |
| `contract_type` | `rookie`, `fifth_year_option`, `veteran_free_agent`, `practice_squad`, `franchise_tag_exclusive`, `franchise_tag_non_exclusive`, `transition_tag` |
| `roster_status` | `active`, `taxi`, `ir` |
| `trade_asset_type` | `player`, `pick` |
| `trade_status` | `draft`, `proposed`, `accepted`, `approved`, `executed`, `declined`, `vetoed`, `cancelled`, `expired`, `reversed` |

`roster_status` has **no `suspended`**. `contract_status` has **no `waived`** — an in-season cut
keeps `status = 'active'` while the player sits on the wire, and `team_roster_by_season` is what
drops him. `expired` is set by `advance_league_year` and by nothing else.

`contract_type` gained `practice_squad`, the tag types and `fifth_year_option`. **Never key
behaviour on `contract_type`** where a reason column exists — the in-season pro-ration rules key on
`contracts.first_season_week` being non-null, deliberately.

---

## 7. Triggers — 30

Eight are **constraint triggers**, which matters more than it looks: a `DEFERRABLE INITIALLY
DEFERRED` constraint trigger runs at `COMMIT`, not at the statement. A transaction-local flag set
and then cleared before commit is already gone when the trigger fires. That exact bug shipped in
`resolve_fa_window` and was caught only by a control test — `freeagency_04` is the fix, and
`execute_trade` has always set its flag once and never cleared it for the same reason.

A rolled-back test never fires deferred triggers unless you `set constraints all immediate` first,
so the first run of any such test passes vacuously.

| Table | Trigger | Function | Constraint? |
|---|---|---|---|
| `auction_tiers` | `auction_tiers_lock_snapshot_trg` | `auction_tiers_lock_snapshot` | — |
| `bid_delegation_settings` | `bid_delegation_settings_touch_trg` | `bid_delegation_settings_touch` | — |
| `bid_delegations` | `bid_delegations_validate_context_trg` | `bid_delegations_validate_context` | — |
| `bid_delegations` | `enforce_delegation_30pct_insert` | `bid_delegations_check_30pct` | — |
| `bid_delegations` | `enforce_delegation_30pct_update` | `bid_delegations_check_30pct` | — |
| `bid_option_bonuses` | `auto_bid_option_void_years` | `trg_rebuild_bid_option_void_years` | — |
| `bid_option_bonuses` | `enforce_bid_30pct_rule_ob` | `check_bid_30pct_rule` | **yes** |
| `bid_option_bonuses` | `enforce_bid_option_bonus_year` | `check_bid_option_bonus_year` | — |
| `bid_years` | `enforce_bid_30pct_rule` | `check_bid_30pct_rule` | **yes** |
| `bid_years` | `enforce_bid_deion_rule` | `check_bid_deion_rule` | **yes** |
| `bid_years` | `enforce_bid_minimum_salary` | `check_bid_minimum_salary` | **yes** |
| `bids` | `bids_supersede_delegation_trg` | `bids_supersede_delegation` | — |
| `contract_option_bonuses` | `auto_option_void_years` | `trg_rebuild_option_void_years` | — |
| `contract_option_bonuses` | `enforce_contract_30pct_rule_ob` | `check_contract_30pct_rule` | **yes** |
| `contract_option_bonuses` | `enforce_option_bonus_contract_type` | `check_option_bonus_contract_type` | — |
| `contract_option_bonuses` | `enforce_option_bonus_not_year1` | `check_option_bonus_not_year1` | — |
| `contract_restructure_bonuses` | `trg_deion_on_restructure` | `check_deion_rule_on_restructure` | **yes** |
| `contract_years` | `enforce_cap_ceiling` | `check_cap_ceiling` | **yes** |
| `contract_years` | `enforce_contract_30pct_rule` | `check_contract_30pct_rule` | **yes** |
| `contract_years` | `enforce_contract_minimum_salary` | `check_contract_minimum_salary` | **yes** |
| `contract_years` | `enforce_deion_rule` | `check_deion_rule` | **yes** |
| `contract_years` | `enforce_inseason_signing_no_roster_bonus` | `check_inseason_signing_no_roster_bonus` | — |
| `contract_years` | `enforce_practice_squad_value` | `check_practice_squad_value` | — |
| `contracts` | `enforce_first_season_week_rules` | `check_first_season_week_rules` | — |
| `contracts` | `enforce_taxi_eligibility` | `check_taxi_eligibility` | — |
| `contracts` | `enforce_taxi_slot_limits` | `check_taxi_slot_limits` | — |
| `contracts` | `trg_log_roster_move` | `log_roster_move` | — |
| `owner_profiles` | `owner_profiles_touch` | `trg_owner_profiles_touch` | — |
| `sleeper_sync_conflicts` | `sleeper_sync_conflicts_last_action` | `trg_sleeper_sync_last_action` | — |
| `team_cash_transactions` | `log_cash_transaction` | `log_cash_transaction_action` | — |

---

## 8. RLS policies — 54 across 57 tables

| Table | Policy | Cmd | Roles |
|---|---|---|---|
| `auction_tier_players` | `auction_tier_players_public_read` | SELECT | public |
| `auction_tiers` | `auction_tiers_select` | SELECT | public |
| `bid_delegation_settings` | `bid_delegation_settings_select` | SELECT | public |
| `bid_delegations` | `bid_delegations_select` | SELECT | public |
| `bid_interest_levels` | `bid_interest_levels_select` | SELECT | public |
| `bid_option_bonuses` | `bid_option_bonuses_select` | SELECT | public |
| `bid_player_hides` | `bid_player_hides_delete` | DELETE | public |
| `bid_player_hides` | `bid_player_hides_insert` | INSERT | public |
| `bid_player_hides` | `bid_player_hides_select` | SELECT | public |
| `bid_withdrawals` | `bid_withdrawals_select` | SELECT | public |
| `bid_years` | `bid_years_select` | SELECT | public |
| `bids` | `bids_select` | SELECT | public |
| `commissioner_actions` | `commissioner_actions_select` | SELECT | public |
| `contract_events` | `public read` | SELECT | public |
| `contract_option_bonuses` | `public read` | SELECT | public |
| `contract_restructure_bonuses` | `restructure_bonus_read` | SELECT | public |
| `contract_years` | `public read` | SELECT | public |
| `contracts` | `public read` | SELECT | public |
| `draft_picks` | `draft_picks_read` | SELECT | anon, authenticated |
| `edfl_scoring_settings` | `public read edfl_scoring_settings` | SELECT | public |
| `edfl_season_results` | `edfl_season_results_read` | SELECT | public |
| `edfl_tag_values` | `edfl_tag_values_read` | SELECT | public |
| `fantasy_game_scores` | `public read fantasy_game_scores` | SELECT | public |
| `free_agent_offer_option_bonuses` | `own team or resolved` | SELECT | public |
| `free_agent_offer_years` | `own team or resolved` | SELECT | public |
| `free_agent_offers` | `own team or resolved` | SELECT | public |
| `free_agent_windows` | `public read` | SELECT | public |
| `league_calendar_events` | `public read` | SELECT | public |
| `league_cap_settings` | `public read` | SELECT | public |
| `league_config` | `public read` | SELECT | public |
| `league_weeks` | `public read` | SELECT | public |
| `nfl_games` | `public read nfl_games` | SELECT | public |
| `owner_profiles` | `owner_profiles_select` | SELECT | public |
| `owner_profiles` | `owner_profiles_update` | UPDATE | public |
| `player_game_stats` | `public read player_game_stats` | SELECT | public |
| `player_value_name_map` | `player_value_name_map_select` | SELECT | public |
| `player_value_snapshots` | `player_value_snapshots_select` | SELECT | public |
| `player_values` | `player_values_select` | SELECT | public |
| `players` | `public read` | SELECT | public |
| `ppv_weight_table` | `public read` | SELECT | public |
| `rookie_wage_scale_slots` | `public read` | SELECT | public |
| `rookie_wage_scale_years` | `public read` | SELECT | public |
| `roster_moves` | `roster_moves_read` | SELECT | authenticated |
| `sleeper_sync_conflicts` | `sleeper_sync_conflicts_select` | SELECT | authenticated |
| `sleeper_sync_runs` | `sleeper_sync_runs_select` | SELECT | authenticated |
| `sleeper_sync_staging` | `sleeper_sync_staging_select` | SELECT | authenticated |
| `team_cash_budgets` | `team_cash_budgets_select` | SELECT | public |
| `team_cash_transactions` | `team_cash_transactions_select` | SELECT | public |
| `team_owners` | `team_owners_select` | SELECT | public |
| `team_week_scores` | `public read` | SELECT | public |
| `teams` | `public read` | SELECT | public |
| `trade_assets` | `trade_assets_read` | SELECT | authenticated |
| `trade_parties` | `trade_parties_read` | SELECT | authenticated |
| `trades` | `trades_read` | SELECT | authenticated |

Policy bodies are not reproduced here. The shape to assume: **SELECT policies exist, write policies
mostly do not**, and every write goes through a SECURITY DEFINER function.

**The RLS policies have never been read through as a signed-in owner.** Every test to date used
SECURITY DEFINER functions, which bypass RLS entirely. That is a real gap, not a formality.

---

## 9. Row-count hazards

PostgREST returns **1,000 rows by default**. These will silently truncate — a short result is the
failure mode, not an error. `/admin/fix-contracts` already failed this way once, rendering names as
"unknown" because the join partner had been truncated.

| Table / view | Rows | Rule |
|---|---|---|
| `player_game_stats` | 33,555 | never unfiltered — filter by player |
| `player_game_stats_snapshot_20260730` | 33,555 | backup, never read |
| `edfl_season_results` | 3,228 | filter by `season_year` |
| `players` | 3,253 | never unfiltered — filter, or use `search_players()` |
| `player_values` | **2,000** | **past the ceiling** — four snapshots of 500. Always filter by `snapshot_id` |
| `bid_years` | 1,671 | filter by bid or tier |
| `nfl_games` | 1,424 | filter by season/week |
| `contract_years` | **1,071** | past 1,000 as of this reading — it was 973 in v1.3. **Filter it now** |
| `contract_year_computed` | **1,071** | same, and this is the money view |
| `bids` | 485 | filter by tier |
| `rookie_wage_scale_years` | 360 | |
| `bid_option_bonuses` | 266 | |
| `contracts` | 323 | |
| `player_transaction_feed` / `league_transaction_log` | grows with every transaction | always filter |

**`contract_years` and `contract_year_computed` crossed 1,000 since v1.3.** Any unfiltered read of
either is now silently wrong. That is the single most likely new defect in the app today.

### Live counts, September 8, 2026

| Object | Count | Detail |
|---|---|---|
| `contracts` | **323** | 278 active · 12 cut · 1 `cut_june1` · **32 `traded_away`** |
| `contracts.roster_status` (active only) | 255 active · **22 taxi** · 1 IR | taxi up from 14 |
| `contract_years` | **1,071** | **193 void rows across 55 contracts** |
| `contract_events` | **54** | 34 `traded` · 13 `released` · 5 `fifth_year_option_exercised` · 1 `fifth_year_option_declined` · 1 `restructure` |
| `contract_restructure_bonuses` | 1 | George Kittle, Cash Over Cap — still the only one |
| `trades` | **25** | 12 executed · 9 declined · 2 cancelled · 1 reversed · 1 draft · **0 proposed** |
| `roster_moves` | **34** | |
| `commissioner_actions` | **57** | up from 39 — the v1.3 audit-log gap has closed |
| `bids` | 485 | 308 lost · 161 winner · 11 withdrawn · 5 passed_over · **0 pending** |
| `player_values` | **2,000** | **4** snapshots × 500 |
| `player_value_snapshots` | 4 | newest: *September 5, 2026 Edition* |
| `auction_tiers` | 4 | tiers 1, 2, 4, 5 — **all resolved and verified; none open** |
| `league_calendar_events` | 49 | |
| `edfl_season_results` | 3,228 | 2021–2025, published records |
| `edfl_tag_values` | 20 | FYO and franchise/transition tag values |
| `owner_profiles` | 10 | |
| `sleeper_sync_conflicts` | 30 | across 1 run |
| `free_agent_windows` / `free_agent_offers` | **0 / 0** | the feature is live but **nothing has been signed through it yet** |
| `team_week_scores` | **0** | scoreboard, standings and waiver priority all read this — they return nothing today |
| total `cap_charge` across `contract_year_computed` | **41,755.00** | over 1,071 rows |

---

## 10. Configuration — read it, never hardcode it

`league_config` (single row): `current_season_year` 2026, `active_roster_size` **25**,
`taxi_squad_size` **7**, `taxi_non_rookie_slots` **3** (new since v1.3), `min_spend_pct` 0.89,
`cut_reversal_window_hours` 96, `trade_reversal_window_hours` 96, `june1_designations_per_year` 2,
`cuts_open_after` 2026-08-12.

**`league_config.practice_squad_max_value` is a dead column.** It still reads `3`. It is COMMENTed
dead in the database and `check_practice_squad_value` no longer reads it — as of `freeagency_08` the
trigger calls `league_minimum_salary(league_season_year)`. Anything still reading that scalar will
refuse a legal $9 practice-squad contract as exceeding "3". One number cannot carry a rule that
escalates 5% a season.

`league_cap_settings` holds **two rows**. 2026: `fantasy_salary_cap` **$1,500**, `cap_ceiling` NULL
so the ceiling falls back to the base cap. 2027: $1,575 with **`is_provisional = true`** — a
placeholder the commissioner has not set. `team_cap_by_season.cap_is_provisional` exposes this, so
there is no excuse for an unmarked 2027 figure. The **111% figure still shown on `/team/[teamId]`
was abolished in rule book v11 and is a display defect, not an allowance.**

`league_calendar_events` is the only source of truth for dates. **Key on `rule_ref`, never on the
title.**

| `rule_ref` | Meaning |
|---|---|
| `5.5(f)` | in-season cap hard block arms — **2026-09-09 00:00 UTC = 8:00 PM ET September 8** |
| `1.4(c)` | In-Season begins — **2026-09-09 00:00 UTC = 8:00 PM ET September 8** |
| `3.6(a)` | roster compliance deadline |
| `5.14(a)` | in-season free agency opened early — 2026 startup mitigation |
| `5.14(b)` | **first-offer exemption ends — 2026-09-14 04:00 UTC = 00:00 ET Sept 14** |
| `7.4(a)` | trade-back relief, temporary suspension through Sept 8 |
| `7.4(b)(i)`–`(iii)` | trade windows 1, 2, 3 |
| `7.5(a)` | trade deadline |
| `5.4(a)` | Season Cap Floor tested — February 21, 2027 |

`5.5(f)` and `1.4(c)` are different rules that **both fall at 2026-09-09 00:00 UTC** — v1.3 recorded
`5.5(f)` at 2026-09-07 04:01 UTC and the live calendar no longer says that. They coincide in 2026;
they are still different rules and must not be collapsed into one constant.

`league_weeks` week 1 charges at **2026-09-09 04:01 UTC**, four hours after both.

`league_weeks` holds 14 rows for 2026 and **no week has charged yet** (verified: 0 rows with
`charge_at <= now()`). Every `weeks_charged`-dependent figure is at its zero state today, which means
the pro-ration and settlement arithmetic has never run against a non-zero week in production.

---

## 11. Facts that live nowhere else

These have each been mis-derived at least once.

### In-season pro-ration is live, and no contract carries it yet

`contracts.first_season_week` is **NULL on all 323 contracts**. Null means a full season and a
fraction of 1, which is every contract written before free agency existed. The machinery is built,
tested and inert. The first free agency award will be the first row that exercises it, and it will
be the first real test of `edfl_signing_fraction()` in production.

The settlement engines count weeks **under contract**, not weeks of the season:
`weeks_under = weeks_charged - first_season_week + 1`, floored at 0, over a denominator of 14. A
player signed in week 8 and cut in week 10 earns `ngs × 3/14`, not `× 10/14`. `compute_cut_charges`
and `compute_trade_charges` are siblings under rules 5.18 and 7.8(a) and **must change together**.

### Void proration accelerates when a contract ends

Void years defer proration; they do not forgive it. At the end of a contract's last real season,
every remaining prorated dollar is charged in full to the **following** season. Implemented in
`contract_year_computed.cap_charge` as a derived property of the contract's shape, not as a job, so
there is no second process to fall out of step.

**`dead_cap_if_cut` is NULL on every void season.** You cannot cut a player whose contract has
ended. Guard the formatter; never print `$0.00` there, which reads as "free to cut".

### Void years are trigger-created — never count them from the contract row

`contract_years.is_void_year` rows are written by triggers from three sources, and `void_reason`
says which:

| `void_reason` | Rows | Contracts |
|---|---|---|
| `option_bonus` | 170 | 49 |
| `signing_bonus` | 19 | 12 |
| `restructure` | 4 | 1 |

**193 rows across 55 distinct contracts** — up from 169 across 49 in v1.3. `contracts.option_void_years`
counts **only the option-bonus ones**, so client code reading that column as "how many void years does
this contract have" is wrong on the contracts that draw from more than one source, silently.

To count void years, count `contract_years where is_void_year`. Never derive them, never create
them, never let a form write them.

### Player identity is split across two rows — found September 8, and it is not contained

`players` holds **two rows for some players**. The Sleeper sync writes one — `sleeper_player_id`,
`nfl_team`, no `gsis_id`, name **without** the suffix (`Marvin Harrison`). The stats loader writes
another — `gsis_id`, all `player_game_stats` and `edfl_season_results`, no `sleeper_player_id`, name
**with** the suffix (`Marvin Harrison Jr.`). Contracts hang off the Sleeper row. Production hangs
off the stats row. Neither row knows about the other.

**62 skill-position rows have a null `sleeper_player_id`, and all 62 carry game stats.** A
name-and-position match finds a Sleeper twin for **37**, and **12 of those twins hold an active
contract.** A free-agent board built without allowing for this listed Marvin Harrison Jr., Kenneth
Walker III, Brian Thomas Jr., Michael Penix Jr., Luther Burden III, Marvin Mims Jr., Tyrone Tracy Jr.,
Oronde Gadsden II, Harold Fannin Jr. and Chris Rodriguez Jr. as available.

Until this is repaired: **any query joining production to contracts must require
`sleeper_player_id is not null`**, and any query that needs a player's 2025 production must be
prepared to find it under a suffixed twin. The fix is a player-identity merge keyed on `gsis_id`; it
has not been written and it is upstream of free agency, waivers and the player card.

### EDFL money is whole dollars — but only for restructures

Enforced by a table constraint on `contract_restructure_bonuses` plus checks in
`restructure_contract`. Every proration season takes `floor(amount / years)` and the **final**
season absorbs the remainder — 100 over 3 is 33 / 33 / **34**.

**This is restructure-only.** Contract-year rows still carry legitimately fractional signing-bonus
proration from before the rule existed, and most teams have cents in their 2026 cap today. Rule 1.9
remains an open league-wide decision.

| Figure | Expect | If fractional |
|---|---|---|
| anything the **restructure generates** — `cap_change`, `per_season_charge`, `final_season_charge`, `void_acceleration_amount` | always whole | that IS a defect, report it |
| anything **inherited** — `cap_before`, `cap_after`, `dead_cap_before`, `dead_cap_after` | may be fractional | normal |

`compute_restructure_charges` returns **exact** values (`values_are_exact: true`). Do not add
display rounding on top — use `formatExactMoney`, never `formatMoney`, on money screens. Rounding is
how an owner reads "$1,500 of $1,500" while the database refuses him at $1,500.33.

### The legacy option-bonus columns are dead — still zero, still there

`contract_years.option_bonus` and `contract_years.prorated_option_bonus` are **zero on all 1,071
rows** and read by nothing. Every trigger and view reads `contract_option_bonuses` directly. Any
preview written against those two columns silently understates every contract carrying an option
bonus. Do not read them.

### Draft round and pick are NULL on every contract in the league

**All 323 rows.** The 2023–2026 redraft did not carry round or pick through, and `draft_picks` holds
only future picks. Round 1 membership is **derived** by matching `contracts.signing_bonus_total`
against `rookie_wage_scale_slots` for the same `draft_year`; the match requires a Round 1 hit **and**
no other-round hit, so an ambiguous value fails open. `edfl_fyo_is_round_one()` is that derivation,
and the Fifth Year Option feature is now live on top of it — five options have been exercised and one
declined against derived round data.

Backfilling `draft_round` and `draft_pick` from the commissioner's draft record would retire the
workaround and settle the two signing-bonus ties (2023 picks 8/9, 2024 picks 8/9).

**Rookie tenure keys off `contracts.draft_year`, never `start_year`.** Every EDFL rookie contract
carries `start_year` 2026 because of the redraft.

### `exempt_30pct` marks exactly 8 grandfathered contracts

Decided once, by hand, for contracts predating the 30% rule. **Never re-derive it** — any rule you
write to reproduce that set will disagree with it. The flag is the authority.

### Enforcement dates gate the compliance booleans

`trade_impact().cap_ok` is unconditionally `true` before `5.5(f)` arms, and `roster_ok` before
`1.4(c)`. `reverse_trade` applies the same two gates. **`1.4(c)` falls at 8:00 PM ET on September 8**
— today. A screen that caches an `_ok` value across that boundary will show a stale pass tonight.

### `reverse_trade` runs five guards, in order

Window last, deliberately, so the more specific message wins: (1) same season; (2) every player still
on the contract the trade created, no events against it, not committed to another live trade; (3) no
auction tier verified after the trade; (4) every pick still held and unused; (5) the 96-hour window.

**`p_force` bypasses the post-unwind compliance check and NOTHING else.** That one forceable refusal
raises SQLSTATE `EDFL1`; the five guards raise `P0001`. Match on `error.code`, never on message text.

**Guard 3 is operative and retrospective.** Tier 5 verified September 3, so every trade executed
before it is permanently irreversible. By design.

### `team_week_scores` is empty, and three features read it

`league_scoreboard`, `league_standings` and `waiver_priority_order()` are all built and all return
nothing, because no week has been synced from Sleeper. This is a data gap, not a defect — but a page
that renders an empty standings table without saying why will read as broken.

---

## 12. Function grants and the `anon` role

The working rule was *"every new function must be revoked from `anon`."* The first half is right; the
blanket application is not.

**PostgreSQL checks `EXECUTE` on a function against the calling role even inside a view that is not
`security_invoker`.** Only table and view references are re-checked as the view owner; a function
call is not a range-table entry, so its ACL is checked against whoever runs the query.

`contract_year_computed` is a non-invoker view — deliberately, so `anon` can read computed cap
figures without being granted the underlying tables. But it calls `edfl_restructure_share`,
`edfl_restructure_remaining` and now `edfl_signing_fraction`. Revoking any of them from `anon` breaks
**every page reading `contract_year_computed`**, with `permission denied for function ...`, while the
view's own grant stays untouched and looks correct.

**Class A — helpers called from inside a view.** Grant EXECUTE to `anon` *and* `authenticated`,
matching the view. Must be pure or read-only and must not widen what the view exposes:
`edfl_restructure_share`, `edfl_restructure_remaining`, `edfl_signing_fraction`,
`edfl_transfer_in_progress`, `edfl_delegation_years_valid`, `edfl_delegation_option_bonuses_valid`,
`edfl_delegation_30pct_issue`.

**Class B — everything the app calls directly, and everything that writes.** Revoke from `public` and
`anon`; grant `authenticated` only. `edfl_restructure_cut_amounts`, `edfl_restructure_in_progress`,
`edfl_weeks_under_contract` and `edfl_award_in_progress` stay Class B despite the `edfl_` prefix:
they are reached only from SECURITY DEFINER functions and constraint triggers, which run as the
definer.

`edfl_fa_award_window` is stricter than Class B — revoked from `public`, `anon` **and**
`authenticated`, so it is unreachable from the API. Both the resolve path and the first-offer path
call it internally.

Before revoking any function from `anon`, check whether a view calls it; after any grant change, run
a regression that reads every view as both roles and reports each failure by name rather than dying
on the first. Both scripts are in `claude/EDFL_DB_Convention_FunctionGrants_v1.0.md`.

### Still outstanding: 11 SECURITY DEFINER functions remain executable by `anon`

Down from 17 in v1.3. The current list, verified:

`cut_reversal_hours_left`, `edfl_fa_first_offer_exempt`, `is_commissioner`, `is_commissioner_or_co`,
`require_commissioner`, `require_commissioner_or_co`, `rls_auto_enable`, `submit_bid`,
`team_cut_previews`, `tier_withdrawal_allowance`, `withdraw_bid`.

Each resolves the caller via `auth.uid()`, so a null caller is refused — not exploitable, but the
revoke is safe to do today (no tier is open, no free agency window is open) and should be done with
the Class A/B split in hand, not blindly.

### Five functions have no `search_path` pin

`check_bid_deion_rule`, `check_bid_option_bonus_year`, `check_option_bonus_contract_type`,
`check_practice_squad_value`, `trg_owner_profiles_touch` — all trigger functions. Pinning
`search_path` on a SECURITY DEFINER function is the standard hardening; these five predate the
convention or were missed. Worth a small migration.

---

## 13. Application conventions

- Server Actions **return** refusals, they never throw.
- **No template literals** in delivered JavaScript — build strings with `+`.
- Relative imports only.
- **Never compute money in JavaScript.** Read a view or call a function. Do not re-derive a cap
  saving client-side even for an optimistic update.
- **Do not round at the view layer.** `formatMoney` rounds; `formatExactMoney` does not. Money
  screens use the latter.
- Surface database error messages verbatim. They are written to be read by owners and they name the
  rule.
- One component owns player links (`components/PlayerLink.js`); do not hand-roll another.
- **Filter every `.select()`.** Two of the money tables are now past the 1,000-row ceiling.
- `.ledger` is the table class for rows a human reads; `.grid-table` is the numeric primitive. A
  `.ledger` card flip at 640px needs `data-label` on every `td`, and it styles `td` only — so a
  `th scope="row"` cell does not flip.
- A client component reading `Date.now()` in the render body is a hydration mismatch. Clocks are
  state, null until mount.
- `lib/leagueMinimum.js` exports `leagueMinimumSalary()` for synchronous client previews. It agrees
  with the database for 2026–2031 (9, 10, 10, 11, 11, 12). Do not fire an RPC per row for it.

### Repo hazards

There are **two checkouts of the app** on the commissioner's machine and one is stale. Confirm
`git remote -v` before committing; the remote is `github.com/lewaiworkspace-byte/dynasty-league-app`.
The live clone has `core.autocrlf=true`, so a precondition hash must be taken from the committed blob
(`git show HEAD:file`), never from the working file.

---

## 14. What this file cannot tell you

Stated plainly so it is not mistaken for completeness.

- **Whether an auction tier or free agency window is open right now.** None was open at 00:35 UTC on
  September 8. Both gate behaviour and both change on a clock.
- **Whether the first-offer exemption is still running.** It ends 00:00 ET September 14.
- **Whether the RLS policies actually hold for a signed-in owner.** They have never been read through
  as one — every test to date used SECURITY DEFINER functions, which bypass RLS.
- **Whether any free agency window has closed on its own clock.** None has.
- **View SQL.** 74,571 characters across 33 views, deliberately omitted. Ask in chat for any one.
- **Function bodies.** 284,416 characters across 149. Ask in chat.
- **Row counts, an hour from now.** Every figure here is a timestamp.

The stale documents to distrust, as of this reading: `EDFL_LeagueYearRollover_Spec_v0.1.md` still
says the rollover is "NOT BUILT" (it is built and callable), and the free agency and waiver specs
describe FA-9 as blocking released players from the free agent pool — **`edfl_free_agent_eligible()`
rules them eligible**. Where a document and a function disagree, the function wins.
