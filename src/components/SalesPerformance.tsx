import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Building2, Target as TargetIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PerformanceView from './PerformanceView'
import DonutChart, { PIE_COLORS } from './DonutChart'
import { DateField } from './DateField'
import TargetPerformance from './sales/TargetPerformance'
import ActivityPerformance from './sales/ActivityPerformance'
import { PERIODS, rangeOf, type PeriodKey } from './sales/salesPerf'
import { istDate, inr } from '../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../lib/targets'

/*
  Sales Performance — the shell.

  Two measures, two tabs, and they are kept apart on purpose:

    Target   — money against target. This is what decides how someone is
               doing, and the only place a red, yellow or green appears.
    Activity — calls, follow-ups, leads. Effort, with no verdict on it.

  They used to sit in one leaderboard, with calls and revenue in
  neighbouring columns and a single zone chip at the end. That table
  made it look as though the chip was judging the calls too, which it
  never was. Splitting them is the whole change.

  The old leaderboard is gone because of that. Its branch comparison is
  still here, under Branches.
*/

type Branch = { id: string; name: string }
type Person = { id: string; full_name: string | null; branch_id: string | null }
type ReportRow = {
  user_id: string
  branch_id: string | null
  calls: number | null
  deals_closed: number | null
  revenue: number | null
}

type Tab = 'target' | 'activity' | 'branches'

const TABS: { key: Tab; label: string; icon: React.ReactNode; note: string }[] = [
  { key: 'target', label: 'Target', icon: <TargetIcon size={14} />, note: 'Money against target — this is the measure.' },
  { key: 'activity', label: 'Activity', icon: <Activity size={14} />, note: 'Calls and leads — a record of effort, not a score.' },
  { key: 'branches', label: 'Branches', icon: <Building2 size={14} />, note: 'This month, branch against branch.' },
]

// Supabase returns at most 1000 rows per request, so page through
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
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
      .select('user_id, branch_id, calls, deals_closed, revenue')
      .gte('work_date', from)
      .lte('work_date', to)
      .range(a, z),
  )

