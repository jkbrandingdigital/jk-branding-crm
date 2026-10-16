import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'
import { CLIENT_FIELDS, missingOf, NEED_LABEL, type Branch, type Customer } from './customerUtils'

/*
  The client master form — STEP 02 on paper.

  It both makes a customer and fills one in. A client who walked in off
  the street, or one from before the CRM, was never a lead and has no
  deal to win — leaving conversion as the only door would have kept them
  out for good.

  A half-filled form saves. That is deliberate: the sales person is often
  on the phone when the deal lands, and a form that refuses to save until
  every box is full gets filled with "-" and "na" and then the whole
  thing is worth nothing. What is still missing is shown at the top, and
  the customer carries an Incomplete mark until it is.

  The one thing it will not save without is the company name, because a
  customer with no name cannot be found again.
*/

export default function ClientMasterForm({
  customer, branches = [], onClose, onSaved,
}: {
  customer: Customer | null       // null = a new one
  branches?: Branch[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Partial<Customer>>(customer ?? {})
  const [branchId, setBranchId] = useState(customer?.branch_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const missing = useMemo(() => missingOf(form), [form])

  const set = (k: keyof Customer, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!String(form.company_name ?? '').trim()) return setErr('A company or brand name is needed.')
    setBusy(true)
    setErr('')

    const patch: Record<string, string | null> = {}
    for (const f of CLIENT_FIELDS) {
      patch[f.key as string] = String(form[f.key] ?? '').trim() || null
    }
    // company_name is not null in the table, so it never goes back as null
    patch.company_name = String(form.company_name).trim()
    patch.branch_id = branchId || null

    if (customer) {
      const { error } = await supabase.from('customers').update(patch).eq('id', customer.id)
      setBusy(false)
      if (error) return setErr(error.message)
      onSaved()
      return
    }

    // A client added by hand belongs to whoever added them, the same way
    // a won lead's client belongs to the person who won it.
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('customers')
      .insert({ ...patch, owner_id: user?.id ?? null })
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="my-6 w-full max-w-2xl rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 rounded-t-xl border-b border-[#242424] bg-[#161616] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">
              {customer ? customer.company_name || 'Client information' : 'New customer'}
            </h3>
            <p className="text-xs text-gray-500">
              {customer ? `${customer.customer_code} · Client information` : 'Client information'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* What is still missing, before the boxes rather than after —
              so it reads as a to-do, not a telling-off. */}
          {missing.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Still needed: {missing.join(', ')}.
                {/* opacity-80 rather than text-amber-300/70: theme.css has no
                    light-theme mapping for a colour written with an opacity
                    suffix, so that one stayed pale on cream and could not be
                    read. The opacity utility dims whatever the theme picked. */}
                <span className="block text-xs text-amber-300 opacity-80">You can save without them and come back.</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-500/10 px-3 py-2.5 text-sm text-green-400">
              <CheckCircle2 size={16} /> Everything mandatory is filled in.
            </div>
          )}

          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          {/* Branch is not part of the paper form, but it is what the
              list is grouped by. Left blank on a new customer the database
              fills it in from whoever is adding them. */}
          {branches.length > 0 && (
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs">
                <span className="text-gray-300">Branch</span>
                <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Which office</span>
              </label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input}>
                <option value="">{customer ? 'No branch' : 'Mine'}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {CLIENT_FIELDS.map((f) => {
            const value = String(form[f.key] ?? '')
            const empty = !value.trim()
            return (
              <div key={f.key as string}>
                <label className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-gray-300">{f.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      f.need === 'must'
                        ? empty ? 'bg-amber-500/15 text-amber-400' : 'bg-[#1f1f1f] text-gray-500'
                        : 'bg-[#1f1f1f] text-gray-500'
                    }`}
                  >
                    {NEED_LABEL[f.need]}
                  </span>
                  {f.hint && <span className="text-gray-600">{f.hint}</span>}
                </label>

                {/* The CRM's own picker, not the browser's. A form with two
                    kinds of calendar in it looks like two different programs
                    stitched together. */}
                {f.type === 'date' ? (
                  <DateField
                    value={value ? value.slice(0, 10) : ''}
                    onChange={(v) => set(f.key, v)}
                    placeholder="Not set"
                  />
                ) : f.type === 'area' ? (
                  <textarea
                    value={value}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={2}
                    className={`${input} resize-y`}
                  />
                ) : (
                  <input
                    type={f.type ?? 'text'}
                    value={value}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={input}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-xl border-t border-[#242424] bg-[#161616] px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {customer ? 'Save' : 'Add customer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}