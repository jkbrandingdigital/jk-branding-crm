import { useCallback, useEffect, useState } from 'react'
import { Loader2, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { inr } from '../../lib/format'

/*
  What someone earns on top of their salary.

  The rule, in one line: nothing up to the target, and above it each
  service pays its own rate.

  The split of the excess follows the month's mix rather than the
  order the work was booked in. Order would mean the whole sum hangs
  on the moment the target was crossed — and since old work can now be
  entered with its real date, entering one back-dated project would
  move that moment and quietly rewrite an incentive someone had
  already been told. A figure that changes after it was promised is
  worse than a figure that is slightly rough.

  THE PART THAT MATTERS MOST IS THE ONE FOR PEOPLE BELOW TARGET.

  An incentive only pays above the target, so for most of the month
  most people see zero. A card that says nothing but "₹0" teaches them
  to stop looking, and then it is not doing the one job it was built
  for. So below target it stops being a payslip and becomes a
  distance: how much more, and what the first rupee past it is worth.
*/

type Part = {
  service: string
  color: string
  sold: number
  share: number
  pct: number
  amount: number
}

type Row = {
  user_id: string
  full_name: string | null
  emp_code: string | null
  branch_name: string | null
  is_manager: boolean
  target_amount: number
  achieved: number
  above_target: number
  incentive: number
  breakdown: Part[] | null
}

const TINT: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  gray: 'bg-gray-500',
}

export default function IncentiveCard({
  from, to, userId, title = 'Incentive',
}: {
  /** Defaults to this month when left out. */
  from?: string
  to?: string
  /** Show one person only. Without it, everyone the viewer may see. */
  userId?: string | null
  title?: string
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('sales_incentive', {
      p_from: from ?? null,
      p_to: to ?? null,
      p_branch: null,
    })
    setLoading(false)
    if (error) return setErr(error.message)
    const all = (data ?? []) as Row[]
    setRows(userId ? all.filter((r) => r.user_id === userId) : all)
  }, [from, to, userId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="rounded-xl border border-[#242424] bg-[#151515] py-10 text-center">
        <Loader2 size={20} className="mx-auto animate-spin text-gray-500" />
      </div>
    )
  }
  if (err) {
    return <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{err}</p>
  }
  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      {/* The heading stays even for a single card. Without it this is
          an unlabelled box of money, and the one question it must
          answer before any other is "what is this?". */}
      <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <TrendingUp size={15} /> {title}
        {!from && !to && <span className="text-xs font-normal text-gray-500">· this month</span>}
      </h2>
      {rows.map((r) => <OnePerson key={r.user_id} r={r} solo={rows.length === 1} />)}
    </div>
  )
}

function OnePerson({ r, solo }: { r: Row; solo: boolean }) {
  const parts = r.breakdown ?? []
  const earning = r.above_target > 0
  const noTarget = Number(r.target_amount) === 0
  const left = Math.max(Number(r.target_amount) - Number(r.achieved), 0)

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[#151515] ${
        earning ? 'border-emerald-500/30' : 'border-[#242424]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        {!solo && (
          <div className="min-w-[10rem]">
            <p className="text-sm font-medium text-white">{r.full_name ?? 'Unnamed'}</p>
            <p className="text-xs text-gray-500">{r.emp_code}{r.branch_name ? ` · ${r.branch_name}` : ''}</p>
          </div>
        )}

        <Fig label="Target" value={noTarget ? '—' : inr(r.target_amount)} />
        <Fig label="Achieved" value={inr(r.achieved)} />
        <Fig label="Above target" value={earning ? inr(r.above_target) : '—'} />

        <div className="ml-auto text-right">
          <p className="text-xs text-gray-500">Incentive</p>
          <p className={`text-xl font-semibold tabular-nums ${earning ? 'text-emerald-400' : 'text-gray-500'}`}>
            {inr(r.incentive)}
          </p>
        </div>
      </div>

      {/* Below target: the distance, not a zero. This is the line the
          card exists for — a person on ₹0 needs to know what the next
          sale is worth, not be told again that they have nothing. */}
      {!earning && (
        <p className="border-t border-[#242424] px-5 py-3 text-xs text-gray-400">
          {noTarget
            ? 'No target set for this period, so there is nothing to earn above yet.'
            : <>
                <span className="text-white">{inr(left)}</span> more and the incentive starts.
                Everything past the target pays its own rate — see the rates in Settings.
              </>}
        </p>
      )}

      {/* Above target: where every rupee of it came from. A figure
          nobody can take apart is a figure nobody argues with — and
          also one nobody trusts. */}
      {earning && parts.length > 0 && (
        <table className="w-full border-t border-[#242424] text-sm">
          <tbody>
            {parts.map((p) => (
              <tr key={p.service} className="border-b border-[#1e1e1e] last:border-0">
                <td className="py-2 pl-5 pr-3">
                  <span className="flex items-center gap-2 text-gray-300">
                    <span className={`h-2 w-2 rounded-full ${TINT[p.color] ?? TINT.gray}`} />
                    {p.service}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-gray-500">
                  {inr(p.sold)} sold
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">
                  {inr(p.share)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  × {Number(p.pct)}%
                </td>
                <td className="py-2 pl-3 pr-5 text-right font-medium tabular-nums text-emerald-400">
                  {inr(p.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {earning && (
        <p className="border-t border-[#242424] px-5 py-2.5 text-[11px] text-gray-600">
          The {inr(r.above_target)} above target is split the way the month itself sold,
          and each share pays its service's rate.
        </p>
      )}
    </div>
  )
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 tabular-nums text-gray-200">{value}</p>
    </div>
  )
}