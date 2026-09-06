'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import OwnerInfoDialog from './OwnerInfoDialog';

// THE OWNER DIRECTORY, MOUNTED ON TWO SURFACES.
//
// Login-gated, not commissioner-gated -- the same shape as /restructure. The
// tab button is not drawn at all for a signed-out visitor, and owner_directory()
// refuses the read as well, so there are two independent gates and the database
// one is the real gate.
//
// editScope IS THE ONLY DIFFERENCE BETWEEN THE TWO MOUNTS, AND IT EXISTS
// BECAUSE OF THE SEPTEMBER 4 STANDING RULE.
//
//   'self' -- /team/[teamId]. An owner edits his own card and nobody else's,
//             INCLUDING the commissioner. A Teams surface treats the
//             commissioner as an ordinary owner; that rule was written after a
//             team page became the place a commissioner cut somebody else's
//             player, and the first draft of this feature broke it again by
//             drawing an "Edit as officer" button here.
//   'all'  -- /admin/owner-activity. Officer editing lives on the Admin
//             surface, the same move cut-from-any-roster made to /admin/cuts.
//
// THIS IS A DRAWING DECISION, NOT A GATE. save_owner_profile() permits an
// officer to edit any card from anywhere and will keep permitting it -- that is
// correct, because the admin surface needs it. Narrowing the client is what
// keeps the capability in one place; it is not what makes it safe.
//
// EVERY MASKING DECISION WAS ALREADY MADE IN THE DATABASE. owner_directory()
// returns NULL for a field this viewer may not see, and names that field in
// hidden_fields. Nothing in this file decides who sees what, and nothing here
// may start to -- a client copy of the visibility rules would be a second
// place to keep in step with the toggles, and it would be the copy that leaks.
//
// hidden_fields is the whole reason a masked field reads differently from an
// empty one. Without it, "Discord — not set" and "Discord — hidden by owner"
// are the same NULL, and an owner chasing a trade cannot tell whether to ask.

const BUCKET_LABEL = {
  today: 'Active today',
  this_week: 'Active this week',
  over_a_week: 'Not seen in a week',
  never: 'Never signed in',
};

// Amber, not red, for over_a_week. A quiet owner is a fact worth showing, not
// a fault -- the status-bad treatment is reserved for "never signed in", which
// is the one that actually needs somebody to do something about it.
const BUCKET_CLASS = {
  today: 'status status-good',
  this_week: 'status status-off',
  over_a_week: 'status status-live',
  never: 'status status-bad',
};

const PREFERRED_LABEL = {
  discord: 'Discord',
  whatsapp: 'WhatsApp',
  email: 'Email',
  text: 'Text message',
  sleeper: 'Sleeper DM',
  app: 'In this app',
};

function offsetPhrase(ownerOffsetMinutes, viewerOffsetMinutes) {
  if (ownerOffsetMinutes === null || ownerOffsetMinutes === undefined) return null;
  if (viewerOffsetMinutes === null) return null;
  const diff = ownerOffsetMinutes - viewerOffsetMinutes;
  if (diff === 0) return 'same time as you';
  const hours = Math.abs(diff) / 60;
  const rounded = Math.round(hours * 10) / 10;
  const unit = rounded === 1 ? ' hour ' : ' hours ';
  return rounded + unit + (diff > 0 ? 'ahead of you' : 'behind you');
}

// A live clock that is hydration-safe.
//
// The first render on the server and the first render in the browser both use
// serverTime, the value edfl_local_clock() produced. Only after mount does the
// browser start formatting the time itself. Computing the initial value in the
// browser would make server HTML and client HTML disagree and React would
// discard the whole subtree.
//
// After mount the time is formatted with Intl and the IANA zone name, never
// from utc_offset_minutes. The offset is a snapshot taken when the row was
// read; the zone name handles its own DST transition. The offset is still
// carried, and is used only for the "3 hours behind you" phrase, where being
// an hour stale for a few weeks in November is harmless.
function OwnerClock(props) {
  const timeZone = props.timeZone;
  const [display, setDisplay] = useState(props.serverTime || null);
  const [viewerOffset, setViewerOffset] = useState(null);

  useEffect(
    function () {
      if (!timeZone) return undefined;

      function tick() {
        try {
          setDisplay(
            new Date().toLocaleTimeString('en-US', {
              timeZone: timeZone,
              hour: 'numeric',
              minute: '2-digit',
            })
          );
        } catch (err) {
          // An unrecognised zone in this browser's ICU data. Leave whatever
          // the server rendered rather than blanking a working clock.
        }
      }

      tick();
      const id = setInterval(tick, 10000);
      return function () {
        clearInterval(id);
      };
    },
    [timeZone]
  );

  useEffect(function () {
    try {
      setViewerOffset(-new Date().getTimezoneOffset());
    } catch (err) {
      setViewerOffset(null);
    }
  }, []);

  if (!timeZone) {
    return <span className="oi-clock-none">time zone not set</span>;
  }

  const phrase = offsetPhrase(props.offsetMinutes, viewerOffset);

  return (
    <span className="oi-clock">
      <span className="oi-clock-time">{display || '—'}</span>
      <span className="oi-clock-zone">
        {timeZone.replace(/_/g, ' ')}
        {phrase ? ' · ' + phrase : ''}
      </span>
    </span>
  );
}

