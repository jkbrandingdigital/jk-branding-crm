import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react'
import AdminLayout from '../../components/AdminLayout'
import IncentiveRates from '../../components/sales/IncentiveRates'
import { supabase } from '../../lib/supabase'
import { istDate, addDays, addMonths, inr } from '../../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../../lib/targets'

/*
  Sales Targets — the branch figure, and the split that follows it.

  The split used to be read-only here: it listed whoever already had a
  target and gave no way to set one. So a branch target could be entered
  and then sit there, handed to nobody, with nothing on the screen
  admitting it.

  Now every sales person in the branch has a box, and so does the branch
  manager. A manager who takes 30L, gives 10L and 10L to two people and
  keeps the last 10L is doing the ordinary thing — they sell too — and
  before this there was no row for them to put it in. Their own ten lakh
  simply vanished from every total in the CRM.

  The leftover is worked out from what is typed, not from what is saved,
  so it moves while the split is being made rather than after it.
*/

type Branch = { id: string; name: string }
type Person = { id: string; name: string; branchId: string | null; isManager: boolean }
type BranchRow = {
  branch: Branch
  target: number | null
  achieved: number
  people: Person[]
}

export default function SalesTargets() {
  const today = istDate()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [rows, setRows] = useState<BranchRow[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})        // branch id -> amount
  const [empInputs, setEmpInputs] = useState<Record<string, string>>({})  // user id   -> amount
  const [empSaved, setEmpSaved] = useState<Record<string, number>>({})    // user id   -> amount on file
  const [achievedBy, setAchievedBy] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const from = monthFirst(ym)
    const to = monthLast(ym)

    const [b, bt, et, p, ur] = await Promise.all([
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('branch_targets').select('branch_id, target_amount').eq('month', from),
      supabase.from('employee_targets').select('user_id, target_amount').eq('month', from),
      supabase.from('profiles').select('id, full_name, branch_id, is_active').order('full_name'),
      supabase.from('user_roles').select('user_id, role').in('role', ['sales', 'branch_manager']),
    ])
    const firstError = b.error ?? bt.error ?? et.error ?? p.error ?? ur.error
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

    const branchAchieved = new Map<string, number>()
    const userAchieved: Record<string, number> = {}
    for (const r of reports) {
      const v = Number(r.revenue ?? 0)
      if (r.branch_id) branchAchieved.set(r.branch_id, (branchAchieved.get(r.branch_id) ?? 0) + v)
      userAchieved[r.user_id] = (userAchieved[r.user_id] ?? 0) + v
    }

    /*
      Who gets a box.

      Anyone who sells: role sales, or role branch_manager. The manager
      is marked, so nobody has to work out why their own boss is in the
      list.
    */
    const managerIds = new Set((ur.data ?? []).filter((x) => x.role === 'branch_manager').map((x) => x.user_id))
    const sellerIds = new Set((ur.data ?? []).map((x) => x.user_id))
    const people: Person[] = (p.data ?? [])
      .filter((x) => x.is_active !== false && sellerIds.has(x.id))
      .map((x) => ({
        id: x.id,
        name: x.full_name || 'Unnamed',
        branchId: x.branch_id,
        isManager: managerIds.has(x.id),
      }))

    const saved: Record<string, number> = {}
    for (const t of et.data ?? []) saved[t.user_id] = Number(t.target_amount)

    const next: BranchRow[] = (b.data ?? []).map((branch) => ({
      branch,
      target: (() => {
        const t = (bt.data ?? []).find((x) => x.branch_id === branch.id)
        return t ? Number(t.target_amount) : null
      })(),
      achieved: branchAchieved.get(branch.id) ?? 0,
      // The manager first: they are the one doing the splitting.
      people: people
        .filter((x) => x.branchId === branch.id)
        .sort((a, c) => Number(c.isManager) - Number(a.isManager) || a.name.localeCompare(c.name)),
    }))

    setRows(next)
    setEmpSaved(saved)
    setAchievedBy(userAchieved)
    setInputs(Object.fromEntries(next.map((r) => [r.branch.id, r.target == null ? '' : String(r.target)])))
    setEmpInputs(Object.fromEntries(people.map((x) => [x.id, saved[x.id] ? String(saved[x.id]) : ''])))
    setLoading(false)
  }, [ym])

  useEffect(() => {
    setMessage(null)
    load()
  }, [load])

  // What has been typed into a branch's team boxes, right now
  const typedFor = useCallback(
    (r: BranchRow) => r.people.reduce((s, x) => s + (Number(empInputs[x.id]) || 0), 0),
    [empInputs],
  )

  async function handleSave() {
    setMessage(null)

    const branchChanges = rows
      .filter((r) => inputs[r.branch.id] !== '' && Number(inputs[r.branch.id]) !== r.target)
      .map((r) => ({ branch_id: r.branch.id, month: monthFirst(ym), target_amount: Number(inputs[r.branch.id]) }))

    // An emptied box means "no target", which is not the same as a target
    // of zero: zero would park the person at 0% in the red for ever. The
    // RPC deletes the row for anything that is not above zero.
    const empChanges = rows
      .flatMap((r) => r.people)
      .map((x) => ({ user: x.id, amount: empInputs[x.id] === '' ? 0 : Number(empInputs[x.id]) }))
      .filter((c) => c.amount !== (empSaved[c.user] ?? 0))

    if (branchChanges.some((c) => !(c.target_amount >= 0))) {
      return setMessage({ type: 'error', text: 'Enter a valid amount for every branch.' })
    }
    if (empChanges.some((c) => !(c.amount >= 0))) {
      return setMessage({ type: 'error', text: 'Enter a valid amount for every person.' })
    }
    if (branchChanges.length === 0 && empChanges.length === 0) {
      return setMessage({ type: 'error', text: 'Nothing changed.' })
    }

    setSaving(true)

    if (branchChanges.length > 0) {
      const { error } = await supabase.from('branch_targets').upsert(branchChanges, { onConflict: 'branch_id,month' })
      if (error) {
        setSaving(false)
        return setMessage({ type: 'error', text: error.message })
      }
    }

    // One call each. There are a handful of people, and a single failure
    // then names the person it failed on instead of losing the lot.
    for (const c of empChanges) {
      const { error } = await supabase.rpc('set_employee_target', {
        p_user: c.user,
        p_month: monthFirst(ym),
        p_amount: c.amount,
      })
      if (error) {
        setSaving(false)
        const who = rows.flatMap((r) => r.people).find((x) => x.id === c.user)?.name ?? 'Someone'
        return setMessage({ type: 'error', text: `${who}: ${error.message}` })
      }
    }

    setSaving(false)
    setMessage({ type: 'success', text: `Targets saved for ${monthTitle(ym)}.` })
    load()
  }

  // Company totals
  const totalTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0)
  const totalAchieved = rows.reduce((s, r) => s + r.achieved, 0)
  const totalPct = pctOf(totalAchieved, totalTarget)
  const totalZone = zoneOf(totalPct)
  const totalTyped = useMemo(() => rows.reduce((s, r) => s + typedFor(r), 0), [rows, typedFor])

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
            <p className="mt-1 text-sm text-gray-400">
              Set each branch’s monthly target, then open Team to split it — the branch manager included.
            </p>
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
                {totalTarget > 0 && totalTarget - totalTyped >= 1 && (
                  <p className="mt-1 text-sm text-amber-300">{inr(totalTarget - totalTyped)} not handed to anyone yet</p>
                )}
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
              const branchTarget = Number(inputs[r.branch.id]) || 0
              const typed = typedFor(r)
              const left = branchTarget - typed
              const expanded = open === r.branch.id

              return (
                <section key={r.branch.id} className="rounded-2xl border border-[#242424] bg-[#151515]">
                  <div className="grid items-center gap-4 p-5 md:grid-cols-[1.2fr_1fr_2fr_auto]">
                    <div>
                      <p className="font-semibold">{r.branch.name}</p>
                      <p className="mt-0.5 text-xs">
                        {branchTarget <= 0 ? (
                          <span className="text-gray-500">No target yet</span>
                        ) : left > 0 ? (
                          <span className="text-amber-300">{inr(left)} still to split</span>
                        ) : left < 0 ? (
                          <span className="text-red-400">{inr(-left)} over the branch target</span>
                        ) : (
                          <span className="text-green-400">Fully split</span>
                        )}
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
                      Team ({r.people.length})
                      <ChevronDown size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-[#222] px-5 py-4">
                      {r.people.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Nobody in this branch has the Sales or Branch Manager role yet.
                        </p>
                      ) : (
                        <>
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <p className="text-gray-500">
                              Leave a box empty for no target — that is not the same as a target of zero.
                            </p>
                            {branchTarget > 0 && (
                              <p className="tabular-nums text-gray-400">
                                Split {inr(typed)} of {inr(branchTarget)}
                              </p>
                            )}
                          </div>

                          <ul className="space-y-3">
                            {r.people.map((x) => {
                              const target = Number(empInputs[x.id]) || 0
                              const got = achievedBy[x.id] ?? 0
                              const ep = pctOf(got, target)
                              const ez = zoneOf(ep)
                              return (
                                <li key={x.id} className="grid items-center gap-3 text-sm sm:grid-cols-[1.3fr_1fr_1.6fr]">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate">{x.name}</span>
                                    {x.isManager && (
                                      <span className="shrink-0 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-400">
                                        Manager
                                      </span>
                                    )}
                                  </span>

                                  <input
                                    type="number"
                                    min={0}
                                    value={empInputs[x.id] ?? ''}
                                    onChange={(e) => setEmpInputs((s) => ({ ...s, [x.id]: e.target.value }))}
                                    placeholder="No target"
                                    aria-label={`Target for ${x.name}`}
                                    className={inputCls}
                                  />

                                  <div>
                                    <div className="flex justify-between text-xs text-gray-400">
                                      <span>{target > 0 ? `${inr(got)} of ${inr(target)}` : inr(got)}</span>
                                      {target > 0 && <span className={ez.text}>{ep.toFixed(0)}%</span>}
                                    </div>
                                    {target > 0 ? <ZoneBar pct={ep} thin /> : <div className="mt-2 h-1.5 rounded-full bg-[#222]" />}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          {/* What the month pays above target.

              Below the split rather than above it, because it is
              company policy and barely changes, while the split is the
              monthly work this page exists for.

              It is deliberately NOT part of "Save targets": a rate
              saves the moment it is typed. Two save behaviours in one
              screen is a trap, so the panel says so on itself rather
              than relying on anyone noticing. */}
          <div className="mt-6">
            <IncentiveRates />
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