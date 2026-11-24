// src/components/hr/HrSetup.tsx
//
// Attendance setup: shift timings and the rules. Route: /hr/setup
//
// Holidays and salaries used to live here too. Holidays moved to the
// leave page (components/leave/HolidaysCard.tsx), next to the month they
// affect; salaries to the payroll page (components/payroll/SalariesCard.tsx),
// where a missing one gets noticed.
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
  Wallet, SlidersHorizontal, Check, Loader2,
  Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'

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

type Shift = {
  branch_id: string
  branch: string
  shift_in: string       // "HH:MM:SS"
  shift_out: string
  grace_minutes: number
  week_off: number       // 0 = Sunday
  lunch_from: string
  lunch_to: string
  lunch_minutes: number
  ot_after_minutes: number
  updated_at: string | null
  updated_by: string | null
  can_edit: boolean
}

// The database keeps times as "HH:MM:SS"; a time input wants "HH:MM".
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

// A labelled time field. The browser's own time picker is fine here —
// unlike a date, a clock reads the same everywhere and a 24-hour field
// is clearer for a shift than a calendar would be. color-scheme:dark
// keeps its popup on the dark page.
function Clk({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-400">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white [color-scheme:dark] focus:border-orange-500 focus:outline-none"
      />
    </label>
  )
}

function Num({
  label, hint, value, onChange,
}: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-gray-400">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
      />
      {hint && <span className="mt-1 block text-[11px] text-gray-600">{hint}</span>}
    </label>
  )
}

