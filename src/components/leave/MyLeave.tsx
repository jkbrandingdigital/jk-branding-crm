// src/components/leave/MyLeave.tsx
//
// A person's own leave. Route: /my-leave
//
// No permission guards it, for the same reason My attendance has none:
// what your leave is and what it costs you is the thing your pay is
// worked out from. RLS hands this screen your own rows and nobody
// else's, so it asks for everything and is given only what is yours.
//
// The one thing this screen must do well is tell somebody what a day off
// COSTS before they send the form — and what it costs if they go without
// waiting for the yes. Both numbers come from the database (leave_estimate
// and absent_warning), never worked out here: the day rate, the paid
// balance and the penalty all live in one place, and a second copy in
// TypeScript is a second copy to keep in step.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarOff, Coffee, Wallet, AlertTriangle, Loader2, Check, X, Clock,
  ChevronDown, History,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Bal = {
  code: string; name: string; unit: string; is_paid: boolean
  credited: number; taken: number; left_over: number
  month_cap: number | null; month_used: number | null
}

type Req = {
  id: string; type_code: string; type_name: string
  from_date: string; to_date: string; portion: string; hours: number | null
  reason: string; state: string
  days: number; paid_days: number; unpaid_days: number; pay_cut: number
  asked_at: string; decided_at: string | null; decide_note: string | null
}

type Line = { happened_on: string; type_code: string; qty: number; note: string }

type Quote = {
  ok: boolean; reason?: string | null; unit?: string
  days?: number; paid_days?: number; unpaid_days?: number; pay_cut?: number
  balance_before?: number; balance_after?: number
  hours?: number; month_used?: number; month_cap?: number; month_left?: number
}

type Warn = { ok: boolean; days?: number; times?: number; charged?: number; cut?: number }

const rupees = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

const shortDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

const today = () => {
  const d = new Date()
  const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000)
  return ist.toISOString().slice(0, 10)
}

const STATE_CLS: Record<string, string> = {
  Waiting:   'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Approved:  'bg-green-500/10 text-green-300 ring-green-500/20',
  Refused:   'bg-red-500/10 text-red-300 ring-red-500/20',
  Cancelled: 'bg-[#1f1f1f] text-gray-400 ring-[#2a2a2a]',
}

