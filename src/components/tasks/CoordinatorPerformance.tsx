import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertCircle, CheckCircle2, Clock3, Hourglass, Inbox, Loader2, RotateCcw, Send, Timer, XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useChartTheme } from '../../lib/chartTheme'
import { zoneOf } from '../../lib/targets'
import DonutChart from '../DonutChart'
import GaugeRing from '../GaugeRing'
import { mins } from './taskUtils'

/*
  The project coordinator's page.

  A coordinator does not design, so the designer's yardstick — points per
  allowed hour, 160 a day — measures the wrong thing and would show them
  "well behind" every day. Their job is getting work to the right
  designer quickly, getting it finished on time, and not leaving anyone
  waiting. So that is what this measures — in the same look as the
  designer's page: a band at the top, six tiles, a gauge, a donut, who
  got the work, a trend, and every task.

  Two shapes:
    only set  → the whole page for one coordinator (their own "My
                performance", or picked from the list)
    only unset → a compact card per coordinator, under the team report

  Two requests when the days change (the figures and the task list),
  nothing polls.
*/

type Row = {
  user_id: string
  full_name: string
  assigned_tasks: number
  avg_assign_mins: number | null
  done_tasks: number
  done_on_time: number
  done_with_due: number
  client_changes: number
  our_changes: number
  rejected_tasks: number
  time_decided: number
  time_approved: number
  avg_decide_mins: number | null
  waiting_designer: number
  overdue_open: number
  pending_requests: number
}

type TaskRow = {
  task_id: string
  task_no: number
  subject: string
  work_type: string | null
  designers: string[]
  stage: string | null
  is_done: boolean
  is_rejected: boolean
  created_at: string
  handed_at: string
  hand_mins: number | null
  due_at: string | null
  completed_at: string | null
  on_time: boolean | null
  client_changes: number
  our_changes: number
}

const HUE: Record<string, string> = {
  orange: '255,94,0',
  green: '16,163,113',
  blue: '59,130,246',
  teal: '13,148,136',
  amber: '217,119,6',
  red: '220,70,70',
  purple: '147,97,207',
}

const TZ = 'Asia/Kolkata'
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
const short = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const initials = (name: string | null) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'

