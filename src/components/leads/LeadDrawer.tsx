import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, Phone, MessageCircle, Star, Trash2, Send, AlertCircle, CheckCircle2, Clock,
  RefreshCw, Tag, UserCog, TrendingUp, Pencil,
  MoreVertical, ListTodo, CalendarClock, FileText, AlarmClock, StickyNote, Loader2, Users, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { inr } from '../../lib/format'
import { LABEL_CLS, type Label } from './labels'
import { sourceOf, fromInputDT, fmtDT, isOverdue, waLink, type Lead, type Stage, type Staff } from './leadUtils'
import LeadEditModal from './LeadEditModal'
import { DateTimeField } from '../DateField'
import TaskModal from '../tasks/TaskModal'
import { loadTaskLabels, loadTaskStages, type TaskLabel, type TaskStage } from '../tasks/taskUtils'
import ReminderModal from '../reminders/ReminderModal'
import NoteModal from '../notes/NoteModal'
import type { LeadLite } from '../reminders/reminderUtils'

type Activity = { id: string; user_id: string | null; type: string; body: string | null; meta: Record<string, unknown> | null; created_at: string }
type LeadL = Lead & {
  label_id?: string | null
  meta_fields?: Record<string, string> | null
  cancel_reason?: string | null
  cancel_note?: string | null
}

const ACT_LABEL: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
}

type TabKey = 'details' | 'followup' | 'history'

// Another enquiry from the same person — same number, different work
type Sibling = { id: string; lead_no: number; name: string; stage_id: string | null; assigned_to: string | null; created_at: string; requirement: string | null }

