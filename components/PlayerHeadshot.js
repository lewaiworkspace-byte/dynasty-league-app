'use client';

import { useState } from 'react';
import { headshotUrl, playerInitials } from '../lib/playerHeadshot';

// A PLAYER'S PHOTO -- September 21 2026. The roster rows and the Player Card.
//
// Same contract as the Matchup page's face (Phase 2G-2): Sleeper's CDN by URL,
// nothing downloaded or stored, a plain <img> rather than next/image (which
// would need sleepercdn.com in next.config.js, and that file belongs to the
// PWA batch).
//
// THE INITIALS ARE ALWAYS DRAWN and the image covers them only once it has
// loaded. Sleeper answers 403, not a placeholder, for players it has no
// picture of, so onError hides the <img> and the initials are what remains --
// never a broken-image icon.
//
// size: 'sm' (roster row, 40px, Sleeper's thumb) | 'lg' (Player Card, 96px,
// the full file -- it is the one image on that page).

export default function PlayerHeadshot(props) {
  const [broken, setBroken] = useState(false);
  const big = props.size === 'lg';
  const url = headshotUrl(props.sleeperPlayerId, big ? 'full' : 'thumb');

  return (
    <span className={'rp-face' + (big ? ' is-lg' : '')} aria-hidden="true">
      <span className="rp-face-fallback">{playerInitials(props.fullName)}</span>
      {url && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="rp-face-img"
          src={url}
          alt=""
          loading={big ? 'eager' : 'lazy'}
          onError={function () {
            setBroken(true);
          }}
        />
      )}
    </span>
  );
}
