import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, Lock, X } from 'lucide-react'
import {
  masterGive, masterLock, masterPeople, masterRemove, masterSetPin, masterStatus, masterUnlock,
  useMaster, type MasterPerson, type MasterStatus,
} from '../../lib/master'

/*
  Wraps the logo. Five quick taps on it open the private PIN box — but
  only for someone who holds a key. For anyone else the taps do nothing
  at all, so nothing shows that the feature exists.

  Every tap is held back for a moment: one tap and nothing after it
  goes home as before; quick taps are counted instead. (Going home at
  once rebuilt the header and lost the count.)
*/
export default function MasterTap({ children, className = '' }: { children: ReactNode; className?: string }) {
  const taps = useRef(0)
  const wait = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<MasterStatus | null>(null)
  const { open } = useMaster()
  const navigate = useNavigate()

  useEffect(() => () => window.clearTimeout(wait.current), [])

  async function onTap(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    window.clearTimeout(wait.current)
    taps.current += 1
    if (taps.current >= 5) {
      taps.current = 0
      const s = await masterStatus()
      if (s.is_master) setStatus(s)
      return
    }
    // No more taps soon: it was a normal tap, so go home as the logo always did.
    wait.current = window.setTimeout(() => {
      if (taps.current === 1) navigate('/')
      taps.current = 0
    }, 600)
  }

  return (
    <>
      <span onClickCapture={onTap} className={`relative inline-flex ${className}`}>
        {children}
        {open && (
          <span
            className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-orange-500 text-white"
            aria-label="Private view is on"
            title="Private view is on — tap the logo 5 times to lock"
          >
            <KeyRound size={9} />
          </span>
        )}
      </span>
      {/* Drawn outside the logo's link: inside it, every click in the box
          was also a click on the link and took the page home. */}
      {status && createPortal(<MasterDialog status={status} onClose={() => setStatus(null)} />, document.body)}
    </>
  )
}

// Not type="password": the browser would offer saved passwords here and
// offer to save the PIN. A plain text box with the dots drawn by CSS, and
// every password manager told to stay out.
const pinProps = {
  type: 'text',
  inputMode: 'numeric' as const,
  autoComplete: 'one-time-code',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
}

const pinInput =
  '[&:not(:placeholder-shown)]:[-webkit-text-security:disc] w-full rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-white outline-none focus:border-orange-500'

