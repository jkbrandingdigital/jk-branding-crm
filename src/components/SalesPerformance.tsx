import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Building2, Target as TargetIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PerformanceView from './PerformanceView'
import DonutChart, { PIE_COLORS } from './DonutChart'
import { DateField } from './DateField'
import TargetPerformance from './sales/TargetPerformance'
import ActivityPerformance from './sales/ActivityPerformance'
import IncentiveCard from './sales/IncentiveCard'
import { PERIODS, rangeOf, type PeriodKey } from './sales/salesPerf'
import { istDate, inr } from '../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../lib/targets'
import { CARD_TABLE } from './CardTable'
import { SHEET_BACKDROP, sheetPanel } from './Sheet'

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

  Incentive sits at the very bottom of the Target tab — the last thing
  on the page, because it is the figure a sales person reads last and
  takes home. It always reads confirmed projects, whatever else the tab
  shows.
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

  // Company (House): confirmed money credited to nobody on the sales
  // roster — an admin's own deal, or a customer with no sales owner.
  // Broken down by who, so two admins do not blur into one lump.
  const [houseList, setHouseList] = useState<{ uid: string; name: string; amount: number; deals: number }[]>([])
  // Which House person's deals are being looked at.
  const [housePick, setHousePick] = useState<{ uid: string; name: string } | null>(null)

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
        // Branch managers sell too, and have a row in the performance
        // RPCs, so they belong in the person picker alongside sales.
        supabase.from('user_roles').select('user_id').in('role', ['sales', 'branch_manager']),
      ])
      if (b.error || p.error) return setError((b.error ?? p.error)!.message)
      setBranches(b.data ?? [])
      const sellerIds = new Set((r.data ?? []).map((x) => x.user_id))
      const all = (p.data ?? []).filter((x) => x.is_active !== false)
      setPeople(sellerIds.size > 0 ? all.filter((x) => sellerIds.has(x.id)) : all)
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

  // Company (House) total for the chosen window and branch. Only on the
  // Target tab, and never on a sales person's own page — it is a team
  // figure, not theirs.
  useEffect(() => {
    if (selfOnly || tab !== 'target') return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('sales_house', {
        p_from: range.from,
        p_to: range.to,
        p_branch: branchId === 'all' ? null : branchId,
      })
      if (!alive || error) return
      // Rows come per person per branch; fold the branches into one line
      // per person for the card.
      const rows = (data ?? []) as { uid: string; full_name: string; amount: number; deals: number }[]
      const byUid = new Map<string, { uid: string; name: string; amount: number; deals: number }>()
      for (const r of rows) {
        const key = r.uid ?? r.full_name
        const cur = byUid.get(key) ?? { uid: r.uid, name: r.full_name, amount: 0, deals: 0 }
        cur.amount += Number(r.amount ?? 0)
        cur.deals += Number(r.deals ?? 0)
        byUid.set(key, cur)
      }
      setHouseList([...byUid.values()].sort((a, b) => b.amount - a.amount))
    })()
    return () => { alive = false }
  }, [selfOnly, tab, range.from, range.to, branchId])

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

        {/* Company (House) — deals that are nobody's sale, kept off every
            person's score but in the company total, and shown by who. */}
        {selfResolved && tab === 'target' && !selfOnly && houseList.length > 0 && (() => {
          const total = houseList.reduce((s, h) => s + h.amount, 0)
          const totalDeals = houseList.reduce((s, h) => s + h.deals, 0)
          return (
            <div className="mt-4 rounded-2xl border border-[#242424] bg-[#151515] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-300">Company (House)</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Confirmed deals not credited to any sales person — entered by an admin, or a
                    customer with no sales owner. Kept off everyone's score, but in the company total.
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xl font-semibold tabular-nums text-gray-200">{inr(total)}</p>
                  <p className="text-xs text-gray-500">{totalDeals} deal{totalDeals === 1 ? '' : 's'}</p>
                </div>
              </div>
              {/* By who — so two admins never blur into one lump. */}
              <ul className="mt-4 divide-y divide-[#222] border-t border-[#242424]">
                {houseList.map((h) => (
                  <li key={h.uid} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-gray-300">{h.name}</span>
                    <span className="shrink-0 tabular-nums text-gray-400">
                      {inr(h.amount)}
                      <button
                        type="button"
                        onClick={() => setHousePick({ uid: h.uid, name: h.name })}
                        className="ml-2 rounded px-1.5 py-0.5 text-xs text-orange-400 hover:bg-orange-500/10 hover:underline"
                      >
                        {h.deals} deal{h.deals === 1 ? '' : 's'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })()}

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
                {/* lg:min-w, not min-w: in card mode a 720px floor would
                    still apply and scroll the page sideways. */}
                <table className={`w-full text-sm lg:min-w-[720px] ${CARD_TABLE}`}>
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
                          {/* No label: on a card the branch is the heading. */}
                          <td data-label="" className="py-3 pr-4 font-medium">{b.name}</td>
                          <td data-label="Target progress" className="w-[32%] py-3 pr-4">
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
                          <td data-label="Achieved" className="py-3 pr-4 text-right font-medium tabular-nums">{inr(b.achieved)}</td>
                          <td data-label="Target" className="py-3 pr-4 text-right tabular-nums text-gray-400">{b.target > 0 ? inr(b.target) : '—'}</td>
                          <td data-label="Calls" className="py-3 pr-4 text-right tabular-nums">{b.calls.toLocaleString('en-IN')}</td>
                          <td data-label="Deals" className="py-3 pr-4 text-right tabular-nums">{b.deals}</td>
                          <td data-label="Team" className="py-3 text-right tabular-nums text-gray-400">{b.team}</td>
                        </tr>
                      )
                    })}
                    {branchRows.length === 0 && (
                      <tr><td data-label="" colSpan={7} className="py-8 text-center text-gray-500">No branches yet.</td></tr>
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

      {/* ---------- incentive, at the very bottom of the Target tab ----------
          Kept to the Target tab because it is money against target; on
          Activity (calls, leads) or Branches it would be out of place.
          It reads confirmed projects for the period chosen above. */}
      {selfResolved && tab === 'target' && (
        <div className="mt-8">
          <IncentiveCard from={range.from} to={range.to} userId={userId !== 'all' ? userId : null} />
        </div>
      )}

      {housePick && (
        <HouseDeals
          pick={housePick}
          from={range.from}
          to={range.to}
          branchId={branchId}
          onClose={() => setHousePick(null)}
        />
      )}
    </div>
  )
}

// The deals behind one House line — opened from its "N deals" button.
function HouseDeals({
  pick, from, to, branchId, onClose,
}: {
  pick: { uid: string; name: string }
  from: string
  to: string
  branchId: string
  onClose: () => void
}) {
  const [rows, setRows] = useState<{
    id: string; project_code: string; title: string
    customer_name: string; amount: number; booked_on: string
  }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.rpc('sales_house_deals', {
        p_uid: pick.uid,
        p_from: from,
        p_to: to,
        p_branch: branchId === 'all' ? null : branchId,
      })
      if (!alive) return
      setRows((data ?? []) as typeof rows)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [pick.uid, from, to, branchId])

  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const dt = (d: string) =>
    new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

  return (
    <div
      className={`${SHEET_BACKDROP} backdrop-blur-sm`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={sheetPanel({
          width: 'sm:max-w-lg',
          round: 'sm:rounded-xl',
          border: 'sm:border sm:border-[#2a2a2a]',
          bg: 'bg-[#161616]',
          extra: 'shadow-2xl',
        })}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#242424] px-4 py-3.5 sm:px-5 sm:py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">{pick.name} · Company (House) deals</h3>
            <p className="mt-0.5 text-xs text-gray-500">Confirmed deals not credited to any sales person.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md text-gray-500 hover:text-white sm:mr-0 sm:h-auto sm:w-auto sm:p-1">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No deals in this period.</p>
          ) : (
            <ul className="divide-y divide-[#222]">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-white">{r.title}</p>
                    <p className="truncate text-xs text-gray-500">
                      <span className="font-mono">{r.project_code}</span> · {r.customer_name} · {dt(r.booked_on)}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-gray-200">{inr(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t border-[#242424] px-4 py-3 text-sm sm:px-5">
            <span className="text-gray-400">{rows.length} deal{rows.length === 1 ? '' : 's'}</span>
            <span className="font-semibold tabular-nums text-white">{inr(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}