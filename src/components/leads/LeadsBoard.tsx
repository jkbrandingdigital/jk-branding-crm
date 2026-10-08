import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, LayoutGrid, List, Phone, MessageCircle, Star, X, AlertCircle, RefreshCw, Tag, TrendingUp, Trash2, UserCog, Download, UploadCloud, SlidersHorizontal, Building2, CalendarDays, User, Send, CalendarClock, Filter as FilterIcon, Bookmark, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../lib/permissions'
import { inr, inrCompact } from '../../lib/format'
import LeadDrawer from './LeadDrawer'
import { DateField, DateTimeField } from '../DateField'
import ImportLeads from './ImportLeads'
import { LABEL_CLS, type Label } from './labels'
import { SOURCES, sourceOf, fromInputDT, toInputDT, fmtDT, isOverdue, waLink, loadLeads, loadStaff, type Lead, type Stage, type Staff } from './leadUtils'

type LeadL = Lead & { label_id?: string | null }

type LookupRow = {
  lead_no: number
  name: string
  company: string | null
  city: string | null
  source: string
  stage_name: string | null
  assigned_name: string | null
  branch_name: string | null
  phone_hint: string | null
  created_at: string
  is_mine: boolean
}

type NewLead = {
  name: string
  phone: string
  email: string
  company: string
  city: string
  requirement: string
  source: string
  estimated_amount: string
  next_follow_up: string
  assign: string // 'auto' | 'me' | user id
}
type CardPrefs = {
  company: boolean
  phone: boolean
  created_at: boolean
  created_by: boolean
  assigned_to: boolean
  next_follow_up: boolean
  label: boolean
  source: boolean
  rating: boolean
  amount: boolean
  actions: boolean
}
const DEFAULT_PREFS: CardPrefs = {
  company: true, phone: true, created_at: true, created_by: true, assigned_to: true,
  next_follow_up: true, label: true, source: true, rating: true, amount: true, actions: true,
}
const PREF_LABEL: [keyof CardPrefs, string][] = [
  ['company', 'Company name'],
  ['phone', 'Phone'],
  ['created_at', 'Created date'],
  ['created_by', 'Created by'],
  ['assigned_to', 'Assigned to'],
  ['next_follow_up', 'Next follow-up'],
  ['label', 'Label'],
  ['source', 'Source'],
  ['rating', 'Rating'],
  ['amount', 'Estimated amount'],
  ['actions', 'Quick action buttons'],
]
const PREF_KEY = 'jk_leads_card_prefs'
const STAGE_KEY = 'jk_leads_hidden_stages'
const FILTER_KEY = 'jk_lead_filters'

// Everything the Filter panel can narrow by
type Filters = {
  source: string
  stage: string
  owner: string
  creator: string
  label: string
  madeFrom: string
  madeTo: string
  fuFrom: string
  fuTo: string
  overdueOnly: boolean
}
const NO_FILTERS: Filters = {
  source: 'all', stage: 'all', owner: 'all', creator: 'all', label: 'all',
  madeFrom: '', madeTo: '', fuFrom: '', fuTo: '', overdueOnly: false,
}
type SavedFilter = { name: string; f: Filters }

const countOn = (f: Filters) =>
  (f.source !== 'all' ? 1 : 0) + (f.stage !== 'all' ? 1 : 0) + (f.owner !== 'all' ? 1 : 0) +
  (f.creator !== 'all' ? 1 : 0) + (f.label !== 'all' ? 1 : 0) +
  (f.madeFrom || f.madeTo ? 1 : 0) + (f.fuFrom || f.fuTo ? 1 : 0) + (f.overdueOnly ? 1 : 0)

function readSaved(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(FILTER_KEY)
    return raw ? (JSON.parse(raw) as SavedFilter[]) : []
  } catch {
    return []
  }
}
function writeSaved(list: SavedFilter[]) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(list))
  } catch {
    /* private browsing: the sets simply aren't remembered */
  }
}
const readStore = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

// One labelled row inside the filter panel
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const emptyNew = (): NewLead => ({
  name: '', phone: '', email: '', company: '', city: '', requirement: '', source: 'manual', estimated_amount: '', next_follow_up: '', assign: 'auto',
})

