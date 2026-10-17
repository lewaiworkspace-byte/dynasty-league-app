import { OfficeRow } from './SectionNav';

/**
 * THE OFFICE BAR -- October 17, 2026 (UI test batch 1).
 *
 * The four office buttons of Lewis's sketch, fixed to the foot of the screen
 * on every page: GM's Office, Owner's Office, Analyst's Office, League
 * Office. The root layout mounts it after the page so it is last in the tab
 * order; it is positioned, not in flow, and the body pays its height in
 * padding (kit.css, the October 17 block) so the last row of a page is never
 * hidden under it. On the test site it sits ABOVE the TEST SITE banner, which
 * stays the bottom-most thing on the screen.
 *
 * It reads nothing. Which button is lit comes from the URL (SectionNav.js).
 */
export default function OfficeBar() {
  return (
    <div className="edfl-officebar">
      <OfficeRow />
    </div>
  );
}
