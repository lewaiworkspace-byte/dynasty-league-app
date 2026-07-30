# Dynasty League App — Project Context

This is a companion web app for a 10-team dynasty fantasy football league. Sleeper
runs actual gameplay (rosters, matchups, scoring); this app tracks everything Sleeper
can't: contracts, salary cap, PPV (a value-comparison metric), and cash tracking.

The person running this project has no coding experience. Explain plainly, avoid
jargon where possible, and always confirm before anything destructive (force pushes,
dropping data, etc.) — same caution Claude in claude.ai has been using throughout
this build.

## Stack

- **Frontend/hosting:** Next.js 14 (App Router), plain JavaScript (not TypeScript),
  deployed on Vercel, auto-deploys on push to `main`
- **Database:** Supabase (Postgres), accessed via `@supabase/supabase-js`
- **Styling:** Plain CSS in `app/globals.css`, using CSS custom properties for the
  design system (dark background, gold `#c9a227` and rust `#c6493b` accents,
  monospace for all dollar figures, condensed display font for headers)
- **Supabase clients & auth files:**
  - `lib/supabaseClient.js` — session-aware browser client via `@supabase/ssr`'s
    `createBrowserClient`, exported as `supabase`. Still effectively read-only in
    practice (RLS allows public SELECT only, no write policies exist for it).
  - `lib/supabaseServerClient.js` — session-aware server client bound to Next's
    `cookies()`. Use when code must know who's logged in (RLS applies as that
    user).
  - `lib/supabaseAdmin.js` — service_role key, SERVER-ONLY, bypasses RLS. Exports
    an `adminClient()` factory function, not a pre-built client — call
    `adminClient()` to get one. Import it with a relative path (e.g.
    `../../../lib/supabaseAdmin`), not an `@/` alias — matching the rest of the
    codebase; this factory-vs-named-export detail has produced wrong generated
    code before. Only ever import into Server Actions (`'use server'` files),
    never into `'use client'` components. The key lives in Vercel's
    `SUPABASE_SERVICE_ROLE_KEY` env var (no `NEXT_PUBLIC_` prefix — that prefix
    is what exposes a var to the browser, so it must never be added to this one).
  - `lib/getCurrentTeamOwner.js` — returns the logged-in user's `team_owners` row
    (`id`, `team_id`, `email`, `is_commissioner`) or `null`. Use it in Server
    Components/Actions to find out who's asking; note it returns `null` both
    for "not logged in" and "logged in but no linked `team_owners` row".
  - `middleware.js` (repo root) — refreshes the Supabase auth cookie per request.

## Database structure (Supabase/Postgres)

Core tables: `teams`, `players`, `contracts`, `contract_years` (one row per season of
a contract), `contract_events` (cut/trade/extension log), `league_config` (singleton),
`league_cap_settings` (one row per season), `ppv_weight_table`, `free_agent_bids`.

Key view: `contract_year_computed` — computes PPV, cap_charge, cash_value, and
dead_cap_if_cut for every contract-year automatically from raw inputs. Never
hand-calculate these; always read from this view. `team_cap_summary` rolls it up
per team per season.

Nothing gets deleted to preserve history — a cut contract stays with `status='cut'`,
an extended contract will stay with `status='extended'` and link via
`extends_contract_id`. Keep this pattern for any new features.

## League rules this app encodes

- **Money rounding:** all dollar figures round up to the nearest whole dollar. This
  rule lives in the league's separate rule book document, not in this file — if a
  money-related question can't be answered from CLAUDE.md, check there before
  assuming it's undecided. Note: this creates a real, currently-unresolved
  inconsistency with the rookie wage scale table and existing saved contracts,
  which still use cents — reconciling those to whole dollars is a separate future
  task, not something to fix opportunistically as part of unrelated changes.
- **Salary cap:** $1,500/team for 2026 (~half the real 2026 NFL cap). Adjusts yearly
  by the same % the real NFL cap changes. $1 fantasy = $100,000 real NFL money.
  Teams must spend ≥89% of the cap each season.
- **Roster:** 25 active + 7 taxi squad. Best ball scoring, 1 QB/2 RB/4 WR/2 TE/1 K/2
  FLEX starters — the highest-scoring eligible player at each slot counts
  automatically each week from across the full 25-man active roster (starters
  + bench), not a manually-set lineup.
