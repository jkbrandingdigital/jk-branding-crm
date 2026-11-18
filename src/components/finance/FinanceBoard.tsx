import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle, Building2, Download, IndianRupee, Loader2, Receipt, Search, Settings2, Users, Wallet, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { DateField } from '../DateField'
import { downloadXlsx } from '../../lib/xlsx'
import ProjectPayments from './ProjectPayments'
import {
  fmtDate, inr, PAY_STATUS, PERIODS, type BoardRow, type PayStatus,
} from './financeUtils'

/*
  Sales & payments — the Accounts view.

  Every project sold in the period, with what it was sold for (without
  GST), the GST on top, what the client has paid that Accounts has
  confirmed, and what is still due. Cut by branch and by sales person,
  and the same cuts go to Excel.

  The period is the BOOKING date — "deals done in October" — which is
  also what the sales performance and incentive count by, so October
  reads the same on every screen. "Still due" is as of today.

  All rows come in one call and are cut here. A month is a few hundred
  projects; a query per click would be slower and no more correct.
*/

type StatusFilter = 'all' | 'pending' | 'clear' | PayStatus

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Payment pending' },
  { key: 'clear', label: 'Clear' },
  { key: 'overpaid', label: 'Overpaid' },
  { key: 'no_price', label: 'No price' },
]

const matches = (s: PayStatus, f: StatusFilter) =>
  f === 'all' ? true
  : f === 'pending' ? s === 'unpaid' || s === 'partly'
  : f === 'clear' ? s === 'paid'
  : s === f

type Sum = { deals: number; base: number; gst: number; total: number; confirmed: number; waiting: number; due: number }
const zero = (): Sum => ({ deals: 0, base: 0, gst: 0, total: 0, confirmed: 0, waiting: 0, due: 0 })
function add(s: Sum, r: BoardRow) {
  s.deals += 1
  s.base += Number(r.base); s.gst += Number(r.gst_amount); s.total += Number(r.total)
  s.confirmed += Number(r.confirmed); s.waiting += Number(r.waiting)
  // Overpaid shows as nothing due, not as a negative that eats into
  // other clients' dues in the total.
  s.due += Math.max(Number(r.due), 0)
}

