import ExplainButton from '../../../components/ExplainButton';
import { formatRoom } from '../../../lib/formatMoney';

// THE "AMOUNT SAVED" TABLE -- UI test batch 37, November 22, 2026.
//
// Lewis on the player-card canvas (Nov 21): "Amount saved for current year and
// next year for moving him", "If cut and if traded", cap and cash "both". His
// rulings (Nov 22, 00:12 ET): IF CUT the dead-money rules apply to both seasons
// where applicable, including the post-June 1 split; IF TRADED the saving is
// his salary leaving with him.
//
// Every figure is a row of edfl_player_amount_saved(contract) (test database,
// migration pcsave_01): the cut side is compute_cut_savings(), the Cut dialog's
// own engine; the trade side is trade_savings()'s giving-team leg for this one
// contract. Nothing is computed here. Saved figures are room, so they print
// with formatRoom (rounded down), as in the Cut dialog. A negative saving means
// the move costs more that season than keeping him.
//
// The one explain icon sits in the heading cell; the whole table (.as-box)
// carries edfl-explain-host, so its card spans the table; nothing between is
// positioned (batch 30).

function cell(cap, cash) {
  return (
    <span className="as-pair">
      <b className={'as-v v-cap' + (Number(cap) < 0 ? ' is-neg' : '')}>{formatRoom(cap)}</b>
      <b className={'as-v v-cash' + (Number(cash) < 0 ? ' is-neg' : '')}>{formatRoom(cash)}</b>
    </span>
  );
}

export default function AmountSaved(props) {
  const rows = props.rows || [];
  if (props.error) {
    return (
      <div className={'as-box' + (props.compact ? ' is-compact' : '')}>
        <p className="form-error" style={{ margin: 0 }}>
          The amount saved could not be read: {props.error}
        </p>
      </div>
    );
  }
  if (rows.length === 0) return null;
  const anyNeg = rows.some(function (r) {
    return [r.cut_cap_saved, r.cut_cash_saved, r.trade_cap_saved, r.trade_cash_saved].some(function (v) {
      return Number(v) < 0;
    });
  });
  const split = rows.some(function (r) {
    return r.june1_split;
  });

  return (
    <div className={'as-box edfl-explain-host' + (props.compact ? ' is-compact' : '')}>
      <div className="as-grid" style={{ gridTemplateColumns: (props.compact ? '70px' : '84px') + ' repeat(' + rows.length + ', minmax(0, 1fr))' }}>
        <div className="as-h as-hrow">
          <span>Amount saved</span>
          <ExplainButton label="How the amount saved is worked out" title="Amount saved">
            <p>
              Saved is what he would cost that season if kept, minus the dead money the move leaves behind.
              Cap is blue, cash green.
            </p>
            <ul>
              <li>
                <b>If cut:</b> the dead-money rules for a cut made today
                {split ? ', including the June 1st split (prorated money from later seasons lands next season)' : ''}.
              </li>
              <li>
                <b>If traded:</b> his salary leaves with him; his prorated bonus accelerates and stays with you.
              </li>
            </ul>
            {anyNeg ? <p>A negative saving means the move costs more that season than keeping him.</p> : null}
          </ExplainButton>
        </div>
        {rows.map(function (r) {
          return (
            <div key={'h' + r.season_year} className="as-col">
              <span className="as-yr">{r.season_year}</span>
              <span className="as-sub">
                <span className="v-cap">Cap</span>
                <span className="v-cash">Cash</span>
              </span>
            </div>
          );
        })}
        <div className="as-row">If cut</div>
        {rows.map(function (r) {
          return (
            <div key={'c' + r.season_year} className="as-col">
              {cell(r.cut_cap_saved, r.cut_cash_saved)}
            </div>
          );
        })}
        <div className="as-row">If traded</div>
        {rows.map(function (r) {
          return (
            <div key={'t' + r.season_year} className="as-col">
              {cell(r.trade_cap_saved, r.trade_cash_saved)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
