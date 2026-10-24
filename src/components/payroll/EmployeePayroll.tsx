// src/components/payroll/EmployeePayroll.tsx
//
// One person's payroll. Routes: /hr/payroll/:id and /admin/payroll/:id
//
// Everything about one person's money in one place: what they are paid
// and how it is split, what the month did to it, their payslips, what
// has been paid, and every change the salary has ever had.
//
// Two things this screen is careful about.
//
// The ATTENDANCE IMPACT is read from the register, not from the
// payslip — payslip_figures() answers the same way whether or not a
// payroll run exists yet. So HR can see what a month will cost before
// building it, which is the moment a wrong day is still cheap to fix.
//
// The SALARY SPLIT (Basic, HRA, PF) divides the gross; it does not add
// to it. If the lines do not add up to the salary, the remainder is
// shown and named. A breakdown that quietly disagrees with the figure
// above it is worse than no breakdown — it looks tidy and it lies.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, Wallet, Printer, Plus, Trash2, Loader2, X, AlertTriangle,
  Package, History, IndianRupee, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Person = {
  id: string; emp_code: string; full_name: string
  designation: string | null; phone: string | null
  date_of_joining: string | null; is_active: boolean
  branch: string | null; department: string | null
}

type Part = { id: string; label: string; amount: number }

type Structure = {
  ok: boolean; monthly?: number
  earnings?: Part[]; deductions?: Part[]
  earning_total?: number; deduction_total?: number; remainder?: number
}

type Figures = {
  days_in_month: number; monthly: number; day_rate: number
  worked_days: number; off_days: number
  paid_leave_days: number; unpaid_leave_days: number
  absent_days: number; absent_charged: number; not_yet_days: number
  late_count: number; late_half_days: number; penalty: number; day_cut: number
}

type Slip = {
  id: string; month: string; run_state: string
  monthly: number; day_rate: number; days_in_month: number
  worked_days: number; off_days: number; paid_leave_days: number
  unpaid_leave_days: number; absent_days: number; absent_charged: number
  late_count: number; late_half_days: number
  earnings: number; day_cut: number; fixed_cut: number; other_cut: number
  net: number; not_taken: number; state: string
  paid_amount: number; paid_on: string | null; pay_mode: string | null; pay_ref: string | null
}

type Revision = {
  was: number | null; became: number; effective_from: string
  reason: string | null; changed_by_name: string | null; changed_at: string
}

type Balance = { code: string; name: string; unit: string; credited: number; taken: number; left_over: number }

type Page = {
  ok: boolean; reason?: string; month?: string
  person?: Person; structure?: Structure; figures?: Figures
  slip?: { id: string; net: number; state: string; paid_amount: number; paid_on: string | null
           earnings: number; day_cut: number; fixed_cut: number; other_cut: number
           run_state: string } | null
  leave?: { paid_days: number; unpaid_days: number; requests: number; waiting: number }
  assets?: number
  can_edit?: boolean
}

