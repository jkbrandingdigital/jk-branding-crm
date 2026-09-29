import { useEffect, useRef, useState } from 'react'
import { ChevronDown, KeyRound, Loader2, LogOut, X } from 'lucide-react'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function Header() {
  const [menu, setMenu] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [email, setEmail] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''))
  }, [])

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

      <div className="relative" ref={boxRef}>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 transition-colors hover:border-[#3a3a3a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          <span className="max-w-[180px] truncate">{email || 'Account'}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${menu ? 'rotate-180' : ''}`} />
        </button>

        {menu && (
          <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
            <button
              onClick={() => { setMenu(false); setPwOpen(true) }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
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