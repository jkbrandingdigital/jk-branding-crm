import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Download, Eye, Inbox, Loader2, RotateCcw, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'
import { downloadXlsx } from '../../lib/xlsx'
import {
  BILL_LABEL, decidePayment, fmtDate, inr, modeLabel, monthRange, openProof, PAYMENT_STATE, reopenPayment,
  type InboxRow, type PaymentState,
} from './financeUtils'

/*
  Payments to confirm.

  Sales writes down "the client paid ₹50,000 by UPI, UTR 4021…". Accounts
  opens the bank, finds it, and presses Confirm. Until then the money is
  NOT counted as received anywhere.

  Waiting ones are always shown, whatever the dates — an old payment
  nobody confirmed is exactly the one that must not fall off the list.
  The dates narrow the confirmed and rejected ones, by the day the
  money was paid.
*/

type Tab = PaymentState | 'all'

export default function PaymentsInbox() {
  const [tab, setTab] = useState<Tab>('pending')
  const [from, setFrom] = useState(monthRange(0).from)
  const [to, setTo] = useState(monthRange(0).to)
  const [rows, setRows] = useState<InboxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [asking, setAsking] = useState<{ id: string; kind: 'reject' | 'reopen' } | null>(null)
  const [why, setWhy] = useState('')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('fin_payments', {
      p_status: tab, p_from: from || null, p_to: to || null,
    })
    setLoading(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows((data ?? []) as InboxRow[])
  }, [tab, from, to])

  useEffect(() => { void load() }, [load])

  async function confirm(r: InboxRow) {
    setBusy(r.id)
    const res = await decidePayment(r.id, true)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setMsg({ ok: true, text: `${inr(r.amount)} from ${r.customer_name} confirmed.` })
    void load()
  }

  async function answer() {
    if (!asking) return
    if (why.trim().length < 3) return setMsg({ ok: false, text: 'Say why — a few words is enough.' })
    setBusy(asking.id)
    const res = asking.kind === 'reject' ? await decidePayment(asking.id, false, why) : await reopenPayment(asking.id, why)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setAsking(null); setWhy('')
    void load()
  }

  async function proof(path: string) {
    if (!(await openProof(path))) setMsg({ ok: false, text: 'The screenshot could not be opened.' })
  }

  const waitingTotal = rows.filter((r) => r.status === 'pending').reduce((n, r) => n + Number(r.amount), 0)

  function toExcel() {
    downloadXlsx(`payments_${tab}_${from || 'start'}_to_${to || 'today'}`, [{
      name: 'Payments',
      columns: [
        { header: 'Paid on', kind: 'date', width: 12 }, { header: 'Amount', kind: 'money', width: 14 },
        { header: 'Mode', width: 13 }, { header: 'Reference', width: 22 }, { header: 'Client', width: 28 },
        { header: 'Project', width: 10 }, { header: 'Branch', width: 8 }, { header: 'Recorded by', width: 18 },
        { header: 'Status', width: 20 }, { header: 'Decided by', width: 18 }, { header: 'Note', width: 30 },
        { header: 'Bill', width: 12 },
      ],
      rows: rows.map((r) => [
        r.paid_on, Number(r.amount), modeLabel(r.mode), r.reference ?? '', r.customer_name, r.project_code,
        r.branch_code ?? r.branch_name ?? '', r.recorded_name ?? '', PAYMENT_STATE[r.status].label,
        r.decided_name ?? '', [r.note, r.decide_note].filter(Boolean).join(' · '),
        r.bill ? BILL_LABEL[r.bill] : r.project_split ? 'Not marked' : '',
      ]),
      total: ['Total', rows.reduce((n, r) => n + Number(r.amount), 0), null, null, `${rows.length} payments`, null, null, null, null, null, null, null],
    }])
  }

  const small = 'rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Inbox size={22} className="text-orange-400" />
            Payments to confirm
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Check each one in the bank. Only confirmed money counts as received.
          </p>
        </div>
        <button
          onClick={toExcel} disabled={rows.length === 0}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
        >
          <Download size={15} /> Excel
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {([['pending', 'Waiting'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab !== 'pending' && (
          <>
            <label className="text-xs text-gray-500">
              Paid from
              <DateField value={from} onChange={setFrom} className="mt-1 w-40" placeholder="The start" />
            </label>
            <label className="text-xs text-gray-500">
              to
              <DateField value={to} onChange={setTo} className="mt-1 w-40" placeholder="Today" />
            </label>
          </>
        )}
      </div>

      {tab === 'pending' && rows.length > 0 && (
        <p className="text-sm text-amber-300">
          {rows.length} waiting · {inr(waitingTotal)} not counted yet
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const st = PAYMENT_STATE[r.status]
          const afterThis = Number(r.project_confirmed) + (r.status === 'pending' ? Number(r.amount) : 0)
          return (
            <li key={r.id} className={`rounded-xl border bg-[#151515] p-4 ${r.status === 'pending' ? 'border-amber-600/30' : 'border-[#242424]'}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-lg font-semibold tabular-nums text-white">{inr(r.amount, true)}</span>
                    <span className="text-sm text-gray-300">{modeLabel(r.mode)}</span>
                    {r.reference && <span className="font-mono text-sm text-orange-300">{r.reference}</span>}
                    {r.bill && (
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${r.bill === 'gst' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'}`}>
                        {BILL_LABEL[r.bill]}
                      </span>
                    )}
                    {!r.bill && r.project_split && <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[11px] text-gray-400">Bill not marked</span>}
                    <span className="text-xs text-gray-500">paid {fmtDate(r.paid_on)}</span>
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {r.customer_name}
                    <span className="ml-2 font-mono text-xs text-gray-500">{r.project_code}</span>
                    {r.branch_code && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-[11px] text-gray-400">{r.branch_code}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {r.project_title} · recorded by {r.recorded_name ?? '—'}
                    {r.note && <> · “{r.note}”</>}
                  </p>
                  {/* Where this leaves the bill, so a wrong amount is
                      obvious before it is confirmed rather than after. */}
                  <p className="mt-1 text-xs text-gray-600">
                    Bill {inr(r.project_total, true)} · confirmed so far {inr(r.project_confirmed, true)}
                    {r.status === 'pending' && <> · after this {inr(afterThis, true)}</>}
                  </p>
                  {r.decide_note && (
                    <p className={`mt-1.5 inline-block rounded px-2 py-1 text-xs ${r.status === 'rejected' ? 'bg-red-950/40 text-red-300' : 'bg-[#1f1f1f] text-gray-400'}`}>
                      {r.decide_note}{r.decided_name && <> — {r.decided_name}</>}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {r.proof_path && (
                      <button onClick={() => void proof(r.proof_path!)} className={small}>
                        <Eye size={12} className="mr-1 inline" />Screenshot
                      </button>
                    )}
                    {r.status === 'pending' ? (
                      <>
                        <button onClick={() => { setAsking({ id: r.id, kind: 'reject' }); setWhy('') }} disabled={busy === r.id} className={small}>
                          Reject
                        </button>
                        <button
                          onClick={() => confirm(r)} disabled={busy === r.id}
                          className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                        >
                          {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm
                        </button>
                      </>
                    ) : (
                      <button onClick={() => { setAsking({ id: r.id, kind: 'reopen' }); setWhy('') }} className={small}>
                        <RotateCcw size={12} className="mr-1 inline" />Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {asking?.id === r.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={why} onChange={(e) => setWhy(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') void answer() }}
                    placeholder={asking.kind === 'reject' ? 'Why — e.g. not in the bank, wrong amount' : 'Why it is reopened'}
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                  <button onClick={answer} disabled={busy === r.id} className="shrink-0 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white disabled:opacity-50">
                    {asking.kind === 'reject' ? 'Reject' : 'Reopen'}
                  </button>
                  <button onClick={() => setAsking(null)} aria-label="Cancel" className="shrink-0 text-gray-500 hover:text-white"><X size={16} /></button>
                </div>
              )}
            </li>
          )
        })}

        {!loading && rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-[#2a2a2a] px-4 py-12 text-center text-sm text-gray-500">
            {tab === 'pending' ? 'Nothing waiting. Every payment recorded so far has been checked.' : 'Nothing in this period.'}
          </li>
        )}
        {loading && <li className="py-12 text-center"><Loader2 size={18} className="mx-auto animate-spin text-gray-500" /></li>}
      </ul>
    </div>
  )
}