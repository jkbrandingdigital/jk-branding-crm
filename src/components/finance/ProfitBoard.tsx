import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Download, Loader2, Lock, LockOpen, TrendingDown, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { DateField } from '../DateField'
import { downloadXlsx } from '../../lib/xlsx'
import { closeMonth, fmtDate, inr, monthName, PERIODS, reopenMonth, type MonthRow, type PnlRow } from './financeUtils'

/*
  Profit, by branch.

      Sales (without GST)
    − Purchases      job work + other purchases
    = Gross profit
    − Expenses       salaries + everything else
    = Net profit

  Everything is counted by its own date inside the period: a sale by the
  day it was booked, a purchase by the day it was bought (job work: the
  day it was given), an expense by the day it was spent.

  Costs with no branch are one "Company-wide" row. They are in the
  company total but in no branch's — splitting the owner's phone bill
  across four branches would be a guess dressed up as a figure.
*/

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—')

export default function ProfitBoard() {
  const [period, setPeriod] = useState<string>('month')
  const [from, setFrom] = useState(PERIODS[0].range().from)
  const [to, setTo] = useState(PERIODS[0].range().to)
  const [rows, setRows] = useState<PnlRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('fin_pnl', { p_from: from || null, p_to: to || null })
    setLoading(false)
    if (error) return setErr(error.message)
    setRows((data ?? []) as PnlRow[])
  }, [from, to])

  useEffect(() => { void load() }, [load])

  function pickPeriod(key: string) {
    const r = PERIODS.find((x) => x.key === key)!.range()
    setPeriod(key); setFrom(r.from); setTo(r.to)
  }

  const total = useMemo(() => {
    const t = { sales: 0, jobwork: 0, other_purchases: 0, purchases: 0, gross: 0, salary: 0, other_expenses: 0, expenses: 0, net: 0 }
    for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += Number(r[k])
    return t
  }, [rows])

  function toExcel() {
    const cols = [
      { header: 'Code', width: 8 }, { header: 'Branch', width: 18 },
      { header: 'Sales without GST', kind: 'money' as const, width: 16 },
      { header: 'Job work', kind: 'money' as const, width: 14 }, { header: 'Other purchases', kind: 'money' as const, width: 15 },
      { header: 'Gross profit', kind: 'money' as const, width: 14 }, { header: 'Gross %', width: 9 },
      { header: 'Salaries', kind: 'money' as const, width: 14 }, { header: 'Other expenses', kind: 'money' as const, width: 15 },
      { header: 'Net profit', kind: 'money' as const, width: 14 }, { header: 'Net %', width: 9 },
    ]
    downloadXlsx(`profit_${from || 'start'}_to_${to || 'today'}`, [{
      name: 'Profit by branch',
      columns: cols,
      rows: rows.map((r) => [
        r.branch_code ?? '', r.branch_name, Number(r.sales), Number(r.jobwork), Number(r.other_purchases),
        Number(r.gross), pct(Number(r.gross), Number(r.sales)), Number(r.salary), Number(r.other_expenses),
        Number(r.net), pct(Number(r.net), Number(r.sales)),
      ]),
      total: ['', 'Company', total.sales, total.jobwork, total.other_purchases, total.gross, pct(total.gross, total.sales),
              total.salary, total.other_expenses, total.net, pct(total.net, total.sales)],
    }])
  }

  const th = 'border-b border-[#242424] px-4 py-3 text-right font-normal'
  const td = 'border-t border-[#202020] px-4 py-3 text-right tabular-nums whitespace-nowrap'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <TrendingUp size={22} className="text-orange-400" />
            Profit
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Sales − purchases = gross profit. Gross − expenses = net profit. All without GST.
          </p>
        </div>
        <button onClick={toExcel} disabled={rows.length === 0} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">
          <Download size={15} /> Excel
        </button>
      </div>

      {err && <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"><AlertCircle size={16} /> {err}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${period === p.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-500">
          From
          <DateField value={from} onChange={(v) => { setFrom(v ?? ''); setPeriod('custom') }} className="mt-1 w-40" placeholder="The start" />
        </label>
        <label className="text-xs text-gray-500">
          to
          <DateField value={to} onChange={(v) => { setTo(v ?? ''); setPeriod('custom') }} className="mt-1 w-40" placeholder="Today" />
        </label>
      </div>

      {/* ---------------- the company in four figures ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Big label="Sales (without GST)" value={inr(total.sales)} />
        <Big label="Purchases" value={inr(total.purchases)} sub={`job work ${inr(total.jobwork)} · other ${inr(total.other_purchases)}`} />
        <Big label="Gross profit" value={inr(total.gross)} sub={`${pct(total.gross, total.sales)} of sales`} good={total.gross >= 0} />
        <Big label="Net profit" value={inr(total.net)} sub={`after ${inr(total.expenses)} expenses · ${pct(total.net, total.sales)}`} good={total.net >= 0} />
      </div>

      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className={`${th} text-left`}>Branch</th>
                <th className={th}>Sales</th><th className={th}>Purchases</th><th className={th}>Gross profit</th>
                <th className={th}>Salaries</th><th className={th}>Other expenses</th><th className={th}>Net profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.branch_id ?? 'company'} className="hover:bg-[#1a1a1a]">
                  <td className="border-t border-[#202020] px-4 py-3">
                    {r.branch_code && <span className="mr-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-xs text-orange-300">{r.branch_code}</span>}
                    <span className={r.branch_id ? 'text-white' : 'italic text-gray-400'}>{r.branch_name}</span>
                  </td>
                  <td className={`${td} text-white`}>{inr(r.sales)}</td>
                  <td className={`${td} text-gray-300`}>
                    {inr(r.purchases)}
                    {Number(r.other_purchases) > 0 && <span className="block text-[11px] text-gray-600">job work {inr(r.jobwork)}</span>}
                  </td>
                  <td className={td}><Money v={Number(r.gross)} sub={pct(Number(r.gross), Number(r.sales))} /></td>
                  <td className={`${td} text-gray-300`}>{inr(r.salary)}</td>
                  <td className={`${td} text-gray-300`}>{inr(r.other_expenses)}</td>
                  <td className={td}><Money v={Number(r.net)} sub={pct(Number(r.net), Number(r.sales))} strong /></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                  {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'Nothing sold, bought or spent in this period.'}
                </td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td className="border-t-2 border-[#2a2a2a] px-4 py-3 text-white">Company</td>
                  <td className={`${td} border-t-2 border-[#2a2a2a] text-white`}>{inr(total.sales)}</td>
                  <td className={`${td} border-t-2 border-[#2a2a2a] text-white`}>{inr(total.purchases)}</td>
                  <td className={`${td} border-t-2 border-[#2a2a2a]`}><Money v={total.gross} /></td>
                  <td className={`${td} border-t-2 border-[#2a2a2a] text-white`}>{inr(total.salary)}</td>
                  <td className={`${td} border-t-2 border-[#2a2a2a] text-white`}>{inr(total.other_expenses)}</td>
                  <td className={`${td} border-t-2 border-[#2a2a2a]`}><Money v={total.net} strong /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-600">
        Salaries reach here when payroll for the month is approved. A month whose payroll is not approved yet shows no
        salaries, so its net profit reads higher than it will end.
      </p>

      <MonthLocks onChanged={() => void load()} />
    </div>
  )
}

/*
  Closing a month.

  Once Accounts closes a month nothing dated in it can change — sales,
  payments, purchases, job work cost, expenses, salaries — so the
  October profit read today is the October profit next year. Only a
  Super Admin reopens one, with a reason, and both are kept.

  The database will not close a month with payments still waiting or a
  price change still undecided in it: once closed, nobody could finish
  them.
*/
function MonthLocks({ onChanged }: { onChanged: () => void }) {
  const { role } = useAuth()
  const isSuper = role === 'super_admin'
  const [rows, setRows] = useState<MonthRow[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [why, setWhy] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fin_months', { p_count: 12 })
    setRows((data ?? []) as MonthRow[])
  }, [])

  useEffect(() => { void load() }, [load])

  async function close(m: MonthRow) {
    if (!confirm(`Close ${monthName(m.month)}? Nothing dated in it can change after this. Only a Super Admin can reopen it.`)) return
    setBusy(m.month); setMsg(null)
    const r = await closeMonth(m.month)
    setBusy('')
    if (!r.ok) return setMsg({ ok: false, text: r.reason })
    setMsg({ ok: true, text: `${monthName(m.month)} is closed.` })
    void load(); onChanged()
  }

  async function reopen(m: MonthRow) {
    if (why.trim().length < 3) return setMsg({ ok: false, text: 'Say why it is being reopened.' })
    setBusy(m.month); setMsg(null)
    const r = await reopenMonth(m.month, why)
    setBusy('')
    if (!r.ok) return setMsg({ ok: false, text: r.reason })
    setAsking(null); setWhy('')
    void load(); onChanged()
  }

  return (
    <section className="rounded-xl border border-[#242424] bg-[#151515]">
      <div className="border-b border-[#242424] px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-white"><Lock size={15} className="text-orange-400" /> Close a month</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          After a month is closed, nothing dated in it changes. Close it once payments are confirmed and payroll is approved.
        </p>
      </div>
      {msg && (
        <p className={`mx-4 mt-3 rounded-lg px-3 py-2 text-xs ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{msg.text}</p>
      )}
      <ul className="divide-y divide-[#202020]">
        {rows.map((m) => (
          <li key={m.month} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-36 text-sm text-white">{monthName(m.month)}</span>
              {m.locked ? (
                <span className="flex items-center gap-1.5 rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                  <Lock size={12} /> Closed{m.locked_name && ` by ${m.locked_name}`}{m.locked_at && ` · ${fmtDate(m.locked_at)}`}
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  Open
                  {m.waiting_payments > 0 && <span className="text-amber-300"> · {m.waiting_payments} payment{m.waiting_payments === 1 ? '' : 's'} waiting</span>}
                  {m.last_action === 'reopened' && <span className="text-gray-600"> · reopened: {m.last_note}</span>}
                </span>
              )}
              <span className="ml-auto">
                {!m.locked && (
                  <button onClick={() => close(m)} disabled={busy === m.month}
                          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                    {busy === m.month ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />} Close
                  </button>
                )}
                {m.locked && isSuper && (
                  <button onClick={() => { setAsking(m.month); setWhy('') }}
                          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white">
                    <LockOpen size={12} /> Reopen
                  </button>
                )}
              </span>
            </div>
            {asking === m.month && (
              <div className="mt-2 flex gap-2">
                <input value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder="Why — this is kept"
                       onKeyDown={(e) => { if (e.key === 'Enter') void reopen(m) }}
                       className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none" />
                <button onClick={() => reopen(m)} disabled={busy === m.month} className="shrink-0 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white disabled:opacity-50">Reopen</button>
                <button onClick={() => setAsking(null)} className="shrink-0 text-xs text-gray-500 hover:text-white">Cancel</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Big({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#242424] bg-[#151515] p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        {good === true && <TrendingUp size={13} className="text-green-400" />}
        {good === false && <TrendingDown size={13} className="text-red-400" />}
        {label}
      </p>
      <p className={`mt-1.5 truncate text-xl font-semibold tabular-nums ${good === false ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function Money({ v, sub, strong }: { v: number; sub?: string; strong?: boolean }) {
  return (
    <>
      <span className={`${v < 0 ? 'text-red-400' : 'text-green-400'} ${strong ? 'font-semibold' : ''}`}>{inr(v)}</span>
      {sub && <span className="block text-[11px] text-gray-600">{sub}</span>}
    </>
  )
}
