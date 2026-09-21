import { useCallback, useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCurrentUser } from '../lib/auth'
import { istDate, addDays, inr } from '../lib/format'
import { zoneOf, pctOf, monthFirst, monthLast, monthTitle } from '../lib/targets'

// Mon–Sat between two dates (inclusive)
function workingDays(from: string, to: string) {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) n++
  return n
}

export default function MyTargetCard({ compact = false }: { compact?: boolean }) {
  const today = istDate()
  const ym = today.slice(0, 7)
  const [target, setTarget] = useState<number | null>(null)
  const [achieved, setAchieved] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const user = await getCurrentUser()
    if (!user) return
    const [t, r] = await Promise.all([
      supabase.from('employee_targets').select('target_amount').eq('user_id', user.id).eq('month', monthFirst(ym)).maybeSingle(),
      supabase.from('daily_reports').select('revenue').eq('user_id', user.id).gte('work_date', monthFirst(ym)).lte('work_date', monthLast(ym)),
    ])
    setTarget(t.data ? Number(t.data.target_amount) : null)
    setAchieved((r.data ?? []).reduce((s, x) => s + Number(x.revenue ?? 0), 0))
    setLoaded(true)
  }, [ym])

  // Reload after a report is saved
  useEffect(() => {
    load()
    window.addEventListener('jk:saved', load)
    return () => window.removeEventListener('jk:saved', load)
  }, [load])

  if (!loaded) return null

  if (target == null || target <= 0) {
    return (
      <div className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Target size={16} className="text-gray-500" /> {monthTitle(ym)} target
        </div>
        <p className="mt-2 text-sm text-gray-500">No target yet. Your branch manager will assign it.</p>
        {achieved > 0 && <p className="mt-1 text-sm text-gray-400">Achieved so far {inr(achieved)}</p>}
      </div>
    )
  }

  const pct = pctOf(achieved, target)
  const zone = zoneOf(pct)
  const remaining = Math.max(target - achieved, 0)
  const daysLeft = workingDays(today, monthLast(ym))
  const perDay = daysLeft > 0 ? remaining / daysLeft : remaining

  // Where you should be by today if you work evenly through the month
  const totalDays = Math.max(workingDays(monthFirst(ym), monthLast(ym)), 1)
  const elapsed = workingDays(monthFirst(ym), today)
  const expected = (target * elapsed) / totalDays
  const gap = achieved - expected

  const cheer =
    zone.key === 'green' ? 'Great going, keep it up!' : zone.key === 'yellow' ? 'You’re getting there, keep pushing.' : 'Time to pick up the pace.'

  return (
    <div className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-300">
            <Target size={16} className={zone.text} /> {monthTitle(ym)} target
          </div>
          <p className={`mt-2 font-bold tabular-nums ${compact ? 'text-2xl' : 'text-3xl'} ${zone.text}`}>{pct.toFixed(0)}%</p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${zone.chip}`}>{zone.label}</span>
      </div>

      <p className="mt-1 text-sm text-gray-400">
        <span className="font-medium text-white">{inr(achieved)}</span> of {inr(target)}
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#222]">
        <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      {remaining > 0 ? (
        <div className={`mt-4 grid gap-3 text-sm ${compact ? 'grid-cols-2' : 'sm:grid-cols-3'}`}>
          <p className="text-gray-400">
            Still needed <span className="block font-semibold text-white">{inr(remaining)}</span>
          </p>
          <p className="text-gray-400">
            Per day ({daysLeft} left) <span className="block font-semibold text-white">{inr(perDay)}</span>
          </p>
          {!compact && (
            <p className="text-gray-400">
              Pace{' '}
              <span className={`block font-semibold ${gap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {gap >= 0 ? `Ahead by ${inr(gap)}` : `Behind by ${inr(-gap)}`}
              </span>
            </p>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm font-medium text-green-400">🎉 Target achieved! Everything more is a bonus.</p>
      )}

      {!compact && remaining > 0 && <p className="mt-3 text-xs text-gray-500">{cheer}</p>}
    </div>
  )
}