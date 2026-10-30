# CLAUDE.md drift report

Audited against `origin/main` at `a92d66f` ("Batch 7-1: the Poaching board's footer says
"floor", not "bar""). Local `main`, `HEAD` and `origin/main` were the same commit when the audit
ran. I changed no code. The only file in this branch is this report.

**Labels:** **CONFIRMED** means the repo matches the claim. **MISSING** means the claim names
something the repo does not contain. **DIFFERENT** means the thing exists but the repo does not
match the claim's description. Claims the repo cannot settle, such as live deployments, the
database and GitHub settings, are in a separate section at the end with no label.

## Summary

| Result | Count |
|---|---|
| CONFIRMED | 44 |
| MISSING | 0 |
| DIFFERENT | 7 |

Every file, function, hook and rule file that CLAUDE.md names exists. All seven drifts are
about behaviour or description:

1. **Line endings.** `.gitattributes` normalises only `*.sh`.
2. **Write actions.** Four write-path Server Action files do not call `getCurrentTeamOwner()`.
3. **Refusal shape.** Five admin Server Action files return `{ status: 'error', message }`, not `{ ok: false, message }`.
4. **Money formatting.** Money is formatted outside `lib/formatMoney.js` in two places.
5. **Date formatting.** A client component formats a timestamp without pinning the time zone. Two others pin the zone inline instead of using `lib/formatDate.js`.
6. **CI checks.** The GitHub check runs more checks than the edit hook, so they are not "the same instruction-file checks".
7. **Rule numbering.** Three code comments cite "ground rule 10" for the rule that is now ground rule 9.

---

## What this is

| # | Claim | Result | Evidence |
|---|---|---|---|
| 1 | Next.js 14 | CONFIRMED | `package.json`: `"next": "14.2.5"` |
| 2 | App Router | CONFIRMED | `app/` holds `layout.js`, `page.js` and the route folders. There is no `pages/` directory. |
| 3 | Plain JavaScript, no TypeScript | CONFIRMED | There are no `*.ts`, `*.tsx` or `tsconfig.json` files in the repo. |
| 4 | Supabase (Postgres + RLS) | CONFIRMED | `package.json` lists `@supabase/ssr` and `@supabase/supabase-js`. The clients are in `lib/supabase*.js`. |
| 5 | Vercel | CONFIRMED | `vercel.json` (cron entries for `/api/cron/injury-sync`) |
| 6 | Sleeper is a data source | CONFIRMED | `lib/sleeperProjections.js`, `app/admin/sync-players/actions.js` (the Sleeper player pool fetch) and `lib/playerHeadshot.js` (the Sleeper CDN) |
| 7 | No path alias exists; all imports are relative | CONFIRMED | There is no `jsconfig.json` or `tsconfig.json`, and no `from '@/…'` import in `app/`, `components/`, `lib/` or `middleware.js`. |
| 8 | `EDFL_Database_Reference_for_ClaudeCode.md` exists and its version is on line 3 | CONFIRMED | Line 3 reads `**v3.0 — October 5, 2026, 07:00 ET.** …` |

## Ground rules

| # | Claim | Result | Evidence |
|---|---|---|---|
| 9 | `.gitignore` covers only `node_modules`, `.next`, `.env.local`, `.vercel` | CONFIRMED | `.gitignore` has exactly those four lines. |
| 10 | There is no `.env.local` | CONFIRMED | There is no `.env*` file in the checkout. |
| 11 | "Line endings are normalised on checkout" | **DIFFERENT** | `.gitattributes` holds only `*.sh text eol=lf`. There is no `* text=auto` or other global rule, and `core.autocrlf` is unset in this checkout. Only shell scripts are normalised by the repo. Any other normalisation depends on each machine's own git config. The advice that follows (hash `git show HEAD:<file>`, not the working copy) is still sound. |
| 12 | Server Actions return refusals; no exported action throws; an internal helper may throw only where every exported caller catches it | CONFIRMED | Of 33 `'use server'` files, only two contain `throw`. Both throws are in internal helpers, and the exported callers catch them. `app/admin/prospects/actions.js:51` (`getJson`) is caught inside `refreshProspectsAction`'s `try` (lines 101, 122/140, 164/167). `app/admin/sync-players/actions.js:63` (`syncSleeperPlayers`) is caught at `:179–183` in `syncSleeperPlayersAction`. |
| 13 | The refusal shape is `{ ok: false, message }` and callers check `.ok` | **DIFFERENT** | Five admin action files return `{ status: 'error', message }` (the form-state shape) instead: `app/admin/import-stats/actions.js`, `app/admin/injury-sync/actions.js:27,37`, `app/admin/league-office/actions.js:41`, `app/admin/prospects/actions.js:41`, `app/admin/sync-players/actions.js:176,183`. They still return and do not throw, so they keep to the rule's intent but not the shape it names. |
| 14 | Rule numbering: return-don't-throw is ground rule 9 | **DIFFERENT** (comments are stale) | CLAUDE.md now numbers it 9. Three files still cite "ground rule 10": `app/data/actions.js:14`, `app/library/actions.js:17`, `app/settings/actions.js:13`. These files cite "ground rule 9" and match: `app/fifth-year-option/actions.js:28`, `app/fifth-year-option/FifthYearOptionBoard.js:118`, `app/search/actions.js:29`, `app/search/SearchPanel.js:95`. |
| 15 | A Node runtime "may or may not be present" and `npm run build` is the script | CONFIRMED | `package.json` has `"build": "next build"`. Node v22.22.0 is present in this cloud container. |

## Access

| # | Claim | Result | Evidence |
|---|---|---|---|
| 16 | `middleware.js` is the front door. Every path needs a session except a short allowlist | CONFIRMED | `middleware.js`: `PUBLIC_PREFIXES = ['/login', '/auth/callback', '/api/cron', '/install', '/api/mcp']`, `PUBLIC_FILES = ['/manifest.webmanifest', '/sw.js', '/offline.html']`. Anything else without a user is redirected to `/login?next=…`. |
| 17 | Some pages have no gate of their own and rely on the middleware alone | CONFIRMED | Pages with no `redirect(`, `getCurrentTeamOwner`, `getCurrentViewer` or `auth.getUser` include `app/cap-sheet/page.js`, `app/standings/page.js`, `app/stats/page.js`, `app/stats/player/[playerId]/page.js`, `app/calendar/page.js`, `app/actions/page.js`, `app/bids/results/[tierId]/page.js` and `app/waivers/page.js`. (`access.md` lists thirteen. The others it names read the user for content but never redirect.) |
| 18 | `getCurrentViewer()` exists, widens page gates and read-only loaders only | CONFIRMED | Defined in `lib/getCurrentTeamOwner.js`. The five Server Action files that call it call it only in loaders: `app/fifth-year-option/actions.js:52` (`loadFifthYearOptionBoard`), `app/free-agency/actions.js:126` (`loadFreeAgencyState`), `app/poaching/actions.js:45` (no write in the file), `app/search/actions.js:34`, `app/transactions/actions.js:9`. Their write actions call `getCurrentTeamOwner()` (for example `app/fifth-year-option/actions.js:71,104,153`, `app/free-agency/actions.js:371,411`). |
| 19 | `getCurrentTeamOwner()` exists and returns null for the observer login | CONFIRMED | `lib/getCurrentTeamOwner.js` returns the `team_owners` row or `null`. An observer has no such row. |
| 20 | "Every Server Action that writes keeps calling `getCurrentTeamOwner()`" | **DIFFERENT** | Four write-path files never call it. They check `supabase.auth.getUser()` on the session client and leave the gate to a database function that reads `auth.uid()`. The files are `app/data/actions.js` (`create_my_api_key`, `revoke_api_key`), `app/library/actions.js` (`library_feedback_submit`, `_withdraw`, `_respond`), `app/notifications/actions.js` (`save_my_notification_prefs`, `send_my_test_notification`) and `app/settings/actions.js` (`save_my_roster_prefs`). Each file's header says "the DATABASE is the gate". So for an observer, the database refusal is the only layer, not the app check plus the database. |
| 21 | The comment blocks in `lib/getCurrentTeamOwner.js` are the authority | CONFIRMED | The observer block sits above `getCurrentViewer()`, and the "TWO GATES" block sits above `isCommissionerOrCo()`. |
| 22 | `isCommish` is the strict commissioner test (`is_commissioner`) | CONFIRMED | It has one definition: `app/admin/page.js:86` `const isCommish = Boolean(me.is_commissioner);`. It is a local variable, not a shared helper. |
| 23 | `isCommissionerOrCo()` is the officer test | CONFIRMED | `lib/getCurrentTeamOwner.js` exports `isCommissionerOrCo(teamOwner)`: `is_commissioner \|\| is_co_commissioner`, null-safe. |
| 24 | `access.md` and `navigation.md` exist | CONFIRMED | `.claude/rules/access.md`, `.claude/rules/navigation.md` |

## Money and dates

| # | Claim | Result | Evidence |
|---|---|---|---|
| 25 | `lib/formatMoney.js` exists with `formatCost` (rounds up), `formatRoom` (rounds down), `formatMoney` (half away from zero) | CONFIRMED | `lib/formatMoney.js:133` `formatMoney`, `:155` `formatCost`, `:171` `formatRoom`. The header comment documents ceil/floor on the signed value. The file also exports `formatMoneyDelta` (`:187`) and `formatExactMoney` (`:262`), which CLAUDE.md does not mention but `libraries.md` does. |
| 26 | `lib/formatMoney.js` is the **only** money formatter | **DIFFERENT** | `app/player/[playerId]/VisualBreakdown.js:152,297` builds chart axis ticks as `'$' + Math.round(t).toLocaleString('en-US')`. That is local money formatting with `Math.round` and no direction, and no rule file documents it. `app/bids/results/[tierId]/export/route.js:337–341` (`pdfMoney`) is a second formatter, but `money-and-dates.md` documents it as the PDF exception. |
| 27 | `lib/formatDate.js` exists and pins America/New_York | CONFIRMED | `lib/formatDate.js:17` `export const EASTERN_TIME_ZONE = 'America/New_York'`. Exports: `formatDateTime`, `formatShortDateTime`, `formatDate`, `browserTimeZone`. |
| 28 | Dates render with `lib/formatDate.js`; never `toLocaleString()` in a client component | **DIFFERENT** | `app/admin/owner-activity/OwnerActivityPanel.js:13` is a `'use client'` file that calls `d.toLocaleString('en-US', { month, day, hour, minute })` with **no `timeZone`**. It renders in the viewer's zone, which is the bug `formatDate.js` exists to prevent. `app/scoreboard/Scoreboard.js:74` and `app/matchup/[week]/[matchupId]/MatchupBoard.js:98,389` are also client files. They pin `timeZone: 'America/New_York'` inline, so the times are correct, but they do not go through `lib/formatDate.js`. (`components/OwnerInfoPanel.js:103` formats with an explicit zone, an owner's local clock, which looks deliberate. `app/admin/import-stats/ImportForm.js:88–107` formats integers, not dates.) |

