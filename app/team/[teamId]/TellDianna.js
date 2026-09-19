'use client';

import { useEffect, useState } from 'react';
import { insiderSubmit, searchPlayersForDianna, listPicksForDianna } from './insiderActions';

// TELL DIANNA -- the submission form. Spec v0.8 section 4.4; the artboard
// "Tell Dianna -- the submission" on the EDFL App Structure canvas.
//
// SIX STEPS, ONE CLAIM:
//   1  who or what        a player (search), a draft pick (list), a prospect (board)
//   2  what about him     acquire / shop / sign_fa / release / draft -- greyed
//                         where the subject cannot take it
//   3  whose move         my own, or someone else's (IT-3: then leak only)
//   4  optional           what you'd give, what you want back -- free text
//   5  how hard she goes  leak / off the record / on the record, with a preview
//   6  when               now / tonight / this week
//
// THE FORM DECIDES NOTHING. Every combination it greys out is refused again
// by insider_submit() with a sentence, and every combination it allows is
// checked there against the roster, the pick board and the prospect class.
// The greying is a courtesy so the owner is not surprised by the database.
//
// NOTHING HERE READS THE WATCHLIST. Not to pre-fill, not to suggest, not to
// show. WL-10 is a ruling and the absence of that read is the enforcement.

const SUBJECTS = [
  { key: 'player', label: 'Player' },
  { key: 'pick', label: 'Draft pick' },
  { key: 'prospect', label: 'Prospect' },
];

const DIRECTIONS = [
  { key: 'acquire', label: 'I want him', subjects: ['player', 'pick'] },
  { key: 'shop', label: 'I’d move him', subjects: ['player', 'pick'] },
  { key: 'sign_fa', label: 'I’m going after him', subjects: ['player'] },
  { key: 'release', label: 'I might cut him', subjects: ['player'] },
  { key: 'draft', label: 'I want him in the draft', subjects: ['prospect'] },
];

const TIERS = [
  {
    key: 'leak',
    label: 'Leak it to her',
    chip: 'RUMOUR',
    blurb: 'She prints it as a rumour. No name, no source, no promises. If two of you say the same thing she gets louder.',
  },
  {
    key: 'off_record',
    label: 'Off the record',
    chip: 'CONFIRMED · SOURCE PROTECTED',
    blurb: 'She reports it as confirmed and refuses to say who told her. Rates Likely on Mort’s Thoughts.',
  },
  {
    key: 'on_record',
    label: 'On the record',
    chip: 'CONFIRMED · YOUR NAME',
    blurb: 'She reports it as confirmed and says your team said so. Rates Confirmed.',
  },
];

const DELAYS = [
  { key: 'now', label: 'Now' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'this_week', label: 'This week' },
];

function verbFor(direction, subject) {
  switch (direction) {
    case 'acquire':
      return 'wants ' + subject;
    case 'shop':
      return 'would move ' + subject + ' for the right offer';
    case 'sign_fa':
      return 'is going after ' + subject;
    case 'release':
      return 'is thinking about cutting ' + subject + ' loose';
    case 'draft':
      return 'has eyes on ' + subject + ' come draft day';
    default:
      return '';
  }
}

function previewFor(tier, actor, verb) {
  if (tier === 'on_record') {
    return actor + ' says it, on the record: they ' + verb.replace(/^is /, 'are ').replace(/^has /, 'have ') + '. Bold of you to put your name on it. I like bold.';
  }
  if (tier === 'off_record') {
    return 'I can confirm ' + actor + ' ' + verb + '. And no, I’m not saying who told me — a girl keeps some things to herself.';
  }
  return 'I’m hearing ' + actor + ' ' + verb + '. Don’t ask me who said it. I’m not telling.';
}

