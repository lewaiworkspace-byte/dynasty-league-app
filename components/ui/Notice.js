/**
 * Notice -- a bordered box carrying one sentence the reader must not miss.
 *
 * Refusals, warnings, league notices, "could not load" messages.
 *
 * A REFUSAL IS RENDERED VERBATIM. Every refusal in this app is written in the
 * database, in words meant for an owner, and names the rule it enforces. This
 * component prints what it is given and adds nothing. If a refusal reads wrong,
 * the function is wrong -- not this file.
 *
 * THERE IS NO GREEN FALLBACK. A failed read renders tone="bad" and says the
 * page could not answer the question. The alternative -- falling back to a
 * reassuring state on error -- is the swallowed-error defect this app has
 * already paid for once on the team page.
 *
 * @param {string} tone  'live' | 'bad' | 'good' | undefined (neutral)
 */

export default function Notice({ tone, children }) {
  const cls = 'kit-notice' + (tone ? ' kit-notice-' + tone : '');

  return (
    <div className={cls} role={tone === 'bad' ? 'alert' : undefined}>
      <div>{children}</div>
    </div>
  );
}
