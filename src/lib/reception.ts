// Reception / Visitor Management — data layer + shared bits.
// All reads/writes go through the SECURITY DEFINER RPCs (R2).
// Uses your existing Supabase client.

import { supabase } from './supabase'

// ---------- Types ----------
export type VisitStatus = 'checked_in' | 'checked_out' | 'cancelled'

export interface Employee {
  id: string
  full_name: string
  designation?: string | null
}

export interface VisitorProfile {
  id: string
  full_name: string
  mobile: string
  email: string | null
  company_name: string | null
  city: string | null
  visitor_type: string
}

export interface VisitorLookup {
  visitor: VisitorProfile
  total_visits: number
  last_visit_at: string | null
}

export interface VisitRow {
  id: string
  visitor_id?: string
  full_name: string
  mobile: string
  email?: string | null
  company_name: string | null
  visitor_type: string
  meeting_employee_id?: string | null
  meeting_employee_name: string | null
  department: string | null
  purpose: string
  check_in_at: string
  check_out_at: string | null
  duration_minutes: number | null
  status: VisitStatus
  reception_remark: string | null
  branch_id?: string
}

export interface NewVisit {
  full_name: string
  mobile: string
  email?: string
  company_name?: string
  city?: string
  visitor_type: string
  meeting_employee_id: string
  department?: string
  purpose: string
  visit_description?: string
  reception_remark?: string
}

// ---------- Dropdown options (English — CRM standard) ----------
export const VISITOR_TYPES = [
  'Client / Potential Client',
  'Existing Client',
  'Vendor / Supplier',
  'Job Candidate',
  'Business Partner',
  'Delivery Person',
  'Personal Visitor',
  'Other',
] as const

export const VISIT_PURPOSES = [
  'Business Meeting',
  'New Project Discussion',
  'Existing Project Discussion',
  'Payment / Accounts',
  'Interview',
  'Vendor Meeting',
  'Document Submission',
  'Personal Meeting',
  'Other',
] as const

// Dark-theme badge classes (matches the CRM's look)
export const STATUS_META: Record<VisitStatus, { label: string; badge: string }> = {
  checked_in: { label: 'Inside', badge: 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20' },
  checked_out: { label: 'Checked Out', badge: 'bg-gray-500/10 text-gray-400 ring-1 ring-gray-500/20' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20' },
}

// ---------- Helpers ----------
const IST = 'Asia/Kolkata'

export function normalizeMobile(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10)
  return digits.slice(-10) || digits
}

export function isValidMobile(raw: string): boolean {
  return normalizeMobile(raw).length === 10
}

export function istTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true })
}

export function istDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' })
}

export function duration(mins: number | null | undefined): string {
  if (mins == null) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

// Today's date (IST) as YYYY-MM-DD, for the report's default range.
export function istTodayStr(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return parts // en-CA gives YYYY-MM-DD
}

export function monthStartStr(): string {
  return istTodayStr().slice(0, 8) + '01'
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const esc = (v: string | number | null | undefined) => `"${(v == null ? '' : String(v)).replace(/"/g, '""')}"`
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- API (RPC calls) ----------

// Employees for the "Whom to Meet" picker.
// Uses a SECURITY DEFINER RPC (Reception_R4) because profiles RLS only
// lets a user read their own row.
export async function getEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.rpc('reception_employees')
  if (error) throw error
  return (data ?? []) as Employee[]
}

export async function lookupVisitor(rawMobile: string): Promise<VisitorLookup | null> {
  if (!isValidMobile(rawMobile)) return null
  const { data, error } = await supabase.rpc('visitor_lookup', { p_mobile: normalizeMobile(rawMobile) })
  if (error) throw error
  return (data as VisitorLookup) ?? null
}

// Returns the new visit id. Throws Error with a friendly message on
// a duplicate active check-in (raised by the RPC).
export async function createVisit(v: NewVisit): Promise<string> {
  const { data, error } = await supabase.rpc('visit_create', {
    p_full_name: v.full_name,
    p_mobile: normalizeMobile(v.mobile),
    p_email: v.email ?? null,
    p_company_name: v.company_name ?? null,
    p_city: v.city ?? null,
    p_visitor_type: v.visitor_type,
    p_employee: v.meeting_employee_id,
    p_department: v.department ?? null,
    p_purpose: v.purpose,
    p_description: v.visit_description ?? null,
    p_reception_remark: v.reception_remark ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function checkoutVisit(visitId: string, finalRemark?: string): Promise<void> {
  const { error } = await supabase.rpc('visit_checkout', { p_visit: visitId, p_final_remark: finalRemark ?? null })
  if (error) throw new Error(error.message)
}

export async function cancelVisit(visitId: string): Promise<void> {
  const { error } = await supabase.rpc('visit_cancel', { p_visit: visitId })
  if (error) throw new Error(error.message)
}

export async function todaysVisits(): Promise<VisitRow[]> {
  const { data, error } = await supabase.rpc('reception_today')
  if (error) throw error
  return (data ?? []) as VisitRow[]
}

export async function visitsReport(opts: {
  from: string
  to: string
  employeeId?: string | null
}): Promise<VisitRow[]> {
  const { data, error } = await supabase.rpc('visits_report', {
    p_from: opts.from,
    p_to: opts.to,
    p_employee: opts.employeeId ?? null,
    p_branch: null,
  })
  if (error) throw error
  return (data ?? []) as VisitRow[]
}