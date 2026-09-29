'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  submitLibraryFeedback,
  withdrawLibraryFeedback,
  respondLibraryFeedback,
} from '../app/library/actions';

/**
 * LIBRARY FEEDBACK -- the form and the thread at the foot of each document.
 * September 29, 2026.
 *
 * VISIBLE TO EVERY OWNER, by commissioner ruling. Every signed-in owner sees
 * every item, with the team that left it. RLS on library_feedback is what
 * enforces that; this component only draws what the page was allowed to read.
 *
 * WHAT IT DECIDES: nothing. Who may withdraw (the author, while open) and who
 * may reply (commissioner or co-commissioner) are the database's tests; the
 * buttons are drawn where they will work and the Server Actions hand back the
 * database's sentence verbatim when they do not.
 *
 * Timestamps arrive ALREADY FORMATTED in Eastern by the server page
 * (lib/formatDate.js). This component never formats a date -- a client
 * component calling toLocaleString() renders in the viewer's zone.
 *
 * Props:
 *   docSlug, docVersion         what the owner is reading
 *   sections  [{ id, label }]   numbered sections, for the picker
 *   initialSection              section id from ?section=, or ''
 *   items                       library_feedback_feed rows + createdLabel,
 *                               respondedLabel
 *   myOwnerId                   the viewer's team_owners.id, or null
 *   isOfficer                   draws the reply controls
 *   readError                   the feed read failed -- say so, never "none"
 */

const MAX = 2000;

function StatusChip({ status }) {
  if (status === 'resolved') return <span className="lib-chip lib-chip-done">Resolved</span>;
  return <span className="lib-chip lib-chip-open">Open</span>;
}

