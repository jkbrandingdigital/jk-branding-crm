import { supabase } from '../../lib/supabase'

/*
  Print register — the shared types and the small things every screen in
  this folder needs.
*/

export type PrintName = { id: string; name: string; active: boolean }

export type PrintJob = {
  id: string
  job_no: number
  job_at: string
  client_name: string
  service_id: string | null
  service_name: string | null
  offset_id: string | null
  offset_name: string | null
  status: 'pending' | 'sent'
  sent_at: string | null
  sent_by: string | null
  sent_by_name: string | null
  remark: string | null
  created_by: string
  created_by_name: string | null
  created_at: string
}

// Only the names still in use are offered. A name switched off stays in
// the table, because old entries are standing on it.
export async function loadNames(table: 'print_services' | 'print_offsets'): Promise<PrintName[]> {
  const { data } = await supabase
    .from(table)
    .select('id, name, active')
    .eq('active', true)
    .order('name')
  return (data ?? []) as PrintName[]
}

export async function loadAllNames(table: 'print_services' | 'print_offsets'): Promise<PrintName[]> {
  const { data } = await supabase.from(table).select('id, name, active').order('name')
  return (data ?? []) as PrintName[]
}

export const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

// <input type="datetime-local"> wants the browser's own clock, not UTC.
export const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export type Period = 'month' | 'last' | 'year' | 'all'

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All' },
]

// Both ends of the window, or null for "everything".
export function windowOf(p: Period): { from: Date; to: Date } | null {
  const now = new Date()
  if (p === 'all') return null
  if (p === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear() + 1, 0, 1) }
  if (p === 'last') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 1),
    }
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) }
}

/*
  Excel.

  The BOM is what makes Excel read it as UTF-8 — without it a client name
  with any Gujarati or an accent comes out as rubbish. Every value is
  quoted and inner quotes doubled, because a client name with a comma in
  it would otherwise split into two columns.
*/
export function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}