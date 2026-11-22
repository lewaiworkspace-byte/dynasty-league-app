'use client';

import { Toaster } from 'sonner';

/**
 * THE ONE TOAST -- November 21, 2026 (UI test batch 31).
 *
 * Lewis watched a video on UI libraries (Griffin Wooldridge, "UI Libraries for
 * Claude Code") and asked for some of them. Sonner is the first: a toast
 * library. The Book had its own hand-rolled toast (a state variable, a timer
 * and a div); every other page confirmed an action in its own way or not at
 * all. This is the one place a toast is configured. A client component calls
 *
 *     import { toast } from 'sonner';
 *     toast.success('Bet placed');
 *
 * and nothing else is needed; this component is mounted once in app/layout.js.
 * A Server Action cannot call toast(): it returns { ok, message }, and the
 * client component that called it shows the message.
 *
 * LOOK. The colours are the Design System tokens, not Sonner's themes: the
 * toast is --ink on --surface inverted, as the Book's old one was, so it
 * follows the phone's light/dark with no theme prop. Inline custom properties
 * win over Sonner's own stylesheet, which is why they are set here and not in
 * kit.css. The type and motion rules are the November 21 block of kit.css.
 *
 * WHERE. Bottom centre, above the office bar and the TEST SITE banner. The
 * 30px is the banner and the 76px the office bar, the same sum the old Book
 * toast used. The banner exists on the ui-test branch only: the batch that
 * carries this to main drops the 30px.
 *
 * THE OFFSET IS AN OBJECT ON PURPOSE. Sonner applies a bare string or number to
 * all four sides, so `offset={ABOVE_BARS}` left a 106px gutter on the left and
 * the right and squeezed the toast to 108px wide on a 320px phone (the first
 * measurement, Nov 21). Naming only `bottom` leaves Sonner's own 24px / 16px
 * side gutters in place.
 */
const ABOVE_BARS = 'calc(30px + 76px + env(safe-area-inset-bottom))';

export default function AppToaster() {
  return (
    <Toaster
      theme="light"
      position="bottom-center"
      offset={{ bottom: ABOVE_BARS }}
      mobileOffset={{ bottom: ABOVE_BARS }}
      duration={4000}
      visibleToasts={2}
      style={{
        '--normal-bg': 'var(--ink)',
        '--normal-text': 'var(--surface)',
        '--normal-border': 'var(--ink)',
        '--border-radius': '14px',
        '--width': 'min(520px, calc(100vw - 32px))',
      }}
    />
  );
}