export default function SalesPerformance({
  lockedBranchId,
  // A sales person's own page: themselves only, no selects, no team.
  // The RPCs refuse to return anyone else to them anyway — this is so
  // the screen does not offer a choice the database will not honour.
  selfOnly = false,
}: { lockedBranchId?: string; selfOnly?: boolean } = {}) {
  const today = istDate()
  const ym = today.slice(0, 7)

  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('target')
  const [branches, setBranches] = useState<Branch[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [branchId, setBranchId] = useState(lockedBranchId ?? 'all')
  const [userId, setUserId] = useState(searchParams.get('user') ?? 'all')
  const [error, setError] = useState<string | null>(null)

  // Branch managers are locked to their own branch even without the prop
  const [autoLock, setAutoLock] = useState<string | null>(null)
  const lock = lockedBranchId ?? autoLock
  const basePath = lock ? '/manager' : '/admin'

  // Period
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [customFrom, setCustomFrom] = useState(monthFirst(ym))
  const [customTo, setCustomTo] = useState(today)
  const range = useMemo(() => rangeOf(period, customFrom, customTo), [period, customFrom, customTo])

  /*
    On a person's own page the screen must not paint until it knows who
    that person is. userId starts as 'all', which is the team layout —
    zone boxes, a leaderboard, a top performer — and flashing that up
    for half a second before it collapses to one row looks broken, and
    worse, looks like a list of colleagues.
  */
  const [selfResolved, setSelfResolved] = useState(!selfOnly)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (selfOnly) {
        if (user?.id) setUserId(user.id)
        setSelfResolved(true)
      }
      if (!user) return
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'branch_manager') return
      const { data: prof } = await supabase.from('profiles').select('branch_id').eq('id', user.id).maybeSingle()
      if (prof?.branch_id) {
        setAutoLock(prof.branch_id)
        setBranchId(prof.branch_id)
      }
    })()
  }, [selfOnly])

  // Branches + sales people, for the two selects
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
      setPeople(salesIds.size > 0 ? all.filter((x) => salesIds.has(x.id)) : all)
    })()
  }, [])

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const visiblePeople = people.filter((p) => branchId === 'all' || p.branch_id === branchId)
  const selected = people.find((p) => p.id === userId) ?? null

  // Drop the employee if they are not in the chosen branch
  useEffect(() => {
    if (userId !== 'all' && selected && branchId !== 'all' && selected.branch_id !== branchId) setUserId('all')
  }, [branchId, userId, selected])

  // ---- Branches tab only: this month's targets and reports ----
  const [branchTargets, setBranchTargets] = useState<Map<string, number>>(new Map())
  const [monthReports, setMonthReports] = useState<ReportRow[]>([])

  useEffect(() => {
    if (tab !== 'branches') return
    ;(async () => {
      try {
        const [bt, reports] = await Promise.all([
          supabase.from('branch_targets').select('branch_id, target_amount').eq('month', monthFirst(ym)),
          fetchReports(monthFirst(ym), monthLast(ym)),
        ])
        setBranchTargets(new Map((bt.data ?? []).map((x) => [x.branch_id, Number(x.target_amount)])))
        setMonthReports(reports)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [tab, ym])

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

  const shareData = (branchId === 'all' ? branches : [])
    .map((b, i) => ({
      name: b.name,
      value: monthReports.filter((r) => r.branch_id === b.id).reduce((s, r) => s + Number(r.revenue ?? 0), 0),
      color: PIE_COLORS[i % PIE_COLORS.length],
    }))

  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'

  // A sales person has no branch comparison to look at — that is a
  // manager's question, and the data behind it is not theirs to read.
  const tabs = selfOnly ? TABS.filter((t) => t.key !== 'branches') : TABS
  const tabNote = TABS.find((t) => t.key === tab)!.note

  return (
    <div className="mx-auto max-w-6xl">
      {/* ---------- heading + who ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{selfOnly ? 'My Performance' : 'Sales Performance'}</h1>
          <p className="mt-1 text-sm text-gray-400">{tabNote}</p>
        </div>
        {!selfOnly && (
          <div className="flex flex-wrap gap-3">
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls} aria-label="Branch" disabled={!!lock}>
              <option value="all">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectCls} aria-label="Sales person">
              <option value="all">All sales people</option>
              {visiblePeople.map((p) => <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Could not load data: {error}
        </div>
      )}

      {/* ---------- tabs + period ---------- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs transition-colors ${
                tab === t.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Branches is always this month, so a period picker there would
            promise something it does not do. */}
        {tab !== 'branches' && (
          <div className="flex flex-wrap items-center gap-2">
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
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <DateField value={customFrom} onChange={setCustomFrom} placeholder="From" />
                <span className="text-xs text-gray-500">to</span>
                <DateField value={customTo} onChange={setCustomTo} placeholder="To" />
              </div>
            )}
          </div>
        )}
      </div>

      {selected && !selfOnly && tab !== 'branches' && (
        <p className="mt-3 text-sm text-gray-400">
          Showing <span className="font-medium text-white">{selected.full_name || 'Unnamed'}</span>
          {selected.branch_id ? ` · ${branchName.get(selected.branch_id) ?? 'No branch'}` : ''}
        </p>
      )}

      {/* ---------- the tab ---------- */}
      <div className="mt-5">
        {!selfResolved && (
          <p className="py-16 text-center text-sm text-gray-500">Loading…</p>
        )}

        {selfResolved && tab === 'target' && (
          <TargetPerformance
            from={range.from}
            to={range.to}
            branchId={branchId}
            userId={userId}
            onPickUser={setUserId}
            basePath={basePath}
            canSwitch={!selfOnly}
          />
        )}

        {selfResolved && tab === 'activity' && (
          <>
            <ActivityPerformance
              from={range.from}
              to={range.to}
              branchId={branchId}
              userId={userId}
              onPickUser={setUserId}
              canSwitch={!selfOnly}
            />
            <div className="mt-8">
              <PerformanceView
                key={`${userId}-${branchId}`}
                userId={userId === 'all' ? null : userId}
                branchId={branchId === 'all' ? null : branchId}
                title={selected ? selected.full_name || 'Unnamed' : branchId === 'all' ? 'Whole sales team' : `${branchName.get(branchId)} team`}
                subtitle={selected ? `${branchName.get(selected.branch_id ?? '') ?? 'No branch'} · Sales` : undefined}
              />
            </div>
          </>
        )}

        {tab === 'branches' && (
          <>
            <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
              <div className="mb-4">
                <h2 className="text-sm font-medium text-gray-300">Branch comparison · {monthTitle(ym)}</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Revenue from daily reports. Click a branch to look at only that branch.
                </p>
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
                          onClick={() => { setBranchId(b.id); setTab('target') }}
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
                    {branchRows.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-500">No branches yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {branchId === 'all' && (
              <section className="mt-4 rounded-2xl border border-[#242424] bg-[#151515] p-5">
                <h2 className="mb-4 text-sm font-medium text-gray-300">Revenue share by branch · {monthTitle(ym)}</h2>
                <DonutChart data={shareData} format={inr} centerLabel="Revenue" empty="No revenue yet this month." />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}