function Chip({ state }: { state: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${STATE_CLS[state] ?? STATE_CLS.Cancelled}`}>
      {state}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none ' +
  '[color-scheme:dark]'

export default function MyLeave() {
  const [bals, setBals] = useState<Bal[]>([])
  const [reqs, setReqs] = useState<Req[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [showLedger, setShowLedger] = useState(false)

  const [type, setType] = useState('PAID')
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [portion, setPortion] = useState('Full')
  const [hours, setHours] = useState('1')
  const [reason, setReason] = useState('')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [warn, setWarn] = useState<Warn | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const byHour = useMemo(
    () => bals.find((b) => b.code === type)?.unit === 'hour',
    [bals, type],
  )

  // Unpaid leave has no bank to draw on, so "balance −1 → −1" on the
  // form is a number that means nothing to the person reading it. The
  // ledger still records what was taken; this is about what the form
  // says while it is being filled in.
  const hasBank = useMemo(
    () => bals.find((b) => b.code === type)?.is_paid === true,
    [bals, type],
  )

  const load = useCallback(async () => {
    const [b, r, l] = await Promise.all([
      supabase.rpc('my_leave_balance'),
      supabase.rpc('my_leaves'),
      supabase.rpc('my_leave_ledger'),
    ])
    setBals((b.data ?? []) as unknown as Bal[])
    setReqs((r.data ?? []) as unknown as Req[])
    setLines((l.data ?? []) as unknown as Line[])
  }, [])

  useEffect(() => { load() }, [load])

  // A short break is one day, so the two dates move together.
  useEffect(() => { if (byHour && to !== from) setTo(from) }, [byHour, from, to])
  useEffect(() => { if (portion !== 'Full' && to !== from) setTo(from) }, [portion, from, to])

  // The quote is asked for as the form is filled in, not on submit: a
  // number that appears only after you have committed is no help at all.
  useEffect(() => {
    let alive = true
    const id = setTimeout(async () => {
      const [q, w] = await Promise.all([
        supabase.rpc('leave_estimate', {
          p_type: type, p_from: from, p_to: to,
          p_portion: portion, p_hours: byHour ? Number(hours) : null,
        }),
        supabase.rpc('absent_warning', { p_from: from, p_to: to }),
      ])
      if (!alive) return
      setQuote((q.data ?? null) as unknown as Quote | null)
      setWarn((w.data ?? null) as unknown as Warn | null)
    }, 250)
    return () => { alive = false; clearTimeout(id) }
  }, [type, from, to, portion, hours, byHour])

  async function send() {
    setBusy(true)
    setNote(null)
    const { data, error } = await supabase.rpc('leave_apply', {
      p_type: type, p_from: from, p_to: to, p_reason: reason.trim(),
      p_portion: portion, p_hours: byHour ? Number(hours) : null,
    })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) {
      return setNote({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not sent.' })
    }
    setNote({ kind: 'ok', text: 'Sent to HR. You will see it below once it is decided.' })
    setReason('')
    load()
  }

  async function withdraw(id: string) {
    const { data } = await supabase.rpc('leave_withdraw', { p_id: id })
    const r = data as { ok: boolean; reason?: string } | null
    if (!r?.ok) return setNote({ kind: 'bad', text: r?.reason ?? 'Not taken back.' })
    load()
  }

  // A disabled button with no reason beside it reads as a broken app.
  // Whatever is stopping the send is said out loud, in the same words
  // every time, right where the button is.
  const blocked =
    busy ? null
    : quote && !quote.ok ? quote.reason ?? 'That cannot be asked for.'
    : reason.trim().length < 3 ? 'Write a line in Why first.'
    : !quote ? 'Working out what it costs…'
    : null

  const canSend = !busy && blocked === null

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">My leave</h1>
        <p className="mt-1 text-sm text-gray-500">
          What is left, what it costs, and what HR has said.
        </p>
      </header>

      {/* ── what is in the bank ──────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-3">
        {bals.map((b) => (
          <div key={b.code} className="rounded-2xl border border-[#242424] bg-[#141414] p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {b.unit === 'hour' ? <Coffee size={13} /> : <CalendarOff size={13} />}
              {b.name}
            </div>
            {b.unit === 'hour' ? (
              <>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {Math.max(Number(b.month_cap ?? 0) - Number(b.month_used ?? 0), 0)}
                  <span className="ml-1 text-sm font-normal text-gray-500">hour left</span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {Number(b.month_used ?? 0)} of {Number(b.month_cap ?? 0)} used this month
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {Number(b.left_over)}
                  <span className="ml-1 text-sm font-normal text-gray-500">
                    {b.is_paid ? 'days left' : 'days taken'}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  {Number(b.credited)} given · {Number(b.taken)} taken
                </p>
              </>
            )}
          </div>
        ))}
      </section>

      {/* ── asking ───────────────────────────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <div className="border-b border-[#242424] px-5 py-3.5">
          <h2 className="text-sm font-medium">Ask for leave</h2>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="What kind">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              {bals.map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </Field>

          <Field label={byHour ? 'Which day' : 'From'}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>

          {byHour ? (
            <Field label="How long">
              <select value={hours} onChange={(e) => setHours(e.target.value)} className={inputCls}>
                <option value="0.25">15 minutes</option>
                <option value="0.5">30 minutes</option>
                <option value="0.75">45 minutes</option>
                <option value="1">1 hour</option>
              </select>
            </Field>
          ) : (
            <Field label="To">
              <input
                type="date" value={to} min={from}
                disabled={portion !== 'Full'}
                onChange={(e) => setTo(e.target.value)}
                className={`${inputCls} disabled:opacity-40`}
              />
            </Field>
          )}

          {!byHour && (
            <Field label="Whole day or half">
              <select value={portion} onChange={(e) => setPortion(e.target.value)} className={inputCls}>
                <option value="Full">Whole day</option>
                <option value="First half">First half</option>
                <option value="Second half">Second half</option>
              </select>
            </Field>
          )}

          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Why">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="A line is enough — HR reads this"
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        {/* ── what it comes to ───────────────────────────────── */}
        {quote && (
          <div className="border-t border-[#242424] px-5 py-4">
            {!quote.ok ? (
              <p className="flex items-center gap-2 text-sm text-amber-300">
                <AlertTriangle size={14} /> {quote.reason}
              </p>
            ) : quote.unit === 'hour' ? (
              <p className="text-sm text-gray-300">
                {quote.hours} hour off. <span className="text-gray-500">No pay is cut —</span>{' '}
                {quote.month_left} hour left this month after it.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-300">
                  <span className="font-semibold tabular-nums">{quote.days}</span>{' '}
                  <span className="text-gray-500">working {quote.days === 1 ? 'day' : 'days'}</span>
                </span>
                <span className="text-green-300">
                  <span className="font-semibold tabular-nums">{quote.paid_days}</span>{' '}
                  <span className="text-green-300/60">paid</span>
                </span>
                {Number(quote.unpaid_days) > 0 && (
                  <span className="text-amber-300">
                    <span className="font-semibold tabular-nums">{quote.unpaid_days}</span>{' '}
                    <span className="text-amber-300/60">unpaid</span>
                  </span>
                )}
                <span className={Number(quote.pay_cut) > 0 ? 'text-red-300' : 'text-gray-500'}>
                  <Wallet size={13} className="mr-1 inline" />
                  {Number(quote.pay_cut) > 0
                    ? <>{rupees(Number(quote.pay_cut))} off your salary</>
                    : <>nothing comes off your salary</>}
                </span>
                {hasBank && (
                  <span className="text-xs text-gray-600">
                    balance {Number(quote.balance_before)} → {Number(quote.balance_after)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── the warning that matters while it can still change
               anything: going without the yes is not leave. ───── */}
        {warn?.ok && Number(warn.days) > 0 && (
          <div className="flex items-start gap-2.5 border-t border-amber-900/40 bg-amber-950/15 px-5 py-3.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-200/90">
              Wait for HR to approve before you stay away. If you go without it,
              those {warn.days} {Number(warn.days) === 1 ? 'day' : 'days'} count as
              absent at <span className="font-semibold">{warn.times}× pay</span> —{' '}
              <span className="font-semibold">{rupees(Number(warn.cut))}</span> off the salary,
              and no paid day is used up.
            </p>
          </div>
        )}

        {note && (
          <p className={`border-t border-[#242424] px-5 py-3 text-sm ${
            note.kind === 'ok' ? 'text-green-300' : 'text-red-300'}`}>
            {note.text}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#242424] px-5 py-3.5">
          {blocked && <p className="mr-auto text-xs text-gray-500">{blocked}</p>}
          <button
            onClick={send}
            disabled={!canSend}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Send to HR
          </button>
        </div>
      </section>

      {/* ── what has been asked for ──────────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <div className="border-b border-[#242424] px-5 py-3.5">
          <h2 className="text-sm font-medium">What you have asked for</h2>
        </div>

        {reqs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-600">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-[#1f1f1f]">
            {reqs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {r.from_date === r.to_date ? day(r.from_date)
                        : `${shortDay(r.from_date)} – ${day(r.to_date)}`}
                    </span>
                    <Chip state={r.state} />
                    {r.portion !== 'Full' && (
                      <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-[11px] text-gray-400">
                        {r.portion}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {r.type_name}
                    {r.hours ? ` · ${Number(r.hours)} hour` : ` · ${Number(r.days)} days`}
                    {Number(r.pay_cut) > 0 && (
                      <span className="text-red-300/80"> · {rupees(Number(r.pay_cut))} off</span>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm text-gray-300">&ldquo;{r.reason}&rdquo;</p>
                  {r.decide_note && (
                    <p className="mt-1 text-xs text-gray-500">HR: {r.decide_note}</p>
                  )}
                </div>

                {r.state === 'Waiting' && (
                  <button
                    onClick={() => withdraw(r.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-[#1a1a1a] hover:text-white"
                  >
                    <X size={13} /> Take it back
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── every line behind the balance ────────────────────── */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
        <button
          onClick={() => setShowLedger((v) => !v)}
          className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm font-medium transition-colors hover:bg-[#1a1a1a]"
        >
          <History size={15} className="text-gray-500" />
          <span className="flex-1">Where the days came from and went</span>
          <ChevronDown size={15} className={`text-gray-500 transition-transform ${showLedger ? 'rotate-180' : ''}`} />
        </button>

        {showLedger && (
          lines.length === 0 ? (
            <p className="border-t border-[#242424] px-5 py-8 text-center text-sm text-gray-600">
              Nothing on the ledger yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#1f1f1f] border-t border-[#242424]">
              {lines.map((l, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <Clock size={12} className="shrink-0 text-gray-600" />
                  <span className="w-24 shrink-0 text-xs text-gray-500">{shortDay(l.happened_on)}</span>
                  <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${
                    Number(l.qty) > 0 ? 'text-green-300' : 'text-amber-300'}`}>
                    {Number(l.qty) > 0 ? '+' : ''}{Number(l.qty)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-400">{l.note}</span>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  )
}