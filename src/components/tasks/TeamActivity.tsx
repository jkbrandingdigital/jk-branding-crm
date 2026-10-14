import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertCircle, Clock, ListChecks, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { DateField } from '../DateField'
import { loadStaff, type Staff } from '../leads/leadUtils'
import { hhmm, since } from './WorkTimer'

/*
  Who is working on what, and where the hours went.

    Now        this moment: who has a task running, who is free
    By task    hours per job, and how often it was broken into
    Sittings   every start and stop, with the reason it ended

  This is not a stopwatch on people. There is no idle tracking and nothing
  is measured by the minute. "Breaks" counts how often a job was put down
  for urgent work or to wait on a customer — that is a number about how
  work arrives, and it belongs to whoever hands it out.
*/

type Tab = 'now' | 'task' | 'log'

type LiveRow = {
  user_id: string
  full_name: string | null
  role: string | null
  task_id: string | null
  task_no: number | null
  subject: string | null
  started_at: string | null
  today_secs: number
  today_tasks: number
  today_switches: number
}

type TaskRow = {
  task_id: string
  task_no: number
  subject: string
  stage: string | null
  is_done: boolean
  due_at: string | null
  people: string | null
  secs: number
  sittings: number
  breaks: number
  first_start: string
  last_end: string
  running: boolean
}

type LogRow = {
  session_id: string
  user_id: string
  full_name: string | null
  task_id: string
  task_no: number
  subject: string
  started_at: string
  ended_at: string | null
  secs: number
  end_reason: string | null
  running: boolean
}

const ROLE_LABEL: Record<string, string> = {
  design_team: 'Design',
  sales: 'Sales',
  branch_manager: 'Manager',
  hr: 'HR',
  super_admin: 'Super Admin',
}

