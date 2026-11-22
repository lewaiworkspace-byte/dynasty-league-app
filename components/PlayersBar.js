// THE PLAYERS TAB'S CONTROLS -- UI test batch 33, November 21, 2026.
//
// Lewis's pick on the Claude Design canvas "EDFL compact top bar options", page
// "Round 3", Option 6 ("Sleeper style"), with his comments of that night: ONE
// tab, Players, where the owner's roster, the watchlist and the market lists are
// sources of the same list. This file draws the three pieces every source
// shares; each source's own page still draws its own rows and keeps its own data
// and rules (Roster is Team HQ's ?tab=roster, Watchlist is /watchlist, the
// market lists are /players):
//
//   1. THE FILTER LINE. One line that never scrolls sideways: the jersey (My
//      roster), the watchlist clipboard, a divider, then QB RB WR TE Flex K. Each
//      chip is drawn 32px tall inside a 44px tap area, so the line costs 32px of
//      the screen and every chip is still 44px to hit. There is no "All" chip:
//      no position lit means all positions; tapping the lit one clears it.
//   2. THE TITLE LINE. The list's name and count (a menu where the source has
//      one: the squad for My roster, the view for the Watchlist), then the
//      list's explain icon where it has one (`info`), search, the Add players
//      "+" on the Watchlist, and the sort.
//   3. THE FILTERS TAB and its sheet: a small tab at the foot of the screen
//      that pulls up everything else (which list, squad, season, who to leave
//      out, team, contract). The tab sits above the office row for now; when the
//      new top bar replaces the office row it moves to the foot of the screen.
//
// PRESENTATION ONLY. It decides nothing and computes nothing: every label,
// count, link and state is handed in. It has no hooks and no 'use client', so a
// server page and the client RosterList both draw it. An item with `href` is a
// plain link (the server pages: the URL is the state); an item with `onClick`
// is a button (the roster list, which filters on the device).