export default function HrSetup() {
  const [rules, setRules] = useState<Rules | null>(null)

  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const [penalty, setPenalty] = useState('2')
  const [from, setFrom] = useState('')
  const [late, setLate] = useState('3')

  // Shift timings, per branch. `shiftBranch` is which branch is open in
  // the card; `draft` is the editable copy of that branch's row, so the
  // list keeps showing the saved times until Save lands.
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftBranch, setShiftBranch] = useState<string>('')
  const [draft, setDraft] = useState<Shift | null>(null)
  const [savingShift, setSavingShift] = useState(false)

  const load = useCallback(async () => {
    const [r, sh] = await Promise.all([
      supabase.rpc('rules_now'),
      supabase.rpc('shifts_list'),
    ])
    const rr = (r.data ?? null) as unknown as Rules | null
    setRules(rr)
    const shiftRows = (sh.data ?? []) as unknown as Shift[]
    setShifts(shiftRows)
    // Keep whatever branch is open open across a reload, else the first.
    setShiftBranch((cur) => cur || shiftRows[0]?.branch_id || '')
    if (rr) {
      setPenalty(String(Number(rr.absent_penalty)))
      setFrom(rr.absence_from)
      setLate(String(rr.late_allowed))
    }
  }, [])

  useEffect(() => { load() }, [load])

  // When the branch in the card changes (or the data reloads), copy that
  // branch's saved row into the editable draft. Done in an effect rather
  // than on the dropdown's onChange so a Save that reloads the list also
  // refreshes what the form shows.
  useEffect(() => {
    const row = shifts.find((s) => s.branch_id === shiftBranch)
    setDraft(row ? { ...row } : null)
  }, [shiftBranch, shifts])

  async function saveShift() {
    if (!draft) return
    setSavingShift(true)
    setSaid(null)
    const { data, error } = await supabase.rpc('shift_set', {
      p_branch: draft.branch_id,
      p_in: hm(draft.shift_in),
      p_out: hm(draft.shift_out),
      p_grace: Number(draft.grace_minutes) || 0,
      p_week_off: Number(draft.week_off) || 0,
      p_lunch_from: hm(draft.lunch_from),
      p_lunch_to: hm(draft.lunch_to),
      p_lunch_min: Number(draft.lunch_minutes) || 0,
      p_ot_after: Number(draft.ot_after_minutes) || 0,
    })
    setSavingShift(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) {
      return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    }
    setSaid({ kind: 'ok', text: `${draft.branch} timings saved.` })
    load()
  }

  async function saveRule(fn: string, args: Record<string, unknown>) {
    const { data, error } = await supabase.rpc(fn, args)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    setSaid({ kind: 'ok', text: 'Saved.' })
    load()
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-2">
        <h1 className="text-xl font-semibold">Attendance setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Shift timings and the attendance rules. Holidays are on the Leave page, salaries on Payroll.
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

      {/* ── shift timings, per branch ────────────────────────── */}
      <Card
        icon={Clock}
        title="Shift timings"
        hint="each branch, its own hours"
      >
        {/* Branch picker. Every branch is here whether or not it has a
            saved row — a branch with none shows the 9–6 defaults, ready
            to be set, rather than being missing. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#242424] px-5 py-3.5">
          {shifts.map((s) => (
            <button
              key={s.branch_id}
              onClick={() => setShiftBranch(s.branch_id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                shiftBranch === s.branch_id
                  ? 'bg-orange-500 font-medium text-black'
                  : 'bg-[#1f1f1f] text-gray-300 hover:bg-[#262626]'
              }`}
            >
              {s.branch}
            </button>
          ))}
        </div>

        {!draft ? (
          <p className="px-5 py-8 text-center text-sm text-gray-600">
            {shifts.length === 0 ? 'No branch to set up yet.' : 'Pick a branch.'}
          </p>
        ) : !draft.can_edit ? (
          <div className="px-5 py-5 text-sm text-gray-400">
            <p>
              {draft.branch}: {hm(draft.shift_in)}–{hm(draft.shift_out)}, lunch{' '}
              {hm(draft.lunch_from)}–{hm(draft.lunch_to)} ({draft.lunch_minutes} min off),
              {' '}{draft.grace_minutes} min grace, overtime after {draft.ot_after_minutes} min,
              {' '}{WEEKDAYS[draft.week_off]} off.
            </p>
            <p className="mt-2 text-xs text-gray-600">Changing these is not switched on for you.</p>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {/* Shift */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Clk
                label="Opens"
                value={hm(draft.shift_in)}
                onChange={(v) => setDraft({ ...draft, shift_in: v })}
              />
              <Clk
                label="Closes"
                value={hm(draft.shift_out)}
                onChange={(v) => setDraft({ ...draft, shift_out: v })}
              />
              <Num
                label="Grace (minutes)"
                hint="late only counts after this"
                value={draft.grace_minutes}
                onChange={(n) => setDraft({ ...draft, grace_minutes: n })}
              />
            </div>

            {/* Lunch */}
            <div className="rounded-xl border border-[#242424] bg-[#151515] p-4">
              <p className="text-sm font-medium text-white">Lunch</p>
              <p className="mt-0.5 text-xs text-gray-500">
                The window people take lunch in, and how long comes off the day. A longer
                lunch than this shows up on the register as a flag — it is never cut
                automatically.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Clk
                  label="From"
                  value={hm(draft.lunch_from)}
                  onChange={(v) => setDraft({ ...draft, lunch_from: v })}
                />
                <Clk
                  label="To"
                  value={hm(draft.lunch_to)}
                  onChange={(v) => setDraft({ ...draft, lunch_to: v })}
                />
                <Num
                  label="Deduction (minutes)"
                  value={draft.lunch_minutes}
                  onChange={(n) => setDraft({ ...draft, lunch_minutes: n })}
                />
              </div>
            </div>

            {/* Overtime and weekly off */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Num
                label="Overtime after (minutes past close)"
                hint="work past the close plus this counts as overtime, shown on its own"
                value={draft.ot_after_minutes}
                onChange={(n) => setDraft({ ...draft, ot_after_minutes: n })}
              />
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">Weekly off</label>
                <select
                  value={draft.week_off}
                  onChange={(e) => setDraft({ ...draft, week_off: Number(e.target.value) })}
                  className={inputCls}
                >
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveShift}
                disabled={savingShift}
                className="flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
              >
                {savingShift ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Save {draft.branch}
              </button>
              {draft.updated_by && (
                <span className="text-xs text-gray-600">
                  last set by {draft.updated_by}
                </span>
              )}
            </div>
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
                <div className="w-44">
                  <DateField
                    value={from}
                    onChange={(v) => setFrom(v ?? '')}
                    placeholder="dd mmm yyyy"
                  />
                </div>
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