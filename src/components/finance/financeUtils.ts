import { supabase } from '../../lib/supabase'

/*
  Finance — the shared pieces.

  Every figure here comes from the database already added up
  (fin_figures, fin_sales_board). The screen never adds payments itself,
  so the project window, the Accounts board and the Excel file cannot
  disagree about what a client owes.

  value_amount / base is ALWAYS the price without GST. GST is worked out
  from it. Profit and incentive read the base; what the client pays is
  matched against the total.
*/

export type PayStatus = 'no_price' | 'unpaid' | 'partly' | 'paid' | 'overpaid'
export type PayMode = 'upi' | 'bank' | 'cash' | 'cheque' | 'card' | 'other'
export type PaymentState = 'pending' | 'confirmed' | 'rejected'

export type Figures = {
  base: number
  gst_percent: number
  gst_amount: number
  total: number
  confirmed: number
  waiting: number
  due: number
  status: PayStatus
}

export type ProjectPayment = {
  id: string
  amount: number
  paid_on: string
  mode: PayMode
  reference: string | null
  note: string | null
  proof_path: string | null
  status: PaymentState
  decide_note: string | null
  recorded_by: string
  recorded_name: string | null
  decided_name: string | null
  decided_at: string | null
  mine: boolean
}

export type ProjectMoney = {
  ok: boolean
  reason?: string
  figures: Figures
  is_accounts: boolean
  gst_locked: boolean
  month_closed?: boolean
  price_request?: PendingPrice | null
  payments: ProjectPayment[]
}

export type PendingPrice = {
  id: string
  old_amount: number
  new_amount: number
  note: string | null
  requested_name: string | null
  requested_at: string
  mine: boolean
  can_decide: boolean
}

export type BoardRow = {
  project_id: string
  project_code: string
  title: string
  customer_id: string
  customer_name: string
  customer_code: string
  gstin: string | null
  branch_id: string | null
  branch_name: string | null
  branch_code: string | null
  seller_id: string | null
  seller_name: string | null
  booked_on: string
  is_done: boolean
  base: number
  gst_percent: number
  gst_amount: number
  total: number
  confirmed: number
  waiting: number
  due: number
  status: PayStatus
  last_paid_on: string | null
  payments: number
  cost: number          // job works + purchases tied to this project, ever
  margin: number        // base − cost
}

export type InboxRow = {
  id: string
  project_id: string
  project_code: string
  project_title: string
  customer_name: string
  branch_code: string | null
  branch_name: string | null
  amount: number
  paid_on: string
  mode: PayMode
  reference: string | null
  note: string | null
  proof_path: string | null
  status: PaymentState
  decide_note: string | null
  recorded_by: string
  recorded_name: string | null
  recorded_at: string
  decided_name: string | null
  decided_at: string | null
  project_total: number
  project_confirmed: number
}

// ---------------------------------------------------------------- labels

// Class strings, never inline colours — theme.css can re-map a class
// for the light theme, it cannot reach a style={{}}.
export const PAY_STATUS: Record<PayStatus, { label: string; tone: string }> = {
  no_price: { label: 'No price', tone: 'border-[#2a2a2a] bg-[#1f1f1f] text-gray-400' },
  unpaid:   { label: 'Unpaid', tone: 'border-red-600/40 bg-red-500/10 text-red-300' },
  partly:   { label: 'Partly paid', tone: 'border-amber-600/40 bg-amber-500/10 text-amber-300' },
  paid:     { label: 'Paid', tone: 'border-green-600/40 bg-green-500/10 text-green-400' },
  overpaid: { label: 'Overpaid', tone: 'border-violet-600/40 bg-violet-500/10 text-violet-300' },
}

export const PAYMENT_STATE: Record<PaymentState, { label: string; tone: string }> = {
  pending:   { label: 'Waiting for Accounts', tone: 'bg-amber-500/15 text-amber-300' },
  confirmed: { label: 'Confirmed', tone: 'bg-green-500/15 text-green-400' },
  rejected:  { label: 'Rejected', tone: 'bg-red-500/15 text-red-300' },
}

export const MODES: { key: PayMode; label: string; needsRef: boolean; refLabel: string }[] = [
  { key: 'upi',    label: 'UPI',           needsRef: true,  refLabel: 'UTR / UPI reference' },
  { key: 'bank',   label: 'Bank transfer', needsRef: true,  refLabel: 'UTR (NEFT / RTGS / IMPS)' },
  { key: 'cheque', label: 'Cheque',        needsRef: true,  refLabel: 'Cheque number' },
  { key: 'card',   label: 'Card',          needsRef: true,  refLabel: 'Transaction ID' },
  { key: 'cash',   label: 'Cash',          needsRef: false, refLabel: 'Receipt number (optional)' },
  { key: 'other',  label: 'Other',         needsRef: false, refLabel: 'Reference (optional)' },
]
export const modeLabel = (m: string) => MODES.find((x) => x.key === m)?.label ?? m

