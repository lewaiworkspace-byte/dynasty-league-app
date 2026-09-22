# EDFL Database Reference — for Claude Code

**v2.4 — September 21, 2026, 22:25 ET.** *An **amendment** to v2.3, not a regeneration, and
narrower than v2.3 was: six migrations landed after the September 20 afternoon session
(`poach_08`, `poach_08b`, `psx_01`–`psx_04`; the catalog is at **337 migrations**). Two new tables,
two new `league_config` columns, seven new functions, two new triggers on `contracts` plus one on
the new exemption table, three views with appended columns, two RLS policies. §0 below describes
them; the numbered sections are NOT re-cut — read §0 first, and where a §3–§8 statement about
`taxi_eligibility_status`, `poachable_players`, `team_inseason_compliance`, `edfl_taxi_origin_actives`
or `edfl_poach_eligible` disagrees with §0, §0 is current. Every object here was read back from
`pg_proc`, `pg_get_viewdef`, `relacl` and `information_schema` after the migrations ran.*

## 0. What changed since v2.3 — the practice squad designations (September 21, 2026)

**The rulings** (all September 21): poaching opens **12:00 PM ET Wednesday September 23** (RB
Schedule A.9); a team may hold **two** practice squad players **exempt from poaching at a time** and
the exemption is shown to the league (RB 5.17(l)); a player back from the active roster is **not
poachable for 24 hours** (RB 5.17(m)); an owner may **hold** an elevated practice squad player on the
active roster through the Tuesday return (RB 3.3(d)(i)); the Overview roster bar reads the compliance
view for nine boxes.

### 0.1 Configuration (§10 rule: read it, never hardcode it)

| Column | Default | Rule |
|---|---|---|
| `league_config.poach_exemptions_per_team` integer | 2 | RB 5.17(l) |
| `league_config.poach_demotion_grace_hours` numeric | 24 | RB 5.17(m) |

### 0.2 Tables (both: `authenticated` SELECT only, RLS on with a read-all policy, written only by
SECURITY DEFINER functions; `anon`/`authenticated` DML revoked and asserted — SR-67)

**`practice_squad_poach_exemptions`** — `id uuid pk`, `contract_id → contracts`, `player_id →
players`, `team_id → teams`, `season_year int`, `designated_by → team_owners`, `designated_at
timestamptz default now()`, `note text`, `released_at timestamptz`, `released_reason text`,
`released_by → team_owners`. CHECK `ps_poach_exempt_release_shape` (released_at and reason are set
together). Partial unique `ps_poach_exempt_live_uq (contract_id) where released_at is null`. **One
live row per contract; history is never deleted.** `released_reason` values written so far by
code: `owner`, `officer`, `promoted`, `moved to ir`, `contract <status>`.

**`taxi_active_holds`** — `id`, `contract_id`, `player_id`, `team_id`, `season_year`, `set_by`,
`set_at default now()`, `note`, `cleared_at`, `cleared_reason`, `cleared_by`. CHECK
`taxi_hold_clear_shape`. Partial unique `taxi_active_holds_live_uq (contract_id) where cleared_at is
null`. `cleared_reason` values: `owner`, `officer`, `moved to taxi`, `moved to ir`, `contract
<status>`, `locked (fourth week)`.

### 0.3 Functions

| Function | Kind | Grants | What |
|---|---|---|---|
| `edfl_ps_poach_exempt(contract uuid) → boolean` | predicate, stable, definer | authenticated, anon, service_role | RB 5.17(l): a live exemption row exists |
| `edfl_ps_poachable_from(contract uuid) → timestamptz` | predicate, stable, definer | authenticated, anon, service_role | RB 5.17(m): latest `active → taxi` `roster_moves` row + grace hours, or NULL once past |
| `edfl_taxi_held(contract uuid) → boolean` | predicate, stable, definer | authenticated, anon, service_role | RB 3.3(d)(i): a live hold row exists |
| `edfl_taxi_revert_subject(contract uuid) → boolean` | predicate, stable, definer | authenticated, anon, service_role | RB 3.3(d): the Tuesday return would move him — active, last move `taxi → active`, not locked, and the `taxi_revert_baseline_at` grandfathering for rookies. **Ignores holds.** The one statement of the rule (SR-70) |
| `edfl_taxi_hold_refusal(contract uuid) → text` | stable, definer | authenticated, service_role | The sentence refusing a hold, or NULL |
| `ps_exempt_set(contract uuid, exempt boolean, note text default null) → jsonb` | write, definer, gates on `auth.uid()` | authenticated, service_role | Owner of the team or an officer. Exempt: must be on the practice squad, not already exempt, no live poach window (`edfl_poach_frozen`), fewer than `poach_exemptions_per_team` live. Release: must be exempt. Logs `poach_exemption_changed` to `commissioner_actions` only when an officer acts on another team. Returns `contract_id, player, exempt, team_exempt_count, team_exempt_limit` |
| `taxi_hold_set(contract uuid, hold boolean, note text default null) → jsonb` | write, definer, gates on `auth.uid()` | authenticated, service_role | Owner or officer. Hold: `edfl_taxi_hold_refusal()` must be NULL and not already held. Release: must be held. Logs `taxi_hold_changed` for an officer on another team. Returns `contract_id, player, held, weeks_used` |
| `edfl_ps_exempt_limit()` | trigger fn | — | `BEFORE INSERT OR UPDATE` on the exemption table: refuses a third live row per team |
| `ps_exempt_release_on_change()` | trigger fn | — | `AFTER UPDATE OF roster_status, status` on `contracts`: releases the exemption when the player leaves the practice squad or the contract leaves `active` |
| `taxi_hold_clear_on_change()` | trigger fn | — | `AFTER UPDATE OF roster_status, status` on `contracts`: clears the hold when the player leaves the active roster or the contract leaves `active` |

**Changed functions (asserted string patches, SR-45; grants unchanged):**

- **`edfl_poach_eligible(player, opening_team)`** — two tests added after the pending-cut test and
  before the own-team test: `Rule 5.17(l): his team has exempted him…` and `Rule 5.17(m): he was on
  the active roster within the last N hours and cannot be poached until <ET instant>.` `submit_fa_offer`
  calls this at window-open, so a bid is refused with the same sentence.
- **`edfl_taxi_origin_actives(team)`** — rewritten (same RETURNS TABLE, same grants): `where status
  = 'active' and roster_status = 'active' and edfl_taxi_revert_subject(c.id) and not edfl_taxi_held(c.id)`.
  The set returned was asserted identical before and after the rewrite (nine rows). `taxi_revert_due()`
  is untouched and skips held players because this list does.
- **`taxi_weeks_credit_due()`** — after each fourth-week lock: `update taxi_active_holds set cleared_at
  = now(), cleared_reason = 'locked (fourth week)' where contract_id = r.id and cleared_at is null`.

### 0.4 Triggers on `contracts` (now eight)

`trg_ps_exempt_release` and `trg_taxi_hold_clear`, both `AFTER UPDATE OF roster_status, status …
WHEN (old.roster_status is distinct from new.roster_status or old.status is distinct from new.status)`.
Plus `trg_ps_exempt_limit BEFORE INSERT OR UPDATE` on `practice_squad_poach_exemptions`.

### 0.5 Views — appended columns only; positional reads of the old shape still work

- **`taxi_eligibility_status`** (security_invoker restated) — `held boolean`, `held_since
  timestamptz`, `hold_note text` (the RB 3.3(d)(i) sentence, or NULL), `poach_exempt boolean`,
  `poachable_from timestamptz`, `elevated boolean` (= `edfl_taxi_revert_subject(c.id)`; true for a
  held player too, which is what lets the Roster tab offer *Release hold*).
- **`poachable_players`** (definer, `authenticated` only, ACL asserted unchanged) — `poach_exempt`,
  `poachable_from`.
- **`team_inseason_compliance`** (security_invoker restated; `compliant` and `reasons` untouched;
  every team's verdict asserted unchanged) — `qb_ir_count, qb_taxi_count, rb_ir_count, rb_taxi_count,
  wr_ir_count, wr_taxi_count, te_ir_count, te_taxi_count, k_ir_count, k_taxi_count` (the existing
  `qb_count`… are the ACTIVE-roster counts; active + ir + taxi reconciles to the roster, asserted),
  then `active_over_by, ps_over_by, ps_non_rookie_over_by, ir_over_by, qb_over_by, k_over_by,
  qb_short, rb_short, wr_short, te_short, k_short, flex_short` — the flags CTE's own figures, now
  exposed. 70 ms for all ten teams as `authenticated`.

### 0.6 Data

`league_calendar_events` row `5.17` (id `e860afbb-…`): `starts_at` **2026-09-23 16:00+00**
(was 09-22 04:00+00), `detail` reworded to say so; `ends_at` unchanged. `goodell_broadcasts` row
`evt:e860afbb-…:1d` **deleted** by ruling so the one-day notice re-posts at 2026-09-22 16:00+00.
At this stamp: 0 exemptions, 0 holds, 0 locks, 43 live credits, 9 revert subjects, 40 practice
squad contracts.

### 0.7 Row-count hazards (§9 addendum)

Both new tables are bounded by the roster (≤ 2 live exemptions × 10 teams; ≤ 9 live holds) and grow
by history only. Neither is sealed (SR-31): an exemption is public by ruling and a hold is a roster
fact.

---

**v2.3 — September 20, 2026, 02:05 ET.** *A **structural amendment** to v2.2, not a regeneration.
Twenty-two migrations landed after v2.2's stamp, all between 22:55 ET September 19 and 01:14 ET
September 20: the **week-is-final rule** (Phase 2G-1), **projections and the Matchup read**
(Phase 2G-2/2G-3), the **practice squad class fix**, the **injury designation set**, and the
**closed owner proxy**, which was data only. One new table, two new views, five new functions, one
new RLS policy, one new CHECK constraint, no new trigger and no new scheduled job. §0 describes
them; §§1–5, 8, 9 and 11–14 carry them; every count in this file was re-derived from the catalog
at this stamp rather than carried forward, and every new or changed object was read back from
`pg_proc`, `pg_attribute`, `pg_constraint`, `pg_policies` and `relacl` rather than from its
migration's text.*

***What this cut corrected, beyond adding the new objects.*** *Four things v2.2 asserted are wrong
and are fixed here, not repeated:*

1. ***The `dianna` grant surface was under-counted.*** *§2 said the role holds SELECT on "exactly
   three relations" and its two views. `relacl` says **thirteen**: six tables (`trade_blocks`,
   `draft_prospects`, `draft_prospect_classes`, and `contracts`, `players`, `teams`) and seven
   views (`dianna_trade_block`, `dianna_prospects`, `draft_prospect_board`, `trade_block_status`,
   `insider_feed`, `insider_live`, `morts_thoughts`). None is watchlist-shaped, so WL-10 holds; the
   sentence did not. And **three** policies name the role, not four — §8's own table listed three.*
2. ***The `service` tally was pre-bots.*** *§4 said 37 callable functions are `service`. Seventeen
   of the thirty-four bot and market functions are `service` too, and were when v2.2 was cut. The
   re-derived figure is **54**; none of this cut's five joins it.*
3. ***Five row counts (§5, §9) were carried from v2.0 and were wrong at the v2.2 stamp.*** *`taxi_week_credits`
   held 86 rows from the Week 2 compliance instant (00:00 ET September 17), `waiver_placements` one
   (a waive at 15:01 ET September 16), `compliance_violations` one (the `_none` marker for a clean
   Week 2), `officer_action_item_state` four rows, and `nfl_schedule_refresh_runs` fourteen.
   "Nothing designated, waived, locked, credited or swept yet" was not true when it was written.*
4. ***`edfl_signing_fraction()` has produced a value below 1.*** *§9 said every
   `contracts.first_season_week` was `1`. Thirty-three contracts carry the column and six of them
   carry `2`.*

***Nothing was fixed in the database by this cut.*** *It was read-only against the catalog and the
non-sealed tables (SR-31). Two grant facts are recorded in §12 for the next sweep rather than
corrected: `roster_injury_status`, created after the `phase2g2_05` sweep, carries Supabase's
default write grants for both client roles, as most older views do — it is a join view, so none of
them is exercisable; and the PostgreSQL 17 `MAINTAIN` bit survives every sweep to date because no
revoke has named it.*

**v2.2 — September 19, 2026, 19:10 ET.** *A **structural amendment** to v2.1, not a regeneration.
Twenty-three migrations landed after v2.1's stamp and they are the largest single-day schema change
the league has had: the **Mort wire**, **Insider Threat** (trade block, watchlist, prospects, Dianna)
and **Robo Goodell**. Twelve new tables, twelve new views, thirty-four new functions, twelve new RLS
policies and three new scheduled jobs. §0 describes them; §§2–5, 7–9 and 12 carry them; every count
in this file was re-derived from the catalog at this stamp rather than carried forward.*

***What the v2.2 cut corrected, beyond adding the new objects.*** *Four things v2.1 asserted are wrong
and are fixed there, not repeated:*

1. ***v2.1's migration count was not re-read.*** *It said 276 "re-read at this stamp and unchanged";
   the catalog held **280** through September 17. v2.0's figure had been carried forward under a
   sentence claiming it had not been.*
2. ***The btree_gist exclusion list was incomplete.*** *v2.1 said the extension's functions are
   `gbt_*` and `gbtreekey*`. There are **twelve more** — `cash_dist`, `date_dist`, `float4_dist`,
   `float8_dist`, `int2_dist`, `int4_dist`, `int8_dist`, `interval_dist`, `oid_dist`, `time_dist`,
   `ts_dist`, `tstz_dist` — which do not match either pattern. A count filtered only on `gbt%`
   over-reports EDFL's functions by twelve. The live split is **255 EDFL / 188 btree_gist**.*
3. ***The sealed-group heading said "five of them" over a table of seven.*** *It is **nine** now
   (§2), and the two added today were built with the restraint SR-31 asks for.*
4. ***A schema comment named a function that does not exist.*** *`trade_blocks` pointed at
   `trade_block_is_live()`. Liveness is computed in the `trade_block_status` view; the comment was
   rewritten to name what actually computes it (`bots_02`).*

***And one thing the v2.2 cut fixed in the database rather than documenting.*** *Eleven bot relations
still carried Supabase's default privileges — `anon` SELECT plus INSERT/UPDATE/DELETE for both
client roles. The `it_04` sweep had cleaned the Insider Threat objects; the Mort wire and the Robo
Goodell batch had not been swept. **Nothing was exposed** — RLS refused all of it, which is exactly
the posture §2 describes — **except `goodell_upcoming`**, an invoker view over two public tables,
which `anon` really could read. Migration `bots_01_grant_sweep_select_only` revoked them and asserts
both directions. See §12.*

**v2.0 — September 16, 2026, 08:40 ET.** *A whole regeneration from the live catalog of
`kghjiqfxmzbpftotkbsf`. It replaces the layered amendments v1.4 through v1.9: every table, view,
function, trigger, policy, enum, scheduled job and grant below was read from the database at this
stamp, and nothing was carried from an earlier cut without being re-read. §0 lists what changed
since v1.9, including the twenty migrations v1.9 named but did not describe.*

**Counts at the v2.3 stamp, every one re-derived:** 84 tables (78 league tables + 6 backups) ·
57 views · 260 EDFL functions (228 callable + 32 trigger; 188 more belong to `btree_gist`) ·
38 triggers (37 on `public` tables + 1 on `auth.users`) · 77 RLS policies ·
5 enums · 14 `pg_cron` jobs · 8 extensions · 326 migrations.

*v2.2's counts, for the shape of the change: 83 tables · 55 views · 255 EDFL functions (223 callable
+ 32 trigger) · 76 policies · 14 jobs · 304 migrations. v2.0's: 71 tables · 43 views ·
220 functions · 64 policies · 11 jobs.*

**The copy of this file in the project [The League Abides] is canonical.** The copy committed to
the repo is a mirror for Claude Code to read; it is replaced whole when a new version is cut and is
never edited in place. If the two differ, the project copy wins. Earlier cuts live in
`Archive\Reference Docs`, not in this file.

**Do not query the database from Claude Code, whether or not a tool for it appears in your tool
list. Do not write SQL.** All schema and function changes are made in the project chat through the
Supabase MCP connection. If a feature appears to need a new table, view, column or function, stop
and say so.

**How to read it.** Structure — signatures, columns, grants, policies, triggers — is a code fact and
stays true until a migration changes it. Counts, calendar instants and league state are world facts,
stamped at the time above. **If today is more than a few days after the stamp, treat every count as
stale** and ask for a fresh cut before relying on one.

---

## 0. What changed since v2.2 — the week-is-final rule, projections, and two one-predicate fixes

*Twenty-two migrations, applied between 22:55 ET September 19 and 01:14 ET September 20. One was
data only; the other twenty-one built four things. Each migration's text was read, and every
object it created or changed was then re-read from the catalog, so what follows describes the live
object, not the migration's account of it.*

### 0a. Phase 2G-1 — the week-is-final rule (`phase2g1_01`–`_03`)

One definition of "this week is over", in one view, read by both consumers so they cannot
disagree.

| Object | What |
|---|---|
| `league_week_status` | **new view**, one row per `league_weeks` row: `week_final_at` = the week's last regular-season kickoff in `nfl_games` + 4 hours (falling back to `last_game_at`), `last_synced_at` = the newest `team_week_scores.synced_at` for the week, `week_is_final` = a sync at or after that instant. A definer view over three public tables; `anon`, `authenticated` and `service_role` SELECT, the default write bits revoked by `phase2g2_05` |
| `league_scoreboard` | rewritten to read `week_final_at` and `week_is_final` from `league_week_status` instead of computing them inline. **Output columns unchanged** |
| `league_standings` | rewritten to count **only weeks where `week_is_final`** — a record, and the points for and against, streak and differential with it, do not move until the week's last NFL game is four hours past **and** a sync has run since (commissioner ruling, September 20). **Output columns unchanged** |

At this stamp Week 1 is final (`week_final_at` 00:15 ET September 15) and Week 2 is not (00:15 ET
September 22). The rule has two limbs: a week whose games are long over but which has had no sync
since its final instant is not final, which is what makes the sync ledger load-bearing for the
standings.

### 0b. Phase 2G-2 / 2G-3 — projections and the Matchup read (`phase2g2_01`–`_08`)

Sleeper's Rotowire projections, stored per player-week and scored by EDFL rules, and one function
that draws the Matchup page. **Nothing in the league is settled from a projection**:
`team_week_scores.points` and `edfl_best_ball_lineup()` remain the official score and lineup, and
**`edfl_matchup_detail()` scores nothing** — it reads what the two syncs wrote and slots it.

| Object | What |
|---|---|
| `player_week_projections` | **new table**, PK (`season_year`, `week_number`, `player_id`): `proj_points` and `proj_stats` — the frozen Rotowire object, kept so a scoring change can be re-scored without re-pulling a week Rotowire has since overwritten — with `source`, `scored_with` → `edfl_scoring_settings`, `synced_at`, `synced_by`. RLS on; one SELECT policy, `authenticated`; **no `anon` grant and no write policy**. 845 rows at this stamp (Week 1: 411, Week 2: 434) |
| `edfl_score_projected_stats(p_stats jsonb, p_settings integer DEFAULT NULL)` | **new**, → `numeric`. Scores a Rotowire stat object with the newest `edfl_scoring_settings` row, or the row named. The WR/TE reception bonuses are applied by the caller, which knows the position. Invoker, `authenticated` only |
| `edfl_sync_week_projections(p_season, p_week, p_payload jsonb)` | **new**, → `jsonb`. The owner Refresh path for projections, gated through `team_owners` on `auth.uid()` exactly as `edfl_sync_week_scores` is; upserts one row per payload element whose `player_id` is a known Sleeper id and reports `rostered_without_projection` — active-roster players in `player_week_scores` with no projection row. SECURITY DEFINER, `authenticated` |
| `edfl_matchup_detail(p_season, p_week, p_matchup_id)` | **new**, → an 18-column TABLE: both rosters of one matchup with actual `points`, `proj_points`, `effective_points` (actual once the player's game has kicked off, projection until then), `game_state` (`bye` / `scheduled` / `live` / `final`), `opponent`, `kickoff_at`, the **provisional** best-ball `slot` (1 QB, 2 RB, 4 WR, 2 TE, 2 FLEX, 1 K; unkicked-off players slotted on projection) and `injury_flagged` / `injury_label` from the §0d predicate. SECURITY DEFINER, STABLE, `authenticated` |

**Three corrections landed the same night, and two of them are facts about the data that outlive
the fix (§11).**

- **Rotowire's `pass_fd`, `rush_fd` and `rec_fd` are not first downs** (`phase2g2_08`). They are
  yards divided by ten — measured across the 777 projections stored at the time, `rec_fd = rec_yd/10`
  in 711 rows and `pass_fd = pass_yd/10` to the third decimal for every quarterback. Scoring them at
  a point each added `pass_yd/10` phantom points to every QB: Week 1 projected 56.5 against 40.7
  actual. EDFL really does pay a point per first down and Rotowire really does not project them, so
  the scorer now **ignores the three `_fd` keys entirely** and estimates first downs from projected
  volume at rates measured over every game in `player_game_stats` (61,223 completions, 76,318
  carries, 60,771 receptions): **0.5243 per completion, 0.2478 per carry, 0.5249 per reception.**
  Estimation beat both shipping and dropping the keys at every position on Week 1 (QB −2.8 against
  −15.8 and +9.3). The rates are in the function's comment; the page says it is an estimate. The
  stored rows were re-scored in place — the re-score is not in the migration's recorded text, but
  all 845 rows agree with the corrected scorer at this stamp.
- **`nfl_games` says `LA`; `players.nfl_team` says `LAR`** (`phase2g2_07`). Two vocabularies for one
  team, and the only disagreement across the 32 codes of 2026 (25 players `LAR`, 17 games `LA`).
  The first `edfl_matchup_detail` joined them on raw equality, so every Rams player read `bye` —
  and `bye` falls in the projection branch of `effective_points`, so a Rams player would have held
  a best-ball slot on his projection all week, including after his Monday game had finished. The
  fix calls **`edfl_nfl_team_code()`, which already existed** and already carried `LAR → LA`; no
  second normaliser was added and none should be.
- **The Matchup page reads the injury predicate, not raw `injury_status`** (`phase2g2_06`; §0d).
  Two OUT columns were added, which Postgres refuses to do in place — the function was dropped and
  re-created while nothing called it. **From now on it changes by REPLACE only**, or `/matchup`
  404s between the drop and the create.

### 0c. The practice squad class fix — one rule, one predicate (`psclass_01`–`_06`)

TM 3.3(b)(i) and 3.3(i) run practice squad eligibility, and the three-week counter that rides on
it, from the player's **NFL draft class**, not from `contract_type`: the 2023–2026 redraft gave
every rookie a contract starting in 2026, so a 2023-class player is typed `rookie` and is in his
fourth season (SR-26, SR-35). Three readers answered that question three ways. The gate was right
and the other two were not, which is how a 2023-class rookie came to be shown accruing practice
squad weeks he could never use — the symptom the commissioner reported on De'Von Achane.

| Object | What |
|---|---|
| `edfl_taxi_rule_subject(p_contract_type, p_draft_year, p_start_year, p_season DEFAULT NULL)` | **new**, → `boolean`: the single definition. True for any `practice_squad` contract and for a `rookie` contract whose draft class is this season or last (`season − coalesce(draft_year, start_year) <= 1`). `start_year` is a fallback only, and `psclass_01`'s constraint makes it unreachable for a rookie contract. **Invoker** since `psclass_06` — it reads only `league_config`, whose policy is `true` — and executable by `anon`: Class A (§12) |
| `contracts.contracts_rookie_needs_draft_year` | **new CHECK**: a `rookie` contract carries a `draft_year`. All 135 did; this stops a new one silently falling back to `start_year`, which for a 2026-start redraft contract reads as eligible |
| `taxi_weeks_credit_due()` | patched by asserted string replacement (SR-45): the credit insert and the lock loop both require the helper now |
| `check_taxi_eligibility()` | rewritten to route through the helper; behaviour and both refusal sentences unchanged |
| `taxi_eligibility_status` | gains **`ps_rule_subject`** and **`ps_ineligible_reason`**, appended; nothing removed or renamed, so every client reader still renders on `warning`. The weeks-based `warning` branches are gated on being a rule subject; **the locked branch is not and must not be** — the lock follows the player, not the paper |
| `taxi_week_credits` | **43 rows voided, not deleted** (`psclass_05`): every credit written for the 2023 class (18) and the 2024 class (25) at the Week 2 instant, `voided_reason` beginning `psclass_05:`. `edfl_taxi_weeks_used()` already ignored a voided row, so the counts fell to zero with the audit trail intact. No lock had ever fired; `taxi_active_locks` is still empty |

`team_inseason_compliance.ps_non_rookie_count` was re-keyed in the same batch (`injflag_04`): it
counted `contract_type <> 'rookie'`, and the 3.3(b) three-slot limit is for players **not holding
rookie eligibility** — a rookie contract out of its draft window holds none. Every team's figure was
unchanged; it is correct now if a grandfathered row ever appears.

### 0d. The injury designation set — one predicate, four readers (`injflag_01`–`_04`)

Commissioner's ruling of September 20: one set of Sleeper designations — **IR, Out, Doubtful,
PUP** — answers two questions, and it is one function so the answers cannot drift: which players
carry the red cross, and which may occupy an EDFL injured reserve slot (TM 3.4(b)). PUP was ruled
in because a player on the physically-unable-to-perform list cannot practise, which is the fact an
IR slot exists to hold. This is **not** `roster_status = 'ir'`: that is where the owner put him;
`injury_status` is what the NFL says about him, and the compliance flag exists for the case where
the two disagree.

| Object | What |
|---|---|
| `edfl_injury_designation_qualifies(p_status text)` | **new**, → `boolean`, IMMUTABLE, invoker, executable by `anon` — Class A. `upper(btrim(status)) in ('IR','OUT','DOUBTFUL','PUP')`; false for NULL |
| `roster_injury_status` | **new view**, one row per active contract (294 at this stamp): the designation, `injury_flagged`, `injury_label` (`Status — body part`, composed here and never in the client), `ir_ineligible` (on EDFL IR with no qualifying designation) and `ir_ineligible_reason`. Built for the roster table, which reads `contracts` with an embedded `players(...)` select and cannot call a function per row through PostgREST. `security_invoker`; `anon` and `authenticated` |
| `player_card_header` | gains `injury_status`, `injury_body_part`, `injury_flagged`, `injury_label`, appended |
| `team_inseason_compliance` | gains **`ir_no_designation_count`** and **`ir_no_designation_names`**, a `reasons` sentence citing 3.4(b), and the count folded into **`compliant`**. **An IR slot is flagged, never blocked**: `set_roster_status()` is untouched, and the banner tells the owner to cure it by the Thursday instant, the same shape as a cap or roster-size overage. Blocking was rejected because it cannot handle the commoner case — a player placed on IR legitimately whose designation clears the following week |
| `edfl_matchup_detail()` | the fourth reader (§0b) |

**The rule book does not yet say this.** TM 3.4(b) as written names "Doubtful", "DNR", "Holdout"
and "Opt-Out" — a list that omits IR and Out and includes three designations the ruling does not.
Until it is amended, **the function is the ruling.** At this stamp 92 of the 216 players carrying
any Sleeper designation qualify (68 IR, 14 Out, 7 PUP, 3 Doubtful); 35 of them hold an active
contract, and no team has an IR slot without a qualifying designation.

### 0e. The closed owner proxy — data only (`end_owner_proxy_enter_sam_man_sep19`)

The commissioner's second proxy over Enter Sam Man (opened 08:24 ET September 7, logged as
`owner_proxy_access`; the first ran from 06:09 to 08:28 ET on September 2) ended at 22:55 ET September 19:
`team_owners.user_id` and `email` were restored to the owner's own login, and one
`commissioner_actions` row (`owner_proxy_access_ended`) closes the instance with the opening entry's
id in its snapshot. **No schema changed.** Proxy attribution on `roster_moves` and on the existing
log rows was deliberately left untouched — moves made during the proxy period remain recorded
against the proxy account. The `proxy_access_open` banner item cleared at 23:00 ET.

### 0f. The twenty-two, by name

*Applied times are Eastern, from the migration version stamps. They ran in this order; note that
`psclass_06` and `phase2g2_06`–`_08` were corrections applied after the injury set.*

| Migration | Applied | What it did |
|---|---|---|
| `end_owner_proxy_enter_sam_man_sep19` | Sep 19 22:55 | Data only: restored Enter Sam Man's `team_owners` login and logged `owner_proxy_access_ended` (§0e) |
| `phase2g1_01_league_week_status` | Sep 20 00:23 | New view `league_week_status`; SELECT to `anon`, `authenticated`, `service_role` |
| `phase2g1_02_league_scoreboard_reads_week_status` | 00:24 | `league_scoreboard` reads the view; columns unchanged |
| `phase2g1_03_league_standings_holds_until_final` | 00:24 | `league_standings` counts only final weeks; columns unchanged |
| `phase2g2_01_player_week_projections` | 00:24 | New table, RLS on, `player_week_projections_read` for `authenticated`; `anon` revoked |
| `phase2g2_02_score_projected_stats` | 00:25 | New `edfl_score_projected_stats(jsonb, integer)`, `authenticated` |
| `phase2g2_03_sync_week_projections` | 00:25 | New `edfl_sync_week_projections(integer, integer, jsonb)`, SECURITY DEFINER, owner-gated |
| `phase2g2_04_matchup_detail` | 00:25 | New `edfl_matchup_detail(integer, integer, integer)`, 16 columns at first |
| `phase2g2_05_tighten_grants_select_only` | 00:26 | Revoked the default INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER from both client roles on `player_week_projections` and `league_week_status` |
| `psclass_01_taxi_rule_subject` | 00:29 | New `edfl_taxi_rule_subject(contract_type, integer, integer, integer)` (definer, at first) and CHECK `contracts_rookie_needs_draft_year` |
| `psclass_02_credit_counter_reads_draft_class` | 00:30 | `taxi_weeks_credit_due()` patched: both loops require the helper |
| `psclass_03_gate_reads_rule_subject` | 00:30 | `check_taxi_eligibility()` routed through the helper |
| `psclass_04_status_view_reads_draft_class` | 00:31 | `taxi_eligibility_status` gains `ps_rule_subject`, `ps_ineligible_reason` |
| `psclass_05_void_out_of_class_credits` | 00:31 | Data: 43 `taxi_week_credits` rows voided with a reason |
| `injflag_01_designation_set` | 00:32 | New `edfl_injury_designation_qualifies(text)`, invoker, `anon`-executable |
| `injflag_02_roster_injury_status_view` | 00:32 | New view `roster_injury_status`, `security_invoker` |
| `injflag_03_player_card_header_injury` | 00:32 | `player_card_header` gains four injury columns |
| `injflag_04_compliance_ir_designation` | 00:34 | `team_inseason_compliance` gains `ir_no_designation_count` / `_names`, a 3.4(b) reason, and `ps_non_rookie_count` re-keyed |
| `psclass_06_rule_subject_not_definer` | 00:40 | `edfl_taxi_rule_subject` made invoker; grants re-asserted |
| `phase2g2_06_matchup_detail_reads_injury_predicate` | 00:53 | `edfl_matchup_detail` dropped and re-created with `injury_flagged`, `injury_label` (18 columns) |
| `phase2g2_07_matchup_detail_normalises_team_code` | 01:11 | `edfl_matchup_detail` joins through `edfl_nfl_team_code()` — the Rams fix |
| `phase2g2_08_projection_first_downs_corrected` | 01:14 | `edfl_score_projected_stats` ignores the `_fd` keys and estimates first downs; stored rows re-scored |

---

## 0 (as of v2.2). What changed since v2.1 — the bots and the market layer

*Twenty-three migrations, all September 19, plus three corrective ones this cut applied
(`bots_01`, `bots_02`, `goodell_08` — see the banner). Three features, built in this order.*

### 0a. The Mort wire — `mort_report_discord_wire`, `mort_kinds_sort_rank_and_rulings`

The league's first Discord bot, **Mort_Report**, posting the transaction log to `#mort-report`.
The shape all three bots now share: a **broadcast ledger** keyed so a thing is said exactly once, a
**line builder**, a **`_say()`** that POSTs through `pg_net` to a webhook held in Vault, and a
**`_dispatch()`** on a five-minute `pg_cron` tick. Nothing model-written; nothing that costs money.

| Object | What |
|---|---|
| `discord_broadcasts` | the ledger, PK `log_id` — 515 rows, the whole transaction log |
| `mort_kinds` | which transaction kinds go on the wire, with `enabled` as the kill switch — 15 rows, all enabled |
| `mort_say`, `mort_line`, `mort_dispatch`, `mort_seed`, `mort_requeue`, `mort_failures` | webhook, prose, sweep, start-from-here, retry, and the failure reader over `net._http_response` |

Commissioner rulings carried in `mort_kinds`: roster moves (active / taxi / IR) go on the wire, not
only contract transactions; and a contested free agency window names its **losing bidders**, not
just an offer count.

### 0b. Insider Threat — `tb_01`–`tb_04`, `it_01`–`it_08`

The trade block, the watchlist, the rookie prospect board and **Dianna**, the rumour reporter in
`#insider-threat`. Rule 7.9. Spec: `EDFL_TradeBlock_Watchlist_RumorMill_Spec v0.8`.

| Object | What |
|---|---|
| `trade_blocks` | contract-scoped, one live row per contract; re-checking resets the 14-day clock by closing the old row (`removed_reason = reset`) and inserting a fresh one, so history is kept |
| `watchlist_markers` | player-scoped, three visibility tiers, **sealed at the private tier** (§2) |
| `draft_prospects`, `draft_prospect_classes` | ESPN's board, QB/RB/WR/TE/K only, matched to Sleeper after the NFL draft |
| `insider_submissions`, `insider_broadcasts` | what owners told Dianna, and what she has already said |
| `trade_block_status`, `watchlist_markers_effective`, `insider_live`, `insider_feed`, `morts_thoughts`, `draft_prospect_board`, `insider_subject_names` | the computed reads |
| `dianna_trade_block`, `dianna_prospects` | **the only two relations the `dianna` role may select**, and neither is watchlist-shaped |

**There is a database role named `dianna`**, with its own narrow SELECT policies on
`trade_blocks`, `draft_prospects` and `draft_prospect_classes` and on nothing else. That is the
mechanism enforcing WL-10 — the bot is granted nothing watchlist-shaped, at the role level, rather
than by a view's own grant. **Do not add a policy for `dianna` to any other table.**

`trade_block_falloff_at()` computes when a block dies; **`trade_block_is_live()` does not exist**
and the `trade_blocks` comment that named it was rewritten this session (`bots_02`).

### 0c. Robo Goodell — `goodell_01`–`goodell_07`

The League Office bot in `#league-office`: calendar notices, fines, and memos the commissioner
drafts. Spec: `EDFL_RoboGoodell_Spec v1.0`.

| Object | What |
|---|---|
| `goodell_kinds` | the five wire kinds and their mute switches — `event_7d`, `event_1d`, `event_now`, `fine`, `memo` |
| `goodell_broadcasts` | the ledger, PK `broadcast_key` — `evt:<uuid>:7d` / `:1d` / `:now`, `fine:<tx>`, `memo:<memo>` |
| `goodell_memos` | commissioner-drafted messages, officer-only by RLS until posted |
| `goodell_phrases` | the voice: four openers and four closers per kind, picked by `hashtext(broadcast_key ‖ slot) % count` — **deterministic**, so a test asserts a line and a requeue reads identically |
| `goodell_candidates()` | **one function feeds the dispatcher, the seeder and the officer preview**, so what he is about to say and what he does say cannot drift apart |
| `league_office_feed`, `goodell_upcoming`, `goodell_memo_queue` | the reads behind `/admin/league-office` |

Two design points that generalise to any future wire. **The age floor is what makes it safe to turn
on**: a candidate must satisfy `due <= now() AND due > now() - p_max_age` (24 hours), so switching
the webhook on does not dump eighteen months of calendar into the channel, and a muted kind is never
caught up when it is unmuted. **And precision is never invented**: an event whose `time_is_exact` is
false gets no at-the-hour post at all, and its prose says *"time to be confirmed"* rather than
printing a clock time the calendar row does not have.

### 0d. The four migrations v2.0 predates — applied September 17, 2026

*These are the whole of the schema delta since v2.0. Nothing has been applied since.*

| Migration | Applied | What it did |
|---|---|---|
| `ui_01_officer_action_item_severity` | Sep 17 | `officer_action_items()` gains a **`severity`** column (`text`) in its returned table, so the officer banner can rank its rows rather than listing them flat. VOLATILE, SECURITY DEFINER, EXECUTE to `authenticated` |
| `ui_02_officer_action_badge` | Sep 17 | New **`officer_action_badge()`** → `TABLE(urgent integer, attention integer)`. Two counts for the app bar's pill, so the bar does not have to read the whole item list to draw a number. STABLE, SECURITY DEFINER, EXECUTE to `authenticated` |
| `ui_03_teams_abbrev` | Sep 17 | `teams` gains **`abbrev`** — a short trigraph per team, for the scoreboard and the team disc in the app bar |
| `ui_04_teams_abbrev_corrections` | Sep 17 | Corrected values. The ten now read: AWF, COC, SUK, DWS, SAM, CRY, GCS, ROO, TAA, TIT |

**Neither function is `anon`-callable, and neither needs to be** — R-7 gates every route, so there
is no signed-out reader of the banner or the bar.

### 0e. What changed since v1.9 (v2.0's own note)

v1.9 (00:00 ET today) was a targeted amendment that left twenty migrations undescribed. This cut
folds them in, adds everything applied since, and re-reads the rest.

| Migrations | Applied | What they did |
|---|---|---|
| `tw_01`–`tw_04` | Sep 15 | TM 3.3(i) **active-roster lock**. New table `taxi_active_locks` and `edfl_taxi_locked()`; limb A is the trigger `trg_taxi_lock_on_promotion` (the fourth promotion), limb B runs inside `taxi_weeks_credit_due()` (a fourth counted week); `taxi_revert_due()` skips locked players and isolates each row; `edfl_practice_squad_convertible()` gained the lock test; `taxi_eligibility_status` rewritten, with `locked`, `last_demotion_available` and `locked_at` appended. `edfl_taxi_eligibility_spent()` now means *locked*, not *three weeks used* |
| `poach_00`–`poach_02d` | Sep 15 | Poaching foundations (TM 5.17): `free_agent_windows` gains `window_kind`, `incumbent_team_id`, `incumbent_contract_id`, `retain_bar_ppv`; the `5.17` calendar row; `edfl_poach_window_open()`, `edfl_poach_eligible()`, `edfl_poach_offer_valid()`; `edfl_taxi_lock_reason()`; `edfl_contract_season_cash()` / `edfl_offer_season_cash()`, which compute a season's cash exactly as rule 5.6's trigger does |
| `fa_m0_preview_gate_and_sealed_opener` | Sep 16 | `preview_fa_window()` is officer-only and only after `closes_at`. The opener is sealed: `free_agent_windows.opened_by_team_id` has no column grant, and the board's `opened_by` stays null until the window resolves |
| `waivers_ma_self_claim_allowed_and_resets_counter` | Sep 16 | A team may claim back its own waived player (DT-3); a self-claim resets the practice squad counter (DT-6); `edfl_self_claim_in_progress()` |
| `poach_03`–`poach_07b` | Sep 16 | The offer path (a bid on a practice squad player opens a 24-hour `poach` window with the rookie bar snapshotted; revisions strictly higher; `withdraw_fa_offer()` always refuses under 5.14(d)); the award engine (`free_agent_windows.outcome`; PPV, then the holding team, then the earliest offer; the retain bar; PO-7 settlement through `compute_trade_charges`; the PF-4 freeze trigger `check_poach_freeze`; the PF-5 $75 fine; award-and-oblige up to 28 active and 9 practice squad); feed kinds `signed_poach`, `poached`, `poach_retained`; League Finances (`team_cash_transactions.fine_kind`, `league_fines`, `league_fund` rebuilt over it); board columns and `poachable_players`; and **the `free_agent_offer_ppv` leak fix** — that view was a definer view granted to `anon` and exposed every sealed offer's team, player and PPV while its window was open. It is `security_invoker` now and `anon` has no grant |
| `hygiene_01`, `thirty_pct_01`, `gsis_01`–`gsis_05`, `calendar_01`, `action_items_01`–`02`, `hygiene_02` | Sep 16 | Described in v1.9 §0d; folded into the body below (TRUNCATE revoked; 30% Rule exemption keyed on reason; the player-identity merge and crosswalk; the Calendar Loader; the officer action banner) |
| `backup_01_export_functions` | Sep 16 | `edfl_backup_manifest()`, `edfl_backup_table_sql()`, `edfl_backup_sealed_filter()` — service-role export helpers. A sealed table exports only rows whose window or run has resolved |
| `grants_03_classify_anon_definer_and_drop_public` | Sep 16 | To-Do 53. Every SECURITY DEFINER function executable by `anon` classified; **six remain, each load-bearing** (§12) |
| `calendar_02_trade_deadline_matches_tm_7_5a` | Sep 16 | The `7.5(a)` row is 23:59 ET Monday November 30, as TM 7.5(a) says. `trade_window_at()` closes window 2 on that row |
| `nfl_schedule_01_kickoffs_scores_and_refresh` | Sep 16 | `nfl_games` gains `kickoff_at`, `home_score`, `away_score`, `schedule_synced_at`; the 2026 regular season is loaded (272 games); new ledger `nfl_schedule_refresh_runs`; `edfl_apply_nfl_schedule_csv()` and `edfl_nfl_schedule_refresh_due()`; job `edfl_nfl_schedule_refresh` |
| `scoreboard_sync_07_kickoff_windows_and_final_flag` | Sep 16 | The sync treats five minutes before to four and a half hours after any real kickoff as live. `league_scoreboard` gains `week_final_at` and `week_is_final` |
| `cuts_02_kickoff_makes_cut_end_of_week_5_23d` | Sep 16 | TM 5.23(d): once the player's NFL game that week has kicked off, `cut_player()` forces End of the week. `edfl_player_week_kickoff()`, `edfl_cut_timing_forced()`, `edfl_nfl_team_code()` |
| `action_items_03`–`04` | Sep 16 | Banner items for a stale NFL schedule (`nfl_schedule_stale`) and the unbuilt playoff wire (`playoff_wire_missing`) |
| `grants_04_fa_windows_outcome_column_select` | Sep 16 | `free_agent_windows.outcome` granted SELECT to `anon` and `authenticated`. `poach_04` added the column after `fa_m0` set the column grants, so a direct read naming it would have been refused. It was already public through the board |
| `hygiene_03_ir_slots_from_config_and_stale_comments` | Sep 16 | `set_roster_status()` reads the 3.4(a) limit from `league_config.ir_slots` instead of a literal 10 (same value today; tested at the configured figure and one above it). The comments on `set_roster_status`, `compute_cut_charges` and `edfl_practice_squad_convertible` rewritten — two described behaviour that had changed |
| `hygiene_04_cap_ceiling_comment_matches_dt5` | Sep 16 | Comment only, inside `check_cap_ceiling()`: it still described the September 7 "an award never blocks on the ceiling" ruling, which DT-5 superseded. Nothing has set `edfl.award_in_progress` since `poach_04`; the award engine sets the ceiling trigger IMMEDIATE inside its savepoint instead |
| `scoreboard_sync_08_log_corrections_only_after_final` | Sep 16 | `edfl_apply_matchups_payload()` logs `week_scores_corrected` only when the total it replaces was recorded at or after the week's `week_final_at`. It had logged every live two-minute change: **189 of the public action log's 372 rows are live scoring from Week 1, not corrections.** They were left in place (tested: a moved final total is logged; a moved live total is not) |
| `grants_05_ungated_definer_writers_service_only` | Sep 16 | `resolve_player_values()`, `rebuild_option_void_years()` and `rebuild_bid_option_void_years()` are service-role only. All three write tables, carry no permission gate, and were callable by any signed-in owner; no app code calls them, and their database callers are all definer functions (tested: the definer path still reaches the rebuild; a direct call is refused) |
| `cuts_01_active_roster_acquisitions` | Sep 9 | `league_active_roster_acquisitions` — live since September 9 and missing from every cut until this one |

**Corrections to earlier cuts.** `commissioner_owner_activity()` is officer-gated (`require_commissioner_or_co`), not
commissioner-only as v1.3–v1.9 §1 said. The five trigger functions §12 listed as having no
`search_path` pin all have one now. `free_agent_offer_ppv` is no longer on the definer list, and
`free_agent_windows` has no table-level SELECT grant — only column grants. v1.9's §12 described
`edfl_award_in_progress` as Class B; it carries an `anon` grant, which is harmless for an invoker
function (§12).

---

## 1. The identity model — get this wrong and the UI silently locks people out

Three different UUIDs describe one human being. They are not interchangeable, and confusing them is
not a compile error — it produces a page that renders fine and refuses the right person.

| Value | Source | Meaning |
|---|---|---|
| `session.user.id` / `auth.uid()` | Supabase Auth | the login |
| `team_owners.id` | league table | the owner record |
| `team_owners.team_id` → `teams.id` | league table | the franchise |

**Every `*_by` column holds `team_owners.id`** — never the login. Verified column by column at this
stamp, including the ones with no foreign key:

| Column | Holds |
|---|---|
| `commissioner_actions.performed_by` | `team_owners.id` |
| `trades.proposed_by`, `approved_by`, `reversed_by`; `trade_parties.accepted_by`, `declined_by` | `team_owners.id` |
| `contract_events.created_by` (the **acting** owner, not always an officer), `reversed_by` | `team_owners.id` |
| `contract_restructure_bonuses.created_by`, `roster_moves.created_by`, `team_cash_transactions.created_by` | `team_owners.id` |
| `pending_cuts.designated_by`, `withdrawn_by` · `waiver_placements.created_by` · `waiver_claims.created_by` · `waiver_runs.executed_by` | `team_owners.id` (no FK; null when the system acted) |
| `free_agent_windows.resolved_by`, `player_week_scores.synced_by`, `team_week_scores.synced_by`, `player_week_projections.synced_by` | `team_owners.id` (no FK; null for a scheduled run) |
| `owner_profiles.owner_id`, `updated_by` · `sleeper_sync_runs.initiated_by`, `applied_by` · `sleeper_sync_conflicts.resolved_by` · `injury_sync_runs.run_by` · `edfl_season_results.published_by` · `player_value_name_map.resolved_by` | `team_owners.id` |
| `trade_blocks.placed_by` · `watchlist_markers.owner_id` · `insider_submissions.submitted_by` · `draft_prospect_classes.opened_by`, `rolled_by` · `goodell_memos.drafted_by` | `team_owners.id` (all FK-enforced) |

*`goodell_memos.drafted_by` was the one exception and is no longer: it defaulted to `auth.uid()`
until `goodell_08` dropped the default and added the key. **The invariant is now enforced by a
foreign key on every `*_by` column that has one**, so the failure mode this section warns about can
no longer be introduced silently on these five.*

**Team columns hold `teams.id`:** `trades.proposing_team_id`, `trade_parties.team_id`,
`free_agent_offers.team_id`, `free_agent_windows.opened_by_team_id` (sealed, §2) and
`incumbent_team_id`, `waiver_placements.waived_by_team_id` and `awarded_to_team_id`,
`waiver_claims.team_id`, `taxi_active_locks.team_id`, `compliance_violations.team_id`,
`team_cash_transactions.team_id`.

Never compare a `*_by` column against `session.user.id`. They are different UUIDs and such a
comparison can never be true.

`team_owners` RLS returns **only the viewer's own row** (officers see all ten). A client-side lookup
of "who owns team X" returns **nothing** for an ordinary owner. The supported read for another
owner's contact detail is `owner_directory()`, which applies the per-field `show_*` toggles — never
read `owner_profiles` directly from the client.

### Four permission shapes

Read from each function's body at this stamp (`require_commissioner()`, `require_commissioner_or_co()`,
or an `auth.uid()` owner test):

