---
paths:
  - "app/player/**"
  - "components/PlayerLink.js"
  - "lib/playerHeadshot.js"
---

# The Player Card

Opened in a new tab, rounded two ways on purpose, and honest about a player on waivers.

- **The Player Card's top row is not a way back.** `PlayerLink` opens the card in a new tab,
  so the page the reader came from is still open behind it. The row exists for arrivals by
  pasted URL, bookmark or phone history. **Do not replace it with a history-based or
  `?from=` back link** — the link carries `noreferrer`, so the card cannot know its origin.
- **The player card's terms strip and its season tables round differently, and both are
  right.** The strip and the contract history describe a **deal** — its total value, its
  average, its signing bonus, its guaranteed money — which R-12 names as a ledger figure. The
  season tables are **charges** and round up. They can differ by a dollar on the same
  contract. **If they ever round the same way, one of them is wrong.**
- **`MarketValueTab`'s two Change cells call `formatMoneyDelta` and then strip the `$`.**
  That is deliberate: the helper is being used for its signed `+/-` and its grouping, not as
  currency, and the strip is what keeps a PPV delta from rendering as money. **Remove the
  whole call or leave it alone; do not remove the `.replace()`.**

- **The Player Card says "On waivers" for the same player**, in place of the Taxi Squad / IR
  chip, with a one-line note of who waived him and when claims resolve, and **hides the practice
  squad weeks warning** while he is on the wire. `app/player/[playerId]/page.js` reads the same
  predicate on `header.current_contract_id`; `player_card_header.roster_status` is unchanged and
  still reports the spot he was cut from. A failed read prints an error, never the old chip alone.

- **Headshots are Sleeper's CDN thumbnails by URL** (`lib/playerHeadshot.js`), initials when
  there is none, **never a broken-image icon, never stored, never `next/image`** — that would
  need `sleepercdn.com` in `next.config.js`'s `remotePatterns`, and that file belongs to the
  PWA batch.
