import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pause, Play, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { useChartTheme } from '../../lib/chartTheme'

/*
  One person, one running task.

  Starting a task stops whatever was running before — the database does that
  in task_timer_start(), not this file, so two timers can never run at once
  even if a click goes astray.

  Two things live here:
    WorkTimerBar     the strip under the header: what is running, for how long
    TaskTimerButton  the ▶ / ⏸ on a task

  They share one listener list so pressing ▶ on a card updates the strip at
  the top of the screen straight away.
*/

/*
  Which part of a task a sitting belongs to.

  Design work comes in options — three options of a festival greeting are
  three pieces of work, each with its own allowance — and then in rounds of
  client changes. Without this, all of it lands in one pile and "47m, 18
  sittings" cannot answer "how long did option 2 take".

  null means an older sitting, from before the parts existed. Those stay
  unassigned rather than being guessed into option 1.
*/
export type TaskPartRef = { kind: 'option' | 'change'; no: number; piece?: number }

/*
  The work has two dimensions, not one.

  Five banners with two options each is ten pieces of work, and "Option
  1" on its own covers two of them. Without the piece number, 4h sat
  against "Option 1" and nobody could say which banner had eaten it.
*/
export const samePart = (a: TaskPartRef | null | undefined, b: TaskPartRef | null | undefined) =>
  (a?.kind ?? null) === (b?.kind ?? null) &&
  (a?.no ?? null) === (b?.no ?? null) &&
  // A change round has no piece, so it compares equal whatever is passed
  ((a?.kind ?? b?.kind) === 'change' || (a?.piece ?? 1) === (b?.piece ?? 1))

export type RunningTask = {
  session_id: string
  task_id: string
  task_no: number
  subject: string
  started_at: string
  today_secs: number
  part_kind: 'option' | 'change' | null
  part_no: number | null
  piece_no: number | null
  unit_name: string | null
  work_qty: number | null
}

// Why the timer stopped. The reason matters: a lot of "Urgent work came" is
// a fact about how work is handed out, not about the person it happened to.
export const PAUSE_REASONS: { key: string; label: string }[] = [
  { key: 'urgent', label: 'Urgent work came in' },
  { key: 'waiting', label: 'Waiting on content or approval' },
  { key: 'break', label: 'Break' },
  { key: 'done', label: 'Finished this one' },
  { key: 'day_end', label: 'End of day' },
]

// ---------- everyone watching the timer ----------
const watchers = new Set<() => void>()
const tellEveryone = () => watchers.forEach((w) => w())

