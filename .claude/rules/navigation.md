---
paths:
  - "components/NavDrawer.js"
  - "components/AppBar.js"
  - "components/CommishPill.js"
  - "components/Breadcrumbs.js"
  - "components/OfficerActionBanner.js"
  - "components/SearchBox.js"
  - "components/SignOutButton.js"
  - "app/page.js"
  - "app/admin/page.js"
---

# Links, the drawer and the app bar

What is drawn is not what is permitted. Loads with the navigation components and the two index pages.

### Hiding a link is presentation, not access control

The principle is unchanged and the surfaces it applies to have moved. Owners once clicked
admin buttons drawn for everyone, bounced home, and concluded the app was broken. **The
redirect and the Server Action re-check remain the real gates.** Never treat a hidden link
as a substitute for either, and **never disable a write path by hiding its link** — the
function behind it will run happily.

- **`app/page.js` renders nothing at all.** It is a redirect. Every admin link, caption and
  officer block that this section used to describe there is gone: the links are the
  Commissioner Portal, the officer banner is on `/admin`, and the pill in the app bar is
  the door. **Do not put a link of any kind back on `/`** — there is no page to put it on.
- **`components/NavDrawer.js` is the app's only index.** It is a static list with no server
  query; the app bar hands it `owner.team_id` for the Team HQ line and nothing else.
  Anything missing from it is genuinely hard to find — **check a route against the drawer
  before deciding it has a door.** `/bids` deliberately has none while the auction is
  dormant, and it is currently the only one.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`). **Never swap it for
  the helper.** If a strict page's gate ever widens, widen this in the same commit — not
  before.
- **Sync Players, Import Stats, Sleeper Sync and the Injury tools are all `canAdmin`.** The
  first two were strict until the commissioner's ruling that struck Technical Manual
  Appendix A.2(c); their pages and actions widened in the same commit.
- **The Calendar Loader sits inside `isCommish`**, with the page, its actions and the
  database all strict. Widen all four together or none.
- **The officer action banner renders what the database composed, verbatim.**
  `components/OfficerActionBanner.js` never reads and never decides; **`app/admin/page.js`**
  calls `officer_action_items()` through the **session** client (the function gates on
  `auth.uid()`) and hands it the rows. **A failed read renders an error, never "All
  clear"** — those are different facts. New kinds of action item are added in the
  database function, not in the component.


### Breadcrumbs

- **`components/Breadcrumbs.js` never reads.** Every crumb label comes from data the calling
  page already loaded under its own gate. A crumb that looked a name up for itself would be
  a second copy of that gate, and could say what the page refuses to — the trade detail
  page's not-found wording deliberately does not reveal whether a private draft exists.
  It also stays hook-free with no `'use client'` (server pages and client components both
  mount it), uses plain `<a>`, reuses `.page-actions` rather than adding CSS, and **drops any
  non-final crumb without an `href`**: a middle crumb links only to a route with a
  `page.js`, and several URL segments here have none. **Error and not-found branches keep
  their own link rows on purpose.**
