'use client';

import { useEffect, useState } from 'react';
import { loadOwnerProfileForEdit, saveOwnerProfile } from './ownerInfoActions';

// THE EDIT FORM SENDS EVERY FIELD, EVERY TIME.
//
// save_owner_profile() replaces the row rather than patching it, so a field
// left out of the payload is CLEARED, not left alone. That is deliberate --
// a patch-shaped write would give an owner no way to blank a field he had
// filled in by mistake. The consequence is that this form must always hold
// and resend the complete set, which is why it loads the raw row first and
// never opens on an empty state.
//
// THE TOGGLES SIT BESIDE THEIR FIELDS, NOT IN A PRIVACY PANEL. An owner
// should be able to see what he is exposing at the moment he types it. A
// separate panel is a second screen to remember to visit, and the field most
// likely to be over-shared is the one typed while the panel is closed.

const PREFERRED_OPTIONS = [
  { value: '', label: 'No preference' },
  { value: 'discord', label: 'Discord' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'text', label: 'Text message' },
  { value: 'email', label: 'Email' },
  { value: 'sleeper', label: 'Sleeper DM' },
  { value: 'app', label: 'In this app' },
];

function Toggle(props) {
  return (
    <label className="oi-toggle">
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={function (e) {
          props.onChange(e.target.checked);
        }}
      />
      <span>{props.checked ? 'Visible to the league' : 'Hidden from other owners'}</span>
    </label>
  );
}

