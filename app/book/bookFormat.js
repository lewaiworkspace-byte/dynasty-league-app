// THE BOOK'S DISPLAY HELPERS -- UI test batch 24, November 15, 2026.
//
// Pure functions, no reads, usable on the server and in the browser. Nothing here
// DECIDES a bet: book_place_bet (test database, migrations book_02, book_06 and
// book_07) is the only judge of a stake, a price, a lock, Pete's Picks or a limit,
// and its answer is what the owner sees. Three things are mirrored here so the slip
// can warn before the owner presses (CLAUDE.md: a form may mirror a rule to warn
// early; when the two disagree the database is right):
//   - toWin(): book_profit(stake, odds), floored to the cent;
//   - maxStakeFor(): the stake whose win is exactly a given cap (the $75 single cap,
//     or the House's room), floored to the cent, as book_place_bet computes it;
//   - petesPicksAllows(): which of the ten buttons in your own matchup you may take.
// Every figure is worked in whole cents so a float never decides a cent.

export const MARKETS = ['spread', 'moneyline', 'total', 'home_total', 'away_total'];

function cents(n) {
  const v = Number(n);
  if (!isFinite(v)) return null;
  return Math.round(v * 100);
}

// "−110", "+150". The minus is the typographic one, as on the boards.
export function priceText(odds) {
  const o = Number(odds);
  if (!isFinite(o) || o === 0) return '—';
  return o > 0 ? '+' + o : '−' + Math.abs(o);
}

// A spread or a total as the boards print it: "−6.5", "+6.5", "376.5".
export function lineText(v, signed) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  const s = Math.abs(n).toFixed(1).replace(/\.0$/, '');
  if (!signed) return s;
  if (n === 0) return 'PK';
  return (n > 0 ? '+' : '−') + s;
}

// book_profit(stake, odds): floor(stake * 100 / -odds) or floor(stake * odds / 100), to the cent.
export function toWin(stake, odds) {
  const c = cents(stake);
  const o = Number(odds);
  if (c === null || c <= 0 || !isFinite(o) || o === 0) return 0;
  const w = o < 0 ? Math.floor((c * 100) / -o) : Math.floor((c * o) / 100);
  return w / 100;
}

// The largest stake whose win does not pass `cap` (book_place_bet's max_stake hint).
export function maxStakeFor(cap, odds) {
  const c = cents(cap);
  const o = Number(odds);
  if (c === null || c <= 0 || !isFinite(o) || o === 0) return 0;
  const s = o < 0 ? Math.floor((c * -o) / 100) : Math.floor((c * 100) / o);
  return s / 100;
}

// The smallest of several limits, ignoring the ones that are null (no limit).
export function smallest(list) {
  let best = null;
  list.forEach(function (v) {
    if (v === null || v === undefined) return;
    const n = Number(v);
    if (!isFinite(n)) return;
    if (best === null || n < best) best = n;
  });
  return best === null ? null : Math.max(best, 0);
}

// Pete's Picks (BT-6/8/24/31/42): in your own matchup you may back your team to win
// or cover, the over on your points and the over on the total. Mirrors book_place_bet.
export function petesPicksAllows(m, mySide, market, side) {
  if (!mySide) return true;
  if (market === 'spread' || market === 'moneyline') return side === mySide;
  if (market === 'total') return side === 'over';
  if (market === 'home_total') return mySide === 'home' && side === 'over';
  if (market === 'away_total') return mySide === 'away' && side === 'over';
  return false;
}

// Which side of the matchup the owner is, or null.
export function mySideOf(m, myTeamId) {
  if (!myTeamId || !m) return null;
  if (m.home && m.home.team_id === myTeamId) return 'home';
  if (m.away && m.away.team_id === myTeamId) return 'away';
  return null;
}

