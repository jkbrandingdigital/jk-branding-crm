import { useEffect, useState } from 'react'
import {
  ArrowLeft, Download, Flame, Loader2, PhoneCall, PhoneIncoming, Repeat, Sparkles, UserPlus,
} from 'lucide-react'
import {
  downloadCsv, loadActivity, nameOf, sum, trendOf, type ActivityRow,
} from './salesPerf'

/*
  Activity — calls, follow-ups, leads. The effort side.

  There is no green, no yellow, no red anywhere on this screen, and that
  is the whole point of it being separate. Calls are an input. Someone
  who makes three hundred of them and closes nothing has a problem, but
  it is a coaching problem, and a red chip would say the opposite of
  what is needed.

  The daily work norm is shown as a reference line, not a pass mark.
  Work norms are per working day (Sundays excluded), multiplied up in
  the RPC, so a short month does not look like slacking.

  Everything here comes from daily_reports, which people fill in
  themselves. Where that matters — someone who filed nothing — it is
  said on the row rather than left as a confident zero.
*/

const CARD = 'rounded-2xl border border-[#242424] bg-[#151515] p-5'

function Tile({
  icon, label, value, foot,
}: {
  icon: React.ReactNode
  label: string
  value: string
  foot?: React.ReactNode
}) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-[#1f1f1f] p-2.5 text-gray-300">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
      {foot && <div className="mt-3">{foot}</div>}
    </div>
  )
}

// Neutral by design: brand orange against a plain track, no verdict colour.
function NormBar({ done, norm }: { done: number; norm: number }) {
  if (norm <= 0) return <p className="text-xs text-gray-600">No daily norm set</p>
  const pct = Math.min((done / norm) * 100, 100)
  return (
    <>
      <div className="h-2 overflow-hidden rounded-full bg-[#222]">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        {done.toLocaleString('en-IN')} of {norm.toLocaleString('en-IN')} expected
      </p>
    </>
  )
}

