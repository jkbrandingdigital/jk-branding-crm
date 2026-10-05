import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, KeyRound, Loader2, LogOut, User, X } from 'lucide-react'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import ProfileModal from './ProfileModal'
import NotificationBell from './NotificationBell'
import AppearanceMenu from './AppearanceMenu'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  hr: 'HR',
  branch_manager: 'Branch Manager',
  sales: 'Sales',
  design_team: 'Design Team',
}

const REMINDERS_PATH: Record<string, string> = {
  super_admin: '/admin/reminders',
  hr: '/hr/reminders',
  branch_manager: '/manager/reminders',
  sales: '/sales/reminders',
  design_team: '/design/reminders',
}

const LEADS_PATH: Record<string, string> = {
  super_admin: '/admin/leads',
  hr: '/hr/leads',
  branch_manager: '/manager/leads',
  sales: '/sales?page=leads',
  design_team: '/design',
}

const TASKS_PATH: Record<string, string> = {
  super_admin: '/admin/tasks',
  hr: '/hr/tasks',
  branch_manager: '/manager/tasks',
  sales: '/sales/tasks',
  design_team: '/design/tasks',
}

export default function Header() {
  const [menu, setMenu] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [branch, setBranch] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const loadMe = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    const id = data.user?.id
    setEmail(data.user?.email ?? '')
    if (!id) return
    const [pr, ur] = await Promise.all([
      supabase.from('profiles').select('full_name, profile_photo_url, branch_id').eq('id', id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', id).maybeSingle(),
    ])
    setName(pr.data?.full_name ?? '')
    setPhoto(pr.data?.profile_photo_url ?? null)
    setRole(ur.data?.role ?? '')
    if (pr.data?.branch_id) {
      const { data: b } = await supabase.from('branches').select('name').eq('id', pr.data.branch_id).maybeSingle()
      setBranch(b?.name ?? '')
    }
  }, [])

  useEffect(() => { loadMe() }, [loadMe])

  // Close the menu when clicking anywhere else
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  async function handleLogout() {
    await signOut()
    window.location.href = '/'
  }

  return (
    <header className="bg-[#1a1a1a] border-b border-[#2a2a2a] px-6 py-4 flex justify-between items-center">
      <div className="flex items-center gap-2">
        <img src="/jklogoicon.png" alt="" className="h-10 w-auto" />
        <div>
          <img src="/logo.png" alt="JK Branding" className="h-10 w-auto" />
          <p className="text-orange-400 text-xs font-medium">Vision 2036 : Agency to Unicorn</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
      <AppearanceMenu />
      <NotificationBell remindersPath={REMINDERS_PATH[role] ?? '/'} leadsPath={LEADS_PATH[role] ?? '/'} tasksPath={TASKS_PATH[role] ?? '/'} />
      <div className="relative" ref={boxRef}>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          className="flex items-center gap-3 rounded-lg border border-[#2a2a2a] py-1.5 pl-1.5 pr-3 text-left transition-colors hover:border-[#3a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          {photo ? (
            <img src={photo} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400">
              {(name || email || '?').charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden sm:block">
            <span className="block max-w-[180px] truncate text-sm text-white">{name || email}</span>
            <span className="block text-xs text-gray-500">{[ROLE_LABEL[role] ?? role, branch].filter(Boolean).join(' · ')}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${menu ? 'rotate-180' : ''}`} />
        </button>

        {menu && (
          <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
            <button
              onClick={() => { setMenu(false); setProfileOpen(true) }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
            >
              <User className="h-4 w-4" /> My profile
            </button>
            <button
              onClick={() => { setMenu(false); setPwOpen(true) }}
              className="flex w-full items-center gap-3 border-t border-[#2a2a2a] px-4 py-3 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
            >
              <KeyRound className="h-4 w-4" /> Change password
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 border-t border-[#2a2a2a] px-4 py-3 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
      </div>
      </div>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} onSaved={loadMe} />}
      {pwOpen && <ChangePassword email={email} onClose={() => setPwOpen(false)} />}
    </header>
  )
}

function ChangePassword({ email, onClose }: { email: string; onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-white transition-colors focus:border-orange-500 focus:outline-none'

  async function save() {
    setError('')
    if (next.length < 8) return setError('New password must be at least 8 characters')
    if (next !== again) return setError('The two new passwords do not match')
    if (next === current) return setError('New password must be different from the current one')

    setBusy(true)
    // Check the current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current })
    if (signInError) {
      setBusy(false)
      return setError('Current password is wrong')
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    setBusy(false)
    if (updateError) return setError(updateError.message)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Change password</h2>
            <p className="mt-0.5 text-sm text-gray-400">{email}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <>
            <p className="rounded-lg bg-green-500/10 px-4 py-3 text-sm text-green-400">
              Password changed. Use the new one the next time you sign in.
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full rounded-lg bg-orange-500 py-3 font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Done
            </button>
          </>
        ) : (
          <>
            {error && (
              <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Current password</label>
                <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">New password</label>
                <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
                <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Repeat new password</label>
                <input
                  type="password"
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && save()}
                  className={input}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={save}
                disabled={busy || !current || !next || !again}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Change password
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-[#2a2a2a] px-5 py-3 text-gray-300 transition-colors hover:text-white"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}