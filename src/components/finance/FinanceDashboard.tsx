import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock, Inbox, LayoutDashboard,
  Link2, Loader2, Minus, Scale, Tag, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useChartTheme } from '../../lib/chartTheme'
import { fmtDate, inr, monthRange, fyRange, todayIST } from './financeUtils'

/*
  The Accounts home page.

  Four questions, answered before anyone opens another screen:
  how much did we sell, what did it cost, what was left, and what are
  clients still sitting on. Below that: the shape of the period, where
  the money went, the last money that moved, and what is waiting on
  Accounts.

  Every figure comes from fin_dashboard(), which reads the SAME rules as
  Profit and Sales & payments — so this page can never show a profit
  the Profit screen does not.

    Income   = sales without GST, by booking date
    Expenses = purchases (job work + other) + expenses
    Net      = Income − Expenses
    Pending  = still owed on everything sold, any month

  Each is compared with the period of the same length just before.
*/

type Figures = { income: number; expenses: number; net: number; received: number; gst?: number; salary?: number; gross?: number; purchases?: number }
type Point = { at: string; income: number; expenses: number; received: number }
type Dash = {
  ok: boolean; reason?: string
  from: string; to: string; prev_from: string; prev_to: string; by: 'day' | 'month'
  now: Figures; prev: Figures
  pending: { amount: number; projects: number; overdue: number; overdue_amount: number }
  series: Point[]
  breakdown: { name: string; amount: number }[]
  recent: { kind: 'in' | 'out'; on: string; title: string; sub: string; amount: number }[]
  todo: { payments: number; prices: number; unlinked_jobs: number }
}

type Area_ = 'accounts' | 'admin'

// Where each screen lives, for Accounts and for the super admin.
const PATHS: Record<Area_, Record<'sales' | 'payments' | 'approvals' | 'costs' | 'profit', string>> = {
  accounts: { sales: '/accounts/sales', payments: '/accounts/payments', approvals: '/accounts/approvals', costs: '/accounts/costs', profit: '/accounts/profit' },
  admin:    { sales: '/admin/finance/sales', payments: '/admin/finance/payments', approvals: '/admin/finance/approvals', costs: '/admin/finance/costs', profit: '/admin/finance/profit' },
}

function last30() {
  const t = todayIST()
  const d = new Date(t + 'T00:00:00')
  d.setDate(d.getDate() - 29)
  return { from: d.toLocaleDateString('en-CA'), to: t }
}

const RANGES = [
  { key: 'month', label: 'This month', range: () => ({ from: monthRange(0).from, to: todayIST() }) },
  { key: '30',    label: 'Last 30 days', range: last30 },
  { key: 'last',  label: 'Last month', range: () => monthRange(-1) },
  { key: 'fy',    label: 'This FY', range: () => ({ from: fyRange().from, to: todayIST() }) },
] as const

// ₹8.5L / ₹1.2Cr — for axes and the donut centre, where space is short.
// Everywhere a person reads an exact amount, inr() is used instead.
function short(n: number) {
  const v = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)}Cr`
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L`
  if (v >= 1e3) return `${sign}₹${(v / 1e3).toFixed(0)}k`
  return `${sign}₹${Math.round(v)}`
}

// Change against the previous period. Null when there is nothing to
// compare with — "+∞%" against a zero month says nothing true.
function change(now: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((now - prev) / Math.abs(prev)) * 1000) / 10
}

