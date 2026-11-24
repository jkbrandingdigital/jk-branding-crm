// src/components/payroll/SalariesCard.tsx
//
// Everybody's monthly salary, on the Payroll page. Moved here from
// Setup: a salary is only ever used to build a payslip, so the place a
// missing one gets noticed should be the place payslips are built. While
// it sat in Setup, people with no salary quietly got ₹0 payslips and ₹0
// leave until somebody went looking.
//
// Who may see and set it is the database's answer: rules_now() returns
// can_see_pay / can_set_pay, and pay_set refuses on its own anyway. A
// person never sees the button for their own row being refused — the
// server says "You cannot set your own" and that is shown as it is.
//
// Folded to one line when every salary is set; open when one is missing,
// because then it is the thing to do first.

import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { Wallet, AlertTriangle, ChevronDown, Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type PayRow = {
  user_id: string; emp_code: string; full_name: string
  branch: string | null; designation: string | null
  monthly: number | null; day_rate: number | null; updated_at: string | null
}

const rupees = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const SalariesCard = forwardRef<HTMLElement, { onSaved?: () => void }>(function SalariesCard({ onSaved }, ref) {
  const [pay, setPay] = useState<PayRow[]>([])
  const [canSee, setCanSee] = useState(false)
  const [canSet, setCanSet] = useState(false)
  const [open, setOpen] = useState<boolean | null>(null)   // null = not decided yet
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([supabase.rpc('rules_now'), supabase.rpc('pay_list')])
    const rules = r.data as { can_see_pay?: boolean; can_set_pay?: boolean } | null
    setCanSee(!!rules?.can_see_pay)
    setCanSet(!!rules?.can_set_pay)
    const rows = (p.data ?? []) as unknown as PayRow[]
    setPay(rows)
    setOpen((o) => o ?? rows.some((x) => x.monthly === null))
  }, [])

  useEffect(() => { load() }, [load])

  async function save(id: string) {
    setBusy(true)
    setSaid(null)
    const { data, error } = await supabase.rpc('pay_set', { p_user: id, p_monthly: Number(amount) })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    const who = pay.find((p) => p.user_id === id)?.full_name
    setSaid({ kind: 'ok', text: `${who ?? 'Salary'} saved. Build the month again to use it.` })
    setEditing(null)
    await load()
    onSaved?.()
  }

  const missing = pay.filter((p) => p.monthly === null).length
  const total = pay.reduce((t, p) => t + Number(p.monthly ?? 0), 0)

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return pay
    return pay.filter((p) => `${p.full_name} ${p.emp_code} ${p.branch ?? ''}`.toLowerCase().includes(t))
  }, [pay, q])

  if (!canSee) return null

  return (
    <section ref={ref} className="no-print mt-4 scroll-mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={!!open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-[#171717] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500"
      >
        <Wallet size={15} className="text-gray-500" />
        <h2 className="text-sm font-medium">Salaries</h2>
        <span className="text-xs text-gray-600">
          {pay.length} people · {rupees(total)} a month
        </span>
        {missing > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300">
            {missing} not set
          </span>
        )}
        <ChevronDown size={15} className={`ml-auto text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-[#242424]">
          {missing > 0 && (
            <p className="flex items-start gap-2 border-b border-amber-900/30 bg-amber-950/15 px-5 py-3 text-xs text-amber-200/90">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              {missing} {missing === 1 ? 'person has' : 'people have'} no salary yet, so their payslip
              and their leave both come to ₹0. They are at the top.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Name, code or branch"
                aria-label="Find a person"
                className="w-52 rounded-lg border border-[#2a2a2a] bg-[#161616] py-1.5 pl-8 pr-2.5 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
              />
            </div>
            {said && (
              <p className={`text-xs ${said.kind === 'ok' ? 'text-green-300' : 'text-red-300'}`}>{said.text}</p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-[#1f1f1f] text-left text-xs text-gray-500">
                  <th className="px-5 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">Branch</th>
                  <th className="px-3 py-2.5 text-right font-normal">A month</th>
                  <th className="px-3 py-2.5 text-right font-normal">A day</th>
                  <th className="px-5 py-2.5"><span className="sr-only">Change</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {shown.map((p) => (
                  <tr key={p.user_id} className={`transition-colors hover:bg-[#181818] ${p.monthly === null ? 'bg-amber-500/[0.03]' : ''}`}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium">{p.full_name}</p>
                      <p className="font-mono text-[11px] text-gray-500">
                        {p.emp_code}{p.designation && ` · ${p.designation}`}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{p.branch ?? '—'}</td>

                    {editing === p.user_id ? (
                      <td colSpan={3} className="px-3 py-2">
                        <form
                          onSubmit={(e) => { e.preventDefault(); save(p.user_id) }}
                          className="flex flex-wrap items-center justify-end gap-2"
                        >
                          <input
                            type="number" min="0" step="500" autoFocus
                            value={amount} onChange={(e) => setAmount(e.target.value)}
                            aria-label={`Monthly salary for ${p.full_name}`}
                            className="w-36 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={busy || amount === '' || Number(amount) < 0}
                            className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-40"
                          >
                            {busy && <Loader2 size={12} className="animate-spin" />} Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white">
                            Cancel
                          </button>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${p.monthly === null ? 'text-amber-400' : 'text-gray-200'}`}>
                          {p.monthly === null ? 'not set' : rupees(p.monthly)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                          {p.day_rate === null ? '—' : rupees(p.day_rate)}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {canSet && (
                            <button
                              onClick={() => { setEditing(p.user_id); setAmount(p.monthly === null ? '' : String(p.monthly)); setSaid(null) }}
                              className={`rounded-lg border px-3 py-1 text-xs transition-colors ${
                                p.monthly === null
                                  ? 'border-amber-700/50 text-amber-200 hover:bg-amber-950/40'
                                  : 'border-[#2a2a2a] text-gray-300 hover:bg-[#1f1f1f] hover:text-white'}`}
                            >
                              {p.monthly === null ? 'Set' : 'Change'}
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-600">Nobody matches that.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="border-t border-[#242424] px-5 py-3 text-xs text-gray-600">
            A day is the month&rsquo;s salary divided by the days that month actually has, so
            January and February are not the same. Nobody can set their own.
          </p>
        </div>
      )}
    </section>
  )
})

export default SalariesCard