// Is this market locked? Spread, money and total lock at the first kickoff of either
// side; a team's points lock at that team's first kickoff (book_place_bet's v_lock).
export function marketLocked(m, market) {
  if (!m || !m.home || !m.away) return true;
  if (market === 'home_total') return Boolean(m.home.locked);
  if (market === 'away_total') return Boolean(m.away.locked);
  return Boolean(m.home.locked || m.away.locked);
}

export function marketLockAt(m, market) {
  if (!m) return null;
  if (market === 'home_total') return m.home.lock_at;
  if (market === 'away_total') return m.away.lock_at;
  return m.lock_at;
}

// One button's face: what it says and its price.
export function pickFace(m, market, side) {
  const h = m.home;
  const a = m.away;
  if (market === 'spread') {
    const t = side === 'home' ? h : a;
    return { label: t.abbrev + ' ' + lineText(t.spread, true), odds: m.juice, line: t.spread, team: t };
  }
  if (market === 'moneyline') {
    const t = side === 'home' ? h : a;
    return { label: t.abbrev, odds: t.ml, line: null, team: t };
  }
  const val = market === 'total' ? m.total : market === 'home_total' ? h.team_total : a.team_total;
  const team = market === 'home_total' ? h : market === 'away_total' ? a : null;
  return { label: (side === 'over' ? 'Over ' : 'Under ') + lineText(val, false), odds: m.juice, line: val, team: team };
}

export function marketName(market, m) {
  if (market === 'spread') return 'Spread';
  if (market === 'moneyline') return 'Money';
  if (market === 'total') return 'Total';
  if (market === 'home_total') return (m ? m.home.abbrev : 'Home') + ' pts';
  if (market === 'away_total') return (m ? m.away.abbrev : 'Away') + ' pts';
  return market;
}

// A held bet's one-line name: "AWF −14.5 spread", "COC to win", "Over 376.5 total",
// and for a player leg (batch 25) "Josh Allen over 24.5 pts".
export function legName(leg, teamsById) {
  if (leg && leg.kind === 'prop') {
    return { what: shortName(leg.player_name) + ' ' + leg.side + ' ' + lineText(leg.line_value, false) + ' ' + propShort(leg.market), kind: propLabel(leg.market).toLowerCase() };
  }
  const t = leg.pick_team_id && teamsById[leg.pick_team_id] ? teamsById[leg.pick_team_id] : null;
  const ab = t ? t.abbrev : '';
  if (leg.market === 'spread') return { what: ab + ' ' + lineText(leg.line_value, true), kind: 'spread' };
  if (leg.market === 'moneyline') return { what: ab + ' to win', kind: 'money' };
  if (leg.market === 'total') return { what: (leg.side === 'over' ? 'Over ' : 'Under ') + lineText(leg.line_value, false), kind: 'total' };
  return { what: ab + ' ' + leg.side + ' ' + lineText(leg.line_value, false), kind: 'team points' };
}

// The two teams of a held bet: "Awful Lot vs D’Ats What She Said"; a player leg
// names his position and NFL team: "WR · DET".
export function legGame(leg, teamsById) {
  if (leg && leg.kind === 'prop') return (leg.position || '') + ' · ' + (leg.nfl_team || '');
  const h = teamsById[leg.home_team_id];
  const a = teamsById[leg.away_team_id];
  return (h ? h.name : '?') + ' vs ' + (a ? a.name : '?');
}

// The win-chance bar: "57 in 100" from the fair probability the line was priced from.
export function inHundred(p) {
  const n = Number(p);
  if (!isFinite(n)) return '—';
  return Math.round(n * 100) + ' in 100';
}

// The status chip of a matchup card.
export function cardState(m, nowMs) {
  const hl = Boolean(m.home && m.home.locked);
  const al = Boolean(m.away && m.away.locked);
  if (hl && al) return 'locked';
  if (hl || al) return 'mostly';
  const t = m.lock_at ? new Date(m.lock_at).getTime() : null;
  if (t !== null && t - nowMs < 3600 * 1000) return 'soon';
  return 'open';
}

