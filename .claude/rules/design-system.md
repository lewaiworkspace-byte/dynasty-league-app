---
paths:
  - "app/*.css"
  - "app/**/*.css"
  - "app/layout.js"
  - "components/AppBar.js"
  - "components/ThemeToggle.js"
  - "components/ui/**"
---

# The design system and the stylesheets

Tokens, themes and how the stylesheets grow. Loads with any stylesheet, the layout and the app bar.

### The design system

`app/layout.js` loads `globals.css`, then `tokens.css`, then `kit.css`. **`globals.css` is
untouched and stays that way**: every rule in it reads its colours through variables, so
`tokens.css` repaints all 1,765 lines without editing one. The old look is two one-line
deletions away in `app/layout.js` — drop the `tokens.css` import for the old palette, drop
`className="edfl-app"` from `<body>` for the old shapes — and either works alone.

- **Both token blocks are `html:root`-prefixed**, making them (0,2,1) against
  `globals.css`'s own (0,2,0). They win on **specificity**, not on the order Next.js
  concatenates CSS chunks in, which nothing guarantees. **Do not drop the `html`.**
- **Dark is the base**, via `:not([data-theme="light"])`, which also matches the
  no-attribute case — so the palette does not depend on the inline theme script having run.
- **Since UI test batch 1 (October 17, 2026) the bar, the hero and the rail FOLLOW THE
  THEME** (Lewis, October 10: light mode fully light, header included). `--hero` and the
  `--bar-*` tokens now carry the theme's own values, and the literal-hex hero and rail rules
  higher in `kit.css` are overridden at its foot. The September rule — that those surfaces
  were permanently dark and read literal hexes — is retired; **do not re-add a literal hex to
  the bar or the hero.** The palette is Design System v2 (Drive › EDFL 2.0 › UI Refresh,
  tokens.json v2), written into `tokens.css` under the September variable NAMES so nothing that
  reads them changed: `--neon` is teal (the one action colour), `--brass` is gold (attention),
  the money colours are v2's, and dead money is a saturated red that sits on a red notice
  ground (`--st-bad-bg`) when it must land on a dark card.
- **The reflow is scoped to `.edfl-app` on `<body>`.** Its one idea: **a link navigates, a
  button acts** — `a.btn` is a quiet tile, `button.btn` is the neon action. It needed no
  page edits because the markup already distinguished them.
- **Neon is the action colour and nothing else wears it**; one per screen, and it is the
  thing you can press. **Gold is attention** — a figure still moving, a count at its limit.
  Hence a matchup leader is *brighter* rather than coloured, and a bare link is body ink
  with an underline and neon only on hover.
- **Colour on a roster row means CONTRACT TYPE, never position**, and marks the exceptions:
  practice squad dimmed and dashed, veteran free agency unmarked; **a rookie deal is marked
  by its word badge, not a colour** (October 10 — teal now means "press here", so
  `--ct-rookie` is plain ink). Keyed on `contract_type`, **not `roster_status`** — different
  facts, and the table shows the second as its own tag. The three-colour version is rejected
  permanently: its blue and violet were `--c-cap` and `--c-ppv`, and a currency colour means
  one thing everywhere.
- **`globals.css` has no rule for an unclassed `<a>`**, so every bare link rendered in the
  browser's default blue. `kit.css` fixes it with `.edfl-app a:not([class])`, and
  **`:not([class])` is the whole of the scoping** — anything with a class already has a
  rule and this must not reach it.
- **The app bar is one flex row with no wrap**, and since batch 3 it holds only Settings (the
  football-gear logo), the Commissioner Portal button (officers only), the team tri-graph and
  Sign out; the breadcrumb row, the league title
  (EDFL logo either side; both logos in `public/brand/`), the compliance pill and the view
  row are rows of their own beneath it, and the office row is `components/OfficeBar.js`, fixed
  to the foot of the screen with the body paying its height. **Adding a control to the bar
  means measuring it at 390px**, not looking at it; batch 1 measured the shell at 390 and 1280
  in both themes on a static fixture (scrollWidth = clientWidth, every ink at 4.5:1).