## Shared modules

| # | Claim | Result | Evidence |
|---|---|---|---|
| 29 | `lib/` holds identity and the two gates (`getCurrentTeamOwner.js`) | CONFIRMED | `lib/getCurrentTeamOwner.js` |
| 30 | The three Supabase clients | CONFIRMED | `lib/supabaseClient.js` (browser, `supabase`), `lib/supabaseServerClient.js` (`createSupabaseServerClient`), `lib/supabaseAdmin.js` (`adminClient`) |
| 31 | `safeNext.js` | CONFIRMED | `lib/safeNext.js:20` `export function safeNext(value)` |
| 32 | "the rest (listed in `libraries.md`)" | CONFIRMED | All 34 files in `lib/` are named in `.claude/rules/libraries.md`, and every module it names exists in `lib/` or `components/`. |

## What this repo enforces mechanically

| # | Claim | Result | Evidence |
|---|---|---|---|
| 33 | `.claude/settings.json` denies the Supabase tools | CONFIRMED | `"mcp__*upabase*"`. It also denies `Bash(psql *)` and `Bash(supabase *)`. |
| 34 | It denies editing any `.sql` file | CONFIRMED | `"Edit(*.sql)"`. Claude Code applies Edit rules to every file-editing tool. |
| 35 | It denies `git add -A`, `git add --all`, `git add .` | CONFIRMED | `"Bash(git add -A)"`, `"Bash(git add -A *)"`, `"Bash(git add --all)"`, `"Bash(git add --all *)"`, `"Bash(git add .)"`. The file also denies force-push (`git push --force *`, `git push -f *`) and six `anthropic-skills:edfl-*` skills, which CLAUDE.md does not list. |
| 36 | Auto memory is turned off | CONFIRMED | `"autoMemoryEnabled": false` |
| 37 | A session-start hook prints where the checkout stands against `origin/main` | CONFIRMED | `.claude/settings.json` `SessionStart` runs `.claude/hooks/session-start.sh`, which prints the branch, HEAD, ahead/behind against `origin/main` and the uncommitted count. |
| 38 | An edit hook reports when CLAUDE.md passes 200 lines or a rule file has no `paths:`, and does not undo the edit | CONFIRMED | `PostToolUse` matcher `Edit\|Write\|MultiEdit` runs `.claude/hooks/instruction-files.sh` (cap=200, `paths:` frontmatter check). It exits 2 with a message and changes no files. |
| 39 | CLAUDE.md is under its 200-line cap | CONFIRMED | `CLAUDE.md` is 170 lines. |
| 40 | A GitHub check on every push to `main` and every PR runs the production build | CONFIRMED | `.github/workflows/checks.yml`: `on: push: branches: [main]`, `pull_request`. Job `build` runs `npm run build` on Node 24 with placeholder env vars. |
| 41 | …and "the same instruction-file checks" as the edit hook | **DIFFERENT** | `.github/scripts/check-instructions.sh` runs the hook's two checks and two more: `.claude/skills/*/SKILL.md` must be at most 500 lines, and no `.claude/hooks/*.sh` or `.github/scripts/*.sh` may have CRLF line endings. So CI checks a superset of what the hook checks. |