const REASON_LABEL: Record<string, string> = {
  switched: 'Moved to another task',
  urgent: 'Urgent work came in',
  waiting: 'Waiting on content',
  break: 'Break',
  done: 'Finished',
  day_end: 'End of day',
  auto: 'Left running — closed automatically',
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export default function TeamActivity({ tasksPath }: { tasksPath: string }) {
  const navigate = useNavigate()
  const { can, isSuper, ready } = usePermissions()

  const [tab, setTab] = useState<Tab>('now')
  const [live, setLive] = useState<LiveRow[]>([])
  const [byTask, setByTask] = useState<TaskRow[]>([])
  const [log, setLog] = useState<LogRow[]>([])
  const [staff, setStaff] = useState<Staff[]>([])

  const [from, setFrom] = useState(daysAgo(6))
  const [to, setTo] = useState(today())
  const [who, setWho] = useState('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [at, setAt] = useState<Date>(new Date())

  // A plain true/false, not can() itself — can() is a new function on every
  // render, and in a dependency list that would re-run this forever.
  const mayView = isSuper || can('timer_view_all')

  const args = useMemo(
    () => ({ p_from: from || null, p_to: to || null, p_user: who === 'all' ? null : who }),
    [from, to, who],
  )

  const load = useCallback(async () => {
    setAt(new Date())
    if (tab === 'now') {
      const { data, error: e } = await supabase.rpc('team_activity')
      setLoading(false)
      if (e) return setError(e.message)
      setError('')
      return setLive((data ?? []) as LiveRow[])
    }
    if (tab === 'task') {
      const { data, error: e } = await supabase.rpc('task_time_all', args)
      setLoading(false)
      if (e) return setError(e.message)
      setError('')
      return setByTask((data ?? []) as TaskRow[])
    }
    const { data, error: e } = await supabase.rpc('work_log', { ...args, p_task: null })
    setLoading(false)
    if (e) return setError(e.message)
    setError('')
    setLog((data ?? []) as LogRow[])
  }, [tab, args])

  useEffect(() => {
    if (!ready || !mayView) return
    setLoading(true)
    void load()
  }, [ready, mayView, load])

  useEffect(() => {
    if (!ready || !mayView || tab !== 'now') return
    const poll = setInterval(load, 60000)
    // Keeps the "since" column honest between fetches
    const tick = setInterval(() => setLive((r) => [...r]), 30000)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [ready, mayView, tab, load])

  useEffect(() => {
    if (!mayView) return
    void loadStaff().then(setStaff)
    // Tells the coordinator, HR and Super Admin about any designer with no
    // open task. It only speaks once per person per day, so opening this
    // screen often costs nothing.
    void supabase.rpc('notify_free_designers')
  }, [mayView])

  if (ready && !mayView) {
    return (
      <div className="p-6 text-gray-400">
        You do not have access to the team's activity. Ask a Super Admin for{' '}
        <span className="text-white">See who is working on what</span>.
      </div>
    )
  }

  const busy = live.filter((r) => r.task_id)
  const idle = live.filter((r) => !r.task_id)
  const totalSecs = byTask.reduce((n, r) => n + Number(r.secs || 0), 0)

  const openTask = (id: string) => navigate(`${tasksPath}?task=${id}`)

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
    { key: 'now', label: 'Now', icon: Activity },
    { key: 'task', label: 'By task', icon: ListChecks },
    { key: 'log', label: 'Sittings', icon: Clock },
  ]

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Team activity</h1>
          <p className="mt-1 text-sm text-gray-400">
            {tab === 'now'
              ? `${busy.length} working now · ${idle.length} free`
              : tab === 'task'
                ? `${byTask.length} task${byTask.length === 1 ? '' : 's'} · ${hhmm(totalSecs)} in all`
                : `${log.length} sitting${log.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); void load() }}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </button>
      </div>

      <div className="flex gap-1 border-b border-[#242424]">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === t.key
                  ? 'border-orange-500 font-medium text-orange-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Dates and person — only the two tabs that look backwards */}
      {tab !== 'now' && (
        <div className="grid gap-3 rounded-lg border border-[#242424] bg-[#151515] p-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">From</span>
            <DateField value={from} onChange={setFrom} placeholder="Any day" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">To</span>
            <DateField value={to} onChange={setTo} placeholder="Any day" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Person</span>
            <select value={who} onChange={(e) => setWho(e.target.value)} className={input}>
              <option value="all">Everyone</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => { setFrom(today()); setTo(today()) }}
              className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:text-white"
            >
              Today
            </button>
            <button
              onClick={() => { setFrom(daysAgo(6)); setTo(today()) }}
              className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:text-white"
            >
              7 days
            </button>
            <button
              onClick={() => { setFrom(daysAgo(29)); setTo(today()) }}
              className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-xs text-gray-300 hover:text-white"
            >
              30 days
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Now ---------------- */}
      {tab === 'now' && (
        <>
          <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
            <div className="border-b border-[#242424] px-5 py-3">
              <h2 className="flex items-center gap-2 font-medium text-white">
                <Activity className="h-4 w-4 text-orange-400" /> Working now
              </h2>
            </div>
            {busy.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Nobody has a task running.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#1f1f1f]">
                {busy.map((r) => (
                  <li key={r.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                    <span className="flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-orange-500" aria-hidden />
                    <span className="w-36 shrink-0">
                      <span className="block truncate text-sm font-medium text-white">{r.full_name ?? '—'}</span>
                      <span className="text-[11px] text-gray-500">{ROLE_LABEL[r.role ?? ''] ?? r.role ?? ''}</span>
                    </span>
                    <button
                      onClick={() => r.task_id && openTask(r.task_id)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-gray-300 hover:text-orange-400"
                      title={r.subject ?? ''}
                    >
                      #{r.task_no} · {r.subject}
                    </button>
                    <span className="shrink-0 tabular-nums text-sm text-orange-300">
                      {r.started_at ? since(r.started_at) : '—'}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      today {hhmm(r.today_secs)} · {r.today_tasks} task{r.today_tasks === 1 ? '' : 's'}
                      {r.today_switches > 0 && <> · {r.today_switches} switch{r.today_switches === 1 ? '' : 'es'}</>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
            <div className="border-b border-[#242424] px-5 py-3">
              <h2 className="font-medium text-white">Nothing running</h2>
              <p className="mt-0.5 text-xs text-gray-500">Worked earlier today but has no task started right now.</p>
            </div>
            {idle.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">
                {loading ? 'Loading…' : 'Everyone has something running.'}
              </p>
            ) : (
              <ul className="divide-y divide-[#1f1f1f]">
                {idle.map((r) => (
                  <li key={r.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#333]" aria-hidden />
                    <span className="w-36 shrink-0">
                      <span className="block truncate text-sm text-gray-300">{r.full_name ?? '—'}</span>
                      <span className="text-[11px] text-gray-500">{ROLE_LABEL[r.role ?? ''] ?? r.role ?? ''}</span>
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-gray-600">—</span>
                    <span className="shrink-0 text-xs text-gray-500">
                      today {hhmm(r.today_secs)} · {r.today_tasks} task{r.today_tasks === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ---------------- By task ---------------- */}
      {tab === 'task' && (
        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Who worked on it</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 text-right font-medium">Hours</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sittings</th>
                  <th className="px-4 py-2.5 text-right font-medium" title="Put down for urgent work or to wait on a customer">
                    Broken into
                  </th>
                  <th className="px-4 py-2.5 font-medium">Last worked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {byTask.map((r) => (
                  <tr key={r.task_id} className="hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-500">{r.task_no}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => openTask(r.task_id)}
                        className="flex max-w-xs items-center gap-2 text-left text-orange-300 hover:underline"
                      >
                        <span className="truncate">{r.subject}</span>
                        {r.running && (
                          <span className="shrink-0 animate-pulse rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-300">
                            live
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-300" title={r.people ?? ''}>
                      {r.people ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{r.stage ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-white">{hhmm(r.secs)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{r.sittings}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.breaks >= 4 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {r.breaks}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {day(r.last_end)} {clock(r.last_end)}
                    </td>
                  </tr>
                ))}
                {byTask.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'No time recorded in these days.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------------- Sittings ---------------- */}
      {tab === 'log' && (
        <section className="overflow-hidden rounded-lg border border-[#242424] bg-[#151515]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                  <th className="px-4 py-2.5 font-medium">Day</th>
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">From</th>
                  <th className="px-4 py-2.5 font-medium">To</th>
                  <th className="px-4 py-2.5 text-right font-medium">Time</th>
                  <th className="px-4 py-2.5 font-medium">Stopped because</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {log.map((r) => (
                  <tr key={r.session_id} className="hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-500">{day(r.started_at)}</td>
                    <td className="px-4 py-2.5 text-gray-300">{r.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => openTask(r.task_id)}
                        className="block max-w-xs truncate text-left text-orange-300 hover:underline"
                        title={r.subject}
                      >
                        #{r.task_no} · {r.subject}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-400">{clock(r.started_at)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-400">
                      {r.running ? <span className="text-orange-400">running</span> : r.ended_at ? clock(r.ended_at) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-white">{hhmm(r.secs)}</td>
                    <td className="px-4 py-2.5 text-gray-400">
                      {r.running ? '—' : REASON_LABEL[r.end_reason ?? ''] ?? r.end_reason ?? '—'}
                    </td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'Nothing recorded in these days.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-gray-600">
        "Broken into" counts the times a job was put down for urgent work or to wait on a customer. A high number
        says the day was chopped up, which is a fact about how work arrives, not about the person doing it.
      </p>
    </div>
  )
}