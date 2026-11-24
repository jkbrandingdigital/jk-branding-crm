import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle2, Circle, Target, Phone, Users,
  TrendingUp, ArrowRight,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authUser } from '../../lib/auth'
import { istDate, inr } from '../../lib/format'
import SopWidget from '../../components/policies/SopWidget'

/*
  The greeting, the date and "My attendance" now live in My day, which
  SalesLayout puts above this page — the same greeting every role sees.
  This page keeps what is the sales person's own: today's two forms, the
  month against target, calls and leads.

  Where each card sends the person. evolution/report/performance/leads are
  tabs on the /sales shell (?page=…); policies and attendance are their own
  routes. One place to change if a path ever moves — nothing else in this
  file hard-codes them.
*/
const PATHS = {
  evolution: '/sales?page=evolution',
  report: '/sales?page=report',
  performance: '/sales?page=performance',
  leads: '/sales?page=leads',
  policies: '/sales/policies',
}

// One row of each performance RPC — for a sales person this is only them.
type Target = {
  user_id: string
  target_amount: number | null
  confirmed: number | null
  confirmed_deals: number | null
  reported: number | null
  reported_deals: number | null
  days_reported: number | null
}
type Activity = {
  user_id: string
  calls: number | null
  followup_calls: number | null
  quality_leads: number | null
  positive_leads: number | null
  hot_leads: number | null
  deals_closed: number | null
  work_days: number | null
  norm_calls: number | null
  leads_assigned: number | null
  leads_won: number | null
  leads_converted: number | null
}

