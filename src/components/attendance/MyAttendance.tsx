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
//
// Laid out as the month (Nov 2026): every day of the calendar carries a
// small strip of the working day — 8 am on the left, 10 pm on the right —
// with the stretch from In to Out filled in, overtime at its end and a
// mark where a late start began. A month of them reads like a punch card:
// the long days, the late ones and the gaps show at a glance, and a tap
// opens that day in full beside it.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, MessageSquarePlus, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authUser } from '../../lib/auth'
import { says } from './words'

type Ask = {
  id: string
  work_date: string
  kind: string
  at_time: string
  reason: string
  state: string
  decide_note: string | null
}

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
  meeting_minutes: number
  gross_minutes: number
  minutes_worked: number
  overtime_minutes: number
  lunch_open: boolean
  lunch_late_min: number
  reasons_pending: number
  remarks: string | null
}

// The strip's scale: 8 am to 10 pm. A day that runs past it is drawn to
// the edge and says so.
const SCALE_FROM = 8 * 60
const SCALE_TO = 22 * 60
const SCALE = SCALE_TO - SCALE_FROM

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '—'

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const longDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

const monthTitle = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

// Minutes after the work day's midnight, India time. An Out after
// midnight (Hr_HR44) lands past 24:00 rather than back at the start.
function minutesOf(iso: string | null, workDate: string): number | null {
  if (!iso) return null
  const t = new Date(iso)
  const date = t.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [h, m] = t
    .toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .split(':')
    .map(Number)
  return h * 60 + m + (date > workDate ? 1440 : 0)
}

const pct = (min: number) => Math.min(Math.max(((min - SCALE_FROM) / SCALE) * 100, 0), 100)

// What one day looks like on the strip.
function stripOf(d: Day) {
  const start = minutesOf(d.check_in, d.work_date)
  const end = minutesOf(d.check_out, d.work_date)
  if (start == null) return null
  const stop = end ?? start
  const ot = Math.min(d.overtime_minutes || 0, Math.max(stop - start, 0))
  return {
    left: pct(start),
    work: Math.max(pct(stop - ot) - pct(start), end == null ? 1.5 : 0.8),
    ot: pct(stop) - pct(stop - ot),
    open: end == null,                   // still in, or forgot to scan out
    pastEdge: stop > SCALE_TO,
  }
}

type Tone = { cell: string; chip: string; word: string }

// Status to look. Present days carry their strip; the others are a
// colour of their own, so leave and absence read from across the room.
function toneOf(status: string | undefined): Tone {
  switch (status) {
    case 'Present':
      return { cell: '', chip: 'bg-green-950/60 text-green-400', word: 'Present' }
    case 'Half day':
      return { cell: 'bg-amber-500/[0.07]', chip: 'bg-amber-950/50 text-amber-300', word: 'Half day' }
    case 'Leave':
      return { cell: 'bg-sky-500/[0.08]', chip: 'bg-sky-950/50 text-sky-300', word: 'Leave' }
    case 'Absent':
      return { cell: 'bg-red-500/[0.08]', chip: 'bg-red-950/50 text-red-300', word: 'Absent' }
    case 'Holiday':
      return { cell: 'bg-violet-500/[0.08]', chip: 'bg-violet-950/50 text-violet-300', word: 'Holiday' }
    case 'Weekly off':
      return { cell: '', chip: 'bg-[#1f1f1f] text-gray-400', word: 'Weekly off' }
    default:
      return { cell: '', chip: 'bg-[#1f1f1f] text-gray-400', word: status ?? 'Nothing recorded' }
  }
}

// The same calendar does two jobs:
//   <MyAttendance />                       your own month, at /attendance
//   <MyAttendance userId name year month /> somebody else's, opened by HR
//                                          from the leave board. The month
//                                          is then the board's month, and
//                                          the "ask HR" form is not offered
//                                          — HR does not ask itself.
//
// Rows are always asked for by user_id. RLS alone is not enough here: for
// HR it hands back EVERYBODY's rows, and a month of everyone's days laid
// on one calendar is not anybody's month.
type Props = { userId?: string; name?: string; year?: number; month?: number }

