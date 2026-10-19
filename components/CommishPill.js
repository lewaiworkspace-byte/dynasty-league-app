import { createSupabaseServerClient } from '../lib/supabaseServerClient';

/**
 * COMMISSIONER PILL -- the one door to the portal, and the alert that says
 * something is waiting behind it. September 17, 2026.
 *
 * THREE STATES, and the count always matches the colour:
 *   quiet      no open item                      outlined
 *   attention  open items, none urgent           brass, count = attention items
 *   urgent     any urgent item                   neon,  count = urgent items
 * The count is the number of items at the HIGHEST severity present, never the
 * total. A pill reading brass 2 and a pill reading neon 1 cannot be confused,
 * which is the whole reason for not summing them. `info` items never colour
 * the pill and are never counted -- officer_action_badge() does not return them.
 *
 * WHY IT CALLS officer_action_badge() AND NOT officer_action_items().
 * This component renders inside the app bar, which renders on every page, for
 * every officer, on every request. officer_action_items() REFRESHES the state
 * table and re-runs the compute function on each call; that is correct for the
 * portal hub, which is opened deliberately, and far too expensive here. The
 * badge reads the state table the 15-minute cron already maintains and returns
 * two integers. It returns no title, no detail and no href, so the bar cannot
 * leak the content of an action item onto a page an owner is looking at.
 *
 * SESSION CLIENT, NOT THE SERVICE CLIENT. The function gates on auth.uid(),
 * which is null through the service-role client -- it would refuse every call.
 *
 * A FAILED READ RENDERS QUIET WITH A TITLE SAYING SO. Never a fabricated zero.
 * "Nothing is waiting" and "I could not check" are different facts, and the
 * banner this pill points at was written under the same rule.
 *
 * OCTOBER 17, 2026 (UI test batch 1): out of the app bar, onto League Office
 * and Settings, until Lewis said where it lives.
 *
 * OCTOBER 19, 2026 (UI test batch 3): BACK IN THE TOP BAR, AND ONLY THERE.
 * Lewis: "Commissioner portal will be a button and link in the top banner
 * only for those with an assigned commissioner role", and the read-back:
 * the commissioner AND the co-commissioner (isCommissionerOrCo). AppBar.js
 * draws it beside the team tri-graph; League Office and Settings no longer
 * do. It reads "Commissioner Portal" (never "Admin", never COMMISH), and on a
 * phone the bar's width decides how much of that shows (app/kit.css, the
 * batch-3 block): the whole name, then "Portal", then the shield alone. The
 * link's aria-label always carries the whole name and the item count, so a
 * screen reader hears the same thing at every width. It is the shield the
 * portal's own brass bar wears (app/admin/layout.js), so the button and the
 * room it opens look like each other.
 *
 * THE CALLER DECIDES WHETHER TO ASK. The bar renders this only for an officer.
 * That is presentation, not access control: the database function refuses a
 * non-officer by itself, and the portal pages each re-check.
 */

export default async function CommishPill() {
  let urgent = 0;
  let attention = 0;
  let failed = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('officer_action_badge');

    if (error) {
      failed = true;
    } else {
      // The function returns a single row; PostgREST gives it as an array.
      const row = Array.isArray(data) ? data[0] : data;
      urgent = (row && Number(row.urgent)) || 0;
      attention = (row && Number(row.attention)) || 0;
    }
  } catch (e) {
    failed = true;
  }

  let cls = 'commish-pill';
  let count = null;
  let title = 'Commissioner Portal';

  if (failed) {
    title = 'Commissioner Portal — the action item count is unavailable right now';
  } else if (urgent > 0) {
    cls = cls + ' is-urgent';
    count = urgent;
    title =
      urgent === 1
        ? 'Commissioner Portal — 1 item needs action now'
        : 'Commissioner Portal — ' + urgent + ' items need action now';
  } else if (attention > 0) {
    cls = cls + ' is-attention';
    count = attention;
    title =
      attention === 1
        ? 'Commissioner Portal — 1 item needs attention'
        : 'Commissioner Portal — ' + attention + ' items need attention';
  }

  return (
    <a className={cls} href="/admin" title={title} aria-label={title}>
      <svg
        className="commish-shield"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M8 1.6 13.4 3.6v4.1c0 3.2-2.2 5.6-5.4 6.7-3.2-1.1-5.4-3.5-5.4-6.7V3.6z" />
      </svg>
      <span className="commish-label-full" aria-hidden="true">
        Commissioner Portal
      </span>
      <span className="commish-label-short" aria-hidden="true">
        Portal
      </span>
      {count !== null ? (
        <span className="commish-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </a>
  );
}
