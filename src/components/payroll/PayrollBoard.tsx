// src/components/payroll/PayrollBoard.tsx
//
// Running a month's payroll. Routes: /hr/payroll and /admin/payroll —
// the same component behind both, so HR and the super admin cannot see
// two different versions of the same month.
//
// The screen is built around the one thing that must never be
// ambiguous: WHAT STATE THE MONTH IS IN. The four steps across the top
// are not decoration — Calculate, Review, Approve, Pay are exactly the
// four states a run moves through in the database, and the step that is
// lit is read from the run, never from a guess here.
//
// Draft means figures move. Waiting means somebody else is looking.
// Approved means shut — and the buttons that would change it are not
// disabled, they are gone, because a greyed button invites a phone call
// about why it is greyed.
//
// Every figure shown was worked out by the database and copied onto the
// payslip when it was built. Nothing is recomputed in TypeScript. If a
// number looks wrong the answer is to rebuild the draft, not to patch
// the display — a second opinion in the browser is how a payslip and a
// register start disagreeing.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  Wallet, Play, Send, Check, X, RotateCcw, Loader2, Download, Plus, Trash2,
  AlertTriangle, ChevronLeft, ChevronRight, Lock, IndianRupee, TrendingUp,
  Users, Clock, Printer, FileText,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── The colours ────────────────────────────────────────────────
// Orange is the brand's and it carries the money. Green is what has
// actually been paid; amber is what is still owed; red is only ever a
// deduction. The same four meanings as the attendance board.
const C = {
  gross: '#f97316',
  added: '#22c55e',
  cut:   '#b91c1c',
  grid:  '#1f1f1f',
  axis:  '#52525b',
}

type Run = {
  id: string; month: string; state: string; people: number
  gross: number; additions: number; deductions: number
  total_net: number; total_paid: number; unpaid_people: number
  built_at: string | null; submitted_at: string | null; approved_at: string | null
  approved_by_name: string | null; note: string | null
}

type Slip = {
  id: string; user_id: string; emp_code: string; full_name: string
  branch: string | null; designation: string | null
  monthly: number; day_rate: number; days_in_month: number
  worked_days: number; off_days: number; paid_leave_days: number
  unpaid_leave_days: number; absent_days: number; absent_charged: number
  late_count: number; late_half_days: number; not_yet_days: number
  earnings: number; day_cut: number; fixed_cut: number; other_cut: number
  net: number; not_taken: number; state: string
  paid_amount: number; paid_on: string | null; pay_mode: string | null; pay_ref: string | null
}

type Line = { id: string; kind: string; label: string; amount: number; note: string | null }

type Incentive = {
  user_id: string; emp_code: string; full_name: string; branch: string | null
  service_sold: number; product_sold: number; unmarked: number; sold: number
  target: number | null; target_met: boolean | null
  amount: number; payable: number
}

type Summary = {
  ok: boolean; people?: number; gross?: number; additions?: number
  day_cut?: number; fixed_cut?: number; other_cut?: number
  net?: number; not_taken?: number; paid?: number; pending?: number
  no_salary?: number; absent_people?: number
}

const rupees = (n: number | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const short = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  if (v >= 1e3) return `₹${Math.round(v / 1e3)}K`
  return '₹' + v
}

const monthName = (m: string) =>
  new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const monthShort = (m: string) =>
  new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

const STATE_CLS: Record<string, string> = {
  Draft: 'bg-[#1f1f1f] text-gray-300 ring-[#2a2a2a]',
  'Waiting approval': 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Approved: 'bg-green-500/10 text-green-300 ring-green-500/20',
  Unpaid: 'bg-[#1f1f1f] text-gray-400 ring-[#2a2a2a]',
  'Partly paid': 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  Paid: 'bg-green-500/10 text-green-300 ring-green-500/20',
}

