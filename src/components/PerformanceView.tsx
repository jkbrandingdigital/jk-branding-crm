import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
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
}
type Bucket = { key: string; label: string; revenue: number; calls: number; positive: number; hot: number; deals: number }

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
      .select('work_date, calls, quality_leads, positive_leads, hot_leads, deals_closed, revenue')
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

const tooltipStyle = { background: '#1a1a1a', border: '1px solid #2e2e2e', borderRadius: 8, color: '#fff', fontSize: 12 }

export default function PerformanceView({
  userId, branchId, title = 'Performance', subtitle,
}: { userId?: string | null; branchId?: string | null; title?: string; subtitle?: string }) {
  const [view, setView] = useState<View>('daily')
  const [rows, setRows] = useState<Row[]>([])
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
                <CartesianGrid stroke="#222" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis
                  tick={{ fill: '#888', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  allowDecimals={false}
                  domain={[0, (max: number) => Math.max(max, 10000)]}
                  tickFormatter={(v) => inrCompact(Number(v))}
                />
                <Tooltip cursor={{ fill: '#1c1c1c' }} contentStyle={tooltipStyle} formatter={(v) => [inr(Number(v)), 'Revenue']} />
                <Bar dataKey="revenue" radius={[5, 5, 0, 0]} maxBarSize={44}>
                  {buckets.map((b, i) => (
                    <Cell key={b.key} fill={i === buckets.length - 1 ? '#f97316' : '#7c3a12'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Activity chart */}
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-gray-300">Calls and leads</h2>
            <div className="flex gap-4 text-xs text-gray-400">
              <Legend color="#f97316" label="Calls" />
              <Legend color="#60a5fa" label="Positive leads" />
              <Legend color="#f43f5e" label="Hot leads" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#222" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={8} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 10)]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="positive" name="Positive leads" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="hot" name="Hot leads" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
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