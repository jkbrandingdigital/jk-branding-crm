import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { useChartTheme } from '../../lib/chartTheme'
import { useAuth } from '../../contexts/AuthContext'
import { loadStaff, type Staff } from '../leads/leadUtils'
import { mins } from './taskUtils'

/*
  A designer's report, built on one comparison: the time the job was meant
  to take against the time it actually took.

      efficiency % = allowed ÷ actual × 100

  100 is on the mark. 120 is faster than the standard, 80 is slower.

  A high number is not on its own a good number. Work rushed out and sent
  back twice shows up here at 150%. Read it next to how often a job came
  back, which is why this screen never ranks people by efficiency alone.

  A designer sees their own. Super Admin and HR see everyone's.
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

const GRAINS: { key: Grain; label: string; back: number }[] = [
  { key: 'day', label: 'Daily', back: 29 },
  { key: 'week', label: 'Weekly', back: 83 },
  { key: 'month', label: 'Monthly', back: 364 },
  { key: 'year', label: 'Yearly', back: 1824 },
]

const istDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const today = () => istDate(new Date())
const back = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return istDate(d)
}

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

export default function DesignPerformance() {
  const { user } = useAuth()
  const { can, isSuper, ready } = usePermissions()
  const chart = useChartTheme()

  const [grain, setGrain] = useState<Grain>('day')
  const [from, setFrom] = useState(back(29))
  const [to, setTo] = useState(today())
  const [who, setWho] = useState('all')

  const [summary, setSummary] = useState<Summary[]>([])
  const [series, setSeries] = useState<Point[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const seeAll = isSuper || can('design_perf_all')

  const args = useMemo(
    () => ({ p_from: from, p_to: to, p_user: who === 'all' ? null : who }),
    [from, to, who],
  )

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([
      supabase.rpc('design_perf_summary', args),
      supabase.rpc('design_perf_series', { p_grain: grain, ...args }),
    ])
    setLoading(false)
    if (s.error || g.error) return setError(s.error?.message ?? g.error?.message ?? '')
    setError('')
    setSummary((s.data ?? []) as Summary[])
    setSeries((g.data ?? []) as Point[])
  }, [args, grain])

  useEffect(() => {
    if (!ready) return
    setLoading(true)
    void load()
  }, [ready, load])

  useEffect(() => {
    if (seeAll) void loadStaff().then((rows) => setStaff(rows.filter((r) => r.role === 'design_team')))
  }, [seeAll])

  function pickGrain(g: Grain) {
    setGrain(g)
    setFrom(back(GRAINS.find((x) => x.key === g)!.back))
    setTo(today())
  }

  // Excel opens a BOM'd CSV straight away, which keeps this to one file and
  // no extra library — the same way leads are exported.
  async function download() {
    setSaving(true)
    const { data, error: e } = await supabase.rpc('design_task_report', args)
    setSaving(false)
    if (e) return setError(e.message)

    const rows = (data ?? []) as ReportRow[]
    const head = [
      'Task', 'Subject', 'Work', 'Qty', 'Unit', 'Designer', 'Stage', 'Done', 'In changes',
      'Client changes', 'Our changes',
      'Allowed (mins)', 'Actual (mins)', 'Over (mins)', 'On time', 'Sittings', 'Interruptions',
      'Started', 'Completed', 'Due',
    ]
    const body = rows.map((r) => [
      r.task_no, r.subject, r.work_type, r.qty, r.unit, r.designer, r.stage, r.is_done ? 'Yes' : 'No',
      r.in_changes ? 'Yes' : 'No', r.client_changes, r.our_changes,
      r.allowed_mins, r.actual_mins, r.over_mins, r.on_time ? 'Yes' : 'No', r.sittings, r.breaks,
      r.started_on ? new Date(r.started_on).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '',
      r.completed_on ? new Date(r.completed_on).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '',
      r.due_at ? new Date(r.due_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) : '',
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

  const mine = summary.find((r) => r.user_id === user?.id)
  const all = summary.reduce(
    (t, r) => ({
      done: t.done + r.done_tasks,
      allowed: t.allowed + r.allowed_mins,
      actual: t.actual + r.actual_mins,
      onTime: t.onTime + r.on_time,
    }),
    { done: 0, allowed: 0, actual: 0, onTime: 0 },
  )
  const head = seeAll && who === 'all' ? all : {
    done: mine?.done_tasks ?? summary[0]?.done_tasks ?? 0,
    allowed: mine?.allowed_mins ?? summary[0]?.allowed_mins ?? 0,
    actual: mine?.actual_mins ?? summary[0]?.actual_mins ?? 0,
    onTime: mine?.on_time ?? summary[0]?.on_time ?? 0,
  }
  const eff = head.actual > 0 ? Math.round((head.allowed / head.actual) * 1000) / 10 : null
  const onTimePct = head.done > 0 ? Math.round((head.onTime / head.done) * 1000) / 10 : null

  const data = series.map((p) => ({
    label: axisLabel(p.period, grain),
    Allowed: Math.round(p.allowed_mins / 6) / 10,
    Actual: Math.round(p.actual_mins / 6) / 10,
    Efficiency: p.efficiency,
    Tasks: p.done_tasks,
  }))

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  if (ready && !isSuper && !can('design_perf')) {
    return <div className="p-6 text-gray-400">You do not have access to design performance.</div>
  }

  // Green and red that hold up on cream as well as on black
  const good = chart.dark ? '#6ee7b7' : '#047857'
  const bad = chart.dark ? '#fca5a5' : '#b91c1c'
  const warn = chart.dark ? '#fcd34d' : '#b45309'
  const plain = chart.dark ? '#9ca3af' : '#6b6055'

  const Tile = ({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'good' | 'bad' }) => (
    <div className="rounded-lg border border-[#242424] bg-[#151515] px-4 py-3.5">
      <p className="text-xs text-gray-500">{k}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${tone ? '' : 'text-white'}`}
        style={tone ? { color: tone === 'good' ? good : bad } : undefined}
      >
        {v}
      </p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Design performance</h1>
          <p className="mt-1 text-sm text-gray-400">
            Time a job was meant to take, against the time it took.
          </p>
        </div>
        <div className="flex gap-2">
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

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Period and person */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[#242424] bg-[#151515] p-4">
        <div className="flex gap-1">
          {GRAINS.map((g) => (
            <button
              key={g.key}
              onClick={() => pickGrain(g.key)}
              className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                grain === g.key
                  ? 'bg-orange-500/15 font-medium text-orange-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs text-gray-400">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-gray-400">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>

        {seeAll && (
          <label className="block min-w-[180px]">
            <span className="mb-1.5 block text-xs text-gray-400">Designer</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
              <option value="all">Everyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* The four numbers */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile k="Tasks finished" v={String(head.done)} sub={`${mins(head.actual)} spent`} />
        <Tile k="Allowed time" v={mins(head.allowed)} sub={`actual ${mins(head.actual)}`} />
        <Tile
          k="Efficiency"
          v={eff === null ? '—' : `${eff}%`}
          sub="allowed ÷ actual"
          tone={eff === null ? undefined : eff >= 100 ? 'good' : 'bad'}
        />
        <Tile
          k="Finished in time"
          v={onTimePct === null ? '—' : `${onTimePct}%`}
          sub={`${head.onTime} of ${head.done}`}
          tone={onTimePct === null ? undefined : onTimePct >= 70 ? 'good' : 'bad'}
        />
      </div>

      {/* Allowed against actual */}
      <section className="rounded-lg border border-[#242424] bg-[#151515] p-4">
        <h2 className="mb-3 font-medium text-white">Hours — allowed against actual</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit="h" />
              <Tooltip
                contentStyle={chart.tooltip}
                itemStyle={chart.tooltipItem}
                labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                cursor={{ fill: chart.cursor }}
                formatter={(v, n) => [`${Number(v) || 0} h`, n]}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: chart.axis }} />
              <Bar dataKey="Allowed" fill={chart.series[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Actual" fill={chart.series[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {data.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">
            {loading ? 'Loading…' : 'No finished design work in these days.'}
          </p>
        )}
      </section>

      {/* Efficiency over time */}
      <section className="rounded-lg border border-[#242424] bg-[#151515] p-4">
        <h2 className="mb-1 font-medium text-white">Efficiency</h2>
        <p className="mb-3 text-xs text-gray-500">
          100% is bang on the standard time. Above is quicker, below is slower.
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} unit="%" />
              <Tooltip
                contentStyle={chart.tooltip}
                itemStyle={chart.tooltipItem}
                labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                formatter={(v) => [`${Number(v) || 0}%`, 'Efficiency']}
              />
              <Line type="monotone" dataKey="Efficiency" stroke={chart.series[0]} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Everyone, when allowed */}
      {seeAll && (
        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
          <div className="border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">Each designer</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Not a ranking. Read efficiency next to "Our redos" — a fast number beside work that had
              to be done again is not a good number.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Designer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Finished</th>
                  <th className="px-4 py-2.5 text-right font-medium">Allowed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                  <th className="px-4 py-2.5 text-right font-medium">Efficiency</th>
                  <th className="px-4 py-2.5 text-right font-medium">In time</th>
                  <th className="px-4 py-2.5 text-right font-medium">Over</th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Rounds the client asked for. Extra time was allowed for these.">
                    Client changes
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Rounds caused by our own mistake. No extra time allowed.">
                    Our redos
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Hours at work</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {summary.map((r) => (
                  <tr key={r.user_id} className="hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-200">{r.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white">{r.done_tasks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{mins(r.allowed_mins)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{mins(r.actual_mins)}</td>
                    <td
                      className="px-4 py-2.5 text-right font-medium tabular-nums"
                      style={{ color: r.efficiency === null ? plain : r.efficiency >= 100 ? good : bad }}
                    >
                      {r.efficiency === null ? '—' : `${r.efficiency}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                      {r.on_time_pct === null ? '—' : `${r.on_time_pct}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{r.over_time}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{r.client_changes}</td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: r.our_changes > 0 ? warn : plain }}
                    >
                      {r.our_changes}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{mins(r.worked_mins)}</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing finished in these days.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-gray-600">
        Only design work with a work type set is counted. A client's change rounds add to the time a
        job is allowed, so they do not count against anyone; our own redos add none. "Hours at work"
        is every sitting in these days, including jobs that are not finished yet.
      </p>
    </div>
  )
}