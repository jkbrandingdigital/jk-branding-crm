import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Cake, Check, Gift, Loader2, MessageCircle, Pencil, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'

/*
  Today's birthdays and anniversaries.

  It opens once a day, in the middle of the screen, because a greeting
  has one day to be useful. A line in a list nobody opens is the same as
  no reminder at all.

  WHAT IT DOES NOT DO: send on its own. Sending to WhatsApp from a
  program needs the WhatsApp Business API — a Meta account, a verified
  number, an approved template. The CRM has none of that, and any other
  way of doing it gets the number banned. So the message is written and
  WhatsApp is opened with it already typed; the person presses send.
  When the API is there, this screen barely changes.
*/

type Row = {
  customer_id: string
  customer_code: string
  company_name: string
  contact_person: string | null
  phone: string | null
  whatsapp: string | null
  branch_name: string | null
  owner_id: string | null
  owner_name: string | null
  kind: 'birthday' | 'anniversary'
  the_date: string
  years: number
  already_sent: boolean
}

const SEEN_KEY = 'jk_greetings_seen'

// The message, with the client's names put in.
export function fillTemplate(body: string, r: Row) {
  const name = (r.contact_person ?? '').trim() || r.company_name
  return body.replace(/\{name\}/g, name).replace(/\{company\}/g, r.company_name)
}

const waNumber = (r: Row) => {
  const d = (r.whatsapp ?? r.phone ?? '').replace(/\D/g, '')
  if (!d) return null
  return d.length === 10 ? '91' + d : d
}

export default function GreetingsPopup() {
  const { can, ready } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [openFor, setOpenFor] = useState<string | null>(null)   // customer_id whose message is open
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState('')
  const [show, setShow] = useState(false)

  const load = useCallback(async () => {
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.rpc('todays_greetings'),
      supabase.from('greeting_templates').select('kind, body'),
    ])
    const list = ((g ?? []) as Row[]).filter((r) => !r.already_sent)
    setBodies(Object.fromEntries(((t ?? []) as { kind: string; body: string }[]).map((x) => [x.kind, x.body])))
    setRows(list)

    // Once a day. Closing it should not mean it never comes back, and
    // every page change should not mean it comes back at once.
    const today = new Date().toLocaleDateString('en-CA')
    let seen = ''
    try { seen = localStorage.getItem(SEEN_KEY) ?? '' } catch { /* storage may be blocked */ }
    if (list.length > 0 && seen !== today) setShow(true)
  }, [])

  useEffect(() => {
    if (ready && can('mod_customers')) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  function close() {
    try { localStorage.setItem(SEEN_KEY, new Date().toLocaleDateString('en-CA')) } catch { /* ignore */ }
    setShow(false)
  }

  useEffect(() => {
    if (!show) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [show])

  const messageFor = useMemo(
    () => (r: Row) => fillTemplate(bodies[r.kind] ?? '', r),
    [bodies],
  )

  async function markSent(r: Row, channel: 'whatsapp' | 'other') {
    setBusy(r.customer_id)
    await supabase.from('greeting_log').insert({
      customer_id: r.customer_id,
      kind: r.kind,
      year: new Date().getFullYear(),
      channel,
    })
    setBusy('')
    setRows((list) => {
      const next = list.filter((x) => !(x.customer_id === r.customer_id && x.kind === r.kind))
      if (next.length === 0) close()
      return next
    })
    setOpenFor(null)
  }

  function sendOnWhatsApp(r: Row) {
    const num = waNumber(r)
    const text = encodeURIComponent(openFor === r.customer_id ? draft : messageFor(r))
    if (num) window.open(`https://wa.me/${num}?text=${text}`, '_blank', 'noopener')
    // Marked here, not when WhatsApp confirms: the browser is never told
    // whether the message actually went. Better to record that the person
    // was taken there than to ask them again tomorrow.
    void markSent(r, 'whatsapp')
  }

  if (!show || rows.length === 0) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="my-6 w-full max-w-lg rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#242424] px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Cake size={16} className="text-orange-400" />
              {rows.length === 1 ? 'One greeting today' : `${rows.length} greetings today`}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              The message is ready. WhatsApp opens with it typed — you press send.
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="rounded-md p-1 text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto p-5">
          {rows.map((r) => {
            const editing = openFor === r.customer_id
            const num = waNumber(r)
            return (
              <li key={`${r.customer_id}-${r.kind}`} className="rounded-lg border border-[#242424] bg-[#171717] p-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
                    r.kind === 'birthday' ? 'bg-orange-500/15 text-orange-400' : 'bg-purple-500/15 text-purple-300'
                  }`}>
                    {r.kind === 'birthday' ? <Cake size={14} /> : <Gift size={14} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">
                      {(r.contact_person ?? '').trim() || r.company_name}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {r.company_name} · {r.customer_code}
                      {r.years > 0 && <> · {r.years} {r.kind === 'birthday' ? 'years old' : 'years'}</>}
                      {r.owner_name && <> · {r.owner_name}</>}
                    </span>
                  </span>

                  <button
                    onClick={() => { setOpenFor(editing ? null : r.customer_id); setDraft(messageFor(r)) }}
                    aria-label="Edit the message"
                    className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                  >
                    <Pencil size={14} />
                  </button>
                </div>

                {editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                  />
                ) : (
                  <p className="mt-2 rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-gray-400">{messageFor(r)}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => sendOnWhatsApp(r)}
                    disabled={busy === r.customer_id || !num}
                    title={num ? undefined : 'No phone number on this client'}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    {busy === r.customer_id ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                    Open WhatsApp
                  </button>
                  <button
                    onClick={() => markSent(r, 'other')}
                    disabled={busy === r.customer_id}
                    className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                  >
                    <Check size={13} /> Greeted already
                  </button>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-[#242424] px-5 py-3">
          <p className="text-xs text-gray-600">Comes back tomorrow, not again today.</p>
          <button onClick={close} className="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-sm text-gray-300 hover:text-white">
            Later
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}