export default function LeadsBoard() {
  const { can, ready } = usePermissions()
  const { role } = useAuth()
  const [myId, setMyId] = useState<string | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [leads, setLeads] = useState<LeadL[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')

  const [f, setF] = useState<Filters>(NO_FILTERS)
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }))
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<'filters' | 'saved'>('filters')
  const [saved, setSaved] = useState<SavedFilter[]>(readSaved)
  const [savingName, setSavingName] = useState('')
  const filterRef = useRef<HTMLDivElement>(null)
  const onCount = countOn(f)

  const [openId, setOpenId] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  // Opened from a notification: ?lead=<id> shows that lead straight away
  useEffect(() => {
    const wanted = params.get('lead')
    if (wanted) setOpenId(wanted)
  }, [params])

  function closeDrawer() {
    setOpenId(null)
    if (params.get('lead')) {
      const next = new URLSearchParams(params)
      next.delete('lead')
      setParams(next, { replace: true })
    }
  }
  const [menu, setMenu] = useState<{ id: string; kind: 'label' | 'assign' | 'stage' } | null>(null)
  const [adding, setAdding] = useState(false)
  const [nl, setNl] = useState<NewLead>(emptyNew)
  const [dup, setDup] = useState<{ lead_no: number; name: string; assigned_name: string | null }[] | null>(null)
  const [addErr, setAddErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<CardPrefs>(() => readStore(PREF_KEY, DEFAULT_PREFS))
  const [hiddenStages, setHiddenStages] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [fu, setFu] = useState<{ lead: LeadL; when: string; text: string } | null>(null)
  const [cancelFor, setCancelFor] = useState<{ leadId: string; stageId: string; name: string } | null>(null)
  const [reasons, setReasons] = useState<{ id: string; name: string }[]>([])
  const [fuCounts, setFuCounts] = useState<Record<string, number>>({})
  const [cancelPick, setCancelPick] = useState('')
  const [cancelNote, setCancelNote] = useState('')
  const [fuErr, setFuErr] = useState<string | null>(null)
  const [lookup, setLookup] = useState<LookupRow[]>([])
  const [looking, setLooking] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeWord, setWipeWord] = useState('')
  const [wiping, setWiping] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: u }, st, sf, ls, lb, lm, cr, fc] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('lead_stages').select('*').eq('is_active', true).order('sort_order'),
        loadStaff(),
        loadLeads(),
        supabase.from('lead_labels').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('leads').select('id, label_id'),
        supabase.from('lead_cancel_reasons').select('id, name').eq('is_active', true).order('sort_order'),
        supabase.from('lead_followup_counts').select('lead_id, follow_ups'),
      ])
      const labelOf = new Map<string, string | null>(((lm.data ?? []) as { id: string; label_id: string | null }[]).map((r) => [r.id, r.label_id]))
      setMyId(u.user?.id ?? null)
      setStages((st.data ?? []) as Stage[])
      setStaff(sf)
      setLeads((ls as LeadL[]).map((l) => ({ ...l, label_id: labelOf.get(l.id) ?? null })))
      setLabels((lb.data ?? []) as Label[])
      setReasons((cr.data ?? []) as { id: string; name: string }[])
      const counts: Record<string, number> = {}
      for (const r of (fc.data ?? []) as { lead_id: string; follow_ups: number }[]) counts[r.lead_id] = r.follow_ups
      setFuCounts(counts)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const savePrefs = (next: CardPrefs) => {
    setPrefs(next)
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)) } catch { /* storage may be blocked */ }
  }
  const toggleStage = (id: string) => {
    const next = hiddenStages.includes(id) ? hiddenStages.filter((x) => x !== id) : [...hiddenStages, id]
    setHiddenStages(next)
    try { localStorage.setItem(STAGE_KEY, JSON.stringify(next)) } catch { /* storage may be blocked */ }
  }

  // Close any open card menu when clicking elsewhere
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menu])

  // The filter panel closes when you click away from it
  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen])

  // Esc closes the Add lead popup
  useEffect(() => {
    if (!adding) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setAdding(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [adding, busy])

  function saveCurrentFilter() {
    const name = savingName.trim()
    if (!name) return
    const next = [...saved.filter((s) => s.name !== name), { name, f }]
    setSaved(next)
    writeSaved(next)
    setSavingName('')
  }
  function removeSaved(name: string) {
    const next = saved.filter((s) => s.name !== name)
    setSaved(next)
    writeSaved(next)
  }

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? '—' : 'Unassigned')
  const stageOf = (id: string | null) => stages.find((s) => s.id === id)
  const labelOf = (id: string | null | undefined) => labels.find((x) => x.id === id)

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return leads.filter((l) => {
      if (f.source !== 'all' && l.source !== f.source) return false
      if (f.stage !== 'all' && l.stage_id !== f.stage) return false
      if (f.owner !== 'all' && (f.owner === 'none' ? l.assigned_to : l.assigned_to !== f.owner)) return false
      if (f.creator !== 'all' && l.created_by !== f.creator) return false
      if (f.label !== 'all' && (f.label === 'none' ? l.label_id : l.label_id !== f.label)) return false
      if (f.overdueOnly && !isOverdue(l, stageOf(l.stage_id))) return false

      const made = l.created_at.slice(0, 10)
      if (f.madeFrom && made < f.madeFrom) return false
      if (f.madeTo && made > f.madeTo) return false

      if (f.fuFrom || f.fuTo) {
        if (!l.next_follow_up) return false
        const due = l.next_follow_up.slice(0, 10)
        if (f.fuFrom && due < f.fuFrom) return false
        if (f.fuTo && due > f.fuTo) return false
      }

      if (!text) return true
      return `${l.lead_no} ${l.name} ${l.phone ?? ''} ${l.company ?? ''} ${l.city ?? ''} ${l.campaign_name ?? ''}`.toLowerCase().includes(text)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, q, f, stages])

  const owners = useMemo(() => {
    const ids = new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[])
    return staff.filter((s) => ids.has(s.id))
  }, [leads, staff])
  const creators = useMemo(() => {
    const ids = new Set(leads.map((l) => l.created_by).filter(Boolean) as string[])
    return staff.filter((s) => ids.has(s.id))
  }, [leads, staff])
  const overdueCount = leads.filter((l) => isOverdue(l, stageOf(l.stage_id))).length

  // Nothing found here? Ask the database whether this number exists anywhere.
  useEffect(() => {
    const text = q.trim()
    if (text.length < 4 || filtered.length > 0) {
      setLookup([])
      return
    }
    let alive = true
    setLooking(true)
    const timer = setTimeout(async () => {
      const res = await supabase.rpc('lead_lookup', { p_query: text })
      if (!alive) return
      if (res.error) setError(`Lookup failed: ${res.error.message}`)
      setLookup((res.data ?? []) as LookupRow[])
      setLooking(false)
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtered.length])


  // ---------- Stage change by drag ----------
  async function moveTo(leadId: string, stageId: string) {
    setMenu(null)
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage_id === stageId || !can('lead_edit')) return

    const target = stages.find((x) => x.id === stageId)
    if (target?.is_lost) {
      setCancelPick('')
      setCancelNote('')
      setCancelFor({ leadId, stageId, name: target.name })
      return
    }
    setLeads((all) => all.map((l) => (l.id === leadId ? { ...l, stage_id: stageId } : l)))
    const { error: e } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
    if (e) {
      setError(e.message)
      load()
    }
  }

  // ---------- Quick actions ----------
  async function setLabel(leadId: string, labelId: string | null) {
    setMenu(null)
    setLeads((all) => all.map((l) => (l.id === leadId ? { ...l, label_id: labelId } : l)))
    const { error: e } = await supabase.from('leads').update({ label_id: labelId }).eq('id', leadId)
    if (e) { setError(e.message); load() }
  }

  async function transfer(leadId: string, userId: string | null) {
    setMenu(null)
    const { error: e } = await supabase.from('leads').update({ assigned_to: userId }).eq('id', leadId)
    if (e) return setError(e.message)
    load()
  }

  // Takes out every lead the filters are showing right now.
  // They are marked deleted, not erased — the backup zip still carries them.
  async function deleteShown() {
    const ids = filtered.map((l) => l.id)
    if (ids.length === 0) return
    const now = new Date().toISOString()
    let gone = 0
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      setWiping(`Deleting ${Math.min(i + chunk.length, ids.length)} of ${ids.length}…`)
      const { error: e } = await supabase.from('leads').update({ deleted_at: now }).in('id', chunk)
      if (e) {
        setWiping('')
        setWipeOpen(false)
        return setError(e.message)
      }
      gone += chunk.length
    }
    setWiping('')
    setWipeOpen(false)
    setWipeWord('')
    setOpenId(null)
    setError(null)
    await load()
    window.alert(`${gone} leads deleted.`)
  }

  async function removeLead(l: LeadL) {
    if (!window.confirm(`Delete lead #${l.lead_no} ${l.name}? It will be hidden from everyone.`)) return
    const { error: e } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', l.id)
    if (e) return setError(e.message)
    load()
  }

  // ---------- Follow-up ----------
  async function saveFollowUp() {
    if (!fu) return
    setFuErr(null)
    if (!fu.when) return setFuErr('Pick the next follow-up date and time.')
    if (!fu.text.trim()) return setFuErr('Write what happened or what to do next.')

    setBusy(true)
    const when = fromInputDT(fu.when)
    const { error: aErr } = await supabase.from('lead_activities').insert({
      lead_id: fu.lead.id,
      user_id: myId,
      type: 'follow_up',
      body: fu.text.trim(),
      meta: { follow_up: when },
    })
    if (aErr) {
      setBusy(false)
      return setFuErr(aErr.message)
    }
    // First follow-up on a brand new lead moves it to Processing
    const firstStage = [...stages].sort((a, b) => a.sort_order - b.sort_order)[0]
    const processing = stages.find((x) => x.name.toLowerCase() === 'processing')
    const patch: Record<string, unknown> = { next_follow_up: when, last_activity_at: new Date().toISOString() }
    if (processing && fu.lead.stage_id === firstStage?.id) patch.stage_id = processing.id

    const { error: lErr } = await supabase.from('leads').update(patch).eq('id', fu.lead.id)
    setBusy(false)
    if (lErr) return setFuErr(lErr.message)
    setFu(null)
    load()
  }

  // ---------- Cancel with a reason ----------
  async function confirmCancel() {
    if (!cancelFor) return
    if (!cancelPick) return setError('Pick a reason first.')
    setBusy(true)
    const { error: e } = await supabase
      .from('leads')
      .update({
        stage_id: cancelFor.stageId,
        cancel_reason: cancelPick,
        cancel_note: cancelNote.trim() || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', cancelFor.leadId)
    setBusy(false)
    if (e) return setError(e.message)
    setCancelFor(null)
    load()
  }

  // ---------- Export ----------
  function exportCsv() {
    const stageName = (id: string | null) => stageOf(id)?.name ?? ''
    const labelName = (id: string | null | undefined) => labelOf(id)?.name ?? ''
    const dt = (iso: string | null) =>
      iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : ''

    const head = [
      'Lead no', 'Name', 'Phone', 'Alternate phone', 'Email', 'Company', 'City',
      'Requirement', 'Source', 'Label', 'Stage', 'Assigned to', 'Created by',
      'Created at', 'Next follow-up', 'Rating', 'Estimated amount',
    ]
    const rows = filtered.map((l) => [
      l.lead_no, l.name, l.phone ?? '', l.alt_phone ?? '', l.email ?? '', l.company ?? '', l.city ?? '',
      (l.requirement ?? '').replace(/\s+/g, ' '), sourceOf(l.source).label, labelName(l.label_id),
      stageName(l.stage_id), nameOf(l.assigned_to), nameOf(l.created_by),
      dt(l.created_at), dt(l.next_follow_up), l.rating, Number(l.estimated_amount) || 0,
    ])

    const cell = (v: unknown) => {
      const t = String(v ?? '')
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')

    // The BOM makes Excel read Gujarati and ₹ correctly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- Add lead ----------
  function openAdd() {
    setNl({ ...emptyNew(), assign: can('lead_assign') ? 'auto' : 'me' })
    setDup(null)
    setAddErr(null)
    setAdding(true)
  }

  async function saveLead(force = false) {
    setAddErr(null)
    if (!nl.name.trim()) return setAddErr('Name is required.')
    if (!nl.phone.trim()) return setAddErr('Phone is required.')

    if (!force) {
      const { data } = await supabase.rpc('find_duplicate_lead', { _phone: nl.phone })
      if (data && (data as unknown[]).length > 0) return setDup(data as { lead_no: number; name: string; assigned_name: string | null }[])
    }

    setBusy(true)
    const assigned_to = nl.assign === 'auto' ? null : nl.assign === 'me' ? myId : nl.assign
    const { error: e } = await supabase.from('leads').insert({
      name: nl.name.trim(),
      phone: nl.phone.trim(),
      email: nl.email.trim() || null,
      company: nl.company.trim() || null,
      city: nl.city.trim() || null,
      requirement: nl.requirement.trim() || null,
      source: nl.source,
      estimated_amount: Number(nl.estimated_amount) || 0,
      next_follow_up: fromInputDT(nl.next_follow_up),
      assigned_to,
    })
    setBusy(false)
    if (e) return setAddErr(e.message)
    setAdding(false)
    load()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const panelSelect =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'
  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager' || s.role === 'hr'))

  const LabelChip = ({ id }: { id: string | null | undefined }) => {
    const lb = labelOf(id)
    if (!lb) return null
    return (
      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`}>{lb.name}</span>
    )
  }

  // ---------- Card ----------
  const Row = ({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="flex items-start gap-2 text-[11px]">
      <span className="mt-0.5 text-gray-600">{icon}</span>
      <span className="w-8 shrink-0 font-medium text-gray-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-gray-300">{children}</span>
    </div>
  )

  const Card = ({ l }: { l: LeadL }) => {
    const st = stageOf(l.stage_id)
    const overdue = isOverdue(l, st)
    const stop = (e: React.MouseEvent) => e.stopPropagation()
    const iconBtn = 'rounded p-1.5 text-gray-500 transition-colors hover:bg-[#1f1f1f] hover:text-white'
    return (
      <div
        draggable={can('lead_edit')}
        onDragStart={() => setDragId(l.id)}
        onDragEnd={() => setDragId(null)}
        onClick={() => setOpenId(l.id)}
        className={`cursor-pointer rounded-xl border bg-[#151515] p-3.5 text-sm transition-colors hover:border-[#3a3a3a] ${overdue ? 'border-red-900/70' : 'border-[#242424]'} ${dragId === l.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">{l.name}</p>
          <span className="shrink-0 text-[11px] text-gray-600">#{l.lead_no}</span>
        </div>

        {prefs.phone && l.phone && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-300">
            <Phone size={12} className="text-green-500" /> {l.phone}
          </p>
        )}

        {(prefs.source || prefs.label || overdue) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {prefs.source && <span className={`rounded-full px-2 py-0.5 text-[10px] ${sourceOf(l.source).cls}`}>{sourceOf(l.source).label}</span>}
            {prefs.label && <LabelChip id={l.label_id} />}
            {overdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">OVERDUE</span>}
          </div>
        )}

        <div className="mt-2.5 space-y-1">
          {prefs.company && l.company && <Row icon={<Building2 size={12} />} label="CN">{l.company}</Row>}
          {prefs.created_at && <Row icon={<CalendarDays size={12} />} label="CD">{fmtDT(l.created_at)}</Row>}
          {prefs.created_by && <Row icon={<User size={12} />} label="BY">{nameOf(l.created_by)}</Row>}
          {prefs.assigned_to && <Row icon={<Send size={12} />} label="TO">{nameOf(l.assigned_to)}</Row>}
          {prefs.next_follow_up && l.next_follow_up && (
            <Row icon={<CalendarClock size={12} />} label="NFD">
              <span className={overdue ? 'text-red-400' : ''}>{fmtDT(l.next_follow_up)}</span>
            </Row>
          )}
        </div>

        {(prefs.rating || prefs.amount) && (
          <div className="mt-2.5 flex items-center justify-between border-t border-[#222] pt-2">
            {prefs.rating ? (
              <span className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={12} className={n <= l.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-700'} />
                ))}
              </span>
            ) : (
              <span />
            )}
            {prefs.amount && <span className="text-xs tabular-nums text-gray-300">{inr(Number(l.estimated_amount) || 0)}</span>}
          </div>
        )}

        {prefs.actions && (
          <div className="relative mt-1.5 flex items-center gap-0.5 border-t border-[#222] pt-1.5" onClick={stop}>
            {l.phone && (
              <a href={`tel:${l.phone}`} className={iconBtn} title="Call">
                <Phone size={14} />
              </a>
            )}
            {waLink(l.phone) && (
              <a href={waLink(l.phone)!} target="_blank" rel="noreferrer" className={`${iconBtn} text-green-500 hover:text-green-400`} title="WhatsApp">
                <MessageCircle size={14} />
              </a>
            )}
            {can('lead_edit') && labels.length > 0 && (
              <button onClick={() => setMenu(menu?.id === l.id && menu.kind === 'label' ? null : { id: l.id, kind: 'label' })} className={iconBtn} title="Label">
                <Tag size={14} />
              </button>
            )}
            {can('lead_edit') && (
              <button
                onClick={() => { setFuErr(null); setFu({ lead: l, when: toInputDT(l.next_follow_up), text: '' }) }}
                className={`${iconBtn} relative`}
                title={fuCounts[l.id] ? `${fuCounts[l.id]} follow-ups so far` : 'Add follow-up'}
              >
                <Send size={14} className="-rotate-12" />
                {fuCounts[l.id] > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-semibold leading-none text-white">
                    {fuCounts[l.id] > 99 ? '99+' : fuCounts[l.id]}
                  </span>
                )}
              </button>
            )}
            {can('lead_edit') && (
              <button onClick={() => setMenu(menu?.id === l.id && menu.kind === 'stage' ? null : { id: l.id, kind: 'stage' })} className={iconBtn} title="Change stage">
                <TrendingUp size={14} />
              </button>
            )}
            {can('lead_assign') && (
              <button onClick={() => setMenu(menu?.id === l.id && menu.kind === 'assign' ? null : { id: l.id, kind: 'assign' })} className={iconBtn} title="Transfer">
                <UserCog size={14} />
              </button>
            )}
            {can('lead_delete') && (
              <button onClick={() => removeLead(l)} className={`${iconBtn} hover:text-red-400`} title="Delete">
                <Trash2 size={14} />
              </button>
            )}

            {menu?.id === l.id && (
              <div className="absolute bottom-9 left-0 z-20 max-h-56 w-52 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl">
                {menu.kind === 'stage' ? (
                  stages.map((st2) => {
                    const needs = Boolean((st2 as { requires_follow_up?: boolean }).requires_follow_up) && !l.next_follow_up
                    return (
                      <button
                        key={st2.id}
                        disabled={st2.id === l.stage_id || needs}
                        onClick={() => moveTo(l.id, st2.id)}
                        title={needs ? 'Set a follow-up date first' : undefined}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: st2.color }} />
                        {st2.name}
                      </button>
                    )
                  })
                ) : menu.kind === 'label' ? (
                  <>
                    <button onClick={() => setLabel(l.id, null)} className="block w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white">
                      No label
                    </button>
                    {labels.map((lb) => (
                      <button key={lb.id} onClick={() => setLabel(l.id, lb.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white">
                        <span className={`h-2 w-2 rounded-full border ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`} />
                        {lb.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button onClick={() => transfer(l.id, null)} className="block w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white">
                      Unassigned
                    </button>
                    {assignable.map((sm) => (
                      <button key={sm.id} onClick={() => transfer(l.id, sm.id)} className="block w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-[#222] hover:text-white">
                        {sm.full_name}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="mt-1 text-sm text-gray-400">
            {filtered.length} of {leads.length} leads
            {overdueCount > 0 && <span className="ml-2 text-red-400">· {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white" title="Refresh" aria-label="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white"
            title="Card settings"
            aria-label="Card settings"
          >
            <SlidersHorizontal size={16} />
          </button>
          <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            <button onClick={() => setView('board')} className={`rounded-md p-1.5 ${view === 'board' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`} aria-label="Board view">
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setView('list')} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`} aria-label="List view">
              <List size={16} />
            </button>
          </div>
          {ready && can('lead_export') && filtered.length > 0 && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
              title={`Export ${filtered.length} leads to Excel`}
            >
              <Download size={16} /> Export
            </button>
          )}
          {role === 'super_admin' && filtered.length > 0 && (
            <button
              onClick={() => { setWipeWord(''); setWipeOpen(true) }}
              className="flex items-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:border-red-700 hover:text-red-300"
              title="Delete every lead shown right now"
            >
              <Trash2 size={16} /> Delete {filtered.length}
            </button>
          )}
          {ready && can('lead_create') && (
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
              title="Import leads from a CSV file"
            >
              <UploadCloud size={16} /> Import
            </button>
          )}
          {ready && can('lead_create') && (
            <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
              <Plus size={16} /> Add lead
            </button>
          )}
        </div>
      </div>

      {/* Search + Filter */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, company, city, #no" className={`${inputCls} pl-9`} />
        </div>

        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            aria-expanded={filterOpen}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
              onCount > 0
                ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
                : 'border-[#2a2a2a] bg-[#161616] text-gray-300 hover:border-[#3a3a3a] hover:text-white'
            }`}
          >
            <FilterIcon size={16} /> Filter
            {onCount > 0 && (
              <span className="rounded-full bg-orange-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{onCount}</span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute right-0 top-12 z-30 w-[22rem] overflow-hidden rounded-xl border border-[#242424] bg-[#151515] shadow-2xl">
              {/* Tabs */}
              <div className="flex items-center border-b border-[#242424] px-2">
                {([['filters', 'FILTERS'], ['saved', 'SAVED FILTERS']] as const).map(([key, text]) => (
                  <button
                    key={key}
                    onClick={() => setFilterTab(key)}
                    className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-semibold tracking-wide transition-colors ${
                      filterTab === key ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {text}
                  </button>
                ))}
                <button onClick={() => setFilterOpen(false)} aria-label="Close" className="ml-auto rounded-md p-1.5 text-gray-500 hover:text-white">
                  <X size={16} />
                </button>
              </div>

              {filterTab === 'filters' ? (
                <div className="max-h-[65vh] space-y-3.5 overflow-y-auto px-4 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-300">Filters</p>
                    {onCount > 0 && (
                      <button onClick={() => setF(NO_FILTERS)} className="flex items-center gap-1 text-xs text-orange-400 hover:underline">
                        <X size={13} /> Clear all
                      </button>
                    )}
                  </div>

                  <Field label="Lead platform">
                    <select value={f.source} onChange={(e) => set({ source: e.target.value })} className={panelSelect}>
                      <option value="all">All platform</option>
                      {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </Field>

                  <Field label="Stage">
                    <select value={f.stage} onChange={(e) => set({ stage: e.target.value })} className={panelSelect}>
                      <option value="all">All stages</option>
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>

                  <Field label="Created by">
                    <select value={f.creator} onChange={(e) => set({ creator: e.target.value })} className={panelSelect}>
                      <option value="all">All lead</option>
                      {creators.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </Field>

                  <Field label="Assign to">
                    <select value={f.owner} onChange={(e) => set({ owner: e.target.value })} className={panelSelect}>
                      <option value="all">All assign</option>
                      <option value="none">Unassigned</option>
                      {owners.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </Field>

                  <Field label="Labels">
                    <select value={f.label} onChange={(e) => set({ label: e.target.value })} className={panelSelect}>
                      <option value="all">All labels</option>
                      <option value="none">No label</option>
                      {labels.map((lb) => <option key={lb.id} value={lb.id}>{lb.name}</option>)}
                    </select>
                  </Field>

                  <Field label="Search by created date">
                    <div className="flex items-center gap-2">
                      <DateField value={f.madeFrom} onChange={(v) => set({ madeFrom: v })} className="flex-1" placeholder="From" />
                      <span className="text-gray-600">→</span>
                      <DateField value={f.madeTo} onChange={(v) => set({ madeTo: v })} className="flex-1" placeholder="To" />
                    </div>
                  </Field>

                  <Field label="Search by follow-up date">
                    <div className="flex items-center gap-2">
                      <DateField value={f.fuFrom} onChange={(v) => set({ fuFrom: v })} className="flex-1" placeholder="From" />
                      <span className="text-gray-600">→</span>
                      <DateField value={f.fuTo} onChange={(v) => set({ fuTo: v })} className="flex-1" placeholder="To" />
                    </div>
                  </Field>

                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={f.overdueOnly}
                      onChange={(e) => set({ overdueOnly: e.target.checked })}
                      className="h-4 w-4 accent-red-500"
                    />
                    Overdue only
                    {overdueCount > 0 && <span className="ml-auto text-xs text-red-400">{overdueCount}</span>}
                  </label>

                  {/* Keep this set for next time */}
                  <div className="flex gap-2 border-t border-[#242424] pt-3.5">
                    <input
                      value={savingName}
                      onChange={(e) => setSavingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
                      placeholder="Name this filter"
                      className="min-w-0 flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                    />
                    <button
                      onClick={saveCurrentFilter}
                      disabled={!savingName.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
                    >
                      <Save size={14} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-h-[65vh] overflow-y-auto px-4 py-4">
                  {saved.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500">
                      No saved filters yet. Set a filter and save it with a name.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {saved.map((s) => (
                        <li key={s.name} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
                          <Bookmark size={14} className="shrink-0 text-orange-400" />
                          <button
                            onClick={() => { setF(s.f); setFilterTab('filters') }}
                            className="min-w-0 flex-1 truncate text-left text-sm text-gray-300 hover:text-white"
                          >
                            {s.name}
                          </button>
                          <span className="shrink-0 text-xs text-gray-600">{countOn(s.f)}</span>
                          <button onClick={() => removeSaved(s.name)} aria-label={`Delete ${s.name}`} className="shrink-0 rounded p-1 text-gray-500 hover:text-red-400">
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 border-t border-[#242424] pt-3 text-xs text-gray-500">
                    Saved on this device only, for your own screen.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Found somewhere else in the company */}
      {(looking || lookup.length > 0) && (
        <section className="mt-4 rounded-2xl border border-yellow-900/50 bg-yellow-950/10 p-4">
          <p className="text-sm font-medium text-yellow-200">
            {looking ? 'Checking the whole company…' : `Already in the CRM (${lookup.length})`}
          </p>
          {!looking && (
            <>
              <p className="mt-0.5 text-xs text-gray-400">Someone else is handling these, so you cannot open them.</p>
              <ul className="mt-3 space-y-2">
                {lookup.map((r) => (
                  <li key={r.lead_no} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#151515] px-3 py-2 text-sm">
                    <span className="text-gray-600">#{r.lead_no}</span>
                    <span className="font-medium">{r.name}</span>
                    {r.company && <span className="text-xs text-gray-400">{r.company}</span>}
                    {r.phone_hint && <span className="text-xs text-gray-500">{r.phone_hint}</span>}
                    <span className="ml-auto text-xs text-gray-400">
                      {r.stage_name ?? '—'} · {r.assigned_name ?? 'Unassigned'}
                      {r.branch_name ? ` · ${r.branch_name}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Board */}
      {view === 'board' ? (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
          {stages.filter((st) => !hiddenStages.includes(st.id)).map((st) => {
            const items = filtered.filter((l) => l.stage_id === st.id)
            const amount = items.reduce((s, l) => s + (Number(l.estimated_amount) || 0), 0)
            return (
              <div
                key={st.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && moveTo(dragId, st.id)}
                className="flex w-72 shrink-0 flex-col rounded-2xl border border-[#1f1f1f] bg-[#111]"
              >
                <div className="flex items-center justify-between rounded-t-2xl px-4 py-3" style={{ background: st.color }}>
                  <span className="font-semibold text-white">{st.name}</span>
                  <span className="flex items-center gap-2 text-xs text-white/90">
                    <span className="rounded bg-black/20 px-1.5 py-0.5">{inrCompact(amount)}</span>
                    <span className="rounded-full bg-black/30 px-2 py-0.5 font-semibold">{items.length}</span>
                  </span>
                </div>
                <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
                  {items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-600">No leads</p>
                  ) : (
                    items.map((l) => <Card key={l.id} l={l} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <section className="mt-5 overflow-x-auto rounded-2xl border border-[#242424] bg-[#151515]">
          <table className="w-full min-w-[1060px] text-sm">
            <thead>
              <tr className="border-b border-[#242424] text-left text-gray-400">
                <th className="px-4 py-3 font-normal">#</th>
                <th className="py-3 pr-4 font-normal">Name</th>
                <th className="py-3 pr-4 font-normal">Phone</th>
                <th className="py-3 pr-4 font-normal">Source</th>
                <th className="py-3 pr-4 font-normal">Label</th>
                <th className="py-3 pr-4 font-normal">Stage</th>
                <th className="py-3 pr-4 font-normal">Assigned to</th>
                <th className="py-3 pr-4 font-normal">Follow-up</th>
                <th className="py-3 pr-4 font-normal">Created</th>
                <th className="py-3 pr-4 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-gray-500">No leads match these filters.</td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const st = stageOf(l.stage_id)
                  const overdue = isOverdue(l, st)
                  return (
                    <tr key={l.id} onClick={() => setOpenId(l.id)} className="cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a]">
                      <td className="px-4 py-2.5 text-gray-500">{l.lead_no}</td>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium">{l.name}</p>
                        {l.company && <p className="text-xs text-gray-500">{l.company}</p>}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-300">{l.phone}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${sourceOf(l.source).cls}`}>{sourceOf(l.source).label}</span>
                      </td>
                      <td className="py-2.5 pr-4"><LabelChip id={l.label_id} /></td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: st?.color ?? '#333' }}>{st?.name ?? '—'}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-300">{nameOf(l.assigned_to)}</td>
                      <td className={`py-2.5 pr-4 ${overdue ? 'text-red-400' : 'text-gray-400'}`}>{fmtDT(l.next_follow_up)}</td>
                      <td className="py-2.5 pr-4 text-gray-400">{fmtDT(l.created_at)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{inr(Number(l.estimated_amount) || 0)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Lead detail */}
      {openId && (
        <LeadDrawer
          leadId={openId}
          stages={stages}
          staff={staff}
          labels={labels}
          can={can}
          myId={myId}
          onClose={closeDrawer}
          onChanged={load}
          onOpenLead={(id) => setOpenId(id)}
        />
      )}

      {/* Cancel reason */}
      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !busy && setCancelFor(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-lg rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
              <div>
                <h2 className="font-semibold">Cancel lead</h2>
                <p className="mt-0.5 text-xs text-gray-500">Tell us why, so the reports stay useful.</p>
              </div>
              <button onClick={() => setCancelFor(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
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
                        name="cancel-reason"
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
              <button onClick={() => setCancelFor(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Keep lead
              </button>
              <button
                onClick={confirmCancel}
                disabled={!cancelPick || busy}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Cancel lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete everything on screen */}
      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !wiping && setWipeOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-lg rounded-2xl border border-red-900/50 bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
              <h2 className="font-semibold text-red-300">Delete {filtered.length} leads</h2>
              <button onClick={() => !wiping && setWipeOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <p className="text-gray-300">
                Every lead the filters are showing right now will go — all {filtered.length} of them, out of {leads.length} in the CRM.
                Their follow-ups go with them.
              </p>
              {onCount > 0 || q.trim() ? (
                <p className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-gray-400">
                  {q.trim() && <>A search is on. </>}
                  {onCount > 0 && <>{onCount} filter{onCount > 1 ? 's are' : ' is'} on. </>}
                  This is only part of the CRM.
                </p>
              ) : (
                <p className="rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                  No filters are on. This is every lead in the CRM.
                </p>
              )}
              <p className="text-xs text-gray-500">
                They are marked deleted, not wiped from the database, so a backup taken earlier still has them.
                Take one from Company → Backup first if you have not.
              </p>

              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">
                  Type <span className="font-semibold text-red-300">DELETE</span> to go ahead
                </span>
                <input
                  autoFocus
                  value={wipeWord}
                  onChange={(e) => setWipeWord(e.target.value)}
                  disabled={!!wiping}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#242424] px-5 py-4">
              {wiping && <span className="mr-auto text-xs text-gray-400">{wiping}</span>}
              <button onClick={() => setWipeOpen(false)} disabled={!!wiping} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white disabled:opacity-40">
                Keep them
              </button>
              <button
                onClick={deleteShown}
                disabled={wipeWord.trim().toUpperCase() !== 'DELETE' || !!wiping}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {wiping ? 'Deleting…' : `Delete ${filtered.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import */}
      {importOpen && (
        <ImportLeads
          staff={staff}
          labels={labels}
          stages={stages}
          myId={myId}
          canAssign={can('lead_assign')}
          onClose={() => setImportOpen(false)}
          onDone={load}
        />
      )}

      {/* Add follow-up */}
      {fu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !busy && setFu(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-md rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-[#242424] px-5 py-4">
              <div>
                <h2 className="font-semibold">Add follow-up</h2>
                <p className="mt-0.5 text-xs text-gray-500">#{fu.lead.lead_no} {fu.lead.name}</p>
              </div>
              <button onClick={() => setFu(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {fuErr && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  <AlertCircle size={15} /> {fuErr}
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Next follow-up date *</span>
                <DateTimeField value={fu.when} onChange={(v) => setFu({ ...fu, when: v })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Comment / message *</span>
                <textarea
                  rows={3}
                  value={fu.text}
                  onChange={(e) => setFu({ ...fu, text: e.target.value })}
                  placeholder="e.g. Called, asked for a quotation. Send rates tomorrow."
                  className={`${inputCls} resize-y`}
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#242424] px-5 py-4">
              <button onClick={() => setFu(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={saveFollowUp}
                disabled={busy}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              >
                {busy ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card settings */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-lg rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
              <h2 className="font-semibold">Card settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-medium text-gray-300">Lead fields</p>
                <ul className="space-y-2">
                  {PREF_LABEL.map(([key, label]) => (
                    <li key={key}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-gray-300">
                        {label}
                        <input
                          type="checkbox"
                          checked={prefs[key]}
                          onChange={(e) => savePrefs({ ...prefs, [key]: e.target.checked })}
                          className="h-4 w-4 accent-orange-500"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-gray-300">Stages</p>
                <ul className="space-y-2">
                  {stages.map((st) => (
                    <li key={st.id}>
                      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-gray-300">
                        {st.name}
                        <input
                          type="checkbox"
                          checked={!hiddenStages.includes(st.id)}
                          onChange={() => toggleStage(st.id)}
                          className="h-4 w-4 accent-orange-500"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => { savePrefs(DEFAULT_PREFS); setHiddenStages([]); localStorage.removeItem(STAGE_KEY) }}
                  className="mt-4 text-xs text-orange-400 hover:underline"
                >
                  Reset to default
                </button>
              </div>
            </div>
            <div className="border-t border-[#242424] px-5 py-3 text-xs text-gray-500">
              Saved on this device only, for your own screen.
            </div>
          </div>
        </div>
      )}

      {/* Add lead */}
      {adding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setAdding(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#121212] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#222] bg-[#171717] px-6 py-4">
              <h2 className="font-semibold">Add lead</h2>
              <button onClick={() => setAdding(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
              {addErr && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  <AlertCircle size={15} /> {addErr}
                </div>
              )}
              {dup && (
                <div className="rounded-lg border border-yellow-900/60 bg-yellow-950/20 p-3 text-sm text-yellow-200">
                  <p className="font-medium">This phone number already exists:</p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {dup.map((d) => (
                      <li key={d.lead_no}>
                        #{d.lead_no} {d.name} · {d.assigned_name ?? 'Unassigned'}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => saveLead(true)} className="mt-2 text-xs text-orange-400 hover:underline">
                    Add anyway
                  </button>
                </div>
              )}
              {/* Two to a row, so the whole form is visible without scrolling */}
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['name', 'Name *'],
                    ['phone', 'Phone *'],
                    ['email', 'Email'],
                    ['company', 'Company'],
                    ['city', 'City'],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-xs text-gray-400">{l}</span>
                    <input
                      value={nl[k]}
                      onChange={(e) => {
                        setNl({ ...nl, [k]: e.target.value })
                        if (k === 'phone') setDup(null)
                      }}
                      inputMode={k === 'phone' ? 'tel' : undefined}
                      className={inputCls}
                    />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Source</span>
                  <select value={nl.source} onChange={(e) => setNl({ ...nl, source: e.target.value })} className={inputCls}>
                    {SOURCES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Estimated amount (₹)</span>
                  <input type="number" min={0} onWheel={(e) => e.currentTarget.blur()} value={nl.estimated_amount} onChange={(e) => setNl({ ...nl, estimated_amount: e.target.value })} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-gray-400">Next follow-up</span>
                  <DateTimeField value={nl.next_follow_up} onChange={(v) => setNl({ ...nl, next_follow_up: v })} />
                </label>
                {can('lead_assign') && (
                  <label className="block">
                    <span className="mb-1 block text-xs text-gray-400">Assign to</span>
                    <select value={nl.assign} onChange={(e) => setNl({ ...nl, assign: e.target.value })} className={inputCls}>
                      <option value="auto">Auto (round robin)</option>
                      <option value="me">Me</option>
                      {assignable.map((s) => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-gray-400">Requirement</span>
                  <textarea rows={3} value={nl.requirement} onChange={(e) => setNl({ ...nl, requirement: e.target.value })} className={`${inputCls} resize-y`} />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#222] bg-[#171717] px-6 py-4">
              <button onClick={() => setAdding(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button onClick={() => saveLead(false)} disabled={busy} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? 'Saving…' : 'Add lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}