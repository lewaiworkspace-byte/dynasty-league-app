'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { draftMemoAction, withdrawMemoAction, setWireKindAction } from './actions';

// Robo Goodell's desk, in the order an officer uses it:
//   1. Is the wire live at all                (STATE)
//   2. Draft a memo and send it               (THE MEMO DESK)
//   3. Pull one back before the sweep runs    (DRAFTED)
//   4. See what the calendar is about to say  (COMING UP)
//   5. Read back what he has said             (ON THE WIRE)
//   6. Mute a kind                            (WHAT GOES ON THE WIRE)
//
// Same useFormState split as /admin/prospects and /admin/sync-players. Every
// sentence Robo speaks arrives already composed by the database; this file
// prints it and never writes a line of his voice.

const idle = { status: 'idle' };
const MAX_BODY = 1800;

const KIND_LABEL = {
  event_7d: 'Calendar · seven days out',
  event_1d: 'Calendar · one day out',
  event_now: 'Calendar · at the hour',
  fine: 'Fines',
  memo: 'Your memos',
};

function Pending(props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={'btn' + (props.cta ? ' kit-cta' : ' btn-secondary')} disabled={pending}>
      {pending ? props.busy : props.label}
    </button>
  );
}

export default function LeagueOfficeAdmin(props) {
  const router = useRouter();
  const [memo, memoAction] = useFormState(draftMemoAction, idle);
  const [body, setBody] = useState('');
  const [note, setNote] = useState(null);

  const left = MAX_BODY - body.length;

  async function pull(memoId) {
    const res = await withdrawMemoAction(memoId);
    setNote(res);
    router.refresh();
  }

  async function toggle(kind, enabled) {
    const res = await setWireKindAction(kind, enabled);
    setNote(res);
    router.refresh();
  }

  return (
    <main className="portal-body">
      <p className="subhead">
        <a href="/admin">&larr; Commissioner Portal</a>
      </p>
      <h1>League Office</h1>
      <p className="subhead">
        Robo Goodell posts to <strong>#league-office</strong>: calendar events, fines, and whatever
        you tell him to say. He does not improvise, he does not editorialise on a ruling, and he
        does not take questions here.
      </p>

      {/* 1 */}
      <section className="portal-group">
        <div className="portal-group-title">STATE</div>
        {props.statusError ? <p className="form-error">{props.statusError}</p> : null}
        {!props.webhookStored ? (
          <p className="kit-notice mk-notice-warn">
            <strong>The wire is dark.</strong> Robo has no webhook yet, so the sweep runs every five
            minutes and posts nothing. Create the <strong>#league-office</strong> channel, make a
            webhook for it, and store it in Vault as <code>discord_goodell_webhook</code> from the
            Supabase SQL editor. Nothing queued is lost while he is dark, but anything that falls
            more than 24 hours behind is skipped rather than posted late.
          </p>
        ) : null}
        <div className="kit-strip mk-figures">
          <div className="mk-figure">
            <div className="mk-figure-label">WEBHOOK</div>
            <div className="mk-figure-value">{props.webhookStored ? 'Stored' : 'Missing'}</div>
          </div>
          <div className="mk-figure">
            <div className="mk-figure-label">DUE NOW</div>
            <div className="mk-figure-value">{props.queuedNow}</div>
          </div>
          <div className="mk-figure">
            <div className="mk-figure-label">LAST POST</div>
            <div className="mk-figure-value">{props.lastPost || '—'}</div>
          </div>
          <div className="mk-figure">
            <div className="mk-figure-label">NEXT DUE</div>
            <div className="mk-figure-value">{props.nextDue || '—'}</div>
          </div>
        </div>
      </section>

      {note ? (
        <p className={note.ok ? 'kit-notice kit-notice-good' : 'form-error'}>{note.message}</p>
      ) : null}

      {/* 2 */}
      <section className="portal-group">
        <div className="portal-group-title">DRAFT A MEMO</div>
        <form action={memoAction} className="mk-form">
          <label className="form-row">
            <span>What the League Office is saying</span>
            <textarea
              name="body"
              rows="6"
              maxLength={MAX_BODY}
              value={body}
              onChange={function (e) {
                setBody(e.target.value);
              }}
            />
          </label>
          <p className="kit-row-meta">
            {left} characters left. Robo adds his own opening and sign-off, so write the substance
            only. Markdown works: <code>**bold**</code>, <code>*italic*</code>, line breaks.
          </p>
          <label className="form-row">
            <span>When</span>
            <select name="delay" defaultValue="now">
              <option value="now">Now &mdash; on the next sweep, within five minutes</option>
              <option value="tonight">Tonight &mdash; 8:00 PM ET</option>
              <option value="tomorrow">Tomorrow morning &mdash; 9:00 AM ET</option>
            </select>
          </label>
          <p className="kit-notice mk-notice-warn">
            This goes to the whole channel. Robo cannot send a private message to one owner &mdash;
            a webhook only speaks in public.
          </p>
          <div className="mk-form-actions">
            <Pending label="Give it to Robo" busy="Queueing…" cta />
          </div>
        </form>
        {memo.status === 'error' ? <p className="form-error">{memo.message}</p> : null}
        {memo.status === 'done' ? <p className="kit-notice kit-notice-good">{memo.message}</p> : null}
      </section>

      {/* 3 */}
      <section className="portal-group">
        <div className="portal-group-title">DRAFTED</div>
        {props.memos.length === 0 ? (
          <p className="mk-empty">Nothing drafted.</p>
        ) : (
          <div className="kit-rows">
            {props.memos.map(function (m) {
              return (
                <div className="kit-row" key={m.memo_id}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {m.posted ? 'Posted' : 'Queued'}
                      {m.posted ? null : <span className="kit-chip kit-chip-live">PENDING</span>}
                    </div>
                    <div className="kit-row-meta">
                      {m.when}
                      {' · '}
                      {m.body.length > 140 ? m.body.slice(0, 140) + '…' : m.body}
                    </div>
                  </div>
                  {m.posted ? null : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={function () {
                        pull(m.memo_id);
                      }}
                    >
                      Pull it
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4 */}
      <section className="portal-group">
        <div className="portal-group-title">COMING UP</div>
        <p className="kit-row-meta">
          Every calendar notice due in the next thirty days. An event with no exact time gets the
          seven-day and one-day notices only &mdash; Robo will not announce an hour the calendar row
          does not have.
        </p>
        {props.upcoming.length === 0 ? (
          <p className="mk-empty">Nothing on the calendar in the next thirty days.</p>
        ) : (
          <div className="kit-rows">
            {props.upcoming.map(function (u) {
              return (
                <div className="kit-row" key={u.broadcast_key}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {u.title}
                      {u.posted ? <span className="kit-chip">SAID</span> : null}
                    </div>
                    <div className="kit-row-meta">
                      {KIND_LABEL[u.kind] || u.kind}
                      {' · he speaks '}
                      {u.due}
                      {' · event '}
                      {u.starts}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5 */}
      <section className="portal-group">
        <div className="portal-group-title">ON THE WIRE</div>
        {props.feed.length === 0 ? (
          <p className="mk-empty">He has not said anything yet.</p>
        ) : (
          <div className="kit-rows">
            {props.feed.map(function (f) {
              return (
                <div className="kit-row" key={f.broadcast_key}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">{KIND_LABEL[f.kind] || f.kind}</div>
                    <div className="kit-row-meta" style={{ whiteSpace: 'pre-wrap' }}>
                      {f.when}
                      {'\n'}
                      {f.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6 */}
      <section className="portal-group">
        <div className="portal-group-title">WHAT GOES ON THE WIRE</div>
        <p className="kit-row-meta">
          Muting a kind stops it being queued from that moment. Anything already said stays said, and
          anything muted for more than 24 hours is never caught up when you switch it back on.
        </p>
        <div className="kit-rows">
          {props.kinds.map(function (k) {
            return (
              <div className="kit-row" key={k.kind}>
                <div className="kit-row-main">
                  <div className="kit-row-title">
                    {KIND_LABEL[k.kind] || k.kind}
                    {k.enabled ? <span className="kit-chip kit-chip-live">ON</span> : <span className="kit-chip">MUTED</span>}
                  </div>
                  <div className="kit-row-meta">{k.note}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={function () {
                    toggle(k.kind, !k.enabled);
                  }}
                >
                  {k.enabled ? 'Mute' : 'Unmute'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
