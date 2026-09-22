'use server';

import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../lib/getCurrentTeamOwner';

// POACHING (rule 5.17) -- the screen's read, and nothing else.
//
// THERE IS NO SUBMIT IN THIS FILE, DELIBERATELY. A poach bid is an ordinary
// submit_fa_offer call and that action lives in app/free-agency/actions.js,
// where the RPC's one caller belongs. CLAUDE.md: "Poaching is free agency on a
// practice squad player, not a separate system... Do not add a poach flag to
// the offer or a second RPC." A second Server Action wrapping the same RPC
// would be that second RPC one layer down, and the two would drift the first
// time the payload changed. components/OfferForm.js imports the real one.
//
// THERE IS NO OFFICER CONTROL HERE EITHER. R-1 puts Preview and Resolve on the
// board that holds the offers, and a poach window is on /free-agency's board
// with every other live window. This screen answers a different question --
// who is exposed, and what would it take -- and draws no window card.
//
// WHETHER POACHING IS OPEN IS THE DATABASE'S, TWICE OVER. poachable_players
// carries its own poaching_open flag (the calendar test, evaluated in the
// view), and the 5.17 calendar row below carries is_past, evaluated at query
// time. Neither is a clock in JavaScript, and the screen fails closed: a
// missing row or a failed read reads as shut.
//
// WHAT THIS SCREEN SHOWS WHILE POACHING IS SHUT. The whole exposure list, with
// a closed-state card above it saying when it opens. That is the approved
// artboard, and it is not a widening: poachable_players is granted to
// authenticated and to nothing else, so every signed-in owner can already read
// every row of it through PostgREST whether or not a page draws it. What
// changes is that an owner can now see his own exposure BEFORE the window
// opens, which is the only moment the information is worth anything to him.
//
// Every function returns { ok, ... } and never throws.

function refusal() {
  return { ok: false, message: 'Sign in as a team owner to use poaching.' };
}

export async function loadPoachingState() {
  const me = await getCurrentTeamOwner();
  if (!me) return refusal();

  const supabase = await createSupabaseServerClient();

  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;

  // RULE 5.17. Every practice squad contract in the league, from
  // poachable_players (authenticated only, never anon). One row per contract:
  // the rookie bar, this season's cash (the PO-17 floor), whether a poach
  // window is already live on him, and the two exclusions -- on waivers, or
  // designated to be cut -- and, since September 21 2026, the two rule 5.17(l)-(m)
  // exclusions: poach_exempt (his team has exempted him; shown to the league by
  // ruling) and poachable_from (he was on the active roster inside the last 24
  // hours and is not poachable until that instant). None of them is a gate:
  // submit_fa_offer re-tests all of it through edfl_poach_eligible on every bid. At most ten squads of nine,
  // so the ceiling is not a concern; ordered for a stable render.
  const { data: squads, error: squadErr } = await supabase
    .from('poachable_players')
    .select(
      'contract_id, player_id, player_name, position, nfl_team, team_id, team_name,' +
        ' contract_type, bar_ppv, season_cash, live_window_id, on_waivers, pending_cut,' +
        ' poaching_open, poach_exempt, poachable_from'
    )
    .order('team_name', { ascending: true })
    .order('player_name', { ascending: true })
    .limit(500);
  if (squadErr) return { ok: false, message: squadErr.message };

  // THE 5.17 WINDOW ITSELF, from the calendar view for its is_past -- a boolean
  // the database evaluates at query time. starts_at and ends_at are returned
  // for the wording and for the countdown; the decision of whether the market
  // is open is never taken from them in JavaScript.
  //
  // Dated rules are calendar rows, not constants (CLAUDE.md): moving poaching
  // is an UPDATE to this one row, and this screen follows it without a code
  // change.
  const { data: ruleRow } = await supabase
    .from('league_calendar')
    .select('starts_at, ends_at, is_past, title')
    .eq('season_year', season)
    .eq('rule_ref', '5.17')
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Live poach windows only. The board view returns opened_by null while a
  // window is open, which is the sealed-opener rule, and this screen never
  // asks for it another way -- it only needs to know THAT a window is live on
  // a player, which poachable_players.live_window_id already says. The board
  // read is here for closes_at, so the row can carry a countdown.
  const { data: windows, error: winErr } = await supabase
    .from('free_agent_window_board')
    .select('window_id, player_id, closes_at, status, is_contested, retain_bar_ppv')
    .eq('season_year', season)
    .eq('window_kind', 'poach')
    .in('status', ['open', 'closed'])
    .order('closes_at', { ascending: true });
  if (winErr) return { ok: false, message: winErr.message };

  // RLS shows an owner only their own team's offers while a window is live.
  // Used for the IN marker on a row this owner has already bid on.
  const { data: mine, error: mineErr } = await supabase
    .from('free_agent_offers')
    .select('id, window_id, player_id, offer_kind, total_years, status, submitted_at')
    .eq('team_id', me.team_id)
    .order('submitted_at', { ascending: false })
    .limit(200);
  if (mineErr) return { ok: false, message: mineErr.message };

  // PPV weights from their table, never hardcoded (CLAUDE.md) -- the shared
  // offer form's running total needs them here exactly as it does on
  // /free-agency.
  const { data: weightRows } = await supabase
    .from('ppv_weight_table')
    .select('contract_year_number, guaranteed_weight, non_guaranteed_weight, roster_bonus_weight, option_bonus_weight')
    .order('contract_year_number', { ascending: true });

  return {
    ok: true,
    data: {
      season: season,
      squads: squads || [],
      // The view's own flag, not the calendar comparison and not a clock. Both
      // are the database's; this is the one the bid is tested against.
      poachingOpen: (squads || []).some(function (r) { return r.poaching_open === true; }),
      opensAt: ruleRow?.starts_at || null,
      closesAt: ruleRow?.ends_at || null,
      // is_past on the 5.17 row means "the market has opened". The polarity
      // belongs at the call site and not in a helper (CLAUDE.md), which is why
      // it is named here rather than passed on as is_past.
      windowHasOpened: ruleRow?.is_past === true,
      windows: windows || [],
      myOffers: mine || [],
      weightRows: weightRows || [],
      wireLive: (await supabase.rpc('edfl_wire_live')).data === true,
      teamId: me.team_id,
    },
  };
}
