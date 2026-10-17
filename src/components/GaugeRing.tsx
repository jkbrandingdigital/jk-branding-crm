import { useId } from 'react'
import { useChartTheme } from '../lib/chartTheme'

/*
  A ring with a percentage in the middle.

  stroke="currentColor" rather than a hex, so the caller hands it a text
  colour class — zoneOf's green, yellow or red — and theme.css remaps it
  for the cream theme the way it remaps everything else. A hex here
  would stay the dark theme's colour on a light page.

  Lives on its own because the sales target screen and the design points
  screen both want it. Two copies of a thing like this drift within a
  month: one gets a thicker stroke, the other a different cap, and the
  two pages stop looking like one product.
*/
export default function GaugeRing({
  pct, colorClass, caption, size = 168, stroke = 14,
}: {
  pct: number
  /** A text colour class, e.g. zoneOf(pct).text */
  colorClass: string
  caption: string
  size?: number
  stroke?: number
}) {
  const chart = useChartTheme()
  // Two rings sit on one page. A fixed gradient id would have the second
  // quietly paint itself with the first one's colours.
  const gid = useId().replace(/:/g, '')
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const shown = Math.min(Math.max(pct, 0), 100)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className={colorClass}>
        {/*
          The arc fades from a quarter-strength version of the zone
          colour into the full one, so it reads as a sweep rather than a
          flat band of paint.

          Both stops are currentColor, which is the whole trick: the
          caller still hands over one text colour class, theme.css still
          remaps it for the cream theme, and the gradient costs nothing
          in flexibility. Hard-coded hex stops would have frozen the ring
          to the dark theme.
        */}
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="55%" stopColor="currentColor" stopOpacity="0.8" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={chart.grid} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={`url(#g${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${colorClass}`}>{pct.toFixed(0)}%</span>
        <span className="mt-0.5 text-[11px] text-gray-500">{caption}</span>
      </div>
    </div>
  )
}