| Shape | Functions | Rule |
|---|---|---|
| **Any signed-in owner** | `propose_trade`, `submit_trade`, `update_trade_draft`, `discard_trade_draft`, `accept_trade`, `decline_trade`, `submit_bid`, `withdraw_bid`, `upsert_bid_delegation`, `arm_bid_delegations`, `cancel_bid_delegation`, `submit_fa_offer`, `submit_waiver_claim`, `withdraw_waiver_claim`, `reorder_waiver_claims`, `edfl_sync_week_scores`, `edfl_sync_week_projections` | the caller acts for **his own team** |
| **Owner-or-officer** | `restructure_contract`, `cut_player`, `withdraw_pending_cut`, `set_roster_status`, `exercise_fifth_year_option`, `decline_fifth_year_option`, `save_owner_profile` | an owner on **his own roster**; an officer on **any** |
| **Officer** (commissioner or co-commissioner) | `execute_trade`, `reverse_trade`, `reverse_cut`, `reverse_restructure`, `reverse_fifth_year_option`, `publish_edfl_season_results`, `resolve_fa_window`, `preview_fa_window` (after close only), `advance_league_year`, `reverse_league_year_rollover`, `evaluate_auction_tier`, `verify_auction_tier`, `pass_over_winner`, `set_tier_value_snapshot`, `commissioner_delete_bid`, `commissioner_delete_contract`, `commissioner_owner_activity`, `officer_action_items`, `edfl_practice_squad_convertibility`, the `sleeper_sync_*` family | either officer |
| **Commissioner only** | `veto_trade`, `set_co_commissioner`, `publish_player_value_snapshot`, `map_chart_name`, `calendar_week_save`, `calendar_weeks_generate`, `calendar_event_save`, `calendar_event_delete`, `calendar_season_copy_forward` | the commissioner alone |

`withdraw_fa_offer()` refuses every caller (TM 5.14(d)); it is kept so an old client gets a rule
sentence rather than a missing-function error.

The database distinguishes a **permission** refusal from an **eligibility** refusal with different
messages, and the UI must too: a permission refusal means the row should not be offered at all; an
eligibility refusal is informative and should be shown with its reason. `can_restructure()` and
`fifth_year_option_status()` return the two separately so the client never has to guess.

---

## 2. Security posture — where the real gate is

The anon key ships in the browser bundle. Anyone who opens devtools can call PostgREST directly as
`anon` or `authenticated`. **An app-layer check protects nothing.** The gate must be in the database.

**All 84 tables have RLS enabled** — zero exceptions. Most carry a single SELECT policy and
**no write policy at all**, which is deliberate default-deny: writes go through SECURITY DEFINER
functions, never through PostgREST. The only write policies are `owner_profiles_update` and the
`bid_player_hides` insert/delete pair (§8). Supabase's default privileges grant `anon` and
`authenticated` INSERT/UPDATE/DELETE on every new table (§12); RLS is what refuses them.

**Thirteen tables have RLS on and zero policies**, so neither `anon` nor `authenticated` can read
them at all: `discord_broadcasts`, `mort_kinds` and `insider_broadcasts` — three bot ledgers whose
only readers are their own definer functions — plus the six migration backups (`dedupe_contracts_backup`, `dedupe_plan`, `dedupe_players_backup`, `dedupe_stats_backup`, `player_game_stats_snapshot_20260730`, `players_snapshot_20260730` — never read them) and
`crosswalk_refresh_runs`, `nfl_schedule_refresh_runs`, `officer_action_item_state` and `player_id_crosswalk`, which only the service role reads.

### The sealed groups — nine, and none has a commissioner read while it is live

| Group | Sealed from | Mechanism |
|---|---|---|
| `bid_player_hides` | everyone but the owning team | RLS, own team only — a hide reveals bidding intent |
| `bids` / `bid_years` / `bid_option_bonuses` while a tier is open | everyone but the bidding team | RLS: own team; officers only once `closes_at` has passed; everyone once the tier is verified (winner, lost, passed_over) |
| `bid_delegations`, `bid_delegation_settings` (the Auto-Bid slate) | everyone but the owning team | RLS, own team only |
| `trades` / `trade_parties` / `trade_assets` in `draft` | everyone but the proposer | `can_view_trade()` |
| **`free_agent_offers` / `_offer_years` / `_offer_option_bonuses`** | everyone, the commissioner included, until the window resolves | RLS "own team or resolved"; `free_agent_offer_ppv` is `security_invoker` so the same policy applies through it |
| **`waiver_claims`** | everyone, the commissioner included, until the run executes | RLS "own team or executed run" |
| **`free_agent_windows.opened_by_team_id`** | everyone | no column grant to `anon` or `authenticated`; the board shows the opener only once the window is resolved or void |
| **`watchlist_markers` at the private tier** | everyone but the owning team | RLS: own team, **or** a `league` marker, **or** a `shared` marker whose `shared_with_team_id` still holds the player. No commissioner clause |
| **`insider_submissions`** | everyone but the submitting team, until Dianna publishes it | RLS: own team only. The published content reaches the league through definer views, never through the table |

**SR-31 named the watchlist before it existed** — *"the planned private watchlist would be a fifth
and needs the same restraint"* — and the build held: `watchlist_markers` has no commissioner clause,
and its own table comment says so. Never add one to any of these (SR-31).

**One group is sealed by role as well as by policy.** The `dianna` role holds SELECT on thirteen
relations, re-read from `relacl` at this stamp: six tables — `trade_blocks`, `draft_prospects`,
`draft_prospect_classes`, and `contracts`, `players`, `teams`, which its invoker views need — and
seven views — `dianna_trade_block` and `dianna_prospects`, the two written for it, plus
`draft_prospect_board`, `trade_block_status`, `insider_feed`, `insider_live` and `morts_thoughts`.
Its own RLS policies are three, on the first three tables; on `contracts`, `players` and `teams` it
reads through the `public read` policies like everyone else. (v2.2 said "exactly three relations";
that was the policy count, not the grant surface.) It is granted **nothing** watchlist-shaped and
nothing aggregate over one (WL-10). A future market feature that wants a
demand statistic must not reach the bot: the aggregate read is Phase C of the spec and is
deliberately the last thing built. `free_agent_window_board` exposes
`is_contested` as a **boolean** — the interest count never leaves the database. **No MCP query reads
a sealed table while its window or run is open (SR-31), and no public log names one, even as a count
(SR-54).** This cut read no sealed table's rows; their row counts in §5 say so.

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

Since September 3, reversing rule book 6.1(g). `bids` RLS admits any reader to a `winner` / `lost` /
`passed_over` bid on a tier with `verified_at` set; `bid_years` and `bid_option_bonuses` inherit
through their EXISTS. `withdrawn` is in neither list, deliberately. **Losing bidders are named.** Any
surviving "Anonymous" string is a display defect, not a privacy control.

### Definer views over sealed tables

A definer view bypasses the RLS of every table it reads, so each one over a sealed table is an
exposure unless its columns are safe. At this stamp: `free_agent_window_board` (the contested
boolean only — by design), `poachable_players` (the live window's id, no offer content;
`authenticated` only), and three auction views — `auction_interest`, `auction_tier_results` and
`auction_tier_result_years`. The auction is dormant, so none of the three exposes anything today.

**`auction_interest` returns the exact number of pending bids per player, to `anon`.** Rule 6.1
allows "a rough interest level", and the commissioner's ruling of August 13 made that a band —
`app/bids/TierPlayerList.js` shows *No bids yet / Some interest / Heating up / Highly competitive*
and deliberately never the count. The exact figure is still one PostgREST call away for anyone
holding the public key. Moving the banding into the view (and the page onto it) is the fix; it
belongs in the review of all three auction views that the To-Do list schedules before the next
auction. The `free_agent_offer_ppv` leak (§0) is the precedent.

---

## 3. Views — 57 of them

Read money from views. **Never compute money in JavaScript.** Every dollar in these views already
reflects rule 1.9 rounding, taxi treatment (3.3(c)), June 1 splits, void acceleration and in-season
pro-ration, which JS subtraction gets wrong. The team Overview page once rebuilt cap totals
client-side from `contract_events` and was wrong by $1,431 on one team.

**A function call inside a view is checked against the caller, not the view owner** — even in a
definer view. That is why some views are `authenticated`-only whatever their own grant says (§12).

### `security_invoker = true` — 31; these inherit RLS

`auction_tier_flag_recommendations`, `auction_tier_team_flags`, `bid_total_ppv`, `calendar_admin_events`, `calendar_admin_weeks`, `draft_prospect_board`, `free_agent_offer_ppv`, `goodell_memo_queue`, `goodell_upcoming`, `league_active_roster_acquisitions`, `league_calendar`, `league_fund`, `league_injury_report`, `league_office_feed`, `league_transaction_log`, `player_card_header`, `player_career_earnings`, `player_contract_history`, `player_contract_year_breakdown`, `player_transaction_feed`, `player_value_history`, `player_value_removals`, `published_value_snapshots`, `roster_injury_status`, `taxi_eligibility_status`, `team_cash_window_progress`, `team_inseason_compliance`, `team_manual_bids`, `tier_reference_values`, `trade_block_status`, `watchlist_markers_effective`

### `security_invoker = false` — 26; these bypass RLS for whoever reads them

`auction_interest`, `auction_tier_result_years`, `auction_tier_results`, `contract_year_computed`, `cut_history`, `dianna_prospects`, `dianna_trade_block`, `draft_pick_board`, `edfl_game_fantasy_points`, `edfl_player_season_stats`, `edfl_pro_bowl`, `free_agent_window_board`, `insider_feed`, `insider_live`, `insider_subject_names`, `league_fines`, `league_scoreboard`, `league_standings`, `league_week_status`, `morts_thoughts`, `poachable_players`, `team_cap_by_season`, `team_cap_compliance`, `team_cap_summary`, `team_cash_available`, `team_roster_by_season`

`league_week_status` is the one definer view added this cut. It reads `league_weeks`, `nfl_games`
and `team_week_scores`, all of which carry a `true` policy and an `anon` grant, so it exposes
nothing; `roster_injury_status` is `security_invoker` like the roster views it sits beside.

**`watchlist_markers_effective` is `security_invoker` on purpose and must stay that way.** It is the
read over a sealed table (§2); as a definer view it would hand every private marker to every reader.
The same goes for `trade_block_status`, which is not sealed but is the block's only supported read.
The three `insider_*` views and `morts_thoughts` are definer views **over** a sealed table, and are
safe only because of what they select: published submissions and, for `insider_live`, an `is_mine`
flag computed against the caller. Do not add a column to any of them without re-reading §2.

A definer view is safe only if every column it exposes is safe for every role granted it (§2).

### Every view, with its columns

Full SQL is not reproduced (about 124,000 characters across 57 views, `pg_get_viewdef` pretty-printed).
Ask for a definition in the chat if the arithmetic matters.

| View | Inv | anon | auth | Columns |
|---|---|---|---|---|
| `auction_interest` | no | yes | yes | tier_id, player_id, bid_count |
| `auction_tier_flag_recommendations` | yes | **no** | yes | tier_id, team_id, bid_id, player_id, submitted_at, season_year, recommend_order, bid_cap, bid_cash, total_wins, incoming_cap_all_wins, incoming_cash_all_wins, current_cap_used, cap_limit_125, cash_available, cap_after_this_step, cash_needed_after_this_step, clears_at_this_step |
| `auction_tier_result_years` | no | yes | yes | bid_id, tier_id, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, roster_bonus, is_void_year, option_bonus, dead_cap_if_cut |
| `auction_tier_results` | no | yes | yes | bid_id, tier_id, player_id, player_name, position, status, is_winner, team_id, team_name, total_ppv, total_years, void_years, signing_bonus_total, start_year, option_bonus_total, option_bonuses |
| `auction_tier_team_flags` | yes | **no** | yes | tier_id, team_id, season_year, incoming_cap, incoming_cash, current_cap_used, cap_limit_125, cash_available, over_cap, over_cash |
| `bid_total_ppv` | yes | yes | yes | bid_id, tier_id, player_id, team_id, submitted_at, status, total_ppv |
| `calendar_admin_events` | yes | **no** | yes | id, season_year, title, detail, category, rule_ref, is_provisional, time_is_exact, sort_hint, starts_local, ends_local, is_past |
| `calendar_admin_weeks` | yes | **no** | yes | season_year, week_number, first_game_label, is_provisional, counts_toward_taxi_weeks, charge_local, first_game_local, wire_local, compliance_local, last_game_local, locked |
| `contract_year_computed` | no | yes | yes | id, contract_id, player_id, team_id, contract_status, contract_year_number, league_season_year, prorated_signing_bonus, guaranteed_salary, non_guaranteed_salary, option_bonus, roster_bonus, ppv, cap_charge, cash_value, dead_cap_if_cut, is_void_year, roster_bonus_converted, contract_last_real_season, is_void_acceleration_season |
| `cut_history` | no | yes | yes | event_id, contract_id, event_type, event_season_year, from_team_id, team_name, player_id, player_name, position, contract_type, contract_status, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year, weeks_charged, june1_split, june1_designated, notes, created_at, created_by_email, reversed_at, reversed_by_email, reversal_reason, is_active_cut, reversal_hours_left, is_reversible |
| `dianna_prospects` | no | **no** | **no** | prospect_id, class_year, full_name, position, college, espn_grade, espn_overall_rank, espn_position_rank, nfl_team, draft_round, draft_overall, matched_player_id, sleeper_name |
| `dianna_trade_block` | no | **no** | **no** | block_id, contract_id, player_id, team_id, team_name, team_abbrev, full_name, position, nfl_team, contract_type, roster_status, source, checked_at, window_ends_at, held_up, days_left |
| `draft_pick_board` | no | **no** | yes | pick_id, season_year, round, pick_number, overall_pick, pick_label, draft_completed, order_set, original_team_id, original_team_name, current_team_id, current_team_name, pick_changed_hands, player_id, player_name, player_position, player_current_team_id, player_current_team_name, player_status, history, sort_key |
| `draft_prospect_board` | yes | **no** | yes | prospect_id, class_year, espn_athlete_id, full_name, position, college, height, weight, espn_grade, espn_overall_rank, espn_position_rank, nfl_team, draft_round, draft_overall, matched_player_id, matched_at, refreshed_at, sleeper_name, sleeper_nfl_team |
| `edfl_game_fantasy_points` | no | yes | yes | player_id, game_id, season_year, week, season_type, position, completions, attempts, passing_yards, passing_tds, passing_first_downs, passing_2pt_conversions, interceptions_thrown, times_sacked, carries, rushing_yards, rushing_tds, rushing_first_downs, rushing_2pt_conversions, targets, receptions, receiving_yards, receiving_tds, receiving_first_downs, receiving_2pt_conversions, fumbles, fumbles_lost, kick_returns, kick_return_yards, kick_return_tds, punt_returns, punt_return_yards, punt_return_tds, fg_made_0_19, fg_made_20_29, fg_made_30_39, fg_made_40_49, fg_made_50_59, fg_made_60_plus, fg_missed_0_19, fg_missed_20_29, fg_missed_30_39, fg_missed_40_plus, pat_made, pat_missed, fantasy_points |
| `edfl_player_season_stats` | no | yes | yes | player_id, full_name, last_name, position, season_year, games, fantasy_points, fppg, pass_attempts, completions, passing_yards, passing_tds, interceptions, rush_attempts, rushing_yards, ypc, rushing_tds, targets, receptions, receiving_yards, receiving_tds, kick_returns, kick_return_yards, kick_return_tds, punt_returns, punt_return_yards, punt_return_tds, xp_att, xp_made, fg_att, fg_made |
| `edfl_pro_bowl` | no | yes | yes | season_year, player_id, full_name, position, games, fantasy_points, fppg, composite, slot, slot_rank |
| `free_agent_offer_ppv` | yes | **no** | yes | offer_id, window_id, player_id, team_id, submitted_at, status, total_ppv |
| `free_agent_window_board` | no | yes | yes | window_id, player_id, player_name, position, season_year, opened_at, closes_at, status, opened_by, is_contested, time_remaining, window_kind, incumbent_team_id, incumbent_team_name, retain_bar_ppv, outcome |
| `goodell_memo_queue` | yes | **no** | yes | memo_id, body, publish_after, created_at, drafted_by, posted, posted_at |
| `goodell_upcoming` | yes | **no** | yes | broadcast_key, kind, subject_id, title, starts_at, due_at, already_posted |
| `insider_feed` | no | **no** | yes | submission_id, posted_at, strength, content, veracity, direction, subject_kind, subject_name, attributed_team_name, about_team_name, withdrawn_since |
| `insider_live` | no | **no** | yes | submission_id, subject_kind, subject_id, subject_name, subject_position, subject_detail, holder_team_id, holder_team_name, holder_team_abbrev, prospect_matched_player_id, direction, veracity, rating, attributed_team_id, attributed_team_name, attributed_team_abbrev, about_team_id, about_team_name, about_team_abbrev, third_party, willing_to_give, seeking, submitted_at, publish_after, published, days_left, sources, is_mine, placed_block |
| `insider_subject_names` | no | **no** | **no** | submission_id, subject_name, subject_position, subject_detail, holder_team_id, prospect_matched_player_id, subject_id |
| `league_active_roster_acquisitions` | yes | **no** | yes | contract_id, team_id, team_name, player_id, player_name, player_position, contract_type, roster_status, start_year, total_years, void_years, first_season_week, acquired_at, acquired_via, acquired_tier_name, last_move_at, last_move_from, last_move_to, moves_count |
| `league_calendar` | yes | yes | yes | entry_id, season_year, starts_at, ends_at, time_is_exact, title, detail, category, rule_ref, is_provisional, sort_hint, source, week_number, local_date, end_local_date, month_key, month_label, day_label, time_label, end_day_label, is_today_or_active, is_past |
| `league_fines` | no | **no** | yes | id, season_year, created_at, team_id, team_name, fine_amount, fine_kind, source_id, note |
| `league_fund` | yes | **no** | yes | season_year, fines, balance |
| `league_injury_report` | yes | yes | yes | player_id, full_name, position, nfl_team, nfl_roster_status, injury_status, injury_body_part, injury_notes, injury_start_date, prev_injury_status, injury_changed_at, edfl_team_id, edfl_team, edfl_roster_status, is_rostered, current_season_year, change_flag |
| `league_office_feed` | yes | **no** | yes | broadcast_key, kind, subject_id, posted_at, content |
| `league_scoreboard` | no | yes | yes | season_year, week_number, week_starts_at, week_is_provisional, matchup_id, home_team_id, home_team, home_owner, home_points, away_team_id, away_team, away_owner, away_points, has_scores, winner_team_id, margin, synced_at, week_final_at, week_is_final |
| `league_standings` | no | yes | yes | season_year, team_id, team_name, owner_display_name, division, games, wins, losses, ties, points_for, points_against, win_pct, streak, point_differential, points_per_game, league_rank, division_rank |
| `league_transaction_log` | yes | **no** | yes | log_id, occurred_at, kind, title, description, player_id, player_name, player_position, team_from_id, team_from, team_to_id, team_to, season_year, is_admin_action, detail |
| `league_week_status` | no | yes | yes | season_year, week_number, week_starts_at, week_last_game_at, week_is_provisional, week_final_at, last_synced_at, week_is_final |
| `morts_thoughts` | no | **no** | yes | subject_kind, subject_id, subject_name, subject_position, subject_detail, holder_team_id, holder_team_name, holder_team_abbrev, prospect_matched_player_id, direction, rating, attributed_team_name, attributed_team_abbrev, named_team_abbrevs, any_third_party, sources, freshest_at, days_left, any_mine, is_my_asset, can_propose |
| `player_card_header` | yes | yes | yes | player_id, full_name, position, nfl_team, nfl_status, sleeper_player_id, current_contract_id, current_team_id, current_team, roster_status, current_contract_type, current_contract_start, current_contract_years, current_season_cap, current_season_cash, contracts_held, has_edfl_history, chart_total_ppv, chart_per_year_value, chart_likely_years, chart_value_tier, chart_total_ppv_delta, chart_snapshot_label, chart_snapshot_as_of, injury_status, injury_body_part, injury_flagged, injury_label |
| `player_career_earnings` | yes | **no** | yes | player_id, contracts_held, active_contracts, teams_played_for, first_season, last_season, career_contract_value, career_cap_charged, cash_on_active_contracts, cash_on_ended_contracts, cash_through_current_season, cash_still_owed, dead_cash_charged, dead_cap_charged, teams |
| `player_contract_history` | yes | **no** | yes | contract_id, player_id, team_id, team_name, contract_type, contract_status, roster_status, start_year, total_years, void_years, option_void_years, signing_bonus_total, draft_year, draft_round, draft_pick, extends_contract_id, created_at, current_season_year, is_current, first_season, last_season, seasons_with_money, total_cash, total_cap, current_season_cap, current_season_cash, signed_in_tier, winning_bid_id, ended_by, ended_at, dead_cap_current_year, dead_cap_next_year, dead_cash_current_year, dead_cash_next_year |
| `player_contract_year_breakdown` | yes | **no** | yes | contract_id, player_id, team_id, contract_status, roster_status, contract_year_number, league_season_year, is_void_year, void_reason, cap_signing_proration, cap_gtd_salary, cap_non_gtd_salary, cap_option_proration, cap_roster_bonus, cash_signing_bonus, cash_gtd_salary, cash_non_gtd_salary, cash_option_bonus, cash_roster_bonus, ppv, cap_charge, cash_value, dead_cap_if_cut, roster_bonus_converted, added_by |
| `player_transaction_feed` | yes | **no** | yes | player_id, occurred_at, kind, title, description, team_from_id, team_from, team_to_id, team_to, season_year, is_admin_action, source, source_id, detail |
| `player_value_history` | yes | **no** | yes | id, snapshot_id, snapshot_label, snapshot_as_of, published_at, recency_rank, chart_position, chart_rank, chart_name, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, player_id, match_status, prev_total_ppv, prev_per_year_value, prev_likely_years, total_ppv_delta, likely_years_delta, is_new_this_snapshot |
| `player_value_removals` | yes | **no** | yes | snapshot_id, snapshot_label, chart_position, chart_name, chart_nfl_team, last_total_ppv, player_id |
| `poachable_players` | no | **no** | yes | contract_id, player_id, player_name, position, nfl_team, team_id, team_name, contract_type, bar_ppv, season_cash, live_window_id, on_waivers, pending_cut, poaching_open |
| `published_value_snapshots` | yes | **no** | yes | id, label, as_of_date, published_at, source_note, recency_rank, prev_snapshot_id |
| `roster_injury_status` | yes | yes | yes | contract_id, player_id, team_id, full_name, position, nfl_team, nfl_status, roster_status, contract_type, injury_status, injury_body_part, injury_notes, injury_start_date, injury_flagged, injury_label, ir_ineligible, ir_ineligible_reason |
| `taxi_eligibility_status` | yes | yes | yes | contract_id, player_id, team_id, full_name, contract_type, roster_status, draft_anchor, weeks_used, weeks_max, weeks_left, eligibility_spent, warning, locked, last_demotion_available, locked_at, ps_rule_subject, ps_ineligible_reason |
| `team_cap_by_season` | no | yes | yes | team_id, team_name, league_season_year, fantasy_salary_cap, cap_is_set, cap_is_provisional, active_cap, pre_event_cap, dead_cap, cap_used, cap_space_remaining, min_required_spend, active_cash, pre_event_cash, dead_cash, cash_used |
| `team_cap_compliance` | no | yes | yes | team_id, team_name, league_season_year, cap_used, cap_ceiling, cap_room, over_by, compliant, ceiling_is_base_cap_fallback, cap_is_provisional, enforcement_starts_at, enforcement_active |
| `team_cap_summary` | no | yes | yes | team_id, team_name, league_season_year, fantasy_salary_cap, cap_used, cap_space_remaining, min_required_spend, total_cash_spent |
| `team_cash_available` | no | yes | yes | team_id, season_year, starting_cash, total_adjustments, cash_spent, cash_available |
| `team_cash_window_progress` | yes | **no** | yes | team_id, team_name, window_start_year, window_end_year, window_length, seasons_priced, window_fully_priced, base_cap_total, floor_pct, cash_floor_required, cash_committed, cash_shortfall |
| `team_inseason_compliance` | yes | yes | yes | team_id, team_name, league_season_year, cap_used, cap_ceiling, cap_over_by, cap_is_provisional, cap_row_found, active_count, ps_count, ps_non_rookie_count, ir_count, qb_count, rb_count, wr_count, te_count, k_count, active_roster_size, taxi_squad_size, taxi_non_rookie_slots, ir_slots, qb_max, k_max, roster_deadline_at, cap_block_at, roster_enforcement_active, cap_enforcement_active, compliant, reasons, ir_no_designation_count, ir_no_designation_names |
| `team_manual_bids` | yes | **no** | yes | bid_id, tier_id, team_id, player_id, submitted_at |
| `trade_block_status` | yes | **no** | yes | block_id, contract_id, player_id, team_id, team_name, team_abbrev, full_name, position, nfl_team, contract_type, roster_status, contract_status, placed_by, source, checked_at, window_ends_at, falloff_at, is_live, held_up, days_left, ended_reason |
| `watchlist_markers_effective` | yes | **no** | yes | marker_id, player_id, owner_id, team_id, visibility, effective_visibility, shared_with_team_id, created_at, updated_at, full_name, position, nfl_team, injury_status, holder_team_id, holder_team_name, holder_team_abbrev, holder_contract_id, holder_contract_type, on_block |
| `team_roster_by_season` | no | yes | yes | team_id, team_name, league_season_year, active_count, taxi_count, ir_count, contracts_covering_season |
| `tier_reference_values` | yes | **no** | yes | tier_id, tier_number, snapshot_id, snapshot_label, snapshot_as_of, player_id, chart_name, chart_position, chart_nfl_team, per_year_value, likely_years, total_ppv, value_tier, notes, length_multipliers |

