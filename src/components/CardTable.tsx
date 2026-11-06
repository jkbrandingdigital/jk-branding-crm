/*
  A table that stops being a table on a phone.

  A register of eight columns is the right shape on a monitor. On a
  phone it is 820px of table in a 360px window, so it sits in a
  sideways scroller and is read a third at a time: the name is on one
  screen and the hours are on the next, and nobody can hold a row in
  their head across that gap.

  Below lg each row becomes a card: one line per column, the column's
  name on the left and the value on the right. Nothing is dropped and
  nothing is summarised — the same cells, stacked.

  Using it takes two things:

    1. `${CARD_TABLE}` added to the <table>, and any `min-w-[...]` on it
       moved behind the breakpoint (`lg:min-w-[820px]`). Left as it is,
       that width still applies in card mode and the page scrolls
       sideways with nothing in the overflow.

    2. `data-label` on each <td>, saying what its column header says.
       That is what the card prints down the left. A cell that is the
       row's title (a name, a subject) is better with no label at all —
       pass data-label="" and it prints the value alone.

  ── Why this is only display, gaps and a ::before ──

  Tailwind decides what CSS to build by reading these files as text, and
  when two classes on one element set the same property — a `py-1` here
  and the `py-3` already in the markup — which one wins is decided by
  the order Tailwind happened to write them into the stylesheet, not by
  the order they are written in the className. A rule that looks right
  in review and lands wrong in the build is the worst kind, because
  nothing in the diff shows it.

  So this sets only properties the tables do not set themselves:
  display, flex alignment, gap, border-radius, ring, margin, and a
  ::before that is entirely its own. Padding, colour, size and
  alignment on the cells are left exactly as each table already has
  them — which is also why the card's inset comes from the cells' own
  px rather than from padding on the row.

  The lg: versions do overlap with the mobile ones on purpose; there
  the breakpoint settles it, which Tailwind does guarantee.
*/
export const CARD_TABLE = [
  /* ── on a phone: not a table ── */
  'block',
  '[&_thead]:hidden',
  '[&_tbody]:block',
  '[&_tr]:mb-2.5 [&_tr]:block [&_tr]:rounded-xl [&_tr]:bg-[#171717] [&_tr]:ring-1 [&_tr]:ring-[#242424]',
  '[&_td]:flex [&_td]:items-baseline [&_td]:justify-between [&_td]:gap-4',
  /* The column's name, down the left of the card. Its own property,
     its own colour — nothing in the tables touches a ::before. */
  '[&_td]:before:shrink-0',
  '[&_td]:before:text-left',
  '[&_td]:before:text-xs',
  '[&_td]:before:font-normal',
  '[&_td]:before:text-gray-500',
  '[&_td]:before:content-[attr(data-label)]',

  /* ── from lg: exactly the table it was ── */
  'lg:table',
  'lg:[&_thead]:table-header-group',
  'lg:[&_tbody]:table-row-group',
  'lg:[&_tr]:mb-0 lg:[&_tr]:table-row lg:[&_tr]:rounded-none lg:[&_tr]:bg-transparent lg:[&_tr]:ring-0',
  'lg:[&_td]:table-cell',
  'lg:[&_td]:before:hidden',
].join(' ')