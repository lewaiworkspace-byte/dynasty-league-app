// BREADCRUMBS -- the "where am I" row at the top of a nested page.
// September 11, 2026. Spec: EDFL_Breadcrumbs_Spec_v1.0.md.
//
// A caller passes the trail BELOW Home; Home is always prepended here:
//
//   <Breadcrumbs trail={[
//     { label: 'Trades', href: '/trades' },
//     { label: 'Trade' },
//   ]} />
//
// renders   Home > Trades > Trade   with the last entry as the current page
// (no link, aria-current="page", dimmed).
//
// DO NOT UNDO -- each of these is load-bearing:
//
// 1. IT NEVER READS. No Supabase client, no fetch. Every label is a value
//    the calling page already loaded under its OWN access check. A
//    breadcrumb that looked up a trade or player name by itself would be a
//    second copy of that check, and the trade detail page's not-found
//    branch shows why that matters: it is worded so it does not reveal
//    whether a private draft exists. A self-reading crumb could.
//
// 2. NO 'use client', NO HOOKS HERE. Five of the call sites are client
//    components (PlayerCard, BidForm, DelegateForm, TierResultsPanel, the
//    stats player page) and four are server pages. A hook-free component
//    renders in both.
//
// 3. PLAIN <a>, NOT next/link. Matches every back link already in the
//    repo and components/PlayerLink.js. A full navigation re-reads the
//    auth cookie, which is how these links behaved before this component.
//
// 4. NO globals.css CHANGE. The row is styled by .edfl-crumbs in kit.css
//    (October 18, 2026: smaller text, under the app bar) and dims the
//    current page with the theme's own --text-dim token inline, so light
//    and dark both follow.
//
// 5. A MIDDLE CRUMB MUST BE A REAL PAGE. Several URL segments in this app
//    have no page.js (/team, /player, /admin, /stats/player, /bids/results,
//    /bids/[tierId]). A non-final entry with no href is DROPPED here rather
//    than rendered as dead text, so a caller cannot put an unlinkable
//    parent in the trail by accident.
//
// 6. NULL-SAFE, like PlayerLink. An entry with no label is skipped, so a
//    caller can write { label: header.current_team, href: ... } for a
//    player who may be a free agent and never branch.
//
// 7. IT IS DRAWN UNDER THE APP BAR, NOT WHERE THE PAGE PUTS IT (Lewis,
//    October 18, 2026, UI test batch 2: "the breadcrumb trail goes between
//    the top banner and the EDFL title"). The bar lives in the root layout
//    and the trail in the page, so the trail is handed to
//    components/CrumbPortal.js, which moves it into #edfl-crumbtarget in
//    components/AppBar.js once the page mounts. The hooks live in that
//    file; this one still has none, and still renders in a server page or a
//    client component alike. The call sites did not change.

import CrumbPortal from './CrumbPortal';

const currentStyle = { color: 'var(--text-dim)' };

export default function Breadcrumbs({ trail }) {
  const given = Array.isArray(trail) ? trail : [];

  const labelled = [{ label: 'Home', href: '/' }].concat(
    given.filter((item) => Boolean(item && item.label))
  );

  const lastIndex = labelled.length - 1;
  const kept = labelled.filter((item, i) => i === lastIndex || Boolean(item.href));
  const finalIndex = kept.length - 1;

  const children = [];
  kept.forEach((item, i) => {
    if (i > 0) {
      children.push(
        <span key={'sep-' + i} aria-hidden="true">
          &rsaquo;
        </span>
      );
    }
    if (i === finalIndex) {
      children.push(
        <span key={'crumb-' + i} aria-current="page" style={currentStyle}>
          {item.label}
        </span>
      );
    } else {
      children.push(
        <a key={'crumb-' + i} href={item.href}>
          {item.label}
        </a>
      );
    }
  });

  return (
    <CrumbPortal>
      <nav aria-label="Breadcrumb" className="edfl-crumbs edfl-crumbs-page">
        {children}
      </nav>
    </CrumbPortal>
  );
}