function OfficerReply({ item, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  async function send(resolve) {
    setBusy(true);
    setMsg(null);
    const res = await respondLibraryFeedback(item.feedback_id, text, resolve);
    setBusy(false);
    if (!res || !res.ok) {
      setMsg((res && res.message) || 'The reply could not be saved.');
      return;
    }
    setText('');
    setOpen(false);
    onDone();
  }

  if (!open) {
    return (
      <div className="lib-fb-actions">
        <button type="button" className="lib-linkbtn" onClick={() => setOpen(true)}>
          {item.status === 'resolved' ? 'Reply or reopen' : 'Reply / resolve'}
        </button>
      </div>
    );
  }

  return (
    <div className="lib-fb-reply-form">
      <label className="lib-label" htmlFor={'reply-' + item.feedback_id}>
        Officer reply (shown to every owner)
      </label>
      <textarea
        id={'reply-' + item.feedback_id}
        className="lib-textarea"
        rows={3}
        maxLength={MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Optional. Leave blank to resolve without a reply."
      />
      <div className="lib-fb-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => send(true)}>
          {text.trim() ? 'Reply and resolve' : 'Resolve'}
        </button>
        <button
          type="button"
          className="lib-linkbtn"
          disabled={busy || (!text.trim() && item.status === 'open')}
          onClick={() => send(false)}
        >
          {item.status === 'resolved' ? (text.trim() ? 'Reply and reopen' : 'Reopen') : 'Reply, keep open'}
        </button>
        <button type="button" className="lib-linkbtn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {msg ? <p className="form-error">{msg}</p> : null}
    </div>
  );
}

function Item({ item, sectionHref, mine, isOfficer, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function withdraw() {
    setBusy(true);
    setMsg(null);
    const res = await withdrawLibraryFeedback(item.feedback_id);
    setBusy(false);
    if (!res || !res.ok) {
      setMsg((res && res.message) || 'That feedback could not be withdrawn.');
      return;
    }
    onChanged();
  }

  const who = item.author_team_name || 'League office';

  return (
    <li className={'lib-fb-item' + (item.status === 'resolved' ? ' is-resolved' : '')}>
      <div className="lib-fb-meta">
        <span className="lib-fb-who">{who}</span>
        <span className="lib-fb-when">{item.createdLabel}</span>
        <StatusChip status={item.status} />
      </div>
      <div className="lib-fb-where">
        {item.section_id ? (
          <a href={sectionHref(item.section_id)}>{item.section_label || item.section_id}</a>
        ) : (
          <span>Whole document</span>
        )}
        {item.doc_version ? <span className="lib-fb-ver"> · read in v{item.doc_version}</span> : null}
      </div>
      <p className="lib-fb-body">{item.body}</p>

      {item.response ? (
        <div className="lib-fb-response">
          <div className="lib-fb-meta">
            <span className="lib-fb-who">{item.responder_role || 'League office'}</span>
            <span className="lib-fb-when">{item.respondedLabel}</span>
          </div>
          <p className="lib-fb-body">{item.response}</p>
        </div>
      ) : null}

      {mine && item.status === 'open' ? (
        <div className="lib-fb-actions">
          <button type="button" className="lib-linkbtn" disabled={busy} onClick={withdraw}>
            Withdraw
          </button>
        </div>
      ) : null}
      {msg ? <p className="form-error">{msg}</p> : null}

      {isOfficer ? <OfficerReply item={item} onDone={onChanged} /> : null}
    </li>
  );
}

export default function LibraryFeedback(props) {
  const router = useRouter();
  const sections = Array.isArray(props.sections) ? props.sections : [];
  const items = Array.isArray(props.items) ? props.items : [];

  const known = new Set(sections.map((s) => s.id));
  const [sectionId, setSectionId] = useState(
    props.initialSection && known.has(props.initialSection) ? props.initialSection : ''
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sent, setSent] = useState(false);
  const [filter, setFilter] = useState('all');

  function refresh() {
    router.refresh();
  }

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setSent(false);
    const text = body.trim();
    if (!text) {
      setMsg('Write something before sending.');
      return;
    }
    const section = sections.find((s) => s.id === sectionId);
    setBusy(true);
    const res = await submitLibraryFeedback({
      docSlug: props.docSlug,
      docVersion: props.docVersion,
      sectionId: section ? section.id : null,
      sectionLabel: section ? section.label : null,
      body: text,
    });
    setBusy(false);
    if (!res || !res.ok) {
      setMsg((res && res.message) || 'Your feedback could not be saved.');
      return;
    }
    setBody('');
    setSent(true);
    refresh();
  }

  function sectionHref(id) {
    return '#' + id;
  }

  const openCount = items.filter((i) => i.status === 'open').length;
  const shown = items.filter((i) => {
    if (filter === 'open') return i.status === 'open';
    if (filter === 'resolved') return i.status === 'resolved';
    if (filter === 'section') return sectionId ? i.section_id === sectionId : true;
    return true;
  });

  return (
    <section className="lib-fb" id="feedback" aria-labelledby="feedback-heading">
      <h2 className="section-heading" id="feedback-heading">
        Feedback on this document
      </h2>
      <p className="lib-fb-intro">
        Spotted something unclear, wrong or missing? Say so here. Every owner can read what is
        posted, with the team that posted it, and the commissioners reply here too.
      </p>

      {props.canPost ? (
        <form className="lib-fb-form" onSubmit={submit}>
          <label className="lib-label" htmlFor="lib-fb-section">
            Section
          </label>
          <select
            id="lib-fb-section"
            className="lib-select"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            <option value="">Whole document</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label.length > 90 ? s.label.slice(0, 88) + '…' : s.label}
              </option>
            ))}
          </select>

          <label className="lib-label" htmlFor="lib-fb-body">
            Your feedback
          </label>
          <textarea
            id="lib-fb-body"
            className="lib-textarea"
            rows={4}
            maxLength={MAX}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSent(false);
            }}
            placeholder="What should change, and why?"
          />
          <div className="lib-fb-actions">
            <button type="submit" className="btn kit-cta" disabled={busy || !body.trim()}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
            <span className="lib-count">
              {body.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}
            </span>
          </div>
          {msg ? <p className="form-error">{msg}</p> : null}
          {sent ? <p className="lib-sent">Thanks — your feedback is posted below.</p> : null}
        </form>
      ) : (
        <p className="empty-note">
          Your login is not linked to a team, so it cannot post feedback. You can still read
          what owners have posted.
        </p>
      )}

      <div className="lib-fb-head">
        <span className="lib-fb-count">
          {items.length === 0
            ? 'No feedback yet'
            : items.length + (items.length === 1 ? ' item' : ' items') + ' · ' + openCount + ' open'}
        </span>
        {items.length > 0 ? (
          <div className="lib-fb-filters" role="group" aria-label="Filter feedback">
            {[
              ['all', 'All'],
              ['open', 'Open'],
              ['resolved', 'Resolved'],
              ['section', 'This section'],
            ].map(([key, label]) =>
              key === 'section' && !sectionId ? null : (
                <button
                  type="button"
                  key={key}
                  className={'lib-filter' + (filter === key ? ' is-on' : '')}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              )
            )}
          </div>
        ) : null}
      </div>

      {props.readError ? (
        <p className="form-error">
          Feedback could not be loaded: {props.readError}. Nothing below means there is none.
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className="lib-fb-list">
          {shown.map((item) => (
            <Item
              key={item.feedback_id}
              item={item}
              sectionHref={sectionHref}
              mine={Boolean(props.myOwnerId) && item.author_owner_id === props.myOwnerId}
              isOfficer={Boolean(props.isOfficer)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : items.length > 0 ? (
        <p className="empty-note">Nothing matches that filter.</p>
      ) : null}
    </section>
  );
}
