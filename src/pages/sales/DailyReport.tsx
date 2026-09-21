import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Plus, Trash2, CheckCircle2, Lock, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, addDays, prettyDate, inr, notifySaved } from '../../lib/format'
import MyTargetCard from '../../components/MyTargetCard'

// ---------- Field config (same order as the Excel sheet) ----------
const GROUPS = [
  {
    title: 'Calls',
    cols: 'sm:grid-cols-4',
    fields: [
      ['calls', 'Total calls'],
      ['received_calls', 'Received calls'],
      ['incoming_calls', 'Incoming calls'],
      ['followup_calls', 'Follow-up calls'],
    ],
  },
  {
    title: 'Lead status',
    cols: 'sm:grid-cols-4',
    fields: [
      ['quality_leads', 'Quality leads'],
      ['positive_leads', 'Positive'],
      ['hot_leads', 'Hot'],
      ['fail_leads', 'Fail'],
    ],
  },
  {
    title: 'Activities',
    cols: 'sm:grid-cols-3',
    fields: [
      ['customer_followup', 'Customer follow-up'],
      ['crm_data_entry', 'CRM data entry'],
      ['bulk_whatsapp', 'Bulk WhatsApp'],
      ['facebook_inquiry', 'Facebook inquiry'],
      ['old_client_ref', 'Old client reference received'],
      ['indiamart_inquiry', 'IndiaMART inquiry'],
    ],
  },
] as const

const NUM_KEYS = GROUPS.flatMap((g) => g.fields.map(([k]) => k))

type Nums = Record<string, string>
type DealRow = { client_name: string; amount: string; note: string }
type Report = { id: string; created_at: string; admin_note: string | null; help_status: string | null } & Record<string, unknown>
type RecentReport = { id: string; work_date: string; calls: number | null; deals_closed: number | null; revenue: number | null }

const emptyNums = (): Nums => Object.fromEntries(NUM_KEYS.map((k) => [k, '']))
const emptyDeal = (): DealRow => ({ client_name: '', amount: '', note: '' })
const str = (v: unknown) => (v == null ? '' : String(v))

