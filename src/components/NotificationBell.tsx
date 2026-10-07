import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check, CheckCheck, FileText, ListTodo, UserPlus, X } from 'lucide-react'
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
  const boxRef = useRef<HTMLDivElement>(null)

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
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, created_at, read_at, kind, lead_id, task_id, link')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(20)
    setItems((data ?? []) as Notif[])
  }, [uid])

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
  }, [uid, loadCount])

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
    if (!open) {
      loadItems()
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    }
    setOpen((o) => !o)
  }

  async function markRead(n: Notif) {
    if (n.read_at) return
    const now = new Date().toISOString()
    setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)))
    setCount((c) => Math.max(0, c - 1))
    await supabase.from('notifications').update({ read_at: now }).eq('id', n.id)
  }

  async function markAll() {
    if (!uid) return
    const now = new Date().toISOString()
    setItems((list) => list.map((x) => (x.read_at ? x : { ...x, read_at: now })))
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
      <div className="relative" ref={boxRef}>
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
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg sm:w-96">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] px-4 py-2.5">
              <p className="text-sm font-medium text-white">Notifications</p>
              {count > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">Nothing here yet.</li>}
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