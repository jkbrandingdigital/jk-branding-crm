import { useCallback, useEffect, useState } from 'react'
import { Check, Eye, Loader2, Paperclip, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { authUser } from '../../lib/auth'
import { DateField } from '../DateField'
import {
  addPayment, decidePayment, decidePrice, deletePayment, fmtDate, GST_SLABS, inr, loadProjectMoney, MODES, withdrawPrice,
  modeLabel, openProof, PAY_STATUS, PAYMENT_STATE, reopenPayment, setProjectGst, todayIST, uploadProof,
  type PayMode, type ProjectMoney, type ProjectPayment,
} from './financeUtils'

/*
  What the client owes on this project, and what they have paid.

  Sits inside the project window, because that is where the sales
  person already is when the client says "I have sent the money".

  A payment written here WAITS until Accounts has seen it in the bank.
  Only confirmed money counts as received — on this panel, on the
  Accounts board and in the Excel file. Waiting money is shown, but
  apart, so nobody mistakes "sales says it came" for "it came".
*/

export default function ProjectPayments({
  projectId, onChanged, reloadKey = 0,
}: {
  projectId: string
  onChanged?: () => void
  // Bumped by the project window after a price change, so this panel
  // reads the new state without the window closing.
  reloadKey?: number
}) {
  const [m, setM] = useState<ProjectMoney | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayIST())
  const [mode, setMode] = useState<PayMode>('upi')
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)

  const [gstOpen, setGstOpen] = useState(false)
  const [gst, setGst] = useState('0')

  // Reject and reopen both need a reason, asked for in place.
  const [asking, setAsking] = useState<{ id: string; kind: 'reject' | 'reopen' | 'price' } | null>(null)
  const [why, setWhy] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await loadProjectMoney(projectId)
    setM(r)
    setLoading(false)
  }, [projectId])

  useEffect(() => { void load() }, [load, reloadKey])

  const after = async () => { await load(); onChanged?.() }

  if (loading && !m) {
    return <div className="py-6 text-center"><Loader2 size={16} className="mx-auto animate-spin text-gray-500" /></div>
  }
  if (!m) return null   // not this person's to see — show nothing at all

  const f = m.figures
  const left = Math.max(Number(f.due) - Number(f.waiting), 0)
  const pct = f.total > 0 ? Math.min(100, Math.round((Number(f.confirmed) / Number(f.total)) * 100)) : 0
  const st = PAY_STATUS[f.status]
  const modeInfo = MODES.find((x) => x.key === mode)!

  function openAdd() {
    setAmount(left > 0 ? String(Math.round(left * 100) / 100) : '')
    setPaidOn(todayIST()); setMode('upi'); setRef(''); setNote(''); setProof(null); setErr('')
    setAdding(true)
  }

  async function save() {
    const amt = Number(amount)
    if (!(amt > 0)) return setErr('How much was paid?')
    if (modeInfo.needsRef && !ref.trim()) return setErr(`Put the ${modeInfo.refLabel.toLowerCase()} — that is how Accounts finds it in the bank.`)
    setBusy('add'); setErr('')

    let proofPath: string | null = null
    if (proof) {
      const { data: { user } } = await authUser()
      if (!user) { setBusy(''); return setErr('Please sign in again.') }
      const up = await uploadProof(user.id, proof)
      if ('error' in up) { setBusy(''); return setErr(up.error) }
      proofPath = up.path
    }

    const r = await addPayment({ project: projectId, amount: amt, paidOn, mode, reference: ref, note, proofPath })
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    setAdding(false)
    void after()
  }

  async function act(p: ProjectPayment, what: 'confirm' | 'delete') {
    setBusy(p.id); setErr('')
    const r = what === 'confirm' ? await decidePayment(p.id, true) : await deletePayment(p.id)
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    void after()
  }

  async function answer() {
    if (!asking) return
    if (why.trim().length < 3) return setErr('Say why — a few words is enough.')
    setBusy(asking.id); setErr('')
    const r = asking.kind === 'reject'
      ? await decidePayment(asking.id, false, why)
      : asking.kind === 'price'
        ? await decidePrice(asking.id, false, why)
        : await reopenPayment(asking.id, why)
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    setAsking(null); setWhy('')
    void after()
  }

  async function saveGst() {
    const n = Number(gst)
    if (Number.isNaN(n) || n < 0 || n > 28) return setErr('GST is between 0 and 28 percent.')
    setBusy('gst'); setErr('')
    const r = await setProjectGst(projectId, n)
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    setGstOpen(false)
    void after()
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  const label = 'mb-1.5 block text-xs text-gray-500'
  const small = 'rounded-md border border-[#2a2a2a] px-2 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40'

  return (
    <section className="space-y-3 rounded-lg border border-[#242424] bg-[#141414] p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-white">Payment</h4>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
      </div>

      {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{err}</p>}

      {m.month_closed && (
        <p className="rounded-lg bg-[#1f1f1f] px-3 py-2 text-xs text-gray-400">
          The month this was booked in is closed in Finance. Its price and GST are frozen; payments dated this month can still go in.
        </p>
      )}

      {/* A price change somebody asked for. The old price stands until one
          of Accounts, the branch manager or a Super Admin says yes. */}
      {m.price_request && (() => {
        const pr = m.price_request
        return (
          <div className="rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
            <p>
              Price change waiting for approval: <span className="tabular-nums">{inr(pr.old_amount)}</span> →{' '}
              <span className="font-semibold tabular-nums">{inr(pr.new_amount)}</span>
            </p>
            <p className="mt-0.5 text-amber-300 opacity-80">
              asked by {pr.mine ? 'you' : pr.requested_name ?? '—'} · {fmtDate(pr.requested_at)}{pr.note && <> · {pr.note}</>}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pr.can_decide && (
                <>
                  <button
                    onClick={async () => { setBusy('price'); const r = await decidePrice(pr.id, true); setBusy(''); if (!r.ok) setErr(r.reason); else { void after() } }}
                    disabled={busy === 'price'}
                    className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    <Check size={12} className="mr-1 inline" />Approve
                  </button>
                  <button onClick={() => { setAsking({ id: pr.id, kind: 'price' }); setWhy('') }} className={small}>Reject</button>
                </>
              )}
              {pr.mine && (
                <button
                  onClick={async () => { setBusy('price'); const r = await withdrawPrice(pr.id); setBusy(''); if (!r.ok) setErr(r.reason); else { void after() } }}
                  disabled={busy === 'price'}
                  className={small}
                >
                  Withdraw
                </button>
              )}
            </div>
            {asking?.kind === 'price' && asking.id === pr.id && (
              <div className="mt-2 flex gap-2">
                <input value={why} onChange={(e) => setWhy(e.target.value)} autoFocus placeholder="Why — the sales person reads this"
                       className={`${input} py-1.5 text-xs`} />
                <button onClick={answer} disabled={busy === pr.id} className="shrink-0 rounded-md bg-orange-500 px-3 text-xs font-medium text-white disabled:opacity-50">Reject</button>
                <button onClick={() => setAsking(null)} aria-label="Cancel" className="shrink-0 text-gray-500 hover:text-white"><X size={14} /></button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ---------- the bill ---------- */}
      <dl className="space-y-1.5 text-sm">
        <Line k="Price (without GST)" v={inr(f.base)} />
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-gray-400">
            GST {Number(f.gst_percent) > 0 ? `${Number(f.gst_percent)}%` : '— none'}
            {!m.gst_locked && !gstOpen && (
              <button onClick={() => { setGst(String(Number(f.gst_percent))); setGstOpen(true) }} className="text-xs text-orange-400 hover:underline">
                Change
              </button>
            )}
          </dt>
          <dd className="tabular-nums text-gray-200">{inr(f.gst_amount, true)}</dd>
        </div>

        {gstOpen && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#1a1a1a] p-2">
            {GST_SLABS.map((s) => (
              <button
                key={s}
                onClick={() => setGst(String(s))}
                className={`rounded-md px-2 py-1 text-xs ${Number(gst) === s ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'}`}
              >
                {s === 0 ? 'No GST' : `${s}%`}
              </button>
            ))}
            <input
              type="number" min={0} max={28} step="0.01" value={gst}
              onChange={(e) => setGst(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              aria-label="GST percent"
              className="w-20 rounded-md border border-[#2a2a2a] bg-[#151515] px-2 py-1 text-xs tabular-nums text-white"
            />
            <button onClick={saveGst} disabled={busy === 'gst'} className="rounded-md bg-orange-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
              {busy === 'gst' ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
            </button>
            <button onClick={() => setGstOpen(false)} className="text-xs text-gray-500 hover:text-white">Cancel</button>
          </div>
        )}

        <div className="flex justify-between border-t border-[#242424] pt-1.5 font-semibold text-white">
          <dt>To collect</dt><dd className="tabular-nums">{inr(f.total, true)}</dd>
        </div>
        <Line k="Received (confirmed)" v={inr(f.confirmed, true)} tone="text-green-400" />
        {Number(f.waiting) > 0 && <Line k="Waiting for Accounts" v={inr(f.waiting, true)} tone="text-amber-300" />}
        <Line k="Still due" v={inr(Math.max(Number(f.due), 0), true)} tone={Number(f.due) > 1 ? 'text-red-400' : 'text-gray-300'} />
      </dl>

      <div className="h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
        <span className="block h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>

      {m.gst_locked && (
        <p className="text-[11px] text-gray-600">A payment is confirmed, so GST is changed by Accounts now.</p>
      )}

      {/* ---------- the payments ---------- */}
      {m.payments.length > 0 && (
        <ul className="space-y-1.5">
          {m.payments.map((p) => {
            const s = PAYMENT_STATE[p.status]
            const canDelete = p.status !== 'confirmed' && (m.is_accounts || (p.mine && p.status === 'pending'))
            return (
              <li key={p.id} className="rounded-lg border border-[#242424] bg-[#171717] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-white">{inr(p.amount, true)}</span>
                  <span className="text-xs text-gray-500">
                    {fmtDate(p.paid_on)} · {modeLabel(p.mode)}{p.reference && <> · <span className="font-mono">{p.reference}</span></>}
                  </span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-gray-600">
                  by {p.recorded_name ?? '—'}
                  {p.decided_name && <> · {p.status === 'rejected' ? 'rejected' : 'confirmed'} by {p.decided_name}</>}
                  {p.note && <> · {p.note}</>}
                </p>
                {p.decide_note && (
                  <p className={`mt-1 rounded px-2 py-1 text-[11px] ${p.status === 'rejected' ? 'bg-red-950/40 text-red-300' : 'bg-[#1f1f1f] text-gray-400'}`}>
                    {p.decide_note}
                  </p>
                )}

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {p.proof_path && (
                    <button onClick={() => void openProof(p.proof_path!)} className={small}>
                      <Eye size={12} className="mr-1 inline" />Proof
                    </button>
                  )}
                  {m.is_accounts && p.status === 'pending' && (
                    <>
                      <button onClick={() => act(p, 'confirm')} disabled={busy === p.id} className="rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40">
                        <Check size={12} className="mr-1 inline" />Confirm
                      </button>
                      <button onClick={() => { setAsking({ id: p.id, kind: 'reject' }); setWhy('') }} className={small}>Reject</button>
                    </>
                  )}
                  {m.is_accounts && p.status !== 'pending' && (
                    <button onClick={() => { setAsking({ id: p.id, kind: 'reopen' }); setWhy('') }} className={small}>
                      <RotateCcw size={12} className="mr-1 inline" />Reopen
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => act(p, 'delete')} disabled={busy === p.id} aria-label="Remove payment" className={`${small} hover:text-red-400`}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {asking?.id === p.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={why} onChange={(e) => setWhy(e.target.value)} autoFocus
                      placeholder={asking.kind === 'reject' ? 'Why — e.g. not in the bank' : 'Why it is reopened'}
                      className={`${input} py-1.5 text-xs`}
                    />
                    <button onClick={answer} disabled={busy === p.id} className="shrink-0 rounded-md bg-orange-500 px-3 text-xs font-medium text-white disabled:opacity-50">
                      {asking.kind === 'reject' ? 'Reject' : 'Reopen'}
                    </button>
                    <button onClick={() => setAsking(null)} aria-label="Cancel" className="shrink-0 text-gray-500 hover:text-white"><X size={14} /></button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ---------- record one ---------- */}
      {!adding ? (
        f.status !== 'no_price' && (
          <button
            onClick={openAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#333] py-2 text-xs text-gray-300 hover:border-orange-500/50 hover:text-orange-300"
          >
            <Plus size={13} /> Record a payment
          </button>
        )
      ) : (
        <div className="space-y-3 rounded-lg border border-[#2a2a2a] bg-[#171717] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Amount (₹)</label>
              <input
                type="number" min={0} step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={`${input} tabular-nums`} autoFocus
              />
              <p className="mt-1 text-[11px] text-gray-600">{inr(left, true)} left to collect</p>
            </div>
            <div>
              <label className={label}>Paid on</label>
              <DateField value={paidOn} onChange={setPaidOn} />
            </div>
            <div>
              <label className={label}>How</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as PayMode)} className={input}>
                {MODES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>{modeInfo.refLabel}</label>
              <input value={ref} onChange={(e) => setRef(e.target.value)} className={`${input} font-mono`} />
            </div>
          </div>

          <div>
            <label className={label}>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance, second part…" className={input} />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400 hover:text-white">
            <Paperclip size={13} />
            {proof ? proof.name : 'Attach the screenshot (optional, helps Accounts)'}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
          </label>

          <p className="text-[11px] text-gray-600">
            {m.is_accounts
              ? 'You are Accounts, so this counts as confirmed straight away.'
              : 'Accounts checks the bank and confirms it. Until then it shows as waiting.'}
          </p>

          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white">
              Cancel
            </button>
            <button
              onClick={save} disabled={busy === 'add'}
              className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy === 'add' && <Loader2 size={12} className="animate-spin" />} Save payment
            </button>
          </div>
        </div>
      )}

      {f.status === 'no_price' && (
        <p className="text-xs text-gray-500">This project has no price yet, so there is nothing to collect.</p>
      )}
    </section>
  )
}

function Line({ k, v, tone = 'text-gray-200' }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400">{k}</dt>
      <dd className={`tabular-nums ${tone}`}>{v}</dd>
    </div>
  )
}
