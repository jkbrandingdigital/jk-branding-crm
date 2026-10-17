import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowDownRight, ArrowUpRight, Download, Loader2, Minus, Search, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useChartTheme } from '../lib/chartTheme'
import { pctOf, zoneOf } from '../lib/targets'
import { inr, inrCompact, istDate } from '../lib/format'
import { DateField } from './DateField'

/*
  The whole sales team on one screen.

  Until now a manager had to open each person in turn to find out who was
  behind. Twenty people meant twenty screens and nothing to compare them
  on. This is the same numbers, in one list, sorted by what was actually
  brought in.

  The zones are NOT decided here. `zoneOf()` owns them — green at 70%,
  yellow at 30% — and every other screen in the CRM reads the same
  function. A second set of thresholds written here would drift from it
  the first time one was changed.
*/

type Row = {
  user_id: string
  full_name: string | null
  emp_code: string | null
  branch_id: string | null
  branch_name: string | null
  target_amount: number
  achieved: number
  deals: number
  calls: number
  prev_achieved: number
  days_reported: number
}

type Period = 'month' | 'last' | 'year' | 'pick'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: 'year', label: 'This year' },
  { key: 'pick', label: 'Pick days' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function rangeOf(p: Period): { from: string; to: string } {
  const now = new Date(istDate() + 'T00:00:00')
  const y = now.getFullYear()
  const m = now.getMonth()
  if (p === 'last') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
  if (p === 'year') return { from: ymd(new Date(y, 0, 1)), to: ymd(now) }
  return { from: ymd(new Date(y, m, 1)), to: ymd(now) }
}

export default function SalesTeamTable() {
  const navigate = useNavigate()
  const chart = useChartTheme()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(rangeOf('month').from)
  const [to, setTo] = useState(rangeOf('month').to)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'green' | 'yellow' | 'red'>('all')

  function pick(p: Period) {
    setPeriod(p)
    if (p !== 'pick') {
      const r = rangeOf(p)
      setFrom(r.from)
      setTo(r.to)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('sales_team_performance', { p_from: from, p_to: to })
    setLoading(false)
    if (error) return setErr(error.message)
    setErr('')
    setRows((data ?? []) as Row[])
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const withPct = useMemo(
    () => rows.map((r) => {
      const pct = pctOf(Number(r.achieved), Number(r.target_amount))
      return { ...r, pct, zone: zoneOf(pct) }
    }),
    [rows],
  )

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return withPct.filter((r) => {
      if (only !== 'all' && r.zone.key !== only) return false
      if (!t) return true
      return (r.full_name ?? '').toLowerCase().includes(t) ||
             (r.emp_code ?? '').toLowerCase().includes(t) ||
             (r.branch_name ?? '').toLowerCase().includes(t)
    })
  }, [withPct, q, only])

  const counts = useMemo(() => ({
    green: withPct.filter((r) => r.zone.key === 'green').length,
    yellow: withPct.filter((r) => r.zone.key === 'yellow').length,
    red: withPct.filter((r) => r.zone.key === 'red').length,
  }), [withPct])

  const total = useMemo(() => withPct.reduce((t, r) => ({
    target: t.target + Number(r.target_amount),
    achieved: t.achieved + Number(r.achieved),
    deals: t.deals + r.deals,
    calls: t.calls + r.calls,
  }), { target: 0, achieved: 0, deals: 0, calls: 0 }), [withPct])

  const teamPct = pctOf(total.achieved, total.target)

  function toExcel() {
    const head = ['Sales person', 'Code', 'Branch', 'Target', 'Achieved', '%', 'Zone', 'Deals', 'Calls', 'Days reported', 'Previous period']
    const body = shown.map((r) => [
      r.full_name ?? '', r.emp_code ?? '', r.branch_name ?? '',
      Number(r.target_amount), Number(r.achieved), Math.round(r.pct), r.zone.label,
      r.deals, r.calls, r.days_reported, Number(r.prev_achieved),
    ])
    const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `sales-team-${from}-to-${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  // Theme-aware, because a hex written once is a hex that goes pale on
  // cream. Taken from the chart theme so the table and the charts above
  // it agree.
  const rule = { borderTop: `1px solid ${chart.grid}` }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Users size={18} className="text-orange-400" />
            Sales team
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Everyone against their target, without opening them one by one.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => pick(p.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {period === 'pick' && (
        <div className="flex flex-wrap items-center gap-2">
          <DateField value={from} onChange={setFrom} className="w-44" placeholder="From" />
          <span className="text-gray-600">→</span>
          <DateField value={to} onChange={setTo} className="w-44" placeholder="To" />
        </div>
      )}

      {err && (
        <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle size={16} /> {err}
        </p>
      )}

      {/* ---------- the four numbers ---------- */}
      <div className="grid gap-px overflow-hidden rounded-xl border border-[#242424] bg-[#242424] sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Target', inr(total.target), ''],
          ['Achieved', inr(total.achieved), total.target > 0 ? `${Math.round(teamPct)}% of target` : 'No target set'],
          ['Deals closed', String(total.deals), total.deals > 0 ? `${inrCompact(total.achieved / total.deals)} average` : ''],
          ['Calls', String(total.calls), ''],
        ].map(([label, value, note]) => (
          <div key={label} className="bg-[#151515] px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-white">{value}</p>
            {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
          </div>
        ))}
      </div>

      {/* ---------- who is where ----------
          These are buttons, not labels. "Two people at risk" is only
          useful if it can say which two. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          ['green', 'On track', '70% and above', counts.green],
          ['yellow', 'Needs a push', '30 – 70%', counts.yellow],
          ['red', 'Behind', 'Below 30%', counts.red],
        ] as const).map(([key, label, range, n]) => {
          const z = zoneOf(key === 'green' ? 100 : key === 'yellow' ? 50 : 0)
          const on = only === key
          return (
            <button
              key={key}
              onClick={() => setOnly(on ? 'all' : key)}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                on ? 'border-orange-500/60 bg-orange-500/5' : 'border-[#242424] bg-[#151515] hover:border-[#333]'
              }`}
            >
              <span>
                <span className={`block text-sm font-medium ${z.text}`}>{label}</span>
                <span className="block text-xs text-gray-500">{range}</span>
              </span>
              <span className="text-2xl font-semibold tabular-nums text-white">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a person, code or branch"
          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
        />
      </div>

      {/* ---------- the list ---------- */}
      <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>#</th>
                <th className="px-4 py-3 font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Sales person</th>
                <th className="px-4 py-3 text-right font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Target</th>
                <th className="px-4 py-3 text-right font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Achieved</th>
                <th className="px-4 py-3 font-normal" style={{ borderBottom: `1px solid ${chart.grid}`, minWidth: 180 }}>Progress</th>
                <th className="px-4 py-3 font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Status</th>
                <th className="px-4 py-3 text-right font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Deals</th>
                <th className="px-4 py-3 text-right font-normal" style={{ borderBottom: `1px solid ${chart.grid}` }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const prev = Number(r.prev_achieved)
                const now = Number(r.achieved)
                // No previous figure means no comparison — not a 100% jump.
                const trend = prev > 0 ? Math.round(((now - prev) / prev) * 100) : null
                return (
                  <tr
                    key={r.user_id}
                    onClick={() => navigate(`/admin/employee/${r.user_id}`)}
                    className="cursor-pointer hover:bg-[#1a1a1a]"
                  >
                    <td className="px-4 py-3 tabular-nums text-gray-600" style={rule}>{i + 1}</td>

                    <td className="px-4 py-3" style={rule}>
                      <span className="block font-medium text-white">{r.full_name ?? '—'}</span>
                      <span className="block text-xs text-gray-500">
                        {r.emp_code}
                        {r.branch_name && ` · ${r.branch_name}`}
                        {r.days_reported === 0 && <span className="text-amber-400"> · no reports</span>}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-gray-400" style={rule}>
                      {Number(r.target_amount) > 0 ? inr(r.target_amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-white" style={rule}>
                      {inr(r.achieved)}
                    </td>

                    <td className="px-4 py-3" style={rule}>
                      {Number(r.target_amount) > 0 ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: chart.grid }}>
                            <span
                              className={`block h-full rounded-full ${r.zone.bar}`}
                              style={{ width: `${Math.min(r.pct, 100)}%` }}
                            />
                          </span>
                          <span className={`w-12 shrink-0 text-right text-xs tabular-nums ${r.zone.text}`}>
                            {Math.round(r.pct)}%
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">No target set</span>
                      )}
                    </td>

                    <td className="px-4 py-3" style={rule}>
                      {Number(r.target_amount) > 0 ? (
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${r.zone.chip}`}>
                          {r.zone.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-gray-300" style={rule}>{r.deals}</td>

                    <td className="px-4 py-3 text-right" style={rule}>
                      {trend === null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <Minus size={12} /> —
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${
                          trend >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                          {Math.abs(trend)}%
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500" style={rule}>
                    {q.trim() || only !== 'all' ? 'Nobody matches.' : 'Nothing for these days.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center" style={rule}>
                    <Loader2 size={18} className="mx-auto animate-spin text-gray-500" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600">
        A row opens that person's own report. Target is the whole month's, even on a part-month —
        half a target is not a thing. Trend compares the same number of days just before.
      </p>
    </section>
  )
}