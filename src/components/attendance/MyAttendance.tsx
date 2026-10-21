// src/components/attendance/MyAttendance.tsx
//
// A person's own attendance. Route: /attendance
//
// No permission guards it. Seeing your own days is not a privilege — it
// is the thing your pay is worked out from, and somebody who cannot check
// it has to take HR's word for it. Same reasoning that left My Leads and
// My Performance unswitched.
//
// RLS does the work: the policies on `attendance` and `attendance_scans`
// return your own rows and nobody else's, so this screen asks for
// everything and is handed only what is yours.

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Check, Clock, Coffee, AlertCircle, CalendarDays,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Day = {
  work_date: string
  status: string
  check_in: string | null
  check_out: string | null
  punches: string[]
  is_late: boolean
  late_minutes: number
  lunch_minutes: number
  break_minutes: number
  gross_minutes: number
  minutes_worked: number
  lunch_open: boolean
  lunch_late_min: number
  reasons_pending: number
  remarks: string | null
}

type Pending = { id: string; kind: string; late_by_min: number; work_date: string; at: string }

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '—'

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const dayName = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' })

const dayNo = (d: string) => Number(d.slice(8, 10))

const monthTitle = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

export default function MyAttendance() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())      // 0–11
  const [days, setDays] = useState<Day[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const last = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${last}`

    const [a, nag] = await Promise.all([
      supabase
        .from('attendance')
        // One unbroken string: supabase-js reads this at the type level
        // to work out the row shape, and a string joined with + is not
        // something it can read — it hands back GenericStringError instead.
        .select('work_date, status, check_in, check_out, punches, is_late, late_minutes, lunch_minutes, break_minutes, gross_minutes, minutes_worked, lunch_open, lunch_late_min, reasons_pending, remarks')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date', { ascending: false }),
      supabase.rpc('my_pending_reason'),
    ])

    if (a.error) setNote(a.error.message)
    setDays((a.data ?? []) as unknown as Day[])
    const n = nag.data as Partial<Pending> | null
    setPending(n?.id ? (n as Pending) : null)
    setLoading(false)
  }, [year, month])

  useEffect(() => { load() }, [load])

  function step(by: number) {
    const d = new Date(year, month + by, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setOpenDay(null)
  }

  async function saveReason() {
    if (!pending || reason.trim().length < 3) return
    setBusy(true)
    const { data, error } = await supabase.rpc('scan_reason', {
      p_scan: pending.id, p_reason: reason.trim(),
    })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) { setNote(error?.message ?? r?.reason ?? 'Not saved.'); return }
    setReason('')
    setNote(null)
    load()
  }

  const present = days.filter((d) => d.minutes_worked > 0).length
  const lates = days.filter((d) => d.is_late).length
  const minutes = days.reduce((s, d) => s + d.minutes_worked, 0)
  const thisMonth = year === now.getFullYear() && month === now.getMonth()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">My attendance</h1>
      <p className="mt-1 text-sm text-gray-400">Your own days, as the office clock recorded them.</p>

      {/* A late scan with no reason given yet. Put at the top because it
          is the one thing on this page that is waiting on the person. */}
      {pending && (
        <div className="mt-5 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <AlertCircle size={15} />
            {pending.kind === 'Lunch in' ? 'Late back from lunch' : 'Late in'} on{' '}
            {new Date(pending.work_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {pending.late_by_min ? ` by ${pending.late_by_min} minutes` : ''}
          </p>
          <p className="mt-1 text-xs text-amber-200/80">
            Your scan is already counted. Tell us what happened and it goes on the record with it.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="e.g. Traffic at Kalawad road"
            className="mt-3 w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />
          <button
            onClick={saveReason}
            disabled={busy || reason.trim().length < 3}
            className="mt-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Send reason'}
          </button>
        </div>
      )}

      {note && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{note}</div>
      )}

      {/* month */}
      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => step(-1)} className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white" aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-medium text-white">{monthTitle(year, month)}</p>
        <button
          onClick={() => step(1)}
          disabled={thisMonth}
          className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <section className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424]">
        <Tile label="Days present" value={String(present)} />
        <Tile label="Hours worked" value={hhmm(minutes)} />
        <Tile label="Late" value={String(lates)} tone={lates > 3 ? 'text-red-400' : lates > 0 ? 'text-amber-400' : undefined} />
      </section>

      <div className={`mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-[#151515] ${loading ? 'opacity-50' : ''}`}>
        {days.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-500">
            <CalendarDays size={22} className="text-gray-700" />
            Nothing recorded this month.
          </p>
        ) : (
          <ul className="divide-y divide-[#1f1f1f]">
            {days.map((d) => {
              const open = openDay === d.work_date
              return (
                <li key={d.work_date}>
                  <button
                    onClick={() => setOpenDay(open ? null : d.work_date)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#1a1a1a]"
                  >
                    <span className="w-11 shrink-0 text-center">
                      <span className="block text-lg font-semibold tabular-nums text-white">{dayNo(d.work_date)}</span>
                      <span className="block text-[11px] text-gray-500">{dayName(d.work_date)}</span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-200">
                        {clock(d.check_in)} <span className="text-gray-600">→</span> {clock(d.check_out)}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1"><Clock size={10} /> {hhmm(d.minutes_worked)}</span>
                        {d.lunch_minutes > 0 && (
                          <span className="inline-flex items-center gap-1"><Coffee size={10} /> {d.lunch_minutes}m</span>
                        )}
                        {d.is_late && <span className="text-amber-400">{d.late_minutes}m late</span>}
                        {d.lunch_open && <span className="text-amber-400">lunch not closed</span>}
                        {d.reasons_pending > 0 && <span className="text-amber-400">reason pending</span>}
                      </span>
                    </span>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
                        d.status === 'Present' ? 'bg-green-950/60 text-green-400'
                        : d.status === 'Half day' ? 'bg-amber-950/50 text-amber-300'
                        : d.status === 'Leave' ? 'bg-blue-950/50 text-blue-300'
                        : 'bg-[#1f1f1f] text-gray-400'
                      }`}
                    >
                      {d.status}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-[#1f1f1f] bg-[#121212] px-4 py-3 text-xs text-gray-400">
                      <p className="mb-2 text-gray-300">
                        Scans: {d.punches.length > 0 ? d.punches.join('  ·  ') : 'none'}
                      </p>
                      {/* Where the paid time went. A single number nobody
                          can take apart is a number nobody believes. */}
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                        <Pair k="In to out" v={hhmm(d.gross_minutes)} />
                        <Pair k="Lunch" v={`${d.lunch_minutes}m`} />
                        <Pair k="Stepped out" v={`${d.break_minutes}m`} />
                        <Pair k="Paid" v={hhmm(d.minutes_worked)} strong />
                      </dl>
                      {d.lunch_late_min > 0 && (
                        <p className="mt-2 text-amber-400">Back from lunch {d.lunch_late_min} minutes late.</p>
                      )}
                      {d.remarks && <p className="mt-2 text-gray-400">{d.remarks}</p>}
                      <p className="mt-3 text-[11px] text-gray-600">
                        Something wrong here? Tell HR — they can correct a day, and every correction is recorded with
                        a reason.
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-[#151515] px-4 py-4">
      <p className="flex items-center gap-1.5 text-xs text-gray-400">
        <Check size={12} /> {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}

function Pair({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-600">{k}</dt>
      <dd className={`tabular-nums ${strong ? 'text-white' : 'text-gray-300'}`}>{v}</dd>
    </div>
  )
}