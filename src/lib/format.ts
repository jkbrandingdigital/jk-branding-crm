// Shared date + currency helpers (all dates are IST, format YYYY-MM-DD)

export const istDate = (d: Date = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export function addDays(ymd: string, n: number) {
  const d = new Date(ymd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Monday of the week that contains ymd
export function weekStart(ymd: string) {
  const dow = new Date(ymd + 'T00:00:00Z').getUTCDay() // 0 = Sun
  return addDays(ymd, -((dow + 6) % 7))
}

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

export const prettyDate = (ymd: string) =>
  new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export const shortDate = (ymd: string) =>
  new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const monthLabel = (ym: string) =>
  new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' })

export const inr = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)

export function inrCompact(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`
  return `₹${Math.round(v)}`
}

// Tell layouts (sidebar ticks etc.) that a form was saved
export const notifySaved = () => window.dispatchEvent(new Event('jk:saved'))