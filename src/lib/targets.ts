import { addDays, addMonths } from './format'

// Target achievement zones: below 30% red, 30–70% yellow, 70% and above green
export type Zone = { key: 'red' | 'yellow' | 'green'; label: string; text: string; bar: string; chip: string }

export function zoneOf(pct: number): Zone {
  if (pct >= 70) return { key: 'green', label: 'Green zone', text: 'text-green-400', bar: 'bg-green-500', chip: 'bg-green-950/60 text-green-400' }
  if (pct >= 30) return { key: 'yellow', label: 'Yellow zone', text: 'text-yellow-400', bar: 'bg-yellow-500', chip: 'bg-yellow-950/60 text-yellow-400' }
  return { key: 'red', label: 'Red zone', text: 'text-red-400', bar: 'bg-red-500', chip: 'bg-red-950/60 text-red-400' }
}

export const pctOf = (achieved: number, target: number) => (target > 0 ? (achieved / target) * 100 : 0)

// 'YYYY-MM' -> first and last date of that month
export const monthFirst = (ym: string) => `${ym}-01`
export const monthLast = (ym: string) => addDays(`${addMonths(ym, 1)}-01`, -1)

export const monthTitle = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })