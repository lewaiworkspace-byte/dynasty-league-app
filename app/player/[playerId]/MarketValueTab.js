'use client';

import { useState } from 'react';
import { formatMoney, formatMoneyDelta } from '../../../lib/formatMoney';
import { formatDate } from '../../../lib/formatDate';
import { n } from './cardHelpers';

// Market Value: the player's Player Value Chart trend, from
// player_value_history -- PUBLISHED snapshots only, which is what that
// view contains. Unpublished chart work stays commissioner-only in the
// database and never reaches this tab; do not "complete" the trend by
// querying the chart tables directly.
//
// PPV figures wear --c-ppv purple app-wide; the trend line follows.

const CHART_H = 220;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;
const PAD_LEFT = 52;
const PAD_RIGHT = 24;
const SLOT_W = 120;

function tickStep(maxValue) {
  if (maxValue <= 0) return 1;
  const rough = maxValue / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const unit = rough / pow;
  let step;
  if (unit <= 1) step = 1;
  else if (unit <= 2) step = 2;
  else if (unit <= 5) step = 5;
  else step = 10;
  return step * pow;
}

function TrendChart({ points, onTip }) {
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const width = PAD_LEFT + Math.max(1, points.length - 1) * SLOT_W + PAD_RIGHT;

  let maxV = 0;
  points.forEach(function (p) {
    if (p.value > maxV) maxV = p.value;
  });
  if (maxV <= 0) maxV = 1;

  const step = tickStep(maxV);
  const ticks = [];
  for (let v = 0; v <= maxV + step * 0.001; v += step) ticks.push(v);
  const axisMax = ticks[ticks.length - 1] < maxV ? maxV : ticks[ticks.length - 1];

  function xFor(i) {
    return PAD_LEFT + i * SLOT_W;
  }
  function yFor(value) {
    return PAD_TOP + plotH - (value / axisMax) * plotH;
  }

  let path = '';
  points.forEach(function (p, i) {
    path += (i === 0 ? 'M' : ' L') + xFor(i) + ',' + yFor(p.value);
  });

  return (
    <svg width={width} height={CHART_H} role="img" aria-label="Total PPV by chart edition">
      {ticks.map(function (t) {
        return (
          <g key={'t' + t}>
            <line
              x1={PAD_LEFT}
              x2={width - PAD_RIGHT}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD_LEFT - 8}
              y={yFor(t) + 4}
              textAnchor="end"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text-dim)"
            >
              {Math.round(t).toLocaleString('en-US')}
            </text>
          </g>
        );
      })}

      {points.length > 1 && (
        <path
          d={path}
          fill="none"
          stroke="var(--c-ppv)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {points.map(function (p, i) {
        return (
          <g key={p.label + '-' + i}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.value)}
              r="5"
              fill="var(--c-ppv)"
              stroke="var(--bg)"
              strokeWidth="2"
              onMouseMove={function (e) {
                onTip({
                  x: e.clientX,
                  y: e.clientY,
                  label: p.label,
                  lines: ['Total PPV: ' + Math.round(p.value).toLocaleString('en-US')],
                });
              }}
              onMouseLeave={function () {
                onTip(null);
              }}
            />
            <text
              x={xFor(i)}
              y={yFor(p.value) - 12}
              textAnchor="middle"
              fontSize="11"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text)"
            >
              {Math.round(p.value).toLocaleString('en-US')}
            </text>
            <text
              x={xFor(i)}
              y={CHART_H - 8}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text-dim)"
            >
              {p.axisLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MarketValueTab({ header, valueHistory }) {
  const [tip, setTip] = useState(null);

  if (!valueHistory || valueHistory.length === 0) {
    return (
      <p className="empty-note">
        {header.full_name} does not appear on any published Player Value
        Chart edition.
      </p>
    );
  }

  const latest = valueHistory[0]; // recency_rank 1
  const trendPoints = valueHistory
    .slice()
    .reverse() // oldest first, left to right
    .map(function (v) {
      return {
        value: n(v.total_ppv) || 0,
        label: v.snapshot_label,
        axisLabel: formatDate(v.snapshot_as_of),
      };
    });

  return (
    <>
      <div className="stat-strip">
        <div>
          <div className="stat-label">Total PPV</div>
          <div className="stat-value v-ppv">
            {Math.round(n(latest.total_ppv) || 0).toLocaleString('en-US')}
          </div>
        </div>
        <div>
          <div className="stat-label">vs Prior Edition</div>
          <div className="stat-value">
            {latest.is_new_this_snapshot
              ? 'New'
              : formatMoneyDelta(latest.total_ppv_delta).replace('$', '')}
          </div>
        </div>
        <div>
          <div className="stat-label">Per-Year Value</div>
          <div className="stat-value">
            {formatMoney(latest.per_year_value)}
          </div>
        </div>
        <div>
          <div className="stat-label">Likely Years</div>
          <div className="stat-value">{latest.likely_years ?? '—'}</div>
        </div>
        <div>
          <div className="stat-label">Tier</div>
          <div className="stat-value" style={{ fontSize: 15 }}>
            {latest.value_tier || '—'}
          </div>
        </div>
        {latest.chart_rank ? (
          <div>
            <div className="stat-label">Chart Rank</div>
            <div className="stat-value">
              {latest.chart_position
                ? latest.chart_position + ' #' + latest.chart_rank
                : '#' + latest.chart_rank}
            </div>
          </div>
        ) : null}
      </div>

      <h2 className="section-heading">Total PPV by edition</h2>
      <div className="pc-chart-wrap">
        <TrendChart points={trendPoints} onTip={setTip} />
      </div>

      <h2 className="section-heading" style={{ marginTop: 24 }}>
        Every published edition
      </h2>
      <div className="table-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th>Edition</th>
              <th>As Of</th>
              <th>Pos Rank</th>
              <th>Per-Year</th>
              <th>Likely Yrs</th>
              <th>Total PPV</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {valueHistory.map(function (v) {
              return (
                <tr key={v.snapshot_label + '-' + v.recency_rank}>
                  <th scope="row">{v.snapshot_label}</th>
                  <td style={{ textAlign: 'left' }}>
                    {formatDate(v.snapshot_as_of)}
                  </td>
                  <td className="num">
                    {v.chart_rank
                      ? (v.chart_position || '') + ' #' + v.chart_rank
                      : '—'}
                  </td>
                  <td className="num">{formatMoney(v.per_year_value)}</td>
                  <td className="num">{v.likely_years ?? '—'}</td>
                  <td className="num v-ppv">
                    {Math.round(n(v.total_ppv) || 0).toLocaleString('en-US')}
                  </td>
                  <td className="num">
                    {v.is_new_this_snapshot
                      ? 'New'
                      : formatMoneyDelta(v.total_ppv_delta).replace('$', '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pc-note">
        PPV is the chart&rsquo;s valuation of the player, not money — it is
        the number auction bids are scored against. Notes from the chart
        editor, where present:{' '}
        {valueHistory
          .map(function (v) {
            return v.notes;
          })
          .filter(Boolean)
          .join(' · ') || 'none.'}
      </p>

      {tip && (
        <div className="pc-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          <div className="pc-tip-label">{tip.label}</div>
          {tip.lines.map(function (line, i) {
            return <div key={i}>{line}</div>;
          })}
        </div>
      )}
    </>
  );
}