export default function FinanceBoard() {
  const { role } = useAuth()
  const isSuper = role === 'super_admin'

  const [rows, setRows] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [period, setPeriod] = useState<string>('month')
  const [from, setFrom] = useState(PERIODS[0].range().from)
  const [to, setTo] = useState(PERIODS[0].range().to)
  const [branchF, setBranchF] = useState('all')
  const [sellerF, setSellerF] = useState('all')
  const [statusF, setStatusF] = useState<StatusFilter>('all')
  const [q, setQ] = useState('')

  const [open, setOpen] = useState<BoardRow | null>(null)
  const [codesOpen, setCodesOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const { data, error } = await supabase.rpc('fin_sales_board', { p_from: from || null, p_to: to || null })
    setLoading(false)
    if (error) return setErr(error.message)
    setRows((data ?? []) as BoardRow[])
  }, [from, to])

  useEffect(() => { void load() }, [load])

  function pickPeriod(key: string) {
    const p = PERIODS.find((x) => x.key === key)!
    const r = p.range()
    setPeriod(key); setFrom(r.from); setTo(r.to)
  }

  // Branches and people come from the rows, so a choice can never come
  // back empty — the same rule the customer list uses.
  const branches = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code: string | null }>()
    for (const r of rows) if (r.branch_id) m.set(r.branch_id, { id: r.branch_id, name: r.branch_name ?? '—', code: r.branch_code })
    return [...m.values()].sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name))
  }, [rows])

  const sellers = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.seller_id) m.set(r.seller_id, r.seller_name ?? '—')
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  // Everything but the status — so the status chips can show their own counts.
  const narrowed = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (branchF === 'none' && r.branch_id) return false
      if (branchF !== 'all' && branchF !== 'none' && r.branch_id !== branchF) return false
      if (sellerF !== 'all' && r.seller_id !== sellerF) return false
      if (!t) return true
      return [r.project_code, r.title, r.customer_name, r.customer_code, r.seller_name ?? '', r.gstin ?? '']
        .join(' ').toLowerCase().includes(t)
    })
  }, [rows, branchF, sellerF, q])

  const shown = useMemo(() => narrowed.filter((r) => matches(r.status, statusF)), [narrowed, statusF])

  const totals = useMemo(() => { const s = zero(); shown.forEach((r) => add(s, r)); return s }, [shown])

  const byBranch = useMemo(() => {
    const m = new Map<string, { key: string; code: string | null; name: string; sum: Sum }>()
    for (const r of shown) {
      const key = r.branch_id ?? 'none'
      if (!m.has(key)) m.set(key, { key, code: r.branch_code, name: r.branch_name ?? 'No branch', sum: zero() })
      add(m.get(key)!.sum, r)
    }
    return [...m.values()].sort((a, b) => b.sum.base - a.sum.base)
  }, [shown])

  const byPerson = useMemo(() => {
    const m = new Map<string, { key: string; name: string; branch: string; sum: Sum }>()
    for (const r of shown) {
      const key = r.seller_id ?? 'none'
      if (!m.has(key)) m.set(key, { key, name: r.seller_name ?? 'Nobody', branch: r.branch_code ?? r.branch_name ?? '—', sum: zero() })
      add(m.get(key)!.sum, r)
    }
    return [...m.values()].sort((a, b) => b.sum.base - a.sum.base)
  }, [shown])

  const filtered = branchF !== 'all' || sellerF !== 'all' || statusF !== 'all' || q.trim() !== ''

  function toExcel() {
    const span = from || to ? `${from || 'start'}_to_${to || 'today'}` : 'all'
    downloadXlsx(`sales-and-payments_${span}`, [
      {
        name: 'Projects',
        columns: [
          { header: 'Project', width: 10 }, { header: 'Booked on', kind: 'date', width: 12 },
          { header: 'Client', width: 28 }, { header: 'Client code', width: 11 }, { header: 'GSTIN', width: 17 },
          { header: 'Branch', width: 8 }, { header: 'Sold by', width: 18 }, { header: 'Work', width: 26 },
          { header: 'Price without GST', kind: 'money', width: 16 }, { header: 'GST %', kind: 'percent', width: 7 },
          { header: 'GST', kind: 'money', width: 12 }, { header: 'To collect', kind: 'money', width: 14 },
          { header: 'Received', kind: 'money', width: 14 }, { header: 'Waiting', kind: 'money', width: 12 },
          { header: 'Still due', kind: 'money', width: 14 }, { header: 'Status', width: 12 },
          { header: 'Last paid', kind: 'date', width: 12 },
          { header: 'Cost (job work + purchases)', kind: 'money', width: 16 }, { header: 'Margin', kind: 'money', width: 14 },
          { header: 'W', kind: 'money', width: 13 },
        ],
        rows: shown.map((r) => [
          r.project_code, r.booked_on, r.customer_name, r.customer_code, r.gstin ?? '',
          r.branch_code ?? r.branch_name ?? '', r.seller_name ?? '', r.title,
          Number(r.base), Number(r.gst_percent), Number(r.gst_amount), Number(r.total),
          Number(r.confirmed), Number(r.waiting), Math.max(Number(r.due), 0),
          PAY_STATUS[r.status].label, r.last_paid_on ?? '', Number(r.cost), Number(r.margin),
          Number(r.nongst ?? 0),
        ]),
        total: ['Total', null, `${totals.deals} projects`, null, null, null, null, null,
          totals.base, null, totals.gst, totals.total, totals.confirmed, totals.waiting, totals.due, null, null,
          shown.reduce((n, r) => n + Number(r.cost), 0), shown.reduce((n, r) => n + Number(r.margin), 0),
          shown.reduce((n, r) => n + Number(r.nongst ?? 0), 0)],
      },
      {
        name: 'By branch',
        columns: [
          { header: 'Code', width: 8 }, { header: 'Branch', width: 18 }, { header: 'Deals', kind: 'number' },
          { header: 'Sales without GST', kind: 'money', width: 16 }, { header: 'GST', kind: 'money', width: 14 },
          { header: 'To collect', kind: 'money', width: 14 }, { header: 'Received', kind: 'money', width: 14 },
          { header: 'Still due', kind: 'money', width: 14 },
        ],
        rows: byBranch.map((b) => [b.code ?? '', b.name, b.sum.deals, b.sum.base, b.sum.gst, b.sum.total, b.sum.confirmed, b.sum.due]),
        total: ['', 'Total', totals.deals, totals.base, totals.gst, totals.total, totals.confirmed, totals.due],
      },
      {
        name: 'By sales person',
        columns: [
          { header: 'Sales person', width: 22 }, { header: 'Branch', width: 10 }, { header: 'Deals', kind: 'number' },
          { header: 'Sales without GST', kind: 'money', width: 16 }, { header: 'To collect', kind: 'money', width: 14 },
          { header: 'Received', kind: 'money', width: 14 }, { header: 'Still due', kind: 'money', width: 14 },
        ],
        rows: byPerson.map((p) => [p.name, p.branch, p.sum.deals, p.sum.base, p.sum.total, p.sum.confirmed, p.sum.due]),
        total: ['Total', '', totals.deals, totals.base, totals.total, totals.confirmed, totals.due],
      },
    ])
  }

  const pick = 'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'
  const th = 'border-b border-[#242424] px-4 py-3 font-normal'
  const td = 'border-t border-[#202020] px-4 py-2.5'
  const num = `${td} whitespace-nowrap text-right tabular-nums`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <IndianRupee size={22} className="text-orange-400" />
            Sales &amp; payments
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            What was sold, by branch and by person — and what the clients have paid against it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuper && (
            <button onClick={() => setCodesOpen(true)} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white">
              <Settings2 size={15} /> Branch codes
            </button>
          )}
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {err && (
        <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400"><AlertCircle size={16} /> {err}</p>
      )}

      {/* ---------------- when ---------------- */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => pickPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="text-xs text-gray-500">
          Booked from
          <DateField value={from} onChange={(v) => { setFrom(v ?? ''); setPeriod('custom') }} className="mt-1 w-40" placeholder="The start" />
        </label>
        <label className="text-xs text-gray-500">
          to
          <DateField value={to} onChange={(v) => { setTo(v ?? ''); setPeriod('custom') }} className="mt-1 w-40" placeholder="Today" />
        </label>
      </div>

      {/* ---------------- the five figures ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon={<Receipt size={15} />} tone="bg-orange-500/10 text-orange-400"
              label="Sales (without GST)" value={inr(totals.base)} sub={`${totals.deals} ${totals.deals === 1 ? 'project' : 'projects'}`} />
        <Tile icon={<IndianRupee size={15} />} tone="bg-sky-500/10 text-sky-400"
              label="GST on top" value={inr(totals.gst)} sub="collected for the government" />
        <Tile icon={<Wallet size={15} />} tone="bg-[#1f1f1f] text-gray-300"
              label="To collect" value={inr(totals.total)} sub="sales + GST" />
        <Tile icon={<Wallet size={15} />} tone="bg-green-500/10 text-green-400"
              label="Received" value={inr(totals.confirmed)}
              sub={totals.waiting > 0 ? `${inr(totals.waiting)} waiting to be confirmed` : 'confirmed by Accounts'} />
        <Tile icon={<AlertCircle size={15} />} tone="bg-red-500/10 text-red-400"
              label="Still due" value={inr(totals.due)}
              sub={totals.total > 0 ? `${Math.round((totals.due / totals.total) * 100)}% of the bill` : '—'} />
      </div>

      {/* ---------------- filters ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-[#2a2a2a] p-0.5">
          {STATUS_FILTERS.map((s) => {
            const n = narrowed.filter((r) => matches(r.status, s.key)).length
            return (
              <button
                key={s.key}
                onClick={() => setStatusF(s.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusF === s.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
                }`}
              >
                {s.label}
                <span className={`rounded px-1.5 ${s.key === 'pending' && n > 0 ? 'bg-red-500/15 text-red-300' : 'bg-[#1f1f1f] text-gray-500'}`}>{n}</span>
              </button>
            )
          })}
        </div>

        <select value={branchF} onChange={(e) => setBranchF(e.target.value)} aria-label="Branch" className={pick}>
          <option value="all">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.code ? `${b.code} · ${b.name}` : b.name}</option>)}
          {rows.some((r) => !r.branch_id) && <option value="none">No branch</option>}
        </select>

        <select value={sellerF} onChange={(e) => setSellerF(e.target.value)} aria-label="Sales person" className={pick}>
          <option value="all">Everyone</option>
          {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {filtered && (
          <button
            onClick={() => { setBranchF('all'); setSellerF('all'); setStatusF('all'); setQ('') }}
            className="rounded-lg px-2.5 py-2 text-xs text-gray-400 hover:text-white"
          >
            Clear
          </button>
        )}

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search client, project, GSTIN"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ---------------- branch and person ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel icon={<Building2 size={15} />} title="By branch">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className={th}>Branch</th><th className={th}>Deals</th>
                <th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Received</th>
                <th className={`${th} text-right`}>Due</th>
              </tr>
            </thead>
            <tbody>
              {byBranch.map((b) => (
                <tr
                  key={b.key}
                  onClick={() => setBranchF(branchF === b.key ? 'all' : b.key)}
                  className={`cursor-pointer hover:bg-[#1a1a1a] ${branchF === b.key ? 'bg-orange-500/5' : ''}`}
                >
                  <td className={td}>
                    {b.code && <span className="mr-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-xs text-orange-300">{b.code}</span>}
                    <span className="text-white">{b.name}</span>
                  </td>
                  <td className={`${td} tabular-nums text-gray-400`}>{b.sum.deals}</td>
                  <td className={`${num} text-white`}>{inr(b.sum.base)}</td>
                  <td className={`${num} text-green-400`}>{inr(b.sum.confirmed)}</td>
                  <td className={`${num} ${b.sum.due > 1 ? 'text-red-400' : 'text-gray-500'}`}>{inr(b.sum.due)}</td>
                </tr>
              ))}
              {byBranch.length === 0 && <EmptyRow cols={5} loading={loading} />}
            </tbody>
          </table>
        </Panel>

        <Panel icon={<Users size={15} />} title="By sales person">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className={th}>Sales person</th><th className={th}>Deals</th>
                <th className={`${th} text-right`}>Sales</th><th className={`${th} text-right`}>Received</th>
                <th className={`${th} text-right`}>Due</th>
              </tr>
            </thead>
            <tbody>
              {byPerson.map((p) => (
                <tr
                  key={p.key}
                  onClick={() => p.key !== 'none' && setSellerF(sellerF === p.key ? 'all' : p.key)}
                  className={`cursor-pointer hover:bg-[#1a1a1a] ${sellerF === p.key ? 'bg-orange-500/5' : ''}`}
                >
                  <td className={td}>
                    <span className="text-white">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-600">{p.branch}</span>
                  </td>
                  <td className={`${td} tabular-nums text-gray-400`}>{p.sum.deals}</td>
                  <td className={`${num} text-white`}>{inr(p.sum.base)}</td>
                  <td className={`${num} text-green-400`}>{inr(p.sum.confirmed)}</td>
                  <td className={`${num} ${p.sum.due > 1 ? 'text-red-400' : 'text-gray-500'}`}>{inr(p.sum.due)}</td>
                </tr>
              ))}
              {byPerson.length === 0 && <EmptyRow cols={5} loading={loading} />}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* ---------------- every project ---------------- */}
      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className={th}>Project</th><th className={th}>Booked</th><th className={th}>Client</th>
                <th className={th}>Branch</th><th className={th}>Sold by</th>
                <th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>GST</th>
                <th className={`${th} text-right`}>To collect</th><th className={`${th} text-right`}>Received</th>
                <th className={`${th} text-right`}>Due</th><th className={th}>Status</th>
                <th className={`${th} text-right`} title="Base price minus job work and purchases on this project">Margin</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = PAY_STATUS[r.status]
                return (
                  <tr key={r.project_id} onClick={() => setOpen(r)} className="cursor-pointer align-top hover:bg-[#1a1a1a]">
                    <td className={td}>
                      <span className="font-mono text-xs text-orange-400">{r.project_code}</span>
                      <span className="block max-w-[200px] truncate text-xs text-gray-500">{r.title}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs text-gray-400`}>{fmtDate(r.booked_on)}</td>
                    <td className={td}>
                      <span className="block max-w-[220px] truncate text-white">{r.customer_name}</span>
                      <span className="font-mono text-[11px] text-gray-600">{r.gstin ?? r.customer_code}</span>
                    </td>
                    <td className={`${td} text-xs text-gray-400`}>{r.branch_code ?? r.branch_name ?? '—'}</td>
                    <td className={`${td} text-xs text-gray-400`}>{r.seller_name ?? '—'}</td>
                    <td className={`${num} text-white`}>{inr(r.base)}</td>
                    <td className={`${num} text-gray-400`}>
                      {Number(r.gst_percent) > 0 ? <>{inr(r.gst_amount)}<span className="block text-[11px] text-gray-600">{Number(r.gst_percent)}%{Number(r.nongst ?? 0) > 0 && <> · W {inr(r.nongst)}</>}</span></> : '—'}
                    </td>
                    <td className={`${num} text-gray-200`}>{inr(r.total)}</td>
                    <td className={`${num} text-green-400`}>
                      {inr(r.confirmed)}
                      {Number(r.waiting) > 0 && <span className="block text-[11px] text-amber-300">+{inr(r.waiting)} waiting</span>}
                    </td>
                    <td className={`${num} ${Number(r.due) > 1 ? 'text-red-400' : 'text-gray-500'}`}>{inr(Math.max(Number(r.due), 0))}</td>
                    <td className={td}>
                      <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                    </td>
                    {/* Blank until something is spent on it — "100%"
                        on a job not yet printed would be a promise. */}
                    <td className={`${num} ${Number(r.margin) < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                      {Number(r.cost) > 0 ? <>{inr(r.margin)}<span className="block text-[11px] text-gray-600">cost {inr(r.cost)}</span></> : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                )
              })}
              {shown.length === 0 && <EmptyRow cols={12} loading={loading} text={filtered ? 'Nothing matches.' : 'No projects booked in this period.'} />}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <Drawer title={`${open.project_code} · ${open.customer_name}`} sub={open.title} onClose={() => { setOpen(null); void load() }}>
          <ProjectPayments projectId={open.project_id} />
        </Drawer>
      )}

      {codesOpen && <BranchCodes onClose={() => { setCodesOpen(false); void load() }} />}
    </div>
  )
}

