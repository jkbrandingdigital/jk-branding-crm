import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, X, AlertCircle, RefreshCw, Trash2, Pencil, Repeat, CalendarDays,
  ArrowUp, Minus, ArrowDown, ClipboardList, CalendarCheck, Clock, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { DateField } from '../DateField'
import { loadStaff, type Staff } from '../leads/leadUtils'

type Priority = 'high' | 'medium' | 'low'
type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

type Todo = {
  id: string
  body: string
  priority: Priority
  due_date: string | null
  is_done: boolean
  done_at: string | null
  repeat_every: Repeat
  repeat_until: string | null
  user_id: string
  created_by: string | null
  created_at: string
}

type Tab = 'all' | 'today' | 'pending' | 'repeat'

const TABS: { key: Tab; label: string; icon: typeof ClipboardList; hint: string }[] = [
  { key: 'all', label: 'All To-Do', icon: ClipboardList, hint: 'Everything, done and not done' },
  { key: 'today', label: "Today's To-Do", icon: CalendarCheck, hint: 'Due today and still open' },
  { key: 'pending', label: 'Pending To-Do', icon: Clock, hint: 'Still open from before today' },
  { key: 'repeat', label: 'Recurring To-Do', icon: Repeat, hint: 'Comes back on its own' },
]

// Solid colours, white text. Tailwind's dark palette does not survive the
// light theme, so the heading carries its own colour instead.
const COLUMNS: { key: Priority; label: string; short: string; icon: typeof ArrowUp; color: string }[] = [
  { key: 'high', label: 'High Priority', short: 'High', icon: ArrowUp, color: '#dc2626' },
  { key: 'medium', label: 'Medium Priority', short: 'Medium', icon: Minus, color: '#d97706' },
  { key: 'low', label: 'Low Priority', short: 'Low', icon: ArrowDown, color: '#059669' },
]

const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekly: 'Every week',
  monthly: 'Every month',
}

