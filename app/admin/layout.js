import { getCurrentTeamOwner, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';

/**
 * THE COMMISSIONER PORTAL'S CHROME. September 17, 2026.
 *
 * Wraps every /admin/* page in a brass bar so an officer always knows which
 * side of the door they are on, and so a portal page can never be mistaken for
 * a league page. Owners never see any of it.
 *
 * THE URLs DO NOT CHANGE, and that was a deliberate decision rather than an
 * omission. Renaming sixteen gated routes to /portal/* would break every
 * bookmark, every href stored in the database's officer action items, the
 * breadcrumbs spec and CLAUDE.md's route list -- and would buy nothing, because
 * the word an owner never sees is the URL. The word an OFFICER sees is the
 * label, and the label is "Commissioner Portal".
 *
 * THIS IS NOT A GATE. It decides what is DRAWN. Every /admin page still
 * redirects on its own, every Server Action still re-checks, and the database
 * functions behind them are the real gate -- unchanged by this batch. A
 * non-officer who reaches a portal URL gets the page's own redirect; they just
 * do not get a brass bar on the way out.
 *
 * WHY THE LAYOUT ASKS WHO YOU ARE. One extra team_owners read per admin page
 * load. The alternative -- rendering the chrome unconditionally -- would flash
 * "Commissioner Portal" at an owner in the instant before their redirect
 * lands, which is exactly the "showing people doors they cannot open" problem
 * the August 30 work removed from the home page.
 */

export const revalidate = 0;

export default async function AdminLayout({ children }) {
  const me = await getCurrentTeamOwner();
  const isOfficer = isCommissionerOrCo(me);

  if (!isOfficer) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="portal-chrome">
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          style={{ color: 'var(--brass)', flexShrink: 0 }}
          aria-hidden="true"
        >
          <path d="M8 1.6 13.4 3.6v4.1c0 3.2-2.2 5.6-5.4 6.7-3.2-1.1-5.4-3.5-5.4-6.7V3.6z" />
        </svg>
        <span className="portal-chrome-title">COMMISSIONER PORTAL</span>
        <span style={{ flexGrow: 1 }} />
        <a className="portal-back" href="/">
          &larr; League
        </a>
      </div>
      {children}
    </>
  );
}
