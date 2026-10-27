import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Truck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate, toDateInput, type JobWork, type JwDispatch } from './jobWorkUtils'

/*
  Book the shipment.

  The same two people who passed the quality check write the courier
  and the LR number here — they are the ones holding the receipt.

  A job that has not passed its check cannot be shipped. That is not
  enforced by hiding this window; the database refuses it, so it holds
  however the screen changes.

  One job can go out in more than one lot, so this adds a shipment
  rather than editing the one before.
*/

export default function DispatchModal({
  job, shipments, onClose, onSaved,
}: {
  job: JobWork
  shipments: JwDispatch[]
  onClose: () => void
  onSaved: (row: JobWork) => void
}) {
  const [courier, setCourier] = useState('')
  const [lr, setLr] = useState('')
  const [boxes, setBoxes] = useState('')
  const [weight, setWeight] = useState('')
  const [qty, setQty] = useState('')
  const [address, setAddress] = useState('')
  const [at, setAt] = useState(toDateInput(new Date().toISOString()))
  const [eta, setEta] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  // How much has already gone. A part shipment is normal; sending more
  // than was made is not.
  const alreadySent = shipments.reduce((sum, s) => sum + Number(s.qty_sent ?? 0), 0)
  const left = Number(job.qty) - alreadySent

  async function save() {
    if (!courier.trim()) return setErr('Which courier or transport?')
    if (!lr.trim()) return setErr('Put the LR or docket number — that is what anyone chasing this will quote.')
    if (qty && Number(qty) > left) {
      return setErr(`Only ${left.toLocaleString('en-IN')} are left to send.`)
    }

    setBusy(true)
    setErr('')

    const { data, error } = await supabase.rpc('jw_dispatch_save', {
      p_job: job.id,
      p_courier: courier.trim(),
      p_lr: lr.trim(),
      p_boxes: boxes ? Number(boxes) : null,
      p_weight: weight ? Number(weight) : null,
      p_qty: qty ? Number(qty) : null,
      p_address: address.trim() || null,
      p_at: at ? new Date(at).toISOString() : null,
      p_eta: eta || null,
      p_note: note.trim() || null,
    })

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
      <div className="my-auto w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-500/10 text-blue-400">
              <Truck size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Book the shipment</h3>
              <p className="text-xs text-gray-500">{job.jw_code} · {job.client_name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          {alreadySent > 0 && (
            <p className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-300">
              {alreadySent.toLocaleString('en-IN')} already sent in {shipments.length}{' '}
              {shipments.length === 1 ? 'lot' : 'lots'} · {left.toLocaleString('en-IN')} left
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Courier or transport</label>
              <input
                value={courier} onChange={(e) => setCourier(e.target.value)}
                placeholder="DTDC, Gati, own vehicle"
                className={input} autoFocus
              />
            </div>
            <div>
              <label className={label}>LR / docket number</label>
              <input
                value={lr} onChange={(e) => setLr(e.target.value)}
                placeholder="DTDC-7789451230"
                className={`${input} tabular-nums`}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Quantity sent</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={qty} onChange={(e) => setQty(e.target.value)}
                placeholder={String(left)}
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Boxes</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={boxes} onChange={(e) => setBoxes(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Weight (kg)</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={weight} onChange={(e) => setWeight(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <label className={label}>Delivery address</label>
            <textarea
              value={address} onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Where it is going — confirm with sales if unsure"
              className={`${input} resize-y`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Dispatched on</label>
              <input type="date" value={at} onChange={(e) => setAt(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Expected delivery</label>
              <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label className={label}>Note</label>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth remembering about this lot"
              className={input}
            />
          </div>

          {shipments.length > 0 && (
            <div className="border-t border-[#242424] pt-3">
              <p className="mb-2 text-xs text-gray-500">Already booked</p>
              <ul className="space-y-1.5">
                {shipments.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-gray-300">{s.courier ?? '—'}</span>
                    <span className="tabular-nums text-gray-500">{s.lr_no ?? ''}</span>
                    <span className="min-w-0 flex-1 truncate text-gray-600">
                      {s.qty_sent ? `${Number(s.qty_sent).toLocaleString('en-IN')} units` : ''}
                    </span>
                    <span className="shrink-0 text-gray-600">{fmtDate(s.dispatched_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
            Book it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}