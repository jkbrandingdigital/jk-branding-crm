import { supabase } from '../../lib/supabase'

/*
  Job Work & Dispatch — the shared types and the small things every
  screen in this folder needs.

  Vendor and product are not ours. They come from the two lists the
  Printing Media screen already keeps:

      print_offsets   where it is printed  ->  VENDOR
      print_services  what is printed      ->  PRODUCT

  So loadNames() is imported from printUtils rather than written again.
  A name switched off there stops being offered here too, and every old
  job work keeps the name it was given.
*/

export { loadNames, loadAllNames, downloadCsv, fmtDT, fmtTime, toLocalInput } from '../print/printUtils'
export type { PrintName } from '../print/printUtils'

// ------------------------------------------------------------
// Stages
// ------------------------------------------------------------

export type JwStage =
  | 'created'
  | 'design_sent'
  | 'vendor_confirmed'
  | 'material_pending'
  | 'production'
  | 'production_done'
  | 'qc_rework'
  | 'qc_passed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export type JwQcResult = 'passed' | 'rework' | 'failed'

/*
  One place decides what a stage is called and what colour it wears.

  `tone` is a class string, never an inline colour. An inline
  style={{color}} cannot be reached by theme.css, so it survives into
  the light theme and washes out. A class name can be re-mapped.
*/
export const STAGES: { key: JwStage; label: string; tone: string; who: string }[] = [
  { key: 'created',          label: 'Created',           who: 'Sales',    tone: 'border-[#2a2a2a] bg-[#1f1f1f] text-gray-300' },
  { key: 'design_sent',      label: 'Design sent',       who: 'Design',   tone: 'border-violet-600/40 bg-violet-500/10 text-violet-300' },
  { key: 'vendor_confirmed', label: 'Vendor confirmed',  who: 'Vendor',   tone: 'border-orange-600/40 bg-orange-500/10 text-orange-300' },
  { key: 'material_pending', label: 'Material pending',  who: 'Vendor',   tone: 'border-[#2a2a2a] bg-[#1f1f1f] text-gray-400' },
  { key: 'production',       label: 'In production',     who: 'Vendor',   tone: 'border-amber-600/40 bg-amber-500/10 text-amber-300' },
  { key: 'production_done',  label: 'Production done',   who: 'Vendor',   tone: 'border-sky-600/40 bg-sky-500/10 text-sky-300' },
  { key: 'qc_rework',        label: 'Sent back',         who: 'Dispatch', tone: 'border-red-600/40 bg-red-500/10 text-red-300' },
  { key: 'qc_passed',        label: 'QC passed',         who: 'Dispatch', tone: 'border-green-600/40 bg-green-500/10 text-green-400' },
  { key: 'dispatched',       label: 'Dispatched',        who: 'Dispatch', tone: 'border-blue-600/40 bg-blue-500/10 text-blue-300' },
  { key: 'delivered',        label: 'Delivered',         who: 'Dispatch', tone: 'border-green-600/40 bg-green-500/10 text-green-400' },
  { key: 'cancelled',        label: 'Cancelled',         who: '—',        tone: 'border-[#2a2a2a] bg-[#1a1a1a] text-gray-500' },
]

const STAGE_MAP = new Map(STAGES.map((s) => [s.key, s]))

export const stageLabel = (s: JwStage | null | undefined) =>
  (s && STAGE_MAP.get(s)?.label) ?? '—'

export const stageTone = (s: JwStage | null | undefined) =>
  (s && STAGE_MAP.get(s)?.tone) ?? 'border-[#2a2a2a] bg-[#1f1f1f] text-gray-400'

// What the vendor may move a job to. QC and dispatch are not here —
// those steps carry a round number or an LR, so they have their own
// screens and their own RPC.
export const VENDOR_STAGES: JwStage[] = [
  'vendor_confirmed', 'material_pending', 'production', 'production_done',
]

export const QC_RESULTS: { key: JwQcResult; label: string; tone: string }[] = [
  { key: 'passed', label: 'Passed',       tone: 'bg-green-500/15 text-green-400' },
  { key: 'rework', label: 'Needs rework', tone: 'bg-amber-500/15 text-amber-400' },
  { key: 'failed', label: 'Failed',       tone: 'bg-red-500/15 text-red-400' },
]

// ------------------------------------------------------------
// Rows
// ------------------------------------------------------------