function MasterDialog({ status, onClose }: { status: MasterStatus; onClose: () => void }) {
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)
  const reloadSoon = () => window.location.reload()

  async function unlock() {
    if (pin.length < 4) return setErr('Enter your PIN.')
    setBusy(true); setErr('')
    const r = await masterUnlock(pin)
    setBusy(false)
    if (!r.ok) { setPin(''); return setErr(r.reason) }
    reloadSoon()
  }

  async function savePin() {
    if (pin.length < 4) return setErr('The PIN is 4 to 6 digits.')
    if (pin !== pin2) return setErr('The two PINs are not the same.')
    setBusy(true); setErr('')
    const r = await masterSetPin(status.has_pin ? oldPin : null, pin)
    setBusy(false)
    if (!r.ok) return setErr(r.reason)
    reloadSoon()
  }

  async function lockNow() {
    setBusy(true)
    await masterLock()
    reloadSoon()
  }

  const until = status.until ? new Date(status.until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''
  // Only a Super Admin sets a PIN (their own here; everyone else's in
  // the list below). Anyone else gets theirs from the Super Admin.
  const setting = status.is_super && (!status.has_pin || changing)
  const waiting = !status.is_super && !status.has_pin

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"
      // React still passes portal clicks up to the logo's link; stop them here.
      onClick={(e) => { e.stopPropagation(); onClose() }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Private"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-[#2a2a2a] bg-[#161616] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <KeyRound size={16} className="text-orange-400" /> Private
          </span>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {status.open && !changing ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">Open till <span className="font-medium text-white">{until}</span>. It locks by itself then.</p>
            <div className="flex gap-2">
              <button onClick={lockNow} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Lock now
              </button>
              {status.is_super && (
                <button onClick={() => { setChanging(true); setPin(''); setPin2(''); setOldPin(''); setErr('') }} className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white">
                  Change PIN
                </button>
              )}
            </div>
            {status.is_super && <KeyHolders />}
          </div>
        ) : waiting ? (
          <p className="text-sm text-gray-400">Your PIN is set by the Super Admin. Ask them for it.</p>
        ) : setting ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">{status.has_pin ? 'Change your PIN.' : 'Set a PIN of 4 to 6 digits. Keep it to yourself.'}</p>
            {status.has_pin && (
              <input {...pinProps} placeholder="Old PIN" value={oldPin}
                onChange={(e) => setOldPin(digits(e.target.value))} className={pinInput} autoFocus />
            )}
            <input {...pinProps} placeholder="New PIN" value={pin}
              onChange={(e) => setPin(digits(e.target.value))} className={pinInput} autoFocus={!status.has_pin} />
            <input {...pinProps} placeholder="Once more" value={pin2}
              onChange={(e) => setPin2(digits(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') void savePin() }} className={pinInput} />
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button onClick={savePin} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Save PIN
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input {...pinProps} placeholder="PIN" value={pin}
              onChange={(e) => setPin(digits(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') void unlock() }}
              className={pinInput} autoFocus disabled={!!status.blocked_until} />
            {status.blocked_until && <p className="text-xs text-amber-400">Too many wrong PINs. Try again later.</p>}
            {err && <p className="text-xs text-red-400">{err}</p>}
            <button onClick={unlock} disabled={busy || !!status.blocked_until} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy && <Loader2 size={14} className="animate-spin" />} Open
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Super Admin, while open: who holds a key, and their PINs.
function KeyHolders() {
  const [rows, setRows] = useState<MasterPerson[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [pinFor, setPinFor] = useState('')     // the row whose PIN is being typed
  const [newPin, setNewPin] = useState('')

  useEffect(() => {
    let dead = false
    void masterPeople().then((r) => { if (!dead) r.ok ? setRows(r.people) : setErr(r.reason) })
    return () => { dead = true }
  }, [])

  async function act(id: string, fn: () => ReturnType<typeof masterPeople>) {
    setBusy(id); setErr('')
    const r = await fn()
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    setRows(r.people)
    setPinFor(''); setNewPin('')
  }

  function savePin(id: string) {
    if (!/^[0-9]{4,6}$/.test(newPin)) return setErr('The PIN is 4 to 6 digits.')
    void act(id, () => masterGive(id, newPin))
  }

  const shown = (rows ?? []).filter((p) => p.master || (q.trim() !== '' && `${p.name ?? ''} ${p.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())))
  const small = 'rounded px-1.5 py-0.5 text-[11px]'

  return (
    <div className="border-t border-[#242424] pt-3">
      <p className="mb-2 text-xs font-medium text-gray-400">Who holds a key</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person to add…"
        autoComplete="off" data-lpignore="true" data-1p-ignore="true"
        className="mb-2 w-full rounded-md border border-[#2a2a2a] bg-[#111] px-2.5 py-1.5 text-xs text-white outline-none focus:border-orange-500" />
      {!rows && !err && <Loader2 size={14} className="animate-spin text-gray-500" />}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((p) => (
          <li key={p.id} className="rounded-md bg-[#1b1b1b] px-2.5 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-gray-200">
                {p.name ?? '—'}{p.code && <span className="ml-1 text-gray-500">{p.code}</span>}
                {p.master && !p.has_pin && <span className="ml-1 text-amber-400">· no PIN</span>}
              </span>
              {busy === p.id ? <Loader2 size={12} className="animate-spin text-gray-500" /> : p.me ? (
                <span className="text-[11px] text-gray-500">You</span>
              ) : p.master ? (
                <>
                  <button onClick={() => { setPinFor(pinFor === p.id ? '' : p.id); setNewPin(''); setErr('') }} className={`${small} text-gray-300 hover:text-white`}>New PIN</button>
                  <button onClick={() => act(p.id, () => masterRemove(p.id))} className={`${small} text-red-400 hover:text-red-300`}>Remove</button>
                </>
              ) : (
                <button onClick={() => { setPinFor(pinFor === p.id ? '' : p.id); setNewPin(''); setErr('') }} className={`${small} text-orange-300 hover:text-orange-200`}>Give key</button>
              )}
            </div>
            {pinFor === p.id && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <input {...pinProps} placeholder="PIN for them" value={newPin} autoFocus
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') savePin(p.id) }}
                  className="[&:not(:placeholder-shown)]:[-webkit-text-security:disc] min-w-0 flex-1 rounded-md border border-[#2a2a2a] bg-[#111] px-2 py-1 text-center font-mono text-xs tracking-[0.3em] text-white outline-none focus:border-orange-500" />
                <button onClick={() => savePin(p.id)} className="rounded-md bg-orange-500 px-2.5 py-1 text-[11px] font-medium text-white">Save</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-500">Tell each person their PIN yourself. They cannot change it.</p>
      {err && <p className="mt-1 text-xs text-red-400">{err}</p>}
    </div>
  )
}