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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Inbox, Check, X, Loader2, Wallet, AlertTriangle, CalendarOff, Gift,
  ChevronLeft, ChevronRight, ChevronDown, Clock, RotateCcw, Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import MyAttendance from '../attendance/MyAttendance'
import HolidaysCard from './HolidaysCard'

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

// One person's day, as the register has it. Only what a dot needs.
type Mark = { user_id: string; work_date: string; status: string; is_late: boolean; check_in: string | null }

// Everybody's days for the month. The API hands back at most 1000 rows a
// call, and 40 people make 1200 rows in a month, so it is read in pages.
async function marksFor(from: string, to: string) {
  const out: Mark[] = []
  for (let at = 0; ; at += 1000) {
    const { data, error } = await supabase
      .from('attendance')
      .select('user_id, work_date, status, is_late, check_in')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date')
      .order('user_id')
      .range(at, at + 999)
    if (error || !data) break
    out.push(...(data as unknown as Mark[]))
    if (data.length < 1000) break
  }
  return out
}

// What a day without leave looks like on the board: a tile, toned by
// what happened. Present is quiet on purpose — it is most days, and the
// page is for the days that are not.
function markOf(m: Mark | undefined, future: boolean) {
  if (future) return { cls: 'border border-dashed border-[#232323]', word: 'Not yet' }
  if (!m) return { cls: 'bg-[#1a1a1a]', word: 'Nothing recorded' }
  if (m.status === 'Absent') return { cls: 'bg-red-500/45', word: 'Absent' }
  if (m.status === 'Leave') return { cls: 'bg-sky-500/45', word: 'Leave' }
  if (m.status === 'Holiday') return { cls: 'bg-violet-500/25', word: 'Holiday' }
  if (m.status === 'Weekly off') return { cls: 'border border-[#242424]', word: 'Weekly off' }
  if (m.status === 'Half day') {
    return { cls: '', style: { background: 'linear-gradient(135deg, rgba(251,191,36,.7) 50%, rgba(34,197,94,.22) 50%)' }, word: 'Half day' }
  }
  if (m.check_in) {
    return m.is_late
      ? { cls: 'bg-amber-400/80', word: 'Late' }
      : { cls: 'bg-green-500/25', word: 'Present' }
  }
  return { cls: 'bg-[#1a1a1a]', word: m.status }
}

const timeOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }) : ''

const wholeRupees = (n: number) => '₹' + Math.round(Number(n)).toLocaleString('en-IN')

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

// How a leave looks on the month. Approved is solid; Waiting is striped,
// because it is not settled yet and should not read as if it were.
const barCls = (state: string) =>
  state === 'Approved' ? 'bg-sky-500/75'
  : state === 'Refused' ? 'border border-red-500/40 bg-red-500/10'
  : state === 'Cancelled' ? 'border border-dashed border-[#3a3a3a]'
  : ''

const barStyle = (state: string) =>
  state === 'Waiting'
    ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(245,158,11,.75) 0 4px, rgba(245,158,11,.25) 4px 8px)' }
    : undefined

const spanText = (r: { from_date: string; to_date: string }) =>
  r.from_date === r.to_date ? longDay(r.from_date) : `${day(r.from_date)} – ${longDay(r.to_date)}`

// Which request wins a day when two touch it: the live one.
const RANK: Record<string, number> = { Approved: 3, Waiting: 2, Refused: 1, Cancelled: 0 }