export default function FinanceDashboard({ area = 'accounts' }: { area?: Area_ }) {
  const chart = useChartTheme()
  const P = PATHS[area]
  const [range, setRange] = useState<string>('month')
  const [d, setD] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = RANGES.find((x) => x.key === range)!.range()
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('fin_dashboard', { p_from: r.from, p_to: r.to })
    setLoading(false)
    if (error) return setErr(error.message)
    const res = data as Dash
    if (!res?.ok) return setErr(res?.reason ?? 'Could not load the dashboard.')
    setD(res)
  }, [range])

  useEffect(() => { void load() }, [load])

  const series = useMemo(() => (d?.series ?? []).map((p) => ({
    ...p,
    income: Number(p.income), expenses: Number(p.expenses), received: Number(p.received),
    label: d?.by === 'month'
      ? new Date(p.at + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })
      : new Date(p.at + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  })), [d])

  // Top five, the rest as "Other" — a sixth slice is too thin to read.
  const slices = useMemo(() => {
    const list = (d?.breakdown ?? []).map((b) => ({ name: b.name, value: Number(b.amount) }))
    if (list.length <= 6) return list
    const rest = list.slice(5).reduce((n, x) => n + x.value, 0)
    return [...list.slice(0, 5), { name: 'Other', value: rest }]
  }, [d])
  const sliceTotal = slices.reduce((n, s) => n + s.value, 0)

  if (loading && !d) {
    return <div className="grid place-items-center py-24"><Loader2 size={22} className="animate-spin text-gray-500" /></div>
  }
  if (err && !d) {
    return <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"><AlertCircle size={16} /> {err}</p>
  }
  if (!d) return null

  const n = { income: Number(d.now.income), expenses: Number(d.now.expenses), net: Number(d.now.net), received: Number(d.now.received) }
  const p = { income: Number(d.prev.income), expenses: Number(d.prev.expenses), net: Number(d.prev.net), received: Number(d.prev.received) }
  const margin = n.income > 0 ? Math.round((n.net / n.income) * 1000) / 10 : null
  const prevMargin = p.income > 0 ? Math.round((p.net / p.income) * 1000) / 10 : null
  const days = Math.round((new Date(d.to).getTime() - new Date(d.from).getTime()) / 86400000) + 1
  const vsText = `vs previous ${days} days`
  const netSpark = series.map((s) => ({ v: s.income - s.expenses }))

  return (
    <div className="space-y-5">
      {/* ---------------- heading ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500/15 text-orange-400">
            <LayoutDashboard size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-white">Finance dashboard</h1>
            <p className="text-sm text-gray-400">
              {fmtDate(d.from)} – {fmtDate(d.to)} · all amounts without GST
            </p>
          </div>
        </div>
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"><AlertCircle size={16} /> {err}</p>}

      {/* ---------------- the four figures ---------------- */}
      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
        <Kpi to={P.sales} icon={<TrendingUp size={18} />} iconTone="bg-green-500/15 text-green-400"
             label="Income" value={inr(n.income)} delta={change(n.income, p.income)} vs={vsText}
             spark={series.map((s) => ({ v: s.income }))} color={chart.series[0]} />
        <Kpi to={P.costs} icon={<TrendingDown size={18} />} iconTone="bg-red-500/15 text-red-400"
             label="Expenses" value={inr(n.expenses)} delta={change(n.expenses, p.expenses)} upIsBad vs={vsText}
             spark={series.map((s) => ({ v: s.expenses }))} color={chart.series[1]} />
        <Kpi to={P.profit} icon={<Scale size={18} />} iconTone="bg-violet-500/15 text-violet-300"
             label="Net profit" value={inr(n.net)} delta={change(n.net, p.net)} vs={vsText} negative={n.net < 0}
             spark={netSpark} color={chart.series[2]} />
        <Kpi to={P.sales} icon={<Wallet size={18} />} iconTone="bg-sky-500/15 text-sky-300"
             label="Pending from clients" value={inr(d.pending.amount)}
             note={Number(d.pending.overdue) > 0
               ? <span className="text-amber-300">{d.pending.overdue} overdue · {inr(d.pending.overdue_amount)}</span>
               : <span className="text-gray-500">{d.pending.projects} projects · nothing overdue</span>} />
      </div>

      {/* ---------------- shape of the period + where it went ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Income vs expenses" className="lg:col-span-2"
               right={
                 <span className="flex items-center gap-4 text-xs text-gray-400">
                   <Key color={chart.series[0]} label="Income" />
                   <Key color={chart.series[1]} label="Expenses" />
                 </span>
               }>
          <div className="h-64 px-2 pb-3">
            {series.some((s) => s.income > 0 || s.expenses > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="finInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.series[0]} stopOpacity={chart.dark ? 0.3 : 0.2} />
                      <stop offset="100%" stopColor={chart.series[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="finExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chart.series[1]} stopOpacity={chart.dark ? 0.22 : 0.15} />
                      <stop offset="100%" stopColor={chart.series[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
                  <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={58}
                         tickFormatter={(v: unknown) => short(Number(v))} />
                  <Tooltip
                    contentStyle={chart.tooltip}
                    itemStyle={chart.tooltipItem}
                    labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                    cursor={{ stroke: chart.grid }}
                    formatter={(v: unknown, name: unknown) => [inr(Number(v)), name === 'income' ? 'Income' : 'Expenses']}
                  />
                  <Area type="monotone" dataKey="income" stroke={chart.series[0]} strokeWidth={2} fill="url(#finInc)" activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="expenses" stroke={chart.series[1]} strokeWidth={2} fill="url(#finExp)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="grid h-full place-items-center text-sm text-gray-500">Nothing sold or spent in this period.</p>
            )}
          </div>
        </Panel>

        <Panel title="Where the money went">
          {slices.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-gray-500">No purchases or expenses in this period.</p>
          ) : (
            <div className="px-4 pb-4">
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%"
                         paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                      {slices.map((s, i) => <Cell key={s.name} fill={chart.series[i % chart.series.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem}
                             formatter={(v: unknown, name: unknown) => [`${inr(Number(v))} · ${Math.round((Number(v) / sliceTotal) * 100)}%`, String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-white">{short(sliceTotal)}</p>
                    <p className="text-[11px] text-gray-500">Total</p>
                  </div>
                </div>
              </div>
              <ul className="mt-2 space-y-1.5">
                {slices.map((s, i) => (
                  <li key={s.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: chart.series[i % chart.series.length] }} />
                    <span className="min-w-0 flex-1 truncate text-gray-300">{s.name}</span>
                    <span className="tabular-nums text-gray-500">{inr(s.value)}</span>
                    <span className="w-10 text-right tabular-nums font-medium text-white">{Math.round((s.value / sliceTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* ---------------- what moved + the period in brief ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent transactions"
               right={<Link to={P.payments} className="flex items-center gap-1 text-xs text-orange-400 hover:underline">View all <ArrowRight size={12} /></Link>}>
          {d.recent.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-500">No money moved in this period.</p>
          ) : (
            <ul className="divide-y divide-[#202020]">
              {d.recent.map((t, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    t.kind === 'in' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                    {t.kind === 'in' ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{t.title}</span>
                    <span className="block truncate text-xs text-gray-500">{fmtDate(t.on)}{t.sub ? ` · ${t.sub}` : ''}</span>
                  </span>
                  {/* The sign carries the meaning; the colour only repeats it. */}
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${t.kind === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.kind === 'in' ? '+' : '−'}{inr(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="The period in brief">
          <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
            <Mini label="Income growth" value={pct(change(n.income, p.income))} icon={<TrendingUp size={16} />} tone="bg-orange-500/10 text-orange-300" />
            <Mini label="Profit margin" value={margin === null ? '—' : `${margin}%`} icon={<Scale size={16} />} tone="bg-green-500/10 text-green-400" />
            <Mini label="Payments to confirm" value={String(d.todo.payments)} icon={<Inbox size={16} />} tone="bg-sky-500/10 text-sky-300" to={P.payments} />
            <Mini label="Overdue clients" value={String(d.pending.overdue)} icon={<Clock size={16} />} tone="bg-red-500/10 text-red-300" to={P.sales} />
          </div>

          <Verdict now={n.net} prev={p.net} margin={margin} prevMargin={prevMargin} days={days} />

          {(Number(d.todo.prices) > 0 || Number(d.todo.unlinked_jobs) > 0 || n.received > 0) && (
            <ul className="space-y-1.5 px-4 pb-4 text-xs">
              <li className="flex items-center gap-2 text-gray-400">
                <Wallet size={13} className="text-gray-500" />
                Cash actually received: <span className="font-medium tabular-nums text-white">{inr(n.received)}</span>
                {p.received > 0 && <span className="text-gray-600">({pct(change(n.received, p.received))} {vsText})</span>}
              </li>
              {Number(d.todo.prices) > 0 && (
                <li>
                  <Link to={P.approvals} className="flex items-center gap-2 text-amber-300 hover:underline">
                    <Tag size={13} /> {d.todo.prices} price change{d.todo.prices === 1 ? '' : 's'} waiting for approval
                  </Link>
                </li>
              )}
              {Number(d.todo.unlinked_jobs) > 0 && (
                <li>
                  <Link to={P.costs} className="flex items-center gap-2 text-amber-300 hover:underline">
                    <Link2 size={13} /> {d.todo.unlinked_jobs} job work{d.todo.unlinked_jobs === 1 ? '' : 's'} not tied to a project
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ---------------- pieces ---------------- */

const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`)

function Panel({ title, right, className = '', children }: { title: string; right?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-[#242424] bg-[#151515] ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  )
}

/*
  A headline figure. The arrow and the word carry the direction; the
  colour repeats it (green good, red bad) — and for expenses, up is bad.
*/
function Kpi({ to, icon, iconTone, label, value, delta, vs, upIsBad, negative, spark, color, note }: {
  to: string; icon: ReactNode; iconTone: string; label: string; value: string
  delta?: number | null; vs?: string; upIsBad?: boolean; negative?: boolean
  spark?: { v: number }[]; color?: string; note?: ReactNode
}) {
  const good = delta == null ? null : upIsBad ? delta <= 0 : delta >= 0
  return (
    <Link to={to} className="group relative min-w-0 overflow-hidden rounded-xl border border-[#242424] bg-[#151515] p-4 transition-colors hover:border-orange-600/40">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${iconTone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-400">{label}</p>
          <p className={`truncate text-2xl font-semibold tabular-nums ${negative ? 'text-red-400' : 'text-white'}`}>{value}</p>
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 text-xs">
          {note ?? (delta == null ? (
            <span className="text-gray-600">nothing to compare with</span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
              good ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {delta > 0 ? <ArrowUpRight size={12} /> : delta < 0 ? <ArrowDownRight size={12} /> : <Minus size={12} />}
              {Math.abs(delta)}%
            </span>
          ))}
          {delta != null && !note && <span className="ml-1.5 text-gray-600">{vs}</span>}
        </div>
        {spark && spark.length > 1 && color && (
          <div className="h-9 w-24 shrink-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Link>
  )
}

function Mini({ label, value, icon, tone, to }: { label: string; value: string; icon: ReactNode; tone: string; to?: string }) {
  const body = (
    <>
      <span className={`mx-auto grid h-9 w-9 place-items-center rounded-lg ${tone}`}>{icon}</span>
      <p className="mt-2 text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </>
  )
  const cls = 'rounded-xl border border-[#242424] bg-[#171717] p-3 text-center'
  return to
    ? <Link to={to} className={`${cls} transition-colors hover:border-orange-600/40`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

/*
  One sentence about the period — and an honest one. It praises only
  when profit really went up, warns when it went down, and says nothing
  when there is no earlier period to measure against.
*/
function Verdict({ now, prev, margin, prevMargin, days }: {
  now: number; prev: number; margin: number | null; prevMargin: number | null; days: number
}) {
  if (!prev && !now) return null
  const ch = change(now, prev)
  let tone = 'border-[#2a2a2a] bg-[#171717] text-gray-300'
  let icon = <Scale size={18} />
  let head = 'This period so far'
  let text = `Net ${inr(now)}${margin !== null ? ` · ${margin}% margin` : ''}.`

  if (now < 0) {
    tone = 'border-red-600/30 bg-red-500/10 text-red-300'; icon = <AlertTriangle size={18} />
    head = 'Running at a loss'
    text = `Expenses are ${inr(-now)} more than income. Check where the money went.`
  } else if (ch !== null && ch >= 5) {
    tone = 'border-green-600/30 bg-green-500/10 text-green-300'; icon = <TrendingUp size={18} />
    head = 'Good going'
    text = `Profit is ${ch}% higher than the previous ${days} days${prevMargin !== null && margin !== null ? ` (margin ${prevMargin}% → ${margin}%)` : ''}.`
  } else if (ch !== null && ch <= -5) {
    tone = 'border-amber-600/30 bg-amber-500/10 text-amber-300'; icon = <TrendingDown size={18} />
    head = 'Profit is down'
    text = `${Math.abs(ch)}% lower than the previous ${days} days${prevMargin !== null && margin !== null ? ` (margin ${prevMargin}% → ${margin}%)` : ''}.`
  }

  return (
    <div className={`mx-4 mb-3 flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{head}</p>
        <p className="text-xs opacity-90">{text}</p>
      </div>
    </div>
  )
}
