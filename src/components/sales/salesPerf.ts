import { supabase } from '../../lib/supabase'
import { istDate, addMonths } from '../../lib/format'
import { monthFirst, monthLast } from '../../lib/targets'

/*
  Sales performance — the two measures, and the one place that loads them.

  There are deliberately TWO of these, and they do not mix:

    Target   — money. Target against what actually came in. This is the
               one that decides how someone is doing, and the only one
               that gets a colour.
    Activity — calls, follow-ups, leads. A record of effort, shown
               without a verdict. A person who made 300 calls and closed
               nothing has a problem, but it is not the sort of problem
               a red chip explains.

  Money itself arrives twice, which is also on purpose. `confirmed` is
  the value of projects that exist, so it cannot be typed up. `reported`
  is what the person wrote in their daily report. When the two drift
  apart, one of them is wrong, and that is worth seeing rather than
  averaging away.
*/

// ---------------------------------------------------------------------
// Shapes, straight from the three RPCs
// ---------------------------------------------------------------------
export type TargetRow = {
  user_id: string
  full_name: string | null
  emp_code: string | null
  branch_id: string | null
  branch_name: string | null
  // A branch manager who also sells. They are in this list only when
  // they have a target of their own or money against their name.
  is_manager: boolean
  target_amount: number
  confirmed: number
  confirmed_deals: number
  reported: number
  reported_deals: number
  prev_confirmed: number
  prev_reported: number
  days_reported: number
}

export type ActivityRow = {
  user_id: string
  full_name: string | null
  emp_code: string | null
  branch_id: string | null
  branch_name: string | null
  is_manager: boolean
  calls: number
  incoming_calls: number
  followup_calls: number
  leads_found: number
  quality_leads: number
  positive_leads: number
  hot_leads: number
  deals_closed: number
  days_reported: number
  work_days: number
  norm_calls: number
  norm_follow_ups: number
  norm_leads_found: number
  leads_assigned: number
  leads_won: number
  leads_converted: number
  prev_calls: number
}

export type ServiceRow = {
  service: string
  service_name: string
  color: string
  amount: number
  deals: number
}

// Which number counts as "achieved". The screen asks; the maths does not
// care, so every total below takes this rather than reading a column.
export type Source = 'confirmed' | 'reported'

export const SOURCE_LABEL: Record<Source, string> = {
  confirmed: 'Confirmed deals',
  reported: 'Daily reports',
}

export const SOURCE_NOTE: Record<Source, string> = {
  confirmed: 'Value of projects created in this period. Cannot be typed up.',
  reported: 'Revenue each person entered in their daily report.',
}

export const achievedOf = (r: TargetRow, s: Source) =>
  Number(s === 'confirmed' ? r.confirmed : r.reported)

export const prevOf = (r: TargetRow, s: Source) =>
  Number(s === 'confirmed' ? r.prev_confirmed : r.prev_reported)

export const dealsOf = (r: TargetRow, s: Source) =>
  Number(s === 'confirmed' ? r.confirmed_deals : r.reported_deals)

// ---------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------
export type PeriodKey = 'month' | 'last' | 'year' | 'custom'

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Pick dates' },
]

export function rangeOf(key: PeriodKey, from: string, to: string): { from: string; to: string } {
  const today = istDate()
  if (key === 'month') return { from: monthFirst(today.slice(0, 7)), to: today }
  if (key === 'last') {
    const ym = addMonths(today.slice(0, 7), -1)
    return { from: monthFirst(ym), to: monthLast(ym) }
  }
  if (key === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: today }
  return { from: from || monthFirst(today.slice(0, 7)), to: to || today }
}

// ---------------------------------------------------------------------
// Loaders
//
// `null` is sent rather than an empty string: the RPCs read null as
// "no filter", and '' would be a uuid that parses to nothing.
// ---------------------------------------------------------------------
const arg = (v: string | null | undefined) => (v && v !== 'all' ? v : null)

