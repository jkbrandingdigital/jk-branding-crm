// src/components/leave/LeaveBoard.tsx
//
// HR's leave screen. Route: /hr/leaves
//
// Three things on one page, in the order they need doing:
//
//   1. Waiting on you — somebody is standing still until this is
//      answered, so it is first and it is loud. It disappears when
//      empty; a card that is always there, usually empty, stops being
//      read within a week.
//
//   2. Away without leave — the days somebody stayed home with nothing
//      approved, charged at the penalty. This is the one place anybody
//      finds out before the payslip does, and HR can still fix it by
//      approving the day late, which clears it by itself.
//
//   3. The month's leave, and giving days out.
//
// Every figure here is worked out by the database, including the ones
// next to a Waiting request — leaves_waiting() re-asks leave_quote(),
// so what HR reads is what approving would actually do today, not what
// it would have done the week it was asked for.

import { useCallback, useEffect, useState } from 'react'
import {
  Inbox, Check, X, Loader2, Wallet, AlertTriangle, CalendarOff, Gift,
  ChevronLeft, ChevronRight, Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Waiting = {
  id: string; user_id: string; emp_code: string; full_name: string; branch: string | null
  type_code: string; type_name: string
  from_date: string; to_date: string; portion: string; hours: number | null
  reason: string; days: number; paid_days: number; unpaid_days: number
  pay_cut: number; balance: number; asked_at: string
}

type Row = {
  id: string; user_id: string; emp_code: string; full_name: string; branch: string | null
  type_code: string; type_name: string
  from_date: string; to_date: string; portion: string; hours: number | null
  reason: string; state: string
  days: number; paid_days: number; unpaid_days: number; pay_cut: number
  decided_at: string | null; decided_by_name: string | null
}

type Away = {
  user_id: string; emp_code: string; full_name: string; branch: string | null
  days: number; charged: number; cut: number; asked_but_not_approved: number
}

type Person = { id: string; full_name: string; emp_code: string }

const rupees = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

const longDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

const STATE_CLS: Record<string, string> = {
  Waiting:   'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Approved:  'bg-green-500/10 text-green-300 ring-green-500/20',
  Refused:   'bg-red-500/10 text-red-300 ring-red-500/20',
  Cancelled: 'bg-[#1f1f1f] text-gray-400 ring-[#2a2a2a]',
}

function Chip({ state }: { state: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATE_CLS[state] ?? STATE_CLS.Cancelled}`}>
      {state}
    </span>
  )
}

function Initials({ name }: { name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-xs font-semibold text-gray-300">
      {name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
    </span>
  )
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none ' +
  '[color-scheme:dark]'

export default function LeaveBoard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [waiting, setWaiting] = useState<Waiting[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [away, setAway] = useState<Away[]>([])
  const [people, setPeople] = useState<Person[]>([])

  const [busy, setBusy] = useState<string | null>(null)
  const [refusing, setRefusing] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const [giveTo, setGiveTo] = useState('')
  const [giveType, setGiveType] = useState('PAID')
  const [giveQty, setGiveQty] = useState('1')
  const [giveNote, setGiveNote] = useState('')
  const [giveSaid, setGiveSaid] = useState<string | null>(null)

  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const last = new Date(year, month + 1, 0)
  const lastStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`

  const load = useCallback(async () => {
    const [w, b, a, p] = await Promise.all([
      supabase.rpc('leaves_waiting'),
      supabase.rpc('leave_board', { p_from: first, p_to: lastStr }),
      supabase.rpc('absence_board', { p_month: first }),
      supabase.from('profiles').select('id, full_name, emp_code').eq('is_active', true).order('emp_code'),
    ])
    setWaiting((w.data ?? []) as unknown as Waiting[])
    setRows((b.data ?? []) as unknown as Row[])
    setAway((a.data ?? []) as unknown as Away[])
    setPeople((p.data ?? []) as unknown as Person[])
  }, [first, lastStr])

  useEffect(() => { load() }, [load])

  async function decide(id: string, ok: boolean, noteText?: string) {
    setBusy(id)
    setErr(null)
    const { data, error } = await supabase.rpc('leave_decide', {
      p_id: id, p_ok: ok, p_note: noteText ?? null,
    })
    setBusy(null)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setErr(error?.message ?? r?.reason ?? 'Not saved.')
    setRefusing(null)
    setWhy('')
    load()
  }

  async function give() {
    setGiveSaid(null)
    const { data, error } = await supabase.rpc('leave_grant', {
      p_user: giveTo, p_type: giveType, p_qty: Number(giveQty), p_note: giveNote.trim(),
    })
    const r = data as { ok: boolean; reason?: string; balance?: number } | null
    if (error || !r?.ok) return setGiveSaid(error?.message ?? r?.reason ?? 'Not saved.')
    setGiveSaid(`Done — they now have ${Number(r.balance)}.`)
    setGiveNote('')
    load()
  }

  const step = (by: number) => {
    const d = new Date(year, month + by, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leave</h1>
          <p className="mt-1 text-sm text-gray-500">
            What is waiting on you, and what the month looks like.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#242424] bg-[#141414] p-1">
          <button onClick={() => step(-1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[9rem] text-center text-sm">
            {new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => step(1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {/* ── 1. waiting on you ────────────────────────────────── */}
      {waiting.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-900/50 bg-amber-950/15">
          <div className="flex items-center gap-2 border-b border-amber-900/40 px-5 py-3.5">
            <Inbox size={15} className="text-amber-400" />
            <h2 className="text-sm font-medium text-amber-200">
              Waiting on you
              <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
                {waiting.length}
              </span>
            </h2>
          </div>

          {err && <p className="border-b border-amber-900/40 px-5 py-2.5 text-xs text-red-300">{err}</p>}

          <ul className="divide-y divide-amber-900/25">
            {waiting.map((w) => (
              <li key={w.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Initials name={w.full_name} />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{w.full_name}</span>
                      <span className="ml-2 font-mono text-[11px] text-gray-500">{w.emp_code}</span>
                      {w.branch && <span className="ml-2 text-xs text-gray-500">· {w.branch}</span>}
                    </p>

                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                      <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-gray-300">{w.type_name}</span>
                      <span>
                        {w.from_date === w.to_date ? longDay(w.from_date)
                          : `${day(w.from_date)} – ${longDay(w.to_date)}`}
                      </span>
                      {w.portion !== 'Full' && <span className="text-gray-500">· {w.portion}</span>}
                      <span className="text-gray-600">·</span>
                      <Clock size={10} /> {ago(w.asked_at)}
                    </p>

                    {/* What approving this would actually do, today. */}
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {w.hours ? (
                        <span className="text-gray-300">{Number(w.hours)} hour · no pay cut</span>
                      ) : (
                        <>
                          <span className="text-gray-300">
                            <span className="font-semibold tabular-nums">{Number(w.days)}</span> days
                          </span>
                          <span className="text-green-300">
                            <span className="font-semibold tabular-nums">{Number(w.paid_days)}</span> paid
                          </span>
                          {Number(w.unpaid_days) > 0 && (
                            <span className="text-amber-300">
                              <span className="font-semibold tabular-nums">{Number(w.unpaid_days)}</span> unpaid
                            </span>
                          )}
                          <span className={Number(w.pay_cut) > 0 ? 'text-red-300' : 'text-gray-500'}>
                            <Wallet size={11} className="mr-1 inline" />
                            {Number(w.pay_cut) > 0 ? rupees(w.pay_cut) : 'no cut'}
                          </span>
                          <span className="text-gray-600">balance {Number(w.balance)}</span>
                        </>
                      )}
                    </p>

                    <p className="mt-2 text-sm text-gray-300">&ldquo;{w.reason}&rdquo;</p>
                  </div>

                  {refusing !== w.id && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => decide(w.id, true)}
                        disabled={busy === w.id}
                        className="flex items-center gap-1.5 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                      >
                        {busy === w.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve
                      </button>
                      <button
                        onClick={() => setRefusing(w.id)}
                        disabled={busy === w.id}
                        className="flex items-center gap-1.5 rounded-lg border border-[#3a2a2a] px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                      >
                        <X size={13} /> Refuse
                      </button>
                    </div>
                  )}
                </div>

                {refusing === w.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      autoFocus
                      placeholder="Why is this being refused? They will read it."
                      className="min-w-[16rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                    <button
                      onClick={() => decide(w.id, false, why.trim())}
                      disabled={busy === w.id || why.trim().length < 3}
                      className="rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                    >
                      Refuse
                    </button>
                    <button
                      onClick={() => { setRefusing(null); setWhy('') }}
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
      )}

      {/* ── 2. away without leave ────────────────────────────── */}
      {away.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-red-900/40 bg-red-950/10">
          <div className="flex items-center gap-2 border-b border-red-900/30 px-5 py-3.5">
            <AlertTriangle size={15} className="text-red-400" />
            <h2 className="text-sm font-medium text-red-200">Away without approved leave</h2>
            <span className="ml-auto text-xs text-gray-500">
              approve a day late and it clears itself
            </span>
          </div>

          <ul className="divide-y divide-red-900/20">
            {away.map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Initials name={a.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{a.full_name}</span>
                    <span className="ml-2 font-mono text-[11px] text-gray-500">{a.emp_code}</span>
                    {a.branch && <span className="ml-2 text-xs text-gray-500">· {a.branch}</span>}
                  </p>
                  {Number(a.asked_but_not_approved) > 0 && (
                    <p className="mt-0.5 text-xs text-amber-300/80">
                      {Number(a.asked_but_not_approved)} of these were asked for and never approved
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{Number(a.days)}</span>
                    <span className="text-gray-500"> days away · </span>
                    <span className="font-semibold text-red-300">{Number(a.charged)}</span>
                    <span className="text-gray-500"> days charged</span>
                  </p>
                  <p className="text-xs text-red-300/80">{rupees(a.cut)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 3. the month ─────────────────────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <div className="flex items-center gap-2 border-b border-[#242424] px-5 py-3.5">
          <CalendarOff size={15} className="text-gray-500" />
          <h2 className="text-sm font-medium">This month&rsquo;s leave</h2>
          <span className="ml-2 text-xs text-gray-600">{rows.length} in all</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-600">Nobody has asked for leave this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f1f1f] text-left text-xs text-gray-500">
                  <th className="px-5 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">When</th>
                  <th className="px-3 py-2.5 font-normal">Kind</th>
                  <th className="px-3 py-2.5 text-right font-normal">Days</th>
                  <th className="px-3 py-2.5 text-right font-normal">Cut</th>
                  <th className="px-5 py-2.5 font-normal">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-[#181818]">
                    <td className="px-5 py-3">
                      <p className="font-medium">{r.full_name}</p>
                      <p className="font-mono text-[11px] text-gray-500">{r.emp_code}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-300">
                      {r.from_date === r.to_date ? day(r.from_date)
                        : `${day(r.from_date)} – ${day(r.to_date)}`}
                      {r.portion !== 'Full' && (
                        <span className="ml-1 text-xs text-gray-500">({r.portion})</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-400">{r.type_name}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-gray-300">
                      {r.hours ? `${Number(r.hours)} h` : Number(r.days)}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums ${
                      Number(r.pay_cut) > 0 ? 'text-red-300' : 'text-gray-600'}`}>
                      {Number(r.pay_cut) > 0 ? rupees(r.pay_cut) : '—'}
                    </td>
                    <td className="px-5 py-3"><Chip state={r.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── giving days out ──────────────────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <div className="flex items-center gap-2 border-b border-[#242424] px-5 py-3.5">
          <Gift size={15} className="text-gray-500" />
          <h2 className="text-sm font-medium">Give somebody leave days</h2>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <select value={giveTo} onChange={(e) => setGiveTo(e.target.value)} className={inputCls}>
            <option value="">Who</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.emp_code} · {p.full_name}</option>
            ))}
          </select>

          <select value={giveType} onChange={(e) => setGiveType(e.target.value)} className={inputCls}>
            <option value="PAID">Paid leave</option>
            <option value="BREAK">Short break (hours)</option>
          </select>

          <input
            type="number" step="0.5" min="0.5"
            value={giveQty} onChange={(e) => setGiveQty(e.target.value)}
            className={inputCls}
          />

          <input
            value={giveNote} onChange={(e) => setGiveNote(e.target.value)}
            placeholder="What these days are for"
            className={inputCls}
          />
        </div>

        {giveSaid && <p className="px-5 pb-3 text-sm text-gray-400">{giveSaid}</p>}

        <div className="flex justify-end border-t border-[#242424] px-5 py-3.5">
          <button
            onClick={give}
            disabled={!giveTo || giveNote.trim().length < 3 || Number(giveQty) <= 0}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Give the days
          </button>
        </div>
      </section>
    </div>
  )
}