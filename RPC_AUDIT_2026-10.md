# RPC Row-Cap Audit (October 2026)

A read-only audit of every `.rpc()` call in this repo. For each call it asks two questions: can the function return more than 1,000 rows, and does the calling code page or limit the result? PostgREST silently cuts a result set off at 1,000 rows (see `.claude/rules/data-fetching.md` and section 9 of the database reference).

- **Code read at:** commit `a92d66f` (`origin/main` when the audit ran: 0 commits ahead, 0 behind).
- **Database facts from:** `EDFL_Database_Reference_for_ClaudeCode.md` **v3.0** (October 5, 2026), section 4 (Functions). It lists each function's return type but not its body.
- **Not done:** no database connection, no SQL, and no code changes. The only change on this branch is this file.

## How I classified each call

- **SAFE** means one of three things:
  - the function returns a single value (`jsonb`, `uuid`, `boolean`, `integer`, `text`, `void`), which the 1,000-row cap never affects;
  - the function returns a set whose shape keeps it far below 1,000 rows, such as one row per team, per trade party or per contract on one team, or a single row;
  - the caller pages or passes a limit.
- **AT RISK:** the set has no limit the reference shows, so it can pass 1,000 rows, and the caller neither pages nor limits it. When that happens the list just comes back shorter, with no error.
- **UNKNOWN:** the reference does not name the function, or whether it stays under 1,000 rows depends on a function body the reference does not show. CLAUDE.md ground rule 2 forbids inferring that from application code, so I don't guess.

A function that returns `jsonb` can hold a large array inside that single value. That is still one PostgREST row, so the cap does not apply.

## Summary

| | Call sites | Distinct functions |
|---|---|---|
| **AT RISK** | 2 | 2 |
| **UNKNOWN** | 9 | 7 |
| **SAFE** | 112 | 94 |
| **Total** | 123 | 103 |

Of the 103 functions, 79 return a single value (57 `jsonb`, 11 `uuid`, 4 `boolean`, 3 `void`, 3 `integer`, 1 `text`) across 83 call sites. 19 return `TABLE(...)` and 5 are not in the reference.

## Findings that need action

### AT RISK

1. **`officer_api_keys()`** at `app/data/page.js:129` returns every key in the league, revoked ones included. Nothing in the reference limits that set, and the page reads it whole with no paging and no notice that rows are missing.
2. **`my_api_keys()`** at `app/data/page.js:128` has the same shape, scoped to one owner. "At most three live" (on `create_my_api_key`) limits live keys only, not the revoked keys the list keeps showing.

**Likelihood: low.** The reference's stamp counted one row in `owner_api_keys`. That count is from October 5, not a statement about today, and it is not a limit. Hitting the cap would take about a thousand create-and-revoke cycles. Possible fixes, which are design decisions for the project rather than changes made here:

- have the functions return only live keys and recently revoked ones;
- page the officer list;
- or show a notice when a list comes back with exactly 1,000 rows.

### UNKNOWN, ranked by how much I'd want them checked

1. **`edfl_time_zone_options()`** at `components/ownerInfoActions.js:77`. The reference says it reads `pg_timezone_names` but does not show whether it filters. That catalog's size depends on the server's time-zone database, and the caller takes the whole result with no limit. If it were cut off, the zone picker would silently lose zones while showing no error. **Of the open questions, this is the one most likely to be a real problem.**
2. **`open_negotiation_windows()`** at `app/team/[teamId]/page.js:671`. Not in the reference. It reads open windows league-wide with no limit.
3. **`edfl_projected_fixtures()`**, **`edfl_live_projected_finals()`** and **`edfl_matchup_projection()`** at `app/scoreboard/page.js:117`, `:120` and `app/matchup/[week]/[matchupId]/page.js:133`, `:134`. Not in the reference. Code comments say the sets are small, but those comments are not an authority on the database.
4. **`edfl_is_observer()`** at `components/AppBar.js:108` and `lib/getCurrentTeamOwner.js:88`. Not in the reference. Both callers treat the result as a boolean, so it is almost certainly SAFE once the reference confirms the return type.
5. **`officer_action_items()`** at `app/admin/page.js:91`. In the reference as `TABLE(...)`, but the reference does not show how many items each kind can produce. It is probably small. The caller does not limit it.

