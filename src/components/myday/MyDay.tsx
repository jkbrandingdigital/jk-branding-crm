import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  CalendarCheck, CalendarOff, Clock, AlarmClock, ListTodo, ListChecks, BookOpen, Timer, QrCode,
  TrendingUp, AlertTriangle, CheckCircle2, ChevronRight, Coffee, Sun, Sunset, Moon, Target,
  PhoneCall, Sunrise, Megaphone, Truck, UserCheck, Hourglass,
  type LucideIcon,
} from 'lucide-react'
import { clock, freeLates, hm, loadMyDay, paidLeft, pathsFor, SCAN_WORD, type MyDay as Day } from '../../lib/myday'

/*
  My day — the top of every dashboard.

  The questions people kept asking HR: how many days am I present, how
  many times was I late, how much leave do I have left, what is running.
  One call (my_day) on page load, then the clocks on this screen tick by
  themselves — no polling.
*/

const REFRESH_AFTER_MS = 5 * 60 * 1000

/*
  Two skins, one screen.

  theme.css repaints the dark class names for the cream theme, and for
  plain cards and text that works. It cannot do two things: colours given
  as values (the day squares, the progress bar) and the meaning colours
  (green on time, amber late), which on cream turned faint and muddy. So
  this screen asks which theme is on and takes its colours from SKIN.

  The meaning colours are the brand's orange family, the same as the HR
  dashboard: orange = on time / good, peach = late / needs a look, red
  only for a real absence, a quiet stone for leave and "for your
  information". Cards on cream are white with a hairline and a whisper
  of shadow, rather than the heavy drop theme.css gives every dark card.
*/
type Theme = 'dark' | 'light'

