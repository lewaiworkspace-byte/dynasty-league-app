/**
 * THE TEST SITE BANNER -- October 9, 2026. Exists ONLY on the ui-test branch.
 *
 * WHY. The ui-test branch is deployed by a SEPARATE Vercel project against a
 * SEPARATE Supabase project (a copy of the league's data, with no scheduled
 * jobs, no Discord and no league email). It is where owners review UI changes
 * before they are re-cut onto main. An owner who lands here must never mistake
 * it for the live league, so every page, signed in or not, carries this strip.
 *
 * WHY FIXED TO THE BOTTOM. The app bar is sticky at the top and must stay the
 * first thing in the flow (design-system.md); a second sticky strip above it
 * would fight it for top:0 and for the iPhone safe-area padding the bar pays.
 * At the bottom the strip is always on screen and touches nothing. It takes no
 * pointer events, so it can never swallow a tap meant for a control beneath
 * it, and the spacer after it gives the page back the height it covers.
 *
 * IT READS NOTHING -- no database, no session, no environment variable. It is
 * unconditional on purpose: an environment switch that was left unset would
 * hide it silently, and a missing banner is the failure this exists to stop.
 *
 * THIS COMMIT NEVER GOES TO main. UI changes reach the live league as a normal
 * batch re-cut against main; this file, its block in kit.css and its lines in
 * app/layout.js, app/manifest.js and CLAUDE.md stay behind on ui-test.
 */
export default function TestSiteBanner() {
  return (
    <>
      <div className="edfl-testsite-spacer" aria-hidden="true" />
      <div className="edfl-testsite" role="note">
        <strong>TEST SITE</strong>
        <span className="edfl-testsite-sub">
          {' '}
          &middot; not the live league &middot; nothing here counts
        </span>
      </div>
    </>
  );
}
