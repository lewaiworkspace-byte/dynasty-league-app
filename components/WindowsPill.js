/**
 * THE WINDOWS PILL -- October 22, 2026 (UI test batch 5).
 *
 * Lewis, on the Roster design canvas: "Move the 'Open Negotiating Windows'
 * indicator beside the compliance indicator. Make it green if there are no
 * open windows. If there are open windows, make it red and link it to the
 * page that hosts the applicable windows. If there are poaching and in-season
 * free agency open windows, make two separate links." Read back and approved
 * the same day: every page, for a linked owner only (the compliance pill's
 * audience), and the old block on Team HQ goes, its two buttons with it.
 *
 * It renders what AppBar read once -- open_negotiation_windows() through the
 * SESSION client (SECURITY DEFINER, `authenticated` only) -- and decides
 * nothing about a window. The count is the number of rows the function
 * returned for each kind; nothing here looks up an opener, an offer or a
 * count of offers (PN-3, FA-D):
 *
 *   no rows            "No open windows", green, not a link
 *   free agency rows   "Free agency: N open", red, opens /free-agency
 *   poach rows         "Poaching: N open", red, opens /poaching
 *   both               the two red pills, side by side
 *   read failed        "Windows unknown", grey, with a link to each page --
 *                      never a fabricated green
 *
 * A row whose kind is 'poach' is a poach window (Rule 5.17); every other row
 * is an in-season free agency window (Rule 5.14) -- the same test the Team HQ
 * block used.
 *
 * @param {Array|null} rows    open_negotiation_windows()'s rows
 * @param {boolean}    failed  the read failed
 */

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

export default function WindowsPill({ rows, failed }) {
  if (failed) {
    return (
      <span
        className="edfl-cpill edfl-wpill is-unknown"
        title="Open negotiating windows could not be checked just now. Check Free Agency and Poaching."
      >
        <span className="edfl-cpill-dot" aria-hidden="true" />
        <span>Windows unknown</span>
        <a className="edfl-wpill-link" href="/free-agency">
          Free agency
        </a>
        <a className="edfl-wpill-link" href="/poaching">
          Poaching
        </a>
      </span>
    );
  }

  const list = Array.isArray(rows) ? rows : [];
  let poach = 0;
  let freeAgency = 0;
  list.forEach(function (w) {
    if (w && w.kind === 'poach') poach += 1;
    else freeAgency += 1;
  });

  if (poach === 0 && freeAgency === 0) {
    return (
      <span className="edfl-cpill edfl-wpill is-good" title="No free agency or poach window is taking offers.">
        <span className="edfl-cpill-dot" aria-hidden="true" />
        <span>No open windows</span>
      </span>
    );
  }

  return (
    <>
      {freeAgency > 0 ? (
        <a
          className="edfl-cpill edfl-wpill is-bad"
          href="/free-agency"
          title={'In-season free agency: ' + freeAgency + (freeAgency === 1 ? ' window' : ' windows') + ' taking offers. Open Free Agency.'}
        >
          <span className="edfl-cpill-dot" aria-hidden="true" />
          <span>{'Free agency: ' + freeAgency + ' open'}</span>
          <Chevron />
        </a>
      ) : null}
      {poach > 0 ? (
        <a
          className="edfl-cpill edfl-wpill is-bad"
          href="/poaching"
          title={'Poaching: ' + poach + (poach === 1 ? ' window' : ' windows') + ' taking offers. Open Poaching.'}
        >
          <span className="edfl-cpill-dot" aria-hidden="true" />
          <span>{'Poaching: ' + poach + ' open'}</span>
          <Chevron />
        </a>
      ) : null}
    </>
  );
}
