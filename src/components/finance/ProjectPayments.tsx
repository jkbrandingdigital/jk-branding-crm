import { useCallback, useEffect, useState } from 'react'
import { ArrowRightLeft, Check, Eye, Loader2, Paperclip, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { authUser } from '../../lib/auth'
import { DateField } from '../DateField'
import {
  addPayment, BILL_LABEL, decidePayment, decidePrice, deletePayment, fmtDate, inr, loadProjectMoney, MODES, withdrawPrice,
  modeLabel, openProof, PAY_STATUS, PAYMENT_STATE, reopenPayment, setPaymentBill, setProjectGst, setProjectSplit, todayIST, uploadProof,
  type Bill, type PayMode, type ProjectMoney, type ProjectPayment,
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
  const [bill, setBill] = useState<Bill>('gst')

  const [gstOpen, setGstOpen] = useState(false)
  const [gst, setGst] = useState('0')
  // The part billed without GST, typed in when splitting (Fin_F8).
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitAmt, setSplitAmt] = useState('')

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

  // Two bills on one project: 18% on part of the price, the rest without GST.
  const bills = f.split && f.bills ? f.bills : null
  const billLeft = (b: Bill) =>
    bills ? Math.max(Number(bills[b].due) - Number(bills[b].waiting), 0) : left
  const unmarked = bills ? Number(bills.unmarked.confirmed) + Number(bills.unmarked.waiting) : 0
  const round2 = (n: number) => String(Math.round(n * 100) / 100)

  function openAdd() {
    const b: Bill = bills && billLeft('gst') <= 0 && billLeft('nongst') > 0 ? 'nongst' : 'gst'
    setBill(b)
    const l = billLeft(b)
    setAmount(l > 0 ? round2(l) : '')
    setPaidOn(todayIST()); setMode('upi'); setRef(''); setNote(''); setProof(null); setErr('')
    setAdding(true)
  }

  function pickBill(b: Bill) {
    setBill(b)
    const l = billLeft(b)
    setAmount(l > 0 ? round2(l) : '')
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

    const r = await addPayment({ project: projectId, amount: amt, paidOn, mode, reference: ref, note, proofPath, bill: bills ? bill : null })
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

  // One click saves: No GST, or 18% on the whole price. Split asks how
  // much goes without GST. Clicking what it already is just closes.
  const gstNow: 'none' | 'full' | 'split' = Number(f.gst_percent) === 0 ? 'none' : bills ? 'split' : 'full'

  async function pickGst(k: 'none' | 'full' | 'split') {
    if (k === 'split') {
      setSplitAmt(bills ? round2(Number(f.nongst)) : '')
      return setSplitOpen(true)
    }
    if (k === gstNow) { setGstOpen(false); setSplitOpen(false); return }
    setGst(k); setBusy('gst'); setErr('')
    const r = k === 'none'
      ? await setProjectGst(projectId, 0)
      : gstNow === 'split' ? await setProjectSplit(projectId, 0) : await setProjectGst(projectId, 18)
    setBusy('')
    if (!r.ok) return setErr(r.reason)
    setGstOpen(false); setSplitOpen(false)
    void after()
  }

  async function saveSplit() {
    const n = Number(splitAmt)
    if (!(n > 0)) return setErr('How much is W?')
    if (n >= Number(f.base)) return setErr('That is the whole price. Choose No GST instead.')
    setBusy('split'); setErr('')
    if (Number(f.gst_percent) === 0) {
      const g = await setProjectGst(projectId, 18)
      if (!g.ok) { setBusy(''); return setErr(g.reason) }
    }
    const r = await setProjectSplit(projectId, n)
    setBusy('')
    if (!r.ok) { void after(); return setErr(r.reason) }
    setGstOpen(false); setSplitOpen(false)
    void after()
  }

  async function moveBill(p: ProjectPayment, to: Bill) {
    setBusy(p.id); setErr('')
    const r = await setPaymentBill(p.id, to)
    setBusy('')
    if (!r.ok) return setErr(r.reason)
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
            {bills && <span className="text-xs text-gray-500">on {inr(bills.gst.base)}</span>}
            {!m.gst_locked && !gstOpen && (
              <button onClick={() => { setGst(String(Number(f.gst_percent))); setGstOpen(true) }} className="text-xs text-orange-400 hover:underline">
                Change
              </button>
            )}
          </dt>
          <dd className="tabular-nums text-gray-200">{inr(f.gst_amount, true)}</dd>
        </div>

        {gstOpen && (
          <div className="space-y-2 rounded-lg bg-[#1a1a1a] p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {([['none', 'No GST'], ['full', '18%'], ...(m.master ? [['split', 'Split']] : [])] as ['none' | 'full' | 'split', string][]).map(([k, text]) => {
                const on = splitOpen ? k === 'split' : gstNow === k
                return (
                  <button
                    key={k}
                    onClick={() => void pickGst(k)}
                    disabled={busy === 'gst' || busy === 'split'}
                    aria-pressed={on}
                    className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs disabled:opacity-50 ${
                      on ? 'bg-orange-500/15 text-orange-300' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'}`}
                  >
                    {busy === 'gst' && gst === k && <Loader2 size={11} className="animate-spin" />}
                    {text}
                  </button>
                )
              })}
              <button onClick={() => { setGstOpen(false); setSplitOpen(false) }} className="ml-auto text-xs text-gray-500 hover:text-white">Cancel</button>
            </div>
            {splitOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-400" htmlFor="nongst">W ₹</label>
                <input
                  id="nongst" type="number" min={0} step="0.01" value={splitAmt} autoFocus
                  onChange={(e) => setSplitAmt(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-28 rounded-md border border-[#2a2a2a] bg-[#151515] px-2 py-1 text-xs tabular-nums text-white"
                />
                {Number(splitAmt) > 0 && Number(splitAmt) < Number(f.base) && (
                  <span className="text-[11px] text-gray-500">
                    18% on {inr(Number(f.base) - Number(splitAmt))} → client pays {inr(Number(f.base) + Math.round((Number(f.base) - Number(splitAmt)) * 18) / 100, true)}
                  </span>
                )}
                <button onClick={saveSplit} disabled={busy === 'split'} className="flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
                  {busy === 'split' && <Loader2 size={11} className="animate-spin" />} Save
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between border-t border-[#242424] pt-1.5 font-semibold text-white">
          <dt>To collect</dt><dd className="tabular-nums">{inr(f.total, true)}</dd>
        </div>
        <Line k="Received (confirmed)" v={inr(f.confirmed, true)} tone="text-green-400" />
        {Number(f.waiting) > 0 && <Line k="Waiting for Accounts" v={inr(f.waiting, true)} tone="text-amber-300" />}
        <Line k="Still due" v={inr(Math.max(Number(f.due), 0), true)} tone={Number(f.due) > 1 ? 'text-red-400' : 'text-gray-300'} />
      </dl>

      {bills && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(['gst', 'nongst'] as const).map((k) => {
            const b = bills[k]
            const st = PAY_STATUS[b.status]
            return (
              <div key={k} className="rounded-lg border border-[#242424] bg-[#171717] p-2.5 text-xs">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className={`font-medium ${k === 'gst' ? 'text-sky-300' : 'text-violet-300'}`}>{BILL_LABEL[k]}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${st.tone}`}>{st.label}</span>
                </div>
                <dl className="space-y-1">
                  {k === 'gst' ? (
                    <Line k={`${inr(b.base)} + 18%`} v={inr(b.total, true)} tone="text-white" />
                  ) : (
                    <Line k="No GST" v={inr(b.total, true)} tone="text-white" />
                  )}
                  <Line k="Received" v={inr(b.confirmed, true)} tone="text-green-400" />
                  {Number(b.waiting) > 0 && <Line k="Waiting" v={inr(b.waiting, true)} tone="text-amber-300" />}
                  <Line k="Due" v={inr(Math.max(Number(b.due), 0), true)} tone={Number(b.due) > 1 ? 'text-red-400' : 'text-gray-300'} />
                </dl>
              </div>
            )
          })}
        </div>
      )}
      {bills && unmarked > 0 && (
        <p className="rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
          {inr(unmarked, true)} paid before the split is not marked to a bill. Mark it below so each bill's due is right.
        </p>
      )}

      <div className="h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
        <span className="block h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>

      {m.gst_locked && (
        <p className="text-[11px] text-gray-600">A payment is confirmed, so GST and the split are changed by Accounts now.</p>
      )}

      {/* ---------- the payments ---------- */}
      {m.payments.length > 0 && (
        <ul className="space-y-1.5">
          {m.payments.map((p) => {
            const s = PAYMENT_STATE[p.status]
            const canDelete = p.status !== 'confirmed' && (m.is_accounts || (p.mine && p.status === 'pending'))
            const canMove = !!bills && p.status !== 'rejected' && (m.is_accounts || (p.mine && p.status === 'pending'))
            return (
              <li key={p.id} className="rounded-lg border border-[#242424] bg-[#171717] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-white">{inr(p.amount, true)}</span>
                  <span className="text-xs text-gray-500">
                    {fmtDate(p.paid_on)} · {modeLabel(p.mode)}{p.reference && <> · <span className="font-mono">{p.reference}</span></>}
                  </span>
                  {bills && (p.bill
                    ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.bill === 'gst' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'}`}>{BILL_LABEL[p.bill]}</span>
                    : <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-400">Bill not marked</span>)}
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
                  {canMove && (p.bill
                    ? (
                      <button onClick={() => moveBill(p, p.bill === 'gst' ? 'nongst' : 'gst')} disabled={busy === p.id} className={small}>
                        <ArrowRightLeft size={12} className="mr-1 inline" />Move to {BILL_LABEL[p.bill === 'gst' ? 'nongst' : 'gst']}
                      </button>
                    ) : (['gst', 'nongst'] as const).map((k) => (
                      <button key={k} onClick={() => moveBill(p, k)} disabled={busy === p.id} className={small}>
                        Mark: {BILL_LABEL[k]}
                      </button>
                    )))}
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
          {bills && (
            <div>
              <label className={label}>Which bill</label>
              <div className="flex gap-1.5">
                {(['gst', 'nongst'] as const).map((k) => (
                  <button
                    key={k} type="button" onClick={() => pickBill(k)} aria-pressed={bill === k}
                    className={`rounded-md px-3 py-1.5 text-xs ${bill === k ? 'bg-orange-500/15 text-orange-300' : 'border border-[#2a2a2a] text-gray-400 hover:text-white'}`}
                  >
                    {BILL_LABEL[k]} · {inr(billLeft(k), true)} left
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Amount (₹)</label>
              <input
                type="number" min={0} step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={`${input} tabular-nums`} autoFocus
              />
              <p className="mt-1 text-[11px] text-gray-600">
                {bills ? <>{inr(billLeft(bill), true)} left on the {bill === 'gst' ? 'GST bill' : 'W bill'}</> : <>{inr(left, true)} left to collect</>}
              </p>
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