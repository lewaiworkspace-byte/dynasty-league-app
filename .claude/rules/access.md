---
paths:
  - "middleware.js"
  - "lib/getCurrentTeamOwner.js"
  - "lib/safeNext.js"
  - "app/page.js"
  - "app/layout.js"
  - "app/admin/**"
  - "app/api/**"
  - "app/auth/**"
  - "app/login/**"
  - "app/**/actions.js"
  - "app/**/route.js"
---

# Routes, gates and access

Who may reach which route, and the two layers every gate is built from. Loads when you open the middleware, an identity helper, a Server Action, a route handler or an admin page.

### The app has no public face, and `middleware.js` is the whole of that

**Every path requires a session except the allowlist in `middleware.js`:** `/login`,
`/auth/callback`, `/api/cron/*`, `/install`, `/api/mcp/*` (the Claude connector, which refuses
any request without a live owner connector key -- see its row below), and three exact files the
browser fetches without cookies: `/manifest.webmanifest`, `/sw.js` and `/offline.html`.
Everything else redirects to `/login?next=…`. One gate and one allowlist
replaced twenty per-page redirects beside twenty-five pages that had none — **a new route
is now closed by default, which is the point.**

**Thirteen page routes have no gate of their own and depend on that file alone:**
`/actions` `/bids` `/bids/results/[tierId]` `/calendar` `/cap-sheet` `/draft-picks`
`/league` `/scoreboard` `/standings` `/stats` `/stats/player/[playerId]`
`/team/[teamId]` `/waivers`, plus the two export routes. They were the public pages before
the front door closed, so they still read through the anon client. **Editing that allowlist
un-gates all thirteen at once, with nothing behind them.** Every other page keeps its own
redirect as a second line — belt and braces on purpose; removing one because "the
middleware covers it" is the wrong direction.

**The anon GRANTS behind those thirteen are still open**, so anyone with the publishable
key can read those views outside the app. Closing that is a sequence: move the pages to the
session client, deploy, confirm, *then* revoke. **Revoking first blanks thirteen pages.**

