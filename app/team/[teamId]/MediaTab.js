'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PlayerLink from '../../../components/PlayerLink';
import TellDianna from './TellDianna';
import { insiderWithdraw } from './insiderActions';

// MEDIA -- INSIDER THREAT. Rule 7.9, September 19 2026. Spec v0.8 sections
// 4.3, 4.4, 8.2 and 8.3. Drawn on the owner's OWN Team HQ only (MEDIA-1);
// page.js passes media=null for every other viewer and TeamCapSheet does not
// draw the tab.
//
// THREE STACKED SECTIONS, in the order the commissioner asked for them:
//   1. Dianna's feed        what she has printed in #insider-threat, newest first
//   2. Tell Dianna          the form (TellDianna.js), behind the one neon button
//   3. Mort's Thoughts      the table: one row per (asset, direction), rated
//
// WHAT THIS COMPONENT NEVER KNOWS. Who leaked what. insider_feed and
// morts_thoughts are DEFINER views that project a source only for an
// on-the-record item; the leak and off-the-record rows arrive with no team on
// them and there is nothing here that could put one back. The owner's OWN
// submissions come from insider_live filtered to is_mine, so he can withdraw
// them -- that is the only place a source appears, and it is his own.
//
// NUMBERS. There are none. Days left and source counts are integers from the
// view; nothing here is money and nothing is formatted as money. The
// free-text "what they'd give" / "asking price" lines are the owner's words
// and are printed as his words inside Dianna's copy (spec 8.4).

const VERACITY_CHIP = {
  leak: { label: 'Rumour', className: 'kit-chip' },
  off_record: { label: 'Confirmed · source protected', className: 'kit-chip it-chip-brass' },
  on_record: { label: 'Confirmed · on the record', className: 'kit-chip kit-chip-good' },
};

const STRENGTH_LABEL = {
  multiple: 'multiple owners are saying',
  league: 'the whole league is talking',
};

const RATING_CHIP = {
  maybe: { label: 'Maybe', className: 'kit-chip' },
  likely: { label: 'Likely', className: 'kit-chip it-chip-brass' },
  confirmed: { label: 'Confirmed', className: 'kit-chip kit-chip-good' },
};

const DIRECTION_LABEL = {
  acquire: 'WANTED',
  shop: 'SHOPPING',
  sign_fa: 'FA TARGET',
  release: 'CUT WATCH',
  draft: 'DRAFT',
};

const FILTERS = [
  { key: 'all', label: 'ALL' },
  { key: 'shop', label: 'SHOPPING' },
  { key: 'acquire', label: 'WANTED' },
  { key: 'sign_fa', label: 'FA' },
  { key: 'release', label: 'CUTS' },
  { key: 'draft', label: 'DRAFT' },
];

function stripTag(content) {
  // Dianna's copy opens with a `TAG` line the chip already says. Show the rest.
  const nl = (content || '').indexOf('\n');
  if (nl < 0) return content || '';
  const first = content.slice(0, nl);
  if (first.startsWith('`') && first.endsWith('`')) return content.slice(nl + 1);
  return content;
}

