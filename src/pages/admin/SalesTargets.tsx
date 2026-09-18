import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'
import AdminLayout from '../../components/AdminLayout'
import { supabase } from '../../lib/supabase'
import { istDate, addDays, addMonths, inr } from '../../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../../lib/targets'

type Branch = { id: string; name: string }
type Person = { id: string; full_name: string | null; branch_id: string | null }
type EmpRow = { userId: string; name: string; target: number; achieved: number }
type BranchRow = { branch: Branch; target: number | null; achieved: number; allocated: number; employees: EmpRow[] }

export default function SalesTargets() {
  const today = istDate()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [rows, setRows] = useState<BranchRow[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const from = monthFirst(ym)
    const to = monthLast(ym)

    const [b, bt, et, p] = await Promise.all([
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('branch_targets').select('branch_id, target_amount').eq('month', from),
      supabase.from('employee_targets').select('user_id, branch_id, target_amount').eq('month', from),
      supabase.from('profiles').select('id, full_name, branch_id'),
    ])
    const firstError = b.error ?? bt.error ?? et.error ?? p.error
    if (firstError) {
      setMessage({ type: 'error', text: firstError.message })
      setLoading(false)
      return
    }

    // Revenue for the month (page through, max 1000 rows per request)
    const reports: { user_id: string; branch_id: string | null; revenue: number | null }[] = []
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase
        .from('daily_reports')
        .select('user_id, branch_id, revenue')
        .gte('work_date', from)
        .lte('work_date', to)
        .range(start, start + 999)
      if (error) {
        setMessage({ type: 'error', text: error.message })
        break
      }
      reports.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }

    const people = new Map<string, Person>((p.data ?? []).map((x) => [x.id, x]))
    const branchAchieved = new Map<string, number>()
    const userAchieved = new Map<string, number>()
    for (const r of reports) {
      const v = Number(r.revenue ?? 0)
      if (r.branch_id) branchAchieved.set(r.branch_id, (branchAchieved.get(r.branch_id) ?? 0) + v)
      userAchieved.set(r.user_id, (userAchieved.get(r.user_id) ?? 0) + v)
    }

    const next: BranchRow[] = (b.data ?? []).map((branch) => {
      const t = (bt.data ?? []).find((x) => x.branch_id === branch.id)
      const emps = (et.data ?? []).filter((x) => x.branch_id === branch.id)
      return {
        branch,
        target: t ? Number(t.target_amount) : null,
        achieved: branchAchieved.get(branch.id) ?? 0,
        allocated: emps.reduce((s, x) => s + Number(x.target_amount), 0),
        employees: emps
          .map((x) => ({
            userId: x.user_id,
            name: people.get(x.user_id)?.full_name || 'Unnamed',
            target: Number(x.target_amount),
            achieved: userAchieved.get(x.user_id) ?? 0,
          }))
          .sort((a, c) => pctOf(c.achieved, c.target) - pctOf(a.achieved, a.target)),
      }
    })

    setRows(next)
    setInputs(Object.fromEntries(next.map((r) => [r.branch.id, r.target == null ? '' : String(r.target)])))
    setLoading(false)
  }, [ym])

  useEffect(() => {
    setMessage(null)
    load()
  }, [load])

  async function handleSave() {
    setMessage(null)
    const changed = rows
      .filter((r) => inputs[r.branch.id] !== '' && Number(inputs[r.branch.id]) !== r.target)
      .map((r) => ({ branch_id: r.branch.id, month: monthFirst(ym), target_amount: Number(inputs[r.branch.id]) }))

    if (changed.some((c) => !(c.target_amount >= 0))) return setMessage({ type: 'error', text: 'Enter a valid amount for every branch.' })
    if (changed.length === 0) return setMessage({ type: 'error', text: 'Nothing changed.' })

    setSaving(true)
    const { error } = await supabase.from('branch_targets').upsert(changed, { onConflict: 'branch_id,month' })
    setSaving(false)
    if (error) return setMessage({ type: 'error', text: error.message })
    setMessage({ type: 'success', text: `Targets saved for ${monthTitle(ym)}.` })
    load()
  }

  // Company totals
  const totalTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0)
  const totalAchieved = rows.reduce((s, r) => s + r.achieved, 0)
  const totalPct = pctOf(totalAchieved, totalTarget)
  const totalZone = zoneOf(totalPct)

  // Days left (only for the current month)
  const isCurrent = ym === today.slice(0, 7)
  let daysLeft = 0
  if (isCurrent) for (let d = today; d <= monthLast(ym); d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) daysLeft++

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none tabular-nums'

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl">
        {/* Title + month switcher */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sales Targets</h1>
            <p className="mt-1 text-sm text-gray-400">Set a monthly target for every branch. Branch managers split it among their team.</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            <button onClick={() => setYm(addMonths(ym, -1))} className="rounded-md p-1.5 text-gray-400 hover:text-white" aria-label="Previous month">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium">{monthTitle(ym)}</span>
            <button onClick={() => setYm(addMonths(ym, 1))} className="rounded-md p-1.5 text-gray-400 hover:text-white" aria-label="Next month">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </div>
        )}

        <div className={loading ? 'opacity-50' : ''}>
          {/* Company summary */}
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-gray-400">Company achieved</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-orange-500">{inr(totalAchieved)}</p>
                <p className="mt-1 text-sm text-gray-400">of {totalTarget > 0 ? inr(totalTarget) : 'no target set'}</p>
              </div>
              {totalTarget > 0 && (
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-xs ${totalZone.chip}`}>{totalZone.label}</span>
                  <p className={`mt-2 text-3xl font-semibold tabular-nums ${totalZone.text}`}>{totalPct.toFixed(0)}%</p>
                  {isCurrent && <p className="text-xs text-gray-500">{daysLeft} working days left</p>}
                </div>
              )}
            </div>
            {totalTarget > 0 && <ZoneBar pct={totalPct} />}
          </section>

          {/* Branch rows */}
          <div className="mt-6 space-y-3">
            {rows.map((r) => {
              const pct = pctOf(r.achieved, r.target ?? 0)
              const zone = zoneOf(pct)
              const unallocated = (r.target ?? 0) - r.allocated
              const expanded = open === r.branch.id
              return (
                <section key={r.branch.id} className="rounded-2xl border border-[#242424] bg-[#151515]">
                  <div className="grid items-center gap-4 p-5 md:grid-cols-[1.2fr_1fr_2fr_auto]">
                    <div>
                      <p className="font-semibold">{r.branch.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {r.target == null
                          ? 'No target yet'
                          : unallocated > 0
                            ? `${inr(unallocated)} not yet split to employees`
                            : 'Fully split to employees'}
                      </p>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Monthly target (₹)</span>
                      <input
                        type="number"
                        min={0}
                        value={inputs[r.branch.id] ?? ''}
                        onChange={(e) => setInputs((s) => ({ ...s, [r.branch.id]: e.target.value }))}
                        placeholder="e.g. 500000"
                        className={inputCls}
                      />
                    </label>

                    <div>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-gray-400">
                          Achieved <span className="font-medium text-white">{inr(r.achieved)}</span>
                        </span>
                        {r.target != null && r.target > 0 && (
                          <span className={`font-semibold tabular-nums ${zone.text}`}>{pct.toFixed(0)}%</span>
                        )}
                      </div>
                      {r.target != null && r.target > 0 ? <ZoneBar pct={pct} /> : <div className="mt-2 h-2 rounded-full bg-[#222]" />}
                    </div>

                    <button
                      onClick={() => setOpen(expanded ? null : r.branch.id)}
                      className="flex items-center gap-1 justify-self-start rounded-lg px-2 py-1.5 text-sm text-gray-400 hover:bg-[#1a1a1a] hover:text-white md:justify-self-end"
                      aria-expanded={expanded}
                    >
                      Team ({r.employees.length})
                      <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-[#222] px-5 py-4">
                      {r.employees.length === 0 ? (
                        <p className="text-sm text-gray-500">No employee targets yet. The branch manager splits the branch target.</p>
                      ) : (
                        <ul className="space-y-3">
                          {r.employees.map((e) => {
                            const ep = pctOf(e.achieved, e.target)
                            const ez = zoneOf(ep)
                            return (
                              <li key={e.userId} className="grid items-center gap-2 text-sm sm:grid-cols-[1.2fr_2fr_auto]">
                                <span>{e.name}</span>
                                <div>
                                  <div className="flex justify-between text-xs text-gray-400">
                                    <span>
                                      {inr(e.achieved)} of {inr(e.target)}
                                    </span>
                                    <span className={ez.text}>{ep.toFixed(0)}%</span>
                                  </div>
                                  <ZoneBar pct={ep} thin />
                                </div>
                                <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs ${ez.chip}`}>{ez.label}</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-4 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 py-4 backdrop-blur">
            <p className="text-xs text-gray-500">🔴 below 30% · 🟡 30–70% · 🟢 70% and above</p>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
            >
              {saving ? 'Saving…' : 'Save targets'}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

function ZoneBar({ pct, thin = false }: { pct: number; thin?: boolean }) {
  const zone = zoneOf(pct)
  return (
    <div className={`mt-2 overflow-hidden rounded-full bg-[#222] ${thin ? 'h-1.5' : 'h-2'}`}>
      <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}