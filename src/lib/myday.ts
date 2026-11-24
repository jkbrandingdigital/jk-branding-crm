import { supabase } from './supabase'

// "My day" — the shape my_day() (MyDay_MD1_Dashboard.sql) sends back.
// Every part can be null: a part that failed on the server is left out
// rather than breaking the page (see `errors`).

export type MyDay = {
  me: { id: string; full_name: string; emp_code: string; designation: string | null; role: string | null; department: string | null; branch: string | null; today: string; now: string }
  shift?: { shift_in: string; shift_out: string; grace: number; lunch_minutes: number; day_minutes: number } | null
  today?: {
    status: string | null
    check_in: string | null
    check_out: string | null
    is_late: boolean | null
    late_minutes: number
    lunch_open: boolean
    lunch_minutes: number
    lunch_late_min: number
    minutes_worked: number
    overtime_minutes: number
    last_scan: string | null
    scans: { kind: string; at: string }[]
  } | null
  scan_tracked?: boolean
  month?: {
    month: string
    present: number
    late: number
    late_minutes: number
    lunch_late: number
    absent: number
    on_leave: number
    overtime_minutes: number
    worked_minutes: number
    days: { d: string; s: string | null; l: boolean | null }[]
  } | null
  late_rule?: Record<string, unknown> | null
  leave?: {
    paid_cap: number | null
    paid_taken_month: number | null
    paid_available: Record<string, unknown> | number | null
    taken_year: number
    waiting: number
    next: { from: string; to: string; type: string; state: string; days: number } | null
  } | null
  timer?: { session_id: string; task_id: string; task_no: number; subject: string; started_at: string; today_secs: number; part_kind: string | null; part_no: number | null; piece_no: number | null; unit_name: string | null; work_qty: number | null } | null
  tasks?: { open: number; overdue: number; due_today: number; done_today?: number } | null
  todos?: { due: number; overdue: number; open: number } | null
  reminders?: { today: number } | null
  policies_unread?: number | null
  design?: { points_today: number; done_today: number; target: number } | null
  sales?: { evolution_done: boolean; report_done: boolean; follow_ups_due?: number; month?: { target: number | null; confirmed: number | null; deals: number | null } | null } | null
  digital?: { workspaces: number; expired: number; scheduled_today: number } | null
  dispatch?: { qc_waiting: number; to_dispatch: number; in_production: number } | null
  accounts?: { payments_waiting: number; price_waiting: number } | null
  hr?: { staff: number; in: number; late: number; leave_waiting: number } | null
  reception?: { inside: number; today: number } | null
  errors: { part: string; error: string }[]
}

export async function loadMyDay(): Promise<MyDay> {
  const { data, error } = await supabase.rpc('my_day')
  if (error) throw new Error(error.message)
  const d = data as MyDay
  if (d.errors?.length) console.warn('[my_day] parts that did not load:', d.errors)
  return d
}

// Where this person's own pages are, by role. One place, so a card's link
// never points at a route the role does not have.
type Paths = { attendance: string; leave: string; tasks: string | null; todos: string | null; reminders: string | null; policies: string; scan: string }
const P: Record<string, Paths> = {
  super_admin:    { attendance: '/admin/my-attendance',  leave: '/admin/my-leave',     tasks: '/admin/tasks',   todos: '/admin/todos',   reminders: '/admin/reminders',   policies: '/admin/policies',     scan: '/scan' },
  hr:             { attendance: '/hr/my-attendance',     leave: '/hr/my-leave',        tasks: '/hr/tasks',      todos: '/hr/todos',      reminders: '/hr/reminders',      policies: '/hr/policies',        scan: '/scan' },
  branch_manager: { attendance: '/manager/my-attendance', leave: '/manager/my-leave',  tasks: '/manager/tasks', todos: '/manager/todos', reminders: '/manager/reminders', policies: '/manager/policies',   scan: '/scan' },
  sales:          { attendance: '/sales/attendance',     leave: '/sales/my-leave',     tasks: '/sales/tasks',   todos: '/sales/todos',   reminders: '/sales/reminders',   policies: '/sales/policies',     scan: '/scan' },
  design_team:    { attendance: '/design/attendance',    leave: '/design/my-leave',    tasks: '/design/tasks',  todos: '/design/todos',  reminders: '/design/reminders',  policies: '/design/policies',    scan: '/scan' },
  dispatch:       { attendance: '/dispatch/attendance',  leave: '/dispatch/my-leave',  tasks: null,             todos: null,             reminders: null,                 policies: '/dispatch/policies',  scan: '/scan' },
  accounts:       { attendance: '/accounts/attendance',  leave: '/accounts/my-leave',  tasks: null,             todos: null,             reminders: null,                 policies: '/accounts/policies',  scan: '/scan' },
  digital:        { attendance: '/dm/attendance',        leave: '/dm/my-leave',        tasks: '/dm/tasks',      todos: '/dm/todos',      reminders: '/dm/reminders',      policies: '/dm/policies',        scan: '/scan' },
  reception:      { attendance: '/reception/attendance', leave: '/reception/my-leave', tasks: null,             todos: '/reception/todos', reminders: '/reception/reminders', policies: '/reception/policies', scan: '/scan' },
}
export const pathsFor = (role: string | null | undefined): Paths => P[role ?? ''] ?? P.sales

// The scan words, said the way nobody can misread. The database says
// "Lunch out" for going to lunch, the office says "Lunch in" for the same
// thing — "start" and "end" are what both mean.
export const SCAN_WORD: Record<string, string> = {
  'In': 'In',
  'Out': 'Out',
  'Lunch out': 'Lunch start',
  'Lunch in': 'Lunch end',
  'Step out': 'Break start',
  'Back': 'Break end',
  'Meeting out': 'Meeting start',
  'Meeting in': 'Meeting end',
}

export function hm(mins: number | null | undefined) {
  const m = Math.max(0, Math.round(mins ?? 0))
  const h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

export function clock(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

// paid_available() answers in jsonb; read the number from whichever key it uses.
export function paidLeft(l: MyDay['leave']): number | null {
  if (!l) return null
  const v = l.paid_available
  if (typeof v === 'number') return v
  if (v && typeof v === 'object') {
    for (const k of ['available', 'left', 'room', 'remaining', 'balance']) {
      const n = Number((v as Record<string, unknown>)[k])
      if (Number.isFinite(n)) return n
    }
  }
  if (l.paid_cap != null) return Math.max(0, Number(l.paid_cap) - Number(l.paid_taken_month ?? 0))
  return null
}

// Lates that are free before payroll suggests a cut (HR36: three).
export function freeLates(rule: MyDay['late_rule']): number {
  if (rule && typeof rule === 'object') {
    for (const k of ['free', 'free_lates', 'allowed', 'grace_count']) {
      const n = Number((rule as Record<string, unknown>)[k])
      if (Number.isFinite(n) && n >= 0) return n
    }
  }
  return 3
}