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

`supabaseClient.js` (browser) · `supabaseServerClient.js` (session-aware server) ·
`supabaseAdmin.js` (service role, sparingly — see the database boundary) ·
`safeNext.js` · `formatDate.js` · `formatMoney.js` (five named exports —
`formatMoney`, `formatCost`, `formatRoom`, `formatMoneyDelta`, `formatExactMoney` —
and the header comment is the authority on which to call) · `tierRows.js` (**the** status
vocabulary) · `bidMath.js` · `contractMath.js` · `contractAssistant.js` ·
`leagueMinimum.js` · `bidPayload.js` · `delegationNotes.js` · `thirtyPercentRule.js`
(the only client implementation of the 30% Rule; all three forms import it) ·
`ppvMath.js` · `deadCapPreview.js` · `optionBonusApply.js` · `statsHelpers.js` ·
`injuryReport.js` · `injurySync.js` · `freeAgentPool.js` · `restructureRoster.js` ·
`tradeStatus.js` · `featureFlags.js` · `playerSearch.js` (the shared minimum-query
length and result cap — the page, the Server Action and the app bar box all import
them rather than each picking a number) · `statsImport.js` (the one nflverse importer -- admin button and daily cron) · `dataExports.js` (the Data Center's datasets -- the only reads behind `/data/export` and
`/api/mcp`) · `dataFormats.js` (CSV/XLSX/Markdown and the briefing pack) · `dataMcp.js` (the
connector's tools) · `sleeperProjections.js` (the projections
pull and its filter — a player with only an ADP is not a projection) · `playerHeadshot.js`
(the Sleeper CDN URL and the initials fallback) · `library.js` (the only markdown renderer; reads `content/library/`)

**Shared components worth knowing by name:** `components/OfferForm.js` (the only offer
form), `components/InjuryCross.js` (renders a label, decides nothing),
`components/PracticeSquadWarning.js` (renders on non-null), `components/LibraryFeedback.js` (decides nothing; the database gates withdraw and reply), `components/InstallPrompt.js`
and `components/ServiceWorkerRegistrar.js` (the PWA shell; the registrar's
`updateViaCache: 'none'` is half the kill switch).

**Each of these is the single client implementation of what it owns.** Several exist
specifically because the logic had been copied two or three times and had already
drifted. **Single-implementation modules stay single-implementation** — if you find
yourself writing a second copy of one, that is the signal to stop and import instead.