export default function MediaTab(props) {
  const media = props.media;
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [withdrawError, setWithdrawError] = useState(null);

  async function withdraw(id) {
    setBusyId(id);
    setWithdrawError(null);
    const res = await insiderWithdraw(id);
    setBusyId(null);
    if (!res.ok) {
      setWithdrawError(res.message);
      return;
    }
    router.refresh();
  }

  const thoughts = (media.thoughts || []).filter(function (t) {
    return filter === 'all' || t.direction === filter;
  });

  return (
    <div className="it-media">
      {/* ---- INSIDER THREAT ------------------------------------------------ */}
      <div className="it-head">
        <div>
          <p className="eyebrow">Media &middot; Rule 7.9</p>
          <h2 className="it-title">Insider Threat</h2>
        </div>
        {/* THE ONE NEON THING ON THIS TAB. Propose buttons below are secondary
            on purpose: ten neon buttons in a table is a wall, not an action. */}
        <button
          type="button"
          className={'btn' + (showForm ? ' btn-quiet' : ' kit-cta')}
          onClick={function () {
            setShowForm(!showForm);
          }}
          aria-expanded={showForm}
        >
          {showForm ? 'Close' : 'Tell Dianna'}
        </button>
      </div>

      <div className="it-dianna kit-notice">
        <img className="it-avatar" src="/insider-threat/dianna.png" alt="" width="44" height="44" />
        <div>
          <div className="kit-row-title">
            Dianna <span className="it-muted">&middot; reporting in #insider-threat</span>
          </div>
          <div className="kit-row-meta">
            She prints what owners tell her. Some of it is true. Leak it, go off the record, or go
            on the record &mdash; you pick how hard she goes.
          </div>
        </div>
      </div>

      {showForm ? (
        <TellDianna
          teamName={media.teamName}
          teams={media.teams}
          prospects={media.prospects}
          prospectsError={media.prospectsError}
          onDone={function () {
            setShowForm(false);
            router.refresh();
          }}
        />
      ) : null}

      {/* ---- MY LIVE SUBMISSIONS ------------------------------------------ */}
      {media.mineError ? (
        <p className="form-error">Your submissions could not be read: {media.mineError}</p>
      ) : null}
      {media.mine && media.mine.length > 0 ? (
        <section className="edfl-hq-block">
          <h3 className="section-heading it-section">What you&rsquo;ve told her</h3>
          <div className="kit-rows">
            {media.mine.map(function (m) {
              const chip = VERACITY_CHIP[m.veracity] || VERACITY_CHIP.leak;
              return (
                <div className="kit-row" key={m.submission_id}>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {m.subject_name}
                      <span className="it-dir">{DIRECTION_LABEL[m.direction] || m.direction}</span>
                      {m.third_party && m.about_team_name ? (
                        <span className="it-dir">about {m.about_team_name}</span>
                      ) : null}
                    </div>
                    <div className="kit-row-meta">
                      <span className={chip.className}>{chip.label}</span>{' '}
                      {m.published ? 'Printed' : 'Prints ' + m.publishAfter}
                      {' · '}
                      {m.days_left} {m.days_left === 1 ? 'day' : 'days'} left
                      {m.sources > 1 ? ' · ' + m.sources + ' sources' : ''}
                      {m.placed_block ? ' · put him on the block' : ''}
                    </div>
                  </div>
                  <div className="mk-rowaction">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busyId === m.submission_id}
                      onClick={function () {
                        withdraw(m.submission_id);
                      }}
                    >
                      {busyId === m.submission_id ? 'Withdrawing…' : m.published ? 'Pull it' : 'Withdraw'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {withdrawError ? <p className="form-error">{withdrawError}</p> : null}
          <p className="kit-row-meta it-foot">
            Withdrawing before she prints means she never prints it. After, the channel keeps it
            and it leaves Mort&rsquo;s Thoughts. A block you placed by shopping a player stays up
            until you take it down on his card.
          </p>
        </section>
      ) : null}

      {/* ---- DIANNA'S FEED -------------------------------------------------- */}
      <section className="edfl-hq-block">
        <h3 className="section-heading it-section">What she&rsquo;s said</h3>
        {media.feedError ? (
          <p className="form-error">Dianna&rsquo;s feed could not be read: {media.feedError}</p>
        ) : null}
        {!media.feedError && media.feed.length === 0 ? (
          <p className="mk-empty">Nothing yet. She only prints what she is told.</p>
        ) : null}
        <div className="it-feed">
          {media.feed.map(function (f) {
            const chip = VERACITY_CHIP[f.veracity] || VERACITY_CHIP.leak;
            const sub =
              f.veracity === 'on_record' && f.attributed_team_name
                ? 'per ' + f.attributed_team_name
                : STRENGTH_LABEL[f.strength] || null;
            return (
              <article className={'mk-item it-report' + (f.withdrawn_since ? ' it-report-pulled' : '')} key={f.submission_id}>
                <div className="it-report-head">
                  <span className={chip.className}>{chip.label}</span>
                  {sub ? <span className="it-sub">{sub}</span> : null}
                  <span className="it-when">{f.when}</span>
                </div>
                <p className="it-report-body">{stripTag(f.content)}</p>
                {f.withdrawn_since ? (
                  <p className="kit-row-meta">The owner has since pulled this. The channel keeps it; the table does not.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {/* ---- MORT'S THOUGHTS ------------------------------------------------ */}
      <section className="edfl-hq-block">
        <div className="it-mort-head">
          <span className="kit-disc it-mort-disc" aria-hidden="true">M</span>
          <h3 className="section-heading it-section">Mort&rsquo;s Thoughts</h3>
        </div>
        <p className="kit-row-meta it-lead">
          Mort&rsquo;s read on Dianna&rsquo;s reporting. Nothing here is a transaction &mdash; the
          wire has those. <em>Likely</em> means an owner stood behind it without his name;{' '}
          <em>Confirmed</em> means he put his name on it. The source count never changes the rating
          &mdash; it only says how loud the room is.
        </p>

        <div className="it-filters" role="group" aria-label="Filter Mort's Thoughts">
          {FILTERS.map(function (f) {
            return (
              <button
                type="button"
                key={f.key}
                className={'it-filter' + (filter === f.key ? ' is-on' : '')}
                aria-pressed={filter === f.key}
                onClick={function () {
                  setFilter(f.key);
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {media.thoughtsError ? (
          <p className="form-error">Mort&rsquo;s Thoughts could not be read: {media.thoughtsError}</p>
        ) : null}
        {!media.thoughtsError && thoughts.length === 0 ? (
          <p className="mk-empty">Mort has nothing to add. Nothing published is live.</p>
        ) : null}

        {thoughts.length > 0 ? (
          <>
            <div className="mk-colhead">
              <span className="mk-colhead-main">ASSET &middot; WHO</span>
              <span className="mk-colhead-fig it-col-rating">RATING</span>
              <span className="mk-colhead-fig it-col-action">ACTION</span>
            </div>
            <div className="kit-rows">
              {thoughts.map(function (t) {
                const chip = RATING_CHIP[t.rating] || RATING_CHIP.maybe;
                const who =
                  t.direction === 'shop' || t.direction === 'release'
                    ? t.holder_team_name || '—'
                    : t.attributed_team_name
                    ? 'wanted by ' + t.attributed_team_name
                    : t.named_team_abbrevs
                    ? 'named: ' + t.named_team_abbrevs
                    : t.direction === 'draft'
                    ? 'unattributed'
                    : 'wanted, unattributed';
                const detail = [t.subject_position, t.subject_detail].filter(Boolean).join(' · ');
                const isPlayer = t.subject_kind === 'player' || (t.subject_kind === 'prospect' && t.prospect_matched_player_id);
                const playerId = t.subject_kind === 'player' ? t.subject_id : t.prospect_matched_player_id;
                return (
                  <div className="kit-row" key={t.subject_kind + ':' + t.subject_id + ':' + t.direction}>
                    <div className="kit-row-main">
                      <div className="kit-row-title">
                        {isPlayer ? <PlayerLink playerId={playerId}>{t.subject_name}</PlayerLink> : t.subject_name}
                        <span className="it-dir">{DIRECTION_LABEL[t.direction] || t.direction}</span>
                      </div>
                      <div className="kit-row-meta">
                        {detail ? detail + ' · ' : ''}
                        {who} &middot; {t.days_left} {t.days_left === 1 ? 'day' : 'days'} left
                      </div>
                    </div>
                    <div className="it-col-rating">
                      <span className={chip.className}>{chip.label}</span>
                      <div className="kit-row-meta">{t.sources} {t.sources === 1 ? 'source' : 'sources'}</div>
                    </div>
                    <div className="it-col-action mk-rowaction">
                      {t.can_propose ? (
                        // /trades/new takes no counterparty in the query string
                        // (spec 8.8); the owner picks the team there. Plain
                        // navigation is the phase 1 answer.
                        <a className="btn" href="/trades/new">
                          Propose
                        </a>
                      ) : t.is_my_asset ? (
                        <span className="it-yours">YOURS</span>
                      ) : (
                        <span className="it-muted">&mdash;</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        <p className="kit-notice it-foot">
          <strong>A row lives 14 days</strong>, the same as a block. Off the record reads
          &ldquo;confirmed&rdquo; in Dianna&rsquo;s copy and <em>Likely</em> here on purpose: she
          trusts her source; the table scores what the league can verify.
        </p>
      </section>
    </div>
  );
}