- **Contracts:** signing bonus (prorated evenly over up to 5 years, including any
  void years), guaranteed salary, non-guaranteed salary — both paid out weekly across
  a 14-week regular season, only for weeks on the ACTIVE roster (taxi squad time does
  not accrue salary). Max free agent contract length is 5 years; void years
  (free-agent contracts only) can extend the deal further, capped at
  `5 - total_years` void years so total years + void years never exceeds 5.
- **PPV (Player Perceived Value):** a value metric for comparing contracts of
  different shapes/lengths for free agency purposes. Weights (confirmed, do not
  change without asking): signing bonus counts at its full, undiscounted total,
  attributed entirely to Year 1 (not the per-year prorated cap slice — how the
  bonus is amortized for cap purposes doesn't change the value the player actually
  banked, which is also why adding void years never changes achieved PPV);
  guaranteed salary decays 95/90/85/80/75% across years 1-5; non-guaranteed salary
  decays 30/20/15/10/5%; roster bonus decays 50/40/30/20/10% (higher than
  non-guaranteed since it pays out all at once, not weekly).
- **Deion Rule:** a contract year's real salary (guaranteed + non-guaranteed +
  roster bonus + any option bonus in its exercise year) must be at least as much
  as that year's prorated signing bonus share, so a team can't write off almost
  the whole cap charge as bonus proration while paying next to nothing in actual
  salary that year. Only applies to real contract years, not void years (void
  years carry no real salary by design). Enforced in `lib/contractAssistant.js`'s
  `generateContract()`, which adds void years (up to the max) as needed to bring
  a generated contract into compliance.
- **Dead cap:** on cut/trade, remaining prorated bonus + remaining guaranteed salary
  (+ option bonus) come due immediately that league year. Non-guaranteed and
  unconverted roster bonuses are forgiven.
- **Roster bonuses:** don't count against the cap until they convert to real salary,
  which happens on September 2nd of that season every year — a fixed rule, computed
  directly (not a per-season stored/editable value). Before conversion, treated like
  non-guaranteed money.
- **Rookie contracts:** lengths are based on years REMAINING on a hypothetical 4-year
  real rookie deal, since this league redrafts real past classes: 2023 class = 1 year
  left, 2024 = 2 years, 2025 = 3 years, 2026 = 4 years. Round counts per redraft: 2023
  = 3 rounds, 2024 = 3 rounds, 2025 = 4 rounds, 2026 = 5 rounds (10 teams each).
  Contract value is based on where a player is picked in THIS league's redraft, not
  his real historical NFL draft slot. A rookie wage-scale formula (mapping redraft
  slot → dollar value, normalized against real NFL rookie-scale data and cap
  inflation) is in progress — check with the person before assuming it's finalized.
- **Contract types:** `rookie`, `fifth_year_option`, `veteran_free_agent`,
  `practice_squad`, `franchise_tag_exclusive`, `franchise_tag_non_exclusive`,
  `transition_tag`. Only `veteran_free_agent` contracts may have void years.
- **Extensions & exercised option bonuses:** both modeled as a NEW contract linked
  back to the original via `extends_contract_id`, not a special mechanic of their own.
- **Taxi squad:** drafted rookies can occupy a taxi slot during the first two seasons
  of their rookie contract with zero change to that contract's numbers. Other taxi
  players should be on a minimal practice-squad-style deal.

## Conventions used so far

- All money formatted via a local `formatMoney()` helper (`$1,234` / `-$500` for
  negatives), not `Intl.NumberFormat` directly.
- Server Components fetch data directly with the Supabase client (no separate API
  routes for reads).
- Writes go through Server Actions in `actions.js` files marked `'use server'`.
- `export const revalidate = 0;` on every page that shows live data — never cache
  cap/contract numbers.
