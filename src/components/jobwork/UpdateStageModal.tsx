import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  stageLabel, stageTone, VENDOR_STAGES,
  type JobWork, type JwStage,
} from './jobWorkUtils'

/*
  Move the job along.

  This is the vendor's progress, written down by whoever is on the
  phone to them. Quantity is "how many are done so far", not how many
  were ordered — it is what tells sales whether 4,500 of 5,000 is a
  good morning or a problem.

  Quality check and dispatch are missing from this list on purpose.
  Those steps carry a round number and an LR, so they have their own
  windows, and the database refuses them from here.
*/

export default function UpdateStageModal({
  job, onClose, onSaved,
}: {
  job: JobWork
  onClose: () => void
  onSaved: (row: JobWork) => void
}) {
  const [stage, setStage] = useState<JwStage>(
    VENDOR_STAGES.includes(job.stage) ? job.stage : 'vendor_confirmed',
  )
  const [qty, setQty] = useState('')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function save() {
    if (qty && Number(qty) > Number(job.qty)) {
      return setErr(`The order is ${Number(job.qty).toLocaleString('en-IN')}. That is more than was asked for.`)
    }

    setBusy(true)
    setErr('')

    const { data, error } = await supabase.rpc('jw_update_stage', {
      p_job: job.id,
      p_stage: stage,
      p_qty: qty ? Number(qty) : 0,
      p_remark: remark.trim() || null,
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
      <div className="my-auto w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Production update</h3>
            <p className="text-xs text-gray-500">{job.jw_code} · {job.vendor_name ?? 'vendor'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div>
            <label className={label}>Where is it now?</label>
            <div className="grid gap-1.5">
              {VENDOR_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStage(s)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                    stage === s ? stageTone(s) : 'border-[#2a2a2a] bg-[#1a1a1a] text-gray-400 hover:text-white'
                  }`}
                >
                  {stageLabel(s)}
                  {stage === s && <span className="text-xs opacity-80">selected</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={label}>
              How many are done — out of {Number(job.qty).toLocaleString('en-IN')}
            </label>
            <input
              type="number" min="0" inputMode="numeric"
              value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className={`${input} tabular-nums`}
            />
          </div>

          <div>
            <label className={label}>Remark</label>
            <input
              value={remark} onChange={(e) => setRemark(e.target.value)}
              placeholder="Raw paper expected by 29th"
              className={input}
            />
          </div>

          <p className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-gray-500">
            Sales, the designer and dispatch all see this.
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
            Save update
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}