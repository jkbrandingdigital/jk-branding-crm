import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, Award, CheckCircle2, Clock, Download, Loader2, RefreshCw, RotateCcw,
  Target, Timer, TrendingDown, TrendingUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { useChartTheme } from '../../lib/chartTheme'
import { useAuth } from '../../contexts/AuthContext'
import DonutChart from '../DonutChart'
import { DateField } from '../DateField'
import GaugeRing from '../GaugeRing'
import { loadStaff, type Staff } from '../leads/leadUtils'
import { pctOf, zoneOf } from '../../lib/targets'
import ExtraTimeInbox from './ExtraTimeInbox'
import { mins } from './taskUtils'

/*
  A designer's report, built on one comparison: the time a job was meant to
  take against the time it actually took.

      efficiency % = allowed ÷ actual × 100

  100 is on the mark, 120 is faster than the standard, 80 is slower.

  A high number is not on its own a good one. Work rushed out and sent back
  twice shows up here at 150%, which is why "Our redos" sits beside it
  everywhere and why nobody is ranked by efficiency alone.

  No new queries: everything on this page is worked out from the three
  calls that already existed — the summary, the series and the task report.
*/

type Grain = 'day' | 'week' | 'month' | 'year'

type Summary = {
  user_id: string
  full_name: string | null
  done_tasks: number
  allowed_mins: number
  base_mins: number
  change_mins: number
  actual_mins: number
  worked_mins: number
  on_time: number
  over_time: number
  client_changes: number
  our_changes: number
  efficiency: number | null
  on_time_pct: number | null
}

type Point = {
  period: string
  done_tasks: number
  allowed_mins: number
  actual_mins: number
  change_mins: number
  efficiency: number | null
}

type ReportRow = {
  task_no: number
  subject: string
  work_type: string | null
  qty: number
  unit: string | null
  designer: string | null
  stage: string | null
  is_done: boolean
  in_changes: boolean
  client_changes: number
  our_changes: number
  // null when the task has no work type: there is no allowed time to
  // compare against, so these three have no answer — not a zero.
  allowed_mins: number | null
  base_mins: number
  change_mins: number
  actual_mins: number
  over_mins: number | null
  on_time: boolean | null
  sittings: number
  breaks: number
  started_on: string | null
  completed_on: string | null
  due_at: string | null
}

type Person = {
  full_name: string | null
  designation: string | null
  emp_code: string | null
  date_of_joining: string | null
}

/*
  One control for the whole page.

  Before this there were three date controls fighting each other — chart
  grain pills, a from/to pair, and the task list showing whatever happened to
  be loaded. Now a period sets the days, and the chart's buckets follow from
  it. Everything on the page — the figures, the chart, the task list and the
  Excel — is about the same days.
*/
type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

// The target box says which stretch it is for. "Daily target" sitting
// above a month's figure was the page contradicting itself.
const TARGET_LABEL: Record<Period, string> = {
  today: 'Daily target',
  week: 'Weekly target',
  month: 'Monthly target',
  year: 'Yearly target',
  custom: 'Target for these days',
}

const PERIODS: { key: Period; label: string; grain: Grain }[] = [
  { key: 'today', label: 'Daily', grain: 'day' },
  { key: 'week', label: 'Weekly', grain: 'day' },
  { key: 'month', label: 'Monthly', grain: 'day' },
  { key: 'year', label: 'Yearly', grain: 'month' },
  { key: 'custom', label: 'Pick days', grain: 'day' },
]

