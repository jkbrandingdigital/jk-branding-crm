import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Clock, Download, Loader2, Package,
  Plus, Search, ShieldCheck, Truck,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import JobWorkDetail from './JobWorkDetail'
import JobWorkModal from './JobWorkModal'
import {
  downloadCsv, fmtDate, inr, loadBoard, loadCounts, loadNames,
  PERIODS, stageLabel, stageTone, STAGES, windowOf,
  type JobWork, type JwCounts, type Period, type PrintName,
} from './jobWorkUtils'

/*
  Job Work & Dispatch — the register.

  One line per order sent to a printer: who it is for, what it is,
  which vendor has it, and where it has got to.

  The question this answers at four o'clock is "what is sitting with
  dispatch waiting to be checked", and the stage filter answers it in
  one click. The tiles across the top are the same question for the
  whole month.
*/

export default function JobWorkBoard() {
  const { can, ready } = usePermissions()

  const [rows, setRows] = useState<JobWork[]>([])
  const [counts, setCounts] = useState<JwCounts | null>(null)
  const [services, setServices] = useState<PrintName[]>([])
  const [offsets, setOffsets] = useState<PrintName[]>([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<Period>('month')
  const [stage, setStage] = useState<string>('all')
  const [q, setQ] = useState('')

  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const loadLists = useCallback(async () => {
    const [s, o] = await Promise.all([loadNames('print_services'), loadNames('print_offsets')])
    setServices(s)
    setOffsets(o)
  }, [])

  /*
    `can` is a fresh function on every render, so it can never go in a
    dependency list — the effect would run for ever. `ready` is the
    thing to wait on. That trap is written up in the project map; it
    cost an afternoon once.
  */
  const load = useCallback(async () => {
    setLoading(true)
    const win = windowOf(period)
    const [{ rows: r, error }, c] = await Promise.all([
      loadBoard(win?.from ?? null, win?.to ?? null, stage, ''),
      loadCounts(win?.from ?? null, win?.to ?? null),
    ])
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error })
    setRows(r)
    setCounts(c)
  }, [period, stage])

  useEffect(() => { void loadLists() }, [loadLists])
  useEffect(() => { if (ready) void load() }, [load, ready])

  // Searching happens here, not in the database. A month is a few
  // hundred rows, already in hand; a query per keystroke is not.
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) =>
      r.client_name.toLowerCase().includes(t) ||
      r.jw_code.toLowerCase().includes(t) ||
      (r.vendor_name ?? '').toLowerCase().includes(t) ||
      (r.product_name ?? '').toLowerCase().includes(t) ||
      (r.project_name ?? '').toLowerCase().includes(t))
  }, [rows, q])

  async function addName(table: 'print_services' | 'print_offsets', name: string): Promise<PrintName | null> {
    const { data, error } = await supabase.from(table).insert({ name }).select('id, name, active').single()
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return null
    }
    await loadLists()
    return data as PrintName
  }

  function toExcel() {
    downloadCsv(
      `job-work-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Job ID', 'Given on', 'Client', 'Project', 'Product', 'Vendor', 'Qty', 'Rate', 'Total', 'Paid', 'Open', 'Stage', 'Due', 'LR'],
      shown.map((r) => [
        r.jw_code, fmtDate(r.job_at), r.client_name, r.project_name ?? '',
        r.product_name ?? r.product_note ?? '', r.vendor_name ?? '',
        r.qty, r.rate, r.amount, r.paid_amount ?? 0, r.pending_amount ?? 0,
        stageLabel(r.stage), fmtDate(r.due_at), r.last_lr_no ?? '',
      ]),
    )
  }

  if (ready && !can('mod_job_works')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Job Work is not switched on for you.
      </div>
    )
  }

  // One screen, two views. The detail page is not a route of its own —
  // coming back should put the list exactly where it was, filters and
  // all, and that is free if the list never unmounted.
  if (openId) {
    return (
      <JobWorkDetail
        jobId={openId}
        services={services}
        offsets={offsets}
        onAddName={addName}
        onBack={() => { setOpenId(null); void load() }}
      />
    )
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="space-y-5">
      {/* ---------------- heading ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Package size={22} className="text-orange-400" />
            Job Work &amp; Dispatch
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            What went to which vendor, how far it has got, and what has shipped.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
          {can('job_work_create') && (
            <button
              onClick={() => setNewOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              <Plus size={15} /> New job work
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* ---------------- tiles ----------------
          Each one is a filter as well as a number — seeing that six are
          waiting on a check is only useful if the next click shows
          which six. */}
      {counts && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Tile label="Open jobs" value={String(counts.total)}
                icon={<Package size={15} />} tone="bg-[#1f1f1f] text-gray-300"
                onClick={() => setStage('all')} on={stage === 'all'} />
          <Tile label="In production" value={String(counts.in_production)}
                icon={<Clock size={15} />} tone="bg-amber-500/10 text-amber-400"
                onClick={() => setStage('production')} on={stage === 'production'} />
          <Tile label="Waiting on QC" value={String(counts.qc_waiting)}
                icon={<ShieldCheck size={15} />} tone="bg-sky-500/10 text-sky-400"
                onClick={() => setStage('production_done')} on={stage === 'production_done'} />
          <Tile label="Ready to ship" value={String(counts.ready)}
                icon={<CheckCircle2 size={15} />} tone="bg-green-500/10 text-green-400"
                onClick={() => setStage('qc_passed')} on={stage === 'qc_passed'} />
          <Tile label="Shipped" value={String(counts.dispatched)}
                icon={<Truck size={15} />} tone="bg-blue-500/10 text-blue-400"
                onClick={() => setStage('dispatched')} on={stage === 'dispatched'} />
          <Tile label="Vendor cost" value={inr(counts.value)}
                sub={`${inr(counts.pending_pay)} still open`}
                icon={<AlertCircle size={15} />} tone="bg-orange-500/10 text-orange-400" />
        </div>
      )}

      {/* ---------------- filters ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search job ID, client, vendor, product"
            className={`${input} pl-9`}
          />
        </div>

        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
        >
          <option value="all">All stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
        {counts && counts.late > 0 && <span className="text-red-400"> · {counts.late} past their date</span>}
      </p>

      {/* ---------------- the register ---------------- */}
      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                {['Job ID', 'Client & project', 'Product', 'Vendor', 'Qty', 'Value', 'Stage', 'Due'].map((h) => (
                  <th key={h} className="border-b border-[#242424] px-4 py-3 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className="cursor-pointer align-top transition-colors hover:bg-[#1a1a1a]"
                >
                  <td className="border-t border-[#202020] px-4 py-3 whitespace-nowrap tabular-nums font-medium text-orange-400">
                    {r.jw_code}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3">
                    <span className="font-medium text-white">{r.client_name}</span>
                    {r.project_name && <span className="block text-xs text-gray-500">{r.project_name}</span>}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3 text-gray-300">
                    {r.product_name ?? r.product_note ?? '—'}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3 text-gray-300">{r.vendor_name ?? '—'}</td>
                  <td className="border-t border-[#202020] px-4 py-3 whitespace-nowrap tabular-nums text-gray-300">
                    {Number(r.qty).toLocaleString('en-IN')}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3 whitespace-nowrap tabular-nums">
                    <span className="text-white">{inr(r.amount)}</span>
                    {Number(r.pending_amount ?? 0) > 0 && (
                      <span className="block text-xs text-gray-500">{inr(r.pending_amount)} open</span>
                    )}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${stageTone(r.stage)}`}>
                      {stageLabel(r.stage)}
                    </span>
                    {r.last_lr_no && (
                      <span className="mt-1 block text-xs tabular-nums text-gray-500">LR {r.last_lr_no}</span>
                    )}
                  </td>
                  <td className="border-t border-[#202020] px-4 py-3 whitespace-nowrap">
                    <span className={r.is_late ? 'text-red-400' : 'text-gray-300'}>{fmtDate(r.due_at)}</span>
                  </td>
                </tr>
              ))}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q.trim() || stage !== 'all' ? 'Nothing matches.' : 'No job work here yet.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 size={18} className="mx-auto animate-spin text-gray-500" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {newOpen && (
        <JobWorkModal
          job={null}
          services={services}
          offsets={offsets}
          canEditLists={can('print_lists_edit')}
          onAddName={addName}
          onClose={() => setNewOpen(false)}
          onSaved={(row) => { setNewOpen(false); setOpenId(row.id) }}
        />
      )}
    </div>
  )
}

function Tile({ label, value, sub, icon, tone, onClick, on }: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; tone: string
  onClick?: () => void; on?: boolean
}) {
  const Box = onClick ? 'button' : 'div'
  return (
    <Box
      onClick={onClick}
      className={`min-w-0 rounded-xl border bg-[#151515] p-4 text-left transition-colors ${
        on ? 'border-orange-600/50' : 'border-[#242424]'
      } ${onClick ? 'hover:border-orange-600/40' : ''}`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <p className="truncate text-lg font-semibold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </Box>
  )
}