const rupees = (n: number | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const monthName = (m: string) =>
  new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const day = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN',
      { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATE_CLS: Record<string, string> = {
  Unpaid: 'bg-[#1f1f1f] text-gray-400 ring-[#2a2a2a]',
  'Partly paid': 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Paid: 'bg-green-500/10 text-green-300 ring-green-500/20',
}

const TABS = ['Overview', 'Salary', 'Payslips', 'Payments', 'Salary history'] as const
type Tab = typeof TABS[number]

function Panel({ title, hint, children, className = '' }: {
  title: string; hint?: string; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#242424] bg-[#141414] ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#242424] px-5 py-3.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <span className="text-xs text-gray-600">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#242424] bg-[#111] px-3 py-2.5 text-center">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}

const inputCls =
  'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white ' +
  'placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

const btn =
  'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40'

export default function EmployeePayroll({ userId, onBack }: {
  userId: string; onBack?: () => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tab, setTab] = useState<Tab>('Overview')

  const [page, setPage] = useState<Page | null>(null)
  const [slips, setSlips] = useState<Slip[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [printing, setPrinting] = useState<Slip | null>(null)

  const [pKind, setPKind] = useState('earning')
  const [pLabel, setPLabel] = useState('')
  const [pAmount, setPAmount] = useState('')
  const [adding, setAdding] = useState(false)
  const [aLabel, setALabel] = useState('')
  const [aAmount, setAAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}-01`

  const load = useCallback(async () => {
    const [p, h, r, b] = await Promise.all([
      supabase.rpc('person_payroll', { p_user: userId, p_month: monthStr }),
      supabase.rpc('payslips_of_person', { p_user: userId, p_year: null }),
      supabase.rpc('salary_history', { p_user: userId }),
      supabase.rpc('leave_balance_of', { p_user: userId }),
    ])
    setPage((p.data ?? null) as unknown as Page | null)
    setSlips((h.data ?? []) as unknown as Slip[])
    setRevisions((r.data ?? []) as unknown as Revision[])
    setBalances((b.data ?? []) as unknown as Balance[])
  }, [userId, monthStr])

  useEffect(() => { load() }, [load])

  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true)
    setSaid(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) {
      setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
      return false
    }
    setSaid({ kind: 'ok', text: ok })
    load()
    return true
  }

  const step = (by: number) => {
    const d = new Date(year, month + by, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const p = page?.person
  const f = page?.figures
  const st = page?.structure
  const paidSlips = useMemo(() => slips.filter((s) => Number(s.paid_amount) > 0), [slips])
  const slipOfMonth = useMemo(
    () => slips.find((s) => s.month === monthStr) ?? null,
    [slips, monthStr],
  )

  // "Basic" is whichever line is called that; everything else that makes
  // up the salary is an allowance. Matched by name because that is what
  // somebody typed — there is no flag for it, and inventing one would
  // mean a second thing to keep in step with the label.
  const basic = useMemo(() => {
    const hit = (st?.earnings ?? []).find((e) => /basic/i.test(e.label))
    return Number(hit?.amount ?? 0)
  }, [st])
  const allowances = useMemo(
    () => Math.max(Number(st?.earning_total ?? 0) - basic, 0),
    [st, basic],
  )
  const addedThisMonth = Number(page?.slip?.earnings ?? 0)

  if (page && !page.ok) {
    return <p className="py-20 text-center text-sm text-gray-500">{page.reason}</p>
  }

  return (
    <div className="mx-auto max-w-6xl">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .slip, .slip * { color: #000 !important; background: #fff !important; border-color: #ccc !important; }
        }
      `}</style>

      {onBack && (
        <button onClick={onBack} className="no-print mb-4 flex items-center gap-2 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={15} /> Back to payroll
        </button>
      )}

      {said && (
        <p className={`no-print mb-4 rounded-xl border px-4 py-2.5 text-sm ${
          said.kind === 'ok'
            ? 'border-green-900/40 bg-green-950/15 text-green-300'
            : 'border-red-900/40 bg-red-950/15 text-red-300'}`}>
          {said.text}
        </p>
      )}

      {/* ── who ────────────────────────────────────────────────── */}
      <section className="no-print rounded-2xl border border-[#242424] bg-[#141414] p-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-base font-semibold text-gray-300">
            {(p?.full_name ?? '—').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
          </span>

          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {p?.full_name ?? '—'}
              <span className="font-mono text-xs font-normal text-gray-500">{p?.emp_code}</span>
              {p && !p.is_active && (
                <span className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-[11px] text-gray-400">Inactive</span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {[p?.designation, p?.department, p?.branch].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {p?.phone && <>{p.phone} · </>}
              Joined {day(p?.date_of_joining ?? null)}
              {(page?.assets ?? 0) > 0 && (
                <> · <Package size={11} className="inline" /> {page?.assets} company {page?.assets === 1 ? 'item' : 'items'}</>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-[#242424] bg-[#111] px-5 py-3 text-right">
            <p className="text-xs text-gray-500">Salary a month</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-orange-400">
              {rupees(st?.monthly)}
            </p>
            <p className="text-[11px] text-gray-600">
              {f ? `${rupees(f.day_rate)} a day · ${f.days_in_month} days` : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* ── which month, and which tab ─────────────────────────── */}
      <div className="no-print mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[#242424] bg-[#141414] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                tab === t ? 'bg-orange-500/10 text-orange-300' : 'text-gray-400 hover:text-white'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Overview' && (
          <div className="ml-auto flex items-center gap-1 rounded-xl border border-[#242424] bg-[#141414] p-1">
            <button onClick={() => step(-1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[9rem] text-center text-sm">{monthName(monthStr)}</span>
            <button onClick={() => step(1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Overview ─────────────────────────────────────────────
           Everything about this person's month on one screen: what
           their salary is made of, what the month did to it, what is
           owed, and what has been paid. The tabs above are for going
           deeper, not for finding the basics. */}
      {tab === 'Overview' && (
        <div className="no-print mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* the salary, in three figures */}
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ['Basic', basic, 'text-orange-400'],
                ['Allowances', allowances, 'text-gray-100'],
                ['Added this month', addedThisMonth, 'text-green-300'],
              ] as const).map(([label, value, tone]) => (
                <div key={label} className="rounded-2xl border border-[#242424] bg-[#141414] px-4 py-3.5">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{rupees(value)}</p>
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    {Number(st?.monthly) > 0
                      ? `${Math.round((Number(value) / Number(st?.monthly)) * 100)}% of the salary`
                      : 'no salary on file'}
                  </p>
                </div>
              ))}
            </div>

            {/* the breakdown, as a table */}
            <Panel title="Salary breakdown"
                   hint="these divide the salary, they do not add to it">
              {(st?.earnings ?? []).length === 0 && (st?.deductions ?? []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-600">
                  No split entered — the whole salary is simply &ldquo;salary&rdquo;.
                  Add Basic, HRA and the rest under the Salary tab.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1f1f1f] text-left text-xs text-gray-500">
                      <th className="px-5 py-2.5 font-normal">Component</th>
                      <th className="px-3 py-2.5 font-normal">Type</th>
                      <th className="px-5 py-2.5 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1a1a]">
                    {(st?.earnings ?? []).map((e) => (
                      <tr key={e.id}>
                        <td className="px-5 py-2.5">{e.label}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">Earning</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{rupees(e.amount)}</td>
                      </tr>
                    ))}
                    {Number(st?.remainder ?? 0) !== 0 && (
                      <tr>
                        <td className="px-5 py-2.5 text-gray-500">
                          {Number(st?.remainder) > 0 ? 'Not accounted for' : 'Over the salary by'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">—</td>
                        <td className={`px-5 py-2.5 text-right tabular-nums ${
                          Number(st?.remainder) > 0 ? 'text-gray-500' : 'text-red-300'}`}>
                          {rupees(Math.abs(Number(st?.remainder ?? 0)))}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-[#111]">
                      <td className="px-5 py-2.5 font-medium">Salary a month</td>
                      <td className="px-3 py-2.5"></td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                        {rupees(st?.monthly)}
                      </td>
                    </tr>

                    {(st?.deductions ?? []).map((d) => (
                      <tr key={d.id}>
                        <td className="px-5 py-2.5">{d.label}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">Every month</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-red-300">
                          −{rupees(d.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="px-5 py-2.5 text-red-300">Days not paid for</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">This month</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-red-300">
                        −{rupees(f?.day_cut)}
                      </td>
                    </tr>
                    {addedThisMonth > 0 && (
                      <tr>
                        <td className="px-5 py-2.5 text-green-300">Added this month</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">Incentive, bonus</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-green-300">
                          +{rupees(addedThisMonth)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-[#111]">
                      <td className="px-5 py-3 font-semibold">Net this month</td>
                      <td className="px-3 py-3"></td>
                      <td className="px-5 py-3 text-right text-base font-semibold tabular-nums">
                        {page?.slip ? rupees(page.slip.net) : rupees(
                          Number(st?.monthly ?? 0) - Number(f?.day_cut ?? 0)
                          - Number(st?.deduction_total ?? 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
              {!page?.slip && (
                <p className="border-t border-[#242424] px-5 py-2.5 text-[11px] text-gray-600">
                  The month has not been built yet, so the net above is what it comes to
                  right now from the register — not a payslip.
                </p>
              )}
            </Panel>
          </div>

          {/* ── the right column ───────────────────────────────── */}
          <div className="space-y-4">
            <Panel title="Attendance impact" hint={monthName(monthStr)}>
              <div className="grid grid-cols-4 gap-2 p-4">
                <Stat label="Worked" value={String(Number(f?.worked_days ?? 0))} tone="text-orange-400" />
                <Stat label="Absent" value={String(Number(f?.absent_days ?? 0))}
                      tone={Number(f?.absent_days) > 0 ? 'text-red-300' : undefined} />
                <Stat label="Late" value={String(f?.late_count ?? 0)}
                      tone={Number(f?.late_count) > 0 ? 'text-amber-400' : undefined} />
                <Stat label="Half days" value={String(Number(f?.late_half_days ?? 0))} />
              </div>
              <p className="border-t border-[#242424] px-5 py-2.5 text-[11px] leading-relaxed text-gray-600">
                Read from the register, not the payslip — so it is right before the month
                is built. Absence counts at {Number(f?.penalty ?? 2)}× pay, and each day of
                the month counts once and once only.
                {Number(f?.not_yet_days) > 0 && ` ${Number(f?.not_yet_days)} days still to come.`}
              </p>
            </Panel>

            <Panel title="Leave this month">
              <div className="space-y-2 px-5 py-4 text-sm">
                <p className="flex justify-between">
                  <span className="text-gray-400">Paid leave</span>
                  <span className="tabular-nums">{Number(page?.leave?.paid_days ?? 0)} days</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-gray-400">Unpaid leave</span>
                  <span className={`tabular-nums ${
                    Number(page?.leave?.unpaid_days) > 0 ? 'text-amber-300' : ''}`}>
                    {Number(page?.leave?.unpaid_days ?? 0)} days
                  </span>
                </p>
                <p className="flex justify-between border-t border-[#242424] pt-2">
                  <span className="text-gray-400">Comes off the salary</span>
                  <span className="tabular-nums text-red-300">−{rupees(f?.day_cut)}</span>
                </p>
                {Number(page?.leave?.waiting) > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle size={12} /> {page?.leave?.waiting} still waiting on HR
                  </p>
                )}
                <div className="space-y-0.5 border-t border-[#242424] pt-2">
                  {balances.map((b) => (
                    <p key={b.code} className="flex justify-between text-xs">
                      <span className="text-gray-500">{b.name} left</span>
                      <span className="tabular-nums text-gray-300">
                        {Number(b.left_over)} {b.unit === 'hour' ? 'hours' : 'days'}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            </Panel>

            <Panel title="Other details">
              <div className="grid grid-cols-2 gap-3 p-4">
                <Stat label="Days in the month" value={String(f?.days_in_month ?? 0)} />
                <Stat label="A day" value={rupees(f?.day_rate)} />
              </div>
            </Panel>

            {/* ── quick actions ────────────────────────────────
                 Only what can actually be done right now. A button
                 that explains why it cannot work is a button that
                 should not be there. */}
            <Panel title="Quick actions">
              <div className="space-y-1 p-3">
                <button
                  onClick={() => { const sl = slipOfMonth; if (sl) setPrinting(sl) }}
                  disabled={!slipOfMonth}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#1a1a1a] disabled:opacity-40"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1e1e1e] text-orange-400">
                    <Printer size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">Payslip</span>
                    <span className="block text-[11px] text-gray-600">
                      {slipOfMonth ? 'Print or save as PDF' : 'The month is not built yet'}
                    </span>
                  </span>
                </button>

                {page?.can_edit && page?.slip?.run_state === 'Draft' && (
                  <button
                    onClick={() => setAdding((v) => !v)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#1a1a1a]"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1e1e1e] text-green-400">
                      <Plus size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">Add a bonus or incentive</span>
                      <span className="block text-[11px] text-gray-600">
                        One-off, only while the month is a draft
                      </span>
                    </span>
                  </button>
                )}

                <button
                  onClick={() => setTab('Salary history')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#1a1a1a]"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#1e1e1e] text-gray-300">
                    <History size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">Salary history</span>
                    <span className="block text-[11px] text-gray-600">
                      {revisions.length} {revisions.length === 1 ? 'change' : 'changes'} recorded
                    </span>
                  </span>
                </button>
              </div>

              {adding && page?.slip && (
                <div className="flex flex-wrap gap-2 border-t border-[#242424] p-4">
                  <input
                    value={aLabel} onChange={(e) => setALabel(e.target.value)}
                    placeholder="Festival bonus, incentive…"
                    className={`${inputCls} min-w-[9rem] flex-1`}
                  />
                  <input
                    type="number" min="1" value={aAmount}
                    onChange={(e) => setAAmount(e.target.value)}
                    placeholder="0" className={`${inputCls} w-24 text-right`}
                  />
                  <button
                    onClick={async () => {
                      const done = await call('payslip_line_add', {
                        p_slip: page.slip?.id, p_kind: 'earning',
                        p_label: aLabel.trim(), p_amount: Number(aAmount),
                      }, 'Added to this month.')
                      if (done) { setALabel(''); setAAmount(''); setAdding(false) }
                    }}
                    disabled={busy || aLabel.trim().length < 2 || Number(aAmount) <= 0}
                    className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              )}
            </Panel>

            <Panel title="Payslip history" hint={`${slips.length}`}>
              {slips.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-gray-600">Nothing yet.</p>
              ) : (
                <ul className="divide-y divide-[#1a1a1a]">
                  {slips.slice(0, 5).map((sl) => (
                    <li key={sl.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <Wallet size={13} className="shrink-0 text-gray-600" />
                      <span className="min-w-0 flex-1 truncate">{monthName(sl.month)}</span>
                      <span className="tabular-nums">{rupees(sl.net)}</span>
                      <button
                        onClick={() => setPrinting(sl)}
                        className="rounded-lg p-1 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                        aria-label={`Payslip for ${monthName(sl.month)}`}
                      >
                        <Printer size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Payment history" hint={`${paidSlips.length}`}>
              {paidSlips.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-gray-600">Nothing paid yet.</p>
              ) : (
                <ul className="divide-y divide-[#1a1a1a]">
                  {paidSlips.slice(0, 5).map((sl) => (
                    <li key={sl.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                      <IndianRupee size={13} className="shrink-0 text-green-400/70" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{monthName(sl.month)}</span>
                        <span className="block text-[11px] text-gray-600">
                          {day(sl.paid_on)}{sl.pay_mode && ` · ${sl.pay_mode}`}
                        </span>
                      </span>
                      <span className="tabular-nums text-green-300">{rupees(sl.paid_amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ── Salary split ───────────────────────────────────────── */}
      {tab === 'Salary' && (
        <div className="no-print mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="What makes up the salary" hint="these divide the gross, they do not add to it">
            {(st?.earnings ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-600">
                No split entered. The whole salary is simply &ldquo;salary&rdquo;.
              </p>
            ) : (
              <ul className="divide-y divide-[#1a1a1a]">
                {(st?.earnings ?? []).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    <span className="tabular-nums">{rupees(e.amount)}</span>
                    {page?.can_edit && (
                      <button
                        onClick={() => call('pay_structure_drop', { p_id: e.id }, 'Removed.')}
                        className="rounded-lg p-1 text-gray-500 hover:bg-red-950/40 hover:text-red-400"
                        aria-label={`Remove ${e.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t border-[#242424] px-5 py-3 text-sm">
              <p className="flex justify-between">
                <span className="text-gray-400">These come to</span>
                <span className="tabular-nums">{rupees(st?.earning_total)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-gray-400">Salary is</span>
                <span className="tabular-nums">{rupees(st?.monthly)}</span>
              </p>
              {Number(st?.remainder ?? 0) !== 0 && (
                <p className={`flex justify-between ${
                  Number(st?.remainder) > 0 ? 'text-gray-500' : 'text-red-300'}`}>
                  <span>
                    {Number(st?.remainder) > 0 ? 'Not accounted for' : 'Over the salary by'}
                  </span>
                  <span className="tabular-nums">{rupees(Math.abs(Number(st?.remainder ?? 0)))}</span>
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Taken off every month" hint="whatever the attendance">
            {(st?.deductions ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-600">Nothing standing.</p>
            ) : (
              <ul className="divide-y divide-[#1a1a1a]">
                {(st?.deductions ?? []).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.label}</span>
                    <span className="tabular-nums text-red-300">−{rupees(d.amount)}</span>
                    {page?.can_edit && (
                      <button
                        onClick={() => call('pay_structure_drop', { p_id: d.id }, 'Removed.')}
                        className="rounded-lg p-1 text-gray-500 hover:bg-red-950/40 hover:text-red-400"
                        aria-label={`Remove ${d.label}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="flex justify-between border-t border-[#242424] px-5 py-3 text-sm">
              <span className="text-gray-400">Every month</span>
              <span className="tabular-nums text-red-300">−{rupees(st?.deduction_total)}</span>
            </p>
          </Panel>

          {page?.can_edit && (
            <div className="lg:col-span-2">
              <Panel title="Add a line">
                <div className="flex flex-wrap gap-2 p-5">
                  <select value={pKind} onChange={(e) => setPKind(e.target.value)} className={inputCls}>
                    <option value="earning">Part of the salary</option>
                    <option value="deduction">Taken off every month</option>
                  </select>
                  <input
                    value={pLabel} onChange={(e) => setPLabel(e.target.value)}
                    placeholder="Basic, HRA, conveyance, PF, professional tax…"
                    className={`${inputCls} min-w-[14rem] flex-1`}
                  />
                  <input
                    type="number" min="0" value={pAmount}
                    onChange={(e) => setPAmount(e.target.value)}
                    placeholder="0" className={`${inputCls} w-32 text-right`}
                  />
                  <button
                    onClick={async () => {
                      const done = await call('pay_structure_save', {
                        p_id: null, p_user: userId, p_kind: pKind,
                        p_label: pLabel.trim(), p_amount: Number(pAmount), p_sort: 100,
                      }, 'Added.')
                      if (done) { setPLabel(''); setPAmount('') }
                    }}
                    disabled={busy || pLabel.trim().length < 2}
                    className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add
                  </button>
                </div>
              </Panel>
            </div>
          )}
        </div>
      )}

      {/* ── Payslips ───────────────────────────────────────────── */}
      {tab === 'Payslips' && (
        <Panel title="Payslips" hint={`${slips.length} in all`} className="no-print mt-4">
          {slips.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-600">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-[#1a1a1a]">
              {slips.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <Wallet size={15} className="shrink-0 text-gray-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{monthName(s.month)}</p>
                    <p className="text-[11px] text-gray-500">
                      {Number(s.worked_days)} worked · {Number(s.unpaid_leave_days)} unpaid ·{' '}
                      {Number(s.absent_days)} absent · {s.late_count} late
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{rupees(s.net)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                    STATE_CLS[s.state] ?? STATE_CLS.Unpaid}`}>
                    {s.state}
                  </span>
                  <button
                    onClick={() => setPrinting(s)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                    aria-label={`Payslip for ${monthName(s.month)}`}
                  >
                    <Printer size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ── Payments ───────────────────────────────────────────── */}
      {tab === 'Payments' && (
        <Panel title="What has been paid" className="no-print mt-4">
          {paidSlips.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-600">Nothing paid yet.</p>
          ) : (
            <ul className="divide-y divide-[#1a1a1a]">
              {paidSlips.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <IndianRupee size={15} className="shrink-0 text-green-400/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{monthName(s.month)}</p>
                    <p className="text-[11px] text-gray-500">
                      {day(s.paid_on)}
                      {s.pay_mode && ` · ${s.pay_mode}`}
                      {s.pay_ref && ` · ${s.pay_ref}`}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums text-green-300">{rupees(s.paid_amount)}</span>
                  <span className="text-[11px] text-gray-600">of {rupees(s.net)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ── Salary history ─────────────────────────────────────── */}
      {tab === 'Salary history' && (
        <Panel title="Every change to the salary" className="no-print mt-4">
          {revisions.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-600">
              No change recorded. The first figure entered counts as the opening one.
            </p>
          ) : (
            <ul className="divide-y divide-[#1a1a1a]">
              {revisions.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <History size={15} className="shrink-0 text-gray-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {r.was === null ? 'Set to ' : `${rupees(r.was)} → `}
                      <span className="font-semibold">{rupees(r.became)}</span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(r.changed_at).toLocaleDateString('en-IN',
                        { day: 'numeric', month: 'short', year: 'numeric' })}
                      {r.changed_by_name && ` · by ${r.changed_by_name}`}
                      {r.reason && ` · ${r.reason}`}
                    </p>
                  </div>
                  {r.was !== null && (
                    <span className={`text-xs tabular-nums ${
                      Number(r.became) > Number(r.was) ? 'text-green-300' : 'text-red-300'}`}>
                      {Number(r.became) > Number(r.was) ? '+' : ''}
                      {rupees(Number(r.became) - Number(r.was))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ── one payslip on paper ───────────────────────────────── */}
      {printing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPrinting(null)}>
          <div className="no-print absolute inset-0 bg-black/70" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="slip relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#242424] bg-[#121212] p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">JK Branding (India) Private Limited</p>
                <p className="text-xs text-gray-500">Payslip for {monthName(printing.month)}</p>
              </div>
              <div className="no-print flex gap-2">
                <button onClick={() => window.print()} className={`${btn} border border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a]`}>
                  <Printer size={14} /> Print / PDF
                </button>
                <button onClick={() => setPrinting(null)} aria-label="Close" className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[#242424] px-4 py-3">
              <p className="font-medium">{p?.full_name}</p>
              <p className="text-xs text-gray-500">
                {p?.emp_code}
                {p?.designation && ` · ${p.designation}`}
                {p?.branch && ` · ${p.branch}`}
              </p>
            </div>

            <div className="divide-y divide-[#1f1f1f] text-sm">
              <p className="flex justify-between py-1.5">
                <span className="text-gray-400">Salary for the month</span>
                <span className="tabular-nums">{rupees(printing.monthly)}</span>
              </p>
              <p className="flex justify-between py-1.5">
                <span className="text-gray-500">A day ({printing.days_in_month} days in the month)</span>
                <span className="tabular-nums text-gray-500">{rupees(printing.day_rate)}</span>
              </p>
              {Number(printing.earnings) > 0 && (
                <p className="flex justify-between py-1.5 text-green-300">
                  <span>Added</span>
                  <span className="tabular-nums">+{rupees(printing.earnings)}</span>
                </p>
              )}
              {Number(printing.day_cut) > 0 && (
                <p className="flex justify-between py-1.5 text-red-300">
                  <span>Days not paid for</span>
                  <span className="tabular-nums">−{rupees(printing.day_cut)}</span>
                </p>
              )}
              {Number(printing.fixed_cut) > 0 && (
                <p className="flex justify-between py-1.5 text-red-300">
                  <span>Every month</span>
                  <span className="tabular-nums">−{rupees(printing.fixed_cut)}</span>
                </p>
              )}
              {Number(printing.other_cut) > 0 && (
                <p className="flex justify-between py-1.5 text-red-300">
                  <span>Taken off this month</span>
                  <span className="tabular-nums">−{rupees(printing.other_cut)}</span>
                </p>
              )}
              <p className="flex items-baseline justify-between pt-3">
                <span className="font-semibold">Net</span>
                <span className="text-lg font-semibold tabular-nums">{rupees(printing.net)}</span>
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-[#242424] px-4 py-3">
              <p className="text-xs text-gray-500">The month</p>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                {Number(printing.worked_days)} days worked · {Number(printing.off_days)} weekly offs
                and holidays · {Number(printing.paid_leave_days)} paid leave
                {Number(printing.unpaid_leave_days) > 0 && ` · ${Number(printing.unpaid_leave_days)} unpaid leave`}
                {Number(printing.absent_days) > 0 &&
                  ` · ${Number(printing.absent_days)} away without approved leave, charged as ${Number(printing.absent_charged)} days`}
                {printing.late_count > 0 && ` · ${printing.late_count} late arrivals`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}