export default function MyAttendance({ userId, name, year: ctlYear, month: ctlMonth }: Props = {}) {
  const now = new Date()
  const today = todayIST()
  const [ownYear, setYear] = useState(now.getFullYear())
  const [ownMonth, setMonth] = useState(now.getMonth())      // 0–11
  const controlled = ctlYear != null && ctlMonth != null
  const year = controlled ? ctlYear : ownYear
  const month = controlled ? ctlMonth : ownMonth
  const forOther = !!userId
  const [days, setDays] = useState<Day[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string | null>(null)
  const [asks, setAsks] = useState<Ask[]>([])
  const [asking, setAsking] = useState<string | null>(null)
  const [kind, setKind] = useState('In')
  const [at, setAt] = useState('09:00')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const from = ymd(year, month, 1)
    const to = ymd(year, month, new Date(year, month + 1, 0).getDate())
    const uid = userId ?? (await authUser()).data.user?.id
    if (!uid) { setLoading(false); return }

    const a = await supabase
        .from('attendance')
        // One unbroken string: supabase-js reads this at the type level
        // to work out the row shape, and a string joined with + is not
        // something it can read — it hands back GenericStringError instead.
        .select('work_date, status, check_in, check_out, punches, is_late, late_minutes, lunch_minutes, break_minutes, meeting_minutes, gross_minutes, minutes_worked, overtime_minutes, lunch_open, lunch_late_min, reasons_pending, remarks')
        .eq('user_id', uid)
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date', { ascending: false })

    // What has already been asked about this month. RLS hands back only
    // this person's rows, so the screen asks for everything and is given
    // what is theirs — the same as the days above.
    const r = await supabase
        .from('attendance_requests')
        .select('id, work_date, kind, at_time, reason, state, decide_note')
        .eq('user_id', uid)
        .gte('work_date', from)
        .lte('work_date', to)

    if (a.error) setNote(a.error.message)
    const got = (a.data ?? []) as unknown as Day[]
    setDays(got)
    setAsks((r.data ?? []) as unknown as Ask[])
    // Open on today in this month, else on the latest day with a record.
    setPicked((p) => p ?? (today.startsWith(from.slice(0, 7)) ? today : got[0]?.work_date ?? null))
    setLoading(false)
  }, [year, month, today, userId])

  // A different person, or a month set from outside: start fresh.
  useEffect(() => { setPicked(null); setAsking(null); setSaid(null) }, [userId, year, month])

  useEffect(() => { load() }, [load])

  async function sendAsk(workDate: string) {
    setBusy(true)
    setSaid(null)
    const { data, error } = await supabase.rpc('request_correction', {
      p_date: workDate, p_kind: kind, p_time: at, p_reason: why.trim(),
    })
    setBusy(false)
    const res = data as { ok: boolean; reason?: string } | null
    if (error || !res?.ok) {
      return setSaid({ kind: 'bad', text: error?.message ?? res?.reason ?? 'Not sent.' })
    }
    setSaid({ kind: 'ok', text: 'Sent. HR will see it on their register.' })
    setAsking(null)
    setWhy('')
    load()
  }

  function step(by: number) {
    const d = new Date(year, month + by, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
    setPicked(null)
    setAsking(null)
  }

  const byDate = useMemo(() => new Map(days.map((d) => [d.work_date, d])), [days])

  // The month as weeks, Monday first. Blanks before the 1st and after
  // the last keep the columns true.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1).getDay()           // 0 = Sunday
    const lead = (first + 6) % 7
    const count = new Date(year, month + 1, 0).getDate()
    const out: (string | null)[] = Array(lead).fill(null)
    for (let d = 1; d <= count; d++) out.push(ymd(year, month, d))
    while (out.length % 7) out.push(null)
    return out
  }, [year, month])

  const present = days.filter((d) => d.minutes_worked > 0).length
  const lates = days.filter((d) => d.is_late).length
  const minutes = days.reduce((s, d) => s + d.minutes_worked, 0)
  const overtime = days.reduce((s, d) => s + (d.overtime_minutes || 0), 0)
  const leaves = days.filter((d) => d.status === 'Leave' || d.status === 'Half day').length
  const thisMonth = year === now.getFullYear() && month === now.getMonth()

  const day = picked ? byDate.get(picked) ?? null : null

  return (
    <div className="mx-auto max-w-6xl">
      {!forOther && (
        <>
          <h1 className="text-2xl font-bold">My attendance</h1>
          <p className="mt-1 text-sm text-gray-400">Your own days, as the office clock recorded them. Tap a day to see it in full.</p>
        </>
      )}

      {note && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{note}</div>
      )}

      {/* The month, and how it adds up — one line, not three boxes. */}
      <div className={`${forOther ? '' : 'mt-6'} flex flex-wrap items-end justify-between gap-x-8 gap-y-3`}>
        {controlled ? (
          <h2 className="text-xl font-semibold tracking-tight text-white">
            {name ?? 'Attendance'} <span className="font-normal text-gray-500">· {monthTitle(year, month)}</span>
          </h2>
        ) : (
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-[11rem] text-center text-xl font-semibold tracking-tight text-white">{monthTitle(year, month)}</h2>
          <button
            onClick={() => step(1)}
            disabled={thisMonth}
            className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        )}

        <dl className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
          <Stat k="Days present" v={String(present)} />
          <Stat k="Hours worked" v={hhmm(minutes)} />
          <Stat k="Late" v={String(lates)} tone={lates > 3 ? 'text-red-400' : lates > 0 ? 'text-amber-400' : undefined} />
          {overtime > 0 && <Stat k="Overtime" v={hhmm(overtime)} tone="text-sky-400" />}
          {leaves > 0 && <Stat k="Leave" v={String(leaves)} />}
        </dl>
      </div>

      <div className={`mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] ${loading ? 'opacity-60' : ''}`}>
        {/* ── the calendar ─────────────────────────────────────── */}
        <section aria-label={`Attendance, ${monthTitle(year, month)}`}>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {WEEKDAYS.map((w) => (
              <p key={w} className="pb-1 text-center text-[11px] font-medium text-gray-500">{w}</p>
            ))}

            {cells.map((date, i) => {
              if (!date) return <span key={`b${i}`} aria-hidden="true" />
              const d = byDate.get(date)
              const future = date > today
              const isToday = date === today
              const isSunday = i % 7 === 6
              const on = picked === date
              const tone = toneOf(d?.status)
              const strip = d ? stripOf(d) : null

              const label = [
                longDate(date),
                d ? tone.word : future ? 'not yet' : 'nothing recorded',
                d && d.minutes_worked > 0 ? `${hhmm(d.minutes_worked)} worked` : '',
                d?.is_late ? `${d.late_minutes} minutes late` : '',
                d && d.overtime_minutes > 0 ? `${hhmm(d.overtime_minutes)} overtime` : '',
              ].filter(Boolean).join(', ')

              return (
                <button
                  key={date}
                  onClick={() => { setPicked(date); setAsking(null); setSaid(null) }}
                  disabled={future}
                  aria-pressed={on}
                  aria-label={label}
                  className={`group relative flex aspect-square flex-col justify-between rounded-xl border p-1.5 text-left transition-colors sm:aspect-[5/4] sm:p-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 disabled:cursor-default ${
                    on
                      ? 'border-orange-500 bg-orange-500/10'
                      : `border-[#242424] ${tone.cell || 'bg-[#151515]'} hover:border-[#3a3a3a]`
                  } ${future ? 'opacity-35' : ''}`}
                >
                  <span className="flex items-start justify-between">
                    <span
                      className={`grid h-6 min-w-6 place-items-center rounded-full text-xs font-semibold tabular-nums sm:h-7 sm:min-w-7 sm:text-sm ${
                        isToday ? 'bg-orange-500 px-1.5 text-white' : isSunday ? 'text-gray-500' : 'text-gray-200'
                      }`}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {d?.is_late && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />}
                  </span>

                  {/* The day, at a glance */}
                  {strip ? (
                    <span className="block" aria-hidden="true">
                      <span className="mb-1 hidden text-[11px] tabular-nums text-gray-400 sm:block">
                        {d && d.minutes_worked > 0 ? hhmm(d.minutes_worked) : strip.open ? 'In' : ''}
                      </span>
                      <span className="relative block h-1.5 overflow-hidden rounded-full bg-[#242424] sm:h-2">
                        <span
                          className={`absolute inset-y-0 rounded-full ${strip.open ? 'bg-orange-500/50' : 'bg-orange-500'}`}
                          style={{ left: `${strip.left}%`, width: `${strip.work}%` }}
                        />
                        {strip.ot > 0 && (
                          <span
                            className="absolute inset-y-0 rounded-r-full bg-sky-400"
                            style={{ left: `${strip.left + strip.work}%`, width: `${strip.ot}%` }}
                          />
                        )}
                        {d?.is_late && (
                          <span className="absolute inset-y-0 w-[3px] bg-amber-300" style={{ left: `${strip.left}%` }} />
                        )}
                      </span>
                    </span>
                  ) : d ? (
                    <span className="hidden truncate text-[11px] text-gray-400 sm:block">{tone.word}</span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* What the marks mean */}
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-gray-500">
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-5 rounded-full bg-orange-500" /> In to out, 8 am – 10 pm</li>
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-sky-400" /> Overtime</li>
            <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Late</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sky-500/20" /> Leave</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500/20" /> Half day</li>
          </ul>
        </section>

        {/* ── the day you picked ───────────────────────────────── */}
        <aside className="rounded-2xl border border-[#242424] bg-[#151515] p-5 lg:sticky lg:top-4 lg:self-start" aria-live="polite">
          {!picked ? (
            <p className="py-10 text-center text-sm text-gray-500">Pick a day on the calendar.</p>
          ) : (
            <DayPanel
              date={picked}
              day={day}
              asks={asks.filter((x) => x.work_date === picked)}
              asking={asking === picked}
              kind={kind} at={at} why={why} busy={busy} said={said}
              setKind={setKind} setAt={setAt} setWhy={setWhy}
              canAsk={!forOther}
              onAsk={() => { setAsking(picked); setSaid(null); setKind(day?.check_in ? 'Out' : 'In') }}
              onCancel={() => { setAsking(null); setSaid(null) }}
              onSend={() => sendAsk(picked)}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function DayPanel({
  date, day, asks, asking, kind, at, why, busy, said, setKind, setAt, setWhy, canAsk, onAsk, onCancel, onSend,
}: {
  date: string
  day: Day | null
  asks: Ask[]
  asking: boolean
  kind: string; at: string; why: string; busy: boolean
  said: { kind: 'ok' | 'bad'; text: string } | null
  setKind: (v: string) => void; setAt: (v: string) => void; setWhy: (v: string) => void
  canAsk: boolean
  onAsk: () => void; onCancel: () => void; onSend: () => void
}) {
  const tone = toneOf(day?.status)
  const strip = day ? stripOf(day) : null
  const outNextDay = day?.check_out && minutesOf(day.check_out, date)! >= 1440

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{longDate(date)}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${tone.chip}`}>{day ? tone.word : 'Nothing recorded'}</span>
      </div>

      {day && day.check_in ? (
        <>
          {/* In and out, big: the two times a day is argued about */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-gray-500">In</p>
              <p className={`text-2xl font-semibold tabular-nums ${day.is_late ? 'text-amber-300' : 'text-white'}`}>{clock(day.check_in)}</p>
              {day.is_late && <p className="text-[11px] text-amber-400">{day.late_minutes} min late</p>}
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Out</p>
              <p className="text-2xl font-semibold tabular-nums text-white">{day.check_out ? clock(day.check_out) : '—'}</p>
              {outNextDay && <p className="text-[11px] text-gray-500">after midnight</p>}
              {!day.check_out && <p className="text-[11px] text-gray-500">not scanned out</p>}
            </div>
          </div>

          {/* The same strip as the calendar, with the hours marked */}
          {strip && (
            <div className="mt-4" aria-hidden="true">
              <div className="relative h-3 overflow-hidden rounded-full bg-[#242424]">
                <span className={`absolute inset-y-0 rounded-full ${strip.open ? 'bg-orange-500/50' : 'bg-orange-500'}`} style={{ left: `${strip.left}%`, width: `${strip.work}%` }} />
                {strip.ot > 0 && <span className="absolute inset-y-0 rounded-r-full bg-sky-400" style={{ left: `${strip.left + strip.work}%`, width: `${strip.ot}%` }} />}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-600">
                <span>8 am</span><span>12</span><span>4 pm</span><span>8 pm</span><span>10</span>
              </div>
            </div>
          )}

          {/* Where the paid time went. A single number nobody can take
              apart is a number nobody believes. */}
          <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-[#242424] pt-4">
            <Pair k="In to out" v={hhmm(day.gross_minutes)} />
            <Pair k="Lunch" v={`${day.lunch_minutes}m`} />
            <Pair k="Break" v={`${day.break_minutes}m`} />
            {day.meeting_minutes > 0 && <Pair k="Meeting" v={`${day.meeting_minutes}m`} />}
            <Pair k="Regular" v={hhmm(day.minutes_worked)} strong />
            {day.overtime_minutes > 0 && <Pair k="Overtime" v={hhmm(day.overtime_minutes)} strong tone="text-sky-400" />}
          </dl>

          {day.punches.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-500">Scans</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {day.punches.map((p, i) => (
                  <span key={i} className="rounded-md border border-[#2a2a2a] px-2 py-0.5 text-xs tabular-nums text-gray-300">{p}</span>
                ))}
              </div>
            </div>
          )}

          {day.lunch_open && <p className="mt-3 text-xs text-amber-400">Lunch was not scanned back in.</p>}
          {day.lunch_late_min > 0 && <p className="mt-3 text-xs text-amber-400">Back from lunch {day.lunch_late_min} minutes late.</p>}
          {day.remarks && <p className="mt-3 text-xs text-gray-400">{day.remarks}</p>}
        </>
      ) : day ? (
        <p className="mt-4 text-sm text-gray-400">{day.remarks || `Marked as ${tone.word.toLowerCase()} for this day.`}</p>
      ) : (
        <p className="mt-4 text-sm text-gray-400">No scan was recorded on this day.{canAsk && ' If you were at work, ask HR to put it right.'}</p>
      )}

      {/* What you have already asked about this day */}
      {asks.map((x) => (
        <p key={x.id} className="mt-3 rounded-lg border border-[#242424] bg-[#161616] px-3 py-2 text-[11px]">
          <span className={x.state === 'Approved' ? 'text-green-300' : x.state === 'Refused' ? 'text-red-300' : 'text-amber-300'}>
            {x.state}
          </span>
          <span className="text-gray-500"> · {canAsk ? 'you asked' : 'asked'} for {says(x.kind)} at {x.at_time.slice(0, 5)}</span>
          {x.decide_note && <span className="block text-gray-400">HR: {x.decide_note}</span>}
        </p>
      ))}

      {/* A screen that names an action and does not offer it is worse
          than silence — so the way to ask is right here. */}
      {!canAsk ? null : asking ? (
        <div className="mt-4 rounded-lg border border-[#242424] bg-[#161616] p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={kind} onChange={(e) => setKind(e.target.value)}
              aria-label="Which scan"
              className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-2 text-xs text-white focus:border-orange-500 focus:outline-none"
            >
              <option>In</option>
              <option>Out</option>
              <option value="Lunch out">Lunch in</option>
              <option value="Lunch in">Lunch out</option>
            </select>
            <input
              type="time" value={at} onChange={(e) => setAt(e.target.value)}
              aria-label="At what time"
              className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-2 text-xs text-white [color-scheme:dark] focus:border-orange-500 focus:outline-none"
            />
          </div>
          <input
            value={why} onChange={(e) => setWhy(e.target.value)}
            placeholder="What happened? HR reads this."
            className="mt-2 w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />

          {said && (
            <p className={`mt-2 text-[11px] ${said.kind === 'ok' ? 'text-green-300' : 'text-red-300'}`}>{said.text}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              onClick={onSend}
              disabled={busy || why.trim().length < 3}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-40"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Send to HR
            </button>
            <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
            {why.trim().length < 3 && <span className="text-[11px] text-gray-600">Say what happened first.</span>}
          </div>
        </div>
      ) : (
        <>
          {said?.kind === 'ok' && <p className="mt-3 text-[11px] text-green-300">{said.text}</p>}
          <button
            onClick={onAsk}
            className="mt-4 flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-[#1a1a1a] hover:text-white"
          >
            <MessageSquarePlus size={13} /> Ask HR to correct this day
          </button>
        </>
      )}
    </div>
  )
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-500">{k}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone ?? 'text-white'}`}>{v}</dd>
    </div>
  )
}

function Pair({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-500">{k}</dt>
      <dd className={`text-sm tabular-nums ${tone ?? (strong ? 'text-white' : 'text-gray-300')}`}>{v}</dd>
    </div>
  )
}