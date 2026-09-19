import { formatCost, formatMoney, formatMoneyDelta, formatRoom } from '../../lib/formatMoney';

// THE PREVIEW AND THE EXECUTION MUST NOT DISAGREE.
//
// This component is shared by the proposal builder and the trade detail page
// on purpose. An owner reads these numbers before accepting; the commissioner
// reads them before executing. If the two surfaces rendered separately they
// could drift, and an owner would accept one set of figures and see another --
// which is the precise failure the whole trade design exists to prevent.
//
// NOTHING HERE IS COMPUTED. Every field comes from trade_impact(), which is
// the single source of cap, cash and roster figures. There is no lib module
// mirroring it and there must not be one. The only arithmetic in this file is
// cap_after minus cap_ceiling to say how far over a team would be -- a
// difference between two numbers the RPC already returned, which is
// presentation. Deriving what a cap WOULD be is a different thing and does not
// belong on the client.
//
// THE _ok FLAGS ARE THE VERDICT, AND SINCE R-12 THE NUMBERS AGREE WITH THEM.
//
// This paragraph used to describe a defect. Under the August 22 ruling every
// figure here was half-away, so at a $1,500 cap a team could read "$1,500 of
// $1,500" while cap_ok was false, because the true cap_after was $1,500.33.
// The chip said Blocked and the number said Clear, and the note's answer was
// that the chip always wins.
//
// R-12 (September 17 2026) removes the disagreement instead of explaining it.
// Applied here in phase 2E-3: cap_after is a charge and rounds UP, so 1,500.33
// renders as $1,501 against a $1,500 ceiling and the reader can SEE why the
// verdict is Blocked. cash_after is what a team may still spend and rounds
// DOWN, which matters more here than anywhere else in the app: trade_impact()
// sets cash_ok from (cash_after >= 0), so a team at -$0.33 must not read "$0".
//
// WHICH DIRECTION EACH ROW USES IS PASSED IN AS THE FORMATTER ITSELF, not as a
// flag. R-12 is explicit that "the direction is not a flag, because a flag gets
// copied from the line above it" -- so ImpactRow's `money` prop is now the
// function to call, and each of the three call sites below names formatCost,
// formatRoom or false in its own right.
//
// overBy() still says "less than $1" rather than "$0" for a real overage that
// rounds away. That guard predates R-12 and survives it: ceil() would turn
// 0.33 into $1, which is honest, but "less than $1" is more honest still.

// A team is short of nothing, or it is short of something specific.
function overBy(after, ceiling) {
  if (after === null || after === undefined) return null;
  if (ceiling === null || ceiling === undefined) return null;
  const gap = Number(after) - Number(ceiling);
  if (!Number.isFinite(gap) || gap <= 0) return null;
  // Rounds to zero but is genuinely over: say so rather than printing "$0".
  if (Math.round(gap) === 0) return 'less than $1';
  // An overage is a cost. Rounding it down would report a smaller breach than
  // the one the database refused the trade for.
  return formatCost(gap);
}

// A VERDICT, NOT A CONTROL, AND IT MUST NOT LOOK LIKE ONE.
//
// This used to render with .status -- the same bordered pill the clickable
// chips elsewhere in the app wear -- and a commissioner clicked it and
// reported "the clear button does not work". It never had a handler and must
// never get one: it is a read-out of cap_ok / cash_ok / roster_ok from
// trade_impact().
//
// So it is now coloured text with a glyph and no border, sharing one
// non-interactive visual language with the party status on the detail page.
// Deliberately a <span> with no role, no tabIndex, no href and no handler, so
// it is not in the tab order and cannot take focus. .trade-verdict in
// globals.css sets cursor: default and defines no :hover.
function Verdict({ ok }) {
  if (ok === null || ok === undefined) return null;
  return (
    <span className={'trade-verdict ' + (ok ? 'trade-verdict-ok' : 'trade-verdict-bad')}>
      {ok ? '✓ Clear' : '✗ Blocked'}
    </span>
  );
}

