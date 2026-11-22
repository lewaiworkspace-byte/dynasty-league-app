'use client';

import ExplainButton from '../../../components/ExplainButton';
import { formatMoney, formatMoneyDelta } from '../../../lib/formatMoney';
import { formatDate } from '../../../lib/formatDate';

// THE VALUE BOX -- UI test batch 32, November 21, 2026.
//
// Lewis's canvas "EDFL Player Cards (test site): Mini and Full", Option H, his
// pick and his notes through "Move value above contract":
//   Worth    what the weekly Player Value Chart says he is worth a year;
//   Cost     what his contract costs a year on average;
//   Value    Worth minus Cost, green above zero, red below;
//   Average  the average Worth of the position's average starters;
// the four tiles in the order Value, Cost / Worth, Average with an explain icon
// each; the Worth curve with the Cost line, the green (or red) gap and the
// dotted Average line; the "Value down $N since <anchor date>" chip with his
// position rank by Worth; and the Value-rank chip (at his position and among
// all players with an active contract).
//
// EVERY FIGURE IS THE DATABASE'S (SR-23): edfl_player_value_box() returns
// worth, cost, value, avg_starter, the ranks, the pools and the change since the
// anchor chart; edfl_player_value_series() returns the points. The browser
// draws them and adds nothing, subtracts nothing and ranks nothing. The only
// arithmetic here is geometry (where to put a point) and the sign test that
// picks green or red.
//
// WORTH IN DOLLARS: Lewis asked for Worth, Value, Cost and Average "in $"
// (canvas comment, November 21), which supersedes money-and-dates.md's earlier
// "PPV is drawn bare" for THIS box only; every other PPV figure stays bare.
//
// A failed read shows its error (L14); a player not on the weekly chart gets
// the caller's fallback, never a blank box.

const W = 330;
const H = 176;
const X0 = 38;
const X1 = 320;
const Y0 = 14;
const Y1 = 144;

function shortDate(d) {
  return formatDate(d).replace(/, \d{4}$/, '');
}

// A monotone cubic through the points, so the curve never overshoots a week's
// value (Fritsch-Carlson). Geometry only.
function curvePath(pts) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  }
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ' C' +
      (pts[i][0] + h).toFixed(1) +
      ',' +
      (pts[i][1] + t[i] * h).toFixed(1) +
      ' ' +
      (pts[i + 1][0] - h).toFixed(1) +
      ',' +
      (pts[i + 1][1] - t[i + 1] * h).toFixed(1) +
      ' ' +
      pts[i + 1][0].toFixed(1) +
      ',' +
      pts[i + 1][1].toFixed(1);
  }
  return d;
}

function Tile({ tone, label, value, color, about, aboutLabel }) {
  return (
    <div className={'vb-tile' + (tone ? ' is-' + tone : '')}>
      <div className="vb-tilelab">
        <span style={{ color: color }} aria-hidden="true">
          ●
        </span>{' '}
        {label}
        <ExplainButton label={aboutLabel} title={label}>
          {about}
        </ExplainButton>
      </div>
      <div className="vb-tileval" style={{ color: color }}>
        {value}
      </div>
    </div>
  );
}

