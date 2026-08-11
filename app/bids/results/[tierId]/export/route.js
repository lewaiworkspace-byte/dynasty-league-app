import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../lib/supabaseServerClient';
import { formatDate } from '../../../../../lib/formatDate';

// Node runtime, not Edge: xlsx writes a Buffer and jsPDF's node build needs
// Node globals. Never cached -- an export must match the page it came from.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const READ_PAGE_SIZE = 1000; // PostgREST's default row ceiling

// Both views are paged deliberately, not defensively. Tier 2 alone is 172
// bids; at up to five years plus void years that is 860+ rows in the years
// view, and a third tier of that size crosses 1,000. PostgREST truncates an
// unbounded select at 1,000 rows with no error and no warning, which would
// produce an export that looks complete and is not -- the worst failure mode
// for a file people keep. Every query below orders on something stable and
// unique so pages can never overlap or skip.
async function fetchAllResults(supabase, tierId) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('auction_tier_results')
      .select('*')
      .eq('tier_id', tierId)
      .order('player_name')
      .order('bid_id')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

async function fetchAllResultYears(supabase, tierId) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('auction_tier_result_years')
      .select('*')
      .eq('tier_id', tierId)
      .order('bid_id')
      .order('contract_year_number')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

// Type coercion for spreadsheet cell typing only. It never rounds, rescales
// or recomputes -- every figure in every format is whatever the view gave us.
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function plain(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function slugify(s) {
  const out = String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  return out || 'tier';
}

// ANONYMITY. Losing bidders are anonymous permanently under rule 6.1(g), not
// just until publication. Two rules hold this together and neither may be
// relaxed:
//
//   1. The counter is local to one player and restarts at 1 for the next.
//      "Bid 2" on one player has no relationship to "Bid 2" on another. A
//      pseudonym that persisted across players would let anyone reconstruct
//      a whole team's strategy by elimination, which is the exact thing the
//      rule exists to prevent.
//   2. Losers are numbered in their own sequence from 1. A winner does not
//      consume slot 1 -- implying an ordering between the named row and the
//      anonymous ones would suggest a relationship that does not exist.
//
// bid_id, team_id and player_id are used here for grouping and joining and
// are never written to any output in any format.
function buildPlayers(results, years) {
  const yearsByBid = new Map();
  years.forEach(function (y) {
    if (!yearsByBid.has(y.bid_id)) yearsByBid.set(y.bid_id, []);
    yearsByBid.get(y.bid_id).push(y);
  });

  const byPlayer = new Map();
  results.forEach(function (r) {
    if (!byPlayer.has(r.player_id)) {
      byPlayer.set(r.player_id, {
        name: plain(r.player_name),
        position: plain(r.position),
        bids: [],
      });
    }
    byPlayer.get(r.player_id).bids.push(r);
  });

  const players = Array.from(byPlayer.values());

  players.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  players.forEach(function (p) {
    // Player name, then winners before losers, then total PPV descending.
    // Identical ordering in all three formats.
    p.bids.sort(function (a, b) {
      const aw = a.is_winner ? 0 : 1;
      const bw = b.is_winner ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return Number(b.total_ppv || 0) - Number(a.total_ppv || 0);
    });

    let anon = 0;
    p.bids.forEach(function (b) {
      if (b.is_winner) {
        b.bidderLabel = plain(b.team_name) || 'Winner';
      } else {
        anon += 1;
        b.bidderLabel = 'Bid ' + anon;
      }
      const detail = (yearsByBid.get(b.bid_id) || []).slice();
      detail.sort(function (x, y) {
        return Number(x.contract_year_number) - Number(y.contract_year_number);
      });
      b.seasons = detail;
    });
  });

  return players;
}

const CSV_HEADER = [
  'player_name',
  'position',
  'bidder',
  'is_winner',
  'status',
  'total_ppv',
  'total_years',
  'void_years',
  'signing_bonus_total',
  'start_year',
  'season_year',
  'contract_year_number',
  'is_void_year',
  'guaranteed_salary',
  'non_guaranteed_salary',
  'option_bonus',
  'roster_bonus',
  'prorated_signing_bonus',
  'dead_cap_if_cut',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  const needsQuote =
    s.indexOf(',') !== -1 ||
    s.indexOf('"') !== -1 ||
    s.indexOf('\n') !== -1 ||
    s.indexOf('\r') !== -1;
  if (!needsQuote) return s;
  return '"' + s.split('"').join('""') + '"';
}

// Long format, one row per bid-season with the bid-level fields repeated.
// Contracts run one to five years; a wide layout would leave ragged empty
// columns. Values are passed through raw -- no currency symbols, no
// thousands separators.
function buildCsv(players) {
  const lines = [CSV_HEADER.join(',')];

  players.forEach(function (p) {
    p.bids.forEach(function (b) {
      const base = [
        p.name,
        p.position,
        b.bidderLabel,
        yesNo(b.is_winner),
        plain(b.status),
        b.total_ppv,
        b.total_years,
        b.void_years,
        b.signing_bonus_total,
        b.start_year,
      ];

      // A bid with no season rows still gets one line, otherwise it would
      // vanish from the file entirely.
      if (b.seasons.length === 0) {
        const blanks = ['', '', '', '', '', '', '', '', ''];
        lines.push(base.concat(blanks).map(csvCell).join(','));
        return;
      }

      b.seasons.forEach(function (s) {
        lines.push(
          base
            .concat([
              s.league_season_year,
              s.contract_year_number,
              yesNo(s.is_void_year),
              s.guaranteed_salary,
              s.non_guaranteed_salary,
              s.option_bonus,
              s.roster_bonus,
              s.prorated_signing_bonus,
              s.dead_cap_if_cut,
            ])
            .map(csvCell)
            .join(',')
        );
      });
    });
  });

  return lines.join('\r\n') + '\r\n';
}

const XLSX_BID_HEADER = [
  'Player',
  'Position',
  'Bidder',
  'Winner',
  'Status',
  'Total PPV',
  'Total Years',
  'Void Years',
  'Signing Bonus Total',
  'Start Year',
];

const XLSX_SEASON_HEADER = [
  'Player',
  'Bidder',
  'Season Year',
  'Contract Year',
  'Void Year',
  'Guaranteed Salary',
  'Non-Guaranteed Salary',
  'Option Bonus',
  'Roster Bonus',
  'Prorated Signing Bonus',
  'Dead Cap If Cut',
];

function widths(list) {
  return list.map(function (w) {
    return { wch: w };
  });
}

async function buildXlsx(players) {
  // Dynamically imported so it stays out of the base bundle, matching
  // lib/statsHelpers.js. Note this is XLSX.write, not writeFile -- writeFile
  // targets a filesystem path and does nothing useful in a route handler.
  const XLSX = await import('xlsx');

  const bidRows = [];
  const seasonRows = [];

  players.forEach(function (p) {
    p.bids.forEach(function (b) {
      bidRows.push([
        p.name,
        p.position,
        b.bidderLabel,
        yesNo(b.is_winner),
        plain(b.status),
        num(b.total_ppv),
        num(b.total_years),
        num(b.void_years),
        num(b.signing_bonus_total),
        num(b.start_year),
      ]);

      // Player and bidder repeat on every season row so the Seasons sheet
      // stands alone once someone sorts or filters it.
      b.seasons.forEach(function (s) {
        seasonRows.push([
          p.name,
          b.bidderLabel,
          num(s.league_season_year),
          num(s.contract_year_number),
          yesNo(s.is_void_year),
          num(s.guaranteed_salary),
          num(s.non_guaranteed_salary),
          num(s.option_bonus),
          num(s.roster_bonus),
          num(s.prorated_signing_bonus),
          num(s.dead_cap_if_cut),
        ]);
      });
    });
  });

  const wsBids = XLSX.utils.aoa_to_sheet([XLSX_BID_HEADER].concat(bidRows));
  const wsSeasons = XLSX.utils.aoa_to_sheet([XLSX_SEASON_HEADER].concat(seasonRows));

  wsBids['!cols'] = widths([24, 9, 16, 9, 14, 11, 12, 11, 20, 11]);
  wsSeasons['!cols'] = widths([24, 16, 12, 14, 11, 18, 22, 14, 14, 22, 16]);

  // Autofilter on the header row. See the report for why freeze panes are
  // not set here.
  wsBids['!autofilter'] = { ref: 'A1:J' + (bidRows.length + 1) };
  wsSeasons['!autofilter'] = { ref: 'A1:K' + (seasonRows.length + 1) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsBids, 'Bids');
  XLSX.utils.book_append_sheet(wb, wsSeasons, 'Seasons');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const PDF_SEASON_HEAD = [
  'Season',
  'Yr',
  'Void',
  'Guaranteed',
  'Non-Gtd',
  'Option',
  'Roster',
  'Prorated SB',
  'Dead If Cut',
];

// Display formatting for the PDF only. CSV and XLSX carry raw view values.
// This adds separators; it never rounds or rescales.
function pdfMoney(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return '$' + n.toLocaleString('en-US');
}

async function buildPdf(players, tier) {
  const jspdfMod = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const JsPdf = jspdfMod.jsPDF || jspdfMod.default;
  const autoTable = autoTableMod.default || autoTableMod;

  const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  function ensureSpace(needed) {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(plain(tier.name) + ' - Results', margin, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    'Season ' + plain(tier.season_year) + '   Generated ' + formatDate(new Date().toISOString()),
    margin,
    y
  );
  y += 5;

  doc.setFontSize(8);
  doc.text(
    'Losing bidders are anonymous by rule 6.1(g). Anonymous labels restart at 1 for each',
    margin,
    y
  );
  y += 4;
  doc.text(
    'player, so the same label on two players is not the same team.',
    margin,
    y
  );
  y += 7;

  if (players.length === 0) {
    doc.setFontSize(10);
    doc.text('No bids were submitted in this tier.', margin, y);
    return Buffer.from(doc.output('arraybuffer'));
  }

  players.forEach(function (p) {
    // Keep a player heading with at least the start of its first bid rather
    // than stranding it at the foot of a page. autoTable owns pagination
    // inside a table; this only stops orphaned headings.
    ensureSpace(46);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(p.name + '  (' + p.position + ')', margin, y);
    y += 6;

    p.bids.forEach(function (b) {
      ensureSpace(26);

      const lengthText =
        plain(b.total_years) +
        ' yr' +
        (Number(b.void_years) > 0 ? ' +' + plain(b.void_years) + ' void' : '');

      const summary =
        b.bidderLabel +
        (b.is_winner ? '   [WINNER]' : '') +
        '   PPV ' +
        plain(b.total_ppv) +
        '   ' +
        lengthText +
        '   Signing bonus ' +
        pdfMoney(b.signing_bonus_total) +
        '   ' +
        plain(b.status);

      doc.setFont('helvetica', b.is_winner ? 'bold' : 'normal');
      doc.setFontSize(9);
      doc.text(summary, margin, y);
      y += 3;

      if (b.seasons.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        y += 3;
        doc.text('No season detail recorded for this bid.', margin + 3, y);
        y += 6;
        return;
      }

      const body = b.seasons.map(function (s) {
        return [
          plain(s.league_season_year),
          plain(s.contract_year_number),
          s.is_void_year ? 'void' : '',
          pdfMoney(s.guaranteed_salary),
          pdfMoney(s.non_guaranteed_salary),
          pdfMoney(s.option_bonus),
          pdfMoney(s.roster_bonus),
          pdfMoney(s.prorated_signing_bonus),
          pdfMoney(s.dead_cap_if_cut),
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [PDF_SEASON_HEAD],
        body: body,
        theme: 'grid',
        margin: { left: margin, right: margin },
        styles: { fontSize: 7, cellPadding: 1, overflow: 'linebreak' },
        headStyles: { fillColor: [235, 235, 235], textColor: 40, fontStyle: 'bold' },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right' },
          2: { halign: 'center' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
        },
      });

      y = doc.lastAutoTable.finalY + 6;
    });

    y += 2;
  });

  return Buffer.from(doc.output('arraybuffer'));
}

function textError(message, status) {
  return new NextResponse(message + '\n', {
    status: status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function GET(request, context) {
  const routeParams = await context.params;
  const tierId = routeParams.tierId;

  const url = new URL(request.url);
  const format = String(url.searchParams.get('format') || 'csv').toLowerCase();

  if (format !== 'csv' && format !== 'xlsx' && format !== 'pdf') {
    return textError('Unknown format. Use format=csv, format=xlsx or format=pdf.', 400);
  }

  const supabase = await createSupabaseServerClient();

  const { data: tier } = await supabase
    .from('auction_tiers')
    .select('id, name, season_year, verified_at')
    .eq('id', tierId)
    .maybeSingle();

  if (!tier) {
    return textError('No such tier.', 404);
  }

  // The views filter on verified_at themselves, so an unverified tier would
  // hand back an empty file that looks like a real one. Refuse instead.
  if (!tier.verified_at) {
    return textError(
      'Results for this tier are not published yet. Bids stay sealed until the ' +
        'commissioner has resolved any cap or cash issues and verified the results.',
      409
    );
  }

  let results = [];
  let years = [];
  try {
    const fetched = await Promise.all([
      fetchAllResults(supabase, tierId),
      fetchAllResultYears(supabase, tierId),
    ]);
    results = fetched[0];
    years = fetched[1];
  } catch (err) {
    return textError('Could not load results: ' + (err && err.message ? err.message : String(err)), 500);
  }

  const players = buildPlayers(results, years);

  const base = 'edfl-' + slugify(tier.name) + '-' + plain(tier.season_year) + '-results';

  let body;
  let mime;
  let ext;

  try {
    if (format === 'csv') {
      body = buildCsv(players);
      mime = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else if (format === 'xlsx') {
      body = await buildXlsx(players);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      ext = 'xlsx';
    } else {
      body = await buildPdf(players, tier);
      mime = 'application/pdf';
      ext = 'pdf';
    }
  } catch (err) {
    return textError(
      'Could not build the ' + format + ' export: ' + (err && err.message ? err.message : String(err)),
      500
    );
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'attachment; filename="' + base + '.' + ext + '"',
      'Cache-Control': 'no-store',
    },
  });
}
