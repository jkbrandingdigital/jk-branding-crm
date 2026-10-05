import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bell, BellOff, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Pencil, Plus,
  Search, SlidersHorizontal, Trash2, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { loadStaff, type Staff } from '../leads/leadUtils'
import ReminderModal from './ReminderModal'
import {
  fmtDate, fmtDateTime, fmtTime, loadLeadNames, loadReminders, typeLabel, whenOf,
  type LeadLite, type Reminder, type ReminderType,
} from './reminderUtils'

type Scope = 'all' | 'mine' | 'created'
type Status = 'all' | 'active' | 'done'

const select =
  'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none'
const iconBtn = 'rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#222] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent'

export default function RemindersBoard() {
  const { user, role } = useAuth()
  const me = user?.id ?? ''
  const isAdmin = role === 'super_admin'

  const [rows, setRows] = useState<Reminder[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [leads, setLeads] = useState<Record<string, LeadLite>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [type, setType] = useState<'all' | ReminderType>('all')
  const [status, setStatus] = useState<Status>('all')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [r, s] = await Promise.all([loadReminders(), loadStaff()])
      setRows(r)
      setStaff(s)
      const ids = [...new Set(r.map((x) => x.lead_id).filter((x): x is string => !!x))]
      setLeads(await loadLeadNames(ids))
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nameOf = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.full_name]))
    return (id: string | null) => (id && m.get(id)) || '—'
  }, [staff])

  const canManage = useCallback((r: Reminder) => isAdmin || r.created_by === me, [isAdmin, me])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      const to = r.reminder_recipients.map((x) => x.user_id)
      if (scope === 'mine' && !to.includes(me)) return false
      if (scope === 'created' && r.created_by !== me) return false
      if (type !== 'all' && r.schedule_type !== type) return false
      if (status === 'active' && !r.is_active) return false
      if (status === 'done' && r.is_active) return false
      if (!term) return true
      const hay = [r.title, r.message, r.lead_id ? leads[r.lead_id]?.name : '', nameOf(r.created_by), ...to.map(nameOf)]
        .join(' ')
        .toLowerCase()
      return hay.includes(term)
    })
  }, [rows, q, scope, type, status, me, leads, nameOf])

  useEffect(() => { setPage(1) }, [q, scope, type, status, perPage])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const current = Math.min(page, pages)
  const startIdx = (current - 1) * perPage
  const shown = filtered.slice(startIdx, startIdx + perPage)

  const manageableShown = shown.filter(canManage)
  const allShownSelected = manageableShown.length > 0 && manageableShown.every((r) => selected.has(r.id))
  const filtersOn = scope !== 'all' || type !== 'all' || status !== 'all'

  function toggleRow(id: string) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function toggleAllShown() {
    setSelected((s) => {
      const n = new Set(s)
      manageableShown.forEach((r) => (allShownSelected ? n.delete(r.id) : n.add(r.id)))
      return n
    })
  }

  async function remove(ids: string[]) {
    if (!ids.length) return
    if (!window.confirm(ids.length === 1 ? 'Delete this reminder?' : `Delete ${ids.length} reminders?`)) return
    setBusy(true)
    const { error: e } = await supabase.from('reminders').delete().in('id', ids)
    setBusy(false)
    if (e) return setError(e.message)
    setSelected(new Set())
    load()
  }

  async function toggleActive(r: Reminder) {
    if (!r.is_active && r.schedule_type === 'once' && r.run_at && new Date(r.run_at).getTime() <= Date.now()) {
      setEditing(r) // past one-time reminder: pick a new time first
      return
    }
    const { error: e } = await supabase.from('reminders').update({ is_active: !r.is_active }).eq('id', r.id)
    if (e) return setError(e.message)
    load()
  }

  const editingLead = editing && editing !== 'new' && editing.lead_id ? leads[editing.lead_id] ?? null : null

  return (
    <div className="space-y-4">
      {/* Title bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-4">
        <h1 className="mr-auto text-xl font-semibold text-white">Reminders</h1>

        {searchOpen ? (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reminders"
              className="w-56 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-8 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={() => { setQ(''); setSearchOpen(false) }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} aria-label="Search" className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-2 text-gray-300 hover:text-white">
            <Search size={18} />
          </button>
        )}

        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus size={17} /> Add reminder
        </button>

        <button
          onClick={() => remove([...selected])}
          disabled={selected.size === 0 || busy}
          aria-label="Delete selected"
          title="Delete selected"
          className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700 disabled:opacity-30"
        >
          <Trash2 size={18} />
        </button>

        <button
          onClick={() => setFilterOpen((f) => !f)}
          aria-expanded={filterOpen}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            filtersOn ? 'border-orange-500/60 text-orange-300' : 'border-[#2a2a2a] text-gray-300 hover:text-white'
          } bg-[#1a1a1a]`}
        >
          <SlidersHorizontal size={16} /> Filter
        </button>
      </div>

      {filterOpen && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-3">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={select} aria-label="Whose reminders">
            <option value="all">All I can see</option>
            <option value="mine">Assigned to me</option>
            <option value="created">Created by me</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as 'all' | ReminderType)} className={select} aria-label="Type">
            <option value="all">Any type</option>
            <option value="once">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={select} aria-label="Status">
            <option value="all">Active and done</option>
            <option value="active">Active</option>
            <option value="done">Done / paused</option>
          </select>
          {filtersOn && (
            <button onClick={() => { setScope('all'); setType('all'); setStatus('all') }} className="text-sm text-gray-400 hover:text-white">
              Clear
            </button>
          )}
        </div>
      )}

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a] text-left text-gray-400">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    onChange={toggleAllShown}
                    disabled={manageableShown.length === 0}
                    aria-label="Select all on this page"
                    className="accent-orange-500"
                  />
                </th>
                <th className="w-8" />
                <th className="px-2 py-3 font-medium">No.</th>
                <th className="px-3 py-3 font-medium">Actions</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Reminder</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Time</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Created at</th>
                <th className="px-3 py-3 font-medium">Created by</th>
                <th className="px-3 py-3 font-medium">Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-gray-500">
                    <Loader2 size={20} className="mx-auto animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-gray-500">
                    {rows.length === 0 ? (
                      <>
                        No reminders yet.{' '}
                        <button onClick={() => setEditing('new')} className="text-orange-400 hover:underline">Add the first one</button>
                      </>
                    ) : (
                      'No reminders match these filters.'
                    )}
                  </td>
                </tr>
              )}
              {!loading &&
                shown.map((r, i) => {
                  const mine = canManage(r)
                  const open = expanded === r.id
                  const to = r.reminder_recipients.map((x) => x.user_id)
                  const when = whenOf(r)
                  const lead = r.lead_id ? leads[r.lead_id] : null
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-b border-[#202020] ${r.is_active ? 'text-gray-200' : 'text-gray-500'} hover:bg-[#1a1a1a]`}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleRow(r.id)}
                            disabled={!mine}
                            aria-label={`Select ${r.title}`}
                            className="accent-orange-500"
                          />
                        </td>
                        <td>
                          <button onClick={() => setExpanded(open ? null : r.id)} aria-expanded={open} aria-label="Show details" className={iconBtn}>
                            <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
                          </button>
                        </td>
                        <td className="px-2 py-2.5 text-gray-500">{startIdx + i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => setEditing(r)} disabled={!mine} aria-label="Edit" title="Edit" className={iconBtn}>
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => remove([r.id])} disabled={!mine} aria-label="Delete" title="Delete" className={`${iconBtn} hover:text-red-400`}>
                              <Trash2 size={15} />
                            </button>
                            <button
                              onClick={() => toggleActive(r)}
                              disabled={!mine}
                              aria-label={r.is_active ? 'Pause' : 'Turn on'}
                              title={r.is_active ? 'Pause' : 'Turn on'}
                              className={iconBtn}
                            >
                              {r.is_active ? <Bell size={15} className="text-orange-400" /> : <BellOff size={15} />}
                            </button>
                          </div>
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2.5">{lead ? lead.name : <span className="text-gray-600">—</span>}</td>
                        <td className="max-w-[280px] truncate px-3 py-2.5" title={r.title}>
                          <button onClick={() => setExpanded(open ? null : r.id)} className="text-left text-orange-300 hover:underline">
                            {r.title}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(when)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {r.schedule_type === 'once' ? fmtTime(when) : r.time_of_day?.slice(0, 5)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{typeLabel(r)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">{fmtDateTime(r.created_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{nameOf(r.created_by)}</td>
                        <td className="max-w-[200px] truncate px-3 py-2.5" title={to.map(nameOf).join(', ')}>
                          {to.length === 0 ? '—' : to.length === 1 ? nameOf(to[0]) : `${nameOf(to[0])} +${to.length - 1}`}
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#202020] bg-[#121212]">
                          <td colSpan={12} className="px-6 py-4">
                            <div className="grid gap-4 text-sm md:grid-cols-[2fr_1fr]">
                              <div>
                                <p className="font-medium text-white">{r.title}</p>
                                {r.message && <p className="mt-1 whitespace-pre-wrap text-gray-400">{r.message}</p>}
                                {lead && (
                                  <p className="mt-3 text-gray-400">
                                    Customer: <span className="text-gray-200">#{lead.lead_no} {lead.name}</span>
                                    {lead.phone && <span className="ml-2">{lead.phone}</span>}
                                  </p>
                                )}
                              </div>
                              <dl className="space-y-1.5 text-gray-400">
                                <div className="flex gap-2"><dt className="w-24 shrink-0">Status</dt><dd className={r.is_active ? 'text-green-400' : 'text-gray-500'}>{r.is_active ? 'Active' : r.last_run_at ? 'Done' : 'Paused'}</dd></div>
                                <div className="flex gap-2"><dt className="w-24 shrink-0">Next</dt><dd className="text-gray-200">{r.is_active ? fmtDateTime(r.next_run_at) : '—'}</dd></div>
                                <div className="flex gap-2"><dt className="w-24 shrink-0">Last sent</dt><dd className="text-gray-200">{fmtDateTime(r.last_run_at)}</dd></div>
                                <div className="flex gap-2"><dt className="w-24 shrink-0">Assigned to</dt><dd className="text-gray-200">{to.map(nameOf).join(', ') || '—'}</dd></div>
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center gap-4 border-t border-[#242424] px-5 py-3 text-sm text-gray-400">
          <label className="flex items-center gap-2">
            Rows per page
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className={`${select} py-1`}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>
            {filtered.length === 0 ? '0' : `${startIdx + 1}–${Math.min(startIdx + perPage, filtered.length)}`} of {filtered.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={current === 1} aria-label="First page" className={iconBtn}><ChevronsLeft size={17} /></button>
            <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className={iconBtn}><ChevronLeft size={17} /></button>
            <span className="px-2">Page {current} of {pages}</span>
            <button onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page" className={iconBtn}><ChevronRight size={17} /></button>
            <button onClick={() => setPage(pages)} disabled={current === pages} aria-label="Last page" className={iconBtn}><ChevronsRight size={17} /></button>
          </div>
        </div>
      </div>

      {editing && (
        <ReminderModal
          reminder={editing === 'new' ? null : editing}
          staff={staff}
          lead={editingLead}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}