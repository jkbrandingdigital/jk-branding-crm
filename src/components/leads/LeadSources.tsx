import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, RefreshCw, AlertCircle, CheckCircle2, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { SOURCE_CLS, loadSources } from './leadUtils'

type Row = {
  id: string
  key: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
}

// Same seven as Lead Labels, so both screens read alike
const COLORS = ['orange', 'blue', 'green', 'purple', 'pink', 'yellow', 'gray']

// "Old Client" → "old_client". The key is what sits in leads.source and
// never changes, so renaming later does not orphan old leads.
const toKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

export default function LeadSources() {
  const { can, ready } = usePermissions()
  const allowed = ready && can('lead_settings')

  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [newSource, setNewSource] = useState({ name: '', color: 'blue' })

  const load = useCallback(async () => {
    setLoading(true)
    const [s, used] = await Promise.all([
      supabase.from('lead_sources').select('*').order('sort_order').order('name'),
      supabase.rpc('lead_source_counts'),
    ])
    if (s.error) setMsg({ type: 'err', text: s.error.message })
    setRows((s.data ?? []) as Row[])
    // The count is a hint on screen, so a missing helper is not an error
    if (!used.error && used.data) {
      const m: Record<string, number> = {}
      for (const r of used.data as { source: string; leads: number }[]) m[r.source] = Number(r.leads) || 0
      setCounts(m)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (allowed) load()
    else if (ready) setLoading(false)
  }, [allowed, ready, load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  // The rest of the CRM reads the list from one place, so refill it too
  const after = async (text: string) => {
    setMsg({ type: 'ok', text })
    await loadSources(true)
    load()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  async function addSource() {
    const name = newSource.name.trim()
    if (!name) return
    const key = toKey(name)
    if (!key) return setMsg({ type: 'err', text: 'Give it a name with some letters or numbers in it.' })
    if (rows.some((r) => r.key === key)) return setMsg({ type: 'err', text: `"${name}" is already there.` })

    setBusy('source')
    const max = rows.reduce((m, r) => Math.max(m, r.sort_order), 0)
    const { error } = await supabase
      .from('lead_sources')
      .insert({ key, name, color: newSource.color, sort_order: max + 10 })
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    setNewSource({ name: '', color: 'blue' })
    after('Source added.')
  }

  async function patchSource(id: string, patch: Partial<Row>) {
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('lead_sources').update(patch).eq('id', id)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      load()
    } else {
      void loadSources(true)
    }
  }

  async function move(r: Row, dir: -1 | 1) {
    const i = rows.findIndex((x) => x.id === r.id)
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const other = rows[j]
    await supabase.from('lead_sources').update({ sort_order: other.sort_order }).eq('id', r.id)
    await supabase.from('lead_sources').update({ sort_order: r.sort_order }).eq('id', other.id)
    after('Order changed.')
  }

  async function deleteSource(r: Row) {
    const used = counts[r.key] ?? 0
    if (used > 0) {
      return setMsg({
        type: 'err',
        text: `${used} lead${used > 1 ? 's are' : ' is'} on "${r.name}". Turn Active off instead — the old leads keep it and nobody can pick it for a new one.`,
      })
    }
    if (!confirm(`Delete "${r.name}"?`)) return
    setBusy(r.id)
    const { error } = await supabase.from('lead_sources').delete().eq('id', r.id)
    setBusy(null)
    if (error) return setMsg({ type: 'err', text: error.message })
    after(`"${r.name}" deleted.`)
  }

  if (ready && !allowed) {
    return (
      <div className="p-6 text-gray-400">
        You need the <span className="text-white">Lead settings</span> permission to open this page.
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Lead Sources</h1>
          <p className="mt-1 text-sm text-gray-400">
            Where a lead came from. These show on the card, in the lead filter, and in Import.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
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
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <h2 className="font-medium text-white">Sources</h2>
          <span className="text-xs text-gray-500">The number is how many leads are on it</span>
        </div>

        <div className="divide-y divide-[#242424]">
          {loading ? (
            <div className="py-8 text-center text-gray-400">
              <Loader2 className="inline h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">No sources yet. Add one below.</p>
          ) : (
            rows.map((r, i) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex flex-col">
                  <button
                    onClick={() => move(r, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded p-0.5 text-gray-600 hover:text-white disabled:opacity-25"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(r, 1)}
                    disabled={i === rows.length - 1}
                    aria-label="Move down"
                    className="rounded p-0.5 text-gray-600 hover:text-white disabled:opacity-25"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </span>

                <span className={`rounded-full px-2.5 py-1 text-xs ${SOURCE_CLS[r.color] ?? SOURCE_CLS.gray}`}>
                  {r.name}
                </span>

                <input
                  value={r.name}
                  onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v && v !== rows.find((x) => x.id === r.id)?.name) patchSource(r.id, { name: v })
                  }}
                  aria-label={`Name of ${r.name}`}
                  className={`${input} max-w-xs flex-1`}
                />

                <select
                  value={r.color}
                  onChange={(e) => patchSource(r.id, { color: e.target.value })}
                  aria-label={`Colour of ${r.name}`}
                  className={`${input} w-32`}
                >
                  {COLORS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    onChange={(e) => patchSource(r.id, { is_active: e.target.checked })}
                    className="h-4 w-4 accent-orange-500"
                  />
                  Active
                </label>

                <span className="w-16 text-right text-xs tabular-nums text-gray-500">{counts[r.key] ?? 0}</span>

                <button
                  onClick={() => deleteSource(r)}
                  disabled={busy === r.id}
                  className="ml-auto rounded-md border border-[#2a2a2a] p-2 text-gray-400 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                  title="Delete source"
                >
                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 border-t border-[#242424] px-5 py-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={newSource.name}
              onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
              placeholder="New source name, e.g. IndiaMART, Walk-in, Reference"
              className={`${input} max-w-xs flex-1`}
            />
            <select
              value={newSource.color}
              onChange={(e) => setNewSource({ ...newSource, color: e.target.value })}
              aria-label="Colour"
              className={`${input} w-32`}
            >
              {COLORS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={addSource}
              disabled={!newSource.name.trim() || busy === 'source'}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Add source
            </button>
          </div>
          {newSource.name.trim() && (
            <p className="text-xs text-gray-500">
              Saved as <span className="font-mono text-gray-400">{toKey(newSource.name) || '—'}</span>. That never
              changes, so renaming later is safe.
            </p>
          )}
          <p className="text-xs text-gray-500">
            A source that leads are already on cannot be deleted. Turn Active off and it disappears from the pickers
            while those leads keep it.
          </p>
        </div>
      </section>
    </div>
  )
}