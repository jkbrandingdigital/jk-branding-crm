import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, Check, CheckCircle2, Loader2, Tag, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { decidePrice, fmtDate, inr, withdrawPrice, type PriceRequest } from './financeUtils'

/*
  Price changes to approve.

  A sales person or branch manager who revises a project's price asks;
  Accounts, the branch manager of that client's branch, or a Super
  Admin answers — any one of them, never the person who asked. Until
  someone says yes the old price stands everywhere: sales figures,
  incentive, what the client owes.

  Each card shows what the change does to money already received, so a
  cut below what the client has paid is visible before it is approved.
*/

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

export default function PriceRequests() {
  const [tab, setTab] = useState<Tab>('pending')
  const [rows, setRows] = useState<PriceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [why, setWhy] = useState('')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('fin_price_requests', { p_status: tab })
    setLoading(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows((data ?? []) as PriceRequest[])
  }, [tab])

  useEffect(() => { void load() }, [load])

  async function approve(r: PriceRequest) {
    setBusy(r.id)
    const res = await decidePrice(r.id, true)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setMsg({ ok: true, text: `${r.project_code} is now ${inr(r.new_amount)}.` })
    void load()
  }

  async function reject(r: PriceRequest) {
    if (why.trim().length < 3) return setMsg({ ok: false, text: 'Say why — the sales person reads this.' })
    setBusy(r.id)
    const res = await decidePrice(r.id, false, why)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    setAsking(null); setWhy('')
    void load()
  }

  async function withdraw(r: PriceRequest) {
    setBusy(r.id)
    const res = await withdrawPrice(r.id)
    setBusy('')
    if (!res.ok) return setMsg({ ok: false, text: res.reason })
    void load()
  }

  const STATE: Record<PriceRequest['status'], string> = {
    pending: 'bg-amber-500/15 text-amber-300',
    approved: 'bg-green-500/15 text-green-400',
    rejected: 'bg-red-500/15 text-red-300',
    withdrawn: 'bg-[#1f1f1f] text-gray-500',
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
          <Tag size={22} className="text-orange-400" />
          Price changes
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Revised prices wait here. The old price stands until one of you approves.
        </p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}
        </div>
      )}

      <div className="flex w-fit rounded-lg border border-[#2a2a2a] p-0.5">
        {([['pending', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((r) => {
          const gst = Number(r.gst_percent)
          const newTotal = Math.round(Number(r.new_amount) * (100 + gst)) / 100
          const below = Number(r.confirmed) > newTotal + 1
          const down = Number(r.new_amount) < Number(r.old_amount ?? 0)
          return (
            <li key={r.id} className={`rounded-xl border bg-[#151515] p-4 ${r.status === 'pending' ? 'border-amber-600/30' : 'border-[#242424]'}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-semibold tabular-nums">
                    <span className="text-gray-400 line-through decoration-gray-600">{inr(r.old_amount)}</span>
                    <ArrowRight size={16} className="text-gray-600" />
                    <span className={down ? 'text-amber-300' : 'text-white'}>{inr(r.new_amount)}</span>
                    <span className="text-xs font-normal text-gray-500">without GST{gst > 0 && ` · ${inr(newTotal, true)} with ${gst}% GST`}</span>
                  </p>
                  <p className="mt-1 text-sm text-white">
                    {r.customer_name}
                    <span className="ml-2 font-mono text-xs text-gray-500">{r.project_code}</span>
                    {r.branch_code && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-[11px] text-gray-400">{r.branch_code}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {r.title} · booked {fmtDate(r.booked_on)} · asked by {r.mine ? 'you' : r.requested_name ?? '—'} on {fmtDate(r.requested_at)}
                  </p>
                  {r.note && <p className="mt-1.5 text-sm text-gray-300">“{r.note}”</p>}
                  {Number(r.confirmed) > 0 && (
                    <p className={`mt-1.5 text-xs ${below ? 'text-red-400' : 'text-gray-500'}`}>
                      {inr(r.confirmed, true)} already received from the client
                      {below && ' — more than the new price. Approving it leaves the client overpaid.'}
                    </p>
                  )}
                  {r.status !== 'pending' && r.status !== 'withdrawn' && (
                    <p className="mt-1.5 text-xs text-gray-500">
                      {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.decided_name ?? '—'}
                      {r.decided_at && ` · ${fmtDate(r.decided_at)}`}{r.decide_note && ` · ${r.decide_note}`}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${STATE[r.status]}`}>
                    {r.status === 'pending' ? 'Waiting' : r.status}
                  </span>
                  {r.status === 'pending' && !r.mine && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { setAsking(r.id); setWhy('') }}
                        className="rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => approve(r)} disabled={busy === r.id}
                        className="flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Approve
                      </button>
                    </div>
                  )}
                  {r.status === 'pending' && r.mine && (
                    <button onClick={() => withdraw(r)} disabled={busy === r.id}
                            className="rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>

              {asking === r.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={why} onChange={(e) => setWhy(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') void reject(r) }}
                    placeholder="Why — e.g. the client agreed the full price on the call"
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                  <button onClick={() => reject(r)} disabled={busy === r.id} className="shrink-0 rounded-lg bg-orange-500 px-4 text-sm font-medium text-white disabled:opacity-50">Reject</button>
                  <button onClick={() => setAsking(null)} aria-label="Cancel" className="shrink-0 text-gray-500 hover:text-white"><X size={16} /></button>
                </div>
              )}
            </li>
          )
        })}

        {!loading && rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-[#2a2a2a] px-4 py-12 text-center text-sm text-gray-500">
            {tab === 'pending' ? 'No price change is waiting.' : 'Nothing here.'}
          </li>
        )}
        {loading && <li className="py-12 text-center"><Loader2 size={18} className="mx-auto animate-spin text-gray-500" /></li>}
      </ul>
    </div>
  )
}
