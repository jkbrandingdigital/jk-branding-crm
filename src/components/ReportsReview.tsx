import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, MessageSquare, CheckCircle2, AlertCircle, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { istDate, addDays, prettyDate, inr } from '../lib/format'

type Tab = 'reports' | 'evolution'
type Row = Record<string, unknown> & { id: string; user_id: string; branch_id: string | null }
type Branch = { id: string; name: string }
type Person = { id: string; full_name: string | null; branch_id: string | null }
type Deal = { report_id: string; client_name: string | null; amount: number | null; note: string | null }

const NUM_FIELDS: [string, string][] = [
  ['calls', 'Total calls'],
  ['received_calls', 'Received'],
  ['incoming_calls', 'Incoming'],
  ['followup_calls', 'Follow-up'],
  ['quality_leads', 'Quality leads'],
  ['positive_leads', 'Positive'],
  ['hot_leads', 'Hot'],
  ['fail_leads', 'Fail'],
  ['customer_followup', 'Customer follow-up'],
  ['crm_data_entry', 'CRM entries'],
  ['bulk_whatsapp', 'Bulk WhatsApp'],
  ['facebook_inquiry', 'Facebook'],
  ['indiamart_inquiry', 'IndiaMART'],
  ['old_client_ref', 'Old client ref'],
]

type Question = { id: string; question_en: string; is_active: boolean; purpose: string | null; legacy_column: string | null }

const HELP_STATUS: { key: string; label: string; cls: string }[] = [
  { key: 'open', label: 'Open', cls: 'bg-orange-950/60 text-orange-400' },
  { key: 'in_progress', label: 'In progress', cls: 'bg-blue-950/60 text-blue-400' },
  { key: 'resolved', label: 'Resolved', cls: 'bg-green-950/60 text-green-400' },
]

const num = (v: unknown) => Number(v ?? 0)
const txt = (v: unknown) => (v == null ? '' : String(v))

