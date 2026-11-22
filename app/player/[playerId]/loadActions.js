// THE CARD'S ACTION READS -- UI test batch 32, November 21, 2026.
//
// Lewis's canvas "EDFL Player Cards (test site): Mini and Full": an Actions box
// on the Mini card, and on both cards a four-button Actions box (Watch, Trade,
// Poach, Claim) when the player belongs to another owner. This file reads what
// the buttons need, and DECIDES NOTHING: whether Poach or Claim is open is the
// Players screen's own column (`action`, `placement_id`, `poach_floor_ppv` of
// edfl_players_rows_v3, the one body behind the Players and Watchlist tabs,
// SR-70); whether he is on the viewer's watchlist is edfl_watchlist_ids();
// his trade-block icon is a column of edfl_team_roster_trade_icons(team).
//
// A failed read is returned as an `error` string and the card draws the button
// greyed with the error in its explanation: never a button that looks fine
// (L14). All three reads run on the session client (they find the viewer's team
// through auth.uid()).

export async function loadCardActions(supabase, opts) {
  const playerId = opts.playerId;
  const season = opts.season;
  const holderTeamId = opts.holderTeamId || null;
  const isMine = Boolean(opts.isMine);
  const needRow = !isMine && Boolean(opts.hasTeam);

  const [rowRes, watchRes, iconRes] = await Promise.all([
    needRow
      ? supabase.rpc('edfl_players_rows_v3', {
          p_season: season,
          p_view: 'all',
          p_ids: [playerId],
          p_limit: 1,
          p_offset: 0,
        })
      : Promise.resolve({ data: [], error: null }),
    needRow ? supabase.rpc('edfl_watchlist_ids') : Promise.resolve({ data: [], error: null }),
    holderTeamId
      ? supabase.rpc('edfl_team_roster_trade_icons', { p_team_id: holderTeamId })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const row = rowRes.data && rowRes.data[0] ? rowRes.data[0] : null;
  const watched = (watchRes.data || []).map(function (x) {
    return typeof x === 'string' ? x : x && (x.edfl_watchlist_ids || x.player_id);
  });
  const icon = (iconRes.data || []).find(function (r) {
    return r.player_id === playerId;
  });

  return {
    row: row,
    watching: watched.indexOf(playerId) >= 0,
    tradeIcon: icon ? icon.trade_icon : null,
    tradeContractId: icon ? icon.contract_id : row ? row.contract_id : null,
    error: rowRes.error
      ? rowRes.error.message
      : watchRes.error
      ? watchRes.error.message
      : iconRes.error
      ? iconRes.error.message
      : null,
  };
}
