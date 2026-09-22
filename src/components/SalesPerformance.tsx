import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PerformanceView from './PerformanceView'
import DonutChart, { PIE_COLORS } from './DonutChart'
import { istDate, addDays, weekStart, inr } from '../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../lib/targets'

type Branch = { id: string; name: string }
type Person = { id: string; full_name: string | null; branch_id: string | null }
type Period = 'week' | 'month' | 'year'
type ReportRow = {
  user_id: string
  branch_id: string | null
  calls: number | null
  positive_leads: number | null
  hot_leads: number | null
  deals_closed: number | null
  revenue: number | null
}
type Stat = {
  userId: string
  name: string
  branchId: string | null
  branch: string
  calls: number
  positive: number
  hot: number
  deals: number
  revenue: number
  reports: number
  evolutions: number
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
]

function periodStart(p: Period, today: string) {
  if (p === 'week') return weekStart(today)
  if (p === 'month') return today.slice(0, 8) + '01'
  return today.slice(0, 5) + '01-01'
}

// Working days (Mon–Sat) from start to today, for submission discipline
function workingDays(from: string, to: string) {
  let count = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) count++
  return Math.max(count, 1)
}

// Supabase returns max 1000 rows per request, so page through
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await build(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const fetchReports = (from: string, to: string) =>
  fetchAll<ReportRow>((a, z) =>
    supabase
      .from('daily_reports')
      .select('user_id, branch_id, calls, positive_leads, hot_leads, deals_closed, revenue')
      .gte('work_date', from)
      .lte('work_date', to)
      .range(a, z),
  )

export default function SalesPerformance({ lockedBranchId }: { lockedBranchId?: string } = {}) {
  const today = istDate()
  const ym = today.slice(0, 7)

  const [branches, setBranches] = useState<Branch[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [branchId, setBranchId] = useState(lockedBranchId ?? 'all')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [userId, setUserId] = useState(searchParams.get('user') ?? 'all')

  // Branch managers are always locked to their own branch (even if no prop is passed)
  const [autoLock, setAutoLock] = useState<string | null>(null)
  const lock = lockedBranchId ?? autoLock

  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'branch_manager') return
      const { data: prof } = await supabase.from('profiles').select('branch_id').eq('id', user.id).maybeSingle()
      if (prof?.branch_id) {
        setAutoLock(prof.branch_id)
        setBranchId(prof.branch_id)
      }
    })()
  }, [])

  const [period, setPeriod] = useState<Period>('month')
  const [stats, setStats] = useState<Stat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // This month's targets + achievement (for zones)
  const [branchTargets, setBranchTargets] = useState<Map<string, number>>(new Map())
  const [empTargets, setEmpTargets] = useState<Map<string, number>>(new Map())
  const [monthReports, setMonthReports] = useState<ReportRow[]>([])

  // Branches + sales employees
  useEffect(() => {
    ;(async () => {
      const [b, p, r] = await Promise.all([
        supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
        supabase.from('profiles').select('id, full_name, branch_id, is_active').order('full_name'),
        supabase.from('user_roles').select('user_id').eq('role', 'sales'),
      ])
      if (b.error || p.error) return setError((b.error ?? p.error)!.message)
      setBranches(b.data ?? [])
      const salesIds = new Set((r.data ?? []).map((x) => x.user_id))
      const all = (p.data ?? []).filter((x) => x.is_active !== false)
      // If roles can't be read, fall back to everyone
      setPeople(salesIds.size > 0 ? all.filter((x) => salesIds.has(x.id)) : all)
    })()
  }, [])

  // This month: targets + reports
  useEffect(() => {
    ;(async () => {
      try {
        const [bt, et, reports] = await Promise.all([
          supabase.from('branch_targets').select('branch_id, target_amount').eq('month', monthFirst(ym)),
          supabase.from('employee_targets').select('user_id, target_amount').eq('month', monthFirst(ym)),
          fetchReports(monthFirst(ym), monthLast(ym)),
        ])
        setBranchTargets(new Map((bt.data ?? []).map((x) => [x.branch_id, Number(x.target_amount)])))
        setEmpTargets(new Map((et.data ?? []).map((x) => [x.user_id, Number(x.target_amount)])))
        setMonthReports(reports)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [ym])

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const visiblePeople = people.filter((p) => branchId === 'all' || p.branch_id === branchId)
  const selected = people.find((p) => p.id === userId)

  // Reset employee if they're not in the chosen branch
  useEffect(() => {
    if (userId !== 'all' && selected && branchId !== 'all' && selected.branch_id !== branchId) setUserId('all')
  }, [branchId, userId, selected])

  // Leaderboard
  useEffect(() => {
    if (people.length === 0) return
    ;(async () => {
      setLoading(true)
      setError(null)
      const from = periodStart(period, today)
      try {
        const [reports, evolutions] = await Promise.all([
          fetchReports(from, today),
          fetchAll<{ user_id: string }>((a, z) =>
            supabase.from('daily_evolution').select('user_id').gte('evolution_date', from).lte('evolution_date', today).range(a, z),
          ),
        ])

        const map = new Map<string, Stat>(
          people.map((p) => [
            p.id,
            {
              userId: p.id,
              name: p.full_name || 'Unnamed',
              branchId: p.branch_id,
              branch: branchName.get(p.branch_id ?? '') ?? '—',
              calls: 0, positive: 0, hot: 0, deals: 0, revenue: 0, reports: 0, evolutions: 0,
            },
          ]),
        )
        for (const r of reports) {
          const s = map.get(r.user_id)
          if (!s) continue
          s.calls += Number(r.calls ?? 0)
          s.positive += Number(r.positive_leads ?? 0)
          s.hot += Number(r.hot_leads ?? 0)
          s.deals += Number(r.deals_closed ?? 0)
          s.revenue += Number(r.revenue ?? 0)
          s.reports += 1
        }
        for (const e of evolutions) {
          const s = map.get(e.user_id)
          if (s) s.evolutions += 1
        }
        setStats([...map.values()].sort((a, b) => b.revenue - a.revenue))
      } catch (e) {
        setError((e as Error).message)
      }
      setLoading(false)
    })()
  }, [period, people, branchName, today])

  // Branch comparison (this month)
  const branchRows = useMemo(() => {
    return branches
      .map((b) => {
        const rs = monthReports.filter((r) => r.branch_id === b.id)
        const achieved = rs.reduce((s, r) => s + Number(r.revenue ?? 0), 0)
        const target = branchTargets.get(b.id) ?? 0
        return {
          id: b.id,
          name: b.name,
          target,
          achieved,
          pct: pctOf(achieved, target),
          calls: rs.reduce((s, r) => s + Number(r.calls ?? 0), 0),
          deals: rs.reduce((s, r) => s + Number(r.deals_closed ?? 0), 0),
          team: people.filter((p) => p.branch_id === b.id).length,
        }
      })
      .sort((a, c) => c.pct - a.pct || c.achieved - a.achieved)
  }, [branches, monthReports, branchTargets, people])

  const days = workingDays(periodStart(period, today), today)
  const showTargets = period === 'month'
  const rows = stats.filter((s) => branchId === 'all' || s.branchId === branchId)

  // Revenue share this month: by branch (all branches) or by employee (one branch)
  const shareByBranch = branchId === 'all'
  const sumRevenue = (list: ReportRow[]) => list.reduce((s, r) => s + Number(r.revenue ?? 0), 0)
  const shareData = shareByBranch
    ? branches.map((b, i) => ({
        name: b.name,
        value: sumRevenue(monthReports.filter((r) => r.branch_id === b.id)),
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
    : people
        .filter((p) => p.branch_id === branchId)
        .map((p, i) => ({
          name: p.full_name || 'Unnamed',
          value: sumRevenue(monthReports.filter((r) => r.user_id === p.id)),
          color: PIE_COLORS[i % PIE_COLORS.length],
        }))

  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'

  return (
    <div className="mx-auto max-w-6xl">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Performance</h1>
          <p className="mt-1 text-sm text-gray-400">Track every branch and every sales employee.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls} aria-label="Branch" disabled={!!lock}>
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectCls} aria-label="Employee">
            <option value="all">All sales employees</option>
            {visiblePeople.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">Could not load data: {error}</div>
      )}

      {/* Branch comparison */}
      {!lock && branchId === 'all' && userId === 'all' && (
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-300">Branch comparison · {monthTitle(ym)}</h2>
            <p className="mt-0.5 text-xs text-gray-500">Click a branch to see only that branch.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-gray-400">
                  <th className="py-2 pr-4 font-normal">Branch</th>
                  <th className="py-2 pr-4 font-normal">Target progress</th>
                  <th className="py-2 pr-4 text-right font-normal">Achieved</th>
                  <th className="py-2 pr-4 text-right font-normal">Target</th>
                  <th className="py-2 pr-4 text-right font-normal">Calls</th>
                  <th className="py-2 pr-4 text-right font-normal">Deals</th>
                  <th className="py-2 text-right font-normal">Team</th>
                </tr>
              </thead>
              <tbody>
                {branchRows.map((b) => {
                  const zone = zoneOf(b.pct)
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setBranchId(b.id)}
                      className="cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a]"
                    >
                      <td className="py-3 pr-4 font-medium">{b.name}</td>
                      <td className="w-[32%] py-3 pr-4">
                        {b.target > 0 ? (
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#222]">
                              <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                            </div>
                            <span className={`w-12 text-right text-xs font-semibold tabular-nums ${zone.text}`}>{b.pct.toFixed(0)}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">No target set</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium tabular-nums">{inr(b.achieved)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-400">{b.target > 0 ? inr(b.target) : '—'}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{b.calls.toLocaleString('en-IN')}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{b.deals}</td>
                      <td className="py-3 text-right tabular-nums text-gray-400">{b.team}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Revenue share (pie) */}
      {userId === 'all' && (
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
          <h2 className="mb-4 text-sm font-medium text-gray-300">
            {shareByBranch ? 'Revenue share by branch' : 'Revenue share by employee'} · {monthTitle(ym)}
          </h2>
          <DonutChart data={shareData} format={inr} centerLabel="Revenue" empty="No revenue yet this month." />
        </section>
      )}

      {/* Charts */}
      <div className="mt-8">
        <PerformanceView
          key={`${userId}-${branchId}`}
          userId={userId === 'all' ? null : userId}
          branchId={branchId === 'all' ? null : branchId}
          title={selected ? selected.full_name || 'Unnamed' : branchId === 'all' ? 'Whole sales team' : `${branchName.get(branchId)} team`}
          subtitle={selected ? `${branchName.get(selected.branch_id ?? '') ?? 'No branch'} · Sales` : undefined}
        />
      </div>

      {/* Leaderboard */}
      <section className="mt-8 rounded-2xl border border-[#242424] bg-[#151515] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-gray-300">Leaderboard</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Click a name to open their full report. Forms are counted against {days} working days.
              {showTargets && ' Target zones use this month’s targets.'}
            </p>
          </div>
          <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  period === p.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`overflow-x-auto ${loading ? 'opacity-50' : ''}`}>
          <table className={`w-full text-sm ${showTargets ? 'min-w-[980px]' : 'min-w-[760px]'}`}>
            <thead>
              <tr className="border-b border-[#242424] text-left text-gray-400">
                <th className="py-2 pr-3 font-normal">#</th>
                <th className="py-2 pr-4 font-normal">Name</th>
                <th className="py-2 pr-4 font-normal">Branch</th>
                <th className="py-2 pr-4 text-right font-normal">Calls</th>
                <th className="py-2 pr-4 text-right font-normal">Positive</th>
                <th className="py-2 pr-4 text-right font-normal">Hot</th>
                <th className="py-2 pr-4 text-right font-normal">Deals</th>
                <th className="py-2 pr-4 text-right font-normal">Revenue</th>
                {showTargets && (
                  <>
                    <th className="py-2 pr-4 text-right font-normal">Target</th>
                    <th className="py-2 pr-4 font-normal">Zone</th>
                  </>
                )}
                <th className="py-2 pr-4 text-right font-normal">Evolution</th>
                <th className="py-2 text-right font-normal">Reports</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={showTargets ? 12 : 10} className="py-8 text-center text-gray-500">No sales employees found.</td>
                </tr>
              ) : (
                rows.map((s, i) => {
                  const target = empTargets.get(s.userId) ?? 0
                  const pct = pctOf(s.revenue, target)
                  const zone = zoneOf(pct)
                  return (
                    <tr
                      key={s.userId}
                      onClick={() => navigate(`${lock ? '/manager' : '/admin'}/employee/${s.userId}`)}
                      title="Open full report"
                      className={`cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a] ${
                        s.userId === userId ? 'bg-orange-500/5' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3 text-gray-500">{i + 1}</td>
                      <td className={`py-2.5 pr-4 ${s.userId === userId ? 'font-medium text-orange-400' : ''}`}>{s.name}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{s.branch}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.calls.toLocaleString('en-IN')}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.positive}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.hot}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{s.deals}</td>
                      <td className="py-2.5 pr-4 text-right font-medium tabular-nums">{inr(s.revenue)}</td>
                      {showTargets && (
                        <>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{target > 0 ? inr(target) : '—'}</td>
                          <td className="py-2.5 pr-4">
                            {target > 0 ? (
                              <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${zone.chip}`}>
                                {pct.toFixed(0)}% · {zone.label.replace(' zone', '')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-600">No target</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        <Discipline done={s.evolutions} total={days} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        <Discipline done={s.reports} total={days} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Discipline({ done, total }: { done: number; total: number }) {
  const pct = Math.min(done / total, 1)
  const color = pct >= 0.9 ? 'text-green-400' : pct >= 0.6 ? 'text-yellow-400' : 'text-red-400'
  return (
    <span className={color}>
      {done}/{total}
    </span>
  )
}