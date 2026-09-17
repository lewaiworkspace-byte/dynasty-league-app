/**
 * EntityRow -- the one row shape for anything with a name.
 *
 * Players, teams, action items, transactions, free agents, trade packages.
 * The reference site draws every list of people this way and it is most of why
 * its pages look like one product: avatar, bold name, small chip, dim meta
 * line, the number right-aligned, one action at the end.
 *
 * TABLES VERSUS ROWS, restated because CLAUDE.md says this mistake has been
 * made three times: .grid-table is for NUMBERS, .ledger is for ROWS A HUMAN
 * READS. This component is the second of those, rebuilt. The tell is unchanged
 * -- a column holding a sentence rather than a figure. If what you are drawing
 * is a grid of figures, it is not this component.
 *
 * href makes the whole row a link. Omit it and the row is inert; put the
 * control in `action` instead. Never both -- a button inside a link swallows
 * its own click, which is a bug the reference site's own share button has.
 */

export default function EntityRow({ href, avatar, title, chips, meta, right, action }) {
  const inner = (
    <>
      {avatar ? avatar : null}
      <div className="kit-row-main">
        <div className="kit-row-title">
          <span>{title}</span>
          {chips ? chips : null}
        </div>
        {meta ? <div className="kit-row-meta">{meta}</div> : null}
      </div>
      {right ? <div className="kit-row-right">{right}</div> : null}
      {action ? action : null}
    </>
  );

  if (href) {
    return (
      <a className="kit-row" href={href}>
        {inner}
      </a>
    );
  }

  return <div className="kit-row">{inner}</div>;
}
