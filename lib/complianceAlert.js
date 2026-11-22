/**
 * ONE READ OF my_compliance_alert() -- October 17, 2026 (UI test batch 1).
 *
 * The app bar's compliance pill, the in-app alert strip beneath it and the
 * roster audit page all show the same fact: is this owner's roster at risk,
 * and of what. my_compliance_alert() composes it in the database from the
 * same predicates the fine engine charges with (SR-70); nothing here decides
 * anything. This helper exists so that a page calls the function ONCE and
 * hands the result to every component that draws it, which is what keeps the
 * pill and the strip from ever disagreeing.
 *
 * SESSION CLIENT ONLY. The function reads auth.uid() and returns the caller's
 * own team; through the service-role client it would answer for nobody.
 *
 * "I could not check" and "you are fine" are different facts: a failed read
 * comes back as { alert: null, failed: true }, never as an all-clear.
 *
 * @param {object} server  the session Supabase client the caller already holds
 * @returns {Promise<{ alert: object|null, failed: boolean }>}
 */
export async function readComplianceAlert(server) {
  try {
    const { data, error } = await server.rpc('my_compliance_alert');
    if (error) {
      console.error('my_compliance_alert failed:', error);
      return { alert: null, failed: true };
    }
    return { alert: data || null, failed: false };
  } catch (e) {
    console.error('my_compliance_alert threw:', e);
    return { alert: null, failed: true };
  }
}