export default function ValueBox({ box, series, name, error }) {
  if (error) {
    return <p className="form-error">The Value box could not load: {error}</p>;
  }
  if (!box) return null;

  const pos = box.player_position || 'his position';
  const hasCost = box.cost !== null && box.cost !== undefined;
  const value = hasCost ? Number(box.value) : null;
  const positive = value !== null && value >= 0;
  const pts = (series || []).filter(function (r) {
    return r.worth !== null && r.worth !== undefined;
  });

  // The drawing: x by date, y by dollars, the axis padded to round fifties.
  let chart = null;
  if (pts.length >= 2) {
    const t0 = new Date(pts[0].chart_date + 'T00:00:00Z').getTime();
    const t1 = new Date(pts[pts.length - 1].chart_date + 'T00:00:00Z').getTime();
    const span = t1 - t0 || 1;
    const all = [];
    pts.forEach(function (r) {
      all.push(Number(r.worth));
      if (r.avg_starter !== null && r.avg_starter !== undefined) all.push(Number(r.avg_starter));
    });
    if (hasCost) all.push(Number(box.cost));
    const lo = Math.floor((Math.min.apply(null, all) - 10) / 50) * 50;
    const hi = Math.ceil((Math.max.apply(null, all) + 10) / 50) * 50;
    const yOf = function (v) {
      return Y1 - ((v - lo) / (hi - lo || 1)) * (Y1 - Y0);
    };
    const xOf = function (d) {
      return X0 + ((new Date(d + 'T00:00:00Z').getTime() - t0) / span) * (X1 - X0);
    };
    const worthPts = pts.map(function (r) {
      return [xOf(r.chart_date), yOf(Number(r.worth))];
    });
    const avgPts = pts
      .filter(function (r) {
        return r.avg_starter !== null && r.avg_starter !== undefined;
      })
      .map(function (r) {
        return [xOf(r.chart_date), yOf(Number(r.avg_starter))];
      });
    const ticks = [];
    for (let v = lo; v < hi; v += 50) ticks.push(v);
    const costY = hasCost ? yOf(Number(box.cost)) : null;
    const gap =
      hasCost
        ? worthPts
            .map(function (p) {
              return p[0].toFixed(1) + ',' + p[1].toFixed(1);
            })
            .join(' ') +
          ' ' +
          X1.toFixed(1) +
          ',' +
          costY.toFixed(1) +
          ' ' +
          X0.toFixed(1) +
          ',' +
          costY.toFixed(1)
        : null;
    const mid = pts.length > 4 ? [pts[Math.floor(pts.length / 3)], pts[Math.floor((2 * pts.length) / 3)]] : [];
    const last = worthPts[worthPts.length - 1];
    chart = {
      yOf: yOf,
      xOf: xOf,
      worthPath: curvePath(worthPts),
      avgPath: avgPts.length >= 2 ? curvePath(avgPts) : null,
      ticks: ticks,
      costY: costY,
      gap: gap,
      mid: mid,
      last: last,
    };
  }

  const anchorWord = box.anchor_date ? shortDate(box.anchor_date) : 'the first chart';
  const change = box.value_change_since_anchor === null || box.value_change_since_anchor === undefined ? null : Number(box.value_change_since_anchor);

  return (
    <div className="vb">
      <div className="vb-tiles edfl-explain-host">
        <Tile
          tone={positive ? 'good' : value !== null ? 'bad' : null}
          label="Value"
          aboutLabel="What Value means"
          color={value === null ? 'var(--ink-2)' : positive ? 'var(--st-good-fg)' : 'var(--accent-rust)'}
          value={value === null ? '—' : formatMoneyDelta(value)}
          about={
            <p>
              Value is his Worth minus his Cost
              {value === null
                ? '. He has no active contract, so he has no Cost and no Value.'
                : ': ' + formatMoney(box.worth) + ' minus ' + formatMoney(box.cost) + ' is ' + formatMoneyDelta(value) + ' a year.'}{' '}
              Green is above zero, red is below.
              {box.value_pool_all
                ? ' Ranked against the ' +
                  box.value_pool_pos +
                  ' ' +
                  pos +
                  's and ' +
                  box.value_pool_all +
                  ' players with an active contract; players on the chart with no contract are left out.'
                : ''}
            </p>
          }
        />
        <Tile
          label="Cost"
          aboutLabel="What Cost means"
          color="var(--c-cap)"
          value={hasCost ? formatMoney(box.cost) : '—'}
          about={<p>Cost is what his contract costs a year on average, across the years it runs (void years left out).</p>}
        />
        <Tile
          label="Worth"
          aboutLabel="What Worth means"
          color="var(--c-ppv)"
          value={formatMoney(box.worth)}
          about={
            <p>
              Worth is what the weekly Player Value Chart says {name} is worth a year, in fantasy dollars. On the{' '}
              {shortDate(box.chart_date)} chart it is {formatMoney(box.worth)}
              {box.pos_rank_worth ? ', #' + box.pos_rank_worth + ' among ' + pos + 's' : ''}.
            </p>
          }
        />
        <Tile
          label="Average"
          aboutLabel="What Average means"
          color="var(--brass)"
          value={box.avg_starter === null || box.avg_starter === undefined ? '—' : formatMoney(box.avg_starter)}
          about={
            <p>
              Average is the average Worth of the top {box.avg_starter_n || 'few'} {pos}s on the chart, a picture of
              what a typical starter at his position is worth.
            </p>
          }
        />
      </div>

      {chart ? (
        <svg
          className="vb-chart"
          viewBox={'0 0 ' + W + ' ' + H}
          role="img"
          aria-label={
            'Worth by chart date for ' +
            name +
            ': ' +
            pts
              .map(function (r) {
                return formatMoney(r.worth) + ' on ' + shortDate(r.chart_date);
              })
              .join(', ') +
            (hasCost ? '. Cost ' + formatMoney(box.cost) + ' a year.' : '.')
          }
        >
          {chart.ticks.map(function (v) {
            return (
              <g key={v}>
                <line x1={X0} y1={chart.yOf(v)} x2={X1} y2={chart.yOf(v)} stroke="var(--line)" strokeWidth="1" />
                <text x={X0 - 6} y={chart.yOf(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-2)">
                  {formatMoney(v)}
                </text>
              </g>
            );
          })}
          <text x={X0} y={H - 6} textAnchor="start" fontSize="10" fill="var(--ink-2)">
            {shortDate(pts[0].chart_date)}
          </text>
          {chart.mid.map(function (r) {
            return (
              <text key={r.chart_date} x={chart.xOf(r.chart_date)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
                {shortDate(r.chart_date)}
              </text>
            );
          })}
          <text x={X1} y={H - 6} textAnchor="end" fontSize="10" fill="var(--ink-2)">
            {shortDate(pts[pts.length - 1].chart_date)}
          </text>
          {chart.gap ? (
            <polygon points={chart.gap} fill={positive ? 'var(--st-good-fg)' : 'var(--accent-rust)'} opacity="0.18" />
          ) : null}
          {chart.costY !== null ? (
            <line x1={X0} y1={chart.costY} x2={X1} y2={chart.costY} stroke="var(--c-cap)" strokeWidth="2" strokeDasharray="5 4" />
          ) : null}
          {chart.avgPath ? (
            <path d={chart.avgPath} fill="none" stroke="var(--brass)" strokeWidth="1.5" strokeDasharray="2 4" strokeLinecap="round" />
          ) : null}
          <path d={chart.worthPath} fill="none" stroke="var(--c-ppv)" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={chart.last[0]} cy={chart.last[1]} r="4" fill="var(--c-ppv)" />
        </svg>
      ) : null}

      <div className="vb-chips">
        {change === null ? (
          <span />
        ) : change === 0 ? (
          <span className="vb-chip is-flat">Value unchanged since {anchorWord}</span>
        ) : change < 0 ? (
          <span className="vb-chip is-bad">
            ▼ Value down {formatMoney(Math.abs(change))} since {anchorWord}
          </span>
        ) : (
          <span className="vb-chip is-good">
            ▲ Value up {formatMoney(change)} since {anchorWord}
          </span>
        )}
        {box.pos_rank_worth ? (
          <b className="vb-poschip">
            {box.player_position} #{box.pos_rank_worth}
          </b>
        ) : null}
      </div>

      {box.value_rank_pos ? (
        <div>
          <span className="vb-chip is-good">
            Value rank · {box.player_position} #{box.value_rank_pos} of {box.value_pool_pos} · All #{box.value_rank_all} of{' '}
            {box.value_pool_all}
          </span>
        </div>
      ) : (
        <div>
          <span className="vb-chip is-flat">No Value rank: no active contract</span>
        </div>
      )}

      <a className="edfl-pc-btn vb-link" href={'/values?view=weekly&date=' + box.chart_date}>
        See Full Player Value Chart
      </a>
    </div>
  );
}
