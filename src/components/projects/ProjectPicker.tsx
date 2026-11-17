import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderKanban, Loader2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/*
  Pick the project something belongs to.

  A job work or a purchase tied to a project by its NAME typed in is
  tied to nothing: the database cannot add up what a project cost when
  all it has is "Brochure" in a text box. Picking it here stores the
  project itself, and its client comes along with it.

  Asks the database as you type, like the customer picker, so it does
  not get slower as the project list grows.
*/

export type PickedProject = {
  id: string
  code: string
  title: string
  customer_id: string
  customer_name: string
}

type Row = { id: string; project_code: string; title: string; customer_id: string; customer_name: string }

export default function ProjectPicker({
  value, onPick, disabled, placeholder = 'Pick the project',
}: {
  value: PickedProject | null
  onPick: (p: PickedProject | null) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<PickedProject[]>([])
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(async (text: string) => {
    setBusy(true)
    let qy = supabase
      .from('project_list')
      .select('id, project_code, title, customer_id, customer_name')
      .order('created_at', { ascending: false })
      .limit(20)
    // Commas and brackets would break the or() filter, and nobody
    // searches for them.
    const t = text.trim().replace(/[,()]/g, ' ')
    if (t) qy = qy.or(`title.ilike.%${t}%,customer_name.ilike.%${t}%,project_code.ilike.%${t}%`)
    const { data } = await qy
    setRows(((data ?? []) as Row[]).map((r) => ({
      id: r.id, code: r.project_code, title: r.title, customer_id: r.customer_id, customer_name: r.customer_name,
    })))
    setBusy(false)
    setHi(0)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void search(q), 250)
    return () => clearTimeout(t)
  }, [q, open, search])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQ('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, rows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && rows[hi]) { e.preventDefault(); onPick(rows[hi]); setOpen(false) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex w-full items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-left text-sm hover:border-[#3a3a3a] focus:border-orange-500 focus:outline-none disabled:opacity-50 ${
          value ? 'text-white' : 'text-gray-500'
        }`}
      >
        <FolderKanban size={14} className="shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1 truncate">
          {value ? <>{value.title} <span className="text-gray-500">· {value.customer_name}</span></> : placeholder}
          {value && <span className="ml-1.5 font-mono text-xs text-gray-500">{value.code}</span>}
        </span>
        {value && !disabled && (
          <span
            role="button" tabIndex={-1} aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onPick(null) }}
            className="shrink-0 rounded p-0.5 text-gray-500 hover:text-white"
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={15} className="shrink-0 text-gray-500" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-xl">
          <div className="flex items-center gap-2 border-b border-[#242424] px-3 py-2">
            <Search size={14} className="shrink-0 text-gray-500" />
            <input
              ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={keys}
              placeholder="Project, client or PR- code"
              className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
            />
            {busy && <Loader2 size={14} className="shrink-0 animate-spin text-gray-500" />}
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {rows.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => { onPick(p); setOpen(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === hi ? 'bg-[#202020] text-white' : 'text-gray-300'}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {p.title}<span className="ml-1.5 text-xs text-gray-500">{p.customer_name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-gray-600">{p.code}</span>
                  {p.id === value?.id && <Check size={14} className="shrink-0 text-orange-400" />}
                </button>
              </li>
            ))}
            {!busy && rows.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-500">{q.trim() ? 'No project matches.' : 'No projects yet.'}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
