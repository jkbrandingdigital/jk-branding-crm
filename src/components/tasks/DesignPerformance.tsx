import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, CalendarDays, CheckCircle2, Clock, Download, Loader2, RefreshCw, RotateCcw, Timer, TrendingUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { useChartTheme } from '../../lib/chartTheme'
import { useAuth } from '../../contexts/AuthContext'
import DonutChart from '../DonutChart'
import { loadStaff, type Staff } from '../leads/leadUtils'
import { mins } from './taskUtils'

/*
  A designer's report, built on one comparison: the time a job was meant to
  take against the time it actually took.

      efficiency % = allowed ÷ actual × 100

  100 is on the mark, 120 is faster than the standard, 80 is slower.

  A high number is not on its own a good one. Work rushed out and sent back
  twice shows up here at 150%, which is why "Our redos" sits beside it
  everywhere and why nobody is ranked by efficiency alone.

  No new queries: everything on this page is worked out from the three
  calls that already existed — the summary, the series and the task report.
*/

type Grain = 'day' | 'week' | 'month' | 'year'

type Summary = {
  user_id: string
  full_name: string | null
  done_tasks: number
  allowed_mins: number
  actual_mins: number
  worked_mins: number
  on_time: number
  over_time: number
  client_changes: number
  our_changes: number
  efficiency: number | null
  on_time_pct: number | null
}

type Point = {
  period: string
  done_tasks: number
  allowed_mins: number
  actual_mins: number
  efficiency: number | null
}

type ReportRow = {
  task_no: number
  subject: string
  work_type: string | null
  qty: number
  unit: string | null
  designer: string | null
  stage: string | null
  is_done: boolean
  in_changes: boolean
  client_changes: number
  our_changes: number
  allowed_mins: number
  actual_mins: number
  over_mins: number
  on_time: boolean
  sittings: number
  breaks: number
  started_on: string | null
  completed_on: string | null
  due_at: string | null
}

type Person = {
  full_name: string | null
  designation: string | null
  emp_code: string | null
  date_of_joining: string | null
}

const GRAINS: { key: Grain; label: string; back: number }[] = [
  { key: 'day', label: 'Daily', back: 29 },
  { key: 'week', label: 'Weekly', back: 83 },
  { key: 'month', label: 'Monthly', back: 364 },
  { key: 'year', label: 'Yearly', back: 1824 },
]

