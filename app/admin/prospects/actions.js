'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '../../../lib/supabaseAdmin';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import {
  getCurrentTeamOwner,
  isCommissionerOrCo,
  COMMISSIONER_OR_CO_REFUSAL,
} from '../../../lib/getCurrentTeamOwner';

// THE PROSPECT BOARD'S OFFICER ACTIONS. Spec v0.8 section 4.7.
//
// refreshProspects  -- reads ESPN's draft board for a class year and upserts
//                      it through draft_prospects_upsert() with the SERVICE
//                      client. The function is service-only (SR-56); the gate
//                      is the isCommissionerOrCo check here, exactly as
//                      /admin/sync-players works. No cron: both Vercel Hobby
//                      cron slots are spent (spec 6.1) and a board that changes
//                      weekly at most does not need one.
// matchSleeper      -- draft_prospects_match_sleeper(), service-only. Run after
//                      Sync Players once Sleeper has added the rookies (PR-1).
// closeRookieDraft  -- draft_prospects_roll(), gated in the DATABASE on the
//                      caller's own auth.uid(); called with the session client
//                      so that gate sees who is asking.
// setProspectMatch  -- draft_prospect_match_set(), same.
//
// ESPN. Undocumented, stable for years, and the same endpoints every draft
// tool reads. A list call returns $refs; each ref is one athlete with
// position.abbreviation inline, an attributes[] array carrying grade / rank
// (position) / overall, a college $ref, and after the draft a pick $ref whose
// URL carries the round and pick. Nothing numeric is invented: a field ESPN
// does not send is stored null.

const ESPN_LIST = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/{year}/draft/athletes?limit=200&page={page}';
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const CONCURRENCY = 24;
const FETCH_TIMEOUT_MS = 8000;