function useTheme(): Theme {
  const read = (): Theme =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
  const [t, setT] = useState<Theme>(read)
  useEffect(() => {
    const o = new MutationObserver(() => setT(read()))
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return t
}

type Tone = 'good' | 'warn' | 'bad' | 'info'

const SKIN = {
  dark: {
    card: 'border-[#242424] bg-[#151515]',
    cardHover: 'hover:border-orange-500/40 hover:bg-[#181818]',
    cardHot: 'border-orange-900/50 bg-[#151515]',
    well: 'bg-[#1a1a1a]',
    chip: 'bg-[#1a1a1a] text-gray-400',
    chipStrong: 'text-gray-200',
    zero: 'text-gray-600',
    track: '#222222',
    tone: { good: 'text-orange-400', warn: 'text-orange-200', bad: 'text-red-400', info: 'text-stone-300' } as Record<Tone, string>,
    iconHot: 'bg-orange-200/10 text-orange-200',
    icon: 'bg-orange-500/10 text-orange-400',
    day: { in: '#FF6A1A', late: '#FDBA74', absent: '#DC2626', leave: '#78716C', empty: '#2A2A2A' },
    bar: { going: '#FF6A1A', done: '#C2410C' },
    pill: {
      off: 'bg-[#1f1f1f] text-gray-400', out: 'bg-red-950/50 text-red-300', done: 'bg-[#1f1f1f] text-gray-300',
      lunch: 'bg-orange-200/10 text-orange-200', in: 'bg-orange-500/15 text-orange-300',
    },
    timer: 'border-orange-900/60 bg-[#1a1410]', timerIcon: 'bg-orange-500/15 text-orange-400', timerDot: 'bg-orange-400',
    timerWord: 'text-orange-400', timerBtn: 'bg-orange-500 text-black hover:bg-orange-400',
    dashed: 'border-[#2a2a2a] bg-[#131313]',
  },
  light: {
    card: 'border-[#EAE3D9] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]',
    cardHover: 'hover:border-orange-300 hover:shadow-[0_2px_8px_rgba(28,25,23,0.06)]',
    cardHot: 'border-orange-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]',
    well: 'bg-[#FAF6F1]',
    chip: 'bg-[#F5EFE8] text-stone-500',
    chipStrong: 'text-stone-800',
    zero: 'text-stone-300',
    track: '#F0E9E1',
    tone: { good: 'text-orange-700', warn: 'text-amber-700', bad: 'text-red-700', info: 'text-stone-600' } as Record<Tone, string>,
    iconHot: 'bg-orange-100 text-orange-700',
    icon: 'bg-orange-50 text-orange-600',
    day: { in: '#F2600C', late: '#FBB47A', absent: '#DC2626', leave: '#A8A29E', empty: '#FFFFFF' },
    bar: { going: '#F2600C', done: '#C2410C' },
    pill: {
      off: 'bg-stone-100 text-stone-500', out: 'bg-red-50 text-red-700', done: 'bg-stone-100 text-stone-700',
      lunch: 'bg-orange-50 text-amber-700', in: 'bg-orange-100 text-orange-800',
    },
    timer: 'border-orange-200 bg-orange-50/60', timerIcon: 'bg-orange-100 text-orange-700', timerDot: 'bg-orange-500',
    timerWord: 'text-orange-700', timerBtn: 'bg-orange-600 text-white hover:bg-orange-500',
    dashed: 'border-[#E4DCD1] bg-white',
  },
}
type Skin = typeof SKIN.dark
const SkinCtx = createContext<Skin>(SKIN.dark)
const useSkin = () => useContext(SkinCtx)

/** What on this screen is waiting on the person — the number on the My day tab. */
export function dueOf(day: Day): number {
  return (day.tasks?.overdue ?? 0) + (day.todos?.due ?? 0) + (day.reminders?.today ?? 0)
    + (day.hr?.leave_waiting ?? 0) + (day.policies_unread ?? 0) + (day.sales?.follow_ups_due ?? 0)
}

// greet=false where the page above already says hello (the role dashboards
// do); the date and the in/out pill then sit in the Today card instead.
//
// onDue: told how many things are waiting, after every load (HR's tab
// badge). dispatchInto: a place elsewhere on the page to draw the
// Dispatch card instead of here — HR shows it on the Team tab, since it
// is the office's work, not the person's. Same data, one load.
export default function MyDay({ greet = true, onDue, dispatchInto }: {
  greet?: boolean
  onDue?: (n: number) => void
  dispatchInto?: HTMLElement | null
}) {
  const skin = SKIN[useTheme()]
  const [day, setDay] = useState<Day | null>(null)
  const [failed, setFailed] = useState(false)
  const [loadedAt, setLoadedAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const d = await loadMyDay()
      setDay(d)
      onDue?.(dueOf(d))
      setFailed(false)
      setLoadedAt(Date.now())
    } catch {
      setFailed(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void load() }, [load])

  // After a save anywhere (a to-do ticked, a form sent), and when the tab
  // comes back after a while. Never on a timer.
  useEffect(() => {
    const onSaved = () => { void load() }
    const onShow = () => { if (!document.hidden && Date.now() - loadedAt > REFRESH_AFTER_MS) void load() }
    window.addEventListener('jk:saved', onSaved)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      window.removeEventListener('jk:saved', onSaved)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [load, loadedAt])

  // The on-screen clocks. Local only; the tab hidden, they stop.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()) }, 30_000)
    return () => clearInterval(t)
  }, [])

  if (failed && !day) return null
  if (!day) return <SkinCtx.Provider value={skin}><Skeleton /></SkinCtx.Provider>

  return (
    <SkinCtx.Provider value={skin}>
    <section className="mb-8 space-y-4" aria-label="My day">
      {greet && <Hero day={day} now={now} />}
      <TodayCard day={day} now={now} showPill={!greet} />
      <MonthTiles day={day} />
      {/* The clock, full width when there is one, then the to-do numbers
          as a row of tiles. Side by side, a role with no task clock
          (sales, accounts) was left with half the row empty. */}
      <TimerCard day={day} now={now} />
      <QuickList day={day} />
      <DepartmentCards day={day} dispatchInto={dispatchInto} />
    </section>
    </SkinCtx.Provider>
  )
}

// ---------------------------------------------------------------------------

function greeting(now: number): { text: string; icon: LucideIcon } {
  const h = Number(new Date(now).toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }))
  // Same words for everybody: morning till 12, afternoon till 5 pm,
  // evening till 8 pm, night after that.
  if (h < 12) return { text: 'Good morning', icon: Sunrise }
  if (h < 17) return { text: 'Good afternoon', icon: Sun }
  if (h < 20) return { text: 'Good evening', icon: Sunset }
  return { text: 'Good night', icon: Moon }
}

