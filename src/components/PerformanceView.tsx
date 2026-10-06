import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight, Home, Building2 } from 'lucide-react'
import DonutChart from './DonutChart'
import { useChartTheme } from '../lib/chartTheme'
import { supabase } from '../lib/supabase'
import { istDate, addDays, weekStart, addMonths, shortDate, monthLabel, inr, inrCompact } from '../lib/format'

type View = 'daily' | 'weekly' | 'monthly' | 'yearly'
type Row = {
  work_date: string
  calls: number | null
  quality_leads: number | null
  positive_leads: number | null
  hot_leads: number | null
  deals_closed: number | null
  revenue: number | null
  indiamart_inquiry: number | null
  facebook_inquiry: number | null
  incoming_calls: number | null
  old_client_ref: number | null
  followup_calls: number | null
  leads_found: number | null
}
type Bucket = { key: string; label: string; revenue: number; calls: number; positive: number; hot: number; deals: number }
type Norm = { work_mode: string; label: string; calls: number; quality_calls: number; follow_ups: number; leads_found: number }

const VIEWS: { key: View; label: string; current: string; previous: string }[] = [
  { key: 'daily', label: 'Daily', current: 'Today', previous: 'yesterday' },
  { key: 'weekly', label: 'Weekly', current: 'This week', previous: 'last week' },
  { key: 'monthly', label: 'Monthly', current: 'This month', previous: 'last month' },
  { key: 'yearly', label: 'Yearly', current: 'This year', previous: 'last year' },
]

// Buckets shown on the chart for each view, oldest first
function buildKeys(view: View, today: string) {
  if (view === 'daily') {
    const keys = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29))
    return { keys, from: keys[0], keyOf: (d: string) => d, label: shortDate }
  }
  if (view === 'weekly') {
    const cur = weekStart(today)
    const keys = Array.from({ length: 12 }, (_, i) => addDays(cur, (i - 11) * 7))
    return { keys, from: keys[0], keyOf: weekStart, label: shortDate }
  }
  if (view === 'monthly') {
    const cur = today.slice(0, 7)
    const keys = Array.from({ length: 12 }, (_, i) => addMonths(cur, i - 11))
    return { keys, from: keys[0] + '-01', keyOf: (d: string) => d.slice(0, 7), label: monthLabel }
  }
  const y = Number(today.slice(0, 4))
  const keys = Array.from({ length: 5 }, (_, i) => String(y - 4 + i))
  return { keys, from: `${keys[0]}-01-01`, keyOf: (d: string) => d.slice(0, 4), label: (k: string) => k }
}

