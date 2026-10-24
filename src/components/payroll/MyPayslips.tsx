// src/components/payroll/MyPayslips.tsx
//
// A person's own payslips. Route: /{role}/my-payslips
//
// No permission, the same reasoning as My attendance and My leave: this
// is the record of what you were paid, and somebody who cannot read it
// has to take payroll's word for it.
//
// A draft month never appears here. my_payslips() only returns slips
// from an approved run — a figure that is still being worked on is not
// a payslip, and seeing one change between Tuesday and Friday would be
// worse than not seeing it at all.
//
// "Download the PDF" is the browser's own print dialogue with a print
// stylesheet behind it, not a PDF library. It gives the person a real
// PDF on every device, needs nothing installed, and cannot drift from
// what is on the screen — which a second rendering path would.

import { useCallback, useEffect, useState } from 'react'
import { Wallet, Printer, ChevronDown, Calendar } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Slip = {
  id: string; month: string; monthly: number; day_rate: number; days_in_month: number
  worked_days: number; off_days: number; paid_leave_days: number
  unpaid_leave_days: number; absent_days: number; absent_charged: number
  late_count: number; late_half_days: number
  earnings: number; day_cut: number; fixed_cut: number; other_cut: number
  net: number; not_taken: number; state: string
  paid_on: string | null; pay_mode: string | null; pay_ref: string | null
}

type Line = { id: string; kind: string; label: string; amount: number; note: string | null }

const rupees = (n: number | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const monthName = (m: string) =>
  new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const STATE_CLS: Record<string, string> = {
  Unpaid: 'bg-[#1f1f1f] text-gray-400 ring-[#2a2a2a]',
  'Partly paid': 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Paid: 'bg-green-500/10 text-green-300 ring-green-500/20',
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'add' | 'cut' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={`text-sm ${tone === 'cut' ? 'text-red-300' : tone === 'add' ? 'text-green-300' : 'text-gray-400'}`}>
        {label}
      </span>
      <span className={`tabular-nums ${tone === 'cut' ? 'text-red-300' : tone === 'add' ? 'text-green-300' : ''}`}>
        {value}
      </span>
    </div>
  )
}

export default function MyPayslips() {
  const [slips, setSlips] = useState<Slip[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_payslips')
    const rows = (data ?? []) as unknown as Slip[]
    setSlips(rows)
    setOpen((o) => o ?? rows[0]?.id ?? null)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!open) { setLines([]); return }
    let alive = true
    supabase.rpc('payslip_lines_of', { p_slip: open }).then(({ data }) => {
      if (alive) setLines((data ?? []) as unknown as Line[])
    })
    return () => { alive = false }
  }, [open])

  return (
    <div className="mx-auto max-w-3xl">
      {/* Only the open payslip goes on the paper — not the sidebar, not
          the other months, not the buttons. */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .slip { border: 0 !important; background: #fff !important; color: #000 !important; }
          .slip * { color: #000 !important; }
        }
      `}</style>

      <header className="no-print mb-6">
        <h1 className="text-xl font-semibold">My payslips</h1>
        <p className="mt-1 text-sm text-gray-500">
          What you were paid, and how it was worked out.
        </p>
      </header>

      {slips.length === 0 ? (
        <p className="py-20 text-center text-sm text-gray-600">
          Nothing yet. A payslip appears here once the month has been approved.
        </p>
      ) : (
        <ul className="space-y-3">
          {slips.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
              <button
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className="no-print flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#1a1a1a]"
              >
                <Wallet size={15} className="text-gray-500" />
                <span className="flex-1 text-sm font-medium">{monthName(s.month)}</span>
                <span className="text-sm font-semibold tabular-nums">{rupees(s.net)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${
                  STATE_CLS[s.state] ?? STATE_CLS.Unpaid}`}>
                  {s.state}
                </span>
                <ChevronDown size={15} className={`text-gray-500 transition-transform ${
                  open === s.id ? 'rotate-180' : ''}`} />
              </button>

              {open === s.id && (
                <div className="slip border-t border-[#242424] px-5 py-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">JK Branding (India) Private Limited</p>
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar size={11} /> Payslip for {monthName(s.month)}
                      </p>
                    </div>
                    <button
                      onClick={() => window.print()}
                      className="no-print flex items-center gap-2 rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-[#1a1a1a] hover:text-white"
                    >
                      <Printer size={14} /> Print / Save as PDF
                    </button>
                  </div>

                  <div className="divide-y divide-[#1f1f1f]">
                    <Row label="Salary for the month" value={rupees(s.monthly)} />
                    <Row
                      label={`A day (${s.days_in_month} days in ${monthName(s.month).split(' ')[0]})`}
                      value={rupees(s.day_rate)}
                    />

                    {lines.filter((l) => l.kind === 'earning').map((l) => (
                      <Row key={l.id} label={l.label} value={'+' + rupees(l.amount)} tone="add" />
                    ))}

                    {Number(s.day_cut) > 0 && (
                      <Row label="Days not paid for" value={'−' + rupees(s.day_cut)} tone="cut" />
                    )}
                    {Number(s.fixed_cut) > 0 && (
                      <Row label="Every month" value={'−' + rupees(s.fixed_cut)} tone="cut" />
                    )}
                    {lines.filter((l) => l.kind === 'deduction').map((l) => (
                      <Row key={l.id} label={l.label} value={'−' + rupees(l.amount)} tone="cut" />
                    ))}

                    <div className="flex items-baseline justify-between gap-4 pt-3">
                      <span className="font-semibold">Net</span>
                      <span className="text-lg font-semibold tabular-nums">{rupees(s.net)}</span>
                    </div>
                  </div>

                  {/* Where the deducted days came from. Nobody should have
                      to ask payroll what a figure on their own slip is. */}
                  <div className="mt-4 rounded-xl border border-[#242424] bg-[#111] px-4 py-3">
                    <p className="text-xs text-gray-500">The month</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                      {Number(s.worked_days)} days worked · {Number(s.off_days)} weekly offs
                      and holidays · {Number(s.paid_leave_days)} paid leave
                      {Number(s.unpaid_leave_days) > 0 &&
                        ` · ${Number(s.unpaid_leave_days)} unpaid leave`}
                      {Number(s.absent_days) > 0 &&
                        ` · ${Number(s.absent_days)} away without approved leave, charged as ${Number(s.absent_charged)} days`}
                      {s.late_count > 0 && ` · ${s.late_count} late arrivals`}
                      {Number(s.late_half_days) > 0 &&
                        `, costing ${Number(s.late_half_days)} of a day`}
                    </p>
                    {Number(s.not_taken) > 0 && (
                      <p className="mt-2 text-xs text-red-300/80">
                        {rupees(s.not_taken)} could not be deducted — it came to more than
                        the whole salary. Ask HR what happens to it.
                      </p>
                    )}
                  </div>

                  {s.paid_on && (
                    <p className="mt-3 text-xs text-gray-500">
                      Paid on {new Date(s.paid_on + 'T00:00:00').toLocaleDateString('en-IN')}
                      {s.pay_mode && ` · ${s.pay_mode}`}
                      {s.pay_ref && ` · ${s.pay_ref}`}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}