function Chevron({ size }) {
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

function Jersey() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M8.5 4L3 7l2 4 2.5-1.2V20h9V9.8L19 11l2-4-5.5-3c-.5 1.5-1.8 2.3-3.5 2.3S9 5.5 8.5 4z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function FilterIcon({ size }) {
  return (
    <svg width={size || 16} height={size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

// One control: a link when it has an href, a button when it has onClick. The
// 44px box is the element; the drawn chip is the span inside it.
function Chip({ item, className, children }) {
  const on = Boolean(item.on);
  const cls = 'pb-chip' + (className ? ' ' + className : '');
  const inner = <span className={'pb-chip-in' + (on ? ' is-on' : '')}>{children}</span>;
  if (item.href) {
    return (
      <a className={cls} href={item.href} aria-current={on ? 'true' : undefined} aria-label={item.aria || undefined}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={on ? 'true' : 'false'} aria-label={item.aria || undefined} onClick={item.onClick}>
      {inner}
    </button>
  );
}

function closeMenu(e) {
  const d = e.currentTarget && e.currentTarget.closest ? e.currentTarget.closest('details') : null;
  if (d) d.removeAttribute('open');
}

function MenuItem({ item }) {
  const body = (
    <>
      <span className="pb-mi-l">{item.label}</span>
      {item.note ? <span className="pb-mi-n">{item.note}</span> : null}
    </>
  );
  if (item.href) {
    return (
      <a className={'pb-mi' + (item.on ? ' is-on' : '')} href={item.href} role="menuitem" aria-current={item.on ? 'true' : undefined}>
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={'pb-mi' + (item.on ? ' is-on' : '')}
      role="menuitem"
      aria-pressed={item.on ? 'true' : 'false'}
      onClick={function (e) {
        closeMenu(e);
        if (item.onClick) item.onClick(e);
      }}
    >
      {body}
    </button>
  );
}

export default function PlayersBar(props) {
  const source = props.source;
  const positions = props.positions || [];
  const title = props.title || { label: 'Players' };
  const search = props.search || null;
  const add = props.add || null;
  const sort = props.sort || null;
  const roster = props.roster || null;
  const watch = props.watch || null;

  return (
    <div className="pb-bar">
      <div className="pb-line" role="group" aria-label="Show and position">
        {roster ? (
          <Chip item={{ on: source === 'roster', href: roster.href, onClick: roster.onClick, aria: 'My roster' }}>
            <Jersey />
          </Chip>
        ) : null}
        {watch ? (
          <Chip item={{ on: source === 'watch', href: watch.href, onClick: watch.onClick, aria: 'Watchlist' }}>
            <img src="/brand/watchlist-on.webp" width="22" height="22" alt="" />
          </Chip>
        ) : null}
        {roster || watch ? <span className="pb-div" aria-hidden="true" /> : null}
        {positions.map(function (p) {
          return (
            <Chip key={p.key} item={p} className="pb-pos">
              {p.label}
            </Chip>
          );
        })}
      </div>

      <div className="pb-title">
        {title.menu && title.menu.length ? (
          <details className="pb-menu">
            <summary className="pb-t">
              <b>{title.label}</b>
              {title.count ? <span>{title.count}</span> : null}
              <Chevron size={16} />
            </summary>
            <div className="pb-menu-list" role="menu">
              {title.menu.map(function (m) {
                return <MenuItem key={m.key} item={m} />;
              })}
            </div>
          </details>
        ) : (
          <span className="pb-t">
            <b>{title.label}</b>
            {title.count ? <span>{title.count}</span> : null}
          </span>
        )}
        <span className="pb-tools">
          {props.info ? <span className="pb-info">{props.info}</span> : null}
          {search ? (
            search.href ? (
              <a className="pb-tool" href={search.href} aria-label="Search players" aria-current={search.on ? 'true' : undefined}>
                <SearchIcon />
              </a>
            ) : (
              <button type="button" className="pb-tool" aria-label="Search players" aria-pressed={search.on ? 'true' : 'false'} onClick={search.onClick}>
                <SearchIcon />
              </button>
            )
          ) : null}
          {add ? (
            <a className="pb-tool" href={add.href} aria-label="Add players to your watchlist">
              <span className="pb-add" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </span>
            </a>
          ) : null}
          {sort ? (
            <a className="pb-sort" href={sort.href} aria-haspopup="dialog" aria-label={'Sort: ' + sort.label}>
              {sort.label}
              <Chevron size={14} />
            </a>
          ) : null}
        </span>
      </div>
    </div>
  );
}

// THE FILTERS TAB: 44px tall, the whole strip is the tap target. A link on the
// server pages, a button on the roster list.
export function FiltersTab(props) {
  const inner = (
    <>
      <span className="pb-peek-grab" aria-hidden="true" />
      <span className="pb-peek-row">
        <FilterIcon size={16} />
        Filters
        {props.count ? <b>{props.count}</b> : null}
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M5 12l5-5 5 5" />
        </svg>
      </span>
    </>
  );
  if (props.href) {
    return (
      <a className="pb-peek" href={props.href} aria-haspopup="dialog" aria-label="Open filters">
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className="pb-peek" aria-haspopup="dialog" aria-label="Open filters" onClick={props.onClick}>
      {inner}
    </button>
  );
}

// THE FILTERS SHEET. groups: [{ title, cols, items: [{ key, label, note, on,
// href | onClick }] }]. The same frame as the Sort sheet (a scrim, a grab bar, a
// head, a body that scrolls, a foot); Done closes it. `doneLabel` says what the
// list will show ("Show 19 players").
export function FiltersSheet(props) {
  const groups = props.groups || [];
  return (
    <>
      {props.closeHref ? (
        <a className="pb-scrim" href={props.closeHref} aria-label="Close the filters" />
      ) : (
        <button type="button" className="pb-scrim" aria-label="Close the filters" onClick={props.onClose} />
      )}
      <section className="pb-sheet" role="dialog" aria-modal="true" aria-labelledby="pb-sheet-title">
        <div className="pb-sheet-grab" aria-hidden="true">
          <span />
        </div>
        <div className="pb-sheet-head">
          <h2 id="pb-sheet-title">Filters</h2>
          {props.reset ? (
            <a className="pb-sheet-reset" href={props.reset}>
              Reset
            </a>
          ) : null}
        </div>
        <div className="pb-sheet-body">
          {groups.map(function (g) {
            return (
              <div key={g.title} className="pb-grp">
                <span className="pb-fl">{g.title}</span>
                <div className={'pb-opts' + (g.cols === 1 ? ' is-one' : '')} role="group" aria-label={g.title}>
                  {g.items.map(function (it) {
                    const cls = 'pb-opt' + (it.on ? ' is-on' : '');
                    const body = (
                      <>
                        <span className="pb-opt-l">{it.label}</span>
                        {it.note ? <span className="pb-opt-n">{it.note}</span> : null}
                      </>
                    );
                    return it.href ? (
                      <a key={it.key} className={cls} href={it.href} aria-current={it.on ? 'true' : undefined}>
                        {body}
                      </a>
                    ) : (
                      <button key={it.key} type="button" className={cls} aria-pressed={it.on ? 'true' : 'false'} onClick={it.onClick}>
                        {body}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="pb-sheet-foot">
          {props.closeHref ? (
            <a className="pb-done" href={props.closeHref}>
              {props.doneLabel || 'Done'}
            </a>
          ) : (
            <button type="button" className="pb-done" onClick={props.onClose}>
              {props.doneLabel || 'Done'}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
