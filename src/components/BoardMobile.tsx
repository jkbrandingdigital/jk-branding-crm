import { useEffect, useRef, useState } from 'react'

/*
  A kanban board on a phone.

  Six stages side by side is the right shape on a monitor and the wrong
  one on a phone. A 288px column on a 360px screen leaves the next one
  peeking in from the right, so every card is read at two-thirds width
  with a sliver of the neighbour beside it, and getting from New to
  Confirm is four sideways flicks with nothing telling you how far
  along you are.

  So below lg the board shows one stage at a time, full width, with a
  row of stage chips above it. The chips carry the counts, which is the
  thing the sideways scroll could never show: how much is sitting in
  each stage without going to look.

  From lg up nothing changes. The same columns, the same widths, the
  same horizontal scroll.

  Colours stay as class names, except a stage's own colour, which comes
  out of the database as a hex value and has always been applied as a
  style — the light theme in theme.css re-paints classes, and a stage
  colour is not a theme colour.
*/

export type PickerStage = {
  id: string
  name: string
  /* The stage's own colour from the database, if it has one. */
  color?: string | null
  /* How many cards are in it. */
  count?: number
}

/*
  Which stage the phone is showing.

  Nothing on a desktop uses this — the chips and the hidden columns are
  both behind the lg breakpoint, so on a monitor this is a piece of
  state that sits there unread. It still has to be set, because the
  window can be narrowed at any moment and the board has to already
  know which column it would show.

  It follows the stage list: the first stage to start with, and if the
  one being shown disappears — the list reloads, someone deletes a
  stage — it falls back to the first rather than leaving the board
  blank with no way to tell why.
*/
export function useBoardStage(stages: { id: string }[]) {
  const [stageId, setStageId] = useState<string | null>(null)

  useEffect(() => {
    if (stages.length === 0) {
      if (stageId !== null) setStageId(null)
      return
    }
    if (!stageId || !stages.some((s) => s.id === stageId)) setStageId(stages[0].id)
  }, [stages, stageId])

  return [stageId, setStageId] as const
}

/*
  The row of stage chips, above the board. Phone only.

  It scrolls sideways, because eight stage names do not fit across a
  phone and shortening them to three letters each would make them
  guesses. The one you are on is pulled into the middle whenever it
  changes, so tapping the chip at the right edge does not leave the
  next one off-screen.
*/
export function StagePicker({
  stages,
  active,
  onPick,
  className = '',
}: {
  stages: PickerStage[]
  active: string | null
  onPick: (id: string) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]')
    /* block: 'nearest' matters — without it this scrolls the whole page
       vertically to centre a chip that was already in view. */
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])

  if (stages.length === 0) return null

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label="Stage"
      className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden ${className}`}
    >
      {stages.map((s) => {
        const on = s.id === active
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={on}
            data-active={on}
            onClick={() => onPick(s.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors ${
              on
                ? 'border-orange-500 bg-orange-500/10 font-medium text-orange-300'
                : 'border-[#2a2a2a] text-gray-400'
            }`}
          >
            {/* The stage's own dot, so the chips and the cards agree. */}
            {s.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />}
            <span className="whitespace-nowrap">{s.name}</span>
            {s.count !== undefined && (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? 'bg-orange-500/20' : 'bg-[#1f1f1f]'}`}>
                {s.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/*
  The board's sideways scroll — and nothing else.

  There is none on a phone, because there is nothing to scroll to: one
  column fills the screen. overflow-x-hidden rather than visible, since
  a card title long enough to push past the edge would otherwise give
  the whole page a horizontal scrollbar, and on a phone that means the
  layout drifts a few pixels left every time you flick down a list.

  Only the overflow, deliberately. Each board has its own gap, its own
  padding and in one case its own scrollbar colour, and a constant that
  carried a gap-4 and a pb-2 of its own would be fighting those: two
  padding utilities on one element are settled by the order Tailwind
  happened to write them into the stylesheet, not by the order they are
  written here. So the board keeps its own spacing and takes this.
*/
export const BOARD_WRAP = 'overflow-x-hidden lg:overflow-x-auto'

/*
  One column.

  On a phone only the stage being shown is in the layout at all, rather
  than merely invisible: a hidden column still renders its cards, and
  on a lead board that is eight stages of rows built on every keystroke
  of the search box.

  `width` is the width the column already had on a desktop, written out
  with the breakpoint on it — 'lg:w-72', 'lg:w-80'. In full, because
  Tailwind decides what CSS to build by reading these files as text, so
  a class assembled from a variable is never seen and never built.
*/
export function boardColumn(active: boolean, width = 'lg:w-72') {
  return [
    active ? 'flex' : 'hidden',
    'w-full min-w-0 flex-col lg:flex lg:shrink-0',
    width,
  ].join(' ')
}