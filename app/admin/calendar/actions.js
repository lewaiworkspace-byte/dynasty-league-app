'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '../../../lib/supabaseServerClient';
import { getCurrentTeamOwner } from '../../../lib/getCurrentTeamOwner';

// CALENDAR LOADER -- the commissioner's edits to league_weeks and
// league_calendar_events. September 16, 2026 (To-Do item 9).
//
// STRICT, by the default-DENY rule in lib/getCurrentTeamOwner.js: nobody has
// widened this, so it is the commissioner's alone. The test below is
// me.is_commissioner directly, NOT isCommissionerOrCo(). The database agrees
// -- every calendar_* function calls require_commissioner() -- and the
// database is the real gate; this check only produces a readable refusal.
//
// SESSION CLIENT, never adminClient(): require_commissioner() resolves the
// caller through auth.uid(), which is null through the service-role client.
//
// EVERY ACTION RETURNS { ok, message } AND NEVER THROWS (CLAUDE.md ground rule
// 10). The database's refusal is the message, verbatim.
//
// TIMES ARE EASTERN WALL-CLOCK TEXT ('YYYY-MM-DDTHH:MM') straight from the
// datetime-local inputs. The database converts them (edfl_et); nothing here
// does time-zone arithmetic.

const REFUSAL = 'This action requires commissioner access.';

async function commissionerOnly() {
  const me = await getCurrentTeamOwner();
  if (!me || !me.is_commissioner) return null;
  return me;
}

function textOrNull(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function done() {
  revalidatePath('/admin/calendar');
  revalidatePath('/calendar');
  revalidatePath('/');
}

export async function saveWeek(input) {
  const me = await commissionerOnly();
  if (!me) return { ok: false, message: REFUSAL };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('calendar_week_save', {
      p_season_year: Number(input.seasonYear),
      p_week_number: Number(input.weekNumber),
      p_first_game_local: textOrNull(input.firstGameLocal),
      p_first_game_label: textOrNull(input.firstGameLabel),
      p_charge_local: textOrNull(input.chargeLocal),
      p_wire_local: textOrNull(input.wireLocal),
      p_compliance_local: textOrNull(input.complianceLocal),
      p_last_game_local: textOrNull(input.lastGameLocal),
      p_is_provisional: Boolean(input.isProvisional),
      p_counts_toward_taxi_weeks: Boolean(input.countsTowardTaxiWeeks),
    });
    if (error) return { ok: false, message: error.message };
    done();
    return {
      ok: true,
      message: (data && data.created ? 'Added' : 'Saved') + ' Week ' + input.weekNumber + '.',
    };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

export async function generateWeeks(input) {
  const me = await commissionerOnly();
  if (!me) return { ok: false, message: REFUSAL };
  const date = textOrNull(input.week1ChargeDate);
  if (!date) return { ok: false, message: 'Pick the Tuesday Week 1 salary is charged.' };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('calendar_weeks_generate', {
      p_season_year: Number(input.seasonYear),
      p_week1_charge_date: date,
      p_weeks: 14,
    });
    if (error) return { ok: false, message: error.message };
    done();
    return {
      ok: true,
      message:
        'Drafted ' + (data && data.created) + ' provisional weeks. Check each one against the NFL schedule, add its first-game label, and clear the provisional flag.',
    };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

export async function saveEvent(input) {
  const me = await commissionerOnly();
  if (!me) return { ok: false, message: REFUSAL };
  try {
    const supabase = await createSupabaseServerClient();
    const sortHint = Number(input.sortHint);
    const { data, error } = await supabase.rpc('calendar_event_save', {
      p_id: textOrNull(input.id),
      p_season_year: Number(input.seasonYear),
      p_starts_local: textOrNull(input.startsLocal),
      p_ends_local: textOrNull(input.endsLocal),
      p_time_is_exact: Boolean(input.timeIsExact),
      p_title: textOrNull(input.title),
      p_detail: textOrNull(input.detail),
      p_category: textOrNull(input.category),
      p_rule_ref: textOrNull(input.ruleRef),
      p_is_provisional: Boolean(input.isProvisional),
      p_sort_hint: Number.isFinite(sortHint) ? sortHint : 0,
    });
    if (error) return { ok: false, message: error.message };
    done();
    return { ok: true, message: data && data.created ? 'Entry added.' : 'Entry saved.' };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

export async function deleteEvent(input) {
  const me = await commissionerOnly();
  if (!me) return { ok: false, message: REFUSAL };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc('calendar_event_delete', {
      p_id: textOrNull(input.id),
      p_reason: textOrNull(input.reason),
    });
    if (error) return { ok: false, message: error.message };
    done();
    return { ok: true, message: 'Entry deleted.' };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}

export async function copySeasonForward(input) {
  const me = await commissionerOnly();
  if (!me) return { ok: false, message: REFUSAL };
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('calendar_season_copy_forward', {
      p_from_season: Number(input.fromSeason),
    });
    if (error) return { ok: false, message: error.message };
    done();
    return {
      ok: true,
      message:
        'Drafted ' + (data && data.created) + ' provisional entries for ' + (Number(input.fromSeason) + 1) + '. Each one is a year later than its original and marked provisional until you confirm it.',
    };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  }
}
