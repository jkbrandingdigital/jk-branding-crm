import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock3, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { mins } from './taskUtils'

/*
  Asking for more time on a job.

  Every hour of active time past the allowance takes 20 points off. Not
  all of that overrun is the designer's doing — the client moved the
  brief halfway, the content turned up late, two urgent jobs landed on
  one afternoon. With nowhere to say so, there is exactly one way out
  left, and it is to keep the timer switched off. Then the whole day's
  record is a lie and the penalty was the thing that bought it.

  So: the designer asks, a project coordinator or admin decides, and an
  approved allowance is added to this one task. The work type's standard
  time is never touched — that is the yardstick for every job of its
  kind, and bending it here would quietly re-score months of finished
  work.

  The button only appears to whoever the job is actually assigned to.
  It asks the database that rather than taking the caller's word, so a
  coordinator reading someone else's task is not shown a button that
  would only fail.
*/

type Pending = { id: string; minutes: number; reason: string; created_at: string }

const PICKS = [15, 30, 60, 120]

export default function ExtraTimeRequest({
  taskId, allowedMins, spentMins, locked = false, onChanged,
}: {
  taskId: string
  allowedMins: number | null
  spentMins: number
  locked?: boolean
  onChanged?: () => void
}) {
  const [mine, setMine] = useState(false)
  const [extra, setExtra] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState(30)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [a, t, q] = await Promise.all([
      supabase.from('task_assignees').select('user_id')
        .eq('task_id', taskId).eq('user_id', user.id).eq('is_current', true).maybeSingle(),
      supabase.from('tasks').select('extra_mins').eq('id', taskId).maybeSingle(),
      supabase.from('task_time_requests').select('id, minutes, reason, created_at')
        .eq('task_id', taskId).eq('status', 'pending').maybeSingle(),
    ])
    setMine(Boolean(a.data))
    setExtra(Number((t.data as { extra_mins?: number } | null)?.extra_mins ?? 0))
    setPending((q.data ?? null) as Pending | null)
  }, [taskId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  async function send() {
    if (!reason.trim()) return setErr('Say why the extra time is needed.')
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('task_request_time', {
      p_task: taskId,
      p_minutes: minutes,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) return setErr(error.message)
    setOpen(false)
    setReason('')
    void load()
    onChanged?.()
  }

  // Already granted — worth saying, because the allowed time on screen
  // does not include it and the two would not add up otherwise.
  if (extra > 0 && !pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-400" title="Approved extra time on this task">
        <Clock3 size={12} /> +{mins(extra)} allowed
      </span>
    )
  }

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-300" title={pending.reason}>
        <Clock3 size={12} /> +{mins(pending.minutes)} asked · waiting
      </span>
    )
  }

  // Nothing to ask against if the job has no standard time, and nothing
  // to ask for once it is closed.
  if (!mine || locked || !allowedMins) return null

  const left = allowedMins - spentMins

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ask for more time on this job"
        className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-gray-400 hover:text-white"
      >
        <Clock3 size={12} /> More time
      </button>

      {open && createPortal(
        /*
          Centred, and portalled to <body>.

          The task drawer carries backdrop-blur, and backdrop-filter makes
          that element the containing block for any position:fixed inside
          it — so a dialog rendered in place gets clipped by the drawer's
          own scroll. This has caught us twice before.
        */
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Clock3 size={15} className="text-orange-400" /> Ask for more time
              </h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-xs text-gray-500">
                {mins(allowedMins)} allowed · {mins(spentMins)} spent
                {left > 0 ? ` · ${mins(left)} left` : ` · over by ${mins(-left)}`}
              </p>

              {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">How much more</label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {PICKS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMinutes(m)}
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        minutes === m ? 'bg-orange-500 font-medium text-black' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'
                      }`}
                    >
                      {mins(m)}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  aria-label="Minutes"
                  className={input}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Why</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Client changed the brief after the first draft"
                  className={`${input} resize-y`}
                />
                <p className="mt-1.5 text-xs text-gray-600">
                  A coordinator or admin decides. Until then the job is measured on its usual time.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
                Cancel
              </button>
              <button
                onClick={send}
                disabled={busy || !reason.trim() || minutes < 1}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Send
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}