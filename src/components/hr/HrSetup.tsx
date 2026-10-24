// src/components/hr/HrSetup.tsx
//
// Salary, holidays, and the rules. Route: /hr/setup
//
// Three things that have been decided and written into the database for
// weeks with no way to reach them. Every screen in the leave module has
// been showing ₹0.00 because nobody could type a salary anywhere; leave
// has been eating paid days for Diwali because no holiday was ever
// entered; and the absence penalty has been fixed at 2× with its own
// setting sitting one function call away.
//
// Put on ONE page on purpose. These are the things somebody sets up
// once and then comes back to three times a year — a page each would
// mean three sidebar rows that are empty of meaning most of the time.
//
// What each person may do is answered by the database (rules_now()),
// not worked out from a role here. A card nobody may use is not shown
// at all rather than shown and refused.

import { useCallback, useEffect, useState } from 'react'
import {
  Wallet, CalendarDays, SlidersHorizontal, Plus, Trash2, Check, Loader2,
  AlertTriangle, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Rules = {
  absent_penalty: number
  absence_from: string
  late_allowed: number
  late_resets: string
  half_day_on_late: boolean
  can_edit: boolean
  can_see_pay: boolean
  can_set_pay: boolean
}

type PayRow = {
  user_id: string; emp_code: string; full_name: string
  branch: string | null; designation: string | null
  monthly: number | null; day_rate: number | null; updated_at: string | null
}

type Holiday = {
  id: string; holiday_on: string; name: string
  branch_id: string | null; branch: string | null
}

type Branch = { id: string; name: string }

const rupees = (n: number) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })

const inputCls =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none ' +
  '[color-scheme:dark]'

