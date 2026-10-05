import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SOURCES, type Lead, type Stage, type Staff } from './leadUtils'
import { type Label } from './labels'

type LeadL = Lead & { label_id?: string | null }

export default function LeadEditModal({
  lead, stages, staff, labels, can, onClose, onSaved,
}: {
  lead: LeadL
  stages: Stage[]
  staff: Staff[]
  labels: Label[]
  can: (k: string) => boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<LeadL>(lead)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const lbl = 'mb-1.5 block text-xs text-gray-400'
  const set = (k: keyof LeadL, v: unknown) => setForm({ ...form, [k]: v })

  async function submit() {
    setError('')
    if (!form.name.trim()) return setError('Customer name is required.')

    const patch: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone,
      alt_phone: form.alt_phone,
      email: form.email,
      company: form.company,
      city: form.city,
      requirement: form.requirement,
      source: form.source,
      estimated_amount: Number(form.estimated_amount) || 0,
    }
    if (can('lead_assign')) patch.assigned_to = form.assigned_to || null
    if (can('lead_settings')) patch.label_id = form.label_id || null

    setBusy(true)
    const { error: e } = await supabase.from('leads').update(patch).eq('id', lead.id)
    setBusy(false)
    if (e) return setError(e.message)
    onSaved()
  }

  const stageName = stages.find((s) => s.id === lead.stage_id)?.name ?? '—'
  const assignable = staff.filter((s) => s.is_active)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-edit-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#242424] bg-[#171717] px-5 py-3.5">
          <h2 id="lead-edit-title" className="font-semibold text-white">Edit lead #{lead.lead_no}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className={lbl}>Stage</span>
              <p className="rounded-lg border border-[#242424] bg-[#161616] px-3 py-2 text-sm text-gray-400">{stageName}</p>
            </div>
            <div>
              <label className={lbl} htmlFor="le-source">Source</label>
              <select id="le-source" value={form.source} onChange={(e) => set('source', e.target.value)} className={input}>
                {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="le-user">Assigned to</label>
              <select
                id="le-user"
                value={form.assigned_to ?? ''}
                disabled={!can('lead_assign')}
                onChange={(e) => set('assigned_to', e.target.value)}
                className={`${input} disabled:opacity-60`}
              >
                <option value="">Unassigned</option>
                {(can('lead_assign') ? assignable : staff.filter((s) => s.id === lead.assigned_to)).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={lbl} htmlFor="le-name">Customer name *</label>
              <input id="le-name" autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="le-phone">Mobile number</label>
              <input id="le-phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="le-alt">Alternate phone</label>
              <input id="le-alt" value={form.alt_phone ?? ''} onChange={(e) => set('alt_phone', e.target.value)} className={input} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={lbl} htmlFor="le-company">Company</label>
              <input id="le-company" value={form.company ?? ''} onChange={(e) => set('company', e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="le-email">Email</label>
              <input id="le-email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="le-city">City</label>
              <input id="le-city" value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} className={input} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={lbl} htmlFor="le-amount">Estimated amount (₹)</label>
              <input
                id="le-amount"
                type="number"
                min={0}
                onWheel={(e) => e.currentTarget.blur()}
                value={form.estimated_amount ?? 0}
                onChange={(e) => set('estimated_amount', Number(e.target.value))}
                className={`${input} tabular-nums`}
              />
            </div>
            {can('lead_settings') && (
              <div>
                <label className={lbl} htmlFor="le-label">Label</label>
                <select id="le-label" value={form.label_id ?? ''} onChange={(e) => set('label_id', e.target.value)} className={input}>
                  <option value="">No label</option>
                  {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className={lbl} htmlFor="le-req">Requirement</label>
            <textarea id="le-req" rows={4} value={form.requirement ?? ''} onChange={(e) => set('requirement', e.target.value)} className={`${input} resize-y`} />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#242424] bg-[#171717] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Save lead
          </button>
        </div>
      </div>
    </div>
  )
}