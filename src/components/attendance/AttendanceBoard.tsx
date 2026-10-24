// src/components/attendance/AttendanceBoard.tsx
//
// Everybody's attendance, for HR and the super admin. Route:
// /hr/attendance and /admin/attendance.
//
// Every figure on this page comes from attendance_board() — the tiles,
// the chart and the list all count the same rows. Worked out separately
// they drift, and then the tile says 21 present while twenty names are
// listed under it, and nobody believes either.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Coffee, Users, CheckCircle2, Clock3, UserX, ChevronLeft, ChevronRight,
  Download, Search, Building2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'
import { istDate } from '../../lib/format'
import DayDrawer, { type DayPerson } from './DayDrawer'
import RequestsCard from './RequestsCard'


// ── The colours ─────────────────────────────────────────────────
//
// Orange is the brand's, so orange is what PRESENT looks like — the
// thing the page is actually about. Late is a lighter amber, which
// reads as the same colour family a shade off, because being late is
// being present, late.
//
// "Not in yet" is deliberately GREY. It used to be alarm red, and at
// nine in the morning that made twenty of twenty-two people look like
// a disaster when the only thing that had happened was that the day
// had not started. Red is kept for Absent — a day that is over and
// nobody came — which is the one state on this page that is a problem.
const C = {
  present: '#f97316',   // brand orange
  late:    '#fbbf24',   // amber, one shade off it
  notIn:   '#3f3f46',   // zinc — nothing has happened yet
  absent:  '#b91c1c',   // and this one is a problem
  grid:    '#1f1f1f',
  axis:    '#52525b',
}


type Row = {
  user_id: string
  emp_code: string
  full_name: string
  branch_id: string | null
  branch: string | null
  department: string | null
  designation: string | null
  status: string
  check_in: string | null
  check_out: string | null
  minutes_worked: number
  lunch_minutes: number
  late_minutes: number
  is_late: boolean
  lunch_late_min: number
  lunch_open: boolean
  scans: number
}

type Counts = {
  total: number; present: number; late: number
  not_in: number; absent: number; on_time: number
  lunch_late: number; lunch_open: number; minutes: number
}

type WeekDay = { day: string; present: number; late: number; absent: number; week_off: boolean }

type Branch = { id: string; name: string }

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '—'

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const shortDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })

const longDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

const shift = (d: string, by: number) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + by)
  return x.toISOString().slice(0, 10)
}