// The tax curve (BT-20/33), drawn from the formula the database uses
// (book_tax_kept_total): kept = scale x (1 - e^(-profit / k)). Display only: the
// cash-out preview (book_cash_out_preview) is what an owner is told he will get.
export function taxKept(profit, scale, k) {
  const p = Number(profit);
  const s = Number(scale);
  const kk = Number(k);
  if (!isFinite(p) || !isFinite(s) || !isFinite(kk) || kk <= 0 || p <= 0) return 0;
  return Math.floor(s * (1 - Math.exp(-p / kk)) * 100) / 100;
}

// The refusal codes book_place_bet, book_deposit and book_cash_out return, as the
// owner reads them. The database returns codes and figures, not sentences.
export function refusalText(r, fmt) {
  const reason = r && r.reason;
  const m = function (v) {
    return fmt(v);
  };
  switch (reason) {
    case 'no_team':
      return 'Your login is not linked to a team, so it can watch the Book but not bet.';
    case 'no_line':
    case 'line_moved':
      return 'The line moved. The board has the new price; check it and try again.';
    case 'book_closed':
      return 'EDFL Bets is closed for the season.';
    case 'week_not_open':
      return 'This week’s market isn’t open yet. Its lines post Tuesday at 12:00 AM.';
    case 'not_offered':
      return 'There is no moneyline on a game this lopsided.';
    case 'bad_market':
      return 'That bet isn’t on the board.';
    case 'locked':
      return 'That bet locked at the first kickoff of a player whose points decide it.';
    case 'pete_rose':
      if (r.detail === 'own_player') return 'Pete’s Picks: on your own players you can only take the over.';
      return 'Pete’s Picks: in your own matchup you can only back your team and the overs.' + (r.leg && Number(r.leg) > 1 ? ' (leg ' + r.leg + ')' : '');
    case 'weekly_limit':
      return 'Over this week’s limit. You have ' + m(r.left) + ' left to stake this week.';
    case 'bad_stake':
    case 'bad_amount':
      return 'Enter an amount in dollars and cents.';
    case 'max_win':
      if (Number(r.legs) > 1) return 'A ' + r.legs + '-leg parlay can win at most ' + m(r.max_win) + '. The most you can stake on this one is ' + m(r.max_stake) + '.';
      return 'One bet can win at most ' + m(r.max_win) + '. The most you can stake on this one is ' + m(r.max_stake) + '.';
    case 'reserve_limit':
      return 'The Longshot Reserve can’t cover that. The most it can take on this parlay is ' + m(r.max_stake) + '.';
    case 'same_game':
      return 'A parlay takes one bet per game. Leg ' + r.leg + ' is a second bet on the same game.';
    case 'same_player':
      return 'A parlay takes one bet per player. Leg ' + r.leg + ' is a second bet on the same player.';
    case 'feeds_leg':
      return 'Leg ' + r.leg + ' can’t join: that player’s points feed a game line already in the parlay.';
    case 'too_many_legs':
      return 'A parlay has at most 5 legs.';
    case 'no_legs':
      return 'Add a bet first.';
    case 'mixed_weeks':
      return 'A parlay holds bets from one week only.';
    case 'not_active':
      return 'That player is no longer on an active roster, so his bets are off the board.';
    case 'insufficient_balance':
      return 'That’s more than the free balance in your betting account.';
    case 'house_limit':
      return 'The House can’t cover that. The most it can take on this bet is ' + m(r.max_stake) + '.';
    case 'insufficient_owner_cash':
      return 'That’s more Owner Cash than you have available.';
    case 'over_cap':
      return 'That would put you over your season limit.';
    case 'cashout_cap':
      return 'That’s more than your in-season cash-out allowance has left.';
    default:
      return 'EDFL Bets refused that' + (reason ? ' (' + reason + ')' : '') + '.';
  }
}