### Key view semantics

| View | Filter on | Note |
|---|---|---|
| `team_cap_by_season` | `team_id`, `league_season_year` | **Use this for team totals.** Every season a contract or event touches; NULLs where no cap row exists. `cap_is_set` / `cap_is_provisional` say whether the season's cap is official |
| `team_cap_summary` | `team_id`, `league_season_year` | **One row per team per `league_cap_settings` row** — it `CROSS JOIN`s that table (two rows: 2026, 2027). An unfiltered read returns 20 rows for 10 teams and nothing for 2028 onward. Use `team_cap_by_season` for anything spanning more than those two seasons (SR-24) |
| `team_cap_compliance` | `team_id` | The ceiling test, read exactly the way `check_cap_ceiling()` reads it. `ceiling_is_base_cap_fallback` is true while `league_cap_settings.cap_ceiling` is NULL |
| `team_inseason_compliance` | `team_id` | Current season only. `compliant` is the one flag the banner colours on; `reasons` is the owner-readable list. Reads `team_cap_by_season`, never `team_cap_summary`. Since `injflag_04` an IR slot holding a player with no qualifying designation (§0d) is a reason and a non-compliance, **flagged, never blocked**; `ir_no_designation_count` / `_names` carry it, and `ps_non_rookie_count` is keyed on rookie eligibility, not `contract_type` |
| `team_cash_available` | `team_id`, `season_year` | The cash side |
| `team_roster_by_season` | `team_id`, season | **A player drops off on waive, not on the run** (`edfl_on_waivers`) |
| `contract_year_computed` | `contract_id`, `league_season_year` | `cap_charge`, `cash_value`, `ppv`, `dead_cap_if_cut`. Folds in restructure bonuses, void acceleration and in-season pro-ration; `cap_charge` omits non-guaranteed salary while the contract is on the practice squad (3.3(c)); `cash_value` never does. IR carries no relief (3.4(c)) |
| `player_contract_year_breakdown` | `player_id` | Per-season cap and cash **components**; `added_by` says why a season exists |
| `player_card_header` | **`player_id` — always** | Over three thousand players behind it. `injury_flagged` / `injury_label` are the red cross and its tooltip, from the one predicate (§0d); `injury_status` is still raw and may say `Questionable`, which is not a flag |
| `player_value_history` | `player_id`, order by `recency_rank` | `recency_rank = 1` is the most recent snapshot |
| `league_scoreboard` / `league_standings` | `season_year`, `week_number` | Built on `team_week_scores`. `has_scores` is false for an unplayed week (a 0–0 pairing is not a tie). Both read **`league_week_status`** for `week_final_at` and `week_is_final`, and `league_standings` **counts only final weeks**: a record does not move until the week's last kickoff is four hours past and a sync has run since. Stat corrections can still move a final score |
| `league_week_status` | `season_year`, `week_number` | The single definition of a final week (§0a). `week_final_at` = last regular-season kickoff in the week + 4 hours, falling back to `league_weeks.last_game_at`; `last_synced_at` is the newest `team_week_scores.synced_at` for the week; `week_is_final` needs both. One row per `league_weeks` row, so an unplayed week is present and false |
| `roster_injury_status` | `team_id` (one read per team) or `contract_id` | One row per active contract. **Render `injury_label` and `ir_ineligible_reason` verbatim**; `injury_flagged` is the red cross and is true whatever the EDFL roster status — a hurt man on the active roster is the case it is most useful for. `ir_ineligible` is true only for a player the owner has placed on IR without a qualifying designation |
| `free_agent_window_board` | `season_year` | `is_contested` is a boolean by FA-D — there is no count. `opened_by` is null until the window is resolved or void. `window_kind`, `incumbent_team_id`, `incumbent_team_name`, `retain_bar_ppv`, `outcome` appended by poaching. **`outcome` (the rule 5.17 result) is not `result`** |
| `poachable_players` | `team_id` | One row per active practice squad contract: `bar_ppv` (rookies only — the sum of the contract's PPV), `season_cash` (rule 5.6's definition), `live_window_id`, `on_waivers`, `pending_cut`, and `poaching_open` from `edfl_poach_window_open()`. The page draws the practice squad section only while `poaching_open` is true |
| `taxi_eligibility_status` | `player_id` or `team_id` | **Render `warning` verbatim; it is NULL when there is nothing to say.** `locked` is the 3.3(i) lock; `last_demotion_available` (three weeks used, not yet locked) is the one state where the owner still has a choice. `eligibility_spent` is kept for old readers and now means *locked*. `ps_rule_subject` says whether 3.3(b)(i) applies to the contract at all (`edfl_taxi_rule_subject()`); when it is false, `ps_ineligible_reason` says why, the weeks-based warnings are suppressed, and only the locked sentence can still appear. 47 active rookie contracts (the 2023 and 2024 classes) are false at this stamp |
| `league_fines` / `league_fund` | `season_year` | `league_fines` is a definer view (every signed-in owner sees every team's fines; `anon` nothing), `fine_kind` is `compliance` or `poach`. In `league_fund`, **`fines` is a COUNT and `balance` is the money** |
| `league_transaction_log` | any filter — always one | **Filters on an allowlist**: a kind missing from it is invisible, not mislabelled. `league_transaction_log_unmapped_kinds()` keeps its own list; the two and the app's label map move together. `signed_poach` is excluded from the league log by design. `occurred_at` is not unique — page on `log_id` |
| `player_transaction_feed` | `player_id` | Security invoker, so it differs by viewer: a withdrawn bid is visible only to its team |
| `league_calendar` | `season_year` | `league_calendar_events` ∪ `league_weeks`, every label pre-rendered in Eastern time. Order by `starts_at`, `sort_hint`, `title` |
| `calendar_admin_weeks` / `calendar_admin_events` | `season_year` | The Calendar Loader's reads: every instant as Eastern wall-clock text for a `datetime-local` input; `locked` / `is_past` |
| `league_active_roster_acquisitions` | `team_id` | One row per active contract with `acquired_at`, `acquired_via` (`trade`, `auction`, `fifth_year_option`, `extension`, `rookie`, `free_agency_practice_squad`, `free_agency`, `signing`), `acquired_tier_name` and the last roster move. Security invoker, `authenticated` only; the officers' Cuts page reads it with an explicit `.range()` |
| `draft_pick_board` | `season_year`, or `original_team_id` / `current_team_id` | One row per pick, every season in `draft_picks`. Order by `sort_key` (round, pick, then original owner alphabetically where the order is not set). `authenticated` only (§12) |
| `edfl_pro_bowl` | `season_year` | 48 selections per published season; feeds Fifth Year Option tiers |
| `trade_block_status` | `team_id` or `player_id` | **`is_live` is computed, not stored**: contract still `active` AND NOT `edfl_on_waivers()` AND `trade_block_falloff_at()` is NULL. `held_up` means live and past 14 days — the owner has not re-checked. `ended_reason` says which of the three ended it |
| `watchlist_markers_effective` | `player_id` or `team_id` | **Read `effective_visibility`, never `visibility`.** WL-5: a `shared` marker reverts to private when the player changes team, and that is computed by comparing `shared_with_team_id` to the current holder — the stored row is never rewritten |
| `insider_live` / `morts_thoughts` | neither — they are already scoped | `insider_live` is one row per live submission with `is_mine` computed for the caller; `morts_thoughts` is one row per (asset, direction) rated Maybe / Likely / Confirmed with a source count. **Neither ever names a leaker** except at `on_record` |
| `league_office_feed` | order by `posted_at` | What Robo has said, content stored verbatim as Discord received it. `goodell_upcoming` is the other half — what he is *about* to say, 30 days out |

---

## 4. Functions — 228 callable, 32 trigger

Signature (with defaults), return type, volatility, `SECURITY DEFINER`, and who holds EXECUTE, read
from `pg_proc` at the stamp. **Read §12 before changing any grant** — a revoke took the Cap Sheet down
once. `SD` = SECURITY DEFINER. Grants: `anon+auth`; `auth` = `authenticated` only; **`service` = no
`anon` and no `authenticated` grant.** Gate: `owner` (an `auth.uid()` owner test), `officer`
(`require_commissioner_or_co()`), `commish` (`require_commissioner()`), `—` (none in the body; a
function marked `—` is either read-only, reached only from another function, or service-only).

**`service` does not mean unreachable.** `service_role` holds EXECUTE on every function in this
schema, so a Server Action using `adminClient()` can call any of them. What `service` guarantees is
that a browser-originated call cannot. **54** callable functions are `service`: the cron
entry points, the settlement internals, the backup helpers, `log_commissioner_action`, the
three writers `grants_05` closed, and seventeen of the bot and market functions (every publisher
and dispatcher). v2.2's "37" was the pre-bot figure; none of this cut's five functions is `service`.

The `edfl_*_in_progress()` functions are **transaction-local flags** (`current_setting('edfl.…')`),
set by one function so a trigger further down can recognise it:

| Flag function | Set on by | Read by |
|---|---|---|
| `edfl_transfer_in_progress` | `execute_trade`, `reverse_trade`, `waiver_settle_claim` | `check_cap_ceiling`, `check_contract_30pct_rule`, `check_contract_minimum_salary`, `check_deion_rule`, `check_first_season_week_rules`, `check_option_bonus_not_year1` — a transferred contract is not re-underwritten (7.1(i)) |
| `edfl_oblige_in_progress` | `edfl_fa_award_window`, `waiver_settle_claim` | `check_taxi_slot_limits` (award-and-oblige, 3.6(e)) |
| `edfl_poach_award_in_progress` | `edfl_fa_award_window` | `check_poach_freeze`, `compute_trade_charges` |
| `edfl_self_claim_in_progress` | `waiver_settle_claim` (claimant = waiving team) | `compute_trade_charges` |
| `edfl_restructure_in_progress` | `restructure_contract`, `reverse_restructure` | `check_contract_30pct_rule` |
| `edfl_taxi_revert_in_progress` (`edfl.taxi_revert`) | `taxi_revert_due` | `check_taxi_slot_limits` |
| `edfl_award_in_progress` | **nothing, since `poach_04`** | `check_cap_ceiling` — a dead bypass. DT-5 made the ceiling a gate on awards; do not re-arm it |

A flag read by a **deferred** constraint trigger must stay set until COMMIT (§7).

`public` also holds the `btree_gist` extension's own functions; they are not counted here and are
not yours. **The pattern is wider than earlier cuts said.** `gbt_*` and `gbtreekey*` are the bulk,
but twelve more carry none of those prefixes — `cash_dist`, `date_dist`, `float4_dist`,
`float8_dist`, `int2_dist`, `int4_dist`, `int8_dist`, `interval_dist`, `oid_dist`, `time_dist`,
`ts_dist`, `tstz_dist`. **Filter on `proname NOT LIKE 'gbt%' AND proname NOT LIKE '%\_dist'`**, or
the count comes out twelve high. At this stamp: 448 functions in `public`, **260 EDFL** and
**188 btree_gist**.

### Identity, permission and plumbing

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `is_commissioner(check_user_id uuid)` | `boolean` | STB | yes | anon+auth | — | Inside 3 RLS policies (the value-chart tables) — Class A (§12) |
| `is_commissioner_or_co(check_user_id uuid)` | `boolean` | STB | yes | anon+auth | — | Inside 7 RLS policies on 6 tables — Class A (§12) |
| `require_commissioner()` | `uuid` | VOL | yes | auth | — | Raises unless the caller is the commissioner; returns his `team_owners.id` |
| `require_commissioner_or_co()` | `uuid` | VOL | yes | auth | — | Raises unless the caller is an officer; returns the `team_owners.id` |
| `can_view_trade(p_trade_id uuid)` | `boolean` | STB | yes | auth | — | RLS helper for the three trade tables (§2) |
| `set_co_commissioner(p_team_owner_id uuid, p_enabled boolean, p_reason text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | commish | Grant or revoke; every change logged publicly |
| `commissioner_owner_activity()` | `TABLE(team_name text, email text, has_account boolean, last_sign_in_at timestamp with time zone, last_seen_at timestamp with time zone, open_session_count bigint, signed_in_since_tier_opened boolean, nudge_suggested boolean)` | VOL | yes | auth | officer | Owner activity report (officer, not commissioner-only) |
| `log_commissioner_action(p_owner_id uuid, p_action_type text, p_target_type text, p_target_id uuid, p_summary text, p_reason text, p_snapshot jsonb)` | `uuid` | VOL | yes | service | — | The only writer of `commissioner_actions` |
| `search_players(p_query text, p_limit integer DEFAULT 20)` | `TABLE(player_id uuid, full_name text, "position" text, nfl_team text, edfl_team_id uuid, edfl_team text, roster_status text, is_free_agent boolean, last_edfl_team text, injury_status text, has_edfl_history boolean)` | STB | — | auth | — | Player search for signed-in owners |
| `edfl_local_clock(p_time_zone text)` | `TABLE(local_time_now text, local_date_now text, utc_offset_minutes integer)` | STB | — | auth | — | Server-rendered clock for an IANA zone; NULLs for an unknown zone |
| `edfl_time_zone_options()` | `TABLE(name text, abbrev text, utc_offset_minutes integer, label text)` | STB | — | auth | — | Time zone picker, from `pg_timezone_names` |
| `edfl_et(p_local text)` | `timestamp with time zone` | IMM | — | auth | — | Eastern wall-clock text → timestamptz |
| `edfl_et_local(p_ts timestamp with time zone)` | `text` | IMM | — | auth | — | timestamptz → Eastern wall-clock text for `datetime-local` |
| `edfl_money_text(p_amount numeric)` | `text` | IMM | — | anon+auth | — | Mirrors `formatExactMoney()`; never rounds. Class A (`team_inseason_compliance`) |
| `try_uuid(p text)` | `uuid` | IMM | — | anon+auth | — | NULL instead of an error for a bad uuid; used by `player_transaction_feed` |
| `rls_auto_enable()` | `event_trigger` | VOL | yes | auth | — | Supabase event-trigger function; not callable directly |

### Officer action banner and Calendar Loader

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `officer_action_items()` | `TABLE(item_key text, severity text, title text, detail text, href text, due_at timestamp with time zone, since timestamp with time zone)` | VOL | yes | auth | officer | **The home banner's only read.** Refreshes the state table, returns items urgent → attention → info; `title`/`detail` are verbatim text |
| `edfl_officer_action_items_compute()` | `TABLE(item_key text, severity text, title text, detail text, href text, due_at timestamp with time zone)` | STB | yes | service | — | **New item kinds are added here** |
| `edfl_officer_action_items_refresh()` | `integer` | VOL | yes | service | — | Cron; maintains `officer_action_item_state` |
| `calendar_week_save(p_season_year integer, p_week_number integer, p_first_game_local text, p_first_game_label text, p_charge_local text, p_wire_local text, p_compliance_local text, p_last_game_local text, p_is_provisional boolean, p_counts_toward_taxi_weeks boolean DEFAULT true)` | `jsonb` | VOL | yes | auth | commish | Upserts one week; refuses out-of-order or overlapping instants and any time change to a week whose pay instant has passed |
| `calendar_weeks_generate(p_season_year integer, p_week1_charge_date date, p_weeks integer DEFAULT 14)` | `jsonb` | VOL | yes | auth | commish | Drafts 14 provisional weeks when a season has none; the date must be a Tuesday |
| `calendar_event_save(p_id uuid, p_season_year integer, p_starts_local text, p_ends_local text, p_time_is_exact boolean, p_title text, p_detail text, p_category text, p_rule_ref text, p_is_provisional boolean, p_sort_hint integer DEFAULT 0)` | `jsonb` | VOL | yes | auth | commish | NULL id inserts; refuses re-keying an entry something reads |
| `calendar_event_delete(p_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth | commish | Reason ≥ 10 characters; refuses an entry something reads or one already past |
| `calendar_season_copy_forward(p_from_season integer)` | `jsonb` | VOL | yes | auth | commish | Copies every entry one year later, all provisional, when the next season has none |
| `edfl_rule_ref_consumers(p_rule_ref text)` | `text[]` | STB | yes | auth | — | Who reads a `rule_ref`: `db:` functions plus a hand-kept app list (§10) |

### Trades

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `propose_trade(p_assets jsonb, p_note text DEFAULT NULL::text, p_as_draft boolean DEFAULT false)` | `jsonb` | VOL | yes | auth | owner | Creates a draft or proposes; the proposer only sees a draft |
| `update_trade_draft(p_trade_id uuid, p_assets jsonb, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner |  |
| `discard_trade_draft(p_trade_id uuid)` | `jsonb` | VOL | yes | auth | owner |  |
| `submit_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth | owner |  |
| `accept_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth | owner |  |
| `decline_trade(p_trade_id uuid, p_reason text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner |  |
| `execute_trade(p_trade_id uuid)` | `jsonb` | VOL | yes | auth | officer | All-or-nothing, N-sided, priced at `effective_at`; recuses an officer who is a party (7.7(e)) |
| `veto_trade(p_trade_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth | commish | Competitive-balance veto |
| `reverse_trade(p_trade_id uuid, p_reason text, p_force boolean DEFAULT false)` | `jsonb` | VOL | yes | auth | officer | Five guards (§11); `p_force` skips only the compliance check (SQLSTATE `EDFL1`) |
| `trade_impact(p_trade_id uuid)` | `TABLE(team_id uuid, team_name text, cap_before numeric, cap_delta numeric, cap_after numeric, cap_ceiling numeric, cap_ok boolean, cash_before numeric, cash_delta numeric, cash_after numeric, cash_ok boolean, roster_before integer, roster_after integer, roster_limit integer, roster_ok boolean, dead_cap_next_year numeric, players_in integer, players_out integer, picks_in integer, picks_out integer)` | STB | yes | auth | — | Per-party cap, cash and roster before/after; gates arm at `5.5(f)` / `1.4(c)` |
| `trade_legality(p_trade_id uuid)` | `TABLE(code text, detail text)` | STB | yes | auth | — | Refusal codes with owner-readable detail |
| `trade_window_at(p_at timestamp with time zone)` | `text` | STB | yes | auth | — | Which 7.4(b) window an instant falls in, from the calendar; window 2 closes on the `7.5(a)` row |
| `trade_back_relief_at(p_at timestamp with time zone)` | `boolean` | STB | yes | auth | — | The expired 7.4(a) relief window |

### Roster, cuts and cap arithmetic

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `set_roster_status(p_contract_id uuid, p_status text, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner | active / taxi / ir; limits from `league_config`; the 3.3(h) conversion branch |
| `cut_player(p_contract_id uuid, p_june1_designation boolean DEFAULT false, p_salary_obligation_transfers boolean DEFAULT false, p_to_team_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_timing text DEFAULT 'immediate'::text)` | `uuid` | VOL | yes | auth | owner | Three paths: End of the week → `pending_cuts`; in season with the wire live → `waiver_placements` (contract stays `active`); otherwise settles at once. Forces End of the week after kickoff (5.23(d)) |
| `reverse_cut(p_event_id uuid, p_reason text)` | `uuid` | VOL | yes | auth | officer | Within `cut_reversal_window_hours` |
| `withdraw_pending_cut(p_pending_cut_id uuid)` | `boolean` | VOL | yes | auth | owner | Until it fires |
| `compute_cut_charges(p_contract_id uuid, p_june1_designation boolean DEFAULT false)` | `jsonb` | STB | yes | auth | — | Dead money (5.18); honours `edfl.weeks_override`; sibling of `compute_trade_charges` |
| `compute_trade_charges(p_contract_id uuid, p_to_team_id uuid, p_effective_at timestamp with time zone DEFAULT now())` | `jsonb` | STB | yes | auth | — | Settlement preview (7.1); writes nothing; also prices poach and self-claim settlements |
| `team_cut_previews(p_team_id uuid)` | `TABLE(contract_id uuid, dead_cap_current_year numeric, dead_cap_next_year numeric, dead_cash_current_year numeric, june1_split boolean, weeks_charged integer, cap_charge_current_year numeric, cap_relief_current_year numeric)` | STB | yes | anon+auth | — | Class A — the team page calls it with the anon client. Relief is not floored at zero |
| `cut_reversal_hours_left(p_event_id uuid)` | `numeric` | STB | yes | auth | — | For `cut_history` |
| `june1_designations_remaining(p_team_id uuid)` | `integer` | STB | yes | auth | — |  |
| `edfl_cut_timing_forced(p_contract_id uuid, p_at timestamp with time zone DEFAULT now())` | `text` | STB | — | auth | — | TM 5.23(d): NULL, or the sentence the cut dialog shows |
| `edfl_player_week_kickoff(p_player_id uuid, p_at timestamp with time zone DEFAULT now())` | `timestamp with time zone` | STB | — | auth | — | Kickoff of the player's game in the week containing `p_at`, once it has begun |
| `team_cap_used_in_season(p_team_id uuid, p_season integer)` | `numeric` | STB | yes | auth | — |  |
| `team_compliance_options(p_team_id uuid)` | `TABLE(contract_id uuid, player_name text, player_position text, contract_type text, roster_status text, cap_charge numeric, dead_cap_if_cut numeric, saved_by_cutting numeric, dead_cap_if_traded numeric, saved_by_trading numeric)` | STB | yes | auth | — | Per-contract cut/trade savings for the compliance banner |
| `commissioner_delete_contract(p_contract_id uuid, p_reason text)` | `uuid` | VOL | yes | auth | officer | Correction tool; clears free agency and sync references |
| `edfl_add_real_year(p_contract_id uuid, p_season integer, p_salary numeric, p_guaranteed boolean, p_reason text)` | `jsonb` | VOL | yes | service | — | Converts a void season or appends; records `added_by` |
| `edfl_remove_real_year(p_contract_id uuid, p_season integer)` | `jsonb` | VOL | yes | service | — | The reverse of `edfl_add_real_year` |
| `edfl_30pct_exempt_reason(p_contract_type text, p_added_by text)` | `text` | IMM | — | service | — | TM 5.22(d) keyed on `added_by` (SR-35) |
| `edfl_contract_season_cash(p_contract_id uuid, p_season integer)` | `numeric` | STB | yes | auth | — | Rule 5.6's season cash for a contract (§11) |
| `edfl_transfer_in_progress()` | `boolean` | STB | — | anon+auth | — | Flag (§4 intro) |
| `edfl_contracts_digest()` | `text` | STB | yes | auth | — | Sleeper sync guard 2: a digest of every contract's team/status/roster status |

### Restructure

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `can_restructure(p_contract_id uuid)` | `jsonb` | STB | yes | auth | — | Permission and eligibility returned separately |
| `max_restructure(p_contract_id uuid, p_proration_years integer DEFAULT 5)` | `jsonb` | STB | yes | auth | — |  |
| `compute_restructure_charges(p_contract_id uuid, p_amount numeric, p_from_guaranteed numeric, p_proration_years integer)` | `jsonb` | STB | yes | auth | — | Exact values (`values_are_exact`) |
| `restructure_contract(p_contract_id uuid, p_amount numeric, p_from_guaranteed numeric, p_proration_years integer, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner | Owner-or-officer; whole dollars; final season absorbs the remainder |
| `reverse_restructure(p_event_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth | officer |  |
| `restructure_ineligible_reason(p_contract_id uuid)` | `text` | STB | yes | auth | — |  |
| `restructure_permission_denied(p_contract_id uuid)` | `text` | STB | yes | auth | owner |  |
| `restructure_season_cash(p_contract_id uuid, p_season integer, p_from_guaranteed numeric, p_from_non_guaranteed numeric, p_new_bonus numeric)` | `numeric` | STB | yes | auth | — |  |
| `edfl_restructure_share(p_amount numeric, p_years integer, p_effective integer, p_season integer)` | `numeric` | IMM | — | anon+auth | — | Class A (`contract_year_computed`) |
| `edfl_restructure_remaining(p_amount numeric, p_years integer, p_effective integer, p_from_season integer)` | `numeric` | IMM | — | anon+auth | — | Class A (`contract_year_computed`) |
| `edfl_restructure_cut_amounts(p_contract_id uuid, p_season integer, p_last_season integer, OUT rs_cur numeric, OUT rs_fut numeric, OUT rs_cash_cur numeric)` | `record` | STB | — | auth | — |  |
| `edfl_restructure_in_progress()` | `boolean` | STB | — | auth | — | Flag (§4 intro) |
| `rebuild_restructure_void_years(p_contract_id uuid)` | `integer` | VOL | yes | service | — | Service only |

### Fifth Year Option and season results

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `fifth_year_option_status(p_contract_id uuid)` | `jsonb` | STB | yes | auth | owner | Permission and eligibility returned separately |
| `fifth_year_option_board(p_season integer DEFAULT NULL::integer)` | `jsonb` | STB | yes | auth | — |  |
| `exercise_fifth_year_option(p_contract_id uuid, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner |  |
| `decline_fifth_year_option(p_contract_id uuid, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | owner |  |
| `reverse_fifth_year_option(p_event_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth | owner |  |
| `edfl_fyo_is_round_one(p_contract_id uuid)` | `boolean` | STB | yes | auth | — | Still derives the round from the signing bonus; works (§11) |
| `edfl_fyo_pro_bowls(p_player_id uuid, p_draft_year integer)` | `integer` | STB | yes | auth | — |  |
| `edfl_fyo_startable_seasons(p_player_id uuid, p_draft_year integer)` | `integer` | STB | yes | auth | — |  |
| `publish_edfl_season_results(p_season integer, p_republish boolean DEFAULT false)` | `jsonb` | VOL | yes | auth | owner | Officer; `p_republish` replaces a published season. Feeds the Pro Bowl and option tiers |
| `edfl_season_results_status(p_season integer)` | `jsonb` | STB | yes | auth | — | Whether a season has stats and whether it is published |

### In-season free agency and poaching

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `submit_fa_offer(p_player_id uuid, p_offer_kind text, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb DEFAULT '[]'::jsonb)` | `jsonb` | VOL | yes | auth | owner | Opens or joins a window; a bid on a practice squad player opens a `poach` window; revisions strictly higher and keep their timestamp |
| `withdraw_fa_offer(p_offer_id uuid)` | `jsonb` | VOL | yes | auth | owner | Always refuses (5.14(d)) |
| `preview_fa_window(p_window_id uuid)` | `jsonb` | VOL | yes | auth | owner | Officer, after `closes_at` only; runs the award and rolls it back |
| `resolve_fa_window(p_window_id uuid)` | `jsonb` | VOL | yes | auth | owner | Officer; calls `edfl_fa_award_window` |
| `edfl_fa_award_window(p_window_id uuid, p_actor uuid, p_source text)` | `jsonb` | VOL | yes | service | — | The award engine: PPV, then the holding team, then the earliest offer; gates in a savepoint (DT-5); award-and-oblige 28/9; PO-7 settlement; PF-5 fine |
| `edfl_fa_first_offer_exempt(p_player_id uuid)` | `boolean` | STB | yes | auth | — | The expired 5.14(b) first-offer exemption |
| `edfl_free_agent_eligible(p_player_id uuid)` | `boolean` | STB | yes | auth | — | Whether a player may be offered; the old in-season release gate is gone for good |
| `edfl_fa_tier_pause(p_from timestamp with time zone, p_to timestamp with time zone)` | `interval` | STB | — | auth | — | FA-10: window time overlapping an open auction tier |
| `edfl_signing_fraction(p_first_week integer)` | `numeric` | IMM | — | anon+auth | — | The FA-11 fraction; Class A (`contract_year_computed`) |
| `edfl_weeks_under_contract(p_weeks_charged integer, p_first_week integer)` | `integer` | IMM | — | auth | — | weeks charged − first week + 1, floored at 0 |
| `league_minimum_salary(p_season_year integer)` | `numeric` | IMM | — | anon+auth | — | Escalates 5% a season; mirrored by `lib/leagueMinimum.js` |
| `season_cash_meets_minimum(p_season_year integer, p_guaranteed numeric, p_non_guaranteed numeric, p_roster_bonus numeric, p_signing_bonus numeric, p_option_bonus numeric)` | `boolean` | IMM | — | anon+auth | — | Rule 5.6 test for an offer season |
| `edfl_offer_season_cash(p_offer_id uuid, p_season integer)` | `numeric` | STB | yes | service | — | Rule 5.6's season cash for an offer (§11) |
| `edfl_poach_window_open(p_at timestamp with time zone DEFAULT now())` | `boolean` | STB | yes | auth | — | The `5.17` calendar row is current |
| `edfl_poach_eligible(p_player_id uuid, p_opening_team_id uuid DEFAULT NULL::uuid)` | `text` | STB | yes | auth | — | NULL or the refusal; the incumbent may bid but not open |
| `edfl_poach_offer_valid(p_offer_id uuid)` | `text` | STB | yes | service | — | PO-17/PO-18 shape test; the $2 bonus floor is a literal |
| `edfl_poach_frozen(p_contract_id uuid)` | `boolean` | STB | yes | auth | — | PF-4: a live poach window on the contract |
| `edfl_award_in_progress()` | `boolean` | STB | — | anon+auth | — | Flag set by nothing since `poach_04` (§4 intro) |
| `edfl_poach_award_in_progress()` | `boolean` | STB | — | service | — | Flag (§4 intro) |
| `edfl_oblige_in_progress()` | `boolean` | STB | — | service | — | Flag (§4 intro) |

### Waivers, pending cuts and compliance

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `edfl_wire_live(p_at timestamp with time zone DEFAULT now())` | `boolean` | STB | yes | auth | — | **One gate for the weekly cycle** (`league_config.wire_starts_at`) |
| `edfl_in_season(p_at timestamp with time zone DEFAULT now())` | `boolean` | STB | yes | auth | — | The `1.4(c)` boundary, from the calendar |
| `edfl_on_waivers(p_contract_id uuid)` | `boolean` | STB | yes | anon+auth | — | **Single source for every occupancy count.** Class A |
| `edfl_next_waiver_run(p_at timestamp with time zone DEFAULT now())` | `uuid` | STB | yes | auth | — | The run a cut at `p_at` belongs to (§11) |
| `submit_waiver_claim(p_placement_id uuid, p_team_rank integer DEFAULT NULL::integer, p_conditional_cut_contract_id uuid DEFAULT NULL::uuid)` | `uuid` | VOL | yes | auth | owner | Own team; a self-claim is allowed (DT-3); optional conditional cut |
| `withdraw_waiver_claim(p_claim_id uuid)` | `boolean` | VOL | yes | auth | owner |  |
| `reorder_waiver_claims(p_run_id uuid, p_claim_ids uuid[])` | `integer` | VOL | yes | auth | owner |  |
| `waiver_priority_order(p_season integer DEFAULT NULL::integer, p_through_week integer DEFAULT NULL::integer)` | `TABLE(priority integer, team_id uuid, team_name text, owner_display_name text, games integer, points_for numeric, points_against numeric)` | STB | yes | auth | — | From `team_week_scores`; frozen into `waiver_runs.priority_snapshot` at the run |
| `waiver_run_preview(p_run_id uuid)` | `jsonb` | VOL | yes | service | — | Pure resolver on temp tables |
| `waiver_run_apply(p_run_id uuid, p_actor uuid DEFAULT NULL::uuid)` | `jsonb` | VOL | yes | service | — | Executes one run |
| `waiver_settle_claim(p_placement_id uuid, p_to_team_id uuid, p_actor uuid, p_run_at timestamp with time zone)` | `uuid` | VOL | yes | service | — | Settles a claim at the waive instant; resets the counter on a self-claim (DT-6) |
| `waiver_runs_apply_due()` | `jsonb` | VOL | yes | service | — | Cron |
| `pending_cuts_fire_due()` | `jsonb` | VOL | yes | service | — | Cron; a fired designation goes to the wire |
| `edfl_self_claim_in_progress()` | `boolean` | STB | — | service | — | Flag (§4 intro) |
| `compliance_sweep_due()` | `jsonb` | VOL | yes | service | — | Cron; `_none` marker row for a clean week |
| `compliance_cure_check_due()` | `jsonb` | VOL | yes | service | — | Cron |
| `fines_impose_due()` | `jsonb` | VOL | yes | service | — | Cron; writes `category = fine`, `fine_kind = compliance` |
| `edfl_violation_key(p_reason text)` | `text` | IMM | — | auth | — | The stored `reason` is this key, not the sentence |

### Practice squad

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `edfl_taxi_weeks_used(p_player_id uuid, p_season integer DEFAULT NULL::integer)` | `integer` | STB | yes | anon+auth | — | Unvoided credits this season. Class A (`taxi_eligibility_status`) |
| `edfl_taxi_locked(p_player_id uuid)` | `boolean` | STB | yes | anon+auth | — | The 3.3(i) lock. Class A (`taxi_eligibility_status`) |
| `edfl_taxi_lock_reason(p_player_id uuid)` | `text` | STB | yes | auth | — | The refusal sentence for whichever lock cause applies |
| `edfl_taxi_eligibility_spent(p_player_id uuid)` | `boolean` | STB | yes | auth | — | Means *locked* since `tw_02` |
| `edfl_taxi_origin_actives(p_team_id uuid DEFAULT NULL::uuid)` | `TABLE(contract_id uuid, team_id uuid, player_id uuid, full_name text, contract_type text, elevated_at timestamp with time zone)` | STB | yes | auth | — | Who the Tuesday revert sends back; excludes locked players |
| `edfl_taxi_revert_in_progress()` | `boolean` | STB | — | auth | — | Flag (§4 intro) |
| `taxi_weeks_credit_due()` | `jsonb` | VOL | yes | service | — | Cron; credits at the compliance instant; limb B of the lock. Since `psclass_02` both the insert and the lock loop require `edfl_taxi_rule_subject()`, so an out-of-class rookie accrues nothing |
| `edfl_taxi_rule_subject(p_contract_type contract_type, p_draft_year integer, p_start_year integer, p_season integer DEFAULT NULL::integer)` | `boolean` | STB | — | anon+auth | — | **The one definition of TM 3.3(b)(i)**: any `practice_squad` contract, or a `rookie` within two seasons of his draft class; `start_year` only as a fallback. Invoker since `psclass_06`. Class A (`taxi_eligibility_status`, `team_inseason_compliance`); also read by `check_taxi_eligibility` and `taxi_weeks_credit_due` |
| `taxi_revert_due()` | `jsonb` | VOL | yes | service | — | Cron; Tuesday returns, one row at a time |
| `edfl_practice_squad_convertible(p_contract_id uuid)` | `text` | STB | yes | auth | — | NULL or the reason; the only place the FA-7 value test runs on a conversion |
| `edfl_practice_squad_convertibility()` | `TABLE(contract_id uuid, reason text, taxi_used integer, taxi_limit integer, nonrookie_used integer, nonrookie_limit integer)` | STB | yes | auth | officer | Officer; the convertible test for every active contract |
| `practice_squad_relief_at(p_at timestamp with time zone)` | `boolean` | STB | yes | auth | — | The expired 3.3(b) relief window |

### Blind Bid Auction and delegation

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `submit_bid(p_tier_id uuid, p_player_id uuid, p_start_year integer, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb DEFAULT '[]'::jsonb)` | `uuid` | VOL | yes | auth | owner | Own team, open tier |
| `withdraw_bid(p_bid_id uuid)` | `jsonb` | VOL | yes | auth | owner | Own team, within the allowance |
| `tier_withdrawal_allowance(p_tier_id uuid)` | `integer` | STB | yes | auth | — |  |
| `evaluate_auction_tier(p_tier_id uuid)` | `void` | VOL | yes | auth | officer | Officer |
| `verify_auction_tier(p_tier_id uuid)` | `integer` | VOL | yes | auth | officer | Officer; makes the tier's bids public |
| `pass_over_winner(p_bid_id uuid)` | `uuid` | VOL | yes | auth | officer |  |
| `commissioner_delete_bid(p_bid_id uuid, p_reason text)` | `uuid` | VOL | yes | auth | officer |  |
| `winning_bid_link(p_contract_id uuid)` | `TABLE(bid_id uuid, tier_name text, tier_season_year integer)` | STB | yes | auth | — | Class B — why `draft_pick_board` is `authenticated`-only |
| `set_tier_value_snapshot(p_tier_id uuid, p_snapshot_id uuid)` | `boolean` | VOL | yes | auth | officer |  |
| `tier_value_snapshot_id(p_tier_id uuid)` | `uuid` | STB | — | anon+auth | — |  |
| `chart_bid_target(p_tier_id uuid, p_player_id uuid, p_total_years integer, p_interest_level text)` | `jsonb` | STB | — | auth | — | Delegation target from the value chart |
| `minimum_legal_bid_ppv(p_start_year integer, p_total_years integer)` | `numeric` | STB | — | auth | — | A PPV figure, not cash |
| `upsert_bid_delegation(p_tier_id uuid, p_player_id uuid, p_mode text, p_priority integer, p_total_years integer, p_void_years integer, p_signing_bonus_total numeric, p_years jsonb, p_option_bonuses jsonb, p_target_ppv numeric, p_philosophy text, p_generated_ppv numeric, p_preview_total_ppv numeric, p_preview_total_cap numeric, p_preview_total_cash numeric, p_assistant_note text, p_validated boolean, p_validation_issues jsonb, p_interest_level text DEFAULT NULL::text, p_chart_total_ppv numeric DEFAULT NULL::numeric, p_chart_derived_target numeric DEFAULT NULL::numeric)` | `uuid` | VOL | yes | auth | owner |  |
| `arm_bid_delegations(p_tier_id uuid, p_fire_mode text, p_max_bids integer, p_max_total_cash numeric, p_max_total_cap numeric, p_note text)` | `jsonb` | VOL | yes | auth | owner |  |
| `cancel_bid_delegation(p_delegation_id uuid)` | `boolean` | VOL | yes | auth | owner |  |
| `edfl_delegation_years_valid(p_years jsonb, p_start_year integer, p_total_years integer, p_void_years integer)` | `boolean` | IMM | — | anon+auth | — | Shape test shared with free agency offers |
| `edfl_delegation_option_bonuses_valid(p_bonuses jsonb, p_start_year integer, p_total_years integer)` | `boolean` | IMM | — | anon+auth | — | Shape test shared with free agency offers |
| `edfl_delegation_30pct_issue(p_years jsonb, p_option_bonuses jsonb, p_start_year integer, p_total_years integer, p_void_years integer)` | `text` | IMM | — | anon+auth | — | Shape test shared with free agency offers |
| `rebuild_bid_option_void_years(p_bid_id uuid)` | `void` | VOL | yes | service | — | Service only since `grants_05`; the bid trigger calls it |
| `rebuild_option_void_years(p_contract_id uuid)` | `void` | VOL | yes | service | — | Service only since `grants_05`; the contract trigger, `execute_trade` and `waiver_settle_claim` call it |

### Player values

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `publish_player_value_snapshot(p_snapshot_id uuid)` | `timestamp with time zone` | VOL | yes | auth | commish | Commissioner only |
| `map_chart_name(p_chart_name text, p_chart_position text, p_player_id uuid, p_note text DEFAULT NULL::text)` | `integer` | VOL | yes | auth | commish | Commissioner only; the persistent name map wins over auto-matching |
| `resolve_player_values(p_snapshot_id uuid)` | `jsonb` | VOL | yes | service | — | Service only since `grants_05`; run from the chat when a chart is loaded |

### Scoreboard, best ball and the NFL schedule

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `edfl_sync_week_scores(p_season integer, p_week integer, p_payload jsonb)` | `jsonb` | VOL | yes | auth | owner | The owner Refresh button; delegates to `edfl_apply_matchups_payload` |
| `edfl_sync_week_scores_system(p_season integer, p_week integer, p_payload jsonb)` | `jsonb` | VOL | yes | service | — | The cron sibling; same delegation |
| `edfl_apply_matchups_payload(p_season integer, p_week integer, p_payload jsonb, p_actor uuid)` | `jsonb` | VOL | yes | service | — | Writes player and best-ball team scores; logs a correction only for a total recorded after the week was final |
| `edfl_best_ball_lineup(p_season integer, p_week integer)` | `TABLE(team_id uuid, player_id uuid, player_position text, slot text, points numeric)` | STB | yes | auth | — | The best-ball lineup for a week |
| `edfl_scoreboard_sync_target(p_at timestamp with time zone DEFAULT now())` | `TABLE(season_year integer, week_number integer, purpose text)` | STB | yes | auth | — | Which week to fetch now: a real kickoff window first, then Thu/Sun/Mon live and Tue/Wed 17:00 recaps |
| `edfl_scoreboard_sync_due()` | `jsonb` | VOL | yes | service | — | Cron (every 2 minutes) |
| `edfl_apply_nfl_schedule_csv(p_csv text, p_min_season integer)` | `jsonb` | VOL | yes | service | — | Applies nflverse `games.csv` from a season onward |
| `edfl_nfl_schedule_refresh_due()` | `jsonb` | VOL | yes | service | — | Cron (hourly check; pulls every 6 hours Sept–mid-Feb, daily otherwise) |
| `edfl_nfl_team_code(p_team text)` | `text` | IMM | — | auth | — | Sleeper → nflverse team code (`LAR` → `LA`, and `JAC`/`WSH`). **The join key between `players.nfl_team` and `nfl_games`** — `edfl_matchup_detail` learned that the hard way (§0b) |
| `edfl_sync_week_projections(p_season integer, p_week integer, p_payload jsonb)` | `jsonb` | VOL | yes | auth | owner | The owner Refresh for projections: scores each payload row with `edfl_score_projected_stats()` plus the WR/TE reception bonus and upserts `player_week_projections`; returns `rows_written` and `rostered_without_projection` |
| `edfl_score_projected_stats(p_stats jsonb, p_settings integer DEFAULT NULL::integer)` | `numeric` | IMM | — | auth | — | Scores a Rotowire stat object by `edfl_scoring_settings`. **Ignores `pass_fd` / `rush_fd` / `rec_fd`** (yards ÷ 10, not first downs) and estimates first downs at 0.5243 per completion, 0.2478 per carry, 0.5249 per reception (§0b, §11). Declared IMMUTABLE although it reads the settings table — harmless with one row, but not a function to index on |
| `edfl_matchup_detail(p_season integer, p_week integer, p_matchup_id integer)` | `TABLE(team_id uuid, team_name text, player_id uuid, full_name text, player_position text, nfl_team text, sleeper_player_id text, injury_status text, points numeric, proj_points numeric, effective_points numeric, game_state text, opponent text, kickoff_at timestamp with time zone, slot text, slot_order integer, injury_flagged boolean, injury_label text)` | STB | yes | auth | — | The Matchup page's only read. **Scores nothing** and settles nothing: actual points and projections as the two syncs wrote them, the NFL game state from `nfl_games`, and a provisional best-ball slot. Changed by REPLACE only once `/matchup` is live |

### Sleeper sync, injury sync and player identity

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `sleeper_sync_open(p_feeds jsonb DEFAULT '["rosters", "users"]'::jsonb)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_stage(p_run_id uuid, p_feed text, p_payload jsonb)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_detect(p_run_id uuid)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_report(p_run_id uuid)` | `TABLE(conflict_id uuid, severity text, conflict_class integer, conflict_type text, team text, player text, app_says jsonb, sleeper_says jsonb, detail text, recommended text, resolution text, note text)` | STB | yes | auth | officer | Officer only since `sync_07` |
| `sleeper_sync_resolve(p_run_id uuid, p_conflict_id uuid, p_resolution text, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_resolve_type(p_run_id uuid, p_conflict_type text, p_resolution text, p_note text DEFAULT NULL::text)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_preview_apply(p_run_id uuid)` | `jsonb` | VOL | yes | auth | officer |  |
| `sleeper_sync_apply(p_run_id uuid, p_confirm_token text)` | `jsonb` | VOL | yes | auth | officer | Needs the confirm token from the preview |
| `sleeper_sync_abandon(p_run_id uuid, p_reason text)` | `jsonb` | VOL | yes | auth | officer |  |
| `edfl_sync_enforcement_armed()` | `boolean` | STB | yes | auth | — |  |
| `edfl_sync_last_action(p_player_id uuid)` | `jsonb` | STB | yes | auth | — |  |
| `apply_injury_sync(p_run_id uuid, p_injured jsonb, p_seen jsonb)` | `jsonb` | VOL | yes | service | — | The only injury write path; UPDATE only — cannot insert a player |
| `edfl_injury_designation_qualifies(p_status text)` | `boolean` | IMM | — | anon+auth | — | **The ruling of September 20**: IR, Out, Doubtful or PUP, case- and space-insensitive; false for NULL. Decides the red cross and 3.4(b) IR eligibility together. Class A (`roster_injury_status`, `player_card_header`, `team_inseason_compliance`); also read by `edfl_matchup_detail` |
| `edfl_merge_player(p_keep uuid, p_drop uuid, p_reason text DEFAULT NULL::text)` | `jsonb` | VOL | yes | service | owner | The only merge path; skips sealed tables in its log (SR-54) |
| `edfl_crosswalk_refresh_due()` | `jsonb` | VOL | yes | service | — | Cron (hourly check, weekly refresh) |

### Transaction log

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `league_transactions(p_kinds text[] DEFAULT NULL::text[], p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_team_id uuid DEFAULT NULL::uuid, p_sort text DEFAULT 'newest'::text, p_limit integer DEFAULT 100, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id text DEFAULT NULL::text)` | `TABLE(log_id text, occurred_at timestamp with time zone, kind text, title text, description text, player_id uuid, player_name text, player_position text, team_from_id uuid, team_from text, team_to_id uuid, team_to text, season_year integer, detail jsonb)` | STB | yes | auth | — | Paged, filtered league log read |
| `league_transaction_kinds()` | `TABLE(kind text, rows bigint, newest timestamp with time zone)` | STB | yes | auth | — |  |
| `league_transaction_log_unmapped_kinds()` | `TABLE(kind text, rows bigint)` | STB | yes | auth | — | The allowlist alarm (§3) |

### Owner profiles

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `owner_directory()` | `TABLE(owner_id uuid, team_id uuid, team_name text, sleeper_roster_id text, is_self boolean, viewer_can_edit boolean, is_commissioner boolean, is_co_commissioner boolean, has_account boolean, full_name text, login_email text, contact_email text, phone text, sleeper_username text, discord_username text, whatsapp_name text, time_zone text, local_time_now text, local_date_now text, utc_offset_minutes integer, preferred_contact text, favorite_nfl_team text, owner_since_year integer, bio text, open_to_trade_talks boolean, last_active_bucket text, last_active_at timestamp with time zone, hidden_fields text[])` | STB | yes | auth | owner | The Owner Info read; applies each field's `show_*` toggle; never exposes `login_email` |
| `owner_profile_raw(p_owner_id uuid DEFAULT NULL::uuid)` | `TABLE(owner_id uuid, team_id uuid, team_name text, login_email text, full_name text, contact_email text, phone text, sleeper_username text, discord_username text, whatsapp_name text, time_zone text, preferred_contact text, favorite_nfl_team text, owner_since_year integer, bio text, open_to_trade_talks boolean, show_full_name boolean, show_contact_email boolean, show_phone boolean, show_sleeper_username boolean, show_discord_username boolean, show_whatsapp_name boolean, show_time_zone boolean, is_self boolean, edited_by_officer boolean, updated_at timestamp with time zone, updated_by_team text)` | STB | yes | auth | owner | Unmasked, for the owner himself and officers |
| `save_owner_profile(p_owner_id uuid DEFAULT NULL::uuid, p_full_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_sleeper_username text DEFAULT NULL::text, p_discord_username text DEFAULT NULL::text, p_whatsapp_name text DEFAULT NULL::text, p_time_zone text DEFAULT NULL::text, p_preferred_contact text DEFAULT NULL::text, p_favorite_nfl_team text DEFAULT NULL::text, p_owner_since_year integer DEFAULT NULL::integer, p_bio text DEFAULT NULL::text, p_open_to_trade_talks boolean DEFAULT true, p_show_full_name boolean DEFAULT true, p_show_contact_email boolean DEFAULT false, p_show_phone boolean DEFAULT false, p_show_sleeper_username boolean DEFAULT true, p_show_discord_username boolean DEFAULT true, p_show_whatsapp_name boolean DEFAULT true, p_show_time_zone boolean DEFAULT true)` | `uuid` | VOL | yes | auth | owner | Owner-or-officer; an officer edit is logged with a before/after snapshot |

### League year rollover

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `preview_league_year_rollover(p_to_season integer)` | `jsonb` | STB | yes | auth | — |  |
| `advance_league_year(p_to_season integer)` | `jsonb` | VOL | yes | auth | officer | Officer; the only setter of `expired` |
| `reverse_league_year_rollover(p_season integer, p_reason text)` | `jsonb` | VOL | yes | auth | officer |  |

### Backup export

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `edfl_backup_manifest()` | `TABLE(table_name text, total_rows bigint, exported_rows bigint, has_identity_always boolean)` | STB | yes | service | — | Row counts per table, total and exportable |
| `edfl_backup_table_sql(p_table text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100000)` | `text` | STB | yes | service | — | INSERT script for one table, paged |
| `edfl_backup_sealed_filter(p_table text)` | `text` | IMM | — | service | — | Exports only resolved offers and executed-run claims |

### The bots and the market layer — 34 functions, all new September 19

Three features, one shape. **Every publisher is `service`** — no `anon` grant, no `authenticated`
grant — because a client that could call `mort_say()` or `goodell_say()` could post anything it
liked to Discord under the league's name. The `_line` builders are ordinary invoker functions and
expose nothing their caller could not already read.

**Two gate spellings, and a grep for one misses the other.** The Goodell writers call
`is_commissioner_or_co(auth.uid())`. The two prospect writers gate **inline** —
`select * into me from team_owners where user_id = auth.uid()` then
`if not (me.is_commissioner or me.is_co_commissioner) then raise`. Both are officer gates and both
were read at this stamp; a search for `is_commissioner_or_co` finds only the first pair.

#### Mort — the transaction wire

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `mort_say(p_content text)` | `bigint` | VOL | yes | service | — | POSTs to Vault secret `discord_mort_webhook`; returns the `pg_net` request id |
| `mort_line(p_row league_transaction_log)` | `text` | IMM | — | service | — | The prose. Takes a whole log row as a composite argument |
| `mort_dispatch(p_limit integer DEFAULT 5, p_max_age interval DEFAULT '24:00:00')` | `TABLE(posted_log_id text, posted_kind text, net_request_id bigint)` | VOL | yes | service | — | Cron `mort-report-wire`; joins `mort_kinds` for the enabled set and `discord_broadcasts` for the said set |
| `mort_seed()` | `integer` | VOL | yes | service | — | Marks the existing log as already said, posting none of it |
| `mort_requeue(p_log_id text)` | `boolean` | VOL | yes | service | — | Deletes one ledger row so the next sweep says it again |
| `mort_failures()` | `TABLE(log_id text, kind text, posted_at timestamp with time zone, status_code integer, error_msg text)` | VOL | yes | service | — | Joins the ledger to `net._http_response`. **The only way to see a post Discord rejected** — `pg_net` is asynchronous, so a bad webhook fails silently otherwise |

#### Insider Threat — block, watchlist, prospects, Dianna

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `trade_block_set(p_contract_id uuid, p_on boolean, p_source text DEFAULT 'card')` | `jsonb` | VOL | yes | auth | owner | TB-9: turning it on again closes the live row `removed_reason = reset` and inserts a fresh one |
| `trade_block_place_internal(p_contract_id uuid, p_owner_id uuid, p_team_id uuid, p_source text)` | `uuid` | VOL | yes | service | — | The TB-15 path: a `shop` submission places the block in the same transaction |
| `trade_block_falloff_at(p_checked_at timestamp with time zone, p_player_id uuid)` | `timestamp with time zone` | STB | yes | auth | — | When a block died, or NULL. **`trade_block_is_live()` does not exist** |
| `watchlist_set(p_player_id uuid, p_visibility text)` | `jsonb` | VOL | yes | auth | owner | `private` / `shared` / `league`; a `shared` marker records the holder at the time |
| `watchlist_remove(p_player_id uuid)` | `jsonb` | VOL | yes | auth | owner | Sets `removed_at`; rows are never deleted |
| `insider_submit(p_subject_kind text, p_subject_id uuid, p_direction text, p_about_team_id uuid, p_veracity text, p_willing_to_give text, p_seeking text, p_delay text)` | `jsonb` | VOL | yes | auth | owner | **Returns a sentence rather than throwing.** Re-checks every combination the form offers; IT-1 places the block in the same transaction |
| `insider_withdraw(p_submission_id uuid)` | `jsonb` | VOL | yes | auth | owner | Refuses once Dianna has published it — the morgue rail (§6.3 of the spec) |
| `insider_publish_after(p_delay text)` | `timestamp with time zone` | VOL | — | service | — | `now` / `tonight` / `this_week` → an instant |
| `dianna_say(p_content text)` | `bigint` | VOL | yes | service | — | Vault secret `discord_dianna_webhook`; avatar by URL off the deployed site |
| `dianna_line(p_submission_id uuid, p_strength text)` | `text` | STB | yes | service | — | IT-7: numbers and names templated |
| `dianna_dispatch(p_limit integer DEFAULT 5, p_max_age interval DEFAULT '24:00:00')` | `TABLE(posted_submission_id uuid, posted_strength text, net_request_id bigint)` | VOL | yes | service | — | Cron `dianna-wire`. Age floor measured from **`publish_after`**, not `submitted_at`; IT-5 corroboration counted across live submissions on the same asset and direction |
| `draft_prospects_upsert(p_class_year integer, p_rows jsonb, p_by_owner uuid DEFAULT NULL)` | `jsonb` | VOL | yes | service | — | The ESPN load. Service-only; the gate is the officer check in the Server Action |
| `draft_prospects_match_sleeper()` | `jsonb` | VOL | yes | service | — | Name-and-position match, one-to-one; anything ambiguous is left for the hand match |
| `draft_prospect_match_set(p_prospect_id uuid, p_player_id uuid)` | `jsonb` | VOL | yes | auth | officer | Inline officer gate |
| `draft_prospects_roll(p_note text DEFAULT NULL)` | `jsonb` | VOL | yes | auth | officer | Closes the rookie draft: rolls the class **and withdraws every live `prospect` submission** with `withdrawn_reason = 'class_rolled'`. Logged to `commissioner_actions` |

#### Robo Goodell — the League Office wire

| Function | Returns | Vol | SD | Grants | Gate | Note |
|---|---|---|---|---|---|---|
| `goodell_say(p_content text)` | `bigint` | VOL | yes | service | — | Vault secret `discord_goodell_webhook` |
| `goodell_phrase(p_kind text, p_slot text, p_key text)` | `text` | STB | — | auth | — | Deterministic pick: `abs(hashtext(key ‖ slot)) % count`. Same key, same phrasing, every time |
| `goodell_when(p_event league_calendar_events, p_lead text)` | `text` | STB | — | auth | — | The when-clause. **Never prints a clock time for an event whose `time_is_exact` is false** |
| `goodell_event_line(p_event league_calendar_events, p_lead text)` | `text` | STB | — | auth | — | Composite argument, like `mort_line` |
| `goodell_fine_line(p_tx_id uuid)` | `text` | STB | — | auth | — | Reads `league_fines`; formats the money **in SQL** (SR-23) and stores the string |
| `goodell_memo_line(p_memo_id uuid)` | `text` | STB | — | auth | — | Invoker, so a non-officer calling it gets NULL through `goodell_memos` RLS |
| `goodell_candidates(p_max_age interval DEFAULT '24:00:00')` | `TABLE(broadcast_key text, kind text, subject_id uuid, due_at timestamp with time zone, sort_rank integer)` | STB | yes | service | — | **The one source of "what is due".** Dispatcher, seeder and officer preview all read it |
| `goodell_dispatch(p_limit integer DEFAULT 6, p_max_age interval DEFAULT '24:00:00')` | `TABLE(posted_key text, posted_kind text, net_request_id bigint)` | VOL | yes | service | — | Cron `goodell-wire`. Returns quietly and **marks nothing** when the Vault secret is absent |
| `goodell_seed(p_max_age interval DEFAULT '3650 days')` | `integer` | VOL | yes | service | — | Start-from-here: stamps everything due as said, posting none of it |
| `goodell_memo_submit(p_body text, p_delay text DEFAULT 'now')` | `jsonb` | VOL | yes | auth | officer | Returns a sentence rather than throwing. 1,800 characters, because Discord stops at 2,000 and Robo adds his own top and tail |
| `goodell_memo_withdraw(p_memo_id uuid)` | `jsonb` | VOL | yes | auth | officer | Refuses once a broadcast row exists. The window is exactly as long as the next five-minute tick |
| `goodell_kind_set(p_kind text, p_enabled boolean)` | `jsonb` | VOL | yes | auth | officer | The mute switch |
| `goodell_wire_status()` | `jsonb` | VOL | yes | auth | officer | **Vault is not readable from a client.** This is the only honest way for the page to say "he has no webhook yet" rather than "nothing has happened" |

### Trigger functions — 32

| Function | SD | Fired by | Note |
|---|---|---|---|
| `auction_tiers_lock_snapshot` | — | `auction_tiers.auction_tiers_lock_snapshot_trg` |  |
| `bid_delegation_settings_touch` | — | `bid_delegation_settings.bid_delegation_settings_touch_trg` |  |
| `bid_delegations_check_30pct` | — | `bid_delegations.enforce_delegation_30pct_insert`, `bid_delegations.enforce_delegation_30pct_update` |  |
| `bid_delegations_validate_context` | — | `bid_delegations.bid_delegations_validate_context_trg` |  |
| `bids_supersede_delegation` | yes | `bids.bids_supersede_delegation_trg` |  |
| `check_bid_30pct_rule` | yes | `bid_option_bonuses.enforce_bid_30pct_rule_ob`, `bid_years.enforce_bid_30pct_rule` |  |
| `check_bid_deion_rule` | — | `bid_years.enforce_bid_deion_rule` |  |
| `check_bid_minimum_salary` | — | `bid_years.enforce_bid_minimum_salary` |  |
| `check_bid_option_bonus_year` | — | `bid_option_bonuses.enforce_bid_option_bonus_year` |  |
| `check_cap_ceiling` | — | `contract_years.enforce_cap_ceiling` | Deferred; skipped for a transfer (the award bypass is dead — §4) |
| `check_contract_30pct_rule` | yes | `contract_option_bonuses.enforce_contract_30pct_rule_ob`, `contract_years.enforce_contract_30pct_rule` | Deferred; exemption by reason (`edfl_30pct_exempt_reason`) |
| `check_contract_minimum_salary` | — | `contract_years.enforce_contract_minimum_salary` |  |
| `check_deion_rule` | — | `contract_years.enforce_deion_rule` |  |
| `check_deion_rule_on_restructure` | — | `contract_restructure_bonuses.trg_deion_on_restructure` |  |
| `check_first_season_week_rules` | — | `contracts.enforce_first_season_week_rules` |  |
| `check_inseason_signing_no_roster_bonus` | — | `contract_years.enforce_inseason_signing_no_roster_bonus` |  |
| `check_option_bonus_contract_type` | — | `contract_option_bonuses.enforce_option_bonus_contract_type` |  |
| `check_option_bonus_not_year1` | — | `contract_option_bonuses.enforce_option_bonus_not_year1` |  |
| `check_poach_freeze` | yes | `contract_restructure_bonuses.enforce_poach_freeze`, `contracts.enforce_poach_freeze`, `pending_cuts.enforce_poach_freeze`, `waiver_placements.enforce_poach_freeze` | PF-4 freeze; four attachments |
| `check_practice_squad_value` | — | `contract_years.enforce_practice_squad_value` | Reads `league_minimum_salary()` |
| `check_taxi_eligibility` | — | `contracts.enforce_taxi_eligibility` | The lock refusal first, then TM 3.3(b)(i) through `edfl_taxi_rule_subject()` (`psclass_03`); both refusal sentences unchanged |
| `check_taxi_slot_limits` | — | `contracts.enforce_taxi_slot_limits` | Stands aside for the Tuesday revert and award-and-oblige |
| `link_team_owner_on_signup` | yes | `auth.users.on_auth_user_confirmed_link_team_owner` | On `auth.users` — outside `public` |
| `log_cash_transaction_action` | yes | `team_cash_transactions.log_cash_transaction` | Logs every cash transaction publicly |
| `log_roster_move` | yes | `contracts.trg_log_roster_move` | Writes `roster_moves` |
| `players_fill_ids_from_crosswalk` | yes | `players.trg_players_fill_ids` | Fills a missing gsis or Sleeper id; trims `gsis_id` |
| `taxi_credits_reset_on_clearance` | yes | `waiver_placements.trg_taxi_credits_reset_on_clearance` | Clearing waivers, or a self-claim, voids credits and the lock |
| `taxi_lock_on_promotion` | yes | `contracts.trg_taxi_lock_on_promotion` | TM 3.3(i) limb A — the fourth promotion |
| `trg_owner_profiles_touch` | — | `owner_profiles.owner_profiles_touch` |  |
| `trg_rebuild_bid_option_void_years` | yes | `bid_option_bonuses.auto_bid_option_void_years` |  |
| `trg_rebuild_option_void_years` | yes | `contract_option_bonuses.auto_option_void_years` |  |
| `trg_sleeper_sync_last_action` | yes | `sleeper_sync_conflicts.sleeper_sync_conflicts_last_action` |  |

**Every trigger function is attached** (§7). `link_team_owner_on_signup` fires from `auth.users`,
outside `public` — an earlier cut called it an orphan; do not drop it. A trigger function fires
without its table's writer holding EXECUTE on it (proven), so the grants in this table are
housekeeping, not gates. A trigger that has never fired is not a trigger that works —
`check_practice_squad_value` proved that on September 8, when the first practice squad signing in
league history hit a stale `3` it had been carrying since the original design.

---

## 5. Tables — 84, with every column

Row counts are exact, read at the stamp — this cut re-read every non-sealed table's count, which
v2.2 had not. **Tables in a sealed group were not read** (SR-31: a waiver run is open, with one
placement pending for the September 23 run, and the rule does not turn on whether a window is open)
and say so. `pk` marks the primary key, `fk→` the referenced table.
Grants: `anon` / `auth` = table-level SELECT; RLS policies are in §8. The six backup tables are
listed last and must not be read.

#### `auction_tier_players` — 192 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `player_id` | uuid | no |  | fk→`players` |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `auction_tier_players_tier_id_player_id_key` — UNIQUE (tier_id, player_id)

#### `auction_tiers` — 4 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

- `auction_tiers_no_overlap` — EXCLUDE USING gist (tstzrange(opens_at, closes_at, '[]'::text) WITH &&)
- `auction_tiers_season_tier_unique` — UNIQUE (season_year, tier_number)
- `auction_tiers_valid_window` — CHECK ((closes_at > opens_at))

#### `bid_delegation_settings` — rows not read (sealed, SR-31)

*SELECT: auth · RLS on · 1 policy*

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

*Column notes:*

- `max_bids` — Maximum number of delegated bids to submit. Wins cannot be capped at submission time in a sealed auction; this caps how many bids are made.
- `max_total_cash` — Worst-case cash exposure ceiling: the sum of preview_total_cash across all submitted delegated bids, i.e. the cost if every one of them wins.
- `max_total_cap` — Worst-case cap exposure ceiling. Same semantics as max_total_cash.

*Constraints:*

- `bid_delegation_settings_default_mode_check` — CHECK ((default_mode = ANY (ARRAY['execute'::text, 'propose'::text, 'discretionary'::text])))
- `bid_delegation_settings_fire_mode_check` — CHECK ((fire_mode = ANY (ARRAY['immediate'::text, 'at_close'::text])))
- `bid_delegation_settings_max_total_cap_check` — CHECK (((max_total_cap IS NULL) OR (max_total_cap >= (0)::numeric)))
- `bid_delegation_settings_max_total_cash_check` — CHECK (((max_total_cash IS NULL) OR (max_total_cash >= (0)::numeric)))
- `bid_delegation_settings_max_wins_check` — CHECK (((max_bids IS NULL) OR (max_bids >= 0)))

#### `bid_delegations` — rows not read (sealed, SR-31)

*SELECT: auth · RLS on · 1 policy*

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

*Column notes:*

- `chart_total_ppv` — The chart reference value at the chosen contract length, before the interest multiplier. Stored so a bid can be explained after the fact.
- `chart_derived_target` — What the tag and length suggested. target_ppv is what the owner actually used — they may differ, and that is fine.

*Constraints:*

- `bid_delegations_armed_requires_validation` — CHECK (((status = ANY (ARRAY['draft'::text, 'cancelled'::text])) OR (validated_at IS NOT NULL)))
- `bid_delegations_mode_check` — CHECK ((mode = ANY (ARRAY['execute'::text, 'propose'::text, 'discretionary'::text])))
- `bid_delegations_option_bonuses_shape` — CHECK (edfl_delegation_option_bonuses_valid(option_bonuses, start_year, total_years))
- `bid_delegations_philosophy_check` — CHECK (((philosophy IS NULL) OR (philosophy = ANY (ARRAY['front_loaded'::text, 'back_loaded'::text, 'pay_as_you_go'::text]))))
- `bid_delegations_signing_bonus_total_check` — CHECK ((signing_bonus_total >= (0)::numeric))
- `bid_delegations_status_check` — CHECK ((status = ANY (ARRAY['draft'::text, 'armed'::text, 'submitted'::text, 'superseded'::text, 'skipped'::text, 'failed'::text, 'cancelled'::text])))
- `bid_delegations_submitted_has_bid` — CHECK (((status <> 'submitted'::text) OR (submitted_bid_id IS NOT NULL)))
- `bid_delegations_target_ppv_check` — CHECK (((target_ppv IS NULL) OR (target_ppv > (0)::numeric)))
- `bid_delegations_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))
- `bid_delegations_unique_target` — UNIQUE (tier_id, team_id, player_id)
- `bid_delegations_void_years_check` — CHECK (((void_years >= 0) AND (void_years <= 5)))
- `bid_delegations_years_shape` — CHECK (edfl_delegation_years_valid(years, start_year, total_years, void_years))

*Indexes:* `bid_delegations_armed_idx` (partial), `bid_delegations_tier_team_idx`

#### `bid_interest_levels` — 4 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `code` | text | no |  | pk |
| `label` | text | no |  |  |
| `multiplier` | numeric | no |  |  |
| `sort_order` | integer | no |  |  |
| `description` | text | yes |  |  |

*Constraints:*

- `bid_interest_levels_multiplier_check` — CHECK ((multiplier > (0)::numeric))

#### `bid_option_bonuses` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `bid_id` | uuid | no |  | fk→`bids` |
| `exercise_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no | `0` |  |

#### `bid_player_hides` — rows not read (sealed, SR-31)

*SELECT: auth · RLS on · 3 policies*

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

*Indexes:* `bid_player_hides_tier_team_idx`

#### `bid_withdrawals` — rows not read (sealed, SR-31)

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `tier_id` | uuid | no |  | fk→`auction_tiers` |
| `team_id` | uuid | no |  | fk→`teams` |
| `player_id` | uuid | no |  | fk→`players` |
| `bid_id` | uuid | yes |  | fk→`bids` |
| `withdrawn_at` | timestamp with time zone | no | `now()` |  |

*Indexes:* `bid_withdrawals_tier_team_idx`

#### `bid_years` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

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

- `bid_void_reason_matches_flag` — CHECK (((is_void_year AND (void_reason IS NOT NULL)) OR ((NOT is_void_year) AND (void_reason IS NULL))))
- `bid_years_unique_year` — UNIQUE (bid_id, contract_year_number)
- `bid_years_void_reason_check` — CHECK ((void_reason = ANY (ARRAY['signing_bonus'::text, 'option_bonus'::text])))

#### `bids` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

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

- `bids_check` — CHECK (((void_years >= 0) AND (void_years <= (5 - total_years))))
- `bids_contract_type_check` — CHECK ((contract_type = 'veteran_free_agent'::text))
- `bids_one_per_team_per_player_per_tier` — UNIQUE (tier_id, player_id, team_id)
- `bids_option_void_years_check` — CHECK (((option_void_years >= 0) AND (option_void_years <= 4)))
- `bids_status_check` — CHECK ((status = ANY (ARRAY['pending'::text, 'winner'::text, 'lost'::text, 'withdrawn'::text, 'passed_over'::text])))
- `bids_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))

#### `commissioner_actions` — 389 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `commissioner_actions_created_idx`

#### `compliance_violations` — 1 row

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `week_number` | integer | no |  |  |
| `measured_at` | timestamp with time zone | no |  |  |
| `reason` | text | no |  |  |
| `occurrence_no` | integer | no |  |  |
| `cure_due_at` | timestamp with time zone | no |  |  |
| `cured_at` | timestamp with time zone | yes |  |  |
| `fine_amount` | numeric | yes |  |  |
| `impose_at` | timestamp with time zone | no |  |  |
| `imposed_at` | timestamp with time zone | yes |  |  |
| `cash_tx_id` | uuid | yes |  | fk→`team_cash_transactions` |

*Constraints:*

- `compliance_violations_team_id_season_year_week_number_reaso_key` — UNIQUE (team_id, season_year, week_number, reason)

#### `contract_events` — 77 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `effective_at` — When the move actually took effect - for a trade, the instant the last party concurred (Ruling 4, August 24 2026). created_at records when the row was written, which for a trade is commissioner-approval time and is the WRONG date to settle against.

*Constraints:*

- `contract_events_event_type_check` — CHECK ((event_type = ANY (ARRAY['released'::text, 'waived_unclaimed'::text, 'waived_claimed'::text, 'traded'::text, 'retired'::text, 'restructure'::text, 'expired'::text, 'fifth_year_option_exercised'::text, 'fifth_year_option_declined'::text, 'poached'::text, 'poach_retained'::text])))
- `contract_events_weeks_charged_check` — CHECK (((weeks_charged IS NULL) OR ((weeks_charged >= 0) AND (weeks_charged <= 14))))
- `season_week_range` — CHECK (((season_week IS NULL) OR ((season_week >= 1) AND (season_week <= 14))))

*Indexes:* `contract_events_contract_idx`, `contract_events_from_team_idx`, `contract_events_one_release_per_contract` (unique) (partial), `contract_events_season_idx`

#### `contract_option_bonuses` — 105 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `exercise_season_year` | integer | no |  |  |
| `bonus_amount` | numeric | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `contract_option_bonuses_bonus_amount_check` — CHECK ((bonus_amount > (0)::numeric))

#### `contract_restructure_bonuses` — 3 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `idx_restructure_bonus_contract`

#### `contract_years` — 1,119 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `added_by` — Why this real season exists, when it was not part of the original deal. fifth_year_option = prescribed, priced from edfl_tag_values, not negotiated. extension = negotiated. NULL = written at signing. RULES DIFFER BY REASON, NOT BY CONTRACT TYPE: a prescribed option year is outside the 30% Rule because its price is set by the league; a negotiated extension year is not. Do not let an exemption key on contracts.contract_type - a rookie contract is exempt today by accident of its type, and a veteran extension would silently inherit that.

*Constraints:*

- `contract_years_added_by_check` — CHECK (((added_by IS NULL) OR (added_by = ANY (ARRAY['fifth_year_option'::text, 'extension'::text]))))
- `contract_years_contract_id_contract_year_number_key` — UNIQUE (contract_id, contract_year_number)
- `contract_years_contract_year_number_check` — CHECK (((contract_year_number >= 1) AND (contract_year_number <= 9)))
- `contract_years_void_reason_check` — CHECK ((void_reason = ANY (ARRAY['signing_bonus'::text, 'option_bonus'::text, 'restructure'::text])))
- `void_reason_matches_flag` — CHECK (((is_void_year AND (void_reason IS NOT NULL)) OR ((NOT is_void_year) AND (void_reason IS NULL))))
- `void_year_no_real_salary` — CHECK (((NOT is_void_year) OR ((guaranteed_salary = (0)::numeric) AND (non_guaranteed_salary = (0)::numeric) AND (option_bonus = (0)::numeric) AND (roster_bonus = (0)::numeric))))

*Indexes:* `contract_years_league_season_year_idx`

#### `contracts` — 358 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `draft_year` — The player's draft class. Anchors taxi-squad eligibility (3.3), and is carried across a trade by execute_trade() so that changing teams cannot restore expired eligibility. Backfilled for the 2026 redraft cohort from rookie_wage_scale_slots.kept_years, which is uniform per class.
- `first_season_week` — The league week a contract was signed in, when it was signed mid-season. NULL means a full season and a fraction of 1 -- true of every contract written before free agency. This is the REASON key for FA-14 and for the charge fraction; never key either on contract_type (SR-35). Must stay NULL on a contract created by transfer, because the transfer engine already writes a reduced Year 1 -- see check_first_season_week_not_transfer.

*Constraints:*

- `contracts_first_season_week_range` — CHECK (((first_season_week IS NULL) OR ((first_season_week >= 1) AND (first_season_week <= 14))))
- `contracts_option_void_years_check` — CHECK (((option_void_years >= 0) AND (option_void_years <= 4)))
- `contracts_rookie_needs_draft_year` — CHECK (((contract_type <> 'rookie'::contract_type) OR (draft_year IS NOT NULL))) — **new** (`psclass_01`): SR-26 made enforceable; the draft class, not `start_year`, anchors 3.3(b)(i), and a rookie contract can no longer arrive without one
- `contracts_total_years_check` — CHECK (((total_years >= 1) AND (total_years <= 5)))
- `void_years_only_for_free_agents` — CHECK (((void_years = 0) OR (contract_type = 'veteran_free_agent'::contract_type)))
- `void_years_range` — CHECK (((void_years >= 0) AND (void_years <= (5 - total_years))))

*Indexes:* `contracts_player_id_idx`, `contracts_team_id_idx`

#### `crosswalk_refresh_runs` — 1 rows

*SELECT: service role only · RLS on · 0 policies*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `identity always` | pk |
| `net_request_id` | bigint | yes |  |  |
| `status` | text | no | `'requested'::text` |  |
| `requested_at` | timestamp with time zone | no | `now()` |  |
| `collected_at` | timestamp with time zone | yes |  |  |
| `result` | jsonb | yes |  |  |
| `error_message` | text | yes |  |  |

*Constraints:*

- `crosswalk_refresh_runs_status_check` — CHECK ((status = ANY (ARRAY['requested'::text, 'applied'::text, 'failed'::text])))

#### `draft_picks` — 250 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `draft_picks_current_team_idx`

#### `edfl_scoring_settings` — 1 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | integer | no | `nextval('edfl_scoring_settings_id_seq'::regclass)` | pk |
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

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `edfl_season_results_player`, `edfl_season_results_probowl` (partial)

#### `edfl_tag_values` — 20 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `player_id` | uuid | no |  | pk fk→`players` |
| `game_id` | text | no |  | pk fk→`nfl_games` |
| `scoring_settings_id` | integer | no |  | pk fk→`edfl_scoring_settings` |
| `fantasy_points` | numeric(8,2) | no |  |  |
| `scoring_breakdown` | jsonb | yes |  |  |
| `calculated_at` | timestamp with time zone | yes | `now()` |  |

*Indexes:* `idx_fgs_leaderboard`

#### `free_agent_offer_option_bonuses` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `free_agent_offer_option_bonuses_offer_id_idx`

#### `free_agent_offer_years` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

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

#### `free_agent_offers` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `free_agent_offers_one_per_team` (unique), `free_agent_offers_window_idx`

#### `free_agent_windows` — 34 rows, all `resolved`; counted without the sealed column

*column-level SELECT for `anon` and `authenticated` on every column except `opened_by_team_id` · RLS on · 1 policy*

> One twenty-four-hour sealed window per player (FA-1, amended September 14 2026 from eight hours). closes_at is opened_at + 24h, extended by any overlap with an open auction tier (FA-10). Resolution is by hand (FA-8).

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
| `window_kind` | text | no | `'free_agency'::text` |  |
| `incumbent_team_id` | uuid | yes |  | fk→`teams` |
| `incumbent_contract_id` | uuid | yes |  | fk→`contracts` |
| `retain_bar_ppv` | numeric | yes |  |  |
| `outcome` | text | yes |  |  |

*Column notes:*

- `opened_by_team_id` — Sealed from anon/authenticated by column grant (5.14(c)). The board shows it only once the window is resolved or void.

*Constraints:*

- `free_agent_windows_outcome_check` — CHECK (((outcome IS NULL) OR ((window_kind = 'free_agency'::text) AND (outcome = ANY (ARRAY['awarded'::text, 'voided'::text]))) OR ((window_kind = 'poach'::text) AND (outcome = ANY (ARRAY['poached'::text, 'retained_by_bid'::text, 'retained_on_rookie_contract'::text, 'voided'::text])))))
- `free_agent_windows_poach_shape_check` — CHECK ((((window_kind = 'free_agency'::text) AND (incumbent_team_id IS NULL) AND (incumbent_contract_id IS NULL) AND (retain_bar_ppv IS NULL)) OR ((window_kind = 'poach'::text) AND (incumbent_team_id IS NOT NULL) AND (incumbent_contract_id IS NOT NULL))))
- `free_agent_windows_status_check` — CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'resolved'::text, 'void'::text])))
- `free_agent_windows_window_kind_check` — CHECK ((window_kind = ANY (ARRAY['free_agency'::text, 'poach'::text])))

