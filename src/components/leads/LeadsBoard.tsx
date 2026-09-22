import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Search, LayoutGrid, List, Phone, MessageCircle, Star, X, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { inr, inrCompact } from '../../lib/format'
import LeadDrawer from './LeadDrawer'
import { SOURCES, sourceOf, fromInputDT, fmtDT, isOverdue, waLink, loadLeads, loadStaff, type Lead, type Stage, type Staff } from './leadUtils'

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
const emptyNew = (): NewLead => ({
  name: '', phone: '', email: '', company: '', city: '', requirement: '', source: 'manual', estimated_amount: '', next_follow_up: '', assign: 'auto',
})

export default function LeadsBoard() {
  const { can, ready } = usePermissions()
  const [myId, setMyId] = useState<string | null>(null)
  const [stages, setStages] = useState<Stage[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const [sourceF, setSourceF] = useState('all')
  const [ownerF, setOwnerF] = useState('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [nl, setNl] = useState<NewLead>(emptyNew)
  const [dup, setDup] = useState<{ lead_no: number; name: string; assigned_name: string | null }[] | null>(null)
  const [addErr, setAddErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: u }, st, sf, ls] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('lead_stages').select('*').eq('is_active', true).order('sort_order'),
        loadStaff(),
        loadLeads(),
      ])
      setMyId(u.user?.id ?? null)
      setStages((st.data ?? []) as Stage[])
      setStaff(sf)
      setLeads(ls)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const nameOf = (id: string | null) => (id ? staff.find((s) => s.id === id)?.full_name ?? '—' : 'Unassigned')
  const stageOf = (id: string | null) => stages.find((s) => s.id === id)

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return leads.filter((l) => {
      if (sourceF !== 'all' && l.source !== sourceF) return false
      if (ownerF !== 'all' && (ownerF === 'none' ? l.assigned_to : l.assigned_to !== ownerF)) return false
      if (overdueOnly && !isOverdue(l, stageOf(l.stage_id))) return false
      if (!text) return true
      return `${l.lead_no} ${l.name} ${l.phone ?? ''} ${l.company ?? ''} ${l.city ?? ''} ${l.campaign_name ?? ''}`.toLowerCase().includes(text)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, q, sourceF, ownerF, overdueOnly, stages])

  const owners = useMemo(() => {
    const ids = new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[])
    return staff.filter((s) => ids.has(s.id))
  }, [leads, staff])
  const overdueCount = leads.filter((l) => isOverdue(l, stageOf(l.stage_id))).length

  // ---------- Stage change by drag ----------
  async function moveTo(leadId: string, stageId: string) {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.stage_id === stageId || !can('lead_edit')) return
    setLeads((all) => all.map((l) => (l.id === leadId ? { ...l, stage_id: stageId } : l)))
    const { error: e } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', leadId)
    if (e) {
      setError(e.message)
      load()
    }
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
  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'
  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager'))

  // ---------- Card ----------
  const Card = ({ l }: { l: Lead }) => {
    const st = stageOf(l.stage_id)
    const overdue = isOverdue(l, st)
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
        {l.company && <p className="mt-0.5 truncate text-xs text-gray-400">{l.company}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className="truncate text-xs text-gray-300">{l.phone}</span>
          {l.phone && (
            <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} className="text-gray-500 hover:text-white" title="Call">
              <Phone size={13} />
            </a>
          )}
          {waLink(l.phone) && (
            <a href={waLink(l.phone)!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-green-500 hover:text-green-400" title="WhatsApp">
              <MessageCircle size={13} />
            </a>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${sourceOf(l.source).cls}`}>{sourceOf(l.source).label}</span>
          {overdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">OVERDUE</span>}
        </div>
        <div className="mt-2.5 space-y-0.5 text-[11px] text-gray-500">
          <p>To: <span className="text-gray-300">{nameOf(l.assigned_to)}</span></p>
          {l.next_follow_up && <p className={overdue ? 'text-red-400' : ''}>Follow-up: {fmtDT(l.next_follow_up)}</p>}
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-[#222] pt-2">
          <span className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={12} className={n <= l.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-700'} />
            ))}
          </span>
          <span className="text-xs tabular-nums text-gray-300">{inr(Number(l.estimated_amount) || 0)}</span>
        </div>
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
          <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            <button onClick={() => setView('board')} className={`rounded-md p-1.5 ${view === 'board' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`} aria-label="Board view">
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setView('list')} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-orange-500 text-black' : 'text-gray-400 hover:text-white'}`} aria-label="List view">
              <List size={16} />
            </button>
          </div>
          {ready && can('lead_create') && (
            <button onClick={openAdd} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
              <Plus size={16} /> Add lead
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, company, city, #no" className={`${inputCls} pl-9`} />
        </div>
        <select value={sourceF} onChange={(e) => setSourceF(e.target.value)} className={selectCls} aria-label="Source">
          <option value="all">All sources</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {owners.length > 1 && (
          <select value={ownerF} onChange={(e) => setOwnerF(e.target.value)} className={selectCls} aria-label="Assigned to">
            <option value="all">Everyone</option>
            <option value="none">Unassigned</option>
            {owners.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 text-sm text-gray-300">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4 accent-red-500" />
          Overdue only
        </label>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Board */}
      {view === 'board' ? (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-4 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
          {stages.map((st) => {
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
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[#242424] text-left text-gray-400">
                <th className="px-4 py-3 font-normal">#</th>
                <th className="py-3 pr-4 font-normal">Name</th>
                <th className="py-3 pr-4 font-normal">Phone</th>
                <th className="py-3 pr-4 font-normal">Source</th>
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
                  <td colSpan={9} className="py-10 text-center text-gray-500">No leads match these filters.</td>
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
        <LeadDrawer leadId={openId} stages={stages} staff={staff} can={can} myId={myId} onClose={() => setOpenId(null)} onChanged={load} />
      )}

      {/* Add lead */}
      {adding && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setAdding(false)} />
          <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[#242424] bg-[#121212]">
            <div className="flex items-center justify-between border-b border-[#222] px-6 py-4">
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
                <span className="mb-1 block text-xs text-gray-400">Requirement</span>
                <textarea rows={2} value={nl.requirement} onChange={(e) => setNl({ ...nl, requirement: e.target.value })} className={`${inputCls} resize-y`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
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
                  <input type="number" min={0} value={nl.estimated_amount} onChange={(e) => setNl({ ...nl, estimated_amount: e.target.value })} className={inputCls} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-gray-400">Next follow-up</span>
                <input type="datetime-local" value={nl.next_follow_up} onChange={(e) => setNl({ ...nl, next_follow_up: e.target.value })} className={`${inputCls} [color-scheme:dark]`} />
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
            </div>
            <div className="flex justify-end gap-3 border-t border-[#222] px-6 py-4">
              <button onClick={() => setAdding(false)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button onClick={() => saveLead(false)} disabled={busy} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? 'Saving…' : 'Add lead'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}