// "Today" has to mean today in India, not today in UTC
const istToday = () => {
  const now = new Date()
  const ist = new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

type Draft = {
  id: string | null
  body: string
  priority: Priority
  due_date: string
  repeat_every: Repeat
  repeat_until: string
  user_id: string
}
const emptyDraft = (me: string): Draft => ({
  id: null, body: '', priority: 'medium', due_date: istToday(), repeat_every: 'none', repeat_until: '', user_id: me,
})

export default function TodoBoard({ mineOnly = false }: { mineOnly?: boolean }) {
  const { can, ready } = usePermissions()
  const [myId, setMyId] = useState<string | null>(null)
  const [staff, setStaff] = useState<Staff[]>([])
  const [rows, setRows] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('today')
  const [q, setQ] = useState('')
  const [who, setWho] = useState('all')
  const [showDone, setShowDone] = useState(false)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)

  const seeAll = !mineOnly && ready && can('todo_view_all')
  const mayAssign = ready && can('todo_assign')
  const today = istToday()

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, sf] = await Promise.all([supabase.auth.getUser(), loadStaff()])
    const me = u.user?.id ?? null
    setMyId(me)
    setStaff(sf)

    let query = supabase.from('todos').select('*')
    if (!seeAll && me) query = query.eq('user_id', me)
    const { data, error: e } = await query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000)

    if (e) setError(e.message)
    else {
      setError(null)
      setRows((data ?? []) as Todo[])
    }
    setLoading(false)
  }, [seeAll])

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  // Esc closes the add / edit popup
  useEffect(() => {
    if (!draft) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setDraft(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [draft, busy])

  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? 'Someone'
  const assignable = useMemo(() => staff.filter((s) => s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name)), [staff])

  const shown = useMemo(() => {
    const text = q.trim().toLowerCase()
    return rows.filter((t) => {
      if (who !== 'all' && t.user_id !== who) return false
      if (text && !t.body.toLowerCase().includes(text)) return false

      if (tab === 'today') return !t.is_done && t.due_date === today
      if (tab === 'pending') return !t.is_done && (!t.due_date || t.due_date < today)
      if (tab === 'repeat') return t.repeat_every !== 'none' && (showDone || !t.is_done)
      return showDone || !t.is_done
    })
  }, [rows, q, who, tab, today, showDone])

  const openCount = rows.filter((t) => !t.is_done).length
  const overdue = rows.filter((t) => !t.is_done && t.due_date && t.due_date < today).length

  async function toggleDone(t: Todo) {
    setRows((all) => all.map((x) => (x.id === t.id ? { ...x, is_done: !x.is_done } : x)))
    const { error: e } = await supabase.from('todos').update({ is_done: !t.is_done }).eq('id', t.id)
    if (e) {
      setError(e.message)
      return void load()
    }
    // A recurring to-do makes its next copy in the database, so read back
    if (t.repeat_every !== 'none' && !t.is_done) void load()
  }

  async function remove(t: Todo) {
    if (!window.confirm('Delete this to-do?')) return
    setRows((all) => all.filter((x) => x.id !== t.id))
    const { error: e } = await supabase.from('todos').delete().eq('id', t.id)
    if (e) {
      setError(e.message)
      void load()
    }
  }

  function openNew() {
    setFormErr(null)
    setDraft(emptyDraft(myId ?? ''))
  }
  function openEdit(t: Todo) {
    setFormErr(null)
    setDraft({
      id: t.id,
      body: t.body,
      priority: t.priority,
      due_date: t.due_date ?? '',
      repeat_every: t.repeat_every,
      repeat_until: t.repeat_until ?? '',
      user_id: t.user_id,
    })
  }

  async function save() {
    if (!draft) return
    setFormErr(null)
    if (!draft.body.trim()) return setFormErr('Write what has to be done.')

    setBusy(true)
    const payload = {
      body: draft.body.trim(),
      priority: draft.priority,
      due_date: draft.due_date || null,
      repeat_every: draft.repeat_every,
      repeat_until: draft.repeat_every === 'none' ? null : draft.repeat_until || null,
      user_id: draft.user_id || myId,
    }
    const { error: e } = draft.id
      ? await supabase.from('todos').update(payload).eq('id', draft.id)
      : await supabase.from('todos').insert({ ...payload, created_by: myId })
    setBusy(false)
    if (e) return setFormErr(e.message)
    setDraft(null)
    void load()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'

  const Card = ({ t }: { t: Todo }) => {
    const late = !t.is_done && t.due_date && t.due_date < today
    return (
      <div className={`rounded-xl border bg-[#151515] p-3.5 transition-colors ${t.is_done ? 'border-[#1e1e1e] opacity-60' : late ? 'border-red-900/50' : 'border-[#242424]'}`}>
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-semibold text-white">
            {nameOf(t.user_id).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{nameOf(t.user_id)}</p>
            <p className={`mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-300 ${t.is_done ? 'line-through' : ''}`}>
              {t.body}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={t.is_done}
            aria-label={t.is_done ? 'Mark as not done' : 'Mark as done'}
            onClick={() => toggleDone(t)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              t.is_done ? 'border-green-600 bg-green-600 text-white' : 'border-[#3a3a3a] hover:border-orange-500'
            }`}
          >
            {t.is_done && <CheckCircle2 size={14} />}
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-[#222] pt-2.5">
          <span className={`flex items-center gap-1.5 text-[11px] ${late ? 'text-red-400' : 'text-gray-500'}`}>
            <CalendarDays size={13} /> {t.due_date ? fmtDate(t.due_date) : 'No date'}
          </span>
          {t.repeat_every !== 'none' && (
            <span className="flex items-center gap-1 rounded-full bg-[#1f1f1f] px-2 py-0.5 text-[10px] text-gray-400">
              <Repeat size={11} /> {REPEAT_LABEL[t.repeat_every]}
            </span>
          )}
          <span className="ml-auto flex items-center gap-0.5">
            <button onClick={() => openEdit(t)} className="rounded p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white" title="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={() => remove(t)} className="rounded p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-red-400" title="Delete">
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">To-Do</h1>
          <p className="mt-1 text-sm text-gray-400">
            {openCount} open
            {overdue > 0 && <span className="ml-2 text-red-400">· {overdue} past their date</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void load()} className="rounded-lg border border-[#2a2a2a] p-2 text-gray-400 hover:text-white" title="Refresh" aria-label="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-orange-500" />
            Show done
          </label>
          <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
            <Plus size={16} /> Add To-Do
          </button>
        </div>
      </div>

      {/* Search and whose */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search to-do" className={`${inputCls} pl-9`} />
        </div>
        {seeAll && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className={selectCls} aria-label="Whose to-do">
            <option value="all">Everyone</option>
            {myId && <option value={myId}>Mine</option>}
            {assignable.filter((s) => s.id !== myId).map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-1 border-b border-[#242424]">
        {TABS.map(({ key, label, icon: Icon, hint }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            title={hint}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
              tab === key ? 'border-orange-500 font-medium text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Three priorities */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {COLUMNS.map(({ key, label, icon: Icon, color }) => {
          const items = shown.filter((t) => t.priority === key)
          return (
            <section key={key} className="overflow-hidden rounded-2xl border border-[#1f1f1f] bg-[#111]">
              <div className="flex items-center justify-between px-4 py-3" style={{ background: color }}>
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon size={15} /> {label}
                </span>
                <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-semibold text-white">{items.length}</span>
              </div>
              <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto p-3 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
                {items.length === 0 ? (
                  <p className="py-10 text-center text-xs text-gray-500">
                    {loading ? 'Loading…' : 'There are no to-dos to display'}
                  </p>
                ) : (
                  items.map((t) => <Card key={t.id} t={t} />)
                )}
              </div>
            </section>
          )
        })}
      </div>

      {/* Add / edit */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => !busy && setDraft(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#242424] bg-[#121212] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#222] bg-[#171717] px-6 py-4">
              <h2 className="font-semibold">{draft.id ? 'Edit to-do' : 'Add to-do'}</h2>
              <button onClick={() => setDraft(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              {formErr && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  <AlertCircle size={15} /> {formErr}
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">What has to be done *</span>
                <textarea
                  autoFocus
                  rows={3}
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  placeholder="e.g. Send the rate list to Mehta Enterprise"
                  className={`${inputCls} resize-y`}
                />
              </label>

              <div>
                <span className="mb-1.5 block text-xs text-gray-400">Priority</span>
                <div className="flex gap-2">
                  {COLUMNS.map(({ key, short, icon: Icon, color }) => {
                    const on = draft.priority === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDraft({ ...draft, priority: key })}
                        style={on ? { background: color, borderColor: color } : undefined}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                          on ? 'font-medium text-white' : 'border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a] hover:text-white'
                        }`}
                      >
                        <Icon size={14} /> {short}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Date</span>
                  <DateField value={draft.due_date} onChange={(v) => setDraft({ ...draft, due_date: v })} placeholder="No date" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Repeat</span>
                  <select value={draft.repeat_every} onChange={(e) => setDraft({ ...draft, repeat_every: e.target.value as Repeat })} className={inputCls}>
                    {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => (
                      <option key={r} value={r}>{REPEAT_LABEL[r]}</option>
                    ))}
                  </select>
                </label>
              </div>

              {draft.repeat_every !== 'none' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Repeat until (optional)</span>
                  <DateField value={draft.repeat_until} onChange={(v) => setDraft({ ...draft, repeat_until: v })} placeholder="Keeps going" />
                  <p className="mt-1 text-xs text-gray-500">Tick it off and the next one appears on its own.</p>
                </label>
              )}

              {mayAssign && (
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Whose to-do</span>
                  <select value={draft.user_id} onChange={(e) => setDraft({ ...draft, user_id: e.target.value })} className={inputCls}>
                    {myId && <option value={myId}>Me</option>}
                    {assignable.filter((s) => s.id !== myId).map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#222] bg-[#171717] px-6 py-4">
              <button onClick={() => setDraft(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? 'Saving…' : draft.id ? 'Save' : 'Add to-do'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}