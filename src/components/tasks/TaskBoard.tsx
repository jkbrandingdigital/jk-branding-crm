import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark, Check, Clock, LayoutGrid, List, Loader2, MessageSquare, Paperclip, Pencil, Plus,
  Save, Search, SlidersHorizontal, Tag, Trash2, TrendingUp, User, UserCog, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../lib/permissions'
import { loadStaff, type Staff } from '../leads/leadUtils'
import TaskModal from './TaskModal'
import TaskDetail from './TaskDetail'
import {
  currentAssignees, fmtTaskDT, isTaskOverdue, loadTaskCounts, loadTaskLabels, loadTaskStages, loadTasks,
  PRIORITIES, priorityOf, setAssignees, type Task, type TaskLabel, type TaskStage,
} from './taskUtils'

type View = 'board' | 'list'
type Scope = 'all' | 'mine' | 'created'
type Sort = 'newest' | 'oldest' | 'due_soon' | 'due_late' | 'priority' | 'subject'

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'due_soon', label: 'Due soonest' },
  { key: 'due_late', label: 'Due latest' },
  { key: 'priority', label: 'Priority: high first' },
  { key: 'subject', label: 'Subject A–Z' },
]

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// A filter set the person saved, kept on this device
type SavedFilter = {
  name: string
  scope: Scope
  priority: string
  labelF: string
  creator: string
  assignee: string
  from: string
  till: string
  sort: Sort
}

const SAVED_KEY = 'jk_task_filters'

function readSaved(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    return raw ? (JSON.parse(raw) as SavedFilter[]) : []
  } catch {
    return []
  }
}

function writeSaved(list: SavedFilter[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list))
  } catch {
    /* private browsing: saved sets just won't be remembered */
  }
}

const select =
  'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none'
const iconBtn = 'rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#222] hover:text-white disabled:opacity-30'

