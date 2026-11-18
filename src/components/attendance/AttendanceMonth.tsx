import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, CalendarDays, Clock, Coffee, Download, Loader2, Search, Users, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { downloadXlsx } from '../../lib/xlsx'
import { DateField } from '../DateField'

/*
  Attendance, a month at a time.

  The day register answers "who is in today". This answers the question
  HR asks at the end of the month: how many times was each person late,
  who is past the free ones, and — clicking a name — which days.

  One row of tabs on both views — Daily · This month · Last month ·
  Custom — so there is one way to pick the period, not three (Hr_HR42). Late count and minutes are for exactly those dates.
  "Past the free lates" is a monthly rule, so it is shown only when the
  range is whole calendar months — then it is payroll's own late_days()
  per month, added up. A range that cuts a month in half gets "—".
*/

type Branch = { id: string; name: string }

type Row = {
  user_id: string; emp_code: string | null; full_name: string; designation: string | null
  branch_id: string | null; branch_name: string | null; tracked: boolean
  present_days: number; late_count: number; late_minutes: number
  late_allowed: number
  lunch_late_days: number; lunch_late_minutes: number
  leave_days: number; overtime_minutes: number; worked_minutes: number
  last_late: string | null
  late_over: number | null       // null when the range is not whole months
  half_days: number | null
  whole_months: boolean
}

type Day = {
  work_date: string; status: string | null; check_in: string | null; check_out: string | null
  is_late: boolean; late_minutes: number; lunch_late_min: number
  minutes_worked: number; overtime_minutes: number; punches: string[]
}

type Filter = 'all' | 'late' | 'over'

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)

const monthName = (m: string) =>
  new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// First and last day of a YYYY-MM month, the last capped at today.
function monthSpan(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)
  return { from: `${m}-01`, to: last }
}

export type Period = 'daily' | 'this' | 'last' | 'custom'