| Route | What | Access |
|---|---|---|
| `/` | **Renders nothing.** Redirects a linked owner to `/team/<their team>` and anyone else to `/league`. There is no index page | Any logged-in owner |
| `/league` | This week's scores and the standings table. A glance; `/scoreboard` and `/standings` are the full pages and are linked from it | Any logged-in owner |
| `/cap-sheet` `/team/[teamId]` `/stats` `/stats/player/[playerId]` `/bids` `/bids/results/[tierId]` `/bids/results/[tierId]/export` `/calendar` `/actions` `/scoreboard` `/standings` | Formerly public, now gated by the middleware alone — **no redirect of their own** | Any logged-in owner |
| The Scoreboard's refresh control | **Removed in batch 5** (SR-72): it reached a retired engine. Scores and projections refresh on their own. Read `scoreboard-and-matchups.md` before adding any control back to `/scoreboard` | — |
| `/waivers` | **No gate of its own**, like the Scoreboard — the page never redirects, and the database decides whether the wire is open at all (`edfl_wire_live()`), drawing one line when it is not. **Do not add a page-level gate**; the middleware is the front door | Any logged-in owner |
| The **claim controls** on `/waivers` (Claim, reorder, Withdraw) | Sealed: an owner sees only their own claims until the run executes — RLS on `waiver_claims`, not the page. **No count and no names of who else is in**, the same ruling as free agency's contested flag | Any logged-in owner |
| `/cash` `/values` `/bids/[tierId]/[playerId]` `/bids/[tierId]/delegate` `/player/[playerId]` `/trades` `/trades/new` `/trades/[tradeId]` `/restructure` `/fifth-year-option` `/transactions` `/injury-report` `/injury-report/export` `/search` `/league-finances` | Owner pages | Any logged-in owner |
| `/poaching` | Poaching's own route since 2D-3: the market's state, the owner's own exposure first, then every squad with the rookie bar. Reads `poachable_players` (authenticated only; its `poaching_open` flag **is** the calendar test — never a clock in JavaScript). **Mounts the same `components/OfferForm.js` as `/free-agency`**; `app/poaching/actions.js` holds the read and no submit | Any logged-in owner |
| `/matchup/[week]/[matchupId]` | Both sides of a pairing from one read, `edfl_matchup_detail` — or, for a week not yet scored, the projected pairing from `edfl_matchup_projection`. Gated like every page — **do not add `/matchup` to `PUBLIC_PREFIXES`**; it shows per-player production. The **Refresh projections** control is owner-gated in the database (`edfl_sync_week_projections` checks `team_owners`), not officer-gated, deliberately: nothing is settled from a projection | Any logged-in owner |
| `/prospects` | The rookie prospect board (`draft_prospect_board`) — ESPN's grade and ranks as published, QB/RB/WR/TE/K, with the Sleeper match once it exists. Drawer line under PLAYERS | Any logged-in owner |
| The **Media** tab on `/team/[teamId]` | **Drawn on the owner's OWN Team HQ only** (MEDIA-1): Dianna's card and *Tell Dianna*, the owner's own live submissions with Withdraw, `insider_feed`, and Mort's Thoughts (`morts_thoughts`). Another owner's HQ keeps three tabs. Every submission goes through `insider_submit()`, which returns its refusal as a sentence | The team's own owner |
| `/league-finances` | **Every team's fines, itemised, to every signed-in owner** — not own-team-only and not public. The two views it reads (`league_fines`, `league_fund`) have no `anon` grant. Read-only: fines are posted by the database, never from a form | Any logged-in owner |
| `/draft-picks` | **Login-gated BODY, no page redirect** — the board view has no `anon` grant, so the read is skipped and explained rather than refused. That branch now only fires for a signed-in login with **no `team_owners` row**, which is a real state, not dead code | Any logged-in owner |
| `/admin/tier-results` `/admin/cuts` `/admin/new-tier` `/admin/new-contract` `/admin/fix-contracts` `/admin/cash` `/admin/owner-activity` `/admin/trades` `/admin/restructure` `/admin/fifth-year-option` `/admin/injury-sync` `/admin/sync-players` `/admin/import-stats` `/admin/prospects` `/admin/league-office` | Widened admin pages. `/admin/prospects` refreshes the board from ESPN (no cron), matches to Sleeper, matches by hand and closes the rookie draft; `/admin/league-office` is Robo Goodell's memo desk — drafting a memo is an operation, not a ruling (RG-4), and its write functions carry their own officer checks. **`/admin/sync-players` and `/admin/import-stats` write through the service-role client, so their Server Action checks are the whole gate** — no database function stands behind them | Commissioner **or** co-commissioner |
| The **Publish Season Results** panel on `/admin/import-stats` | Officer control; `publish_edfl_season_results()` gates on `auth.uid()` itself and refuses an overwrite unless republish is passed. Republish is a separate two-step control | Commissioner **or** co-commissioner |
| `/admin/calendar` | **Calendar Loader** — edits league weeks and calendar entries. Strict by the default-DENY rule; every `calendar_*` function calls `require_commissioner()` | Commissioner only |
| The **officer action banner** | **On `/admin`, not on `/`.** `officer_action_items()` REFRESHES a state table on every call, so it belongs on a page two people open, not on a home page the whole league loads. The app bar's pill reads `officer_action_badge()` instead: two integers, no refresh, no titles | Commissioner **or** co-commissioner |
| The **commissioner pill** in the app bar | The **only** door to `/admin`, drawn only for an officer. Hiding it protects nobody — `officer_action_badge()` refuses a non-officer itself, the portal layout re-checks, and every `/admin` page redirects. It stops showing people doors they cannot open | Commissioner **or** co-commissioner |
| `/api/cron/injury-sync` | Not a page and not owner-reachable | **Vercel Cron only** — bearer `CRON_SECRET`, 503 if unset |
| `/api/cron/stats-sync` | Not a page. Daily import of the current season's NFL stats from nflverse; 200 `skipped` when nflverse has no file yet | **Vercel Cron only** — bearer `CRON_SECRET`, 503 if unset |
| The appointment control on `/admin/owner-activity` | Strict control on a widened page | Commissioner only |
| The **Owner directory** on `/team/[teamId]` | **A block at the foot of the Overview tab**, not a tab of its own. It is the only place an ordinary owner can edit their own card. **Self-edit only, for everyone** | Any logged-in owner |
| The **Designated cuts** block on `/team/[teamId]` | Own-team-only block under the tabs: end-of-week cuts not yet fired, with Withdraw. Read through the session client, filtered on the team's own contract ids. **Omitted when empty; a failed read renders its message**, never nothing | The team's own owner |
| The **Owner Directory** on `/admin/owner-activity` | The same component at `editScope="all"` — the one place officer editing of another owner's card lives | Commissioner or co-commissioner |
| `/library` `/library/[doc]` | **The League Library** — the Rule Book, the Owner How-To Manual and the Technical Manual rendered from `content/library/*.md` by `lib/library.js`, with a feedback thread at the foot of each. Own session gate **and** the middleware's. Feedback is **visible to every signed-in owner by ruling** (RLS on `library_feedback`); writes go through `library_feedback_submit` / `_withdraw` (author, while open) / `_respond` (`require_commissioner_or_co()`) | Any logged-in owner; replies commissioner **or** co-commissioner |
| `/library/[doc]/download/[format]` `/library/figures/[name]` | Route handlers: the closed download list (`.docx`/`.md`) and the How-To screenshots. **Each re-checks the session itself** — a route handler has no page gate behind it | Any logged-in owner |
| `/data` | **The Data Center**: every league-wide dataset as CSV, Excel or Markdown-for-Claude, the one-file briefing pack, and the owner's Claude connector links. Own redirect **and** the middleware's. The officers' list of every key is drawn for an officer; `officer_api_keys()` refuses anyone else itself | Any logged-in owner |
| `/data/export/[dataset]` | Route handler: `?format=csv\|xlsx\|md&season=&team=&position=`, and `briefing?format=md`. **Re-checks the session itself** and reads through the **session** client | Any logged-in owner |
| `/api/mcp/[[...key]]` | **The Claude connector** -- a stateless MCP server (Streamable HTTP, JSON responses). Allowlisted in the middleware because Claude calls it with no cookie; **its own gate is the owner's connector key** (`api_key_resolve()`, service_role only), checked on every request before anything is read. 401 otherwise. Read-only | Holder of a live owner key |
| `/install` | The how-to page for putting the app on a phone. **Reads nothing** — no database, no session, no league state — which is the only reason its allowlist entry is safe | Public |
| `/login` | Two-step OTP login (email → 6-digit code) | Public |
| `/auth/callback` | Legacy magic-link handler | Public |

