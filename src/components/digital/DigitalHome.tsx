import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronsUpDown, Plus, Search, Users, Share2, CalendarDays, Megaphone } from 'lucide-react'
import { usePermissions } from '../../lib/permissions'
import { digitalApi, LAST_WS_KEY, type ConnectResult, type WorkspaceDetail, type WorkspaceRow } from '../../lib/digital'
import { ErrorLine, Modal } from './ui'
import ProfilesTab from './ProfilesTab'
import TeamTab from './TeamTab'
import NewWorkspaceModal from './NewWorkspaceModal'
import PickPages from './PickPages'

type Tab = 'profiles' | 'team' | 'calendar'

/*
  Digital — one client at a time, like a workspace in a scheduling tool.

  Which workspace and which tab are in the URL (?ws=, ?tab=), not in state:
  a link to a client's page then opens that client, Back works, and the
  sidebar link resets it. Facebook also comes back here with ?pick=…
  after "Connect now".
*/
export default function DigitalHome() {
  const [params, setParams] = useSearchParams()
  const { can } = usePermissions()
  const wsId = params.get('ws')
  const tab = (params.get('tab') as Tab) || 'profiles'
  const pick = params.get('pick')
  const fbError = params.get('fb') === 'error' ? params.get('msg') : null

  const [list, setList] = useState<WorkspaceRow[] | null>(null)
  const [ws, setWs] = useState<WorkspaceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [making, setMaking] = useState(false)

  const setQuery = useCallback((patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace })
  }, [params, setParams])

  const loadList = useCallback(async () => {
    try {
      setList(await digitalApi.workspaces())
    } catch (e) {
      setError((e as Error).message)
      setList([])
    }
  }, [])
  useEffect(() => { void loadList() }, [loadList])

  // No workspace in the URL: open the last one used, else the first.
  useEffect(() => {
    if (!list || wsId || list.length === 0) return
    let last: string | null = null
    try { last = localStorage.getItem(LAST_WS_KEY) } catch { /* private mode */ }
    const go = list.find((w) => w.id === last) ?? list.find((w) => w.is_active) ?? list[0]
    setQuery({ ws: go.id }, true)
  }, [list, wsId, setQuery])

  const loadWs = useCallback(async () => {
    if (!wsId) { setWs(null); return }
    try {
      setWs(await digitalApi.workspace(wsId))
      setError(null)
      try { localStorage.setItem(LAST_WS_KEY, wsId) } catch { /* fine */ }
    } catch (e) {
      setWs(null)
      setError((e as Error).message)
    }
  }, [wsId])
  useEffect(() => { void loadWs() }, [loadWs])

  const refresh = () => { void loadWs(); void loadList() }

  function pickDone(results: ConnectResult[]) {
    setQuery({ pick: null, fb: null, msg: null }, true)
    if (results.some((r) => r.ok)) refresh()
  }

  const mayMake = can('digital_workspace_manage')

  if (list && list.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Megaphone size={32} className="mx-auto text-orange-400" />
        <h1 className="mt-4 text-xl font-semibold">No client workspace yet</h1>
        <p className="mt-2 text-sm text-gray-400">
          {mayMake
            ? 'Make one workspace for each client. Their pages, posts and team live inside it.'
            : 'You have not been put in any client workspace. Ask whoever runs Digital to add you.'}
        </p>
        <ErrorLine text={error} />
        {mayMake && (
          <button onClick={() => setMaking(true)}
            className="mx-auto mt-6 flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-orange-400">
            <Plus size={16} /> New workspace
          </button>
        )}
        {making && <NewWorkspaceModal onClose={() => setMaking(false)} onCreated={(id) => { setMaking(false); void loadList(); setQuery({ ws: id, tab: 'profiles' }) }} />}
      </div>
    )
  }

  const TABS: { key: Tab; label: string; icon: typeof Users; soon?: boolean }[] = [
    { key: 'profiles', label: 'Social profiles', icon: Share2 },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'calendar', label: 'Calendar', icon: CalendarDays, soon: true },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Switcher list={list ?? []} current={wsId} onPick={(id) => setQuery({ ws: id, pick: null })}
          onNew={mayMake ? () => setMaking(true) : undefined} />
        {ws && (
          <p className="text-xs text-gray-500">
            {ws.customer.code}
            {ws.customer.contact_person && ` · ${ws.customer.contact_person}`}
            {!ws.is_active && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-gray-400">Switched off</span>}
          </p>
        )}
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-[#242424]">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = tab === t.key
          return (
            <button key={t.key} disabled={t.soon} onClick={() => setQuery({ tab: t.key })}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${
                on ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-400 hover:text-white'
              } disabled:cursor-not-allowed disabled:opacity-50`}>
              <Icon size={15} /> {t.label}
              {t.soon && <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-5 space-y-4">
        {fbError && <ErrorLine text={fbError} />}
        {error && <ErrorLine text={error} />}
        {!ws && !error && <p className="py-10 text-center text-sm text-gray-500">Loading…</p>}
        {ws && tab === 'profiles' && <ProfilesTab ws={ws} onChanged={refresh} />}
        {ws && tab === 'team' && <TeamTab ws={ws} onChanged={refresh} />}
      </div>

      {pick && (
        <Modal title="Which pages?" sub="Found on the Facebook account you just used" onClose={() => setQuery({ pick: null }, true)}>
          <PickPages pick={pick} onDone={pickDone} onCancel={() => setQuery({ pick: null }, true)} />
        </Modal>
      )}
      {making && (
        <NewWorkspaceModal onClose={() => setMaking(false)}
          onCreated={(id) => { setMaking(false); void loadList(); setQuery({ ws: id, tab: 'profiles' }) }} />
      )}
    </div>
  )
}

// The workspace switcher: search, the list, and "New workspace".
function Switcher({ list, current, onPick, onNew }: {
  list: WorkspaceRow[]
  current: string | null
  onPick: (id: string) => void
  onNew?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const cur = list.find((w) => w.id === current)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? list.filter((w) => `${w.name} ${w.company_name} ${w.code}`.toLowerCase().includes(s)) : list
  }, [list, q])

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex min-w-[240px] items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-3 py-2 text-left hover:bg-[#1a1a1a]"
        aria-expanded={open}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500 text-sm font-bold text-black">
          {(cur?.name ?? '?').trim().slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{cur?.name ?? 'Pick a workspace'}</span>
          <span className="block text-[11px] text-gray-500">
            {cur ? `${cur.connected} connected${cur.expired ? ` · ${cur.expired} expired` : ''}` : `${list.length} clients`}
          </span>
        </span>
        <ChevronsUpDown size={16} className="text-gray-500" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(340px,90vw)] rounded-xl border border-[#2a2a2a] bg-[#151515] p-2 shadow-2xl">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workspaces" autoFocus
              className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none" />
          </div>
          <ul className="mt-2 max-h-72 overflow-y-auto">
            {shown.map((w) => (
              <li key={w.id}>
                <button onClick={() => { onPick(w.id); setOpen(false); setQ('') }}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#1f1f1f] ${w.id === current ? 'bg-orange-500/10' : ''}`}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#1f1f1f] text-[11px] font-semibold text-orange-300">
                    {w.name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${w.is_active ? 'text-white' : 'text-gray-500'}`}>{w.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {w.code} · {w.connected} connected{w.expired ? ` · ${w.expired} expired` : ''}{!w.is_member ? ' · not a member' : ''}
                    </span>
                  </span>
                  {w.id === current && <Check size={15} className="text-orange-400" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-4 text-center text-xs text-gray-500">No workspace matches.</li>}
          </ul>
          {onNew && (
            <button onClick={() => { setOpen(false); onNew() }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-[#222] px-2 pt-3 pb-1 text-sm text-orange-400 hover:text-orange-300">
              <Plus size={15} /> New workspace
            </button>
          )}
        </div>
      )}
    </div>
  )
}
