import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, prettyDate, inr, notifySaved } from '../../lib/format'

const DEFAULT_REVIEWER = 'Saral Sakariya'

const QUESTIONS = [
  { key: 'q1_yesterday_result', en: 'What result did you get yesterday?', gu: 'ગઈકાલે શું Result આવ્યું?' },
  { key: 'q2_quality_calls', en: 'How many quality calls did you make yesterday?', gu: 'ગઈકાલે કેટલા Quality Calls થયા?' },
  { key: 'q3_positive_leads', en: 'How many positive leads / clients do you have in total?', gu: 'તમારી પાસે ટોટલ કેટલા Positive Leads/Clients છે?' },
  { key: 'q4_hot_leads', en: 'How many hot leads / clients do you have right now?', gu: 'અત્યારે તમારી પાસે Hot Leads/Clients કેટલા છે?' },
  { key: 'q5_today_target', en: 'What is your work target for today? (new calls, data found, etc.)', gu: 'આજના દિવસ તમારો કામ કરવાનો ટાર્ગેટ શું છે?' },
  { key: 'q6_deal_close_chance', en: 'Which deal has the highest chance of closing today?', gu: 'આજના દિવસમાં કઈ Deal Close થવાની સૌથી વધુ શક્યતા છે?' },
  { key: 'q7_sales_challenge', en: 'What is one challenge you are facing in sales right now?', gu: 'હાલ તમને Sales કરવામાં આવતી કોઈ એક challenge શું છે?' },
  { key: 'q8_management_help', en: 'What help do you need from management?', gu: 'Management / મારી કઈ Help જોઈએ છે?' },
  { key: 'q9_commitment_result', en: 'What result will you commit to by this evening? (in revenue)', gu: 'આજ સાંજ સુધીમાં ચોક્કસ શું Commitment Result આપશો? (revenue માં)' },
] as const

type QKey = (typeof QUESTIONS)[number]['key']
type Answers = Record<QKey, string>
type LastReport = { work_date: string; calls: number | null; quality_leads: number | null; positive_leads: number | null; hot_leads: number | null; revenue: number | null; deals_closed: number | null }

const emptyAnswers = () => Object.fromEntries(QUESTIONS.map((q) => [q.key, ''])) as Answers

export default function EvolutionForm() {
  const today = istDate()

  const [userId, setUserId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [branchName, setBranchName] = useState('')

  const [existingId, setExistingId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>(emptyAnswers)
  const [reviewer, setReviewer] = useState(DEFAULT_REVIEWER)
  const [last, setLast] = useState<LastReport | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      setUserId(user.id)

      try {
        const p = await getUserProfile(user.id)
        setBranchId(p?.branch_id ?? null)
        setName(p?.full_name || user.email || '')
        if (p?.branch_id) {
          const { data } = await supabase.from('branches').select('name').eq('id', p.branch_id).single()
          setBranchName(data?.name ?? '')
        }
      } catch {
        setName(user.email ?? '')
      }

      const [evo, rep] = await Promise.all([
        supabase.from('daily_evolution').select('*').eq('user_id', user.id).eq('evolution_date', today).limit(1),
        supabase
          .from('daily_reports')
          .select('work_date, calls, quality_leads, positive_leads, hot_leads, revenue, deals_closed')
          .eq('user_id', user.id)
          .lt('work_date', today)
          .order('work_date', { ascending: false })
          .limit(1),
      ])

      const row = evo.data?.[0]
      if (row) {
        setExistingId(row.id)
        setReviewer(row.reviewer_name ?? DEFAULT_REVIEWER)
        setAnswers(Object.fromEntries(QUESTIONS.map((q) => [q.key, row[q.key] ?? ''])) as Answers)
      }
      setLast(rep.data?.[0] ?? null)
      setLoading(false)
    })()
  }, [today])

  async function handleSave() {
    if (!userId) return
    setMessage(null)

    const missing = QUESTIONS.findIndex((q) => !answers[q.key].trim())
    if (missing !== -1) {
      setMessage({ type: 'error', text: `Answer question ${missing + 1} before submitting.` })
      document.getElementById(QUESTIONS[missing].key)?.focus()
      return
    }

    setSaving(true)
    const payload: Record<string, unknown> = {
      user_id: userId,
      branch_id: branchId,
      evolution_date: today,
      reviewer_name: reviewer.trim() || null,
    }
    for (const q of QUESTIONS) payload[q.key] = answers[q.key].trim()

    if (existingId) {
      payload.updated_at = new Date().toISOString()
      const { error } = await supabase.from('daily_evolution').update(payload).eq('id', existingId)
      if (error) {
        setSaving(false)
        return setMessage({ type: 'error', text: error.message })
      }
    } else {
      const { data, error } = await supabase.from('daily_evolution').insert(payload).select('id').single()
      if (error) {
        setSaving(false)
        return setMessage({
          type: 'error',
          text: error.code === '23505' ? 'You already submitted today’s form. Refresh the page.' : error.message,
        })
      }
      setExistingId(data.id)
    }

    setSaving(false)
    setMessage({ type: 'success', text: existingId ? 'Evolution form updated.' : 'Evolution form submitted. Have a great day!' })
    notifySaved()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className={`mx-auto max-w-5xl ${loading ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evolution Form</h1>
          <p className="mt-1 text-sm text-gray-400">Plan your day before you start calling.</p>
        </div>
        {!loading && (
          <span
            className={`w-fit whitespace-nowrap rounded-full px-3 py-1 text-xs ${
              existingId ? 'bg-green-950/60 text-green-400' : 'bg-[#1f1f1f] text-gray-400'
            }`}
          >
            {existingId ? 'Submitted today' : 'Not submitted'}
          </span>
        )}
      </div>

      {/* Header info, like the paper form */}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
        <Info label="Date" value={prettyDate(today)} />
        <Info label="Branch" value={branchName || '—'} />
        <Info label="Sales person" value={name || '—'} />
        <div className="bg-[#151515] px-5 py-4">
          <label htmlFor="reviewer" className="text-xs text-gray-400">Reviewer</label>
          <input id="reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={`${inputCls} mt-1`} />
        </div>
      </div>

      {last && (
        <div className="mt-4 rounded-2xl border border-[#242424] bg-[#151515] px-5 py-4 text-sm">
          <p className="text-gray-400">From your last daily report ({prettyDate(last.work_date)})</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            <span>Revenue <b className="text-orange-400">{inr(Number(last.revenue ?? 0))}</b></span>
            <span>Deals <b>{last.deals_closed ?? 0}</b></span>
            <span>Calls <b>{last.calls ?? 0}</b></span>
            <span>Quality leads <b>{last.quality_leads ?? 0}</b></span>
            <span>Positive <b>{last.positive_leads ?? 0}</b></span>
            <span>Hot <b>{last.hot_leads ?? 0}</b></span>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Questions */}
      <ol className="mt-6 space-y-3">
        {QUESTIONS.map((q, i) => (
          <li key={q.key} className="grid gap-3 rounded-2xl border border-[#242424] bg-[#151515] p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <label htmlFor={q.key} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{q.en}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{q.gu}</span>
              </span>
            </label>
            <textarea
              id={q.key}
              rows={2}
              value={answers[q.key]}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
              placeholder="Your answer"
              className={`${inputCls} resize-y`}
            />
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-4 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 py-4 backdrop-blur">
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Lock size={13} /> You can edit this form until midnight today.
        </p>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          {saving ? 'Saving…' : existingId ? 'Update form' : 'Submit form'}
        </button>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#151515] px-5 py-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  )
}