## The rule files (`.claude/rules/`)

| # | Claim | Result | Evidence |
|---|---|---|---|
| 42 | Cross-cutting: `money-and-dates`, `data-fetching`, `ui-patterns`, `markup-and-css`, `libraries`, loaded with app code | CONFIRMED | All five exist. Each `paths:` covers `app/**/*.js` and `components/**/*.js`. |
| 43 | `database-boundary` loads with Server Actions, route handlers, `lib/` and the admin pages | CONFIRMED | `paths:` `app/**/actions.js`, `app/**/route.js`, `app/api/**`, `lib/**`, `app/admin/**`. It also covers `components/*Form.js` and `components/ownerInfoActions.js`. |
| 44 | Platform: `access`, `navigation`, `pwa`, `design-system`, `instructions` | CONFIRMED | All five exist. |
| 45 | Areas: `team-hq`, `cap-and-money-pages`, `cuts-and-contracts`, `free-agency-and-poaching`, `auction`, `trades`, `waivers`, `scoreboard-and-matchups`, `stats-and-imports`, `injuries`, `library`, `data-center`, `settings-and-owner-info`, `transaction-log`, `player-card`, `admin-portal` | CONFIRMED | All 16 exist. CLAUDE.md names 27 rule files, and 27 exist. None is unlisted. |
| 46 | Each rule file is scoped to the files it protects (`paths:`) | CONFIRMED | All 27 have `paths:` frontmatter, and every listed path or glob matches at least one file in the repo. |
| 47 | `instructions.md` loads when you edit any of these files | CONFIRMED | `paths:` `CLAUDE.md`, `.claude/**` |

