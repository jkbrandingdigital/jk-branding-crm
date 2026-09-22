import { useCallback, useEffect, useState } from 'react'
import { X, Phone, MessageCircle, Star, Trash2, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { inr } from '../../lib/format'
import { SOURCES, sourceOf, toInputDT, fromInputDT, fmtDT, isOverdue, waLink, type Lead, type Stage, type Staff } from './leadUtils'

type Activity = { id: string; user_id: string | null; type: string; body: string | null; meta: Record<string, unknown> | null; created_at: string }

const ACT_LABEL: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
}

export default function LeadDrawer({
  leadId, stages, staff, can, myId, onClose, onChanged,
}: {
  leadId: string
  stages: Stage[]
  staff: Staff[]
  can: (k: string) => boolean
  myId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<Lead | null>(null)
  const [acts, setActs] = useState<Activity[]>([])
  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  const [actFollow, setActFollow] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? (id === myId ? 'You' : '—') : 'System')
  const stageName = (id: unknown) => stages.find((s) => s.id === id)?.name ?? '—'
  const editable = can('lead_edit')

  const load = useCallback(async () => {
    const [l, a] = await Promise.all([
      supabase.from('leads').select('*').eq('id', leadId).maybeSingle(),
      supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    ])
    if (l.error || !l.data) return setMsg({ type: 'error', text: l.error?.message ?? 'Lead not found.' })
    setLead(l.data as Lead)
    setForm(l.data as Lead)
    setActs((a.data ?? []) as Activity[])
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  async function update(patch: Record<string, unknown>, ok = 'Saved.') {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('leads').update(patch).eq('id', leadId)
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message })
    setMsg({ type: 'success', text: ok })
    await load()
    onChanged()
  }

  async function saveDetails() {
    if (!form) return
    if (!form.name.trim()) return setMsg({ type: 'error', text: 'Name is required.' })
    await update({
      name: form.name.trim(),
      phone: form.phone,
      alt_phone: form.alt_phone,
      email: form.email,
      company: form.company,
      city: form.city,
      requirement: form.requirement,
      source: form.source,
      estimated_amount: Number(form.estimated_amount) || 0,
    })
  }

  async function addActivity() {
    if (!actText.trim() && !actFollow) return setMsg({ type: 'error', text: 'Write something or pick a follow-up time.' })
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: myId,
      type: actFollow && !actText.trim() ? 'follow_up' : actType,
      body: actText.trim() || null,
      meta: actFollow ? { follow_up: fromInputDT(actFollow) } : null,
    })
    if (error) {
      setBusy(false)
      return setMsg({ type: 'error', text: error.message })
    }
    const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() }
    if (actFollow) patch.next_follow_up = fromInputDT(actFollow)
    if (editable) await supabase.from('leads').update(patch).eq('id', leadId)
    setBusy(false)
    setActText('')
    setActFollow('')
    await load()
    onChanged()
  }

  async function remove() {
    if (!window.confirm('Delete this lead? It will be hidden from everyone.')) return
    await update({ deleted_at: new Date().toISOString() }, 'Lead deleted.')
    onClose()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-60'
  const stage = stages.find((s) => s.id === lead?.stage_id)
  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager'))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col border-l border-[#242424] bg-[#121212]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#222] px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Lead #{lead?.lead_no}</p>
            <h2 className="truncate text-lg font-semibold">{lead?.name ?? 'Loading…'}</h2>
            {lead && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 ${sourceOf(lead.source).cls}`}>{sourceOf(lead.source).label}</span>
                {lead.campaign_name && <span className="text-gray-500">{lead.campaign_name}</span>}
                {isOverdue(lead, stage) && <span className="rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">OVERDUE</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {lead?.phone && (
              <a href={`tel:${lead.phone}`} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" title="Call">
                <Phone size={17} />
              </a>
            )}
            {waLink(lead?.phone ?? null) && (
              <a href={waLink(lead!.phone)!} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-green-400 hover:bg-[#1f1f1f]" title="WhatsApp">
                <MessageCircle size={17} />
              </a>
            )}
            {can('lead_delete') && (
              <button onClick={remove} className="rounded-lg p-2 text-gray-500 hover:bg-red-950/40 hover:text-red-400" title="Delete">
                <Trash2 size={17} />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {msg && (
          <div className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'}`}>
            {msg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {msg.text}
          </div>
        )}

        {lead && form && (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {/* Stage */}
            <div>
              <p className="mb-2 text-xs text-gray-400">Stage</p>
              <div className="flex flex-wrap gap-2">
                {stages.map((s) => (
                  <button
                    key={s.id}
                    disabled={!editable || busy || s.id === lead.stage_id}
                    onClick={() => update({ stage_id: s.id }, `Moved to ${s.name}.`)}
                    className="rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-default"
                    style={
                      s.id === lead.stage_id
                        ? { background: s.color, borderColor: s.color, color: '#fff' }
                        : { borderColor: '#2a2a2a', color: '#bbb' }
                    }
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Assign + rating + follow-up */}
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Assigned to</span>
                <select
                  value={lead.assigned_to ?? ''}
                  disabled={!can('lead_assign') || busy}
                  onChange={(e) => update({ assigned_to: e.target.value || null }, 'Lead transferred.')}
                  className={inputCls}
                >
                  <option value="">Unassigned</option>
                  {(can('lead_assign') ? assignable : staff.filter((s) => s.id === lead.assigned_to)).map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-gray-500">
                  by {nameOf(lead.assigned_by)} · {fmtDT(lead.assigned_at)}
                </span>
              </label>
              <div>
                <span className="mb-1.5 block text-xs text-gray-400">Rating</span>
                <div className="flex gap-1 py-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} disabled={!editable || busy} onClick={() => update({ rating: n === lead.rating ? 0 : n })} aria-label={`${n} stars`}>
                      <Star size={20} className={n <= lead.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'} />
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Next follow-up</span>
                <input
                  type="datetime-local"
                  value={toInputDT(lead.next_follow_up)}
                  disabled={!editable || busy}
                  onChange={(e) => update({ next_follow_up: fromInputDT(e.target.value) }, 'Follow-up set.')}
                  className={`${inputCls} [color-scheme:dark]`}
                />
              </label>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-[#222] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['name', 'Name *'],
                    ['phone', 'Phone'],
                    ['alt_phone', 'Alternate phone'],
                    ['email', 'Email'],
                    ['company', 'Company'],
                    ['city', 'City'],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-xs text-gray-400">{l}</span>
                    <input value={(form[k] as string | null) ?? ''} disabled={!editable} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inputCls} />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Source</span>
                  <select value={form.source} disabled={!editable} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls}>
                    {SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Estimated amount (₹)</span>
                  <input
                    type="number"
                    min={0}
                    onWheel={(e) => e.currentTarget.blur()}
                    value={form.estimated_amount ?? 0}
                    disabled={!editable}
                    onChange={(e) => setForm({ ...form, estimated_amount: Number(e.target.value) })}
                    className={`${inputCls} tabular-nums`}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-gray-400">Requirement</span>
                  <textarea rows={2} value={form.requirement ?? ''} disabled={!editable} onChange={(e) => setForm({ ...form, requirement: e.target.value })} className={`${inputCls} resize-y`} />
                </label>
              </div>
              {editable && (
                <div className="mt-3 flex justify-end">
                  <button onClick={saveDetails} disabled={busy} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                    Save details
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-500">
                Created {fmtDT(lead.created_at)} by {nameOf(lead.created_by)}
                {lead.form_name && ` · Form: ${lead.form_name}`} · Estimated {inr(Number(lead.estimated_amount) || 0)}
              </p>
            </div>

            {/* Add activity */}
            <div className="rounded-xl border border-[#222] p-4">
              <p className="mb-2 text-sm font-medium text-gray-300">Log activity</p>
              <div className="flex flex-wrap gap-2">
                {(['note', 'call', 'whatsapp', 'meeting'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActType(t)}
                    className={`rounded-full px-3 py-1 text-xs ${actType === t ? 'bg-orange-500 font-medium text-black' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}
                  >
                    {ACT_LABEL[t]}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={actText}
                onChange={(e) => setActText(e.target.value)}
                placeholder="What happened? e.g. Called, asked for quotation"
                className={`${inputCls} mt-3 resize-y`}
              />
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Next follow-up (optional)</span>
                  <input type="datetime-local" value={actFollow} onChange={(e) => setActFollow(e.target.value)} className={`${inputCls} [color-scheme:dark]`} />
                </label>
                <button onClick={addActivity} disabled={busy} className="ml-auto flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                  <Send size={14} /> Add
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <p className="mb-3 text-sm font-medium text-gray-300">Timeline</p>
              <ol className="space-y-3 border-l border-[#262626] pl-4">
                {acts.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-orange-500" />
                    <p className="text-gray-300">
                      {a.type === 'created' && (a.body ?? 'Lead created')}
                      {a.type === 'assign' &&
                        `Assigned to ${nameOf((a.meta?.to as string) ?? null)}${a.meta?.auto ? ' (auto, round robin)' : ''}${a.meta?.from ? ` from ${nameOf(a.meta.from as string)}` : ''}`}
                      {a.type === 'stage' && `Stage: ${stageName(a.meta?.from)} → ${stageName(a.meta?.to)}`}
                      {ACT_LABEL[a.type] && (
                        <>
                          <span className="mr-1.5 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[11px] text-gray-400">{ACT_LABEL[a.type]}</span>
                          {a.body}
                          {a.meta?.follow_up ? (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-orange-400">
                              <Clock size={12} /> {fmtDT(a.meta.follow_up as string)}
                            </span>
                          ) : null}
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {nameOf(a.user_id)} · {fmtDT(a.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}