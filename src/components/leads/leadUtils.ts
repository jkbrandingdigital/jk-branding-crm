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
  label_ids: string[]
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

// ---------------------------------------------------------------------
// Lead source
//
// These live in the `lead_sources` table now, so a super admin can add
// one without a new build. SOURCES below is only what shows before the
// database answers — loadSources() fills this same array in place, so
// every screen that already reads SOURCES keeps working unchanged.
// ---------------------------------------------------------------------
export type Source = { key: string; label: string; cls: string }

// /60 is the opacity theme.css knows how to turn light. Do not change it
// to /50 — that one has no light-theme mapping and goes unreadable.
// Same colour names as Lead Labels, so one dropdown reads like the other.
export const SOURCE_CLS: Record<string, string> = {
  orange: 'bg-orange-950/60 text-orange-300',
  blue: 'bg-blue-950/60 text-blue-300',
  green: 'bg-green-950/60 text-green-300',
  purple: 'bg-purple-950/60 text-purple-300',
  pink: 'bg-rose-950/60 text-rose-300',
  yellow: 'bg-yellow-950/60 text-yellow-300',
  gray: 'bg-[#1f1f1f] text-gray-400',
}
export const SOURCE_COLORS = Object.keys(SOURCE_CLS)

export const SOURCES: Source[] = [
  { key: 'facebook', label: 'Facebook', cls: SOURCE_CLS.blue },
  { key: 'old_client', label: 'Old Client', cls: SOURCE_CLS.green },
  { key: 'by_call', label: 'By Call', cls: SOURCE_CLS.yellow },
  { key: 'by_msg', label: 'By Msg', cls: SOURCE_CLS.orange },
  { key: 'pbn', label: 'PBN', cls: SOURCE_CLS.purple },
  { key: 'bni', label: 'BNI', cls: SOURCE_CLS.pink },
  { key: 'other', label: 'Other', cls: SOURCE_CLS.gray },
]

const titled = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

// A source the list does not know about still gets a readable chip
export const sourceOf = (k: string): Source =>
  SOURCES.find((s) => s.key === k) ?? { key: k, label: k ? titled(k) : '—', cls: SOURCE_CLS.gray }

let sourcesRead = false

/** Reads lead_sources and refills SOURCES in place. Call it before the
 *  first paint of any screen that shows a source. */
export async function loadSources(force = false): Promise<Source[]> {
  if (sourcesRead && !force) return SOURCES
  const { data } = await supabase
    .from('lead_sources')
    .select('key, name, color, sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  const rows = (data ?? []) as { key: string; name: string; color: string }[]
  if (rows.length > 0) {
    SOURCES.splice(
      0,
      SOURCES.length,
      ...rows.map((r) => ({ key: r.key, label: r.name, cls: SOURCE_CLS[r.color] ?? SOURCE_CLS.gray })),
    )
    sourcesRead = true
  }
  return SOURCES
}

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

// Page through every lead the user can see.
// The board no longer uses this — it pages on the server. Kept for any
// screen that genuinely needs the lot.
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