function Chip({ state }: { state: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ${
      STATE_CLS[state] ?? STATE_CLS.Draft}`}>
      {state}
    </span>
  )
}

function Tile({ icon: Icon, label, value, note, tone }: {
  icon: typeof Wallet; label: string; value: string; note?: string; tone?: string
}) {
  return (
    <div className="rounded-2xl border border-[#242424] bg-[#141414] px-5 py-4 transition-colors hover:border-[#2e2e2e]">
      <p className="flex items-center gap-2 text-xs text-gray-500">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1e1e1e] text-gray-400">
          <Icon size={14} />
        </span>
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold tabular-nums ${tone ?? 'text-gray-100'}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-gray-600">{note}</p>}
    </div>
  )
}

function Panel({ title, hint, right, children, className = '' }: {
  title: string; hint?: string; right?: React.ReactNode
  children: React.ReactNode; className?: string
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-[#242424] bg-[#141414] ${className}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#242424] px-5 py-3.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <span className="text-xs text-gray-600">{hint}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  )
}

const btn =
  'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40'

// The four steps are the four states. Nothing here is decorative.
const STEPS = ['Calculate', 'Review', 'Approve', 'Pay'] as const
const stepOf = (run: Run | null) => {
  if (!run) return 0
  if (run.state === 'Draft') return run.built_at ? 1 : 0
  if (run.state === 'Waiting approval') return 2
  return Number(run.total_paid) >= Number(run.total_net) && Number(run.total_net) > 0 ? 4 : 3
}

export default function PayrollBoard() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // One component behind /hr/payroll and /admin/payroll, so where a row
  // leads has to be worked out from where we are rather than hard-coded.
  const base = pathname.startsWith('/admin') ? '/admin' : '/hr'
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [runs, setRuns] = useState<Run[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [slips, setSlips] = useState<Slip[]>([])
  const [sum, setSum] = useState<Summary | null>(null)
  const [inc, setInc] = useState<Incentive[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [printing, setPrinting] = useState<Slip | null>(null)
  const [printLines, setPrintLines] = useState<Line[]>([])
  const [tab, setTab] = useState<'all' | 'paid' | 'pending'>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const [lKind, setLKind] = useState('earning')
  const [lLabel, setLLabel] = useState('')
  const [lAmount, setLAmount] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('Bank transfer')
  const [payRef, setPayRef] = useState('')

  const run = useMemo(() => runs.find((r) => r.id === pick) ?? null, [runs, pick])
  const isDraft = run?.state === 'Draft'
  const isApproved = run?.state === 'Approved'
  const step = stepOf(run)

  const loadRuns = useCallback(async () => {
    const { data } = await supabase.rpc('payroll_list', { p_year: year })
    const rows = (data ?? []) as unknown as Run[]
    setRuns(rows)
    setPick((p) => (p && rows.some((r) => r.id === p) ? p : rows[0]?.id ?? null))
  }, [year])

  const loadSlips = useCallback(async () => {
    if (!pick) { setSlips([]); setSum(null); setInc([]); return }
    const month = runs.find((r) => r.id === pick)?.month
    const [s, m, i] = await Promise.all([
      supabase.rpc('payslips_of', { p_run: pick }),
      supabase.rpc('payroll_summary', { p_run: pick }),
      month ? supabase.rpc('incentive_board', { p_month: month })
            : Promise.resolve({ data: [] }),
    ])
    setSlips((s.data ?? []) as unknown as Slip[])
    setSum((m.data ?? null) as unknown as Summary | null)
    setInc((i.data ?? []) as unknown as Incentive[])
  }, [pick, runs])

  useEffect(() => { loadRuns() }, [loadRuns])
  useEffect(() => { loadSlips() }, [loadSlips])

  const loadLines = useCallback(async (slip: string) => {
    const { data } = await supabase.rpc('payslip_lines_of', { p_slip: slip })
    setLines((data ?? []) as unknown as Line[])
  }, [])

  async function call(fn: string, args: Record<string, unknown>, done?: () => void) {
    setBusy(true)
    setSaid(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) {
      setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not done.' })
      return false
    }
    done?.()
    loadRuns()
    loadSlips()
    return true
  }

  async function openMonth() {
    const m = `${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
    await call('payroll_open', { p_month: m })
  }

  async function openPrint(s: Slip) {
    const { data } = await supabase.rpc('payslip_lines_of', { p_slip: s.id })
    setPrintLines((data ?? []) as unknown as Line[])
    setPrinting(s)
  }

  function csv() {
    const head = [
      'Code', 'Name', 'Branch', 'Monthly', 'Days', 'Worked', 'Off', 'Paid leave',
      'Unpaid leave', 'Absent', 'Absent charged', 'Late', 'Late half days',
      'Additions', 'Day cut', 'Fixed cut', 'Other cut', 'Net', 'Not taken',
      'State', 'Paid', 'Paid on', 'Mode', 'Reference',
    ]
    const rows = slips.map((s) => [
      s.emp_code, s.full_name, s.branch ?? '', s.monthly, s.days_in_month,
      s.worked_days, s.off_days, s.paid_leave_days, s.unpaid_leave_days,
      s.absent_days, s.absent_charged, s.late_count, s.late_half_days,
      s.earnings, s.day_cut, s.fixed_cut, s.other_cut, s.net, s.not_taken,
      s.state, s.paid_amount, s.paid_on ?? '', s.pay_mode ?? '', s.pay_ref ?? '',
    ])
    // The BOM is what makes Excel open Gujarati names as Gujarati rather
    // than as mojibake, the same reason the attendance export carries one.
    const text = '﻿' + [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${run?.month ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── what the charts draw ──────────────────────────────────────
  const months = useMemo(
    () => [...runs].reverse().slice(-6).map((r) => ({
      month: monthShort(r.month),
      Earned: Number(r.gross),
      Added: Number(r.additions),
      Deducted: Number(r.deductions),
    })),
    [runs],
  )

  const donut = useMemo(() => {
    if (!sum?.ok) return []
    return [
      { name: 'Salary', value: Number(sum.gross ?? 0), fill: C.gross },
      { name: 'Added', value: Number(sum.additions ?? 0), fill: C.added },
      { name: 'Deducted',
        value: Number(sum.day_cut ?? 0) + Number(sum.fixed_cut ?? 0) + Number(sum.other_cut ?? 0),
        fill: C.cut },
    ].filter((x) => x.value > 0)
  }, [sum])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return slips.filter((s) => {
      if (tab === 'paid' && s.state !== 'Paid') return false
      if (tab === 'pending' && s.state === 'Paid') return false
      if (!t) return true
      return `${s.full_name} ${s.emp_code} ${s.branch ?? ''}`.toLowerCase().includes(t)
    })
  }, [slips, tab, q])

  const paidPeople = slips.filter((s) => s.state === 'Paid').length

  return (
    <div className="mx-auto max-w-6xl">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .slip, .slip * { color: #000 !important; background: #fff !important; border-color: #ccc !important; }
        }
      `}</style>

      <header className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Payroll</h1>
          <p className="mt-1 text-sm text-gray-500">
            Open a month, build it from the register, have it checked, pay it.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[#242424] bg-[#141414] p-1">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Previous year">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[4rem] text-center text-sm tabular-nums">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Next year">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      {said && (
        <p className={`no-print mb-4 rounded-xl border px-4 py-2.5 text-sm ${
          said.kind === 'ok'
            ? 'border-green-900/40 bg-green-950/15 text-green-300'
            : 'border-red-900/40 bg-red-950/15 text-red-300'}`}>
          {said.text}
        </p>
      )}

      {/* ── which month ──────────────────────────────────────── */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => { setPick(r.id); setOpen(null) }}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors ${
              pick === r.id
                ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
                : 'border-[#242424] bg-[#141414] text-gray-300 hover:bg-[#1a1a1a]'}`}
          >
            {monthName(r.month)}
            <Chip state={r.state} />
          </button>
        ))}
        <button
          onClick={openMonth}
          className={`${btn} border border-dashed border-[#2f2f2f] text-gray-400 hover:bg-[#1a1a1a] hover:text-white`}
        >
          <Plus size={15} /> This month
        </button>
      </div>

      {!run ? (
        <p className="py-20 text-center text-sm text-gray-600">
          No payroll for {year} yet. Open this month to start one.
        </p>
      ) : (
        <>
          {/* ── the four figures ───────────────────────────────── */}
          <section className="no-print mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile icon={Users} label="People" value={String(sum?.people ?? 0)}
                  note={`${monthName(run.month)}`} />
            <Tile icon={IndianRupee} label="Net to pay" value={short(sum?.net)}
                  note={rupees(sum?.net)} tone="text-orange-400" />
            <Tile icon={Check} label="Paid" value={String(paidPeople)}
                  note={sum?.people ? `${Math.round((paidPeople / sum.people) * 100)}% of the month` : undefined}
                  tone="text-green-300" />
            <Tile icon={Clock} label="Still owed" value={short(sum?.pending)}
                  note={`${run.unpaid_people} people`}
                  tone={Number(sum?.pending) > 0 ? 'text-amber-400' : undefined} />
          </section>

          {/* ── where the month is ─────────────────────────────── */}
          <section className="no-print mt-4 rounded-2xl border border-[#242424] bg-[#141414] px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ${
                    i < step ? 'bg-green-500/15 text-green-300'
                    : i === step ? 'bg-orange-500 text-white'
                    : 'bg-[#1f1f1f] text-gray-600'}`}>
                    {i < step ? <Check size={13} /> : i + 1}
                  </span>
                  <span className={`text-sm ${
                    i === step ? 'font-medium text-orange-300' : i < step ? 'text-gray-300' : 'text-gray-600'}`}>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className={`mx-1 h-px w-8 ${i < step ? 'bg-green-500/40' : 'bg-[#242424]'}`} />
                  )}
                </div>
              ))}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {isDraft && (
                  <>
                    <button
                      onClick={() => call('payroll_build', { p_run: run.id },
                        () => setSaid({ kind: 'ok', text: 'Built from the register.' }))}
                      disabled={busy}
                      className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                      {run.built_at ? 'Build again' : 'Build'}
                    </button>
                    <button
                      onClick={() => call('payroll_submit', { p_run: run.id },
                        () => setSaid({ kind: 'ok', text: 'Sent for approval.' }))}
                      disabled={busy || !run.built_at}
                      className={`${btn} border border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a]`}
                    >
                      <Send size={15} /> Send for approval
                    </button>
                  </>
                )}

                {run.state === 'Waiting approval' && (
                  <>
                    <button
                      onClick={() => call('payroll_approve', { p_run: run.id },
                        () => setSaid({ kind: 'ok', text: 'Approved. The month is now shut.' }))}
                      disabled={busy}
                      className={`${btn} bg-green-600/90 text-white hover:bg-green-600`}
                    >
                      <Check size={15} /> Approve
                    </button>
                    <button
                      onClick={() => {
                        const why = window.prompt('What needs fixing?')
                        if (why && why.trim().length >= 3) {
                          call('payroll_send_back', { p_run: run.id, p_reason: why.trim() },
                            () => setSaid({ kind: 'ok', text: 'Sent back to draft.' }))
                        }
                      }}
                      disabled={busy}
                      className={`${btn} border border-[#3a2a2a] text-red-400 hover:bg-red-950/40`}
                    >
                      <X size={15} /> Send back
                    </button>
                  </>
                )}

                {isApproved && (
                  <>
                    <span className="flex items-center gap-2 rounded-xl border border-green-900/40 bg-green-950/15 px-3.5 py-2 text-sm text-green-300">
                      <Lock size={14} /> Approved
                      {run.approved_by_name && <span className="text-green-300/60">by {run.approved_by_name}</span>}
                    </span>
                    <button
                      onClick={() => {
                        const why = window.prompt('Why is this month being reopened?')
                        if (why && why.trim().length >= 3) {
                          call('payroll_reopen', { p_run: run.id, p_reason: why.trim() },
                            () => setSaid({ kind: 'ok', text: 'Reopened as a draft.' }))
                        }
                      }}
                      disabled={busy}
                      className={`${btn} border border-[#2a2a2a] text-gray-400 hover:bg-[#1a1a1a] hover:text-white`}
                    >
                      <RotateCcw size={15} /> Reopen
                    </button>
                  </>
                )}

                <button onClick={csv} disabled={slips.length === 0}
                        className={`${btn} border border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a] hover:text-white`}>
                  <Download size={15} /> CSV
                </button>
              </div>
            </div>

            {run.note && <p className="mt-3 text-xs text-gray-500">{run.note}</p>}
          </section>

          {(sum?.no_salary ?? 0) > 0 && (
            <p className="no-print mt-3 flex items-start gap-2 rounded-xl border border-amber-900/40 bg-amber-950/15 px-4 py-3 text-xs text-amber-200/90">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              {sum?.no_salary} {sum?.no_salary === 1 ? 'person has' : 'people have'} no salary
              on file, so their slip comes to nothing. Set it under Setup and build again.
            </p>
          )}

          {(sum?.not_taken ?? 0) > 0 && (
            <p className="no-print mt-3 flex items-start gap-2 rounded-xl border border-red-900/40 bg-red-950/15 px-4 py-3 text-xs text-red-200/90">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
              {rupees(sum?.not_taken)} of deductions could not be taken — somebody&rsquo;s
              absences came to more than their whole salary. Pay stops at nothing; what is
              left over is on their slip and is somebody&rsquo;s decision, not the system&rsquo;s.
            </p>
          )}

          {/* ── the year, and this month split up ──────────────── */}
          <div className="no-print mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title="Month by month" hint="last six" className="lg:col-span-2">
              <div className="h-60 p-4">
                {months.length === 0 ? (
                  <p className="grid h-full place-items-center text-sm text-gray-600">Nothing built yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={months} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="2 6" stroke={C.grid} vertical={false} />
                      <XAxis dataKey="month" stroke={C.axis} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={C.axis} fontSize={11} tickLine={false} axisLine={false}
                             width={54} tickFormatter={(v) => short(Number(v))} />
                      <Tooltip
                        cursor={{ fill: '#ffffff08' }}
                        contentStyle={{ background: '#17171a', border: '1px solid #2a2a2a',
                                        borderRadius: 12, fontSize: 12, padding: '8px 12px' }}
                        labelStyle={{ color: '#a1a1aa', marginBottom: 4 }}
                        formatter={(v) => rupees(Number(v))}
                      />
                      <Bar dataKey="Earned" stackId="a" fill={C.gross} radius={[0, 0, 3, 3]} />
                      <Bar dataKey="Added" stackId="a" fill={C.added} />
                      <Bar dataKey="Deducted" stackId="b" fill={C.cut} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>

            <Panel title="This month">
              <div className="relative h-60 p-4">
                {donut.length === 0 ? (
                  <p className="grid h-full place-items-center text-sm text-gray-600">Nothing built yet.</p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={donut} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
                          {donut.map((d) => <Cell key={d.name} fill={d.fill} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: '#17171a', border: '1px solid #2a2a2a',
                                          borderRadius: 12, fontSize: 12, padding: '8px 12px' }}
                          formatter={(v) => rupees(Number(v))}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-x-0 top-[44%] -translate-y-1/2 text-center">
                      <p className="text-lg font-semibold tabular-nums">{short(sum?.net)}</p>
                      <p className="text-[11px] text-gray-500">net</p>
                    </div>
                  </>
                )}
              </div>
              <ul className="space-y-1.5 border-t border-[#242424] px-5 py-3 text-xs">
                {donut.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.fill }} />
                    <span className="flex-1 text-gray-400">{d.name}</span>
                    <span className="tabular-nums text-gray-300">{rupees(d.value)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* ── what the sales people have earned ──────────────── */}
          {inc.length > 0 && (
            <Panel title="Sales incentive" hint="suggested — nothing is added until you add it"
                   className="no-print mt-4">
              <ul className="divide-y divide-[#1a1a1a]">
                {inc.map((p) => {
                  const slip = slips.find((s) => s.user_id === p.user_id)
                  return (
                    <li key={p.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                      <TrendingUp size={14} className="shrink-0 text-gray-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{p.full_name}</p>
                        <p className="text-xs text-gray-500">
                          {rupees(p.service_sold)} service · {rupees(p.product_sold)} product
                          {Number(p.unmarked) > 0 && (
                            <span className="text-amber-300/80">
                              {' '}· {rupees(p.unmarked)} not marked service or product
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-600">
                          {p.target === null
                            ? 'No target set for this month'
                            : `${rupees(p.sold)} of ${rupees(p.target)} target`}
                          {p.target_met === false && ' — not reached'}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        Number(p.payable) > 0 ? 'text-green-300' : 'text-gray-600'}`}>
                        {rupees(p.amount)}
                      </span>
                      {isDraft && slip && Number(p.payable) > 0 && (
                        <button
                          onClick={async () => {
                            const okDone = await call('payslip_line_add', {
                              p_slip: slip.id, p_kind: 'earning',
                              p_label: 'Sales incentive', p_amount: Number(p.payable),
                            })
                            if (okDone) setSaid({ kind: 'ok', text: 'Added to the payslip.' })
                          }}
                          disabled={busy}
                          className={`${btn} border border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a]`}
                        >
                          <Plus size={14} /> Add
                        </button>
                      )}
                      {Number(p.payable) === 0 && Number(p.amount) > 0 && (
                        <span className="text-xs text-amber-300/80">held — target not met</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}

          {/* ── the slips ──────────────────────────────────────── */}
          <Panel
            title={monthName(run.month)}
            hint={`${slips.length} payslips`}
            className="no-print mt-4"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-[#242424] p-0.5">
                  {([['all', `All (${slips.length})`],
                     ['paid', `Paid (${paidPeople})`],
                     ['pending', `Pending (${slips.length - paidPeople})`]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setTab(k)}
                      className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                        tab === k ? 'bg-orange-500/10 text-orange-300' : 'text-gray-500 hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="Name or code"
                  className="w-40 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-1.5 text-xs text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
              </div>
            }
          >
            {shown.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-gray-600">
                {slips.length === 0
                  ? 'Nothing built yet. Press Build to work the month out from the register.'
                  : 'Nothing matches that.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#1a1a1a]">
                {shown.map((s) => (
                  <li key={s.id}>
                    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-[#181818]">
                      <button
                        onClick={() => navigate(`${base}/payroll/${s.user_id}`)}
                        title="Open this person's payroll"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-xs font-semibold text-gray-300">
                          {s.full_name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{s.full_name}</span>
                          <span className="block font-mono text-[11px] text-gray-500">
                            {s.emp_code}{s.branch && ` · ${s.branch}`}
                            {s.designation && ` · ${s.designation}`}
                          </span>
                        </span>
                      </button>

                      <span className="hidden text-xs tabular-nums text-gray-500 sm:block">
                        {Number(s.worked_days)} worked
                        {Number(s.unpaid_leave_days) > 0 && ` · ${Number(s.unpaid_leave_days)} unpaid`}
                        {Number(s.absent_days) > 0 && ` · ${Number(s.absent_days)} absent`}
                        {Number(s.late_count) > 0 && ` · ${s.late_count} late`}
                      </span>

                      <button
                        onClick={() => {
                          const next = open === s.id ? null : s.id
                          setOpen(next)
                          if (next) loadLines(s.id)
                        }}
                        title="The figures behind this"
                        className="w-28 text-right text-sm font-semibold tabular-nums hover:text-orange-300"
                      >
                        {rupees(s.net)}
                      </button>
                      <Chip state={s.state} />
                      <button
                        onClick={() => openPrint(s)}
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-[#1f1f1f] hover:text-white"
                        aria-label={`Payslip for ${s.full_name}`}
                      >
                        <FileText size={14} />
                      </button>
                    </div>

                    {open === s.id && (
                      <div className="border-t border-[#1f1f1f] bg-[#111] px-5 py-4">
                        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                          <div className="flex justify-between">
                            <dt className="text-gray-400">Salary for the month</dt>
                            <dd className="tabular-nums">{rupees(s.monthly)}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-gray-400">A day ({s.days_in_month} days in the month)</dt>
                            <dd className="tabular-nums text-gray-400">{rupees(s.day_rate)}</dd>
                          </div>
                          {Number(s.earnings) > 0 && (
                            <div className="flex justify-between text-green-300">
                              <dt>Added</dt>
                              <dd className="tabular-nums">+{rupees(s.earnings)}</dd>
                            </div>
                          )}
                          <div className="flex justify-between text-red-300">
                            <dt>Days not paid for</dt>
                            <dd className="tabular-nums">−{rupees(s.day_cut)}</dd>
                          </div>
                          {Number(s.fixed_cut) > 0 && (
                            <div className="flex justify-between text-red-300">
                              <dt>Every month</dt>
                              <dd className="tabular-nums">−{rupees(s.fixed_cut)}</dd>
                            </div>
                          )}
                          {Number(s.other_cut) > 0 && (
                            <div className="flex justify-between text-red-300">
                              <dt>Taken off this month</dt>
                              <dd className="tabular-nums">−{rupees(s.other_cut)}</dd>
                            </div>
                          )}
                          <div className="flex justify-between border-t border-[#242424] pt-1.5 font-semibold sm:col-span-2">
                            <dt>Net</dt>
                            <dd className="tabular-nums">{rupees(s.net)}</dd>
                          </div>
                          {Number(s.not_taken) > 0 && (
                            <p className="text-xs text-red-300/80 sm:col-span-2">
                              {rupees(s.not_taken)} of deductions could not be taken — it came to
                              more than the whole salary.
                            </p>
                          )}
                        </dl>

                        <p className="mt-3 text-xs text-gray-600">
                          {Number(s.worked_days)} worked · {Number(s.off_days)} off ·{' '}
                          {Number(s.paid_leave_days)} paid leave ·{' '}
                          {Number(s.unpaid_leave_days)} unpaid leave ·{' '}
                          {Number(s.absent_days)} absent (charged {Number(s.absent_charged)}) ·{' '}
                          {s.late_count} late{Number(s.late_half_days) > 0 &&
                            `, ${Number(s.late_half_days)} half day off for it`}
                          {Number(s.not_yet_days) > 0 && ` · ${Number(s.not_yet_days)} still to come`}
                        </p>

                        {lines.length > 0 && (
                          <ul className="mt-4 divide-y divide-[#1a1a1a] rounded-xl border border-[#242424]">
                            {lines.map((l) => (
                              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <span className={l.kind === 'earning' ? 'text-green-300' : 'text-red-300'}>
                                  {l.kind === 'earning' ? '+' : '−'}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                                <span className="tabular-nums">{rupees(l.amount)}</span>
                                {isDraft && (
                                  <button
                                    onClick={() => call('payslip_line_drop', { p_id: l.id },
                                      () => loadLines(s.id))}
                                    className="rounded-lg p-1 text-gray-500 hover:bg-red-950/40 hover:text-red-400"
                                    aria-label={`Remove ${l.label}`}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isDraft && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <select value={lKind} onChange={(e) => setLKind(e.target.value)}
                                    className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                              <option value="earning">Add</option>
                              <option value="deduction">Deduct</option>
                            </select>
                            <input
                              value={lLabel} onChange={(e) => setLLabel(e.target.value)}
                              placeholder="Service incentive, bonus, advance…"
                              className="min-w-[12rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                            />
                            <input
                              type="number" min="1" value={lAmount}
                              onChange={(e) => setLAmount(e.target.value)}
                              placeholder="0"
                              className="w-28 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                            />
                            <button
                              onClick={async () => {
                                const okDone = await call('payslip_line_add', {
                                  p_slip: s.id, p_kind: lKind,
                                  p_label: lLabel.trim(), p_amount: Number(lAmount),
                                })
                                if (okDone) { setLLabel(''); setLAmount(''); loadLines(s.id) }
                              }}
                              disabled={busy || lLabel.trim().length < 2 || Number(lAmount) <= 0}
                              className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
                            >
                              <Plus size={15} /> Add
                            </button>
                          </div>
                        )}

                        {isApproved && s.state !== 'Paid' && (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#242424] pt-4">
                            <input
                              type="number" min="1" value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              placeholder={String(Number(s.net) - Number(s.paid_amount))}
                              className="w-32 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                            />
                            <select value={payMode} onChange={(e) => setPayMode(e.target.value)}
                                    className="rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                              <option>Bank transfer</option>
                              <option>UPI</option>
                              <option>Cash</option>
                              <option>Cheque</option>
                            </select>
                            <input
                              value={payRef} onChange={(e) => setPayRef(e.target.value)}
                              placeholder="Reference"
                              className="min-w-[10rem] flex-1 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                            />
                            <button
                              onClick={async () => {
                                const amt = Number(payAmount) || (Number(s.net) - Number(s.paid_amount))
                                const okDone = await call('payslip_pay', {
                                  p_slip: s.id, p_amount: amt,
                                  p_mode: payMode, p_ref: payRef.trim() || null, p_on: null,
                                })
                                if (okDone) { setPayAmount(''); setPayRef('') }
                              }}
                              disabled={busy}
                              className={`${btn} bg-green-600/90 text-white hover:bg-green-600`}
                            >
                              <IndianRupee size={15} /> Record payment
                            </button>
                          </div>
                        )}

                        {Number(s.paid_amount) > 0 && (
                          <p className="mt-3 text-xs text-gray-500">
                            {rupees(s.paid_amount)} paid
                            {s.paid_on && ` on ${new Date(s.paid_on + 'T00:00:00').toLocaleDateString('en-IN')}`}
                            {s.pay_mode && ` · ${s.pay_mode}`}
                            {s.pay_ref && ` · ${s.pay_ref}`}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {/* ── one payslip, ready for paper ───────────────────────── */}
      {printing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPrinting(null)}>
          <div className="no-print absolute inset-0 bg-black/70" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="slip relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#242424] bg-[#121212] p-6"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">JK Branding (India) Private Limited</p>
                <p className="text-xs text-gray-500">
                  Payslip for {run && monthName(run.month)}
                </p>
              </div>
              <div className="no-print flex gap-2">
                <button onClick={() => window.print()} className={`${btn} border border-[#2a2a2a] text-gray-300 hover:bg-[#1a1a1a]`}>
                  <Printer size={14} /> Print / PDF
                </button>
                <button onClick={() => setPrinting(null)} aria-label="Close" className="rounded-lg p-2 text-gray-400 hover:bg-[#1f1f1f] hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[#242424] px-4 py-3">
              <p className="font-medium">{printing.full_name}</p>
              <p className="text-xs text-gray-500">
                {printing.emp_code}
                {printing.designation && ` · ${printing.designation}`}
                {printing.branch && ` · ${printing.branch}`}
              </p>
            </div>

            <div className="divide-y divide-[#1f1f1f]">
              <Row k="Salary for the month" v={rupees(printing.monthly)} />
              <Row k={`A day (${printing.days_in_month} days in the month)`} v={rupees(printing.day_rate)} muted />
              {printLines.filter((l) => l.kind === 'earning').map((l) => (
                <Row key={l.id} k={l.label} v={'+' + rupees(l.amount)} tone="add" />
              ))}
              {Number(printing.day_cut) > 0 && (
                <Row k="Days not paid for" v={'−' + rupees(printing.day_cut)} tone="cut" />
              )}
              {Number(printing.fixed_cut) > 0 && (
                <Row k="Every month" v={'−' + rupees(printing.fixed_cut)} tone="cut" />
              )}
              {printLines.filter((l) => l.kind === 'deduction').map((l) => (
                <Row key={l.id} k={l.label} v={'−' + rupees(l.amount)} tone="cut" />
              ))}
              <div className="flex items-baseline justify-between gap-4 pt-3">
                <span className="font-semibold">Net</span>
                <span className="text-lg font-semibold tabular-nums">{rupees(printing.net)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#242424] px-4 py-3">
              <p className="text-xs text-gray-500">The month</p>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                {Number(printing.worked_days)} days worked · {Number(printing.off_days)} weekly offs
                and holidays · {Number(printing.paid_leave_days)} paid leave
                {Number(printing.unpaid_leave_days) > 0 && ` · ${Number(printing.unpaid_leave_days)} unpaid leave`}
                {Number(printing.absent_days) > 0 &&
                  ` · ${Number(printing.absent_days)} away without approved leave, charged as ${Number(printing.absent_charged)} days`}
                {printing.late_count > 0 && ` · ${printing.late_count} late arrivals`}
                {Number(printing.late_half_days) > 0 && `, costing ${Number(printing.late_half_days)} of a day`}
              </p>
            </div>

            {printing.paid_on && (
              <p className="mt-3 text-xs text-gray-500">
                Paid on {new Date(printing.paid_on + 'T00:00:00').toLocaleDateString('en-IN')}
                {printing.pay_mode && ` · ${printing.pay_mode}`}
                {printing.pay_ref && ` · ${printing.pay_ref}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v, tone, muted }: {
  k: string; v: string; tone?: 'add' | 'cut'; muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className={`text-sm ${
        tone === 'cut' ? 'text-red-300' : tone === 'add' ? 'text-green-300'
        : muted ? 'text-gray-500' : 'text-gray-400'}`}>
        {k}
      </span>
      <span className={`tabular-nums ${
        tone === 'cut' ? 'text-red-300' : tone === 'add' ? 'text-green-300'
        : muted ? 'text-gray-500' : ''}`}>
        {v}
      </span>
    </div>
  )
}