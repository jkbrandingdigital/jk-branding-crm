import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/*
  Pick the client a project belongs to.

  It asks the database as you type instead of loading every customer
  first. The print register's lists are 78 names and never grow much;
  customers grow forever, and a screen that fetches all of them to let
  you pick one gets slower every month it is used.
*/

export type PickedCustomer = { id: string; name: string; code: string }

export default function CustomerPicker({
  value, onPick, disabled,
}: {
  value: PickedCustomer | null
  onPick: (c: PickedCustomer | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<PickedCustomer[]>([])
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = useCallback(async (text: string) => {
    setBusy(true)
    let qy = supabase
      .from('customer_list')
      .select('id, company_name, customer_code')
      .eq('status', 'active')
      .order('converted_at', { ascending: false })
      .limit(20)
    if (text.trim()) qy = qy.ilike('company_name', `%${text.trim()}%`)

    const { data } = await qy
    setRows(((data ?? []) as { id: string; company_name: string; customer_code: string }[])
      .map((r) => ({ id: r.id, name: r.company_name, code: r.customer_code })))
    setBusy(false)
    setHi(0)
  }, [])

  // Wait for the typing to stop. A query per keystroke would send five
  // for "Shree" and show the answer to the first one last.
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
        <Building2 size={14} className="shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1 truncate">
          {value ? value.name : 'Pick a customer'}
          {value && <span className="ml-1.5 font-mono text-xs text-gray-500">{value.code}</span>}
        </span>
        {value && !disabled && (
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
              placeholder="Type a company name"
              className="w-full bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
            />
            {busy && <Loader2 size={14} className="shrink-0 animate-spin text-gray-500" />}
          </div>

          <ul className="max-h-60 overflow-y-auto py-1">
            {rows.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => { onPick(c); setOpen(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === hi ? 'bg-[#202020] text-white' : 'text-gray-300'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 font-mono text-xs text-gray-600">{c.code}</span>
                  {c.id === value?.id && <Check size={14} className="shrink-0 text-orange-400" />}
                </button>
              </li>
            ))}
            {!busy && rows.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-gray-500">
                {q.trim() ? 'No customer by that name.' : 'No customers yet.'}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}