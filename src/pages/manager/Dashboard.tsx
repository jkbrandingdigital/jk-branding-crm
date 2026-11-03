import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import ManagerLayout from '../../components/ManagerLayout'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, addDays, inr } from '../../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../../lib/targets'

/*
  The branch manager's dashboard.

  Money comes from CONFIRMED deals, the same source the Sales Performance
  screen reads — not from daily reports. The old version summed
  daily_reports.revenue, which nobody fills in, so a branch with real
  confirmed sales showed ₹0, and the manager's own deals never counted
  because the team list was built from the 'sales' role, which a manager
  does not carry. sales_target_performance() already credits a manager's
  own sales and puts them in the list, so the manager and their deals
  show up like anyone else's.

  Day / week / month: the whole picture follows one period, so the deals
  can be read a day, a week or a month at a time. The branch target is
  monthly, so the target line and its colour show only on the month view;
  the other periods show what came in, without a percentage that would be
  measured against the wrong yardstick.
*/

type Period = 'today' | 'week' | 'month'

type Member = {
  id: string
  name: string
  isManager: boolean
  target: number
  achieved: number   // confirmed revenue in the chosen period
  deals: number       // confirmed deals in the chosen period
  calls: number
  evolutionToday: boolean
  reportToday: boolean
}

type PerfRow = {
  user_id: string
  full_name: string | null
  is_manager: boolean
  target_amount: number | null
  confirmed: number | null
  confirmed_deals: number | null
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
]

// The office week starts Monday. Month runs from the 1st to today.
function rangeOf(period: Period, today: string): { from: string; to: string } {
  if (period === 'today') return { from: today, to: today }
  if (period === 'week') {
    const back = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7
    return { from: addDays(today, -back), to: today }
  }
  return { from: monthFirst(today.slice(0, 7)), to: today }
}

