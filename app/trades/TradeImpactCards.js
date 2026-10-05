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
//
// BY SEASON -- October 4, 2026 (the trade counterpart of the cut dialog's
// Dead vs. Saved tables).
//
// Under the three measures each card carries two small tables, Cap and Cash:
// Season | Dead | Saved | Added | Net, plus a Total row. Every figure is
// trade_savings() verbatim -- totals included -- and nothing is added up here.
//
//   Dead  -- dead money this team takes for the players it sends. formatCost.
//   Saved -- what those players would cost it if kept, minus the dead money.
//            formatRoom on the signed value (it can be negative in the trade
//            season, when later proration is pulled forward).
//   Added -- what the players it receives will cost it. formatCost.
//   Net   -- Saved minus Added: the trade's effect on this team's books.
//            formatRoom on the signed value. In the current season it is the
//            cap and cash change shown above with the sign turned round --
//            trade_savings() reads the same settlement trade_impact() reads.
//
// Colour, by the commissioner's call: dead and added money red (.v-dead), a
// saving or a positive net green (.kit-saved), a negative saving or net red,
// a zero dimmed. As in the cut dialog this is a deliberate on-screen exception
// to one-colour-per-currency: the colour says which way the money moves, and
// the Cap / Cash captions carry the currency.
//
// The savings prop is optional. Not passed (undefined): nothing is drawn, the
// card is what it was. Passed as null with savingsError: the card says the
// by-season figures could not be calculated -- never a blank that could read
// as "this trade moves nothing".

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

// Colour by the figure as it is DISPLAYED, so a $0.40 that prints $0 is not
// painted. Cost columns round up, signed columns round down -- the same
// direction as the formatter beside each call.
function costClass(n) {
  const v = Math.ceil(Number(n) || 0);
  return v > 0 ? 'v-dead' : 'kit-cut-zero';
}

function signedClass(n) {
  const v = Math.floor(Number(n) || 0);
  if (v > 0) return 'kit-saved';
  if (v < 0) return 'v-dead';
  return 'kit-cut-zero';
}

// One currency's table for one team. kind is 'cap' or 'cash'; the keys are
// dead_<kind>, <kind>_saved, <kind>_added and <kind>_net on every season row
// and on the totals. A season with nothing in this currency is dropped from
// this table only.
function SeasonTable({ kind, title, years, totals }) {
  const deadKey = 'dead_' + kind;
  const savedKey = kind + '_saved';
  const addedKey = kind + '_added';
  const netKey = kind + '_net';
  const t = totals || {};

  const rows = (years || []).filter(function (y) {
    return (
      Number(y[deadKey]) !== 0 ||
      Number(y[savedKey]) !== 0 ||
      Number(y[addedKey]) !== 0 ||
      Number(y[netKey]) !== 0
    );
  });
  if (rows.length === 0) return null;

  return (
    <div className="kit-trade-money-wrap">
      <table className="kit-trade-money">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Season</th>
            <th scope="col">Dead</th>
            <th scope="col">Saved</th>
            <th scope="col">Added</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(function (y) {
            return (
              <tr key={y.season_year}>
                <th scope="row">{y.season_year}</th>
                <td className={costClass(y[deadKey])}>{formatCost(y[deadKey])}</td>
                <td className={signedClass(y[savedKey])}>{formatRoom(y[savedKey])}</td>
                <td className={costClass(y[addedKey])}>{formatCost(y[addedKey])}</td>
                <td className={signedClass(y[netKey])}>{formatRoom(y[netKey])}</td>
              </tr>
            );
          })}
          <tr className="kit-trade-money-total">
            <th scope="row">Total</th>
            <td className={costClass(t[deadKey])}>{formatCost(t[deadKey])}</td>
            <td className={signedClass(t[savedKey])}>{formatRoom(t[savedKey])}</td>
            <td className={costClass(t[addedKey])}>{formatCost(t[addedKey])}</td>
            <td className={signedClass(t[netKey])}>{formatRoom(t[netKey])}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// The by-season block for one card. `entry` is this team's trade_savings()
// row, or undefined when the read succeeded but returned no row for the team.
function BySeason({ entry, failed }) {
  if (failed) {
    return (
      <p className="form-notice kit-trade-money-note">
        The by-season figures could not be calculated for this trade. The cap,
        cash and roster check above is unaffected.
      </p>
    );
  }
  if (!entry || !entry.years || entry.years.length === 0) {
    return (
      <p className="empty-note kit-trade-money-note">
        No player money moves for this team in this trade.
      </p>
    );
  }
  return (
    <div className="kit-trade-money-block">
      <SeasonTable kind="cap" title="Cap by season" years={entry.years} totals={entry.totals} />
      <SeasonTable kind="cash" title="Cash by season" years={entry.years} totals={entry.totals} />
    </div>
  );
}

function TeamImpactCard({ row, savingsEntry, savingsShown, savingsFailed }) {
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

      {savingsShown && <BySeason entry={savingsEntry} failed={savingsFailed} />}

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
 * savings / savingsError: trade_savings() rows and its read error. Both are
 * optional; see the BY SEASON note at the top of the file.
 *
 * @param {{rows: Array, legality: Array, savings?: (Array|null), savingsError?: (string|null)}} props
 */
export default function TradeImpactCards({ rows, legality, savings, savingsError }) {
  const impact = rows || [];
  const problems = legality || [];

  // undefined = the caller did not ask for by-season figures; draw nothing.
  // null or an error = the caller asked and the read failed; say so.
  const savingsShown = savings !== undefined || Boolean(savingsError);
  const savingsFailed = savingsShown && (savings === null || Boolean(savingsError));
  const savingsByTeam = {};
  (Array.isArray(savings) ? savings : []).forEach(function (s) {
    savingsByTeam[s.team_id] = s;
  });

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
            return (
              <TeamImpactCard
                key={row.team_id}
                row={row}
                savingsEntry={savingsByTeam[row.team_id]}
                savingsShown={savingsShown}
                savingsFailed={savingsFailed}
              />
            );
          })}
        </div>
      )}

      {savingsShown && !savingsFailed && impact.length > 0 && (
        <p className="empty-note kit-trade-money-note">
          By season: Dead is the dead money for players a team sends. Saved is
          what those players would have cost it, minus the dead money. Added is
          what the players it receives will cost it. Net is Saved minus Added:
          green means the trade leaves the team better off that season, red
          means worse off. Future roster bonuses count as cash but are not on
          the cap until they convert, so cap and cash can differ.
        </p>
      )}
    </section>
  );
}
