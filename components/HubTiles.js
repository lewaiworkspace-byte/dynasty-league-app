/**
 * HUB TILES AND PLACEHOLDERS -- October 17, 2026 (UI test batch 1).
 *
 * The four office pages of Lewis's sketch (GM's, Owner's, Analyst's, League
 * Office) are hubs: a grid of tiles, each opening a page that exists, or
 * naming one that does not exist yet. Lewis, October 17: "Where I have
 * referenced features that don't exist yet, keep them as placeholders." So a
 * tile is one of two things:
 *
 *   a LINK    `href` set: a real page. An <a>, the quiet tile of the kit.
 *   a NOTE    no `href`: a feature the sketch names and the app does not have.
 *             Drawn as a tile with a "Coming soon" mark and no link, because
 *             a door that opens on nothing is the failure the September 4
 *             admin-link work was written to stop. It is a <div>, not a
 *             disabled button: there is nothing to press.
 *
 * Neither reads anything. The hub page decides which tiles to draw.
 *
 * ComingSoon is the whole-page version for a section the sketch leaves blank
 * (Analyst's Office, the roster audit's fix), and says in one line what will
 * live there, so an owner reviewing the test site knows it is on the list.
 */

export function HubTiles({ tiles, columns }) {
  const cls = 'edfl-hubgrid' + (columns === 3 ? ' is-three' : '');
  return (
    <div className={cls}>
      {tiles.map(function (t) {
        if (t.href) {
          return (
            <a className="edfl-hubtile" href={t.href} key={t.label}>
              <span className="edfl-hubtile-label">{t.label}</span>
              {t.note ? <span className="edfl-hubtile-note">{t.note}</span> : null}
            </a>
          );
        }
        return (
          <div className="edfl-hubtile is-soon" key={t.label}>
            <span className="edfl-hubtile-label">{t.label}</span>
            <span className="edfl-hubtile-note">{t.note || 'Coming soon'}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ComingSoon({ title, children }) {
  return (
    <div className="edfl-soon" role="note">
      <span className="edfl-soon-mark">Coming soon</span>
      <div className="edfl-soon-title">{title}</div>
      {children ? <div className="edfl-soon-body">{children}</div> : null}
    </div>
  );
}
