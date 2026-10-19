---
paths:
  - "components/SectionNav.js"
  - "components/OfficeBar.js"
  - "lib/siteIndex.js"
  - "components/AppBar.js"
  - "components/CommishPill.js"
  - "components/Breadcrumbs.js"
  - "components/CrumbPortal.js"
  - "components/OfficerActionBanner.js"
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
- **`lib/siteIndex.js` is the app's only index** (UI test batch 1, October 17, 2026: the MENU
  drawer is retired, since Lewis's sketch has no hamburger). League Office (`/office`) draws
  it whole as "Every page", and the hub pages draw their own lines. It is a static list with no
  server query; the caller hands in the owner's team id for the Team HQ line and nothing else.
  Anything missing from it is genuinely hard to find — **check a route against it before
  deciding it has a door.** `/bids` deliberately has none while the auction is dormant.
- **The Commissioner Portal pill is out of the app bar** (Lewis, October 12) and is drawn on
  League Office and on Settings, for an officer only, reading "Commissioner Portal" — never
  "Admin", never COMMISH. It is still the only door to `/admin`; where it finally lives is
  Lewis's call. The view row and the office bar (`components/SectionNav.js`) light a button
  by URL prefix and open nothing an owner could not already reach.
- **`isCommish` is the STRICT test** (`teamOwner.is_commissioner`). **Never swap it for
  the helper.** If a strict page's gate ever widens, widen this in the same commit — not
  before.
- **Sync Players, Import Stats and the Injury tools are all `canAdmin`.** The
  first two were strict until the commissioner's ruling that struck Technical Manual
  Appendix A.2(c); their pages and actions widened in the same commit.
- **The Sleeper Sync is retired** (October 7, 2026, batch 3): the `/admin/sleeper-sync`
  page, its roster pull and its conflict adjudication are gone, and its officer items left
  `edfl_officer_action_items_compute()` in migration `sync_08`. Sleeper rosters are not
  maintained and decide nothing (commissioner ruling, October 6, 2026), so **do not rebuild
  a roster sync or re-add the link.** Sleeper's player facts stay: Sync Players, the injury
  sync and the stats import.
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
  mount it), uses plain `<a>`, and **drops any non-final crumb without an `href`**: a middle crumb links only to a route with a
  `page.js`, and several URL segments here have none. **Error and not-found branches keep
  their own link rows on purpose.**
- **The trail is drawn between the app bar and the league title** (Lewis, October 18, batch 2),
  in 12px on one line, the current page ellipsing. Pages still mount `<Breadcrumbs>` where they
  always did; it hands the trail to `components/CrumbPortal.js`, which portals it into
  `#edfl-crumbtarget` in `AppBar.js` after mount. The slot shows "Home" until then, so the row
  never changes height. A page without the bar gets the trail inline, as before.