> Page gates are recorded above as the **code** currently gates them. Whether a page
> *should* be strict is a league question that has moved before — check with the
> commissioner before widening or narrowing one, and change the page gate, every Server
> Action gate and the drawer line in the same commit.

**Every page with its own gate uses both layers, always:** the three-line gate
(`getCurrentTeamOwner()` → `redirect('/login?next=…')` signed out → `redirect('/')`
non-officer) **and** an independent re-check inside every Server Action. `next=` targets
pass through `safeNext()`, which refuses any control character and anything the URL parser
resolves to another origin (October 7, 2026: a tab let `/\t/evil.com` through, because
parsers strip tabs). **Do not loosen it.** The thirteen routes listed above have no page gate; their
Server Actions still re-check, and the ones that write still refuse in the database.

**`getCurrentTeamOwner()` returning null no longer means "signed out."** The middleware
means nobody unauthenticated reaches a page at all, so a null owner is a real login with
**no `team_owners` row** — a state the app bar renders deliberately.
Copy written for that branch should say the login is not linked to a team, not "sign in".

### The read-only observer login

**`getCurrentViewer()` returns `{ user, owner, observer }` and decides only whether a page,
or a loader that only reads, may run.** The observer is a signed-in login registered in the
database's `app_observers` table and read by `edfl_is_observer()`. It loads pages after a
deploy so they can be checked; it is never an owner, never an officer and never holds a
team. It is not a `team_owners` row, so it appears in no owner list, notice, wire or count.

- **Every Server Action that writes keeps calling `getCurrentTeamOwner()`**, which returns
  null for an observer, so the action refuses before it reaches the database — and the
  database refuses as well.
- **Never hand an observer to code that reads `owner.team_id` or `owner.id`.** A page that
  widens its gate tests `viewer.owner` for anything own-team, and treats the observer as an
  owner looking at somebody else's team.
- **An observer gets no officer page:** `isCommissionerOrCo(null)` is false and every
  `/admin` page keys on the owner row.
- **An observer is shown no offer or bid control** (October 7, 2026): `/free-agency`,
  `/poaching` and Team HQ's open-windows block take `readOnly={Boolean(viewer.observer)}`
  and draw the boards without "Make an offer", "Bid" or the offer form. This is
  presentation; the refusals above are the gate.
- The comment block above `getCurrentViewer()` in `lib/getCurrentTeamOwner.js` is the
  authority; this entry summarises it.

### Permissions and visibility

- **Adjacent buttons with different gates are intentional.** Approval is shared; the
  competitive-balance veto is commissioner-only. **Never widen the veto to match the
  button beside it**, and never call the officer helper anywhere in the appointment path
  — that action refuses first, on its own strict test.
- **A widened page can carry a strict control**, and the contact list on it is shown
  rather than hidden behind a button. **Do not "make it consistent."**