- **Data fetching — the 1,000-row ceiling:** PostgREST caps any query at 1,000
  rows by default. An unbounded `.select()` on a table bigger than that returns
  the first 1,000 rows with **no error and no warning** — the code looks and
  behaves correctly right up until the table outgrows the ceiling, then quietly
  serves incomplete data forever. This has already caused two real bugs: the
  Fix Contracts page showed "Unknown player" for anyone past row 1,000, and the
  Sleeper sync inserted hundreds of duplicate players because its
  existing-players read was truncated, so name+position matching failed for
  everyone beyond the window (and compounded — the duplicates grew the table,
  pushing more players past the ceiling each run).
  - **Tables big enough to matter:** `players` (~3,190), `player_game_stats`
    (game-level, five seasons), `nfl_games` (five seasons),
    `edfl_player_season_stats` (view), and `auction_tier_result_years` (one row
    per bid per contract year — reaches 1,000 at ordinary tier sizes: 20
    players × 10 teams × 5-year deals).
  - **Small enough to ignore:** `teams` (10), `team_owners` (10), `contracts`
    (~130), `auction_tiers`, `league_cap_settings`, `league_config`.
  - **The rule:** any new select against a large table must be narrowed
    (`.eq()` / `.in()` on an already-bounded id list / `.single()`) or paged
    with `.range()` in a loop until a short page comes back. `.limit(5000)` is
    not a fix — it just relocates the invisible ceiling.
  - When paging, always `.order()` on something stable and unique. Without an
    ORDER BY, row order across pages isn't guaranteed, so pages can overlap or
    skip rows. Existing paginated readers, all three ordered: `fetchAllPages()`
    in `lib/statsHelpers.js` (by `player_id, season_year` — that view's grain
    is one row per player per season), `fetchAllExistingPlayers()` in
    `app/admin/sync-players/actions.js` (by `id`), and `fetchAllResultYears()`
    in `app/bids/results/[tierId]/page.js` (by `bid_id, contract_year_number`).

## Built so far (beyond the basic cap sheet/team/new-contract pages)

- **Rookie wage-scale auto-fill:** the New Contract form's "Load from Wage Scale"
  button (rookie contracts only) queries `rookie_wage_scale_slots` and
  `rookie_wage_scale_years` by `(draft_year, round, pick)` and fills in contract
  length, signing bonus, start year, and each year's guaranteed/non-guaranteed
  salary and roster bonus, using the table's exact per-year signing bonus
  proration rather than an even split.
- **Contract Assistant:** the New Contract form's assistant box (veteran free
  agent contracts only) takes a target PPV and a GM Philosophy
  (`front_loaded`/`back_loaded`/`pay_as_you_go` — see `lib/contractAssistant.js`)
  and generates a full contract (signing bonus, void years, per-year
  guaranteed/non-guaranteed salary) that hits the target PPV for that
  philosophy's shape while satisfying the Deion Rule, adding void years or (if
  even max void years isn't enough) reducing the bonus share as a last resort.
  All generated dollar figures round up to the whole dollar. The back-loaded
  philosophy also returns recommended (not auto-created) option bonuses for
  years 2+, since a real option bonus needs a saved contract's `contract_id`.
  The per-philosophy dollar ratios are a first-pass design, not from real data —
  worth tuning once used in practice. Everything it fills in stays manually
  editable.
- **Live contract preview:** `lib/contractMath.js`'s `computeContractPreview()`
  drives the Cap Charge / Cash / Dead Cap columns that update live in the New
  Contract form's year-by-year table as you type, before the contract is saved.
  Approximates `contract_year_computed`'s cap_charge/dead_cap_if_cut math but
  currently omits `prorated_option_bonus` (a column the view includes that this
  form doesn't yet collect or insert — harmless today since no contract created
  through this form sets it, but worth fixing if that ever changes). Roster
  bonus counts toward Cap Charge and Dead Cap only once that season's September
  2nd has passed, matching the database's fixed conversion rule, and — unlike
  prorated signing bonus, guaranteed salary, and option bonus — never
  accelerates forward into an earlier year's Dead Cap total, since a future
  year's roster bonus was never actually committed. `lib/contractMath.js` also
  exports `validateContract()`, a client-side Deion Rule check the New Contract
  form runs both on-demand ("Recalculate & Validate") and unconditionally right
  before every save, blocking `createContract` if it fails. Its salary check
  currently sums guaranteed + non-guaranteed + roster bonus only — it doesn't
  yet include option bonus in its exercise year, unlike the database's own
  Deion Rule check, which does. Confirmed low-impact today (the Contract
  Assistant never generates a nonzero option bonus) but worth closing if a
  manually-entered option bonus ever needs to satisfy the rule.