export default function ActivityPerformance({
  from, to, branchId, userId, onPickUser, canSwitch = true,
}: {
  from: string
  to: string
  branchId: string
  userId: string
  onPickUser: (id: string) => void
  // false on a sales person's own page — no team to step back to.
  canSwitch?: boolean
}) {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let dead = false
    setLoading(true)
    setErr(null)
    loadActivity(from, to, branchId)
      .then((r) => !dead && setRows(r))
      .catch((e) => !dead && setErr((e as Error).message))
      .finally(() => !dead && setLoading(false))
    return () => { dead = true }
  }, [from, to, branchId])

  const person = userId !== 'all' ? rows.find((r) => r.user_id === userId) ?? null : null
  const scope = person ? [person] : rows

  const calls = sum(scope, (r) => r.calls)
  const incoming = sum(scope, (r) => r.incoming_calls)
  const follow = sum(scope, (r) => r.followup_calls)
  const found = sum(scope, (r) => r.leads_found)
  const quality = sum(scope, (r) => r.quality_leads)
  const positive = sum(scope, (r) => r.positive_leads)
  const hot = sum(scope, (r) => r.hot_leads)
  const prevCalls = sum(scope, (r) => r.prev_calls)
  const normCalls = sum(scope, (r) => r.norm_calls)
  const normFollow = sum(scope, (r) => r.norm_follow_ups)
  const assigned = sum(scope, (r) => r.leads_assigned)
  const won = sum(scope, (r) => r.leads_won)
  const converted = sum(scope, (r) => r.leads_converted)
  const workDays = scope[0]?.work_days ?? 0
  const filed = sum(scope, (r) => r.days_reported)
  const expectedForms = workDays * scope.length

  const funnel = [
    { label: 'Leads received', n: assigned, icon: <UserPlus size={14} /> },
    { label: 'Hot leads', n: hot, icon: <Flame size={14} /> },
    { label: 'Won', n: won, icon: <Sparkles size={14} /> },
    { label: 'Became a client', n: converted, icon: <Sparkles size={14} /> },
  ]

  function exportCsv() {
    const head = [
      'Sales person', 'Code', 'Branch', 'Calls', 'Expected calls', 'Incoming',
      'Follow-ups', 'Expected follow-ups', 'Leads found', 'Quality', 'Positive', 'Hot',
      'Deals entered', 'Leads received', 'Won', 'Became a client', 'Reports filed', 'Working days',
    ]
    const body = rows.map((r) => [
      nameOf(r), r.emp_code ?? '', r.branch_name ?? '',
      r.calls, r.norm_calls, r.incoming_calls, r.followup_calls, r.norm_follow_ups,
      r.leads_found, r.quality_leads, r.positive_leads, r.hot_leads,
      r.deals_closed, r.leads_assigned, r.leads_won, r.leads_converted,
      r.days_reported, r.work_days,
    ])
    downloadCsv(`sales_activity_${from}_to_${to}.csv`, [head, ...body])
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        Could not load activity: {err}
      </div>
    )
  }

  return (
    <div className={loading ? 'opacity-60' : ''}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-gray-500">
          Effort, not a score — nothing here is marked pass or fail.
          {loading && <Loader2 size={13} className="animate-spin" />}
        </p>
        <div className="flex items-center gap-2">
          {person && canSwitch && (
            <button
              onClick={() => onPickUser('all')}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
            >
              <ArrowLeft size={13} /> Whole team
            </button>
          )}
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
          >
            <Download size={13} /> Excel
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<PhoneCall size={18} />} label="Calls made" value={calls.toLocaleString('en-IN')}
          foot={<NormBar done={calls} norm={normCalls} />}
        />
        <Tile
          icon={<Repeat size={18} />} label="Follow-up calls" value={follow.toLocaleString('en-IN')}
          foot={<NormBar done={follow} norm={normFollow} />}
        />
        <Tile
          icon={<PhoneIncoming size={18} />} label="Incoming calls" value={incoming.toLocaleString('en-IN')}
          foot={<p className="text-xs text-gray-500">Came to us, not from us</p>}
        />
        <Tile
          icon={<UserPlus size={18} />} label="Leads found" value={found.toLocaleString('en-IN')}
          foot={
            <p className="text-xs text-gray-500">
              {quality.toLocaleString('en-IN')} quality · {positive.toLocaleString('en-IN')} positive · {hot.toLocaleString('en-IN')} hot
            </p>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {/* ---------- funnel ---------- */}
        <section className={`${CARD} xl:col-span-2`}>
          <h2 className="text-sm font-medium text-gray-300">From lead to client</h2>
          <p className="mt-0.5 mb-4 text-xs text-gray-500">
            Leads created in this period. A lead that came in last month and closed this month is not counted here.
          </p>
          <ul className="space-y-3">
            {funnel.map((f) => {
              const pct = assigned > 0 ? (f.n / assigned) * 100 : 0
              return (
                <li key={f.label}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-gray-300">{f.icon} {f.label}</span>
                    <span className="tabular-nums">
                      {f.n}
                      {assigned > 0 && <span className="ml-2 text-xs text-gray-500">{pct.toFixed(0)}%</span>}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#222]">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
          {assigned === 0 && (
            <p className="mt-4 text-xs text-gray-500">No leads were created in this period.</p>
          )}
        </section>

        {/* ---------- discipline ---------- */}
        <section className={CARD}>
          <h2 className="text-sm font-medium text-gray-300">Daily reports</h2>
          <p className="mt-0.5 text-xs text-gray-500">Sundays are not counted as working days.</p>
          <p className="mt-5 text-3xl font-bold tabular-nums">
            {filed}
            <span className="text-base font-normal text-gray-500"> / {expectedForms}</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#222]">
            <div
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${expectedForms > 0 ? Math.min((filed / expectedForms) * 100, 100) : 0}%` }}
            />
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-400">Calls, last period</dt>
              <dd className="tabular-nums">{prevCalls.toLocaleString('en-IN')}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-400">Change</dt>
              <dd className="tabular-nums">
                {trendOf(calls, prevCalls) === null ? '—' : `${trendOf(calls, prevCalls)! >= 0 ? '+' : ''}${trendOf(calls, prevCalls)}%`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-400">Calls per working day</dt>
              <dd className="tabular-nums">{workDays > 0 ? Math.round(calls / workDays) : '—'}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* ---------- table ---------- */}
      {!person && (
        <section className={`${CARD} mt-4`}>
          <h2 className="mb-4 text-sm font-medium text-gray-300">Everyone</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-gray-400">
                  <th className="py-2 pr-4 font-normal">Sales person</th>
                  <th className="py-2 pr-4 font-normal">Calls vs norm</th>
                  <th className="py-2 pr-4 text-right font-normal">Incoming</th>
                  <th className="py-2 pr-4 text-right font-normal">Follow-ups</th>
                  <th className="py-2 pr-4 text-right font-normal">Found</th>
                  <th className="py-2 pr-4 text-right font-normal">Quality</th>
                  <th className="py-2 pr-4 text-right font-normal">Hot</th>
                  <th className="py-2 pr-4 text-right font-normal">Leads → client</th>
                  <th className="py-2 text-right font-normal">Reports</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      {loading ? 'Loading…' : 'No sales people to show here.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.user_id}
                      onClick={() => onPickUser(r.user_id)}
                      className="cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a]"
                    >
                      <td className="py-3 pr-4">
                        <span className="block font-medium">
                          {nameOf(r)}
                          {r.is_manager && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] align-middle text-gray-400">Manager</span>}
                        </span>
                        <span className="text-xs text-gray-500">
                          {r.emp_code ? `${r.emp_code} · ` : ''}{r.branch_name ?? 'No branch'}
                        </span>
                      </td>
                      <td className="w-[24%] py-3 pr-4">
                        <NormBar done={r.calls} norm={r.norm_calls} />
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.incoming_calls}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.followup_calls}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.leads_found}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.quality_leads}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{r.hot_leads}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">
                        {r.leads_assigned} <span className="text-gray-600">→</span> {r.leads_converted}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {r.days_reported === 0 ? (
                          <span className="text-amber-300">0 / {r.work_days}</span>
                        ) : (
                          <span className="text-gray-400">{r.days_reported} / {r.work_days}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}