export default function AttendanceBoard() {
  const [date, setDate] = useState(istDate())
  const [branch, setBranch] = useState('')          // '' = all
  const [branches, setBranches] = useState<Branch[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [week, setWeek] = useState<WeekDay[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<DayPerson | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const args = { p_date: date, p_branch: branch || null }
    const [b, r, c, w, fix] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase.rpc('attendance_board', args),
      supabase.rpc('attendance_counts', args),
      supabase.rpc('attendance_week', { p_days: 7, p_branch: branch || null }),
      // Whether the correction panels appear at all. Asked of the
      // database rather than worked out from a role: the answer has to
      // be the same one the functions themselves will give.
      supabase.rpc('can_fix_attendance'),
    ])
    const e = b.error ?? r.error ?? c.error ?? w.error
    setErr(e ? e.message : null)
    setBranches((b.data ?? []) as Branch[])
    setRows((r.data ?? []) as unknown as Row[])
    setCounts(((c.data ?? []) as unknown as Counts[])[0] ?? null)
    setWeek((w.data ?? []) as unknown as WeekDay[])
    setCanEdit(fix.data === true)
    setLoading(false)
  }, [date, branch])

  useEffect(() => { load() }, [load])

  const today = date === istDate()

  const shown = useMemo(
    () =>
      rows.filter((x) => {
        const t = `${x.full_name} ${x.emp_code} ${x.branch ?? ''} ${x.department ?? ''}`.toLowerCase()
        return !q || t.includes(q.toLowerCase())
      }),
    [rows, q],
  )

  // Branch and department counts come off the same rows as everything
  // else, so they add up to the tiles above them.
  const byBranch = useMemo(() => tally(rows, (x) => x.branch ?? 'No branch'), [rows])
  const byDept = useMemo(() => tally(rows, (x) => x.department ?? 'No department'), [rows])

  const donut = counts
    ? [
        { name: 'On time', value: counts.on_time, fill: C.present },
        { name: 'Late', value: counts.late, fill: C.late },
        { name: today ? 'Not in yet' : 'Absent', value: counts.not_in + counts.absent,
          fill: today ? C.notIn : C.absent },
      ].filter((s) => s.value > 0)
    : []

  function csv() {
    const head = ['Code', 'Name', 'Branch', 'Department', 'Status', 'In', 'Out', 'Worked', 'Late (min)']
    const lines = shown.map((x) => [
      x.emp_code, x.full_name, x.branch ?? '', x.department ?? '', x.status,
      clock(x.check_in), clock(x.check_out), hhmm(x.minutes_worked), String(x.late_minutes),
    ])
    // A BOM, so Excel opens it as UTF-8 and Gujarati names survive — the
    // same trick the design report uses.
    const body = '﻿' + [head, ...lines].map((r) => r.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          <p className="mt-1 text-sm text-gray-400">{longDay(date)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setDate(shift(date, -1))} className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white" aria-label="Previous day">
            <ChevronLeft size={16} />
          </button>
          {/* The CRM's own picker, not the browser's. Chrome draws a
              white calendar on a dark page, and it is the one control
              on this screen that looks like it belongs to somebody
              else. The future is still refused — the register cannot
              know a day that has not happened. */}
          <div className="min-w-[11rem]">
            <DateField
              value={date}
              onChange={(v) => setDate(!v ? date : v > istDate() ? istDate() : v)}
            />
          </div>
          <button
            onClick={() => setDate(shift(date, 1))}
            disabled={today}
            className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white disabled:opacity-30"
            aria-label="Next day"
          >
            <ChevronRight size={16} />
          </button>
          {!today && (
            <button onClick={() => setDate(istDate())} className="text-xs text-orange-400 hover:underline">Today</button>
          )}
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none"
            aria-label="Branch"
          >
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {err && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>
      )}

      {canEdit && <RequestsCard onChanged={load} />}

      <div className={loading ? 'opacity-50' : ''}>
        {/* ── the four figures ───────────────────────────────────── */}
        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile icon={<Users size={15} />} label="Who scans" value={counts?.total ?? 0} />
          <Tile
            icon={<CheckCircle2 size={15} />}
            label="Present"
            value={counts?.present ?? 0}
            note={counts && counts.total ? `${Math.round((counts.present / counts.total) * 100)}% of the team` : undefined}
            tone="text-orange-400"
          />
          <Tile
            icon={<Clock3 size={15} />}
            label="Late"
            value={counts?.late ?? 0}
            note={counts && counts.late ? 'counted from the shift start' : undefined}
            tone={counts?.late ? 'text-amber-400' : undefined}
          />
          <Tile
            icon={<Coffee size={15} />}
            label="Late from lunch"
            value={counts?.lunch_late ?? 0}
            note={counts?.lunch_open ? `${counts.lunch_open} never scanned back` : undefined}
            tone={counts?.lunch_late ? 'text-amber-400' : undefined}
          />
          <Tile
            icon={<UserX size={15} />}
            label={today ? 'Not in yet' : 'Absent'}
            value={(counts?.not_in ?? 0) + (counts?.absent ?? 0)}
            tone={today ? undefined
                  : (counts?.absent ?? 0) > 0 ? 'text-red-400' : undefined}
          />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* ── the week ─────────────────────────────────────────── */}
          <section className="rounded-2xl border border-[#242424] bg-[#141414] p-5 lg:col-span-2">
            <h2 className="text-sm font-medium text-gray-300">The last seven days</h2>
            <div className="mt-4 h-60">
              {week.length === 0 ? (
                <Empty text="Nothing recorded yet." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={week} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="2 6" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDay} stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} width={24} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      contentStyle={{ background: '#17171a', border: '1px solid #2a2a2a',
                                      borderRadius: 12, fontSize: 12, padding: '8px 12px' }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                      labelFormatter={(d) => longDay(String(d))}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="present" name="Present" stackId="a" fill={C.present} radius={[0, 0, 3, 3]} />
                    <Bar dataKey="late" name="Late" stackId="a" fill={C.late} />
                    <Bar dataKey="absent" name="Not in" stackId="a" fill={C.notIn} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {week.some((d) => d.week_off) && (
              <p className="mt-2 text-xs text-gray-500">
                Sundays read as nobody in — weekly offs and holidays are not in the system yet.
              </p>
            )}
          </section>

          {/* ── the day, as a ring ───────────────────────────────── */}
          <section className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
            <h2 className="text-sm font-medium text-gray-300">{today ? 'Right now' : 'That day'}</h2>
            <div className="relative mt-4 h-60">
              {donut.length === 0 ? (
                <Empty text="No scans on this day." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none">
                        {donut.map((s) => <Cell key={s.name} fill={s.fill} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#17171a', border: '1px solid #2a2a2a',
                                               borderRadius: 12, fontSize: 12, padding: '8px 12px' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center">
                    <p className="text-2xl font-semibold tabular-nums">{counts?.total ?? 0}</p>
                    <p className="text-[11px] text-gray-500">who scan</p>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        {/* ── the register ───────────────────────────────────────── */}
        <section className="mt-4 rounded-2xl border border-[#242424] bg-[#141414]">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#242424] px-5 py-4">
            <h2 className="mr-auto text-sm font-medium text-gray-300">
              {today ? "Today's attendance" : 'Attendance'}
              <span className="ml-2 text-xs text-gray-500">
                {shown.length} people{canEdit ? ' · tap a row to correct a day' : ''}
              </span>
            </h2>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, code, branch"
                className="w-56 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              onClick={csv}
              disabled={shown.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:text-white disabled:opacity-40"
            >
              <Download size={13} /> Export
            </button>
          </div>

          {shown.length === 0 ? (
            <Empty text={loading ? 'Loading…' : 'Nobody matches this.'} pad />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                    <th className="px-5 py-3 font-normal">Code</th>
                    <th className="py-3 pr-4 font-normal">Name</th>
                    <th className="py-3 pr-4 font-normal">Branch</th>
                    <th className="py-3 pr-4 font-normal">In</th>
                    <th className="py-3 pr-4 font-normal">Out</th>
                    <th className="py-3 pr-4 font-normal">Worked</th>
                    <th className="py-3 pr-5 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((x) => (
                    <tr
                      key={x.user_id}
                      onClick={() => setOpen(x)}
                      className="cursor-pointer border-b border-[#1c1c1c] transition-colors last:border-0 hover:bg-[#1a1a1a]"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{x.emp_code}</td>
                      <td className="py-3 pr-4">
                        <p className="font-medium">{x.full_name}</p>
                        <p className="text-xs text-gray-500">{x.designation || x.department || '—'}</p>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">{x.branch ?? '—'}</td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-gray-300">
                        {clock(x.check_in)}
                        {x.is_late && <span className="ml-2 text-xs text-amber-400">+{x.late_minutes}m</span>}
                        {/* Back late from lunch. The minutes have been
                            recorded since Hr_HR1d and the person is told
                            on their phone the moment they scan; until
                            Hr_HR23 the register never carried them, so
                            HR was the only one who could not see it. */}
                        {x.lunch_late_min > 0 && (
                          <span className="ml-2 text-xs text-amber-400" title="Back late from lunch">
                            🍽 +{x.lunch_late_min}m
                          </span>
                        )}
                        {x.lunch_open && (
                          <span className="ml-2 text-xs text-gray-500" title="Went for lunch and never scanned back">
                            lunch not closed
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-gray-300">{clock(x.check_out)}</td>
                      <td className="py-3 pr-4 tabular-nums text-gray-300">
                        {x.check_in ? hhmm(x.minutes_worked) : '—'}
                        {x.lunch_minutes > 0 && <span className="ml-2 text-xs text-gray-600">lunch {x.lunch_minutes}m</span>}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <Status s={x.status} late={x.is_late} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* A row opens the day: the punches that made it, what it was
            worked out to be, and the two ways to correct it. */}
        {open && (
          <DayDrawer
            person={open}
            date={date}
            canEdit={canEdit}
            onClose={() => setOpen(null)}
            onChanged={load}
          />
        )}

        {/* ── who is where ───────────────────────────────────────── */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Tally title="Branch-wise" icon={<Building2 size={14} />} rows={byBranch} />
          <Tally title="Department-wise" icon={<Users size={14} />} rows={byDept} />
        </div>
      </div>
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────

function cell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function tally(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, { total: number; present: number }>()
  for (const r of rows) {
    const k = key(r)
    const c = m.get(k) ?? { total: 0, present: 0 }
    c.total += 1
    if (r.check_in) c.present += 1
    m.set(k, c)
  }
  return [...m.entries()].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.total - a.total)
}

function Tile({
  icon, label, value, note, tone,
}: { icon: React.ReactNode; label: string; value: number; note?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[#242424] bg-[#141414] px-5 py-4 transition-colors hover:border-[#2e2e2e]">
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#1e1e1e] text-gray-400">
          {icon}
        </span>
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone ?? 'text-gray-100'}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-gray-600">{note}</p>}
    </div>
  )
}

function Status({ s, late }: { s: string; late: boolean }) {
  const cls =
    s === 'Present' && !late ? 'bg-orange-500/10 text-orange-300 ring-1 ring-orange-500/20'
    : s === 'Present' ? 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20'
    : s === 'Half day' ? 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20'
    : s === 'Leave' ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/20'
    : s === 'Not in yet' ? 'bg-[#1f1f1f] text-gray-400 ring-1 ring-[#2a2a2a]'
    : 'bg-red-500/10 text-red-300 ring-1 ring-red-500/20'
  return (
    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${cls}`}>
      {s === 'Present' && late ? 'Late' : s}
    </span>
  )
}

function Tally({
  title, icon, rows,
}: { title: string; icon: React.ReactNode; rows: { name: string; total: number; present: number }[] }) {
  return (
    <section className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">{icon} {title}</h2>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Nothing yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-300">{r.name}</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#242424]">
                <span
                  className="block h-full rounded-full bg-orange-500"
                  style={{ width: `${r.total ? (r.present / r.total) * 100 : 0}%` }}
                />
              </span>
              <span className="w-14 text-right text-xs tabular-nums text-gray-400">
                {r.present}/{r.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Empty({ text, pad }: { text: string; pad?: boolean }) {
  return (
    <div className={`flex h-full items-center justify-center text-sm text-gray-500 ${pad ? 'py-12' : ''}`}>
      {text}
    </div>
  )
}