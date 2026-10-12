import { useCallback, useEffect, useState } from 'react'
import { Trash2, Loader2, AlertCircle, CheckCircle2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { DateField } from '../DateField'
import { type Label } from './labels'
import { SOURCES, loadSources, loadStaff, type Source, type Stage, type Staff } from './leadUtils'

type Picks = {
  stage: string
  owner: string
  source: string
  label: string
  madeFrom: string
  madeTo: string
}
const NO_PICKS: Picks = { stage: 'all', owner: 'all', source: 'all', label: 'all', madeFrom: '', madeTo: '' }

const PAGE = 1000   // ids are read in these steps
const CHUNK = 200   // and marked deleted in these

// "up to and including this day" means "before the next one"
const nextDay = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}

export default function LeadBulkDelete() {
  const { isSuper, ready } = usePermissions()

  const [stages, setStages] = useState<Stage[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [sources, setSources] = useState<Source[]>(SOURCES)

  const [p, setP] = useState<Picks>(NO_PICKS)
  const set = (patch: Partial<Picks>) => { setP((x) => ({ ...x, ...patch })); setFound(null) }

  const [found, setFound] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState<string>('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [st, sf, lb, src, tot] = await Promise.all([
      supabase.from('lead_stages').select('*').eq('is_active', true).order('sort_order'),
      loadStaff(),
      supabase.from('lead_labels').select('*').eq('is_active', true).order('sort_order'),
      loadSources(true),
      supabase.from('leads').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    ])
    setStages((st.data ?? []) as Stage[])
    setStaff(sf)
    setLabels((lb.data ?? []) as Label[])
    setSources([...src])
    setTotal(tot.count ?? 0)
  }, [])

  useEffect(() => {
    if (isSuper) void load()
  }, [isSuper, load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  // Narrows a query the same way for counting and for deleting, so the
  // number you are shown is the number that goes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const narrow = (query: any) => {
    let q = query.is('deleted_at', null)
    if (p.stage !== 'all') q = q.eq('stage_id', p.stage)
    if (p.owner === 'none') q = q.is('assigned_to', null)
    else if (p.owner !== 'all') q = q.eq('assigned_to', p.owner)
    if (p.source !== 'all') q = q.eq('source', p.source)
    if (p.label === 'none') q = q.is('label_id', null)
    else if (p.label !== 'all') q = q.contains('label_ids', [p.label])
    if (p.madeFrom) q = q.gte('created_at', p.madeFrom)
    if (p.madeTo) q = q.lt('created_at', nextDay(p.madeTo))
    return q
  }

  const picked = Object.values(p).filter((v) => v !== 'all' && v !== '').length

  async function count() {
    setBusy('count')
    setWord('')
    const { count: n, error } = await narrow(supabase.from('leads').select('id', { count: 'exact', head: true }))
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setFound(n ?? 0)
  }

  async function wipe() {
    if (found === null || found === 0) return
    setBusy('delete')

    // Which leads, exactly
    const ids: string[] = []
    for (let start = 0; ; start += PAGE) {
      const { data, error } = await narrow(supabase.from('leads').select('id'))
        .order('created_at', { ascending: false })
        .range(start, start + PAGE - 1)
      if (error) {
        setBusy('')
        return setMsg({ type: 'err', text: error.message })
      }
      const got = (data ?? []) as { id: string }[]
      ids.push(...got.map((r) => r.id))
      setBusy(`Finding leads… ${ids.length}`)
      if (got.length < PAGE) break
    }

    const now = new Date().toISOString()
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      setBusy(`Deleting ${Math.min(i + chunk.length, ids.length)} of ${ids.length}…`)
      const { error } = await supabase.from('leads').update({ deleted_at: now }).in('id', chunk)
      if (error) {
        setBusy('')
        return setMsg({ type: 'err', text: error.message })
      }
    }

    setBusy('')
    setWord('')
    setFound(null)
    setMsg({ type: 'ok', text: `${ids.length} leads deleted.` })
    void load()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  if (ready && !isSuper) {
    return (
      <div className="p-6 text-gray-400">
        Only a <span className="text-white">Super Admin</span> can delete leads in bulk.
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Delete Leads</h1>
        <p className="mt-1 text-sm text-gray-400">
          Pick what should go, check the number, then confirm. {total.toLocaleString('en-IN')} leads in the CRM right now.
        </p>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      <section className="rounded-lg border border-[#242424] bg-[#151515]">
        <div className="border-b border-[#242424] px-5 py-4">
          <h2 className="font-medium text-white">Which leads</h2>
          <p className="mt-1 text-sm text-gray-400">
            Leave everything on "All" and it means every lead in the CRM.
          </p>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Stage</span>
            <select value={p.stage} onChange={(e) => set({ stage: e.target.value })} className={input}>
              <option value="all">All stages</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Assigned to</span>
            <select value={p.owner} onChange={(e) => set({ owner: e.target.value })} className={input}>
              <option value="all">Anyone</option>
              <option value="none">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Source</span>
            <select value={p.source} onChange={(e) => set({ source: e.target.value })} className={input}>
              <option value="all">All sources</option>
              {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Label</span>
            <select value={p.label} onChange={(e) => set({ label: e.target.value })} className={input}>
              <option value="all">All labels</option>
              <option value="none">No label</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Created from</span>
            <DateField value={p.madeFrom} onChange={(v) => set({ madeFrom: v })} placeholder="Any day" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Created up to</span>
            <DateField value={p.madeTo} onChange={(v) => set({ madeTo: v })} placeholder="Any day" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#242424] px-5 py-4">
          <button
            onClick={count}
            disabled={busy !== ''}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white disabled:opacity-40"
          >
            {busy === 'count' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Count them
          </button>
          {picked > 0 && (
            <button onClick={() => { setP(NO_PICKS); setFound(null) }} className="text-xs text-orange-400 hover:underline">
              Clear
            </button>
          )}
          {found !== null && (
            <span className="text-sm text-gray-300">
              <span className="font-semibold text-white">{found.toLocaleString('en-IN')}</span> leads match
              {picked === 0 && <span className="ml-2 text-red-400">— that is every lead in the CRM</span>}
            </span>
          )}
        </div>
      </section>

      {found !== null && found > 0 && (
        <section className="rounded-lg border border-red-900/50 bg-[#151515]">
          <div className="border-b border-[#242424] px-5 py-4">
            <h2 className="font-medium text-red-300">Confirm</h2>
          </div>
          <div className="space-y-4 px-5 py-5 text-sm">
            <p className="text-gray-300">
              {found.toLocaleString('en-IN')} leads will be marked deleted and disappear for everyone. Their follow-ups go
              with them.
            </p>
            <p className="text-xs text-gray-500">
              They are marked deleted, not wiped from the database, so a backup taken earlier still has them. Take one
              from Company → Backup first if you have not.
            </p>

            <label className="block max-w-xs">
              <span className="mb-1.5 block text-xs text-gray-400">
                Type <span className="font-semibold text-red-300">DELETE</span> to go ahead
              </span>
              <input value={word} onChange={(e) => setWord(e.target.value)} disabled={busy !== ''} className={input} />
            </label>
          </div>
          <div className="flex items-center gap-3 border-t border-[#242424] px-5 py-4">
            <button
              onClick={wipe}
              disabled={word.trim().toUpperCase() !== 'DELETE' || busy !== ''}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-40"
            >
              {busy !== '' && busy !== 'count' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete {found.toLocaleString('en-IN')} leads
            </button>
            {busy !== '' && busy !== 'count' && <span className="text-xs text-gray-400">{busy}</span>}
          </div>
        </section>
      )}

    </div>
  )
}