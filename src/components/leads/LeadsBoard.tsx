import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Plus, Search, LayoutGrid, List, Phone, MessageCircle, Star, X, AlertCircle, RefreshCw, Tag, TrendingUp, Trash2, UserCog, Download, UploadCloud, SlidersHorizontal, Building2, CalendarDays, User, Send, CalendarClock, Filter as FilterIcon, Bookmark, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../lib/permissions'
import { inr, inrCompact } from '../../lib/format'
import LeadDrawer from './LeadDrawer'
import { DateField, DateTimeField } from '../DateField'
import ImportLeads from './ImportLeads'
import LeadSearchCard from './LeadSearchCard'
import { LABEL_CLS, type Label } from './labels'
import { SOURCES, sourceOf, loadSources, fromInputDT, toInputDT, fmtDT, isOverdue, waLink, loadStaff, type Lead, type Source, type Stage, type Staff } from './leadUtils'

type LeadL = Lead & { label_id?: string | null; label_ids?: string[] | null }

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

// One row per stage, straight from lead_board_summary()
type SummaryRow = { stage_id: string | null; cnt: number; amount: number; overdue: number }
type Summary = { byStage: Record<string, { cnt: number; amount: number }>; shown: number; overdue: number }
const NO_SUMMARY: Summary = { byStage: {}, shown: 0, overdue: 0 }

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

// How much the board asks the database for at a time. Nothing else is
// fetched, so the board opens at the same speed with 200 leads or 200,000.
const CARDS_AT_A_TIME = 40   // per column on the board
const LIST_PAGE = 200        // rows in list view
const BULK_PAGE = 1000       // export and delete-all walk through in these steps

// The board draws these and nothing else. Asking for * drags `requirement`
// along — the long 365 comment — and that is most of the weight on the wire.
const CARD_COLS =
  'id, lead_no, name, phone, company, city, source, stage_id, assigned_to, created_by, created_at, next_follow_up, rating, estimated_amount, label_id, label_ids'

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

// ---------------------------------------------------------------------
// Turning the Filter panel into a database query
// ---------------------------------------------------------------------