// ---------------------------------------------------------------- Phase 2 (UI test batch 25)
//
// Player bets and parlays. As above, nothing here decides: book_place_ticket (test
// database, migration book_09_phase2_engine) judges every leg, the price, the cap,
// the limit and who backs it. Two more things are MIRRORED so the board can grey a
// price and the parlay slip can show its figures before the owner presses:
//   - parlayToWin(): stake × (product of the legs' decimal prices − 1), floored to
//     the cent, as book_place_ticket computes it;
//   - legBlock(): why a price can't join the parlay in the tray ("Full", "1 per
//     game", "1 per player", "Feeds a leg", "Your player", "Your game", "Locked").
// When either disagrees with the database, the database is right.

const PROP_LABEL = {
  points: 'Fantasy points',
  pass_yd: 'Passing yards',
  rush_yd: 'Rushing yards',
  rec_yd: 'Receiving yards',
  total_yd: 'Total yards',
  rec: 'Receptions',
  pass_td: 'Passing TDs',
  rush_td: 'Rushing TDs',
  rec_td: 'Receiving TDs',
  total_td: 'Total TDs',
  fg50: 'Field goals of 50+ yards',
};
const PROP_SHORT = {
  points: 'pts',
  pass_yd: 'pass yds',
  rush_yd: 'rush yds',
  rec_yd: 'rec yds',
  total_yd: 'total yds',
  rec: 'catches',
  pass_td: 'pass TDs',
  rush_td: 'rush TDs',
  rec_td: 'rec TDs',
  total_td: 'TDs',
  fg50: 'FGs 50+',
};
// The player sheet's order.
export const PROP_ORDER = ['points', 'pass_yd', 'rush_yd', 'rec_yd', 'total_yd', 'rec', 'pass_td', 'rush_td', 'rec_td', 'total_td', 'fg50'];

export function propLabel(market) {
  return PROP_LABEL[market] || market;
}

export function propShort(market) {
  return PROP_SHORT[market] || market;
}

// "Josh Allen" stays; a long name keeps its last word: "Amon-Ra St. Brown" → "St. Brown".
export function shortName(full) {
  const s = String(full || '').trim();
  if (s.length <= 16) return s;
  const parts = s.split(' ');
  return parts.length > 2 ? parts.slice(-2).join(' ') : parts[parts.length - 1];
}

// The stat chips (Points · Yards · TDs · Catches · Kicks) and the market each
// shows for a position: Yards is QB passing, RB total, WR and TE receiving; TDs is
// QB passing and total TDs for everyone else (Phase 2 handoff §3).
export const STAT_CHIPS = [
  { key: 'points', label: 'Points' },
  { key: 'yards', label: 'Yards' },
  { key: 'tds', label: 'TDs' },
  { key: 'catches', label: 'Catches' },
  { key: 'kicks', label: 'Kicks' },
];

export function chipMarket(chip, pos) {
  if (chip === 'points') return 'points';
  if (chip === 'yards') return pos === 'QB' ? 'pass_yd' : pos === 'RB' ? 'total_yd' : pos === 'WR' || pos === 'TE' ? 'rec_yd' : null;
  if (chip === 'tds') return pos === 'QB' ? 'pass_td' : pos === 'K' ? null : 'total_td';
  if (chip === 'catches') return pos === 'RB' || pos === 'WR' || pos === 'TE' ? 'rec' : null;
  if (chip === 'kicks') return pos === 'K' ? 'fg50' : null;
  return null;
}

// A price as a multiplier: −110 → 1.909…, +150 → 2.5.
export function decimalOf(odds) {
  const o = Number(odds);
  if (!isFinite(o) || o === 0) return null;
  return o < 0 ? 1 + 100 / -o : 1 + o / 100;
}

// book_american_from_decimal: the combined price of a parlay.
export function americanOf(dec) {
  const d = Number(dec);
  if (!isFinite(d) || d <= 1) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1));
}

