import { formatMoney, formatMoneyDelta } from '../../lib/formatMoney';

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
// THE _ok FLAGS ARE THE VERDICT, NOT THE NUMBERS. Money is displayed in whole
// dollars per the August 22 ruling, so a figure carrying cents rounds on
// screen. At a $1,500 cap a team can therefore read "$1,500 of $1,500" while
// cap_ok is false, because the true figure was $1,500.33. The chip comes from
// the database and always wins; overBy() below says "less than $1" rather than
// "$0" so a real overage never renders as no overage at all.

// A team is short of nothing, or it is short of something specific.
function overBy(after, ceiling) {
  if (after === null || after === undefined) return null;
  if (ceiling === null || ceiling === undefined) return null;
  const gap = Number(after) - Number(ceiling);
  if (!Number.isFinite(gap) || gap <= 0) return null;
  // Rounds to zero but is genuinely over: say so rather than printing "$0".
  if (Math.round(gap) === 0) return 'less than $1';
  return formatMoney(gap);
}

function Verdict({ ok }) {
  if (ok === null || ok === undefined) return null;
  return (
    <span className={ok ? 'status status-good' : 'status status-bad'}>
      {ok ? 'Clear' : 'Blocked'}
    </span>
  );
}

// One measure: before, after, the delta, and whether it passes.
function ImpactRow(props) {
  const { label, before, after, delta, limitLabel, limitValue, ok, money, tone } = props;

  const fmt = money
    ? function (v) {
        return formatMoney(v);
      }
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
        money
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
        money
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
              Dead cap next year {formatMoney(row.dead_cap_next_year)}
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
