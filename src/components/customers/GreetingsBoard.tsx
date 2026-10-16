import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, Cake, Check, CheckCircle2, Gift, Loader2, MessageCircle,
  Pencil, Save, Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { fillTemplate } from './GreetingsPopup'

/*
  Birthdays and anniversaries, ahead of time.

  The popup handles today. This handles the rest of the month, which is
  what anyone planning a card, a gift or a call actually needs — by the
  morning of the day itself it is too late to arrange anything.

  Sending is the same as in the popup and for the same reason: WhatsApp
  opens with the message typed, and the person presses send. There is no
  WhatsApp Business API behind this CRM, and nothing here pretends
  otherwise.
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
  next_on: string
  days_away: number
  years: number
  already_sent: boolean
}

const WINDOWS = [
  { days: 7, label: 'Next 7 days' },
  { days: 30, label: 'This month' },
  { days: 90, label: 'Next 3 months' },
  { days: 366, label: 'Whole year' },
]

const waNumber = (r: Row) => {
  const d = (r.whatsapp ?? r.phone ?? '').replace(/\D/g, '')
  if (!d) return null
  return d.length === 10 ? '91' + d : d
}

const when = (r: Row) => {
  if (r.days_away === 0) return 'Today'
  if (r.days_away === 1) return 'Tomorrow'
  const d = new Date(r.next_on)
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · in ${r.days_away} days`
}

export default function GreetingsBoard() {
  const { can, ready } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [bodies, setBodies] = useState<Record<string, string>>({})
  const [days, setDays] = useState(30)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [editKind, setEditKind] = useState<'birthday' | 'anniversary' | null>(null)
  const [draft, setDraft] = useState('')

  const canEditTemplates = can('greeting_edit')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: g, error }, { data: t }] = await Promise.all([
      supabase.rpc('upcoming_greetings', { p_days: days }),
      supabase.from('greeting_templates').select('kind, body'),
    ])
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setRows((g ?? []) as Row[])
    setBodies(Object.fromEntries(((t ?? []) as { kind: string; body: string }[]).map((x) => [x.kind, x.body])))
  }, [days])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) =>
      r.company_name.toLowerCase().includes(t) ||
      (r.contact_person ?? '').toLowerCase().includes(t) ||
      r.customer_code.toLowerCase().includes(t))
  }, [rows, q])

  const todayCount = rows.filter((r) => r.days_away === 0 && !r.already_sent).length

  const messageFor = (r: Row) => fillTemplate(bodies[r.kind] ?? '', r as never)

  async function markSent(r: Row, channel: 'whatsapp' | 'other') {
    setBusy(r.customer_id + r.kind)
    const { error } = await supabase.from('greeting_log').insert({
      customer_id: r.customer_id,
      kind: r.kind,
      year: new Date(r.next_on).getFullYear(),
      channel,
    })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setRows((list) => list.map((x) =>
      x.customer_id === r.customer_id && x.kind === r.kind ? { ...x, already_sent: true } : x))
  }

  function sendOnWhatsApp(r: Row) {
    const num = waNumber(r)
    if (num) window.open(`https://wa.me/${num}?text=${encodeURIComponent(messageFor(r))}`, '_blank', 'noopener')
    void markSent(r, 'whatsapp')
  }

  async function saveTemplate() {
    if (!editKind) return
    setBusy('tpl')
    const { error } = await supabase
      .from('greeting_templates')
      .update({ body: draft, updated_at: new Date().toISOString() })
      .eq('kind', editKind)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setBodies((b) => ({ ...b, [editKind]: draft }))
    setEditKind(null)
    setMsg({ type: 'ok', text: 'Message saved.' })
  }

  if (ready && !can('mod_customers')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Customers is not switched on for you.
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
          <Cake size={22} className="text-orange-400" />
          Greetings
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Clients' birthdays and anniversaries, so a card or a call can be arranged before the day.
        </p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* ---------- the two messages ---------- */}
      <section className="grid gap-3 sm:grid-cols-2">
        {(['birthday', 'anniversary'] as const).map((kind) => (
          <div key={kind} className="rounded-xl border border-[#242424] bg-[#151515] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                {kind === 'birthday' ? <Cake size={14} className="text-orange-400" /> : <Gift size={14} className="text-purple-300" />}
                {kind === 'birthday' ? 'Birthday message' : 'Anniversary message'}
              </p>
              {canEditTemplates && editKind !== kind && (
                <button
                  onClick={() => { setEditKind(kind); setDraft(bodies[kind] ?? '') }}
                  aria-label="Edit"
                  className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>

            {editKind === kind ? (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  className={`${input} resize-y`}
                />
                <p className="mt-1.5 text-xs text-gray-600">
                  {'{name}'} is the contact person, {'{company}'} the firm.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={saveTemplate}
                    disabled={busy === 'tpl'}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {busy === 'tpl' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                  </button>
                  <button onClick={() => setEditKind(null)} className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-gray-400">
                {bodies[kind] ?? '—'}
              </p>
            )}
          </div>
        ))}
      </section>

      {/* ---------- who, and when ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                days === w.days ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a client" className={`${input} pl-9`} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {shown.length} coming up
        {todayCount > 0 && <span className="text-orange-400"> · {todayCount} today</span>}
      </p>

      <ul className="space-y-2">
        {shown.map((r) => {
          const num = waNumber(r)
          const key = r.customer_id + r.kind
          return (
            <li
              key={key}
              className={`rounded-xl border bg-[#151515] p-4 ${
                r.days_away === 0 ? 'border-orange-500/40' : 'border-[#242424]'
              }`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className={`mt-0.5 shrink-0 rounded-full p-2 ${
                  r.kind === 'birthday' ? 'bg-orange-500/15 text-orange-400' : 'bg-purple-500/15 text-purple-300'
                }`}>
                  {r.kind === 'birthday' ? <Cake size={15} /> : <Gift size={15} />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {(r.contact_person ?? '').trim() || r.company_name}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {r.company_name} · {r.customer_code}
                    {r.branch_name && <> · {r.branch_name}</>}
                    {r.owner_name && <> · {r.owner_name}</>}
                  </span>
                </span>

                <span className={`shrink-0 text-xs ${r.days_away === 0 ? 'font-medium text-orange-400' : 'text-gray-400'}`}>
                  {when(r)}
                  {r.years > 0 && <span className="block text-gray-600">{r.years} {r.kind === 'birthday' ? 'years old' : 'years'}</span>}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {r.already_sent ? (
                  <span className="flex items-center gap-1.5 rounded-lg border border-green-600/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-400">
                    <Check size={13} /> Greeted
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => sendOnWhatsApp(r)}
                      disabled={busy === key || !num}
                      title={num ? undefined : 'No phone number on this client'}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                    >
                      {busy === key ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                      Open WhatsApp
                    </button>
                    <button
                      onClick={() => markSent(r, 'other')}
                      disabled={busy === key}
                      className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                    >
                      <Check size={13} /> Greeted already
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}

        {!loading && shown.length === 0 && (
          <li className="rounded-xl border border-dashed border-[#2a2a2a] px-4 py-12 text-center text-sm text-gray-500">
            {q.trim()
              ? 'Nothing matches.'
              : <>Nothing in this period.
                  <span className="mt-1 block text-xs text-gray-600">
                    Dates are filled in on the client information — Customers, then the Incomplete or 📄 button.
                  </span>
                </>}
          </li>
        )}
        {loading && (
          <li className="py-12 text-center"><Loader2 size={18} className="mx-auto animate-spin text-gray-500" /></li>
        )}
      </ul>
    </div>
  )
}