// THE INJURY VOCABULARY, IN ONE PLACE.
//
// Sleeper's injury_status is a closed list of short codes. Three surfaces read
// it -- the pull that writes it, the table owners sort, and the CSV/XLSX/PDF
// export -- and SR-36 is the reason they all read it from here instead of each
// keeping their own map: when a vocabulary changes, the whole map gets
// reconciled by diff, not by eye. An unmapped code must be visible, never
// silently neutral, so unknown codes fall through to UNKNOWN_DESIGNATION below
// and are drawn with the raw code the feed sent.
//
// PUBLISHED LIST (Sleeper, as of September 2026):
//   IR   PUP   NA   DNR   Sus   Out   COV   Doubtful   Questionable   Probable
// Probable is legacy -- the NFL retired it in 2016 and Sleeper still emits it
// occasionally on old rows. It is mapped rather than dropped.
//
// DISPLAY ONLY. Commissioner ruling, September 8 2026: nothing in this module
// or downstream of it is an input to cap, roster, eligibility or compliance.
// SR-32. If that ever changes it changes by ruling, not by a helper quietly
// growing a new caller.

// severity: lower sorts first when the table is sorted "most serious first".
// It is a READING ORDER, not a league rule and not a probability.
export const DESIGNATIONS = {
  IR: { label: 'IR', full: 'Injured Reserve', severity: 10, tone: 'bad' },
  PUP: { label: 'PUP', full: 'Physically Unable to Perform', severity: 20, tone: 'bad' },
  NA: { label: 'NA', full: 'Not Active / roster exempt', severity: 30, tone: 'bad' },
  DNR: { label: 'DNR', full: 'Did Not Report', severity: 40, tone: 'bad' },
  Sus: { label: 'Sus', full: 'Suspended', severity: 50, tone: 'bad' },
  Out: { label: 'Out', full: 'Out', severity: 60, tone: 'bad' },
  COV: { label: 'COV', full: 'COVID list', severity: 65, tone: 'bad' },
  Doubtful: { label: 'Doubtful', full: 'Doubtful', severity: 70, tone: 'warn' },
  Questionable: { label: 'Questionable', full: 'Questionable', severity: 80, tone: 'warn' },
  Probable: { label: 'Probable', full: 'Probable (legacy)', severity: 90, tone: 'warn' },
};

export const UNKNOWN_DESIGNATION = { severity: 95, tone: 'warn' };

// Sorts after every real designation. Only a row in the seven-day cleared
// window can carry no injury_status at all.
export const CLEARED_SEVERITY = 999;

/**
 * The row's designation descriptor. Never returns null: an unrecognised code
 * comes back wearing its own raw text as the label, which is what makes a new
 * Sleeper code show up as itself on the page instead of vanishing.
 */
export function designationFor(code) {
  if (!code) return null;
  const known = DESIGNATIONS[code];
  if (known) return known;
  return {
    label: String(code),
    full: String(code) + ' (unrecognised code)',
    severity: UNKNOWN_DESIGNATION.severity,
    tone: UNKNOWN_DESIGNATION.tone,
  };
}

export function severityOf(code) {
  const d = designationFor(code);
  return d ? d.severity : CLEARED_SEVERITY;
}

export function designationLabel(code) {
  const d = designationFor(code);
  return d ? d.label : 'Cleared';
}

export const CHANGE_LABELS = {
  new: 'New',
  changed: 'Changed',
  cleared: 'Cleared',
};

export const ROSTER_SLOT_LABELS = {
  active: 'Active',
  taxi: 'Practice Squad',
  ir: 'IR',
};

export function rosterSlotLabel(slot) {
  if (!slot) return '';
  return ROSTER_SLOT_LABELS[slot] || slot;
}

// The columns, in order, shared by the on-screen table and all three exports so
// a downloaded file and the page can never disagree about what was shown.
//
// key       -- the field on a shaped row
// label     -- the header, on screen and in every export
// numeric   -- right-aligned on screen, and opens high-to-low when sorted
// sortKey   -- when sorting needs a different field than the one drawn
export const REPORT_COLUMNS = [
  { key: 'full_name', label: 'Player' },
  { key: 'position', label: 'Pos' },
  { key: 'nfl_team', label: 'NFL' },
  { key: 'designation', label: 'Status', sortKey: 'severity', numeric: true },
  { key: 'injury_body_part', label: 'Injury' },
  { key: 'edfl_team', label: 'EDFL Team' },
  { key: 'edfl_slot', label: 'Slot' },
  { key: 'change', label: 'Change' },
  { key: 'since', label: 'Since', sortKey: 'sinceSort' },
  { key: 'injury_notes', label: 'Note' },
];

function blank(v) {
  return v === null || v === undefined || v === '';
}

/**
 * Flattens a league_injury_report row into the shape the table sorts and the
 * exports write. Every display decision lives here so the three surfaces stay
 * identical by construction rather than by discipline.
 */
export function shapeRow(r) {
  const designation = designationLabel(r.injury_status);
  const d = designationFor(r.injury_status);
  return {
    player_id: r.player_id,
    full_name: r.full_name || '',
    position: r.position || '',
    nfl_team: r.nfl_team || '',
    nfl_roster_status: r.nfl_roster_status || '',
    injury_status: r.injury_status || '',
    designation: designation,
    designationFull: d ? d.full : 'Cleared',
    tone: d ? d.tone : 'good',
    severity: severityOf(r.injury_status),
    injury_body_part: r.injury_body_part || '',
    injury_notes: r.injury_notes || '',
    injury_start_date: r.injury_start_date || '',
    edfl_team: r.edfl_team || '',
    edfl_team_id: r.edfl_team_id || null,
    edfl_slot: rosterSlotLabel(r.edfl_roster_status),
    edfl_roster_status: r.edfl_roster_status || '',
    is_rostered: Boolean(r.is_rostered),
    change: r.change_flag ? CHANGE_LABELS[r.change_flag] || r.change_flag : '',
    change_flag: r.change_flag || '',
    prev_injury_status: r.prev_injury_status || '',
    // "Since" is the injury's own start date when Sleeper supplies one, and
    // otherwise the moment this designation changed. Two different meanings
    // sharing a column would be a lie, so the label says which one it is.
    since: r.injury_start_date ? r.injury_start_date : r.injury_changed_at || '',
    sinceIsStartDate: Boolean(r.injury_start_date),
    sinceSort: r.injury_start_date || r.injury_changed_at || '',
  };
}

/**
 * Null sorts LAST in both directions, so flipping a column never floats "no
 * value" to the top -- the FreeAgencyBoard rule, for the same reason. Ties
 * break on severity then name, which makes the order total: two renders of the
 * same data can never come out in a different order.
 */
export function compareRows(a, b, col, dir) {
  const key = col.sortKey || col.key;
  const av = a[key];
  const bv = b[key];
  if (blank(av) && blank(bv)) return tieBreak(a, b);
  if (blank(av)) return 1;
  if (blank(bv)) return -1;
  let c = col.numeric
    ? Number(av) - Number(bv)
    : String(av).localeCompare(String(bv));
  if (dir === 'desc') c = -c;
  return c !== 0 ? c : tieBreak(a, b);
}

function tieBreak(a, b) {
  if (a.severity !== b.severity) return a.severity - b.severity;
  return String(a.full_name).localeCompare(String(b.full_name));
}

/** The value each column contributes to a CSV cell or a spreadsheet cell. */
export function exportCell(row, key) {
  if (key === 'change') return row.change;
  if (key === 'since') return row.since;
  if (key === 'designation') return row.designation;
  const v = row[key];
  return blank(v) ? '' : String(v);
}
