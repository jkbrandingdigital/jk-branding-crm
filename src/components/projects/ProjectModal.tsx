import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import CustomerPicker, { type PickedCustomer } from './CustomerPicker'
import { DateField } from '../DateField'
import type { ProjectRow, ProjectStage } from '../customers/customerUtils'

/*
  One project — a logo, a brochure, a website.

  The customer cannot be changed once a project exists. Moving a project
  to another client would silently move its tasks, its hours and its
  money with it, and nobody reading the register afterwards could tell
  that it had happened. If it really is the wrong client, the project is
  closed and a new one opened, which leaves a trail.

  PRICE, ONCE THE PROJECT EXISTS, IS NOT EDITED IN PLACE — it is revised.
  A sales person settles ₹18,000, the client later talks it down to
  ₹17,500, and that change has to reach the sales figures and the
  incentive. So an existing project's value is read-only here and carries
  a "Revise price" button instead. It goes through project_revise_price(),
  which (a) logs the old->new, (b) lets the person who sold it do this even
  without full project-edit rights, and (c) leaves the money on the same
  booking month, so performance simply re-counts. New projects still take
  their opening value straight on this form.
*/

export default function ProjectModal({
  project, stages, staff, fixedCustomer, onClose, onSaved,
}: {
  project: ProjectRow | null
  stages: ProjectStage[]
  staff: { id: string; full_name: string }[]
  fixedCustomer?: PickedCustomer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(
    project
      ? { id: project.customer_id, name: project.customer_name, code: project.customer_code }
      : fixedCustomer ?? null,
  )
  const [title, setTitle] = useState(project?.title ?? '')
  const [stageId, setStageId] = useState(project?.stage_id ?? stages[0]?.id ?? '')
  const [value, setValue] = useState(String(project?.value_amount ?? 0))
  /*
    When the work was booked, not when it was typed in.

    An old client's finished job entered today must count in the month
    it was actually sold. Left on the entry date, two months go wrong
    at once — one short and one flattered — and after that nobody
    trusts entering old work at all.

    New projects open on today, which is right almost every time.
  */
  const [booked, setBooked] = useState(project?.booked_on ?? new Date().toLocaleDateString('en-CA'))
  const [start, setStart] = useState(project?.start_date ?? '')
  const [due, setDue] = useState(project?.due_date ?? '')
  const [owner, setOwner] = useState(project?.owner_id ?? '')
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [services, setServices] = useState<string[]>(project?.service_keys ?? [])
  const [allServices, setAllServices] = useState<{ key: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // Revise-price, for an existing project only.
  const [revising, setRevising] = useState(false)
  const [newAmount, setNewAmount] = useState('')
  const [reviseNote, setReviseNote] = useState('')
  const [reviseBusy, setReviseBusy] = useState(false)
  const [reviseErr, setReviseErr] = useState('')

  // A designer gets value_amount back as null and should not see a price
  // or a way to change one.
  const canSeeMoney = !project || project.value_amount != null

  /*
    An existing project reads its own booking date and services straight
    from the table, whatever screen opened this form.

    The customer page hands over a `project_list` row and the board hands
    over a `project_board()` row, and the two do not carry the same
    columns. Where `booked_on` was missing the form quietly fell back to
    today — and then saved that, moving a project booked in September
    into November's revenue without anyone touching the field. A form
    that can overwrite a figure it was never shown is the bug; reading
    the real row first is the fix.
  */
  const [hydrating, setHydrating] = useState(!!project)

  useEffect(() => {
    if (!project) return
    let dead = false
    void (async () => {
      const { data } = await supabase
        .from('projects')
        .select('booked_on, service_keys')
        .eq('id', project.id)
        .maybeSingle()
      if (dead) return
      if (data) {
        const row = data as { booked_on: string | null; service_keys: string[] | null }
        if (row.booked_on) setBooked(row.booked_on)
        setServices(row.service_keys ?? [])
      }
      setHydrating(false)
    })()
    return () => { dead = true }
  }, [project])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('sales_services')
        .select('key, name')
        .eq('is_active', true)
        .order('sort_order')
      setAllServices((data ?? []) as { key: string; name: string }[])
    })()
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function save() {
    if (!customer) return setErr('Which client is this for?')
    if (!title.trim()) return setErr('Give the project a name.')
    // Still reading the real row — saving now would write a guessed
    // booking date over the real one.
    if (hydrating) return setErr('Still loading this project. Try again in a moment.')

    setBusy(true)
    setErr('')

    // value_amount is left out on an update on purpose — an existing
    // project's price only moves through the revise flow below, so that
    // every change is logged and the sales figures re-count. On insert the
    // opening value is set here.
    const patch = {
      title: title.trim(),
      stage_id: stageId || null,
      booked_on: booked || new Date().toLocaleDateString('en-CA'),
      start_date: start || null,
      due_date: due || null,
      owner_id: owner || null,
      notes: notes.trim() || null,
      // The money counts under the first one. A trigger keeps the
      // single `service` column in step, so the sales donut and the
      // revenue figures carry on reading what they always read.
      service_keys: services,
    }

    const { error } = project
      ? await supabase.from('projects').update(patch).eq('id', project.id)
      : await supabase.from('projects').insert({ ...patch, value_amount: Number(value) || 0, customer_id: customer.id })

    setBusy(false)
    if (error) return setErr(error.message)
    onSaved()
  }

  async function revisePrice() {
    if (!project) return
    const amt = Number(newAmount)
    if (newAmount.trim() === '' || Number.isNaN(amt) || amt < 0) {
      return setReviseErr('Enter a valid revised price')
    }
    setReviseBusy(true)
    setReviseErr('')
    const { error } = await supabase.rpc('project_revise_price', {
      p_project: project.id,
      p_amount: amt,
      p_note: reviseNote.trim() || null,
    })
    setReviseBusy(false)
    if (error) return setReviseErr(error.message)
    setValue(String(amt))
    setRevising(false)
    // Reload the board so the new value, badges and totals all follow.
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
          <h3 className="text-sm font-semibold text-white">
            {project ? `${project.project_code} · ${project.title}` : 'New project'}
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</p>}

          <div>
            <label className={label}>Customer</label>
            <CustomerPicker value={customer} onPick={setCustomer} disabled={!!project} />
            {project && (
              <p className="mt-1.5 text-xs text-gray-600">
                The client cannot be changed. Close this project and open a new one instead.
              </p>
            )}
          </div>

          <div>
            <label className={label}>Project</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Logo design"
              autoFocus={!!project || !!fixedCustomer}
              className={input}
            />
          </div>

          {/* What work this job needs. A client may order a logo and a
              brochure together, so more than one can be on. The order
              matters: the money counts under the first, because splitting
              one amount across three services would be a number nobody
              gave us. */}
          <div>
            <label className={label}>Services</label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2">
              {allServices.length === 0 && (
                <span className="px-1 py-0.5 text-xs text-gray-600">No services set up yet.</span>
              )}
              {allServices.map((s) => {
                const on = services.includes(s.key)
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() =>
                      setServices((cur) =>
                        cur.includes(s.key) ? cur.filter((k) => k !== s.key) : [...cur, s.key],
                      )
                    }
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      on
                        ? 'bg-orange-500/15 text-orange-300'
                        : 'text-gray-400 hover:bg-[#232323] hover:text-white'
                    }`}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
            {services.length > 1 && (
              <p className="mt-1.5 text-xs text-gray-600">
                The value counts under {allServices.find((s) => s.key === services[0])?.name ?? services[0]}.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Stage</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={input}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Value (₹)</label>
              {!project ? (
                // New project: the opening price.
                <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={input} />
              ) : (
                // Existing project: read-only, revised through the RPC.
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums text-white">
                      {!canSeeMoney ? '—' : `₹${Number(value || 0).toLocaleString('en-IN')}`}
                    </span>
                    {canSeeMoney && !revising && (
                      <button
                        type="button"
                        onClick={() => { setNewAmount(value); setReviseNote(''); setReviseErr(''); setRevising(true) }}
                        className="shrink-0 rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300"
                      >
                        Revise price
                      </button>
                    )}
                  </div>

                  {revising && (
                    <div className="mt-3 space-y-2 border-t border-[#242424] pt-3">
                      <input
                        type="number"
                        min={0}
                        value={newAmount}
                        onChange={(e) => setNewAmount(e.target.value)}
                        placeholder="New price"
                        className={input}
                        autoFocus
                      />
                      <input
                        value={reviseNote}
                        onChange={(e) => setReviseNote(e.target.value)}
                        placeholder="Reason (optional) — e.g. client negotiated"
                        className={input}
                      />
                      {reviseErr && <p className="text-xs text-red-400">{reviseErr}</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setRevising(false); setReviseErr('') }}
                          className="rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={revisePrice}
                          disabled={reviseBusy}
                          className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                        >
                          {reviseBusy && <Loader2 size={13} className="animate-spin" />}
                          Save new price
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-600">
                        The change is logged, and the sales performance and incentive update to match.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* The CRM's own picker, not the browser's. Chrome's box
                follows the machine's locale and reads dd-----yyyy here,
                while every other date in the app is picked the same way.
                One habit, one look. */}
            <div>
              <label className={label}>Booked on</label>
              <DateField value={booked} onChange={setBooked} placeholder="Today" />
            </div>
            <div>
              <label className={label}>Start</label>
              <DateField value={start} onChange={setStart} placeholder="Not set" />
            </div>
            <div>
              <label className={label}>Due</label>
              <DateField value={due} onChange={setDue} placeholder="Not set" />
            </div>
          </div>

          <div>
            <label className={label}>Who is running it</label>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={input}>
              <option value="">Nobody yet</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${input} resize-y`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || hydrating}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {project ? 'Save' : 'Create project'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}