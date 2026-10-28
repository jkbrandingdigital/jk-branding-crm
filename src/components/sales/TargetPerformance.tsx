import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Award, Coins, Download, Handshake,
  Loader2, Target as TargetIcon, TrendingDown, TrendingUp, Users,
} from 'lucide-react'
import DonutChart from '../DonutChart'
import GaugeRing from '../GaugeRing'
import { useChartTheme } from '../../lib/chartTheme'
import { inr, inrCompact, istDate, monthLabel } from '../../lib/format'
import { pctOf, zoneOf, type Zone } from '../../lib/targets'
import {
  achievedOf, dealsOf, downloadCsv, loadBranchTarget, loadMonthlyTrend, loadServices,
  loadTarget, nameOf, prevOf, SOURCE_LABEL, SOURCE_NOTE, sum, trendOf,
  type ServiceRow, type Source, type TargetRow,
} from './salesPerf'
import IncentiveCard from './IncentiveCard'

/*
  Target performance — the measure that actually decides how a sales
  person is doing.

  Money only. No calls, no follow-ups, no "did they fill the form".
  Those live on the Activity tab and carry no verdict, because effort
  and result are two different questions and a screen that answers both
  at once ends up answering neither.

  The zone colours come from zoneOf() and are not recomputed here. The
  same rule has to hold on the board, in the table and on a person's own
  page, and the only way to be sure of that is to have one copy of it.
*/

const CARD = 'rounded-2xl border border-[#242424] bg-[#151515] p-5'

/*
  Which number counts as "achieved", and from when.

  The Customer and Project layer began on 16 October 2026, halfway
  through that month. Before that date there was nowhere to record a
  confirmed deal, so October's confirmed figure is missing half its own
  month — one person showed 8% on it against 29% on the daily reports,
  and the 8% was the CRM's fault, not hers.

  So until a full month has run the new way, Daily reports is the fairer
  default. From 1 November the page opens on Confirmed by itself. A date
  rather than a reminder, because a reminder is a thing to forget.
*/
const PROJECTS_FROM = '2026-10-16'
const CONFIRMED_DEFAULT_FROM = '2026-11-01'
const defaultSource = (): Source => (istDate() >= CONFIRMED_DEFAULT_FROM ? 'confirmed' : 'reported')

