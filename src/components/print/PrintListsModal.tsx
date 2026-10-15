import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { loadAllNames, type PrintName } from './printUtils'

/*
  The two lists, side by side.

  Remove does not delete. The name is switched off, so it stops being
  offered while every old entry standing on it keeps its name. A printer
  you stopped using in March must still read as that printer in March's
  register — delete it outright and the whole month goes blank.

  That is also why a switched-off name can be put back: nothing was lost
  to begin with.
*/

function ListPane({
  title, table, note,
}: {
  title: string
  table: 'print_services' | 'print_offsets'
  note: string
}) {
  const [rows, setRows] = useState<PrintName[]>([])
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [showOff, setShowOff] = useState(false)

  const load = useCallback(async () => setRows(await loadAllNames(table)), [table])
  useEffect(() => { void load() }, [load])

  async function add() {
    const n = name.trim()
    if (!n) return
    setBusy('add')
    setErr('')

    // Already there but switched off? Put it back rather than refusing —
    // the person wants the name available, and the unique index would
    // otherwise just say "duplicate" and leave them stuck.
    const off = rows.find((r) => r.name.toLowerCase() === n.toLowerCase())
    const { error } = off
      ? await supabase.from(table).update({ active: true }).eq('id', off.id)
      : await supabase.from(table).insert({ name: n })

    setBusy('')
    if (error) return setErr(error.message)
    setName('')
    void load()
  }

  async function setActive(r: PrintName, active: boolean) {
    setBusy(r.id)
    setErr('')
    const { error } = await supabase.from(table).update({ active }).eq('id', r.id)
    setBusy('')
    if (error) return setErr(error.message)
    void load()
  }

  const t = q.trim().toLowerCase()
  const match = rows.filter((r) => !t || r.name.toLowerCase().includes(t))
  const on = match.filter((r) => r.active)
  const off = match.filter((r) => !r.active)

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <p className="text-xs text-gray-500">{note}</p>
      </div>

      <div className="mb-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
          placeholder="Add a name"
          className={input}
        />
        <button
          onClick={add}
          disabled={busy === 'add' || !name.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40"
        >
          {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add
        </button>
      </div>

      <div className="relative mb-2">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${input} pl-9`} />
      </div>

      {err && <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{err}</p>}

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {on.map((r) => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-[#222] bg-[#1a1a1a] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{r.name}</span>
            <button
              onClick={() => setActive(r, false)}
              disabled={busy === r.id}
              aria-label={`Remove ${r.name}`}
              title="Take off the list. Old entries keep it."
              className="shrink-0 rounded-md p-1 text-gray-500 hover:text-red-400 disabled:opacity-50"
            >
              {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          </li>
        ))}
        {on.length === 0 && <li className="py-6 text-center text-xs text-gray-600">Nothing here.</li>}
      </ul>

      {off.length > 0 && (
        <div className="mt-2 border-t border-[#242424] pt-2">
          <button onClick={() => setShowOff((s) => !s)} className="text-xs text-gray-500 hover:text-gray-300">
            {showOff ? 'Hide' : 'Show'} {off.length} removed
          </button>
          {showOff && (
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto pr-1">
              {off.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-600 line-through">{r.name}</span>
                  <button
                    onClick={() => setActive(r, true)}
                    disabled={busy === r.id}
                    aria-label={`Put ${r.name} back`}
                    title="Put it back"
                    className="shrink-0 rounded-md p-1 text-gray-500 hover:text-green-400 disabled:opacity-50"
                  >
                    {busy === r.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function PrintListsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Services &amp; offsets</h3>
            <p className="text-xs text-gray-500">The names the register offers.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-hidden p-5 sm:grid-cols-2">
          <ListPane title="Services" table="print_services" note="What is being printed." />
          <ListPane title="Offsets" table="print_offsets" note="Where it is printed." />
        </div>

        <div className="border-t border-[#242424] px-5 py-3">
          <p className="text-xs text-gray-600">
            Removing a name only takes it off the list. Entries that already use it keep it, and it can be put back.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}