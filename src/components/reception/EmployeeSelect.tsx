// Searchable "Whom to Meet" picker. No free typing — selection only
// from the CRM's staff list, so data stays consistent.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Employee } from '../../lib/reception'

export default function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: Employee[]
  value: string
  onChange: (e: Employee | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const selected = employees.find((e) => e.id === value) ?? null
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? employees.filter((e) => e.full_name.toLowerCase().includes(s)) : employees
  }, [employees, q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-left text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
      >
        <span className={selected ? '' : 'text-gray-500'}>{selected ? selected.full_name : 'Select employee'}</span>
        <ChevronDown size={16} className="text-gray-500" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-xl">
          <div className="flex items-center gap-2 border-b border-[#222] px-3 py-2">
            <Search size={14} className="text-gray-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employee..."
              className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No employees found</li>}
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(e)
                    setOpen(false)
                    setQ('')
                  }}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#1f1f1f] ${
                    e.id === value ? 'bg-orange-500/10' : ''
                  }`}
                >
                  <span className="text-white">{e.full_name}</span>
                  {e.designation && <span className="text-xs text-gray-500">{e.designation}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
