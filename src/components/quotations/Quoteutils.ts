import { supabase } from '../../lib/supabase'

export type GstType = 'non_gst' | 'igst' | 'sgst_cgst'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export type DiscountType = 'amount' | 'percent'

export type CompanyProfile = {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  gstin: string | null
  logo_url: string | null
  sign_url: string | null
  bank_name: string | null
  account_no: string | null
  ifsc: string | null
  show_bank: boolean
  show_sign: boolean
  default_terms: string | null
  quote_prefix: string
  next_number: number
}

export type QuoteItem = {
  id?: string
  sort_order: number
  name: string
  cost: number
  qty: number
  discount: number
  discount_type: DiscountType
  sub_total: number
  comments: string | null
}

export type Quotation = {
  id: string
  quote_no: string
  seq: number
  customer_name: string
  company_name: string | null
  mobile: string | null
  email: string | null
  address: string | null
  lead_id: string | null
  quote_date: string
  valid_until: string | null
  gst_type: GstType
  gst_percent: number
  currency: string
  subtotal: number
  discount_total: number
  tax_total: number
  total: number
  terms: string | null
  notes: string | null
  brochure_id: string | null
  status: QuoteStatus
  branch_id: string | null
  created_by: string
  created_at: string
  quotation_items?: QuoteItem[]
}

export type Brochure = { id: string; name: string; file_path: string; is_active: boolean }

export const GST_TYPES: { key: GstType; label: string }[] = [
  { key: 'non_gst', label: 'Non GST' },
  { key: 'igst', label: 'IGST' },
  { key: 'sgst_cgst', label: 'SGST / CGST' },
]

export const STATUSES: { key: QuoteStatus; label: string; cls: string }[] = [
  { key: 'draft', label: 'Draft', cls: 'bg-[#1f1f1f] text-gray-400' },
  { key: 'sent', label: 'Sent', cls: 'bg-blue-950/60 text-blue-300' },
  { key: 'accepted', label: 'Accepted', cls: 'bg-emerald-950/60 text-emerald-300' },
  { key: 'rejected', label: 'Rejected', cls: 'bg-rose-950/60 text-rose-300' },
  { key: 'expired', label: 'Expired', cls: 'bg-amber-950/60 text-amber-300' },
]
export const statusOf = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[0]

export const money = (v: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v || 0)

export const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' }).replace(/\//g, '-') : '—'

// ---------- The sums, in one place so the screen and the PDF always agree ----------
export function lineTotal(it: Pick<QuoteItem, 'cost' | 'qty' | 'discount' | 'discount_type'>) {
  const gross = (Number(it.cost) || 0) * (Number(it.qty) || 0)
  const off = it.discount_type === 'percent' ? (gross * (Number(it.discount) || 0)) / 100 : Number(it.discount) || 0
  return Math.max(gross - off, 0)
}

export function lineDiscount(it: Pick<QuoteItem, 'cost' | 'qty' | 'discount' | 'discount_type'>) {
  const gross = (Number(it.cost) || 0) * (Number(it.qty) || 0)
  const off = it.discount_type === 'percent' ? (gross * (Number(it.discount) || 0)) / 100 : Number(it.discount) || 0
  return Math.min(off, gross)
}

export function totalsOf(items: QuoteItem[], gstType: GstType, gstPercent: number) {
  const subtotal = items.reduce((s, it) => s + (Number(it.cost) || 0) * (Number(it.qty) || 0), 0)
  const discount_total = items.reduce((s, it) => s + lineDiscount(it), 0)
  const taxable = Math.max(subtotal - discount_total, 0)
  const tax_total = gstType === 'non_gst' ? 0 : (taxable * (Number(gstPercent) || 0)) / 100
  const round2 = (n: number) => Math.round(n * 100) / 100
  return {
    subtotal: round2(subtotal),
    discount_total: round2(discount_total),
    taxable: round2(taxable),
    tax_total: round2(tax_total),
    total: round2(taxable + tax_total),
  }
}

// ---------- Loading ----------
export async function loadCompany(): Promise<CompanyProfile | null> {
  const { data } = await supabase.from('company_profile').select('*').eq('id', 1).maybeSingle()
  return (data as CompanyProfile) ?? null
}

export async function loadBrochures(): Promise<Brochure[]> {
  const { data } = await supabase.from('quotation_brochures').select('*').eq('is_active', true).order('name')
  return (data ?? []) as Brochure[]
}

export async function loadQuotations(): Promise<Quotation[]> {
  const out: Quotation[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Quotation[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function loadQuotation(id: string): Promise<Quotation | null> {
  const { data, error } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const q = data as Quotation
  q.quotation_items = (q.quotation_items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  return q
}

// The next number comes from the database, so two people can save at once
export async function nextQuoteNo(): Promise<{ quote_no: string; seq: number }> {
  const { data, error } = await supabase.rpc('quotation_next_no')
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return row as { quote_no: string; seq: number }
}

export const emptyItem = (sort_order: number): QuoteItem => ({
  sort_order,
  name: '',
  cost: 0,
  qty: 1,
  discount: 0,
  discount_type: 'amount',
  sub_total: 0,
  comments: null,
})