## The database boundary (repo-checkable parts)

| # | Claim | Result | Evidence |
|---|---|---|---|
| 48 | The 30% Rule and the poach floor are mirrored in forms as early warnings | CONFIRMED | `lib/thirtyPercentRule.js`. The poach checks are in `components/OfferForm.js` (documented in `free-agency-and-poaching.md`). |
| 49 | No `.sql` files are in the repo (schema is changed chat-side) | CONFIRMED | `git ls-files` lists no `*.sql` file. |
| 50 | `isCommish` and `isCommissionerOrCo()` are not swapped | CONFIRMED | The only `isCommish` (`app/admin/page.js:86`) reads `is_commissioner` alone. |
| 51 | `lib/formatMoney.js` call sites are migrated one at a time, never bulk-renamed | CONFIRMED (process claim, consistent with the code) | `formatMoney`, `formatCost` and `formatRoom` call sites coexist across `app/`. `money-and-dates.md` names the files deliberately left half-away. |

## Not verifiable from the repo

These are outside the repo, so I gave them no label.

- **Live at dynasty-league-app-gold.vercel.app.** The host appears as a fallback in
  `app/data/page.js:142` and in `content/library/how-to.md:124` and `technical-manual.md:82`.
  The deployment itself was not checked.
- **The database reference mirrors the commissioner's copy byte for byte.** The commissioner's copy is not in the repo.
- **"Nothing requires [the GitHub check] to pass before a push lands."** This is a GitHub
  branch-protection setting, not something stored in the repo.
- **Database-side rules.** Cut settlement, withdrawal arithmetic, option void years,
  `auth.uid()` gating and SQL-built sentences live in the database. Per ground rule 2, this
  audit did not check the database or infer its contents from code.
- **Coverage of the code-wide rules.** "PPV is never drawn with `$`", "a blank never reads
  as compliant" and "a dated rule is a calendar row" were only spot-checked. The searches
  behind rows 26 and 28 did not hit PPV, and a full sweep would need a page-by-page read.
