import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle, ArrowLeft, Building2, CalendarDays, CheckCircle2, CircleDollarSign,
  FileText, Loader2, Package, PackageCheck, Pencil, Plus, ShieldCheck, Truck, User,
} from 'lucide-react'
import { usePermissions } from '../../lib/permissions'
import {
  fmtDT, fmtDate, inr, loadDetail, stageLabel, stageTone, daysLeft,
  type JobWork, type JwDetail, type PrintName,
} from './jobWorkUtils'
import QcModal from './QcModal'
import DispatchModal from './DispatchModal'
import UpdateStageModal from './UpdateStageModal'
import JobWorkModal from './JobWorkModal'

/*
  One job work, start to finish.

  The cycle this screen follows is the one the business already runs:
  sales opens the job, the designer sends the approved artwork, the
  vendor produces it, dispatch checks it and books the courier.

  Everyone on that list sees the same page. What changes between them
  is which buttons are live, and that is decided in the database and
  handed back by jw_detail() — the screen does not work it out.
*/

export default function JobWorkDetail({
  jobId, services, offsets, onBack, onAddName,
}: {
  jobId: string
  services: PrintName[]
  offsets: PrintName[]
  onBack: () => void
  onAddName: (table: 'print_services' | 'print_offsets', name: string) => Promise<PrintName | null>
}) {
  const { can, ready } = usePermissions()
  const [d, setD] = useState<JwDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [tab, setTab] = useState<'updates' | 'qc' | 'files' | 'pay'>('updates')

  const [qcOpen, setQcOpen] = useState(false)
  const [shipOpen, setShipOpen] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { detail, error } = await loadDetail(jobId)
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error })
    setD(detail)
  }, [jobId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  // After any change the whole thing is read again rather than patched
  // in place. One call brings the job, its history, the quality rounds
  // and the shipments back in step — patching four lists by hand is
  // how they drift apart.
  const saved = (text: string) => {
    setMsg({ type: 'ok', text })
    setQcOpen(false); setShipOpen(false); setStageOpen(false); setEditOpen(false)
    void load()
  }

  if (ready && !can('mod_job_works')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Job Work is not switched on for you.
      </div>
    )
  }

  if (loading && !d) {
    return (
      <div className="grid place-items-center rounded-xl border border-[#242424] bg-[#151515] py-20">
        <Loader2 size={22} className="animate-spin text-gray-500" />
      </div>
    )
  }

  const job = d?.job
  if (!job) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        That job work is gone, or it is not yours to see.
      </div>
    )
  }

  const r = d.rights
  const left = daysLeft(job.due_at)
  const paid = Number(job.paid_amount ?? 0)
  const pct = job.amount > 0 ? Math.min(100, Math.round((paid / job.amount) * 100)) : 0

  const card = 'rounded-xl border border-[#242424] bg-[#151515]'
  const fieldBox = 'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white'
  const fieldLabel = 'mb-1.5 block text-xs text-gray-500'

  return (
    <div className="space-y-5">
      {/* ---------------- heading ---------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to the list"
          className="grid h-9 w-9 place-items-center rounded-lg border border-[#2a2a2a] text-gray-400 hover:text-white"
        >
          <ArrowLeft size={17} />
        </button>
        <h1 className="text-2xl font-semibold text-white">Job Work</h1>
        <span className="rounded-lg border border-orange-600/40 bg-orange-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-orange-400">
          {job.jw_code}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${stageTone(job.stage)}`}>
          {stageLabel(job.stage)}
        </span>
        {job.is_late && (
          <span className="rounded-full border border-red-600/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
            Past its date
          </span>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {r.edit && (
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white"
            >
              <Pencil size={15} /> Edit
            </button>
          )}
          <button
            onClick={() => setStageOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={15} /> Production update
          </button>
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

      {/* ---------------- who is on it ----------------
          The cycle in one line, so anyone opening this knows where the
          job sits without reading the whole history. */}
      <div className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-gray-500">Cycle</span>
        {[
          { n: 1, label: 'Sales', done: true },
          { n: 2, label: 'Design', done: !!job.design_sent_at },
          { n: 3, label: 'Vendor', done: ['production_done', 'qc_passed', 'qc_rework', 'dispatched', 'delivered'].includes(job.stage) },
          { n: 4, label: 'Dispatch QC', done: ['dispatched', 'delivered'].includes(job.stage) },
        ].map((s, i) => (
          <span key={s.n} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-600">→</span>}
            <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              s.done
                ? 'border-green-600/40 bg-green-500/10 text-green-400'
                : 'border-[#2a2a2a] bg-[#1a1a1a] text-gray-500'
            }`}>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-black/30 text-[10px]">{s.n}</span>
              {s.label}
            </span>
          </span>
        ))}
        <span className="ml-auto text-xs text-gray-500">
          Everyone with dispatch access can see this, and so can the super admin.
        </span>
      </div>

      {/* ---------------- the six figures ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<User size={15} />} tone="text-sky-400 bg-sky-500/10"
              label="Client" value={job.client_name} sub={job.project_name ?? '—'} />
        <Tile icon={<Package size={15} />} tone="text-orange-400 bg-orange-500/10"
              label="Product" value={job.product_name ?? job.product_note ?? '—'}
              sub={job.product_name && job.product_note ? job.product_note : 'from Printing Media'} />
        <Tile icon={<Building2 size={15} />} tone="text-violet-400 bg-violet-500/10"
              label="Vendor" value={job.vendor_name ?? '—'} sub="where it prints" />
        <Tile icon={<FileText size={15} />} tone="text-sky-400 bg-sky-500/10"
              label="Quantity" value={Number(job.qty).toLocaleString('en-IN')} sub={`${inr(job.rate)} / unit`} />
        <Tile icon={<CircleDollarSign size={15} />} tone="text-amber-400 bg-amber-500/10"
              label="Vendor cost" value={inr(job.amount)} sub={`${inr(paid)} paid`} />
        <Tile icon={<CalendarDays size={15} />} tone="text-green-400 bg-green-500/10"
              label="Due" value={fmtDate(job.due_at)}
              sub={left === null ? '—' : left < 0 ? `${-left} days over` : `${left} days left`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* ============ left ============ */}
        <div className="min-w-0 space-y-5">
          {/* details */}
          <section className={card}>
            <div className="border-b border-[#202020] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Job work details</h3>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Job work ID" value={job.jw_code} mono />
              <Field label="Vendor" value={job.vendor_name ?? '—'} />
              <Field label="Client" value={job.client_name} />
              <Field label="Product" value={job.product_name ?? job.product_note ?? '—'} />
              <Field label="Project" value={job.project_name ?? '—'} />
              <Field label="Job given on" value={fmtDate(job.job_at)} mono />
              <Field label="Quantity" value={Number(job.qty).toLocaleString('en-IN')} mono />
              <Field label="Expected completion" value={fmtDate(job.due_at)} mono />
              <Field label="Rate per unit" value={inr(job.rate)} mono />
              <Field label="Total vendor cost" value={inr(job.amount)} mono />
              <Field label="Payment terms" value={job.payment_terms ?? '—'} />
              <Field label="Opened" value={fmtDT(job.created_at)} />

              <div className="sm:col-span-2">
                <label className={fieldLabel}>Design file — sent to printing</label>
                {job.design_file ? (
                  <div className="flex items-center gap-3 rounded-lg border border-sky-600/30 bg-sky-500/10 px-3 py-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#151515] text-sky-400">
                      <FileText size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-sky-300">{job.design_file}</p>
                      <p className="text-xs text-gray-500">
                        {job.design_sent_at ? `Sent ${fmtDT(job.design_sent_at)}` : 'Not sent yet'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#2a2a2a] px-3 py-3 text-sm text-gray-500">
                    No artwork yet. The designer sends it from Printing Media once the client has signed off.
                  </div>
                )}
              </div>

              {job.instructions && (
                <div className="sm:col-span-2">
                  <label className={fieldLabel}>Job instructions</label>
                  <p className={`${fieldBox} whitespace-pre-wrap leading-relaxed`}>{job.instructions}</p>
                </div>
              )}
            </div>
          </section>

          {/* tabs */}
          <section className={card}>
            <div className="flex gap-1 overflow-x-auto border-b border-[#242424] px-4">
              {([
                ['updates', `Production updates (${d.updates.length})`],
                ['qc', `QC & dispatch (${d.qc.length})`],
                ['files', `Documents (${d.files.length})`],
                ['pay', 'Vendor payment'],
              ] as const).map(([k, text]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                    tab === k ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-white'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>

            {/* production updates */}
            {tab === 'updates' && (
              <Table head={['Date & time', 'Stage', 'Done', 'Remark', 'By']}>
                {d.updates.map((u) => (
                  <tr key={u.id}>
                    <Td mono>{fmtDT(u.at)}</Td>
                    <Td>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${stageTone(u.stage)}`}>
                        {stageLabel(u.stage)}
                      </span>
                    </Td>
                    <Td mono>{Number(u.qty_done).toLocaleString('en-IN')}</Td>
                    <Td>{u.remark ?? '—'}</Td>
                    <Td>{u.by_name ?? '—'}</Td>
                  </tr>
                ))}
                {d.updates.length === 0 && <Empty cols={5}>Nothing recorded yet.</Empty>}
              </Table>
            )}

            {/* qc + shipments */}
            {tab === 'qc' && (
              <div>
                <Table head={['Checked', 'Round', 'Result', 'Note', 'By']}>
                  {d.qc.map((q) => (
                    <tr key={q.id}>
                      <Td mono>{fmtDT(q.checked_at)}</Td>
                      <Td mono>#{q.round}</Td>
                      <Td>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          q.result === 'passed' ? 'bg-green-500/15 text-green-400'
                          : q.result === 'rework' ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-red-500/15 text-red-400'
                        }`}>
                          {q.result === 'passed' ? 'Passed' : q.result === 'rework' ? 'Needs rework' : 'Failed'}
                        </span>
                      </Td>
                      <Td>
                        {q.note ?? '—'}
                        {q.sample_size ? (
                          <span className="block text-xs text-gray-600">
                            {q.sample_size} checked
                            {q.qty_reject ? `, ${q.qty_reject} set aside` : ''}
                          </span>
                        ) : null}
                      </Td>
                      <Td>{q.checked_name ?? '—'}</Td>
                    </tr>
                  ))}
                  {d.qc.length === 0 && <Empty cols={5}>No check yet.</Empty>}
                </Table>

                <div className="border-t border-[#242424] px-5 pb-5 pt-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Shipments</p>
                  {d.dispatch.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Nothing booked. The courier and LR number go in once the check has passed.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {d.dispatch.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-green-600/30 bg-green-500/5 px-4 py-3">
                          <Truck size={17} className="shrink-0 text-green-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-white">
                              {s.courier ?? 'Shipment'}
                              {s.lr_no && <span className="ml-2 tabular-nums text-gray-400">LR {s.lr_no}</span>}
                            </p>
                            <p className="text-xs text-gray-500">
                              {[
                                s.qty_sent ? `${Number(s.qty_sent).toLocaleString('en-IN')} units` : null,
                                s.boxes ? `${s.boxes} boxes` : null,
                                s.weight_kg ? `${s.weight_kg} kg` : null,
                                s.dispatched_at ? `sent ${fmtDate(s.dispatched_at)}` : null,
                                s.eta_on ? `due ${fmtDate(s.eta_on)}` : null,
                              ].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-gray-600">{s.created_name ?? ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* files */}
            {tab === 'files' && (
              <Table head={['File', 'Kind', 'Size', 'Uploaded by']}>
                {d.files.map((f) => (
                  <tr key={f.id}>
                    <Td><span className="font-medium text-white">{f.file_name ?? f.path}</span></Td>
                    <Td className="capitalize">{f.kind}</Td>
                    <Td mono>{f.size_bytes ? `${(f.size_bytes / 1024 / 1024).toFixed(1)} MB` : '—'}</Td>
                    <Td>{f.uploaded_name ?? '—'}</Td>
                  </tr>
                ))}
                {d.files.length === 0 && <Empty cols={4}>Nothing attached.</Empty>}
              </Table>
            )}

            {/* payment */}
            {tab === 'pay' && (
              r.payment ? (
                <Table head={['Paid on', 'Amount', 'Mode', 'Reference', 'Note']}>
                  {d.payments.map((p) => (
                    <tr key={p.id}>
                      <Td mono>{fmtDate(p.paid_on)}</Td>
                      <Td mono><span className="font-medium text-green-400">{inr(p.amount)}</span></Td>
                      <Td>{p.mode ?? '—'}</Td>
                      <Td mono>{p.reference ?? '—'}</Td>
                      <Td>{p.note ?? '—'}</Td>
                    </tr>
                  ))}
                  {d.payments.length === 0 && <Empty cols={5}>Nothing paid yet.</Empty>}
                </Table>
              ) : (
                <p className="px-5 py-10 text-center text-sm text-gray-500">
                  Vendor payment is not switched on for you.
                </p>
              )
            )}
          </section>
        </div>

        {/* ============ right ============ */}
        <div className="space-y-5">
          {/* tracking */}
          <section className={card}>
            <div className="border-b border-[#202020] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Production tracking</h3>
            </div>
            <div className="p-5">
              {d.updates.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing yet.</p>
              ) : (
                <ol className="relative space-y-0">
                  {[...d.updates].reverse().map((u, i, arr) => {
                    const last = i === arr.length - 1
                    return (
                      <li key={u.id} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4 last:pb-0">
                        {!last && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5 bg-[#2a2a2a]" />}
                        <span className={`z-10 grid h-7 w-7 place-items-center rounded-full border-2 ${
                          last
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : 'border-green-600 bg-green-600 text-white'
                        }`}>
                          <CheckCircle2 size={13} />
                        </span>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${last ? 'text-orange-400' : 'text-white'}`}>
                            {stageLabel(u.stage)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            <span className="tabular-nums">{fmtDT(u.at)}</span>
                            {u.by_name && <span className="ml-2 rounded border border-[#2a2a2a] px-1.5 py-0.5">{u.by_name}</span>}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          </section>

          {/* what this person may do */}
          <section className={`${card} p-5`}>
            <h3 className="mb-3 text-sm font-semibold text-white">Quick actions</h3>
            <div className="space-y-2">
              <Action onClick={() => setStageOpen(true)} icon={<Plus size={15} />} solid>
                Add production update
              </Action>
              {r.qc && (
                <Action onClick={() => setQcOpen(true)} icon={<ShieldCheck size={15} />}>
                  Record quality check
                </Action>
              )}
              {r.dispatch && (
                <Action
                  onClick={() => setShipOpen(true)}
                  icon={<Truck size={15} />}
                  disabled={!['qc_passed', 'dispatched', 'delivered'].includes(job.stage)}
                  hint={
                    ['qc_passed', 'dispatched', 'delivered'].includes(job.stage)
                      ? undefined
                      : 'The check has to pass first'
                  }
                >
                  Add courier &amp; LR
                </Action>
              )}
              {r.dispatch && job.stage === 'dispatched' && (
                <Action onClick={() => void markDelivered()} icon={<PackageCheck size={15} />}>
                  Mark delivered
                </Action>
              )}
            </div>
            {!r.qc && !r.dispatch && (
              <p className="mt-3 text-xs text-gray-600">
                Quality check and dispatch are switched on per person, under Employees.
              </p>
            )}
          </section>

          {/* money */}
          {r.payment && (
            <section className={card}>
              <div className="border-b border-[#202020] px-5 py-4">
                <h3 className="text-sm font-semibold text-white">Vendor payment</h3>
              </div>
              <div className="p-5">
                <Row label="Total">{inr(job.amount)}</Row>
                <Row label="Paid" tone="text-green-400">{inr(paid)}</Row>
                <Row label="Still open" tone="text-red-400">{inr(job.pending_amount)}</Row>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
                  <span className="block h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-gray-500">{pct}% settled · {job.payment_terms ?? 'no terms set'}</p>
              </div>
            </section>
          )}

          {/* vendor */}
          <section className={card}>
            <div className="border-b border-[#202020] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Vendor</h3>
            </div>
            <div className="space-y-3 p-5">
              <Row label="Name">{job.vendor_name ?? '—'}</Row>
              <Row label="Jobs here">
                {/* The register already answers this; the link keeps the
                    two screens honest about the same vendor. */}
                <span className="text-gray-400">see Printing Media</span>
              </Row>
              {d.vendor && !d.vendor.active && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  This vendor is off the list now. Old jobs keep the name.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ---------------- windows ---------------- */}
      {stageOpen && (
        <UpdateStageModal job={job} onClose={() => setStageOpen(false)} onSaved={() => saved('Update recorded.')} />
      )}
      {qcOpen && (
        <QcModal job={job} rounds={d.qc} onClose={() => setQcOpen(false)} onSaved={() => saved('Check recorded.')} />
      )}
      {shipOpen && (
        <DispatchModal job={job} shipments={d.dispatch} onClose={() => setShipOpen(false)} onSaved={() => saved('Shipment booked.')} />
      )}
      {editOpen && (
        <JobWorkModal
          job={job}
          services={services}
          offsets={offsets}
          canEditLists={can('print_lists_edit')}
          onAddName={onAddName}
          onClose={() => setEditOpen(false)}
          onSaved={() => saved('Saved.')}
        />
      )}
    </div>
  )

  async function markDelivered() {
    const { supabase } = await import('../../lib/supabase')
    const { error } = await supabase.rpc('jw_delivered', { p_job: job!.id, p_at: null })
    if (error) return setMsg({ type: 'err', text: error.message })
    saved('Marked delivered.')
  }
}

/* ---------------- small pieces ---------------- */

function Tile({ icon, tone, label, value, sub }: {
  icon: React.ReactNode; tone: string; label: string; value: string; sub?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#242424] bg-[#151515] p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      </div>
      <p className="truncate text-base font-semibold text-white" title={value}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs text-gray-500">{label}</label>
      <p className={`truncate rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white ${
        mono ? 'tabular-nums' : ''
      }`} title={value}>
        {value}
      </p>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            {head.map((h) => (
              <th key={h} className="border-b border-[#242424] bg-[#131313] px-5 py-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, mono, className = '' }: { children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <td className={`border-t border-[#202020] px-5 py-3 align-top text-gray-300 ${mono ? 'whitespace-nowrap tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  )
}

function Empty({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-12 text-center text-sm text-gray-500">{children}</td>
    </tr>
  )
}

function Row({ label, children, tone = 'text-white' }: {
  label: string; children: React.ReactNode; tone?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#202020] py-2.5 text-sm last:border-b-0">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold tabular-nums ${tone}`}>{children}</span>
    </div>
  )
}

function Action({ onClick, icon, children, solid, disabled, hint }: {
  onClick: () => void; icon: React.ReactNode; children: React.ReactNode
  solid?: boolean; disabled?: boolean; hint?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        solid
          ? 'bg-orange-500 text-white hover:bg-orange-600'
          : 'border border-[#2a2a2a] text-gray-300 hover:border-orange-600/40 hover:text-white'
      }`}
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${
        solid ? 'bg-white/15 text-white' : 'bg-orange-500/10 text-orange-400'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}