import { useEffect, useState } from 'react'
import { Check, Loader2, Pin, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { NOTE_COLORS, type Note, type NoteColor } from './NotesBoard'

export default function NoteModal({
  note, onClose, onSaved,
}: {
  note: Note | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [color, setColor] = useState<NoteColor>(note?.color ?? 'default')
  const [pinned, setPinned] = useState(note?.is_pinned ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function save() {
    setError('')
    if (!title.trim() && !body.trim()) return setError('Write something first.')

    const payload = {
      title: title.trim() || null,
      body: body.trim(),
      color,
      is_pinned: pinned,
    }

    setBusy(true)
    const { error: e } = note
      ? await supabase.from('notes').update(payload).eq('id', note.id)
      : await supabase.from('notes').insert(payload)
    setBusy(false)
    if (e) return setError(e.message)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-modal-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#242424] bg-[#171717] px-5 py-3.5">
          <h2 id="note-modal-title" className="font-semibold text-white">{note ? 'Edit note' : 'Add note'}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPinned((p) => !p)}
              aria-pressed={pinned}
              aria-label={pinned ? 'Unpin' : 'Pin to the top'}
              title={pinned ? 'Unpin' : 'Pin to the top'}
              className={`rounded-md p-1.5 transition-colors hover:bg-[#222] ${pinned ? 'text-orange-400' : 'text-gray-400 hover:text-white'}`}
            >
              <Pin size={17} />
            </button>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Title"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />

          <textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write it down…"
            aria-label="Note"
            className="w-full resize-y rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />

          <div>
            <span className="mb-1.5 block text-sm text-gray-300">Colour</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  aria-pressed={color === c.key}
                  title={c.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                    color === c.key ? 'border-orange-500' : 'border-[#2a2a2a]'
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: c.dot }}>
                    {color === c.key && <Check size={12} className="text-white" />}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-[#242424] bg-[#171717] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {note ? 'Save note' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  )
}