function stepMonth(m: string, by: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

const fmtD = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// What the range is called on screen and in the file name.
function rangeName(from: string, to: string) {
  const s = monthSpan(from.slice(0, 7))
  if (from === s.from && to === s.to) return monthName(from.slice(0, 7))
  return `${fmtD(from)} – ${fmtD(to)}`
}

const hm = (min: number) => {
  const m = Math.max(0, Math.round(Number(min) || 0))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—'

export default function AttendanceMonth({ branches, onDay, initial = 'this' }: {
  branches: Branch[]; onDay: () => void; initial?: Exclude<Period, 'daily'>
}) {
  const [mode, setMode] = useState<Exclude<Period, 'daily'>>(initial)
  const [cFrom, setCFrom] = useState(monthSpan(thisMonth()).from)
  const [cTo, setCTo] = useState(todayStr())
  const month = mode === 'last' ? stepMonth(thisMonth(), -1) : thisMonth()
  const from = mode === 'custom' ? cFrom : monthSpan(month).from
  const to = mode === 'custom' ? cTo : monthSpan(month).to
  const label = rangeName(from, to)
  const [branch, setBranch] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    if (!from || !to) { setLoading(false); return }
    const { data, error } = await supabase.rpc('attendance_range', { p_from: from, p_to: to, p_branch: branch || null })
    setLoading(false)
    if (error) return setErr(error.message)
    setRows((data ?? []) as Row[])
  }, [from, to, branch])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'late' && r.late_count === 0) return false
      if (filter === 'over' && !(Number(r.late_over) > 0)) return false
      if (!t) return true
      return [r.full_name, r.emp_code ?? '', r.branch_name ?? '', r.designation ?? ''].join(' ').toLowerCase().includes(t)
    })
  }, [rows, q, filter])

  const anyLate = rows.filter((r) => r.late_count > 0).length
  const whole = rows[0]?.whole_months ?? true
  const over = rows.filter((r) => Number(r.late_over) > 0).length
  const lateMin = rows.reduce((n, r) => n + Number(r.late_minutes), 0)
  const allowed = rows[0]?.late_allowed ?? 3

  function toExcel() {
    downloadXlsx(`attendance_${from}_to_${to}`, [{
      name: label.slice(0, 31),
      columns: [
        { header: 'Code', width: 9 }, { header: 'Name', width: 22 }, { header: 'Designation', width: 20 },
        { header: 'Branch', width: 12 }, { header: 'Present days', kind: 'number' }, { header: 'Late (times)', kind: 'number' },
        { header: 'Late minutes', kind: 'number' }, { header: `Past the ${allowed} free`, kind: 'number', width: 12 },
        { header: 'Half days (suggested)', kind: 'number', width: 14 }, { header: 'Lunch late (times)', kind: 'number', width: 14 },
        { header: 'Lunch late minutes', kind: 'number', width: 14 }, { header: 'Leave days', kind: 'number' },
        { header: 'Overtime (h:mm)', width: 12 }, { header: 'Worked (h:mm)', width: 12 },
        { header: 'Last late', kind: 'date', width: 12 }, { header: 'On the scanner', width: 12 },
      ],
      rows: shown.map((r) => [
        r.emp_code ?? '', r.full_name, r.designation ?? '', r.branch_name ?? '', r.present_days, r.late_count,
        r.late_minutes, r.late_over ?? '', r.half_days === null ? '' : Number(r.half_days), r.lunch_late_days, r.lunch_late_minutes, Number(r.leave_days),
        hm(r.overtime_minutes), hm(r.worked_minutes), r.last_late ?? '', r.tracked ? 'Yes' : 'No',
      ]),
    }])
  }

  const th = 'border-b border-[#242424] px-4 py-3 text-left font-normal'
  const td = 'border-t border-[#202020] px-4 py-3'

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="mt-1 text-sm text-gray-400">{label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodTabs
            active={mode}
            onPick={(k) => {
              if (k === 'daily') return onDay()
              if (k === 'custom') { setCFrom(from); setCTo(to > todayStr() ? todayStr() : to) }
              setMode(k)
            }}
          />
          {mode === 'custom' && (
            <>
              <div className="w-40"><DateField value={cFrom} onChange={(v) => v && setCFrom(v > todayStr() ? todayStr() : v)} /></div>
              <span className="text-xs text-gray-500">to</span>
              <div className="w-40"><DateField value={cTo} onChange={(v) => v && setCTo(v > todayStr() ? todayStr() : v)} /></div>
            </>
          )}
          <select
            value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Branch"
            className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {/* ---------------- the month in four numbers ---------------- */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Users size={16} />} label="People" value={rows.length} onClick={() => setFilter('all')} on={filter === 'all'} />
        <Tile icon={<Clock size={16} />} label="Late at least once" value={anyLate} tone="text-amber-300"
              onClick={() => setFilter('late')} on={filter === 'late'} />
        {whole ? (
          <Tile icon={<AlertTriangle size={16} />} label={`Past the ${allowed} free lates`} value={over} tone="text-red-400"
                sub="a half day each is suggested" onClick={() => setFilter('over')} on={filter === 'over'} />
        ) : (
          <Tile icon={<AlertTriangle size={16} />} label={`Past the ${allowed} free lates`} value="—"
                sub="counted per whole month — pick a month" />
        )}
        <Tile icon={<CalendarDays size={16} />} label="Late minutes, all together" value={hm(lateMin)} sub="hours : minutes" />
      </div>

      {/* ---------------- one row per person ---------------- */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#242424] px-5 py-4">
          <p className="text-sm">
            <span className="font-semibold text-white">{label}</span>
            <span className="ml-2 text-gray-500">{shown.length} people · tap a row to see their days</span>
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, branch"
                className="w-56 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button onClick={toExcel} disabled={shown.length === 0}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">
              <Download size={15} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className={th}>Code</th><th className={th}>Name</th><th className={th}>Branch</th>
                <th className={`${th} text-right`}>Present</th><th className={`${th} text-right`}>Late</th>
                <th className={`${th} text-right`}>Late min</th><th className={`${th} text-right`}>Lunch late</th>
                <th className={`${th} text-right`}>Leave</th><th className={`${th} text-right`}>Overtime</th>
                <th className={th}>Last late</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.user_id} onClick={() => setOpen(r)} className="cursor-pointer align-top transition-colors hover:bg-[#1a1a1a]">
                  <td className={`${td} font-mono text-xs text-gray-500`}>{r.emp_code ?? '—'}</td>
                  <td className={td}>
                    <span className="block font-medium text-white">{r.full_name}</span>
                    <span className="block text-xs text-gray-500">{r.designation ?? ''}</span>
                  </td>
                  <td className={`${td} text-gray-400`}>{r.branch_name ?? '—'}</td>
                  <td className={`${td} text-right tabular-nums text-gray-300`}>{r.present_days}</td>
                  <td className={`${td} text-right`}>
                    {!r.tracked ? (
                      <span className="text-xs text-gray-600">not on scanner</span>
                    ) : (
                      <>
                        <span className={`tabular-nums font-semibold ${r.late_count === 0 ? 'text-gray-600' : Number(r.late_over) > 0 ? 'text-red-400' : 'text-amber-300'}`}>
                          {r.late_count}
                        </span>
                        {Number(r.late_over) > 0 && (
                          <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-300">
                            {r.late_over} over
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-400`}>{r.late_minutes > 0 ? r.late_minutes : '—'}</td>
                  <td className={`${td} text-right tabular-nums text-gray-400`}>
                    {r.lunch_late_days > 0 ? <>{r.lunch_late_days}<span className="text-gray-600"> · {r.lunch_late_minutes}m</span></> : '—'}
                  </td>
                  <td className={`${td} text-right tabular-nums text-gray-400`}>{Number(r.leave_days) > 0 ? Number(r.leave_days) : '—'}</td>
                  <td className={`${td} text-right tabular-nums text-gray-400`}>{r.overtime_minutes > 0 ? hm(r.overtime_minutes) : '—'}</td>
                  <td className={`${td} text-xs text-gray-500`}>{r.last_late ? shortDay(r.last_late) : '—'}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                  {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : filter !== 'all' || q ? 'Nobody matches.' : 'Nobody to show for this month.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-3 text-xs text-gray-600">
        The first {allowed} lates of each month are free; each one after is a suggested half day, decided by HR in Payroll.
        Late counts only full minutes past the shift start (and past the grace, if the branch has one).
      </p>

      {open && <PersonMonth row={open} from={from} to={to} label={label} onClose={() => setOpen(null)} />}
    </div>
  )
}

// The one way to pick the period, the same on the day view and here.
export function PeriodTabs({ active, onPick }: { active: Period; onPick: (p: Period) => void }) {
  const tabs: [Period, string][] = [['daily', 'Daily'], ['this', 'This month'], ['last', 'Last month'], ['custom', 'Custom']]
  return (
    <div className="flex rounded-lg border border-[#2a2a2a] p-0.5" role="tablist" aria-label="Period">
      {tabs.map(([k, text]) => (
        <button
          key={k}
          role="tab"
          aria-selected={active === k}
          onClick={() => onPick(k)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            active === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

const shortDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

function Tile({ icon, label, value, sub, tone = 'text-white', onClick, on }: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; tone?: string; onClick?: () => void; on?: boolean
}) {
  const Box = onClick ? 'button' : 'div'
  return (
    <Box onClick={onClick}
         className={`rounded-2xl border bg-[#151515] p-5 text-left transition-colors ${on ? 'border-orange-600/50' : 'border-[#242424]'} ${onClick ? 'hover:border-orange-600/40' : ''}`}>
      <p className="flex items-center gap-2 text-sm text-gray-400"><span className="text-gray-500">{icon}</span>{label}</p>
      <p className={`mt-3 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </Box>
  )
}

/*
  One person's month, every day, in a window in the middle of the screen.
  Each late day carries its number in the
  month, and the ones past the free lates are marked — so "why is there
  a half day on my slip" has its answer on one screen.
*/
function PersonMonth({ row, from, to, label, onClose }: { row: Row; from: string; to: string; label: string; onClose: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    void (async () => {
      const { data, error } = await supabase.rpc('attendance_person_range', { p_user: row.user_id, p_from: from, p_to: to })
      if (dead) return
      if (error) setErr(error.message)
      else setDays((data ?? []) as Day[])
    })()
    return () => { dead = true }
  }, [row.user_id, from, to])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // The running number of each late day within ITS month, oldest
  // first — the free lates start again every month. Only shown when the
  // range starts on a month's 1st; mid-month, earlier lates are unseen
  // and a number would be a guess.
  const numbered = from.slice(8, 10) === '01'
  const lateNo = useMemo(() => {
    const m = new Map<string, number>()
    const per = new Map<string, number>()
    for (const d of days ?? []) {
      if (!d.is_late) continue
      const k = d.work_date.slice(0, 7)
      const n = (per.get(k) ?? 0) + 1
      per.set(k, n)
      m.set(d.work_date, n)
    }
    return m
  }, [days])

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#242424] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">{row.full_name}</h3>
            <p className="text-xs text-gray-500">
              {[row.emp_code, row.designation, row.branch_name].filter(Boolean).join(' · ')} · {label}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-4 gap-px border-b border-[#242424] bg-[#242424]">
          {[
            ['Present', String(row.present_days), 'text-white'],
            ['Late', String(row.late_count), Number(row.late_over) > 0 ? 'text-red-400' : row.late_count > 0 ? 'text-amber-300' : 'text-white'],
            ['Late min', String(row.late_minutes), 'text-white'],
            ['Leave', String(Number(row.leave_days)), 'text-white'],
          ].map(([k, v, tone]) => (
            <div key={k} className="bg-[#161616] px-4 py-3">
              <p className="text-[11px] text-gray-500">{k}</p>
              <p className={`text-lg font-semibold tabular-nums ${tone}`}>{v}</p>
            </div>
          ))}
        </div>

        {Number(row.late_over) > 0 && (
          <p className="mx-5 mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {row.late_count} lates — {row.late_allowed} a month are free, {row.late_over} past that. HR decides the
            {' '}{Number(row.half_days)} suggested half {Number(row.half_days) === 1 ? 'day' : 'days'} in Payroll.
          </p>
        )}
        {!row.tracked && (
          <p className="mx-5 mt-4 rounded-lg bg-[#1f1f1f] px-3 py-2 text-xs text-gray-400">
            Not on the scanner, so no late is counted for them.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {days && days.length > 0 && (
            <div className="mb-2 grid grid-cols-[6.5rem_5.5rem_5.5rem_1fr_3.5rem] gap-3 px-3 text-[11px] text-gray-600">
              <span>Day</span><span>Status</span><span>In</span><span>Late</span><span className="text-right">Worked</span>
            </div>
          )}
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
          {!days && !err && <Loader2 size={18} className="mx-auto mt-10 animate-spin text-gray-500" />}
          {days && (
            <ul className="space-y-1.5">
              {days.map((d) => {
                const no = lateNo.get(d.work_date)
                const past = numbered && no !== undefined && no > row.late_allowed
                const sunday = new Date(d.work_date + 'T00:00:00').getDay() === 0
                return (
                  <li key={d.work_date}
                      className={`grid grid-cols-[6.5rem_5.5rem_5.5rem_1fr_3.5rem] items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        past ? 'border-red-600/40 bg-red-500/5' : d.is_late ? 'border-amber-600/30 bg-amber-500/5' : 'border-[#242424] bg-[#171717]'}`}>
                    <span className={`text-xs ${sunday ? 'text-gray-600' : 'text-gray-400'}`}>{shortDay(d.work_date)}</span>
                    <span><Status s={d.status} hasIn={!!d.check_in} /></span>
                    <span className="tabular-nums text-gray-300">{clock(d.check_in)}</span>
                    <span className="min-w-0 space-y-0.5 text-xs">
                      {d.is_late && (
                        <span className={`block whitespace-nowrap ${past ? 'text-red-300' : 'text-amber-300'}`}>
                          <Clock size={11} className="mr-1 inline" />{d.late_minutes} min late{numbered ? ` · #${no}` : ''}{past ? ' · over' : ''}
                        </span>
                      )}
                      {d.lunch_late_min > 0 && (
                        <span className="block whitespace-nowrap text-gray-400">
                          <Coffee size={11} className="mr-1 inline" />{d.lunch_late_min} min late from lunch
                        </span>
                      )}
                    </span>
                    <span className="text-right text-xs tabular-nums text-gray-500" title="Worked (h:mm)">
                      {d.minutes_worked > 0 ? hm(d.minutes_worked) : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Status({ s, hasIn }: { s: string | null; hasIn: boolean }) {
  const label = s ?? (hasIn ? 'Present' : '—')
  const tone =
    label === 'Present' ? 'bg-orange-500/15 text-orange-300'
    : label === 'Leave' || label === 'Half day' ? 'bg-sky-500/15 text-sky-300'
    : label === 'Holiday' || label === 'Weekly off' ? 'bg-[#1f1f1f] text-gray-400'
    : label === 'Absent' ? 'bg-red-500/15 text-red-300'
    : 'text-gray-600'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}>{label}</span>
}