import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Plus, Search, X, Lock, CheckCircle2, AlertCircle, KeyRound, Wand2, UserCheck, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Profile = {
  id: string
  emp_code: string
  full_name: string
  phone: string | null
  branch_id: string | null
  department_id: string | null
  designation: string | null
  date_of_joining: string | null
  is_active: boolean
}
type AuthInfo = { id: string; email?: string; last_sign_in_at?: string }
type Option = { id: string; name: string }
type Form = {
  full_name: string
  email: string
  password: string
  phone: string
  role: string
  branch_id: string
  department_id: string
  designation: string
  date_of_joining: string
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  hr: 'HR',
  branch_manager: 'Branch Manager',
  sales: 'Sales',
}
const ROLE_CHIP: Record<string, string> = {
  super_admin: 'bg-purple-950/60 text-purple-300',
  hr: 'bg-blue-950/60 text-blue-300',
  branch_manager: 'bg-orange-950/60 text-orange-300',
  sales: 'bg-[#1f1f1f] text-gray-300',
}
const needsBranch = (role: string) => role === 'sales' || role === 'branch_manager'

const emptyForm = (): Form => ({
  full_name: '',
  email: '',
  password: '',
  phone: '',
  role: 'sales',
  branch_id: '',
  department_id: '',
  designation: '',
  date_of_joining: '',
})

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#'
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join('')
}

const lastSeen = (iso?: string) => {
  if (!iso) return 'Never'
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}

// Call the manage-staff Edge Function
async function staffApi<T = unknown>(body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body })
  if (error) return { error: error.message }
  if (data?.error) return { error: data.error }
  return { data: data?.data as T }
}

