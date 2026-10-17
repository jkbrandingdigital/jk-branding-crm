import { useCallback, useEffect, useState } from 'react'
import { Check, Clock3, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { mins } from './taskUtils'

/*
  Extra-time requests waiting on a decision.

  Shown only to whoever may actually decide — super admin, or a person
  given the "Approve extra time" switch (the project coordinator). The
  RPC checks the same thing, so this is about not showing buttons that
  would fail, not about security.

  The whole case is on the row: what the job is allowed, what has gone
  into it already, and the designer's reason in their own words. The
  decision is nearly always about whether the reason is true, and that
  question cannot be answered from a number.

  Nothing is shown when the list is empty. An empty panel on a page that
  is mostly about something else is just furniture.
*/

type Row = {
  id: string
  task_id: string
  task_no: number
  subject: string
  work_type: string | null
  designer: string | null
  minutes: number
  reason: string
  allowed_mins: number | null
  extra_mins: number
  spent_mins: number
  created_at: string
}

export default function ExtraTimeInbox({ onDecided }: { onDecided?: () => void }) {
  const { can, isSuper, ready } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})

  const mayDecide = isSuper || can('extra_time_approve')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('task_time_requests_open')
    if (error) return setErr(error.message)
    setErr('')
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => {
    if (!ready || !mayDecide) return
    void load()
  }, [ready, mayDecide, load])

  async function decide(id: string, approve: boolean) {
    setBusy(id)
    const { error } = await supabase.rpc('task_decide_time', {
      p_request: id,
      p_approve: approve,
      p_note: notes[id]?.trim() || null,
    })
    setBusy(null)
    if (error) return setErr(error.message)
    setErr('')
    await load()
    onDecided?.()
  }

  if (!ready || !mayDecide) return null
  if (rows.length === 0 && !err) return null

  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 font-medium text-white">
          <Clock3 size={16} className="text-amber-300" />
          Extra time asked for
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">{rows.length}</span>
        </h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Approved minutes are added to that one job's allowance, so the overrun penalty does not
          count them. The work type's standard time stays as it is.
        </p>
      </div>

      {err && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

      <ul className="space-y-3">
        {rows.map((r) => {
          const allowed = r.allowed_mins ?? 0
          const over = allowed > 0 && r.spent_mins > allowed
          return (
            <li key={r.id} className="rounded-lg border border-[#242424] bg-[#151515] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">
                    <span className="text-gray-500">#{r.task_no}</span> {r.subject}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {r.designer ?? '—'}
                    {r.work_type ? ` · ${r.work_type}` : ' · no work type'}
                    {allowed > 0 && (
                      <>
                        {' · '}
                        <span className={over ? 'text-red-400' : 'text-gray-400'}>
                          {mins(r.spent_mins)} of {mins(allowed)}
                          {over && ` · over by ${mins(r.spent_mins - allowed)}`}
                        </span>
                      </>
                    )}
                    {r.extra_mins > 0 && <span className="text-green-400"> · +{mins(r.extra_mins)} already given</span>}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-orange-500/15 px-2.5 py-0.5 text-sm font-medium text-orange-400">
                  +{mins(r.minutes)}
                </span>
              </div>

              {/* In their own words. The decision is almost always about
                  whether this is true, which no number answers. */}
              <p className="mt-3 rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-gray-300">{r.reason}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                  placeholder="A note, if you want one"
                  aria-label={`Note on request for task ${r.task_no}`}
                  className="min-w-0 flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => decide(r.id, false)}
                  disabled={busy === r.id}
                  className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
                >
                  <X size={14} /> No
                </button>
                <button
                  onClick={() => decide(r.id, true)}
                  disabled={busy === r.id}
                  className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Give {mins(r.minutes)}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}