/* ---------------- small pieces ---------------- */

function Tile({ icon, tone, label, value, sub }: { icon: React.ReactNode; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#242424] bg-[#151515] p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <p className="truncate text-lg font-semibold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
      <h3 className="flex items-center gap-2 border-b border-[#242424] px-4 py-3 text-sm font-medium text-white">
        <span className="text-orange-400">{icon}</span>{title}
      </h3>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function EmptyRow({ cols, loading, text = 'Nothing here.' }: { cols: number; loading: boolean; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-sm text-gray-500">
        {loading ? <Loader2 size={18} className="mx-auto animate-spin" /> : text}
      </td>
    </tr>
  )
}

function Drawer({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true"
    >
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#242424] bg-[#161616] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
            {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/*
  Branch codes — Super Admin only (the database checks too).
  RJ, AH, JM, DL: what every report prints instead of the full name.
*/
function BranchCodes({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<{ id: string; name: string; code: string | null }[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('branches').select('id, name, code').eq('is_active', true).order('name')
      const rows = (data ?? []) as { id: string; name: string; code: string | null }[]
      setList(rows)
      setDraft(Object.fromEntries(rows.map((b) => [b.id, b.code ?? ''])))
    })()
  }, [])

  async function save(id: string) {
    setBusy(id); setMsg('')
    const { data, error } = await supabase.rpc('branch_code_set', { p_branch: id, p_code: draft[id] ?? '' })
    setBusy('')
    const r = data as { ok?: boolean; reason?: string } | null
    if (error || !r?.ok) return setMsg(error?.message ?? r?.reason ?? 'Not saved.')
    setList((l) => l.map((b) => (b.id === id ? { ...b, code: (draft[id] ?? '').toUpperCase() || null } : b)))
  }

  return (
    <Drawer title="Branch codes" sub="Short names for reports and Excel" onClose={onClose}>
      {msg && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{msg}</p>}
      <ul className="space-y-2">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-2 rounded-lg border border-[#242424] bg-[#171717] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-white">{b.name}</span>
            <input
              value={draft[b.id] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [b.id]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) }))}
              placeholder="RJ"
              aria-label={`Code for ${b.name}`}
              className="w-20 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-center font-mono text-sm text-white focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={() => save(b.id)}
              disabled={busy === b.id || (draft[b.id] ?? '') === (b.code ?? '')}
              className="rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-30"
            >
              {busy === b.id ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
          </li>
        ))}
      </ul>
    </Drawer>
  )
}