'use client';

import { useState } from 'react';
import { formatMoney } from '../../../lib/formatMoney';
import { n } from './cardHelpers';

// The Visual Breakdown: cap-hit composition stacked by season, plus cash
// by season. Inline SVG, no chart library -- the app ships none, and these
// two are simple enough that a dependency would cost more than it saves.
//
// SERIES COLORS AND STACK ORDER ARE VALIDATED TOGETHER. The five series
// use the --pc-* variables from globals.css, stacked bottom-to-top as
// gtd, non-gtd, option, signing, roster. That exact adjacency passed all
// six categorical-palette checks (lightness band, chroma floor, CVD
// separation, normal-vision floor, contrast) in both themes. Reordering
// the stack or swapping a hex re-opens the question; re-validate, don't
// eyeball. Identity never rides on color alone: the legend names every
// series and each segment carries a hover tooltip, and the Cap Breakdown
// table is the same data as text.
//
// Money in this file is drawn, not computed: every segment height is a
// database value scaled to pixels.

const SERIES = [
  { key: 'gtd', label: 'Guaranteed salary', cssVar: 'var(--pc-gtd)' },
  { key: 'non', label: 'Non-guaranteed salary', cssVar: 'var(--pc-non)' },
  { key: 'opt', label: 'Option proration', cssVar: 'var(--pc-opt)' },
  { key: 'sign', label: 'Signing proration', cssVar: 'var(--pc-sign)' },
  { key: 'rost', label: 'Roster bonus', cssVar: 'var(--pc-rost)' },
];

function segmentsFor(row) {
  // player_contract_year_breakdown's cap_* columns sum to cap_charge by
  // construction (verified against all 715 live rows), so the stack always
  // reaches exactly the labeled cap hit.
  return {
    gtd: n(row.cap_gtd_salary) || 0,
    non: n(row.cap_non_gtd_salary) || 0,
    opt: n(row.cap_option_proration) || 0,
    sign: n(row.cap_signing_proration) || 0,
    rost: n(row.cap_roster_bonus) || 0,
  };
}

// Clean axis ticks: a 1/2/5 step sized so ~4 gridlines cover the max.
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

// A rect rounded on its top corners only: data-ends round, baseline square.
function roundedTopRect(x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, h / 2, w / 2));
  return (
    'M' + x + ',' + (y + h) +
    ' L' + x + ',' + (y + r) +
    ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
    ' L' + (x + w - r) + ',' + y +
    ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
    ' L' + (x + w) + ',' + (y + h) +
    ' Z'
  );
}

const CHART_H = 240;
const PAD_TOP = 26;
const PAD_BOTTOM = 26;
const PAD_LEFT = 52;
const PAD_RIGHT = 12;
const SLOT_W = 64;
const BAR_W = 24;
const GAP = 2;

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="pc-tooltip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
      <div className="pc-tip-label">{tip.label}</div>
      {tip.lines.map(function (line, i) {
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

function StackedCapChart({ rows, onTip }) {
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const width = PAD_LEFT + rows.length * SLOT_W + PAD_RIGHT;

  let maxTotal = 0;
  const prepared = rows.map(function (row) {
    const segs = segmentsFor(row);
    const total = segs.gtd + segs.non + segs.opt + segs.sign + segs.rost;
    if (total > maxTotal) maxTotal = total;
    return { row: row, segs: segs, total: total };
  });
  if (maxTotal <= 0) maxTotal = 1;

  const step = tickStep(maxTotal);
  const ticks = [];
  for (let v = 0; v <= maxTotal + step * 0.001; v += step) ticks.push(v);
  const axisMax = ticks[ticks.length - 1] < maxTotal ? maxTotal : ticks[ticks.length - 1];

  function yFor(value) {
    return PAD_TOP + plotH - (value / axisMax) * plotH;
  }

  return (
    <svg
      width={width}
      height={CHART_H}
      role="img"
      aria-label="Cap hit composition by season"
    >
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
              {'$' + Math.round(t).toLocaleString('en-US')}
            </text>
          </g>
        );
      })}

      {prepared.map(function (p, i) {
        const x = PAD_LEFT + i * SLOT_W + (SLOT_W - BAR_W) / 2;
        let cursor = PAD_TOP + plotH; // baseline, climbs as segments stack
        const rects = [];
        // Which series is the topmost visible one? It gets the rounded cap.
        let topKey = null;
        for (let s = SERIES.length - 1; s >= 0; s -= 1) {
          if (p.segs[SERIES[s].key] > 0) {
            topKey = SERIES[s].key;
            break;
          }
        }
        SERIES.forEach(function (series) {
          const value = p.segs[series.key];
          if (value <= 0) return;
          const rawH = (value / axisMax) * plotH;
          const yTop = cursor - rawH;
          // The 2px surface gap comes out of the segment, not the total.
          const drawH = Math.max(1, rawH - GAP);
          const common = {
            fill: series.cssVar,
            onMouseMove: function (e) {
              onTip({
                x: e.clientX,
                y: e.clientY,
                label: p.row.league_season_year + (p.row.is_void_year ? ' (void year)' : ''),
                lines: [
                  series.label + ': ' + formatMoney(value),
                  'Cap hit: ' + formatMoney(p.row.cap_charge),
                ],
              });
            },
            onMouseLeave: function () {
              onTip(null);
            },
          };
          if (series.key === topKey) {
            rects.push(
              <path
                key={series.key}
                {...common}
                d={roundedTopRect(x, yTop + GAP, BAR_W, drawH, 4)}
              />
            );
          } else {
            rects.push(
              <rect
                key={series.key}
                {...common}
                x={x}
                y={yTop + GAP}
                width={BAR_W}
                height={drawH}
              />
            );
          }
          cursor = yTop;
        });

        return (
          <g key={p.row.league_season_year}>
            {rects}
            <text
              x={x + BAR_W / 2}
              y={cursor - 6}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text)"
            >
              {formatMoney(p.row.cap_charge)}
            </text>
            <text
              x={x + BAR_W / 2}
              y={CHART_H - 8}
              textAnchor="middle"
              fontSize="11"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text-dim)"
            >
              {p.row.league_season_year}
            </text>
          </g>
        );
      })}

      <line
        x1={PAD_LEFT}
        x2={width - PAD_RIGHT}
        y1={PAD_TOP + plotH}
        y2={PAD_TOP + plotH}
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
    </svg>
  );
}