*Indexes:* `free_agent_windows_one_live` (unique) (partial), `free_agent_windows_poach_open_idx` (partial), `free_agent_windows_status_idx`

#### `injury_sync_runs` — 15 rows

*SELECT: anon, auth · RLS on · 1 policy*

> One row per injury pull, manual or scheduled. The newest status=completed row supplies the timestamp on the league Injury Report banner.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `started_at` | timestamp with time zone | no | `now()` |  |
| `completed_at` | timestamp with time zone | yes |  |  |
| `status` | text | no | `'running'::text` |  |
| `trigger_source` | text | no |  |  |
| `run_by` | uuid | yes |  | fk→`team_owners` |
| `players_examined` | integer | no | `0` |  |
| `players_matched` | integer | no | `0` |  |
| `players_changed` | integer | no | `0` |  |
| `injured_after` | integer | no | `0` |  |
| `unmatched_count` | integer | no | `0` |  |
| `error_message` | text | yes |  |  |
| `detail_updates` | integer | no | `0` |  |

*Constraints:*

- `injury_sync_runs_status_check` — CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text])))
- `injury_sync_runs_trigger_source_check` — CHECK ((trigger_source = ANY (ARRAY['manual'::text, 'scheduled'::text])))

*Indexes:* `injury_sync_runs_completed_idx` (partial), `injury_sync_runs_one_running` (unique) (partial)