export default function DailyReport() {
  const today = istDate()
  const minDate = addDays(today, -3) // RLS allows reports up to 3 days back

  const [userId, setUserId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)

  const [workDate, setWorkDate] = useState(today)
  const [existing, setExisting] = useState<Report | null>(null)
  const [nums, setNums] = useState<Nums>(emptyNums)
  const [otherActivity, setOtherActivity] = useState('')
  const [deals, setDeals] = useState<DealRow[]>([])
  const [recent, setRecent] = useState<RecentReport[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const editable = !existing || istDate(new Date(existing.created_at)) === today

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      setUserId(user.id)
      try {
        const p = await getUserProfile(user.id)
        setBranchId(p?.branch_id ?? null)
      } catch {
        /* no profile yet */
      }
    })()
  }, [])

  const loadRecent = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('daily_reports')
      .select('id, work_date, calls, deals_closed, revenue')
      .eq('user_id', uid)
      .order('work_date', { ascending: false })
      .limit(7)
    setRecent(data ?? [])
  }, [])

  const loadReport = useCallback(async (uid: string, date: string) => {
    setLoading(true)
    const { data, error } = await supabase.from('daily_reports').select('*').eq('user_id', uid).eq('work_date', date).limit(1)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
      return
    }

    const report = (data?.[0] as Report | undefined) ?? null
    setExisting(report)

    if (!report) {
      setNums(emptyNums())
      setOtherActivity('')
      setDeals([])
      setLoading(false)
      return
    }

    setNums(Object.fromEntries(NUM_KEYS.map((k) => [k, str(report[k])])))
    setOtherActivity(str(report.other_activity))
    const { data: dealData } = await supabase
      .from('deal_details')
      .select('client_name, amount, note')
      .eq('report_id', report.id)
      .order('created_at')
    setDeals((dealData ?? []).map((d) => ({ client_name: d.client_name ?? '', amount: str(d.amount), note: d.note ?? '' })))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (userId) {
      setMessage(null)
      loadReport(userId, workDate)
      loadRecent(userId)
    }
  }, [userId, workDate, loadReport, loadRecent])

  // ---------- Derived ----------
  const validDeals = deals.filter((d) => d.client_name.trim() || Number(d.amount) > 0)
  const revenue = validDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const num = (k: string) => Number(nums[k]) || 0

  const warnings: string[] = []
  if (num('received_calls') > num('calls')) warnings.push('Received calls are more than total calls.')
  if (num('hot_leads') > num('positive_leads') && num('positive_leads') > 0) warnings.push('Hot leads are more than positive leads.')

  // ---------- Save ----------
  async function handleSave() {
    if (!userId) return
    setMessage(null)

    if (validDeals.some((d) => !d.client_name.trim() || !(Number(d.amount) > 0))) {
      return setMessage({ type: 'error', text: 'Every deal needs a client name and an amount above ₹0.' })
    }
    if (!nums.calls) return setMessage({ type: 'error', text: 'Enter total calls before submitting.' })

    setSaving(true)
    const payload: Record<string, unknown> = {
      user_id: userId,
      branch_id: branchId,
      work_date: workDate,
      deals_closed: validDeals.length,
      revenue,
      daily_archive_target: revenue,
      other_activity: otherActivity.trim() || null,
    }
    for (const k of NUM_KEYS) payload[k] = nums[k] === '' ? 0 : Math.max(0, Math.floor(Number(nums[k])))

    const wasUpdate = !!existing
    let reportId = existing?.id
    if (existing) {
      payload.updated_at = new Date().toISOString()
      const { error } = await supabase.from('daily_reports').update(payload).eq('id', existing.id)
      if (error) return fail(error.message)
      const { error: delErr } = await supabase.from('deal_details').delete().eq('report_id', existing.id)
      if (delErr) return fail(delErr.message)
    } else {
      const { data, error } = await supabase.from('daily_reports').insert(payload).select('id').single()
      if (error) return fail(error.code === '23505' ? 'A report for this date already exists. Refresh the page.' : error.message)
      reportId = data.id
    }

    if (validDeals.length > 0) {
      const { error } = await supabase.from('deal_details').insert(
        validDeals.map((d) => ({
          report_id: reportId,
          user_id: userId,
          branch_id: branchId,
          work_date: workDate,
          client_name: d.client_name.trim(),
          amount: Number(d.amount),
          note: d.note.trim() || null,
        })),
      )
      if (error) return fail(`Report saved, but deals failed: ${error.message}`)
    }

    setSaving(false)
    await Promise.all([loadReport(userId, workDate), loadRecent(userId)])
    setMessage({ type: 'success', text: wasUpdate ? 'Report updated.' : 'Report submitted. Great work today!' })
    notifySaved()
  }

  function fail(text: string) {
    setSaving(false)
    setMessage({ type: 'error', text })
  }

  const setDeal = (i: number, patch: Partial<DealRow>) => setDeals((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

  // ---------- UI ----------
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Report</h1>
          <p className="mt-1 text-sm text-gray-400">Fill this at the end of your day.</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                !existing ? 'bg-[#1f1f1f] text-gray-400' : editable ? 'bg-green-950/60 text-green-400' : 'bg-[#1f1f1f] text-gray-400'
              }`}
            >
              {!existing ? 'Not submitted' : editable ? 'Submitted' : 'Locked'}
            </span>
          )}
          <input
            type="date"
            value={workDate}
            min={minDate}
            max={today}
            onChange={(e) => e.target.value && setWorkDate(e.target.value)}
            className={`${inputCls} w-auto [color-scheme:dark]`}
          />
        </div>
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

      {existing && !editable && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] px-4 py-3 text-sm text-gray-400">
          <Lock size={16} /> This report is locked. Reports can only be edited on the day they are submitted.
        </div>
      )}

      {existing?.admin_note && (
        <div className="mt-5 rounded-lg border border-orange-900/60 bg-orange-950/20 px-4 py-3 text-sm">
          <p className="text-orange-400">Note from admin</p>
          <p className="mt-1 text-gray-300">{existing.admin_note}</p>
        </div>
      )}

      <div className={`mt-6 grid gap-6 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}>
        <div className="space-y-6 lg:col-span-2">
          {GROUPS.map((g) => (
            <Section key={g.title} title={g.title}>
              <div className={`grid grid-cols-2 gap-4 ${g.cols}`}>
                {g.fields.map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-1.5 block text-xs text-gray-400">{label}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={nums[key]}
                      disabled={!editable}
                      onChange={(e) => setNums((s) => ({ ...s, [key]: e.target.value }))}
                      placeholder="0"
                      className={`${inputCls} tabular-nums`}
                    />
                  </label>
                ))}
              </div>
            </Section>
          ))}

          {warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-900/60 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-300">
              {warnings.map((w) => <p key={w}>{w}</p>)}
            </div>
          )}

          <Section
            title="Deal done details"
            action={
              editable && (
                <button
                  onClick={() => setDeals((d) => [...d, emptyDeal()])}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-orange-400 hover:bg-orange-500/10"
                >
                  <Plus size={15} /> Add deal
                </button>
              )
            }
          >
            {deals.length === 0 ? (
              <p className="text-sm text-gray-500">No deals added. {editable && 'Use “Add deal” for every deal you closed.'}</p>
            ) : (
              <div className="space-y-3">
                {deals.map((d, i) => (
                  <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 sm:grid-cols-[1.3fr_140px_1fr_auto]">
                    <input
                      placeholder="Client name"
                      value={d.client_name}
                      disabled={!editable}
                      onChange={(e) => setDeal(i, { client_name: e.target.value })}
                      className={inputCls}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Amount ₹"
                      value={d.amount}
                      disabled={!editable}
                      onChange={(e) => setDeal(i, { amount: e.target.value })}
                      className={`${inputCls} tabular-nums`}
                    />
                    <input
                      placeholder="Note (optional)"
                      value={d.note}
                      disabled={!editable}
                      onChange={(e) => setDeal(i, { note: e.target.value })}
                      className={`${inputCls} col-span-2 sm:col-span-1`}
                    />
                    {editable && (
                      <button
                        onClick={() => setDeals((all) => all.filter((_, j) => j !== i))}
                        className="rounded-lg p-2 text-gray-500 hover:bg-red-950/40 hover:text-red-400"
                        aria-label="Remove deal"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <p className="pt-1 text-right text-sm text-gray-400">
                  Total amount <span className="ml-2 font-semibold text-orange-400">{inr(revenue)}</span>
                </p>
              </div>
            )}
          </Section>

          <Section title="Other activity">
            <textarea
              rows={3}
              value={otherActivity}
              disabled={!editable}
              onChange={(e) => setOtherActivity(e.target.value)}
              placeholder="e.g. Ceramic data find"
              className={`${inputCls} resize-y`}
            />
          </Section>
        </div>

        {/* Side column */}
        <aside className="space-y-6">
          <MyTargetCard compact />

          <div className="rounded-2xl border border-[#242424] bg-[#151515] p-5 lg:sticky lg:top-6">
            <p className="text-sm text-gray-400">{prettyDate(workDate)}</p>
            <p className="mt-3 text-sm text-gray-400">Revenue from deals</p>
            <p className="mt-1 text-3xl font-bold text-orange-500">{inr(revenue)}</p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Mini label="Calls" value={num('calls')} />
              <Mini label="Positive" value={num('positive_leads')} />
              <Mini label="Deals" value={validDeals.length} />
            </div>
            {editable && (
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="mt-5 w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                {saving ? 'Saving…' : existing ? 'Update report' : 'Submit report'}
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <h2 className="mb-3 text-sm font-medium text-gray-300">Your recent reports</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-500">Your submitted reports will show here.</p>
            ) : (
              <ul className="divide-y divide-[#222]">
                {recent.map((r) => {
                  const canOpen = r.work_date >= minDate
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => canOpen && setWorkDate(r.work_date)}
                        className={`flex w-full items-center justify-between py-2.5 text-left text-sm ${canOpen ? 'hover:text-orange-400' : 'cursor-default'} ${
                          r.work_date === workDate ? 'text-orange-400' : ''
                        }`}
                      >
                        <span>
                          {prettyDate(r.work_date)}
                          <span className="ml-2 text-xs text-gray-500">{r.calls ?? 0} calls · {r.deals_closed ?? 0} deals</span>
                        </span>
                        <span className="tabular-nums">{inr(Number(r.revenue ?? 0))}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ---------- Small components ----------
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#242424] bg-[#151515] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[#1a1a1a] px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  )
}