// job_work_register, column for column.
export type JobWork = {
  id: string
  jw_no: number
  jw_code: string
  customer_id: string | null
  client_name: string
  project_id: string | null
  project_name: string | null
  service_id: string | null
  product_name: string | null
  product_note: string | null
  offset_id: string | null
  vendor_name: string | null
  qty: number
  rate: number
  amount: number
  payment_terms: string | null
  job_at: string
  due_at: string | null
  stage: JwStage
  instructions: string | null
  design_file: string | null
  design_sent_at: string | null
  sales_id: string | null
  designer_id: string | null
  branch_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  paid_amount: number | null
  pending_amount: number | null
  last_qc_result: JwQcResult | null
  last_qc_round: number | null
  last_qc_at: string | null
  last_lr_no: string | null
  last_courier: string | null
  last_dispatched_at: string | null
  is_late: boolean
}

export type JwUpdate = {
  id: string
  job_id: string
  stage: JwStage
  qty_done: number
  remark: string | null
  at: string
  by_user: string | null
  by_name: string | null
}

export type JwQc = {
  id: string
  job_id: string
  round: number
  result: JwQcResult
  sample_size: number | null
  qty_ok: number | null
  qty_reject: number | null
  note: string | null
  checked_by: string | null
  checked_name: string | null
  checked_at: string
}

export type JwDispatch = {
  id: string
  job_id: string
  courier: string | null
  lr_no: string | null
  boxes: number | null
  weight_kg: number | null
  qty_sent: number | null
  to_address: string | null
  dispatched_at: string | null
  eta_on: string | null
  delivered_at: string | null
  note: string | null
  created_by: string | null
  created_name: string | null
  created_at: string
}

export type JwPayment = {
  id: string
  job_id: string
  amount: number
  paid_on: string
  mode: string | null
  reference: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type JwFile = {
  id: string
  job_id: string
  kind: 'artwork' | 'invoice' | 'qc' | 'dispatch' | 'other'
  path: string
  file_name: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_name: string | null
  uploaded_at: string
}

/*
  What the detail screen gets back.

  jw_detail() is one call that brings the job and everything hanging
  off it — the way person_payroll() does for HR. Opening a job used to
  mean six round trips; now it is one.

  The rights come back with it, decided in the database. The screen
  does not guess who may press what.
*/
export type JwDetail = {
  job: JobWork | null
  updates: JwUpdate[]
  qc: JwQc[]
  dispatch: JwDispatch[]
  files: JwFile[]
  payments: JwPayment[]
  vendor: { id: string; name: string; active: boolean } | null
  rights: { qc: boolean; dispatch: boolean; edit: boolean; payment: boolean }
}

export type JwCounts = {
  total: number
  in_production: number
  qc_waiting: number
  ready: number
  dispatched: number
  late: number
  value: number
  pending_pay: number
}

// ------------------------------------------------------------
// Calls
// ------------------------------------------------------------

export async function loadBoard(
  from: Date | null, to: Date | null, stage: string, q: string,
): Promise<{ rows: JobWork[]; error: string | null }> {
  const { data, error } = await supabase.rpc('jw_board', {
    p_from: from ? from.toISOString() : null,
    p_to: to ? to.toISOString() : null,
    p_stage: stage || 'all',
    p_q: q ?? '',
  })
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as JobWork[], error: null }
}

export async function loadCounts(
  from: Date | null, to: Date | null,
): Promise<JwCounts | null> {
  const { data } = await supabase.rpc('jw_counts', {
    p_from: from ? from.toISOString() : null,
    p_to: to ? to.toISOString() : null,
  })
  return (data as JwCounts) ?? null
}

export async function loadDetail(id: string): Promise<{ detail: JwDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('jw_detail', { p_job: id })
  if (error) return { detail: null, error: error.message }
  return { detail: data as JwDetail, error: null }
}

// ------------------------------------------------------------
// Money and dates
// ------------------------------------------------------------

// ₹4,25,000 — Indian grouping, no paise unless there are any.
export const inr = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return '₹' + v.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: v % 1 === 0 ? 0 : 2,
  })
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// <input type="date"> wants the browser's own clock, not UTC.
export const toDateInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const daysLeft = (due: string | null) => {
  if (!due) return null
  const ms = new Date(due).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

// ------------------------------------------------------------
// The period strip — same four buttons as the print register
// ------------------------------------------------------------

export type Period = 'month' | 'last' | 'year' | 'all'

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All' },
]

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