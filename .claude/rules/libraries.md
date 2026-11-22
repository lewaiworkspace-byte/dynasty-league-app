---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
  - "lib/**"
---

# Key libraries and shared components

Each module named here is the single client implementation of what it owns.

`getCurrentTeamOwner.js` — identity, and exports `isCommissionerOrCo()` and the shared
refusal string. The two-gate comment block in that file is the authority.
`authUser.js` (`getAuthUser()`: who is signed in, from the middleware's header, once per
request) · `authHeader.js` (the header's name; no imports, so the middleware can use it) ·
`leagueName.js` (`getLeagueShortName()`, cached five minutes; **the only cached read** — nothing
else is cached this way without a ruling on how stale it may be). All three since UI test batch 40.

`supabaseClient.js` (browser) · `supabaseServerClient.js` (session-aware server) ·
`supabaseAdmin.js` (service role, sparingly — see the database boundary) ·
`safeNext.js` · `formatDate.js` · `formatMoney.js` (five named exports —
`formatMoney`, `formatCost`, `formatRoom`, `formatMoneyDelta`, `formatExactMoney` —
and the header comment is the authority on which to call) · `tierRows.js` (**the** status
vocabulary) · `bidMath.js` · `contractMath.js` · `contractAssistant.js` ·
`leagueMinimum.js` · `bidPayload.js` · `delegationNotes.js` · `thirtyPercentRule.js`
(the only client implementation of the 30% Rule; all three forms import it) ·
`ppvMath.js` · `deadCapPreview.js` · `optionBonusApply.js` · `statsHelpers.js` ·
`fetchAllRows.js` (the page-until-exhausted pager for server reads; returns `{ rows, error }`
and appends the unique tiebreaker column -- it was two copies in the trades pages) ·
`injuryReport.js` · `injurySync.js` · `freeAgentPool.js` · `restructureRoster.js` ·
`tradeStatus.js` · `featureFlags.js` · `playerSearch.js` (the shared minimum-query
length and result cap — the page, the Server Action and the app bar box all import
them rather than each picking a number) · `statsImport.js` (the one nflverse importer -- admin button and daily cron) · `dataExports.js` (the Data Center's datasets -- the only reads behind `/data/export` and
`/api/mcp`) · `dataFormats.js` (CSV/XLSX/Markdown and the briefing pack) · `dataMcp.js` (the
connector's tools) · `sleeperProjections.js` (the projections
pull and its filter — a player with only an ADP is not a projection) · `playerHeadshot.js`
(the Sleeper CDN URL and the initials fallback) · `library.js` (the only markdown renderer; reads `content/library/`) ·
`waiverPriority.js` (which run's order a page shows, and that run's arguments; the wire and
Team HQ both call it)

**Shared components worth knowing by name:** `components/OfferForm.js` (the only offer
form), `components/InjuryCross.js` (renders a label, decides nothing),
`components/PracticeSquadWarning.js` (renders on non-null), `components/LibraryFeedback.js` (decides nothing; the database gates withdraw and reply), `components/InstallPrompt.js`
and `components/ServiceWorkerRegistrar.js` (the PWA shell; the registrar's
`updateViaCache: 'none'` is half the kill switch).

**Third-party UI libraries (UI test batch 31, November 21, 2026).** `sonner` is the only toast: `components/AppToaster.js` mounts it once in `app/layout.js`, and a client component shows a message with `toast.success(...)` (a Server Action returns `{ ok, message }` and cannot toast); do not write a second toast. A library is pinned to an exact version in `package.json` and added one batch at a time, its colours set from the Design System tokens (inline custom properties, or a dated block at the foot of `kit.css`), never by editing the library. **No Tailwind and no shadcn/ui:** shadcn needs Tailwind, and this app's styling is its own.

**Each of these is the single client implementation of what it owns.** Several exist
specifically because the logic had been copied two or three times and had already
drifted. **Single-implementation modules stay single-implementation** — if you find
yourself writing a second copy of one, that is the signal to stop and import instead.
