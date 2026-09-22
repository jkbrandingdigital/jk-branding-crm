import { supabase } from '../../lib/supabase'

export type Stage = { id: string; name: string; color: string; sort_order: number; is_won: boolean; is_lost: boolean }
export type Staff = { id: string; full_name: string; branch_id: string | null; role: string | null; is_active: boolean }
export type Lead = {
  id: string
  lead_no: number
  name: string
  phone: string | null
  phone_norm: string | null
  alt_phone: string | null
  email: string | null
  company: string | null
  city: string | null
  requirement: string | null
  source: string
  campaign_name: string | null
  form_name: string | null
  stage_id: string | null
  assigned_to: string | null
  assigned_by: string | null
  assigned_at: string | null
  rating: number
  estimated_amount: number
  tags: string[]
  next_follow_up: string | null
  last_activity_at: string | null
  created_by: string | null
  created_at: string
}

export const SOURCES: { key: string; label: string; cls: string }[] = [
  { key: 'facebook', label: 'Facebook', cls: 'bg-blue-950/60 text-blue-300' },
  { key: 'indiamart', label: 'IndiaMART', cls: 'bg-rose-950/60 text-rose-300' },
  { key: 'website', label: 'Website', cls: 'bg-emerald-950/60 text-emerald-300' },
  { key: 'walk_in', label: 'Walk-in', cls: 'bg-amber-950/60 text-amber-300' },
  { key: 'reference', label: 'Reference', cls: 'bg-purple-950/60 text-purple-300' },
  { key: 'manual', label: 'Manual', cls: 'bg-[#1f1f1f] text-gray-300' },
  { key: 'other', label: 'Other', cls: 'bg-[#1f1f1f] text-gray-400' },
]
export const sourceOf = (k: string) => SOURCES.find((s) => s.key === k) ?? SOURCES[SOURCES.length - 1]

// <input type="datetime-local"> works in local time (IST on your machines)
export function toInputDT(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromInputDT = (v: string) => (v ? new Date(v).toISOString() : null)

export const fmtDT = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    : '—'

export const isOverdue = (l: Lead, stage?: Stage) =>
  !!l.next_follow_up && new Date(l.next_follow_up).getTime() < Date.now() && !stage?.is_won && !stage?.is_lost

export const waLink = (phone: string | null) => {
  const d = (phone ?? '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.length === 10 ? '91' + d : d}`
}

// Names of all staff (safe list: id, name, branch, role) for "Assigned to" labels
export async function loadStaff(): Promise<Staff[]> {
  const { data } = await supabase.rpc('staff_directory')
  return (data as Staff[]) ?? []
}

// Page through every lead the user can see
export async function loadLeads(): Promise<Lead[]> {
  const out: Lead[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Lead[]))
    if (!data || data.length < 1000) break
  }
  return out
}