export default function OwnerInfoDialog(props) {
  const owner = props.owner;
  const onClose = props.onClose;
  const onSaved = props.onSaved;

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(null);

  useEffect(
    function () {
      function onKey(e) {
        if (e.key === 'Escape' && !working) onClose();
      }
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    },
    [onClose, working]
  );

  useEffect(
    function () {
      let live = true;
      // Own card is loaded with a null id so the database resolves the caller
      // itself. Passing an id explicitly for your own row would work, but it
      // makes the client the authority on who you are.
      const targetId = owner.is_self ? null : owner.owner_id;

      loadOwnerProfileForEdit(targetId)
        .then(function (r) {
          if (!live) return;
          if (!r.ok) {
            setError(r.message);
            return;
          }
          const p = r.profile;
          setZones(r.timeZones || []);
          setForm({
            full_name: p.full_name || '',
            contact_email: p.contact_email || '',
            phone: p.phone || '',
            sleeper_username: p.sleeper_username || '',
            discord_username: p.discord_username || '',
            whatsapp_name: p.whatsapp_name || '',
            time_zone: p.time_zone || '',
            preferred_contact: p.preferred_contact || '',
            favorite_nfl_team: p.favorite_nfl_team || '',
            owner_since_year: p.owner_since_year === null || p.owner_since_year === undefined
              ? ''
              : String(p.owner_since_year),
            bio: p.bio || '',
            open_to_trade_talks: p.open_to_trade_talks !== false,
            show_full_name: p.show_full_name !== false,
            show_contact_email: p.show_contact_email === true,
            show_phone: p.show_phone === true,
            show_sleeper_username: p.show_sleeper_username !== false,
            show_discord_username: p.show_discord_username !== false,
            show_whatsapp_name: p.show_whatsapp_name !== false,
            show_time_zone: p.show_time_zone !== false,
          });
        })
        .catch(function (err) {
          if (live) setError('Could not reach the server: ' + (err.message || 'unknown error'));
        })
        .finally(function () {
          if (live) setLoading(false);
        });

      return function () {
        live = false;
      };
    },
    [owner]
  );

  function set(field, value) {
    setForm(function (prev) {
      const next = Object.assign({}, prev);
      next[field] = value;
      return next;
    });
  }

  function useBrowserZone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) set('time_zone', tz);
    } catch (err) {
      setError('This browser could not report a time zone. Pick one from the list.');
    }
  }

  function handleSave() {
    setWorking(true);
    setError('');
    const targetId = owner.is_self ? null : owner.owner_id;

    saveOwnerProfile(targetId, form)
      .then(function (r) {
        if (!r.ok) {
          setError(r.message);
          return;
        }
        onSaved(owner.team_name);
      })
      .catch(function (err) {
        setError('Could not reach the server: ' + (err.message || 'unknown error'));
      })
      .finally(function () {
        setWorking(false);
      });
  }

  // The stored zone may not be in the list (the list excludes Etc/* and the
  // legacy trees). Adding it keeps a select from silently changing a value
  // the owner never touched.
  const zoneNames = zones.map(function (z) {
    return z.name;
  });
  const needsOwnZone = form && form.time_zone && zoneNames.indexOf(form.time_zone) === -1;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true">
        <h2 className="modal-title">
          {owner.is_self ? 'Your owner information' : 'Owner information — ' + owner.team_name}
        </h2>

        {!owner.is_self && (
          <div className="oi-edit-warn">
            You are editing <strong>{owner.team_name}</strong>&rsquo;s information as an officer,
            not your own. This is recorded in the commissioner action log with a before and
            after snapshot.
          </div>
        )}

        {loading && <p className="empty-note">Loading&hellip;</p>}

        {error && <div className="form-error">{error}</div>}

        {form && (
          <>
            <div className="modal-section">
              <div className="oi-form-field">
                <label htmlFor="oi-name">Name</label>
                <input
                  id="oi-name"
                  type="text"
                  maxLength={80}
                  value={form.full_name}
                  disabled={working}
                  onChange={function (e) {
                    set('full_name', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_full_name}
                  disabled={working}
                  onChange={function (v) {
                    set('show_full_name', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-sleeper">Sleeper name</label>
                <input
                  id="oi-sleeper"
                  type="text"
                  maxLength={40}
                  value={form.sleeper_username}
                  disabled={working}
                  onChange={function (e) {
                    set('sleeper_username', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_sleeper_username}
                  disabled={working}
                  onChange={function (v) {
                    set('show_sleeper_username', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-discord">Discord name</label>
                <input
                  id="oi-discord"
                  type="text"
                  maxLength={40}
                  value={form.discord_username}
                  disabled={working}
                  onChange={function (e) {
                    set('discord_username', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_discord_username}
                  disabled={working}
                  onChange={function (v) {
                    set('show_discord_username', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-whatsapp">WhatsApp name</label>
                <input
                  id="oi-whatsapp"
                  type="text"
                  maxLength={60}
                  value={form.whatsapp_name}
                  disabled={working}
                  onChange={function (e) {
                    set('whatsapp_name', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_whatsapp_name}
                  disabled={working}
                  onChange={function (v) {
                    set('show_whatsapp_name', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-email">
                  Contact email &mdash; separate from the address you sign in with
                </label>
                <input
                  id="oi-email"
                  type="email"
                  maxLength={254}
                  value={form.contact_email}
                  disabled={working}
                  onChange={function (e) {
                    set('contact_email', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_contact_email}
                  disabled={working}
                  onChange={function (v) {
                    set('show_contact_email', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-phone">Phone</label>
                <input
                  id="oi-phone"
                  type="text"
                  maxLength={32}
                  value={form.phone}
                  disabled={working}
                  onChange={function (e) {
                    set('phone', e.target.value);
                  }}
                />
                <Toggle
                  checked={form.show_phone}
                  disabled={working}
                  onChange={function (v) {
                    set('show_phone', v);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-tz">
                  Time zone &mdash; drives the clock on your card
                </label>
                <select
                  id="oi-tz"
                  value={form.time_zone}
                  disabled={working}
                  onChange={function (e) {
                    set('time_zone', e.target.value);
                  }}
                >
                  <option value="">Not set</option>
                  {needsOwnZone && <option value={form.time_zone}>{form.time_zone}</option>}
                  {zones.map(function (z) {
                    return (
                      <option key={z.name} value={z.name}>
                        {z.label}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className="btn btn-quiet"
                  style={{ marginTop: 6 }}
                  disabled={working}
                  onClick={useBrowserZone}
                >
                  Use this device&rsquo;s time zone
                </button>
                <Toggle
                  checked={form.show_time_zone}
                  disabled={working}
                  onChange={function (v) {
                    set('show_time_zone', v);
                  }}
                />
              </div>
            </div>

            <div className="modal-section">
              <p className="empty-note">
                Everything below is visible to the whole league. It is colour, not
                contact detail, so it carries no hide switch.
              </p>

              <div className="oi-form-field">
                <label htmlFor="oi-pref">Best way to reach you</label>
                <select
                  id="oi-pref"
                  value={form.preferred_contact}
                  disabled={working}
                  onChange={function (e) {
                    set('preferred_contact', e.target.value);
                  }}
                >
                  {PREFERRED_OPTIONS.map(function (o) {
                    return (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-since">Owner since (year)</label>
                <input
                  id="oi-since"
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.owner_since_year}
                  disabled={working}
                  onChange={function (e) {
                    set('owner_since_year', e.target.value);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-fav">Favourite NFL team</label>
                <input
                  id="oi-fav"
                  type="text"
                  maxLength={40}
                  value={form.favorite_nfl_team}
                  disabled={working}
                  onChange={function (e) {
                    set('favorite_nfl_team', e.target.value);
                  }}
                />
              </div>

              <div className="oi-form-field">
                <label htmlFor="oi-bio">Anything else (500 characters)</label>
                <textarea
                  id="oi-bio"
                  rows={3}
                  maxLength={500}
                  value={form.bio}
                  disabled={working}
                  onChange={function (e) {
                    set('bio', e.target.value);
                  }}
                />
              </div>

              <label className="modal-check">
                <input
                  type="checkbox"
                  checked={form.open_to_trade_talks}
                  disabled={working}
                  onChange={function (e) {
                    set('open_to_trade_talks', e.target.checked);
                  }}
                />
                <span>
                  <strong>Open to trade talks</strong>
                  <span className="empty-note" style={{ display: 'block' }}>
                    A label on your card, nothing more. It does not stop anyone
                    proposing a trade to you.
                  </span>
                </span>
              </label>
            </div>

            <div className="page-actions">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={onClose}
                disabled={working}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={handleSave} disabled={working}>
                {working ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