// ---------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------
function Tile({
  icon, tint, label, value, foot,
}: {
  icon: React.ReactNode
  tint: string
  label: string
  value: string
  foot?: React.ReactNode
}) {
  return (
    <div className={CARD}>
      <div className="flex items-start gap-3">
        <span className={`rounded-xl p-2.5 ${tint}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
      {foot && <div className="mt-3">{foot}</div>}
    </div>
  )
}

function Bar100({ pct, zone }: { pct: number; zone: Zone }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#222]">
        <div className={`h-full rounded-full ${zone.bar}`} style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      </div>
      <span className={`w-11 shrink-0 text-right text-xs font-semibold tabular-nums ${zone.text}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function Trend({ value }: { value: number | null }) {
  // Nothing to compare against reads as a dash, never as +100%. A first
  // sale after a blank month is not a hundred per cent improvement.
  if (value === null) return <span className="text-xs text-gray-600">—</span>
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{value}%
    </span>
  )
}

// ---------------------------------------------------------------------
export default function TargetPerformance({
  from, to, branchId, userId, onPickUser, basePath, canSwitch = true,
}: {
  from: string
  to: string
  branchId: string
  userId: string
  onPickUser: (id: string) => void
  basePath: string
  // false on a sales person's own page: there is no team to go back to,
  // and no full report of someone else's to open.
  canSwitch?: boolean
}) {
  const navigate = useNavigate()
  const chart = useChartTheme()

  const [source, setSource] = useState<Source>(defaultSource)
  const [rows, setRows] = useState<TargetRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [trend, setTrend] = useState<{ ym: string; target: number; confirmed: number; reported: number }[]>([])
  const [branchTarget, setBranchTarget] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [zoneFilter, setZoneFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all')

  useEffect(() => {
    let dead = false
    setLoading(true)
    setErr(null)
    Promise.all([
      loadTarget(from, to, branchId),
      loadServices(from, to, branchId, userId),
      loadBranchTarget(from, to, branchId),
    ])
      .then(([t, s, bt]) => { if (!dead) { setRows(t); setServices(s); setBranchTarget(bt) } })
      .catch((e) => !dead && setErr((e as Error).message))
      .finally(() => !dead && setLoading(false))
    return () => { dead = true }
  }, [from, to, branchId, userId])

  // The six-month strip does not follow the period pills — it is the
  // long view, and re-cutting it to "last month" would make it useless.
  useEffect(() => {
    let dead = false
    loadMonthlyTrend(6, branchId, userId)
      .then((t) => !dead && setTrend(t))
      .catch(() => !dead && setTrend([]))
    return () => { dead = true }
  }, [branchId, userId])

  const person = userId !== 'all' ? rows.find((r) => r.user_id === userId) ?? null : null

  // Totals for whoever is on screen
  const scope = person ? [person] : rows

  /*
    Two targets, and the headline is the branch one.

    empTarget is what has actually been handed to individuals — the
    table below adds up to it, row by row. branchTarget is what the
    branches have committed to, which is the number the company is
    answerable for and the one a person looking at this page means by
    "total".

    The gap between them is real and is named rather than hidden: target
    the branch has taken on that nobody has been given yet.

    When no branch target exists at all, the employee sum stands in, so
    the tile is never blank merely because one screen was left unfilled.
  */
  const empTarget = sum(scope, (r) => Number(r.target_amount))
  const totTarget = person ? empTarget : branchTarget > 0 ? branchTarget : empTarget
  const unassigned = person ? 0 : Math.max(totTarget - empTarget, 0)

  const totGot = sum(scope, (r) => achievedOf(r, source))
  const totPrev = sum(scope, (r) => prevOf(r, source))
  const totDeals = sum(scope, (r) => dealsOf(r, source))
  const totPct = pctOf(totGot, totTarget)
  const totZone = zoneOf(totPct)

  const counted = useMemo(
    () => rows.map((r) => {
      const got = achievedOf(r, source)
      const pct = pctOf(got, Number(r.target_amount))
      return { r, got, pct, zone: zoneOf(pct), deals: dealsOf(r, source), trend: trendOf(got, prevOf(r, source)) }
    }),
    [rows, source],
  )

  // Zone counts only mean something for people who have a target. Someone
  // with no target set is not "in the red" — nobody has told them what
  // red would be. They are listed on their own.
  const withTarget = counted.filter((c) => Number(c.r.target_amount) > 0)
  const noTarget = counted.filter((c) => Number(c.r.target_amount) <= 0)
  const zoneCount = {
    green: withTarget.filter((c) => c.zone.key === 'green').length,
    yellow: withTarget.filter((c) => c.zone.key === 'yellow').length,
    red: withTarget.filter((c) => c.zone.key === 'red').length,
  }

  const top = withTarget.slice().sort((a, b) => b.pct - a.pct)[0] ?? null

  // Named so the tile can say "Rajkot target" instead of "Total target"
  // once a branch is picked. The filter is the drill-down; the headline
  // just has to admit which scope it is showing.
  const scopeName = branchId !== 'all' ? rows[0]?.branch_name ?? null : null
  const shown = zoneFilter === 'all' ? counted : counted.filter((c) => c.zone.key === zoneFilter && Number(c.r.target_amount) > 0)

  // Colour is left empty so DonutChart hands out the app palette — the
  // same six colours every other chart uses.
  const serviceSlices = services.map((s) => ({ name: s.service_name, value: Number(s.amount), color: '' }))

  function exportCsv() {
    const head = ['#', 'Sales person', 'Code', 'Branch', 'Target', SOURCE_LABEL[source], '%', 'Status', 'Deals', 'Trend %']
    const body = shown.map((c, i) => [
      i + 1, nameOf(c.r), c.r.emp_code ?? '', c.r.branch_name ?? '',
      Number(c.r.target_amount), c.got, c.pct.toFixed(0),
      Number(c.r.target_amount) > 0 ? c.zone.label.replace(' zone', '') : 'No target',
      c.deals, c.trend === null ? '' : c.trend,
    ])
    downloadCsv(`sales_target_${from}_to_${to}.csv`, [head, ...body])
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
        Could not load target performance: {err}
      </div>
    )
  }

  return (
    <div className={loading ? 'opacity-60' : ''}>
      {/* Which number counts as achieved. Put at the top because it
          changes every figure underneath it. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
          {(['confirmed', 'reported'] as Source[]).map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                source === s ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{SOURCE_NOTE[source]}</p>
        {loading && <Loader2 size={14} className="animate-spin text-gray-500" />}
      </div>

      {/* Said out loud, because an unexplained low number gets blamed on
          the person it is sitting next to. */}
      {source === 'confirmed' && from < PROJECTS_FROM && (
        <p className="mb-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Projects only started being recorded on 16 Oct 2026. Deals won before that are not in this figure —
          for those, Daily reports is the honest number.
        </p>
      )}

      {person && canSwitch && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => onPickUser('all')}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
          >
            <ArrowLeft size={13} /> Whole team
          </button>
          <button
            onClick={() => navigate(`${basePath}/employee/${person.user_id}`)}
            className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300"
          >
            Full report <ArrowUpRight size={13} />
          </button>
        </div>
      )}

      {/* ---------- the four numbers ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<TargetIcon size={18} />} tint="bg-orange-500/10 text-orange-400"
          label={person ? 'Sales target' : scopeName ? `${scopeName} target` : 'Total target'}
          value={totTarget > 0 ? inr(totTarget) : '—'}
          foot={
            totTarget <= 0 ? (
              <p className="text-xs text-gray-500">No target set for this period</p>
            ) : person ? (
              <p className="text-xs text-gray-500">For this period</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  {branchTarget > 0
                    ? `Handed to ${withTarget.length} ${withTarget.length === 1 ? 'person' : 'people'}: ${inr(empTarget)}`
                    : `From ${withTarget.length} ${withTarget.length === 1 ? 'person' : 'people'} · no branch target set`}
                </p>
                {unassigned >= 1 && (
                  <p className="text-xs text-amber-300">{inr(unassigned)} not handed to anyone</p>
                )}
              </div>
            )
          }
        />
        <Tile
          icon={<Coins size={18} />} tint="bg-green-500/10 text-green-400"
          label="Achieved"
          value={inr(totGot)}
          foot={totTarget > 0 ? <Bar100 pct={totPct} zone={totZone} /> : <Trend value={trendOf(totGot, totPrev)} />}
        />
        <Tile
          icon={<Handshake size={18} />} tint="bg-blue-500/10 text-blue-400"
          label="Deals"
          value={String(totDeals)}
          foot={<p className="text-xs text-gray-500">{source === 'confirmed' ? 'Projects created' : 'Entered in daily reports'}</p>}
        />
        <Tile
          icon={<TrendingUp size={18} />} tint="bg-purple-500/10 text-purple-400"
          label="Average deal value"
          value={totDeals > 0 ? inr(Math.round(totGot / totDeals)) : '—'}
          foot={<Trend value={trendOf(totGot, totPrev)} />}
        />
      </div>

      {/* ---------- what it pays ----------
          Directly under the four numbers, because this is the one a
          sales person looks for first and the only figure on the page
          that is theirs to take home.

          It always reads confirmed projects, whatever the toggle above
          says. A daily report is typed by hand and carries no service,
          so it can neither be checked nor split — and money that is
          paid out has to come from the side that cannot be typed up. */}
      <div className="mt-4">
        <IncentiveCard from={from} to={to} userId={userId !== 'all' ? userId : null} />
        {source === 'reported' && (
          <p className="mt-2 text-xs text-gray-500">
            Worked out from confirmed projects, so it will not match the Achieved figure above.
          </p>
        )}
      </div>

      {/* ---------- overview strip ----------
          One person's own page has no team overview and no top performer —
          both are team questions. Three columns there would leave two of
          them empty, which is exactly the hole this grid used to show. */}
      <div className={`mt-4 grid items-stretch gap-4 ${person ? '' : 'xl:grid-cols-3'}`}>
        {!person && (
          <section className={`${CARD} flex flex-col xl:col-span-1`}>
            <h2 className="text-sm font-medium text-gray-300">Team overview</h2>
            <p className="mt-0.5 text-xs text-gray-500">Click a box to filter the table.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                ['green', 'Green', '70% +', zoneCount.green],
                ['yellow', 'Yellow', '30 – 70%', zoneCount.yellow],
                ['red', 'Red', 'Below 30%', zoneCount.red],
              ] as const).map(([key, label, range, n]) => {
                const z = zoneOf(key === 'green' ? 100 : key === 'yellow' ? 50 : 0)
                const on = zoneFilter === key
                return (
                  <button
                    key={key}
                    onClick={() => setZoneFilter(on ? 'all' : key)}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                      on ? 'border-orange-500 bg-orange-500/5' : 'border-[#242424] hover:border-[#333]'
                    }`}
                  >
                    <Users size={15} className={z.text} />
                    <p className={`mt-2 text-2xl font-bold tabular-nums ${z.text}`}>{n}</p>
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="text-[11px] text-gray-600">{range}</p>
                  </button>
                )
              })}
            </div>
            {noTarget.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {noTarget.length} {noTarget.length === 1 ? 'person has' : 'people have'} no target for this period, so they are in no zone.
              </p>
            )}
          </section>
        )}

        <section className={`${CARD} flex flex-col`}>
          <h2 className="text-sm font-medium text-gray-300">Target achievement</h2>
          {/*
            On one person's page this card has the whole width to itself,
            so the ring sits to the left and the figures spread out beside
            it rather than huddling in the middle of an empty card.
          */}
          <div
            className={`flex flex-1 flex-wrap items-center gap-8 py-4 ${
              person ? 'justify-start sm:gap-12 sm:px-4' : 'justify-center gap-6'
            }`}
          >
            <GaugeRing pct={totPct} colorClass={totZone.text} caption="of target" size={person ? 190 : 168} />
            <ul className={person ? 'flex flex-wrap gap-10 text-sm' : 'space-y-2.5 text-sm'}>
              <li>
                <span className="block text-xs text-gray-500">Achieved</span>
                <span className={`font-semibold tabular-nums text-green-400 ${person ? 'text-xl' : ''}`}>
                  {inr(totGot)}
                </span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Still to go</span>
                <span className={`font-semibold tabular-nums ${person ? 'text-xl' : ''}`}>
                  {totTarget > totGot ? inr(totTarget - totGot) : '—'}
                </span>
              </li>
              <li>
                <span className="block text-xs text-gray-500">Target</span>
                <span className={`tabular-nums text-gray-400 ${person ? 'text-xl' : ''}`}>
                  {totTarget > 0 ? inr(totTarget) : 'Not set'}
                </span>
              </li>
              {person && totDeals > 0 && (
                <li>
                  <span className="block text-xs text-gray-500">Deals</span>
                  <span className="text-xl font-semibold tabular-nums">{totDeals}</span>
                </li>
              )}
            </ul>
          </div>
          {totTarget === 0 && (
            <p className="text-center text-xs text-gray-500">
              No target set for this period, so the ring has nothing to measure against.
            </p>
          )}
        </section>

        {!person && (
          <section className={`${CARD} flex flex-col`}>
            <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <Award size={15} className="text-orange-400" /> Top performer
            </h2>
            {top ? (
              <button onClick={() => onPickUser(top.r.user_id)} className="mt-4 block w-full text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {nameOf(top.r)}
                      {top.r.is_manager && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] align-middle text-gray-400">Manager</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {top.r.emp_code ? `${top.r.emp_code} · ` : ''}{top.r.branch_name ?? 'No branch'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${top.zone.chip}`}>
                    {top.pct.toFixed(0)}%
                  </span>
                </div>
                <p className="mt-3 text-sm tabular-nums">
                  <span className="font-semibold">{inr(top.got)}</span>
                  <span className="text-gray-500"> / {inr(Number(top.r.target_amount))}</span>
                </p>
                <div className="mt-2"><Bar100 pct={top.pct} zone={top.zone} /></div>
                <p className="mt-3 text-xs text-gray-500">{top.deals} {top.deals === 1 ? 'deal' : 'deals'} this period</p>
              </button>
            ) : (
              <p className="mt-6 text-sm text-gray-500">Nobody has a target set for this period yet.</p>
            )}
          </section>
        )}
      </div>

      {/* ---------- the table ---------- */}
      {!person && (
        <section className={`${CARD} mt-4`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-gray-300">Sales team performance</h2>
              <p className="mt-0.5 text-xs text-gray-500">Click a name to open just that person.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
                {([['all', 'All'], ['green', 'Green'], ['yellow', 'Yellow'], ['red', 'Red']] as const).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setZoneFilter(k)}
                    className={`rounded-md px-3 py-1 text-xs transition-colors ${
                      zoneFilter === k ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
              >
                <Download size={13} /> Excel
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-[#242424] text-left text-gray-400">
                  <th className="py-2 pr-3 font-normal">#</th>
                  <th className="py-2 pr-4 font-normal">Sales person</th>
                  <th className="py-2 pr-4 text-right font-normal">Target</th>
                  <th className="py-2 pr-4 text-right font-normal">Achieved</th>
                  <th className="py-2 pr-4 font-normal">Progress</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 text-right font-normal">Deals</th>
                  <th className="py-2 text-right font-normal">Trend</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      {loading ? 'Loading…' : 'No sales people to show here.'}
                    </td>
                  </tr>
                ) : (
                  shown.map((c, i) => (
                    <tr
                      key={c.r.user_id}
                      onClick={() => onPickUser(c.r.user_id)}
                      className="cursor-pointer border-b border-[#1c1c1c] last:border-0 hover:bg-[#1a1a1a]"
                    >
                      <td className="py-3 pr-3 text-gray-500">{i + 1}</td>
                      <td className="py-3 pr-4">
                        <span className="block font-medium">
                          {nameOf(c.r)}
                          {/* A branch manager carrying a target of their own.
                              Marked so nobody reads the list as "my team" and
                              wonders why their own boss is in it. */}
                          {c.r.is_manager && <span className="ml-2 rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] align-middle text-gray-400">Manager</span>}
                        </span>
                        <span className="text-xs text-gray-500">
                          {c.r.emp_code ? `${c.r.emp_code} · ` : ''}{c.r.branch_name ?? 'No branch'}
                        </span>
                        {c.r.days_reported === 0 && source === 'reported' && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-300">
                            <AlertTriangle size={11} /> no daily reports
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums text-gray-400">
                        {Number(c.r.target_amount) > 0 ? inr(Number(c.r.target_amount)) : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium tabular-nums">{inr(c.got)}</td>
                      <td className="w-[22%] py-3 pr-4">
                        {Number(c.r.target_amount) > 0
                          ? <Bar100 pct={c.pct} zone={c.zone} />
                          : <span className="text-xs text-gray-600">No target set</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {Number(c.r.target_amount) > 0 ? (
                          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${c.zone.chip}`}>
                            {c.zone.label.replace(' zone', '')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right tabular-nums">{c.deals}</td>
                      <td className="py-3 text-right"><Trend value={c.trend} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- service split + the long view ---------- */}
      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2">
        <section className={`${CARD} flex flex-col`}>
          <h2 className="text-sm font-medium text-gray-300">Revenue by service</h2>
          {/*
            This always reads confirmed projects, because a daily report
            carries no service. With the toggle on Daily reports the total
            here will not match the Achieved tile, so it says why rather
            than leaving two different figures staring at each other.
          */}
          <p className="mt-0.5 mb-4 text-xs text-gray-500">
            From the service set on each project. Work with none set shows as "Not set".
            {source === 'reported' && ' Confirmed projects only, so this will not match Achieved above.'}
          </p>
          <div className="flex flex-1 items-center justify-center">
            {serviceSlices.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500">No confirmed work in this period.</p>
            ) : (
              <DonutChart data={serviceSlices} format={inr} centerLabel="Total" empty="No confirmed work in this period." />
            )}
          </div>
        </section>

        <section className={`${CARD} flex flex-col`}>
          <h2 className="text-sm font-medium text-gray-300">Last six months</h2>
          <p className="mt-0.5 mb-4 text-xs text-gray-500">
            Always six months, whatever period is picked above.
          </p>
          {trend.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-10">
              <p className="text-sm text-gray-500">No data yet for the past six months.</p>
            </div>
          ) : (
            <div className="h-56 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="ym" tickFormatter={monthLabel} tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: chart.grid }} />
                  <YAxis tickFormatter={inrCompact} tick={{ fill: chart.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    contentStyle={chart.tooltip}
                    itemStyle={chart.tooltipItem}
                    cursor={{ fill: chart.cursor }}
                    labelFormatter={(v) => monthLabel(String(v))}
                    formatter={(v, n) => [inr(Number(v)), String(n)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: chart.axis }} />
                  <Bar dataKey="target" name="Target" fill={chart.series[3]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={source} name={SOURCE_LABEL[source]} fill={chart.series[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}