'use client';

import { useEffect, useState } from 'react';

/**
 * COMPLIANCE COUNTDOWN -- "17h 42m left". October 1, 2026.
 *
 * The one client piece of the compliance alert. It receives the deadline as an
 * ISO instant from the database and only ever SUBTRACTS -- it never formats a
 * date or a time of day (the Eastern label beside it comes from the database),
 * so the viewer's own time zone cannot leak into what an owner reads.
 *
 * Renders nothing on the server and on the first client paint, then fills in
 * after mount. That avoids a hydration mismatch: the server's "now" and the
 * browser's "now" are never the same second.
 */
function leftText(ms) {
  if (ms <= 0) return 'deadline passed -- refresh the page';
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return d + 'd ' + h + 'h left';
  if (h > 0) return h + 'h ' + m + 'm left';
  return m + 'm left';
}

export default function ComplianceCountdown({ deadline }) {
  const [text, setText] = useState(null);

  useEffect(
    function () {
      const t = new Date(deadline).getTime();
      if (Number.isNaN(t)) return undefined;
      function tick() {
        setText(leftText(t - Date.now()));
      }
      tick();
      const id = setInterval(tick, 30000);
      return function () {
        clearInterval(id);
      };
    },
    [deadline]
  );

  if (!text) return null;
  // The leading separator lives here so the line reads cleanly before mount.
  return (
    <>
      {' · '}
      <strong className="ntf-countdown">{text}</strong>
    </>
  );
}
