import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

export type Slice = { name: string; value: number; color: string }

// Brand-friendly palette for slices
export const PIE_COLORS = ['#f97316', '#60a5fa', '#34d399', '#f43f5e', '#a78bfa', '#facc15', '#2dd4bf', '#fb7185']

const tooltipStyle = { background: '#1a1a1a', border: '1px solid #2e2e2e', borderRadius: 8, fontSize: 12 }

export default function DonutChart({
  data,
  format = (v) => v.toLocaleString('en-IN'),
  centerLabel = 'Total',
  empty = 'No data for this period.',
}: {
  data: Slice[]
  format?: (v: number) => string
  centerLabel?: string
  empty?: string
}) {
  const slices = data.filter((d) => d.value > 0)
  const total = slices.reduce((s, d) => s + d.value, 0)

  if (total === 0) return <p className="py-10 text-center text-sm text-gray-500">{empty}</p>

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={0} stroke="none">
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} stroke={s.color} strokeWidth={1} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={{ color: '#e5e5e5' }}
              formatter={(v, n) => [`${format(Number(v))} (${((Number(v) / total) * 100).toFixed(0)}%)`, String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-gray-500">{centerLabel}</span>
          <span className="text-sm font-semibold tabular-nums">{format(total)}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {slices
          .slice()
          .sort((a, b) => b.value - a.value)
          .map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-gray-300">{s.name}</span>
              <span className="tabular-nums text-gray-400">{((s.value / total) * 100).toFixed(0)}%</span>
              <span className="shrink-0 pl-2 text-right tabular-nums">{format(s.value)}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}