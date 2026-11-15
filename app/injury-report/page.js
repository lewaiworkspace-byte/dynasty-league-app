import { redirect } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentViewer } from '../../lib/getCurrentTeamOwner';
import { formatDateTime, easternDateKey } from '../../lib/formatDate';
import Breadcrumbs from '../../components/Breadcrumbs';
import InjuryReportView from './InjuryReportView';
import { shapeInjury, returnBuckets, teamSummaries } from './injuryModel';

export const revalidate = 0;
export const metadata = { title: 'Injury Report' };

/**
 * THE INJURY REPORT -- redrawn November 15, 2026 (UI test batch 19).
 *
 * Lewis's canvas "EDFL Injury Report (League Office)" and his comments on it:
 * the League page's Injury Report box, opened up into one page with three
 * views -- League View, Team View (the default, one team at a time) and Return
 * View -- with more ways to sort and filter. Its door is League Office (a tile
 * there) and the League page's box. injuries.md carries the decisions that
 * protect this folder.
 *
 * WHO READS WHAT.
 *   - league_injury_report and player_injury_prognosis are granted to
 *     authenticated only: the SESSION client, or they return nothing and the
 *     page reads "nobody is hurt" (injuries.md).
 *   - edfl_player_season_stats, league_weeks, teams and league_config are
 *     public reads, read as anon like the League page.
 *
 * HOW EACH READ FAILS. The report IS the page: it fails closed, an error and
 * no lists. Points, the prognosis and the weeks only decorate it: each fails
 * on its own with a line saying what is missing, and the lists stay.
 *
 * THE CLOCK is read once, here, and every date label is made on the server
 * (injuryModel.js), so the client view formats nothing.
 */

const READ_PAGE_SIZE = 1000; // PostgREST's default row ceiling
const ID_CHUNK = 150; // ids per .in() read, to keep each request URL short

// SR-29: page until exhausted on a unique order. A Sunday in December with
// the seven-day cleared window full is not a normal week, and an injury report
// that silently stops at the letter M is worse than one that fails to load.
async function fetchAllReportRows(sb) {
  let from = 0;
  let all = [];
  for (;;) {
    const { data, error } = await sb
      .from('league_injury_report')
      .select(
        'player_id, full_name, position, nfl_team, injury_status, injury_body_part,' +
          ' prev_injury_status, injury_changed_at, edfl_team_id, edfl_team, edfl_roster_status,' +
          ' is_rostered, change_flag'
      )
      .order('player_id')
      .range(from, from + READ_PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < READ_PAGE_SIZE) break;
    from += READ_PAGE_SIZE;
  }
  return all;
}

// Reads `columns` for every id, ID_CHUNK at a time. Returns { byId, error }:
// the first failed chunk is the error, and a partial result is not returned
// as if it were whole.
async function readByIds(ids, read) {
  const byId = {};
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await read(ids.slice(i, i + ID_CHUNK));
    if (error) return { byId: {}, error: error };
    (data || []).forEach(function (row) {
      byId[row.player_id] = row;
    });
  }
  return { byId: byId, error: null };
}

function one(v) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function InjuryReportPage({ searchParams }) {
  // READ-ONLY OBSERVER (October 6, 2026): an observer login may read this page
  // as well as an owner. getCurrentViewer() is the gate; nothing here writes.
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/injury-report');
  const myTeamId = viewer.owner && viewer.owner.team_id ? viewer.owner.team_id : null;

  const sb = await createSupabaseServerClient();
  const nowMs = Date.now();
  const todayKey = easternDateKey(nowMs);

  const [{ data: config }, teamsRes, lastRunRes] = await Promise.all([
    supabase.from('league_config').select('current_season_year').eq('id', true).single(),
    supabase.from('teams').select('id, abbrev, name').order('name', { ascending: true }),
    // THE AS-OF LINE, AND THE ONLY PLACE IT COMES FROM: completed_at on the
    // newest completed pull -- when the data landed, never "now".
    sb
      .from('injury_sync_runs')
      .select('completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const season = config?.current_season_year || 2026;

  let raw = [];
  let loadError = null;
  try {
    raw = await fetchAllReportRows(sb);
  } catch (err) {
    loadError = err && err.message ? err.message : String(err);
  }

  const ids = raw.map(function (r) { return r.player_id; }).filter(Boolean);
  const hurtIds = raw
    .filter(function (r) { return r.injury_status; })
    .map(function (r) { return r.player_id; })
    .filter(Boolean);

  const [statsRes, progRes, weeksRes] = await Promise.all([
    readByIds(ids, function (chunk) {
      return supabase
        .from('edfl_player_season_stats')
        .select('player_id, fantasy_points, games, fppg')
        .eq('season_year', season)
        .in('player_id', chunk);
    }),
    readByIds(hurtIds, function (chunk) {
      return sb
        .from('player_injury_prognosis')
        .select('player_id, agent_est_return_text, agent_est_return_date, espn_est_return_date')
        .in('player_id', chunk);
    }),
    supabase
      .from('league_weeks')
      .select('week_number, last_game_at')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
  ]);

  const teams = (teamsRes.data || []).map(function (t) {
    return { id: t.id, abbrev: t.abbrev || '', name: t.name || '' };
  });
  const abbrevById = {};
  teams.forEach(function (t) {
    abbrevById[t.id] = t.abbrev;
  });

  const buckets = returnBuckets(weeksRes.data || [], easternDateKey, todayKey, season);
  const ctx = {
    abbrevById: abbrevById,
    buckets: buckets,
    todayKey: todayKey,
    progLoaded: !progRes.error,
  };
  const rows = raw.map(function (r) {
    return shapeInjury(r, statsRes.byId[r.player_id], progRes.byId[r.player_id], ctx);
  });
  const teamSums = teamSummaries(rows, teams);

  const sp = searchParams || {};
  const viewParam = String(one(sp.view) || '');
  const initialView = ['league', 'team', 'return'].indexOf(viewParam) >= 0 ? viewParam : 'team';
  const teamParam = String(one(sp.team) || '').toUpperCase();
  const pickedTeam = teams.find(function (t) { return t.abbrev === teamParam; });
  const initialTeamId = pickedTeam ? pickedTeam.id : myTeamId || (teams[0] ? teams[0].id : null);

  const lastRun = lastRunRes.data;
  const asOf = lastRun && lastRun.completed_at ? formatDateTime(lastRun.completed_at) : null;

  return (
    <main className="page irv-page">
      <Breadcrumbs trail={[{ label: 'League Office', href: '/office' }, { label: 'Injury Report' }]} />
      <h1 className="it-visually-hidden">Injury Report</h1>

      {loadError ? (
        <p className="form-error">
          Couldn&apos;t load the injury report: {loadError}. Nothing below is answering the
          question &mdash; do not read it as an empty report.
        </p>
      ) : (
        <InjuryReportView
          rows={rows}
          teams={teams}
          teamSums={teamSums}
          buckets={buckets}
          season={season}
          myTeamId={myTeamId}
          initialView={initialView}
          initialTeamId={initialTeamId}
          asOf={asOf}
          teamsError={teamsRes.error ? teamsRes.error.message : null}
          statsError={statsRes.error ? statsRes.error.message : null}
          progError={progRes.error ? progRes.error.message : null}
          weeksError={weeksRes.error ? weeksRes.error.message : null}
        />
      )}
    </main>
  );
}