- **Sleeper player pool sync:** `/admin/sync-players` pulls Sleeper's full
  player list (QB/RB/WR/TE/K) via `app/admin/sync-players/actions.js`, using
  `?active=true` on the Sleeper endpoint, and reconciles it against the local
  `players` table — players already linked by `sleeper_player_id` are
  refreshed in place (keeping the local `full_name`/`position` as
  authoritative, not overwritten by Sleeper's), unlinked players are matched
  by normalized name + position, ambiguous name matches are skipped and
  surfaced for manual review, and unmatched Sleeper players are inserted as
  new. Safe to re-run. Has been run — `players` currently holds ~3,190 rows
  (up from a 132-row rookie-backfill-only state); `players.gsis_id` does
  exist as a column.
- **Site structure:** `/` is a home hub with quick links to the Cap Sheet, the
  Blind Bid Auction, Historical Stats (`/stats`), the Commissioner Action Log
  (`/actions` — in the public League section, not the admin area, since it
  needs no login), each team, admin tools (Build FA Tier, Tier Results, Fix
  Contracts, Manage Owner Cash), and an Account section (Login, My Cash
  Account). The Cap Sheet itself lives at `/cap-sheet`, not `/`.
- **Authentication:** magic-link (passwordless) email login. `/login`
  (`app/login/page.js`) calls `signInWithOtp` with a redirect to
  `/auth/callback` (`app/auth/callback/route.js`), which exchanges the code
  for a session and forwards to `?next=` or `/`. `middleware.js` at the repo
  root refreshes the session cookie on every request — Server Components
  can't set cookies, so that's the only place it can reliably happen. Pages
  needing a logged-in owner call `getCurrentTeamOwner()` and `redirect()` to
  `/login?next=...` themselves; there's no route-level gate in the
  middleware. Note the home page links are NOT permission-filtered — a
  non-commissioner sees the Manage Owner Cash link and gets redirected home
  on arrival (the page and its Server Action both enforce it server-side).
- **Access control:** every `/admin/*` page is commissioner-gated at BOTH
  layers — the page resolves `getCurrentTeamOwner()` and redirects (to
  `/login?next=<path>` with no session, to `/` for a non-commissioner), AND
  every write Server Action in those directories independently re-checks
  `is_commissioner` before touching the database, since Server Actions are
  callable endpoints regardless of what the UI renders. Applies to
  new-contract, new-tier, sync-players, import-stats, cash, tier-results,
  and fix-contracts (the last three also have `SECURITY DEFINER`-side
  checks or `require_commissioner()` in their RPCs). The two
  `useFormState` actions (sync-players, import-stats) return their forms'
  `{ status: 'error', message }` shape instead of throwing; the rest throw.
  `/admin/sync-players/page.js` is a thin server wrapper over
  `SyncForm.js` purely so the gate can run server-side — same split as
  import-stats.

  **Intentionally public — do NOT gate these:** `/`, `/cap-sheet`,
  `/team/[teamId]`, `/stats`, `/stats/player/[playerId]`, `/bids`,
  `/bids/results/[tierId]`, and `/actions` (a transparency page meant to be
  shareable outside the app entirely). `/bids/[tierId]/[playerId]` requires
  login but NOT commissioner (any owner bids). `/cash` requires login but
  NOT commissioner (an owner's own ledger) — its check is
  `getCurrentTeamOwner()` with no `is_commissioner` requirement, and that's
  correct as-is.
- **Owner cash tracking:** `/cash` is an owner's own read-only ledger
  (starting cash, adjustments, spent, available, plus transaction history)
  and `/admin/cash` is the commissioner's view of all ten teams with a form
  to record a transaction (`CashForm.js` + `actions.js`). Reads come from
  the `team_cash_available` view and `team_cash_transactions` table, both
  created directly in Supabase and NOT in the repo — their absence from the
  codebase is expected, not an error. `recordCashTransaction()` re-checks
  `is_commissioner` itself rather than trusting the page's redirect, since
  a Server Action is a callable endpoint regardless of what the UI shows.
  Both pages hardcode `seasonYear = 2026` rather than reading
  `league_config.current_season_year` — worth revisiting at rollover.
- **Historical stats pages:** `/stats` (`app/stats/page.js`, a client component
  reading via the anon client — public data, no Server Action) shows
  historical fantasy scoring from the `edfl_player_season_stats` database
  view. That view was created directly in Supabase and is NOT in the repo —
  its absence from the codebase is expected, not an error. Position filters
  (QB/RB/WR/TE/FLEX/K) switch both the player set and the stat columns;
  every column header sorts; name sorting uses the view's `last_name` field.
  Season filters include "Total", which aggregates all seasons per player
  client-side (FPPG/YPC recomputed from summed totals, not averaged). Player
  names link to `/stats/player/[playerId]`, a per-player season-by-season
  page with a career totals row. Both pages share
  `lib/statsHelpers.js` (column definitions, fetching, totals math, Excel
  export); the export uses the `xlsx` package via dynamic import so it only
  loads when the Export to Excel button is clicked. Season values render
  with fmt 'text', not number formatting — deliberate, so 2021 doesn't
  display as "2,021".
- **Historical stats import:** `/admin/import-stats` downloads one season at a
  time (2021-2025) of game-by-game player stats from nflverse and loads it
  into `nfl_games` and `player_game_stats` — both tables created directly in
  Supabase and NOT in the repo; their absence from the codebase is expected,
  not an error. Filters to QB/RB/WR/TE/K, resolves players by `gsis_id`
  (creating rows for historical players not in the Sleeper pool), and maps
  nflverse's column names via a `STAT_MAP` with fallbacks, reporting any
  unmapped categories in the UI rather than failing silently. Idempotent
  upserts, safe to re-run. `page.js` is a deliberate server-component
  wrapper exporting `maxDuration = 60` so the Server Action gets a
  60-second limit — don't merge `ImportForm.js` into it. Not linked from
  the home hub; reachable only by URL (and commissioner-gated like every
  other admin page — see Access control).
- **Player autocomplete:** the New Contract form's Player Name field is
  `app/admin/new-contract/PlayerAutocomplete.js`, a type-ahead search against
  the local `players` table (populated by the Sleeper sync). Position and NFL
  Team auto-fill from the selected player and are read-only. This removed the
  form's previous ability to create a contract for a player not yet in
  `players` — `actions.js` still has a find-or-create path for an unmatched
  name, but nothing in the UI can reach it anymore. Intentional, given the
  sync-first workflow this is built around.
- **Blind Bid Auction:** `/bids` is the public tier listing
  (anonymous interest labels based on bid count only — never amounts or
  bidders) and `/admin/new-tier` is the commissioner's tier builder
  (`TierBuilder.js` + `actions.js`), both live. Schema and win-processing are
  built and live-verified: `auction_tiers` (a real `auction_tiers_no_overlap`
  EXCLUDE/gist constraint — `btree_gist` installed — keeps only one tier open
  at a time), `auction_tier_players` (which players are in a tier; public-read,
  since that's open info even though bid contents are sealed), `submit_bid()`
  (a `SECURITY DEFINER` function — the only write path into `bids`,
  deliberately not going through `adminClient()` since it must derive the
  bidder from the caller's own session), `check_bid_deion_rule()` (a
  `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `bid_years`).
  Migrations are now tracked in `supabase_migrations.schema_migrations`
  (older schema changes were untracked SQL Editor pastes).

  The bid-submission UI is now built too: `app/bids/[tierId]/[playerId]/page.js`
  (server component — requires login, verifies the player is actually in that
  tier before rendering, loads any existing bid so it can be revised) +
  `app/bids/BidForm.js` + `app/bids/actions.js`. That action is the one
  Server Action in the app that deliberately does NOT use `adminClient()`:
  `submit_bid()` derives the bidding team from `auth.uid()`, which is null
  under the service role, so it must go through
  `createSupabaseServerClient()` instead. `lib/bidMath.js` is a separate
  implementation from `lib/contractMath.js` — the latter's option-bonus
  handling is flat-field semantics, wrong for a bid that carries a real
  forward-prorating option bonus. It reads PPV weights from
  `ppv_weight_table` (passed in from the page) rather than hardcoding them,
  with the hardcoded set kept only as a fallback if that fetch fails.
- **Tier resolution (commissioner) & public results:** a three-step flow,
  each step a separate deliberate action — nothing cascades automatically.
  1. **Evaluate** (`evaluate_auction_tier`) — after `closes_at`, picks a
     winner per player by highest total PPV, ties broken by earliest
     submission, and computes cap/cash flags. Sets `resolved_at`. Creates
     **no** contracts.
  2. **Resolve flags** — flagged teams are over the 125% cap limit or short
     on cash. Flags recompute on read, so an owner buying cash or cutting
     salary clears them on reload; alternatively the commissioner uses
     **Pass Over** (`pass_over_winner`) to strip a win and promote the
     next-highest bid. The rule book's 24-hour window for owners to fix
     flags is displayed but NOT enforced by the app — expiry does nothing
     on its own.
  3. **Verify** (`verify_auction_tier`) — only available with zero flags.
     Creates the real contracts, sets `verified_at`, publishes results.
     Final and irreversible.

  These three functions **replaced** `attempt_award_bid()`,
  `resolve_auction_tier()`, and `award_bid_to_next_best()`, which were
  dropped from the database. Don't reintroduce references to the old three.
  All three are `SECURITY DEFINER` and `GRANT`ed to `authenticated`, so they
  do **not** check the caller's role themselves — `app/admin/tier-results/actions.js`
  wraps each in `requireCommissioner()`, and that wrapper is the only thing
  gating them. The pages redirect non-commissioners too; that double-gating
  is deliberate, since a Server Action is a callable endpoint regardless of
  what the UI renders.

  Routes: `/admin/tier-results` (commissioner tier index with per-tier
  state) and `/admin/tier-results/[tierId]` (`page.js` server component +
  `TierResultsPanel.js` client component) for the flow itself;
  `/bids/results/[tierId]` is the public verified-results page, reading the
  anonymized `auction_tier_results` / `auction_tier_result_years` views
  (winners named, losing bids anonymous). `/bids` links to it for verified
  tiers via a separate query — its main tier list filters
  `resolved_at IS NULL`, so verified tiers never appear there.

  **Sealed-bid RLS:** the commissioner cannot read `bids` before a tier's
  `closes_at` passes — RLS seals them from everyone, including them. So
  `/admin/tier-results/[tierId]` showing no bids before close is correct
  behavior, not a bug, and the page says so explicitly. New DB objects this
  flow relies on: `auction_tiers.verified_at`, `auction_tier_team_flags`,
  `auction_tier_results`, `auction_tier_result_years`, and `bids.status`
  values `pending` / `winner` / `lost` / `passed_over`.
- **Commissioner action log:** `commissioner_actions` (public SELECT RLS, no
  write policy — writes only happen through `SECURITY DEFINER` functions) is
  surfaced at `/actions` (`app/actions/page.js`). That page is
  **deliberately public with no login gate** — it's a transparency record any
  owner can read and share outside the app, so don't add a redirect to it.
  Each entry carries an action type, a human summary, the reason given at the
  time, and a JSON snapshot of what changed. Two different logging paths feed
  it, on purpose: **cash adjustments log themselves via a database trigger**
  on `team_cash_transactions` (nothing in `app/admin/cash/` calls the logger),
  while **tier actions log from the Server Action** by calling
  `log_commissioner_action` after the RPC succeeds. In
  `app/admin/tier-results/actions.js`, `logAction()` swallows its own errors
  and writes to the server console instead — by design: the tier decision has
  already committed by then, so surfacing a log-write failure would report a
  failure that didn't happen. Don't convert it to a thrown error.
- **Fix Contracts (hard delete) — not the same as cutting a player:**
  `/admin/fix-contracts` (`page.js` server component + `FixContractsTable.js`
  client component + `actions.js`) lets the commissioner **permanently
  delete** a contract and all its years via `commissioner_delete_contract`,
  with a sibling `commissioner_delete_bid` for bids. This exists only for
  correcting mistakes — a contract entered wrong, leftover test data. It is
  **not** the cut/trade flow: a real cut produces dead cap and preserves the
  contract as history (`status='cut'`, per the never-delete convention above),
  and that feature is still unbuilt (see Things still to build). Don't merge
  the two concepts or add cut-like behavior here. A non-empty reason is
  required in both the Server Action and the database function, and it's
  published in the action log along with a snapshot of the deleted rows.
  Authorization is intentionally three layers deep — the page redirects
  non-commissioners, the Server Action re-checks, and the delete functions
  call `require_commissioner()` inside the database. That's not accidental
  redundancy: Server Actions are callable endpoints regardless of what the UI
  renders, and the RPCs are callable from outside the app entirely.

## Things still to build (from most to least recently discussed)

1. Sleeper roster sync (pulling which players are on which team's roster
   automatically — the player pool sync is done, this is the remaining half)
2. Cut/trade actions in the UI — note this is NOT `/admin/fix-contracts`,
   which hard-deletes a contract for mistake correction; a cut produces dead
   cap and keeps the contract on record (the dead-cap math already exists in the database,
   needs buttons/flows)
3. A web-based redraft tool for the 2023/2024/2025 rookie classes (three separate
   draft events)
4. League news (mentioned in original scope, not yet started — the team
   budgeting half of that original item is now covered by the owner cash
   pages)

**Open question on auth, carried over from before this was built:** prior
sessions established that the auth-linking trigger
(`link_team_owner_on_signup`), which connects a new signup to its
`team_owners` row by email, did NOT exist in the live database. Nothing in
this repo creates it. If it still doesn't exist, logging in will succeed but
`getCurrentTeamOwner()` will return `null` for everyone — every gated page
bounces to `/login`, and bids can't be submitted. Verify that trigger exists
(or link `user_id` by hand for the 9 seeded owners) before assuming login
works end to end. Claude Code has no database access and could not check
this.
