import { Fragment, useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Download, Loader2, Plus, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { downloadXlsx } from '../../lib/xlsx'
import { fmtDate, incentiveToPayslip, inr, monthName, todayIST } from './financeUtils'

/*
  Sales incentive — who earned what this month.

  THE RULE (a), decided 17 Nov 2026: only what was sold ABOVE the
  month's target earns, at each service's own %. Counted from projects
  by booking date, without GST. No target set = no incentive. The Sales
  screen, HR's payroll and this screen all read incentive_calc(), so
  they cannot show different figures.

  Seen by Accounts, a Super Admin, and a branch manager for their own
  branch (the database decides; a manager simply gets fewer rows). A
  sales person sees their own on their own screen.


  "Add to payslip" puts the payable figure on that person's DRAFT
  payslip. HR has the same button on Payroll; either one replaces the
  line, so it is never paid twice.
*/

type Part = { service: string; sold: number; share: number; pct: number; amount: number }
type Row = {
  user_id: string; emp_code: string | null; full_name: string; branch: string | null
  sold: number; target: number | null; target_met: boolean | null; above_target: number
  amount: number; payable: number; breakdown: Part[] | null
}
type Proj = { id: string; project_code: string; title: string; customer_name: string; service: string; booked_on: string; value: number }

export default function IncentiveBoard() {
  const { role } = useAuth()
  const canPay = role === 'accounts' || role === 'super_admin'
  const [month, setMonth] = useState(() => todayIST().slice(0, 7))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Proj[]>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const first = `${month}-01`

  const load = useCallback(async () => {
    setLoading(true); setOpen(null); setQuotes({})
    const { data, error } = await supabase.rpc('incentive_board', { p_month: first })
    setLoading(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows((data ?? []) as Row[])
  }, [first])

  useEffect(() => { void load() }, [load])

  async function toggle(r: Row) {
    if (open === r.user_id) return setOpen(null)
    setOpen(r.user_id)
    if (quotes[r.user_id]) return
    const { data } = await supabase.rpc('incentive_projects', { p_user: r.user_id, p_month: first })
    setQuotes((q) => ({ ...q, [r.user_id]: (data ?? []) as Proj[] }))
  }

  async function pay(r: Row) {
    setBusy(r.user_id); setMsg(null)
    const res = await incentiveToPayslip(r.user_id, first)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setMsg({ ok: true, text: `${inr(res.amount)} put on ${r.full_name}'s ${monthName(first)} payslip.` })
  }

  const tot = rows.reduce((a, r) => ({ sold: a.sold + Number(r.sold), payable: a.payable + Number(r.payable) }), { sold: 0, payable: 0 })

  function toExcel() {
    downloadXlsx(`incentive_${month}`, [{
      name: 'Incentive',
      columns: [
        { header: 'Code', width: 9 }, { header: 'Name', width: 22 }, { header: 'Branch', width: 14 },
        { header: 'Sold (without GST)', kind: 'money', width: 16 }, { header: 'Target', kind: 'money', width: 14 },
        { header: 'Passed', width: 9 }, { header: 'Above target', kind: 'money', width: 14 },
        { header: 'Incentive', kind: 'money', width: 13 }, { header: 'By service', width: 40 },
      ],
      rows: rows.map((r) => [
        r.emp_code ?? '', r.full_name, r.branch ?? '', Number(r.sold), r.target === null ? '' : Number(r.target),
        r.target_met === null ? 'No target' : r.target_met ? 'Yes' : 'No', Number(r.above_target), Number(r.payable),
        (r.breakdown ?? []).map((b) => `${b.service} ${Number(b.pct)}% = ${Number(b.amount)}`).join(' · '),
      ]),
      total: ['', 'Total', '', tot.sold, null, null, null, tot.payable, null],
    }])
  }

  const th = 'border-b border-[#242424] px-4 py-3 font-normal'
  const td = 'border-t border-[#202020] px-4 py-2.5'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <TrendingUp size={22} className="text-orange-400" /> Sales incentive
          </h1>
          <p className="mt-1 text-sm text-gray-400">Only what was sold above the month's target, at each service's %. From projects, without GST.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month"
                 className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white" />
          <button onClick={toExcel} disabled={rows.length === 0} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className={th}>Sales person</th><th className={`${th} text-right`}>Sold</th>
                <th className={`${th} text-right`}>Target</th><th className={`${th} text-right`}>Above target</th>
                <th className={`${th} text-right`}>Incentive</th><th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.user_id}>
                  <tr onClick={() => toggle(r)} className="cursor-pointer align-top hover:bg-[#1a1a1a]">
                    <td className={td}>
                      <span className="flex items-center gap-1.5 text-white">
                        {open === r.user_id ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                        {r.full_name}
                      </span>
                      <span className="ml-5 text-xs text-gray-500">
                        {r.branch ?? '—'}
                        {(r.breakdown ?? []).map((b) => ` · ${b.service} ${Number(b.pct)}% → ${inr(b.amount)}`).join('')}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums text-white`}>{inr(r.sold)}</td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                      {r.target === null ? <span className="text-xs text-gray-600">Not set</span> : (
                        <span className={r.target_met ? 'text-green-400' : 'text-gray-400'}>{inr(r.target)}</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums text-gray-300`}>
                      {Number(r.above_target) > 0 ? inr(r.above_target) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums ${Number(r.payable) > 0 ? 'font-semibold text-green-400' : 'text-gray-600'}`}>
                      {inr(r.payable)}
                    </td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                      {canPay && Number(r.payable) > 0 && (
                        <button onClick={() => pay(r)} disabled={busy === r.user_id}
                                className="inline-flex items-center gap-1 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                          {busy === r.user_id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add to payslip
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === r.user_id && (
                    <tr>
                      <td colSpan={6} className="border-t border-[#202020] bg-[#131313] px-4 py-3">
                        {!quotes[r.user_id] ? <Loader2 size={14} className="animate-spin text-gray-500" /> : (
                          <ul className="space-y-1 text-xs">
                            {quotes[r.user_id].map((q) => (
                              <li key={q.id} className="flex flex-wrap gap-x-3 text-gray-400">
                                <span className="font-mono text-orange-300">{q.project_code}</span>
                                <span className="text-white">{q.customer_name}</span>
                                <span>{q.title}</span>
                                <span>{q.service}</span>
                                <span>{fmtDate(q.booked_on)}</span>
                                <span className="ml-auto tabular-nums text-white">{inr(q.value)}</span>
                              </li>
                            ))}
                            {quotes[r.user_id].length === 0 && <li className="text-gray-500">No projects booked.</li>}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                  {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'No projects booked that month.'}
                </td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-semibold text-white">
                  <td className={td}>Total</td>
                  <td className={`${td} text-right tabular-nums`}>{inr(tot.sold)}</td>
                  <td className={td} /><td className={td} />
                  <td className={`${td} text-right tabular-nums text-green-400`}>{inr(tot.payable)}</td>
                  <td className={td} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}