function CopyButton(props) {
  const [done, setDone] = useState(false);

  function copy() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(props.value).then(
      function () {
        setDone(true);
        setTimeout(function () {
          setDone(false);
        }, 1500);
      },
      function () {
        // Clipboard denied. The value is on screen and selectable; a failed
        // copy is not worth an error message.
      }
    );
  }

  return (
    <button type="button" className="oi-copy" onClick={copy} aria-label={'Copy ' + props.label}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

// One contact line. Three states, and they are three different sentences:
//   a value            -> show it, with a copy control or a link
//   hidden by owner    -> say so; do not go and ask him for it
//   nothing stored     -> "not set"; asking him is exactly the right move
function Field(props) {
  const value = props.value;
  const hidden = props.hidden;

  let body;
  if (value) {
    body = (
      <span className="oi-value">
        {props.href ? (
          <a href={props.href}>{value}</a>
        ) : (
          <span>{value}</span>
        )}
        <CopyButton value={value} label={props.label} />
      </span>
    );
  } else if (hidden) {
    body = <span className="oi-muted">hidden by owner</span>;
  } else {
    body = <span className="oi-muted">not set</span>;
  }

  return (
    <div className="oi-field">
      <span className="oi-label">{props.label}</span>
      {body}
    </div>
  );
}

export default function OwnerInfoPanel(props) {
  const rows = props.rows || [];
  const loadError = props.loadError;
  // Defaults to the narrower scope on purpose. A new mount that forgets to
  // pass editScope gets self-edit only, never officer editing by accident.
  const editScope = props.editScope === 'all' ? 'all' : 'self';
  const [editing, setEditing] = useState(null);
  const [flash, setFlash] = useState('');
  const router = useRouter();

  if (loadError) {
    return (
      <div className="form-error">
        Owner information could not be loaded: {loadError}. Nothing below is reliable.
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="empty-note">No owner information to show.</p>;
  }

  function hiddenHas(row, field) {
    return Array.isArray(row.hidden_fields) && row.hidden_fields.indexOf(field) !== -1;
  }

  // Read off the viewer's own row rather than taken as a prop -- the row is
  // already here, and a prop would be a second copy of a fact the directory
  // already carries.
  const self = rows.filter(function (r) {
    return r.is_self;
  })[0];
  const viewerIsOfficer = Boolean(self && (self.is_commissioner || self.is_co_commissioner));

  return (
    <div>
      <style>{OWNER_INFO_CSS}</style>

      <p className="empty-note oi-intro">
        Visible to signed-in owners only. Each owner controls which of his own
        contact details the league can see; the commissioner and co-commissioner
        see all of them. Last-active is shown to the league as a rough band, never
        as a time.
      </p>

      {/*
        Said once, at the top, rather than as a disabled button on nine cards.
        An officer on a team page should know the capability exists and where it
        lives -- a control that is simply absent teaches nothing.
      */}
      {editScope === 'self' && viewerIsOfficer && (
        <p className="empty-note oi-intro">
          You can edit your own card here. Editing another owner&rsquo;s card is on{' '}
          <a href="/admin/owner-activity">Owner Administration</a>, which is where
          every officer control lives.
        </p>
      )}

      {flash && <div className="form-notice">{flash}</div>}

      <div className="oi-grid">
        {rows.map(function (r) {
          return (
            <div className={'oi-card' + (r.is_self ? ' is-self' : '')} key={r.owner_id}>
              <div className="oi-card-head">
                <div>
                  <h3 className="oi-team">
                    <a href={'/team/' + r.team_id}>{r.team_name}</a>
                    {r.is_self && <span className="void-tag"> YOU</span>}
                  </h3>
                  <p className="oi-name">
                    {r.full_name ? (
                      r.full_name
                    ) : hiddenHas(r, 'full_name') ? (
                      <span className="oi-muted">name hidden by owner</span>
                    ) : (
                      <span className="oi-muted">name not set</span>
                    )}
                    {r.is_commissioner && <span className="oi-role">Commissioner</span>}
                    {r.is_co_commissioner && <span className="oi-role">Co-Commissioner</span>}
                  </p>
                </div>
                <span className={BUCKET_CLASS[r.last_active_bucket] || 'status status-off'}>
                  {BUCKET_LABEL[r.last_active_bucket] || r.last_active_bucket}
                </span>
              </div>

              <div className="oi-clock-row">
                <OwnerClock
                  timeZone={hiddenHas(r, 'time_zone') ? null : r.time_zone}
                  serverTime={r.local_time_now}
                  offsetMinutes={r.utc_offset_minutes}
                />
                {hiddenHas(r, 'time_zone') && (
                  <span className="oi-muted"> (time zone hidden by owner)</span>
                )}
              </div>

              <div className="oi-fields">
                <Field
                  label="Sleeper"
                  value={r.sleeper_username}
                  hidden={hiddenHas(r, 'sleeper_username')}
                />
                <Field
                  label="Discord"
                  value={r.discord_username}
                  hidden={hiddenHas(r, 'discord_username')}
                />
                <Field
                  label="WhatsApp"
                  value={r.whatsapp_name}
                  hidden={hiddenHas(r, 'whatsapp_name')}
                />
                <Field
                  label="Email"
                  value={r.contact_email}
                  hidden={hiddenHas(r, 'contact_email')}
                  href={r.contact_email ? 'mailto:' + r.contact_email : null}
                />
                <Field
                  label="Phone"
                  value={r.phone}
                  hidden={hiddenHas(r, 'phone')}
                  href={r.phone ? 'tel:' + r.phone.replace(/[^+0-9]/g, '') : null}
                />
                {/*
                  The account address, shown only on your own card and to the
                  officers. It is never exposed by a toggle -- it is the
                  credential half of the login, not a way to reach somebody.
                */}
                {r.login_email && (
                  <div className="oi-field">
                    <span className="oi-label">Login</span>
                    <span className="oi-value">
                      <span>{r.login_email}</span>
                      <span className="oi-muted"> (account address, never shown to the league)</span>
                    </span>
                  </div>
                )}
              </div>

              {(r.preferred_contact || r.favorite_nfl_team || r.owner_since_year) && (
                <div className="oi-chips">
                  {r.preferred_contact && (
                    <span className="oi-chip">
                      Best reached: {PREFERRED_LABEL[r.preferred_contact] || r.preferred_contact}
                    </span>
                  )}
                  {r.owner_since_year && <span className="oi-chip">Owner since {r.owner_since_year}</span>}
                  {r.favorite_nfl_team && <span className="oi-chip">{r.favorite_nfl_team}</span>}
                </div>
              )}

              {r.bio && <p className="oi-bio">{r.bio}</p>}

              <div className="oi-card-foot">
                <span className={r.open_to_trade_talks ? 'oi-trade-open' : 'oi-trade-shut'}>
                  {r.open_to_trade_talks ? 'Open to trade talks' : 'Not taking trade offers'}
                </span>
                {r.viewer_can_edit && (editScope === 'all' || r.is_self) && (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={function () {
                      setEditing(r);
                    }}
                  >
                    {r.is_self ? 'Edit' : 'Edit as officer'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <OwnerInfoDialog
          owner={editing}
          onClose={function () {
            setEditing(null);
          }}
          onSaved={function (name) {
            setEditing(null);
            setFlash('Saved ' + name + '.');
            // saveOwnerProfile() already revalidated the route on the server;
            // this pulls the new server render into the open page so the card
            // the owner just edited is not still showing what he replaced.
            router.refresh();
            if (props.onSaved) props.onSaved();
          }}
        />
      )}
    </div>
  );
}

// Scoped to this feature and deliberately NOT added to app/globals.css.
//
// globals.css is 34 KB and imported by every page; a rewrite of it to add one
// card grid is a large diff across a shared file for a self-contained feature.
// Every class here is oi- prefixed so nothing can collide, and every colour is
// an existing custom property, so light and dark themes follow the app with no
// second palette to keep in step. If this styling is ever wanted elsewhere,
// move it into globals.css then -- not before.
const OWNER_INFO_CSS = [
  '.oi-intro{margin:0 0 18px;}',
  '.oi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;}',
  '.oi-card{border:1px solid var(--border);border-radius:10px;background:var(--bg-elevated);padding:16px 18px;}',
  '.oi-card.is-self{border-color:var(--accent);}',
  '.oi-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}',
  '.oi-team{margin:0;font-size:1.05rem;}',
  '.oi-team a{color:var(--text);text-decoration:none;}',
  '.oi-team a:hover{text-decoration:underline;}',
  '.oi-name{margin:2px 0 0;color:var(--text-dim);font-size:0.9rem;}',
  '.oi-role{display:inline-block;margin-left:8px;font-size:0.72rem;letter-spacing:0.04em;',
  'text-transform:uppercase;color:var(--accent);border:1px solid var(--border-strong);',
  'border-radius:4px;padding:1px 5px;}',
  '.oi-clock-row{margin:12px 0 10px;padding:8px 10px;border-radius:8px;',
  'background:var(--bg);border:1px solid var(--border);}',
  '.oi-clock{display:flex;flex-direction:column;gap:1px;}',
  '.oi-clock-time{font-size:1.35rem;font-variant-numeric:tabular-nums;line-height:1.1;}',
  '.oi-clock-zone{font-size:0.78rem;color:var(--text-dim);}',
  '.oi-clock-none{font-size:0.85rem;color:var(--text-dim);font-style:italic;}',
  '.oi-fields{display:flex;flex-direction:column;gap:5px;}',
  '.oi-field{display:flex;gap:10px;align-items:baseline;font-size:0.88rem;}',
  '.oi-label{flex:0 0 74px;color:var(--text-dim);font-size:0.76rem;',
  'text-transform:uppercase;letter-spacing:0.04em;}',
  '.oi-value{display:inline-flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-width:0;}',
  '.oi-value a{color:var(--accent);}',
  '.oi-muted{color:var(--text-dim);font-style:italic;}',
  '.oi-copy{border:1px solid var(--border);background:transparent;color:var(--text-dim);',
  'border-radius:4px;font-size:0.68rem;padding:0 5px;cursor:pointer;line-height:1.6;}',
  '.oi-copy:hover{border-color:var(--border-strong);color:var(--text);}',
  '.oi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}',
  '.oi-chip{font-size:0.75rem;color:var(--text-dim);border:1px solid var(--border);',
  'border-radius:999px;padding:2px 9px;}',
  '.oi-bio{margin:10px 0 0;font-size:0.86rem;color:var(--text-dim);}',
  '.oi-card-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;',
  'margin-top:14px;padding-top:12px;border-top:1px solid var(--border);}',
  '.oi-trade-open{font-size:0.78rem;color:var(--c-cash);}',
  '.oi-trade-shut{font-size:0.78rem;color:var(--text-dim);}',
  '.oi-edit-warn{border:1px solid var(--st-live-br);background:var(--st-live-bg);',
  'color:var(--st-live-fg);border-radius:6px;padding:10px 12px;font-size:0.86rem;margin-bottom:14px;}',
  '.oi-toggle{display:flex;align-items:center;gap:6px;font-size:0.74rem;color:var(--text-dim);',
  'margin-top:3px;}',
  '.oi-form-field{margin-bottom:14px;}',
  '.oi-form-field label{display:block;font-size:0.8rem;color:var(--text-dim);margin-bottom:3px;}',
  '.oi-form-field input[type=text],.oi-form-field input[type=email],',
  '.oi-form-field input[type=number],.oi-form-field select,.oi-form-field textarea',
  '{width:100%;padding:7px 9px;border:1px solid var(--border-strong);border-radius:6px;',
  'background:var(--bg);color:var(--text);font:inherit;font-size:0.9rem;}',
  '@media (max-width:560px){.oi-grid{grid-template-columns:1fr;}',
  '.oi-field{flex-direction:column;gap:0;}.oi-label{flex:none;}}',
].join('');
