import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle, CheckCircle2, Download, Eye, Loader2, Paperclip, Pencil, Plus, Receipt, Search, Trash2, Users, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authUser } from '../../lib/auth'
import { DateField } from '../DateField'
import { downloadXlsx } from '../../lib/xlsx'
import ProjectPicker, { type PickedProject } from '../projects/ProjectPicker'
import {
  addCategory, branchLabel, fmtDate, inr, loadBranchList, loadCategories, MODES, modeLabel, openProof,
  PERIODS, removeExpense, removePurchase, saveExpense, savePurchase, syncSalaries, todayIST, uploadProof,
  type BranchLite, type Category, type ExpenseRow, type PayMode, type PurchaseRow,
} from './financeUtils'

/*
  Costs — what went out.

  PURCHASES: what was bought to deliver a client's order. Job work comes
  in on its own from the Job Work register (the vendor cost is never
  typed twice); anything bought another way is added here.

  EXPENSES: what it costs to keep a branch open — rent, light, courier,
  and salaries. Salaries arrive by themselves when payroll is approved.

  Amounts are WITHOUT GST. GST paid on a bill is written beside it and
  kept out of the profit, the same way it is on the sales side.
*/

type Tab = 'purchases' | 'expenses'

export default function CostsBoard({ initialTab = 'purchases' }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [period, setPeriod] = useState<string>('month')
  const [from, setFrom] = useState(PERIODS[0].range().from)
  const [to, setTo] = useState(PERIODS[0].range().to)
  const [branchF, setBranchF] = useState('all')
  const [q, setQ] = useState('')

  const [branches, setBranches] = useState<BranchLite[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [onlyUnlinked, setOnlyUnlinked] = useState(false)
  const [catF, setCatF] = useState('all')
  const [editP, setEditP] = useState<PurchaseRow | 'new' | null>(null)
  const [editE, setEditE] = useState<ExpenseRow | 'new' | null>(null)
  const [busy, setBusy] = useState('')
  const [salMonth, setSalMonth] = useState(() => todayIST().slice(0, 7))

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 5000)
    return () => clearTimeout(t)
  }, [msg])

  useEffect(() => {
    void (async () => {
      const [b, c] = await Promise.all([loadBranchList(), loadCategories()])
      setBranches(b); setCats(c)
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const args = { p_from: from || null, p_to: to || null }
    const [p, e] = await Promise.all([supabase.rpc('fin_purchases', args), supabase.rpc('fin_expenses', args)])
    setLoading(false)
    if (p.error || e.error) return setMsg({ ok: false, text: (p.error ?? e.error)!.message })
    setPurchases((p.data ?? []) as PurchaseRow[])
    setExpenses((e.data ?? []) as ExpenseRow[])
  }, [from, to])

  useEffect(() => { void load() }, [load])

  function pickPeriod(key: string) {
    const r = PERIODS.find((x) => x.key === key)!.range()
    setPeriod(key); setFrom(r.from); setTo(r.to)
  }

  const inBranch = (id: string | null) =>
    branchF === 'all' ? true : branchF === 'none' ? !id : id === branchF

  const shownP = useMemo(() => {
    const t = q.trim().toLowerCase()
    return purchases.filter((r) => {
      if (!inBranch(r.branch_id)) return false
      if (onlyUnlinked && (r.kind !== 'job_work' || r.project_id)) return false
      if (!t) return true
      return [r.ref_code, r.project_code, r.client_name, r.vendor, r.item, r.bill_no].join(' ').toLowerCase().includes(t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, branchF, onlyUnlinked, q])

  const shownE = useMemo(() => {
    const t = q.trim().toLowerCase()
    return expenses.filter((r) => {
      if (!inBranch(r.branch_id)) return false
      if (catF !== 'all' && r.category_id !== catF) return false
      if (!t) return true
      return [r.category, r.paid_to, r.note, r.reference].join(' ').toLowerCase().includes(t)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, branchF, catF, q])

  const unlinked = purchases.filter((r) => r.kind === 'job_work' && !r.project_id && inBranch(r.branch_id)).length
  const sumP = shownP.reduce((n, r) => n + Number(r.amount), 0)
  const gstP = shownP.reduce((n, r) => n + Number(r.gst_amount), 0)
  const sumE = shownE.reduce((n, r) => n + Number(r.amount), 0)
  const gstE = shownE.reduce((n, r) => n + Number(r.gst_amount), 0)

  // Expenses by category, for the strip of chips — the first thing
  // anyone asks of a month's costs is "where did it go".
  const byCat = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sum: number }>()
    for (const r of expenses) {
      if (!inBranch(r.branch_id)) continue
      if (!m.has(r.category_id)) m.set(r.category_id, { id: r.category_id, name: r.category, sum: 0 })
      m.get(r.category_id)!.sum += Number(r.amount)
    }
    return [...m.values()].sort((a, b) => b.sum - a.sum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, branchF])

  async function delP(r: PurchaseRow) {
    if (!confirm(`Remove the ${inr(r.amount)} purchase from ${r.vendor}?`)) return
    setBusy(r.id)
    const res = await removePurchase(r.id)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    void load()
  }

  async function delE(r: ExpenseRow) {
    if (!confirm(`Remove the ${inr(r.amount)} ${r.category} expense?`)) return
    setBusy(r.id)
    const res = await removeExpense(r.id)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    void load()
  }

  async function postSalaries() {
    setBusy('sal')
    const res = await syncSalaries(`${salMonth}-01`)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setMsg({ ok: true, text: `Salaries for ${salMonth} posted for ${res.branches ?? 0} ${res.branches === 1 ? 'branch' : 'branches'}.` })
    void load()
  }

  function toExcel() {
    const span = `${from || 'start'}_to_${to || 'today'}`
    if (tab === 'purchases') {
      downloadXlsx(`purchases_${span}`, [{
        name: 'Purchases',
        columns: [
          { header: 'Date', kind: 'date', width: 12 }, { header: 'Kind', width: 10 }, { header: 'Ref', width: 10 },
          { header: 'Branch', width: 8 }, { header: 'Project', width: 10 }, { header: 'Client', width: 24 },
          { header: 'Vendor', width: 22 }, { header: 'Item', width: 24 }, { header: 'Bill no', width: 12 },
          { header: 'Amount without GST', kind: 'money', width: 16 }, { header: 'GST', kind: 'money', width: 12 },
        ],
        rows: shownP.map((r) => [
          r.bought_on, r.kind === 'job_work' ? 'Job work' : 'Other', r.ref_code ?? '', r.branch_code ?? r.branch_name ?? '',
          r.project_code ?? '', r.client_name ?? '', r.vendor ?? '', r.item ?? '', r.bill_no ?? '',
          Number(r.amount), Number(r.gst_amount),
        ]),
        total: ['Total', null, null, null, null, `${shownP.length} purchases`, null, null, null, sumP, gstP],
      }])
    } else {
      downloadXlsx(`expenses_${span}`, [
        {
          name: 'Expenses',
          columns: [
            { header: 'Date', kind: 'date', width: 12 }, { header: 'Category', width: 20 }, { header: 'Branch', width: 10 },
            { header: 'Paid to', width: 22 }, { header: 'Mode', width: 12 }, { header: 'Reference', width: 18 },
            { header: 'Amount without GST', kind: 'money', width: 16 }, { header: 'GST', kind: 'money', width: 12 },
            { header: 'Note', width: 30 }, { header: 'From', width: 10 },
          ],
          rows: shownE.map((r) => [
            r.spent_on, r.category, r.branch_code ?? r.branch_name ?? 'Company-wide', r.paid_to ?? '',
            r.mode ? modeLabel(r.mode) : '', r.reference ?? '', Number(r.amount), Number(r.gst_amount),
            r.note ?? '', r.source === 'payroll' ? 'Payroll' : 'Entered',
          ]),
          total: ['Total', `${shownE.length} expenses`, null, null, null, null, sumE, gstE, null, null],
        },
        {
          name: 'By category',
          columns: [{ header: 'Category', width: 24 }, { header: 'Amount', kind: 'money', width: 16 }],
          rows: byCat.map((c) => [c.name, c.sum]),
          total: ['Total', byCat.reduce((n, c) => n + c.sum, 0)],
        },
      ])
    }
  }

  const pick = 'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'
  const th = 'border-b border-[#242424] px-4 py-3 font-normal'
  const td = 'border-t border-[#202020] px-4 py-2.5'
  const iconBtn = 'rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white disabled:opacity-30'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Receipt size={22} className="text-orange-400" />
            Purchases &amp; expenses
          </h1>
          <p className="mt-1 text-sm text-gray-400">Everything that went out. Amounts are without GST.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toExcel} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white">
            <Download size={15} /> Excel
          </button>
          <button
            onClick={() => (tab === 'purchases' ? setEditP('new') : setEditE('new'))}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={15} /> {tab === 'purchases' ? 'Add purchase' : 'Add expense'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="flex gap-1 border-b border-[#242424]">
        {([['purchases', `Purchases · ${inr(purchases.filter((r) => inBranch(r.branch_id)).reduce((n, r) => n + Number(r.amount), 0))}`],
           ['expenses', `Expenses · ${inr(expenses.filter((r) => inBranch(r.branch_id)).reduce((n, r) => n + Number(r.amount), 0))}`]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------------- filters ---------------- */}
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
        <select value={branchF} onChange={(e) => setBranchF(e.target.value)} aria-label="Branch" className={pick}>
          <option value="all">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{branchLabel(b)}</option>)}
          <option value="none">{tab === 'expenses' ? 'Company-wide' : 'No branch'}</option>
        </select>
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ================= PURCHASES ================= */}
      {tab === 'purchases' && (
        <>
          {unlinked > 0 && (
            <button
              onClick={() => setOnlyUnlinked((v) => !v)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm ${
                onlyUnlinked ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              <span>
                {unlinked} job {unlinked === 1 ? 'work is' : 'works are'} not tied to a project, so {unlinked === 1 ? 'its' : 'their'} cost
                reaches no project's profit. Open each on the Job Work screen → Edit → pick the project.
              </span>
              <span className="shrink-0 text-xs underline">{onlyUnlinked ? 'Show all' : 'Show them'}</span>
            </button>
          )}

          <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className={th}>Date</th><th className={th}>From</th><th className={th}>Vendor &amp; item</th>
                    <th className={th}>Project</th><th className={th}>Branch</th>
                    <th className={`${th} text-right`}>Amount</th><th className={`${th} text-right`}>GST</th><th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {shownP.map((r) => (
                    <tr key={`${r.kind}-${r.id}`} className="align-top hover:bg-[#1a1a1a]">
                      <td className={`${td} whitespace-nowrap text-xs text-gray-400`}>{fmtDate(r.bought_on)}</td>
                      <td className={td}>
                        {r.kind === 'job_work'
                          ? <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-300">Job work {r.ref_code}</span>
                          : <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[11px] text-gray-400">Bought{r.bill_no ? ` · ${r.bill_no}` : ''}</span>}
                      </td>
                      <td className={td}>
                        <span className="block text-white">{r.vendor ?? '—'}</span>
                        {r.item && <span className="block max-w-[260px] truncate text-xs text-gray-500">{r.item}</span>}
                      </td>
                      <td className={td}>
                        {r.project_code
                          ? <><span className="font-mono text-xs text-orange-400">{r.project_code}</span><span className="block text-xs text-gray-500">{r.client_name}</span></>
                          : <span className={`text-xs ${r.kind === 'job_work' ? 'text-amber-400' : 'text-gray-600'}`}>
                              {r.kind === 'job_work' ? `Not tied${r.client_name ? ` · ${r.client_name}` : ''}` : '—'}
                            </span>}
                      </td>
                      <td className={`${td} text-xs text-gray-400`}>{r.branch_code ?? r.branch_name ?? '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-white`}>{inr(r.amount)}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-gray-500`}>{Number(r.gst_amount) > 0 ? inr(r.gst_amount) : '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {r.proof_path && <button onClick={() => void openProof(r.proof_path!)} aria-label="Bill" className={iconBtn}><Eye size={14} /></button>}
                        {r.kind === 'other' && (
                          <>
                            <button onClick={() => setEditP(r)} aria-label="Edit" className={iconBtn}><Pencil size={14} /></button>
                            <button onClick={() => delP(r)} disabled={busy === r.id} aria-label="Remove" className={`${iconBtn} hover:text-red-400`}><Trash2 size={14} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shownP.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'No purchases in this period.'}
                    </td></tr>
                  )}
                </tbody>
                {shownP.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold text-white">
                      <td className={td} colSpan={5}>{shownP.length} purchases</td>
                      <td className={`${td} text-right tabular-nums`}>{inr(sumP)}</td>
                      <td className={`${td} text-right tabular-nums text-gray-400`}>{inr(gstP)}</td>
                      <td className={td} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
          <p className="text-xs text-gray-600">
            Job work rows come from the Job Work register and change there. Only purchases added here can be edited here.
          </p>
        </>
      )}

      {/* ================= EXPENSES ================= */}
      {tab === 'expenses' && (
        <>
          {byCat.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCatF('all')}
                className={`rounded-lg px-3 py-1.5 text-xs ${catF === 'all' ? 'bg-orange-500/15 text-orange-300' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'}`}
              >
                All
              </button>
              {byCat.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCatF(catF === c.id ? 'all' : c.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs ${catF === c.id ? 'bg-orange-500/15 text-orange-300' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'}`}
                >
                  {c.name} <span className="tabular-nums text-gray-500">{inr(c.sum)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Salaries arrive by themselves when payroll is approved. This
              is for a month approved before Finance existed, or to check. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#242424] bg-[#151515] px-3 py-2.5 text-sm">
            <Users size={15} className="text-orange-400" />
            <span className="text-gray-300">Salaries come in when payroll is approved.</span>
            <span className="text-gray-500">Post a month by hand:</span>
            <input
              type="month" value={salMonth} onChange={(e) => setSalMonth(e.target.value)}
              aria-label="Month"
              className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-sm text-white"
            />
            <button onClick={postSalaries} disabled={busy === 'sal' || !salMonth} className="rounded-md border border-[#2a2a2a] px-3 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">
              {busy === 'sal' ? <Loader2 size={12} className="animate-spin" /> : 'Post salaries'}
            </button>
          </div>

          <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className={th}>Date</th><th className={th}>Category</th><th className={th}>Branch</th>
                    <th className={th}>Paid to</th><th className={`${th} text-right`}>Amount</th>
                    <th className={`${th} text-right`}>GST</th><th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {shownE.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-[#1a1a1a]">
                      <td className={`${td} whitespace-nowrap text-xs text-gray-400`}>{fmtDate(r.spent_on)}</td>
                      <td className={td}>
                        <span className="text-white">{r.category}</span>
                        {r.source === 'payroll' && <span className="ml-2 rounded bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-300">From payroll</span>}
                        {r.note && <span className="block max-w-[280px] truncate text-xs text-gray-500">{r.note}</span>}
                      </td>
                      <td className={`${td} text-xs text-gray-400`}>{r.branch_code ?? r.branch_name ?? 'Company-wide'}</td>
                      <td className={`${td} text-xs text-gray-400`}>
                        {r.paid_to ?? '—'}
                        {r.mode && <span className="block text-gray-600">{modeLabel(r.mode)}{r.reference ? ` · ${r.reference}` : ''}</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-white`}>{inr(r.amount)}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-gray-500`}>{Number(r.gst_amount) > 0 ? inr(r.gst_amount) : '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {r.proof_path && <button onClick={() => void openProof(r.proof_path!)} aria-label="Bill" className={iconBtn}><Eye size={14} /></button>}
                        {r.source === 'manual' && (
                          <>
                            <button onClick={() => setEditE(r)} aria-label="Edit" className={iconBtn}><Pencil size={14} /></button>
                            <button onClick={() => delE(r)} disabled={busy === r.id} aria-label="Remove" className={`${iconBtn} hover:text-red-400`}><Trash2 size={14} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shownE.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : 'No expenses in this period.'}
                    </td></tr>
                  )}
                </tbody>
                {shownE.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold text-white">
                      <td className={td} colSpan={4}>{shownE.length} expenses</td>
                      <td className={`${td} text-right tabular-nums`}>{inr(sumE)}</td>
                      <td className={`${td} text-right tabular-nums text-gray-400`}>{inr(gstE)}</td>
                      <td className={td} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </>
      )}

      {editP && (
        <PurchaseForm
          row={editP === 'new' ? null : editP}
          branches={branches}
          onClose={() => setEditP(null)}
          onSaved={() => { setEditP(null); setMsg({ ok: true, text: 'Purchase saved.' }); void load() }}
        />
      )}
      {editE && (
        <ExpenseForm
          row={editE === 'new' ? null : editE}
          branches={branches}
          cats={cats}
          onCats={setCats}
          onClose={() => setEditE(null)}
          onSaved={() => { setEditE(null); setMsg({ ok: true, text: 'Expense saved.' }); void load() }}
        />
      )}
    </div>
  )
}

/* ================================================================ forms */

const input = 'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
const label = 'mb-1.5 block text-xs text-gray-500'

function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true"
    >
      <div className="my-auto w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

function useProof() {
  const [file, setFile] = useState<File | null>(null)
  async function upload(): Promise<{ path: string | null } | { error: string }> {
    if (!file) return { path: null }
    const { data: { user } } = await authUser()
    if (!user) return { error: 'Please sign in again.' }
    const r = await uploadProof(user.id, file)
    return 'error' in r ? r : { path: r.path }
  }
  const field = (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400 hover:text-white">
      <Paperclip size={13} /> {file ? file.name : 'Attach the bill (optional)'}
      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </label>
  )
  return { field, upload }
}

function PurchaseForm({ row, branches, onClose, onSaved }: {
  row: PurchaseRow | null; branches: BranchLite[]; onClose: () => void; onSaved: () => void
}) {
  const [on, setOn] = useState(row?.bought_on ?? todayIST())
  const [project, setProject] = useState<PickedProject | null>(
    row?.project_id ? { id: row.project_id, code: row.project_code ?? '', title: row.project_code ?? 'Project', customer_id: '', customer_name: row.client_name ?? '' } : null,
  )
  const [branch, setBranch] = useState(row?.branch_id ?? '')
  const [vendor, setVendor] = useState(row?.vendor ?? '')
  const [item, setItem] = useState(row?.item ?? '')
  const [bill, setBill] = useState(row?.bill_no ?? '')
  const [amount, setAmount] = useState(row ? String(row.amount) : '')
  const [gst, setGst] = useState(row ? String(row.gst_amount) : '0')
  const [note, setNote] = useState(row?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const proof = useProof()

  async function save() {
    setBusy(true); setErr('')
    const up = await proof.upload()
    if ('error' in up) { setBusy(false); return setErr(up.error) }
    const r = await savePurchase({
      id: row?.id ?? null, boughtOn: on, branch: branch || null, project: project?.id ?? null, vendor,
      amount: Number(amount), gst: Number(gst) || 0, item, billNo: bill, note, proofPath: up.path,
    })
    setBusy(false)
    if (!r.ok) return setErr(r.reason)
    onSaved()
  }

  return (
    <Modal
      title={row ? 'Change purchase' : 'Add a purchase'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
        <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} Save
        </button>
      </>}
    >
      {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
      <p className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-gray-500">
        For things bought another way. Printing given to a vendor goes on the Job Work screen — it shows here by itself.
      </p>
      <div>
        <label className={label}>For which project (if any)</label>
        <ProjectPicker value={project} onPick={setProject} placeholder="Not for a project" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Bought on</label><DateField value={on} onChange={(v) => setOn(v ?? '')} /></div>
        <div>
          <label className={label}>Branch</label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={input}>
            <option value="">{project ? "The project's branch" : 'No branch'}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{branchLabel(b)}</option>)}
          </select>
        </div>
        <div><label className={label}>Vendor</label><input value={vendor} onChange={(e) => setVendor(e.target.value)} className={input} autoFocus /></div>
        <div><label className={label}>Bill number</label><input value={bill} onChange={(e) => setBill(e.target.value)} className={input} /></div>
      </div>
      <div><label className={label}>What was bought</label><input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Art paper 300 gsm, 20 reams" className={input} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Amount without GST (₹)</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={`${input} tabular-nums`} />
        </div>
        <div>
          <label className={label}>GST on the bill (₹)</label>
          <input type="number" min={0} step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={`${input} tabular-nums`} />
        </div>
      </div>
      <div><label className={label}>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} className={input} /></div>
      {proof.field}
    </Modal>
  )
}

function ExpenseForm({ row, branches, cats, onCats, onClose, onSaved }: {
  row: ExpenseRow | null; branches: BranchLite[]; cats: Category[]; onCats: (c: Category[]) => void
  onClose: () => void; onSaved: () => void
}) {
  const [on, setOn] = useState(row?.spent_on ?? todayIST())
  const [branch, setBranch] = useState(row?.branch_id ?? '')
  const [cat, setCat] = useState(row?.category_id ?? '')
  const [amount, setAmount] = useState(row ? String(row.amount) : '')
  const [gst, setGst] = useState(row ? String(row.gst_amount) : '0')
  const [paidTo, setPaidTo] = useState(row?.paid_to ?? '')
  const [mode, setMode] = useState<PayMode | ''>(row?.mode ?? '')
  const [ref, setRef] = useState(row?.reference ?? '')
  const [note, setNote] = useState(row?.note ?? '')
  const [newCat, setNewCat] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const proof = useProof()

  async function makeCat() {
    if (!newCat?.trim()) return
    const r = await addCategory(newCat)
    if (!r.ok) return setErr(r.reason)
    const list = await loadCategories()
    onCats(list)
    if (r.id) setCat(r.id)
    setNewCat(null)
  }

  async function save() {
    if (!cat) return setErr('Pick what it was for.')
    setBusy(true); setErr('')
    const up = await proof.upload()
    if ('error' in up) { setBusy(false); return setErr(up.error) }
    const r = await saveExpense({
      id: row?.id ?? null, spentOn: on, branch: branch || null, category: cat, amount: Number(amount),
      gst: Number(gst) || 0, paidTo, mode, reference: ref, note, proofPath: up.path,
    })
    setBusy(false)
    if (!r.ok) return setErr(r.reason)
    onSaved()
  }

  return (
    <Modal
      title={row ? 'Change expense' : 'Add an expense'}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">Cancel</button>
        <button onClick={save} disabled={busy} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
          {busy && <Loader2 size={15} className="animate-spin" />} Save
        </button>
      </>}
    >
      {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}
      <div>
        <label className={label}>What for</label>
        {newCat === null ? (
          <div className="flex gap-2">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
              <option value="">Pick one</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setNewCat('')} className="shrink-0 rounded-lg border border-[#2a2a2a] px-3 text-xs text-gray-300 hover:text-white">+ New</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Tea & snacks" autoFocus className={input}
                   onKeyDown={(e) => { if (e.key === 'Enter') void makeCat() }} />
            <button onClick={makeCat} className="shrink-0 rounded-lg bg-orange-500 px-3 text-xs font-medium text-white">Add</button>
            <button onClick={() => setNewCat(null)} className="shrink-0 text-xs text-gray-500 hover:text-white">Cancel</button>
          </div>
        )}
        {cats.find((c) => c.id === cat)?.is_salary && (
          <p className="mt-1.5 text-xs text-amber-400">
            Payroll salaries come in by themselves. Use this only for pay outside payroll — cash, a freelancer.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Date</label><DateField value={on} onChange={(v) => setOn(v ?? '')} /></div>
        <div>
          <label className={label}>Branch</label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={input}>
            <option value="">Company-wide</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{branchLabel(b)}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>Amount without GST (₹)</label>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={`${input} tabular-nums`} autoFocus />
        </div>
        <div>
          <label className={label}>GST on the bill (₹)</label>
          <input type="number" min={0} step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={`${input} tabular-nums`} />
        </div>
        <div><label className={label}>Paid to</label><input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Landlord, PGVCL…" className={input} /></div>
        <div>
          <label className={label}>How paid</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as PayMode | '')} className={input}>
            <option value="">—</option>
            {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} className={`${input} font-mono`} /></div>
        <div><label className={label}>Note</label><input value={note} onChange={(e) => setNote(e.target.value)} className={input} /></div>
      </div>
      {proof.field}
    </Modal>
  )
}
