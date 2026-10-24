// src/pages/hr/Dashboard.tsx
//
// What HR opens on. Today's team, the week behind it, and the few things
// they came here to do.
//
// The old version of this page listed hiring leads. Those moved to
// /hr/leads, which is where somebody looks for them; this page answers
// the question HR actually has at ten in the morning — who is in.
//
// Every number is read from the same place the attendance register reads
// from, so the tile and the list can never disagree. Nothing is shown
// that is not real: there is no "On leave" tile and no "Generate payslip"
// button, because leave and payroll do not exist yet and a tile that
// always reads 0 answers a question nobody asked.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, CheckCircle2, Clock3, UserX, UserPlus, QrCode, CalendarCheck,
  ClipboardList, Activity, Building2, LogIn, LogOut, Coffee,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import HrLayout from '../../components/HrLayout'
import { supabase } from '../../lib/supabase'
import { istDate } from '../../lib/format'

type Counts = {
  total: number; present: number; late: number
  not_in: number; absent: number; on_time: number; minutes: number
}
type BoardRow = {
  user_id: string; emp_code: string; full_name: string
  branch: string | null; department: string | null; designation: string | null
  status: string; check_in: string | null; check_out: string | null
  minutes_worked: number; is_late: boolean
}
type WeekDay = { day: string; present: number; late: number; absent: number; week_off: boolean }
type Person = {
  id: string; emp_code: string; full_name: string
  designation: string | null; branch_id: string | null; department_id: string | null
  date_of_joining: string | null
}
type Scan = { user_id: string; kind: string; scanned_at: string }
type Named = { id: string; name: string }

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

