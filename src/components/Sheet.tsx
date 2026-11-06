import type { ReactNode } from 'react'

/*
  Modal chrome, in one place.

  Every popup in this CRM is built the same way: a dark backdrop that
  closes on click, and a panel inside it that stops the click from
  getting through. On a desktop that is a box in the middle of the
  screen, and it has always looked right.

  On a phone it did not. A box capped at 92vh with padding round it
  leaves the content squeezed into the middle with grey showing top and
  bottom, and the rounded corners land in the middle of nowhere. A
  phone has no room to spare for a frame.

  So below the sm breakpoint the panel is simply the screen — full
  height, no corners, no border, flush against the bottom edge. From sm
  up it is the same centred box it always was, down to the same cap,
  the same corner radius and the same border colour, because those are
  arguments rather than fixed here. A modal passes what it already had
  and its desktop view does not move a pixel.

  The colours stay as class names because the light theme in theme.css
  re-paints classes, not inline styles — a hard-coded style here would
  stay dark when the rest of the screen turned light.
*/

/*
  The backdrop, for a modal that paints it on itself.

  items-end on a phone so the panel sits against the bottom edge,
  which is where a thumb is. p-0 because the panel is the screen.

  ...TOP is the same thing one layer up, for a modal opened from
  inside another one — Add follow-up over the lead drawer. Written out
  twice rather than built from a variable: Tailwind reads these files
  as text to decide what CSS to generate, so a class it never sees
  spelled out does not get built. `z-[${n}]` would come out right in
  the DOM with nothing behind it.
*/
export const SHEET_BACKDROP =
  'fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4'
export const SHEET_BACKDROP_TOP =
  'fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4'

/*
  The same, for a modal that paints its own backdrop as a child
  element instead — so it keeps its own shade of black rather than
  taking the one above.
*/
export const SHEET_FRAME =
  'fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6'
export const SHEET_FRAME_TOP =
  'fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4'

/*
  The panel.

  Everything a modal already had on desktop is passed in, written out
  in full with the breakpoint on it — for the same reason as above:
  spelled out in the modal's own file, Tailwind's scanner finds it.
  Assembled here from a bare '3xl' it would not exist in the CSS, and
  the sheet would be full width on a desktop with nothing in the build
  to show why.

  h-[100dvh] rather than 100vh: on iOS Safari and in the TWA, 100vh is
  the height with the address bar hidden, so the bottom of a 100vh
  sheet sits under the browser chrome and the last button is
  unreachable. dvh is the height that is actually there.

  The bottom padding is the home bar on a gesture phone. Zero on a
  desktop, and zero on any phone without one — env() resolves to 0px
  when there is no inset.

  A panel is `overflow-hidden` and a flex column, so whatever is meant
  to scroll inside it needs `min-h-0 flex-1 overflow-y-auto` and the
  header and footer need `shrink-0`. Without the min-h-0 a long list
  pushes the footer off the bottom instead of scrolling.
*/
export function sheetPanel({
  width = 'sm:max-w-2xl',
  maxH = 'sm:max-h-[92vh]',
  round = 'sm:rounded-xl',
  border = 'sm:border sm:border-[#2a2a2a]',
  bg = 'bg-[#121212]',
  extra = '',
}: {
  width?: string
  maxH?: string
  round?: string
  border?: string
  bg?: string
  extra?: string
} = {}) {
  return [
    'flex w-full flex-col overflow-hidden',
    'h-[100dvh] rounded-none border-0 pb-[env(safe-area-inset-bottom)] sm:h-auto sm:pb-0',
    bg,
    width,
    maxH,
    round,
    border,
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/*
  A sheet's own header.

  Optional — a modal that already has a header it likes keeps it. This
  one exists because a full-screen sheet has no visible edge any more,
  so without a line at the top there is nothing telling you this is a
  layer over the screen rather than the screen itself.
*/
export function SheetHeader({
  title,
  sub,
  onClose,
  right,
}: {
  title: ReactNode
  sub?: ReactNode
  onClose: () => void
  right?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-10 flex shrink-0 items-start gap-3 border-b border-[#1f1f1f] bg-[#121212] px-4 py-3 sm:px-5 sm:py-4">
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold sm:text-lg">{title}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-gray-400">{sub}</div>}
      </div>
      {right}
      {/* 44px square. Anything smaller is a miss with a thumb. */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-[#1a1a1a] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/* The scrolling middle. overscroll-contain stops a flick at the end of
   the list from dragging the page behind the sheet. */
export const SHEET_BODY = 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5'

/* The row of buttons at the bottom, if a modal has one. On a phone the
   buttons go full width and stack, because a 60px "Save" in the corner
   of a 6-inch screen is a target you miss. */
export const SHEET_FOOTER =
  'flex shrink-0 flex-col-reverse gap-2 border-t border-[#1f1f1f] px-4 py-3 sm:flex-row sm:justify-end sm:px-5'