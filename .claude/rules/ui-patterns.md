---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
---

# Page and component patterns

Decisions about how pages read, fail and render that apply across the app.

- **Do not hard-code a year range, a count, or a first and last season** for a strip built
  from data. That assumption has been wrong twice.
- **Text an owner reads never states the number of teams as a literal.** Count the rows the
  page loaded, or name no number. The league's size is data, and a literal goes wrong silently
  the day it changes.
- **Do not unwrap the nested elements in a history cell** — every child of that cell is a
  flex item, and bare siblings lay the lines out side by side instead of stacked.
- **A page's reads do not all fail the same way, deliberately.** A read that *is* a
  panel's content fails closed — no panel, a banner instead, because an empty table looks
  like a working one. A read that only *supplies settings* fails open — the page renders on
  its fallback and says so, naming the value in use when it changes which controls are
  offered. **Do not make these consistent** in either direction.
- **A message written for verbatim display is rendered unchanged.** Do not paraphrase it
  or rebuild the sentence from the counts beside it.
- **"How is this calculated" is the explain icon, and only the explain icon**
  (`components/ExplainButton.js`; Lewis, November 11, 2026: "a simple symbol that will be used
  throughout the app ... subtle ... I don't want it taking up a lot of space"). A 16px circled
  "i" beside a heading or figure opens a small card titled "How this is calculated" with an X.
  **Never put an explanatory paragraph on the page, and never draw a second icon for this**; put
  `edfl-explain-host` on the row the card should span (the heading row `.edfl-explain-h`). The
  caller writes the words; a count of teams in them comes from data, never a literal.
- **Player cards, matchups, team pages and trades open in the pop-up sheet**
  (`components/SheetHost.js`, mounted once in `app/layout.js`; Lewis, November 11, 2026, "like
  Sleeper ... swipe it down to exit"). It catches plain same-tab `<a>` clicks to `/player/<id>`,
  `/matchup/<week>/<id>`, `/team/<id>` and `/trades/<id>` (never `/trades/new`) and shows the
  real page in a same-origin iframe named `edfl-sheet`, where `html[data-in-sheet]` hides the
  app chrome (kit.css, November 11 block). **Keep those links plain anchors with no `target`**
  (a target, `download`, `data-sheet="off"`, a modifier key, or a link inside the app bar, the
  crumbs, the office bar or any `<nav>` is left alone). **Do not convert it to intercepting
  routes**: they re-host the page inside the page behind, so its crumb portal, Server Action
  redirects and `router.refresh()` act on the wrong page. Each sheet pushes a history entry
  with the same URL, spread from `history.state` so Next's `__NA` marker survives (without it
  Next reloads on back). The sheet decides and reads nothing; every gate stays on the page.
  **Batch 10:** a plain `/player/<id>` link opens `/player/<id>/mini` (the Mini Player Card,
  player-card.md); `data-full-card`, a query or a hash keeps the full card. `/player/<id>/injury`
  is a sheet page too. An iframe named `edfl-panel` (the Roster tab's laptop panel) is marked
  in-sheet the same way (`app/layout.js`), and its links open the sheet over the page.
- **Do not re-sort or re-key an already-sorted list** returned ordered by the view.
- **Unrecognised statuses fall through to the raw string** rather than being guessed at.