function CashChart({ rows, onTip }) {
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const width = PAD_LEFT + rows.length * SLOT_W + PAD_RIGHT;

  let maxCash = 0;
  rows.forEach(function (row) {
    const v = n(row.cash_value) || 0;
    if (v > maxCash) maxCash = v;
  });
  if (maxCash <= 0) maxCash = 1;

  const step = tickStep(maxCash);
  const ticks = [];
  for (let v = 0; v <= maxCash + step * 0.001; v += step) ticks.push(v);
  const axisMax = ticks[ticks.length - 1] < maxCash ? maxCash : ticks[ticks.length - 1];

  function yFor(value) {
    return PAD_TOP + plotH - (value / axisMax) * plotH;
  }

  return (
    <svg width={width} height={CHART_H} role="img" aria-label="Cash by season">
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
              {'$' + Math.round(t).toLocaleString('en-US')}
            </text>
          </g>
        );
      })}

      {rows.map(function (row, i) {
        const value = n(row.cash_value) || 0;
        const x = PAD_LEFT + i * SLOT_W + (SLOT_W - BAR_W) / 2;
        const h = (value / axisMax) * plotH;
        const yTop = PAD_TOP + plotH - h;
        return (
          <g key={row.league_season_year}>
            {value > 0 && (
              <path
                d={roundedTopRect(x, yTop, BAR_W, Math.max(1, h), 4)}
                fill="var(--pc-gtd)"
                onMouseMove={function (e) {
                  onTip({
                    x: e.clientX,
                    y: e.clientY,
                    label: String(row.league_season_year),
                    lines: ['Cash: ' + formatMoney(value)],
                  });
                }}
                onMouseLeave={function () {
                  onTip(null);
                }}
              />
            )}
            <text
              x={x + BAR_W / 2}
              y={yTop - 6}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text)"
            >
              {formatMoney(value)}
            </text>
            <text
              x={x + BAR_W / 2}
              y={CHART_H - 8}
              textAnchor="middle"
              fontSize="11"
              fontFamily="var(--font-mono), monospace"
              fill="var(--text-dim)"
            >
              {row.league_season_year}
            </text>
          </g>
        );
      })}

      <line
        x1={PAD_LEFT}
        x2={width - PAD_RIGHT}
        y1={PAD_TOP + plotH}
        y2={PAD_TOP + plotH}
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
    </svg>
  );
}

export default function VisualBreakdown({ rows }) {
  const [tip, setTip] = useState(null);

  if (!rows || rows.length === 0) {
    return <p className="empty-note">No contract seasons to draw.</p>;
  }

  return (
    <>
      <h3 className="section-heading">Cap hit composition by season</h3>
      <div className="pc-legend">
        {SERIES.map(function (s) {
          return (
            <span key={s.key} className="pc-legend-item">
              <span className="pc-swatch" style={{ background: s.cssVar }} />
              {s.label}
            </span>
          );
        })}
      </div>
      <div className="pc-chart-wrap">
        <StackedCapChart rows={rows} onTip={setTip} />
      </div>

      <h3 className="section-heading" style={{ marginTop: 24 }}>
        Cash by season
      </h3>
      <div className="pc-chart-wrap">
        <CashChart rows={rows} onTip={setTip} />
      </div>

      <p className="pc-note">
        Void years carry proration only. A roster bonus joins the cap stack
        on September 2 of its season. The Cap Breakdown table is this chart
        as text.
      </p>

      <Tooltip tip={tip} />
    </>
  );
}
