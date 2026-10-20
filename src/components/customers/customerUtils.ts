import { supabase } from '../../lib/supabase'

/*
  Customers — the client master.

  A lead is a conversation that ends. A customer is the client, and they
  stay: a logo today, a brochure in six months, a website next year. The
  projects hang off the customer, not off the lead that happened to win.
*/

export type Customer = {
  id: string
  customer_no: number
  customer_code: string
  company_name: string
  contact_person: string | null
  contact_role: 'owner' | 'manager' | 'other' | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  billing_address: string | null
  approval_authority: string | null
  gst_number: string | null
  website: string | null
  social_links: string | null
  brand_notes: string | null
  reference_notes: string | null
  notes: string | null
  is_complete: boolean
  rating: number
  status: 'active' | 'inactive'
  birth_date: string | null
  anniversary_date: string | null
  branch_id: string | null
  branch_name: string | null
  lead_id: string | null
  owner_id: string | null
  owner_name: string | null
  converted_by: string | null
  converted_by_name: string | null
  converted_at: string
  created_at: string
  updated_at: string
  project_count: number
  open_projects: number
}

export type ProjectRow = {
  id: string
  project_no: number
  project_code: string
  title: string
  customer_id: string
  customer_name: string
  customer_code: string
  customer_phone?: string | null
  stage_id: string | null
  stage_name: string | null
  stage_color: string | null
  is_done: boolean | null
  // Rejected is kept apart from Completed on purpose: both mean the work
  // is over, but only one of them brought money in.
  is_rejected?: boolean | null
  reject_reason?: string | null
  // What work the job needs. A client may order a logo and a brochure
  // as one project, so this is a list. The money still counts under the
  // first one — see Projects_P2_Board.sql for why it is not split.
  service_keys?: string[] | null
  // null, not 0, when the reader is not allowed to see the money.
  // Zero would say "this job is free", which is a different and untrue
  // thing. A designer gets null and the screen shows no figure at all.
  value_amount: number | null
  start_date: string | null
  due_date: string | null
  owner_id: string | null
  owner_name: string | null
  // Who sold it — the coordinator needs to know who to go back to.
  created_by?: string | null
  created_name?: string | null
  notes: string | null
  created_at: string
  task_count: number
}

export type ProjectStage = {
  id: string; name: string; color: string; sort_order: number
  is_done: boolean; is_rejected?: boolean; is_active: boolean
}

/*
  The client master form, as one list.

  Keeping the fields here rather than spelling them out in the form means
  the form, the "what is still missing" line and the Excel export can
  never drift apart — they all read this.

  `need` matches the paper: 'must' is Mandatory, 'should' is Required,
  'maybe' is If applicable. Only 'must' decides whether a customer counts
  as complete, and the database works that out itself.
*/
export type Need = 'must' | 'should' | 'maybe'

export type Field = {
  key: keyof Customer
  label: string
  need: Need
  // for type 'pick'
  choices?: { value: string; label: string }[]
  type?: 'text' | 'email' | 'tel' | 'area' | 'date' | 'pick'
  hint?: string
}

export const CLIENT_FIELDS: Field[] = [
  { key: 'company_name',       label: 'Company / Brand Name', need: 'must' },
  { key: 'contact_person',     label: 'Owner / Contact Person', need: 'must' },
  {
    key: 'contact_role', label: 'They are the', need: 'should', type: 'pick',
    choices: [
      { value: 'owner',   label: 'Owner' },
      { value: 'manager', label: 'Manager' },
      { value: 'other',   label: 'Other' },
    ],
  },
  { key: 'phone',              label: 'Mobile Number', need: 'must', type: 'tel' },
  { key: 'whatsapp',           label: 'WhatsApp Number', need: 'should', type: 'tel', hint: 'Same as mobile if there is only one' },
  { key: 'email',              label: 'Official Email ID', need: 'must', type: 'email' },
  { key: 'billing_address',    label: 'Billing Address', need: 'must', type: 'area' },
  { key: 'gst_number',         label: 'GST Number', need: 'should', hint: 'If they are registered' },
  { key: 'website',            label: 'Website', need: 'maybe' },
  // Not on the paper form. They are here because a greeting on the right
  // day is worth more than most of what is above, and this is the only
  // screen where anyone is already typing the client's details.
  { key: 'birth_date',         label: 'Birthday', need: 'maybe', type: 'date', hint: 'Of the contact person' },
  { key: 'anniversary_date',   label: 'Anniversary', need: 'maybe', type: 'date', hint: 'Marriage, or the firm\u2019s founding' },
]

// The five that decide `is_complete`. The database computes the flag; this
// is only so the screen can say which ones are still empty. Keep this and
// the generated column in step — a field dropped from the form but left in
// the column means nothing can ever read as Complete again.
export const MUST_FIELDS = CLIENT_FIELDS.filter((f) => f.need === 'must')

export const missingOf = (c: Partial<Customer>) =>
  MUST_FIELDS.filter((f) => !String(c[f.key] ?? '').trim()).map((f) => f.label)

export const CONTACT_ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  other: 'Other',
}

export const NEED_LABEL: Record<Need, string> = {
  must: 'Mandatory',
  should: 'Required',
  maybe: 'If applicable',
}

export type Branch = { id: string; name: string }

export async function loadBranches(): Promise<Branch[]> {
  const { data } = await supabase
    .from('branches').select('id, name').eq('is_active', true).order('name')
  return (data ?? []) as Branch[]
}

export async function loadStages(): Promise<ProjectStage[]> {
  const { data } = await supabase
    .from('project_stages')
    .select('id, name, color, sort_order, is_done, is_active')
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as ProjectStage[]
}

export const STAGE_CLS: Record<string, string> = {
  orange: 'bg-orange-950/60 text-orange-300',
  blue: 'bg-blue-950/60 text-blue-300',
  green: 'bg-green-950/60 text-green-300',
  purple: 'bg-purple-950/60 text-purple-300',
  yellow: 'bg-yellow-950/60 text-yellow-300',
  gray: 'bg-[#1f1f1f] text-gray-400',
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const fmtDT = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

export const money = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

// Excel, the project's usual way: the BOM is what makes Excel read it as
// UTF-8, and every value is quoted so a comma in an address cannot split
// a row into two columns.
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