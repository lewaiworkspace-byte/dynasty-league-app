// The Book's small line icons (UI test batch 24). Drawn in currentColor, decorative:
// every one sits beside words that say the same thing, so each is aria-hidden.

function Svg(props) {
  return (
    <svg
      width={props.size || 16}
      height={props.size || 16}
      viewBox={props.box || '0 0 20 20'}
      fill="none"
      stroke="currentColor"
      strokeWidth={props.w || 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

export function IconLock(props) {
  return (
    <Svg size={props.size || 13}>
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </Svg>
  );
}

export function IconBan(props) {
  return (
    <Svg size={props.size || 13}>
      <circle cx="10" cy="10" r="7" />
      <path d="M5.2 14.8 14.8 5.2" />
    </Svg>
  );
}

export function IconLeft() {
  return (
    <Svg size={18}>
      <path d="M12.5 4.5 7 10l5.5 5.5" />
    </Svg>
  );
}

export function IconRight() {
  return (
    <Svg size={18}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </Svg>
  );
}

export function IconDown(props) {
  return (
    <Svg size={props.size || 16}>
      <path d="M5 8l5 5 5-5" />
    </Svg>
  );
}

export function IconX() {
  return (
    <Svg size={18}>
      <path d="M5 5l10 10M15 5 5 15" />
    </Svg>
  );
}

export function IconInfo() {
  return (
    <Svg size={16} w={1.6}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.3" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconWarn() {
  return (
    <Svg size={16} w={1.8}>
      <path d="M10 3.5 17.5 16.5h-15z" />
      <path d="M10 8.5v3.5" />
      <circle cx="10" cy="14.2" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCheck() {
  return (
    <Svg size={16}>
      <path d="M4.5 10.5 8.5 14.5 15.5 6" />
    </Svg>
  );
}

export function IconChevron() {
  return (
    <Svg size={16}>
      <path d="M7.5 4.5 13 10l-5.5 5.5" />
    </Svg>
  );
}

// UI test batch 25 (Phase 2): the parlay slip's "Add a leg" and the Players search.
export function IconPlus(props) {
  return (
    <Svg size={props && props.size ? props.size : 16}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Svg>
  );
}

export function IconSearch() {
  return (
    <Svg size={16}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.2 13.2 3.3 3.3" />
    </Svg>
  );
}
