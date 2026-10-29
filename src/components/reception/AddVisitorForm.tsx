// Add New Visitor — check-in form.
// Typing a known mobile auto-fills the profile + shows a returning
// banner. "Whom to Meet" is a searchable staff picker. On save a new
// visit is created (branch + check-in time come from the DB/RPC).

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { UserPlus, RotateCcw } from 'lucide-react'
import EmployeeSelect from './EmployeeSelect'
import {
  createVisit, getEmployees, lookupVisitor, isValidMobile, istDateShort,
  VISITOR_TYPES, VISIT_PURPOSES, type Employee, type VisitorLookup,
} from '../../lib/reception'

const EMPTY = {
  full_name: '', mobile: '', email: '', company_name: '', city: '', visitor_type: '',
  meeting_employee_id: '', department: '', purpose: '', visit_description: '', reception_remark: '',
}

export default function AddVisitorForm({ onSuccess }: { onSuccess?: () => void }) {
  const [form, setForm] = useState({ ...EMPTY })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [lookup, setLookup] = useState<VisitorLookup | null>(null)
  const [looking, setLooking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    getEmployees().then(setEmployees).catch(() => setEmployees([]))
  }, [])

  // Debounced returning-visitor lookup.
  useEffect(() => {
    if (!isValidMobile(form.mobile)) {
      setLookup(null)
      return
    }
    let cancelled = false
    setLooking(true)
    const t = setTimeout(async () => {
      try {
        const res = await lookupVisitor(form.mobile)
        if (cancelled) return
        setLookup(res)
        if (res) {
          setForm((f) => ({
            ...f,
            full_name: f.full_name || res.visitor.full_name,
            email: f.email || res.visitor.email || '',
            company_name: f.company_name || res.visitor.company_name || '',
            city: f.city || res.visitor.city || '',
            visitor_type: f.visitor_type || res.visitor.visitor_type,
          }))
        }
      } catch {
        /* lookup is best-effort */
      } finally {
        if (!cancelled) setLooking(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.mobile])

  const canSubmit = useMemo(
    () => !!(form.full_name.trim() && isValidMobile(form.mobile) && form.visitor_type && form.meeting_employee_id && form.purpose),
    [form],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!canSubmit) {
      setError('Please fill all required fields (marked *).')
      return
    }
    setSaving(true)
    try {
      await createVisit(form)
      setSuccess(`${form.full_name.trim()} checked in successfully.`)
      setForm({ ...EMPTY })
      setLookup(null)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the visit. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500'
  const label = 'mb-1 block text-sm font-medium text-gray-300'
  const section = 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500'

  return (
    <form onSubmit={submit} className="max-w-3xl">
      {lookup && (
        <div className="mb-5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
          <span className="font-semibold">Returning visitor.</span> {lookup.total_visits} previous visit
          {lookup.total_visits === 1 ? '' : 's'}
          {lookup.last_visit_at ? `, last on ${istDateShort(lookup.last_visit_at)}` : ''}. Details auto-filled.
        </div>
      )}

      <h3 className={section}>Visitor Information</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Mobile Number *</label>
          <input className={input} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="10-digit mobile" inputMode="numeric" />
          {form.mobile && !isValidMobile(form.mobile) && <p className="mt-1 text-xs text-red-400">Enter a valid 10-digit mobile.</p>}
          {looking && <p className="mt-1 text-xs text-gray-500">Checking records…</p>}
        </div>
        <div>
          <label className={label}>Visitor Full Name *</label>
          <input className={input} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="e.g. Rahul Patel" />
        </div>
        <div>
          <label className={label}>Company Name</label>
          <input className={input} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="e.g. ABC Technologies" />
        </div>
        <div>
          <label className={label}>Email Address</label>
          <input type="email" className={input} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" />
        </div>
        <div>
          <label className={label}>City</label>
          <input className={input} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Rajkot" />
        </div>
        <div>
          <label className={label}>Visitor Type *</label>
          <select className={input} value={form.visitor_type} onChange={(e) => set('visitor_type', e.target.value)}>
            <option value="">Select type</option>
            {VISITOR_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
      </div>

      <h3 className={`${section} mt-8`}>Visit Details</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Whom to Meet *</label>
          <EmployeeSelect
            employees={employees}
            value={form.meeting_employee_id}
            onChange={(emp) => {
              set('meeting_employee_id', emp?.id ?? '')
              set('department', emp?.designation ?? '')
            }}
          />
        </div>
        <div>
          <label className={label}>Department</label>
          <input className={input} value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Auto-filled from employee" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Purpose of Visit *</label>
          <select className={input} value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
            <option value="">Select purpose</option>
            {VISIT_PURPOSES.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Visit Description</label>
          <textarea className={input} rows={2} value={form.visit_description} onChange={(e) => set('visit_description', e.target.value)} placeholder="Optional notes about the visit" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Reception Remark</label>
          <textarea className={input} rows={2} value={form.reception_remark} onChange={(e) => set('reception_remark', e.target.value)} placeholder="Optional remark by reception" />
        </div>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</p>}
      {success && <p className="mt-5 rounded-lg bg-green-500/10 px-4 py-2 text-sm text-green-400">{success}</p>}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-500/40"
        >
          <UserPlus size={16} /> {saving ? 'Saving…' : 'Check In Visitor'}
        </button>
        <button
          type="button"
          onClick={() => {
            setForm({ ...EMPTY })
            setLookup(null)
            setError(null)
            setSuccess(null)
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-5 py-2.5 text-sm font-medium text-gray-300 hover:bg-[#1a1a1a]"
        >
          <RotateCcw size={16} /> Clear
        </button>
      </div>
    </form>
  )
}
