'use client';

import ExplainButton from '../../../components/ExplainButton';

// SMALL PIECES THE TRADE DESK'S TWO HALVES SHARE (UI test batch 14).
// They draw columns of edfl_trade_targets() and decide nothing.

/** "thru 2027", "final year". */
export function contractWords(p) {
  if (!p) return '';
  if (p.contract_kind === 'final') return 'final year';
  return p.last_real_season ? 'thru ' + p.last_real_season : '';
}

/**
 * The five contract boxes (current season and four more; filled = signed that
 * season) and, when `explain` is set, the explain icon at the end of the line.
 * Lewis, Nov 13 2026: the boxes are explained by a small info icon at the end of
 * each row's contract line, never by printed text or a key above the list.
 */
export function ContractStrip({ p, explain }) {
  const flags = Array.isArray(p && p.seasons_signed) ? p.seasons_signed : [];
  const seasons = Array.isArray(p && p.seasons) ? p.seasons : [];
  return (
    <>
      <span className="tdk-cstrip" aria-hidden="true">
        {flags.map(function (f, i) { return <i key={i} className={f ? 'is-f' : ''} />; })}
      </span>
      {explain && seasons.length > 0 ? (
        <ExplainButton label="What the contract boxes mean" title="The contract boxes">
          <ul>
            <li>
              One box per season, {seasons[0]} to {seasons[seasons.length - 1]}. A filled box means
              he is signed for that season.
            </li>
            <li>Void seasons are not counted: he does not play in one.</li>
          </ul>
        </ExplainButton>
      ) : null}
    </>
  );
}

/** Rookie deal / Final year / injury tags after a name. */
export function PlayerTags({ p }) {
  return (
    <>
      {p.is_rookie ? <span className="tdk-tag is-rook">Rookie deal</span> : null}
      {p.contract_kind === 'final' ? <span className="tdk-tag is-rent">Final year</span> : null}
      {p.injury_short ? <span className="tdk-tag is-inj">{p.injury_short}</span> : null}
    </>
  );
}

/** "RB12" coloured by its band, the Roster tab's colours (.rc-rank). */
export function RankChip({ p }) {
  if (!p || !p.pos_rank) return <span className="tdk-norank">no 2026 rank</span>;
  return (
    <span className={'rc-rank is-' + (p.rank_band || 'r')}>
      {p.player_position}
      {p.pos_rank}
    </span>
  );
}