export default function CoordinatorPerformance({
  from, to, card, only, picker, profileLine,
}: {
  from: string
  to: string
  card: string
  // One coordinator — the whole page for them
  only?: string
  // The person picker, so the page can still be switched (admin)
  picker?: ReactNode
  // "Project Co-ordinator · SP010"
  profileLine?: string
}) {
  const chart = useChartTheme()
  const [rows, setRows] = useState<Row[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [show, setShow] = useState<'all' | 'open' | 'done' | 'late' | 'back'>('all')

  useEffect(() => {
    let dead = false
    setLoading(true)
    void (async () => {
      const [a, b] = await Promise.all([
        supabase.rpc('coordinator_perf', { p_from: from || null, p_to: to || null }),
        // The task list only for the full page — the compact cards do not use it.
        only
          ? supabase.rpc('coordinator_tasks', { p_from: from || null, p_to: to || null, p_user: only })
          : Promise.resolve({ data: [], error: null }),
      ])
      if (dead) return
      setLoading(false)
      const e = a.error ?? b.error
      if (e) return setErr(e.message)
      setErr('')
      const all = (a.data ?? []) as Row[]
      setRows(only ? all.filter((r) => r.user_id === only) : all)
      setTasks((b.data ?? []) as TaskRow[])
    })()
    return () => { dead = true }
  }, [from, to, only])

  const good = chart.dark ? '#6ee7b7' : '#047857'
  const bad = chart.dark ? '#fca5a5' : '#b91c1c'
  const warn = chart.dark ? '#fcd34d' : '#b45309'
  const plain = chart.dark ? '#9ca3af' : '#6b6055'

  const dur = (m: number | null | undefined) => (m === null || m === undefined ? '—' : mins(m))
  const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a * 100) / b) : null)

  // ---------- figures from the task list (full page) ----------
  const done = useMemo(() => tasks.filter((t) => t.is_done), [tasks])
  const open = useMemo(() => tasks.filter((t) => !t.is_done && !t.is_rejected), [tasks])
  const late = useMemo(
    () => open.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now()),
    [open],
  )
  const cameBack = useMemo(() => tasks.filter((t) => t.client_changes + t.our_changes > 0), [tasks])

  // Who got the work — handed and finished, per designer
  const byDesigner = useMemo(() => {
    const m = new Map<string, { name: string; Handed: number; Finished: number }>()
    for (const t of tasks) {
      for (const d of t.designers.length ? t.designers : ['Not handed yet']) {
        const x = m.get(d) ?? { name: d, Handed: 0, Finished: 0 }
        x.Handed += 1
        if (t.is_done) x.Finished += 1
        m.set(d, x)
      }
    }
    return [...m.values()].sort((a, b) => b.Handed - a.Handed).slice(0, 10)
  }, [tasks])

  // Handed vs finished over the days — day by day up to a month, weekly beyond
  const trend = useMemo(() => {
    const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / 86400000
    const weekly = spanDays > 35
    const keyOf = (iso: string) => {
      const d = dayKey(iso)
      if (!weekly) return d
      const dt = new Date(d)
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
      return monday.toISOString().slice(0, 10)
    }
    const m = new Map<string, { k: string; Handed: number; Finished: number }>()
    for (const t of tasks) {
      const h = keyOf(t.handed_at)
      if (h >= from && h <= to) {
        const x = m.get(h) ?? { k: h, Handed: 0, Finished: 0 }
        x.Handed += 1
        m.set(h, x)
      }
      if (t.completed_at && t.is_done) {
        const c = keyOf(t.completed_at)
        const x = m.get(c) ?? { k: c, Handed: 0, Finished: 0 }
        x.Finished += 1
        m.set(c, x)
      }
    }
    return [...m.values()]
      .sort((a, b) => a.k.localeCompare(b.k))
      .map((x) => ({
        ...x,
        label: new Date(x.k).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      }))
  }, [tasks, from, to])

  const shownTasks = useMemo(() => {
    if (show === 'open') return open
    if (show === 'done') return done
    if (show === 'late') return late
    if (show === 'back') return cameBack
    return tasks
  }, [show, tasks, open, done, late, cameBack])

  if (loading && rows.length === 0) {
    return only ? <div className="py-16 text-center text-gray-500"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div> : null
  }
  if (!err && rows.length === 0) {
    return only
      ? <div className={`${card} p-6 text-sm text-gray-400`}>Nothing to show for this coordinator.</div>
      : null
  }

  // ===================== compact: one card per coordinator =====================
  if (!only) {
    return (
      <section className={`${card} p-5`}>
        <div className="mb-4">
          <h2 className="font-medium text-white">Project coordinators</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Not counted with the designers. Pick one from the list above for their full page.
          </p>
        </div>
        {err && <ErrLine text={err} />}
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const ot = pctOf(r.done_on_time, r.done_with_due)
            return (
              <div key={r.user_id} className="rounded-xl border border-[#242424] bg-[#171717] p-4">
                <p className="mb-2 text-sm font-medium text-white">{r.full_name}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Mini k="Handed out" v={String(r.assigned_tasks)} sub={`${dur(r.avg_assign_mins)} on average`} />
                  <Mini k="Finished on time" v={ot === null ? '—' : `${ot}%`}
                        color={ot === null ? plain : ot >= 80 ? good : bad}
                        sub={`${r.done_on_time} of ${r.done_with_due}`} />
                  <Mini k="Came back" v={String(r.client_changes + r.our_changes)}
                        sub={`${r.our_changes} our mistake`} color={r.our_changes > 0 ? warn : undefined} />
                  <Mini k="Waiting now" v={String(r.waiting_designer)}
                        color={r.waiting_designer > 0 ? warn : undefined} sub={`${r.overdue_open} past due`} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  // ===================== the whole page for one coordinator =====================
  const r = rows[0]
  const onTime = pctOf(r.done_on_time, r.done_with_due)
  const approvePct = pctOf(r.time_approved, r.time_decided)

  const Tile = ({
    icon: Icon, k, v, sub, tone, hue = 'orange',
  }: {
    icon: typeof Send
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
          <Icon size={18} />
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

  return (
    <div className="space-y-5">
      {/* ---- The band at the top — same as the designer's ---- */}
      <div
        className={`${card} flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5`}
        style={{
          backgroundImage: chart.dark
            ? 'linear-gradient(100deg, rgba(255,94,0,0.20) 0%, rgba(255,94,0,0.09) 42%, rgba(255,94,0,0.05) 75%, rgba(255,94,0,0.08) 100%)'
            : 'linear-gradient(100deg, rgba(255,94,0,0.16) 0%, rgba(255,94,0,0.07) 42%, rgba(255,94,0,0.04) 75%, rgba(255,94,0,0.07) 100%)',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-semibold text-white"
            style={{
              backgroundImage: 'linear-gradient(135deg, #FF7A2B 0%, #FF5E00 55%, #C94400 100%)',
              boxShadow: '0 6px 16px rgba(255,94,0,0.28)',
            }}
          >
            {initials(r.full_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-semibold text-white">{r.full_name}</span>
            <span className="block truncate text-xs text-gray-500">{profileLine || 'Project coordinator'}</span>
            {/* The one sentence: is anything stuck with me right now. */}
            <span className="mt-1 block text-sm">
              {r.waiting_designer > 0 ? (
                <span style={{ color: warn }}>
                  {r.waiting_designer} task{r.waiting_designer === 1 ? '' : 's'} waiting for a designer.
                </span>
              ) : r.overdue_open > 0 ? (
                <span style={{ color: bad }}>
                  {r.overdue_open} handed task{r.overdue_open === 1 ? '' : 's'} past the due date.
                </span>
              ) : (
                <span style={{ color: good }}>Nothing waiting — every task is with a designer.</span>
              )}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-l border-[#242424] pl-6 text-sm">
          {([
            ['In hand', String(open.length), plain],
            ['Finished', String(done.length), good],
            ['Past due', String(late.length), late.length ? bad : plain],
            ['On time', onTime === null ? '—' : `${onTime}%`, onTime === null ? plain : onTime >= 80 ? good : bad],
          ] as [string, string, string][]).map(([k, v, c]) => (
            <span key={k}>
              <span className="block text-[11px] text-gray-500">{k}</span>
              <span className="block text-lg font-semibold tabular-nums" style={{ color: c }}>{v}</span>
            </span>
          ))}
        </div>

        {picker && <div className="ml-auto flex flex-wrap items-end gap-3">{picker}</div>}
      </div>

      {err && <ErrLine text={err} />}

      {/* ---- Six tiles ---- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Tile hue="blue" icon={Send} k="Handed to designers" v={String(r.assigned_tasks)}
              sub="tasks given out in these days" />
        <Tile hue="purple" icon={Timer} k="Time to hand out" v={dur(r.avg_assign_mins)}
              sub="from task made to designer" />
        <Tile hue="green" icon={CheckCircle2} k="Finished" v={String(r.done_tasks)}
              sub={`${r.done_on_time} on time · ${r.done_with_due} had a due date`} />
        <Tile hue="teal" icon={Clock3} k="On time" v={onTime === null ? '—' : `${onTime}%`}
              sub="finished before the due date"
              tone={onTime === null ? undefined : onTime >= 80 ? 'good' : 'bad'} />
        <Tile hue="amber" icon={RotateCcw} k="Came back" v={String(r.client_changes + r.our_changes)}
              sub={`${r.client_changes} client · ${r.our_changes} our mistake${r.rejected_tasks ? ` · ${r.rejected_tasks} rejected` : ''}`}
              tone={r.our_changes > 0 ? 'warn' : undefined} />
        <Tile hue="orange" icon={Hourglass} k="Extra time decided" v={String(r.time_decided)}
              sub={r.time_decided > 0 ? `${r.time_approved} approved · ${dur(r.avg_decide_mins)} to decide` : 'none in these days'} />
      </div>

      {/* ---- Gauge, where the tasks are, who got them ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">On time</h2>
          <p className="mt-0.5 text-xs text-gray-500">Finished tasks that met their due date.</p>
          <div className="mt-4 flex items-center gap-6">
            <GaugeRing pct={onTime ?? 0} colorClass={zoneOf(onTime ?? 0).text} caption="on time" />
            <ul className="space-y-2.5 text-sm">
              <li>
                <span className="block text-xs text-gray-500">On time</span>
                <span className="font-semibold tabular-nums" style={{ color: good }}>{r.done_on_time}</span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Late</span>
                <span className="font-semibold tabular-nums" style={{ color: r.done_with_due - r.done_on_time ? bad : plain }}>
                  {r.done_with_due - r.done_on_time}
                </span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Extra time approved</span>
                <span className="font-semibold tabular-nums text-white">{approvePct === null ? '—' : `${approvePct}%`}</span>
              </li>
            </ul>
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">Where their tasks are</h2>
          <p className="mt-0.5 text-xs text-gray-500">Everything they handed out in these days.</p>
          <div className="mt-2">
            <DonutChart
              data={[
                { name: 'Finished', value: done.length, color: chart.series[1] },
                { name: 'In hand', value: open.length - late.length, color: chart.series[0] },
                { name: 'Past due', value: late.length, color: bad },
                { name: 'Rejected', value: tasks.filter((t) => t.is_rejected).length, color: chart.series[3] },
              ]}
              centerLabel="Tasks"
              empty="Nothing handed out in these days."
            />
          </div>
        </section>

        <section className={`${card} p-5`}>
          <h2 className="font-medium text-white">Who got the work</h2>
          <p className="mt-0.5 text-xs text-gray-500">Handed and finished, by designer.</p>
          {byDesigner.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Nothing handed out in these days.</p>
          ) : (
            <div className="mt-3" style={{ height: Math.max(160, byDesigner.length * 34) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDesigner} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={110}
                         tick={{ fill: chart.axisStrong, fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} cursor={{ fill: chart.cursor }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Handed" fill={chart.series[0]} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Finished" fill={chart.series[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* ---- Trend ---- */}
      <section className={`${card} p-5`}>
        <h2 className="font-medium text-white">Handed out against finished</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          If handed keeps running ahead of finished, work is piling up with the designers.
        </p>
        {trend.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">Nothing in these days.</p>
        ) : (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={chart.tooltip} itemStyle={chart.tooltipItem} cursor={{ fill: chart.cursor }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Handed" fill={chart.series[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Finished" fill={chart.series[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ---- Right now ---- */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Now icon={Inbox} n={r.waiting_designer} text="tasks waiting for a designer (whole team)" />
        <Now icon={XCircle} n={r.overdue_open} text="of theirs past the due date" />
        <Now icon={Hourglass} n={r.pending_requests} text="extra-time requests waiting" />
      </div>

      {/* ---- Every task ---- */}
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="font-medium text-white">Every task they handed out</h2>
            <p className="mt-0.5 text-xs text-gray-500">Handed out, or finished, in these days.</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['all', `All ${tasks.length}`],
              ['open', `In hand ${open.length}`],
              ['done', `Finished ${done.length}`],
              ['late', `Past due ${late.length}`],
              ['back', `Came back ${cameBack.length}`],
            ] as [typeof show, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setShow(k)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  show === k ? 'bg-orange-500/15 font-medium text-orange-300' : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                <th className="px-5 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Task</th>
                <th className="px-3 py-2.5 font-medium">Designer</th>
                <th className="px-3 py-2.5 font-medium">Handed</th>
                <th className="px-3 py-2.5 text-right font-medium">Took</th>
                <th className="px-3 py-2.5 font-medium">Due</th>
                <th className="px-3 py-2.5 font-medium">Stage</th>
                <th className="px-3 py-2.5 font-medium">Finished</th>
                <th className="px-3 py-2.5 text-right font-medium">Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f1f]">
              {shownTasks.map((t) => {
                const pastDue = !t.is_done && !t.is_rejected && t.due_at && new Date(t.due_at).getTime() < Date.now()
                return (
                  <tr key={t.task_id} className="hover:bg-[#1a1a1a]">
                    <td className="px-5 py-2.5 text-gray-500">{t.task_no}</td>
                    <td className="max-w-[240px] px-3 py-2.5">
                      <span className="block truncate text-white">{t.subject}</span>
                      {t.work_type && <span className="block truncate text-[11px] text-gray-500">{t.work_type}</span>}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2.5 text-gray-300">
                      {t.designers.length ? t.designers.join(', ') : <span style={{ color: warn }}>Nobody yet</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">{short(t.handed_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-300">{dur(t.hand_mins)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5" style={{ color: pastDue ? bad : undefined }}>
                      <span className={pastDue ? '' : 'text-gray-400'}>{short(t.due_at)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded bg-[#232323] px-1.5 py-0.5 text-xs text-gray-300">{t.stage ?? '—'}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5"
                        style={{ color: t.on_time === null ? undefined : t.on_time ? good : bad }}>
                      <span className={t.on_time === null ? 'text-gray-500' : ''}>
                        {t.is_done ? short(t.completed_at) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: t.our_changes ? warn : undefined }}>
                      <span className={t.our_changes ? '' : 'text-gray-400'}>
                        {t.client_changes + t.our_changes || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {shownTasks.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-gray-500">
                    {loading ? 'Loading…' : 'Nothing here in these days.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-gray-600">
        A coordinator is not given points or a 160-a-day target — that yardstick is for designing. "Time to
        hand out" counts only tasks someone else created. "On time" counts finished tasks that had a due
        date. "Came back" adds the client's change rounds and our own; only our own counts against the
        work. The chips above are right now, not the days chosen.
      </p>
    </div>
  )
}

function ErrLine({ text }: { text: string }) {
  return (
    <p className="mb-3 flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <AlertCircle className="h-4 w-4" /> {text}
    </p>
  )
}

function Mini({ k, v, sub, color }: { k: string; v: string; sub?: string; color?: string }) {
  return (
    <div>
      <span className="block text-[11px] text-gray-500">{k}</span>
      <span className={`block text-lg font-semibold tabular-nums ${color ? '' : 'text-white'}`} style={color ? { color } : undefined}>
        {v}
      </span>
      {sub && <span className="block text-[11px] text-gray-500">{sub}</span>}
    </div>
  )
}

function Now({ icon: Icon, n, text }: { icon: typeof Send; n: number; text: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
        n > 0 ? 'border-amber-500/40 text-amber-300' : 'border-[#2a2a2a] text-gray-500'
      }`}
    >
      <Icon size={12} /> {n} {text}
    </span>
  )
}