export default function TaskBoard() {
  const { user } = useAuth()
  const { can } = usePermissions()
  const me = user?.id ?? ''

  const [tasks, setTasks] = useState<Task[]>([])
  const [stages, setStages] = useState<TaskStage[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [counts, setCounts] = useState<{ comments: Record<string, number>; files: Record<string, number> }>({ comments: {}, files: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [view, setView] = useState<View>('board')
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [priority, setPriority] = useState('all')
  const [labelF, setLabelF] = useState('all')
  const [creator, setCreator] = useState('all')
  const [assignee, setAssignee] = useState('all')
  const [from, setFrom] = useState('')
  const [till, setTill] = useState('')
  const [sort, setSort] = useState<Sort>('newest')
  const [saved, setSaved] = useState<SavedFilter[]>(readSaved)
  const [savingName, setSavingName] = useState('')

  const [editing, setEditing] = useState<Task | 'new' | null>(null)
  const [opened, setOpened] = useState<Task | null>(null)
  const [openTab, setOpenTab] = useState<'details' | 'comments' | 'files'>('details')
  const [dragId, setDragId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; kind: 'label' | 'stage' | 'assign' } | null>(null)
  const [uploadFor, setUploadFor] = useState<Task | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canCreate = can('task_create')
  const canDelete = can('task_delete')
  const canAssign = can('task_assign')
  const canClose = can('task_close')

  const load = useCallback(async () => {
    setError('')
    try {
      const [t, s, l, st, c] = await Promise.all([loadTasks(), loadTaskStages(), loadTaskLabels(), loadStaff(), loadTaskCounts()])
      setTasks(t)
      setStages(s)
      setLabels(l)
      setStaff(st)
      setCounts(c)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // One click anywhere else closes an open card menu
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  // Keep the open detail in step with freshly loaded data
  useEffect(() => {
    if (!opened) return
    const next = tasks.find((t) => t.id === opened.id)
    if (next && next !== opened) setOpened(next)
  }, [tasks, opened])

  const nameOf = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.full_name]))
    return (id: string | null) => (id && m.get(id)) || '—'
  }, [staff])

  const stageOf = useMemo(() => {
    const m = new Map(stages.map((s) => [s.id, s]))
    return (id: string | null) => (id ? m.get(id) : undefined)
  }, [stages])

  const labelOf = useMemo(() => {
    const m = new Map(labels.map((l) => [l.id, l]))
    return (id: string | null) => (id ? m.get(id) : undefined)
  }, [labels])

  // Completed and Rejected are a coordinator's call; for everyone else such a task is read-only
  const isClosed = useCallback(
    (t: Task) => {
      const st = stageOf(t.stage_id)
      return !!(st?.is_done || st?.is_rejected)
    },
    [stageOf],
  )

  const canEditTask = useCallback(
    (t: Task) =>
      can('task_edit') &&
      (t.created_by === me || currentAssignees(t).includes(me) || can('task_assign')) &&
      (canClose || !isClosed(t)),
    [can, me, canClose, isClosed],
  )

  // Stages this person may move a task into
  const openStages = useMemo(
    () => (canClose ? stages : stages.filter((st) => !st.is_done && !st.is_rejected)),
    [stages, canClose],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const fromMs = from ? new Date(from).getTime() : null
    const tillMs = till ? new Date(till).getTime() + 86400000 : null
    return tasks.filter((t) => {
      const to = currentAssignees(t)
      if (scope === 'mine' && !to.includes(me)) return false
      if (scope === 'created' && t.created_by !== me) return false
      if (priority !== 'all' && t.priority !== priority) return false
      if (labelF !== 'all' && (t.label_id ?? '') !== labelF) return false
      if (creator !== 'all' && t.created_by !== creator) return false
      if (assignee !== 'all' && !to.includes(assignee)) return false
      if (fromMs || tillMs) {
        const d = t.due_at ? new Date(t.due_at).getTime() : null
        if (!d) return false
        if (fromMs && d < fromMs) return false
        if (tillMs && d > tillMs) return false
      }
      if (!term) return true
      return [t.subject, t.description, t.customer_name, nameOf(t.created_by), ...to.map(nameOf)]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [tasks, q, scope, priority, labelF, creator, assignee, from, till, me, nameOf])

  const sorted = useMemo(() => {
    const far = Number.MAX_SAFE_INTEGER
    const due = (t: Task) => (t.due_at ? new Date(t.due_at).getTime() : far)
    const made = (t: Task) => new Date(t.created_at).getTime()
    const list = [...filtered]
    switch (sort) {
      case 'oldest': return list.sort((a, b) => made(a) - made(b))
      case 'due_soon': return list.sort((a, b) => due(a) - due(b))
      case 'due_late': return list.sort((a, b) => due(b) - due(a))
      case 'priority': return list.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || due(a) - due(b))
      case 'subject': return list.sort((a, b) => a.subject.localeCompare(b.subject))
      default: return list.sort((a, b) => made(b) - made(a))
    }
  }, [filtered, sort])

  const filtersOn = scope !== 'all' || priority !== 'all' || labelF !== 'all' || creator !== 'all' || assignee !== 'all' || !!from || !!till || sort !== 'newest'
  const clearFilters = () => {
    setScope('all'); setPriority('all'); setLabelF('all'); setCreator('all'); setAssignee('all')
    setFrom(''); setTill(''); setSort('newest')
  }

  function saveCurrentFilter() {
    const name = savingName.trim()
    if (!name) return
    const entry: SavedFilter = { name, scope, priority, labelF, creator, assignee, from, till, sort }
    const next = [...saved.filter((f) => f.name !== name), entry]
    setSaved(next)
    writeSaved(next)
    setSavingName('')
  }

  function applySaved(f: SavedFilter) {
    setScope(f.scope); setPriority(f.priority); setLabelF(f.labelF)
    setCreator(f.creator); setAssignee(f.assignee)
    setFrom(f.from); setTill(f.till); setSort(f.sort ?? 'newest')
  }

  function removeSaved(name: string) {
    const next = saved.filter((f) => f.name !== name)
    setSaved(next)
    writeSaved(next)
  }

  async function remove(t: Task) {
    if (!window.confirm(`Delete "${t.subject}"?`)) return
    const { error: e } = await supabase.from('tasks').delete().eq('id', t.id)
    if (e) return setError(e.message)
    setOpened(null)
    load()
  }

  // Quick actions straight from the card
  async function setLabel(t: Task, labelId: string | null) {
    setMenu(null)
    const { error: e } = await supabase.from('tasks').update({ label_id: labelId }).eq('id', t.id)
    if (e) return setError(e.message)
    load()
  }

  async function toggleAssignee(t: Task, userId: string) {
    const now = currentAssignees(t)
    const next = now.includes(userId) ? now.filter((u) => u !== userId) : [...now, userId]
    if (next.length === 0) return setError('A task needs at least one person.')
    try {
      await setAssignees(t.id, next, t.task_assignees)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function openAt(t: Task, tab: 'details' | 'comments' | 'files') {
    setOpenTab(tab)
    setOpened(t)
  }

  // Paperclip on the card: pick a file and it goes straight up
  async function uploadToTask(t: Task, f: File) {
    if (f.size > 25 * 1024 * 1024) return setError('Files must be under 25 MB.')
    const safe = f.name.replace(/[^\w.\- ]/g, '_')
    const path = `${t.id}/${Date.now()}-${safe}`
    const { error: upErr } = await supabase.storage.from('task-files').upload(path, f)
    if (upErr) return setError(upErr.message)
    const { error: e } = await supabase
      .from('task_attachments')
      .insert({ task_id: t.id, file_path: path, file_name: f.name, file_size: f.size })
    if (e) return setError(e.message)
    load()
  }

  async function moveTo(taskId: string, stageId: string) {
    const t = tasks.find((x) => x.id === taskId)
    if (!t || t.stage_id === stageId) return
    const target = stageOf(stageId)
    if (!canClose && (target?.is_done || target?.is_rejected)) {
      return setError('Only a coordinator can complete or reject a task.')
    }
    if (!canClose && isClosed(t)) {
      return setError('This task is closed. Ask a coordinator to reopen it.')
    }
    setTasks((list) => list.map((x) => (x.id === taskId ? { ...x, stage_id: stageId } : x))) // show it straight away
    const { error: e } = await supabase.from('tasks').update({ stage_id: stageId }).eq('id', taskId)
    if (e) {
      setError(e.message)
      load()
    } else {
      load()
    }
  }

  function Card({ t }: { t: Task }) {
    const stage = stageOf(t.stage_id)
    const label = labelOf(t.label_id)
    const p = priorityOf(t.priority)
    const late = isTaskOverdue(t, stage)
    const mayEdit = canEditTask(t)
    const nc = counts.comments[t.id] ?? 0
    const nf = counts.files[t.id] ?? 0

    return (
      <div
        draggable={mayEdit && (canClose || !isClosed(t))}
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => setDragId(null)}
        onClick={() => setOpened(t)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpened(t)
          }
        }}
        className={`cursor-pointer rounded-lg border bg-[#171717] p-3 transition-colors hover:border-[#3a3a3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
          late ? 'border-red-500/40' : 'border-[#242424]'
        } ${dragId === t.id ? 'opacity-50' : ''}`}
      >
        <p className="text-sm font-medium text-white">{t.subject}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[11px] ${p.cls}`}>{p.label}</span>
          {label && <span className="rounded bg-[#232323] px-1.5 py-0.5 text-[11px] text-gray-300">{label.name}</span>}
          {late && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-400">Overdue</span>}
        </div>

        <dl className="mt-2.5 space-y-1 text-xs text-gray-400">
          <div className="flex gap-2"><dt className="w-10 shrink-0 text-gray-500">By</dt><dd className="truncate">{nameOf(t.created_by)}</dd></div>
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-gray-500">To</dt>
            <dd className="truncate">{currentAssignees(t).map(nameOf).join(', ') || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-gray-500">Due</dt>
            <dd className={late ? 'text-red-400' : ''}>{fmtTaskDT(t.due_at)}</dd>
          </div>
        </dl>

        <div
          className="relative mt-2.5 flex items-center gap-0.5 border-t border-[#222] pt-2"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => setOpened(t)} aria-label="Open task" title="Open" className={iconBtn}>
            <Clock size={14} />
          </button>

          {mayEdit && labels.length > 0 && (
            <button
              onClick={() => setMenu(menu?.id === t.id && menu.kind === 'label' ? null : { id: t.id, kind: 'label' })}
              aria-label="Label" title="Label"
              className={iconBtn}
            >
              <Tag size={14} />
            </button>
          )}

          {mayEdit && (
            <button
              onClick={() => setMenu(menu?.id === t.id && menu.kind === 'stage' ? null : { id: t.id, kind: 'stage' })}
              aria-label="Change status" title="Change status"
              className={iconBtn}
            >
              <TrendingUp size={14} />
            </button>
          )}

          {canAssign && (
            <button
              onClick={() => setMenu(menu?.id === t.id && menu.kind === 'assign' ? null : { id: t.id, kind: 'assign' })}
              aria-label="Assign to" title="Assign to"
              className={iconBtn}
            >
              <UserCog size={14} />
            </button>
          )}

          <button onClick={() => openAt(t, 'comments')} aria-label="Comments" title="Comments" className={`${iconBtn} relative`}>
            <MessageSquare size={14} />
            {nc > 0 && <Badge n={nc} />}
          </button>

          <button
            onClick={() => { setUploadFor(t); fileRef.current?.click() }}
            aria-label="Add a file" title="Add a file"
            className={`${iconBtn} relative`}
          >
            <Paperclip size={14} />
            {nf > 0 && <Badge n={nf} />}
          </button>

          {mayEdit && (
            <button onClick={() => setEditing(t)} aria-label="Edit task" title="Edit" className={iconBtn}><Pencil size={14} /></button>
          )}
          {canDelete && (
            <button onClick={() => remove(t)} aria-label="Delete task" title="Delete" className={`${iconBtn} hover:text-red-400`}><Trash2 size={14} /></button>
          )}

          {menu?.id === t.id && (
            <div className="absolute bottom-9 left-0 z-20 max-h-56 w-56 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl">
              {menu.kind === 'label' && (
                <>
                  <MenuRow on={!t.label_id} onClick={() => setLabel(t, null)}>No label</MenuRow>
                  {labels.map((l) => (
                    <MenuRow key={l.id} on={t.label_id === l.id} onClick={() => setLabel(t, l.id)}>{l.name}</MenuRow>
                  ))}
                </>
              )}
              {menu.kind === 'stage' && openStages.map((st) => (
                <MenuRow key={st.id} on={t.stage_id === st.id} onClick={() => { setMenu(null); moveTo(t.id, st.id) }}>
                  {st.name}
                </MenuRow>
              ))}
              {menu.kind === 'assign' && staff.filter((p) => p.is_active).map((p) => (
                <MenuRow key={p.id} on={currentAssignees(t).includes(p.id)} onClick={() => toggleAssignee(t, p.id)}>
                  {p.full_name}
                </MenuRow>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Title bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-4">
        <h1 className="mr-auto text-xl font-semibold text-white">Tasks</h1>

        {searchOpen ? (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tasks"
              className="w-56 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-8 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <button onClick={() => { setQ(''); setSearchOpen(false) }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={15} />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} aria-label="Search" className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2 text-gray-300 hover:text-white">
            <Search size={18} />
          </button>
        )}

        {canCreate && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            <Plus size={17} /> Add task
          </button>
        )}

        <button
          onClick={() => setFilterOpen((f) => !f)}
          aria-expanded={filterOpen}
          className={`flex items-center gap-2 rounded-lg border bg-[#1a1a1a] px-3 py-2 text-sm ${
            filtersOn ? 'border-orange-500/60 text-orange-300' : 'border-[#2a2a2a] text-gray-300 hover:text-white'
          }`}
        >
          <SlidersHorizontal size={16} /> Filter
        </button>

        <div className="flex overflow-hidden rounded-lg border border-[#2a2a2a]">
          <button
            onClick={() => setView('board')}
            aria-pressed={view === 'board'}
            aria-label="Board view"
            className={`p-2 ${view === 'board' ? 'bg-orange-500 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label="List view"
            className={`p-2 ${view === 'list' ? 'bg-orange-500 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:text-white'}`}
          >
            <List size={17} />
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-3">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={select} aria-label="Whose tasks">
            <option value="all">All I can see</option>
            <option value="mine">Assigned to me</option>
            <option value="created">Created by me</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={select} aria-label="Priority">
            <option value="all">Any priority</option>
            {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={labelF} onChange={(e) => setLabelF(e.target.value)} className={select} aria-label="Label">
            <option value="all">Any label</option>
            <option value="">No label</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={creator} onChange={(e) => setCreator(e.target.value)} className={select} aria-label="Created by">
            <option value="all">Anyone created</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={select} aria-label="Assigned to">
            <option value="all">Anyone assigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <label className="text-xs text-gray-500">
            Due from
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${select} mt-1 block [color-scheme:dark]`} />
          </label>
          <label className="text-xs text-gray-500">
            Due till
            <input type="date" value={till} onChange={(e) => setTill(e.target.value)} className={`${select} mt-1 block [color-scheme:dark]`} />
          </label>
          <label className="text-xs text-gray-500">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${select} mt-1 block`} aria-label="Sort by">
              {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>

          {filtersOn && (
            <button onClick={clearFilters} className="pb-2 text-sm text-gray-400 hover:text-white">Clear</button>
          )}

          {/* Saved sets, kept on this device */}
          <div className="w-full border-t border-[#242424] pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Bookmark size={13} /> Saved filters
              </span>
              {saved.map((f) => (
                <span key={f.name} className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-1 pl-3 pr-1 text-sm">
                  <button onClick={() => applySaved(f)} className="text-gray-300 hover:text-white">{f.name}</button>
                  <button onClick={() => removeSaved(f.name)} aria-label={`Delete ${f.name}`} className="rounded p-0.5 text-gray-500 hover:text-red-400">
                    <X size={13} />
                  </button>
                </span>
              ))}
              {saved.length === 0 && <span className="text-sm text-gray-600">None yet.</span>}

              <span className="ml-auto flex items-center gap-2">
                <input
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveCurrentFilter()}
                  placeholder="Name this filter"
                  className="w-44 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={saveCurrentFilter}
                  disabled={!savingName.trim()}
                  className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-gray-300 hover:text-white disabled:opacity-40"
                >
                  <Save size={14} /> Save
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : view === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((s) => {
            const items = sorted.filter((t) => t.stage_id === s.id)
            return (
              <div
                key={s.id}
                onDragOver={(e) => { if (dragId) e.preventDefault() }}
                onDrop={() => { if (dragId) { moveTo(dragId, s.id); setDragId(null) } }}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-[#242424] bg-[#131313]"
              >
                <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5">
                  <span className="text-sm font-semibold text-white">{s.name}</span>
                  <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-medium text-white">{items.length}</span>
                </div>
                <div className="flex-1 space-y-2.5 p-2.5">
                  {items.map((t) => <Card key={t.id} t={t} />)}
                  {items.length === 0 && <p className="py-8 text-center text-xs text-gray-600">Nothing here.</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a] text-left text-gray-400">
                  <th className="px-4 py-3 font-medium">No.</th>
                  <th className="px-3 py-3 font-medium">Subject</th>
                  <th className="px-3 py-3 font-medium">Customer</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  <th className="px-3 py-3 font-medium">Priority</th>
                  <th className="px-3 py-3 font-medium">Due</th>
                  <th className="px-3 py-3 font-medium">Created by</th>
                  <th className="px-3 py-3 font-medium">Assigned to</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const stage = stageOf(t.stage_id)
                  const p = priorityOf(t.priority)
                  const late = isTaskOverdue(t, stage)
                  const mayEdit = canEditTask(t)
                  return (
                    <tr key={t.id} className="border-b border-[#202020] text-gray-200 hover:bg-[#1a1a1a]">
                      <td className="px-4 py-2.5 text-gray-500">{t.task_no}</td>
                      <td className="max-w-[280px] truncate px-3 py-2.5">
                        <button onClick={() => setOpened(t)} className="text-left text-orange-300 hover:underline">{t.subject}</button>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2.5">{t.customer_name || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs text-orange-300">{stage?.name ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5"><span className={`rounded px-1.5 py-0.5 text-xs ${p.cls}`}>{p.label}</span></td>
                      <td className={`whitespace-nowrap px-3 py-2.5 ${late ? 'text-red-400' : ''}`}>{fmtTaskDT(t.due_at)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">{nameOf(t.created_by)}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5">{currentAssignees(t).map(nameOf).join(', ') || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-0.5">
                          {mayEdit && <button onClick={() => setEditing(t)} aria-label="Edit task" className={iconBtn}><Pencil size={15} /></button>}
                          {canDelete && <button onClick={() => remove(t)} aria-label="Delete task" className={`${iconBtn} hover:text-red-400`}><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-gray-500">
                      {tasks.length === 0 ? (
                        canCreate ? (
                          <>No tasks yet. <button onClick={() => setEditing('new')} className="text-orange-400 hover:underline">Add the first one</button></>
                        ) : 'No tasks yet.'
                      ) : 'No tasks match these filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-[#242424] px-5 py-3 text-sm text-gray-500">
            <User size={14} /> {sorted.length} of {tasks.length} tasks
          </div>
        </div>
      )}

      {editing && (
        <TaskModal
          task={editing === 'new' ? null : editing}
          stages={stages}
          labels={labels}
          staff={staff}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f && uploadFor) uploadToTask(uploadFor, f)
          e.target.value = ''
          setUploadFor(null)
        }}
      />

      {opened && !editing && (
        <TaskDetail
          task={opened}
          initialTab={openTab}
          stages={stages}
          labels={labels}
          staff={staff}
          canEdit={canEditTask(opened)}
          stageChoices={openStages}
          locked={!canClose && isClosed(opened)}
          onEdit={() => setEditing(opened)}
          onClose={() => { setOpened(null); setOpenTab('details') }}
          onChanged={load}
        />
      )}
    </div>
  )
}

function Badge({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[9px] font-semibold leading-none text-white">
      {n > 99 ? '99+' : n}
    </span>
  )
}

function MenuRow({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-[#222] hover:text-white"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {on && <Check size={12} className="text-orange-400" />}
      </span>
      <span className="truncate">{children}</span>
    </button>
  )
}