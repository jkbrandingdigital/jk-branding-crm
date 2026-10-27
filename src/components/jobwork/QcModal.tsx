import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { QC_RESULTS, type JobWork, type JwQc, type JwQcResult } from './jobWorkUtils'

/*
  Record a quality check.

  Two people in dispatch open the boxes, pull a handful out and look at
  them. This is where what they found goes.

  The round number is not asked for. The database works out that this
  is round 1, or round 3 after two lots went back — asking would only
  be a chance to type the wrong one. Passed sends the job to dispatch;
  anything else sends it back to the vendor, and the vendor sees why.
*/

export default function QcModal({
  job, rounds, onClose, onSaved,
}: {
  job: JobWork
  rounds: JwQc[]
  onClose: () => void
  onSaved: (row: JobWork) => void
}) {
  const [result, setResult] = useState<JwQcResult>('passed')
  const [sample, setSample] = useState('')
  const [ok, setOk] = useState('')
  const [reject, setReject] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const nextRound = (rounds[0]?.round ?? 0) + 1

  // Passing with units set aside is a contradiction worth catching
  // here, before it reaches the vendor as a mixed message.
  const rejecting = Number(reject) > 0

  async function save() {
    if (result === 'passed' && rejecting) {
      return setErr('Some units are marked rejected. Record this as rework, or clear the rejected count.')
    }
    if (result !== 'passed' && !note.trim()) {
      return setErr('Say what was wrong — the vendor only has this to go on.')
    }

    setBusy(true)
    setErr('')

    const { data, error } = await supabase.rpc('jw_qc_record', {
      p_job: job.id,
      p_result: result,
      p_sample: sample ? Number(sample) : null,
      p_ok: ok ? Number(ok) : null,
      p_reject: reject ? Number(reject) : null,
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
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-green-500/10 text-green-400">
              <ShieldCheck size={16} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Quality check — round {nextRound}</h3>
              <p className="text-xs text-gray-500">{job.jw_code} · {job.client_name}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div>
            <label className={label}>What did the check find?</label>
            <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
              {QC_RESULTS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setResult(r.key)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    result === r.key ? r.tone : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Samples checked</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={sample} onChange={(e) => setSample(e.target.value)}
                placeholder="50"
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Good</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={ok} onChange={(e) => setOk(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
            <div>
              <label className={label}>Set aside</label>
              <input
                type="number" min="0" inputMode="numeric"
                value={reject} onChange={(e) => setReject(e.target.value)}
                className={`${input} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <label className={label}>
              Note {result !== 'passed' && <span className="text-orange-400">— the vendor reads this</span>}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={
                result === 'passed'
                  ? 'Binding and foil checked on 50 samples. OK.'
                  : 'What is wrong, and on how many'
              }
              className={`${input} resize-y`}
            />
          </div>

          <p className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-gray-500">
            {result === 'passed'
              ? 'Passing moves this to ready for dispatch. The courier and LR go in next.'
              : 'This goes back to the vendor. Sales and the designer see it too.'}
          </p>

          {rounds.length > 0 && (
            <div className="border-t border-[#242424] pt-3">
              <p className="mb-2 text-xs text-gray-500">Earlier rounds</p>
              <ul className="space-y-1.5">
                {rounds.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums text-gray-600">#{r.round}</span>
                    <span className={`rounded px-2 py-0.5 font-medium ${
                      QC_RESULTS.find((x) => x.key === r.result)?.tone ?? 'text-gray-400'
                    }`}>
                      {QC_RESULTS.find((x) => x.key === r.result)?.label ?? r.result}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-gray-500">{r.note ?? ''}</span>
                    <span className="shrink-0 text-gray-600">{r.checked_name ?? ''}</span>
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
            Record round {nextRound}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}