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
  squad weeks warning** while he is on the wire. `app/player/[playerId]/loadCard.js` reads the same
  predicate on `header.current_contract_id`; `player_card_header.roster_status` is unchanged and
  still reports the spot he was cut from. A failed read prints an error, never the old chip alone.

- **The card is one page with no tabs (UI test batch 6, November 10, 2026; Lewis's pick on
  the Player Card canvas).** A header (headshot, name, start rate) and six boxes in Lewis's
  order -- Actions, This season, Contract, Value, Stats, History -- with jump buttons that
  wrap on a phone (every one on screen) and run down the side from 900px. **Do not bring the
  tabs back or reorder the boxes**; both are his rulings. Everything else the old Contract tab
  had is unchanged on `/player/<id>/contract` ("Full contract details"), and both pages read
  through `loadCard.js` so they cannot disagree (SR-62). `ContractBox` reads and rounds
  exactly as `ContractTab` does; **change one, change the other**.
- **The Actions box is drawn only when the page says the viewer owns the player's current
  team** (`isMine`); `?tab=actions` scrolls to it. Restructure links to `/restructure`, Cut and
  Move to the owner's Roster tab, whose dialogs do them -- their props are the whole roster
  read; Extend and Trade block are disabled "soon" placeholders, because the app does not have
  them. It decides nothing and writes nothing; **do not mount the cut or move dialogs here**
  without the roster read they need, and do not turn a placeholder into a button that opens on
  nothing.
- **The header shows START RATE, not PPV or tier** (Lewis, November 9). Start rate = final weeks
  his points counted in his EDFL team's best-ball lineup / final weeks he was on an EDFL active
  roster, for the current season once a week of it is final, otherwise the last season. It and
  the This season chart (actual, projected, trend over finished weeks) come from
  `edfl_player_card_summary` and `edfl_player_card_weeks`, and Pos Rk on Stats from
  `edfl_player_season_ranks`: **no score is summed and no trend is fitted in JavaScript.**
  **These functions exist on the TEST database only** (November 2026); the Database Reference
  must name them, and the live database must carry them, before this card is re-cut for `main`.
- **Losing auction bids fold into one line in History** (`TransactionsTab` with `foldBids`;
  Lewis, November 10). The fold only counts the bids the feed returned to this reader; it
  changes nothing about who sees which bid.
- **Headshots are Sleeper's CDN thumbnails by URL** (`lib/playerHeadshot.js`), initials when
  there is none, **never a broken-image icon, never stored, never `next/image`** — that would
  need `sleepercdn.com` in `next.config.js`'s `remotePatterns`, and that file belongs to the
  PWA batch.
