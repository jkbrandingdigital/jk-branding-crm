// src/components/attendance/RequestsCard.tsx
//
// The corrections people have asked for, waiting on HR.
//
// Shown at the top of the register and only when there is something in
// it. A card that is always there, usually empty, stops being read within
// a week — and this is the one thing on the page that somebody is waiting
// on an answer for.

import { useCallback, useEffect, useState } from 'react'
import { Inbox, Check, X, Loader2, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Req = {
  id: string
  user_id: string
  emp_code: string
  full_name: string
  work_date: string
  kind: string
  at_time: string
  reason: string
  asked_at: string
}

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

const hhmm12 = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const am = h < 12
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${am ? 'AM' : 'PM'}`
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

export default function RequestsCard({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<Req[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [refusing, setRefusing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('requests_waiting')
    setRows((data ?? []) as unknown as Req[])
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, ok: boolean, why?: string) {
    setBusy(id)
    setErr(null)
    const { data, error } = await supabase.rpc('decide_request', {
      p_id: id, p_ok: ok, p_note: why ?? null,
    })
    setBusy(null)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setErr(error?.message ?? r?.reason ?? 'Not saved.')
    setRefusing(null)
    setNote('')
    load()
    onChanged()
  }

  if (rows.length === 0) return null

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-amber-900/50 bg-amber-950/15">
      <div className="flex items-center gap-2 border-b border-amber-900/40 px-5 py-3.5">
        <Inbox size={15} className="text-amber-400" />
        <h2 className="text-sm font-medium text-amber-200">
          Waiting on you
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
            {rows.length}
          </span>
        </h2>
      </div>

      {err && <p className="border-b border-amber-900/40 px-5 py-2.5 text-xs text-red-300">{err}</p>}

      <ul className="divide-y divide-amber-900/25">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-3.5">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{r.full_name}</span>
                  <span className="ml-2 font-mono text-[11px] text-gray-500">{r.emp_code}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                  <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-gray-300">{r.kind}</span>
                  <span className="tabular-nums">{hhmm12(r.at_time)}</span>
                  <span className="text-gray-600">·</span>
                  <span>{day(r.work_date)}</span>
                  <span className="text-gray-600">·</span>
                  <Clock size={10} /> {ago(r.asked_at)}
                </p>
                <p className="mt-1.5 text-sm text-gray-300">&ldquo;{r.reason}&rdquo;</p>
              </div>

              {refusing !== r.id && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => decide(r.id, true)}
                    disabled={busy === r.id}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                  >
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve
                  </button>
                  <button
                    onClick={() => setRefusing(r.id)}
                    disabled={busy === r.id}
                    className="flex items-center gap-1.5 rounded-lg border border-[#3a2a2a] px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                  >
                    <X size={13} /> Refuse
                  </button>
                </div>
              )}
            </div>

            {/* Refusing asks for a reason. The person is told what was
                decided, and "no" with nothing after it is the answer
                that comes back to HR as a second question. */}
            {refusing === r.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  placeholder="Why is this being refused?"
                  className="min-w-[14rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => decide(r.id, false, note.trim())}
                  disabled={busy === r.id || note.trim().length < 3}
                  className="rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Refuse
                </button>
                <button
                  onClick={() => { setRefusing(null); setNote('') }}
                  className="rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}