export function useRunningTask() {
  const [running, setRunning] = useState<RunningTask | null>(null)
  const [readAt, setReadAt] = useState(Date.now())
  const [ready, setReady] = useState(false)

  const read = useCallback(async () => {
    const { data } = await supabase.rpc('my_timer')
    const row = (data ?? [])[0] as RunningTask | undefined
    setRunning(row ?? null)
    setReadAt(Date.now())
    setReady(true)
  }, [])

  useEffect(() => {
    void read()
    watchers.add(read)
    // The minutes on screen have to keep moving on their own
    const tick = setInterval(() => setRunning((r) => (r ? { ...r } : r)), 30000)
    // In case the tab sat in the background while someone else changed things
    const poll = setInterval(read, 120000)
    return () => {
      watchers.delete(read)
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [read])

  return { running, readAt, ready, refresh: read }
}

export const since = (iso: string) => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`
}

// The same thing with seconds, for the strip at the top. The small buttons
// on the cards stay on minutes on purpose: a board full of them redrawing
// every second would cost far more than it is worth.
export const sinceExact = (iso: string) => {
  const all = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const h = Math.floor(all / 3600)
  const m = Math.floor((all % 3600) / 60)
  const sec = all % 60
  const ss = String(sec).padStart(2, '0')
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s`
  if (m > 0) return `${m}m ${ss}s`
  return `${sec}s`
}

export const hhmm = (secs: number) => {
  const m = Math.max(0, Math.round(secs / 60))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

export async function startTask(taskId: string, reason = 'switched', part?: TaskPartRef | null) {
  const { error } = await supabase.rpc('task_timer_start', {
    p_task_id: taskId,
    p_reason: reason,
    p_part_kind: part?.kind ?? null,
    p_part_no: part?.no ?? null,
    p_piece_no: part?.piece ?? null,
  })
  tellEveryone()
  if (error) throw new Error(error.message)
}

export async function stopTask(reason = 'break', note = '') {
  const { error } = await supabase.rpc('task_timer_stop', { p_reason: reason, p_note: note.trim() || null })
  tellEveryone()
  if (error) throw new Error(error.message)
}

/*
  The one pause box.

  It is the same wherever a timer is stopped — the strip at the top and the
  button on a card — because a designer should not have to learn two ways to
  say the same thing. The remark is optional: a reason alone is often enough,
  and demanding a sentence every time would only teach people to type a dot.

  It opens in the middle of the screen, through a portal to <body>, rather
  than hanging off the button that opened it. A board column scrolls
  sideways and clips anything that pokes out of it, so a box anchored to a
  card was being cut in half. The middle of the screen belongs to nobody,
  so nothing can cut it.
*/
export function PausePrompt({
  onPause, onCancel, busy,
}: {
  onPause: (reason: string, note: string) => void
  onCancel: () => void
  busy?: boolean
}) {
  const [note, setNote] = useState('')
  // theme.css does not re-map every hex inside a utility class, so the
  // colours are written out for both themes rather than hoped for.
  const { dark } = useChartTheme()

  // Escape closes it, the way every other box on screen behaves.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCancel])

  const box = dark
    ? { background: '#161616', borderColor: '#2a2a2a' }
    : { background: '#ffffff', borderColor: '#e2ddd3' }
  const line = dark ? '#242424' : '#e9e4da'
  const dim = dark ? '#9ca3af' : '#6b6356'
  const field = dark
    ? { background: '#1a1a1a', borderColor: '#2a2a2a', color: '#ffffff' }
    : { background: '#fbf9f5', borderColor: '#ddd6cb', color: '#2b2722' }
  const row = dark
    ? { background: '#1b1b1b', borderColor: '#2a2a2a', color: '#e5e7eb' }
    : { background: '#fbf9f5', borderColor: '#e2ddd3', color: '#2b2722' }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Why are you stopping?"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-xl border shadow-2xl"
        style={box}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: line }}>
          <h3 className="text-sm font-semibold" style={{ color: dark ? '#ffffff' : '#2b2722' }}>
            Why are you stopping?
          </h3>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
            style={{ color: dim }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <label className="mb-1.5 block text-xs" style={{ color: dim }}>
            Remark (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What is it waiting on?"
            autoFocus
            className="mb-4 w-full rounded-lg border px-3 py-2.5 text-sm focus:border-orange-500 focus:outline-none"
            style={field}
          />

          <p className="mb-2 text-xs" style={{ color: dim }}>Pick a reason to stop</p>
          <ul className="space-y-1.5">
            {PAUSE_REASONS.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => onPause(r.key, note)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:border-orange-500/60 disabled:opacity-50"
                  style={row}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// =====================================================================
//  The strip under the header
//
//  Only shows while something is running. Nothing running means nothing on
//  screen — a bar that sits there saying "you are not working" all day is
//  nagging, and the team screen already shows who is idle.
// =====================================================================
export function WorkTimerBar() {
  const { can, ready: permsReady } = usePermissions()
  const { running, readAt } = useRunningTask()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)

  // One second, and only here. Nothing else on the page redraws with it.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (permsReady && !can('mod_work_timer')) return null
  if (!running) return null

  async function pause(reason: string, note: string) {
    setBusy(true)
    try {
      await stopTask(reason, note)
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  return (
    <div className="relative border-b border-orange-500/30 bg-orange-500/10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-8">
        <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-500" aria-hidden />
        <span className="text-orange-300">Working on</span>
        <span className="min-w-0 flex-1 truncate font-medium text-white">
          #{running.task_no} · {running.subject}
          {/* Which piece, so the strip says the same thing the task screen
              does. A designer with three options open needs to know which
              one the clock is on. */}
          {running.part_kind === 'option' && (
            <span className="ml-2 font-normal text-orange-300">
              {(running.work_qty ?? 1) > 1 && (
                <>{running.unit_name ?? 'Piece'} {running.piece_no ?? 1} · </>
              )}
              Option {running.part_no}
            </span>
          )}
          {running.part_kind === 'change' && (
            <span className="ml-2 font-normal text-orange-300">Changes · round {running.part_no}</span>
          )}
        </span>
        <span className="tabular-nums text-orange-300">{sinceExact(running.started_at)}</span>
        {/* The day's total was read a moment ago, so the time since that read
            is added on — otherwise it would sit still while the clock runs. */}
        <span className="hidden text-xs text-gray-400 sm:inline">
          today {hhmm(running.today_secs + (Date.now() - readAt) / 1000)}
        </span>
        <button
          onClick={() => setAsking((a) => !a)}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
          Pause
        </button>
      </div>

      {/* The box puts itself in the middle of the screen, so there is
          nothing to position here. */}
      {asking && <PausePrompt onPause={pause} onCancel={() => setAsking(false)} busy={busy} />}
    </div>
  )
}

// =====================================================================
//  The ▶ / ⏸ on a task
// =====================================================================
export function TaskTimerButton({
  taskId,
  part,
  size = 'sm',
  label,
  onChanged,
}: {
  taskId: string
  // Which option or change round this button starts. Left out on the board
  // and in the header, where the button means "this task" and the sitting
  // is recorded without a part.
  part?: TaskPartRef | null
  size?: 'sm' | 'md'
  label?: string
  onChanged?: () => void
}) {
  const { can, ready: permsReady } = usePermissions()
  const { running } = useRunningTask()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [asking, setAsking] = useState(false)
  const [, tick] = useState(0)

  // A button that names a part is only "the running one" when that same part
  // is running. Without this every option on the task would light up together.
  const runningPart: TaskPartRef | null = running?.part_kind
    ? { kind: running.part_kind, no: running.part_no ?? 1, piece: running.piece_no ?? 1 }
    : null
  const isThisOne =
    running?.task_id === taskId && (part === undefined || samePart(runningPart, part))
  const somethingElse = !!running && !isThisOne

  // Only the card that is actually running keeps a one-second clock, and only
  // one task can run at a time — so at most one card on the board redraws per
  // second, however many cards are on screen.
  useEffect(() => {
    if (!isThisOne) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [isThisOne])

  if (permsReady && !can('mod_work_timer')) return null

  // Stopping always asks why, here as well as in the strip — the same box,
  // so there is only one thing to learn.
  async function click(e: React.MouseEvent) {
    e.stopPropagation()
    if (isThisOne) return setAsking((a) => !a)

    setBusy(true)
    setErr('')
    try {
      // Pressing ▶ while another task runs is the normal case, not a mistake:
      // that other one is paused as "urgent", which is what actually happened.
      await startTask(taskId, somethingElse ? 'urgent' : 'switched', part ?? null)
      onChanged?.()
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function pause(reason: string, note: string) {
    setBusy(true)
    setErr('')
    try {
      await stopTask(reason, note)
      onChanged?.()
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }

  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'
  const icon = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'

  return (
    <span className="relative inline-block" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={click}
        disabled={busy}
        title={err || (isThisOne ? 'Pause this task' : somethingElse ? 'Start this and pause the other one' : 'Start working on this')}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border font-medium tabular-nums transition-colors disabled:opacity-50 ${pad} ${
          isThisOne
            ? 'border-orange-500/50 bg-orange-500/15 text-orange-300 hover:bg-orange-500/25'
            : 'border-[#2a2a2a] text-gray-400 hover:border-green-600/50 hover:text-green-400'
        }`}
      >
        {busy ? (
          <Loader2 className={`${icon} animate-spin`} />
        ) : isThisOne ? (
          <Pause className={icon} />
        ) : (
          <Play className={icon} />
        )}
        {isThisOne ? sinceExact(running.started_at) : label ?? 'Start'}
      </button>

      {asking && <PausePrompt onPause={pause} onCancel={() => setAsking(false)} busy={busy} />}
    </span>
  )
}