**What would settle these:** a regenerated reference that names the five missing functions, plus the bodies, or at least a stated row limit, for `edfl_time_zone_options()` and `officer_action_items()`. CLAUDE.md treats a name missing from the reference as a reason to re-cut it, not as proof the function doesn't exist.

### Hardening note (still SAFE)

- **`league_transactions()`** at `app/transactions/actions.js:64` takes `p_limit` from the client's `filters.limit` without checking it. Every current caller sends `pageSize` (100), so this is not a problem today. But if a direct Server Action call sent more than 1,000, the cap would return a short page, and `TransactionLog.js` would wrongly mark the log as exhausted. Clamping `f.limit` on the server would close this.

## Functions that return a set, and why each verdict

| Function | Verdict | Can exceed 1,000 rows? | Why |
|---|---|---|---|
| `api_key_resolve` | **SAFE** | No | Looks up one key by `key_hash`, which is UNIQUE (`owner_api_keys_key_hash_key`). The caller reads `data[0]`. |
| `commissioner_owner_activity` | **SAFE** | No | One row per team or owner account (team name, email, sign-in times). It grows only when the league adds teams. |
| `edfl_is_observer` | **UNKNOWN** | Unknown | The reference (v3.0) does not name this function, so I can't see its return type or what limits its rows. Per CLAUDE.md ground rule 2, I did not infer either one from application code. Both callers test `data === true` and fail closed, which suggests a scalar `boolean` result. That would make it SAFE, but only the reference can confirm it. |
| `edfl_live_projected_finals` | **UNKNOWN** | Unknown | The reference (v3.0) does not name this function, so I can't see its return type or what limits its rows. Per CLAUDE.md ground rule 2, I did not infer either one from application code. A code comment says "one row per side, two per matchup, normally a single week". That is the app's claim, not the reference. |
| `edfl_matchup_detail` | **SAFE** | No | The players in one matchup (season + week + matchup id): two teams' rosters. |
| `edfl_matchup_projection` | **UNKNOWN** | Unknown | The reference (v3.0) does not name this function, so I can't see its return type or what limits its rows. Per CLAUDE.md ground rule 2, I did not infer either one from application code. Scoped by season, week and matchup id, which suggests a small set. Not confirmed by the reference. |
| `edfl_projected_fixtures` | **UNKNOWN** | Unknown | The reference (v3.0) does not name this function, so I can't see its return type or what limits its rows. Per CLAUDE.md ground rule 2, I did not infer either one from application code. A code comment says "at most fourteen weeks of five". That is the app's claim, not the reference. |
| `edfl_taxi_origin_actives` | **SAFE** | No | Called with `p_team_id`, so it returns one team's returning taxi players. With the default `NULL` it would read league-wide, but neither caller does that, and both skip the call when there is no team. |
| `edfl_time_zone_options` | **UNKNOWN** | Unknown | The reference says it reads `pg_timezone_names` but does not show the body, so I can't tell whether it filters or deduplicates. How many rows the unfiltered catalog holds depends on the server's time-zone database, so I can't rule out more than 1,000. |
| `league_transaction_kinds` | **SAFE** | No | One row per transaction kind (`kind`, `rows`, `newest`). |
| `league_transactions` | **SAFE** | Yes, if not paged (the caller pages it) | The reference calls it a "paged, filtered league log read": `p_limit DEFAULT 100` plus a composite cursor (`p_cursor_at`, `p_cursor_id`). |
| `my_api_keys` | **AT RISK** | Yes, in principle | Returns the caller's keys including revoked ones (it returns `revoked_at`). `create_my_api_key` allows "at most three live" keys, which limits live keys only. Nothing in the reference limits how many revoked keys stay listed. |
| `officer_action_badge` | **SAFE** | No | One row (`urgent`, `attention`). The caller reads `data[0]`. |
| `officer_action_items` | **UNKNOWN** | Unknown | Returns the officer items open right now from `edfl_officer_action_items_compute()`. The reference does not say how many items each kind can produce (for example, one per trade or one per window), so it shows no limit. |
| `officer_api_keys` | **AT RISK** | Yes, in principle | Every key in the league, revoked ones included. Same growth as `my_api_keys`, summed across every owner. |
| `open_negotiation_windows` | **UNKNOWN** | Unknown | The reference (v3.0) does not name this function, so I can't see its return type or what limits its rows. Per CLAUDE.md ground rule 2, I did not infer either one from application code. A code comment says it reads `free_agent_window_board` and returns open windows league-wide. Nothing on the call limits the rows. |
| `owner_directory` | **SAFE** | No | One row per `team_owners` row. The reference describes `owner_profiles` as one row per `team_owners` row and says its reads go through this function. |
| `owner_profile_raw` | **SAFE** | No | One owner (`p_owner_id`, or the caller when it is `NULL`). The caller reads `rows[0]`. |
| `search_players` | **SAFE** | Yes, if not limited (the caller limits it) | Takes `p_limit integer DEFAULT 20`. |
| `team_cut_previews` | **SAFE** | No | One row per contract on one team (`p_team_id`). |
| `trade_impact` | **SAFE** | No | One row per party to one trade. |
| `trade_legality` | **SAFE** | No | The refusal codes for one trade. |
| `trade_savings` | **SAFE** | No | One row per team in one trade. Seasons are nested inside `years` and `totals` as jsonb, not returned as rows. |
| `waiver_priority_order` | **SAFE** | No | One row per team, from `team_week_scores`. |