const ist = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const today = () => ist(new Date())
// Where a period starts, in the office's own calendar — the week from Monday,
// the month from the 1st, the year from 1 January.
function startOf(p: Period): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  if (p === 'week') {
    const back = (now.getDay() + 6) % 7      // Monday = 0
    now.setDate(now.getDate() - back)
  } else if (p === 'month') {
    now.setDate(1)
  } else if (p === 'year') {
    now.setMonth(0, 1)
  }
  return ist(now)
}
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const axisLabel = (iso: string, grain: Grain) => {
  const d = new Date(`${iso}T00:00:00`)
  if (grain === 'year') return String(d.getFullYear())
  if (grain === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Efficiency only says something once there is real time on the clock. A job
// allowed 7 hours with 2 minutes recorded gives 21000%, which is arithmetic,
// not a fact about the work — the timer simply was not used. Below this many
// minutes we say so instead of printing a number nobody can believe.
const ENOUGH_MINS = 5
const MAX_SHOWN = 500

/*
  Points — how MUCH work was done, beside how FAST it was done.

  This page has always answered the second question and never the first.
  "Finished" counts a visiting card and a twelve-page brochure as one
  each, so a designer who turned out twelve cards and one who turned out
  one brochure both come back as a number that says nothing. Efficiency
  has the same blind spot: fifteen minutes of work done in twelve reads
  125%, and so does a whole day of it.

  Points are the job's STANDARD time in the office's own currency —
  one hour = 20, so 15 minutes = 5 and 45 = 15. It is the very same
  figure as `allowed_mins`, in the unit the All Services sheet is written
  in. Not a second measure, and not a second query.

  Counted on the standard time, NEVER the actual. A three-hour logo
  earns 60 points whether it took two hours or five. Speed already has
  its own number beside this one, and paying twice for one thing would
  quietly reward working slowly.

  A day is 8 hours at 20 an hour: 160 points. The All Services sheet
  also carries 170 in one box, which is 8.5 hours — the two do not
  agree, and 160 is the one that matches its own working-hours line.
  Sundays are not working days; there is no holiday calendar, so this is
  as near the truth as the data reaches.
*/
const POINTS_PER_HOUR = 20
const DAILY_HOURS = 8
const DAILY_POINTS = POINTS_PER_HOUR * DAILY_HOURS   // 160

const ptsOf = (allowedMins: number) => Math.round((allowedMins * POINTS_PER_HOUR) / 60)

/*
  Quality — first-pass work.

      quality % = finished jobs with no redo of ours ÷ finished jobs × 100

  "Approved first-pass deliveries over eligible submitted tasks", in the
  service spec's words. A job that came back once is not half good; it
  is a job that was not right the first time, and counting it as a
  fraction would hide how often that happens.

  The client's change rounds are deliberately out of it. A client who
  changes their mind is not a fault in the work, and counting it as one
  teaches designers either to argue with the client or to log our own
  redo as theirs. Either way the number stops meaning anything.
*/
const qualityOf = (finishedJobs: number, firstPassJobs: number) =>
  finishedJobs === 0 ? null : Math.round((firstPassJobs / finishedJobs) * 100)

// Working days in a stretch of dates, Sundays left out. There is no
// holiday calendar in the CRM, so this is as near the truth as the data
// reaches.
function workDays(fromIso: string, toIso: string) {
  let n = 0
  const d = new Date(`${fromIso}T00:00:00Z`)
  const end = new Date(`${toIso}T00:00:00Z`)
  while (d <= end) {
    if (d.getUTCDay() !== 0) n += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

const effOf = (allowed: number, actual: number) =>
  actual < ENOUGH_MINS ? null : Math.round((allowed / actual) * 1000) / 10

const effText = (v: number | null) =>
  v === null ? '—' : v > MAX_SHOWN ? `${MAX_SHOWN}%+` : `${v}%`

/*
  One colour per tile.

  Every tile wearing the same orange chip made the row read as one
  undifferentiated block — the eye had to read six labels to find the
  number it wanted. Colour does that work instead, and the colours stay
  the same from one visit to the next so people learn them.

  Written as "r,g,b" so the same value serves both the faint chip and
  the solid glyph, and both hold up on cream as well as on black.
*/
const HUE: Record<string, string> = {
  orange: '255,94,0',
  green: '16,163,113',
  blue: '59,130,246',
  teal: '13,148,136',
  amber: '217,119,6',
  red: '220,70,70',
  purple: '147,97,207',
}

const initials = (name: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

type Filter = 'all' | 'done' | 'open' | 'changes'

export default function DesignPerformance() {
  const { user } = useAuth()
  const { can, isSuper, ready } = usePermissions()
  const chart = useChartTheme()

  // Daily. A designer's day is the thing anyone actually asks about;
  // a month-to-date figure on open is a number nobody wanted yet.
  const [period, setPeriod] = useState<Period>('today')
  const [grain, setGrain] = useState<Grain>('day')
  const [from, setFrom] = useState(startOf('today'))
  const [to, setTo] = useState(today())
  const [who, setWho] = useState('')          // '' = everyone

  const [summary, setSummary] = useState<Summary[]>([])
  const [series, setSeries] = useState<Point[]>([])
  const [rows, setRows] = useState<ReportRow[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [person, setPerson] = useState<Person | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const seeAll = isSuper || can('design_perf_all')

  // Someone who can only see their own report is always looking at themselves
  useEffect(() => {
    if (ready && !seeAll && user?.id) setWho(user.id)
  }, [ready, seeAll, user?.id])

  const args = useMemo(() => ({ p_from: from, p_to: to, p_user: who || null }), [from, to, who])

  const load = useCallback(async () => {
    const [s, g, r] = await Promise.all([
      supabase.rpc('design_perf_summary', args),
      supabase.rpc('design_perf_series', { p_grain: grain, ...args }),
      supabase.rpc('design_task_report', args),
    ])
    setLoading(false)
    const e = s.error ?? g.error ?? r.error
    if (e) return setError(e.message)
    setError('')
    setSummary((s.data ?? []) as Summary[])
    setSeries((g.data ?? []) as Point[])
    setRows((r.data ?? []) as ReportRow[])
  }, [args, grain])

  useEffect(() => {
    if (!ready) return
    setLoading(true)
    void load()
  }, [ready, load])

  useEffect(() => {
    if (seeAll) void loadStaff().then((all) => setStaff(all.filter((r) => r.role === 'design_team')))
  }, [seeAll])

  // Who the page is about, for the header card
  useEffect(() => {
    if (!who) return setPerson(null)
    void supabase
      .from('profiles')
      .select('full_name, designation, emp_code, date_of_joining')
      .eq('id', who)
      .maybeSingle()
      .then(({ data }) => setPerson((data ?? null) as Person | null))
  }, [who])

  function pickPeriod(p: Period) {
    setPeriod(p)
    if (p === 'custom') return                 // the two date boxes take over
    setGrain(PERIODS.find((x) => x.key === p)!.grain)
    setFrom(startOf(p))
    setTo(today())
  }

  // Excel opens a BOM'd CSV straight away — one file, no extra library,
  // the same way leads are exported.
  async function download() {
    setSaving(true)
    const { data, error: e } = await supabase.rpc('design_task_report', args)
    setSaving(false)
    if (e) return setError(e.message)

    const head = [
      'Task', 'Subject', 'Work', 'Qty', 'Unit', 'Designer', 'Stage', 'Done', 'In changes',
      'Client changes', 'Our redos', 'Gross points', 'Penalty points', 'Net points',
      'Allowed (mins)', 'Original work (mins)', 'On changes (mins)',
      'Total (mins)', 'Over (mins)', 'On time',
      'Sittings', 'Interruptions', 'Started', 'Completed', 'Due',
    ]
    const body = ((data ?? []) as ReportRow[]).map((r) => [
      r.task_no, r.subject, r.work_type, r.qty, r.unit, r.designer, r.stage,
      r.is_done ? 'Yes' : 'No', r.in_changes ? 'Yes' : 'No', r.client_changes, r.our_changes,
      r.allowed_mins === null ? '' : ptsOf(r.allowed_mins),
      r.allowed_mins === null ? '' : ptsOf(r.over_mins ?? 0),
      r.allowed_mins === null ? '' : Math.max(ptsOf(r.allowed_mins) - ptsOf(r.over_mins ?? 0), 0),
      r.allowed_mins ?? '', r.base_mins, r.change_mins, r.actual_mins, r.over_mins ?? '',
      r.on_time === null ? '' : r.on_time ? 'Yes' : 'No', r.sittings, r.breaks,
      day(r.started_on), day(r.completed_on), day(r.due_at),
    ])
    const csv = [head, ...body].map((r) => r.map(cell).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `design-report-${from}-to-${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  // ---- Numbers, all worked out from the rows already in hand ----
  const total = summary.reduce(
    (t, r) => ({
      done: t.done + r.done_tasks,
      allowed: t.allowed + r.allowed_mins,
      base: t.base + r.base_mins,
      change: t.change + r.change_mins,
      actual: t.actual + r.actual_mins,
      worked: t.worked + r.worked_mins,
      onTime: t.onTime + r.on_time,
      client: t.client + r.client_changes,
      ours: t.ours + r.our_changes,
    }),
    { done: 0, allowed: 0, base: 0, change: 0, actual: 0, worked: 0, onTime: 0, client: 0, ours: 0 },
  )

  const open = rows.filter((r) => !r.is_done)
  const started = open.filter((r) => r.actual_mins > 0)
  const notStarted = open.filter((r) => r.actual_mins === 0)
  const assigned = rows.length
  const periodLabel =
    period === 'today' ? `Today · ${day(from)}`
    : period === 'week' ? `This week · ${day(from)} to ${day(to)}`
    : period === 'month' ? `This month · ${day(from)} to ${day(to)}`
    : period === 'year' ? `This year · ${day(from)} to ${day(to)}`
    : `${day(from)} to ${day(to)}`

  const eff = effOf(total.allowed, total.base)   // the original work, not the client's changes
  const onTimePct = total.done > 0 ? Math.round((total.onTime / total.done) * 1000) / 10 : null
  const avgDone = total.done > 0 ? total.base / total.done : 0

  // Zones come from zoneOf, the same rule sales runs on. Two copies of
  // one rule means one of them is wrong by next month.
  /*
    Times the number of people being looked at.

    Without this, "Everyone" added up the whole team's points and held
    them against one person's target: five designers on 11,000 points
    would have read as 430% of 2,550, and every one of them would have
    looked like a star.

    summary has a row per designer in scope, so it is the headcount of
    exactly who the figure above covers.
  */
  const headcount = who ? 1 : Math.max(summary.length, 1)
  const pointTarget = DAILY_POINTS * workDays(from, to) * headcount
  /*
    Gross, negative and net.

        over time  = max(0, active time − allowed time)   · per task
        penalty    = over time in hours × 20
        net        = gross − penalty, never below zero

    Worked out task by task and then added, never from the totals. One
    job two hours early and another two hours late are not the same as
    two jobs on the mark: added up first, the overrun cancels itself and
    the designer who dragged one job for a day reads identically to one
    who did not.

    `base_mins` is the active time on the original brief — the hours
    that follow a client's change round sit in `change_mins` and are not
    in it. That is the spec's "approved waiting creates no penalty", and
    it was already true here.

    Finished work is settled. Open work carries a PROVISIONAL overrun,
    kept apart, because a job still running can still come back inside
    its time, and a penalty shown as final before the work is done is a
    penalty argued about twice.
  */
  const finished = rows.filter((r) => r.is_done)
  const grossPts = finished.reduce((n, r) => n + ptsOf(r.allowed_mins ?? 0), 0)
  const penaltyPts = finished.reduce((n, r) => n + ptsOf(r.over_mins ?? 0), 0)
  const netPts = Math.max(grossPts - penaltyPts, 0)
  const provisionalPts = open.reduce((n, r) => n + ptsOf(r.over_mins ?? 0), 0)

  const netPct = pctOf(netPts, pointTarget)
  const netZone = zoneOf(netPct)
  const netTone: 'good' | 'warn' | 'bad' =
    netZone.key === 'green' ? 'good' : netZone.key === 'yellow' ? 'warn' : 'bad'

  /*
    One score out of a hundred, weighted the way the service spec
    weights it: productivity 30, quality 25, on-time 20, efficiency 15.

    The spec has a fifth part — accuracy and communication, worth 10 —
    which is a manager's written rating, and nobody records one in this
    CRM. Rather than invent it, or quietly give everybody a flat ten, it
    is left out and the other four are scaled back up to a hundred. The
    card says so out loud: a score whose make-up is hidden is a score
    people argue with instead of acting on.
  */
  const firstPass = finished.filter((r) => r.our_changes === 0).length
  const quality = qualityOf(finished.length, firstPass)
  const qualityTone: 'good' | 'warn' | 'bad' =
    (quality ?? 0) >= 90 ? 'good' : (quality ?? 0) >= 70 ? 'warn' : 'bad'
  const effTone: 'good' | 'warn' | 'bad' | undefined =
    eff === null ? undefined : eff >= 100 ? 'good' : eff >= 80 ? 'warn' : 'bad'

  const kpi = [
    { key: 'Productivity', weight: 30, value: Math.min(pointTarget > 0 ? (netPts / pointTarget) * 100 : 0, 100), hue: 'orange' },
    { key: 'Quality', weight: 25, value: quality ?? 0, hue: 'green' },
    { key: 'On time', weight: 20, value: onTimePct ?? 0, hue: 'teal' },
    { key: 'Efficiency', weight: 15, value: Math.min(eff ?? 0, 100), hue: 'blue' },
  ] as const
  const kpiWeight = kpi.reduce((n, k) => n + k.weight, 0)
  const kpiScore = Math.round(kpi.reduce((n, k) => n + k.value * k.weight, 0) / kpiWeight)
  const kpiReady = finished.length > 0

  const byType = useMemo(() => {
    const m = new Map<string, { n: number; onTime: number; actual: number; allowed: number }>()
    for (const r of rows) {
      if (!r.is_done || !r.work_type) continue
      const t = m.get(r.work_type) ?? { n: 0, onTime: 0, actual: 0, allowed: 0 }
      t.n += 1
      if (r.on_time === true) t.onTime += 1
      t.actual += r.actual_mins
      t.allowed += r.allowed_mins ?? 0
      m.set(r.work_type, t)
    }
    return [...m.entries()]
      .map(([name, t]) => ({ name, n: t.n, pct: Math.round((t.onTime / t.n) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.n - a.n)
      .slice(0, 8)
  }, [rows])

  /*
    Per designer, the same task-by-task sum as the tiles.

    `design_perf_summary` hands back totals, and a total hides each
    job's overrun — two hours early on one job would quietly pay for two
    hours late on another. So the task rows are grouped here instead.
    Keyed on the designer's name because that is what the task report
    returns; two people with the same name would merge, which is a
    thing to fix in the report, not here.
  */
  const byDesigner = useMemo(() => {
    const m = new Map<string, { gross: number; penalty: number; done: number; firstPass: number }>()
    for (const r of rows) {
      if (!r.is_done || !r.designer) continue
      const t = m.get(r.designer) ?? { gross: 0, penalty: 0, done: 0, firstPass: 0 }
      t.gross += ptsOf(r.allowed_mins ?? 0)
      t.penalty += ptsOf(r.over_mins ?? 0)
      t.done += 1
      if (r.our_changes === 0) t.firstPass += 1
      m.set(r.designer, t)
    }
    return m
  }, [rows])

  // Rows for the bar. Biggest first and capped at eight, so the chart
  // stays readable as the team grows — the table below has everyone.
  const byPerson = useMemo(
    () => [...byDesigner.entries()]
      .map(([name, t]) => ({ name, Net: Math.max(t.gross - t.penalty, 0), Lost: t.penalty }))
      .sort((x, y) => (y.Net + y.Lost) - (x.Net + x.Lost))
      .slice(0, 8),
    [byDesigner],
  )

  const shown = useMemo(() => {
    if (filter === 'done') return rows.filter((r) => r.is_done)
    if (filter === 'open') return rows.filter((r) => !r.is_done)
    if (filter === 'changes') return rows.filter((r) => r.client_changes + r.our_changes > 0)
    return rows
  }, [rows, filter])

  const dataRaw = series.map((p) => ({
    label: axisLabel(p.period, grain),
    Allowed: Math.round(p.allowed_mins / 6) / 10,
    Actual: Math.round(p.actual_mins / 6) / 10,
    Changes: Math.round(p.change_mins / 6) / 10,
    Tasks: p.done_tasks,
  }))

  /*
    All zeros is not a chart.

    The buckets come back even on a day with nothing finished, so the
    area chart drew a flat line along the floor and the panel read as
    broken rather than empty. If there is nothing in it, say so.
  */
  const anyHours = dataRaw.some((d) => d.Allowed > 0 || d.Actual > 0)
  const data = anyHours ? dataRaw : []

  // Green and red that hold up on cream as well as on black
  const good = chart.dark ? '#6ee7b7' : '#047857'
  const bad = chart.dark ? '#fca5a5' : '#b91c1c'
  const warn = chart.dark ? '#fcd34d' : '#b45309'
  const plain = chart.dark ? '#9ca3af' : '#6b6055'

  // A bar on cream needs a softer fill and a softer rail than one on black,
  // or it reads as a solid slab rather than a measure.
  const rail = chart.dark ? 'rgba(255,255,255,0.08)' : 'rgba(23,18,14,0.07)'
  const barOk = chart.dark ? chart.series[1] : '#0E6A62'
  const barMid = chart.dark ? chart.series[2] : '#C2771A'
  const scroll = '[scrollbar-width:thin] [scrollbar-color:rgba(128,128,128,0.35)_transparent]'

  // Row separators are drawn here rather than with divide-*, because a hex in
  // a utility class is not re-mapped for the cream theme and comes out almost
  // black. Tables also need border-collapse: without it the browser keeps the
  // rows 2px apart and each line shows up twice.
  const line = chart.dark ? '#1f1f1f' : 'rgba(23,18,14,0.09)'
  const rule = { borderTop: `1px solid ${line}` }

  // The same shell the sales screens use. Two pages of one product
  // should not disagree about the radius of a box.
  const card = 'rounded-2xl border border-[#242424] bg-[#151515]'
  const input =
    'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  if (ready && !isSuper && !can('design_perf')) {
    return <div className="p-6 text-gray-400">You do not have access to design performance.</div>
  }

  const Tile = ({
    icon: Icon, k, v, sub, tone, hue = 'orange',
  }: {
    icon: typeof Clock
    k: string
    v: string
    sub?: string
    tone?: 'good' | 'bad' | 'warn'
    hue?: keyof typeof HUE
  }) => (
    <div className={`${card} px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(${HUE[hue]},${chart.dark ? 0.30 : 0.24}) 0%, rgba(${HUE[hue]},${chart.dark ? 0.10 : 0.08}) 100%)`,
            color: `rgb(${HUE[hue]})`,
          }}
        >
          <Icon className="h-4.5 w-4.5" size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-gray-500">{k}</span>
          <span
            className={`mt-0.5 block text-2xl font-semibold ${tone ? '' : 'text-white'}`}
            style={tone ? { color: tone === 'good' ? good : tone === 'bad' ? bad : warn } : undefined}
          >
            {v}
          </span>
          {sub && <span className="mt-0.5 block text-xs text-gray-500">{sub}</span>}
        </span>
      </div>
    </div>
  )

  const Stat = ({ icon: Icon, k, v, first }: { icon: typeof Clock; k: string; v: string; first?: boolean }) => (
    <div style={first ? undefined : rule} className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-gray-500">{k}</span>
        <span className="block text-sm font-medium text-white">{v}</span>
      </span>
    </div>
  )

  return (
    <div className="max-w-7xl space-y-5">
      {/* ---- Who, and over what days ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Design performance</h1>
          <p className="mt-1 text-sm text-gray-400">
            How much work was done, and how fast it was done · {periodLabel}
          </p>
        </div>
        {/* Up here, because these pills set the days for EVERY figure on
            the page — the points, the chart, the task list and the Excel.
            Tucked away beside the task list they looked like a filter for
            that list alone. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => pickPeriod(p.key)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  period === p.key ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <DateField value={from} onChange={setFrom} placeholder="From" />
              <span className="text-xs text-gray-600">to</span>
              <DateField value={to} onChange={setTo} placeholder="To" />
            </div>
          )}

          <button
            onClick={() => { setLoading(true); void load() }}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      {/*
        The band at the top.

        A faint wash of brand orange across it, so the page opens on
        something that looks made rather than assembled, and the name
        sits where the eye lands first. The line under it is the one
        sentence a person actually wants: am I ahead or behind, right
        now.
      */}
      <div
        className={`${card} flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5`}
        /*
          The wash runs the whole width.

          It used to fade out at 70% and leave the right-hand third
          plainly darker, so the band read as two pieces joined badly
          rather than one surface. Every stop now carries colour, and
          the last one still has some in it.
        */
        style={{
          backgroundImage: chart.dark
            ? 'linear-gradient(100deg, rgba(255,94,0,0.20) 0%, rgba(255,94,0,0.09) 42%, rgba(255,94,0,0.05) 75%, rgba(255,94,0,0.08) 100%)'
            : 'linear-gradient(100deg, rgba(255,94,0,0.16) 0%, rgba(255,94,0,0.07) 42%, rgba(255,94,0,0.04) 75%, rgba(255,94,0,0.07) 100%)',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {/* Solid, not a tint. On a band that is itself washed orange a
              faint orange square disappeared into it. */}
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-white"
            style={{
              backgroundImage: 'linear-gradient(135deg, #FF7A2B 0%, #FF5E00 55%, #C94400 100%)',
              boxShadow: '0 6px 16px rgba(255,94,0,0.28)',
            }}
          >
            {who ? initials(person?.full_name ?? null) : '👥'}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-white">
              {who ? person?.full_name ?? '—' : 'Everyone in design'}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {who
                ? [person?.designation, person?.emp_code].filter(Boolean).join(' · ') || 'Design team'
                : `${summary.length} designer${summary.length === 1 ? '' : 's'}`}
            </span>
            {/* Ahead or behind, in one line. No cheerleading when the
                answer is no — a page that congratulates everybody stops
                being read. */}
            {pointTarget > 0 && finished.length > 0 && (
              <span className="mt-1 block text-sm">
                {netPct >= 100 ? (
                  <span style={{ color: good }}>Past the target — {netPts.toLocaleString('en-IN')} of {pointTarget.toLocaleString('en-IN')} points.</span>
                ) : netPct >= 70 ? (
                  <span style={{ color: good }}>On track · {Math.round(netPct)}% of {TARGET_LABEL[period].toLowerCase()}.</span>
                ) : netPct >= 30 ? (
                  <span style={{ color: warn }}>{(pointTarget - netPts).toLocaleString('en-IN')} points still to go.</span>
                ) : (
                  <span style={{ color: bad }}>Well behind · {Math.round(netPct)}% of {TARGET_LABEL[period].toLowerCase()}.</span>
                )}
              </span>
            )}
          </span>
        </div>

        {/*
          The four counts that used to sit in a second row of boxes.

          Four more cards for four small integers was the page getting
          wider instead of clearer — the reference layout has one row of
          tiles and then charts, and it is denser for it. Here they read
          as one sentence about the workload, next to whose workload it
          is.
        */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-l border-[#242424] pl-6 text-sm">
          {([
            ['In hand', String(assigned), plain],
            ['Finished', String(total.done), good],
            ['Running', String(started.length), warn],
            ['In time', onTimePct === null ? '—' : `${onTimePct}%`,
              onTimePct === null ? plain : onTimePct >= 70 ? good : bad],
          ] as [string, string, string][]).map(([k, v, c]) => (
            <span key={k}>
              <span className="block text-[11px] text-gray-500">{k}</span>
              <span className="block text-lg font-semibold tabular-nums" style={{ color: c }}>{v}</span>
            </span>
          ))}
        </div>

        {who && person?.date_of_joining && (
          <div className="border-l border-[#242424] pl-6">
            <p className="text-xs text-gray-500">Joined</p>
            <p className="mt-0.5 text-sm text-white">{day(person.date_of_joining)}</p>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-end gap-3">
          {seeAll && (
            <label className="block">
              <span className="mb-1.5 block text-xs text-gray-400">Designer</span>
              <select value={who} onChange={(e) => setWho(e.target.value)} className={`${input} min-w-[170px]`}>
                <option value="">Everyone</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* ---- The five numbers ---- */}
      {/* ---- Points: what was earned, what was lost, what is left ---- */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Tile hue="purple" icon={Target} k={TARGET_LABEL[period]}
              v={pointTarget.toLocaleString('en-IN')}
              sub={`${DAILY_POINTS} a day × ${workDays(from, to)} working day${workDays(from, to) === 1 ? '' : 's'}${who ? '' : ` × ${headcount}`}`} />
        <Tile hue="blue" icon={Award} k="Gross points" v={grossPts.toLocaleString('en-IN')}
              sub={`${finished.length} finished job${finished.length === 1 ? '' : 's'}`} />
        <Tile hue="red" icon={TrendingDown} k="Negative points" v={penaltyPts > 0 ? `−${penaltyPts.toLocaleString('en-IN')}` : '0'}
              sub={provisionalPts > 0 ? `${provisionalPts.toLocaleString('en-IN')} more running` : 'Time over the allowance'}
              tone={penaltyPts > 0 ? 'bad' : undefined} />
        {/* The one that counts. Everything either side of it explains it. */}
        <Tile hue="orange" icon={CheckCircle2} k="Net points" v={netPts.toLocaleString('en-IN')}
              sub={pointTarget > 0
                ? `${Math.round(netPct)}% of ${pointTarget.toLocaleString('en-IN')}${who ? '' : ` · ${headcount} designers`}`
                : undefined}
              tone={pointTarget > 0 ? netTone : undefined} />
        <Tile hue="teal" icon={TrendingUp} k="Time efficiency" v={effText(eff)}
              sub="Allowed against actual" tone={effTone} />
        <Tile hue="green" icon={Award} k="Quality score" v={quality === null ? '—' : `${quality}%`}
              sub={finished.length > 0 ? `${firstPass} of ${finished.length} right first time` : 'Nothing finished yet'}
              tone={quality === null ? undefined : qualityTone} />
      </div>

      {/* ---- How the month is going ---- */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">Target achievement</h2>
          <p className="mt-0.5 text-xs text-gray-500">Net points against {TARGET_LABEL[period].toLowerCase()}.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
            <GaugeRing pct={netPct} colorClass={netZone.text} caption="of target" />
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="block text-xs text-gray-500">Net</span>
                <span className="font-semibold tabular-nums" style={{ color: good }}>
                  {netPts.toLocaleString('en-IN')}
                </span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Still to go</span>
                <span className="font-semibold tabular-nums text-white">
                  {pointTarget > netPts ? (pointTarget - netPts).toLocaleString('en-IN') : '—'}
                </span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Lost to time over</span>
                <span className="tabular-nums" style={{ color: penaltyPts > 0 ? bad : plain }}>
                  {penaltyPts > 0 ? `−${penaltyPts.toLocaleString('en-IN')}` : '0'}
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className={`${card} flex flex-col p-5`}>
          <h2 className="font-medium text-white">Performance score</h2>
          <p className="mt-0.5 text-xs text-gray-500">Four parts, weighted, out of 100.</p>

          {!kpiReady ? (
            <p className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-500">
              <CheckCircle2 size={22} className="opacity-25" />
              {loading ? 'Loading…' : <>Nothing finished in these days.<br /><span className="text-xs text-gray-600">Try Weekly or Monthly above.</span></>}
            </p>
          ) : (
            <>
              <div className="mt-4 flex justify-center">
                <GaugeRing pct={kpiScore} colorClass={zoneOf(kpiScore).text} caption="out of 100" size={132} stroke={11} />
              </div>
              <ul className="mt-4 space-y-2.5">
                {kpi.map((k) => (
                  <li key={k.key}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">
                        {k.key} <span className="text-gray-600">{k.weight}%</span>
                      </span>
                      <span className="tabular-nums text-gray-300">{Math.round(k.value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: rail }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(k.value, 100)}%`, background: `rgb(${HUE[k.hue]})` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              {/* Said plainly, so nobody has to work out why it is not five parts. */}
              <p className="mt-3 text-[11px] text-gray-600">
                A fifth part — accuracy and communication — is a manager's rating the CRM does not
                collect, so it is left out and these four are scaled up.
              </p>
            </>
          )}
        </section>

        {/*
          Points per designer, stacked.

          The whole bar is what the work was worth; the red tail is what
          the overrun took back. Two numbers in one shape, and the gap
          between a long bar and a long red tail is the thing worth
          talking to someone about.
        */}
        <section className={`${card} flex flex-col p-5 lg:col-span-2`}>
          <h2 className="font-medium text-white">Points by designer</h2>
          <p className="mt-0.5 mb-4 text-xs text-gray-500">
            Net earned, with anything lost to time over the allowance beside it.
          </p>
          {byPerson.length === 0 ? (
            <p className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-500">
              <CheckCircle2 size={22} className="opacity-25" />
              {loading ? 'Loading…' : <>Nothing finished in these days.<br /><span className="text-xs text-gray-600">Try Weekly or Monthly above.</span></>}
            </p>
          ) : (
            <div style={{ height: Math.max(byPerson.length * 44, 140) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPerson} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={120}
                         tick={{ fill: chart.axisStrong, fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={chart.tooltip}
                    itemStyle={chart.tooltipItem}
                    cursor={{ fill: chart.cursor }}
                    formatter={(v, n) => [Number(v).toLocaleString('en-IN'), String(n)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Net" stackId="p" radius={[0, 0, 0, 0]}>
                    {byPerson.map((d, i) => (
                      <Cell key={d.name} fill={i === 0 ? chart.series[0] : chart.series[1]} />
                    ))}
                  </Bar>
                  <Bar dataKey="Lost" stackId="p" fill={bad} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* ---- Trend, split, quick stats ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} flex flex-col p-4 lg:col-span-2`}>
          <div className="mb-3">
            <h2 className="font-medium text-white">Hours — allowed against actual</h2>
            <p className="mt-0.5 text-xs text-gray-500">{periodLabel}</p>
          </div>
          {data.length === 0 ? (
            <p className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-sm text-gray-500">
              <CheckCircle2 size={22} className="opacity-25" />
              {loading ? 'Loading…' : <>No finished design work in these days.<br /><span className="text-xs text-gray-600">Try Weekly or Monthly above.</span></>}
            </p>
          ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gAllowed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.series[1]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chart.series[1]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.series[0]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chart.series[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={10} />
                <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} unit="h" />
                <Tooltip
                  contentStyle={chart.tooltip}
                  itemStyle={chart.tooltipItem}
                  labelStyle={{ color: chart.axisStrong, marginBottom: 2 }}
                  formatter={(v, n) => [`${Number(v) || 0} h`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Allowed" stroke={chart.series[1]} strokeWidth={2} fill="url(#gAllowed)" />
                <Area type="monotone" dataKey="Actual" stroke={chart.series[0]} strokeWidth={2.5} fill="url(#gActual)" />
                <Area type="monotone" dataKey="Changes" stroke={chart.series[2]} strokeWidth={1.5} fillOpacity={0} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          )}
        </section>

        <div className="space-y-4">
          <section className={`${card} p-4`}>
            <h2 className="mb-2 font-medium text-white">Where the work stands</h2>
            <div className="h-48">
              <DonutChart
                data={[
                  { name: 'Finished', value: total.done, color: chart.series[1] },
                  { name: 'Running', value: started.length, color: chart.series[0] },
                  { name: 'Not started', value: notStarted.length, color: chart.series[3] },
                ]}
                centerLabel="Tasks"
                empty="Nothing in these days."
              />
            </div>
          </section>

          <section className={card}>
            <Stat first icon={Timer} k="Average time on a finished job" v={avgDone > 0 ? mins(avgDone) : '—'} />
            <Stat icon={Clock} k="Hours at work in these days" v={mins(total.worked)} />
            <Stat
              icon={RotateCcw}
              k={`On changes · ${total.client} client · ${total.ours} ours`}
              v={mins(total.change)}
            />
            <Stat
              icon={TrendingUp}
              k="Efficiency · allowed ÷ actual"
              v={effText(eff)}
            />
          </section>
        </div>
      </div>

      {/* Shows itself only to whoever may decide, and only when
          something is waiting. */}
      <ExtraTimeInbox onDecided={() => { setLoading(true); void load() }} />

      {/* ---- Every task, and what is running now ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="space-y-3 border-b border-[#242424] px-5 py-3.5">
            {/* Which days, and the Excel of exactly those days. Both live here
                because this is the list a person actually looks at before
                downloading — a control at the top of the page left them
                guessing what the file would hold. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <h2 className="font-medium text-white">Every task</h2>
                <p className="mt-0.5 text-xs text-gray-500">{periodLabel}</p>
              </span>
              <button
                onClick={download}
                disabled={saving || rows.length === 0}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Excel · {rows.length}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/*
                The same days as the top of the page, not a second
                setting — both sets read and write one piece of state, so
                they can never fall out of step.

                Repeated here because the page is long. By the time
                somebody has scrolled to the task list, the control at
                the top is off the screen, and the one thing they want
                next is usually a different stretch of days.
              */}
              <div className="flex gap-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => pickPeriod(p.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                      period === p.key
                        ? 'bg-orange-500/15 font-medium text-orange-400'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {period === 'custom' && (
                <div className="flex items-center gap-2">
                  {/* The CRM's own picker, not the browser's. A page with
                      two kinds of calendar on it looks like two programs
                      stitched together — and the browser's is white. */}
                  <DateField value={from} onChange={setFrom} placeholder="From" />
                  <span className="text-xs text-gray-600">to</span>
                  <DateField value={to} onChange={setTo} placeholder="To" />
                </div>
              )}

              <div className="ml-auto flex gap-1">
                {([
                  ['all', `All ${rows.length}`],
                  ['done', `Finished ${total.done}`],
                  ['open', `Open ${open.length}`],
                  ['changes', `Changed ${rows.filter((r) => r.client_changes + r.our_changes > 0).length}`],
                ] as [Filter, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                      filter === k ? 'bg-orange-500/15 font-medium text-orange-400' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={`max-h-[420px] overflow-auto ${scroll}`}>
            <table className="w-full min-w-[780px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#151515]">
                <tr style={{ borderBottom: `1px solid ${line}` }} className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Work</th>
                  {!who && <th className="px-4 py-2.5 font-medium">Designer</th>}
                  <th className="px-4 py-2.5 text-right font-medium">Allowed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actual</th>
                  <th className="px-4 py-2.5 font-medium">Progress</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.task_no} style={rule} className="hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-500">{r.task_no}</td>
                    <td className="max-w-[220px] px-4 py-2.5">
                      <span className="block truncate text-gray-200" title={r.subject}>{r.subject}</span>
                      {(r.client_changes > 0 || r.our_changes > 0) && (
                        <span className="text-[11px]" style={{ color: r.our_changes > 0 ? warn : plain }}>
                          {r.client_changes > 0 && <>{r.client_changes} client</>}
                          {r.client_changes > 0 && r.our_changes > 0 && ' · '}
                          {r.our_changes > 0 && <>{r.our_changes} ours</>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {r.work_type ?? <span style={{ color: warn }}>No work type</span>}
                      {r.qty > 1 && <span className="text-gray-600"> · {r.qty} {r.unit}s</span>}
                    </td>
                    {!who && <td className="max-w-[120px] truncate px-4 py-2.5 text-gray-400">{r.designer ?? '—'}</td>}
                    {/* No work type means no allowed time. It shows as a
                        dash, not a zero — a zero would read as "nothing
                        allowed", which would paint the row red. */}
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                      {r.allowed_mins === null
                        ? <span title="No work type set on this task">—</span>
                        : mins(r.allowed_mins)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right font-medium tabular-nums"
                      style={{ color: r.allowed_mins === null ? plain : r.base_mins > r.allowed_mins ? bad : good }}
                    >
                      {mins(r.base_mins)}
                      {r.change_mins > 0 && (
                        <span className="block text-[11px] font-normal" style={{ color: warn }}>
                          +{mins(r.change_mins)} chg
                        </span>
                      )}
                    </td>
                    {/* How far through its allowed time. Past the line it
                        turns red, which is the moment worth seeing on a
                        list rather than in a report afterwards. */}
                    <td className="w-[15%] px-4 py-2.5">
                      {r.allowed_mins && r.allowed_mins > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: rail }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min((r.base_mins / r.allowed_mins) * 100, 100)}%`,
                                background: r.base_mins > r.allowed_mins ? bad : chart.series[0],
                              }}
                            />
                          </div>
                          <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-gray-500">
                            {Math.round((r.base_mins / r.allowed_mins) * 100)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.is_done ? '' : 'text-gray-400'}`}
                            style={r.is_done ? { background: 'rgba(5,150,105,0.14)', color: good } : { background: 'rgba(255,255,255,0.05)' }}>
                        {r.stage ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={who ? 7 : 8} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing here.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">Open right now</h2>
            <p className="mt-0.5 text-xs text-gray-500">How far through its allowed time each one is.</p>
          </div>
          <ul className={`max-h-[420px] overflow-auto ${scroll}`}>
            {open.slice(0, 12).map((r, i) => {
              const pct = r.allowed_mins && r.allowed_mins > 0
                ? Math.min(999, Math.round((r.actual_mins / r.allowed_mins) * 100))
                : null
              const over = (pct ?? 0) > 100
              return (
                <li key={r.task_no} style={i === 0 ? undefined : rule} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-gray-200" title={r.subject}>{r.subject}</span>
                      <span className="block text-xs text-gray-500">
                        {r.work_type ?? <span style={{ color: warn }}>No work type</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: over ? bad : plain }}>
                      {pct === null ? '—' : `${pct}%`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: rail }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: over ? bad : chart.series[0] }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {mins(r.actual_mins)}{r.allowed_mins === null ? ' · no allowed time set' : ` of ${mins(r.allowed_mins)}`}
                    {r.in_changes && <span style={{ color: warn }}> · in changes</span>}
                  </p>
                </li>
              )
            })}
            {open.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Nothing open.'}
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* ---- By kind of work, and the team ---- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">Which work goes best</h2>
          <p className="mb-4 mt-0.5 text-xs text-gray-500">
            Share of finished jobs that stayed inside their allowed time.
          </p>
          <ul className="space-y-3.5">
            {byType.map((t) => (
              <li key={t.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-gray-300">{t.name}</span>
                  <span className="shrink-0 tabular-nums text-gray-400">
                    {t.pct}% <span className="text-gray-600">· {t.n}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: rail }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.pct}%`, background: t.pct >= 70 ? barOk : barMid }}
                  />
                </div>
              </li>
            ))}
            {byType.length === 0 && (
              <li className="py-8 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Nothing finished in these days.'}
              </li>
            )}
          </ul>
        </section>

        <section className={`${card} overflow-hidden`}>
          <div className="border-b border-[#242424] px-5 py-3">
            <h2 className="font-medium text-white">{who ? 'The rest of the team' : 'Each designer'}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Net is gross less the time-over penalty. Quality is the share finished right the first
              time; a client's change round is not counted against anyone.
            </p>
          </div>
          <div className={`max-h-[360px] overflow-auto ${scroll}`}>
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#151515]">
                <tr style={{ borderBottom: `1px solid ${line}` }} className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Designer</th>
                  <th className="px-4 py-2.5 text-right font-medium">Finished</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-4 py-2.5 text-right font-medium">Negative</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net</th>
                  <th className="px-4 py-2.5 text-right font-medium">Quality</th>
                  <th className="px-4 py-2.5 text-right font-medium">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr
                    key={r.user_id}
                    onClick={() => seeAll && setWho(r.user_id)}
                    style={rule}
                    className={`hover:bg-[#1a1a1a] ${seeAll ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-gray-200">{r.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">{r.done_tasks}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-300">
                      {(byDesigner.get(r.full_name ?? '')?.gross ?? 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums"
                        style={{ color: (byDesigner.get(r.full_name ?? '')?.penalty ?? 0) > 0 ? bad : plain }}>
                      {(byDesigner.get(r.full_name ?? '')?.penalty ?? 0) > 0
                        ? `−${(byDesigner.get(r.full_name ?? '')?.penalty ?? 0).toLocaleString('en-IN')}`
                        : '0'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-white"
                        title={`${mins(r.allowed_mins)} of standard time`}>
                      {Math.max(
                        (byDesigner.get(r.full_name ?? '')?.gross ?? 0)
                        - (byDesigner.get(r.full_name ?? '')?.penalty ?? 0), 0,
                      ).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums"
                        title={`${r.our_changes} of our own redos`}
                        style={{ color: r.our_changes > 0 ? warn : plain }}>
                      {(() => {
                        const d = byDesigner.get(r.full_name ?? '')
                        const q = qualityOf(d?.done ?? 0, d?.firstPass ?? 0)
                        return q === null ? '—' : `${q}%`
                      })()}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right font-medium tabular-nums"
                      title={effOf(r.allowed_mins, r.base_mins) === null
                        ? 'Too little time on the clock to tell'
                        : `${mins(r.allowed_mins)} allowed · ${mins(r.base_mins)} on the original work`}
                      style={{
                        color: effOf(r.allowed_mins, r.base_mins) === null
                          ? plain
                          : (effOf(r.allowed_mins, r.base_mins) as number) >= 100 ? good : bad,
                      }}
                    >
                      {effText(effOf(r.allowed_mins, r.base_mins))}
                    </td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing finished in these days.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <p className="text-xs text-gray-600">
        Gross points are the standard time of the work at 20 an hour — the same figure as "Allowed",
        in the unit the All Services sheet uses. Every hour of active time beyond the allowance takes
        20 points back off, worked out job by job, and net points cannot fall below zero. The target is
        160 points for each working day in these dates, Sundays left out, times the number of designers
        shown. Leave is not in the CRM yet, so somebody who was away still carries a full target.
        Penalties on jobs still running are provisional and are shown apart from the settled ones. Only design work with a work type set is counted. Efficiency is measured on the original work:
        the hours that follow a client's change round are counted separately and held against nobody.
        A redo caused by our own mistake stays in the original work, because that is our own time to
        make up. "Open right now" lists every unfinished job, whenever it was started.
      </p>
    </div>
  )
}