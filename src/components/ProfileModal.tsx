import { useEffect, useRef, useState } from 'react'
import { X, Camera, Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Profile = {
  id: string
  emp_code: string | null
  full_name: string | null
  phone: string | null
  date_of_birth: string | null
  gender: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  profile_photo_url: string | null
  designation: string | null
  date_of_joining: string | null
  branch_id: string | null
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  hr: 'HR',
  branch_manager: 'Branch Manager',
  sales: 'Sales',
}

export default function ProfileModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [p, setP] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [branch, setBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: u } = await supabase.auth.getUser()
      const id = u.user?.id
      if (!id) return setLoading(false)
      setEmail(u.user?.email ?? '')

      const [pr, ur] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', id).maybeSingle(),
      ])
      if (pr.error) setMsg({ type: 'err', text: pr.error.message })
      const row = (pr.data ?? null) as Profile | null
      setP(row)
      setRole(ur.data?.role ?? '')
      if (row?.branch_id) {
        const { data: b } = await supabase.from('branches').select('name').eq('id', row.branch_id).maybeSingle()
        setBranch(b?.name ?? '')
      }
      setLoading(false)
    })()
  }, [])

  async function uploadPhoto(file: File) {
    if (!p) return
    if (file.size > 3 * 1024 * 1024) return setMsg({ type: 'err', text: 'Pick an image under 3 MB.' })
    setBusy(true)
    setMsg(null)

    const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase()
    const path = `${p.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('profile-photos').upload(path, file, { upsert: true })
    if (upErr) {
      setBusy(false)
      return setMsg({ type: 'err', text: upErr.message })
    }
    const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
    const url = `${data.publicUrl}?v=${Date.now()}`
    const { error } = await supabase.from('profiles').update({ profile_photo_url: url }).eq('id', p.id)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setP({ ...p, profile_photo_url: url })
    setMsg({ type: 'ok', text: 'Photo updated.' })
    onSaved?.()
  }

  async function removePhoto() {
    if (!p?.profile_photo_url) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ profile_photo_url: null }).eq('id', p.id)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setP({ ...p, profile_photo_url: null })
    onSaved?.()
  }

  async function save() {
    if (!p) return
    if (!(p.full_name ?? '').trim()) return setMsg({ type: 'err', text: 'Name is required.' })
    setBusy(true)
    setMsg(null)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: (p.full_name ?? '').trim(),
        phone: p.phone || null,
        date_of_birth: p.date_of_birth || null,
        gender: p.gender || null,
        address: p.address || null,
        emergency_contact_name: p.emergency_contact_name || null,
        emergency_contact_phone: p.emergency_contact_phone || null,
      })
      .eq('id', p.id)
    setBusy(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: 'Profile saved.' })
    onSaved?.()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const readOnly = 'rounded-lg border border-[#222] bg-[#121212] px-3 py-2 text-sm text-gray-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <h2 className="font-semibold">My profile</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {msg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {msg.type === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {msg.text}
            </div>
          )}

          {loading || !p ? (
            <div className="py-10 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              {/* Photo + who */}
              <div className="flex flex-wrap items-center gap-5">
                <div className="relative">
                  {p.profile_photo_url ? (
                    <img src={p.profile_photo_url} alt="" className="h-24 w-24 rounded-full border border-[#2a2a2a] object-cover" />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#1a1a1a] text-2xl text-gray-400">
                      {(p.full_name ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="absolute bottom-0 right-0 rounded-full border border-[#2a2a2a] bg-[#1a1a1a] p-2 text-gray-300 hover:text-white disabled:opacity-50"
                    title="Change photo"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold">{p.full_name || '—'}</p>
                  <p className="text-sm text-gray-400">
                    {[ROLE_LABEL[role] ?? role, branch].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-gray-500">{email}</p>
                  {p.profile_photo_url && (
                    <button onClick={removePhoto} className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400">
                      <Trash2 size={12} /> Remove photo
                    </button>
                  )}
                </div>
              </div>

              {/* Mine to change */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name *">
                  <input value={p.full_name ?? ''} onChange={(e) => setP({ ...p, full_name: e.target.value })} className={input} />
                </Field>
                <Field label="Phone">
                  <input value={p.phone ?? ''} onChange={(e) => setP({ ...p, phone: e.target.value })} inputMode="tel" className={input} />
                </Field>
                <Field label="Date of birth">
                  <input type="date" value={p.date_of_birth ?? ''} onChange={(e) => setP({ ...p, date_of_birth: e.target.value })} className={`${input} [color-scheme:dark]`} />
                </Field>
                <Field label="Gender">
                  <select value={p.gender ?? ''} onChange={(e) => setP({ ...p, gender: e.target.value })} className={input}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Address">
                  <textarea rows={2} value={p.address ?? ''} onChange={(e) => setP({ ...p, address: e.target.value })} className={`${input} resize-y`} />
                </Field>
                <div className="grid gap-4">
                  <Field label="Emergency contact name">
                    <input value={p.emergency_contact_name ?? ''} onChange={(e) => setP({ ...p, emergency_contact_name: e.target.value })} className={input} />
                  </Field>
                  <Field label="Emergency contact phone">
                    <input value={p.emergency_contact_phone ?? ''} onChange={(e) => setP({ ...p, emergency_contact_phone: e.target.value })} inputMode="tel" className={input} />
                  </Field>
                </div>
              </div>

              {/* Set by the office */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-300">Set by the office</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Employee code"><p className={readOnly}>{p.emp_code || '—'}</p></Field>
                  <Field label="Designation"><p className={readOnly}>{p.designation || '—'}</p></Field>
                  <Field label="Branch"><p className={readOnly}>{branch || '—'}</p></Field>
                  <Field label="Joined"><p className={readOnly}>{p.date_of_joining || '—'}</p></Field>
                </div>
                <p className="mt-2 text-xs text-gray-500">To change these, or your login email, ask the Super Admin or HR.</p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-[#242424] px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">Close</button>
          <button
            onClick={save}
            disabled={busy || loading}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}