#### `league_calendar_events` — 51 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `ends_at` — Set only for genuine multi-day spans that should render as a range (League Reset Period, Dead Season, a playoff round). Window open/close pairs are two separate rows so they each land in chronological order.
- `time_is_exact` — TRUE when the clock time is itself part of the rule (00:01 ET reset, 08:00 ET draft start). FALSE renders as an all-day entry.
- `is_provisional` — TRUE when the date is not yet locked - NFL flex scheduling, or a commissioner date not yet set.
- `sort_hint` — Tie-break for multiple events at the same instant. Lower sorts first.

*Constraints:*

- `league_calendar_events_category_check` — CHECK ((category = ANY (ARRAY['season'::text, 'money'::text, 'contracts'::text, 'cuts'::text, 'trades'::text, 'auction'::text, 'draft'::text, 'roster'::text, 'gameplay'::text, 'governance'::text])))
- `league_calendar_events_span_check` — CHECK (((ends_at IS NULL) OR (ends_at >= starts_at)))

*Indexes:* `league_calendar_events_season_start_idx`

#### `league_cap_settings` — 2 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `nfl_salary_cap` | numeric | yes |  |  |
| `fantasy_salary_cap` | numeric | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `in_season_starts_at` | date | yes |  |  |
| `cap_ceiling` | numeric | yes |  |  |
| `is_provisional` | boolean | no | `false` |  |

*Column notes:*

- `in_season_starts_at` — DEPRECATED August 24, 2026 and no longer read by anything. The in-season boundary is owned by league_calendar_events (rule_ref 5.5(f) for the cap hard block, 1.4(c) for the roster-compliance boundary). Do not populate this column; drop it once nothing references it.
- `is_provisional` — True when this season's fantasy_salary_cap is an estimate not yet ratified. A season becomes final when its league year opens on March 1 of that season_year. Surfaces rendering a provisional season must label the figure an estimate. Does not affect cap_used or any dead-money charge; affects cap_space_remaining and min_required_spend only.

#### `league_config` — 1 rows

*SELECT: anon, auth · RLS on · 1 policy*

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
| `cuts_open_after` | timestamp with time zone | no | `'2026-09-01 04:00:00+00'::timestamp with time zone` |  |
| `june1_designations_per_year` | integer | no | `2` |  |
| `cut_reversal_window_hours` | numeric | no | `96` |  |
| `trade_reversal_window_hours` | numeric | no | `96` |  |
| `taxi_non_rookie_slots` | integer | no | `3` |  |
| `ir_slots` | integer | no | `10` |  |
| `wire_starts_at` | timestamp with time zone | yes |  |  |
| `taxi_revert_baseline_at` | timestamp with time zone | yes |  |  |

*Column notes:*

- `practice_squad_max_value` — DEAD as of FA-7 (Sep 2026). Superseded by league_minimum_salary(season) and read by nothing. A single scalar cannot carry this rule -- the minimum escalates every season. Do not read this column; do not "fix" it by editing the number.
- `trade_reversal_window_hours` — Rule Appendix A: hours after execution during which the commissioner may reverse a trade. Independent of cut_reversal_window_hours by design.
- `taxi_non_rookie_slots` — Rule 3.3(b): how many practice squad slots may hold players who are not on a rookie contract. Was hardcoded as 3 inside set_roster_status(). Moves per-season with practice_squad_max_value when the free agency build lands (FA-7).
- `ir_slots` — Rule 3.4(a). Maximum players a team may carry on injured reserve. Read by team_inseason_compliance; never hardcode it.
- `wire_starts_at` — The instant the waiver wire becomes real for owners. NULL = dark: cuts settle immediately and end-of-week designations are refused. Set it to go live, e.g. update league_config set wire_starts_at = timestamptz '2026-09-15 00:00-04'. Everything downstream -- pooling, designations, the scheduled run -- reads this one value.
- `taxi_revert_baseline_at` — Only elevations with roster_moves.effective_at at or after this instant are sent back by the Tuesday auto-revert. Set to the wire go-live (2026-09-15 00:00 ET) so the eight pre-rule elevations of Sep 8-9 are grandfathered where they sit. NULL reverts everyone, including those eight.

*Constraints:*

- `single_row` — CHECK (id)

#### `league_weeks` — 14 rows

*SELECT: anon, auth · RLS on · 1 policy*

> Weekly salary charge calendar. One row per (season_year, week_number 1-14). charge_at = 00:01 Eastern on the day of that week's FIRST NFL game — usually Thursday, but not always (e.g. a Wednesday season opener). Seeded by the commissioner from the NFL schedule via the schedule-loader feature (prompted July 1 each year). Empty for a season = off-season state, zero weeks charged.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `week_number` | integer | no |  | pk |
| `charge_at` | timestamp with time zone | no |  |  |
| `first_game_label` | text | yes |  |  |
| `is_provisional` | boolean | no | `false` |  |
| `first_game_at` | timestamp with time zone | no |  |  |
| `wire_runs_at` | timestamp with time zone | yes |  |  |
| `compliance_at` | timestamp with time zone | yes |  |  |
| `last_game_at` | timestamp with time zone | yes |  |  |
| `taxi_reverted_at` | timestamp with time zone | yes |  |  |
| `counts_toward_taxi_weeks` | boolean | no | `true` |  |
| `taxi_weeks_credited_at` | timestamp with time zone | yes |  |  |

*Column notes:*

- `charge_at` — The weekly salary pay instant: Tuesday 00:00 ET, ahead of the week it pays for. Weeks charged is count(*) where charge_at <= now(), so this column alone drives the money. It is NOT start of play -- that is first_game_at. Week 1 of 2026 retains its pre-cutover value (Wed 2026-09-09 00:01), already charged.
- `first_game_label` — Display-only. The first game of the week, e.g. "Patriots at Seahawks, 8:20 PM ET". Never parsed; charge_at is the only field any rule reads.
- `is_provisional` — TRUE when the first-game date is not yet locked by the NFL (flex scheduling, Weeks 13-17). The League Calendar stamps these rows; the engine ignores the flag.
- `first_game_at` — Midnight ET on the day of the week's first game. The start-of-play marker the scoreboard reads. Seeded from the pre-cutover charge_at, which held the same day at 00:01. Not the actual kickoff time -- no kickoff feed exists; the commissioner loader can refine it.
- `wire_runs_at` — Waiver run instant, Wednesday 00:00 ET. NULL for weeks with no run: week 1, and week 2 under the September 2026 transition (first run is week 3, Wed 2026-09-23).
- `compliance_at` — Roster and cap compliance measured. Thursday 00:00 ET, except a week whose first game is a Wednesday, which moves to 16:00 ET that Wednesday. 2026: week 12 only.
- `last_game_at` — When end-of-week cut designations fire. Seeded to Monday 23:59 ET, after a normal Monday night finish and before the Tuesday 00:00 pay instant, so a designated player never costs the upcoming week. No NFL game-end feed exists; a postponed Monday game is a commissioner edit to this one value.
- `taxi_reverted_at` — When the automatic taxi revert ran for this week. Stamped once. Its presence is what stops the five-minute cron re-reverting a player the owner has deliberately re-elevated between Tuesday 00:00 and the Thursday compliance instant.
- `counts_toward_taxi_weeks` — Whether a player on the active roster at this week's compliance instant burns one of ruling 29's three weeks of practice squad eligibility. FALSE for 2026 week 1 only -- a one-time grandfather, because the rule was not clear when that week was played. The week counter, when built, MUST honour this rather than counting weeks elapsed.
- `taxi_weeks_credited_at` — When the active-roster week counter ran for this week. Stamped once, so the five-minute cron cannot double-credit.

*Constraints:*

- `league_weeks_week_number_check` — CHECK (((week_number >= 1) AND (week_number <= 14)))

#### `nfl_games` — 1,696 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `game_id` | text | no |  | pk |
| `season_year` | integer | no |  |  |
| `week` | integer | no |  |  |
| `season_type` | text | no | `'REG'::text` |  |
| `game_date` | date | yes |  |  |
| `home_team` | text | yes |  |  |
| `away_team` | text | yes |  |  |
| `kickoff_at` | timestamp with time zone | yes |  |  |
| `home_score` | integer | yes |  |  |
| `away_score` | integer | yes |  |  |
| `schedule_synced_at` | timestamp with time zone | yes |  |  |

*Column notes:*

- `kickoff_at` — Scheduled kickoff (nflverse gameday + gametime, US Eastern). Refreshed from nflverse by edfl_nfl_schedule_refresh_due(), so a flexed or moved game follows the NFL.
- `home_score` — Final home score from nflverse; NULL until the game is final.
- `away_score` — Final away score from nflverse; NULL until the game is final.
- `schedule_synced_at` — When the schedule refresh last changed this row.

*Indexes:* `nfl_games_season_kickoff_idx`

#### `nfl_schedule_refresh_runs` — 14 rows

*SELECT: service role only · RLS on · 0 policies*

> Ledger of the nflverse schedule pulls (pg_net). requested -> applied | failed. Service role only.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `identity by default` | pk |
| `net_request_id` | bigint | yes |  |  |
| `status` | text | no | `'requested'::text` |  |
| `requested_at` | timestamp with time zone | no | `now()` |  |
| `collected_at` | timestamp with time zone | yes |  |  |
| `result` | jsonb | yes |  |  |
| `error_message` | text | yes |  |  |

*Constraints:*

- `nfl_schedule_refresh_runs_status_check` — CHECK ((status = ANY (ARRAY['requested'::text, 'applied'::text, 'failed'::text])))

#### `officer_action_item_state` — 4 rows

*SELECT: service role only · RLS on · 0 policies*

> When each officer action item first appeared and cleared. notified_at is reserved for the email step (not built).

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `item_key` | text | no |  | pk |
| `first_seen_at` | timestamp with time zone | no | `now()` |  |
| `last_seen_at` | timestamp with time zone | no | `now()` |  |
| `cleared_at` | timestamp with time zone | yes |  |  |
| `notified_at` | timestamp with time zone | yes |  |  |
| `last_title` | text | yes |  |  |

#### `owner_profiles` — 10 rows

*SELECT: auth · RLS on · 2 policies*

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

*Column notes:*

- `sleeper_username` — Sleeper handle. Seeded September 6 2026 from the live Sleeper API (league 1382221155657580544 /users), which matched teams.owner_display_name on all ten rows.

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

#### `pending_cuts` — 0 rows

*SELECT: anon, auth · RLS on · 1 policy*

> End-of-week cut designations. The player keeps his roster spot and keeps scoring; the cut fires at fires_at (league_weeks.last_game_at, Monday 23:59 ET) which is 1 minute before the Tuesday pay instant, so a designated player never costs the upcoming week. Visible to all owners by ruling. Withdrawable until it fires. A trade clears the designation rather than carrying it.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `designated_at` | timestamp with time zone | no | `now()` |  |
| `designated_by` | uuid | yes |  |  |
| `fires_at` | timestamp with time zone | no |  |  |
| `fired_at` | timestamp with time zone | yes |  |  |
| `withdrawn_at` | timestamp with time zone | yes |  |  |
| `withdrawn_by` | uuid | yes |  |  |
| `note` | text | yes |  |  |

*Constraints:*

- `pending_cuts_check` — CHECK (((fired_at IS NULL) OR (withdrawn_at IS NULL)))

*Indexes:* `pending_cuts_one_live` (unique) (partial)

#### `player_game_stats` — 33,555 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `nextval('player_game_stats_id_seq'::regclass)` | pk |
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

*Indexes:* `idx_pgs_game`, `idx_pgs_player`

#### `player_id_crosswalk` — 6,187 rows

*SELECT: service role only · RLS on · 0 policies*