const ist = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const today = () => ist(new Date())
const back = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return ist(d)
}
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const axisLabel = (iso: string, grain: Grain) => {
  const d = new Date(`${iso}T00:00:00`)
  if (grain === 'year') return String(d.getFullYear())
  if (grain === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Efficiency only says something once there is real time on the clock. A job
// allowed 7 hours with 2 minutes recorded gives 21000%, which is arithmetic,
// not a fact about the work — the timer simply was not used. Below this many
// minutes we say so instead of printing a number nobody can believe.
const ENOUGH_MINS = 5
const MAX_SHOWN = 500

const effOf = (allowed: number, actual: number) =>
  actual < ENOUGH_MINS ? null : Math.round((allowed / actual) * 1000) / 10

const effText = (v: number | null) =>
  v === null ? '—' : v > MAX_SHOWN ? `${MAX_SHOWN}%+` : `${v}%`

const initials = (name: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

type Filter = 'all' | 'done' | 'open' | 'changes'

export default function DesignPerformance() {
  const { user } = useAuth()
  const { can, isSuper, ready } = usePermissions()
  const chart = useChartTheme()

  const [grain, setGrain] = useState<Grain>('day')
  const [from, setFrom] = useState(back(29))
  const [to, setTo] = useState(today())
  const [who, setWho] = useState('')          // '' = everyone

  const [summary, setSummary] = useState<Summary[]>([])
  const [series, setSeries] = useState<Point[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [person, setPerson] = useState<Person | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const seeAll = isSuper || can('design_perf_all')

  // Someone who can only see their own report is always looking at themselves
  useEffect(() => {
    if (ready && !seeAll && user?.id) setWho(user.id)
  }, [ready, seeAll, user?.id])

  const args = useMemo(() => ({ p_from: from, p_to: to, p_user: who || null }), [from, to, who])

  const load = useCallback(async () => {
    const [s, g, r] = await Promise.all([
      supabase.rpc('design_perf_summary', args),
      supabase.rpc('design_perf_series', { p_grain: grain, ...args }),
      supabase.rpc('design_task_report', args),
    ])
    setLoading(false)
    const e = s.error ?? g.error ?? r.error
    if (e) return setError(e.message)
    setError('')
    setSummary((s.data ?? []) as Summary[])
    setSeries((g.data ?? []) as Point[])
    setRows((r.data ?? []) as ReportRow[])
  }, [args, grain])

  useEffect(() => {
    if (!ready) return
    setLoading(true)
    void load()
  }, [ready, load])

  useEffect(() => {
    if (seeAll) void loadStaff().then((all) => setStaff(all.filter((r) => r.role === 'design_team')))
  }, [seeAll])

  // Who the page is about, for the header card
  useEffect(() => {
    if (!who) return setPerson(null)
    void supabase
      .from('profiles')
      .select('full_name, designation, emp_code, date_of_joining')
      .eq('id', who)
      .maybeSingle()
      .then(({ data }) => setPerson((data ?? null) as Person | null))
  }, [who])

  function pickGrain(g: Grain) {
    setGrain(g)
    setFrom(back(GRAINS.find((x) => x.key === g)!.back))
    setTo(today())
  }

  // Excel opens a BOM'd CSV straight away — one file, no extra library,
  // the same way leads are exported.
  async function download() {
    setSaving(true)
    const { data, error: e } = await supabase.rpc('design_task_report', args)
    setSaving(false)
    if (e) return setError(e.message)

    const head = [
      'Task', 'Subject', 'Work', 'Qty', 'Unit', 'Designer', 'Stage', 'Done', 'In changes',
      'Client changes', 'Our redos', 'Allowed (mins)', 'Actual (mins)', 'Over (mins)', 'On time',
      'Sittings', 'Interruptions', 'Started', 'Completed', 'Due',
    ]
    const body = ((data ?? []) as ReportRow[]).map((r) => [
      r.task_no, r.subject, r.work_type, r.qty, r.unit, r.designer, r.stage,
      r.is_done ? 'Yes' : 'No', r.in_changes ? 'Yes' : 'No', r.client_changes, r.our_changes,
      r.allowed_mins, r.actual_mins, r.over_mins, r.on_time ? 'Yes' : 'No', r.sittings, r.breaks,
      day(r.started_on), day(r.completed_on), day(r.due_at),
    ])
    const csv = [head, ...body].map((r) => r.map(cell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `design-report-${from}-to-${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  // ---- Numbers, all worked out from the rows already in hand ----
  const total = summary.reduce(
    (t, r) => ({
      done: t.done + r.done_tasks,
      allowed: t.allowed + r.allowed_mins,
      actual: t.actual + r.actual_mins,
      worked: t.worked + r.worked_mins,
      onTime: t.onTime + r.on_time,
      client: t.client + r.client_changes,
      ours: t.ours + r.our_changes,
    }),
    { done: 0, allowed: 0, actual: 0, worked: 0, onTime: 0, client: 0, ours: 0 },
  )

  const open = rows.filter((r) => !r.is_done)
  const started = open.filter((r) => r.actual_mins > 0)
  const notStarted = open.filter((r) => r.actual_mins === 0)
  const assigned = rows.length
  const eff = effOf(total.allowed, total.actual)
  const onTimePct = total.done > 0 ? Math.round((total.onTime / total.done) * 1000) / 10 : null
  const avgDone = total.done > 0 ? total.actual / total.done : 0

  const byType = useMemo(() => {
    const m = new Map<string, { n: number; onTime: number; actual: number; allowed: number }>()
    for (const r of rows) {
      if (!r.is_done || !r.work_type) continue
      const t = m.get(r.work_type) ?? { n: 0, onTime: 0, actual: 0, allowed: 0 }
      t.n += 1
      if (r.on_time) t.onTime += 1
      t.actual += r.actual_mins
      t.allowed += r.allowed_mins
      m.set(r.work_type, t)
    }
    return [...m.entries()]
      .map(([name, t]) => ({ name, n: t.n, pct: Math.round((t.onTime / t.n) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.n - a.n)
      .slice(0, 8)
  }, [rows])

  const shown = useMemo(() => {
    if (filter === 'done') return rows.filter((r) => r.is_done)
    if (filter === 'open') return rows.filter((r) => !r.is_done)
    if (filter === 'changes') return rows.filter((r) => r.client_changes + r.our_changes > 0)
    return rows
  }, [rows, filter])

  const data = series.map((p) => ({
    label: axisLabel(p.period, grain),
    Allowed: Math.round(p.allowed_mins / 6) / 10,
    Actual: Math.round(p.actual_mins / 6) / 10,
    Tasks: p.done_tasks,
  }))

  // Green and red that hold up on cream as well as on black
  const good = chart.dark ? '#6ee7b7' : '#047857'
  const bad = chart.dark ? '#fca5a5' : '#b91c1c'
  const warn = chart.dark ? '#fcd34d' : '#b45309'
  const plain = chart.dark ? '#9ca3af' : '#6b6055'

  // A bar on cream needs a softer fill and a softer rail than one on black,
  // or it reads as a solid slab rather than a measure.
  const rail = chart.dark ? 'rgba(255,255,255,0.08)' : 'rgba(23,18,14,0.07)'
  const barOk = chart.dark ? chart.series[1] : '#0E6A62'
  const barMid = chart.dark ? chart.series[2] : '#C2771A'
  const scroll = '[scrollbar-width:thin] [scrollbar-color:rgba(128,128,128,0.35)_transparent]'

  // Row separators are drawn here rather than with divide-*, because a hex in
  // a utility class is not re-mapped for the cream theme and comes out almost
  // black. Tables also need border-collapse: without it the browser keeps the
  // rows 2px apart and each line shows up twice.
  const line = chart.dark ? '#1f1f1f' : 'rgba(23,18,14,0.09)'
  const rule = { borderTop: `1px solid ${line}` }

  const card = 'rounded-lg border border-[#242424] bg-[#151515]'
  const input =
    'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  if (ready && !isSuper && !can('design_perf')) {
    return <div className="p-6 text-gray-400">You do not have access to design performance.</div>
  }

  const Tile = ({
    icon: Icon, k, v, sub, tone,
  }: { icon: typeof Clock; k: string; v: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }) => (
    <div className={`${card} px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(255,94,0,0.12)', color: '#FF5E00' }}
        >
          <Icon className="h-4.5 w-4.5" size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-gray-500">{k}</span>
          <span
            className={`mt-0.5 block text-2xl font-semibold ${tone ? '' : 'text-white'}`}
            style={tone ? { color: tone === 'good' ? good : tone === 'bad' ? bad : warn } : undefined}
          >
            {v}
          </span>
          {sub && <span className="mt-0.5 block text-xs text-gray-500">{sub}</span>}
        </span>
      </div>
    </div>
  )

  const Stat = ({ icon: Icon, k, v, first }: { icon: typeof Clock; k: string; v: string; first?: boolean }) => (
    <div style={first ? undefined : rule} className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-gray-500">{k}</span>
        <span className="block text-sm font-medium text-white">{v}</span>
      </span>
    </div>
  )

  return (
    <div className="max-w-7xl space-y-5">
      {/* ---- Who, and over what days ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Design performance</h1>
          <p className="mt-1 text-sm text-gray-400">
            The time a job was meant to take, against the time it took.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setLoading(true); void load() }}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            onClick={download}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Excel
          </button>
        </div>
      </div>

      <div className={`${card} flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{ background: 'rgba(255,94,0,0.15)', color: '#FF5E00' }}
          >
            {who ? initials(person?.full_name ?? null) : '👥'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-white">
              {who ? person?.full_name ?? '—' : 'Everyone in design'}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {who
                ? [person?.designation, person?.emp_code].filter(Boolean).join(' · ') || 'Design team'
                : `${summary.length} designer${summary.length === 1 ? '' : 's'}`}
            </span>
          </span>
        </div>

        {who && person?.date_of_joining && (
          <div className="border-l border-[#242424] pl-6">
            <p className="text-xs text-gray-500">Joined</p>
            <p className="mt-0.5 text-sm text-white">{day(person.date_of_joining)}</p>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-end gap-3">
          {seeAll && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-gray-400">Designer</span>
              <select value={who} onChange={(e) => setWho(e.target.value)} className={`${input} min-w-[170px]`}>
                <option value="">Everyone</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* ---- The five numbers ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon={CalendarDays} k="Tasks in hand" v={String(assigned)} sub={`${open.length} still open`} />
        <Tile icon={CheckCircle2} k="Finished" v={String(total.done)}
              sub={assigned > 0 ? `${Math.round((total.done / assigned) * 100)}% of them` : undefined} />
        <Tile icon={Clock} k="Still running" v={String(started.length)}
              sub={`${notStarted.length} not started`} />
        <Tile icon={TrendingUp} k="Finished in time" v={onTimePct === null ? '—' : `${onTimePct}%`}
              sub={`${total.onTime} of ${total.done}`}
              tone={onTimePct === null ? undefined : onTimePct >= 70 ? 'good' : 'bad'} />
        <Tile icon={RotateCcw} k="Changes" v={String(total.client + total.ours)}
              sub={`${total.client} client · ${total.ours} ours`}
              tone={total.ours > 0 ? 'warn' : undefined} />
      </div>

      {/* ---- Trend, split, quick stats ---- */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section className={`${card} p-4 lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium text-white">Hours — allowed against actual</h2>
            <div className="flex gap-1">
              {GRAINS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => pickGrain(g.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                    grain === g.key
                      ? 'bg-orange-500/15 font-medium text-orange-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAllowed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.series[1]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chart.series[1]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.series[0]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chart.series[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit="h" />
                <Tooltip
                  contentStyle={chart.tooltip}
                  itemStyle={chart.tooltipItem}
                  labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                  formatter={(v, n) => [`${Number(v) || 0} h`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Allowed" stroke={chart.series[1]} strokeWidth={2} fill="url(#gAllowed)" />
                <Area type="monotone" dataKey="Actual" stroke={chart.series[0]} strokeWidth={2.5} fill="url(#gActual)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {data.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-500">
              {loading ? 'Loading…' : 'No finished design work in these days.'}
            </p>
          )}
        </section>

        <div className="space-y-4">
          <section className={`${card} p-4`}>
            <h2 className="mb-2 font-medium text-white">Where the work stands</h2>
            <div className="h-48">
              <DonutChart
                data={[
                  { name: 'Finished', value: total.done, color: chart.series[1] },
                  { name: 'Running', value: started.length, color: chart.series[0] },
                  { name: 'Not started', value: notStarted.length, color: chart.series[3] },
                ]}
                centerLabel="Tasks"
                empty="Nothing in these days."
              />
            </div>
          </section>

          <section className={card}>
            <Stat first icon={Timer} k="Average time on a finished job" v={avgDone > 0 ? mins(avgDone) : '—'} />
            <Stat icon={Clock} k="Hours at work in these days" v={mins(total.worked)} />
            <Stat
              icon={TrendingUp}
              k="Efficiency · allowed ÷ actual"
              v={effText(eff)}
            />
          </section>
        </div>
      </div>

      {/* ---- Every task, and what is running now ---- */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">Every task</h2>
            <div className="flex gap-1">
              {([
                ['all', `All ${rows.length}`],
                ['done', `Finished ${total.done}`],
                ['open', `Open ${open.length}`],
                ['changes', `Changed ${rows.filter((r) => r.client_changes + r.our_changes > 0).length}`],
              ] as [Filter, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                    filter === k ? 'bg-orange-500/15 font-medium text-orange-400' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`max-h-[420px] overflow-auto ${scroll}`}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#151515]">
                <tr style={{ borderBottom: `1px solid ${line}` }} className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Work</th>
                  {!who && <th className="px-4 py-2.5 font-medium">Designer</th>}
                  <th className="px-4 py-2.5 text-right font-medium">Allowed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.task_no} style={rule} className="hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-500">{r.task_no}</td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="block truncate text-gray-200" title={r.subject}>{r.subject}</span>
                      {(r.client_changes > 0 || r.our_changes > 0) && (
                        <span className="text-[11px]" style={{ color: r.our_changes > 0 ? warn : plain }}>
                          {r.client_changes > 0 && <>{r.client_changes} client</>}
                          {r.client_changes > 0 && r.our_changes > 0 && ' · '}
                          {r.our_changes > 0 && <>{r.our_changes} ours</>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {r.work_type ?? '—'}
                      {r.qty > 1 && <span className="text-gray-600"> · {r.qty} {r.unit}s</span>}
                    </td>
                    {!who && <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-400">{r.designer ?? '—'}</td>}
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{mins(r.allowed_mins)}</td>
                    <td
                      className="px-4 py-2.5 text-right font-medium tabular-nums"
                      style={{ color: r.actual_mins > r.allowed_mins ? bad : good }}
                    >
                      {mins(r.actual_mins)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.is_done ? '' : 'text-gray-400'}`}
                            style={r.is_done ? { background: 'rgba(5,150,105,0.14)', color: good } : undefined}>
                        {r.stage ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={who ? 6 : 7} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing here.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">Open right now</h2>
            <p className="mt-0.5 text-xs text-gray-500">How far through its allowed time each one is.</p>
          </div>
          <ul className={`max-h-[420px] overflow-auto ${scroll}`}>
            {open.slice(0, 12).map((r, i) => {
              const pct = r.allowed_mins > 0 ? Math.min(999, Math.round((r.actual_mins / r.allowed_mins) * 100)) : 0
              const over = pct > 100
              return (
                <li key={r.task_no} style={i === 0 ? undefined : rule} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-200" title={r.subject}>{r.subject}</span>
                      <span className="block text-xs text-gray-500">{r.work_type ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: over ? bad : plain }}>{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: rail }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(pct, 100)}%`, background: over ? bad : chart.series[0] }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {mins(r.actual_mins)} of {mins(r.allowed_mins)}
                    {r.in_changes && <span style={{ color: warn }}> · in changes</span>}
                  </p>
                </li>
              )
            })}
            {open.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Nothing open.'}
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* ---- By kind of work, and the team ---- */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">Which work goes best</h2>
          <p className="mb-4 mt-0.5 text-xs text-gray-500">
            Share of finished jobs that stayed inside their allowed time.
          </p>
          <ul className="space-y-3.5">
            {byType.map((t) => (
              <li key={t.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-gray-300">{t.name}</span>
                  <span className="shrink-0 tabular-nums text-gray-400">
                    {t.pct}% <span className="text-gray-600">· {t.n}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: rail }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.pct}%`, background: t.pct >= 70 ? barOk : barMid }}
                  />
                </div>
              </li>
            ))}
            {byType.length === 0 && (
              <li className="py-8 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Nothing finished in these days.'}
              </li>
            )}
          </ul>
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">{who ? 'The rest of the team' : 'Each designer'}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Not a ranking. Read efficiency next to "Our redos" — a fast number beside work that had
              to be done again is not a good number.
            </p>
          </div>
          <div className={`max-h-[360px] overflow-auto ${scroll}`}>
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#151515]">
                <tr style={{ borderBottom: `1px solid ${line}` }} className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Designer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Finished</th>
                  <th className="px-4 py-2.5 text-right font-medium">In time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Efficiency</th>
                  <th className="px-4 py-2.5 text-right font-medium">Our redos</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr
                    key={r.user_id}
                    onClick={() => seeAll && setWho(r.user_id)}
                    style={rule}
                    className={`hover:bg-[#1a1a1a] ${seeAll ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-gray-200">{r.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.done_tasks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                      {r.on_time_pct === null ? '—' : `${r.on_time_pct}%`}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right font-medium tabular-nums"
                      title={effOf(r.allowed_mins, r.actual_mins) === null
                        ? 'Too little time on the clock to tell'
                        : `${mins(r.allowed_mins)} allowed · ${mins(r.actual_mins)} taken`}
                      style={{
                        color: effOf(r.allowed_mins, r.actual_mins) === null
                          ? plain
                          : (effOf(r.allowed_mins, r.actual_mins) as number) >= 100 ? good : bad,
                      }}
                    >
                      {effText(effOf(r.allowed_mins, r.actual_mins))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums"
                        style={{ color: r.our_changes > 0 ? warn : plain }}>
                      {r.our_changes}
                    </td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing finished in these days.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="text-xs text-gray-600">
        Only design work with a work type set is counted. A client's change rounds add to the time a
        job is allowed, so they do not count against anyone; our own redos add none. "Open right now"
        lists every unfinished job, whenever it was started.
      </p>
    </div>
  )
}