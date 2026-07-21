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
- **Two Supabase clients:**
  - `lib/supabaseClient.js` — public anon key, read-only (RLS allows public SELECT
    only, no write policies exist for it)
  - `lib/supabaseAdmin.js` — service_role key, SERVER-ONLY, bypasses RLS. Only ever
    import this into Server Actions (`'use server'` files), never into `'use client'`
    components. The key lives in Vercel's `SUPABASE_SERVICE_ROLE_KEY` env var (no
    `NEXT_PUBLIC_` prefix — that prefix is what exposes a var to the browser, so it
    must never be added to this one).

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

- **Salary cap:** $1,500/team for 2026 (~half the real 2026 NFL cap). Adjusts yearly
  by the same % the real NFL cap changes. $1 fantasy = $100,000 real NFL money.
  Teams must spend ≥89% of the cap each season.
- **Roster:** 25 active + 7 taxi squad. Best ball scoring, 1 QB/2 RB/4 WR/2 TE/1 K/2
  FLEX starters.
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
- **Deion Rule:** a contract year's real salary (guaranteed + non-guaranteed) must
  be at least as much as that year's prorated signing bonus share, so a team can't
  write off almost the whole cap charge as bonus proration while paying next to
  nothing in actual salary that year. Only applies to real contract years, not void
  years (void years carry no real salary by design). Enforced in
  `lib/contractAssistant.js`'s `generateContract()`, which adds void years (up to
  the max) as needed to bring a generated contract into compliance.
- **Dead cap:** on cut/trade, remaining prorated bonus + remaining guaranteed salary
  (+ option bonus) come due immediately that league year. Non-guaranteed and
  unconverted roster bonuses are forgiven.
- **Roster bonuses:** don't count against the cap until they convert to real salary,
  which happens at 00:01 ET the Monday before the season's first game (stored per
  season in `league_cap_settings.roster_bonus_conversion_at`). Before conversion,
  treated like non-guaranteed money.
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
  philosophy's shape while satisfying the Deion Rule. The per-philosophy dollar
  ratios are a first-pass design, not from real data — worth tuning once used in
  practice. Everything it fills in stays manually editable.

## Things still to build (from most to least recently discussed)

1. Sleeper player sync (pulling the full player pool and rosters automatically,
   replacing manual copy/paste)
2. Cut/trade actions in the UI (the dead-cap math already exists in the database,
   needs buttons/flows)
3. A web-based redraft tool for the 2023/2024/2025 rookie classes (three separate
   draft events)
4. Blind-bid free agency (many players open at once, grouped into tiers, one tier
   biddable at a time)
5. League news / team budgeting (mentioned in original scope, not yet started)
