// src/components/leave/HolidaysCard.tsx
//
// The year's holidays, on the leave page. Moved here from Setup: HR
// thinks of holidays when planning who is away, not once a year in a
// settings page, and a holiday that is missing quietly eats paid leave.
//
// Shown as stretches, not one row a day: Diwali is "7–12 Nov · 6 days",
// one line, removed in one go. The database still keeps one row per day
// (holiday_set_range writes them, holiday_drop takes one away), so a
// stretch is only how they are grouped on screen.
//
// Who may add or remove is the database's answer — rules_now().can_edit,
// the same flag Setup used, backed by holiday_set_range / holiday_drop
// asking for attendance_edit themselves.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DateField } from '../DateField'

type Holiday = {
  id: string; holiday_on: string; name: string
  branch_id: string | null; branch: string | null
}

type Branch = { id: string; name: string }

// Consecutive days with the same name and branch, as one.
type Stretch = { key: string; name: string; branch: string | null; from: string; to: string; ids: string[] }

const nextDay = (d: string) => {
  const t = new Date(d + 'T00:00:00')
  t.setDate(t.getDate() + 1)
  return t.toLocaleDateString('en-CA')
}

const dayCount = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000) + 1

const short = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', opts)

function whenText(s: Stretch) {
  if (s.from === s.to) return short(s.from, { weekday: 'short', day: 'numeric', month: 'short' })
  const sameMonth = s.from.slice(0, 7) === s.to.slice(0, 7)
  return sameMonth
    ? `${Number(s.from.slice(8, 10))}–${short(s.to, { day: 'numeric', month: 'short' })}`
    : `${short(s.from, { day: 'numeric', month: 'short' })} – ${short(s.to, { day: 'numeric', month: 'short' })}`
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none ' +
  '[color-scheme:dark]'

export default function HolidaysCard({ onChange }: { onChange?: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [canEdit, setCanEdit] = useState(false)

  const [hFrom, setHFrom] = useState('')
  const [hTo, setHTo] = useState('')
  const [hName, setHName] = useState('')
  const [hBranch, setHBranch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [dropping, setDropping] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [h, b, r] = await Promise.all([
      supabase.rpc('holidays_list', { p_year: year }),
      supabase.from('branches').select('id, name').order('name'),
      supabase.rpc('rules_now'),
    ])
    setHolidays((h.data ?? []) as unknown as Holiday[])
    setBranches((b.data ?? []) as unknown as Branch[])
    setCanEdit(!!(r.data as { can_edit?: boolean } | null)?.can_edit)
  }, [year])

  useEffect(() => { load() }, [load])

  const stretches = useMemo(() => {
    const out: Stretch[] = []
    for (const h of holidays) {
      const last = out[out.length - 1]
      if (last && last.name === h.name && last.branch === h.branch && nextDay(last.to) === h.holiday_on) {
        last.to = h.holiday_on
        last.ids.push(h.id)
      } else {
        out.push({ key: h.id, name: h.name, branch: h.branch, from: h.holiday_on, to: h.holiday_on, ids: [h.id] })
      }
    }
    return out
  }, [holidays])

  const totalDays = holidays.filter((h) => !h.branch_id).length
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  async function add() {
    setBusy('add')
    setSaid(null)
    const { data, error } = await supabase.rpc('holiday_set_range', {
      p_from: hFrom, p_to: hTo || hFrom, p_name: hName.trim(), p_branch: hBranch || null,
    })
    setBusy(null)
    const r = data as { ok: boolean; reason?: string; days?: number } | null
    if (error || !r?.ok) return setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
    setSaid({ kind: 'ok', text: r.days === 1 ? 'Holiday added.' : `${r.days} days added.` })
    setHFrom(''); setHTo(''); setHName('')
    await load()
    onChange?.()
  }

  async function drop(s: Stretch) {
    setBusy(s.key)
    setSaid(null)
    for (const id of s.ids) {
      const { error } = await supabase.rpc('holiday_drop', { p_id: id })
      if (error) { setSaid({ kind: 'bad', text: error.message }); break }
    }
    setBusy(null)
    setDropping(null)
    await load()
    onChange?.()
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#242424] px-5 py-3">
        <CalendarDays size={15} className="text-violet-400" />
        <h2 className="text-sm font-medium">Holidays</h2>
        <span className="text-xs text-gray-600">
          {totalDays} {totalDays === 1 ? 'day' : 'days'} off for every branch in {year}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setYear((y) => y - 1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Previous year">
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm tabular-nums">{year}</span>
          <button onClick={() => setYear((y) => y + 1)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1f1f1f] hover:text-white" aria-label="Next year">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {stretches.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-600">
          Nothing set for {year}. Until a holiday is here, leave taken on it still uses up paid days.
        </p>
      ) : (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {stretches.map((s) => {
            const n = dayCount(s.from, s.to)
            const past = s.to < today
            return (
              <li
                key={s.key}
                className={`flex items-center gap-3 rounded-xl border border-[#242424] bg-[#161616] px-3 py-2.5 ${past ? 'opacity-55' : ''}`}
              >
                {/* The date as a small tear-off: day on top, month below */}
                <span className="grid w-11 shrink-0 place-items-center rounded-lg bg-violet-500/15 py-1 text-violet-200">
                  <span className="text-base font-semibold leading-5 tabular-nums">{Number(s.from.slice(8, 10))}</span>
                  <span className="text-[10px] leading-3 text-violet-300/80">{short(s.from, { month: 'short' })}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-100">{s.name}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    {whenText(s)}{n > 1 ? ` · ${n} days` : ''} · {s.branch ?? 'every branch'}
                  </p>
                </div>

                {canEdit && (dropping === s.key ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => drop(s)}
                      disabled={busy === s.key}
                      className="flex items-center gap-1 rounded-lg bg-red-600/90 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {busy === s.key && <Loader2 size={11} className="animate-spin" />}
                      Remove{n > 1 ? ` ${n} days` : ''}
                    </button>
                    <button onClick={() => setDropping(null)} className="rounded-lg px-2 py-1 text-[11px] text-gray-400 hover:text-white">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setDropping(s.key)}
                    className="shrink-0 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-red-950/40 hover:text-red-400"
                    aria-label={`Remove ${s.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                ))}
              </li>
            )
          })}
        </ul>
      )}

      {said && (
        <p className={`px-5 pb-3 text-sm ${said.kind === 'ok' ? 'text-green-300' : 'text-red-300'}`}>{said.text}</p>
      )}

      {canEdit && (
        <div className="border-t border-[#242424] p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_1fr_auto]">
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">From</label>
              <DateField value={hFrom} onChange={(v: string | null) => setHFrom(v ?? '')} placeholder="dd mmm yyyy" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">
                To <span className="text-gray-600">(blank for one day)</span>
              </label>
              <DateField value={hTo} onChange={(v: string | null) => setHTo(v ?? '')} placeholder="dd mmm yyyy" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">What</label>
              <input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="e.g. Janmashtami" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-gray-500">Branch</label>
              <select value={hBranch} onChange={(e) => setHBranch(e.target.value)} className={inputCls}>
                <option value="">Every branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={add}
                disabled={busy === 'add' || !hFrom || hName.trim().length < 2 || (!!hTo && hTo < hFrom)}
                className="flex h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-medium text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === 'add' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add holiday
              </button>
            </div>
          </div>
          {hFrom && hTo && hTo > hFrom && (
            <p className="mt-2 text-xs text-gray-500">{dayCount(hFrom, hTo)} days will be added.</p>
          )}
          {hFrom && hTo && hTo < hFrom && (
            <p className="mt-2 text-xs text-red-400">The last day cannot be before the first.</p>
          )}
        </div>
      )}
    </section>
  )
}