## Every call site

Sorted AT RISK, then UNKNOWN, then SAFE, and by file and line within each group.

| # | Verdict | File:line | Function | Returns | Can exceed 1,000? | Does the caller page or limit? |
|---|---|---|---|---|---|---|
| 1 | **AT RISK** | `app/data/page.js:128` | `my_api_keys` | `TABLE(...)` | Yes, in principle | No paging or limit. |
| 2 | **AT RISK** | `app/data/page.js:129` | `officer_api_keys` | `TABLE(...)` | Yes, in principle | No paging or limit. |
| 3 | **UNKNOWN** | `app/admin/page.js:91` | `officer_action_items` | `TABLE(...)` | Unknown | No paging or limit. |
| 4 | **UNKNOWN** | `app/matchup/[week]/[matchupId]/page.js:133` | `edfl_projected_fixtures` | not in reference | Unknown | No paging or limit. |
| 5 | **UNKNOWN** | `app/matchup/[week]/[matchupId]/page.js:134` | `edfl_matchup_projection` | not in reference | Unknown | No paging or limit. |
| 6 | **UNKNOWN** | `app/scoreboard/page.js:117` | `edfl_projected_fixtures` | not in reference | Unknown | No paging or limit. |
| 7 | **UNKNOWN** | `app/scoreboard/page.js:120` | `edfl_live_projected_finals` | not in reference | Unknown | No paging or limit. |
| 8 | **UNKNOWN** | `app/team/[teamId]/page.js:671` | `open_negotiation_windows` | not in reference | Unknown | No paging or limit. |
| 9 | **UNKNOWN** | `components/AppBar.js:108` | `edfl_is_observer` | not in reference | Unknown | Not applicable if the result is scalar. Compares the result with `=== true`. |
| 10 | **UNKNOWN** | `components/ownerInfoActions.js:77` | `edfl_time_zone_options` | `TABLE(...)` | Unknown | No paging or limit. A failed read is surfaced, but a truncated list would not be noticed. |
| 11 | **UNKNOWN** | `lib/getCurrentTeamOwner.js:88` | `edfl_is_observer` | not in reference | Unknown | Not applicable if the result is scalar. Compares the result with `=== true`. |
| 12 | **SAFE** | `app/admin/calendar/actions.js:51` | `calendar_week_save` | `jsonb` | No (single value) | Not applicable |
| 13 | **SAFE** | `app/admin/calendar/actions.js:81` | `calendar_weeks_generate` | `jsonb` | No (single value) | Not applicable |
| 14 | **SAFE** | `app/admin/calendar/actions.js:104` | `calendar_event_save` | `jsonb` | No (single value) | Not applicable |
| 15 | **SAFE** | `app/admin/calendar/actions.js:130` | `calendar_event_delete` | `jsonb` | No (single value) | Not applicable |
| 16 | **SAFE** | `app/admin/calendar/actions.js:147` | `calendar_season_copy_forward` | `jsonb` | No (single value) | Not applicable |
| 17 | **SAFE** | `app/admin/cuts/actions.js:38` | `reverse_cut` | `uuid` | No (single value) | Not applicable |
| 18 | **SAFE** | `app/admin/fix-contracts/actions.js:37` | `commissioner_delete_contract` | `uuid` | No (single value) | Not applicable |
| 19 | **SAFE** | `app/admin/fix-contracts/actions.js:63` | `commissioner_delete_bid` | `uuid` | No (single value) | Not applicable |
| 20 | **SAFE** | `app/admin/import-stats/actions.js:79` | `edfl_season_results_status` | `jsonb` | No (single value) | Not applicable |
| 21 | **SAFE** | `app/admin/import-stats/actions.js:156` | `publish_edfl_season_results` | `jsonb` | No (single value) | Not applicable |
| 22 | **SAFE** | `app/admin/injury-sync/actions.js:45` | `log_commissioner_action` | `uuid` | No (single value) | Not applicable |
| 23 | **SAFE** | `app/admin/league-office/actions.js:56` | `goodell_memo_submit` | `jsonb` | No (single value) | Not applicable |
| 24 | **SAFE** | `app/admin/league-office/actions.js:75` | `goodell_memo_withdraw` | `jsonb` | No (single value) | Not applicable |
| 25 | **SAFE** | `app/admin/league-office/actions.js:90` | `goodell_kind_set` | `jsonb` | No (single value) | Not applicable |
| 26 | **SAFE** | `app/admin/league-office/page.js:37` | `goodell_wire_status` | `jsonb` | No (single value) | Not applicable |
| 27 | **SAFE** | `app/admin/owner-activity/actions.js:58` | `commissioner_owner_activity` | `TABLE(...)` | No | No paging or limit. |
| 28 | **SAFE** | `app/admin/owner-activity/actions.js:164` | `set_co_commissioner` | `jsonb` | No (single value) | Not applicable |
| 29 | **SAFE** | `app/admin/owner-activity/page.js:35` | `owner_directory` | `TABLE(...)` | No | No paging or limit. |
| 30 | **SAFE** | `app/admin/prospects/actions.js:191` | `draft_prospects_upsert` | `jsonb` | No (single value) | Not applicable |
| 31 | **SAFE** | `app/admin/prospects/actions.js:220` | `draft_prospects_match_sleeper` | `jsonb` | No (single value) | Not applicable |
| 32 | **SAFE** | `app/admin/prospects/actions.js:237` | `draft_prospects_roll` | `jsonb` | No (single value) | Not applicable |
| 33 | **SAFE** | `app/admin/prospects/actions.js:250` | `draft_prospect_match_set` | `jsonb` | No (single value) | Not applicable |
| 34 | **SAFE** | `app/admin/tier-results/actions.js:40` | `log_commissioner_action` | `uuid` | No (single value) | Not applicable |
| 35 | **SAFE** | `app/admin/tier-results/actions.js:70` | `evaluate_auction_tier` | `void` | No (single value) | Not applicable |
| 36 | **SAFE** | `app/admin/tier-results/actions.js:107` | `pass_over_winner` | `uuid` | No (single value) | Not applicable |
| 37 | **SAFE** | `app/admin/tier-results/actions.js:134` | `verify_auction_tier` | `integer` | No (single value) | Not applicable |
| 38 | **SAFE** | `app/admin/trades/page.js:130` | `trade_impact` | `TABLE(...)` | No | No limit. One call per accepted trade. |
| 39 | **SAFE** | `app/admin/trades/page.js:131` | `trade_legality` | `TABLE(...)` | No | No limit. One call per accepted trade. |
| 40 | **SAFE** | `app/admin/trades/page.js:132` | `trade_savings` | `TABLE(...)` | No | No limit. One call per accepted trade. |
| 41 | **SAFE** | `app/api/cron/injury-sync/route.js:105` | `log_commissioner_action` | `uuid` | No (single value) | Not applicable |
| 42 | **SAFE** | `app/api/mcp/[[...key]]/route.js:69` | `api_key_resolve` | `TABLE(...)` | No | No limit. Reads the first row only. |
| 43 | **SAFE** | `app/bids/[tierId]/delegate/DelegateForm.js:220` | `chart_bid_target` | `jsonb` | No (single value) | Not applicable |
| 44 | **SAFE** | `app/bids/actions.js:59` | `submit_bid` | `uuid` | No (single value) | Not applicable |
| 45 | **SAFE** | `app/bids/delegationActions.js:97` | `upsert_bid_delegation` | `uuid` | No (single value) | Not applicable |
| 46 | **SAFE** | `app/bids/delegationActions.js:150` | `arm_bid_delegations` | `jsonb` | No (single value) | Not applicable |
| 47 | **SAFE** | `app/bids/delegationActions.js:186` | `cancel_bid_delegation` | `boolean` | No (single value) | Not applicable |
| 48 | **SAFE** | `app/bids/delegationActions.js:236` | `withdraw_bid` | `jsonb` | No (single value) | Not applicable |
| 49 | **SAFE** | `app/bids/page.js:406` | `tier_withdrawal_allowance` | `integer` | No (single value) | Not applicable |
| 50 | **SAFE** | `app/data/actions.js:25` | `create_my_api_key` | `jsonb` | No (single value) | Not applicable |
| 51 | **SAFE** | `app/data/actions.js:44` | `revoke_api_key` | `jsonb` | No (single value) | Not applicable |
| 52 | **SAFE** | `app/fifth-year-option/actions.js:58` | `fifth_year_option_board` | `jsonb` | No (single value) | Not applicable |
| 53 | **SAFE** | `app/fifth-year-option/actions.js:77` | `exercise_fifth_year_option` | `jsonb` | No (single value) | Not applicable |
| 54 | **SAFE** | `app/fifth-year-option/actions.js:110` | `decline_fifth_year_option` | `jsonb` | No (single value) | Not applicable |
| 55 | **SAFE** | `app/fifth-year-option/actions.js:159` | `reverse_fifth_year_option` | `jsonb` | No (single value) | Not applicable |
| 56 | **SAFE** | `app/free-agency/FreeAgencyBoard.js:433` | `edfl_taxi_origin_actives` | `TABLE(...)` | No | No limit. Scoped by `p_team_id: props.myTeamId`. |
| 57 | **SAFE** | `app/free-agency/actions.js:304` | `edfl_wire_live` | `boolean` | No (single value) | Not applicable |
| 58 | **SAFE** | `app/free-agency/actions.js:375` | `submit_fa_offer` | `jsonb` | No (single value) | Not applicable |
| 59 | **SAFE** | `app/free-agency/actions.js:405` | `preview_fa_window` | `jsonb` | No (single value) | Not applicable |
| 60 | **SAFE** | `app/free-agency/actions.js:415` | `resolve_fa_window` | `jsonb` | No (single value) | Not applicable |
| 61 | **SAFE** | `app/library/actions.js:52` | `library_feedback_submit` | `uuid` | No (single value) | Not applicable |
| 62 | **SAFE** | `app/library/actions.js:70` | `library_feedback_withdraw` | `void` | No (single value) | Not applicable |
| 63 | **SAFE** | `app/library/actions.js:84` | `library_feedback_respond` | `void` | No (single value) | Not applicable |
| 64 | **SAFE** | `app/matchup/[week]/[matchupId]/actions.js:65` | `edfl_sync_week_projections` | `jsonb` | No (single value) | Not applicable |
| 65 | **SAFE** | `app/matchup/[week]/[matchupId]/page.js:103` | `edfl_matchup_detail` | `TABLE(...)` | No | No paging or limit. |
| 66 | **SAFE** | `app/notifications/actions.js:43` | `save_my_notification_prefs` | `jsonb` | No (single value) | Not applicable |
| 67 | **SAFE** | `app/notifications/actions.js:61` | `send_my_test_notification` | `jsonb` | No (single value) | Not applicable |
| 68 | **SAFE** | `app/player/[playerId]/page.js:171` | `team_cut_previews` | `TABLE(...)` | No | No limit. Scoped to one team. |
| 69 | **SAFE** | `app/poaching/PoachingBoard.js:150` | `edfl_taxi_origin_actives` | `TABLE(...)` | No | No limit. Scoped by `p_team_id: props.myTeamId`. |
| 70 | **SAFE** | `app/poaching/actions.js:154` | `edfl_wire_live` | `boolean` | No (single value) | Not applicable |
| 71 | **SAFE** | `app/restructure/actions.js:85` | `max_restructure` | `jsonb` | No (single value) | Not applicable |
| 72 | **SAFE** | `app/restructure/actions.js:108` | `compute_restructure_charges` | `jsonb` | No (single value) | Not applicable |
| 73 | **SAFE** | `app/restructure/actions.js:149` | `restructure_contract` | `jsonb` | No (single value) | Not applicable |
| 74 | **SAFE** | `app/search/actions.js:49` | `search_players` | `TABLE(...)` | Yes, if not limited | Limited: `p_limit: RESULT_CAP` (50, from `lib/playerSearch.js`). `SearchPanel.js` shows a "first 50 matches" notice. |
| 75 | **SAFE** | `app/settings/actions.js:34` | `save_my_roster_prefs` | `jsonb` | No (single value) | Not applicable |
| 76 | **SAFE** | `app/settings/page.js:43` | `my_roster_prefs` | `jsonb` | No (single value) | Not applicable |
| 77 | **SAFE** | `app/settings/page.js:44` | `my_notification_prefs` | `jsonb` | No (single value) | Not applicable |
| 78 | **SAFE** | `app/settings/page.js:45` | `owner_directory` | `TABLE(...)` | No | No paging or limit. |
| 79 | **SAFE** | `app/team/[teamId]/actions.js:65` | `compute_cut_charges` | `jsonb` | No (single value) | Not applicable |
| 80 | **SAFE** | `app/team/[teamId]/actions.js:69` | `compute_cut_savings` | `jsonb` | No (single value) | Not applicable |
| 81 | **SAFE** | `app/team/[teamId]/actions.js:73` | `edfl_cut_timing_forced` | `text` | No (single value) | Not applicable |
| 82 | **SAFE** | `app/team/[teamId]/actions.js:112` | `cut_player` | `uuid` | No (single value) | Not applicable |
| 83 | **SAFE** | `app/team/[teamId]/actions.js:181` | `set_roster_status` | `jsonb` | No (single value) | Not applicable |
| 84 | **SAFE** | `app/team/[teamId]/actions.js:221` | `ps_exempt_set` | `jsonb` | No (single value) | Not applicable |
| 85 | **SAFE** | `app/team/[teamId]/actions.js:256` | `taxi_hold_set` | `jsonb` | No (single value) | Not applicable |
| 86 | **SAFE** | `app/team/[teamId]/insiderActions.js:43` | `insider_submit` | `jsonb` | No (single value) | Not applicable |
| 87 | **SAFE** | `app/team/[teamId]/insiderActions.js:76` | `insider_withdraw` | `jsonb` | No (single value) | Not applicable |
| 88 | **SAFE** | `app/team/[teamId]/insiderActions.js:95` | `search_players` | `TABLE(...)` | Yes, if not limited | Limited: `p_limit: 50`. |
| 89 | **SAFE** | `app/team/[teamId]/page.js:420` | `team_cut_previews` | `TABLE(...)` | No | No limit. Scoped to one team. |
| 90 | **SAFE** | `app/team/[teamId]/page.js:594` | `owner_directory` | `TABLE(...)` | No | No paging or limit. |
| 91 | **SAFE** | `app/team/[teamId]/page.js:620` | `waiver_priority_order` | `TABLE(...)` | No | No paging or limit. |
| 92 | **SAFE** | `app/trades/[tradeId]/page.js:108` | `trade_impact` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 93 | **SAFE** | `app/trades/[tradeId]/page.js:111` | `trade_legality` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 94 | **SAFE** | `app/trades/[tradeId]/page.js:116` | `trade_savings` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 95 | **SAFE** | `app/trades/actions.js:57` | `propose_trade` | `jsonb` | No (single value) | Not applicable |
| 96 | **SAFE** | `app/trades/actions.js:93` | `update_trade_draft` | `jsonb` | No (single value) | Not applicable |
| 97 | **SAFE** | `app/trades/actions.js:114` | `discard_trade_draft` | `jsonb` | No (single value) | Not applicable |
| 98 | **SAFE** | `app/trades/actions.js:136` | `submit_trade` | `jsonb` | No (single value) | Not applicable |
| 99 | **SAFE** | `app/trades/actions.js:161` | `accept_trade` | `jsonb` | No (single value) | Not applicable |
| 100 | **SAFE** | `app/trades/actions.js:181` | `decline_trade` | `jsonb` | No (single value) | Not applicable |
| 101 | **SAFE** | `app/trades/actions.js:212` | `execute_trade` | `jsonb` | No (single value) | Not applicable |
| 102 | **SAFE** | `app/trades/actions.js:248` | `veto_trade` | `jsonb` | No (single value) | Not applicable |
| 103 | **SAFE** | `app/trades/actions.js:301` | `reverse_trade` | `jsonb` | No (single value) | Not applicable |
| 104 | **SAFE** | `app/trades/actions.js:345` | `trade_impact` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 105 | **SAFE** | `app/trades/actions.js:346` | `trade_legality` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 106 | **SAFE** | `app/trades/actions.js:347` | `trade_savings` | `TABLE(...)` | No | No limit. Scoped to one trade. |
| 107 | **SAFE** | `app/transactions/actions.js:37` | `league_transaction_kinds` | `TABLE(...)` | No | No paging or limit. |
| 108 | **SAFE** | `app/transactions/actions.js:64` | `league_transactions` | `TABLE(...)` | Yes, if not paged | Pages by keyset: `p_limit: f.limit \|\| PAGE_SIZE` (100) plus the `occurred_at` and `log_id` cursor. `TransactionLog.js` stops on a short page. Name and team sorts show only the first page, with a "narrow the filters" notice. |
| 109 | **SAFE** | `app/waivers/actions.js:118` | `edfl_wire_live` | `boolean` | No (single value) | Not applicable |
| 110 | **SAFE** | `app/waivers/actions.js:209` | `waiver_priority_order` | `TABLE(...)` | No | No paging or limit. |
| 111 | **SAFE** | `app/waivers/actions.js:251` | `team_cut_previews` | `TABLE(...)` | No | No limit. Scoped to one team. |
| 112 | **SAFE** | `app/waivers/actions.js:391` | `submit_waiver_claim` | `uuid` | No (single value) | Not applicable |
| 113 | **SAFE** | `app/waivers/actions.js:407` | `withdraw_waiver_claim` | `boolean` | No (single value) | Not applicable |
| 114 | **SAFE** | `app/waivers/actions.js:421` | `reorder_waiver_claims` | `integer` | No (single value) | Not applicable |
| 115 | **SAFE** | `app/waivers/actions.js:438` | `withdraw_pending_cut` | `boolean` | No (single value) | Not applicable |
| 116 | **SAFE** | `components/CommishPill.js:44` | `officer_action_badge` | `TABLE(...)` | No | Reads the first row only. |
| 117 | **SAFE** | `components/ComplianceAlert.js:43` | `my_compliance_alert` | `jsonb` | No (single value) | Not applicable |
| 118 | **SAFE** | `components/PoachAlert.js:34` | `my_poach_alerts` | `jsonb` | No (single value) | Not applicable |
| 119 | **SAFE** | `components/ownerInfoActions.js:45` | `owner_directory` | `TABLE(...)` | No | No paging or limit. |
| 120 | **SAFE** | `components/ownerInfoActions.js:76` | `owner_profile_raw` | `TABLE(...)` | No | No limit. Reads the first row only. |
| 121 | **SAFE** | `components/ownerInfoActions.js:123` | `save_owner_profile` | `uuid` | No (single value) | Not applicable |
| 122 | **SAFE** | `lib/injurySync.js:148` | `apply_injury_sync` | `jsonb` | No (single value) | Not applicable |
| 123 | **SAFE** | `lib/restructureRoster.js:124` | `can_restructure` | `jsonb` | No (single value) | Not applicable |

## How this was gathered

- I searched `app/`, `components/`, `lib/` and `middleware.js` for `.rpc(`, including calls split across lines (`app/team/[teamId]/page.js:671`, `app/bids/[tierId]/delegate/DelegateForm.js:220`). A repo-wide search found no `.rpc` calls anywhere else.
- I matched each function name against the table rows in section 4 of the reference, and took the return type from that table.
- For every function that returns `TABLE(...)` or is missing from the reference, I read the calling code to check for paging, `p_limit`, row scoping and how truncation would show up.
- I did not use league state or row counts to decide any verdict. The one count quoted (`owner_api_keys`) only describes likelihood and is labelled with its date.
