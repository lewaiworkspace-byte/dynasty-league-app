'use client';

import { useState } from 'react';
import PlayerLink from '../../components/PlayerLink';

// The prospect board's table. Filters are client state over rows the server
// already read; nothing here fetches. Grade is a bare score (SR-63) and is
// drawn in the PPV colour because it is the same kind of thing: a rating,
// never a price.

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];

export default function ProspectBoard(props) {
  const [pos, setPos] = useState('ALL');

  const rows = props.rows.filter(function (r) {
    return pos === 'ALL' || r.position === pos;
  });

  if (!props.classYear) {
    return (
      <div className="mk-item">
        <p className="mk-empty">
          No prospect class is open.
          {props.lastRolledYear ? ' The ' + props.lastRolledYear + ' class was rolled after the rookie draft.' : ''}{' '}
          The board fills when ESPN publishes the next class and the commissioner loads it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="kit-strip mk-figures">
        <div className="mk-figure">
          <div className="mk-figure-label">CLASS</div>
          <div className="mk-figure-value">{props.classYear}</div>
        </div>
        <div className="mk-figure">
          <div className="mk-figure-label">ON THE BOARD</div>
          <div className="mk-figure-value">{props.rows.length}</div>
        </div>
        {props.refreshed ? (
          <div className="mk-figure">
            <div className="mk-figure-label">REFRESHED</div>
            <div className="mk-figure-value it-figure-sm">{props.refreshed}</div>
          </div>
        ) : null}
      </div>
      <p className="kit-row-meta it-lead">
        The board rolls to the next class after the EDFL rookie draft closes. A prospect Sleeper has
        added shows his Sleeper record beside him; a rumour about him follows him there.
      </p>

      <div className="it-filters" role="group" aria-label="Filter by position">
        {POSITIONS.map(function (p) {
          return (
            <button
              type="button"
              key={p}
              className={'it-filter' + (pos === p ? ' is-on' : '')}
              aria-pressed={pos === p}
              onClick={function () {
                setPos(p);
              }}
            >
              {p}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? <p className="mk-empty">Nobody at that position on the board.</p> : null}

      {rows.length > 0 ? (
        <>
          <div className="mk-colhead">
            <span className="it-col-rank">#</span>
            <span className="mk-colhead-main">PROSPECT</span>
            <span className="mk-colhead-fig it-col-grade">GRADE</span>
            <span className="mk-colhead-fig it-col-pos">POS</span>
          </div>
          <div className="kit-rows">
            {rows.map(function (r) {
              const meta = [r.position, r.college, [r.height, r.weight].filter(Boolean).join(' · ')]
                .filter(Boolean)
                .join(' · ');
              const drafted = r.draft_round
                ? 'NFL: R' + r.draft_round + (r.draft_overall ? ' #' + r.draft_overall : '') + (r.nfl_team ? ' ' + r.nfl_team : '')
                : null;
              return (
                <div className="kit-row" key={r.prospect_id}>
                  <span className="it-col-rank">{r.espn_overall_rank || '—'}</span>
                  <div className="kit-row-main">
                    <div className="kit-row-title">
                      {r.matched_player_id ? (
                        <PlayerLink playerId={r.matched_player_id}>{r.full_name}</PlayerLink>
                      ) : (
                        r.full_name
                      )}
                      {r.matched_player_id ? <span className="it-dir">IN SLEEPER</span> : null}
                    </div>
                    <div className="kit-row-meta">
                      {meta}
                      {drafted ? ' · ' + drafted : ''}
                    </div>
                  </div>
                  <span className="it-col-grade it-grade">{r.espn_grade == null ? '—' : String(r.espn_grade)}</span>
                  <span className="it-col-pos kit-row-meta">
                    {r.espn_position_rank ? r.position + r.espn_position_rank : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="kit-row-meta it-foot">
        To put a draft rumour on one of these, go to your Team HQ &rarr; Media &rarr; Tell Dianna and
        choose Prospect. You cannot propose for a prospect, only talk about him.
      </p>
    </div>
  );
}