// The search text goes into the query as-is, so strip the few characters
// that would confuse the filter syntax instead of searching for them.
const cleanQ = (s: string) => s.replace(/[,()%*\\"']/g, ' ').replace(/\s+/g, ' ').trim()

// "up to and including this date" means "before the next one"
const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}

// A Supabase query builder. Typed loosely on purpose: the same helper has
// to narrow a select('*'), a select('id') and a count query.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeadQuery = any

// Narrows a leads query exactly the way the Filter panel reads, so the
// board, the list, the counts, the export and the bulk delete all agree.
function applyLeadFilters(query: LeadQuery, f: Filters, text: string, openStageIds: string[]): LeadQuery {
  let qy: LeadQuery = query.is('deleted_at', null)

  if (f.source !== 'all') qy = qy.eq('source', f.source)
  if (f.stage !== 'all') qy = qy.eq('stage_id', f.stage)
  if (f.owner === 'none') qy = qy.is('assigned_to', null)
  else if (f.owner !== 'all') qy = qy.eq('assigned_to', f.owner)
  if (f.creator !== 'all') qy = qy.eq('created_by', f.creator)
  // A lead carries several labels now, so "has this one" is a contains
  if (f.label === 'none') qy = qy.is('label_id', null)
  else if (f.label !== 'all') qy = qy.contains('label_ids', [f.label])

  if (f.madeFrom) qy = qy.gte('created_at', f.madeFrom)
  if (f.madeTo) qy = qy.lt('created_at', nextDay(f.madeTo))
  if (f.fuFrom) qy = qy.gte('next_follow_up', f.fuFrom)
  if (f.fuTo) qy = qy.lt('next_follow_up', nextDay(f.fuTo))

  if (f.overdueOnly) {
    qy = qy.lt('next_follow_up', new Date().toISOString())
    if (openStageIds.length > 0) qy = qy.in('stage_id', openStageIds)
  }

  const t = cleanQ(text)
  if (t) {
    const parts = [
      `name.ilike.*${t}*`,
      `phone.ilike.*${t}*`,
      `company.ilike.*${t}*`,
      `city.ilike.*${t}*`,
      `campaign_name.ilike.*${t}*`,
    ]
    if (/^\d+$/.test(t)) parts.push(`lead_no.eq.${t}`)
    qy = qy.or(parts.join(','))
  }
  return qy
}

// The same filters, in the shape lead_board_summary() expects
const summaryArgs = (f: Filters, text: string, openStageIds: string[]) => ({
  p_q: cleanQ(text) || null,
  p_source: f.source === 'all' ? null : f.source,
  p_stage: f.stage === 'all' ? null : f.stage,
  p_owner: f.owner === 'all' ? null : f.owner,
  p_creator: f.creator === 'all' ? null : f.creator,
  p_label: f.label === 'all' ? null : f.label,
  p_made_from: f.madeFrom || null,
  p_made_to: f.madeTo || null,
  p_fu_from: f.fuFrom || null,
  p_fu_to: f.fuTo || null,
  p_overdue: f.overdueOnly,
  p_open_stages: openStageIds,
})

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
  const [labels, setLabels] = useState<Label[]>([])
  const [sources, setSources] = useState<Source[]>(SOURCES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')          // what the query uses
  const [typed, setTyped] = useState('')  // what is in the box right now

  const [f, setF] = useState<Filters>(NO_FILTERS)
  const set = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }))
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterTab, setFilterTab] = useState<'filters' | 'saved'>('filters')
  const [saved, setSaved] = useState<SavedFilter[]>(readSaved)
  const [savingName, setSavingName] = useState('')
  const filterRef = useRef<HTMLDivElement>(null)
  const onCount = countOn(f)

  // What the database says is there, without fetching any of it
  const [summary, setSummary] = useState<Summary>(NO_SUMMARY)
  const [totalAll, setTotalAll] = useState(0)

  // Only the cards actually on screen live here
  const [cols, setCols] = useState<Record<string, { rows: LeadL[]; loading: boolean }>>({})
  const [colSize, setColSize] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<LeadL[]>([])
  const [listRows, setListRows] = useState(LIST_PAGE)
  const [listBusy, setListBusy] = useState(false)

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
  // Which leads already have their follow-up count, so it is asked once
  const fuKnown = useRef<Set<string>>(new Set())
  const [lookup, setLookup] = useState<LookupRow[]>([])
  const [looking, setLooking] = useState(false)
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeWord, setWipeWord] = useState('')
  const [wiping, setWiping] = useState<string>('')
  const [exporting, setExporting] = useState<string>('')

  // Stages where a lead can still be chased — overdue only counts in these
  const openStageIds = useMemo(() => stages.filter((s) => !s.is_won && !s.is_lost).map((s) => s.id), [stages])

  // Columns on screen. A stage filter shows that one column on its own.
  const visibleStages = useMemo(
    () => stages.filter((st) => !hiddenStages.includes(st.id) && (f.stage === 'all' || f.stage === st.id)),
    [stages, hiddenStages, f.stage],
  )

  // Answers that arrive after the filters changed again are thrown away
  const queryKey = useMemo(() => JSON.stringify([f, q]), [f, q])
  const keyRef = useRef(queryKey)
  keyRef.current = queryKey

  // ---------- Stages, staff, labels: fetched once ----------
  const loadMeta = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: u }, st, sf, lb, cr, tot, src] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('lead_stages').select('*').eq('is_active', true).order('sort_order'),
        loadStaff(),
        supabase.from('lead_labels').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('lead_cancel_reasons').select('id, name').eq('is_active', true).order('sort_order'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        loadSources(true),
      ])
      setMyId(u.user?.id ?? null)
      setStages((st.data ?? []) as Stage[])
      setStaff(sf)
      setLabels((lb.data ?? []) as Label[])
      setReasons((cr.data ?? []) as { id: string; name: string }[])
      setTotalAll(tot.count ?? 0)
      setSources([...src])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  // ---------- Column headings: counts, ₹ totals, overdue ----------
  const loadSummary = useCallback(async () => {
    if (stages.length === 0) return
    const { data, error: e } = await supabase.rpc('lead_board_summary', summaryArgs(f, q, openStageIds))
    if (keyRef.current !== JSON.stringify([f, q])) return
    if (e) return setError(e.message)
    const byStage: Record<string, { cnt: number; amount: number }> = {}
    let shown = 0
    let overdue = 0
    for (const r of (data ?? []) as SummaryRow[]) {
      byStage[r.stage_id ?? ''] = { cnt: Number(r.cnt) || 0, amount: Number(r.amount) || 0 }
      shown += Number(r.cnt) || 0
      overdue += Number(r.overdue) || 0
    }
    setSummary({ byStage, shown, overdue })
  }, [f, q, openStageIds, stages.length])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  // ---------- One column's cards ----------
  const fetchCol = useCallback(
    async (stageId: string, size: number) => {
      const mine = queryKey
      setCols((c) => ({ ...c, [stageId]: { rows: c[stageId]?.rows ?? [], loading: true } }))
      const qy = applyLeadFilters(supabase.from('leads').select(CARD_COLS).eq('stage_id', stageId), f, q, openStageIds)
      const { data, error: e } = await qy.order('created_at', { ascending: false }).range(0, size - 1)
      if (keyRef.current !== mine) return
      if (e) {
        setError(e.message)
        setCols((c) => ({ ...c, [stageId]: { rows: c[stageId]?.rows ?? [], loading: false } }))
        return
      }
      const got = (data ?? []) as LeadL[]
      setCols((c) => ({ ...c, [stageId]: { rows: got, loading: false } }))
    },
    [f, q, openStageIds, queryKey],
  )

  // ---------- List view page ----------
  const fetchList = useCallback(
    async (size: number) => {
      const mine = queryKey
      setListBusy(true)
      const qy = applyLeadFilters(supabase.from('leads').select(CARD_COLS), f, q, openStageIds)
      const { data, error: e } = await qy.order('created_at', { ascending: false }).range(0, size - 1)
      if (keyRef.current !== mine) return
      setListBusy(false)
      if (e) return setError(e.message)
      const got = (data ?? []) as LeadL[]
      setRows(got)
    },
    [f, q, openStageIds, queryKey],
  )

  // Filters, search or stages changed: start the board over
  useEffect(() => {
    if (view !== 'board' || visibleStages.length === 0) return
    setCols({})
    setColSize({})
    for (const st of visibleStages) void fetchCol(st.id, CARDS_AT_A_TIME)
  }, [view, visibleStages, fetchCol])

  useEffect(() => {
    if (view !== 'list' || stages.length === 0) return
    setListRows(LIST_PAGE)
    void fetchList(LIST_PAGE)
  }, [view, fetchList, stages.length])

  // Re-ask for whatever is on screen right now, after a change
  const refresh = useCallback(() => {
    fuKnown.current.clear()
    void loadSummary()
    void supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .then(({ count }) => setTotalAll(count ?? 0))
    if (view === 'board') for (const st of visibleStages) void fetchCol(st.id, colSize[st.id] ?? CARDS_AT_A_TIME)
    else void fetchList(listRows)
  }, [loadSummary, view, visibleStages, fetchCol, fetchList, colSize, listRows])

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

  // Wait for a pause in the typing before asking the database
  useEffect(() => {
    const t = setTimeout(() => setQ(typed), 350)
    return () => clearTimeout(t)
  }, [typed])

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

  // Every card the browser is holding, so a quick action can find its lead
  const loadedLeads = useMemo(() => {
    const m = new Map<string, LeadL>()
    for (const c of Object.values(cols)) for (const l of c.rows) m.set(l.id, l)
    for (const l of rows) m.set(l.id, l)
    return m
  }, [cols, rows])

  // Follow-up counts for everything on screen, in one go
  useEffect(() => {
    const need = [...loadedLeads.keys()].filter((id) => !fuKnown.current.has(id))
    if (need.length === 0) return
    let alive = true
    ;(async () => {
      for (let i = 0; i < need.length; i += 200) {
        const chunk = need.slice(i, i + 200)
        for (const id of chunk) fuKnown.current.add(id)
        const { data } = await supabase.from('lead_followup_counts').select('lead_id, follow_ups').in('lead_id', chunk)
        if (!alive || !data) continue
        setFuCounts((m) => {
          const next = { ...m }
          for (const r of data as { lead_id: string; follow_ups: number }[]) next[r.lead_id] = r.follow_ups
          return next
        })
      }
    })()
    return () => { alive = false }
  }, [loadedLeads])

  // Change one card where it sits, without re-fetching the page
  const patchLead = (id: string, patch: Partial<LeadL>) => {
    setCols((c) => {
      const next: typeof c = {}
      for (const [k, v] of Object.entries(c)) next[k] = { ...v, rows: v.rows.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
      return next
    })
    setRows((r) => r.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  const dropLead = (id: string) => {
    setCols((c) => {
      const next: typeof c = {}
      for (const [k, v] of Object.entries(c)) next[k] = { ...v, rows: v.rows.filter((l) => l.id !== id) }
      return next
    })
    setRows((r) => r.filter((l) => l.id !== id))
  }

  // Searching for one customer? Show what 365 shows — every field and
  // what is attached — instead of making them open the lead.
  const found = useMemo(() => {
    if (!q.trim()) return []
    const seen = new Map<string, LeadL>()
    for (const c of Object.values(cols)) for (const l of c.rows) seen.set(l.id, l)
    for (const l of rows) seen.set(l.id, l)
    return [...seen.values()].slice(0, 3)
  }, [q, cols, rows])

  const owners = useMemo(() => [...staff].sort((a, b) => a.full_name.localeCompare(b.full_name)), [staff])
  const shown = summary.shown
  const overdueCount = summary.overdue

  // Nothing found here? Ask the database whether this number exists anywhere.
  useEffect(() => {
    const text = q.trim()
    if (text.length < 4 || shown > 0) {
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
  }, [q, shown])

  // ---------- Stage change by drag ----------
  async function moveTo(leadId: string, stageId: string) {
    setMenu(null)
    const lead = loadedLeads.get(leadId)
    if (!lead || lead.stage_id === stageId || !can('lead_edit')) return

    const target = stages.find((x) => x.id === stageId)
    if (target?.is_lost) {
      setCancelPick('')
      setCancelNote('')
      setCancelFor({ leadId, stageId, name: target.name })
      return
    }
    dropLead(leadId) // out of the column it is leaving, so the move looks instant
    const { error: e } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
    if (e) setError(e.message)
    refresh()
  }

  // ---------- Quick actions ----------
  // Ticks one label on or off. The menu stays open so several can be set.
  async function toggleLabel(l: LeadL, labelId: string | null) {
    const now = l.label_ids ?? []
    const next =
      labelId === null ? [] : now.includes(labelId) ? now.filter((x) => x !== labelId) : [...now, labelId]
    patchLead(l.id, { label_ids: next, label_id: next[0] ?? null })
    const { error: e } = await supabase.from('leads').update({ label_ids: next }).eq('id', l.id)
    if (e) { setError(e.message); refresh() }
  }

  async function transfer(leadId: string, userId: string | null) {
    setMenu(null)
    patchLead(leadId, { assigned_to: userId })
    const { error: e } = await supabase.from('leads').update({ assigned_to: userId }).eq('id', leadId)
    if (e) setError(e.message)
    refresh()
  }

  // Every lead the filters match right now, id only, in pages.
  async function matchingIds(): Promise<string[] | null> {
    const ids: string[] = []
    for (let start = 0; ; start += BULK_PAGE) {
      const qy = applyLeadFilters(supabase.from('leads').select('id'), f, q, openStageIds)
      const { data, error: e } = await qy.order('created_at', { ascending: false }).range(start, start + BULK_PAGE - 1)
      if (e) {
        setError(e.message)
        return null
      }
      const got = (data ?? []) as { id: string }[]
      ids.push(...got.map((r) => r.id))
      setWiping(`Finding leads… ${ids.length}`)
      if (got.length < BULK_PAGE) break
    }
    return ids
  }

  // Takes out every lead the filters are showing right now.
  // They are marked deleted, not erased — the backup zip still carries them.
  async function deleteShown() {
    setWiping('Finding leads…')
    const ids = await matchingIds()
    if (!ids) {
      setWiping('')
      setWipeOpen(false)
      return
    }
    if (ids.length === 0) {
      setWiping('')
      setWipeOpen(false)
      return
    }
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
    refresh()
    window.alert(`${gone} leads deleted.`)
  }

  async function removeLead(l: LeadL) {
    if (!window.confirm(`Delete lead #${l.lead_no} ${l.name}? It will be hidden from everyone.`)) return
    dropLead(l.id)
    const { error: e } = await supabase.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', l.id)
    if (e) setError(e.message)
    refresh()
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
    refresh()
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
    refresh()
  }

  // ---------- Export ----------
  async function exportCsv() {
    setExporting('Collecting leads…')
    const all: LeadL[] = []
    for (let start = 0; ; start += BULK_PAGE) {
      const qy = applyLeadFilters(supabase.from('leads').select('*'), f, q, openStageIds)
      const { data, error: e } = await qy.order('created_at', { ascending: false }).range(start, start + BULK_PAGE - 1)
      if (e) {
        setExporting('')
        return setError(e.message)
      }
      const got = (data ?? []) as LeadL[]
      all.push(...got)
      setExporting(`Collecting leads… ${all.length}`)
      if (got.length < BULK_PAGE) break
    }

    const stageName = (id: string | null) => stageOf(id)?.name ?? ''
    const labelName = (ids: string[] | null | undefined) => labelsOn(ids).map((x) => x.name).join(', ')
    const dt = (iso: string | null) =>
      iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : ''

    const head = [
      'Lead no', 'Name', 'Phone', 'Alternate phone', 'Email', 'Company', 'City',
      'Requirement', 'Source', 'Label', 'Stage', 'Assigned to', 'Created by',
      'Created at', 'Next follow-up', 'Rating', 'Estimated amount',
    ]
    const body = all.map((l) => [
      l.lead_no, l.name, l.phone ?? '', l.alt_phone ?? '', l.email ?? '', l.company ?? '', l.city ?? '',
      (l.requirement ?? '').replace(/\s+/g, ' '), sourceOf(l.source).label, labelName(l.label_ids),
      stageName(l.stage_id), nameOf(l.assigned_to), nameOf(l.created_by),
      dt(l.created_at), dt(l.next_follow_up), l.rating, Number(l.estimated_amount) || 0,
    ])

    const cell = (v: unknown) => {
      const t = String(v ?? '')
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const csv = [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n')

    // The BOM makes Excel read Gujarati and ₹ correctly
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting('')
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
    refresh()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const panelSelect =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'
  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager' || s.role === 'hr'))

  const labelsOn = (ids: string[] | null | undefined) =>
    (ids ?? []).map((id) => labelOf(id)).filter(Boolean) as Label[]

  // A lead can wear several labels. Three fit on a card; the rest become "+2".
  const LabelChips = ({ ids, max = 3 }: { ids: string[] | null | undefined; max?: number }) => {
    const list = labelsOn(ids)
    if (list.length === 0) return null
    return (
      <>
        {list.slice(0, max).map((lb) => (
          <span
            key={lb.id}
            title={lb.name}
            className={`max-w-[140px] truncate rounded-full border px-2 py-0.5 text-[10px] ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`}
          >
            {lb.name}
          </span>
        ))}
        {list.length > max && (
          <span
            title={list.slice(max).map((x) => x.name).join(', ')}
            className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-[10px] text-gray-400"
          >
            +{list.length - max}
          </span>
        )}
      </>
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
            {prefs.label && <LabelChips ids={l.label_ids} />}
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
                    <button onClick={() => toggleLabel(l, null)} className="block w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-[#222] hover:text-white">
                      Clear all labels
                    </button>
                    {labels.map((lb) => {
                      const on = (l.label_ids ?? []).includes(lb.id)
                      return (
                        <button
                          key={lb.id}
                          onClick={() => toggleLabel(l, lb.id)}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-[#222] hover:text-white ${on ? 'text-white' : 'text-gray-300'}`}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full border ${LABEL_CLS[lb.color] ?? LABEL_CLS.gray}`} />
                          <span className="min-w-0 flex-1 truncate">{lb.name}</span>
                          {on && <Check size={13} className="shrink-0 text-orange-400" />}
                        </button>
                      )
                    })}
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
            {shown.toLocaleString('en-IN')} of {totalAll.toLocaleString('en-IN')} leads
            {overdueCount > 0 && <span className="ml-2 text-red-400">· {overdueCount.toLocaleString('en-IN')} overdue</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { void loadMeta(); refresh() }}
            className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={16} className={loading || listBusy ? 'animate-spin' : ''} />
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
          {ready && can('lead_export') && shown > 0 && (
            <button
              onClick={exportCsv}
              disabled={!!exporting}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white disabled:opacity-50"
              title={`Export ${shown} leads to Excel`}
            >
              <Download size={16} /> {exporting ? 'Exporting…' : 'Export'}
            </button>
          )}
          {role === 'super_admin' && shown > 0 && (
            <button
              onClick={() => { setWipeWord(''); setWipeOpen(true) }}
              className="flex items-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-400 hover:border-red-700 hover:text-red-300"
              title="Delete every lead shown right now"
            >
              <Trash2 size={16} /> Delete {shown.toLocaleString('en-IN')}
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
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search name, phone, company, city, #no" className={`${inputCls} pl-9`} />
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
                      {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
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
                      {owners.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
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

      {exporting && (
        <p className="mt-3 text-xs text-gray-400">{exporting}</p>
      )}

      {/* What the search turned up, 365 style */}
      {q.trim() && shown > 0 && shown <= 3 && found.length > 0 && (
        <div className="mt-4 space-y-4">
          {found.map((l) => (
            <LeadSearchCard
              key={l.id}
              lead={l}
              stages={stages}
              labels={labels}
              staff={staff}
              onOpen={(id) => setOpenId(id)}
            />
          ))}
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
          {visibleStages.map((st) => {
            const col = cols[st.id]
            const items = col?.rows ?? []
            const total = summary.byStage[st.id]?.cnt ?? 0
            const amount = summary.byStage[st.id]?.amount ?? 0
            const left = Math.max(0, total - items.length)
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
                    <span className="rounded-full bg-black/30 px-2 py-0.5 font-semibold">{total.toLocaleString('en-IN')}</span>
                  </span>
                </div>
                <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-3 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
                  {items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-600">{col?.loading ? 'Loading…' : 'No leads'}</p>
                  ) : (
                    <>
                      {items.map((l) => <Card key={l.id} l={l} />)}
                      {left > 0 && (
                        <button
                          onClick={() => {
                            const next = (colSize[st.id] ?? CARDS_AT_A_TIME) + CARDS_AT_A_TIME
                            setColSize((p) => ({ ...p, [st.id]: next }))
                            void fetchCol(st.id, next)
                          }}
                          disabled={col?.loading}
                          className="rounded-lg border border-dashed border-[#2f2f2f] py-2 text-xs text-gray-400 hover:border-orange-500/50 hover:text-white disabled:opacity-50"
                        >
                          {col?.loading ? 'Loading…' : (
                            <>
                              Show {Math.min(CARDS_AT_A_TIME, left)} more
                              <span className="text-gray-600"> · {left.toLocaleString('en-IN')} left</span>
                            </>
                          )}
                        </button>
                      )}
                    </>
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
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-gray-500">
                    {listBusy ? 'Loading…' : 'No leads match these filters.'}
                  </td>
                </tr>
              ) : (
                rows.map((l) => {
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
                      <td className="py-2.5 pr-4"><span className="flex flex-wrap gap-1"><LabelChips ids={l.label_ids} max={2} /></span></td>
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
          {shown > rows.length && rows.length > 0 && (
            <button
              onClick={() => {
                const next = listRows + LIST_PAGE
                setListRows(next)
                void fetchList(next)
              }}
              disabled={listBusy}
              className="w-full border-t border-[#242424] py-3 text-sm text-orange-400 hover:bg-[#1a1a1a] disabled:opacity-50"
            >
              {listBusy ? 'Loading…' : `Show ${LIST_PAGE} more · ${(shown - rows.length).toLocaleString('en-IN')} left`}
            </button>
          )}
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
          onChanged={refresh}
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
              <h2 className="font-semibold text-red-300">Delete {shown.toLocaleString('en-IN')} leads</h2>
              <button onClick={() => !wiping && setWipeOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5 text-sm">
              <p className="text-gray-300">
                Every lead the filters are showing right now will go — all {shown.toLocaleString('en-IN')} of them,
                out of {totalAll.toLocaleString('en-IN')} in the CRM. Their follow-ups go with them.
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
                {wiping ? 'Deleting…' : `Delete ${shown.toLocaleString('en-IN')}`}
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
          onDone={() => { void loadMeta(); refresh() }}
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
                    {sources.map((s) => (
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