// One measure: before, after, the delta, and whether it passes.
function ImpactRow(props) {
  const { label, before, after, delta, limitLabel, limitValue, ok, money, tone } = props;

  // `money` is the FORMATTER for this row -- formatCost, formatRoom, or false
  // for a row that is not money at all. See the note at the top of the file.
  const fmt =
    typeof money === 'function'
      ? money
      : function (v) {
          return v === null || v === undefined ? '—' : String(v);
        };

  return (
    <div className={'trade-measure' + (ok === false ? ' trade-measure-bad' : '')}>
      <div className="trade-measure-head">
        <span className="trade-measure-label">{label}</span>
        <span className={'trade-measure-flag ' + (ok === false ? 'negative' : 'positive')}>
          {ok === false ? '✗' : '✓'}
        </span>
      </div>
      <div className="trade-measure-figures">
        <span className={tone || ''}>{fmt(before)}</span>
        <span className="trade-measure-arrow">&rarr;</span>
        <span className={'trade-measure-after ' + (tone || '')}>{fmt(after)}</span>
        {delta !== null && delta !== undefined && (
          <span className="trade-measure-delta">
            {money ? formatMoneyDelta(delta) : delta}
          </span>
        )}
      </div>
      {/* THE LIMIT IS NOT DIRECTIONAL. A cap ceiling is a league constant --
          1,500 for 2026 -- and a roster limit is a headcount. Neither is
          something anybody spends or is charged, so the ceiling stays
          half-away and the headcount stays a bare number. */}
      {limitValue !== null && limitValue !== undefined && (
        <div className="trade-measure-limit">
          {limitLabel} {money ? formatMoney(limitValue) : limitValue}
        </div>
      )}
    </div>
  );
}

function TeamImpactCard({ row }) {
  const allOk = row.cap_ok !== false && row.cash_ok !== false && row.roster_ok !== false;
  const over = row.cap_ok === false ? overBy(row.cap_after, row.cap_ceiling) : null;

  // Roster delta is not returned as its own field, and it is not derived here:
  // before and after are both shown and the reader can see the direction. The
  // players_in / players_out counts below say the same thing in the RPC's own
  // numbers.
  return (
    <article className={'trade-card' + (allOk ? '' : ' trade-card-bad')}>
      <header className="trade-card-head">
        <h3 className="team-name">{row.team_name}</h3>
        <Verdict ok={allOk} />
      </header>

      <ImpactRow
        label="Cap"
        before={row.cap_before}
        after={row.cap_after}
        delta={row.cap_delta}
        limitLabel="ceiling"
        limitValue={row.cap_ceiling}
        ok={row.cap_ok}
        money={formatCost}
        tone="v-cap"
      />
      {over && <p className="trade-over">Over the ceiling by {over}</p>}

      <ImpactRow
        label="Cash"
        before={row.cash_before}
        after={row.cash_after}
        delta={row.cash_delta}
        limitLabel={null}
        limitValue={null}
        ok={row.cash_ok}
        money={formatRoom}
        tone="v-cash"
      />

      <ImpactRow
        label="Roster"
        before={row.roster_before}
        after={row.roster_after}
        delta={null}
        limitLabel="limit"
        limitValue={row.roster_limit}
        ok={row.roster_ok}
        money={false}
        tone=""
      />

      <footer className="trade-card-foot">
        <span>
          {row.players_out} player{Number(row.players_out) === 1 ? '' : 's'} out ·{' '}
          {row.players_in} in
        </span>
        <span>
          {row.picks_out} pick{Number(row.picks_out) === 1 ? '' : 's'} out · {row.picks_in} in
        </span>
        {row.dead_cap_next_year !== null &&
          row.dead_cap_next_year !== undefined &&
          Number(row.dead_cap_next_year) !== 0 && (
            <span className="v-dead">
              Dead cap next year {formatCost(row.dead_cap_next_year)}
            </span>
          )}
      </footer>
    </article>
  );
}

/**
 * Every team's impact, one card each.
 *
 * Cards rather than a table, at every breakpoint. trade_impact returns twenty
 * columns for two to four teams -- a WIDE shape, not a tall one, which is the
 * opposite of the /bids problem. A card-flipped .ledger would stack twenty
 * label/value pairs per team and read worse than the table it replaced.
 *
 * @param {{rows: Array, legality: Array}} props
 */
export default function TradeImpactCards({ rows, legality }) {
  const impact = rows || [];
  const problems = legality || [];

  return (
    <section className="trade-impact">
      {problems.length > 0 && (
        <div className="form-error trade-legality">
          <p className="trade-legality-head">
            {problems.length === 1
              ? 'This trade is not legal:'
              : 'This trade is not legal (' + problems.length + ' problems):'}
          </p>
          <ul>
            {problems.map(function (p, i) {
              // Rendered VERBATIM. These strings name the player and cite the
              // rule; paraphrasing loses the citation, which is the part an
              // owner needs to look anything up or argue with it.
              return <li key={p.code + '-' + i}>{p.detail}</li>;
            })}
          </ul>
        </div>
      )}

      {impact.length === 0 ? (
        <p className="empty-note">No impact to show yet.</p>
      ) : (
        <div className="trade-cards">
          {impact.map(function (row) {
            return <TeamImpactCard key={row.team_id} row={row} />;
          })}
        </div>
      )}
    </section>
  );
}