export default function ReportsReview({ initialTab = 'reports', lockedBranchId }: { initialTab?: Tab; lockedBranchId?: string }) {
  const today = istDate()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [date, setDate] = useState(today)
  const [branchId, setBranchId] = useState(lockedBranchId ?? 'all')
  const [userId, setUserId] = useState('all')
  const [autoLock, setAutoLock] = useState<string | null>(null)
  const lock = lockedBranchId ?? autoLock

  const [branches, setBranches] = useState<Branch[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [reports, setReports] = useState<Row[]>([])
  const [evolutions, setEvolutions] = useState<Row[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { note: string; status: string }>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Branch managers are locked to their own branch
  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      if (roleRow?.role !== 'branch_manager') return
      const { data: prof } = await supabase.from('profiles').select('branch_id').eq('id', user.id).maybeSingle()
      if (prof?.branch_id) {
        setAutoLock(prof.branch_id)
        setBranchId(prof.branch_id)
      }
    })()
  }, [])

  // Branches + sales people
  useEffect(() => {
    ;(async () => {
      const [b, p, r, qs] = await Promise.all([
        supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
        supabase.from('profiles').select('id, full_name, branch_id, is_active').order('full_name'),
        supabase.from('user_roles').select('user_id').eq('role', 'sales'),
        supabase.from('evolution_questions').select('id, question_en, is_active, purpose, legacy_column').order('sort_order'),
      ])
      setBranches(b.data ?? [])
      setQuestions(qs.data ?? [])
      const ids = new Set((r.data ?? []).map((x) => x.user_id))
      setPeople((p.data ?? []).filter((x) => x.is_active !== false && ids.has(x.id)))
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let rq = supabase.from('daily_reports').select('*').eq('work_date', date)
    let eq = supabase.from('daily_evolution').select('*').eq('evolution_date', date)
    let dq = supabase.from('deal_details').select('report_id, client_name, amount, note').eq('work_date', date)
    if (branchId !== 'all') {
      rq = rq.eq('branch_id', branchId)
      eq = eq.eq('branch_id', branchId)
      dq = dq.eq('branch_id', branchId)
    }
    const [r, e, d] = await Promise.all([rq, eq, dq])
    const err = r.error ?? e.error ?? d.error
    if (err) setMessage({ type: 'error', text: err.message })
    setReports((r.data ?? []) as Row[])
    setEvolutions((e.data ?? []) as Row[])
    setDeals(d.data ?? [])
    setDrafts({})
    setOpen(null)
    setLoading(false)
  }, [date, branchId])

  useEffect(() => {
    setMessage(null)
    load()
  }, [load])

  const personMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches])
  const nameOf = (id: string) => personMap.get(id)?.full_name || 'Unnamed'

  // Answers live in the answers JSON; older forms used q1..q9 columns
  const answerOf = (r: Row, q: Question) => {
    const json = (r.answers ?? {}) as Record<string, unknown>
    return txt(json[q.id] ?? (q.legacy_column ? r[q.legacy_column] : ''))
  }
  const helpQ = questions.find((q) => q.purpose === 'help')
  const commitQ = questions.find((q) => q.purpose === 'commitment')
  // Help question counts unless empty or "no / nothing"
  const asksHelp = (r: Row) => {
    if (!helpQ) return false
    const a = answerOf(r, helpQ).trim()
    return a !== '' && !/^(no|nothing|none|na|n\/a|nil|-|no help|ok)\.?$/i.test(a)
  }
  // Show active questions, plus removed ones this form actually answered
  const questionsFor = (r: Row) => questions.filter((q) => q.is_active || answerOf(r, q).trim() !== '')
  const visiblePeople = people.filter((p) => branchId === 'all' || p.branch_id === branchId)

  const byUser = (list: Row[]) => list.filter((r) => userId === 'all' || r.user_id === userId)
  const reportRows = byUser(reports).sort((a, b) => num(b.revenue) - num(a.revenue))
  const evoRows = byUser(evolutions).sort((a, b) => Number(asksHelp(b)) - Number(asksHelp(a)))
  const revenueOf = (uid: string) => num(reports.find((r) => r.user_id === uid)?.revenue)

  const submitted = new Set((tab === 'reports' ? reports : evolutions).map((r) => r.user_id))
  const missing = visiblePeople.filter((p) => !submitted.has(p.id) && (userId === 'all' || p.id === userId))

  function toggle(r: Row) {
    if (open === r.id) return setOpen(null)
    setOpen(r.id)
    setDrafts((d) => ({
      ...d,
      [r.id]: d[r.id] ?? {
        note: txt(tab === 'reports' ? r.admin_note : r.review_note),
        status: txt(r.help_status) || (tab === 'evolution' && asksHelp(r) ? 'open' : ''),
      },
    }))
  }

  async function save(r: Row) {
    const draft = drafts[r.id]
    if (!draft) return
    setMessage(null)
    const table = tab === 'reports' ? 'daily_reports' : 'daily_evolution'
    const patch =
      tab === 'reports'
        ? { admin_note: draft.note.trim() || null }
        : { review_note: draft.note.trim() || null, help_status: draft.status || null }
    const { error } = await supabase.from(table).update(patch).eq('id', r.id)
    if (error) return setMessage({ type: 'error', text: error.message })
    const apply = (list: Row[]) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x))
    if (tab === 'reports') setReports(apply)
    else setEvolutions(apply)
    setMessage({ type: 'success', text: `Saved for ${nameOf(r.user_id)}.` })
  }

  const selectCls =
    'rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-60'
  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-gray-400">Review what your team submitted, leave notes and follow up on help requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
            <button onClick={() => setDate(addDays(date, -1))} className="rounded-md p-1.5 text-gray-400 hover:text-white" aria-label="Previous day">
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent px-1 text-sm text-white [color-scheme:dark] focus:outline-none"
            />
            <button
              onClick={() => date < today && setDate(addDays(date, 1))}
              disabled={date >= today}
              className="rounded-md p-1.5 text-gray-400 hover:text-white disabled:opacity-30"
              aria-label="Next day"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls} disabled={!!lock} aria-label="Branch">
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectCls} aria-label="Employee">
            <option value="all">All employees</option>
            {visiblePeople.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || 'Unnamed'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex w-fit rounded-lg border border-[#2a2a2a] bg-[#161616] p-1">
        {(['reports', 'evolution'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              setOpen(null)
              setMessage(null)
            }}
            className={`rounded-md px-4 py-1.5 text-sm transition-colors ${tab === t ? 'bg-orange-500 font-medium text-black' : 'text-gray-400 hover:text-white'}`}
          >
            {t === 'reports' ? `Daily Reports (${reports.length})` : `Evolution Forms (${evolutions.length})`}
          </button>
        ))}
      </div>

      {message && (
        <div
          className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      <div className={loading ? 'opacity-50' : ''}>
        {/* List */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
          <div className="border-b border-[#222] px-5 py-3 text-sm text-gray-400">{prettyDate(date)}</div>

          {(tab === 'reports' ? reportRows : evoRows).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">Nothing submitted for this day.</p>
          ) : (
            <ul className="divide-y divide-[#222]">
              {(tab === 'reports' ? reportRows : evoRows).map((r) => {
                const expanded = open === r.id
                const draft = drafts[r.id]
                const help = tab === 'evolution' && asksHelp(r)
                const status = HELP_STATUS.find((s) => s.key === txt(r.help_status))
                return (
                  <li key={r.id}>
                    <button onClick={() => toggle(r)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left text-sm hover:bg-[#1a1a1a]" aria-expanded={expanded}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{nameOf(r.user_id)}</p>
                        <p className="truncate text-xs text-gray-500">
                          {branchName.get(r.branch_id ?? '') ?? '—'}
                          {tab === 'reports'
                            ? ` · ${num(r.calls)} calls · ${num(r.positive_leads)} positive · ${num(r.hot_leads)} hot`
                            : ` · Commitment: ${(commitQ && answerOf(r, commitQ)) || '—'}`}
                        </p>
                      </div>

                      {tab === 'reports' ? (
                        <>
                          <span className="hidden text-xs text-gray-400 sm:block">{num(r.deals_closed)} deals</span>
                          <span className="w-28 text-right font-medium tabular-nums">{inr(num(r.revenue))}</span>
                          {r.admin_note ? <MessageSquare size={15} className="text-orange-400" aria-label="Has note" /> : <span className="w-[15px]" />}
                        </>
                      ) : (
                        <>
                          <span className="hidden text-xs text-gray-400 sm:block">Actual {inr(revenueOf(r.user_id))}</span>
                          {help ? (
                            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${status?.cls ?? 'bg-orange-950/60 text-orange-400'}`}>
                              Help · {status?.label ?? 'Open'}
                            </span>
                          ) : (
                            <span className="w-20" />
                          )}
                        </>
                      )}
                      <ChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>

                    {expanded && draft && (
                      <div className="border-t border-[#222] bg-[#121212] px-5 py-5">
                        {tab === 'reports' ? (
                          <>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                              {NUM_FIELDS.map(([k, label]) => (
                                <div key={k} className="rounded-lg bg-[#1a1a1a] px-3 py-2">
                                  <p className="text-[11px] text-gray-500">{label}</p>
                                  <p className="font-semibold tabular-nums">{num(r[k])}</p>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div>
                                <p className="mb-2 text-xs text-gray-400">Deals</p>
                                {deals.filter((d) => d.report_id === r.id).length === 0 ? (
                                  <p className="text-sm text-gray-500">No deals.</p>
                                ) : (
                                  <ul className="space-y-1.5 text-sm">
                                    {deals
                                      .filter((d) => d.report_id === r.id)
                                      .map((d, i) => (
                                        <li key={i} className="flex justify-between gap-3">
                                          <span className="truncate">
                                            {d.client_name}
                                            {d.note && <span className="text-gray-500"> · {d.note}</span>}
                                          </span>
                                          <span className="shrink-0 text-orange-400 tabular-nums">{inr(num(d.amount))}</span>
                                        </li>
                                      ))}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <p className="mb-2 text-xs text-gray-400">Other activity</p>
                                <p className="whitespace-pre-wrap text-sm text-gray-300">{txt(r.other_activity) || '—'}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                            {questionsFor(r).map((q, i) => (
                              <div key={q.id} className={q.purpose === 'help' && help ? 'rounded-lg border border-orange-900/60 bg-orange-950/20 p-3' : ''}>
                                <dt className="text-xs text-gray-500">
                                  {i + 1}. {q.question_en}
                                  {!q.is_active && <span className="ml-1 text-gray-600">(removed)</span>}
                                </dt>
                                <dd className="mt-0.5 whitespace-pre-wrap text-sm">{answerOf(r, q) || '—'}</dd>
                              </div>
                            ))}
                            <div className="rounded-lg bg-[#1a1a1a] p-3">
                              <dt className="text-xs text-gray-500">Actual revenue this day</dt>
                              <dd className="mt-0.5 text-sm font-semibold text-orange-400">{inr(revenueOf(r.user_id))}</dd>
                            </div>
                          </dl>
                        )}

                        {/* Reviewer area */}
                        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                          <label className="block">
                            <span className="mb-1.5 block text-xs text-gray-400">
                              {tab === 'reports' ? 'Note for the employee (shows on their report)' : 'Review note'}
                            </span>
                            <textarea
                              rows={2}
                              value={draft.note}
                              onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, note: e.target.value } }))}
                              placeholder="Write a note…"
                              className={`${inputCls} resize-y`}
                            />
                          </label>
                          <div className="flex items-center gap-3">
                            {tab === 'evolution' && (
                              <select
                                value={draft.status}
                                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...draft, status: e.target.value } }))}
                                className={selectCls}
                                aria-label="Help status"
                              >
                                <option value="">No help needed</option>
                                {HELP_STATUS.map((s) => (
                                  <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => save(r)}
                              className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Missing */}
        {missing.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
              <UserX size={16} className="text-red-400" />
              Not submitted ({missing.length})
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {missing.map((p) => (
                <span key={p.id} className="rounded-full bg-red-950/40 px-3 py-1 text-xs text-red-300">
                  {p.full_name || 'Unnamed'}
                  {branchId === 'all' && <span className="text-red-400/60"> · {branchName.get(p.branch_id ?? '') ?? '—'}</span>}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}