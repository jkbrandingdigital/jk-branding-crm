import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDT } from '../leads/leadUtils'
import { plainText } from '../RichText'
import NoteModal from './NoteModal'

export type NoteColor = 'default' | 'orange' | 'teal' | 'amber' | 'blue' | 'plum' | 'green'

export type Note = {
  id: string
  title: string | null
  body: string
  color: NoteColor
  is_pinned: boolean
  created_at: string
  updated_at: string
}

// Each colour is a quiet wash, so a wall of notes still reads as one board
export const NOTE_COLORS: { key: NoteColor; label: string; cls: string; dot: string }[] = [
  { key: 'default', label: 'Plain', cls: 'border-[#242424] bg-[#171717]', dot: '#6b6b6b' },
  { key: 'orange', label: 'Orange', cls: 'border-orange-500/30 bg-orange-500/10', dot: '#FF5E00' },
  { key: 'teal', label: 'Teal', cls: 'border-teal-500/30 bg-teal-500/10', dot: '#0E6A62' },
  { key: 'amber', label: 'Amber', cls: 'border-amber-500/30 bg-amber-500/10', dot: '#B45309' },
  { key: 'blue', label: 'Blue', cls: 'border-blue-500/30 bg-blue-500/10', dot: '#3F5C8C' },
  { key: 'plum', label: 'Plum', cls: 'border-purple-500/30 bg-purple-500/10', dot: '#7C5295' },
  { key: 'green', label: 'Green', cls: 'border-green-500/30 bg-green-500/10', dot: '#5B7F3E' },
]
export const colorOf = (k: string) => NOTE_COLORS.find((c) => c.key === k) ?? NOTE_COLORS[0]

export default function NotesBoard() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Note | 'new' | null>(null)

  const load = useCallback(async () => {
    setError('')
    const { data, error: e } = await supabase
      .from('notes')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false })
    if (e) setError(e.message)
    else setNotes((data ?? []) as Note[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return notes
    return notes.filter((n) => `${n.title ?? ''} ${plainText(n.body)}`.toLowerCase().includes(term))
  }, [notes, q])

  async function togglePin(n: Note) {
    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, is_pinned: !x.is_pinned } : x)))
    const { error: e } = await supabase.from('notes').update({ is_pinned: !n.is_pinned }).eq('id', n.id)
    if (e) setError(e.message)
    load()
  }

  async function remove(n: Note) {
    if (!window.confirm('Delete this note?')) return
    const { error: e } = await supabase.from('notes').delete().eq('id', n.id)
    if (e) return setError(e.message)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Notes</h1>
          <p className="mt-0.5 text-sm text-gray-500">Only you can see these.</p>
        </div>

        <div className="relative ml-auto">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            className="w-56 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-8 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={15} />
            </button>
          )}
        </div>

        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus size={17} /> Add note
        </button>
      </div>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-[#242424] bg-[#151515] py-20 text-center text-sm text-gray-500">
          {notes.length === 0 ? (
            <>
              Nothing written down yet.{' '}
              <button onClick={() => setEditing('new')} className="text-orange-400 hover:underline">Add your first note</button>
            </>
          ) : (
            'No note matches that search.'
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((n) => {
            const c = colorOf(n.color)
            return (
              <div
                key={n.id}
                onClick={() => setEditing(n)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setEditing(n)
                  }
                }}
                className={`flex cursor-pointer flex-col rounded-xl border p-4 transition-colors hover:border-[#3a3a3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${c.cls}`}
              >
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium text-white">
                    {n.title || <span className="text-gray-500">Untitled</span>}
                  </p>
                  {n.is_pinned && <Pin size={14} className="mt-1 shrink-0 text-orange-400" />}
                </div>

                {/* The card shows the words only, so one big heading cannot stretch the board */}
                <p className="mt-2 line-clamp-6 flex-1 text-sm text-gray-300">{plainText(n.body)}</p>

                <div className="mt-3 flex items-center gap-1 border-t border-[#ffffff14] pt-2" onClick={(e) => e.stopPropagation()}>
                  <span className="mr-auto text-[11px] text-gray-500">{fmtDT(n.updated_at)}</span>
                  <button
                    onClick={() => togglePin(n)}
                    aria-label={n.is_pinned ? 'Unpin' : 'Pin'}
                    title={n.is_pinned ? 'Unpin' : 'Pin'}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-[#ffffff14] hover:text-white"
                  >
                    {n.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button
                    onClick={() => setEditing(n)}
                    aria-label="Edit note"
                    title="Edit"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-[#ffffff14] hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove(n)}
                    aria-label="Delete note"
                    title="Delete"
                    className="rounded-md p-1.5 text-gray-400 hover:bg-[#ffffff14] hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <NoteModal
          note={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}