function Card({
  icon: Icon, title, hint, children,
}: { icon: typeof Wallet; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#242424] px-5 py-3.5">
        <Icon size={15} className="text-gray-500" />
        <h2 className="text-sm font-medium">{title}</h2>
        {hint && <span className="text-xs text-gray-600">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export default function HrSetup() {
  const [rules, setRules] = useState<Rules | null>(null)
  const [pay, setPay] = useState<PayRow[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [year, setYear] = useState(new Date().getFullYear())

  const [editing, setEditing] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const [hDate, setHDate] = useState('')
  const [hName, setHName] = useState('')
  const [hBranch, setHBranch] = useState('')

  const [penalty, setPenalty] = useState('2')
  const [from, setFrom] = useState('')
  const [late, setLate] = useState('3')

  const load = useCallback(async () => {
    const [r, p, h, b] = await Promise.all([
      supabase.rpc('rules_now'),
      supabase.rpc('pay_list'),
      supabase.rpc('holidays_list', { p_year: year }),
      supabase.from('branches').select('id, name').order('name'),
    ])
    const rr = (r.data ?? null) as unknown as Rules | null
    setRules(rr)
    setPay((p.data ?? []) as unknown as PayRow[])
    setHolidays((h.data ?? []) as unknown as Holiday[])
    setBranches((b.data ?? []) as unknown as Branch[])
    if (rr) {
      setPenalty(String(Number(rr.absent_penalty)))
      setFrom(rr.absence_from)
      setLate(String(rr.late_allowed))
    }
  }, [year])

  useEffect(() => { load() }, [load])

  async function savePay(id: string) {
    const { data, error } = await supabase.rpc('pay_set', {
      p_user: id, p_monthly: Number(amount),
    })
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    setSaid({ kind: 'ok', text: 'Saved.' })
    setEditing(null)
    load()
  }

  async function addHoliday() {
    const { data, error } = await supabase.rpc('holiday_set', {
      p_date: hDate, p_name: hName.trim(), p_branch: hBranch || null,
    })
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    setHName('')
    setSaid(null)
    load()
  }

  async function dropHoliday(id: string) {
    await supabase.rpc('holiday_drop', { p_id: id })
    load()
  }

  async function saveRule(fn: string, args: Record<string, unknown>) {
    const { data, error } = await supabase.rpc(fn, args)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    setSaid({ kind: 'ok', text: 'Saved.' })
    load()
  }

  const missing = pay.filter((p) => p.monthly === null).length

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-2">
        <h1 className="text-xl font-semibold">Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Salaries, holidays and the attendance rules.
        </p>
      </header>

      {said && (
        <p className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${
          said.kind === 'ok'
            ? 'border-green-900/40 bg-green-950/15 text-green-300'
            : 'border-red-900/40 bg-red-950/15 text-red-300'}`}>
          {said.text}
        </p>
      )}

      {/* ── salary ───────────────────────────────────────────── */}
      {rules?.can_see_pay && (
        <Card icon={Wallet} title="Salary" hint={`${pay.length} people`}>
          {missing > 0 && (
            <p className="flex items-start gap-2 border-b border-amber-900/30 bg-amber-950/15 px-5 py-3 text-xs text-amber-200/90">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
              {missing} {missing === 1 ? 'person has' : 'people have'} no salary on file. Until
              one is set, their leave and their payslip both work out to zero —
              they are at the top of the list.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f1f1f] text-left text-xs text-gray-500">
                  <th className="px-5 py-2.5 font-normal">Name</th>
                  <th className="px-3 py-2.5 font-normal">Branch</th>
                  <th className="px-3 py-2.5 text-right font-normal">A month</th>
                  <th className="px-3 py-2.5 text-right font-normal">A day</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a1a]">
                {pay.map((p) => (
                  <tr key={p.user_id} className="transition-colors hover:bg-[#181818]">
                    <td className="px-5 py-3">
                      <p className="font-medium">{p.full_name}</p>
                      <p className="font-mono text-[11px] text-gray-500">
                        {p.emp_code}{p.designation && ` · ${p.designation}`}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-gray-400">{p.branch ?? '—'}</td>

                    {editing === p.user_id ? (
                      <td colSpan={3} className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <input
                            type="number" min="0" step="500" autoFocus
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-36 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                          />
                          <button
                            onClick={() => savePay(p.user_id)}
                            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className={`px-3 py-3 text-right tabular-nums ${
                          p.monthly === null ? 'text-amber-400' : 'text-gray-200'}`}>
                          {p.monthly === null ? 'not set' : rupees(p.monthly)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                          {p.day_rate === null ? '—' : rupees(p.day_rate)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {rules.can_set_pay && (
                            <button
                              onClick={() => {
                                setEditing(p.user_id)
                                setAmount(p.monthly === null ? '' : String(p.monthly))
                              }}
                              className="rounded-lg border border-[#2a2a2a] px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-[#1f1f1f] hover:text-white"
                            >
                              {p.monthly === null ? 'Set' : 'Change'}
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-[#242424] px-5 py-3 text-xs text-gray-600">
            A day is the month&rsquo;s salary divided by the days that month actually
            has — January and February are not the same. You cannot set your own.
          </p>
        </Card>
      )}

      {/* ── holidays ─────────────────────────────────────────── */}
      <Card icon={CalendarDays} title="Holidays">
        <div className="flex items-center gap-1 border-b border-[#242424] px-5 py-2.5">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Previous year">
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[4rem] text-center text-sm tabular-nums">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Next year">
            <ChevronRight size={15} />
          </button>
        </div>

        {holidays.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-600">
            Nothing set for {year}. Leave taken on these days still eats paid days
            until they are here.
          </p>
        ) : (
          <ul className="divide-y divide-[#1a1a1a]">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-gray-400">{day(h.holiday_on)}</span>
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="text-xs text-gray-500">
                  {h.branch ?? 'every branch'}
                </span>
                {rules?.can_edit && (
                  <button
                    onClick={() => dropHoliday(h.id)}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-950/40 hover:text-red-400"
                    aria-label={`Remove ${h.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {rules?.can_edit && (
          <div className="grid gap-3 border-t border-[#242424] p-5 sm:grid-cols-4">
            <input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} className={inputCls} />
            <input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="What the holiday is" className={inputCls} />
            <select value={hBranch} onChange={(e) => setHBranch(e.target.value)} className={inputCls}>
              <option value="">Every branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button
              onClick={addHoliday}
              disabled={!hDate || hName.trim().length < 2}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={15} /> Add
            </button>
          </div>
        )}
      </Card>

      {/* ── the rules ────────────────────────────────────────── */}
      {rules && (
        <Card icon={SlidersHorizontal} title="Rules">
          {!rules.can_edit ? (
            <p className="px-5 py-8 text-center text-sm text-gray-600">
              {Number(rules.absent_penalty)}× pay for a day away without approved leave,
              counted from {day(rules.absence_from)}. {rules.late_allowed} late arrivals
              allowed each {rules.late_resets}. Changing these is not switched on for you.
            </p>
          ) : (
            <div className="divide-y divide-[#1f1f1f]">
              <div className="flex flex-wrap items-end gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">A day away without approved leave</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    How many days of pay it costs. Asking and not waiting for the yes
                    counts the same as not asking.
                  </p>
                </div>
                <input
                  type="number" min="1" max="5" step="0.5"
                  value={penalty} onChange={(e) => setPenalty(e.target.value)}
                  className="w-24 rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => saveRule('absent_penalty_set', { p_times: Number(penalty) })}
                  className="rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Check size={14} className="mr-1 inline" /> Save
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">Count absences from</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Nothing before this date is ever counted. It is the day the register
                    started running — move it back only if you mean to.
                  </p>
                </div>
                <input
                  type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="w-44 rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white [color-scheme:dark] focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => saveRule('absence_from_set', { p_date: from })}
                  className="rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Check size={14} className="mr-1 inline" /> Save
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">Late arrivals allowed</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    The one after this is a half day. Resets every {rules.late_resets}.
                  </p>
                </div>
                <input
                  type="number" min="0" max="31"
                  value={late} onChange={(e) => setLate(e.target.value)}
                  className="w-24 rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={() => saveRule('late_rule_set', { p_allowed: Number(late) })}
                  className="rounded-xl border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                >
                  <Check size={14} className="mr-1 inline" /> Save
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {!rules && (
        <p className="py-16 text-center text-sm text-gray-600">
          <Loader2 size={16} className="mr-2 inline animate-spin" /> One moment…
        </p>
      )}
    </div>
  )
}