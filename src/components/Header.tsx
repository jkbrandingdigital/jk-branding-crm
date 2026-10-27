import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Briefcase, ChevronDown, KeyRound, Loader2, LogOut, ShieldCheck, User, X } from 'lucide-react'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { usePermissions, ownHome } from '../lib/permissions'
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

/*
  Header, two shapes

  Desktop keeps everything the eye can take in at once: icon, wordmark,
  tagline, the actions on the right. The screenshot that got this file
  reopened was mobile: the same six things crammed into 390 px with the
  wordmark splitting onto a second line of grey small print nobody can
  read. There was no "mobile view" problem in the code because the file
  never knew mobile existed — it painted the same thing at every width
  and let the browser squash it.

  So the rules change at `sm` (640 px), not before:

    - On narrow screens the icon is the brand. There is one mark, not
      one mark plus a wordmark of the same mark. "JK" fits in a tap
      target the thumb has to reach for anyway.

    - "(India) Private Limited" and "Vision 2036 · Agency to Unicorn"
      go away below sm. They are good lines; they are not lines you
      need the first time you unlock the phone and open the app, which
      is when this header is seen. On a wider screen there is room for
      them and they are back.

    - The right-hand actions keep the same icons at every width, but
      shed their words — "My work", "Admin area", the person's name
      and role all step aside until there is room. The avatar carries
      the menu on its own, which is how every other mobile app does it,
      so there is nothing to learn.

    - Everything is tucked up — py-2.5 on mobile instead of py-4 — so
      the chrome does not eat half the screen above the fold.
*/

export default function Header() {
  const { pathname } = useLocation()
  const { isSubAdmin, isSuper } = usePermissions()
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
    <header className="flex items-center justify-between gap-2 border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-4">
      {/* ── Brand ──
          On narrow screens, the icon alone. From sm up, icon + wordmark + tagline. */}
      <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <img
          src="/jklogoicon.png"
          alt="JK Branding"
          className="h-9 w-auto shrink-0 sm:h-10"
        />
        <div className="hidden min-w-0 sm:block">
          <img src="/logo.png" alt="" className="h-9 w-auto sm:h-10" />
          <p className="truncate text-xs font-medium text-orange-400">
            Vision 2036 · Agency to Unicorn
          </p>
        </div>
      </Link>

      {/* ── Actions ──
          Icons at every width; text (My work, Admin area, the name) only
          when there is room. */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* A sub admin has two sides: their own daily work, and the parts of
            the admin area that were switched on for them. On mobile the
            label is dropped, so it is a single-icon pill that still shows
            which side is on at a glance. */}
        {isSubAdmin && !isSuper && role && (
          pathname.startsWith('/admin') ? (
            <Link
              to={ownHome(role)}
              aria-label="My work"
              title="My work"
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] p-2 text-sm text-gray-300 transition-colors hover:border-[#3a3a3a] hover:text-white sm:px-3"
            >
              <Briefcase size={16} />
              <span className="hidden sm:inline">My work</span>
            </Link>
          ) : (
            <Link
              to="/admin"
              aria-label="Admin area"
              title="Admin area"
              className="flex items-center gap-2 rounded-lg border border-orange-500/50 bg-orange-500/10 p-2 text-sm text-orange-400 transition-colors hover:border-orange-500 hover:text-orange-300 sm:px-3"
            >
              <ShieldCheck size={16} />
              <span className="hidden sm:inline">Admin area</span>
            </Link>
          )
        )}

        <AppearanceMenu />
        <NotificationBell
          remindersPath={REMINDERS_PATH[role] ?? '/'}
          leadsPath={LEADS_PATH[role] ?? '/'}
          tasksPath={TASKS_PATH[role] ?? '/'}
        />

        <div className="relative" ref={boxRef}>
          <button
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label="Your account"
            // On mobile the trigger is the avatar alone with a small
            // chevron tucked into its corner — the same shape every
            // other phone app uses, so there is nothing to teach.
            className="flex items-center gap-2 rounded-full border border-[#2a2a2a] p-0.5 pr-0 transition-colors hover:border-[#3a3a3a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 sm:gap-3 sm:rounded-lg sm:py-1.5 sm:pl-1.5 sm:pr-3"
          >
            {photo ? (
              <img src={photo} alt="" className="h-8 w-8 rounded-full object-cover sm:h-9 sm:w-9" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400 sm:h-9 sm:w-9">
                {(name || email || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden sm:block">
              <span className="block max-w-[180px] truncate text-sm text-white">{name || email}</span>
              <span className="block text-xs text-gray-500">
                {[ROLE_LABEL[role] ?? role, branch].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronDown
              className={`mr-1 h-4 w-4 shrink-0 text-gray-500 transition-transform sm:mr-0 ${
                menu ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menu && (
            <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-lg">
              {/* On mobile the name does not fit beside the avatar, so it
                  sits at the top of the menu where it has room — one place
                  to read who is signed in. On desktop that line is already
                  on the trigger, so this header disappears. */}
              <div className="border-b border-[#2a2a2a] px-4 py-3 sm:hidden">
                <p className="truncate text-sm font-medium text-white">{name || email}</p>
                <p className="truncate text-xs text-gray-500">
                  {[ROLE_LABEL[role] ?? role, branch].filter(Boolean).join(' · ')}
                </p>
              </div>
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