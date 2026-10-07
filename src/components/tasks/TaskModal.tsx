import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Paperclip, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../lib/permissions'
import { fromInputDT, toInputDT, type Staff } from '../leads/leadUtils'
import { DateTimeField } from '../DateField'
import { RichText, plainText } from '../RichText'
import { searchLeads, type LeadLite } from '../reminders/reminderUtils'
import {
  PRIORITIES, REPEATS, currentAssignees,
  type Priority, type Task, type TaskLabel, type TaskStage,
} from './taskUtils'

type Props = {
  task: Task | null // null = new
  stages: TaskStage[]
  labels: TaskLabel[]
  staff: Staff[]
  lead?: LeadLite | null // opened from a lead: the customer comes pre-filled
  onClose: () => void
  onSaved: () => void
}

const input =
  'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
const label = 'mb-1.5 block text-sm text-gray-300'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setSeconds(0, 0)
  return toInputDT(d.toISOString())
}

export default function TaskModal({ task, stages, labels, staff, lead: fromLead = null, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const { can } = usePermissions()
  const me = user?.id ?? ''
  const canAssign = can('task_assign')

  const [subject, setSubject] = useState(task?.subject ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'low')
  const [stageId, setStageId] = useState(task?.stage_id ?? stages.find((s) => s.is_default)?.id ?? stages[0]?.id ?? '')
  const [labelId, setLabelId] = useState(task?.label_id ?? '')
  const [start, setStart] = useState(toInputDT(task?.start_at ?? new Date().toISOString()))
  const [due, setDue] = useState(task?.due_at ? toInputDT(task.due_at) : tomorrow())
  const [repeat, setRepeat] = useState(task?.repeat_every ?? 'none')
  const [lead, setLead] = useState<LeadLite | null>(fromLead)
  const [customer, setCustomer] = useState(task?.customer_name ?? fromLead?.name ?? '')
  const [phone, setPhone] = useState(task?.customer_phone ?? fromLead?.phone ?? '')
  const [to, setTo] = useState<Set<string>>(new Set(task ? currentAssignees(task) : []))
  const [leadQ, setLeadQ] = useState('')
  const [leadHits, setLeadHits] = useState<LeadLite[]>([])
  const [staffQ, setStaffQ] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Everyone the task can be handed to
  const options = useMemo(
    () =>
      staff
        .filter((s) => s.is_active || to.has(s.id))
        .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.full_name.localeCompare(b.full_name))),
    [staff, me, to],
  )
  const shown = options.filter((s) => s.full_name.toLowerCase().includes(staffQ.trim().toLowerCase()))

  useEffect(() => {
    if (lead) return
    const t = setTimeout(async () => setLeadHits(await searchLeads(leadQ)), 300)
    return () => clearTimeout(t)
  }, [leadQ, lead])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  function pickLead(l: LeadLite) {
    setLead(l)
    setLeadHits([])
    setCustomer(l.name)
    if (l.phone) setPhone(l.phone)
  }

  const toggleTo = (id: string) =>
    setTo((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  async function save() {
    setError('')
    if (!subject.trim()) return setError('Write what the task is.')
    if (to.size === 0) return setError('Pick who should do this.')
    if (due && start && new Date(due).getTime() < new Date(start).getTime())
      return setError('The due date is before the start date.')

    const payload = {
      subject: subject.trim(),
      description: plainText(description) ? description : null,
      priority,
      stage_id: stageId || null,
      label_id: labelId || null,
      customer_name: customer.trim() || null,
      customer_phone: phone.trim() || null,
      lead_id: lead?.id ?? task?.lead_id ?? null,
      start_at: fromInputDT(start) ?? new Date().toISOString(),
      due_at: fromInputDT(due),
      repeat_every: repeat,
    }

    setBusy(true)
    try {
      let id = task?.id
      if (!id) {
        const { data, error: e } = await supabase.from('tasks').insert(payload).select('id').single()
        if (e) throw e
        id = data.id as string
      } else {
        const { error: e } = await supabase.from('tasks').update(payload).eq('id', id)
        if (e) throw e
      }

      const { setAssignees } = await import('./taskUtils')
      await setAssignees(id, [...to], task?.task_assignees ?? [])

      // Files picked above go up once the task has an id
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\- ]/g, '_')
        const path = `${id}/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('task-files').upload(path, f)
        if (upErr) throw upErr
        const { error: aErr } = await supabase
          .from('task_attachments')
          .insert({ task_id: id, file_path: path, file_name: f.name, file_size: f.size })
        if (aErr) throw aErr
      }

      onSaved()
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save the task.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-modal-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#242424] bg-[#171717] px-5 py-3.5">
          <h2 id="task-modal-title" className="font-semibold text-white">
            {task ? `Edit task #${task.task_no}` : 'Add task'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

          <div>
            <label className={label} htmlFor="task-subject">Subject</label>
            <input
              id="task-subject"
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Shree Shyam Jewellers — hoarding design"
              className={input}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="task-priority">Priority</label>
              <select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={input}>
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="task-stage">Stage</label>
              <select id="task-stage" value={stageId} onChange={(e) => setStageId(e.target.value)} className={input}>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="task-label">Label</label>
              <select id="task-label" value={labelId} onChange={(e) => setLabelId(e.target.value)} className={input}>
                <option value="">No label</option>
                {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="task-start">Start</label>
              <DateTimeField id="task-start" value={start} onChange={setStart} />
            </div>
            <div>
              <label className={label} htmlFor="task-due">Due</label>
              <DateTimeField id="task-due" value={due} onChange={setDue} />
            </div>
            <div>
              <label className={label} htmlFor="task-repeat">Repeat</label>
              <select id="task-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} className={input}>
                {REPEATS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Customer */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Customer</span>
              {lead ? (
                <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm">
                  <span className="text-white">#{lead.lead_no} {lead.name}</span>
                  <button onClick={() => { setLead(null); setLeadQ('') }} aria-label="Remove lead" className="text-gray-400 hover:text-white">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={customer}
                    onChange={(e) => { setCustomer(e.target.value); setLeadQ(e.target.value) }}
                    placeholder="Name, or search a lead"
                    className={`${input} pl-9`}
                  />
                  {leadHits.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
                      {leadHits.map((l) => (
                        <li key={l.id}>
                          <button
                            onClick={() => pickLead(l)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                          >
                            <span>#{l.lead_no} {l.name}</span>
                            <span className="text-gray-500">{l.phone}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={label} htmlFor="task-phone">Customer mobile</label>
              <input id="task-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
            </div>
          </div>

          {/* Assign to */}
          <div>
            <span className={label}>Assign to</span>
            {!canAssign && task && !task.task_assignees.some((a) => a.user_id === me) && (
              <p className="mb-2 text-xs text-gray-500">Only a coordinator can hand this to someone else.</p>
            )}
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
              <div className="relative border-b border-[#242424]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={staffQ}
                  onChange={(e) => setStaffQ(e.target.value)}
                  placeholder="Search people"
                  className="w-full bg-transparent py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none"
                />
              </div>
              <ul className="max-h-44 overflow-y-auto py-1">
                {shown.map((s) => {
                  const on = to.has(s.id)
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => toggleTo(s.id)}
                        aria-pressed={on}
                        className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-[#202020]"
                      >
                        <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-orange-500 bg-orange-500' : 'border-[#3a3a3a]'}`}>
                          {on && <Check size={12} className="text-white" />}
                        </span>
                        <span className="flex-1">
                          {s.full_name}
                          {s.id === me && <span className="ml-1 text-gray-500">(me)</span>}
                        </span>
                        {s.role && <span className="text-xs text-gray-600">{s.role.replace('_', ' ')}</span>}
                      </button>
                    </li>
                  )
                })}
                {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No one matches.</li>}
              </ul>
            </div>
            <p className="mt-1 text-xs text-gray-500">{to.size} selected</p>
          </div>

          <div>
            <label className={label} htmlFor="task-desc">Description</label>
            <RichText id="task-desc" value={description} onChange={setDescription} placeholder="What has to be done, in detail…" />
          </div>

          {/* Attachments */}
          <div>
            <span className={label}>Attachments <span className="text-gray-600">(optional)</span></span>
            {files.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm">
                    <Paperclip size={14} className="shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1 truncate text-white">{f.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                    <button
                      onClick={() => setFiles((list) => list.filter((_, n) => n !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="shrink-0 text-gray-400 hover:text-white"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                const tooBig = picked.find((f) => f.size > 25 * 1024 * 1024)
                if (tooBig) setError(`${tooBig.name} is over 25 MB.`)
                setFiles((list) => [...list, ...picked.filter((f) => f.size <= 25 * 1024 * 1024)])
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white"
            >
              <Paperclip size={15} /> Add files
            </button>
            {task && <p className="mt-1 text-xs text-gray-500">Files already on this task are in its Files tab.</p>}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#242424] bg-[#171717] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy && files.length > 0 ? 'Uploading…' : task ? 'Save task' : 'Add task'}
          </button>
        </div>
      </div>
    </div>
  )
}