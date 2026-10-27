import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PickList from '../print/PickList'
import {
  inr, toDateInput, type JobWork, type PrintName,
} from './jobWorkUtils'

/*
  Open a job work, or change one.

  Unlike the print register, this does not go in a row of boxes on the
  list. A job work carries a quantity, a rate, two dates and the
  instructions the vendor will actually work from — that does not fit
  on one line, and getting the rate wrong is expensive.

  Vendor and product come from the Printing Media lists. Someone with
  print_lists_edit can add a name here without leaving the window;
  anyone else only picks.
*/

export default function JobWorkModal({
  job, services, offsets, canEditLists, onAddName, onClose, onSaved,
}: {
  job: JobWork | null                 // null = a new one
  services: PrintName[]               // products
  offsets: PrintName[]                // vendors
  canEditLists: boolean
  onAddName: (table: 'print_services' | 'print_offsets', name: string) => Promise<PrintName | null>
  onClose: () => void
  onSaved: (row: JobWork) => void
}) {
  const [client, setClient] = useState(job?.client_name ?? '')
  const [project, setProject] = useState(job?.project_name ?? '')
  const [service, setService] = useState<string | null>(job?.service_id ?? null)
  const [offsetId, setOffsetId] = useState<string | null>(job?.offset_id ?? null)
  const [note, setNote] = useState(job?.product_note ?? '')
  const [qty, setQty] = useState(job ? String(job.qty) : '')
  const [rate, setRate] = useState(job ? String(job.rate) : '')
  const [jobAt, setJobAt] = useState(toDateInput(job?.job_at) || toDateInput(new Date().toISOString()))
  const [dueAt, setDueAt] = useState(toDateInput(job?.due_at))
  const [terms, setTerms] = useState(job?.payment_terms ?? '50% Advance, 50% After Delivery')
  const [instructions, setInstructions] = useState(job?.instructions ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // The total is never typed. It is quantity times rate, worked out
  // where everyone can see it, so a wrong rate shows up before the
  // vendor is told a number.
  const total = (Number(qty) || 0) * (Number(rate) || 0)

  async function save() {
    if (!client.trim()) return setErr('Whose job is it? Put a client name.')
    if (!offsetId) return setErr('Pick the vendor.')
    if (!(Number(qty) > 0)) return setErr('Put how many.')

    setBusy(true)
    setErr('')

    // Everything goes through the RPC, new or old. A plain update is
    // refused here: changing a job can move it out of the writer's own
    // view, and Postgres checks the new row against the read policy
    // too. The function steps over that, and it is the one place the
    // rules live.
    const args = {
      p_customer: job?.customer_id ?? null,
      p_client_name: client.trim(),
      p_project: job?.project_id ?? null,
      p_project_name: project.trim() || null,
      p_service: service,
      p_offset: offsetId,
      p_product_note: note.trim() || null,
      p_qty: Number(qty),
      p_rate: Number(rate) || 0,
      p_job_at: jobAt ? new Date(jobAt).toISOString() : null,
      p_due_at: dueAt ? new Date(dueAt).toISOString() : null,
      p_instructions: instructions.trim() || null,
      p_payment_terms: terms.trim() || null,
      p_designer: job?.designer_id ?? null,
    }

    const { data, error } = job
      ? await supabase.rpc('jw_edit', { p_job: job.id, ...args })
      : await supabase.rpc('jw_create', args)

    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(data as JobWork)
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const label = 'mb-1.5 block text-xs text-gray-500'

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="my-auto w-full max-w-2xl rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {job ? `Job work ${job.jw_code}` : 'New job work'}
            </h3>
            <p className="text-xs text-gray-500">
              {job ? 'Change what the vendor was told.' : 'What is going to the printer, and on what terms.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Client name</label>
              <input value={client} onChange={(e) => setClient(e.target.value)} className={input} autoFocus />
            </div>
            <div>
              <label className={label}>Project</label>
              <input
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="Which project this belongs to"
                className={input}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Vendor — where it prints</label>
              <PickList
                value={offsetId}
                options={offsets}
                onPick={setOffsetId}
                placeholder="Vendor"
                onCreate={canEditLists ? (n) => onAddName('print_offsets', n) : undefined}
              />
            </div>
            <div>
              <label className={label}>Product — what prints</label>
              <PickList
                value={service}
                options={services}
                onPick={setService}
                placeholder="Diary, calendar, brochure…"
                onCreate={canEditLists ? (n) => onAddName('print_services', n) : undefined}
              />
            </div>
          </div>

          <div>
            <label className={label}>Anything the list does not cover</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Corporate diary, A5, spiral"
              className={input}
            />
          </div>

          {/* ---- the numbers ---- */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Quantity</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={qty} onChange={(e) => setQty(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Rate per unit (₹)</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={rate} onChange={(e) => setRate(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Total vendor cost</label>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-sm font-semibold tabular-nums text-orange-400">
                {inr(total)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Job given on</label>
              <input type="date" value={jobAt} onChange={(e) => setJobAt(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Expected completion</label>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label className={label}>Payment terms</label>
            <input
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="50% Advance, 50% After Delivery"
              className={input}
            />
          </div>

          <div>
            <label className={label}>Job instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Finish, colours, binding, paper — whatever the vendor has to get right"
              className={`${input} resize-y`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {job ? 'Save' : 'Open job work'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}