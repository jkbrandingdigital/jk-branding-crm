import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, Building2, CheckCircle2, FileText, FolderKanban, ListTodo,
  Loader2, Mail, Phone, Plus, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import ProjectModal from '../projects/ProjectModal'
import {
  CONTACT_ROLE_LABEL, fmtDate, fmtDT, loadStages, missingOf, money, STAGE_CLS,
  type Customer, type ProjectRow, type ProjectStage,
} from './customerUtils'

/*
  One client, and everything they have had made.

  The question this answers is the one asked on the phone: "what are we
  doing for them right now, and what have we done before?" So the list is
  split in two — running, then finished — rather than sorted by date and
  left for the reader to work out which is which.
*/

export default function CustomerDetail({
  customer, onClose, onChanged, onEditInfo,
}: {
  customer: Customer
  onClose: () => void
  onChanged: () => void
  onEditInfo: () => void
}) {
  const { can } = usePermissions()
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [stages, setStages] = useState<ProjectStage[]>([])
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ProjectRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, st, pr] = await Promise.all([
      supabase.from('project_list').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      loadStages(),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setRows((data ?? []) as ProjectRow[])
    setStages(st)
    setStaff((pr.data ?? []) as { id: string; full_name: string }[])
    setLoading(false)
  }, [customer.id])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const running = rows.filter((p) => !p.is_done)
  const finished = rows.filter((p) => p.is_done)
  const earned = finished.reduce((n, p) => n + Number(p.value_amount || 0), 0)
  const onBooks = running.reduce((n, p) => n + Number(p.value_amount || 0), 0)
  const missing = missingOf(customer)

  const Project = ({ p }: { p: ProjectRow }) => (
    <li>
      <button
        onClick={() => setEditing(p)}
        className="flex w-full items-start gap-3 rounded-lg border border-[#242424] bg-[#171717] px-3 py-2.5 text-left hover:border-[#333]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">{p.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span className="font-mono">{p.project_code}</span>
            {p.owner_name && <span>· {p.owner_name}</span>}
            {p.task_count > 0 && (
              <span className="inline-flex items-center gap-1">· <ListTodo size={11} /> {p.task_count}</span>
            )}
            {p.due_date && <span>· due {fmtDate(p.due_date)}</span>}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${STAGE_CLS[p.stage_color ?? 'gray'] ?? STAGE_CLS.gray}`}>
            {p.stage_name ?? '—'}
          </span>
          {Number(p.value_amount) > 0 && (
            <span className="text-xs tabular-nums text-gray-400">{money(p.value_amount)}</span>
          )}
        </span>
      </button>
    </li>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="my-6 w-full max-w-3xl rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        {/* ---------- who ---------- */}
        <div className="flex items-start justify-between gap-4 border-b border-[#242424] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-white">{customer.company_name}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="font-mono">{customer.customer_code}</span>
              {customer.contact_person && (
                <span>
                  {customer.contact_person}
                  {customer.contact_role && ` · ${CONTACT_ROLE_LABEL[customer.contact_role]}`}
                </span>
              )}
              {customer.branch_name && (
                <span className="inline-flex items-center gap-1"><Building2 size={11} /> {customer.branch_name}</span>
              )}
              {customer.phone && (
                <span className="inline-flex items-center gap-1"><Phone size={11} /> {customer.phone}</span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1"><Mail size={11} /> {customer.email}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* The file, and what it still needs. Shown here because this is
              where someone looks the client up before calling them. */}
          <button
            onClick={onEditInfo}
            className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm ${
              customer.is_complete
                ? 'border-green-600/30 bg-green-500/10 text-green-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
          >
            {customer.is_complete ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span className="min-w-0 flex-1">
              {customer.is_complete
                ? 'Client information is complete.'
                : <>Still needed: {missing.join(', ')}.</>}
              <span className="block text-xs opacity-80">Open the client information</span>
            </span>
            <FileText size={15} className="mt-0.5 shrink-0 opacity-70" />
          </button>

          <div className="grid gap-px overflow-hidden rounded-xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
            {[
              ['Projects', String(rows.length)],
              ['Running now', String(running.length)],
              ['On the books', onBooks > 0 ? money(onBooks) : '—'],
              ['Delivered', earned > 0 ? money(earned) : '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#151515] px-4 py-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value}</p>
              </div>
            ))}
          </div>

          {loading ? (
            <p className="py-8 text-center"><Loader2 size={18} className="mx-auto animate-spin text-gray-500" /></p>
          ) : (
            <>
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-white">
                    <FolderKanban size={15} className="text-orange-400" />
                    Running now
                    <span className="text-xs font-normal text-gray-500">{running.length}</span>
                  </h4>
                  {can('mod_projects') && (
                    <button
                      onClick={() => setAdding(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                    >
                      <Plus size={13} /> New project
                    </button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {running.map((p) => <Project key={p.id} p={p} />)}
                  {running.length === 0 && (
                    <li className="rounded-lg border border-dashed border-[#2a2a2a] px-3 py-6 text-center text-sm text-gray-500">
                      Nothing running for this client.
                    </li>
                  )}
                </ul>
              </section>

              {/* Finished work, so "have we done anything for them before?"
                  has an answer without asking anyone. */}
              {finished.length > 0 && (
                <section>
                  <h4 className="mb-2 text-sm font-medium text-white">
                    Done before <span className="text-xs font-normal text-gray-500">{finished.length}</span>
                  </h4>
                  <ul className="space-y-1.5">
                    {finished.map((p) => <Project key={p.id} p={p} />)}
                  </ul>
                </section>
              )}
            </>
          )}

          <p className="text-xs text-gray-600">
            Client since {fmtDT(customer.converted_at)}
            {customer.converted_by_name ? ` · added by ${customer.converted_by_name}` : ''}
            {customer.owner_name ? ` · looked after by ${customer.owner_name}` : ''}
          </p>
        </div>
      </div>

      {(adding || editing) && (
        <ProjectModal
          project={editing}
          stages={stages}
          staff={staff}
          fixedCustomer={{ id: customer.id, name: customer.company_name, code: customer.customer_code }}
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); void load(); onChanged() }}
        />
      )}
    </div>,
    document.body,
  )
}