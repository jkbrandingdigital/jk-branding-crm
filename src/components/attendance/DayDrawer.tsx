// src/components/attendance/DayDrawer.tsx
//
// One person, one day — opened from the register. What the scans say,
// what the day was worked out to be, and the two ways HR can change it.
//
// Corrections live here rather than behind a pencil on the row, because
// a correction is never a quick edit: it needs the day in front of you,
// the punches that made it, and a reason. A row with an edit icon invites
// changing a number; this invites looking first.

import { useCallback, useEffect, useState } from 'react'
import {
  X, Plus, CalendarDays, History, Clock, Coffee, LogIn, LogOut,
  CheckCircle2, AlertCircle, Loader2, ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { says } from './words'

type Scan = {
  id: string
  kind: string | null
  scanned_at: string
  entered_by: string | null
  entered_reason: string | null
  late_by_min: number | null
}

type Edit = {
  edited_at: string
  action: string
  reason: string
  was: Record<string, unknown> | null
  became: Record<string, unknown> | null
  by_name: string | null
}

export type DayPerson = {
  user_id: string
  emp_code: string
  full_name: string
  branch: string | null
  status: string
  check_in: string | null
  check_out: string | null
  minutes_worked: number
  lunch_minutes: number
  late_minutes: number
  is_late: boolean
}

const KINDS = ['In', 'Lunch out', 'Lunch in', 'Step out', 'Back', 'Out'] as const

const STATUSES = ['Present', 'Absent', 'Leave', 'Half day', 'Holiday', 'Weekly off', 'On hold'] as const

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '—'

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const longDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

const iconFor = (kind: string | null) =>
  kind === 'In' ? <LogIn size={13} />
  : kind === 'Out' ? <LogOut size={13} />
  : kind === 'Lunch out' || kind === 'Lunch in' ? <Coffee size={13} />
  : <Clock size={13} />

export default function DayDrawer({
  person, date, canEdit, onClose, onChanged,
}: {
  person: DayPerson
  date: string
  canEdit: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [scans, setScans] = useState<Scan[]>([])
  const [edits, setEdits] = useState<Edit[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<string>('In')
  const [time, setTime] = useState('09:00')
  const [why, setWhy] = useState('')

  const [status, setStatus] = useState(person.status === 'Not in yet' ? 'Absent' : person.status)
  const [statusWhy, setStatusWhy] = useState('')
  const [settingDay, setSettingDay] = useState(false)

  // The drawer slides in rather than appearing: a panel that arrives
  // instantly over the register reads as the page having changed, and the
  // person loses where they were.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 10)
    return () => window.clearTimeout(id)
  }, [])

  const close = () => {
    setShown(false)
    window.setTimeout(onClose, 200)
  }

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [s, h] = await Promise.all([
      supabase
        .from('attendance_scans')
        .select('id, kind, scanned_at, entered_by, entered_reason, late_by_min')
        .eq('user_id', person.user_id)
        .eq('work_date', date)
        .eq('ok', true)
        .order('scanned_at'),
      supabase.rpc('day_history', { p_user: person.user_id, p_date: date }),
    ])
    setScans((s.data ?? []) as unknown as Scan[])
    setEdits((h.data ?? []) as unknown as Edit[])
    setLoading(false)
  }, [person.user_id, date])

  useEffect(() => { load() }, [load])

  async function addPunch() {
    if (why.trim().length < 3) return setNote({ kind: 'bad', text: 'Say why this punch is being added.' })
    setBusy(true)
    const { data, error } = await supabase.rpc('add_missed_scan', {
      p_user: person.user_id, p_date: date, p_kind: kind, p_time: time, p_reason: why.trim(),
    })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setNote({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not added.' })
    setNote({ kind: 'ok', text: 'Punch added. The day has been worked out again.' })
    setWhy('')
    setAdding(false)
    load()
    onChanged()
  }

  async function saveStatus() {
    if (statusWhy.trim().length < 3) return setNote({ kind: 'bad', text: 'Say why the day is being changed.' })
    setBusy(true)
    const { data, error } = await supabase.rpc('set_day_status', {
      p_user: person.user_id, p_date: date, p_status: status, p_reason: statusWhy.trim(),
    })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setNote({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not changed.' })
    setNote({ kind: 'ok', text: `The day is now ${status}.` })
    setStatusWhy('')
    setSettingDay(false)
    load()
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={close}
      />

      <aside
        className={`relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#111] shadow-2xl transition-all duration-200 ease-out ${
          shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.97] opacity-0'
        }`}
      >
        {/* ── who and when ───────────────────────────────────────── */}
        <header className="flex items-start gap-3 border-b border-[#242424] bg-[#151515] px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-xs font-semibold text-gray-300">
            {person.full_name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{person.full_name}</p>
            <p className="text-xs text-gray-500">
              <span className="font-mono">{person.emp_code}</span>
              {person.branch && <> · {person.branch}</>}
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#1f1f1f] hover:text-white">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <p className="flex items-center gap-2 px-5 pt-4 text-xs text-gray-500">
            <CalendarDays size={13} /> {longDay(date)}
          </p>

          {note && (
            <div
              className={`mx-5 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                note.kind === 'ok'
                  ? 'border-green-900/70 bg-green-950/40 text-green-300'
                  : 'border-red-900/70 bg-red-950/40 text-red-300'
              }`}
            >
              {note.kind === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
              <span className="min-w-0 flex-1">{note.text}</span>
              <button onClick={() => setNote(null)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Dismiss">
                <X size={13} />
              </button>
            </div>
          )}

          {/* ── the day in four figures ──────────────────────────── */}
          <div className="mx-5 mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424]">
            <Fig label="In" value={clock(person.check_in)} />
            <Fig label="Out" value={clock(person.check_out)} />
            <Fig label="Worked" value={person.check_in ? hhmm(person.minutes_worked) : '—'} />
            <Fig
              label="Late"
              value={person.is_late ? `${person.late_minutes}m` : '—'}
              tone={person.is_late ? 'text-amber-400' : undefined}
            />
          </div>

          {/* ── the punches ──────────────────────────────────────── */}
          <section className="px-5 pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Punches</h3>

            {loading ? (
              <p className="py-6 text-center text-sm text-gray-500">Loading…</p>
            ) : scans.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#2a2a2a] px-4 py-6 text-center text-sm text-gray-500">
                No punches on this day.
              </p>
            ) : (
              <ol className="mt-3 space-y-0">
                {scans.map((s, i) => (
                  <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* the thread down the side of the day */}
                    {i < scans.length - 1 && <span className="absolute left-[13px] top-7 h-full w-px bg-[#242424]" />}
                    <span
                      className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        s.entered_by
                          ? 'bg-blue-950/60 text-blue-300'
                          : s.kind === 'In' ? 'bg-green-950/60 text-green-400'
                          : s.kind === 'Out' ? 'bg-[#1f1f1f] text-gray-400'
                          : 'bg-amber-950/50 text-amber-300'
                      }`}
                    >
                      {iconFor(s.kind)}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-sm">
                        <span className="font-medium">{says(s.kind)}</span>
                        <span className="ml-2 tabular-nums text-gray-400">{clock(s.scanned_at)}</span>
                        {s.late_by_min ? <span className="ml-2 text-xs text-amber-400">{s.late_by_min}m late</span> : null}
                      </p>
                      {s.entered_by && (
                        <p className="mt-0.5 text-[11px] text-blue-300/80">
                          Added by hand — {s.entered_reason}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── the two corrections ──────────────────────────────── */}
          {canEdit && (
            <section className="px-5 pt-6">
              <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">Correct this day</h3>

              {/* add a punch */}
              <div className="mt-3 overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
                <button
                  onClick={() => { setAdding((v) => !v); setSettingDay(false) }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1a1a1a]"
                >
                  <Plus size={15} className="text-orange-400" />
                  <span className="flex-1 text-sm">Add a punch that was missed</span>
                  <ArrowRight size={14} className={`text-gray-600 transition-transform ${adding ? 'rotate-90' : ''}`} />
                </button>

                {adding && (
                  <div className="space-y-3 border-t border-[#242424] px-4 py-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs text-gray-400">What</span>
                        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
                          {KINDS.map((k) => <option key={k} value={k}>{says(k)}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs text-gray-400">At</span>
                        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs text-gray-400">Why *</span>
                      <input
                        value={why}
                        onChange={(e) => setWhy(e.target.value)}
                        placeholder="e.g. Phone battery died at the gate"
                        className={field}
                      />
                      <span className="mt-1 block text-[11px] text-gray-600">
                        This is saved with the punch. It is how anyone later tells a correction from a mistake.
                      </span>
                    </label>
                    <button
                      onClick={addPunch}
                      disabled={busy || why.trim().length < 3}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-40"
                    >
                      {busy && <Loader2 size={14} className="animate-spin" />} Add the punch
                    </button>
                  </div>
                )}
              </div>

              {/* set the day */}
              <div className="mt-2 overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
                <button
                  onClick={() => { setSettingDay((v) => !v); setAdding(false) }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1a1a1a]"
                >
                  <CalendarDays size={15} className="text-orange-400" />
                  <span className="flex-1 text-sm">Say what the day was</span>
                  <ArrowRight size={14} className={`text-gray-600 transition-transform ${settingDay ? 'rotate-90' : ''}`} />
                </button>

                {settingDay && (
                  <div className="space-y-3 border-t border-[#242424] px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(s)}
                          className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                            status === s
                              ? 'bg-orange-500 font-medium text-black'
                              : 'bg-[#1f1f1f] text-gray-300 hover:bg-[#262626]'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs text-gray-400">Why *</span>
                      <input
                        value={statusWhy}
                        onChange={(e) => setStatusWhy(e.target.value)}
                        placeholder="e.g. Sick leave, told on the phone"
                        className={field}
                      />
                    </label>
                    {status === 'Present' && (
                      <p className="rounded-lg bg-[#1a1a1a] px-3 py-2 text-[11px] text-gray-400">
                        Present works the day out from the punches again, rather than keeping whatever a
                        correction left behind.
                      </p>
                    )}
                    <button
                      onClick={saveStatus}
                      disabled={busy || statusWhy.trim().length < 3}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-black transition-opacity disabled:opacity-40"
                    >
                      {busy && <Loader2 size={14} className="animate-spin" />} Set the day to {status}
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── what has been changed before ─────────────────────── */}
          {edits.length > 0 && (
            <section className="px-5 py-6">
              <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                <History size={13} /> Changes to this day
              </h3>
              <ul className="mt-3 space-y-2">
                {edits.map((e, i) => (
                  <li key={i} className="rounded-xl border border-[#242424] bg-[#151515] px-4 py-3">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium capitalize">{e.action}</span>
                      <span className="text-xs text-gray-500">
                        by {e.by_name ?? 'someone'} ·{' '}
                        {new Date(e.edited_at).toLocaleString('en-IN', {
                          timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{e.reason}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                      <span className="rounded bg-[#1f1f1f] px-2 py-0.5">{String(e.was?.status ?? '—')}</span>
                      <ArrowRight size={11} />
                      <span className="rounded bg-[#1f1f1f] px-2 py-0.5 text-gray-300">{String(e.became?.status ?? '—')}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="h-6" />
        </div>
      </aside>
    </div>
  )
}

const field =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none'

function Fig({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-[#151515] px-2 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-medium tabular-nums ${tone ?? 'text-white'}`}>{value}</p>
    </div>
  )
}