import { formatShortDateTime } from '../lib/formatDate';

/**
 * OFFICER ACTION BANNER -- the home screen's "you need to do something" list,
 * for the commissioner and the co-commissioner only. September 16, 2026.
 *
 * WHAT THIS COMPONENT DOES NOT DO: decide anything. Every item, its severity,
 * its sentence and its link are composed by officer_action_items() in the
 * database. This file picks a colour and prints what the database said,
 * verbatim. If an item reads wrong, fix the function, not this file.
 *
 * NO READS HERE. app/page.js calls the function under its own officer gate and
 * passes the rows in. The function refuses a non-officer by itself, so the
 * page's canAdmin test only decides whether to ask.
 *
 * A FAILED READ SAYS SO. "Nothing to do" and "could not check" are different
 * facts, and a banner that fell back to the green one on an error would be the
 * swallowed-error defect this app has already paid for once.
 *
 * NO globals.css CHANGE. Styling rides the --st-* status tokens, the same way
 * components/ComplianceBanner.js does, so light and dark both follow.
 *
 * @param {Array|null} items  rows of officer_action_items()
 * @param {string|null} error message from a failed read, if any
 */

const TONE = {
  urgent: 'bad',
  attention: 'live',
  info: 'off',
};

const LABEL = {
  urgent: 'Action needed',
  attention: 'Needs attention',
  info: 'For your information',
};

function wrapStyle(key) {
  return {
    border: '1px solid var(--st-' + key + '-br, var(--border-strong))',
    background: 'var(--st-' + key + '-bg, var(--bg-elevated))',
    borderRadius: '4px',
    padding: '14px 16px',
    margin: '0 0 24px',
  };
}

const headStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  fontWeight: 600,
  fontSize: '15px',
  color: 'var(--text)',
};

const listStyle = {
  listStyle: 'none',
  margin: '12px 0 0',
  padding: 0,
};

const itemStyle = {
  padding: '10px 0',
  borderTop: '1px solid var(--border)',
};

const itemHeadStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '10px',
  flexWrap: 'wrap',
};

const detailStyle = {
  margin: '6px 0 0',
  fontSize: '13px',
  color: 'var(--text-dim)',
  lineHeight: 1.5,
  whiteSpace: 'pre-line',
};

const footStyle = {
  margin: '10px 0 0',
  fontSize: '12px',
  color: 'var(--text-dim)',
  lineHeight: 1.5,
};

function worstSeverity(items) {
  if (items.some(function (i) { return i.severity === 'urgent'; })) return 'urgent';
  if (items.some(function (i) { return i.severity === 'attention'; })) return 'attention';
  return 'info';
}

export default function OfficerActionBanner({ items, error }) {
  if (error) {
    return (
      <div className="form-error" style={{ marginBottom: 24 }}>
        The officer to-do list could not be loaded: {error}. This page is not telling you
        whether anything needs your attention.
      </div>
    );
  }

  const rows = Array.isArray(items) ? items : [];

  if (rows.length === 0) {
    return (
      <div style={wrapStyle('good')}>
        <div style={headStyle}>
          <span className="status status-good">All clear</span>
          <span>Nothing needs a commissioner action right now.</span>
        </div>
      </div>
    );
  }

  const worst = worstSeverity(rows);

  return (
    <div style={wrapStyle(TONE[worst] || 'off')}>
      <div style={headStyle}>
        <span className={'status status-' + (TONE[worst] || 'off')}>{LABEL[worst] || worst}</span>
        <span>
          {rows.length === 1
            ? '1 item needs a commissioner or co-commissioner.'
            : rows.length + ' items need a commissioner or co-commissioner.'}
        </span>
      </div>

      <ul style={listStyle}>
        {rows.map(function (r) {
          const tone = TONE[r.severity] || 'off';
          return (
            <li key={r.item_key} style={itemStyle}>
              <div style={itemHeadStyle}>
                <span className={'status status-' + tone}>{LABEL[r.severity] || r.severity}</span>
                {r.href ? (
                  <a href={r.href} style={{ fontWeight: 600 }}>
                    {r.title}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                )}
              </div>
              {r.detail && <p style={detailStyle}>{r.detail}</p>}
              {r.since && (
                <p style={{ ...detailStyle, fontSize: '12px' }}>
                  On this list since {formatShortDateTime(r.since)}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p style={footStyle}>
        Only the commissioner and the co-commissioner see this. It is recomputed every time this
        page loads and every fifteen minutes in the background.
      </p>
    </div>
  );
}