export default function LeadDrawer({
  leadId, stages, staff, labels, can, myId, onClose, onChanged, onOpenLead,
}: {
  leadId: string
  stages: Stage[]
  staff: Staff[]
  labels: Label[]
  can: (k: string) => boolean
  myId: string | null
  onClose: () => void
  onChanged: () => void
  onOpenLead?: (id: string) => void
}) {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [lead, setLead] = useState<LeadL | null>(null)
  const [acts, setActs] = useState<Activity[]>([])
  const [tab, setTab] = useState<TabKey>('details')
  const [editMode, setEditMode] = useState(false)
  const [menu, setMenu] = useState<'stage' | 'assign' | 'label' | 'more' | null>(null)
  const [siblings, setSiblings] = useState<Sibling[]>([])
  const [sibOpen, setSibOpen] = useState(false)

  // What the 3-dot menu opens
  const [make, setMake] = useState<'task' | 'reminder' | 'note' | null>(null)
  const [taskStages, setTaskStages] = useState<TaskStage[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabel[]>([])
  const [loadingTask, setLoadingTask] = useState(false)

  const [actType, setActType] = useState('note')
  const [actText, setActText] = useState('')
  const [actFollow, setActFollow] = useState('')
  const [fuOpen, setFuOpen] = useState(false)
  const [presets, setPresets] = useState<{ id: string; title: string; body: string }[]>([])

  const [reasons, setReasons] = useState<{ id: string; name: string }[]>([])
  const [cancelStage, setCancelStage] = useState<string | null>(null)
  const [cancelPick, setCancelPick] = useState('')
  const [cancelNote, setCancelNote] = useState('')

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? (id === myId ? 'You' : '—') : 'System')
  const stageName = (id: unknown) => stages.find((s) => s.id === id)?.name ?? '—'
  const editable = can('lead_edit')

  // The same lead, in the small shape the task / reminder / quotation screens use
  const leadLite: LeadLite | null = lead
    ? { id: lead.id, name: lead.name, lead_no: lead.lead_no, phone: lead.phone ?? null }
    : null

  // Quotations live under each role's own folder
  const quoteBase =
    role === 'super_admin' ? '/admin' : role === 'branch_manager' ? '/manager' : role === 'sales' ? '/sales' : null

  // Stages and labels are only fetched the first time someone makes a task from here
  async function startTask() {
    setMenu(null)
    if (taskStages.length) return setMake('task')
    setLoadingTask(true)
    try {
      const [s, l] = await Promise.all([loadTaskStages(), loadTaskLabels()])
      setTaskStages(s)
      setTaskLabels(l)
      setMake('task')
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    }
    setLoadingTask(false)
  }

  const load = useCallback(async () => {
    const [l, a] = await Promise.all([
      supabase.from('leads').select('*').eq('id', leadId).maybeSingle(),
      supabase.from('lead_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    ])
    if (l.error || !l.data) return setMsg({ type: 'error', text: l.error?.message ?? 'Lead not found.' })
    setLead(l.data as LeadL)
    setActs((a.data ?? []) as Activity[])
  }, [leadId])

  useEffect(() => { load() }, [load])

  // The same number can sit on more than one lead — one customer, two jobs
  useEffect(() => {
    if (!lead?.phone) return setSiblings([])
    let alive = true
    supabase
      .from('leads')
      .select('id, lead_no, name, stage_id, assigned_to, created_at, requirement')
      .eq('phone', lead.phone)
      .neq('id', lead.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => alive && setSiblings((data ?? []) as Sibling[]))
    return () => { alive = false }
  }, [lead?.phone, lead?.id])

  useEffect(() => {
    supabase
      .from('lead_followup_messages')
      .select('id, title, body')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPresets((data ?? []) as { id: string; title: string; body: string }[]))
  }, [])

  useEffect(() => {
    supabase
      .from('lead_cancel_reasons')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setReasons((data ?? []) as { id: string; name: string }[]))
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  async function update(patch: Record<string, unknown>, ok = 'Saved.') {
    setBusy(true)
    const { error } = await supabase.from('leads').update(patch).eq('id', leadId)
    setBusy(false)
    if (error) return setMsg({ type: 'error', text: error.message })
    setMsg({ type: 'success', text: ok })
    await load()
    onChanged()
  }

  async function addActivity() {
    if (!actText.trim()) return setMsg({ type: 'error', text: 'Write what happened.' })
    if (!actFollow) return setMsg({ type: 'error', text: 'Pick the next follow-up date and time.' })

    setBusy(true)
    const { error } = await supabase.from('lead_activities').insert({
      lead_id: leadId,
      user_id: myId,
      type: actType,
      body: actText.trim(),
      meta: { follow_up: fromInputDT(actFollow) },
    })
    if (error) {
      setBusy(false)
      return setMsg({ type: 'error', text: error.message })
    }
    const patch: Record<string, unknown> = {
      last_activity_at: new Date().toISOString(),
      next_follow_up: fromInputDT(actFollow),
    }
    // First follow-up on a brand new lead moves it to Processing
    const firstStage = [...stages].sort((a, b) => a.sort_order - b.sort_order)[0]
    const processing = stages.find((x) => x.name.toLowerCase() === 'processing')
    if (processing && lead?.stage_id === firstStage?.id) patch.stage_id = processing.id
    if (editable) await supabase.from('leads').update(patch).eq('id', leadId)

    setBusy(false)
    setActText('')
    setActFollow('')
    setFuOpen(false)
    setMsg({ type: 'success', text: 'Follow-up added.' })
    await load()
    onChanged()
  }

  async function remove() {
    if (!window.confirm('Delete this lead? It will be hidden from everyone.')) return
    await update({ deleted_at: new Date().toISOString() }, 'Lead deleted.')
    onClose()
  }

  function pickStage(s: Stage) {
    setMenu(null)
    if (s.id === lead?.stage_id) return
    if (s.is_lost) {
      setCancelPick('')
      setCancelNote('')
      setCancelStage(s.id)
      return
    }
    update({ stage_id: s.id }, `Moved to ${s.name}.`)
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-60'
  const stage = stages.find((s) => s.id === lead?.stage_id)
  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager' || s.role === 'hr'))
  const leadLabel = labels.find((x) => x.id === lead?.label_id)
  const formFields = lead?.meta_fields && typeof lead.meta_fields === 'object' ? Object.entries(lead.meta_fields) : []
  const followUps = acts.filter((a) => a.meta?.follow_up || a.type === 'follow_up')
  const iconBtn = 'rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#1f1f1f] hover:text-white'

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'followup', label: 'Follow-ups', count: followUps.length },
    { key: 'history', label: 'History', count: acts.length },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={() => !busy && onClose()}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="flex items-start justify-between gap-3 border-b border-[#222] bg-[#171717] px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Lead #{lead?.lead_no}</p>
            <h2 className="truncate text-lg font-semibold">{lead?.name ?? 'Loading…'}</h2>
            {lead && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 ${sourceOf(lead.source).cls}`}>{sourceOf(lead.source).label}</span>
                {leadLabel && (
                  <span className={`rounded-full border px-2 py-0.5 ${LABEL_CLS[leadLabel.color] ?? LABEL_CLS.gray}`}>{leadLabel.name}</span>
                )}
                {stage && <span className="rounded-full px-2 py-0.5 text-white" style={{ background: stage.color }}>{stage.name}</span>}
                {isOverdue(lead, stage) && <span className="rounded-full bg-red-600 px-2 py-0.5 font-semibold text-white">OVERDUE</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} className={iconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Same number, different enquiry */}
        {siblings.length > 0 && (
          <div className="border-b border-[#222] bg-[#1a1612] px-5 py-2.5">
            <button
              onClick={() => setSibOpen((o) => !o)}
              aria-expanded={sibOpen}
              className="flex w-full items-center gap-2 text-left text-xs text-amber-300/90 hover:text-amber-200"
            >
              <Users size={14} className="shrink-0" />
              <span className="flex-1">
                Same number on {siblings.length} other lead{siblings.length > 1 ? 's' : ''} — same customer, different work
              </span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${sibOpen ? 'rotate-180' : ''}`} />
            </button>

            {sibOpen && (
              <ul className="mt-2 space-y-1.5">
                {siblings.map((sb) => {
                  const st = stages.find((x) => x.id === sb.stage_id)
                  return (
                    <li key={sb.id}>
                      <button
                        onClick={() => onOpenLead?.(sb.id)}
                        disabled={!onOpenLead}
                        className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-[#2a2620] bg-[#151210] px-3 py-2 text-left text-xs transition-colors enabled:hover:border-amber-700/60 disabled:cursor-default"
                      >
                        <span className="text-gray-500">#{sb.lead_no}</span>
                        <span className="font-medium text-gray-200">{sb.name}</span>
                        {st && (
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ background: st.color }}>
                            {st.name}
                          </span>
                        )}
                        {sb.requirement && (
                          <span className="min-w-0 flex-1 truncate text-gray-500">{sb.requirement}</span>
                        )}
                        <span className="ml-auto shrink-0 text-gray-500">
                          {nameOf(sb.assigned_to)} · {fmtDT(sb.created_at)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Action row */}
        <div className="relative flex flex-wrap items-center gap-1 border-b border-[#222] px-4 py-2">
          {lead?.phone && (
            <a href={`tel:${lead.phone}`} className={iconBtn} title="Call">
              <Phone size={17} />
            </a>
          )}
          {waLink(lead?.phone ?? null) && (
            <a href={waLink(lead!.phone)!} target="_blank" rel="noreferrer" className={`${iconBtn} text-green-500 hover:text-green-400`} title="WhatsApp">
              <MessageCircle size={17} />
            </a>
          )}
          {editable && (
            <button onClick={() => setEditMode(true)} className={iconBtn} title="Edit lead">
              <Pencil size={17} />
            </button>
          )}
          {editable && (
            <button onClick={() => { setActText(''); setActFollow(''); setFuOpen(true) }} className={iconBtn} title="Add follow-up">
              <Send size={17} className="-rotate-12" />
            </button>
          )}
          {editable && (
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === 'stage' ? null : 'stage') }} className={iconBtn} title="Change stage">
              <TrendingUp size={17} />
            </button>
          )}
          {can('lead_assign') && (
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === 'assign' ? null : 'assign') }} className={iconBtn} title="Transfer">
              <UserCog size={17} />
            </button>
          )}
          {editable && labels.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === 'label' ? null : 'label') }} className={iconBtn} title="Label">
              <Tag size={17} />
            </button>
          )}
          <button onClick={() => load()} className={iconBtn} title="Refresh">
            <RefreshCw size={17} />
          </button>
          {can('lead_delete') && (
            <button onClick={remove} className={`${iconBtn} hover:text-red-400`} title="Delete">
              <Trash2 size={17} />
            </button>
          )}

          {/* Everything you can start from this lead */}
          <div className="relative ml-auto">
            <button
              onClick={(e) => { e.stopPropagation(); setMenu(menu === 'more' ? null : 'more') }}
              aria-haspopup="menu"
              aria-expanded={menu === 'more'}
              className={`${iconBtn} ${menu === 'more' ? 'bg-[#1f1f1f] text-white' : ''}`}
              title="More"
            >
              {loadingTask ? <Loader2 size={17} className="animate-spin" /> : <MoreVertical size={17} />}
            </button>

            {menu === 'more' && (
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl"
              >
                <MenuItem icon={ListTodo} label="Create Task" show={can('task_create')} onClick={startTask} />
                <MenuItem icon={CalendarClock} label="Create Meeting" soon />
                <MenuItem
                  icon={FileText}
                  label="Create Quotation"
                  show={can('quote_create') && !!quoteBase}
                  onClick={() => { setMenu(null); navigate(`${quoteBase}/quotations/new?lead=${lead?.id}`) }}
                />
                <MenuItem icon={AlarmClock} label="Set Reminder" show={can('mod_reminders')} onClick={() => { setMenu(null); setMake('reminder') }} />
                <MenuItem icon={StickyNote} label="Create Notes" show={can('mod_notes')} onClick={() => { setMenu(null); setMake('note') }} />
              </div>
            )}
          </div>

          {menu && menu !== 'more' && (
            <div className="absolute left-4 top-12 z-20 max-h-64 w-56 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl">
              {menu === 'stage' &&
                stages.map((s) => {
                  const needs = Boolean((s as { requires_follow_up?: boolean }).requires_follow_up) && !lead?.next_follow_up
                  return (
                    <button
                      key={s.id}
                      disabled={s.id === lead?.stage_id || needs}
                      onClick={() => pickStage(s)}
                      title={needs ? 'Set a follow-up first' : undefined}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white disabled:opacity-40"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </button>
                  )
                })}
              {menu === 'assign' && (
                <>
                  <button onClick={() => { setMenu(null); update({ assigned_to: null }, 'Lead unassigned.') }} className="block w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white">
                    Unassigned
                  </button>
                  {assignable.map((s) => (
                    <button key={s.id} onClick={() => { setMenu(null); update({ assigned_to: s.id }, 'Lead transferred.') }} className="block w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white">
                      {s.full_name}
                    </button>
                  ))}
                </>
              )}
              {menu === 'label' && (
                <>
                  <button onClick={() => { setMenu(null); update({ label_id: null }, 'Label removed.') }} className="block w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white">
                    No label
                  </button>
                  {labels.map((lb) => (
                    <button key={lb.id} onClick={() => { setMenu(null); update({ label_id: lb.id }, 'Label updated.') }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white">
                      <span className={`h-2 w-2 rounded-full border ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`} />
                      {lb.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#222] px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === t.key ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="rounded-full bg-[#242424] px-1.5 py-0.5 text-[11px] text-gray-300">{t.count}</span>}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`mx-5 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'}`}>
            {msg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {msg.text}
          </div>
        )}

        {/* Body */}
        {lead && (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {tab === 'details' && (
              <div className="space-y-5">
                {lead.cancel_reason && (
                  <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm">
                    <p className="text-red-300">Cancelled · {lead.cancel_reason}</p>
                    {lead.cancel_note && <p className="mt-1 text-gray-300">{lead.cancel_note}</p>}
                  </div>
                )}

                <div className="grid gap-5 lg:grid-cols-2">
                  <section className="overflow-hidden rounded-xl border border-[#242424]">
                    <h3 className="bg-[#1b1b1b] px-4 py-2.5 text-sm font-medium text-gray-300">Lead information</h3>
                    <div className="space-y-3 p-4">
                      <>
                          <Row label="Name" value={lead.name} />
                          <Row label="Company" value={lead.company} />
                          <Row label="Phone" value={lead.phone} />
                          <Row label="Alternate phone" value={lead.alt_phone} />
                          <Row label="Email" value={lead.email} />
                          <Row label="City" value={lead.city} />
                          <Row label="Requirement" value={lead.requirement} wrap />
                          {lead.campaign_name && <Row label="Campaign" value={lead.campaign_name} />}
                          {lead.form_name && <Row label="Form" value={lead.form_name} />}
                      </>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-xl border border-[#242424]">
                    <h3 className="bg-[#1b1b1b] px-4 py-2.5 text-sm font-medium text-gray-300">General information</h3>
                    <div className="space-y-3 p-4">
                      <Row label="Created" value={`${fmtDT(lead.created_at)} · ${nameOf(lead.created_by)}`} />
                      <Row
                        label="Next follow-up"
                        value={lead.next_follow_up ? fmtDT(lead.next_follow_up) : 'Not set'}
                        tone={isOverdue(lead, stage) ? 'text-red-400' : undefined}
                      />
                      <Row label="Stage" value={stage?.name ?? '—'} />
                      <Row label="Source" value={sourceOf(lead.source).label} />
                      <Row label="Label" value={leadLabel?.name ?? 'No label'} />
                      <Row label="Estimated amount" value={inr(Number(lead.estimated_amount) || 0)} />

                      <div>
                        <p className="mb-1 text-xs text-gray-500">Rating</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} disabled={!editable || busy} onClick={() => update({ rating: n === lead.rating ? 0 : n })} aria-label={`${n} stars`}>
                              <Star size={18} className={n <= lead.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'} />
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-1 block text-xs text-gray-500">Assigned to</span>
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

                    </div>
                  </section>
                </div>

                {formFields.length > 0 && (
                  <section className="overflow-hidden rounded-xl border border-[#242424]">
                    <h3 className="bg-[#1b1b1b] px-4 py-2.5 text-sm font-medium text-gray-300">Form answers</h3>
                    <dl className="grid gap-x-6 gap-y-2 p-4 text-xs sm:grid-cols-2">
                      {formFields.map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="shrink-0 text-gray-500">{k.replace(/_/g, ' ')}:</dt>
                          <dd className="break-words text-gray-300">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
              </div>
            )}

            {tab === 'followup' && (
              <div className="space-y-5">
                <button
                  onClick={() => { setActText(''); setActFollow(''); setFuOpen(true) }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#2f2f2f] py-3 text-sm text-gray-400 hover:border-orange-500/50 hover:text-white"
                >
                  <Send size={16} className="-rotate-12" /> Add follow-up
                </button>

                {followUps.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">No follow-ups yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {followUps.map((a) => (
                      <li key={a.id} className="rounded-lg border border-[#242424] bg-[#151515] px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[11px] text-gray-400">{ACT_LABEL[a.type] ?? a.type}</span>
                          <span className="text-gray-300">{a.body}</span>
                          {a.meta?.follow_up ? (
                            <span className="ml-auto inline-flex items-center gap-1 text-xs text-orange-400">
                              <Clock size={12} /> {fmtDT(a.meta.follow_up as string)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">{nameOf(a.user_id)} · {fmtDT(a.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === 'history' && (
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
                    <p className="text-[11px] text-gray-500">{nameOf(a.user_id)} · {fmtDT(a.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Add follow-up */}
      {fuOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => !busy && setFuOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-md rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[#242424] px-5 py-4">
              <div>
                <h2 className="font-semibold">Add follow-up</h2>
                <p className="mt-0.5 text-xs text-gray-500">#{lead?.lead_no} {lead?.name}</p>
              </div>
              <button onClick={() => setFuOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Next follow-up date <span className="text-orange-400">*</span></span>
                <DateTimeField value={actFollow} onChange={setActFollow} />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Follow-up message</span>
                <select
                  value=""
                  onChange={(e) => {
                    const pick = presets.find((x) => x.id === e.target.value)
                    if (pick) setActText(pick.body)
                  }}
                  className={inputCls}
                >
                  <option value="">Select a ready message…</option>
                  {presets.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-xs text-gray-400">Activity type</span>
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
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Comment / message <span className="text-orange-400">*</span></span>
                <textarea
                  rows={4}
                  value={actText}
                  onChange={(e) => setActText(e.target.value)}
                  placeholder="Enter message"
                  className={`${inputCls} resize-y`}
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#242424] px-5 py-4">
              <button onClick={() => setFuOpen(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={addActivity}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              >
                <Send size={14} /> {busy ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel reason */}
      {cancelStage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => !busy && setCancelStage(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-lg rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
              <div>
                <h2 className="font-semibold">Cancel lead</h2>
                <p className="mt-0.5 text-xs text-gray-500">Tell us why, so the reports stay useful.</p>
              </div>
              <button onClick={() => setCancelStage(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <p className="text-xs text-gray-400">Select reason <span className="text-orange-400">*</span></p>
              <ul className="grid auto-rows-fr gap-2 sm:grid-cols-2">
                {reasons.map((r) => (
                  <li key={r.id} className="h-full">
                    <label
                      className={`flex h-full cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm leading-snug transition-colors ${
                        cancelPick === r.name
                          ? 'border-orange-500 bg-orange-500/10 text-white'
                          : 'border-[#2a2a2a] text-gray-300 hover:border-[#3a3a3a] hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cancel-reason-drawer"
                        checked={cancelPick === r.name}
                        onChange={() => setCancelPick(r.name)}
                        className="h-4 w-4 shrink-0 accent-orange-500"
                      />
                      <span className="min-w-0">{r.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Note (optional)</span>
                <textarea
                  rows={2}
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  placeholder="Anything worth remembering about this lead"
                  className={`${inputCls} resize-y`}
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#242424] px-5 py-4">
              <button onClick={() => setCancelStage(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Keep lead
              </button>
              <button
                onClick={async () => {
                  if (!cancelPick) return setMsg({ type: 'error', text: 'Pick a reason first.' })
                  await update(
                    {
                      stage_id: cancelStage,
                      cancel_reason: cancelPick,
                      cancel_note: cancelNote.trim() || null,
                      cancelled_at: new Date().toISOString(),
                    },
                    'Lead cancelled.',
                  )
                  setCancelStage(null)
                }}
                disabled={!cancelPick || busy}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Cancel lead'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Started from the 3-dot menu — the lead is already filled in */}
      {make === 'task' && lead && (
        <div onClick={(e) => e.stopPropagation()}>
          <TaskModal
            task={null}
            stages={taskStages}
            labels={taskLabels}
            staff={staff}
            lead={leadLite}
            onClose={() => setMake(null)}
            onSaved={() => { setMake(null); setMsg({ type: 'success', text: 'Task created.' }) }}
          />
        </div>
      )}

      {make === 'reminder' && lead && (
        <div onClick={(e) => e.stopPropagation()}>
          <ReminderModal
            reminder={null}
            staff={staff}
            lead={leadLite}
            onClose={() => setMake(null)}
            onSaved={() => { setMake(null); setMsg({ type: 'success', text: 'Reminder set.' }) }}
          />
        </div>
      )}

      {make === 'note' && lead && (
        <div onClick={(e) => e.stopPropagation()}>
          <NoteModal
            note={null}
            leadId={lead.id}
            leadName={`#${lead.lead_no} ${lead.name}`}
            onClose={() => setMake(null)}
            onSaved={() => { setMake(null); setMsg({ type: 'success', text: 'Note saved.' }) }}
          />
        </div>
      )}

      {editMode && lead && (
        <LeadEditModal
          lead={lead}
          stages={stages}
          staff={staff}
          labels={labels}
          can={can}
          onClose={() => setEditMode(false)}
          onSaved={() => { setEditMode(false); setMsg({ type: 'success', text: 'Saved.' }); load(); onChanged() }}
        />
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon, label, show = true, soon, onClick,
}: {
  icon: typeof ListTodo
  label: string
  show?: boolean
  soon?: boolean
  onClick?: () => void
}) {
  if (!show) return null
  if (soon) {
    return (
      <span className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-600">
        <Icon size={15} />
        <span className="flex-1">{label}</span>
        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
      </span>
    )
  }
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#232323] hover:text-white"
    >
      <Icon size={15} className="text-orange-400" />
      {label}
    </button>
  )
}

function Row({ label, value, wrap, tone }: { label: string; value: string | null | undefined; wrap?: boolean; tone?: string }) {
  return (
    <div className="border-b border-[#1e1e1e] pb-2 last:border-0 last:pb-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm ${tone ?? 'text-gray-200'} ${wrap ? 'whitespace-pre-wrap' : 'truncate'}`}>{value || '—'}</p>
    </div>
  )
}