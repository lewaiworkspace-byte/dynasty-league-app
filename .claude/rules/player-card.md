---
paths:
  - "app/player/**"
  - "components/PlayerLink.js"
  - "lib/playerHeadshot.js"
---

# The Player Card

Opened in the pop-up sheet, rounded two ways on purpose, and honest about a player on waivers.

- **The Value box opens with the weekly chart line** (`WeeklyValueLine.js`, UI test batch 12):
  value-chart.md carries its rules. The published chart's figures below it are unchanged.
- **The Mini Player Card** (`app/player/[playerId]/mini/`, UI test batch 10, November 11, 2026;
  Lewis: "This is perfect, we will refer to this as the 'Mini Player Card'") **opens wherever a
  player is tapped** (his ruling, 3:01 PM: "anywhere"): `SheetHost` turns a plain `/player/<id>`
  link into `/player/<id>/mini`, and its "Open the full player card" link, marked
  `data-full-card`, opens the full card one step further. Use that name in code, rule files and
  notes. From the top: photo, name, `POS • TEAM · Bye Week N`, the status tags that left the
  roster row; **Roster spot** (Active / IR / Practice Squad, own player only); projected points
  for the next five weeks with each opponent (`@` away, `(N)` neutral, Bye); the season with
  Starts (x/y); the contract; the full-card link. **No cut or trade box** (Lewis: "Remove this
  section, it is too much"): contract and trade actions stay on the full card. **Every button's
  state is a row of `edfl_roster_spot_options(contract)`**, a rolled-back dry run of
  `set_roster_status` (current, current_fine, allowed, allowed_fine, refused with the engine's
  sentence behind the explain icon); **do not re-check a rule here.** Rulings IR-1 to IR-3 (Nov
  11): no designation, NA or DNR = IR greyed (the database refuses it everywhere); Questionable =
  pressable with the warning that $25 falls at his kickoff unless he becomes Doubtful, Out, IR
  or PUP; on IR without a qualifying designation the IR button is **red**, with the fine warning
  under the buttons and the explain icon linking Rule Book 3.4 and 6.7. A press asks once, then
  calls `setRosterStatus`. The poach exemption and the hold are here too. Its reads:
  `edfl_player_upcoming`, `edfl_player_card_summary`, `edfl_player_season_stats`,
  `contract_year_computed`, `taxi_eligibility_status`, `roster_injury_status`.
- **The injury report** (`app/player/[playerId]/injury/`, batch 10) opens from a roster row's
  white pill: designation and since when, nature, notes, **Prognosis "No source yet"** (the
  source is Lewis's ruling, open), NFL roster status, and the last five weeks from
  `edfl_player_injury_weeks()` (labels from the database). Never infer a prognosis.
- **The full card's Cut and Move links** (batch 10): Cut goes to `/team/<id>?tab=roster&cut=<contract>`
  (the Cut dialog opens there); Move opens the Mini Player Card.
- **The Player Card's top row is not a way back.** A tap on a player's name opens the card in
  the pop-up sheet over the page the reader came from (`components/SheetHost.js`, November 11,
  2026; it replaced the August 27 new-tab decision), and the sheet's X, a swipe down or the
  phone's back gesture closes it. The row exists for arrivals by pasted URL, bookmark,
  Ctrl/Cmd-click or phone history, where the card is a page of its own. **Do not replace it
  with a history-based or `?from=` back link**: inside the sheet that would navigate the frame,
  and as a page the card cannot know its origin. **`PlayerLink` carries no `target`**; a target
  tells the sheet to leave the link alone, so putting `_blank` back silently restores new tabs.
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
