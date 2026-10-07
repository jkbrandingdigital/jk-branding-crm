import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fromInputDT, toInputDT, type Staff } from '../leads/leadUtils'
import { DateTimeField } from '../DateField'
import { DAYS, TYPE_LABEL, searchLeads, type LeadLite, type Reminder, type ReminderType } from './reminderUtils'

type Props = {
  reminder: Reminder | null // null = new
  staff: Staff[]
  lead: LeadLite | null
  onClose: () => void
  onSaved: () => void
}

const input =
  'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
const label = 'mb-1.5 block text-sm text-gray-300'

// Next full hour, as a starting value for a new "Once" reminder
function nextHour() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toInputDT(d.toISOString())
}

export default function ReminderModal({ reminder, staff, lead: initialLead, onClose, onSaved }: Props) {
  const { user, role } = useAuth()
  const me = user?.id ?? ''

  const [title, setTitle] = useState(reminder?.title ?? '')
  const [message, setMessage] = useState(reminder?.message ?? '')
  const [type, setType] = useState<ReminderType>(reminder?.schedule_type ?? 'once')
  const [onceAt, setOnceAt] = useState(reminder?.run_at ? toInputDT(reminder.run_at) : nextHour())
  const [time, setTime] = useState(reminder?.time_of_day?.slice(0, 5) ?? '10:00')
  const [days, setDays] = useState<number[]>(reminder?.weekdays ?? [1])
  const [lead, setLead] = useState<LeadLite | null>(initialLead)
  const [to, setTo] = useState<Set<string>>(
    new Set(reminder ? reminder.reminder_recipients.map((r) => r.user_id) : [me]),
  )
  const [leadQ, setLeadQ] = useState('')
  const [leadHits, setLeadHits] = useState<LeadLite[]>([])
  const [staffQ, setStaffQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Who this person may send a reminder to (database checks the same rule)
  const options = useMemo(() => {
    const myBranch = staff.find((s) => s.id === me)?.branch_id ?? null
    return staff
      .filter(
        (s) =>
          (s.is_active || to.has(s.id)) &&
          (s.id === me ||
            role === 'super_admin' ||
            (role === 'branch_manager' && !!myBranch && s.branch_id === myBranch) ||
            to.has(s.id)),
      )
      .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.full_name.localeCompare(b.full_name)))
  }, [staff, me, role, to])
  const canPickOthers = role === 'super_admin' || role === 'branch_manager'
  const shownOptions = options.filter((s) => s.full_name.toLowerCase().includes(staffQ.trim().toLowerCase()))

  // Lead search with a short pause while typing
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

  const toggleTo = (id: string) =>
    setTo((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleDay = (n: number) => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))

  async function save() {
    setError('')
    if (!title.trim()) return setError('Write what the reminder is about.')
    if (type === 'once') {
      if (!onceAt) return setError('Pick a date and time.')
      if (new Date(onceAt).getTime() <= Date.now()) return setError('Pick a time in the future.')
    } else if (!time) return setError('Pick a time.')
    if (type === 'weekly' && days.length === 0) return setError('Pick at least one day.')
    if (to.size === 0) return setError('Pick at least one person.')

    const payload = {
      title: title.trim(),
      message: message.trim() || null,
      schedule_type: type,
      run_at: type === 'once' ? fromInputDT(onceAt) : null,
      time_of_day: type === 'once' ? null : time,
      weekdays: type === 'weekly' ? [...days].sort((a, b) => a - b) : null,
      lead_id: lead?.id ?? null,
      is_active: true,
    }

    setBusy(true)
    try {
      let id = reminder?.id
      if (!id) {
        const { data, error: e } = await supabase.from('reminders').insert(payload).select('id').single()
        if (e) throw e
        id = data.id as string
      } else {
        const { error: e } = await supabase.from('reminders').update(payload).eq('id', id)
        if (e) throw e
      }

      const before = reminder?.reminder_recipients.map((r) => r.user_id) ?? []
      const add = [...to].filter((u) => !before.includes(u))
      const remove = before.filter((u) => !to.has(u))
      if (remove.length) {
        const { error: e } = await supabase.from('reminder_recipients').delete().eq('reminder_id', id).in('user_id', remove)
        if (e) throw e
      }
      if (add.length) {
        const { error: e } = await supabase.from('reminder_recipients').insert(add.map((user_id) => ({ reminder_id: id, user_id })))
        if (e) throw e
      }
      onSaved()
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save the reminder.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-modal-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#242424] bg-[#171717] px-5 py-3.5">
          <h2 id="reminder-modal-title" className="font-semibold text-white">
            {reminder ? 'Edit reminder' : 'Add reminder'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
          )}

          <div>
            <label className={label} htmlFor="rem-title">Reminder</label>
            <input
              id="rem-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call Vijay bhai for brochure approval"
              className={input}
            />
          </div>

          <div>
            <label className={label} htmlFor="rem-msg">Details <span className="text-gray-600">(optional)</span></label>
            <textarea
              id="rem-msg"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={`${input} resize-y`}
            />
          </div>

          {/* Lead */}
          <div>
            <span className={label}>Customer <span className="text-gray-600">(optional)</span></span>
            {lead ? (
              <div className="flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm">
                <span className="text-white">
                  #{lead.lead_no} {lead.name}
                  {lead.phone && <span className="ml-2 text-gray-500">{lead.phone}</span>}
                </span>
                <button onClick={() => { setLead(null); setLeadQ('') }} aria-label="Remove customer" className="text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={leadQ}
                  onChange={(e) => setLeadQ(e.target.value)}
                  placeholder="Search lead by name, phone or number"
                  className={`${input} pl-9`}
                />
                {leadHits.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
                    {leadHits.map((l) => (
                      <li key={l.id}>
                        <button
                          onClick={() => { setLead(l); setLeadHits([]) }}
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

          {/* Schedule */}
          <div>
            <span className={label}>Repeat</span>
            <div className="inline-flex rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-1">
              {(['once', 'daily', 'weekly'] as ReminderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                    type === t ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              {type === 'once' ? (
                <div>
                  <label className="mb-1 block text-xs text-gray-500" htmlFor="rem-at">Date and time</label>
                  <DateTimeField id="rem-at" value={onceAt} onChange={setOnceAt} className="w-56" />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-gray-500" htmlFor="rem-time">Time</label>
                  <input id="rem-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${input} w-auto [color-scheme:dark]`} />
                </div>
              )}
              {type === 'weekly' && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
                  {DAYS.map((d) => (
                    <button
                      key={d.n}
                      onClick={() => toggleDay(d.n)}
                      aria-pressed={days.includes(d.n)}
                      className={`h-9 w-11 rounded-lg border text-sm transition-colors ${
                        days.includes(d.n)
                          ? 'border-orange-500 bg-orange-500/15 text-orange-300'
                          : 'border-[#2a2a2a] bg-[#1a1a1a] text-gray-400 hover:text-white'
                      }`}
                    >
                      {d.s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Assign to */}
          <div>
            <span className={label}>Remind</span>
            {canPickOthers ? (
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
                  {shownOptions.map((s) => {
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
                          <span className="flex-1">{s.full_name}{s.id === me && <span className="ml-1 text-gray-500">(me)</span>}</span>
                        </button>
                      </li>
                    )
                  })}
                  {shownOptions.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No one matches.</li>}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-400">You</p>
            )}
            {canPickOthers && <p className="mt-1 text-xs text-gray-500">{to.size} selected</p>}
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
            {reminder ? 'Save reminder' : 'Add reminder'}
          </button>
        </div>
      </div>
    </div>
  )
}