// Fetch all rows (Supabase returns max 1000 per request)
async function fetchReports(from: string, userId?: string | null, branchId?: string | null) {
  const all: Row[] = []
  const page = 1000
  for (let start = 0; ; start += page) {
    let q = supabase
      .from('daily_reports')
      .select('work_date, calls, quality_leads, positive_leads, hot_leads, deals_closed, revenue, indiamart_inquiry, facebook_inquiry, incoming_calls, old_client_ref, followup_calls, leads_found')
      .gte('work_date', from)
      .order('work_date')
      .range(start, start + page - 1)
    if (userId) q = q.eq('user_id', userId)
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return all
}

export default function PerformanceView({
  userId, branchId, title = 'Performance', subtitle,
}: { userId?: string | null; branchId?: string | null; title?: string; subtitle?: string }) {
  const chart = useChartTheme()
  const [view, setView] = useState<View>('daily')
  const [rows, setRows] = useState<Row[]>([])
  const [norm, setNorm] = useState<Norm | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = istDate()
  const cfg = useMemo(() => buildKeys(view, today), [view, today])
  const viewMeta = VIEWS.find((v) => v.key === view)!

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchReports(cfg.from, userId, branchId)
      .then((data) => !cancelled && setRows(data))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [cfg, userId, branchId])

  // Daily work norms, only when looking at one person
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let id = userId ?? null
      if (!id && !branchId) {
        const { data } = await supabase.auth.getUser()
        id = data.user?.id ?? null
      }
      if (!id) return setNorm(null)
      const { data: p } = await supabase.from('profiles').select('work_mode').eq('id', id).maybeSingle()
      const mode = (p as { work_mode?: string } | null)?.work_mode ?? 'office'
      const { data: n } = await supabase.from('work_norms').select('*').eq('work_mode', mode).maybeSingle()
      if (!cancelled) setNorm((n as Norm) ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [userId, branchId])

  const buckets: Bucket[] = useMemo(() => {
    const map = new Map<string, Bucket>(
      cfg.keys.map((k) => [k, { key: k, label: cfg.label(k), revenue: 0, calls: 0, positive: 0, hot: 0, deals: 0 }]),
    )
    for (const r of rows) {
      const b = map.get(cfg.keyOf(r.work_date))
      if (!b) continue
      b.revenue += Number(r.revenue ?? 0)
      b.calls += Number(r.calls ?? 0)
      b.positive += Number(r.positive_leads ?? 0)
      b.hot += Number(r.hot_leads ?? 0)
      b.deals += Number(r.deals_closed ?? 0)
    }
    return [...map.values()]
  }, [rows, cfg])

  const cur = buckets[buckets.length - 1]
  const prev = buckets[buckets.length - 2]
  const conv = (b?: Bucket) => (b && b.calls > 0 ? (b.deals / b.calls) * 100 : 0)

  const kpis = [
    { label: 'Revenue', value: inr(cur?.revenue ?? 0), now: cur?.revenue ?? 0, before: prev?.revenue ?? 0 },
    { label: 'Deals closed', value: String(cur?.deals ?? 0), now: cur?.deals ?? 0, before: prev?.deals ?? 0 },
    { label: 'Calls', value: (cur?.calls ?? 0).toLocaleString('en-IN'), now: cur?.calls ?? 0, before: prev?.calls ?? 0 },
    { label: 'Positive leads', value: String(cur?.positive ?? 0), now: cur?.positive ?? 0, before: prev?.positive ?? 0 },
    { label: 'Hot leads', value: String(cur?.hot ?? 0), now: cur?.hot ?? 0, before: prev?.hot ?? 0 },
    { label: 'Call to deal', value: `${conv(cur).toFixed(1)}%`, now: conv(cur), before: conv(prev) },
  ]

  const periodTotal = buckets.reduce((s, b) => s + b.revenue, 0)

  // Today's work against the daily norms
  const todayRow = rows.find((r) => r.work_date === today)
  const normBars = norm
    ? [
        { label: 'Calls', done: Number(todayRow?.calls ?? 0), target: norm.calls },
        { label: 'Quality calls', done: Number(todayRow?.quality_leads ?? 0), target: norm.quality_calls },
        { label: 'Follow-ups', done: Number(todayRow?.followup_calls ?? 0), target: norm.follow_ups },
        { label: 'Leads found', done: Number(todayRow?.leads_found ?? 0), target: norm.leads_found },
      ].filter((b) => b.target > 0)
    : []

  // Inquiry sources across the whole view
  const firstKey = cfg.keys[0]
  const inView = rows.filter((r) => cfg.keyOf(r.work_date) >= firstKey)
  const sum = (k: keyof Row) => inView.reduce((s, r) => s + Number(r[k] ?? 0), 0)
  const sources = [
    { name: 'IndiaMART', value: sum('indiamart_inquiry'), color: chart.series[0] },
    { name: 'Facebook', value: sum('facebook_inquiry'), color: chart.series[1] },
    { name: 'Incoming calls', value: sum('incoming_calls'), color: chart.series[2] },
    { name: 'Old client reference', value: sum('old_client_ref'), color: chart.series[3] },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex w-fit rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                view === v.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">Could not load data: {error}</div>
      )}

      <div className={loading ? 'opacity-50' : ''}>
        {/* Today's work against the daily norms */}
        {normBars.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-gray-300">Today's work</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-[#1f1f1f] px-2.5 py-1 text-xs text-gray-400">
                {norm?.work_mode === 'wfh' ? <Home size={13} /> : <Building2 size={13} />}
                {norm?.label}
              </span>
            </div>

            {!todayRow && (
              <p className="mb-4 text-xs text-gray-500">Nothing counted yet — these fill in from today's daily report.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {normBars.map((b) => {
                const pct = b.target > 0 ? Math.min((b.done / b.target) * 100, 100) : 0
                const full = b.done >= b.target
                const bar = full ? 'bg-green-500' : pct >= 60 ? 'bg-orange-500' : 'bg-red-500'
                return (
                  <div key={b.label}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-300">{b.label}</span>
                      <span className="tabular-nums text-gray-400">
                        <span className={full ? 'text-green-400' : 'text-white'}>{b.done}</span> / {b.target}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#222]">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {full ? 'Done for today' : `${b.target - b.done} to go`}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* KPIs for the current period */}
        <p className="mt-6 text-sm text-gray-400">
          {viewMeta.current}, compared with {viewMeta.previous}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => {
            const diff = k.before > 0 ? ((k.now - k.before) / k.before) * 100 : null
            const up = diff !== null && diff >= 0
            return (
              <div key={k.label} className="bg-[#151515] px-5 py-4">
                <p className="text-xs text-gray-400">{k.label}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${k.label === 'Revenue' ? 'text-orange-500' : ''}`}>{k.value}</p>
                <p className="mt-1 h-4 text-xs">
                  {diff !== null && (
                    <span className={`inline-flex items-center gap-0.5 ${up ? 'text-green-400' : 'text-red-400'}`}>
                      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {Math.abs(diff).toFixed(0)}%
                    </span>
                  )}
                </p>
              </div>
            )
          })}
        </div>

        {/* Revenue chart */}
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-gray-300">Revenue</h2>
            <p className="text-xs text-gray-500">
              Total in view <span className="ml-1 text-sm font-medium text-white">{inr(periodTotal)}</span>
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis
                  tick={{ fill: chart.axis, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, 10000)]}
                  tickFormatter={(v) => inrCompact(Number(v))}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor }}
                  contentStyle={chart.tooltip}
                  itemStyle={chart.tooltipItem}
                  labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                  formatter={(v) => [inr(Number(v)), 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={44}>
                  {/* The period you are in stands out; the rest sit back */}
                  {buckets.map((b, i) => (
                    <Cell
                      key={b.key}
                      fill={chart.series[0]}
                      fillOpacity={i === buckets.length - 1 ? 1 : chart.dark ? 0.35 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Activity chart + inquiry sources */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5 lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-gray-300">Calls and leads</h2>
              <div className="flex gap-4 text-xs text-gray-400">
                <Legend color={chart.series[0]} label="Calls" />
                <Legend color={chart.series[1]} label="Positive leads" />
                <Legend color={chart.series[3]} label="Hot leads" />
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
                  <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 10)]} />
                  <Tooltip
                    contentStyle={chart.tooltip}
                    itemStyle={chart.tooltipItem}
                    labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                    cursor={{ stroke: chart.grid }}
                  />
                  <Line type="monotone" dataKey="calls" name="Calls" stroke={chart.series[0]} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="positive" name="Positive leads" stroke={chart.series[1]} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="hot" name="Hot leads" stroke={chart.series[3]} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-medium text-gray-300">Inquiry sources</h2>
            <DonutChart data={sources} centerLabel="Inquiries" empty="No inquiries in this period." />
          </section>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}