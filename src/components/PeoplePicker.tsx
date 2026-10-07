import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

export type PickPerson = { id: string; full_name: string; role?: string | null }

/**
 * Pick one or more people. Closed it shows who is chosen as small chips;
 * clicking opens the list with a search box.
 */
export default function PeoplePicker({
  people, value, onChange, me, placeholder = 'Select people', id, disabled,
}: {
  people: PickPerson[]
  value: string[]
  onChange: (ids: string[]) => void
  me?: string
  placeholder?: string
  id?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const chosen = useMemo(
    () => value.map((v) => people.find((p) => p.id === v)).filter(Boolean) as PickPerson[],
    [value, people],
  )
  const shown = people.filter((p) => p.full_name.toLowerCase().includes(q.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  useEffect(() => {
    if (open) searchRef.current?.focus()
    else setQ('')
  }, [open])

  const toggle = (pid: string) =>
    onChange(value.includes(pid) ? value.filter((x) => x !== pid) : [...value, pid])

  return (
    <div className="relative" ref={boxRef}>
      {/* The field itself */}
      <div
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        className={`flex min-h-[42px] w-full cursor-pointer items-center gap-2 rounded-lg border bg-[#1a1a1a] px-2.5 py-1.5 text-sm ${
          open ? 'border-orange-500' : 'border-[#2a2a2a]'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {chosen.length === 0 && <span className="px-1 text-gray-600">{placeholder}</span>}
          {chosen.map((p) => (
            <span
              key={p.id}
              className="flex max-w-full items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 py-0.5 pl-2 pr-1 text-xs text-orange-300"
            >
              <span className="truncate">{p.full_name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(p.id) }}
                aria-label={`Remove ${p.full_name}`}
                className="rounded p-0.5 text-orange-300/70 hover:text-white"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        {chosen.length > 0 && !disabled && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            aria-label="Clear all"
            title="Clear all"
            className="shrink-0 rounded p-1 text-gray-500 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
        <ChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {/* The list */}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#191919] shadow-xl">
          <div className="relative border-b border-[#242424]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people"
              className="w-full bg-transparent py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:outline-none"
            />
          </div>
          <ul role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto py-1">
            {shown.map((p) => {
              const on = value.includes(p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(p.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[#232323] ${
                      on ? 'text-white' : 'text-gray-300'
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-orange-500 bg-orange-500' : 'border-[#3a3a3a]'}`}>
                      {on && <Check size={12} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.full_name}
                      {p.id === me && <span className="ml-1 text-gray-500">(me)</span>}
                    </span>
                    {p.role && <span className="shrink-0 text-xs text-gray-600">{p.role.replace('_', ' ')}</span>}
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No one matches.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}