export default function ManagerDashboard() {
  const today = istDate()
  const ym = today.slice(0, 7)

  const [period, setPeriod] = useState<Period>('month')
  const [branchName, setBranchName] = useState('')
  const [branchTarget, setBranchTarget] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  // Company (House): branch deals that are nobody's sale — added back so the
  // branch total reconciles (sales + House).
  const [houseAmt, setHouseAmt] = useState(0)
  const [houseDeals, setHouseDeals] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const range = useMemo(() => rangeOf(period, today), [period, today])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)

      const user = await getCurrentUser()
      if (!user) return
      let branchId: string | null = null
      try {
        branchId = (await getUserProfile(user.id))?.branch_id ?? null
      } catch {
        /* handled below */
      }
      if (!branchId) {
        if (alive) { setError('Your profile has no branch. Ask the Super Admin to assign one.'); setLoading(false) }
        return
      }

      const [b, bt, perf, reports, evo, hs] = await Promise.all([
        supabase.from('branches').select('name').eq('id', branchId).single(),
        supabase.from('branch_targets').select('target_amount')
          .eq('branch_id', branchId).eq('month', monthFirst(ym)).maybeSingle(),
        // Confirmed money per person — managers included, with their own sales.
        supabase.rpc('sales_target_performance', { p_from: range.from, p_to: range.to, p_branch: branchId }),
        // Calls and "did they report" are still an activity record, so they
        // stay with the daily reports.
        supabase.from('daily_reports').select('user_id, work_date, calls')
          .eq('branch_id', branchId).gte('work_date', range.from).lte('work_date', range.to).limit(5000),
        supabase.from('daily_evolution').select('user_id').eq('branch_id', branchId).eq('evolution_date', today),
        // Company (House) — branch deals credited to nobody on the sales roster.
        supabase.rpc('sales_house', { p_from: range.from, p_to: range.to, p_branch: branchId }),
      ])

      const firstError = b.error ?? bt.error ?? perf.error ?? reports.error ?? evo.error ?? hs.error
      if (firstError) {
        if (alive) { setError(firstError.message); setLoading(false) }
        return
      }
      if (!alive) return

      setBranchName(b.data?.name ?? '')
      setBranchTarget(bt.data ? Number(bt.data.target_amount) : null)

      const callsBy = new Map<string, number>()
      const reportedToday = new Set<string>()
      for (const r of reports.data ?? []) {
        callsBy.set(r.user_id, (callsBy.get(r.user_id) ?? 0) + Number(r.calls ?? 0))
        if (r.work_date === today) reportedToday.add(r.user_id)
      }
      const evoToday = new Set((evo.data ?? []).map((e) => e.user_id))

      const list: Member[] = ((perf.data ?? []) as PerfRow[])
        .map((r) => ({
          id: r.user_id,
          name: r.full_name ?? 'Unnamed',
          isManager: r.is_manager,
          target: Number(r.target_amount ?? 0),
          achieved: Number(r.confirmed ?? 0),
          deals: Number(r.confirmed_deals ?? 0),
          calls: callsBy.get(r.user_id) ?? 0,
          evolutionToday: evoToday.has(r.user_id),
          reportToday: reportedToday.has(r.user_id),
        }))
        .sort((a, c) => pctOf(c.achieved, c.target) - pctOf(a.achieved, a.target) || c.achieved - a.achieved)

      setMembers(list)
      const houseRows = (hs.data ?? []) as { amount: number; deals: number }[]
      setHouseAmt(houseRows.reduce((s, r) => s + Number(r.amount ?? 0), 0))
      setHouseDeals(houseRows.reduce((s, r) => s + Number(r.deals ?? 0), 0))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [range, today, ym])

  const achieved = members.reduce((s, m) => s + m.achieved, 0)
  const allocated = members.reduce((s, m) => s + m.target, 0)
  const deals = members.reduce((s, m) => s + m.deals, 0)
  const calls = members.reduce((s, m) => s + m.calls, 0)

  // The target is a monthly figure, so it only frames the month view.
  const isMonth = period === 'month'
  const pct = pctOf(achieved, branchTarget ?? 0)
  const zone = zoneOf(pct)

  let daysLeft = 0
  for (let d = today; d <= monthLast(ym); d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) daysLeft++
  const remaining = Math.max((branchTarget ?? 0) - members.reduce((s, m) => s + m.achieved, 0), 0)
  const perDay = daysLeft > 0 ? remaining / daysLeft : 0

  const evoCount = members.filter((m) => m.evolutionToday).length
  const reportCount = members.filter((m) => m.reportToday).length
  const periodLabel = PERIODS.find((p) => p.key === period)!.label

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{branchName ? `${branchName} Branch` : 'Branch Dashboard'}</h1>
            <p className="mt-1 text-sm text-gray-400">
              {isMonth ? monthTitle(ym) : periodLabel} · confirmed deals
            </p>
          </div>
          {/* Day / week / month */}
          <div className="flex w-fit rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  period === p.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className={loading ? 'opacity-50' : ''}>
          {/* Branch achieved */}
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-gray-400">
                  {isMonth ? 'Branch achieved' : `Confirmed · ${periodLabel.toLowerCase()}`}
                </p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-orange-500">{inr(achieved)}</p>
                <p className="mt-1 text-sm text-gray-400">
                  {isMonth && branchTarget != null ? `of ${inr(branchTarget)}` : `${deals} deal${deals === 1 ? '' : 's'} · ${calls} calls`}
                </p>
                {/* House sits outside the team's target, so it is noted here
                    rather than added into the achieved figure above — it is
                    the company's own, not the team's score. */}
                {houseAmt > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    + Company/House {inr(houseAmt)} · {houseDeals} deal{houseDeals === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              {isMonth && branchTarget != null && (
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-xs ${zone.chip}`}>{zone.label}</span>
                  <p className={`mt-2 text-3xl font-semibold tabular-nums ${zone.text}`}>{pct.toFixed(0)}%</p>
                </div>
              )}
            </div>

            {isMonth && branchTarget != null && (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#222]">
                  <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <p className="text-gray-400">
                    Still needed <span className="block text-base font-semibold text-white">{inr(remaining)}</span>
                  </p>
                  <p className="text-gray-400">
                    Per working day ({daysLeft} left) <span className="block text-base font-semibold text-white">{inr(perDay)}</span>
                  </p>
                  <p className="text-gray-400">
                    Split to team{' '}
                    <span className="block text-base font-semibold text-white">
                      {inr(allocated)}
                      {allocated < branchTarget && (
                        <Link to="/manager/targets" className="ml-2 text-xs font-normal text-orange-400 hover:underline">
                          Split the rest →
                        </Link>
                      )}
                    </span>
                  </p>
                </div>
              </>
            )}

            {isMonth && branchTarget == null && (
              <p className="mt-3 text-sm text-gray-400">The Super Admin has not set this month's target for your branch yet.</p>
            )}

            {/* Reports / Evolution are a today snapshot, whatever the period above. */}
            <div className="mt-5 border-t border-[#242424] pt-4 text-sm text-gray-400">
              Today · Reports {reportCount} · Evolution {evoCount}
              <span className="text-gray-600"> / {members.length}</span>
            </div>
          </section>

          {/* Team */}
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <h2 className="mb-4 text-sm font-medium text-gray-300">
              Team · {isMonth ? 'this month' : periodLabel.toLowerCase()}
            </h2>
            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No sales in your branch for this period yet.</p>
            ) : (
              <ul className="divide-y divide-[#222]">
                {members.map((m) => {
                  const mp = pctOf(m.achieved, m.target)
                  const mz = zoneOf(mp)
                  return (
                    <li key={m.id} className="grid items-center gap-3 py-3 text-sm md:grid-cols-[1.3fr_2fr_auto_auto]">
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          {m.name}
                          {/* The manager sells too, and is in this list for it.
                              Marked so nobody reads it as a sales row. */}
                          {m.isManager && (
                            <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-400">Manager</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{m.calls} calls · {m.deals} deals</p>
                      </div>
                      <div>
                        {isMonth && m.target > 0 ? (
                          <>
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>{inr(m.achieved)} of {inr(m.target)}</span>
                              <span className={mz.text}>{mp.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#222]">
                              <div className={`h-full rounded-full ${mz.bar}`} style={{ width: `${Math.min(mp, 100)}%` }} />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {inr(m.achieved)}{isMonth ? ' achieved · no target yet' : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-400">
                        <Status done={m.evolutionToday} label="Evolution" />
                        <Status done={m.reportToday} label="Report" />
                      </div>
                      {isMonth && m.target > 0 ? (
                        <span className={`w-fit whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${mz.chip}`}>{mz.label}</span>
                      ) : (
                        <span />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ManagerLayout>
  )
}

function Status({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 ${done ? 'text-green-400' : 'text-gray-500'}`}>
      {done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
      {label}
    </span>
  )
}