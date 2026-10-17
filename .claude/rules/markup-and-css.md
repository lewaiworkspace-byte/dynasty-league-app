---
paths:
  - "app/**/*.js"
  - "components/**/*.js"
  - "app/*.css"
  - "app/**/*.css"
---

# Markup and CSS classes

Which class answers which question. Loads once you open app code or a stylesheet.

### CSS and UI

- **`.grid-table` is for NUMBERS. `.ledger` is for ROWS A HUMAN READS.** The tell is
  always the same: a column holding a sentence rather than a figure. This exact mistake
  has been made three times. Check which question your table answers before you pick.
- **`.subhead` is NOT a section heading, and it looks like one in the stylesheet.** It is
  the dim page subtitle under an `<h1>`, worn by a `<p>`. A section heading inside a page
  is `<h2 className="section-heading">`. **A class existing is not evidence it is the
  right class.**
- **Currency colours, one per currency, everywhere:** `--c-cap` blue, `--c-cash` green,
  `--c-ppv` purple, `--c-dead` rust, via `.v-cap` / `.v-cash` / `.v-ppv` / `.v-dead`.
  Gold is reserved for pending and attention states.
  **One deliberate exception, by ruling (October 4, 2026): the Dead / Saved tables** in the cut
  dialog and on the trade cards colour by sign, not by currency — dead money red, a saving
  green (`.kit-saved`), a negative saving red, a zero dimmed (`.kit-cut-zero`). It lives in
  those tables only. **Do not spread it to other money, and do not "fix" it back to
  `.v-cap` / `.v-cash`.**
- **`globals.css` does not grow.** New work goes in `app/kit.css` (see `design-system.md`).
  **Never reflow what is in `globals.css` and never rewrite it whole** (SR-38: a complete-file
  replacement of it once nearly deleted 2.5 KB of another feature's styling).
- **Shared CSS blocks have more than one consumer.** Before changing a feature block,
  check who else wears it — at least one has quietly acquired a second page.
- **Some `display` repetitions exist for specificity** and are commented. **Do not tidy them.**
- **Theme mechanics:** `data-theme` on `<html>`, set by a pre-paint inline script in
  `app/layout.js`, stored in localStorage under `edfl-theme`, `suppressHydrationWarning`
  required. **The theme follows the phone** (Lewis, October 10; UI test batch 1): no stored
  choice means `prefers-color-scheme` decides on every load; the switch on the Settings page
  writes a choice that then sticks. A one-time reset under `edfl-theme-v2` cleared the `dark`
  the September ruling D-1 had written into every browser. See `design-system.md` for the
  palette.
  **The bar is sticky, not fixed** — sticky keeps it in the document flow so it takes its
  own height and covers nothing. **Do not convert it back to fixed** to reclaim the space.
- **Non-interactive elements stay non-interactive.** Some status markers are plain
  `<span>`s with no `role` and no `tabindex`, deliberately outside the tab order. **Do
  not give them a border, a background, a hover state or a handler.** A real control
  wears `.btn` like every other control in the app.
- Fonts: **Poppins only** since UI test batch 1 (Design System v2); `app/layout.js` loads it
  and the foot of `kit.css` points `--font-display`, `--font-body` and `--font-mono` at it, so
  no stylesheet names a second face. Oswald, Inter and IBM Plex Mono are gone. **Geist was
  rejected — do not re-propose it.** Labels are sentence case: no upper-case, letter-spaced
  buttons or headings in this theme (the override is at the foot of `kit.css`).