export function parlayDecimal(legs) {
  let d = 1;
  (legs || []).forEach(function (l) {
    const x = decimalOf(l.odds);
    if (x) d *= x;
  });
  return d;
}

// stake × (combined − 1), floored to the cent. One leg uses toWin() exactly.
export function parlayToWin(stake, legs) {
  if (!legs || !legs.length) return 0;
  if (legs.length === 1) return toWin(stake, legs[0].odds);
  const c = cents(stake);
  if (c === null || c <= 0) return 0;
  const d = parlayDecimal(legs);
  return Math.floor(c * (d - 1) + 1e-6) / 100;
}

// The largest stake whose parlay win does not pass `cap`.
export function parlayMaxStake(cap, legs) {
  if (!legs || !legs.length) return 0;
  if (legs.length === 1) return maxStakeFor(cap, legs[0].odds);
  const c = cents(cap);
  if (c === null || c <= 0) return 0;
  const d = parlayDecimal(legs);
  return Math.floor(c / (d - 1) + 1e-6) / 100;
}

// The cap for a ticket of n legs before the playoffs: $75 for one, then the
// parlay ladder (rules.max_win_parlay). null in the playoffs.
export function capFor(n, rules, playoffs) {
  if (playoffs) return null;
  if (n <= 1) return Number(rules.max_win_single);
  const v = (rules.max_win_parlay || {})[String(n)];
  return v === undefined ? null : Number(v);
}

// Why `cand` can't join `legs` (the tray), or null. Mirrors book_place_ticket's
// correlation and Pete's Picks checks (addendum 13 v2, BT-31/57, BT-68).
export function legBlock(cand, legs) {
  if (!cand) return null;
  if (cand.locked) return 'Locked';
  if (cand.kind === 'prop' && cand.own_player && cand.side === 'under') return 'Your player';
  if (cand.kind === 'game' && cand.pete) return 'Your game';
  const list = legs || [];
  if (list.some(function (l) { return l.key === cand.key; })) return null; // already in: tapping removes it
  if (list.length >= 5) return 'Full';
  for (let i = 0; i < list.length; i += 1) {
    const l = list[i];
    if (cand.kind === 'game' && l.kind === 'game' && l.matchup_id === cand.matchup_id) return '1 per game';
    if (cand.kind === 'prop' && l.kind === 'prop' && l.player_id === cand.player_id) return '1 per player';
    const g = cand.kind === 'game' ? cand : l.kind === 'game' ? l : null;
    const p = cand.kind === 'prop' ? cand : l.kind === 'prop' ? l : null;
    if (g && p && g !== p && p.team_id && feeds(p.team_id, g)) return 'Feeds a leg';
  }
  return null;
}

function feeds(teamId, g) {
  if (g.market === 'spread' || g.market === 'moneyline' || g.market === 'total') return teamId === g.home_team_id || teamId === g.away_team_id;
  if (g.market === 'home_total') return teamId === g.home_team_id;
  if (g.market === 'away_total') return teamId === g.away_team_id;
  return false;
}

// The plain-language reason behind a block, for the tap-for-the-reason card.
export function blockWhy(code) {
  switch (code) {
    case 'Locked':
      return 'Its game has kicked off. A leg can only join a parlay before its game starts.';
    case 'Your player':
      return 'Pete’s Picks: on your own players you can only take the over.';
    case 'Your game':
      return 'Pete’s Picks: in your own matchup you can only back your team and the overs.';
    case 'Full':
      return 'A parlay has at most 5 legs. Remove one to add this.';
    case '1 per game':
      return 'A parlay takes one bet per game, and this game is already in it.';
    case '1 per player':
      return 'A parlay takes one bet per player, and this player is already in it.';
    case 'Feeds a leg':
      return 'This player’s points feed a game line already in the parlay, so the two can’t ride together.';
    default:
      return '';
  }
}
