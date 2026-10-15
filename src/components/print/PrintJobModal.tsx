import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PickList from './PickList'
import { fmtDT, toLocalInput, type PrintJob, type PrintName } from './printUtils'

/*
  Change one entry.

  Adding happens on the register itself, in one row of boxes — that is the
  common case and it should not need a window. Changing is rare, so it can
  afford one, and a window is the only place with room for the date and
  the remark.
*/

export default function PrintJobModal({
  job, services, offsets, canEditLists, onAddName, onClose, onSaved,
}: {
  job: PrintJob
  services: PrintName[]
  offsets: PrintName[]
  canEditLists: boolean
  onAddName: (table: 'print_services' | 'print_offsets', name: string) => Promise<PrintName | null>
  onClose: () => void
  onSaved: () => void
}) {
  const [client, setClient] = useState(job.client_name)
  const [service, setService] = useState<string | null>(job.service_id)
  const [offsetId, setOffsetId] = useState<string | null>(job.offset_id)
  const [at, setAt] = useState(toLocalInput(job.job_at))
  const [status, setStatus] = useState<'pending' | 'sent'>(job.status)
  const [remark, setRemark] = useState(job.remark ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function save() {
    if (!client.trim()) return setErr('Put a client name.')
    setBusy(true)
    setErr('')

    const { error } = await supabase
      .from('print_jobs')
      .update({
        client_name: client.trim(),
        service_id: service,
        offset_id: offsetId,
        job_at: new Date(at).toISOString(),
        status,
        remark: remark.trim() || null,
      })
      .eq('id', job.id)

    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
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
      <div className="my-auto w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Entry #{job.job_no}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div>
            <label className={label}>Client name</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} className={input} autoFocus />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Service</label>
              <PickList
                value={service}
                options={services}
                onPick={setService}
                placeholder="Service"
                onCreate={canEditLists ? (n) => onAddName('print_services', n) : undefined}
              />
            </div>
            <div>
              <label className={label}>Offset</label>
              <PickList
                value={offsetId}
                options={offsets}
                onPick={setOffsetId}
                placeholder="Offset"
                onCreate={canEditLists ? (n) => onAddName('print_offsets', n) : undefined}
              />
            </div>
          </div>

          <div>
            <label className={label}>Date &amp; time</label>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className={input} />
          </div>

          <div>
            <label className={label}>Status</label>
            <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
              {([['pending', 'Not sent'], ['sent', 'Sent']] as const).map(([k, text]) => (
                <button
                  key={k}
                  onClick={() => setStatus(k)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    status === k
                      ? k === 'sent' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {/* Who sent it and when is written by the database, not here —
                so it says what happened rather than what someone typed. */}
            {job.status === 'sent' && job.sent_at && (
              <p className="mt-1.5 text-xs text-gray-500">
                Marked sent {fmtDT(job.sent_at)}
                {job.sent_by_name ? ` by ${job.sent_by_name}` : ''}
              </p>
            )}
          </div>

          <div>
            <label className={label}>Remark</label>
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Anything worth remembering about this one"
              className={input}
            />
          </div>

          <p className="text-xs text-gray-600">
            Entered by {job.created_by_name ?? 'someone'} · {fmtDT(job.created_at)}
          </p>
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
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}