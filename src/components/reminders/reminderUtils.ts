import { supabase } from '../../lib/supabase'

export type ReminderType = 'once' | 'daily' | 'weekly'

export type Reminder = {
  id: string
  title: string
  message: string | null
  schedule_type: ReminderType
  run_at: string | null
  time_of_day: string | null
  weekdays: number[] | null
  next_run_at: string | null
  last_run_at: string | null
  is_active: boolean
  lead_id: string | null
  created_by: string
  created_at: string
  reminder_recipients: { user_id: string }[]
}

export type LeadLite = { id: string; name: string; lead_no: number; phone: string | null }

export const DAYS: { n: number; s: string }[] = [
  { n: 1, s: 'Mon' }, { n: 2, s: 'Tue' }, { n: 3, s: 'Wed' }, { n: 4, s: 'Thu' },
  { n: 5, s: 'Fri' }, { n: 6, s: 'Sat' }, { n: 7, s: 'Sun' },
]

export const TYPE_LABEL: Record<ReminderType, string> = { once: 'Once', daily: 'Daily', weekly: 'Weekly' }

const TZ = 'Asia/Kolkata'

// 08-10-2026
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-') : '—'

// 13:40
export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }) : '—'

export const fmtDateTime = (iso: string | null) => (iso ? `${fmtDate(iso)} ${fmtTime(iso)}` : '—')

// "Once" · "Daily" · "Mon, Thu"
export function typeLabel(r: Pick<Reminder, 'schedule_type' | 'weekdays'>) {
  if (r.schedule_type !== 'weekly') return TYPE_LABEL[r.schedule_type]
  return (r.weekdays ?? []).slice().sort((a, b) => a - b).map((n) => DAYS.find((d) => d.n === n)?.s).join(', ')
}

// The moment shown in Date / Time columns: next run if still active, else when it last ran
export const whenOf = (r: Reminder) => (r.is_active ? r.next_run_at ?? r.run_at : r.last_run_at ?? r.run_at)

// Page through every reminder the user can see
export async function loadReminders(): Promise<Reminder[]> {
  const out: Reminder[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('reminders')
      .select('*, reminder_recipients(user_id)')
      .order('created_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Reminder[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// Names of the leads linked to reminders (only those this user can see come back)
export async function loadLeadNames(ids: string[]): Promise<Record<string, LeadLite>> {
  const map: Record<string, LeadLite> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('leads').select('id, name, lead_no, phone').in('id', ids.slice(i, i + 200))
    for (const l of (data ?? []) as LeadLite[]) map[l.id] = l
  }
  return map
}

export async function searchLeads(q: string): Promise<LeadLite[]> {
  const term = q.trim().replace(/[,%()]/g, ' ')
  if (term.length < 2) return []
  const parts = [`name.ilike.%${term}%`, `phone.ilike.%${term}%`, `company.ilike.%${term}%`]
  if (/^\d+$/.test(term) && term.length < 9) parts.push(`lead_no.eq.${term}`)
  const { data } = await supabase
    .from('leads')
    .select('id, name, lead_no, phone')
    .is('deleted_at', null)
    .or(parts.join(','))
    .order('created_at', { ascending: false })
    .limit(8)
  return (data ?? []) as LeadLite[]
}