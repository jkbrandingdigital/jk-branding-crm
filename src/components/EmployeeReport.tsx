import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowLeft, ChevronLeft, ChevronRight, Check, X, Eye, Download, Printer, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { istDate, addDays, addMonths, prettyDate, inr, inrCompact } from '../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../lib/targets'

type Row = Record<string, unknown> & { id: string; work_date?: string; evolution_date?: string }
type Question = { id: string; question_en: string; is_active: boolean; legacy_column: string | null }
type Deal = { report_id: string; client_name: string | null; amount: number | null; note: string | null }
type View = { kind: 'evolution' | 'report'; date: string } | null

const NUM_FIELDS: [string, string][] = [
  ['calls', 'Total calls'],
  ['received_calls', 'Received calls'],
  ['incoming_calls', 'Incoming calls'],
  ['followup_calls', 'Follow-up calls'],
  ['quality_leads', 'Quality leads'],
  ['positive_leads', 'Positive'],
  ['hot_leads', 'Hot'],
  ['fail_leads', 'Fail'],
  ['customer_followup', 'Customer follow-up'],
  ['crm_data_entry', 'CRM data entry'],
  ['bulk_whatsapp', 'Bulk WhatsApp'],
  ['facebook_inquiry', 'Facebook inquiry'],
  ['indiamart_inquiry', 'IndiaMART inquiry'],
  ['old_client_ref', 'Old client reference'],
]

const num = (v: unknown) => Number(v ?? 0)
const txt = (v: unknown) => (v == null ? '' : String(v))
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const isSunday = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay() === 0

