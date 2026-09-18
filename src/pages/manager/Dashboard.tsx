import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import ManagerLayout from '../../components/ManagerLayout'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, addDays, inr } from '../../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../../lib/targets'

type Member = {
  id: string
  name: string
  target: number
  achieved: number
  calls: number
  deals: number
  evolutionToday: boolean
  reportToday: boolean
}

export default function ManagerDashboard() {
  const today = istDate()
  const ym = today.slice(0, 7)

  const [branchName, setBranchName] = useState('')
  const [branchTarget, setBranchTarget] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      let branchId: string | null = null
      try {
        branchId = (await getUserProfile(user.id))?.branch_id ?? null
      } catch {
        /* handled below */
      }
      if (!branchId) {
        setError('Your profile has no branch. Ask the Super Admin to assign one.')
        setLoading(false)
        return
      }

      const [b, bt, et, p, roles, reports, evo] = await Promise.all([
        supabase.from('branches').select('name').eq('id', branchId).single(),
        supabase.from('branch_targets').select('target_amount').eq('branch_id', branchId).eq('month', monthFirst(ym)).maybeSingle(),
        supabase.from('employee_targets').select('user_id, target_amount').eq('branch_id', branchId).eq('month', monthFirst(ym)),
        supabase.from('profiles').select('id, full_name, is_active').eq('branch_id', branchId),
        supabase.from('user_roles').select('user_id').eq('role', 'sales'),
        supabase
          .from('daily_reports')
          .select('user_id, work_date, revenue, calls, deals_closed')
          .eq('branch_id', branchId)
          .gte('work_date', monthFirst(ym))
          .lte('work_date', monthLast(ym))
          .limit(5000),
        supabase.from('daily_evolution').select('user_id').eq('branch_id', branchId).eq('evolution_date', today),
      ])

      const firstError = b.error ?? bt.error ?? et.error ?? p.error ?? reports.error ?? evo.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setBranchName(b.data?.name ?? '')
      setBranchTarget(bt.data ? Number(bt.data.target_amount) : null)

      const salesIds = new Set((roles.data ?? []).map((r) => r.user_id))
      const targets = new Map((et.data ?? []).map((t) => [t.user_id, Number(t.target_amount)]))
      const evoToday = new Set((evo.data ?? []).map((e) => e.user_id))

      const list: Member[] = (p.data ?? [])
        .filter((x) => x.is_active !== false && salesIds.has(x.id))
        .map((x) => {
          const rs = (reports.data ?? []).filter((r) => r.user_id === x.id)
          return {
            id: x.id,
            name: x.full_name || 'Unnamed',
            target: targets.get(x.id) ?? 0,
            achieved: rs.reduce((s, r) => s + Number(r.revenue ?? 0), 0),
            calls: rs.reduce((s, r) => s + Number(r.calls ?? 0), 0),
            deals: rs.reduce((s, r) => s + Number(r.deals_closed ?? 0), 0),
            evolutionToday: evoToday.has(x.id),
            reportToday: rs.some((r) => r.work_date === today),
          }
        })
        .sort((a, c) => pctOf(c.achieved, c.target) - pctOf(a.achieved, a.target) || c.achieved - a.achieved)

      setMembers(list)
      setLoading(false)
    })()
  }, [today, ym])

  const achieved = members.reduce((s, m) => s + m.achieved, 0)
  const allocated = members.reduce((s, m) => s + m.target, 0)
  const pct = pctOf(achieved, branchTarget ?? 0)
  const zone = zoneOf(pct)

  let daysLeft = 0
  for (let d = today; d <= monthLast(ym); d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) daysLeft++
  const remaining = Math.max((branchTarget ?? 0) - achieved, 0)
  const perDay = daysLeft > 0 ? remaining / daysLeft : 0

  const evoCount = members.filter((m) => m.evolutionToday).length
  const reportCount = members.filter((m) => m.reportToday).length

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold">{branchName ? `${branchName} Branch` : 'Branch Dashboard'}</h1>
        <p className="mt-1 text-sm text-gray-400">{monthTitle(ym)} · your team at a glance</p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className={loading ? 'opacity-50' : ''}>
          {/* Branch target */}
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-6">
            {branchTarget == null ? (
              <p className="text-sm text-gray-400">The Super Admin has not set this month’s target for your branch yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Branch achieved</p>
                    <p className="mt-1 text-4xl font-bold tracking-tight text-orange-500">{inr(achieved)}</p>
                    <p className="mt-1 text-sm text-gray-400">of {inr(branchTarget)}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-3 py-1 text-xs ${zone.chip}`}>{zone.label}</span>
                    <p className={`mt-2 text-3xl font-semibold tabular-nums ${zone.text}`}>{pct.toFixed(0)}%</p>
                  </div>
                </div>
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
          </section>

          {/* Today */}
          <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424]">
            <div className="bg-[#151515] px-5 py-4">
              <p className="text-xs text-gray-400">Evolution forms today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {evoCount} / {members.length}
              </p>
            </div>
            <div className="bg-[#151515] px-5 py-4">
              <p className="text-xs text-gray-400">Daily reports today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {reportCount} / {members.length}
              </p>
            </div>
          </section>

          {/* Team */}
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <h2 className="mb-4 text-sm font-medium text-gray-300">Team this month</h2>
            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No sales employees in your branch yet.</p>
            ) : (
              <ul className="divide-y divide-[#222]">
                {members.map((m) => {
                  const mp = pctOf(m.achieved, m.target)
                  const mz = zoneOf(mp)
                  return (
                    <li key={m.id} className="grid items-center gap-3 py-3 text-sm md:grid-cols-[1.3fr_2fr_auto_auto]">
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-gray-500">
                          {m.calls} calls · {m.deals} deals
                        </p>
                      </div>
                      <div>
                        {m.target > 0 ? (
                          <>
                            <div className="flex justify-between text-xs text-gray-400">
                              <span>
                                {inr(m.achieved)} of {inr(m.target)}
                              </span>
                              <span className={mz.text}>{mp.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#222]">
                              <div className={`h-full rounded-full ${mz.bar}`} style={{ width: `${Math.min(mp, 100)}%` }} />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">
                            {inr(m.achieved)} achieved · no target yet
                          </p>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-400">
                        <Status done={m.evolutionToday} label="Evolution" />
                        <Status done={m.reportToday} label="Report" />
                      </div>
                      {m.target > 0 ? (
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