function officerRefusal() {
  return { status: 'error', message: COMMISSIONER_OR_CO_REFUSAL };
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(function () {
    ctrl.abort();
  }, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.replace(/^http:/, 'https:'), { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('ESPN ' + res.status + ' for ' + url);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = [];
  for (let k = 0; k < Math.min(limit, items.length); k++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

function attr(athlete, name) {
  const list = Array.isArray(athlete.attributes) ? athlete.attributes : [];
  const a = list.find(function (x) {
    return x && x.name === name;
  });
  return a && a.value != null ? Number(a.value) : null;
}

function pickFromRef(ref) {
  // .../draft/rounds/1/picks/20?lang=en
  const m = /\/rounds\/(\d+)\/picks\/(\d+)/.exec(ref || '');
  return m ? { round: Number(m[1]), overall: Number(m[2]) } : { round: null, overall: null };
}

/**
 * useFormState action. The form passes class_year.
 * @returns {Promise<{status:'idle'|'done'|'error', message?:string, result?:object}>}
 */
export async function refreshProspectsAction(prevState, formData) {
  const me = await getCurrentTeamOwner();
  if (!me || !isCommissionerOrCo(me)) return officerRefusal();

  const classYear = Number(formData.get('class_year'));
  if (!classYear || classYear < 2026 || classYear > 2100) {
    return { status: 'error', message: 'Give a class year, e.g. 2027.' };
  }

  try {
    // 1. Every $ref on the board.
    const refs = [];
    for (let page = 1; page <= 10; page++) {
      const list = await getJson(ESPN_LIST.replace('{year}', String(classYear)).replace('{page}', String(page)));
      const items = Array.isArray(list.items) ? list.items : [];
      items.forEach(function (it) {
        if (it && it.$ref) refs.push(it.$ref);
      });
      if (!list.pageCount || page >= list.pageCount || items.length === 0) break;
    }
    if (refs.length === 0) {
      return {
        status: 'error',
        message: 'ESPN has no ' + classYear + ' board yet. It is usually published after the college season; try again in the new year.',
      };
    }

    // 2. Each athlete. Position is inline; keep only PR-3's five and drop the
    //    rest BEFORE resolving colleges, so the college lookups are ~150 not ~700.
    const athletes = await mapLimit(refs, CONCURRENCY, async function (ref) {
      try {
        const a = await getJson(ref);
        const pos = a && a.position && a.position.abbreviation ? String(a.position.abbreviation).toUpperCase() : null;
        // ESPN spells kickers PK on some boards.
        const norm = pos === 'PK' ? 'K' : pos;
        if (!norm || POSITIONS.indexOf(norm) < 0) return null;
        return {
          id: String(a.id),
          full_name: a.displayName || a.fullName || null,
          position: norm,
          height: a.displayHeight || null,
          weight: a.displayWeight || null,
          grade: attr(a, 'grade'),
          overall: attr(a, 'overall'),
          posRank: attr(a, 'rank'),
          collegeRef: a.college && a.college.$ref ? a.college.$ref : null,
          pick: a.pick && a.pick.$ref ? pickFromRef(a.pick.$ref) : { round: null, overall: null },
        };
      } catch (e) {
        return { failed: true, ref: ref, message: e.message };
      }
    });

    const failed = athletes.filter(function (x) {
      return x && x.failed;
    });
    const kept = athletes.filter(function (x) {
      return x && !x.failed && x.full_name;
    });

    // 3. Colleges, once each.
    const collegeRefs = Array.from(
      new Set(
        kept
          .map(function (x) {
            return x.collegeRef;
          })
          .filter(Boolean)
      )
    );
    const collegeNames = {};
    await mapLimit(collegeRefs, CONCURRENCY, async function (ref) {
      try {
        const c = await getJson(ref);
        collegeNames[ref] = c.name || c.shortName || c.abbrev || null;
      } catch (e) {
        collegeNames[ref] = null;
      }
    });

    const rows = kept.map(function (x) {
      return {
        espn_athlete_id: x.id,
        full_name: x.full_name,
        position: x.position,
        college: x.collegeRef ? collegeNames[x.collegeRef] : null,
        height: x.height,
        weight: x.weight,
        espn_grade: x.grade,
        espn_overall_rank: x.overall,
        espn_position_rank: x.posRank,
        nfl_team: null,
        draft_round: x.pick.round,
        draft_overall: x.pick.overall,
      };
    });

    // 4. Upsert, service client, one call.
    const supabase = adminClient();
    const { data, error } = await supabase.rpc('draft_prospects_upsert', {
      p_class_year: classYear,
      p_rows: rows,
      p_by_owner: me.id,
    });
    if (error) return { status: 'error', message: error.message };

    revalidatePath('/prospects');
    revalidatePath('/admin/prospects');
    revalidatePath('/team/[teamId]', 'page');
    return {
      status: 'done',
      result: {
        classYear: classYear,
        espnTotal: refs.length,
        keptPositions: kept.length,
        failedFetches: failed.length,
        upsert: data,
      },
    };
  } catch (e) {
    return { status: 'error', message: e && e.message ? e.message : 'The refresh failed.' };
  }
}

export async function matchSleeperAction() {
  const me = await getCurrentTeamOwner();
  if (!me || !isCommissionerOrCo(me)) return officerRefusal();
  const supabase = adminClient();
  const { data, error } = await supabase.rpc('draft_prospects_match_sleeper');
  if (error) return { status: 'error', message: error.message };
  revalidatePath('/prospects');
  revalidatePath('/admin/prospects');
  return { status: 'done', result: data };
}

export async function closeRookieDraftAction(prevState, formData) {
  const me = await getCurrentTeamOwner();
  if (!me || !isCommissionerOrCo(me)) return officerRefusal();
  const confirm = String(formData.get('confirm') || '');
  if (confirm !== 'CLOSE') {
    return { status: 'error', message: 'Type CLOSE to confirm. This retires every live draft rumour and rolls the board.' };
  }
  const note = String(formData.get('note') || '').trim() || null;
  // SESSION client: draft_prospects_roll() gates on auth.uid().
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('draft_prospects_roll', { p_note: note });
  if (error) return { status: 'error', message: error.message };
  revalidatePath('/prospects');
  revalidatePath('/admin/prospects');
  revalidatePath('/team/[teamId]', 'page');
  revalidatePath('/actions');
  return { status: 'done', result: data };
}

export async function setProspectMatchAction(prospectId, playerId) {
  const me = await getCurrentTeamOwner();
  if (!me || !isCommissionerOrCo(me)) return { ok: false, message: COMMISSIONER_OR_CO_REFUSAL };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('draft_prospect_match_set', {
    p_prospect_id: prospectId,
    p_player_id: playerId || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/prospects');
  revalidatePath('/admin/prospects');
  return { ok: true, data: data };
}
