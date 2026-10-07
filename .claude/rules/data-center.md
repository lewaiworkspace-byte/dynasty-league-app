---
paths:
  - "app/data/**"
  - "app/api/mcp/**"
  - "lib/dataExports.js"
  - "lib/dataFormats.js"
  - "lib/dataMcp.js"
  - "components/ConnectorPanel.js"
  - "package.json"
---

# The Data Center and the Claude connector

One list of datasets behind both doors, the same for every owner.

- **Do not bump the spreadsheet library pin casually** — the pinned version is the last
  its publisher shipped to npm, and its advisories are parsing-only, which does not apply
  to a write-only path.

- **`lib/dataExports.js` is the ONE list of datasets, and both doors read it.** The download
  route and the MCP tools call `loadDataset()`; neither has a query of its own. **Do not add a
  read to `app/api/mcp/` or `lib/dataMcp.js` that bypasses it.**
- **A dataset must be the same for every owner.** That rule is what makes the connector's
  service-role read safe: there is no session behind a key, so `auth.uid()` is NULL and the
  route cannot use the session client. Every dataset reads either a `true`-policy relation, a
  definer view that filters itself (`auction_tier_results`, `published_value_snapshots`), or
  applies the **everyone** branch of a sealed table's policy **as an explicit filter**
  (`trades` → `TRADE_PUBLIC_STATUSES`; `free_agent_offers` → window `status = 'resolved'`).
  **Never add a sealed or own-team-only source** (open bids, delegations, hides, unresolved
  offers, waiver claims, watchlists, Insider submissions, `team_cash_transactions`, draft or
  proposed trades, `owner_directory`, `cut_history`'s email columns).
- **`loadDataset()` projects every row onto the dataset's `columns`.** A view gaining a column
  must not leak into a file; adding an export column is an edit to `columns`, on purpose. It
  also trims binary-fraction noise to the cent (`cents()`); figures are otherwise unrounded --
  the display rounding rules are for screens.
- **CSV is machine-first** (keys in row 1, no preamble -- unlike the injury report's CSV); XLSX
  is human-first (labels, an About sheet); Markdown carries its own as-of stamp, units and
  column dictionary. **`toXlsx` must keep `compression: true`** -- one season of
  `stats_games` is ~9 MB uncompressed, past Vercel's 4.5 MB response limit, and that is also
  why `stats_games` requires a season.
- **Connector keys: the plaintext is never stored.** `create_my_api_key()` returns it once;
  the table (`owner_api_keys`, RLS on, no policies, no `anon`/`authenticated` grant) holds a
  SHA-256 hash. `api_key_resolve()` is **service_role only** -- granting it to `anon` would
  let anyone with the publishable key test guesses. Three live keys per owner; owner or
  officer may revoke.
- **The connector is read-only and says so** (`readOnlyHint` on every tool). A write tool
  would need a session-shaped identity the key does not provide -- do not add one by calling
  an `auth.uid()`-gated function through the service-role client.