// The usual GST slabs. Any value from 0 to 28 is accepted by the
// database; these are only the quick picks.
export const GST_SLABS = [0, 5, 12, 18, 28]

// ---------------------------------------------------------------- money and dates

export const inr = (n: number | null | undefined, paise = false) => {
  const raw = Number(n ?? 0)
  const v = Math.abs(raw)
  // A loss reads −₹10,000, not ₹-10,000.
  return (raw < 0 ? '−₹' : '₹') + v.toLocaleString('en-IN', {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: paise ? 2 : v % 1 === 0 ? 0 : 2,
  })
}

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export function monthRange(offset = 0): { from: string; to: string } {
  const [y, m] = todayIST().split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + offset, 1))
  const last = new Date(Date.UTC(y, m + offset, 0))
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
}

export const PERIODS = [
  { key: 'month', label: 'This month', range: () => monthRange(0) },
  { key: 'last',  label: 'Last month', range: () => monthRange(-1) },
  { key: 'fy',    label: 'This FY',    range: () => fyRange() },
  { key: 'all',   label: 'All',        range: () => ({ from: '', to: '' }) },
] as const

// April to March — the year accounts actually closes.
export function fyRange(): { from: string; to: string } {
  const [y, m] = todayIST().split('-').map(Number)
  const start = m >= 4 ? y : y - 1
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` }
}

// ---------------------------------------------------------------- calls

type Ok = { ok: true; id?: string; figures?: Figures; status?: PaymentState; proof_path?: string | null; branches?: number
  applied?: boolean; pending?: boolean; amount?: number; net?: number; already?: boolean }
type No = { ok: false; reason: string }
export type RpcResult = Ok | No

async function call(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: error.message }
  const r = (data ?? {}) as { ok?: boolean; reason?: string }
  return r.ok ? (r as Ok) : { ok: false, reason: r.reason ?? 'That did not go through.' }
}

export async function loadProjectMoney(projectId: string): Promise<ProjectMoney | null> {
  const { data, error } = await supabase.rpc('fin_project', { p_project: projectId })
  if (error) return null
  const r = data as ProjectMoney
  return r?.ok ? r : null
}

export const addPayment = (a: {
  project: string; amount: number; paidOn: string; mode: PayMode
  reference?: string; note?: string; proofPath?: string | null
}) => call('payment_add', {
  p_project: a.project,
  p_amount: a.amount,
  p_paid_on: a.paidOn,
  p_mode: a.mode,
  p_reference: a.reference?.trim() || null,
  p_note: a.note?.trim() || null,
  p_proof_path: a.proofPath ?? null,
})

export const decidePayment = (id: string, confirm: boolean, note?: string) =>
  call('payment_decide', { p_id: id, p_confirm: confirm, p_note: note?.trim() || null })

export const reopenPayment = (id: string, note: string) =>
  call('payment_reopen', { p_id: id, p_note: note.trim() })

export async function deletePayment(id: string): Promise<RpcResult> {
  const r = await call('payment_delete', { p_id: id })
  // The screenshot goes with it. If this fails the file is only orphaned,
  // which costs a few KB and nothing else, so it is not reported.
  if (r.ok && r.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([r.proof_path])
  return r
}

export const setProjectGst = (project: string, percent: number) =>
  call('project_set_gst', { p_project: project, p_percent: percent })

// ---------------------------------------------------------------- proof screenshots

export const PROOF_BUCKET = 'payment-proofs'

// Under the uploader's own folder — the storage policy only lets
// someone write there, and only Accounts read other people's.
export async function uploadProof(userId: string, f: File): Promise<{ path: string } | { error: string }> {
  if (f.size > 5 * 1024 * 1024) return { error: 'Keep the screenshot under 5 MB.' }
  if (!/^image\/|^application\/pdf$/.test(f.type)) return { error: 'A screenshot (image) or a PDF, please.' }
  const path = `${userId}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`
  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, f)
  return error ? { error: error.message } : { path }
}

export async function openProof(path: string) {
  // Open the tab first, while the click still counts as the user's —
  // a window opened after an await is blocked as a pop-up.
  const w = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) { w?.close(); return false }
  if (w) w.location.href = data.signedUrl
  return true
}

// ================================================================ part 2: costs and profit

export type PurchaseRow = {
  kind: 'job_work' | 'other'
  id: string
  ref_code: string | null          // JW-… for a job work
  bought_on: string
  branch_id: string | null
  branch_code: string | null
  branch_name: string | null
  project_id: string | null
  project_code: string | null
  client_name: string | null
  vendor: string | null
  item: string | null
  bill_no: string | null
  amount: number                   // without GST
  gst_amount: number
  note: string | null
  proof_path: string | null
}

export type ExpenseRow = {
  id: string
  spent_on: string
  branch_id: string | null
  branch_code: string | null
  branch_name: string | null
  category_id: string
  category: string
  is_salary: boolean
  amount: number                   // without GST
  gst_amount: number
  paid_to: string | null
  mode: PayMode | null
  reference: string | null
  note: string | null
  proof_path: string | null
  source: 'manual' | 'payroll'
  payroll_month: string | null
  created_name: string | null
}

export type PnlRow = {
  branch_id: string | null         // null = company-wide
  branch_code: string | null
  branch_name: string
  sales: number
  jobwork: number
  other_purchases: number
  purchases: number
  gross: number
  salary: number
  other_expenses: number
  expenses: number
  net: number
}

export type Category = { id: string; name: string; is_salary: boolean; is_active: boolean; sort_order: number }
export type BranchLite = { id: string; name: string; code: string | null }

export async function loadCategories(): Promise<Category[]> {
  const { data } = await supabase.from('expense_categories')
    .select('id, name, is_salary, is_active, sort_order').eq('is_active', true).order('sort_order').order('name')
  return (data ?? []) as Category[]
}

export async function loadBranchList(): Promise<BranchLite[]> {
  const { data } = await supabase.from('branches').select('id, name, code').eq('is_active', true).order('name')
  return (data ?? []) as BranchLite[]
}

export const branchLabel = (b: { code: string | null; name: string | null } | null | undefined) =>
  !b ? '—' : b.code ? `${b.code} · ${b.name ?? ''}` : (b.name ?? '—')

export const saveExpense = (a: {
  id: string | null; spentOn: string; branch: string | null; category: string; amount: number; gst: number
  paidTo?: string; mode?: PayMode | ''; reference?: string; note?: string; proofPath?: string | null
}) => call('expense_save', {
  p_id: a.id, p_spent_on: a.spentOn, p_branch: a.branch, p_category: a.category,
  p_amount: a.amount, p_gst: a.gst, p_paid_to: a.paidTo?.trim() || null, p_mode: a.mode || null,
  p_reference: a.reference?.trim() || null, p_note: a.note?.trim() || null, p_proof_path: a.proofPath ?? null,
})

export async function removeExpense(id: string) {
  const r = await call('expense_delete', { p_id: id })
  if (r.ok && r.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([r.proof_path])
  return r
}

export const savePurchase = (a: {
  id: string | null; boughtOn: string; branch: string | null; project: string | null; vendor: string
  amount: number; gst: number; item?: string; billNo?: string; note?: string; proofPath?: string | null
}) => call('purchase_save', {
  p_id: a.id, p_bought_on: a.boughtOn, p_branch: a.branch, p_project: a.project, p_vendor: a.vendor.trim(),
  p_amount: a.amount, p_gst: a.gst, p_item: a.item?.trim() || null, p_bill_no: a.billNo?.trim() || null,
  p_note: a.note?.trim() || null, p_proof_path: a.proofPath ?? null,
})

export async function removePurchase(id: string) {
  const r = await call('purchase_delete', { p_id: id })
  if (r.ok && r.proof_path) await supabase.storage.from(PROOF_BUCKET).remove([r.proof_path])
  return r
}

export const addCategory = (name: string) => call('expense_category_add', { p_name: name })

export async function syncSalaries(month: string): Promise<RpcResult & { branches?: number }> {
  return call('fin_salary_sync', { p_month: month })
}

// ================================================================ part 3: approvals and locks

export type PriceRequest = {
  id: string
  project_id: string
  project_code: string
  title: string
  customer_name: string
  branch_code: string | null
  branch_name: string | null
  booked_on: string
  old_amount: number | null
  new_amount: number
  current_amount: number
  gst_percent: number
  confirmed: number
  note: string | null
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  requested_by: string
  requested_name: string | null
  requested_at: string
  decided_name: string | null
  decided_at: string | null
  decide_note: string | null
  mine: boolean
}

export type MonthRow = {
  month: string
  locked: boolean
  locked_at: string | null
  locked_name: string | null
  note: string | null
  waiting_payments: number
  last_action: 'locked' | 'reopened' | null
  last_note: string | null
}

// Accounts and Super Admin get it applied; anyone else gets a request.
export const revisePrice = (project: string, amount: number, note?: string) =>
  call('project_revise_price', { p_project: project, p_amount: amount, p_note: note?.trim() || null })

export const decidePrice = (id: string, approve: boolean, note?: string) =>
  call('price_request_decide', { p_id: id, p_approve: approve, p_note: note?.trim() || null })

export const withdrawPrice = (id: string) => call('price_request_withdraw', { p_id: id })

export const closeMonth = (month: string, note?: string) =>
  call('fin_month_close', { p_month: month, p_note: note?.trim() || null })

export const reopenMonth = (month: string, reason: string) =>
  call('fin_month_reopen', { p_month: month, p_reason: reason.trim() })

export const incentiveToPayslip = (user: string, month: string) =>
  call('incentive_to_payslip', { p_user: user, p_month: month })

export const monthName = (m: string) =>
  new Date(m.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