/** "3 hours ago" — rough on purpose; nobody needs the seconds. */
function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'day' : 'days'} ago`
}

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '—'

export default function HrDashboard() {
  const [counts, setCounts] = useState<Counts | null>(null)
  const [board, setBoard] = useState<BoardRow[]>([])
  const [week, setWeek] = useState<WeekDay[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [branches, setBranches] = useState<Named[]>([])
  const [depts, setDepts] = useState<Named[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [c, b, w, p, s, br, dp] = await Promise.all([
      supabase.rpc('attendance_counts', { p_date: istDate(), p_branch: null }),
      supabase.rpc('attendance_board', { p_date: istDate(), p_branch: null }),
      supabase.rpc('attendance_week', { p_days: 7, p_branch: null }),
      supabase
        .from('profiles')
        .select('id, emp_code, full_name, designation, branch_id, department_id, date_of_joining')
        .eq('is_active', true)
        .order('date_of_joining', { ascending: false, nullsFirst: false }),
      // The bell on the right: what has actually happened, not a feed of
      // things the system wishes it could say.
      supabase
        .from('attendance_scans')
        .select('user_id, kind, scanned_at')
        .eq('ok', true)
        .eq('work_date', istDate())
        .order('scanned_at', { ascending: false })
        .limit(8),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ])
    const e = c.error ?? b.error ?? w.error ?? p.error ?? s.error
    setErr(e ? e.message : null)
    setCounts(((c.data ?? []) as unknown as Counts[])[0] ?? null)
    setBoard((b.data ?? []) as unknown as BoardRow[])
    setWeek((w.data ?? []) as unknown as WeekDay[])
    setPeople((p.data ?? []) as unknown as Person[])
    setScans((s.data ?? []) as unknown as Scan[])
    setBranches((br.data ?? []) as Named[])
    setDepts((dp.data ?? []) as Named[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nameOf = (id: string) => people.find((x) => x.id === id)?.full_name ?? 'Someone'
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—'
  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? 'No department'

  const donut = counts
    ? [
        { name: 'On time', value: counts.on_time, fill: '#22c55e' },
        { name: 'Late', value: counts.late, fill: '#f59e0b' },
        { name: 'Not in yet', value: counts.not_in, fill: '#ef4444' },
      ].filter((x) => x.value > 0)
    : []

  const perDept = depts
    .map((d) => ({ name: d.name, n: people.filter((p) => p.department_id === d.id).length }))
    .concat([{ name: 'No department', n: people.filter((p) => !p.department_id).length }])
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)

  const perBranch = branches
    .map((b) => ({ name: b.name, n: people.filter((p) => p.branch_id === b.id).length }))
    .concat([{ name: 'No branch', n: people.filter((p) => !p.branch_id).length }])
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)

  return (
    <HrLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">HR Dashboard</h1>
            <p className="mt-1 text-sm text-gray-400">Who is in today, and what has moved.</p>
          </div>
          <div className="text-sm text-gray-400 sm:text-right">
            <p>{longDay(istDate())}</p>
            <p className="tabular-nums text-gray-500">
              {now.toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
              })}
            </p>
          </div>
        </div>

        {err && (
          <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>
        )}

        <div className={loading ? 'opacity-50' : ''}>
          {/* ── the four ─────────────────────────────────────────── */}
          <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] lg:grid-cols-4">
            <Tile icon={<Users size={15} />} label="Employees" value={people.length} note="active" />
            <Tile
              icon={<CheckCircle2 size={15} />}
              label="Present today"
              value={counts?.present ?? 0}
              note={counts?.total ? `of ${counts.total} who scan` : undefined}
              tone="text-green-400"
            />
            <Tile
              icon={<Clock3 size={15} />}
              label="Late today"
              value={counts?.late ?? 0}
              tone={counts?.late ? 'text-amber-400' : undefined}
            />
            <Tile
              icon={<UserX size={15} />}
              label="Not in yet"
              value={counts?.not_in ?? 0}
              tone={counts?.not_in ? 'text-red-400' : undefined}
            />
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* ── the week ───────────────────────────────────────── */}
            <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5 lg:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-300">Attendance, last seven days</h2>
                <Link to="/hr/attendance" className="text-xs text-orange-400 hover:underline">Open the register →</Link>
              </div>
              <div className="mt-4 h-56">
                {week.length === 0 ? (
                  <Empty text="Nothing recorded yet." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={week} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#242424" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={shortDay} stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} width={24} />
                      <Tooltip
                        contentStyle={{ background: '#121212', border: '1px solid #2a2a2a', borderRadius: 10, fontSize: 12 }}
                        labelFormatter={(d) => longDay(String(d))}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="present" name="Present" stackId="a" fill="#22c55e" />
                      <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
                      <Bar dataKey="absent" name="Not in" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
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

            {/* ── right rail ─────────────────────────────────────── */}
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
                <h2 className="text-sm font-medium text-gray-300">Quick actions</h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Action to="/hr/employees" icon={<UserPlus size={16} />} label="Add employee" />
                  <Action to="/scan" icon={<QrCode size={16} />} label="Scan attendance" />
                  <Action to="/hr/attendance" icon={<ClipboardList size={16} />} label="Attendance" />
                  <Action to="/hr/scan-setup" icon={<CalendarCheck size={16} />} label="Scan setup" />
                </div>
              </section>

              <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
                <h2 className="text-sm font-medium text-gray-300">Today, so far</h2>
                <div className="relative mt-3 h-48">
                  {donut.length === 0 ? (
                    <Empty text="No scans yet today." />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donut} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                            {donut.map((x) => <Cell key={x.name} fill={x.fill} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: '#121212', border: '1px solid #2a2a2a', borderRadius: 10, fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-x-0 top-[34%] -translate-y-1/2 text-center">
                        <p className="text-xl font-semibold tabular-nums">{counts?.total ?? 0}</p>
                        <p className="text-[11px] text-gray-500">who scan</p>
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* ── today's attendance ─────────────────────────────── */}
            <section className="rounded-2xl border border-[#242424] bg-[#151515] lg:col-span-2">
              <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
                <h2 className="text-sm font-medium text-gray-300">Today&rsquo;s attendance</h2>
                <Link to="/hr/attendance" className="text-xs text-orange-400 hover:underline">View all →</Link>
              </div>
              {board.length === 0 ? (
                <Empty text="Nobody has scanned yet." pad />
              ) : (
                <ul className="divide-y divide-[#1c1c1c]">
                  {board.slice(0, 7).map((x) => (
                    <li key={x.user_id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={x.full_name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{x.full_name}</span>
                        <span className="block text-xs text-gray-500">
                          {x.check_in ? `${clock(x.check_in)} – ${clock(x.check_out)}` : (x.branch ?? '—')}
                          {x.check_in && x.minutes_worked > 0 && (
                            <span className="ml-2 text-gray-600">{hhmm(x.minutes_worked)}</span>
                          )}
                        </span>
                      </span>
                      <Status s={x.status} late={x.is_late} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── what has just happened ─────────────────────────── */}
            <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Activity size={14} /> Recent activity
              </h2>
              {scans.length === 0 ? (
                <Empty text="Nothing today yet." pad />
              ) : (
                <ul className="mt-3 space-y-3">
                  {scans.map((s, i) => (
                    <li key={`${s.user_id}-${s.scanned_at}-${i}`} className="flex gap-3">
                      <span
                        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                          s.kind === 'In' ? 'bg-green-950/60 text-green-400'
                          : s.kind === 'Out' ? 'bg-[#1f1f1f] text-gray-400'
                          : 'bg-amber-950/50 text-amber-300'
                        }`}
                      >
                        {s.kind === 'In' ? <LogIn size={13} /> : s.kind === 'Out' ? <LogOut size={13} /> : <Coffee size={13} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-gray-200">
                          {nameOf(s.user_id)} <span className="text-gray-500">{verb(s.kind)}</span>
                        </span>
                        <span className="block text-[11px] text-gray-600">
                          {clock(s.scanned_at)} · {ago(s.scanned_at)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* ── newest people ──────────────────────────────────── */}
            <section className="rounded-2xl border border-[#242424] bg-[#151515] lg:col-span-2">
              <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
                <h2 className="text-sm font-medium text-gray-300">Recent employees</h2>
                <Link to="/hr/employees" className="text-xs text-orange-400 hover:underline">View all →</Link>
              </div>
              {people.length === 0 ? (
                <Empty text="No employees yet." pad />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                        <th className="px-5 py-3 font-normal">Name</th>
                        <th className="py-3 pr-4 font-normal">Code</th>
                        <th className="py-3 pr-4 font-normal">Department</th>
                        <th className="py-3 pr-5 font-normal">Branch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.slice(0, 5).map((p) => (
                        <tr key={p.id} className="border-b border-[#1c1c1c] last:border-0">
                          <td className="px-5 py-3">
                            <p className="font-medium">{p.full_name}</p>
                            <p className="text-xs text-gray-500">{p.designation || '—'}</p>
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-gray-500">{p.emp_code}</td>
                          <td className="py-3 pr-4 text-xs text-gray-400">{deptName(p.department_id)}</td>
                          <td className="py-3 pr-5 text-xs text-gray-400">{branchName(p.branch_id)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── where everybody is ─────────────────────────────── */}
            <div className="space-y-4">
              <Split title="Branch-wise" icon={<Building2 size={14} />} rows={perBranch} total={people.length} />
              <Split title="Department-wise" icon={<Users size={14} />} rows={perDept} total={people.length} />
            </div>
          </div>

        </div>
      </div>
    </HrLayout>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────

const verb = (kind: string) =>
  kind === 'In' ? 'checked in'
  : kind === 'Out' ? 'checked out'
  : kind === 'Lunch out' ? 'went to lunch'
  : kind === 'Lunch in' ? 'came back from lunch'
  : kind === 'Step out' ? 'stepped out'
  : 'came back'

function Tile({
  icon, label, value, note, tone,
}: { icon: React.ReactNode; label: string; value: number; note?: string; tone?: string }) {
  return (
    <div className="bg-[#151515] px-5 py-4">
      <p className="flex items-center gap-2 text-xs text-gray-400">{icon} {label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-gray-500">{note}</p>}
    </div>
  )
}

function Action({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-xl border border-[#242424] bg-[#1a1a1a] px-3 py-4 text-center text-xs text-gray-300 transition-colors hover:border-orange-500/40 hover:text-white"
    >
      <span className="text-orange-400">{icon}</span>
      {label}
    </Link>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-xs font-semibold text-gray-300">
      {initials(name)}
    </span>
  )
}

function Status({ s, late }: { s: string; late: boolean }) {
  const cls =
    s === 'Present' && !late ? 'bg-green-950/60 text-green-400'
    : s === 'Present' ? 'bg-amber-950/50 text-amber-300'
    : s === 'Not in yet' ? 'bg-[#1f1f1f] text-gray-400'
    : 'bg-red-950/40 text-red-400'
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${cls}`}>
      {s === 'Present' && late ? 'Late' : s}
    </span>
  )
}

function Split({
  title, icon, rows, total,
}: { title: string; icon: React.ReactNode; rows: { name: string; n: number }[]; total: number }) {
  return (
    <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">{icon} {title}</h2>
      {rows.length === 0 ? (
        <p className="py-5 text-center text-sm text-gray-500">Nothing yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-300">{r.name}</span>
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#242424]">
                <span className="block h-full rounded-full bg-orange-500" style={{ width: `${total ? (r.n / total) * 100 : 0}%` }} />
              </span>
              <span className="w-6 text-right text-xs tabular-nums text-gray-400">{r.n}</span>
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