export async function loadTarget(from: string, to: string, branchId?: string | null) {
  const { data, error } = await supabase.rpc('sales_target_performance', {
    p_from: from,
    p_to: to,
    p_branch: arg(branchId),
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as TargetRow[]
}

export async function loadActivity(from: string, to: string, branchId?: string | null) {
  const { data, error } = await supabase.rpc('sales_activity_performance', {
    p_from: from,
    p_to: to,
    p_branch: arg(branchId),
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as ActivityRow[]
}

export async function loadServices(
  from: string,
  to: string,
  branchId?: string | null,
  userId?: string | null,
) {
  const { data, error } = await supabase.rpc('sales_service_split', {
    p_from: from,
    p_to: to,
    p_branch: arg(branchId),
    p_user: arg(userId),
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as ServiceRow[]
}

/** Every month-first from one date to another, as 'YYYY-MM-01'. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  const last = to.slice(0, 7)
  let ym = from.slice(0, 7)
  // The cap is a guard, not a limit anyone should reach: three years of
  // months is already more than any period this page offers.
  for (let i = 0; i < 36 && ym <= last; i++) {
    out.push(`${ym}-01`)
    ym = addMonths(ym, 1)
  }
  return out
}

/*
  What the branches are committed to, for the same months.

  This is NOT what the tiles and the table add up — those are the targets
  actually handed to people. The two are different numbers and the gap
  between them is real: target a branch has taken on that nobody has
  been given yet. Showing the branch figure in place of the employee
  figure would make the table stop adding up to its own total; hiding it
  leaves the gap invisible.

  An error returns zero rather than throwing. A sales person cannot read
  branch_targets, and a side note they are not entitled to must not take
  their own page down with it.
*/
export async function loadBranchTarget(from: string, to: string, branchId?: string | null) {
  let q = supabase
    .from('branch_targets')
    .select('target_amount')
    .in('month', monthsBetween(from, to))
  const b = arg(branchId)
  if (b) q = q.eq('branch_id', b)
  const { data, error } = await q
  if (error) return 0
  return (data ?? []).reduce((n, r) => n + Number((r as { target_amount: number }).target_amount ?? 0), 0)
}

/*
  The last N months, one point each.

  This is N round trips rather than one clever query. A single query
  would need the window repeated per month inside the RPC, and then the
  period filters on the page would have to be taught to leave it alone.
  N is six. They go out together.
*/
export async function loadMonthlyTrend(
  months: number,
  branchId?: string | null,
  userId?: string | null,
) {
  const thisYm = istDate().slice(0, 7)
  const list = Array.from({ length: months }, (_, i) => addMonths(thisYm, i - (months - 1)))

  const all = await Promise.all(
    list.map(async (ym) => {
      const rows = await loadTarget(monthFirst(ym), monthLast(ym), branchId)
      const mine = userId && userId !== 'all' ? rows.filter((r) => r.user_id === userId) : rows
      return {
        ym,
        target: mine.reduce((n, r) => n + Number(r.target_amount), 0),
        confirmed: mine.reduce((n, r) => n + Number(r.confirmed), 0),
        reported: mine.reduce((n, r) => n + Number(r.reported), 0),
      }
    }),
  )
  return all
}

// ---------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------

/*
  Change against the previous stretch of the same length.

  null when there is nothing to compare against. Returning 100% for
  "was zero, now something" reads as a triumph and is really just a
  first sale — and +0% would read as flat, which is worse.
*/
export const trendOf = (now: number, prev: number): number | null =>
  prev > 0 ? Math.round(((now - prev) / prev) * 100) : null

export const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((n, x) => n + pick(x), 0)

export const nameOf = (r: { full_name: string | null }) => r.full_name || 'Unnamed'

/*
  Excel opens a CSV straight away if it is told the encoding, which the
  BOM does. Without it every rupee sign and Gujarati name arrives as
  mojibake. Every value is quoted because a company name with a comma in
  it would otherwise shift the whole row one column to the left.
*/
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}