- **The team badge in the bar is never hidden, at any width** (batch 2, October 18: an old
  `.edfl-whoami{display:none}` under 641px hid it on every phone). It is `teams.abbrev`
  (Lewis: tri-graphs save space; a team logo joins it once all ten exist), with the full name
  as its label; longer badges (observer, no-team e-mail) wrap to two lines, then ellipsis.
  The spacer gives way, never Settings or Sign out.
- **The Commissioner Portal button shrinks by breakpoint, not by squeezing** (batch 3, October
  19): the whole name above 640px, "Portal" from 375 to 640, the shield alone below 375, the
  count always. Measured at 320–1280 in both themes with every real tri-graph: no overflow,
  the bar stays 60px tall, and the quiet state is filled like Settings (its old outline was
  1.2:1 against the bar). Only an officer's bar carries it, so an owner's bar is unchanged.

- **`kit.css` grows by APPENDING a dated block and touching nothing above it.** Every batch
  since the design layer has done that, and it is the only reason an SR-38 complete-file
  replacement of a 45KB stylesheet is checkable: the diff is one hunk at the end. **A new
  component class carries an owned prefix** — `.kit-`, `.edfl-`, `.mk-` — and is defined
  there. **Never add a rule to `globals.css`, and never redefine a class it owns**: `.pc-*`
  alone is nineteen classes worn by files your batch may not be touching.
- **To change how an existing class looks, scope the override to `.edfl-app`** and say in the
  comment what it overrides and why.
- **Prefer a real class to `:has()`** for a layout rule. It works in every browser this app
  supports, but a layout rule that silently does nothing on an older one is not worth the
  elegance when a class on the element costs nothing.
- **Verify a layout by MEASURING it, not by looking at a screenshot.** `scrollWidth` against
  `clientWidth`, and every element's `getBoundingClientRect()` against the viewport, at each
  breakpoint. A screenshot cannot show overflow because the overflow is off the frame — which
  is how the app bar overflowed every phone for a week, and how `/cap-sheet` dragged the whole
  page sideways by 68px for far longer. **An element crossing the viewport edge is only a
  defect if it is not inside a scroll container**: walk up to the nearest ancestor with
  `overflow-x: auto|scroll` before reporting it.
- **Check every ink against every surface it lands on.** The same token sits on the page
  background, on a card and on a raised cell, and those are three different contrast tests.
  `--ink-3` passed against one and failed AA against the other two.
  **Dark `--accent-rust` is `#FF6B6B`, not Design System v2's `#FF4545`** (UI test batch 4,
  October 19): it is text (`.void-tag`, `.row-note.bad`, `.ps-tag.spent`, `.btn-danger`) and
  `#FF4545` measured 4.33 on `--surface` (the owner card's "YOU" tag) and 3.82 on
  `--surface-2`. `#FF6B6B` clears every dark ground (lowest 4.67, on `--surface-2`). Dead
  money is `--c-dead`, a different token, and keeps `#FF4545`. **Do not put it back to the
  v2 value.**


### Inventories and one shared colour rule

- **`grep '^\.'` against `globals.css` is not a class inventory** — it misses every
  rule inside a media query and every indented line. Search anywhere on the line. This
  produced a false "class missing" report once.
- **The team-name colour on `/scoreboard` and `/standings` is one rule in `kit.css`**
  (`.edfl-app a.team-name`), not in `globals.css`. The unclassed-anchor rule is scoped
  `a:not([class])` and `.team-name` carries a class, so without it every team name rendered in
  the user agent's default link blue at 1.3:1 — it was never a palette problem. The week
  picker is a wrapping grid at the foot of the page; **do not make it a scrolling row again**.