function Key({ cls = '', style, word }: { cls?: string; style?: CSSProperties; word: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`h-3.5 w-3.5 rounded ${cls}`} style={style} /> {word}
    </li>
  )
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => set(!on)}
      aria-pressed={on}
      className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        on ? 'border-orange-500/60 bg-orange-500/10 text-orange-200' : 'border-[#2a2a2a] text-gray-400 hover:text-white'}`}
    >
      {label}
    </button>
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
  const [marks, setMarks] = useState<Mark[]>([])
  // '' = everybody on the board; an id = that person's month, in full.
  const [person, setPerson] = useState('')
  // Folded by default: the figures matter, but they are not what HR
  // opens this page to do. The red tiles on the month say who, already.
  const [awayOpen, setAwayOpen] = useState(false)
  const monthRef = useRef<HTMLElement>(null)
  const openPerson = (id: string) => {
    setPerson(id)
    setPicked(null)
    monthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [busy, setBusy] = useState<string | null>(null)
  const [refusing, setRefusing] = useState<string | null>(null)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState<string | null>(null)

  // Taking back a leave that was already allowed. Kept apart from
  // `refusing` on purpose: refusing answers a question nobody has
  // acted on yet, this undoes something people have already planned
  // around, so it asks for its own reason and says so out loud.
  const [undoing, setUndoing] = useState<string | null>(null)
  const [undoWhy, setUndoWhy] = useState('')
  const [undoErr, setUndoErr] = useState<string | null>(null)

  const [picked, setPicked] = useState<string | null>(null)
  const [onlyAway, setOnlyAway] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [find, setFind] = useState('')

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
    setMarks(await marksFor(first, lastStr))
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

  // leave_undo credits the days back on the dates they were spent, puts
  // the register back to what the scans say, and marks the request
  // Cancelled. Nothing is deleted, so the history still reads correctly.
  async function undo(id: string) {
    setBusy(id)
    setUndoErr(null)
    const { data, error } = await supabase.rpc('leave_undo', {
      p_id: id, p_reason: undoWhy.trim(),
    })
    setBusy(null)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setUndoErr(error?.message ?? r?.reason ?? 'Not cancelled.')
    setUndoing(null)
    setUndoWhy('')
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

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const dates = useMemo(
    () => Array.from({ length: last.getDate() }, (_, i) => first.slice(0, 8) + String(i + 1).padStart(2, '0')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [first, lastStr],
  )

  // person -> date -> the request covering that day
  const grid = useMemo(() => {
    const g = new Map<string, Map<string, Row>>()
    for (const r of rows) {
      if (!showClosed && r.state !== 'Approved' && r.state !== 'Waiting') continue
      const mine = g.get(r.user_id) ?? new Map<string, Row>()
      g.set(r.user_id, mine)
      for (const d of dates) {
        if (d < r.from_date || d > r.to_date) continue
        const had = mine.get(d)
        if (!had || (RANK[r.state] ?? 0) > (RANK[had.state] ?? 0)) mine.set(d, r)
      }
    }
    return g
  }, [rows, dates, showClosed])

  // How many are out on each day, and how many days each person is out
  // this month. Only leave that is live counts: Approved or Waiting.
  const { awayOn, daysOf } = useMemo(() => {
    const awayOn = new Map<string, number>()
    const daysOf = new Map<string, number>()
    for (const [uid, mine] of grid) {
      for (const [d, r] of mine) {
        if ((r.state !== 'Approved' && r.state !== 'Waiting') || r.hours) continue
        awayOn.set(d, (awayOn.get(d) ?? 0) + 1)
        daysOf.set(uid, (daysOf.get(uid) ?? 0) + (r.portion === 'Full' ? 1 : 0.5))
      }
    }
    return { awayOn, daysOf }
  }, [grid])

  // Everybody active, plus anyone with leave this month who is not on
  // the active list any more, so their leave does not vanish.
  const team = useMemo(() => {
    const all = new Map<string, Person>(people.map((p) => [p.id, p]))
    for (const r of rows) {
      if (!all.has(r.user_id)) all.set(r.user_id, { id: r.user_id, full_name: r.full_name, emp_code: r.emp_code })
    }
    const q = find.trim().toLowerCase()
    return [...all.values()]
      .filter((p) => !onlyAway || grid.has(p.id))
      .filter((p) => !q || p.full_name.toLowerCase().includes(q) || p.emp_code.toLowerCase().includes(q))
      .sort((a, b) => a.emp_code.localeCompare(b.emp_code, undefined, { numeric: true }))
  }, [people, rows, grid, onlyAway, find])

  const markAt = useMemo(() => {
    const g = new Map<string, Map<string, Mark>>()
    for (const m of marks) {
      const mine = g.get(m.user_id) ?? new Map<string, Mark>()
      g.set(m.user_id, mine)
      mine.set(m.work_date, m)
    }
    return g
  }, [marks])

  // Present / late / absent per person, from the register.
  const countsOf = useMemo(() => {
    const c = new Map<string, { inn: number; late: number; absent: number }>()
    for (const m of marks) {
      const x = c.get(m.user_id) ?? { inn: 0, late: 0, absent: 0 }
      if (m.check_in) x.inn++
      if (m.is_late) x.late++
      if (m.status === 'Absent') x.absent++
      c.set(m.user_id, x)
    }
    return c
  }, [marks])

  const awayCut = away.reduce((t, a) => t + Number(a.cut), 0)
  const onLeave = [...grid.keys()].length
  const chosen = person ? team.find((p) => p.id === person) ?? people.find((p) => p.id === person) : undefined
  const pickedRow = picked ? rows.find((r) => r.id === picked) ?? null : null

  const step = (by: number) => {
    const d = new Date(year, month + by, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setPicked(null)
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

      {/* ── 2. away without leave ──────────────────────────────
          One line until opened: who and what it costs, in brief. */}
      {away.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-red-900/40 bg-red-950/10">
          <button
            onClick={() => setAwayOpen(!awayOpen)}
            aria-expanded={awayOpen}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-red-950/20 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
          >
            <AlertTriangle size={15} className="text-red-400" />
            <h2 className="text-sm font-medium text-red-200">Away without approved leave</h2>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">
              {away.length} {away.length === 1 ? 'person' : 'people'}
            </span>
            <span className="text-xs tabular-nums text-red-300/80">{wholeRupees(awayCut)} cut</span>
            <span className="ml-auto hidden text-xs text-gray-500 sm:inline">approve a day late and it clears itself</span>
            <ChevronDown size={15} className={`text-gray-500 transition-transform ${awayOpen ? 'rotate-180' : ''}`} />
          </button>

          {awayOpen && (
            <ul className="grid gap-2 border-t border-red-900/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {away.map((a) => (
                <li key={a.user_id}>
                  <button
                    onClick={() => openPerson(a.user_id)}
                    title="Open the whole month"
                    className="flex w-full items-center gap-3 rounded-xl border border-red-900/25 bg-[#141414] px-3 py-2.5 text-left transition-colors hover:border-red-700/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-100">{a.full_name}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {a.emp_code}{a.branch ? ` · ${a.branch}` : ''}
                      </p>
                      {Number(a.asked_but_not_approved) > 0 && (
                        <p className="mt-0.5 text-[11px] text-amber-300/80">
                          {Number(a.asked_but_not_approved)} asked, not approved
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums">
                        <span className="font-semibold text-white">{Number(a.days)}</span>
                        <span className="text-gray-500"> away</span>
                      </p>
                      <p className="text-[11px] tabular-nums text-red-300">
                        {Number(a.charged)} charged · {wholeRupees(a.cut)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 3. the month, everybody at once ─────────────────────
          One row a person, one column a day. A leave is a bar across
          the days it covers, so who is away together, and on which
          days the office runs thin, reads straight off the page. */}
      <section ref={monthRef} className="mt-6 scroll-mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[#242424] px-5 py-3.5">
          <CalendarOff size={15} className="text-gray-500" />
          <h2 className="text-sm font-medium">Attendance &amp; leave this month</h2>
          <span className="text-xs text-gray-600">{onLeave} {onLeave === 1 ? 'person' : 'people'} with leave</span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Everybody, or one person's whole month. */}
            <select
              value={person}
              onChange={(e) => openPerson(e.target.value)}
              aria-label="Whose attendance"
              className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-2.5 py-1.5 text-xs text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="">Everyone</option>
              {[...people].sort((a, b) => a.emp_code.localeCompare(b.emp_code, undefined, { numeric: true })).map((p) => (
                <option key={p.id} value={p.id}>{p.emp_code} · {p.full_name}</option>
              ))}
            </select>
            {!person && (<>
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Find a person"
                aria-label="Find a person"
                className="w-40 rounded-lg border border-[#2a2a2a] bg-[#161616] py-1.5 pl-8 pr-2.5 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <Toggle on={onlyAway} set={setOnlyAway} label="Only people on leave" />
            <Toggle on={showClosed} set={setShowClosed} label="Show refused & cancelled" />
            </>)}
          </div>
        </div>

        {person ? (
          <div className="p-5">
            <button
              onClick={() => setPerson('')}
              className="mb-4 flex items-center gap-1 text-xs text-gray-400 hover:text-white"
            >
              <ChevronLeft size={13} /> Back to everyone
            </button>
            <MyAttendance userId={person} name={chosen?.full_name} year={year} month={month} />
          </div>
        ) : (<>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[12rem] border-b border-[#1f1f1f] bg-[#141414] px-5 py-2 text-left font-normal text-gray-500">
                  Name
                </th>
                {dates.map((d) => {
                  const n = Number(d.slice(8, 10))
                  const wd = new Date(d + 'T00:00:00').getDay()
                  const away = awayOn.get(d) ?? 0
                  return (
                    <th
                      key={d}
                      className={`w-9 min-w-9 border-b border-[#1f1f1f] px-0 pb-2 pt-2.5 text-center font-normal ${
                        d === today ? 'bg-orange-500/[0.06]' : ''}`}
                    >
                      <span className="block text-[10px] text-gray-600">{'SMTWTFS'[wd]}</span>
                      <span
                        className={`mx-auto mt-0.5 grid h-6 w-6 place-items-center rounded-full tabular-nums ${
                          d === today ? 'bg-orange-500 font-semibold text-white' : wd === 0 ? 'text-gray-600' : 'text-gray-300'}`}
                      >
                        {n}
                      </span>
                      {/* How many are out that day — the number HR plans around. */}
                      <span className="mt-1 flex h-4 items-center justify-center">
                        {away > 0 && (
                          <span
                            title={`${away} on leave`}
                            className={`rounded px-1 text-[10px] leading-4 tabular-nums ${
                              away >= 3 ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/15 text-sky-300'}`}
                          >
                            {away}
                          </span>
                        )}
                      </span>
                    </th>
                  )
                })}
                <th title="Days present" className="border-b border-l border-[#1f1f1f] pl-4 pr-1.5 text-right text-[10px] font-normal text-green-400/80">In</th>
                <th title="Days late" className="border-b border-[#1f1f1f] px-1.5 text-right text-[10px] font-normal text-amber-400/90">Late</th>
                <th title="Days absent" className="border-b border-[#1f1f1f] px-1.5 text-right text-[10px] font-normal text-red-400/90">Absent</th>
                <th title="Days of leave" className="border-b border-[#1f1f1f] pl-1.5 pr-5 text-right text-[10px] font-normal text-sky-400/90">Leave</th>
              </tr>
            </thead>

            <tbody>
              {team.length === 0 && (
                <tr>
                  <td colSpan={dates.length + 5} className="px-5 py-10 text-center text-sm text-gray-600">
                    {find ? 'Nobody by that name.' : 'Nobody has asked for leave this month.'}
                  </td>
                </tr>
              )}

              {team.map((p) => {
                const mine = grid.get(p.id)
                return (
                  <tr key={p.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-[#1a1a1a] bg-[#141414] px-5 py-1 group-hover:bg-[#191919]">
                      <button
                        onClick={() => openPerson(p.id)}
                        className="block max-w-[11rem] text-left hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                        title="Open the whole month"
                      >
                        <span className="block truncate text-[13px] text-gray-200 hover:text-orange-300">{p.full_name}</span>
                        <span className="block font-mono text-[10px] text-gray-600">{p.emp_code}</span>
                      </button>
                    </td>

                    {dates.map((d, i) => {
                      const r = mine?.get(d)
                      const base = `h-10 border-b border-[#1a1a1a] p-0 ${d === today ? 'bg-orange-500/[0.06]' : ''}`
                      if (!r) {
                        const m = markAt.get(p.id)?.get(d)
                        const mk = markOf(m, d > today)
                        const tip = [longDay(d), mk.word, m?.check_in ? `in ${timeOf(m.check_in)}` : ''].filter(Boolean).join(' · ')
                        return (
                          <td key={d} className={base}>
                            <span
                              title={tip}
                              className={`mx-[3px] block h-7 rounded-md ${mk.cls}`}
                              style={'style' in mk ? mk.style : undefined}
                            />
                          </td>
                        )
                      }

                      const joinL = i > 0 && mine?.get(dates[i - 1])?.id === r.id
                      const joinR = i < dates.length - 1 && mine?.get(dates[i + 1])?.id === r.id
                      const half = r.portion !== 'Full' && !r.hours
                      const on = picked === r.id

                      return (
                        <td key={d} className={base}>
                          <button
                            onClick={() => { setPicked(on ? null : r.id); setRefusing(null); setUndoing(null); setErr(null); setUndoErr(null) }}
                            aria-label={`${p.full_name}, ${r.type_name}, ${spanText(r)}, ${r.state}`}
                            aria-pressed={on}
                            title={`${r.type_name} · ${r.state}${half ? ` · ${r.portion}` : ''}`}
                            className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
                          >
                            {r.hours ? (
                              <span className="mx-[3px] grid h-7 place-items-center rounded-md bg-[#1a1a1a]">
                                <span className={`h-2.5 w-2.5 rounded-full ${barCls(r.state)} ${on ? 'ring-2 ring-orange-500' : ''}`} style={barStyle(r.state)} />
                              </span>
                            ) : (
                              <span
                                className={`relative block h-7 overflow-hidden ${joinL ? '' : 'ml-[3px] rounded-l-md'} ${joinR ? '' : 'mr-[3px] rounded-r-md'} ${
                                  half ? 'bg-[#1a1a1a]' : barCls(r.state)} ${on ? 'ring-2 ring-inset ring-orange-500' : ''}`}
                                style={half ? undefined : barStyle(r.state)}
                              >
                                {half && (
                                  <span
                                    className={`absolute inset-x-0 h-1/2 ${r.portion === 'Second half' ? 'bottom-0' : 'top-0'} ${barCls(r.state)}`}
                                    style={barStyle(r.state)}
                                  />
                                )}
                              </span>
                            )}
                          </button>
                        </td>
                      )
                    })}

                    {(() => {
                      const c = countsOf.get(p.id)
                      const lv = daysOf.get(p.id) ?? 0
                      const n = (v: number | undefined, cls: string) =>
                        v ? <span className={cls}>{v}</span> : <span className="text-gray-700">·</span>
                      return (
                        <>
                          <td className="border-b border-l border-[#1a1a1a] pl-4 pr-1.5 text-right tabular-nums group-hover:bg-[#191919]">{n(c?.inn, 'text-gray-200')}</td>
                          <td className="border-b border-[#1a1a1a] px-1.5 text-right tabular-nums group-hover:bg-[#191919]">{n(c?.late, 'text-amber-300')}</td>
                          <td className="border-b border-[#1a1a1a] px-1.5 text-right tabular-nums group-hover:bg-[#191919]">{n(c?.absent, 'text-red-300')}</td>
                          <td className="border-b border-[#1a1a1a] pl-1.5 pr-5 text-right tabular-nums group-hover:bg-[#191919]">{n(lv, 'text-sky-300')}</td>
                        </>
                      )
                    })()}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* What the tiles mean */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#1f1f1f] px-5 py-3 text-[11px] text-gray-500">
          <Key cls="bg-green-500/25" word="Present" />
          <Key cls="bg-amber-400/80" word="Late" />
          <Key cls="bg-red-500/45" word="Absent" />
          <Key cls="bg-violet-500/25" word="Holiday" />
          <Key cls={barCls('Approved')} word="Leave" />
          <Key style={barStyle('Waiting')} word="Leave waiting on you" />
          <Key cls="border border-dashed border-[#2a2a2a]" word="Not yet" />
          {showClosed && <Key cls={barCls('Refused')} word="Refused" />}
          <li className="w-full text-gray-600 lg:ml-auto lg:w-auto">Tap a leave for its details, a name for the whole month.</li>
        </ul>

        {/* ── the leave you tapped ─────────────────────────────── */}
        {pickedRow && (
          <div className="border-t border-[#242424] bg-[#161616] px-5 py-4" aria-live="polite">
            <div className="flex flex-wrap items-start gap-3">
              <Initials name={pickedRow.full_name} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{pickedRow.full_name}</span>
                  <span className="ml-2 font-mono text-[11px] text-gray-500">{pickedRow.emp_code}</span>
                  {pickedRow.branch && <span className="ml-2 text-xs text-gray-500">· {pickedRow.branch}</span>}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                  <Chip state={pickedRow.state} />
                  <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-gray-300">{pickedRow.type_name}</span>
                  <span>{spanText(pickedRow)}</span>
                  {pickedRow.portion !== 'Full' && <span className="text-gray-500">({pickedRow.portion})</span>}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {pickedRow.hours ? (
                    <span className="text-gray-300">{Number(pickedRow.hours)} hour · no pay cut</span>
                  ) : (
                    <>
                      <span className="text-gray-300"><span className="font-semibold tabular-nums">{Number(pickedRow.days)}</span> days</span>
                      <span className="text-green-300"><span className="font-semibold tabular-nums">{Number(pickedRow.paid_days)}</span> paid</span>
                      {Number(pickedRow.unpaid_days) > 0 && (
                        <span className="text-amber-300"><span className="font-semibold tabular-nums">{Number(pickedRow.unpaid_days)}</span> unpaid</span>
                      )}
                      <span className={Number(pickedRow.pay_cut) > 0 ? 'text-red-300' : 'text-gray-500'}>
                        <Wallet size={11} className="mr-1 inline" />
                        {Number(pickedRow.pay_cut) > 0 ? rupees(pickedRow.pay_cut) : 'no cut'}
                      </span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm text-gray-300">&ldquo;{pickedRow.reason}&rdquo;</p>
                {pickedRow.decided_by_name && pickedRow.state !== 'Waiting' && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {pickedRow.state} by {pickedRow.decided_by_name}
                    {pickedRow.decided_at ? `, ${longDay(pickedRow.decided_at.slice(0, 10))}` : ''}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                {pickedRow.state === 'Waiting' && refusing !== pickedRow.id && (
                  <>
                    <button
                      onClick={() => decide(pickedRow.id, true)}
                      disabled={busy === pickedRow.id}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                    >
                      {busy === pickedRow.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve
                    </button>
                    <button
                      onClick={() => setRefusing(pickedRow.id)}
                      disabled={busy === pickedRow.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[#3a2a2a] px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                    >
                      <X size={13} /> Refuse
                    </button>
                  </>
                )}
                {pickedRow.state === 'Approved' && undoing !== pickedRow.id && (
                  <button
                    onClick={() => { setUndoing(pickedRow.id); setUndoWhy(''); setUndoErr(null) }}
                    className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-red-900/60 hover:text-red-300"
                  >
                    <RotateCcw size={12} /> Cancel leave
                  </button>
                )}
                <button
                  onClick={() => setPicked(null)}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {err && <p className="mt-3 text-xs text-red-300">{err}</p>}

            {refusing === pickedRow.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  autoFocus
                  placeholder="Why is this being refused? They will read it."
                  className="min-w-[16rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => decide(pickedRow.id, false, why.trim())}
                  disabled={busy === pickedRow.id || why.trim().length < 3}
                  className="rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  Refuse
                </button>
                <button onClick={() => { setRefusing(null); setWhy('') }} className="rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-white">
                  Cancel
                </button>
              </div>
            )}

            {undoing === pickedRow.id && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-gray-400">
                  Cancelling gives {pickedRow.full_name.split(' ')[0]} the {pickedRow.type_name.toLowerCase()} days
                  back and puts {pickedRow.from_date === pickedRow.to_date ? 'that day' : 'those days'} back to
                  whatever the scans say. They will see the reason.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={undoWhy}
                    onChange={(e) => setUndoWhy(e.target.value)}
                    autoFocus
                    placeholder="Why is this being cancelled?"
                    className="min-w-[16rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    onClick={() => undo(pickedRow.id)}
                    disabled={busy === pickedRow.id || undoWhy.trim().length < 3}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {busy === pickedRow.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    Cancel the leave
                  </button>
                  <button
                    onClick={() => { setUndoing(null); setUndoWhy(''); setUndoErr(null) }}
                    className="rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-white"
                  >
                    Keep it
                  </button>
                </div>
                {undoErr && <p className="mt-2 text-xs text-red-300">{undoErr}</p>}
              </div>
            )}
          </div>
        )}
        </>)}
      </section>

      {/* ── holidays (moved here from Setup) ─────────────────── */}
      <HolidaysCard onChange={load} />

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