export default function TellDianna(props) {
  const [subjectKind, setSubjectKind] = useState('player');
  const [subject, setSubject] = useState(null); // {id, label, holderTeamId}
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picks, setPicks] = useState(null);
  const [direction, setDirection] = useState('shop');
  const [aboutTeamId, setAboutTeamId] = useState('');
  const [willing, setWilling] = useState('');
  const [seeking, setSeeking] = useState('');
  const [tier, setTier] = useState('off_record');
  const [delay, setDelay] = useState('tonight');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const third = aboutTeamId !== '';
  const effectiveTier = third ? 'leak' : tier;

  // Picks load once, the first time the subject is switched to them.
  useEffect(
    function () {
      if (subjectKind !== 'pick' || picks !== null) return;
      let cancelled = false;
      listPicksForDianna().then(function (res) {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.message);
          setPicks([]);
          return;
        }
        setPicks(res.rows);
      });
      return function () {
        cancelled = true;
      };
    },
    [subjectKind, picks]
  );

  // The player search fires on a short pause, never per keystroke.
  useEffect(
    function () {
      if (subjectKind !== 'player') return;
      const q = query.trim();
      if (q.length < 2) {
        setResults([]);
        return;
      }
      let cancelled = false;
      const handle = setTimeout(function () {
        setSearching(true);
        searchPlayersForDianna(q).then(function (res) {
          if (cancelled) return;
          setSearching(false);
          setResults(res.ok ? res.rows : []);
          if (!res.ok) setError(res.message);
        });
      }, 250);
      return function () {
        cancelled = true;
        clearTimeout(handle);
      };
    },
    [query, subjectKind]
  );

  function pickSubject(kind) {
    setSubjectKind(kind);
    setSubject(null);
    setQuery('');
    setResults([]);
    setError(null);
    setDirection(kind === 'prospect' ? 'draft' : 'shop');
  }

  const actorName = third
    ? (props.teams.find(function (t) {
        return t.id === aboutTeamId;
      }) || {}).name || 'that team'
    : props.teamName;
  const subjectLabel = subject ? subject.label : subjectKind === 'pick' ? 'that pick' : 'him';
  const preview = previewFor(effectiveTier, actorName, verbFor(direction, subjectLabel));
  const showBlockNote = direction === 'shop' && subjectKind === 'player' && !third;

  async function submit(e) {
    e.preventDefault();
    if (!subject) {
      setError('Pick a player, a pick or a prospect first.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await insiderSubmit({
      subjectKind: subjectKind,
      subjectId: subject.id,
      direction: direction,
      aboutTeamId: third ? aboutTeamId : null,
      veracity: effectiveTier,
      willingToGive: willing,
      seeking: seeking,
      delay: delay,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDone(res.data);
    if (props.onDone) props.onDone(res.data);
  }

  return (
    <form className="mk-form it-form" onSubmit={submit}>
      <h3 className="section-heading it-section">Tell Dianna</h3>
      <p className="kit-row-meta it-lead">
        One claim per submission. You choose how hard she reports it. It does not have to be true.
      </p>

      {/* 1 */}
      <div className="it-step">
        <div className="it-step-label">1 &middot; WHO OR WHAT</div>
        <div className="it-seg" role="group" aria-label="Subject">
          {SUBJECTS.map(function (s) {
            return (
              <button
                type="button"
                key={s.key}
                className={'it-seg-btn' + (subjectKind === s.key ? ' is-on' : '')}
                aria-pressed={subjectKind === s.key}
                onClick={function () {
                  pickSubject(s.key);
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {subjectKind === 'player' ? (
          <div className="mk-finder">
            <label className="form-row">
              <span className="it-visually-hidden">Search players</span>
              <input
                type="search"
                value={query}
                placeholder="Search any player"
                onChange={function (e) {
                  setQuery(e.target.value);
                  setSubject(null);
                }}
              />
            </label>
            {subject ? <p className="kit-row-meta">Chosen: {subject.label}</p> : null}
            {searching ? <p className="kit-row-meta">Searching&hellip;</p> : null}
            {!subject && results.length > 0 ? (
              <div className="mk-finder-results kit-rows">
                {results.map(function (r) {
                  const where = r.is_free_agent ? 'Free agent' : r.edfl_team || 'Unknown team';
                  const label = r.full_name + ' (' + r.position + (r.nfl_team ? ', ' + r.nfl_team : '') + ')';
                  return (
                    <button
                      type="button"
                      className="kit-row it-result"
                      key={r.player_id}
                      onClick={function () {
                        setSubject({ id: r.player_id, label: label, holderTeamId: r.edfl_team_id || null });
                        setResults([]);
                      }}
                    >
                      <div className="kit-row-main">
                        <div className="kit-row-title">{label}</div>
                        <div className="kit-row-meta">{where}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {subjectKind === 'pick' ? (
          <label className="form-row">
            <span>Which pick</span>
            <select
              value={subject ? subject.id : ''}
              onChange={function (e) {
                const row = (picks || []).find(function (p) {
                  return p.pick_id === e.target.value;
                });
                setSubject(row ? { id: row.pick_id, label: 'the ' + row.label, holderTeamId: row.current_team_id } : null);
              }}
            >
              <option value="">{picks === null ? 'Loading picks…' : 'Choose a pick'}</option>
              {(picks || []).map(function (p) {
                return (
                  <option value={p.pick_id} key={p.pick_id}>
                    {p.label} &middot; held by {p.current_team_name}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}

        {subjectKind === 'prospect' ? (
          <label className="form-row">
            <span>Which prospect</span>
            {props.prospectsError ? <span className="form-error">{props.prospectsError}</span> : null}
            <select
              value={subject ? subject.id : ''}
              disabled={!props.prospects || props.prospects.length === 0}
              onChange={function (e) {
                const row = (props.prospects || []).find(function (p) {
                  return p.prospect_id === e.target.value;
                });
                setSubject(row ? { id: row.prospect_id, label: row.full_name + ' (' + row.position + (row.college ? ', ' + row.college : '') + ')', holderTeamId: null } : null);
              }}
            >
              <option value="">
                {!props.prospects || props.prospects.length === 0
                  ? 'The board is empty until the next class is published'
                  : 'Choose a prospect'}
              </option>
              {(props.prospects || []).map(function (p) {
                return (
                  <option value={p.prospect_id} key={p.prospect_id}>
                    {p.espn_overall_rank ? '#' + p.espn_overall_rank + ' ' : ''}
                    {p.full_name} &middot; {p.position}
                    {p.college ? ' · ' + p.college : ''}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
      </div>

      {/* 2 */}
      <div className="it-step">
        <div className="it-step-label">2 &middot; WHAT ABOUT HIM</div>
        <div className="it-seg it-seg-wrap" role="group" aria-label="Direction">
          {DIRECTIONS.map(function (d) {
            const ok = d.subjects.indexOf(subjectKind) >= 0;
            return (
              <button
                type="button"
                key={d.key}
                className={'it-seg-btn' + (direction === d.key && ok ? ' is-on' : '') + (ok ? '' : ' is-off')}
                aria-pressed={direction === d.key && ok}
                disabled={!ok}
                onClick={function () {
                  setDirection(d.key);
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {showBlockNote ? (
          <p className="kit-notice it-block-note">
            <strong>Shopping a player you hold puts him on the block for 14 days</strong> the moment
            you submit &mdash; whatever tier you pick below. The block is about the player; the tier
            is about you.
          </p>
        ) : null}
      </div>

      {/* 3 */}
      <div className="it-step">
        <div className="it-step-label">3 &middot; WHOSE MOVE IS IT</div>
        <label className="form-row">
          <span>Whose move</span>
          <select
            value={aboutTeamId}
            onChange={function (e) {
              setAboutTeamId(e.target.value);
            }}
          >
            <option value="">My own move ({props.teamName})</option>
            {props.teams.map(function (t) {
              return (
                <option value={t.id} key={t.id}>
                  Someone else&rsquo;s: {t.name}
                </option>
              );
            })}
          </select>
        </label>
        {third ? (
          <p className="kit-row-meta">
            Talking about someone else&rsquo;s plans? She will only take it as a <strong>leak</strong>.
            You cannot put another owner on or off the record.
          </p>
        ) : null}
      </div>

      {/* 4 */}
      <div className="it-step">
        <div className="it-step-label">4 &middot; OPTIONAL &mdash; MOST PEOPLE SKIP THIS</div>
        <label className="form-row">
          <span>What you&rsquo;d give</span>
          <textarea
            rows={2}
            maxLength={280}
            value={willing}
            placeholder="e.g. a 2027 second and a flyer"
            onChange={function (e) {
              setWilling(e.target.value);
            }}
          />
        </label>
        <label className="form-row">
          <span>What you want back</span>
          <textarea
            rows={2}
            maxLength={280}
            value={seeking}
            placeholder="e.g. a 2027 first, nothing less"
            onChange={function (e) {
              setSeeking(e.target.value);
            }}
          />
        </label>
        <p className="kit-row-meta">Your words, printed as your words. Nothing here is parsed as money.</p>
      </div>

      {/* 5 */}
      <div className="it-step">
        <div className="it-step-label">5 &middot; HOW HARD SHE GOES</div>
        <div className="it-tiers">
          {TIERS.map(function (t) {
            const locked = third && t.key !== 'leak';
            const on = effectiveTier === t.key;
            return (
              <button
                type="button"
                key={t.key}
                className={'it-tier' + (on ? ' is-on' : '') + (locked ? ' is-off' : '')}
                aria-pressed={on}
                disabled={locked}
                onClick={function () {
                  setTier(t.key);
                }}
              >
                <span className="it-tier-head">
                  <span className="it-tier-label">{t.label}</span>
                  <span className={'kit-chip' + (t.key === 'off_record' ? ' it-chip-brass' : t.key === 'on_record' ? ' kit-chip-good' : '')}>{t.chip}</span>
                </span>
                <span className="kit-row-meta">{locked ? 'Not available for someone else’s move.' : t.blurb}</span>
              </button>
            );
          })}
        </div>
        <div className="mk-item it-preview">
          <div className="it-preview-head">
            <img className="it-avatar it-avatar-sm" src="/insider-threat/dianna.png" alt="" width="26" height="26" />
            <span className="it-step-label">HOW SHE&rsquo;LL SAY IT</span>
          </div>
          <p className="it-report-body">{preview}</p>
          <p className="kit-row-meta">
            Roughly. She has a few ways of putting each of these, and the names are always filled in
            from the record, never from her.
          </p>
        </div>
      </div>

      {/* 6 */}
      <div className="it-step">
        <div className="it-step-label">6 &middot; WHEN SHE PRINTS IT</div>
        <div className="it-seg" role="group" aria-label="Delay">
          {DELAYS.map(function (d) {
            return (
              <button
                type="button"
                key={d.key}
                className={'it-seg-btn' + (delay === d.key ? ' is-on' : '')}
                aria-pressed={delay === d.key}
                onClick={function () {
                  setDelay(d.key);
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <p className="kit-row-meta">
          Tonight is 9 PM Eastern. This week is a random evening two to six days out.
        </p>
      </div>

      <p className="kit-notice">
        <strong>Once she&rsquo;s said it, she&rsquo;s said it.</strong> You can withdraw a submission
        before it prints; after that it stays in the channel. It drops off Mort&rsquo;s Thoughts after
        14 days, or sooner if you pull it.
      </p>

      {error ? <p className="form-error">{error}</p> : null}
      {done ? <p className="kit-notice kit-notice-good">Dianna has it.</p> : null}

      <div className="mk-form-actions">
        <button type="submit" className="btn kit-cta" disabled={busy || !subject}>
          {busy ? 'Sending…' : 'Send it to Dianna'}
        </button>
      </div>
    </form>
  );
}
