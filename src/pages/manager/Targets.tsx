import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Divide } from 'lucide-react'
import ManagerLayout from '../../components/ManagerLayout'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, addMonths, inr } from '../../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../../lib/targets'

/*
  Team Targets — the branch manager splits their branch's month.

  The manager is now in their own list.

  They used to be left out, because the list asked for role 'sales' and
  a manager does not have it. But a manager who takes 30L and gives 10L
  and 10L to two people keeps the last 10L and sells it themselves —
  that is the normal shape of a branch. With no row to put it in, their
  ten lakh existed nowhere: not in the split, not in any target total,
  and not on the performance screen, which had the same omission.

  Saving goes through set_employee_target rather than an upsert. Two
  reasons: the function holds the rule about who may set whose target,
  in one place instead of three screens; and it does update-then-insert,
  so it does not depend on guessing which unique constraint the table
  carries.
*/

type Member = { id: string; name: string; saved: number | null; achieved: number; isManager: boolean }

export default function ManagerTargets() {
  const today = istDate()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [meId, setMeId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [branchTarget, setBranchTarget] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // My branch
  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      setMeId(user.id)
      try {
        const p = await getUserProfile(user.id)
        if (!p?.branch_id) {
          setMessage({ type: 'error', text: 'Your profile has no branch. Ask the Super Admin to assign one.' })
          setLoading(false)
          return
        }
        setBranchId(p.branch_id)
        const { data } = await supabase.from('branches').select('name').eq('id', p.branch_id).single()
        setBranchName(data?.name ?? '')
      } catch (e) {
        setMessage({ type: 'error', text: (e as Error).message })
        setLoading(false)
      }
    })()
  }, [])

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    const from = monthFirst(ym)

    const [bt, et, p, roles, reports] = await Promise.all([
      supabase.from('branch_targets').select('target_amount').eq('branch_id', branchId).eq('month', from).maybeSingle(),
      supabase.from('employee_targets').select('user_id, target_amount').eq('branch_id', branchId).eq('month', from),
      supabase.from('profiles').select('id, full_name, is_active').eq('branch_id', branchId).order('full_name'),
      // Branch managers too — they sell as well, and the leftover of the
      // split is usually theirs.
      supabase.from('user_roles').select('user_id, role').in('role', ['sales', 'branch_manager']),
      supabase
        .from('daily_reports')
        .select('user_id, revenue')
        .eq('branch_id', branchId)
        .gte('work_date', from)
        .lte('work_date', monthLast(ym))
        .limit(5000),
    ])
    const firstError = bt.error ?? et.error ?? p.error ?? reports.error
    if (firstError) {
      setMessage({ type: 'error', text: firstError.message })
      setLoading(false)
      return
    }

    const managerIds = new Set((roles.data ?? []).filter((r) => r.role === 'branch_manager').map((r) => r.user_id))
    const sellerIds = new Set((roles.data ?? []).map((r) => r.user_id))
    const saved = new Map((et.data ?? []).map((t) => [t.user_id, Number(t.target_amount)]))
    const achieved = new Map<string, number>()
    for (const r of reports.data ?? []) achieved.set(r.user_id, (achieved.get(r.user_id) ?? 0) + Number(r.revenue ?? 0))

    const list: Member[] = (p.data ?? [])
      .filter((x) => x.is_active !== false && sellerIds.has(x.id))
      .map((x) => ({
        id: x.id,
        name: x.full_name || 'Unnamed',
        saved: saved.get(x.id) ?? null,
        achieved: achieved.get(x.id) ?? 0,
        isManager: managerIds.has(x.id),
      }))
      // Manager at the top — it is their split, and their own row is the
      // one they are most likely to forget.
      .sort((a, c) => Number(c.isManager) - Number(a.isManager) || a.name.localeCompare(c.name))

    setBranchTarget(bt.data ? Number(bt.data.target_amount) : null)
    setMembers(list)
    setInputs(Object.fromEntries(list.map((m) => [m.id, m.saved == null ? '' : String(m.saved)])))
    setLoading(false)
  }, [branchId, ym])

  useEffect(() => {
    setMessage(null)
    load()
  }, [load])

  // Live totals
  const allocated = members.reduce((s, m) => s + (Number(inputs[m.id]) || 0), 0)
  const remaining = (branchTarget ?? 0) - allocated
  const over = remaining < 0

  function splitEqually() {
    if (!branchTarget || members.length === 0) return
    const each = Math.floor(branchTarget / members.length)
    const extra = branchTarget - each * members.length
    setInputs(Object.fromEntries(members.map((m, i) => [m.id, String(each + (i === 0 ? extra : 0))])))
  }

  async function handleSave() {
    if (!branchId) return
    setMessage(null)
    if (over) return setMessage({ type: 'error', text: `You have split ${inr(-remaining)} more than the branch target.` })

    const changes: { m: Member; amount: number }[] = []
    let bad = false
    for (const m of members) {
      const raw = inputs[m.id]
      if (raw === '' && m.saved == null) continue
      // An emptied box means no target at all, which the function turns
      // into a deleted row. A target of zero would hold the person at 0%
      // in the red for the whole month.
      const amount = raw === '' ? 0 : Number(raw)
      if (!(amount >= 0)) bad = true
      else if (amount !== m.saved) changes.push({ m, amount })
    }

    if (bad) return setMessage({ type: 'error', text: 'Enter a valid amount for everyone.' })
    if (changes.length === 0) return setMessage({ type: 'error', text: 'Nothing changed.' })

    // Reductions first, so the branch total is never briefly exceeded
    // part-way through the save.
    const down = changes.filter((c) => c.amount < (c.m.saved ?? 0))
    const up = changes.filter((c) => c.amount >= (c.m.saved ?? 0))

    setSaving(true)
    for (const batch of [down, up]) {
      for (const c of batch) {
        const { error } = await supabase.rpc('set_employee_target', {
          p_user: c.m.id,
          p_month: monthFirst(ym),
          p_amount: c.amount,
        })
        if (error) {
          setSaving(false)
          return setMessage({ type: 'error', text: `${c.m.name}: ${error.message}` })
        }
      }
    }
    setSaving(false)
    setMessage({ type: 'success', text: `Team targets saved for ${monthTitle(ym)}.` })
    load()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none tabular-nums'

  return (
    <ManagerLayout>
      <div className="mx-auto max-w-5xl">
        {/* Title + month */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Team Targets</h1>
            <p className="mt-1 text-sm text-gray-400">
              Split {branchName ? `${branchName}’s` : 'your branch'} monthly target — your own share included.
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
          {branchTarget == null ? (
            <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-8 text-center">
              <p className="font-medium">No branch target for {monthTitle(ym)} yet</p>
              <p className="mt-1 text-sm text-gray-400">Once the Super Admin sets it, you can split it here.</p>
            </section>
          ) : (
            <>
              {/* Allocation summary */}
              <section className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-3">
                <div className="bg-[#151515] px-5 py-4">
                  <p className="text-xs text-gray-400">Branch target</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{inr(branchTarget)}</p>
                </div>
                <div className="bg-[#151515] px-5 py-4">
                  <p className="text-xs text-gray-400">Split to team</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{inr(allocated)}</p>
                </div>
                <div className="bg-[#151515] px-5 py-4">
                  <p className="text-xs text-gray-400">{over ? 'Over the target by' : 'Left to split'}</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${over ? 'text-red-400' : remaining === 0 ? 'text-green-400' : 'text-orange-400'}`}>
                    {inr(Math.abs(remaining))}
                  </p>
                </div>
              </section>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#222]">
                <div
                  className={`h-full rounded-full ${over ? 'bg-red-500' : remaining === 0 ? 'bg-green-500' : 'bg-orange-500'}`}
                  style={{ width: `${Math.min((allocated / branchTarget) * 100, 100)}%` }}
                />
              </div>

              {/* Team list */}
              <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-300">Who sells ({members.length})</h2>
                  {members.length > 0 && (
                    <button
                      onClick={splitEqually}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-orange-400 hover:bg-orange-500/10"
                    >
                      <Divide size={15} /> Split equally
                    </button>
                  )}
                </div>

                {members.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">Nobody in your branch sells yet.</p>
                ) : (
                  <ul className="divide-y divide-[#222]">
                    {members.map((m) => {
                      const target = Number(inputs[m.id]) || 0
                      const pct = pctOf(m.achieved, target)
                      const zone = zoneOf(pct)
                      const share = branchTarget > 0 ? (target / branchTarget) * 100 : 0
                      return (
                        <li key={m.id} className="grid items-center gap-3 py-3 text-sm sm:grid-cols-[1.4fr_180px_1.6fr]">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-medium">
                              <span className="truncate">{m.name}</span>
                              {/* "You" only when it really is. A branch with
                                  two managers would otherwise label the
                                  wrong person. */}
                              {m.isManager && (
                                <span className="shrink-0 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-400">
                                  {m.id === meId ? 'You' : 'Manager'}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">{share.toFixed(0)}% of branch target</p>
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={inputs[m.id] ?? ''}
                            onChange={(e) => setInputs((s) => ({ ...s, [m.id]: e.target.value }))}
                            placeholder="No target"
                            className={inputCls}
                            aria-label={`Target for ${m.name}`}
                          />
                          <div>
                            {target > 0 ? (
                              <>
                                <div className="flex justify-between text-xs text-gray-400">
                                  <span>Achieved {inr(m.achieved)}</span>
                                  <span className={zone.text}>
                                    {pct.toFixed(0)}% · {zone.label.replace(' zone', '')}
                                  </span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#222]">
                                  <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </>
                            ) : (
                              <p className="text-xs text-gray-500">Achieved {inr(m.achieved)} · no target</p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-4 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 py-4 backdrop-blur">
                <p className="text-xs text-gray-500">The total can’t go above the branch target. An empty box means no target.</p>
                <button
                  onClick={handleSave}
                  disabled={saving || loading || over}
                  className="rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  {saving ? 'Saving…' : 'Save team targets'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ManagerLayout>
  )
}