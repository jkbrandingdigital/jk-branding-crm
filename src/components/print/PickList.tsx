import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import type { PrintName } from './printUtils'

/*
  Pick one name out of a long list.

  There are 78 services and 47 printers. A plain <select> with 78 options
  means scrolling a grey column looking for BOOK - CHALLAN among BOOK,
  BOOK - INQUIRY, BOOK - RECEIPT and BOOK - REGISTER, which is slower than
  writing it on paper. So: type a few letters, the list shrinks, Enter
  takes the top one. Hands stay on the keyboard, which is what matters
  when someone is entering twenty jobs in a row.

  If the person may edit the lists, a name that is not there yet can be
  added from here — typing a new printer and pressing Add beats leaving
  the entry half-finished to go and open another screen.
*/

export default function PickList({
  value, options, onPick, placeholder, onCreate, disabled, autoFocus,
}: {
  value: string | null
  options: PrintName[]
  onPick: (id: string | null) => void
  placeholder: string
  onCreate?: (name: string) => Promise<PrintName | null>
  disabled?: boolean
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [adding, setAdding] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const picked = options.find((o) => o.id === value) ?? null

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return options
    // Names that start with what was typed come first: typing "bo" should
    // offer BOOK before SCRATCH CARD, even though both contain "bo".
    const starts: PrintName[] = []
    const holds: PrintName[] = []
    for (const o of options) {
      const n = o.name.toLowerCase()
      if (n.startsWith(t)) starts.push(o)
      else if (n.includes(t)) holds.push(o)
    }
    return [...starts, ...holds]
  }, [options, q])

  const exact = q.trim() && options.some((o) => o.name.toLowerCase() === q.trim().toLowerCase())
  const canAdd = !!onCreate && !!q.trim() && !exact

  useEffect(() => setHi(0), [q])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQ('')
  }, [open])

  // Keep the highlighted row in view while arrowing down a long list
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  async function create() {
    if (!onCreate || !q.trim()) return
    setAdding(true)
    const row = await onCreate(q.trim())
    setAdding(false)
    if (row) {
      onPick(row.id)
      setOpen(false)
    }
  }

  function keys(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[hi]) { onPick(shown[hi].id); setOpen(false) }
      else if (canAdd) void create()
    } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex w-full items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-left text-sm transition-colors hover:border-[#3a3a3a] focus:border-orange-500 focus:outline-none disabled:opacity-50 ${
          picked ? 'text-white' : 'text-gray-500'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{picked ? picked.name : placeholder}</span>
        {picked && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
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
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={keys}
              autoFocus={autoFocus}
              placeholder="Type to search"
              className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
            />
          </div>

          <ul ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {shown.map((o, i) => (
              <li key={o.id}>
                <button
                  type="button"
                  data-i={i}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => { onPick(o.id); setOpen(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === hi ? 'bg-[#202020] text-white' : 'text-gray-300'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.id === value && <Check size={14} className="shrink-0 text-orange-400" />}
                </button>
              </li>
            ))}

            {shown.length === 0 && !canAdd && (
              <li className="px-3 py-6 text-center text-sm text-gray-500">Nothing matches.</li>
            )}
          </ul>

          {canAdd && (
            <button
              type="button"
              onClick={create}
              disabled={adding}
              className="flex w-full items-center gap-2 border-t border-[#242424] px-3 py-2.5 text-left text-sm text-orange-400 hover:bg-[#1c1c1c] disabled:opacity-50"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add “{q.trim()}” to the list
            </button>
          )}
        </div>
      )}
    </div>
  )
}