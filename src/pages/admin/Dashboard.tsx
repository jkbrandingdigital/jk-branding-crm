import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import AdminLayout from '../../components/AdminLayout'
import DonutChart, { PIE_COLORS } from '../../components/DonutChart'

// ---------- Types ----------
type Branch = { id: string; name: string; city: string | null }
type Profile = { id: string; full_name: string | null; branch_id: string | null; is_active: boolean | null }
type Report = {
  user_id: string
  branch_id: string | null
  work_date: string
  calls: number | null
  quality_leads: number | null
  positive_leads: number | null
  hot_leads: number | null
  deals_closed: number | null
  revenue: number | null
  facebook_inquiry: number | null
  indiamart_inquiry: number | null
  bulk_whatsapp: number | null
  old_client_ref: number | null
  incoming_calls: number | null
}
type Deal = {
  id: string
  user_id: string
  branch_id: string | null
  work_date: string
  client_name: string | null
  amount: number | null
}
type Period = 'today' | '7d' | 'month' | 'lastMonth'

// ---------- Helpers ----------
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function addDays(ymd: string, n: number) {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function getRange(period: Period): { from: string; to: string } {
  const today = istToday()
  const [y, m] = today.split('-').map(Number)
  if (period === 'today') return { from: today, to: today }
  if (period === '7d') return { from: addDays(today, -6), to: today }
  if (period === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today }
  const firstThis = `${y}-${String(m).padStart(2, '0')}-01`
  const lastPrev = addDays(firstThis, -1)
  return { from: lastPrev.slice(0, 8) + '01', to: lastPrev }
}

const n = (v: number | null | undefined) => Number(v ?? 0)

function formatINR(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const shortDate = (ymd: string) =>
  new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
]

const tooltipStyle = {
  background: '#1a1a1a',
  border: '1px solid #2e2e2e',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
}

// ---------- Component ----------
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('month')
  const [branchId, setBranchId] = useState<string>('all')

  const [branches, setBranches] = useState<Branch[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [salesIds, setSalesIds] = useState<Set<string>>(new Set())
  const [reports, setReports] = useState<Report[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [presentToday, setPresentToday] = useState<string[]>([])
  const [pendingLeaves, setPendingLeaves] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => getRange(period), [period])

  // Master data: branches + profiles (loaded once)
  useEffect(() => {
    ;(async () => {
      const [b, p, r] = await Promise.all([
        supabase.from('branches').select('id, name, city').eq('is_active', true).order('name'),
        supabase.from('profiles').select('id, full_name, branch_id, is_active'),
        supabase.from('user_roles').select('user_id').eq('role', 'sales'),
      ])
      if (b.error || p.error) {
        setError((b.error ?? p.error)!.message)
        return
      }
      setBranches(b.data ?? [])
      setProfiles(p.data ?? [])
      setSalesIds(new Set((r.data ?? []).map((x) => x.user_id)))
    })()
  }, [])

  // Reload data when period or branch changes
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)

      let rq = supabase
        .from('daily_reports')
        .select('user_id, branch_id, work_date, calls, quality_leads, positive_leads, hot_leads, deals_closed, revenue, facebook_inquiry, indiamart_inquiry, bulk_whatsapp, old_client_ref, incoming_calls')
        .gte('work_date', range.from)
        .lte('work_date', range.to)
      let dq = supabase
        .from('deal_details')
        .select('id, user_id, branch_id, work_date, client_name, amount')
        .gte('work_date', range.from)
        .lte('work_date', range.to)
        .order('work_date', { ascending: false })
        .limit(50)
      if (branchId !== 'all') {
        rq = rq.eq('branch_id', branchId)
        dq = dq.eq('branch_id', branchId)
      }

      const [r, d, a, l] = await Promise.all([
        rq,
        dq,
        supabase.from('attendance').select('user_id').eq('work_date', istToday()).not('check_in_time', 'is', null),
        supabase.from('leave_applications').select('user_id').eq('status', 'pending'),
      ])

      const firstError = r.error ?? d.error ?? a.error ?? l.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }
      setReports(r.data ?? [])
      setDeals(d.data ?? [])
      setPresentToday((a.data ?? []).map((x) => x.user_id))
      setPendingLeaves((l.data ?? []).map((x) => x.user_id))
      setLoading(false)
    })()
  }, [range, branchId])

  // ---------- Derived data ----------
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches])
  const inBranch = (userId: string) => branchId === 'all' || profileMap.get(userId)?.branch_id === branchId

  const totals = useMemo(() => {
    const t = { calls: 0, quality: 0, positive: 0, hot: 0, deals: 0, revenue: 0, fb: 0, indiamart: 0, whatsapp: 0, oldRef: 0, incoming: 0 }
    for (const r of reports) {
      t.calls += n(r.calls)
      t.quality += n(r.quality_leads)
      t.positive += n(r.positive_leads)
      t.hot += n(r.hot_leads)
      t.deals += n(r.deals_closed)
      t.revenue += n(r.revenue)
      t.fb += n(r.facebook_inquiry)
      t.indiamart += n(r.indiamart_inquiry)
      t.whatsapp += n(r.bulk_whatsapp)
      t.oldRef += n(r.old_client_ref)
      t.incoming += n(r.incoming_calls)
    }
    return t
  }, [reports])

  const activeEmployees = profiles.filter((p) => p.is_active !== false && inBranch(p.id)).length
  const presentCount = new Set(presentToday.filter(inBranch)).size
  const pendingCount = pendingLeaves.filter(inBranch).length
  const avgDeal = totals.deals > 0 ? totals.revenue / totals.deals : 0

  const trend = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const r of reports) byDate.set(r.work_date, (byDate.get(r.work_date) ?? 0) + n(r.revenue))
    const out: { date: string; revenue: number }[] = []
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push({ date: shortDate(d), revenue: byDate.get(d) ?? 0 })
    return out
  }, [reports, range])

  const branchRevenue = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of reports) if (r.branch_id) sums.set(r.branch_id, (sums.get(r.branch_id) ?? 0) + n(r.revenue))
    return branches.map((b) => ({ name: b.name, revenue: sums.get(b.id) ?? 0 }))
  }, [reports, branches])

  // Every active sales employee (in the chosen branch), even with no reports yet
  const performers = useMemo(() => {
    const m = new Map<string, { calls: number; hot: number; deals: number; revenue: number; reports: number }>()
    for (const p of profiles) {
      if (p.is_active === false || !salesIds.has(p.id)) continue
      if (branchId !== 'all' && p.branch_id !== branchId) continue
      m.set(p.id, { calls: 0, hot: 0, deals: 0, revenue: 0, reports: 0 })
    }
    for (const r of reports) {
      const cur = m.get(r.user_id) ?? { calls: 0, hot: 0, deals: 0, revenue: 0, reports: 0 }
      cur.reports += 1
      cur.calls += n(r.calls)
      cur.hot += n(r.hot_leads)
      cur.deals += n(r.deals_closed)
      cur.revenue += n(r.revenue)
      m.set(r.user_id, cur)
    }
    return [...m.entries()]
      .map(([userId, s]) => {
        const p = profileMap.get(userId)
        return { userId, name: p?.full_name ?? 'Unknown', branch: branchMap.get(p?.branch_id ?? '')?.name ?? '—', ...s }
      })
      .sort((a, b) => b.revenue - a.revenue || b.calls - a.calls)
  }, [reports, profiles, salesIds, branchId, profileMap, branchMap])

  const funnel = [
    { label: 'Calls', value: totals.calls },
    { label: 'Quality leads', value: totals.quality },
    { label: 'Positive leads', value: totals.positive },
    { label: 'Hot leads', value: totals.hot },
    { label: 'Deals closed', value: totals.deals },
  ]
  const funnelMax = Math.max(totals.calls, 1)


  // ---------- UI ----------
  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl">
        {/* Title + filters */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-400">
              {shortDate(range.from)} {range.from !== range.to && `– ${shortDate(range.to)}`}
              {' · '}
              {branchId === 'all' ? 'All branches' : branchMap.get(branchId)?.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                    period === p.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            Could not load data: {error}
          </div>
        )}

        <div className={`transition-opacity ${loading ? 'opacity-50' : 'opacity-100'}`}>
          {/* Hero: revenue + funnel */}
          <section className="mt-6 grid gap-6 rounded-2xl border border-[#242424] bg-[#151515] p-6 lg:grid-cols-5">
            <div className="lg:col-span-2 lg:border-r lg:border-[#242424] lg:pr-6">
              <p className="text-sm text-gray-400">Total revenue</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-orange-500 sm:text-5xl">{formatINR(totals.revenue)}</p>
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Deals closed</p>
                  <p className="mt-1 text-xl font-semibold">{totals.deals}</p>
                </div>
                <div>
                  <p className="text-gray-400">Average deal</p>
                  <p className="mt-1 text-xl font-semibold">{formatINR(avgDeal)}</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <p className="text-sm text-gray-400">Sales funnel</p>
              <div className="mt-3 space-y-2.5">
                {funnel.map((s, i) => {
                  const prev = i > 0 ? funnel[i - 1].value : 0
                  const conv = i > 0 && prev > 0 ? Math.round((s.value / prev) * 100) : null
                  return (
                    <div key={s.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
                      <span className="text-gray-300">{s.label}</span>
                      <div className="h-6 overflow-hidden rounded bg-[#1f1f1f]">
                        <div
                          className="h-full rounded bg-orange-500"
                          style={{ width: `${Math.max((s.value / funnelMax) * 100, s.value > 0 ? 2 : 0)}%`, opacity: 1 - i * 0.14 }}
                        />
                      </div>
                      <span className="w-24 text-right tabular-nums">
                        {s.value.toLocaleString('en-IN')}
                        {conv !== null && <span className="ml-1.5 text-xs text-gray-500">{conv}%</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* Team strip */}
          <section className="mt-6 grid grid-cols-2 divide-[#242424] rounded-2xl border border-[#242424] bg-[#151515] sm:grid-cols-4 sm:divide-x">
            <Stat label="Present today" value={`${presentCount} / ${activeEmployees}`} />
            <Stat label="Pending leave requests" value={pendingCount} highlight={pendingCount > 0} />
            <Stat label="Hot leads" value={totals.hot.toLocaleString('en-IN')} />
            <Stat label="Reports submitted" value={new Set(reports.map((r) => r.user_id)).size} />
          </section>

          {/* Trend + sources */}
          <section className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Revenue trend" className="lg:col-span-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#222" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={64} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 10000)]} tickFormatter={(v) => formatINR(Number(v))} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatINR(Number(v)), 'Revenue']} />
                    <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#rev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Inquiry sources">
              <DonutChart
                data={[
                  { name: 'IndiaMART', value: totals.indiamart, color: PIE_COLORS[0] },
                  { name: 'Facebook', value: totals.fb, color: PIE_COLORS[1] },
                  { name: 'Incoming calls', value: totals.incoming, color: PIE_COLORS[2] },
                  { name: 'Old client reference', value: totals.oldRef, color: PIE_COLORS[4] },
                ]}
                centerLabel="Inquiries"
                empty="No inquiries in this period."
              />
            </Panel>
          </section>

          {/* Branch revenue + recent deals */}
          <section className="mt-6 grid gap-6 lg:grid-cols-3">
            {branchId === 'all' && (
              <Panel title="Branch-wise revenue" className="lg:col-span-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchRevenue} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#222" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#bbb', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={64} allowDecimals={false} domain={[0, (max: number) => Math.max(max, 10000)]} tickFormatter={(v) => formatINR(Number(v))} />
                      <Tooltip cursor={{ fill: '#1c1c1c' }} contentStyle={tooltipStyle} itemStyle={{ color: '#e5e5e5' }} formatter={(v) => [formatINR(Number(v)), 'Revenue']} />
                      <Bar dataKey="revenue" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={56} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            )}

            <Panel title="Recent deals" className={branchId === 'all' ? '' : 'lg:col-span-3'}>
              {deals.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No deals recorded in this period.</p>
              ) : (
                <ul className="max-h-64 divide-y divide-[#222] overflow-y-auto pr-1">
                  {deals.slice(0, 12).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate">{d.client_name || 'No client name'}</p>
                        <p className="truncate text-xs text-gray-500">
                          {profileMap.get(d.user_id)?.full_name ?? 'Unknown'} · {shortDate(d.work_date)}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium text-orange-400">{formatINR(n(d.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </section>

          {/* Top performers */}
          <Panel title={`Sales team performance (${performers.length})`} className="mt-6">
            {performers.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No sales employees yet. Add them from Employees.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[#242424] text-left text-gray-400">
                      <th className="py-2 pr-3 font-normal">#</th>
                      <th className="py-2 pr-4 font-normal">Name</th>
                      <th className="py-2 pr-4 font-normal">Branch</th>
                      <th className="py-2 pr-4 text-right font-normal">Calls</th>
                      <th className="py-2 pr-4 text-right font-normal">Hot leads</th>
                      <th className="py-2 pr-4 text-right font-normal">Reports</th>
                      <th className="py-2 pr-4 text-right font-normal">Deals</th>
                      <th className="py-2 text-right font-normal">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performers.map((p, i) => (
                      <tr
                        key={p.userId}
                        onClick={() => navigate(`/admin/employee/${p.userId}`)}
                        className="cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a]"
                        title="Open full report"
                      >
                        <td className="py-2.5 pr-3 text-gray-500">{i + 1}</td>
                        <td className="py-2.5 pr-4">
                          <span className={i === 0 && p.revenue > 0 ? 'font-semibold text-orange-400' : ''}>{p.name}</span>
                        </td>
                        <td className="py-2.5 pr-4 text-gray-400">{p.branch}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{p.calls.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{p.hot}</td>
                        <td className={`py-2.5 pr-4 text-right tabular-nums ${p.reports === 0 ? 'text-red-400' : ''}`}>{p.reports}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">{p.deals}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatINR(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AdminLayout>
  )
}

// ---------- Small components ----------
function Stat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${highlight ? 'text-orange-400' : ''}`}>{value}</p>
    </div>
  )
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-[#242424] bg-[#151515] p-5 ${className}`}>
      <h2 className="mb-4 text-sm font-medium text-gray-300">{title}</h2>
      {children}
    </div>
  )
}