> Sleeper player id to NFL GSIS id, one-to-one. Loaded 2026-09-16 for the gsis_id merge (To-Do 6). Read by edfl_fill_gsis_from_crosswalk().

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `sleeper_id` | text | no |  | pk |
| `gsis_id` | text | no |  |  |
| `source` | text | no | `'dynastyprocess/db_playerids'::text` |  |
| `loaded_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `player_id_crosswalk_gsis_id_key` — UNIQUE (gsis_id)

#### `player_value_name_map` — 10 rows

*SELECT: auth · RLS on · 1 policy*

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

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `label` | text | no |  |  |
| `as_of_date` | date | no |  |  |
| `source_note` | text | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `published_at` | timestamp with time zone | yes |  |  |
| `length_multipliers` | numeric[] | no | `ARRAY[1.0, 1.9, 2.7, 3.4, 4.0]` |  |

*Column notes:*

- `published_at` — Set when the chart has been distributed to owners. Unpublished snapshots are invisible to owners and are never auto-selected for a tier.
- `length_multipliers` — The chart methodology's own length curve, used ONLY to restate a chart value at a different contract length. NOT the app's PPV weighting, which is per-component in ppv_weight_table.

*Constraints:*

- `player_value_snapshots_label_key` — UNIQUE (label)
- `player_value_snapshots_multiplier_length` — CHECK ((array_length(length_multipliers, 1) = 5))

#### `player_values` — 2,000 rows

*SELECT: auth · RLS on · 1 policy*

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

- `player_values_chart_position_check` — CHECK ((chart_position = ANY (ARRAY['QB'::text, 'RB'::text, 'WR'::text, 'TE'::text, 'K'::text])))
- `player_values_likely_years_check` — CHECK (((likely_years >= 1) AND (likely_years <= 5)))
- `player_values_match_status_check` — CHECK ((match_status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'ambiguous'::text, 'absent'::text])))
- `player_values_per_year_value_check` — CHECK ((per_year_value >= (0)::numeric))
- `player_values_total_ppv_check` — CHECK ((total_ppv >= (0)::numeric))
- `player_values_unique_in_snapshot` — UNIQUE (snapshot_id, chart_position, chart_name)

*Indexes:* `player_values_review_idx` (partial), `player_values_snapshot_player_idx`

#### `player_week_projections` — 845 rows

*SELECT: auth · RLS on · 1 policy · **no `anon` grant, no write policy** — new September 20 (`phase2g2_01`)*

> Sleeper/Rotowire projected component stats for one player-week, scored by EDFL rules. proj_stats is the frozen input so a scoring change can be recomputed without re-pulling a week Rotowire has overwritten. Phase 2G-2, 2026-09-20.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `week_number` | integer | no |  | pk |
| `player_id` | uuid | no |  | pk fk→`players` (ON DELETE CASCADE) |
| `proj_points` | numeric(8,2) | no | `0` |  |
| `proj_stats` | jsonb | no | `'{}'::jsonb` |  |
| `source` | text | no | `'sleeper/rotowire'::text` |  |
| `scored_with` | integer | yes |  | fk→`edfl_scoring_settings` |
| `synced_at` | timestamp with time zone | no | `now()` |  |
| `synced_by` | uuid | yes |  |  |

*Constraints:*

- `player_week_projections_pkey` — PRIMARY KEY (season_year, week_number, player_id)
- `player_week_projections_player_id_fkey` — FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
- `player_week_projections_scored_with_fkey` — FOREIGN KEY (scored_with) REFERENCES edfl_scoring_settings(id)

*Indexes:* `player_week_projections_week_idx` (season_year, week_number)

Written only by `edfl_sync_week_projections()`; `synced_by` holds `team_owners.id` (§1). `proj_stats`
is Rotowire's object verbatim, `_fd` keys included — **the scorer ignores them** (§0b), and the row
keeps them so the same input can be re-scored if the rule changes again. Week 1: 411 rows, Week 2:
434 — more than the 290 rostered players a week in `player_week_scores`, so the payload the app
sends covers more than EDFL rosters; `edfl_matchup_detail` joins only the rostered ones.

#### `player_week_scores` — 580 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `season_year` | integer | no |  | pk |
| `week_number` | integer | no |  | pk |
| `player_id` | uuid | no |  | pk fk→`players` |
| `team_id` | uuid | no |  | fk→`teams` |
| `points` | numeric | no | `0` |  |
| `roster_status_at_sync` | roster_status | yes |  |  |
| `was_sleeper_starter` | boolean | no | `false` |  |
| `synced_at` | timestamp with time zone | no | `now()` |  |
| `synced_by` | uuid | yes |  |  |

*Indexes:* `player_week_scores_player`, `player_week_scores_team`

#### `players` — 3,212 rows

*SELECT: anon, auth · RLS on · 1 policy*

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
| `injury_status` | text | yes |  |  |
| `injury_body_part` | text | yes |  |  |
| `injury_notes` | text | yes |  |  |
| `injury_start_date` | date | yes |  |  |
| `prev_injury_status` | text | yes |  |  |
| `injury_changed_at` | timestamp with time zone | yes |  |  |

*Column notes:*

- `injury_status` — Sleeper injury_status verbatim (Questionable, Doubtful, Out, IR, PUP, Sus, NA, DNR, COV) or NULL when healthy. Written only by the injury pull. Display only -- never an input to cap, roster or eligibility.
- `prev_injury_status` — The injury_status this row held immediately before the pull that last changed it. With injury_changed_at it is what lets the report say new / changed / cleared.
- `injury_changed_at` — When injury_status last actually CHANGED value. Not "when last examined" -- an unchanged player is not rewritten, so this does not move on every pull.

*Constraints:*

- `players_gsis_id_key` — UNIQUE (gsis_id)
- `players_sleeper_player_id_key` — UNIQUE (sleeper_player_id)

*Indexes:* `players_injury_changed_at_idx` (partial), `players_injury_status_idx` (partial), `players_sleeper_player_id_idx` (unique)

#### `ppv_weight_table` — 7 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*SELECT: anon, auth · RLS on · 1 policy*

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

*SELECT: anon, auth · RLS on · 1 policy*

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

#### `roster_moves` — 108 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `roster_moves_contract_idx`, `roster_moves_player_idx`

#### `scoreboard_sync_runs` — 532 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `week_number` | integer | no |  |  |
| `purpose` | text | no |  |  |
| `requested_at` | timestamp with time zone | no | `now()` |  |
| `net_request_id` | bigint | yes |  |  |
| `status` | text | no | `'requested'::text` |  |
| `collected_at` | timestamp with time zone | yes |  |  |
| `http_status` | integer | yes |  |  |
| `rows_written` | integer | yes |  |  |
| `result` | jsonb | yes |  |  |
| `error_message` | text | yes |  |  |

*Constraints:*

- `scoreboard_sync_runs_purpose_check` — CHECK ((purpose = ANY (ARRAY['live_game'::text, 'live_thu'::text, 'live_sun'::text, 'live_mon'::text, 'tuesday_final'::text, 'wednesday_check'::text, 'manual'::text])))
- `scoreboard_sync_runs_status_check` — CHECK ((status = ANY (ARRAY['requested'::text, 'applied'::text, 'failed'::text])))

*Indexes:* `scoreboard_sync_runs_lookup`, `scoreboard_sync_runs_open` (partial)

#### `sleeper_sync_conflicts` — 299 rows

*SELECT: auth · RLS on · 1 policy*

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

*Column notes:*

- `last_action` — The player's most recent action in the app at detection time, from player_transaction_feed. Null for conflicts with no player (team mapping).

*Constraints:*

- `sleeper_sync_conflicts_res_ck` — CHECK (((resolution IS NULL) OR (resolution = ANY (ARRAY['app_wins'::text, 'sleeper_wins'::text, 'worklist'::text, 'acknowledged'::text, 'deferred'::text]))))
- `sleeper_sync_conflicts_sev_ck` — CHECK ((severity = ANY (ARRAY['blocking'::text, 'advisory'::text])))

*Indexes:* `sleeper_sync_conflicts_run_idx`, `sleeper_sync_conflicts_run_sev_idx`

#### `sleeper_sync_runs` — 19 rows

*SELECT: auth · RLS on · 1 policy*

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
| `contracts_digest` | text | yes |  |  |

*Column notes:*

- `contracts_digest` — Digest of contract membership and placement at sleeper_sync_open. Compared in guard EDFS2 at apply, because a deleted contract moves no timestamp maximum. NULL on runs opened before September 13 2026; the guard skips the comparison rather than refusing a run it cannot compare.

*Constraints:*

- `sleeper_sync_runs_status_ck` — CHECK ((status = ANY (ARRAY['staged'::text, 'detected'::text, 'adjudicated'::text, 'applied'::text, 'abandoned'::text])))

*Indexes:* `sleeper_sync_runs_one_open_idx` (unique) (partial)

#### `sleeper_sync_staging` — 380 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | bigint | no | `nextval('sleeper_sync_staging_id_seq'::regclass)` | pk |
| `run_id` | uuid | no |  | fk→`sleeper_sync_runs` |
| `feed` | text | no |  |  |
| `natural_key` | text | no |  |  |
| `payload` | jsonb | no |  |  |

*Constraints:*

- `sleeper_sync_staging_feed_ck` — CHECK ((feed = ANY (ARRAY['rosters'::text, 'players'::text, 'users'::text, 'stats'::text])))
- `sleeper_sync_staging_run_id_feed_natural_key_key` — UNIQUE (run_id, feed, natural_key)

*Indexes:* `sleeper_sync_staging_run_feed_idx`

#### `taxi_active_locks` — 0 rows

*SELECT: anon, auth · RLS on · 1 policy*

> TM 3.3(i): one row per player per season once the three-week counter forces him to stay on the active roster. Keyed on player_id like taxi_week_credits, so a trade cannot wash it off. Voided only by clearing waivers.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `week_number` | integer | yes |  |  |
| `locked_at` | timestamp with time zone | no | `now()` |  |
| `trigger_kind` | text | no |  |  |
| `contract_type_from` | contract_type | no |  |  |
| `contract_type_to` | contract_type | no |  |  |
| `voided_at` | timestamp with time zone | yes |  |  |
| `voided_reason` | text | yes |  |  |

*Constraints:*

- `taxi_active_locks_trigger_kind_check` — CHECK ((trigger_kind = ANY (ARRAY['promotion'::text, 'fourth_week'::text, 'poach_defense'::text])))

*Indexes:* `taxi_active_locks_contract_idx`, `taxi_active_locks_one_live_per_player_season` (unique) (partial), `taxi_active_locks_team_idx`

#### `taxi_week_credits` — 86 rows (43 live, 43 voided)

*SELECT: anon, auth · RLS on · 1 policy*

> One row per player per week spent on an active roster at that week's compliance instant. Three in a season ends practice squad eligibility permanently (ruling 29). Keyed on player_id so a trade or waiver claim cannot reset the count.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `week_number` | integer | no |  |  |
| `counted_at` | timestamp with time zone | no |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `voided_at` | timestamp with time zone | yes |  |  |
| `voided_reason` | text | yes |  |  |

*Column notes:*

- `voided_at` — Set when the player cleared waivers, which resets his active-roster counter to zero. The row stays for audit; edfl_taxi_weeks_used and edfl_taxi_eligibility_spent ignore it.

**The column comment is narrower than the data now.** All 86 rows are Week 2 credits written at
00:00 ET September 17; the 43 voided ones were not cleared waivers but `psclass_05`'s correction —
credits written for 2023- and 2024-class rookies by a counter that keyed on `contract_type` — and
carry a `voided_reason` beginning `psclass_05:`. The 43 live rows are 26 for the 2025 class, 16 for
the 2026 class and 1 practice squad contract. Void, never delete: the rows are the evidence.

*Constraints:*

- `taxi_week_credits_player_id_season_year_week_number_key` — UNIQUE (player_id, season_year, week_number)

#### `team_cash_budgets` — 10 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `season_year` | integer | no |  |  |
| `starting_cash` | numeric | no |  |  |

*Constraints:*

- `team_cash_budgets_one_per_season` — UNIQUE (team_id, season_year)

#### `team_cash_transactions` — 12 rows

*SELECT: anon, auth · RLS on · 1 policy*

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
| `fine_kind` | text | yes |  |  |
| `source_id` | uuid | yes |  |  |

*Constraints:*

- `team_cash_transactions_category_check` — CHECK ((category = ANY (ARRAY['cash_purchase'::text, 'penalty'::text, 'adjustment'::text, 'other'::text, 'fine'::text])))
- `team_cash_transactions_fine_kind_check` — CHECK ( CASE WHEN (category = 'fine'::text) THEN (COALESCE(fine_kind, ''::text) = ANY (ARRAY['compliance'::text, 'poach'::text])) ELSE (fine_kind IS NULL) END)

#### `team_owners` — 10 rows

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `team_id` | uuid | no |  | fk→`teams` |
| `email` | text | no |  |  |
| `user_id` | uuid | yes |  |  |
| `is_commissioner` | boolean | no | `false` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `is_co_commissioner` | boolean | no | `false` |  |

*Column notes:*

- `is_co_commissioner` — Co-commissioner. Mirrors commissioner authority except the Player Value Chart (publish, map, and unpublished visibility), the Sleeper/stats data pipeline, and granting roles. Rule 7.7(c) gives equal authority to approve trades; 7.7(e) recusal applies to co-commissioners exactly as to the commissioner.

*Constraints:*

- `team_owners_email_key` — UNIQUE (email)
- `team_owners_team_id_key` — UNIQUE (team_id)
- `team_owners_user_id_key` — UNIQUE (user_id)

#### `team_week_scores` — 20 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `team_week_scores_matchup_idx`

#### `teams` — 10 rows

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `sleeper_team_name` — Sleeper metadata.team_name, written by Sleeper Sync. teams.name is the app's own name and is never overwritten from Sleeper. owner_display_name holds the owner Sleeper handle, a different field.
- `division` — Sleeper settings.division. Cosmetic: standings rank on overall record then points for (ruling, Sep 7 2026).

*Constraints:*

- `teams_sleeper_roster_id_unique` — UNIQUE (sleeper_roster_id)

#### `trade_assets` — 100 rows at v2.2, not re-read (a draft trade is sealed to its proposer)

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `player_id` — Stored deliberately rather than derived through contract_id: a trade ends the outgoing contract and creates a new one, so contract identity does not survive a move. Trade-back detection under 7.4(a) follows the player.

*Constraints:*

- `trade_asset_moves` — CHECK ((from_team_id <> to_team_id))
- `trade_asset_shape` — CHECK ((((asset_type = 'player'::trade_asset_type) AND (contract_id IS NOT NULL) AND (player_id IS NOT NULL) AND (draft_pick_id IS NULL)) OR ((asset_type = 'pick'::trade_asset_type) AND (draft_pick_id IS NOT NULL) AND (contract_id IS NULL) AND (player_id IS NULL))))

*Indexes:* `trade_assets_player_idx`, `trade_assets_trade_idx`

#### `trade_parties` — 54 rows at v2.2, not re-read (a draft trade is sealed to its proposer)

*SELECT: anon, auth · RLS on · 1 policy*

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

*Indexes:* `trade_parties_trade_idx`

#### `trades` — 27 rows at v2.2, not re-read (a draft trade is sealed to its proposer)

*SELECT: anon, auth · RLS on · 1 policy*

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

*Column notes:*

- `effective_at` — The instant the last party concurred. Commissioner ruling of August 24, 2026: cap and cash implications freeze here, NOT at commissioner approval. Passed verbatim to compute_trade_charges().
- `reversed_at` — Set by reverse_trade(). The trade remains on the public record; executed_at is never cleared.

*Indexes:* `trades_status_idx`

#### `waiver_claims` — rows not read (sealed, SR-31)

*SELECT: anon, auth · RLS on · 1 policy*

> SEALED. Same posture as free_agent_offers: an owner sees only his own until the run executes. The commissioner is a competing owner and gets no read while a run is open -- note that Supabase MCP runs as service role and bypasses RLS entirely, so no MCP query may touch this table between a run opening and executing.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `run_id` | uuid | no |  | fk→`waiver_runs` |
| `placement_id` | uuid | no |  | fk→`waiver_placements` |
| `team_id` | uuid | no |  | fk→`teams` |
| `team_rank` | integer | no |  |  |
| `conditional_cut_contract_id` | uuid | yes |  | fk→`contracts` |
| `status` | text | no | `'pending'::text` |  |
| `voided_reason` | text | yes |  |  |
| `submitted_at` | timestamp with time zone | no | `now()` |  |
| `created_by` | uuid | yes |  |  |

*Constraints:*

- `waiver_claims_rank_unique` — UNIQUE (run_id, team_id, team_rank) DEFERRABLE INITIALLY DEFERRED
- `waiver_claims_run_id_team_id_placement_id_key` — UNIQUE (run_id, team_id, placement_id)
- `waiver_claims_status_check` — CHECK ((status = ANY (ARRAY['pending'::text, 'awarded'::text, 'passed_over'::text, 'voided_cash'::text, 'voided_cap'::text, 'voided_roster'::text, 'withdrawn'::text])))
- `waiver_claims_team_rank_check` — CHECK ((team_rank >= 1))

#### `waiver_placements` — 1 row

*SELECT: anon, auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `player_id` | uuid | no |  | fk→`players` |
| `waived_by_team_id` | uuid | no |  | fk→`teams` |
| `waived_at` | timestamp with time zone | no | `now()` |  |
| `run_id` | uuid | no |  | fk→`waiver_runs` |
| `weeks_charged_at_waive` | integer | no |  |  |
| `outcome` | text | no | `'pending'::text` |  |
| `awarded_to_team_id` | uuid | yes |  | fk→`teams` |
| `resolved_at` | timestamp with time zone | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `notes` | text | yes |  |  |

*Column notes:*

- `weeks_charged_at_waive` — Weeks charged at the instant of the waive, frozen. The settlement reads THIS, never a live count off league_weeks. Ruling of 2026-09-13: a team is not charged for a player it has waived, and the Tuesday pay instant falls between a weekend waive and the Wednesday run -- a live count would sweep that week up on the way past.

*Constraints:*

- `waiver_placements_check` — CHECK (((outcome <> 'claimed'::text) OR (awarded_to_team_id IS NOT NULL)))
- `waiver_placements_check1` — CHECK (((outcome = 'pending'::text) OR (resolved_at IS NOT NULL)))
- `waiver_placements_outcome_check` — CHECK ((outcome = ANY (ARRAY['pending'::text, 'claimed'::text, 'cleared'::text, 'withdrawn'::text])))
- `waiver_placements_weeks_charged_at_waive_check` — CHECK (((weeks_charged_at_waive >= 0) AND (weeks_charged_at_waive <= 14)))

*Indexes:* `waiver_placements_one_pending` (unique) (partial), `waiver_placements_run_idx`

#### `waiver_runs` — 12 rows

*SELECT: anon, auth · RLS on · 1 policy*

> One row per scheduled waiver run. Seeded from league_weeks.wire_runs_at. priority_snapshot freezes waiver_priority_order() at the run instant so a later scoring correction cannot retroactively change who won.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | pk |
| `season_year` | integer | no |  |  |
| `week_number` | integer | no |  |  |
| `runs_at` | timestamp with time zone | no |  |  |
| `status` | text | no | `'scheduled'::text` |  |
| `executed_at` | timestamp with time zone | yes |  |  |
| `executed_by` | uuid | yes |  |  |
| `priority_snapshot` | jsonb | yes |  |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:*

- `waiver_runs_season_year_week_number_key` — UNIQUE (season_year, week_number)
- `waiver_runs_status_check` — CHECK ((status = ANY (ARRAY['scheduled'::text, 'executed'::text, 'cancelled'::text])))

### The bot and market tables — twelve, new September 19

*Grouped rather than interleaved alphabetically, because they arrived together and are read
together. Everything above this line predates them.*

#### `discord_broadcasts` — 515 rows

*SELECT: none · RLS on · **0 policies** — only `mort_dispatch()` reads it*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `log_id` | text | no |  | pk |
| `kind` | text | yes |  |  |
| `posted_at` | timestamp with time zone | no | `now()` |  |
| `request_id` | bigint | yes |  |  |

*Indexes:* `discord_broadcasts_posted_at_idx`

#### `mort_kinds` — 15 rows, all enabled

*SELECT: none · RLS on · **0 policies***

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `kind` | text | no |  | pk |
| `enabled` | boolean | no | `false` |  |
| `note` | text | yes |  |  |
| `sort_rank` | integer | no | `0` |  |

**`enabled` defaults to `false`.** A new transaction kind is silent until a migration turns it on —
deliberate, so a kind added for another purpose does not start narrating itself to the league.

#### `trade_blocks` — 1 row

*SELECT: auth, `dianna` · RLS on · 2 policies*

> Rule 7.9 trade block. One LIVE row per contract (`removed_at` is null). Re-checking closes the old row with `removed_reason=reset` and inserts a fresh one, so TB-9 resets the clock and history is kept. `source=insider` marks a block placed by an Insider Threat shop submission (TB-15). Liveness is NOT a column and NOT a function on this table: `trade_block_status` computes `is_live` as contract still active AND NOT `edfl_on_waivers(contract)` AND `trade_block_falloff_at(checked_at, player)` IS NULL.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `block_id` | uuid | no | `gen_random_uuid()` | pk |
| `contract_id` | uuid | no |  | fk→`contracts` |
| `team_id` | uuid | no |  | fk→`teams` |
| `placed_by` | uuid | no |  | fk→`team_owners` |
| `checked_at` | timestamp with time zone | no | `now()` |  |
| `removed_at` | timestamp with time zone | yes |  |  |
| `removed_reason` | text | yes |  |  |
| `source` | text | no | `'card'::text` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |

*Constraints:* `removed_reason` ∈ (`owner`, `reset`) · `source` ∈ (`card`, `insider`)

*Indexes:* `trade_blocks_one_live_per_contract` (unique, partial), `trade_blocks_team_live`

#### `watchlist_markers` — rows not read (sealed, SR-31)

*SELECT: auth · RLS on · 1 policy · **sealed group** (§2)*

> Rule 7.9 watchlist. Player-scoped interest, one LIVE row per (player, team). `visibility`: private (unattributed), shared (the team holding the player at the time is shown), league (any signed-in owner). WL-5: a shared marker reverts to private when the player changes team — computed by comparing `shared_with_team_id` to the current holder, never rewritten. **SEALED GROUP (SR-31): there is NO commissioner read on private rows.** Dianna is granted NOTHING on this table, its views or any aggregate of it (WL-10).

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `marker_id` | uuid | no | `gen_random_uuid()` | pk |
| `player_id` | uuid | no |  | fk→`players` |
| `owner_id` | uuid | no |  | fk→`team_owners` |
| `team_id` | uuid | no |  | fk→`teams` |
| `visibility` | text | no |  |  |
| `shared_with_team_id` | uuid | yes |  | fk→`teams` |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `updated_at` | timestamp with time zone | no | `now()` |  |
| `removed_at` | timestamp with time zone | yes |  |  |

*Constraints:* `visibility` ∈ (`private`, `shared`, `league`) · a `shared` marker requires `shared_with_team_id`

*Indexes:* `watchlist_one_live_per_player_team` (unique, partial), `watchlist_player_live`

#### `draft_prospect_classes` — 0 rows

*SELECT: auth, `dianna` · RLS on · 2 policies*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `class_year` | integer | no |  | pk |
| `opened_at` | timestamp with time zone | no | `now()` |  |
| `opened_by` | uuid | yes |  | fk→`team_owners` |
| `rolled_at` | timestamp with time zone | yes |  | fk→`team_owners` |
| `rolled_by` | uuid | yes |  | fk→`team_owners` |
| `note` | text | yes |  |  |

*Indexes:* `draft_prospect_classes_one_open` — **one open class at a time**

#### `draft_prospects` — 0 rows

*SELECT: auth, `dianna` · RLS on · 2 policies*

> Rookie draft prospect board, spec §4.7. Source: ESPN draft API, refreshed by the Commissioner Portal button (no cron: both Vercel Hobby slots are spent). `matched_player_id` is set when Sleeper adds the rookie (PR-1). Rows are never deleted; a class is rolled by `draft_prospect_classes.rolled_at`.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `prospect_id` | uuid | no | `gen_random_uuid()` | pk |
| `class_year` | integer | no |  | fk→`draft_prospect_classes` |
| `espn_athlete_id` | text | no |  |  |
| `full_name` | text | no |  |  |
| `position` | text | no |  |  |
| `college` · `height` · `weight` | text | yes |  |  |
| `espn_grade` | numeric | yes |  |  |
| `espn_overall_rank` · `espn_position_rank` | integer | yes |  |  |
| `nfl_team` | text | yes |  |  |
| `draft_round` · `draft_overall` | integer | yes |  |  |
| `matched_player_id` | uuid | yes |  | fk→`players` |
| `matched_at` · `first_seen_at` · `refreshed_at` | timestamp with time zone |  | `now()` |  |

*Constraints:* UNIQUE (class_year, espn_athlete_id) · `position` ∈ (QB, RB, WR, TE, K) — **PR-3**

**The board is empty until an officer presses Refresh.** ESPN's 2027 class was not published on
September 19. A prospect exists **only** here and in Insider Threat rumours — never a contract,
never a roster slot, never a substitute for a Sleeper player.

#### `insider_submissions` — rows not read (sealed, SR-31)

*SELECT: auth (own team only) · RLS on · 1 policy · **sealed group** (§2)*

> Insider Threat submissions (spec §4.4). One claim per row. Source attribution is governed by `veracity` and reaches the league ONLY when `on_record`. `dianna_copy` is optional model-written prose with `{player}`/`{team}`/`{pick}`/`{about}` placeholders filled before `publish_after` (IT-7). **NEVER written to the transaction log** (§5.4).

| Column | Type | Null | Default |
|---|---|---|---|
| `submission_id` | uuid | no | `gen_random_uuid()` |
| `submitted_by` · `team_id` | uuid | no |  |
| `subject_kind` | text | no |  |
| `player_id` · `pick_id` · `prospect_id` | uuid | yes |  |
| `direction` | text | no |  |
| `about_team_id` | uuid | yes |  |
| `veracity` | text | no |  |
| `willing_to_give` · `seeking` | text | yes |  |
| `publish_delay` | text | no |  |
| `submitted_at` | timestamp with time zone | no | `now()` |
| `publish_after` | timestamp with time zone | no |  |
| `withdrawn_at` · `withdrawn_reason` |  | yes |  |
| `block_id` | uuid | yes |  |
| `dianna_copy` | text | yes |  |

*Constraints — the rulings are enforced here, not in the form:*

- `insider_one_subject` — exactly one of `player_id` / `pick_id` / `prospect_id`
- `insider_direction_legal` — `acquire`/`shop` take a player or a pick; `sign_fa`/`release` a player; `draft` a prospect
- `insider_third_party_is_leak` — **IT-3**: a claim about another team's intentions is only ever `leak`
- `insider_about_not_self` — you cannot file a third-party leak about yourself
- `veracity` ∈ (`leak`, `off_record`, `on_record`) — **IT-4** maps these to Maybe / Likely / Confirmed
- `publish_delay` ∈ (`now`, `tonight`, `this_week`) — **IT-2**
- `insider_text_bounds` — 280 / 280 / 1500

#### `insider_broadcasts` — 1 row

*SELECT: none · RLS on · **0 policies***

> The morgue for Dianna (spec §6.3): what has already been said. PK on `submission_id` makes a repeat impossible. Content is kept so the Media tab feed can mirror the channel.

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `submission_id` | uuid | no |  | pk fk→`insider_submissions` |
| `posted_at` | timestamp with time zone | no | `now()` |  |
| `request_id` | bigint | yes |  |  |
| `strength` | text | no |  |  |
| `content` | text | no |  |  |

*Constraints:* `strength` ∈ (`solo`, `multiple`, `league`)

#### `goodell_kinds` — 5 rows, all enabled

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `kind` | text | no |  | pk |
| `enabled` | boolean | no | `true` |  |
| `note` | text | yes |  |  |
| `sort_rank` | integer | no | `100` |  |

The five: `event_7d`, `event_1d`, `event_now`, `fine`, `memo`. **Unlike `mort_kinds`, these default
to enabled** — the set is closed and named by the build, not discovered from a feed.

#### `goodell_broadcasts` — 0 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `broadcast_key` | text | no |  | pk |
| `kind` | text | no |  | fk→`goodell_kinds` |
| `subject_id` | uuid | yes |  |  |
| `posted_at` | timestamp with time zone | no | `now()` |  |
| `request_id` | bigint | yes |  |  |
| `content` | text | yes |  |  |

**`broadcast_key` is the whole design.** `evt:<event uuid>:7d` / `:1d` / `:now`, `fine:<cash tx
uuid>`, `memo:<memo uuid>`. A text primary key is what makes "say it exactly once" a constraint
rather than a convention, and it is why one calendar event can be announced three times without
three ledgers.

#### `goodell_memos` — 0 rows

*SELECT: auth · RLS on · 1 policy — **officer read only***

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `memo_id` | uuid | no | `gen_random_uuid()` | pk |
| `drafted_by` | uuid | no |  | fk→`team_owners` |
| `body` | text | no |  |  |
| `publish_after` | timestamp with time zone | no | `now()` |  |
| `created_at` | timestamp with time zone | no | `now()` |  |
| `withdrawn_at` | timestamp with time zone | yes |  |  |

*Constraints:* `goodell_memos_body_len` — trimmed body between 1 and **1,800** characters

**`drafted_by` holds `team_owners.id`, like every other `*_by` column** (§1). It did not when this
cut started — it defaulted to `auth.uid()`, which would have made it the single column in the schema
breaking that invariant. `goodell_08` dropped the default, added the foreign key and moved the
resolution into `goodell_memo_submit()`. Tested both ways: a login uuid is now refused by the key,
and an insert omitting the column fails rather than quietly storing one.

#### `goodell_phrases` — 40 rows

*SELECT: auth · RLS on · 1 policy*

| Column | Type | Null | Default | Key |
|---|---|---|---|---|
| `kind` | text | no |  | pk |
| `slot` | text | no |  | pk |
| `sort_rank` | integer | no |  | pk |
| `phrase` | text | no |  |  |

Four openers and four closers for each of the five kinds. **Editing a phrase changes what past
broadcasts would say but not what they said** — `goodell_broadcasts.content` stores the rendered
text, so the channel and the app feed always agree with each other and with history.

### Backup tables — RLS on, zero policies, no grant. Do not read.

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
| `contract_type` | `rookie`, `fifth_year_option`, `veteran_free_agent`, `practice_squad`, `franchise_tag_exclusive`, `franchise_tag_non_exclusive`, `transition_tag`, `playoff` |
| `roster_status` | `active`, `taxi`, `ir` |
| `trade_asset_type` | `player`, `pick` |
| `trade_status` | `draft`, `proposed`, `accepted`, `approved`, `executed`, `declined`, `vetoed`, `cancelled`, `expired`, `reversed` |

`roster_status` has **no `suspended`**. `contract_status` has **no `waived`** — an in-season cut
keeps `status = 'active'` while the player sits on the wire, and `edfl_on_waivers()` is what every
occupancy count asks. `expired` is set by `advance_league_year` and by nothing else. `extended` has
no matching event type (SR-46).

`contract_type` holds `playoff` (TM 5.15(l); no row uses it and no behaviour is built) and the three
tag types (no tag system is built; `check_contract_30pct_rule` names none of them — SR-35). **Never
key behaviour on `contract_type` where a reason column exists**: the 30% Rule keys on
`contract_years.added_by` through `edfl_30pct_exempt_reason()`, and in-season pro-ration keys on
`contracts.first_season_week` being non-null.

Most status vocabularies are **text with a CHECK**, not enums — `free_agent_windows.status`
(`open`, `closed`, `resolved`, `void`), `window_kind` (`free_agency`, `poach`), `outcome`,
`waiver_placements.outcome` (`pending`, `claimed`, `cleared`, `withdrawn`),
`taxi_active_locks.trigger_kind` (`promotion`, `fourth_week`, `poach_defense`),
`team_cash_transactions.category` and `fine_kind`, and `commissioner_actions.action_type`, which has
no constraint at all. The CHECK text is in §5.

---

## 7. Triggers and scheduled jobs

### Triggers — 38 (10 constraint triggers)

A **constraint trigger** here is `DEFERRABLE INITIALLY DEFERRED`: it runs at `COMMIT`, not at the
statement. A transaction-local flag set and then cleared before commit is already gone when it
fires — that exact bug shipped in `resolve_fa_window` and was caught only by a control test
(`freeagency_04`). `execute_trade` sets its flag once and never clears it for the same reason. The
reverse technique is also in use: `edfl_fa_award_window` runs
`set constraints enforce_cap_ceiling immediate` so the ceiling fires inside the award's savepoint and
a refusal passes the offer over instead of aborting the resolution (DT-5).

A rolled-back test never fires deferred triggers unless it sets them `immediate` first, so the first
run of any such test passes vacuously.

`check_poach_freeze` is attached four times (`contracts` UPDATE of status, team, roster status or
type; `contract_restructure_bonuses`, `pending_cuts` and `waiver_placements` INSERT): while a poach
window is open on a player he cannot be moved, cut, traded or restructured (PF-4). The award itself
passes through on `edfl_poach_award_in_progress()`.

| Table | Trigger | Function | Timing and events | Constraint? |
|---|---|---|---|---|
| `auction_tiers` | `auction_tiers_lock_snapshot_trg` | `auction_tiers_lock_snapshot` | BEFORE UPDATE | — |
| `bid_delegation_settings` | `bid_delegation_settings_touch_trg` | `bid_delegation_settings_touch` | BEFORE UPDATE | — |
| `bid_delegations` | `bid_delegations_validate_context_trg` | `bid_delegations_validate_context` | BEFORE INSERT or UPDATE | — |
| `bid_delegations` | `enforce_delegation_30pct_insert` | `bid_delegations_check_30pct` | BEFORE INSERT | — |
| `bid_delegations` | `enforce_delegation_30pct_update` | `bid_delegations_check_30pct` | BEFORE UPDATE, with a WHEN clause | — |
| `bid_option_bonuses` | `auto_bid_option_void_years` | `trg_rebuild_bid_option_void_years` | AFTER INSERT or DELETE or UPDATE | — |
| `bid_option_bonuses` | `enforce_bid_30pct_rule_ob` | `check_bid_30pct_rule` | AFTER INSERT or DELETE or UPDATE, deferred | **yes** |
| `bid_option_bonuses` | `enforce_bid_option_bonus_year` | `check_bid_option_bonus_year` | BEFORE INSERT or UPDATE | — |
| `bid_years` | `enforce_bid_30pct_rule` | `check_bid_30pct_rule` | AFTER INSERT or UPDATE, deferred | **yes** |
| `bid_years` | `enforce_bid_deion_rule` | `check_bid_deion_rule` | AFTER INSERT or UPDATE, deferred | **yes** |
| `bid_years` | `enforce_bid_minimum_salary` | `check_bid_minimum_salary` | AFTER INSERT or UPDATE, deferred | **yes** |
| `bids` | `bids_supersede_delegation_trg` | `bids_supersede_delegation` | AFTER INSERT or UPDATE | — |
| `contract_option_bonuses` | `auto_option_void_years` | `trg_rebuild_option_void_years` | AFTER INSERT or DELETE or UPDATE | — |
| `contract_option_bonuses` | `enforce_contract_30pct_rule_ob` | `check_contract_30pct_rule` | AFTER INSERT or DELETE or UPDATE, deferred | **yes** |
| `contract_option_bonuses` | `enforce_option_bonus_contract_type` | `check_option_bonus_contract_type` | BEFORE INSERT | — |
| `contract_option_bonuses` | `enforce_option_bonus_not_year1` | `check_option_bonus_not_year1` | BEFORE INSERT | — |
| `contract_restructure_bonuses` | `enforce_poach_freeze` | `check_poach_freeze` | BEFORE INSERT | — |
| `contract_restructure_bonuses` | `trg_deion_on_restructure` | `check_deion_rule_on_restructure` | AFTER INSERT or DELETE or UPDATE, deferred | **yes** |
| `contract_years` | `enforce_cap_ceiling` | `check_cap_ceiling` | AFTER INSERT or UPDATE, deferred | **yes** |
| `contract_years` | `enforce_contract_30pct_rule` | `check_contract_30pct_rule` | AFTER INSERT or UPDATE, deferred | **yes** |
| `contract_years` | `enforce_contract_minimum_salary` | `check_contract_minimum_salary` | AFTER INSERT or UPDATE, deferred | **yes** |
| `contract_years` | `enforce_deion_rule` | `check_deion_rule` | AFTER INSERT or UPDATE, deferred | **yes** |
| `contract_years` | `enforce_inseason_signing_no_roster_bonus` | `check_inseason_signing_no_roster_bonus` | BEFORE INSERT or UPDATE | — |
| `contract_years` | `enforce_practice_squad_value` | `check_practice_squad_value` | BEFORE INSERT or UPDATE | — |
| `contracts` | `enforce_first_season_week_rules` | `check_first_season_week_rules` | BEFORE INSERT or UPDATE | — |
| `contracts` | `enforce_poach_freeze` | `check_poach_freeze` | BEFORE UPDATE | — |
| `contracts` | `enforce_taxi_eligibility` | `check_taxi_eligibility` | BEFORE INSERT or UPDATE | — |
| `contracts` | `enforce_taxi_slot_limits` | `check_taxi_slot_limits` | BEFORE INSERT or UPDATE | — |
| `contracts` | `trg_log_roster_move` | `log_roster_move` | AFTER UPDATE OF roster_status, with a WHEN clause | — |
| `contracts` | `trg_taxi_lock_on_promotion` | `taxi_lock_on_promotion` | BEFORE UPDATE, with a WHEN clause | — |
| `owner_profiles` | `owner_profiles_touch` | `trg_owner_profiles_touch` | BEFORE UPDATE | — |
| `pending_cuts` | `enforce_poach_freeze` | `check_poach_freeze` | BEFORE INSERT | — |
| `players` | `trg_players_fill_ids` | `players_fill_ids_from_crosswalk` | BEFORE INSERT or UPDATE OF gsis_id, sleeper_player_id | — |
| `sleeper_sync_conflicts` | `sleeper_sync_conflicts_last_action` | `trg_sleeper_sync_last_action` | BEFORE INSERT | — |
| `team_cash_transactions` | `log_cash_transaction` | `log_cash_transaction_action` | AFTER INSERT | — |
| `waiver_placements` | `enforce_poach_freeze` | `check_poach_freeze` | BEFORE INSERT | — |
| `waiver_placements` | `trg_taxi_credits_reset_on_clearance` | `taxi_credits_reset_on_clearance` | AFTER UPDATE | — |
| `auth.users` | `on_auth_user_confirmed_link_team_owner` | `link_team_owner_on_signup` | AFTER INSERT or UPDATE OF email_confirmed_at, email | — |

### Scheduled jobs — 14 `pg_cron` jobs

`pg_cron` runs in UTC and the Eastern offset moves on November 1. **Every window lives in the
job's due-check, in Eastern local time, never in the cron expression (SR-50)** — a short fixed tick
plus a local-time test survives DST untouched and heals a missed tick. Wire-gated jobs return
`{"skipped": "wire dark"}` while `edfl_wire_live()` is false (the wire has been live since
`league_config.wire_starts_at`, 00:00 ET September 15).

| Job | Schedule (UTC) | Calls | What |
|---|---|---|---|
| `edfl_compliance_cure` | `*/5 * * * *` | `compliance_cure_check_due()` | Checks whether a violation was cured by its deadline |
| `edfl_compliance_sweep` | `*/5 * * * *` | `compliance_sweep_due()` | The weekly roster and cap sweep at the compliance instant (wire-gated) |
| `edfl_crosswalk_refresh` | `23 * * * *` | `edfl_crosswalk_refresh_due()` | Weekly crosswalk reload; the due-check is inside |
| `edfl_fines_impose` | `*/5 * * * *` | `fines_impose_due()` | Imposes uncured fines (`fine_kind = compliance`) |
| `edfl_nfl_schedule_refresh` | `41 * * * *` | `edfl_nfl_schedule_refresh_due()` | nflverse schedule and scores: every 6 hours September through mid-February, daily otherwise; one-hour back-off after a failure |
| `edfl_officer_action_items` | `*/15 * * * *` | `edfl_officer_action_items_refresh()` | Refreshes the banner state table |
| `edfl_pending_cuts` | `*/5 * * * *` | `pending_cuts_fire_due()` | Fires End-of-week designations at `last_game_at` |
| `edfl_scoreboard_sync` | `*/2 * * * *` | `edfl_scoreboard_sync_due()` | Sleeper matchups: kickoff windows, Thu/Sun/Mon evenings, Tue and Wed 17:00 recaps |
| `edfl_taxi_revert` | `*/5 * * * *` | `taxi_revert_due()` | Tuesday practice squad returns |
| `edfl_taxi_weeks` | `*/5 * * * *` | `taxi_weeks_credit_due()` | Practice squad week credits and lock limb B |
| `edfl_waiver_runs` | `*/5 * * * *` | `waiver_runs_apply_due()` | Executes each Wednesday 00:00 run |
| `mort-report-wire` | `*/5 * * * *` | `mort_dispatch()` | Mort_Report → `#mort-report`: the transaction log |
| `dianna-wire` | `*/5 * * * *` | `dianna_dispatch()` | Dianna → `#insider-threat`: published Insider Threat submissions |
| `goodell-wire` | `*/5 * * * *` | `goodell_dispatch()` | Robo Goodell → `#league-office`: calendar notices, fines, memos |

