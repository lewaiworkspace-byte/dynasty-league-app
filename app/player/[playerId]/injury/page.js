import { redirect } from 'next/navigation';
import { getCurrentViewer } from '../../../../lib/getCurrentTeamOwner';
import { createSupabaseServerClient } from '../../../../lib/supabaseServerClient';
import { formatDate } from '../../../../lib/formatDate';
import { RosterFace } from '../../../team/[teamId]/RosterList';
import InjuryCross from '../../../../components/InjuryCross';

export const revalidate = 0;

// THE INJURY REPORT -- UI test batch 10, November 11, 2026.
//
// Lewis on the Roster canvas: "Can we link it to an injury report that gives
// the nature of the injury, prognosis, and last 4 or 5 weeks of injury status.
// This would be a pop up if you click on the Red Cross and Designation." It
// opens in the pop-up sheet from the white pill on a roster row.
//
// THE READS: league_injury_report (the injury authority's current designation,
// body part, notes and when it last changed, and the NFL roster status, the
// view the /injury-report page reads) and edfl_player_injury_weeks() (the last
// five league weeks of the NFL's official status, from nflverse's weekly injury
// report and weekly rosters, labelled in the database: IR, PUP, NFI, RES, O, D,
// Q). PROGNOSIS has no source yet: the line says so (the source is a ruling,
// in its own chat), and nothing is guessed. A failed read says so.

const WEEK_CLASS = { IR: 'is-bad', PUP: 'is-bad', NFI: 'is-bad', RES: 'is-bad', O: 'is-bad', D: 'is-bad', Q: 'is-q' };

export default async function InjuryReportPage({ params }) {
  const { playerId } = params;
  const viewer = await getCurrentViewer();
  if (!viewer.owner && !viewer.observer) redirect('/login?next=/player/' + playerId + '/injury');

  const supabase = await createSupabaseServerClient();
  const { data: config } = await supabase
    .from('league_config')
    .select('current_season_year')
    .eq('id', true)
    .single();
  const season = config?.current_season_year || 2026;

  const [{ data: player }, repRes, { data: weekRows }] = await Promise.all([
    supabase.from('players').select('id, full_name, sleeper_player_id').eq('id', playerId).maybeSingle(),
    supabase
      .from('league_injury_report')
      .select('injury_status, injury_body_part, injury_notes, injury_changed_at, prev_injury_status, nfl_roster_status')
      .eq('player_id', playerId)
      .maybeSingle(),
    supabase
      .from('league_week_status')
      .select('week_number, week_is_final')
      .eq('season_year', season)
      .order('week_number', { ascending: true }),
  ]);

  if (!player) {
    return (
      <main className="page mpc-page">
        <h1 className="mpc-name">Player not found</h1>
      </main>
    );
  }

  const open = (weekRows || []).find(function (w) {
    return !w.week_is_final;
  });
  const lastWeek = (weekRows || []).length ? weekRows[weekRows.length - 1].week_number : null;
  const week = open ? open.week_number : lastWeek;
  const weeksRes = week
    ? await supabase.rpc('edfl_player_injury_weeks', {
        p_player_id: playerId,
        p_season: season,
        p_through_week: week,
        p_count: 5,
      })
    : { data: [], error: null };

  const rep = repRes.data || null;
  const status = rep && rep.injury_status ? rep.injury_status : null;

  return (
    <main className="page mpc-page">
      <div className="mpc-head">
        <RosterFace big sleeperId={player.sleeper_player_id} name={player.full_name} />
        <div>
          <h1 className="mpc-name">{player.full_name}</h1>
          <div className="mpc-meta">Injury report</div>
        </div>
      </div>

      {repRes.error ? (
        <div className="form-error" style={{ marginTop: 14 }}>
          The injury report could not be read: {repRes.error.message}
        </div>
      ) : (
        <>
          <div className="mpc-box">
            <div className="irp-status">
              {status ? <InjuryCross className="inj-cross-lg" label={status} /> : null}
              <div>
                <div className="irp-status-word">{status || 'No designation'}</div>
                <div className="irp-status-sub">
                  {status && rep.injury_changed_at
                    ? 'NFL designation since ' +
                      formatDate(rep.injury_changed_at) +
                      (rep.prev_injury_status ? ' (before: ' + rep.prev_injury_status + ')' : '')
                    : status
                    ? 'NFL designation'
                    : 'The injury authority lists no designation for him.'}
                </div>
              </div>
            </div>
          </div>

          <div className="mpc-box">
            <p className="mpc-boxh">The injury</p>
            <div className="irp-kv">
              <span>Nature</span>
              <span>{rep && rep.injury_body_part ? rep.injury_body_part : <span className="is-none">Not given</span>}</span>
            </div>
            <div className="irp-kv">
              <span>Notes</span>
              <span>{rep && rep.injury_notes ? rep.injury_notes : <span className="is-none">None</span>}</span>
            </div>
            <div className="irp-kv">
              <span>Prognosis</span>
              <span>
                <span className="is-none">No source yet</span>
              </span>
            </div>
            <div className="irp-kv">
              <span>NFL roster status</span>
              <span>{rep && rep.nfl_roster_status ? rep.nfl_roster_status : <span className="is-none">Not given</span>}</span>
            </div>
          </div>
        </>
      )}

      <div className="mpc-box">
        <p className="mpc-boxh">Last 5 weeks</p>
        {weeksRes.error ? (
          <div className="form-error">The weekly record could not be read: {weeksRes.error.message}</div>
        ) : (
          <>
            <div className="irp-weeks">
              {(weeksRes.data || []).map(function (w) {
                const label = w.on_bye
                  ? 'Bye'
                  : w.status_label
                  ? w.status_label
                  : !w.week_started
                  ? '–'
                  : w.has_record
                  ? '✓'
                  : '–';
                const cls = w.status_label
                  ? WEEK_CLASS[w.status_label] || ''
                  : w.on_bye || !w.week_started || !w.has_record
                  ? 'is-none'
                  : 'is-ok';
                return (
                  <div key={w.week_number} className="irp-week">
                    <span className={'irp-chip ' + cls}>{label}</span>
                    <div>Wk {w.week_number}</div>
                  </div>
                );
              })}
            </div>
            <p className="irp-key">
              The NFL&rsquo;s official status each week: Q Questionable, D Doubtful, O Out, IR injured reserve,
              PUP physically unable to perform, RES another reserve list; ✓ on the roster and not on the
              injury report; – no report yet or not on an NFL roster. Source: nflverse weekly injury
              reports and rosters.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