export default function StaffManager() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Map<string, string>>(new Map())
  const [auth, setAuth] = useState<Map<string, AuthInfo>>(new Map())
  const [branches, setBranches] = useState<Option[]>([])
  const [departments, setDepartments] = useState<Option[]>([])
  const [allowedRoles, setAllowedRoles] = useState<string[]>([])
  const [myId, setMyId] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [branchF, setBranchF] = useState('all')
  const [roleF, setRoleF] = useState('all')
  const [statusF, setStatusF] = useState<'active' | 'inactive' | 'all'>('active')

  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: u }, p, r, b, d, list] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('profiles')
        .select('id, emp_code, full_name, phone, branch_id, department_id, designation, date_of_joining, is_active')
        .order('emp_code'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').order('name'),
      staffApi<{ users: AuthInfo[]; allowedRoles: string[] }>({ action: 'list' }),
    ])
    setMyId(u.user?.id ?? null)
    if (p.error) setMessage({ type: 'error', text: p.error.message })
    else if (list.error) setMessage({ type: 'error', text: list.error })
    setProfiles(p.data ?? [])
    setRoles(new Map((r.data ?? []).map((x) => [x.user_id, x.role])))
    setBranches(b.data ?? [])
    setDepartments(d.data ?? [])
    setAuth(new Map((list.data?.users ?? []).map((x) => [x.id, x])))
    setAllowedRoles(list.data?.allowedRoles ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const canManage = (p: Profile) => p.id === myId || allowedRoles.includes(roles.get(p.id) ?? '')

  const rows = profiles.filter((p) => {
    const role = roles.get(p.id) ?? ''
    const email = auth.get(p.id)?.email ?? ''
    const text = `${p.full_name} ${p.emp_code} ${email} ${p.phone ?? ''}`.toLowerCase()
    return (
      (!q || text.includes(q.toLowerCase())) &&
      (branchF === 'all' || p.branch_id === branchF) &&
      (roleF === 'all' || role === roleF) &&
      (statusF === 'all' || (statusF === 'active' ? p.is_active : !p.is_active))
    )
  })

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const p of profiles) if (p.is_active) c[roles.get(p.id) ?? ''] = (c[roles.get(p.id) ?? ''] ?? 0) + 1
    return c
  }, [profiles, roles])

  function openNew() {
    setEditing('new')
    setForm({ ...emptyForm(), password: makePassword(), role: allowedRoles.includes('sales') ? 'sales' : allowedRoles[0] ?? 'sales' })
    setFormError(null)
    setNewPassword('')
  }

  function openEdit(p: Profile) {
    setEditing(p)
    setForm({
      full_name: p.full_name,
      email: auth.get(p.id)?.email ?? '',
      password: '',
      phone: p.phone ?? '',
      role: roles.get(p.id) ?? 'sales',
      branch_id: p.branch_id ?? '',
      department_id: p.department_id ?? '',
      designation: p.designation ?? '',
      date_of_joining: p.date_of_joining ?? '',
    })
    setFormError(null)
    setNewPassword('')
  }

  async function submit() {
    setFormError(null)
    if (!form.full_name.trim()) return setFormError('Name is required.')
    if (needsBranch(form.role) && !form.branch_id) return setFormError('Pick a branch for this role.')

    setBusy(true)
    if (editing === 'new') {
      const res = await staffApi({ action: 'create', ...form })
      setBusy(false)
      if (res.error) return setFormError(res.error)
      setMessage({ type: 'success', text: `${form.full_name} added. Share the email and password with them.` })
    } else if (editing) {
      const payload: Record<string, unknown> = {
        action: 'update',
        user_id: editing.id,
        full_name: form.full_name.trim(),
        phone: form.phone,
        branch_id: form.branch_id,
        department_id: form.department_id,
        designation: form.designation,
        date_of_joining: form.date_of_joining,
      }
      if (form.role !== roles.get(editing.id) && editing.id !== myId) payload.role = form.role
      const res = await staffApi(payload)
      setBusy(false)
      if (res.error) return setFormError(res.error)
      setMessage({ type: 'success', text: `${form.full_name} updated.` })
    }
    setEditing(null)
    load()
  }

  async function setActive(p: Profile, active: boolean) {
    const verb = active ? 'Activate' : 'Deactivate'
    if (!window.confirm(`${verb} ${p.full_name}? ${active ? 'They can log in again.' : 'They will not be able to log in. Their old data stays.'}`)) return
    setBusy(true)
    const res = await staffApi({ action: 'update', user_id: p.id, is_active: active })
    setBusy(false)
    if (res.error) return setFormError(res.error)
    setMessage({ type: 'success', text: `${p.full_name} ${active ? 'activated' : 'deactivated'}.` })
    setEditing(null)
    load()
  }

  async function resetPassword(p: Profile) {
    if (newPassword.length < 8) return setFormError('New password must be at least 8 characters.')
    setBusy(true)
    const res = await staffApi({ action: 'reset_password', user_id: p.id, password: newPassword })
    setBusy(false)
    if (res.error) return setFormError(res.error)
    setMessage({ type: 'success', text: `Password changed for ${p.full_name}. Share the new password with them.` })
    setNewPassword('')
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none disabled:opacity-60'
  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500'

  const editingProfile = editing && editing !== 'new' ? editing : null
  const editingSelf = editingProfile?.id === myId

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Employees</h1>
          <p className="mt-1 text-sm text-gray-400">Add staff, set their role and branch, and control who can log in.</p>
        </div>
        <button
          onClick={openNew}
          disabled={allowedRoles.length === 0}
          className="flex w-fit items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
        >
          <Plus size={16} /> Add staff
        </button>
      </div>

      {/* Role counts */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
        {['sales', 'branch_manager', 'hr', 'super_admin'].map((r) => (
          <button key={r} onClick={() => setRoleF(roleF === r ? 'all' : r)} className={`bg-[#151515] px-5 py-4 text-left hover:bg-[#1a1a1a] ${roleF === r ? 'ring-1 ring-inset ring-orange-500' : ''}`}>
            <p className="text-xs text-gray-400">{ROLE_LABEL[r]}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts[r] ?? 0}</p>
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, code, phone" className={`${inputCls} pl-9`} />
        </div>
        <select value={branchF} onChange={(e) => setBranchF(e.target.value)} className={selectCls} aria-label="Branch">
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={roleF} onChange={(e) => setRoleF(e.target.value)} className={selectCls} aria-label="Role">
          <option value="all">All roles</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value as typeof statusF)} className={selectCls} aria-label="Status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Table */}
      <section className={`mt-4 overflow-x-auto rounded-2xl border border-[#242424] bg-[#151515] ${loading ? 'opacity-50' : ''}`}>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-[#242424] text-left text-gray-400">
              <th className="px-5 py-3 font-normal">Code</th>
              <th className="py-3 pr-4 font-normal">Name</th>
              <th className="py-3 pr-4 font-normal">Email</th>
              <th className="py-3 pr-4 font-normal">Role</th>
              <th className="py-3 pr-4 font-normal">Branch</th>
              <th className="py-3 pr-4 font-normal">Last login</th>
              <th className="py-3 pr-5 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-gray-500">No employees match these filters.</td>
              </tr>
            ) : (
              rows.map((p) => {
                const role = roles.get(p.id) ?? ''
                const manageable = canManage(p)
                return (
                  <tr
                    key={p.id}
                    onClick={() => manageable && openEdit(p)}
                    className={`border-b border-[#1c1c1c] last:border-0 ${manageable ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''}`}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-gray-400">{p.emp_code}</td>
                    <td className="py-3 pr-4">
                      <p className="font-medium">
                        {p.full_name}
                        {p.id === myId && <span className="ml-2 text-xs text-orange-400">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{p.designation || '—'}</p>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">{auth.get(p.id)?.email ?? '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${ROLE_CHIP[role] ?? ROLE_CHIP.sales}`}>{ROLE_LABEL[role] ?? role}</span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400">{branchName.get(p.branch_id ?? '') ?? '—'}</td>
                    <td className="py-3 pr-4 text-gray-400">{lastSeen(auth.get(p.id)?.last_sign_in_at)}</td>
                    <td className="py-3 pr-5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs ${p.is_active ? 'bg-green-950/60 text-green-400' : 'bg-red-950/40 text-red-400'}`}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {!manageable && <Lock size={14} className="text-gray-600" aria-label="You can't edit this account" />}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      {/* Add / edit panel */}
      {editing && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => !busy && setEditing(null)} />
          <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[#242424] bg-[#121212]">
            <div className="flex items-center justify-between border-b border-[#222] px-6 py-4">
              <div>
                <h2 className="font-semibold">{editing === 'new' ? 'Add staff' : editing.full_name}</h2>
                {editingProfile && <p className="text-xs text-gray-500">{editingProfile.emp_code}</p>}
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {formError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}

              <Field label="Full name *">
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Email (used to log in) *">
                <input
                  type="email"
                  value={form.email}
                  disabled={editing !== 'new'}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputCls}
                />
              </Field>
              {editing === 'new' && (
                <Field label="Password *">
                  <div className="flex gap-2">
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${inputCls} font-mono`} />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, password: makePassword() })}
                      className="rounded-lg border border-[#2a2a2a] px-3 text-gray-400 hover:text-white"
                      aria-label="Generate password"
                      title="Generate password"
                    >
                      <Wand2 size={16} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">At least 8 characters. Copy it now, you'll need to share it.</p>
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role *">
                  <select
                    value={form.role}
                    disabled={editingSelf}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className={`${inputCls}`}
                  >
                    {(editingSelf ? [form.role] : allowedRoles).map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r] ?? r}</option>
                    ))}
                  </select>
                </Field>
                <Field label={needsBranch(form.role) ? 'Branch *' : 'Branch'}>
                  <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputCls} inputMode="tel" />
                </Field>
                <Field label="Department">
                  <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Designation">
                  <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Sales Executive" className={inputCls} />
                </Field>
                <Field label="Date of joining">
                  <input type="date" value={form.date_of_joining} onChange={(e) => setForm({ ...form, date_of_joining: e.target.value })} className={`${inputCls} [color-scheme:dark]`} />
                </Field>
              </div>

              {editingProfile && (
                <>
                  <div className="border-t border-[#222] pt-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
                      <KeyRound size={15} /> Reset password
                    </p>
                    <div className="flex gap-2">
                      <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className={`${inputCls} font-mono`} />
                      <button type="button" onClick={() => setNewPassword(makePassword())} className="rounded-lg border border-[#2a2a2a] px-3 text-gray-400 hover:text-white" aria-label="Generate password">
                        <Wand2 size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => resetPassword(editingProfile)}
                        className="whitespace-nowrap rounded-lg border border-orange-500/60 px-3 text-sm text-orange-400 hover:bg-orange-500/10 disabled:opacity-50"
                      >
                        Set
                      </button>
                    </div>
                  </div>

                  {!editingSelf && (
                    <div className="border-t border-[#222] pt-4">
                      {editingProfile.is_active ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setActive(editingProfile, false)}
                          className="flex items-center gap-2 rounded-lg border border-red-900 px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 disabled:opacity-50"
                        >
                          <UserX size={15} /> Deactivate (block login)
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setActive(editingProfile, true)}
                          className="flex items-center gap-2 rounded-lg border border-green-900 px-3 py-2 text-sm text-green-400 hover:bg-green-950/40 disabled:opacity-50"
                        >
                          <UserCheck size={15} /> Activate again
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#222] px-6 py-4">
              <button onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              >
                {busy ? 'Saving…' : editing === 'new' ? 'Create account' : 'Save changes'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}