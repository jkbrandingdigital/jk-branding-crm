import { useCallback, useEffect, useState } from 'react'
import { Loader2, Percent } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

/*
  The rate each service pays above target.

  The rate sits on the service itself rather than in two buckets
  called "product" and "service". Two buckets look tidier for about a
  week, and then one service needs a rate of its own and the buckets
  have to be taken apart in code. A column per service costs nothing
  and never needs that.

  Nothing is computed and stored here. The rate is read when the
  figure is worked out, so changing it re-works the whole period —
  including incentive someone may already have been told about. That
  is the honest behaviour (the rate was wrong, so the figure was
  wrong), but it is worth saying out loud on the screen, which is why
  the line below the table exists.
*/

type Svc = {
  key: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
  incentive_pct: number
}

export default function IncentiveRates() {
  const { role } = useAuth()
  /*
    Super admin only, and not the right that guards targets.

    A branch manager splits their branch's month, so they hold
    `mod_targets` — and gating on that would have let every manager
    change the company's rates, their own team's included. The rate is
    company policy; the split is branch work. They are not the same
    decision and must not share a key.
  */
  const allowed = role === 'super_admin'

  const [rows, setRows] = useState<Svc[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('sales_services')
      .select('key, name, color, sort_order, is_active, incentive_pct')
      .order('sort_order')
    setLoading(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows((data ?? []) as Svc[])
  }, [])

  useEffect(() => {
    if (allowed) void load()
    else setLoading(false)
  }, [allowed, load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  async function setPct(s: Svc, pct: number) {
    setRows((list) => list.map((x) => (x.key === s.key ? { ...x, incentive_pct: pct } : x)))
    // Through an RPC, not a plain update. Writing to this table is
    // super-admin only, and widening that policy so a sub-admin could
    // change a rate would also let them change a service's key — and
    // a changed key turns every old project's service into "not set".
    // The RPC touches the one column.
    const { error } = await supabase.rpc('set_incentive_pct', {
      p_key: s.key,
      p_pct: pct,
    })
    if (error) {
      setMsg({ ok: false, text: error.message })
      void load()
    }
  }

  if (loading) {
    return <div className="py-10 text-center"><Loader2 size={20} className="mx-auto animate-spin text-gray-500" /></div>
  }
  if (!allowed) return null

  return (
    <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
      <div className="mb-1 flex items-center gap-2">
        <Percent size={15} className="text-gray-400" />
        <h2 className="text-sm font-medium text-gray-300">Incentive rates</h2>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        Paid only on what is sold above the target. Up to the target, nothing.
      </p>

      {msg && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-3 rounded-lg border border-[#242424] bg-[#171717] px-3 py-2.5 ${
              s.is_active ? '' : 'opacity-50'
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{s.name}</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              onWheel={(e) => e.currentTarget.blur()}
              value={s.incentive_pct}
              onChange={(e) => void setPct(s, Number(e.target.value) || 0)}
              aria-label={`Incentive percent for ${s.name}`}
              className="w-24 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-right text-sm tabular-nums text-white focus:border-orange-500 focus:outline-none"
            />
            <span className="w-4 text-sm text-gray-500">%</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-gray-500">
        Changes save as you type, and the figures are worked out fresh every time they are
        shown — so a rate changed today also changes this month's incentive, including any
        already shown to someone.
      </p>
    </section>
  )
}