**The three bot jobs share one safety property and it is the reason they can be left running.**
Each returns immediately, and **marks nothing**, while its Vault webhook secret is absent; and each
refuses anything older than a 24-hour age floor. So a wire whose channel does not exist yet is
silent rather than queueing, and turning one on never replays history. The secrets are
`discord_mort_webhook`, `discord_dianna_webhook` and `discord_goodell_webhook`; they are stored from
the SQL editor and are not readable from any client, which is why `goodell_wire_status()` exists.

Extensions: `btree_gist` 1.7 (`public`), `pg_cron` 1.6.4 (`pg_catalog`), `pg_net` 0.20.3 (`public`), `pg_stat_statements` 1.11 (`extensions`), `pgcrypto` 1.3 (`extensions`), `plpgsql` 1.0 (`pg_catalog`), `supabase_vault` 0.3.1 (`vault`), `uuid-ossp` 1.1 (`extensions`).

`pg_net` is asynchronous: `net.http_get` returns a request id and the body lands in
`net._http_response`. The three fetching jobs (`edfl_scoreboard_sync`, `edfl_nfl_schedule_refresh`,
`edfl_crosswalk_refresh`) each collect the previous tick's request before issuing their own, and
keep a ledger (`scoreboard_sync_runs`, `nfl_schedule_refresh_runs`, `crosswalk_refresh_runs`:
`requested` → `applied` / `failed`). A failed or stalled ledger surfaces on the officer banner.

**Outside the database:** the nightly injury pull is a Vercel cron (`/api/cron/injury-sync`), and a
Vercel cron cannot follow Eastern time either — the repo schedules it at 21:00 and 22:00 UTC and the
route runs only in the 17:00 ET hour. It writes through `apply_injury_sync()`.

---

## 8. RLS policies — 77

| Table | Policy | Cmd | Roles | USING / WITH CHECK |
|---|---|---|---|---|
| `auction_tier_players` | `auction_tier_players_public_read` | SELECT | PUBLIC | `true` |
| `auction_tiers` | `auction_tiers_select` | SELECT | PUBLIC | `true` |
| `bid_delegation_settings` | `bid_delegation_settings_select` | SELECT | PUBLIC | `(team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid())))` |
| `bid_delegations` | `bid_delegations_select` | SELECT | PUBLIC | `(team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid())))` |
| `bid_interest_levels` | `bid_interest_levels_select` | SELECT | PUBLIC | `true` |
| `bid_option_bonuses` | `bid_option_bonuses_select` | SELECT | PUBLIC | `(EXISTS ( SELECT 1 FROM bids WHERE (bids.id = bid_option_bonuses.bid_id)))` |
| `bid_player_hides` | `bid_player_hides_delete` | DELETE | PUBLIC | `(team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid())))` |
| `bid_player_hides` | `bid_player_hides_insert` | INSERT | PUBLIC | CHECK `(team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid())))` |
| `bid_player_hides` | `bid_player_hides_select` | SELECT | PUBLIC | `(team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid())))` |
| `bid_withdrawals` | `bid_withdrawals_select` | SELECT | PUBLIC | `((team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid()))) OR (is_commissioner_or_co(auth.uid()) AND (EXISTS ( SELECT 1 FROM auction_tiers t WHERE ((t.id = bid_withdrawals.tier_id) AND (t.closes_at <= now()))))))` |
| `bid_years` | `bid_years_select` | SELECT | PUBLIC | `(EXISTS ( SELECT 1 FROM bids WHERE (bids.id = bid_years.bid_id)))` |
| `bids` | `bids_select` | SELECT | PUBLIC | `((team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid()))) OR (is_commissioner_or_co(auth.uid()) AND (EXISTS ( SELECT 1 FROM auction_tiers t WHERE ((t.id = bids.tier_id) AND (t.closes_at <= now()))))) OR ((status = ANY (ARRAY['winner'::text, 'lost'::text, 'passed_over'::text])) AND (EXISTS ( SELECT 1 FROM auction_tiers t WHERE ((t.id = bids.tier_id) AND (t.verified_at IS NOT NULL))))))` |
| `commissioner_actions` | `commissioner_actions_select` | SELECT | PUBLIC | `true` |
| `compliance_violations` | `own team or commissioner` | SELECT | PUBLIC | `((team_id = ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR is_commissioner_or_co(auth.uid()))` |
| `contract_events` | `public read` | SELECT | PUBLIC | `true` |
| `contract_option_bonuses` | `public read` | SELECT | PUBLIC | `true` |
| `contract_restructure_bonuses` | `restructure_bonus_read` | SELECT | PUBLIC | `true` |
| `contract_years` | `public read` | SELECT | PUBLIC | `true` |
| `contracts` | `public read` | SELECT | PUBLIC | `true` |
| `draft_picks` | `draft_picks_read` | SELECT | anon, authenticated | `true` |
| `draft_prospect_classes` | `draft_prospect_classes_select` | SELECT | authenticated | `true` |
| `draft_prospect_classes` | `draft_prospect_classes_select_dianna` | SELECT | **dianna** | `true` |
| `draft_prospects` | `draft_prospects_select` | SELECT | authenticated | `true` |
| `draft_prospects` | `draft_prospects_select_dianna` | SELECT | **dianna** | `true` |
| `edfl_scoring_settings` | `public read edfl_scoring_settings` | SELECT | PUBLIC | `true` |
| `edfl_season_results` | `edfl_season_results_read` | SELECT | PUBLIC | `true` |
| `edfl_tag_values` | `edfl_tag_values_read` | SELECT | PUBLIC | `true` |
| `fantasy_game_scores` | `public read fantasy_game_scores` | SELECT | PUBLIC | `true` |
| `free_agent_offer_option_bonuses` | `own team or resolved` | SELECT | PUBLIC | `(EXISTS ( SELECT 1 FROM free_agent_offers f WHERE ((f.id = free_agent_offer_option_bonuses.offer_id) AND ((f.team_id IN ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM free_agent_windows w WHERE ((w.id = f.window_id) AND (w.status = 'resolved'::text))))))))` |
| `free_agent_offer_years` | `own team or resolved` | SELECT | PUBLIC | `(EXISTS ( SELECT 1 FROM free_agent_offers f WHERE ((f.id = free_agent_offer_years.offer_id) AND ((f.team_id IN ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM free_agent_windows w WHERE ((w.id = f.window_id) AND (w.status = 'resolved'::text))))))))` |
| `free_agent_offers` | `own team or resolved` | SELECT | PUBLIC | `((team_id IN ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM free_agent_windows w WHERE ((w.id = free_agent_offers.window_id) AND (w.status = 'resolved'::text)))))` |
| `free_agent_windows` | `public read` | SELECT | PUBLIC | `true` |
| `goodell_broadcasts` | `goodell_broadcasts_read` | SELECT | PUBLIC | `true` |
| `goodell_kinds` | `goodell_kinds_read` | SELECT | PUBLIC | `true` |
| `goodell_memos` | `goodell_memos_officer_read` | SELECT | PUBLIC | `is_commissioner_or_co(auth.uid())` |
| `goodell_phrases` | `goodell_phrases_read` | SELECT | PUBLIC | `true` |
| `injury_sync_runs` | `injury_sync_runs_select` | SELECT | authenticated | `true` |
| `insider_submissions` | `insider_submissions_select_own` | SELECT | authenticated | `(team_id = ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid())))` |
| `league_calendar_events` | `public read` | SELECT | PUBLIC | `true` |
| `league_cap_settings` | `public read` | SELECT | PUBLIC | `true` |
| `league_config` | `public read` | SELECT | PUBLIC | `true` |
| `league_weeks` | `public read` | SELECT | PUBLIC | `true` |
| `nfl_games` | `public read nfl_games` | SELECT | PUBLIC | `true` |
| `owner_profiles` | `owner_profiles_select` | SELECT | PUBLIC | `((owner_id = ( SELECT o.id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR is_commissioner_or_co(auth.uid()))` |
| `owner_profiles` | `owner_profiles_update` | UPDATE | PUBLIC | `((owner_id = ( SELECT o.id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR is_commissioner_or_co(auth.uid()))` · CHECK `((owner_id = ( SELECT o.id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR is_commissioner_or_co(auth.uid()))` |
| `pending_cuts` | `public read` | SELECT | PUBLIC | `true` |
| `player_game_stats` | `public read player_game_stats` | SELECT | PUBLIC | `true` |
| `player_value_name_map` | `player_value_name_map_select` | SELECT | PUBLIC | `is_commissioner(auth.uid())` |
| `player_value_snapshots` | `player_value_snapshots_select` | SELECT | PUBLIC | `(is_commissioner(auth.uid()) OR ((published_at IS NOT NULL) AND (published_at <= now())))` |
| `player_values` | `player_values_select` | SELECT | PUBLIC | `(is_commissioner(auth.uid()) OR (EXISTS ( SELECT 1 FROM player_value_snapshots s WHERE ((s.id = player_values.snapshot_id) AND (s.published_at IS NOT NULL) AND (s.published_at <= now())))))` |
| `player_week_projections` | `player_week_projections_read` | SELECT | authenticated | `true` |
| `player_week_scores` | `player_week_scores_read` | SELECT | authenticated | `true` |
| `players` | `public read` | SELECT | PUBLIC | `true` |
| `ppv_weight_table` | `public read` | SELECT | PUBLIC | `true` |
| `rookie_wage_scale_slots` | `public read` | SELECT | PUBLIC | `true` |
| `rookie_wage_scale_years` | `public read` | SELECT | PUBLIC | `true` |
| `roster_moves` | `roster_moves_read` | SELECT | authenticated | `true` |
| `scoreboard_sync_runs` | `scoreboard_sync_runs_read` | SELECT | authenticated | `true` |
| `sleeper_sync_conflicts` | `sleeper_sync_conflicts_select` | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM team_owners o WHERE ((o.user_id = auth.uid()) AND (o.is_commissioner OR o.is_co_commissioner))))` |
| `sleeper_sync_runs` | `sleeper_sync_runs_select` | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM team_owners o WHERE ((o.user_id = auth.uid()) AND (o.is_commissioner OR o.is_co_commissioner))))` |
| `sleeper_sync_staging` | `sleeper_sync_staging_select` | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM team_owners o WHERE ((o.user_id = auth.uid()) AND (o.is_commissioner OR o.is_co_commissioner))))` |
| `taxi_active_locks` | `public read` | SELECT | PUBLIC | `true` |
| `taxi_week_credits` | `public read` | SELECT | PUBLIC | `true` |
| `team_cash_budgets` | `team_cash_budgets_select` | SELECT | PUBLIC | `true` |
| `team_cash_transactions` | `team_cash_transactions_select` | SELECT | PUBLIC | `((team_id = ( SELECT team_owners.team_id FROM team_owners WHERE (team_owners.user_id = auth.uid()))) OR is_commissioner_or_co(auth.uid()))` |
| `team_owners` | `team_owners_select` | SELECT | PUBLIC | `((auth.uid() = user_id) OR is_commissioner_or_co(auth.uid()))` |
| `team_week_scores` | `public read` | SELECT | PUBLIC | `true` |
| `teams` | `public read` | SELECT | PUBLIC | `true` |
| `trade_assets` | `trade_assets_read` | SELECT | authenticated | `can_view_trade(trade_id)` |
| `trade_blocks` | `trade_blocks_select_league` | SELECT | authenticated | `true` |
| `trade_blocks` | `trade_blocks_select_dianna` | SELECT | **dianna** | `true` |
| `trade_parties` | `trade_parties_read` | SELECT | authenticated | `can_view_trade(trade_id)` |
| `trades` | `trades_read` | SELECT | authenticated | `can_view_trade(id)` |
| `waiver_claims` | `own team or executed run` | SELECT | PUBLIC | `((team_id IN ( SELECT o.team_id FROM team_owners o WHERE (o.user_id = auth.uid()))) OR (EXISTS ( SELECT 1 FROM waiver_runs r WHERE ((r.id = waiver_claims.run_id) AND (r.status = 'executed'::text)))))` |
| `waiver_placements` | `public read` | SELECT | PUBLIC | `true` |
| `waiver_runs` | `public read` | SELECT | PUBLIC | `true` |
| `watchlist_markers` | `watchlist_select_scoped` | SELECT | authenticated | own team, **or** a live `league` marker, **or** a live `shared` marker whose `shared_with_team_id` still holds the player |

`roles` empty means the policy applies to `PUBLIC` (every role, `anon` included); the table-level
SELECT grant (§5) still decides whether `anon` gets that far. **The four `goodell_*` policies are
written to `PUBLIC` but are not reachable by `anon`**, because `bots_01` revoked the table grant —
belt and braces, and the reason the distinction in this paragraph matters.

**`dianna` is a database role, not an application role.** Three policies name it, on three tables
(v2.2 said four; its own table above listed three). With the `public read` policies on `contracts`,
`players` and `teams` and the seven views in §2, that is the entire surface the rumour bot can ever
select. It is the mechanism behind WL-10:
the watchlist is protected from the bot by the absence of a policy rather than by a view's grant,
so a future definer view over `watchlist_markers` still would not hand it anything. `can_view_trade`, `is_commissioner`
and `is_commissioner_or_co` are called **inside** policies, so their EXECUTE grants are load-bearing
for every role that reads those tables (§12).

**The policies have been read through as a signed-in owner only piecemeal** — most tests to date
ran inside SECURITY DEFINER functions, which bypass RLS. The poaching build did read the board,
`poachable_players` and `free_agent_offer_ppv` as an owner and as `anon`. A full pass as an ordinary
owner remains worth doing.

---

## 9. Row-count hazards

PostgREST returns **1,000 rows by default** and truncates silently — a short result is the failure
mode, not an error (SR-29). `/admin/fix-contracts` once rendered names as "unknown" because a join
partner had been truncated.

| Table / view | Rows | Rule |
|---|---|---|
| `player_game_stats` | 33,555 | never unfiltered — filter by player |
| `discord_broadcasts` / `league_transaction_log` | 515 each | **Mort's ledger holds the whole log.** Both grow with every transaction; filter and page on `log_id` |
| `player_id_crosswalk` | 6,187 | service role only |
| `edfl_season_results` | 3,228 | filter by `season_year` |
| `players` | 3,212 | never unfiltered — filter, or use `search_players()` |
| `player_values` | 2,000 | **past the ceiling** — always filter by `snapshot_id` |
| `nfl_games` | 1,696 | filter by season and week |
| `contract_years` | 1,119 | **past the ceiling** — filter by contract, team or season |
| `contract_year_computed` | 1,119 | **past the ceiling**, and it is the money view |
| `player_week_projections` | **845** | new this cut: **about 420 rows a week** — past the ceiling at Week 3. Filter by season **and** week, as `edfl_matchup_detail` does |
| `player_week_scores` | **580** | filter by season **and** week |
| `scoreboard_sync_runs` | **532** | grows every two minutes during games — **past the ceiling within days**; filter and limit |
| `commissioner_actions` | 389 | always `.limit()` or page |
| `sleeper_sync_staging` | 380 | filter by run |
| `rookie_wage_scale_years` | 360 |  |
| `contracts` | 358 | filter by team or player |
| `sleeper_sync_conflicts` | 299 | filter by run |
| `roster_injury_status` / `taxi_eligibility_status` | 294 each | one row per active contract; read per team |
| `draft_pick_board` | 250 | grows by 40 a season — filter by season or team |
| `bids`, `bid_years` | not re-read (sealed) | were 485 and 1,671 at v1.6 — filter by tier |
| `player_transaction_feed` / `league_transaction_log` | grows with every transaction | always filter |

**Fastest-growing, and why it matters now.** `scoreboard_sync_runs` gains a row every two minutes
while games are on — 388 on September 16, **532 since Friday's last recap**, and it passes 1,000
inside Week 3. Nothing in the app reads it, and anything that does must filter and limit.
`player_week_scores` doubled with Week 2 (287 → **580**) and **passes 1,000 at Week 4**; the new
`player_week_projections` is bigger per week (411, then 434 — more players than the league rosters)
and **passes 1,000 at Week 3**. Both are filtered by season **and** week, always.
`discord_broadcasts` is at 515 and gains a row per transaction; `mort_dispatch()` reads it through
a left join on a primary key, so the wire is unaffected, but any future page over it must filter.
`commissioner_actions` is read newest-first with `.limit(200)` on `/actions`, which is safe, but
190 of its 389 rows are `week_scores_corrected` entries, all Week 1 and none newer than September
16 — the live-scoring rows described in §0 (as of v2.2) — so that page currently shows mostly
score movement.

### Live counts at the stamp

| Object | Count | Detail |
|---|---|---|
| `contracts` | **358** | 294 active; unchanged since v2.2 |
| — active by type | | 150 `veteran_free_agent` · 127 `rookie` · 17 `practice_squad` |
| — active by roster status | | 231 `active` · 45 `taxi` · 18 `ir` |
| — rookie contracts by 3.3(b)(i) standing | | 80 in class (2025: 40, 2026: 40) · **47 out of class** (2023: 19, 2024: 28), by `taxi_eligibility_status.ps_rule_subject` |
| `contracts.first_season_week` set | **33** | 27 at `1`, **6 at `2`** — `edfl_signing_fraction()` has produced 13/14 in production; v2.2's "every one is 1" is no longer true |
| `contract_years` | **1,119** | past the ceiling |
| `contract_events` | **77** | 36 `traded` · 30 `released` · 6 `fifth_year_option_exercised` · 3 `restructure` · 2 `fifth_year_option_declined`; 2 reversed |
| `contract_restructure_bonuses` | 3 | |
| `trades` | 27 at v2.2 — not re-read | a draft trade is sealed to its proposer (§2), so this cut read no row of `trades`, `trade_parties` or `trade_assets`; v2.2's split was 13 `executed` · 9 `declined` · 2 `cancelled` · 1 `draft` · 1 `proposed` · 1 `reversed` |
| `draft_picks` | 250 | **17 have changed hands** |
| `commissioner_actions` | **389** | `action_type` is text with no constraint. 190 are `week_scores_corrected`, all Week 1, none newer than September 16 — live scoring, not corrections (§0e as of v2.2). One row since v2.2: `owner_proxy_access_ended`, 22:55 ET September 19 (§0e) |
| `discord_broadcasts` · `insider_broadcasts` · `goodell_broadcasts` | 515 · 1 · 0 | the three bot ledgers. Robo has said nothing yet: his first due notice is the `5.17` one-day warning |
| `mort_kinds` · `goodell_kinds` · `goodell_phrases` | 15 · 5 · 40 | all kinds enabled |
| `trade_blocks` · `draft_prospects` · `draft_prospect_classes` | 1 · 0 · 0 | the prospect board is empty until an officer loads a class from ESPN |
| `watchlist_markers` · `insider_submissions` | not read (sealed, §2) | |
| `auction_tiers` | 4 | all verified; none open, none scheduled — the auction is dormant |
| `free_agent_windows` (without the sealed column) | 34 `resolved` · 0 `open` | the five windows open at v2.2 have resolved; no sealed offer row was read |
| `waiver_runs` | 12 (12 `scheduled`) | weeks 3–14; the first run is 00:00 ET Wednesday September 23 |
| `pending_cuts` · `waiver_placements` · `taxi_active_locks` · `compliance_violations` | 0 · **1** · 0 · **1** | one player on the wire since 15:01 ET September 16 (`weeks_charged_at_waive` 2, pending the September 23 run); one `_none` marker row from the Week 2 sweep (clean week, $0). No lock has ever fired |
| `taxi_week_credits` | **86** | 43 live (2025 class 26 · 2026 class 16 · practice squad 1) · 43 voided by `psclass_05` (2023 class 18 · 2024 class 25); all Week 2 |
| `player_week_projections` | **845** | Week 1: 411 · Week 2: 434; all 845 agree with the corrected scorer |
| `league_week_status` | 14 rows | Week 1 final (00:15 ET September 15); Weeks 2–14 not |
| `roster_injury_status` | 294 | 35 flagged (IR / Out / Doubtful / PUP on an active contract) · **0 `ir_ineligible`** |
| `team_inseason_compliance` | 10 | all ten `compliant` after `injflag_04` |
| `team_week_scores` | 20 | Weeks 1 and 2 |
| `player_values` | 2,000 | four snapshots × 500 |
| `league_calendar_events` | 51 | **all for 2026 — no 2027 rows exist** (the banner raises it) |
| `edfl_season_results` | 3,228 | 2021: 680 · 2022: 652 · 2023: 615 · 2024: 631 · 2025: 650 — all five published, 48 Pro Bowl slots each |
| `edfl_tag_values` | 20 | season 2027 only |
| `players` | 3,212 | 1,074 without a `gsis_id` (Sleeper players with no NFL stat line); 1 without a Sleeper id; 216 carry a Sleeper designation (Questionable 106 · IR 68 · NA 14 · Out 14 · PUP 7 · Doubtful 3 · Sus 2 · DNR 2), of which **92 qualify** under `edfl_injury_designation_qualifies()` |
| `nfl_games` | 1,696 | 2021: 285 · 2022: 284 · 2023: 285 · 2024: 285 · 2025: 285 · 2026: 272; 2026 has a kickoff for all 272 and a final score for 17. `LA` is the only code that disagrees with `players.nfl_team` (`LAR`) |
| `owner_profiles` | 10 | 6 with a name, 5 with a time zone |
| `sleeper_sync_runs` | 19 | 12 `abandoned` · 7 `applied` |
| `injury_sync_runs` | 15 | 14 `scheduled` · 1 `manual` |
| `nfl_schedule_refresh_runs` · `crosswalk_refresh_runs` · `scoreboard_sync_runs` | 14 · 1 · 532 | the three `pg_net` ledgers |
| `officer_action_item_state` | 4 | open: `sleeper_worklist` only. Cleared: `sleeper_sync_open` (Sep 16), `fa_windows_to_resolve` (Sep 18), `proxy_access_open` (23:00 ET Sep 19, five minutes after the proxy closed) |
| total `cap_charge` across `contract_year_computed` | **42,171.71** | over 1,119 rows. A timestamp, not an invariant — v1.3's 39,465.00, v1.6's 41,818.00 and v2.0's 42,084.00 were each true once. **Note it is no longer whole**: the first in-season signings have put a rule 1.9 fraction into the league total, which is correct and is why `formatCost` / `formatRoom` exist (§13) |

---

## 10. Configuration — read it, never hardcode it

`league_config` (one row, `id = true`), at the stamp:

| Column | Value | Note |
|---|---|---|
| `current_season_year` | 2026 | every "this season" read |
| `league_name` | El Dynasty Futbol League-o |  |
| `league_short_name` | EDFL | the eyebrow on every page |
| `sleeper_league_id` | 1382221155657580544 | the Sleeper API league |
| `active_roster_size` | 25 | 3.6 — in season only; award-and-oblige ceiling is this + 3 |
| `taxi_squad_size` | 7 | 3.3(a); award-and-oblige ceiling is this + 2 |
| `taxi_non_rookie_slots` | 3 | 3.3(b) |
| `ir_slots` | 10 | 3.4(a) — `set_roster_status` and `team_inseason_compliance` |
| `min_spend_pct` | 0.89 | 5.4(a) Season Cap Floor |
| `cuts_open_after` | 2026-08-12 00:00 ET | 5.18(d) |
| `june1_designations_per_year` | 2 | 5.18(c) |
| `cut_reversal_window_hours` | 96 |  |
| `trade_reversal_window_hours` | 96 |  |
| `wire_starts_at` | 2026-09-15 00:00 ET | NULL or future = the wire is dark (`edfl_wire_live()`) |
| `taxi_revert_baseline_at` | 2026-09-15 00:00 ET | a rookie elevated before this is not sent back on Tuesday |
| `practice_squad_max_value` | 3 | **dead** — see below |

**`practice_squad_max_value` is a dead column.** It still reads `3`, is COMMENTed dead, and nothing
reads it — `check_practice_squad_value` calls `league_minimum_salary(league_season_year)`. Anything
still reading the scalar would refuse a legal $9 practice squad contract. One number cannot carry a
rule that escalates 5% a season. `lib/leagueMinimum.js` mirrors `league_minimum_salary()` for
synchronous client previews (2026–2031: 9, 10, 10, 11, 11, 12).

`league_cap_settings`:

| Season | `fantasy_salary_cap` | `cap_ceiling` | `is_provisional` |
|---|---|---|---|
| 2026 | $1,500 | NULL | no |
| 2027 | $1,575 | NULL | yes |

A NULL `cap_ceiling` means the ceiling falls back to the base cap (`team_cap_compliance.ceiling_is_base_cap_fallback`).
The 2027 row is a placeholder the commissioner has not set; `team_cap_by_season.cap_is_provisional`
exposes it, so an unmarked 2027 figure is a display defect. The 111% ceiling multiplier that
`/team/[teamId]` draws was abolished in rule book v11; the pending team-grid batch reads the ceiling
from this table instead, and the multiplier stays on screen in production until that batch deploys.

### `league_weeks`, 2026

`charge_at` is **the weekly salary pay instant and nothing else** (Tuesday 00:00 ET from Week 2).
Start of play is `first_game_at`; anything asking "when does this week begin" reads that. Times
below are Eastern.

| Wk | Pay (`charge_at`) | Wire run | First game | Last game | Provisional | Taxi weeks | Charged |
|---|---|---|---|---|---|---|---|
| 1 | Wed Sep 09 00:01 | — | Wed Sep 09 00:00 | Mon Sep 14 23:59 |  | **no** | yes |
| 2 | Tue Sep 15 00:00 | — | Thu Sep 17 00:00 | Mon Sep 21 23:59 |  | counts | yes |
| 3 | Tue Sep 22 00:00 | Wed Sep 23 00:00 | Thu Sep 24 00:00 | Mon Sep 28 23:59 |  | counts |  |
| 4 | Tue Sep 29 00:00 | Wed Sep 30 00:00 | Thu Oct 01 00:00 | Mon Oct 05 23:59 |  | counts |  |
| 5 | Tue Oct 06 00:00 | Wed Oct 07 00:00 | Thu Oct 08 00:00 | Mon Oct 12 23:59 |  | counts |  |
| 6 | Tue Oct 13 00:00 | Wed Oct 14 00:00 | Thu Oct 15 00:00 | Mon Oct 19 23:59 |  | counts |  |
| 7 | Tue Oct 20 00:00 | Wed Oct 21 00:00 | Thu Oct 22 00:00 | Mon Oct 26 23:59 |  | counts |  |
| 8 | Tue Oct 27 00:00 | Wed Oct 28 00:00 | Thu Oct 29 00:00 | Mon Nov 02 23:59 |  | counts |  |
| 9 | Tue Nov 03 00:00 | Wed Nov 04 00:00 | Thu Nov 05 00:00 | Mon Nov 09 23:59 |  | counts |  |
| 10 | Tue Nov 10 00:00 | Wed Nov 11 00:00 | Thu Nov 12 00:00 | Mon Nov 16 23:59 |  | counts |  |
| 11 | Tue Nov 17 00:00 | Wed Nov 18 00:00 | Thu Nov 19 00:00 | Mon Nov 23 23:59 |  | counts |  |
| 12 | Tue Nov 24 00:00 | Wed Nov 25 00:00 | Wed Nov 25 00:00 | Mon Nov 30 23:59 |  | counts |  |
| 13 | Tue Dec 01 00:00 | Wed Dec 02 00:00 | Thu Dec 03 00:00 | Mon Dec 07 23:59 | yes | counts |  |
| 14 | Tue Dec 08 00:00 | Wed Dec 09 00:00 | Thu Dec 10 00:00 | Mon Dec 14 23:59 | yes | counts |  |

Week 12 begins on a Wednesday (Thanksgiving). Weeks 13 and 14 are still provisional; the NFL
schedule loaded today shows standard Thursday–Monday slates for both, so confirming them is a
commissioner decision, not a data gap. **Week 1 does not count toward practice squad weeks**
(ruling), and has no wire run.

### `league_calendar_events` — key on `rule_ref`, never on the title

The only source of truth for dates. `league_calendar` renders it with `league_weeks`. All
51 entries (every one carries a `rule_ref`; all belong to the 2026 league year):

| `rule_ref` | Starts (ET) | Ends (ET) | Title | Prov. |
|---|---|---|---|---|
| `1.4(a)` | 2026-03-01 00:00 |  | 2026 League Year begins |  |
| `1.4(b)` | 2026-03-01 00:00 |  | Off-season begins |  |
| `2.1` | 2026-03-01 00:00 |  | League dues due in full — $150 per team |  |
| `5.5(b)` | 2026-03-01 00:00 |  | Base league salary cap set — $1,500 |  |
| `5.3(c)` | 2026-03-01 00:00 |  | Individual team Salary Ceilings published |  |
| `5.18(c)(i)` | 2026-03-01 00:00 |  | June 1st designation election window opens |  |
| `5.11(a)` | 2026-03-01 00:00 |  | Contract extension window opens |  |
| `5.19(a)` | 2026-03-01 00:00 |  | Contract restructure window opens |  |
| `7.4(b)(i)` | 2026-03-01 00:00 |  | Trade window 1 opens |  |
| `5.20(c)` | 2026-03-01 00:01 |  | Option bonuses for the 2026 season trigger |  |
| `5.18(c)(i)` | 2026-05-31 00:00 |  | June 1st designation election window closes |  |
| `5.18(c)(ii)` | 2026-06-01 00:00 |  | Automatic June 1st split begins |  |
| `4.3` | 2026-06-30 00:00 |  | Rookie draft eligibility requests due |  |
| `5.18(a)` | 2026-07-01 00:00 |  | Schedule loader prompt — seed the season's game weeks |  |
| `4.1` | 2026-07-01 08:00 |  | Rookie Draft begins — 08:00 ET in Sleeper |  |
| `5.18(d)` | 2026-08-12 00:00 |  | Cuts open |  |
| `5.11(a)` | 2026-09-01 00:00 |  | Contract extension window closes |  |
| `5.18(b)(v)` | 2026-09-02 00:00 |  | Roster bonuses convert |  |
| `7.4(b)(i)` | 2026-09-02 00:00 |  | Trade window 1 closes — 23:59 ET September 1 |  |
| `7.4(b)(ii)` | 2026-09-02 00:00 |  | Trade window 2 opens |  |
| `7.4(a)` | 2026-09-07 00:00 | 2026-09-09 00:00 | Trade-back restriction temporarily suspended — 7.4(a) |  |
| `5.14(a)` | 2026-09-07 17:56 |  | In-season free agency opens — 2026 startup mitigation |  |
| `3.3(b)` | 2026-09-07 22:15 | 2026-09-08 20:00 | Practice squad conversion temporarily allowed — 3.3(b) |  |
| `1.4(c)` | 2026-09-08 20:00 |  | In-Season begins — 8:00 PM ET (2026 only) |  |
| `1.4(b)` | 2026-09-08 20:00 |  | Off-season ends — 8:00 PM ET (2026 only) |  |
| `3.6(a)` | 2026-09-08 20:00 |  | Roster compliance deadline — 8:00 PM ET (2026 only) |  |
| `5.5(f)` | 2026-09-08 20:00 |  | In-season salary cap hard block takes effect |  |
| `5.14(b)` | 2026-09-14 00:00 |  | First-offer signing exemption ends |  |
| `5.17` | 2026-09-22 00:00 | 2026-12-12 12:00 | Poaching open - 5.17 |  |
| `7.5(a)` | 2026-11-30 23:59 |  | Trade deadline — 11:59 PM ET Monday, November 30 (end of Week 12) |  |
| `5.19(a)` | 2026-12-01 00:01 |  | Contract restructure window closes |  |
| `9.1(b)` | 2026-12-14 00:00 |  | EDFL regular season ends | yes |
| `9.2(k)` | 2026-12-14 00:00 |  | Non-playoff teams frozen from dropping players | yes |
| `9.2(b)` | 2026-12-17 00:00 | 2026-12-21 23:59 | EDFL Playoffs — Wild Card Round (NFL Week 15) | yes |
| `9.2(b),(c)` | 2026-12-24 00:00 | 2026-12-28 23:59 | EDFL Playoffs — Semifinal Round and Fifth-Place Game (NFL Week 16) | yes |
| `9.2(d)` | 2026-12-31 00:00 | 2027-01-04 23:59 | EDFL Bowl and Consolation Game (NFL Week 17) | yes |
| `1.4(a)` | 2027-01-04 00:00 |  | EDFL season ends — conclusion of NFL Week 17 | yes |
| `2.2` | 2027-01-04 00:00 |  | Prize money paid out | yes |
| `1.4(d)` | 2027-01-05 00:00 | 2027-02-28 23:59 | Dead Season begins | yes |
| `5.11(a)` | 2027-01-05 00:00 |  | Contract extension window reopens | yes |
| `5.19(a)` | 2027-01-05 00:00 |  | Contract restructure window reopens | yes |
| `7.4(b)(iii)` | 2027-01-05 00:00 |  | Trade window 3 opens | yes |
| `1.7` | 2027-02-10 00:00 |  | League rule suggestions due |  |
| `1.7` | 2027-02-14 00:00 | 2027-02-20 23:59 | League rules voting |  |
| `5.18(c)(ii)` | 2027-02-20 00:00 |  | Last day of the automatic June 1st split |  |
| `5.3(e)` | 2027-02-21 00:01 | 2027-02-28 23:59 | League Reset Period begins — 00:01 ET |  |
| `5.5(c)` | 2027-02-21 00:01 |  | Salary cap rollover calculated — 00:01 ET |  |
| `5.4(a)` | 2027-02-21 00:01 |  | Season Cap Floor tested |  |
| `5.4(d)` | 2027-02-21 00:01 |  | Multi-Season Cash Floor — first test is February 21, 2029 |  |
| `7.4(b)(iii)` | 2027-02-21 00:01 |  | Trade window 3 closes |  |
| `1.4(d)` | 2027-02-28 00:00 |  | 2026 League Year ends |  |

`edfl_rule_ref_consumers(rule_ref)` names what reads an entry — database functions from `pg_proc`,
plus a **hand-kept list of app files** (`5.14(a)`, `1.4(c)`, `9.1(b)` → `app/free-agency/page.js`;
`5.14(b)` → `app/free-agency/actions.js`; `5.5(f)%` → `lib/restructureRoster.js`). The Calendar
Loader refuses to re-key or delete an entry that something reads. **When app code starts keying on
another `rule_ref`, that list is updated in the chat.**

`5.5(f)` and `1.4(c)` are different rules that both fell at 8:00 PM ET September 8, 2026. They
coincide this year; they must not be collapsed into one constant. `league_calendar.is_past` means
opposite things on `5.14(a)` (the market is open) and `5.14(b)` (the exemption is over) — polarity
belongs at the call site. The temporary reliefs `3.3(b)` and `7.4(a)` are rows with an `ends_at`,
read by `practice_squad_relief_at()` and `trade_back_relief_at()`; both have expired, and leaving the
mechanism in place makes the next relief a row rather than a migration.

---

## 11. Facts that live nowhere else

Each of these has been mis-derived at least once.

### The weekly cycle runs on four instants per week

`league_weeks` carries them: **pay** (`charge_at`, Tuesday 00:00 — a week's salary is charged once
this passes), **wire run** (`wire_runs_at`, Wednesday 00:00 — `waiver_runs` fires), **compliance**
(`compliance_at`, Thursday 00:00 — the sweep and the practice squad week credit measure here) and
**last game** (`last_game_at`, Monday 23:59 — end-of-week cuts fire one minute before the next pay
instant, so a designated player never costs the coming week). `edfl_wire_live()` gates the whole
cycle on `league_config.wire_starts_at`.

- **A cut in season goes to the wire and the contract stays `active`.** `edfl_on_waivers()` is what
  every occupancy count asks. `waiver_placements.weeks_charged_at_waive` freezes the weeks charged at
  the instant of the waive; the settlement reads that, never a live count.
- **`edfl_next_waiver_run()`**: a cut belongs to the run of the first week whose pay instant falls
  strictly after it. A cut at Tuesday 00:01 waits eight days. That is in the rule, not a defect.
- **TM 5.23(d)**: once the player's NFL game that league week has kicked off, the owner cannot
  choose Immediate — `cut_player()` forces End of the week, and `edfl_cut_timing_forced()` returns
  the sentence the dialog shows. Kickoffs come from `nfl_games.kickoff_at` via
  `edfl_player_week_kickoff()`; Sleeper's `LAR` is nflverse's `LA` (`edfl_nfl_team_code()`), and
  **that is the only disagreement between the two vocabularies across all 32 teams of 2026** (25
  players `LAR`, 17 games `LA`). Any join from `players.nfl_team` to `nfl_games` goes through
  `edfl_nfl_team_code()` or it silently loses the Rams — `edfl_matchup_detail` shipped without it
  and read every Rams player as on a bye (§0b).
- **The playoff wire (TM 5.15(l)) is not built.** `waiver_runs` ends with Week 14. Once Week 14's
  pay instant passes (00:00 ET Tuesday December 8) there is no later run for an in-season cut to
  join, so cuts cannot be made; the officer banner raises this three weeks ahead and turns urgent a
  week ahead. Building it needs the Appendix B design and a Dead Season decision.

### Practice squad weeks and the lock (TM 3.3(i))

**Eligibility is the draft class, not the contract type.** `edfl_taxi_rule_subject()` is the one
definition of TM 3.3(b)(i): a `practice_squad` contract, or a `rookie` contract whose `draft_year` is
this season or last. Every 2023–2026 rookie carries `start_year` 2026 because of the redraft, so
`contract_type = 'rookie'` says nothing about eligibility, and 47 active rookie contracts are out of
class today. The gate, the week counter and the status view all read the helper since `psclass_01`–
`_04`; before that the counter did not, and 43 credits it wrote for 2023- and 2024-class rookies were
voided, not deleted (`psclass_05`). A rookie contract cannot be written without a `draft_year`
(`contracts_rookie_needs_draft_year`).

`taxi_week_credits` records one row per player per week he is on an active roster at the compliance
instant — **keyed on `player_id`, not `contract_id`**, so a trade or a claim cannot hand him a fresh
three weeks. Three counted weeks buy **one last demotion**; the fourth promotion or a fourth counted
week writes a `taxi_active_locks` row and he stays up for the season. A practice squad contract
becomes an ordinary active contract at the same money; a rookie contract is untouched (TW-3/TW-4).
Clearing waivers voids the credits and the lock together, and so does a claim **by the team that
waived him** (DT-6); a claim by any other team carries both. A successfully
defended poach writes a lock with `trigger_kind = 'poach_defense'`, and
`edfl_taxi_lock_reason()` words the refusal for whichever cause applies. `taxi_revert_due()` sends
elevated players back each Tuesday, skips locked players, and isolates each row so one refusal
cannot cost the other nine teams their returns.

### Poaching (TM 5.17)

Open while the `5.17` calendar row is current — from 00:00 ET Tuesday September 22 until its
`ends_at`, 12:00 ET Saturday December 12 — by `edfl_poach_window_open()`. **Poach-ness is a property of the window** (`window_kind = 'poach'`);
every poach offer is `offer_kind = 'active'` because a winning bid always lands on the active
roster (PO-6, 3.3(g)). `retain_bar_ppv` is snapshotted when the window opens. The holding team wins
ties. The $2 minimum poach signing bonus is a **literal** in `edfl_poach_offer_valid()`, marked as a
question for 2027 (three weeks of a $10 minimum is $2.15). No offer can be withdrawn in any window
(5.14(d)); a revision must be strictly higher and keeps its original timestamp (5.14(e)).

### Season cash has one definition

Rule 5.6's trigger (`check_contract_minimum_salary`) counts guaranteed + non-guaranteed salary +
roster bonus, **plus the whole signing bonus in Year 1**, plus option and restructure bonuses
exercising that season — **not** prorated bonus. `edfl_contract_season_cash()` and
`edfl_offer_season_cash()` mirror it so the poach validator and the trigger cannot disagree; the
first version of the validator used proration and was wrong in both directions on multi-year bids.

### In-season pro-ration

`contracts.first_season_week` is NULL for a full season. Where it is set, the settlement engines
count weeks **under contract**: `weeks_under = weeks_charged - first_season_week + 1`, floored at 0,
over 14. A player signed in week 8 and cut in week 10 earns `ngs × 3/14`, not `× 10/14`.
`compute_cut_charges` and `compute_trade_charges` are siblings under 5.18 and 7.8(a) and **must
change together**. `edfl_signing_fraction()` is the single definition of the fraction.

### Void years

Void years defer proration; they do not forgive it. At the end of a contract's last real season,
every remaining prorated dollar is charged to the **following** season, as a derived property in
`contract_year_computed` rather than a job. **`dead_cap_if_cut` is NULL on every void season** —
never print `$0.00` there. Void rows are **trigger-created** from three sources
(`contract_years.void_reason`): `option_bonus` 170 rows on 49 contracts; `signing_bonus` 19 rows on 12 contracts; `restructure` 4 rows on 1 contract — 193 rows across 55 distinct contracts in all. `contracts.option_void_years` counts **only the
option-bonus ones**. To count void years, count `contract_years where is_void_year`; never derive,
create or let a form write them. Void years also **occupy `contract_year_number`**, so adding a real
season to a contract that has them is a conversion, not an append (`edfl_add_real_year()`, SR-28).

### The 30% Rule is keyed on reason, not type

`check_contract_30pct_rule()` skips a season-over-season step only when
`edfl_30pct_exempt_reason(contract_type, added_by)` is non-null for the season stepped **into**:
`fifth_year_option` when `added_by = 'fifth_year_option'`, `rookie_contract` for an original
rookie season, NULL for anything else — **including `extension`**. `exempt_30pct` marks exactly
8 grandfathered contracts (5.22(e)); it was decided by hand and is the authority —
never re-derive it.

### Player identity

`players` holds one row per person since the September 16 merge: the Sleeper row was kept and the
stats row folded in. `player_id_crosswalk` (service role only) pairs Sleeper ids with NFL GSIS ids
one-to-one; `trg_players_fill_ids` fills whichever id is missing on insert or update, and
`edfl_crosswalk_refresh` reloads the crosswalk weekly and reports any new split identity to the
banner. `edfl_merge_player()` is the only merge path and never names a sealed table in its log
(SR-54). 1,074 players have no `gsis_id`; none holds an active contract.

### Money

**Whole dollars are restructure-only** (SR-30). A restructure prorates `floor(amount / years)` and
the final season absorbs the remainder (100 over 3 is 33 / 33 / 34); anything a restructure
generates is whole, anything inherited may carry cents. `compute_restructure_charges` returns exact
values — use `formatExactMoney`, never `formatMoney`, on money screens.
`contract_years.option_bonus` and `prorated_option_bonus` are **zero on every row** and read by
nothing; read `contract_option_bonuses`.

**Draft round and pick are populated** on every rookie contract in the 2023–2026 classes
(135 of 135, none missing), and since `psclass_01` a rookie contract **cannot be written without a
`draft_year`**. Read the columns. `edfl_fyo_is_round_one()` still derives the round from the
signing bonus; it works, and swapping it for a column read is its own batch. **Rookie tenure keys off
`contracts.draft_year`, never `start_year`** — every EDFL rookie contract carries `start_year` 2026
because of the redraft.

### Trades

`reverse_trade` runs five guards, window last so the more specific message wins: (1) same season;
(2) every player still on the contract the trade created, untouched and uncommitted; (3) no auction
tier verified after the trade; (4) every pick still held and unused; (5) the 96-hour window.
**`p_force` bypasses the post-unwind compliance check and nothing else** — that one refusal raises
SQLSTATE `EDFL1`; the guards raise `P0001`. Match on `error.code`, never on message text. Guard 3 is
retrospective: every trade executed before Tier 5 was verified (September 3) is permanently
irreversible. `execute_trade` withdraws any open `pending_cuts` row on a traded-away contract.

### The scoreboard is best ball

`team_week_scores.points` **is** the best-ball score, by ruling; standings, points-for and
`waiver_priority_order()` read it. `player_week_scores` stores the whole roster with
`roster_status_at_sync` frozen at write time, and `edfl_best_ball_lineup()` applies eligibility at
lineup time. The owner Refresh button and the scheduled sync both go through
`edfl_apply_matchups_payload()`, so they cannot compute different numbers. **Never compare totals
drawn from two different pulls** (SR-51).

**A week is final by one rule, in one view.** `league_week_status.week_is_final` = the week's last
regular-season kickoff + 4 hours has passed **and** a score sync has run since. `league_scoreboard`
and `league_standings` both read it; the standings count only final weeks, so a record does not move
during Monday night and does not move afterwards until the next sync. Both limbs matter: a week with
no sync after its final instant is not final.

### Projections are estimates, and two Rotowire keys lie

`player_week_projections.proj_stats` is Rotowire's object verbatim. **`pass_fd`, `rush_fd` and
`rec_fd` in it are yards ÷ 10, not first downs** — measured, not inferred: `pass_fd = pass_yd/10` to
the third decimal for every quarterback. `edfl_score_projected_stats()` ignores all three and
estimates first downs from projected volume at rates measured over every game in
`player_game_stats`: **0.5243 per completion, 0.2478 per carry, 0.5249 per reception** (61,223
completions, 76,318 carries, 60,771 receptions). Re-derive with
`select round(sum(passing_first_downs)::numeric / sum(completions), 4) from player_game_stats where
completions > 0` and the two siblings. A projection settles nothing: `team_week_scores.points` and
`edfl_best_ball_lineup()` are the official score and lineup, and `edfl_matchup_detail()` scores
nothing — its `effective_points` and provisional slot are a display, and the page says so.

### Injury designations

`edfl_injury_designation_qualifies()` — IR, Out, Doubtful, PUP — is the ruling of September 20, and
it is one function because it answers two questions: the red cross on the roster and the player
card, and eligibility for an EDFL IR slot under TM 3.4(b). `players.injury_status` is still Sleeper's
raw word (`Questionable`, `NA`, `Sus`, `DNR` included) and is still display-only; the predicate is
what a rule reads. An IR slot holding a player without a qualifying designation is **flagged on the
compliance banner, never blocked** by `set_roster_status()`. **TM 3.4(b) as written names a
different list** ("Doubtful", "DNR", "Holdout", "Opt-Out"); until the rule book is amended the
function is the ruling.

### Owner proxies

A commissioner proxy over a team is done by pointing the team's `team_owners.user_id` and `email`
at the proxy login and logging `owner_proxy_access`; it ends by restoring them and logging
`owner_proxy_access_ended` with the opening entry's id in the snapshot. Enter Sam Man has had two
(06:09–08:28 ET September 2; 08:24 ET September 7 to 22:55 ET September 19). **Proxy attribution on
`roster_moves` and on the existing log rows is deliberately left untouched when a proxy closes** —
moves made during the period remain recorded against the proxy account, by design. The
`proxy_access_open` banner item is what notices a proxy with no logged end.

---

## 12. Function grants and the `anon` role

**`PUBLIC` is the grant, not `anon` (SR-52).** Supabase's default privilege lands on `PUBLIC` — the
leading `=X/postgres` in `proacl` — and `anon` inherits it, so a revoke aimed at `anon` alone can
report success and change nothing. At this stamp, re-derived: **0 of the 260 EDFL functions carries a
`PUBLIC` entry, every one has an explicit ACL, and every one pins `search_path`.** `mort_line` was
the last exception and was pinned by `bots_01`; all five functions added this cut arrived pinned and
with their grants stated.

**`PUBLIC` is not the only default that bites, and this cut proved it.** Supabase's default
privileges land on `authenticated` as well, and on new *tables* they land on `anon` too — with
INSERT, UPDATE and DELETE. Two batches this month revoked `PUBLIC` per SR-52 and stopped there:

- The Robo Goodell batch left **`goodell_say()`, `goodell_dispatch()`, `goodell_seed()` and
  `goodell_candidates()` executable by `authenticated`** — every signed-in owner could have posted
  arbitrary text to `#league-office` under the League Office's name. Closed by
  `goodell_05_grant_sweep`, which asserts both that the four are unreachable and that the two the
  officer page needs are not.