type Pill = { text: string; cls: string; icon: LucideIcon }
function statusPill(day: Day, skin: Skin): Pill {
  const t = day.today
  if (day.scan_tracked === false) return { text: 'Attendance not tracked', cls: skin.pill.off, icon: Clock }
  if (!t?.check_in) return { text: 'Not scanned in yet', cls: skin.pill.out, icon: QrCode }
  if (t.check_out) return { text: `Day done · out ${clock(t.check_out)}`, cls: skin.pill.done, icon: CheckCircle2 }
  if (t.lunch_open) return { text: 'At lunch', cls: skin.pill.lunch, icon: Coffee }
  return { text: `In since ${clock(t.check_in)}`, cls: skin.pill.in, icon: UserCheck }
}

function Hero({ day, now }: { day: Day; now: number }) {
  const skin = useSkin()
  const g = greeting(now)
  const GIcon = g.icon
  const pill = statusPill(day, skin)
  const PIcon = pill.icon
  const first = (day.me.full_name || '').trim().split(/\s+/)[0]
  const date = new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const where = [day.me.department ?? day.me.designation, day.me.branch].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-sm text-gray-400">
          <GIcon size={15} className="text-orange-400" /> {date}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{g.text}, {first}</h1>
        {where && <p className="mt-1 text-sm text-gray-500">{where}</p>}
      </div>
      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium ${pill.cls}`}>
        <PIcon size={15} /> {pill.text}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ today

function TodayCard({ day, now, showPill }: { day: Day; now: number; showPill: boolean }) {
  const skin = useSkin()
  const pill = statusPill(day, skin)
  const PIcon = pill.icon
  const t = day.today
  const paths = pathsFor(day.me.role)
  const target = day.shift?.day_minutes || 480

  // Worked so far: the register's minutes up to the last scan, plus the
  // time since — only while the person is in and not on lunch.
  const running = !!t?.check_in && !t.check_out && !t.lunch_open && !!t.last_scan
  const worked = (t?.minutes_worked ?? 0) + (running ? Math.max(0, (now - new Date(t!.last_scan!).getTime()) / 60000) : 0)
  const pct = Math.min(100, Math.round((worked / target) * 100))

  if (day.scan_tracked === false) return null

  return (
    <div className={`rounded-2xl border p-5 ${skin.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Clock size={16} className="text-orange-400" /> Today
            <span className="font-normal text-gray-500">
              · {new Date(now).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
            </span>
          </p>
          {showPill && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pill.cls}`}>
              <PIcon size={13} /> {pill.text}
            </span>
          )}
        </div>
        {!t?.check_in ? (
          <Link to={paths.scan} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-400">
            <QrCode size={15} /> Scan in
          </Link>
        ) : (
          <Link to={paths.attendance} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
            My attendance <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {t?.check_in ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="In" value={clock(t.check_in)}
              note={t.is_late ? `${t.late_minutes} min late` : 'On time'}
              tone={t.is_late ? 'warn' : 'good'} />
            <Stat label="Lunch" value={t.lunch_open ? 'On lunch' : t.lunch_minutes ? hm(t.lunch_minutes) : '—'}
              note={t.lunch_late_min ? `${t.lunch_late_min} min late back` : undefined} tone={t.lunch_late_min ? 'warn' : undefined} />
            <Stat label="Out" value={t.check_out ? clock(t.check_out) : '—'}
              note={day.shift ? `Shift till ${day.shift.shift_out.slice(0, 5)}` : undefined} />
            <Stat label="Worked" value={hm(worked)}
              note={t.overtime_minutes ? `+${hm(t.overtime_minutes)} overtime` : `of ${hm(target)}`} tone={t.overtime_minutes ? 'good' : undefined} />
          </div>

          <div className="mt-4">
            {/* Orange while the day is filling, a deeper rust once the
                shift's hours are done. */}
            <div className="h-2 overflow-hidden rounded-full" style={{ background: skin.track }}>
              <div className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${pct}%`, background: pct >= 100 ? skin.bar.done : skin.bar.going }} />
            </div>
            {t.scans.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.scans.map((s) => (
                  <span key={s.at} className={`rounded-md px-2 py-0.5 text-[11px] ${skin.chip}`}>
                    {SCAN_WORD[s.kind] ?? s.kind} <span className={skin.chipStrong}>{clock(s.at)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-400">
          {day.shift ? `Your shift starts at ${day.shift.shift_in.slice(0, 5)}.` : 'Scan the office QR to start your day.'}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'warn' }) {
  const skin = useSkin()
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value}</p>
      {note && (
        <p className={`text-[11px] ${tone ? skin.tone[tone] : 'text-gray-500'}`}>{note}</p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ month

function MonthTiles({ day }: { day: Day }) {
  const m = day.month
  const l = day.leave
  const paths = pathsFor(day.me.role)
  const free = freeLates(day.late_rule)
  const over = Math.max(0, (m?.late ?? 0) - free)
  const left = paidLeft(l)
  const skin = useSkin()
  const monthName = new Date(day.me.today).toLocaleDateString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile to={paths.attendance} icon={CalendarCheck} label={`Present in ${monthName}`}
          value={m ? String(m.present) : '—'} unit="days"
          note={m ? [m.absent ? `${m.absent} absent` : null, m.on_leave ? `${m.on_leave} on leave` : null].filter(Boolean).join(' · ') || 'No absence' : undefined}
          tone={m?.absent ? 'bad' : undefined} />
        <Tile to={paths.attendance} icon={AlertTriangle} label="Late this month"
          value={m ? String(m.late) : '—'} unit={m?.late === 1 ? 'time' : 'times'}
          note={m ? (over ? `${over} over the free ${free} · ${m.late_minutes} min` : `${Math.max(0, free - m.late)} of ${free} free left`) : undefined}
          tone={over ? 'bad' : m && m.late >= free ? 'warn' : undefined} />
        <Tile to={paths.leave} icon={CalendarOff} label="Paid leave left"
          value={left == null ? '—' : String(left)} unit="this month"
          note={l ? `${l.taken_year} taken this year${l.waiting ? ` · ${l.waiting} waiting` : ''}` : undefined}
          tone={l?.waiting ? 'info' : undefined} />
        <Tile to={paths.attendance} icon={TrendingUp} label="Hours this month"
          value={m ? String(Math.round(m.worked_minutes / 60)) : '—'} unit="h"
          note={m?.overtime_minutes ? `+${hm(m.overtime_minutes)} overtime` : m?.lunch_late ? `${m.lunch_late} late from lunch` : undefined}
          tone={m?.overtime_minutes ? 'good' : undefined} />
      </div>

      {m && m.days.length > 0 && <MonthStrip days={m.days} />}

      {l?.next && (
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <CalendarOff size={13} className={skin.tone.info} />
          Next leave: {new Date(l.next.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {l.next.to !== l.next.from && ` – ${new Date(l.next.to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
          {' · '}{l.next.state === 'Waiting' ? <span className={skin.tone.warn}>waiting for HR</span> : <span className={skin.tone.good}>approved</span>}
        </p>
      )}
    </div>
  )
}

function Tile({ to, icon: Icon, label, value, unit, note, tone }: {
  to: string | null; icon: LucideIcon; label: string; value: string; unit?: string; note?: string; tone?: Tone
}) {
  const skin = useSkin()
  const TONE = skin.tone
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-400">{label}</p>
        <Icon size={16} className={tone ? TONE[tone] : 'text-gray-600'} />
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold tabular-nums tracking-tight ${tone === 'bad' ? TONE.bad : 'text-white'}`}>{value}</span>
        {unit && <span className="text-xs text-gray-500">{unit}</span>}
      </p>
      {note && <p className={`mt-1 truncate text-[11px] ${tone ? TONE[tone] : 'text-gray-500'}`}>{note}</p>}
    </>
  )
  const cls = `block rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] ${skin.card}`
  return to
    ? <Link to={to} className={`${cls} ${skin.cardHover}`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

// One square per day so far: orange in, peach late, red absent, stone
// leave; a day with nothing on it is an outlined square, so on cream it
// is still there to count.
function MonthStrip({ days }: { days: { d: string; s: string | null; l: boolean | null }[] }) {
  const skin = useSkin()
  const C = skin.day
  const colour = (s: string | null, late: boolean | null) => {
    const v = (s ?? '').toLowerCase()
    if (v.includes('absent')) return C.absent
    if (v.includes('leave')) return C.leave
    if (late) return C.late
    if (v.includes('present') || v.includes('half') || v.includes('late')) return C.in
    return null
  }
  const Key = ({ c, word }: { c: string; word: string }) => (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{word}
    </span>
  )
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1" aria-label="This month, day by day">
      {days.map((d) => {
        const c = colour(d.s, d.l)
        return (
          <span key={d.d} title={`${new Date(d.d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.s ?? '—'}${d.l ? ' · late' : ''}`}
            className={`h-3 w-3 rounded-[3px] ${c ? '' : 'border border-gray-500/30'}`}
            style={{ background: c ?? C.empty }} />
        )
      })}
      <span className="ml-2 inline-flex flex-wrap gap-x-2.5 text-[10px] text-gray-500">
        <Key c={C.in} word="in" />
        <Key c={C.late} word="late" />
        <Key c={C.absent} word="absent" />
        <Key c={C.leave} word="leave" />
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ timer

function TimerCard({ day, now }: { day: Day; now: number }) {
  const skin = useSkin()
  const t = day.timer
  const tasks = day.tasks
  const paths = pathsFor(day.me.role)
  if (!t && !tasks?.open) return null

  if (!t) {
    return (
      <div className={`flex items-center gap-4 rounded-2xl border border-dashed p-5 ${skin.dashed}`}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#1c1c1c] text-gray-500"><Timer size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">No task running</p>
          <p className="text-xs text-gray-500">{tasks?.open} open {tasks?.open === 1 ? 'task' : 'tasks'} — press Start on the one you pick up.</p>
        </div>
        {paths.tasks && (
          <Link to={paths.tasks} className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-gray-200 hover:bg-[#1a1a1a]">Open tasks</Link>
        )}
      </div>
    )
  }

  const mins = Math.max(0, (now - new Date(t.started_at).getTime()) / 60000)
  const part = t.part_kind === 'option' && t.part_no ? `Option ${t.part_no}`
    : t.part_kind === 'change' ? 'Changes'
    : t.part_kind === 'mockup' && t.part_no ? `Mockup ${t.part_no}` : null
  const piece = t.work_qty && t.work_qty > 1 && t.piece_no ? `Quantity ${t.piece_no}` : null

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 ${skin.timer}`}>
      <div className="flex items-center gap-4">
        <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${skin.timerIcon}`}>
          <Timer size={20} />
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full motion-reduce:animate-none ${skin.timerDot}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-medium ${skin.timerWord}`}>Running now</p>
          <p className="truncate text-base font-semibold text-white">#{t.task_no} · {t.subject}</p>
          <p className="text-xs text-gray-400">{[piece, part].filter(Boolean).join(' · ') || 'Whole job'} · this sitting {hm(mins)}</p>
        </div>
        {paths.tasks && (
          <Link to={paths.tasks} className={`hidden rounded-lg px-3 py-1.5 text-sm font-semibold sm:inline-block ${skin.timerBtn}`}>Open</Link>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ quick list

function QuickList({ day }: { day: Day }) {
  const skin = useSkin()
  const TONE = skin.tone
  const paths = pathsFor(day.me.role)
  const rows: { to: string | null; icon: LucideIcon; label: string; value: number; tone?: Tone; sub?: string }[] = []
  if (day.tasks && paths.tasks) rows.push({
    to: paths.tasks, icon: ListTodo, label: 'My tasks', value: day.tasks.open,
    tone: day.tasks.overdue ? 'bad' : undefined,
    sub: day.tasks.overdue ? `${day.tasks.overdue} past due` : day.tasks.due_today ? `${day.tasks.due_today} due today` : undefined,
  })
  if (day.todos && paths.todos) rows.push({
    to: paths.todos, icon: ListChecks, label: 'To-do for today', value: day.todos.due,
    tone: day.todos.overdue ? 'warn' : undefined, sub: day.todos.overdue ? `${day.todos.overdue} from before` : undefined,
  })
  if (day.reminders && paths.reminders) rows.push({ to: paths.reminders, icon: AlarmClock, label: 'Reminders today', value: day.reminders.today })
  // Sales: the follow-ups due is the one number their own home page does
  // not already show. HR: leave waiting on them.
  if (day.sales?.follow_ups_due != null) rows.push({
    to: '/sales?page=leads', icon: PhoneCall, label: 'Follow-ups due', value: day.sales.follow_ups_due,
    tone: day.sales.follow_ups_due ? 'warn' : undefined,
  })
  if (day.hr) rows.push({
    to: '/hr/leaves', icon: Hourglass, label: 'Leave to decide', value: day.hr.leave_waiting,
    tone: day.hr.leave_waiting ? 'info' : undefined,
  })
  if (day.policies_unread != null) rows.push({
    to: paths.policies, icon: BookOpen, label: 'Policies to read', value: day.policies_unread, tone: day.policies_unread ? 'warn' : undefined,
  })
  if (!rows.length) return null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {rows.map((r) => {
        const Icon = r.icon
        const hot = r.value > 0 && !!r.tone
        const inner = (
          <>
            <div className="flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${hot ? skin.iconHot : skin.icon}`}>
                <Icon size={17} />
              </span>
              <ChevronRight size={15} className="text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-300" />
            </div>
            <p className={`mt-3 text-2xl font-bold tabular-nums ${r.value === 0 ? skin.zero : r.tone ? TONE[r.tone] : 'text-white'}`}>{r.value}</p>
            <p className="mt-0.5 truncate text-xs text-gray-400">{r.label}</p>
            <p className={`truncate text-[11px] ${r.sub ? (r.tone ? TONE[r.tone] : 'text-gray-500') : 'text-transparent'}`}>{r.sub ?? '·'}</p>
          </>
        )
        const cls = `group block rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] ${hot ? skin.cardHot : skin.card}`
        return r.to
          ? <Link key={r.label} to={r.to} className={`${cls} ${skin.cardHover}`}>{inner}</Link>
          : <div key={r.label} className={cls}>{inner}</div>
      })}
    </div>
  )
}

// ------------------------------------------------------------------ departments

function DepartmentCards({ day, dispatchInto }: { day: Day; dispatchInto?: HTMLElement | null }) {
  const skin = useSkin()
  const cards: ReactNode[] = []
  let dispatchCard: ReactNode = null

  if (day.design) {
    const pct = Math.min(100, Math.round((day.design.points_today / (day.design.target || 160)) * 100))
    cards.push(
      <DeptCard key="design" title="Design" icon={Target} to="/design/performance" link="My performance">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{day.design.points_today}</span>
          <span className="text-sm text-gray-500">/ {day.design.target} points today</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: skin.track }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: skin.bar.going }} />
        </div>
        <p className="mt-2 text-xs text-gray-500">{day.design.done_today} finished today · points come from allowed time, not from going slower</p>
      </DeptCard>,
    )
  }

  // Sales, HR, Accounts and Reception have their own home page right
  // below this, with the same figures in more detail — a card here would
  // show them twice. Their one extra number sits in the quick list.

  // Digital: for the Digital department only. Anybody else who happens
  // to hold the switch reaches it from the sidebar.
  const dept = (day.me.department ?? '').toLowerCase()
  if (day.digital && dept.includes('digital')) {
    cards.push(
      <DeptCard key="digital" title="Digital" icon={Megaphone} to="/digital" link="Open Digital">
        <Nums items={[
          { label: 'Client workspaces', value: day.digital.workspaces },
          { label: 'Posts today', value: day.digital.scheduled_today },
          { label: 'Pages to reconnect', value: day.digital.expired, tone: day.digital.expired ? 'bad' : undefined },
        ]} />
      </DeptCard>,
    )
  }

  // Dispatch's own home IS the register, whose tiles say the same thing.
  // This card is for someone who checks goods on the side (a designer
  // with Dispatch & QC switched on).
  if (day.dispatch && day.me.role !== 'dispatch' && day.me.role !== 'sales' && day.me.role !== 'branch_manager') {
    const base = day.me.role === 'dispatch' ? '/dispatch' : '/admin/job-works'
    dispatchCard = (
      <DeptCard key="dispatch" title="Dispatch" icon={Truck} to={day.me.role === 'dispatch' ? '/dispatch/qc' : `${base}?stage=qc_waiting`} link="Waiting on QC">
        <Nums items={[
          { label: 'Waiting on QC', value: day.dispatch.qc_waiting, tone: day.dispatch.qc_waiting ? 'warn' : undefined },
          { label: 'Ready to ship', value: day.dispatch.to_dispatch, tone: day.dispatch.to_dispatch ? 'info' : undefined },
          { label: 'In production', value: day.dispatch.in_production },
        ]} />
      </DeptCard>
    )
    // Drawn somewhere else on the page when asked (HR: the Team tab).
    if (!dispatchInto) cards.push(dispatchCard)
  }

  const away = dispatchInto && dispatchCard
    ? createPortal(<SkinCtx.Provider value={skin}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{dispatchCard}</div></SkinCtx.Provider>, dispatchInto)
    : null

  if (!cards.length) return away
  return <>{away}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</div></>
}

function DeptCard({ title, icon: Icon, to, link, children }: { title: string; icon: LucideIcon; to: string; link: string; children: ReactNode }) {
  const skin = useSkin()
  return (
    <div className={`flex flex-col rounded-2xl border p-5 ${skin.card}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <span className={`grid h-7 w-7 place-items-center rounded-lg ${skin.icon}`}><Icon size={15} /></span>
          {title}
        </p>
        <Link to={to} className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-white">{link} <ChevronRight size={13} /></Link>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Nums({ items }: { items: { label: string; value: number; tone?: Tone; icon?: LucideIcon }[] }) {
  const skin = useSkin()
  const TONE = skin.tone
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((i) => (
        <div key={i.label} className={`rounded-xl px-3 py-2.5 ${skin.well}`}>
          <p className="text-[11px] text-gray-500">{i.label}</p>
          <p className={`mt-0.5 text-2xl font-bold tabular-nums ${i.value === 0 ? skin.zero : i.tone ? TONE[i.tone] : 'text-white'}`}>{i.value}</p>
        </div>
      ))}
    </div>
  )
}

function Skeleton() {
  const skin = useSkin()
  return (
    <div className="mb-8 animate-pulse space-y-4" aria-hidden="true">
      <div className="h-9 w-64 rounded-lg bg-[#1a1a1a]" />
      <div className={`h-36 rounded-2xl border ${skin.card}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`h-28 rounded-2xl border ${skin.card}`} />)}
      </div>
    </div>
  )
}