// ---------- Downloads ----------
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  // BOM so Excel shows Gujarati and ₹ correctly
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function printDoc(title: string, subtitle: string, body: string) {
  const w = window.open('', '_blank')
  if (!w) return alert('Allow pop-ups to download the PDF.')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;margin:32px;font-size:13px}
  .brand{color:#f97316;font-weight:700;font-size:18px}.muted{color:#666}
  h1{font-size:20px;margin:14px 0 2px} table{width:100%;border-collapse:collapse;margin-top:16px}
  th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top} th{background:#f5f5f5;width:40%}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}
  .cell{border:1px solid #ddd;border-radius:6px;padding:8px}.cell b{display:block;font-size:16px}
  @media print{button{display:none}}
</style></head><body>
<div class="brand">JK Branding (India) Pvt. Ltd.</div><div class="muted">Vision 2036 : Agency to Unicorn</div>
<h1>${esc(title)}</h1><div class="muted">${esc(subtitle)}</div>${body}
<p class="muted" style="margin-top:24px">Generated ${esc(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}</p>
<script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}

export default function EmployeeReport({ userId, backTo }: { userId: string; backTo: string }) {
  const today = istDate()
  const [ym, setYm] = useState(today.slice(0, 7))
  const year = ym.slice(0, 4)

  const [person, setPerson] = useState<{ name: string; code: string; branch: string; designation: string } | null>(null)
  const [yearReports, setYearReports] = useState<Row[]>([])
  const [yearTargets, setYearTargets] = useState<Map<string, number>>(new Map())
  const [evolutions, setEvolutions] = useState<Row[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [view, setView] = useState<View>(null)
  const [range, setRange] = useState<'week' | 'month' | 'date'>('week')
  const [pickDate, setPickDate] = useState(today)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Person
  useEffect(() => {
    ;(async () => {
      const { data: p, error: e } = await supabase
        .from('profiles')
        .select('full_name, emp_code, designation, branch_id')
        .eq('id', userId)
        .maybeSingle()
      if (e || !p) return setError(e?.message ?? 'Employee not found or you do not have access.')
      let branch = '—'
      if (p.branch_id) {
        const { data: b } = await supabase.from('branches').select('name').eq('id', p.branch_id).maybeSingle()
        branch = b?.name ?? '—'
      }
      setPerson({ name: p.full_name, code: p.emp_code, branch, designation: p.designation ?? '' })
      const { data: qs } = await supabase.from('evolution_questions').select('id, question_en, is_active, legacy_column').order('sort_order')
      setQuestions(qs ?? [])
    })()
  }, [userId])

  // Year data (reports + targets) and month data (evolutions + deals)
  const load = useCallback(async () => {
    setLoading(true)
    const [r, t, e, d] = await Promise.all([
      supabase.from('daily_reports').select('*').eq('user_id', userId).gte('work_date', `${year}-01-01`).lte('work_date', `${year}-12-31`),
      supabase.from('employee_targets').select('month, target_amount').eq('user_id', userId).gte('month', `${year}-01-01`).lte('month', `${year}-12-01`),
      supabase.from('daily_evolution').select('*').eq('user_id', userId).gte('evolution_date', monthFirst(ym)).lte('evolution_date', monthLast(ym)),
      supabase.from('deal_details').select('report_id, client_name, amount, note').eq('user_id', userId).gte('work_date', monthFirst(ym)).lte('work_date', monthLast(ym)),
    ])
    const err = r.error ?? t.error ?? e.error ?? d.error
    if (err) setError(err.message)
    setYearReports((r.data ?? []) as Row[])
    setYearTargets(new Map((t.data ?? []).map((x) => [String(x.month).slice(0, 7), Number(x.target_amount)])))
    setEvolutions((e.data ?? []) as Row[])
    setDeals(d.data ?? [])
    setLoading(false)
  }, [userId, year, ym])

  useEffect(() => {
    load()
  }, [load])

  // ---------- Derived ----------
  const monthReports = yearReports.filter((r) => txt(r.work_date).startsWith(ym))
  const reportOn = (d: string) => monthReports.find((r) => r.work_date === d)
  const evolutionOn = (d: string) => evolutions.find((e) => e.evolution_date === d)
  const dealsOf = (reportId: string) => deals.filter((x) => x.report_id === reportId)

  const answerOf = (r: Row, q: Question) => {
    const json = (r.answers ?? {}) as Record<string, unknown>
    return txt(json[q.id] ?? (q.legacy_column ? r[q.legacy_column] : ''))
  }
  const questionsFor = (r: Row) => questions.filter((q) => q.is_active || answerOf(r, q).trim() !== '')

  // Days of the month up to today
  const days = useMemo(() => {
    const out: string[] = []
    const end = monthLast(ym) < today ? monthLast(ym) : today
    for (let d = monthFirst(ym); d <= end; d = addDays(d, 1)) out.push(d)
    return out.reverse()
  }, [ym, today])
  const workDays = days.filter((d) => !isSunday(d))

  // What the day-by-day table shows (exports always use the full month)
  const shownDays = range === 'month' ? days : range === 'week' ? days.slice(0, 7) : days.filter((d) => d === pickDate)

  function choose(r: 'week' | 'month' | 'date') {
    setRange(r)
    if (r === 'date' && !pickDate.startsWith(ym)) setPickDate(days[0] ?? today)
  }

  const monthTarget = yearTargets.get(ym) ?? 0
  const monthAchieved = monthReports.reduce((s, r) => s + num(r.revenue), 0)
  const monthPct = pctOf(monthAchieved, monthTarget)
  const monthZone = zoneOf(monthPct)

  const yearRows = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const rs = yearReports.filter((r) => txt(r.work_date).startsWith(key))
    const achieved = rs.reduce((s, r) => s + num(r.revenue), 0)
    const target = yearTargets.get(key) ?? 0
    return {
      key,
      label: new Date(key + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }),
      target,
      achieved,
      calls: rs.reduce((s, r) => s + num(r.calls), 0),
      deals: rs.reduce((s, r) => s + num(r.deals_closed), 0),
      reports: rs.length,
    }
  })
  const yearTarget = yearRows.reduce((s, m) => s + m.target, 0)
  const yearAchieved = yearRows.reduce((s, m) => s + m.achieved, 0)

  // ---------- Exports ----------
  const fileBase = `${(person?.name ?? 'employee').replace(/\s+/g, '_')}_${ym}`

  function exportMonthReports() {
    const head = ['Date', 'Evolution form', 'Daily report', ...NUM_FIELDS.map(([, l]) => l), 'Deals', 'Revenue', 'Deal details', 'Other activity']
    const rows = days
      .slice()
      .reverse()
      .map((d) => {
        const r = reportOn(d)
        return [
          d,
          evolutionOn(d) ? 'Yes' : isSunday(d) ? 'Sunday' : 'No',
          r ? 'Yes' : isSunday(d) ? 'Sunday' : 'No',
          ...NUM_FIELDS.map(([k]) => (r ? num(r[k]) : '')),
          r ? num(r.deals_closed) : '',
          r ? num(r.revenue) : '',
          r ? dealsOf(r.id).map((x) => `${x.client_name}: ${num(x.amount)}`).join(' | ') : '',
          r ? txt(r.other_activity) : '',
        ]
      })
    downloadCsv(`${fileBase}_daily_reports.csv`, [head, ...rows])
  }

  function exportMonthEvolutions() {
    const qs = questions.filter((q) => q.is_active || evolutions.some((e) => answerOf(e, q).trim()))
    const head = ['Date', 'Reviewer', ...qs.map((q) => q.question_en), 'Review note']
    const rows = evolutions
      .slice()
      .sort((a, b) => txt(a.evolution_date).localeCompare(txt(b.evolution_date)))
      .map((e) => [txt(e.evolution_date), txt(e.reviewer_name), ...qs.map((q) => answerOf(e, q)), txt(e.review_note)])
    downloadCsv(`${fileBase}_evolution_forms.csv`, [head, ...rows])
  }

  function printEvolution(e: Row) {
    const body =
      `<table>${questionsFor(e)
        .map((q, i) => `<tr><th>${i + 1}. ${esc(q.question_en)}</th><td>${esc(answerOf(e, q) || '—')}</td></tr>`)
        .join('')}</table>` + (e.review_note ? `<p><b>Review note:</b> ${esc(txt(e.review_note))}</p>` : '')
    printDoc('Evolution Form', `${person?.name} · ${person?.branch} · ${prettyDate(txt(e.evolution_date))} · Reviewer: ${txt(e.reviewer_name) || '—'}`, body)
  }

  function printReport(r: Row) {
    const cells = NUM_FIELDS.map(([k, l]) => `<div class="cell">${esc(l)}<b>${num(r[k])}</b></div>`).join('')
    const ds = dealsOf(r.id)
    const dealRows = ds.length
      ? `<table><tr><th>Client</th><th>Amount</th><th>Note</th></tr>${ds
          .map((x) => `<tr><td>${esc(txt(x.client_name))}</td><td>${esc(inr(num(x.amount)))}</td><td>${esc(txt(x.note) || '—')}</td></tr>`)
          .join('')}</table>`
      : '<p class="muted">No deals.</p>'
    const body =
      `<div class="grid">${cells}<div class="cell">Revenue<b>${esc(inr(num(r.revenue)))}</b></div></div>` +
      `<h3 style="margin-top:20px">Deals</h3>${dealRows}` +
      `<p><b>Other activity:</b> ${esc(txt(r.other_activity) || '—')}</p>` +
      (r.admin_note ? `<p><b>Admin note:</b> ${esc(txt(r.admin_note))}</p>` : '')
    printDoc('Daily Report', `${person?.name} · ${person?.branch} · ${prettyDate(txt(r.work_date))}`, body)
  }

  const viewRow = view ? (view.kind === 'evolution' ? evolutionOn(view.date) : reportOn(view.date)) : undefined
  const btn = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-[#1f1f1f] hover:text-white'

  return (
    <div className="mx-auto max-w-6xl">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={15} /> Back
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{person?.name ?? 'Employee'}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {person ? `${person.code} · ${person.branch}${person.designation ? ` · ${person.designation}` : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
          <button onClick={() => setYm(addMonths(ym, -1))} className="rounded-md p-1.5 text-gray-400 hover:text-white" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthTitle(ym)}</span>
          <button
            onClick={() => ym < today.slice(0, 7) && setYm(addMonths(ym, 1))}
            disabled={ym >= today.slice(0, 7)}
            className="rounded-md p-1.5 text-gray-400 hover:text-white disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {error && <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className={loading ? 'opacity-50' : ''}>
        {/* Month summary */}
        <section className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
          <div className="bg-[#151515] px-5 py-4 sm:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{monthTitle(ym)} target</p>
              {monthTarget > 0 && <span className={`rounded-full px-2.5 py-0.5 text-xs ${monthZone.chip}`}>{monthZone.label}</span>}
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-orange-500">
              {inr(monthAchieved)} <span className="text-sm font-normal text-gray-400">of {monthTarget > 0 ? inr(monthTarget) : 'no target'}</span>
            </p>
            {monthTarget > 0 && (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#222]">
                  <div className={`h-full rounded-full ${monthZone.bar}`} style={{ width: `${Math.min(monthPct, 100)}%` }} />
                </div>
                <span className={`text-sm font-semibold tabular-nums ${monthZone.text}`}>{monthPct.toFixed(0)}%</span>
              </div>
            )}
          </div>
          <div className="bg-[#151515] px-5 py-4">
            <p className="text-xs text-gray-400">Evolution forms</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {evolutions.length} <span className="text-sm font-normal text-gray-500">/ {workDays.length} days</span>
            </p>
          </div>
          <div className="bg-[#151515] px-5 py-4">
            <p className="text-xs text-gray-400">Daily reports</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {monthReports.length} <span className="text-sm font-normal text-gray-500">/ {workDays.length} days</span>
            </p>
          </div>
        </section>

        {/* Day by day */}
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#222] px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-medium text-gray-300">Day by day</h2>
              <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
                {([
                  ['week', 'Last 7 days'],
                  ['month', 'Full month'],
                  ['date', 'Pick a date'],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => choose(k)}
                    className={`rounded-md px-3 py-1 text-xs transition-colors ${range === k ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {range === 'date' && (
                <input
                  type="date"
                  value={pickDate}
                  max={today}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    setPickDate(v)
                    if (!v.startsWith(ym)) setYm(v.slice(0, 7))
                  }}
                  className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1 text-xs text-white [color-scheme:dark] focus:border-orange-500 focus:outline-none"
                />
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={exportMonthEvolutions} disabled={evolutions.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                <FileSpreadsheet size={14} /> Month evolution (Excel)
              </button>
              <button onClick={exportMonthReports} disabled={days.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                <FileSpreadsheet size={14} /> Month reports (Excel)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[#222] text-left text-gray-400">
                  <th className="px-5 py-2.5 font-normal">Date</th>
                  <th className="py-2.5 pr-4 font-normal">Evolution form</th>
                  <th className="py-2.5 pr-4 font-normal">Daily report</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Calls</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Deals</th>
                  <th className="py-2.5 pr-5 text-right font-normal">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {shownDays.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">No days to show.</td>
                  </tr>
                )}
                {shownDays.map((d) => {
                  const e = evolutionOn(d)
                  const r = reportOn(d)
                  const sunday = isSunday(d)
                  return (
                    <tr key={d} className={`border-b border-[#1c1c1c] last:border-0 ${sunday ? 'text-gray-600' : ''}`}>
                      <td className="px-5 py-2.5">{prettyDate(d)}</td>
                      <td className="py-2.5 pr-4">
                        {e ? (
                          <span className="flex items-center gap-1">
                            <Check size={15} className="text-green-400" />
                            <button className={btn} onClick={() => setView({ kind: 'evolution', date: d })}>
                              <Eye size={13} /> View
                            </button>
                            <button className={btn} onClick={() => printEvolution(e)}>
                              <Download size={13} /> PDF
                            </button>
                          </span>
                        ) : sunday ? (
                          <span className="text-xs">Sunday</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <X size={15} /> Not filled
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        {r ? (
                          <span className="flex items-center gap-1">
                            <Check size={15} className="text-green-400" />
                            <button className={btn} onClick={() => setView({ kind: 'report', date: d })}>
                              <Eye size={13} /> View
                            </button>
                            <button className={btn} onClick={() => printReport(r)}>
                              <Download size={13} /> PDF
                            </button>
                          </span>
                        ) : sunday ? (
                          <span className="text-xs">Sunday</span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <X size={15} /> Not filled
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{r ? num(r.calls) : '—'}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{r ? num(r.deals_closed) : '—'}</td>
                      <td className="py-2.5 pr-5 text-right tabular-nums">{r ? inr(num(r.revenue)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Year */}
        <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-gray-300">Target vs achieved · {year}</h2>
            <p className="text-sm text-gray-400">
              Year: <span className="font-semibold text-white">{inr(yearAchieved)}</span> of {yearTarget > 0 ? inr(yearTarget) : 'no targets'}
              {yearTarget > 0 && <span className={`ml-2 font-semibold ${zoneOf(pctOf(yearAchieved, yearTarget)).text}`}>{pctOf(yearAchieved, yearTarget).toFixed(0)}%</span>}
            </p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#222" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => inrCompact(Number(v))} domain={[0, (max: number) => Math.max(max, 10000)]} />
                <Tooltip
                  cursor={{ fill: '#1c1c1c' }}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2e2e2e', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#e5e5e5' }}
                  formatter={(v, n) => [inr(Number(v)), n === 'target' ? 'Target' : 'Achieved']}
                />
                <Bar dataKey="target" fill="#3f3f46" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="achieved" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-gray-400">
                  <th className="py-2 pr-4 font-normal">Month</th>
                  <th className="py-2 pr-4 text-right font-normal">Target</th>
                  <th className="py-2 pr-4 text-right font-normal">Achieved</th>
                  <th className="py-2 pr-4 font-normal">Zone</th>
                  <th className="py-2 pr-4 text-right font-normal">Calls</th>
                  <th className="py-2 pr-4 text-right font-normal">Deals</th>
                  <th className="py-2 text-right font-normal">Reports</th>
                </tr>
              </thead>
              <tbody>
                {yearRows.map((m) => {
                  const p = pctOf(m.achieved, m.target)
                  const z = zoneOf(p)
                  return (
                    <tr
                      key={m.key}
                      onClick={() => m.key <= today.slice(0, 7) && setYm(m.key)}
                      className={`border-b border-[#1c1c1c] last:border-0 ${m.key <= today.slice(0, 7) ? 'cursor-pointer hover:bg-[#1a1a1a]' : 'text-gray-600'} ${m.key === ym ? 'bg-orange-500/5' : ''}`}
                    >
                      <td className="py-2.5 pr-4">{m.label}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-gray-400">{m.target > 0 ? inr(m.target) : '—'}</td>
                      <td className="py-2.5 pr-4 text-right font-medium tabular-nums">{inr(m.achieved)}</td>
                      <td className="py-2.5 pr-4">
                        {m.target > 0 ? <span className={`rounded-full px-2 py-0.5 text-xs ${z.chip}`}>{p.toFixed(0)}%</span> : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{m.calls}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{m.deals}</td>
                      <td className="py-2.5 text-right tabular-nums">{m.reports}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* View panel */}
      {view && viewRow && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setView(null)} />
          <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-[#242424] bg-[#121212]">
            <div className="flex items-center justify-between border-b border-[#222] px-6 py-4">
              <div>
                <h2 className="font-semibold">{view.kind === 'evolution' ? 'Evolution Form' : 'Daily Report'}</h2>
                <p className="text-xs text-gray-500">{prettyDate(view.date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => (view.kind === 'evolution' ? printEvolution(viewRow) : printReport(viewRow))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                >
                  <Printer size={14} /> PDF
                </button>
                <button onClick={() => setView(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {view.kind === 'evolution' ? (
                <dl className="space-y-4">
                  {questionsFor(viewRow).map((q, i) => (
                    <div key={q.id}>
                      <dt className="text-xs text-gray-500">
                        {i + 1}. {q.question_en}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{answerOf(viewRow, q) || '—'}</dd>
                    </div>
                  ))}
                  {viewRow.review_note ? (
                    <div className="rounded-lg border border-orange-900/60 bg-orange-950/20 p-3 text-sm">
                      <p className="text-xs text-orange-400">Review note</p>
                      <p className="mt-1">{txt(viewRow.review_note)}</p>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {NUM_FIELDS.map(([k, l]) => (
                      <div key={k} className="rounded-lg bg-[#1a1a1a] px-3 py-2">
                        <p className="text-[11px] text-gray-500">{l}</p>
                        <p className="font-semibold tabular-nums">{num(viewRow[k])}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-xs text-gray-400">Deals · {inr(num(viewRow.revenue))}</p>
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {dealsOf(viewRow.id).length === 0 ? (
                      <li className="text-gray-500">No deals.</li>
                    ) : (
                      dealsOf(viewRow.id).map((x, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="truncate">
                            {x.client_name}
                            {x.note && <span className="text-gray-500"> · {x.note}</span>}
                          </span>
                          <span className="shrink-0 text-orange-400 tabular-nums">{inr(num(x.amount))}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  <p className="mt-5 text-xs text-gray-400">Other activity</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{txt(viewRow.other_activity) || '—'}</p>
                  {viewRow.admin_note ? (
                    <div className="mt-5 rounded-lg border border-orange-900/60 bg-orange-950/20 p-3 text-sm">
                      <p className="text-xs text-orange-400">Admin note</p>
                      <p className="mt-1">{txt(viewRow.admin_note)}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}