- The Mort wire and the Goodell batch left **eleven relations with `anon` SELECT and write grants
  for both client roles**. RLS refused all of it — the posture §2 describes — **except
  `goodell_upcoming`**, an invoker view over two public tables, which `anon` genuinely could read.
  Closed by `bots_01_grant_sweep_select_only`.

**So the rule SR-52 states is too narrow, and the corrected form is: revoke `PUBLIC`, `anon` *and*
`authenticated`, then grant back exactly what is needed, and assert both directions in the same
migration.** The `it_04` sweep on the Insider Threat objects did this correctly and needed no
correction; the two that did not, needed two. This cut's `phase2g2_05` did it for
`player_week_projections` (`authenticated` SELECT only, no `anon` entry at all) and
`league_week_status` (SELECT for both client roles) — and then `injflag_02` created
`roster_injury_status` after the sweep, so that view carries the default `anon=arwdxtm` /
`authenticated=arwdxtm` set like most of the older views do. It is a join over `contracts` and
`players`, so no write bit is exercisable; it is listed here so the next sweep names it. One more
default survives every sweep to date: PostgreSQL 17's **`MAINTAIN`** (`m`), which the default
privileges include and no revoke has named — `player_week_projections` reads `authenticated=rm`,
the bot tables `anon=m`. It is meaningless on a view and confers VACUUM/ANALYZE on a table; not an
exposure, but not a SELECT-only grant either.

**Default privileges are fixed at source for `postgres`**, which creates every EDFL object:

| Object | Default grant for new objects in `public` |
|---|---|
| sequences in `public` | `{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}` |
| tables in `public` | `{postgres=arwdDxtm/postgres,anon=arwdxtm/postgres,authenticated=arwdxtm/postgres,service_role=arwdDxtm/postgres}` |
| functions in every schema | `{postgres=X/postgres}` |
| functions in `public` | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |

So a new function is executable by `authenticated` and `service_role` until a migration says
otherwise — **state every grant explicitly anyway**, and re-state them after any DROP/CREATE, which
resets the ACL. `supabase_admin`'s own default privileges in `public` still grant `anon` and
`authenticated` everything on new tables (TRUNCATE included) and EXECUTE on new functions; they
cannot be altered from the project role, and nothing is created as `supabase_admin`. **No relation
and no EDFL function in `public` carries a `PUBLIC` entry**; the 188 `btree_gist` internals do, and
move only if the extension moves schema.

**A function call is not a range-table entry.** Its EXECUTE privilege is checked against the
calling role even inside a definer view **and inside an RLS policy**. So a helper used by an
anon-readable view or a PUBLIC policy must stay executable by `anon`, or every page reading that
view or table fails with *permission denied for function …* while the view's own grant looks
correct. **Class A** = such helpers (grant `anon` and `authenticated`, keep them pure or read-only,
never widen what the view exposes). **Class B** = everything the app calls directly and everything
that writes (`authenticated` only, or `service`).

### 197 SECURITY DEFINER functions; six executable by `anon`, each load-bearing

| Function | Why `anon` needs it |
|---|---|
| `edfl_on_waivers` | inside `team_inseason_compliance`, `team_roster_by_season` (anon-readable) |
| `edfl_taxi_locked` | inside `taxi_eligibility_status` (anon-readable) |
| `edfl_taxi_weeks_used` | inside `taxi_eligibility_status` (anon-readable) |
| `is_commissioner` | inside the RLS policies on `player_value_name_map`, `player_value_snapshots`, `player_values` |
| `is_commissioner_or_co` | inside the RLS policies on `bid_withdrawals`, `bids`, `compliance_violations`, `owner_profiles`, `team_cash_transactions`, `team_owners` |
| `team_cut_previews` | called with the **anon** client by `app/team/[teamId]/page.js` |

Revoking any of these breaks a page for signed-out readers — `team_cut_previews` and
`taxi_eligibility_status` are read with the **anon** client on `/team/[teamId]`, and the two
commissioner tests sit inside policies granted to `PUBLIC`.

**The list is still six after thirty-four bot functions and this cut's five**, which is the number
to watch. Every bot and market function is `service` or `authenticated`; none needed an `anon` grant,
because none of them is reached from an anon-readable view. This cut needed two `anon`-executable
helpers for anon-readable views and made **both invoker**, which is the right shape: `psclass_01`
shipped `edfl_taxi_rule_subject` SECURITY DEFINER with an `anon` grant — a seventh entry here for
eleven minutes — the linter flagged it, and `psclass_06` dropped the definer bit rather than the
grant, because the function reads only `league_config`, whose policy is `true`. That is the
precedent for the three older entries on the same finding (`edfl_taxi_locked`, `edfl_taxi_weeks_used`,
`edfl_on_waivers`), which read tables with `true` policies too and are their own batch. A seventh
entry appearing here is a design question, not a grant question.

### Fifteen invoker functions executable by `anon`

An invoker function runs with the caller's own rights, so an `anon` grant on one exposes nothing
the caller could not already read. They are:

| Function | Reached from |
|---|---|
| `edfl_award_in_progress` | functions: `check_cap_ceiling` |
| `edfl_delegation_30pct_issue` | functions: `bid_delegations_check_30pct`, `submit_fa_offer` |
| `edfl_delegation_option_bonuses_valid` | functions: `submit_fa_offer` |
| `edfl_delegation_years_valid` | functions: `submit_fa_offer` |
| `edfl_injury_designation_qualifies` | views: `roster_injury_status`, `player_card_header`, `team_inseason_compliance`; functions: `edfl_matchup_detail` — **new** |
| `edfl_money_text` | views: `team_inseason_compliance` |
| `edfl_restructure_remaining` | views: `contract_year_computed`; functions: `compute_restructure_charges`, `edfl_restructure_cut_amounts` |
| `edfl_restructure_share` | views: `contract_year_computed`; functions: `check_deion_rule`, `check_deion_rule_on_restructure`, `compute_restructure_charges`, `edfl_restructure_cut_amounts`, `edfl_restructure_remaining`, `max_restructure` |
| `edfl_signing_fraction` | views: `contract_year_computed`; functions: `compute_cut_charges`, `compute_trade_charges`, `edfl_fa_award_window`, `max_restructure` |
| `edfl_taxi_rule_subject` | views: `taxi_eligibility_status`, `team_inseason_compliance`; functions: `check_taxi_eligibility`, `taxi_weeks_credit_due` — **new**, invoker since `psclass_06` |
| `edfl_transfer_in_progress` | functions: `check_cap_ceiling`, `check_contract_30pct_rule`, `check_contract_minimum_salary`, `check_deion_rule`, `check_first_season_week_rules`, `check_option_bonus_not_year1` |
| `league_minimum_salary` | functions: `check_bid_minimum_salary`, `check_contract_minimum_salary`, `check_practice_squad_value`, `compute_restructure_charges`, `edfl_poach_offer_valid`, `edfl_practice_squad_convertible` … |
| `season_cash_meets_minimum` | functions: `submit_fa_offer` |
| `tier_value_snapshot_id` | views: `tier_reference_values`; functions: `chart_bid_target` |
| `try_uuid` | views: `player_transaction_feed` |

### Views with no `anon` SELECT

`auction_tier_flag_recommendations`, `auction_tier_team_flags`, `calendar_admin_events`, `calendar_admin_weeks`, `dianna_prospects`, `dianna_trade_block`, `draft_pick_board`, `draft_prospect_board`, `free_agent_offer_ppv`, `goodell_memo_queue`, `goodell_upcoming`, `insider_feed`, `insider_live`, `insider_subject_names`, `league_active_roster_acquisitions`, `league_fines`, `league_fund`, `league_office_feed`, `league_transaction_log`, `morts_thoughts`, `player_career_earnings`, `player_contract_history`, `player_contract_year_breakdown`, `player_transaction_feed`, `player_value_history`, `player_value_removals`, `poachable_players`, `published_value_snapshots`, `team_cash_window_progress`, `team_manual_bids`, `tier_reference_values`, `trade_block_status`, `watchlist_markers_effective` — 33 views.

**Three of those are readable by no client role at all** — `dianna_prospects`, `dianna_trade_block`
and `insider_subject_names`. The first two belong to the `dianna` role; the third is an internal
helper the definer views read. If a page ever appears to need one of them, it needs a different
view, not a grant.

All are readable as `authenticated`. Correct **if** every page reading them is login-gated.
`draft_pick_board` is on the list for a reason that generalises: it reads `player_transaction_feed`,
which calls `winning_bid_link` — a Class B function — so **any view that reads
`player_transaction_feed` is `authenticated`-only whatever its own grant says.**

### Definer functions with an `authenticated` grant and no gate in the body

All read-only (`STABLE`) — previews, eligibility tests and resolvers — except `rls_auto_enable`,
Supabase's event-trigger function, which cannot be invoked directly. The three that wrote tables
were made `service`-only by `grants_05`. **A new definer function that writes must either gate in
its body or be `service`-only (SR-56).** This cut's two definers keep to that: `edfl_matchup_detail`
is `STABLE` and reads only; `edfl_sync_week_projections` writes and gates on `team_owners` in its
body.

### Advisor state (Supabase security linter, as of v2.2; catalog figures re-derived for v2.3)

The linter was not re-run for this cut — it was read-only against the catalog — so this is v2.2's
reading with each group's underlying figure re-derived from `pg_class`, `pg_proc` and `pg_policies`
at the v2.3 stamp. The same six groups, all known and all larger only where the new objects made
them larger: `security_definer_view` (the definer list in §3, now **26** with `league_week_status`),
`anon_security_definer_function_executable` ×6 (the table above — **unchanged**; it was briefly
seven between `psclass_01` and `psclass_06`),
`authenticated_security_definer_function_executable` (every definer function the app or a trigger
reaches — expected; 197 definers now), `extension_in_public` ×2 (`btree_gist`, `pg_net`),
`rls_enabled_no_policy` ×13 (the tables in §2 — the same thirteen) and
`auth_leaked_password_protection` — an Auth dashboard setting that is off.

**`function_search_path_mutable` is still gone.** It flagged `mort_line` and the five Goodell line
builders at various points on September 19; `goodell_06` and `bots_01` cleared both sets, and the
re-derived count of EDFL functions with a mutable `search_path` is **zero** at this stamp too.

The grant regression scripts (read every view as both roles; list every definer function's ACL)
are in `EDFL_DB_Convention_FunctionGrants.md`.

---

## 13. Application conventions

- Server Actions **return** `{ ok, message }` refusals; they never throw — Next.js masks a thrown
  message in production.
- **No template literals** in delivered JavaScript — build strings with `+`. Relative imports only.
- **Never compute money in JavaScript.** Read a view or call a function; do not re-derive a cap
  saving client-side even for an optimistic update.
- **Money display follows R-12 (September 17, 2026), and the direction is part of the figure's
  meaning.** `lib/formatMoney.js` exports three formatters and **the call site names which one the
  figure IS** — never a flag, because a flag gets copied from the line above it:
  - `formatCost` — anything the league **takes**: a charge, a salary, dead money, cash spent, a bid,
    a fine. `Math.ceil` on the signed value, so a charge never reads low.
  - `formatRoom` — anything an owner may still **spend**: cap space, cash available, room under the
    spend floor. `Math.floor` on the signed value, so room never reads high and an overage never
    reads small.
  - `formatMoney` — **neither**: a ledger figure that is a fact rather than a budget. A contract's
    total value, career earnings, a closed season's number. Half away from zero, unchanged.

  `ceil(used) + floor(room)` can never exceed the cap, and a team $0.33 over prints `-$1` rather
  than `$0`. The sweep of the pre-R-12 call sites finished September 19 except for
  `app/free-agency/FreeAgencyBoard.js`.

- **`formatExactMoney` is untouched by R-12 and has a closed consumer list** — the restructure
  surfaces, the team Overview grid and the Fifth Year Option board. It rounds nothing, so a
  fraction stays visible where the database guarantees whole dollars and a fraction would be a
  defect. **Do not adopt it elsewhere to "fix" a fractional figure**: those values are real (§11,
  rule 1.9) and `formatCost` / `formatRoom` are correct for them.

- **Still true, and now the reason the above works:** never compute money in JavaScript. A figure is
  read from a view or a function and printed; only its rounding direction is decided on the client.
- Surface database error messages verbatim. They are written to be read by owners and name the rule.
- A function that gates on `auth.uid()` must be called through the **session** client
  (`createSupabaseServerClient()`); through `adminClient()` the uid is null and the gate refuses.
- One component owns player links (`components/PlayerLink.js`).
- **Filter every `.select()`** (§9). Use an explicit `.range()` or `.limit()` on anything that can
  grow.
- `.ledger` is the table class for rows a human reads; `.grid-table` is the numeric primitive. A
  `.ledger` card flip at 640px needs `data-label` on every `td`.
- A client component reading `Date.now()` in the render body is a hydration mismatch. Clocks are
  state, null until mount.
- Render database-composed sentences verbatim — `taxi_eligibility_status.warning` and
  `ps_ineligible_reason`, `roster_injury_status.injury_label` and `ir_ineligible_reason`,
  `team_inseason_compliance.reasons`, `officer_action_items().title`/`detail`,
  `edfl_cut_timing_forced()`. Never compose them client-side; the injury tooltip on the Matchup page
  is byte-identical to the one on the roster because both come from the same expression.
- Calendar dates are read by `rule_ref` (§10); a new app read keyed on one is added to
  `edfl_rule_ref_consumers()` in the chat.

### Repo hazards

The remote is `github.com/lewaiworkspace-byte/dynasty-league-app`; `main` is the only baseline
(SR-41). The commissioner's clone has `core.autocrlf=true`, so a precondition hash is taken from the
committed blob (`git show HEAD:file`), never from the working file.

---

## 14. What this file cannot tell you

Stated plainly so it is not mistaken for completeness.

- **Whether a window is open right now.** Poaching opens 00:00 ET September 22; no auction tier is
  scheduled; free agency windows and trade blocks both live on a clock. All of these change without
  a migration.
- **Whether the three Discord webhooks are stored.** They live in Vault and no client can read
  them. `goodell_wire_status()` answers for Robo; Mort's and Dianna's are answered by whether their
  dispatchers have written a ledger row. **At the v2.2 stamp Mort and Robo were both live** — Robo's
  webhook was stored and acknowledged with HTTP 204 at 18:55 ET September 19 — **and Dianna's channel
  did not exist yet.** This cut did not re-check; the ledgers read 515 · 1 · 0 as they did then.
- **What Robo will say next.** `goodell_upcoming` answers it for the calendar, but only for the next
  thirty days, and a memo queued after this stamp is not in it.
- **What a sealed table holds.** Deliberately unread (§2).
- **Whether the RLS policies hold for an ordinary signed-in owner** in every case (§8).
- **View SQL** — about 124,000 characters across 57 views — and **function bodies** — about
  528,000 characters across 260. Ask in the chat for any one; the chat reads it live.
- **What a projection will say next week.** `player_week_projections` is overwritten by every
  Refresh; only `proj_stats` at the last pull survives, and the first-down rates are an estimate.
- **Row counts an hour from now.** Every figure here is a timestamp.
- **What the app does with a column.** This file describes the database; `CLAUDE.md` and the code
  describe the app.

Where a document and a function disagree, the function wins — read the function. Known to lag the
database at this stamp: the Technical Manual (v21) and Rule Book (v1.3) do not yet carry poaching,
the 3.3(h) officer power, the DT rulings or the App Notes for what was built on September 19 and 20
(TM v22 and Rule Book v1.4 are owed), and **TM 3.4(b) names a different injury designation list
than `edfl_injury_designation_qualifies()`** — the function is the ruling until the amendment lands
(§0d); the two feature specs written before their builds (Restructure v0.2, League Year Rollover
v0.1) are history, not description.
