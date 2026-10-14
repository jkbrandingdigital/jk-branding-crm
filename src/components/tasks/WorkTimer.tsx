import { useCallback, useEffect, useState } from 'react'
import { Pause, Play, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'

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

export type RunningTask = {
  session_id: string
  task_id: string
  task_no: number
  subject: string
  started_at: string
  today_secs: number
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

export async function startTask(taskId: string, reason = 'switched') {
  const { error } = await supabase.rpc('task_timer_start', { p_task_id: taskId, p_reason: reason })
  tellEveryone()
  if (error) throw new Error(error.message)
}

export async function stopTask(reason = 'break') {
  const { error } = await supabase.rpc('task_timer_stop', { p_reason: reason })
  tellEveryone()
  if (error) throw new Error(error.message)
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

  async function pause(reason: string) {
    setBusy(true)
    try {
      await stopTask(reason)
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

      {asking && (
        <div className="absolute right-4 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg sm:right-8">
          <p className="border-b border-[#242424] px-3 py-2 text-xs text-gray-400">Why are you stopping?</p>
          <ul>
            {PAUSE_REASONS.map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => pause(r.key)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// =====================================================================
//  The ▶ / ⏸ on a task
// =====================================================================
export function TaskTimerButton({
  taskId,
  size = 'sm',
  onChanged,
}: {
  taskId: string
  size?: 'sm' | 'md'
  onChanged?: () => void
}) {
  const { can, ready: permsReady } = usePermissions()
  const { running } = useRunningTask()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [, tick] = useState(0)

  const isThisOne = running?.task_id === taskId
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

  async function click(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    setErr('')
    try {
      // Pressing ▶ while another task runs is the normal case, not a mistake:
      // that other one is paused as "urgent", which is what actually happened.
      if (isThisOne) await stopTask('break')
      else await startTask(taskId, somethingElse ? 'urgent' : 'switched')
      onChanged?.()
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-1 text-xs'
  const icon = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'

  return (
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
      {isThisOne ? sinceExact(running.started_at) : 'Start'}
    </button>
  )
}