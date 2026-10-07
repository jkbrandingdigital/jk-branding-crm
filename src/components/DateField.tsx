import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

/**
 * One date picker for the whole CRM: a dialog in the middle of the screen with
 * a calendar page and a clock face.
 *
 * Values keep the same shape the browser's own fields used, so these are a
 * straight swap for <input type="date"> and <input type="datetime-local">:
 *   DateField      → 'YYYY-MM-DD'
 *   DateTimeField  → 'YYYY-MM-DDTHH:mm'
 * An empty string means nothing is picked.
 */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function parse(value: string) {
  if (!value) return null
  const [datePart, timePart] = value.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return null
  const [hh, mm] = (timePart ?? '00:00').split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0)
}

// What the closed field shows: 08-10-2026 · 10:15 AM
function pretty(value: string, withTime: boolean) {
  const d = parse(value)
  if (!d) return ''
  const date = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
  if (!withTime) return date
  const h = d.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${date} · ${pad(h12)}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

type Props = {
  value: string
  onChange: (value: string) => void
  withTime?: boolean
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
  /** Earliest date that can be picked, as 'YYYY-MM-DD' */
  min?: string
}

export function DateField(props: Props) {
  return <Picker {...props} withTime={false} />
}

export function DateTimeField(props: Props) {
  return <Picker {...props} withTime />
}

type Tab = 'date' | 'hour' | 'minute'

function Picker({
  value, onChange, withTime = false, placeholder, id, className = '', disabled, min,
}: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('date')
  // Edits live here until OK, so Cancel really does nothing
  const [draft, setDraft] = useState<Date>(() => parse(value) ?? roundedNow())
  const [month, setMonth] = useState<Date>(() => parse(value) ?? new Date())

  const shown = pretty(value, withTime)
  const minDate = min ? parse(min) : null

  function roundedNow() {
    const d = new Date()
    d.setSeconds(0, 0)
    return d
  }

  function start() {
    if (disabled) return
    const base = parse(value) ?? roundedNow()
    setDraft(base)
    setMonth(base)
    setTab('date')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])

  function confirm(next: Date = draft) {
    onChange(withTime ? `${ymd(next)}T${hm(next)}` : ymd(next))
    setOpen(false)
  }

  // Six weeks starting on the Sunday of the first week
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const from = new Date(first)
    from.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(from)
      d.setDate(from.getDate() + i)
      return d
    })
  }, [month])

  const today = new Date()

  function pickDay(d: Date) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), draft.getHours(), draft.getMinutes())
    setDraft(next)
    if (!withTime) confirm(next)
    else setTab('hour')
  }

  const setHour = (h: number) =>
    setDraft(new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), h, draft.getMinutes()))

  return (
    <div className={className}>
      <button
        id={id}
        type="button"
        onClick={start}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-left text-sm text-white transition-colors hover:border-[#3a3a3a] disabled:opacity-60"
      >
        {withTime ? <Clock size={15} className="shrink-0 text-gray-500" /> : <CalendarDays size={15} className="shrink-0 text-gray-500" />}
        <span className={`flex-1 truncate ${shown ? '' : 'text-gray-600'}`}>
          {shown || placeholder || (withTime ? 'Pick a date and time' : 'Pick a date')}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={withTime ? 'Select date and time' : 'Select date'}
            className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#161616] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-5 py-4 text-white">
              <p className="text-[11px] uppercase tracking-wider text-white/80">
                {withTime ? 'Select date & time' : 'Select date'}
              </p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <button
                  type="button"
                  onClick={() => { setMonth(draft); setTab('date') }}
                  className={`text-left transition-opacity ${tab === 'date' ? '' : 'opacity-70 hover:opacity-100'}`}
                >
                  <span className="block text-sm leading-none">{draft.getFullYear()}</span>
                  <span className="mt-1 block text-2xl font-semibold leading-none">
                    {MONTHS[draft.getMonth()]} {draft.getDate()}
                  </span>
                </button>

                {withTime && (
                  <p className="flex items-end text-3xl font-semibold leading-none tabular-nums">
                    <button
                      type="button"
                      onClick={() => setTab('hour')}
                      className={`transition-opacity ${tab === 'hour' ? '' : 'opacity-70 hover:opacity-100'}`}
                    >
                      {pad(draft.getHours())}
                    </button>
                    <span className="opacity-70">:</span>
                    <button
                      type="button"
                      onClick={() => setTab('minute')}
                      className={`transition-opacity ${tab === 'minute' ? '' : 'opacity-70 hover:opacity-100'}`}
                    >
                      {pad(draft.getMinutes())}
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Tabs */}
            {withTime && (
              <div className="flex border-b border-[#242424]">
                <button
                  type="button"
                  onClick={() => { setMonth(draft); setTab('date') }}
                  aria-label="Calendar"
                  aria-current={tab === 'date'}
                  className={`flex flex-1 justify-center border-b-2 py-2.5 transition-colors ${
                    tab === 'date' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <CalendarDays size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setTab('hour')}
                  aria-label="Clock"
                  aria-current={tab !== 'date'}
                  className={`flex flex-1 justify-center border-b-2 py-2.5 transition-colors ${
                    tab !== 'date' ? 'border-orange-500 text-orange-400' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <Clock size={18} />
                </button>
              </div>
            )}

            {/* Body */}
            <div className="px-4 py-4">
              {tab === 'date' ? (
                <>
                  <div className="mb-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                      aria-label="Previous month"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white"
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <p className="flex-1 text-center text-sm font-medium text-white">
                      {MONTHS_LONG[month.getMonth()]} {month.getFullYear()}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                      aria-label="Next month"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white"
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 text-center text-[11px] text-gray-500">
                    {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {days.map((d) => {
                      const other = d.getMonth() !== month.getMonth()
                      const isToday = ymd(d) === ymd(today)
                      const isPicked = ymd(d) === ymd(draft)
                      const tooEarly = minDate != null && ymd(d) < ymd(minDate)
                      return (
                        <button
                          key={d.toISOString()}
                          type="button"
                          disabled={tooEarly}
                          onClick={() => pickDay(d)}
                          className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors disabled:opacity-25 ${
                            isPicked
                              ? 'bg-orange-500 font-semibold text-white'
                              : other
                                ? 'text-gray-600 hover:bg-[#222]'
                                : 'text-gray-200 hover:bg-[#222]'
                          } ${isToday && !isPicked ? 'ring-1 ring-inset ring-orange-500/60' : ''}`}
                        >
                          {d.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <ClockFace
                  mode={tab === 'hour' ? 'hour' : 'minute'}
                  hour={draft.getHours()}
                  minute={draft.getMinutes()}
                  onHour={(h, done) => { setHour(h); if (done) setTab('minute') }}
                  onMinute={(m, done) => {
                    const next = new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), draft.getHours(), m)
                    setDraft(next)
                    // Letting go of a minute is the whole choice made
                    if (done) confirm(next)
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 border-t border-[#242424] px-4 py-3 text-sm">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-gray-400 hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => { const n = roundedNow(); setDraft(n); setMonth(n) }}
                className="text-gray-400 hover:text-white"
              >
                {withTime ? 'Now' : 'Today'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto px-2 text-gray-300 hover:text-white">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirm()}
                className="rounded-lg bg-orange-500 px-5 py-1.5 font-semibold text-white hover:bg-orange-600"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The clock face: outer ring 1–12, inner ring 13–00, minutes by fives */
/* ------------------------------------------------------------------ */

const SIZE = 248
const MID = SIZE / 2
const OUTER = 100
const INNER = 66

function at(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { x: MID + Math.cos(a) * radius, y: MID + Math.sin(a) * radius }
}

function ClockFace({
  mode, hour, minute, onHour, onMinute,
}: {
  mode: 'hour' | 'minute'
  hour: number
  minute: number
  onHour: (h: number, done: boolean) => void
  onMinute: (m: number, done: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const down = useRef(false)

  // Where the hand points, and how long it is
  const handAngle = mode === 'hour' ? (hour % 12) * 30 : minute * 6
  const handLength = mode === 'hour' && (hour === 0 || hour > 12) ? INNER : OUTER
  const tip = at(handAngle, handLength)

  function fromPoint(clientX: number, clientY: number, done = false) {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const dx = clientX - box.left - MID
    const dy = clientY - box.top - MID
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (deg < 0) deg += 360

    if (mode === 'minute') {
      const m = Math.round(deg / 6) % 60
      onMinute(m, done)
      return
    }
    const idx = Math.round(deg / 30) % 12 // 0 means the 12 o'clock spot
    const inside = Math.hypot(dx, dy) < (OUTER + INNER) / 2
    const h = inside ? (idx === 0 ? 0 : idx + 12) : idx === 0 ? 12 : idx
    onHour(h, done)
  }

  const label = (n: number, text: string, angle: number, radius: number, on: boolean, small = false) => {
    const p = at(angle, radius)
    return (
      <button
        key={`${radius}-${n}`}
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (mode === 'hour') onHour(n, true)
          else onMinute(n, true)
        }}
        className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full tabular-nums transition-colors ${
          small ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm'
        } ${on ? 'bg-orange-500 font-semibold text-white' : 'text-gray-300 hover:bg-black/10'}`}
        style={{ left: p.x, top: p.y }}
      >
        {text}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div
        ref={ref}
        role="application"
        aria-label={mode === 'hour' ? 'Pick an hour' : 'Pick a minute'}
        onPointerDown={(e) => {
          // An hour is a single tap; minutes can be dragged round the face
          if (mode === 'hour') {
            fromPoint(e.clientX, e.clientY, true)
            return
          }
          down.current = true
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* some browsers refuse capture; dragging still works without it */
          }
          fromPoint(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => { if (down.current) fromPoint(e.clientX, e.clientY) }}
        onPointerUp={(e) => {
          if (!down.current) return
          down.current = false
          fromPoint(e.clientX, e.clientY, true)
        }}
        onPointerCancel={() => { down.current = false }}
        className="relative touch-none select-none rounded-full bg-[#1f1f1f]"
        style={{ width: SIZE, height: SIZE }}
      >
        {/* The hand */}
        <svg width={SIZE} height={SIZE} className="pointer-events-none absolute inset-0">
          <line x1={MID} y1={MID} x2={tip.x} y2={tip.y} stroke="#FF5E00" strokeWidth="2" />
          <circle cx={MID} cy={MID} r="4" fill="#FF5E00" />
          <circle cx={tip.x} cy={tip.y} r="17" fill="#FF5E00" />
        </svg>

        {mode === 'hour' ? (
          <>
            {/* 1–12 on the outside */}
            {Array.from({ length: 12 }, (_, i) => i + 1).map((h) =>
              label(h, String(h), (h % 12) * 30, OUTER, hour >= 1 && hour <= 12 && hour === h),
            )}
            {/* 13–23 and 00 on the inside */}
            {Array.from({ length: 12 }, (_, i) => (i === 0 ? 0 : i + 12)).map((h) =>
              label(h, pad(h), (h % 12) * 30, INNER, hour === 0 ? h === 0 : hour > 12 && hour === h, true),
            )}
          </>
        ) : (
          Array.from({ length: 12 }, (_, i) => i * 5).map((m) =>
            label(m, pad(m), m * 6, OUTER, minute === m),
          )
        )}
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {mode === 'hour' ? 'Pick the hour — the inner ring is 13 to 00' : 'Pick a minute to finish'}
      </p>
    </div>
  )
}

export default DateField