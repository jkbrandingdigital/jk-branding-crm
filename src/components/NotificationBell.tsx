import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, CheckCheck, FileText, ListTodo, UserPlus, Volume2, VolumeX, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fmtDT } from './leads/leadUtils'

type Notif = {
  id: string
  title: string
  body: string | null
  created_at: string
  read_at: string | null
  kind: string
  lead_id: string | null
  task_id: string | null
  link: string | null
}

const isLead = (n: Notif) => n.kind === 'lead'
const isTask = (n: Notif) => n.kind === 'task'
const isReport = (n: Notif) => n.kind === 'report'

// Notification sound: on unless the viewer has turned it off.
const SOUND_KEY = 'jk_notif_sound'

// Which tone plays for which notification. Add a line here (and a file in
// public/) to give any kind its own sound — e.g. a future 'lead_done'.
//   visitor  -> reception check-ins          (public/notify-visitor.mp3)
//   default  -> leads, tasks, reports, etc.  (public/notify-default.mp3)
const CATEGORY_FILE: Record<string, string> = {
  visitor: '/notify-visitor.mp3',
  default: '/notify-default.mp3',
}
const categoryOf = (kind: string): keyof typeof CATEGORY_FILE =>
  kind === 'visitor' ? 'visitor' : 'default'

export default function NotificationBell({
  remindersPath,
  leadsPath,
  tasksPath,
}: {
  remindersPath: string
  leadsPath: string
  tasksPath: string
}) {
  const navigate = useNavigate()
  const [uid, setUid] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [toasts, setToasts] = useState<Notif[]>([])
  const [showRead, setShowRead] = useState(false)   // the bell holds what is still unread
  const boxRef = useRef<HTMLDivElement>(null)

  // Sound: per-viewer preference, kept in localStorage. Read via a ref in
  // the realtime handler so toggling it never re-subscribes the channel.
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) === 'off' } catch { return false }
  })
  const mutedRef = useRef(muted)
  useEffect(() => { mutedRef.current = muted }, [muted])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioEls = useRef<Record<string, HTMLAudioElement>>({})

  // One <audio> per category, from public/. A missing/blocked file falls
  // back to the built-in beep, so the sound never goes fully silent.
  useEffect(() => {
    const map: Record<string, HTMLAudioElement> = {}
    for (const [cat, url] of Object.entries(CATEGORY_FILE)) {
      try {
        const a = new Audio(url)
        a.preload = 'auto'
        a.volume = 0.7
        map[cat] = a
      } catch { /* fall back to the built-in beep */ }
    }
    audioEls.current = map
  }, [])

  // Make (or resume) the AudioContext for the built-in beep fallback.
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) audioCtxRef.current = new Ctx()
      } catch { /* no audio available */ }
    }
    const ctx = audioCtxRef.current
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }, [])

  // Built-in fallback beep: one note for visitors, two for everything else.
  const playBeep = useCallback((cat: string) => {
    const ctx = ensureAudio()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      const notes = cat === 'visitor'
        ? [{ f: 880, t: 0 }]
        : [{ f: 880, t: 0 }, { f: 1318.5, t: 0.14 }]
      for (const { f, t } of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = f
        osc.connect(gain)
        gain.connect(ctx.destination)
        const start = now + t
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
        osc.start(start)
        osc.stop(start + 0.4)
      }
    } catch { /* ignore */ }
  }, [ensureAudio])

  // Play the right tone for this notification kind.
  const playChime = useCallback((kind: string) => {
    if (mutedRef.current) return
    const cat = categoryOf(kind)
    const el = audioEls.current[cat] ?? audioEls.current.default
    if (el) {
      try {
        el.currentTime = 0
        const p = el.play()
        if (p && typeof p.then === 'function') p.catch(() => playBeep(cat))
        return
      } catch { /* fall through to the beep */ }
    }
    playBeep(cat)
  }, [playBeep])

  // Unlock audio on the first interaction so later chimes can play.
  useEffect(() => {
    const unlock = () => {
      ensureAudio()
      // Prime each tone within a user gesture so it can play later.
      for (const el of Object.values(audioEls.current)) {
        const prevMuted = el.muted
        el.muted = true
        const p = el.play()
        if (p && typeof p.then === 'function') {
          p.then(() => { el.pause(); el.currentTime = 0; el.muted = prevMuted })
           .catch(() => { el.muted = prevMuted })
        } else {
          el.muted = prevMuted
        }
      }
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [ensureAudio])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null))
  }, [])

  const loadCount = useCallback(async () => {
    if (!uid) return
    const { count: c } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .is('read_at', null)
    setCount(c ?? 0)
  }, [uid])

  const loadItems = useCallback(async () => {
    if (!uid) return
    let qy = supabase
      .from('notifications')
      .select('id, title, body, created_at, read_at, kind, lead_id, task_id, link')
      .eq('user_id', uid)
    if (!showRead) qy = qy.is('read_at', null)
    const { data } = await qy.order('created_at', { ascending: false }).limit(30)
    setItems((data ?? []) as Notif[])
  }, [uid, showRead])

  // Switching between "unread" and "everything" re-asks, but only while open
  useEffect(() => {
    if (open) void loadItems()
  }, [open, loadItems])

  // Live: new reminder arrives → badge + popup
  useEffect(() => {
    if (!uid) return
    loadCount()
    const channel = supabase
      .channel(`notif-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as Notif
          playChime(n.kind)
          setCount((c) => c + 1)
          setItems((list) => [n, ...list.filter((x) => x.id !== n.id)].slice(0, 20))
          setToasts((t) => [...t, n])
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== n.id)), 20000)
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(n.title, { body: n.body ?? undefined, icon: '/jklogoicon.png' })
            } catch {
              /* some browsers block this; the in-app popup still shows */
            }
          }
        },
      )
      .subscribe()
    const poll = setInterval(loadCount, 60000) // backup if live connection drops
    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [uid, loadCount, playChime])

  // Close when clicking elsewhere
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function toggle() {
    if (!open && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    setOpen((o) => !o)
  }

  function toggleSound() {
    setMuted((m) => {
      const next = !m
      try { localStorage.setItem(SOUND_KEY, next ? 'off' : 'on') } catch { /* ignore */ }
      if (!next) ensureAudio() // turning it on counts as the gesture that unlocks audio
      return next
    })
  }

  // Ticking one clears it off the bell. It is kept, not deleted — "Read"
  // at the top of the list brings the old ones back.
  async function markRead(n: Notif) {
    if (n.read_at) return
    const now = new Date().toISOString()
    setItems((list) =>
      showRead ? list.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)) : list.filter((x) => x.id !== n.id),
    )
    setCount((c) => Math.max(0, c - 1))
    await supabase.from('notifications').update({ read_at: now }).eq('id', n.id)
  }

  async function markAll() {
    if (!uid) return
    const now = new Date().toISOString()
    setItems((list) => (showRead ? list.map((x) => (x.read_at ? x : { ...x, read_at: now })) : []))
    setCount(0)
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', uid).is('read_at', null)
  }

  function openItem(n: Notif) {
    markRead(n)
    setOpen(false)
    setToasts((t) => t.filter((x) => x.id !== n.id))
    // Newer notifications carry their own destination
    if (n.link) return navigate(n.link)
    if (isTask(n)) return navigate(tasksPath)
    if (isLead(n)) {
      // Open that one lead, keeping any query the path already has
      const [base, query] = leadsPath.split('?')
      const p = new URLSearchParams(query)
      if (n.lead_id) p.set('lead', n.lead_id)
      const qs = p.toString()
      return navigate(qs ? `${base}?${qs}` : base)
    }
    navigate(remindersPath)
  }

  return (
    <>
      <div className="relative flex items-center gap-1.5" ref={boxRef}>
        {/* Sound on / off — per viewer, remembered on this device */}
        <button
          onClick={toggleSound}
          aria-label={muted ? 'Turn notification sound on' : 'Turn notification sound off'}
          title={muted ? 'Notification sound off' : 'Notification sound on'}
          className="rounded-lg border border-[#2a2a2a] p-2.5 text-gray-300 transition-colors hover:border-[#3a3a3a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>

        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={count ? `${count} unread notifications` : 'Notifications'}
          className="relative rounded-lg border border-[#2a2a2a] p-2.5 text-gray-300 transition-colors hover:border-[#3a3a3a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-orange-500 px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg sm:w-96">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{showRead ? 'All notifications' : 'Notifications'}</p>
                <button
                  onClick={() => setShowRead((s) => !s)}
                  className="rounded-md border border-[#2a2a2a] px-2 py-0.5 text-[11px] text-gray-400 hover:border-orange-500/60 hover:text-orange-400"
                >
                  {showRead ? 'Unread only' : 'Show read'}
                </button>
              </div>
              {count > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-gray-500">
                  {showRead ? 'Nothing here yet.' : 'All caught up.'}
                </li>
              )}
              {items.map((n) => (
                <li key={n.id} className="flex items-start border-b border-[#222] last:border-0 hover:bg-[#1f1f1f]">
                  <button onClick={() => openItem(n)} className="flex min-w-0 flex-1 gap-3 py-3 pl-4 text-left">
                    {isTask(n) ? (
                      <ListTodo className={`mt-0.5 h-4 w-4 shrink-0 ${n.read_at ? 'text-gray-600' : 'text-indigo-400'}`} />
                    ) : isLead(n) ? (
                      <UserPlus className={`mt-0.5 h-4 w-4 shrink-0 ${n.read_at ? 'text-gray-600' : 'text-green-400'}`} />
                    ) : isReport(n) ? (
                      <FileText className={`mt-0.5 h-4 w-4 shrink-0 ${n.read_at ? 'text-gray-600' : 'text-sky-400'}`} />
                    ) : (
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-orange-500'}`} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${n.read_at ? 'text-gray-400' : 'text-white'}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block line-clamp-2 text-xs text-gray-500">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-gray-600">{fmtDT(n.created_at)}</span>
                    </span>
                  </button>

                  {/* Marks this one read and leaves the rest of the list alone */}
                  {!n.read_at && (
                    <button
                      onClick={() => markRead(n)}
                      aria-label="Mark as read"
                      title="Mark as read"
                      className="mr-3 mt-3 shrink-0 rounded-md border border-[#2a2a2a] p-1.5 text-gray-400 transition-colors hover:border-orange-500/60 hover:text-orange-400"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { setOpen(false); navigate(remindersPath) }}
              className="w-full border-t border-[#2a2a2a] px-4 py-2.5 text-sm text-orange-400 hover:bg-[#1f1f1f]"
            >
              Open reminders
            </button>
          </div>
        )}
      </div>

      {/* Popups for reminders that just arrived */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
          {toasts.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border bg-[#171717] p-4 shadow-xl ${
                isTask(n)
                  ? 'border-indigo-500/40'
                  : isLead(n)
                    ? 'border-green-500/40'
                    : isReport(n)
                      ? 'border-sky-500/40'
                      : 'border-orange-500/40'
              }`}
            >
              <div className="flex items-start gap-3">
                {isTask(n) ? (
                  <ListTodo className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
                ) : isLead(n) ? (
                  <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
                ) : isReport(n) ? (
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
                ) : (
                  <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{n.title}</p>
                  {n.body && <p className="mt-1 line-clamp-3 text-xs text-gray-400">{n.body}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => openItem(n)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold text-white ${
                        isTask(n)
                          ? 'bg-indigo-600 hover:bg-indigo-700'
                          : isLead(n)
                            ? 'bg-green-600 hover:bg-green-700'
                            : isReport(n)
                              ? 'bg-sky-600 hover:bg-sky-700'
                              : 'bg-orange-500 hover:bg-orange-600'
                      }`}
                    >
                      {isTask(n) ? 'Open tasks' : isLead(n) ? 'Open leads' : isReport(n) ? 'Open report' : 'Open'}
                    </button>
                    <button
                      onClick={() => { markRead(n); setToasts((t) => t.filter((x) => x.id !== n.id)) }}
                      className="rounded-md border border-[#2a2a2a] px-3 py-1 text-xs text-gray-300 hover:text-white"
                    >
                      Got it
                    </button>
                  </div>
                </div>
                <button onClick={() => setToasts((t) => t.filter((x) => x.id !== n.id))} aria-label="Close" className="text-gray-500 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}