export default function SalesHome() {
  const today = istDate()

  const [evoDone, setEvoDone] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const [tgt, setTgt] = useState<Target | null>(null)
  const [act, setAct] = useState<Activity | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // authUser() reads the session from local storage — no call to the
      // auth server. getUser() went over the network every time, and
      // with every component doing it that is what ran the Supabase
      // usage over its limit.
      const { data: { user } } = await authUser()
      if (!user) return

      // All at once rather than one after another. The branch name is NOT
      // fetched: the sidebar already shows it, and a second query for the
      // same word is exactly the kind of duplicate the usage fix removed.
      const [evo, rep, tp, ap] = await Promise.all([
        supabase.from('daily_evolution').select('id').eq('user_id', user.id).eq('evolution_date', today).limit(1),
        supabase.from('daily_reports').select('id').eq('user_id', user.id).eq('work_date', today).limit(1),
        supabase.rpc('sales_target_performance'),
        supabase.rpc('sales_activity_performance'),
      ])

      if (cancelled) return
      if (tp.error) setError(tp.error.message)
      if (ap.error) setError(ap.error.message)

      setEvoDone(Boolean(evo.data?.length))
      setReportDone(Boolean(rep.data?.length))

      // The RPC returns everyone the viewer may see; pick my own row.
      const mine = <T extends { user_id: string }>(list: T[] | null) =>
        list?.find((r) => r.user_id === user.id) ?? list?.[0] ?? null
      setTgt(mine(tp.data as Target[] | null))
      setAct(mine(ap.data as Activity[] | null))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [today])

  const target = Number(tgt?.target_amount ?? 0)
  const confirmed = Number(tgt?.confirmed ?? 0)
  const reported = Number(tgt?.reported ?? 0)
  const tgtPct = target > 0 ? Math.min((confirmed / target) * 100, 100) : 0

  const calls = Number(act?.calls ?? 0)
  const normCalls = Number(act?.norm_calls ?? 0)
  const callPct = normCalls > 0 ? Math.min((calls / normCalls) * 100, 100) : 0

  return (
    <div className={`mx-auto max-w-6xl ${loading ? 'opacity-60' : ''}`}>
      {/* The greeting is in My day above. This line names the section
          and keeps the way to the full numbers. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500/15 text-orange-400"><Target size={15} /></span>
          My sales
        </h2>
        <Link
          to={PATHS.performance}
          className="flex w-fit items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
        >
          <TrendingUp size={15} /> Full performance
        </Link>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          Could not load your numbers: {error}
        </div>
      )}

      {/* Today's two forms */}
      <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="text-sm font-medium text-gray-300">Today</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <TaskRow done={evoDone} to={PATHS.evolution}
            doneLabel="Evolution form submitted" todoLabel="Fill your Evolution form"
            hint={evoDone ? 'Planned your day' : 'Plan your day before calling'} />
          <TaskRow done={reportDone} to={PATHS.report}
            doneLabel="Daily report submitted" todoLabel="Fill your Daily report"
            hint={reportDone ? 'Logged today’s work' : 'Fill it at the end of the day'} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Numbers */}
        <div className="space-y-6 lg:col-span-2">
          {/* Target progress */}
          <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Target size={15} className="text-orange-400" /> This month
              </h2>
              <Link to={PATHS.performance} className="text-xs text-gray-500 hover:text-orange-400">Details</Link>
            </div>

            {target > 0 ? (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-gray-400">Confirmed business</span>
                  <span className="tabular-nums">
                    <b className="text-orange-400">{inr(confirmed)}</b>
                    <span className="text-gray-500"> / {inr(target)}</span>
                  </span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#222]">
                  <div
                    className={`h-full rounded-full ${tgtPct >= 100 ? 'bg-green-500' : tgtPct >= 60 ? 'bg-orange-500' : 'bg-red-500'}`}
                    style={{ width: `${tgtPct}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {tgtPct >= 100 ? 'Target reached 🎉' : `${inr(Math.max(target - confirmed, 0))} to go`}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No target set for this month.</p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
              <Stat label="Confirmed" value={inr(confirmed)} accent />
              <Stat label="Confirmed deals" value={String(tgt?.confirmed_deals ?? 0)} />
              <Stat label="Reported" value={inr(reported)} />
              <Stat label="Reported deals" value={String(tgt?.reported_deals ?? 0)} />
            </div>
          </section>

          {/* Calls + leads funnel */}
          <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Phone size={15} className="text-orange-400" /> Calls &amp; leads
              </h2>
              <Link to={PATHS.leads} className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-400">
                Leads <ArrowRight size={12} />
              </Link>
            </div>

            {normCalls > 0 && (
              <div className="mb-5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-gray-400">Calls this month</span>
                  <span className="tabular-nums text-gray-400">
                    <span className="text-white">{calls}</span> / {normCalls} target
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#222]">
                  <div className={`h-full rounded-full ${callPct >= 100 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${callPct}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#242424] bg-[#242424] sm:grid-cols-6">
              <Stat label="Calls" value={String(calls)} />
              <Stat label="Follow-ups" value={String(act?.followup_calls ?? 0)} />
              <Stat label="Quality" value={String(act?.quality_leads ?? 0)} />
              <Stat label="Positive" value={String(act?.positive_leads ?? 0)} />
              <Stat label="Hot" value={String(act?.hot_leads ?? 0)} />
              <Stat label="Deals" value={String(act?.deals_closed ?? 0)} accent />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-400">
              <span>Leads assigned <b className="text-white">{act?.leads_assigned ?? 0}</b></span>
              <span>Won <b className="text-green-400">{act?.leads_won ?? 0}</b></span>
              <span>Became clients <b className="text-orange-400">{act?.leads_converted ?? 0}</b></span>
            </div>
          </section>
        </div>

        {/* Side column */}
        <aside className="space-y-6">
          <SopWidget policiesPath={PATHS.policies} />

          <Link
            to={PATHS.leads}
            className="flex items-center justify-between rounded-2xl border border-[#242424] bg-[#151515] p-5 transition-colors hover:border-[#3a3a3a]"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
                <Users size={18} />
              </span>
              <span>
                <span className="block text-sm font-medium">My leads</span>
                <span className="block text-xs text-gray-500">Open pipeline</span>
              </span>
            </span>
            <ArrowRight size={16} className="text-gray-500" />
          </Link>
        </aside>
      </div>
    </div>
  )
}

function TaskRow({
  done, to, doneLabel, todoLabel, hint,
}: { done: boolean; to: string; doneLabel: string; todoLabel: string; hint: string }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        done
          ? 'border-green-900/50 bg-green-950/10'
          : 'border-[#2a2a2a] bg-[#1a1a1a] hover:border-orange-500/50'
      }`}
    >
      {done ? <CheckCircle2 size={20} className="shrink-0 text-green-400" /> : <Circle size={20} className="shrink-0 text-gray-600" />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${done ? 'text-green-300' : 'text-white'}`}>
          {done ? doneLabel : todoLabel}
        </span>
        <span className="block truncate text-xs text-gray-500">{hint}</span>
      </span>
      {!done && <ArrowRight size={15} className="shrink-0 text-gray-500" />}
    </Link>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[#151515] px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? 'text-orange-400' : 'text-white'}`}>{value}</p>
    </div>
  )
}