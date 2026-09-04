// Feature flags. One switch per feature, read by every layer that can reach it.
//
// A flag here is a KILL SWITCH, not a permission. Permissions live in the
// database. This exists so a shipped feature can be taken out of owners' hands
// quickly without reverting the code that implements it.

/**
 * CONTRACT RESTRUCTURE — DISABLED September 4, 2026.
 *
 * Turned off by the commissioner after an issue was found, before any owner
 * had used it. The implementation is intact and untouched; only reachability
 * changed.
 *
 * Flip this to true to re-enable. Nothing else needs editing — three layers
 * read it:
 *
 *   app/page.js               hides the League-section link
 *   app/restructure/page.js   renders an explanation instead of the form
 *   app/restructure/actions.js  every action refuses, including the write
 *
 * ALL THREE ARE REQUIRED AND THE THIRD IS THE ONLY REAL ONE. Hiding a link
 * protects nobody and a redirect protects nobody either: a Server Action is a
 * callable endpoint whatever the page renders, so an owner with the page
 * already open, or anyone crafting the call, could still execute a restructure
 * against a live database function that is perfectly happy to run it. The
 * database has no idea the feature is switched off — this file is the only
 * thing that knows, which is exactly why the check has to sit in the action
 * and not only in front of it.
 */
export const RESTRUCTURE_ENABLED = false;

/** Shown wherever the disabled feature would otherwise appear. */
export const RESTRUCTURE_DISABLED_MESSAGE =
  'Contract restructuring is temporarily switched off while an issue is fixed. ' +
  'No restructure can be previewed or executed until it is back on. Nothing ' +
  'already on your roster is affected.';
