import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getCurrentUser, getUserProfile } from '../../lib/auth'
import { istDate, prettyDate, inr, notifySaved } from '../../lib/format'

const DEFAULT_REVIEWER = 'Saral Sakariya'

type Question = {
  id: string
  question_en: string
  question_gu: string | null
  is_required: boolean
  legacy_column: string | null
}
type LastReport = { work_date: string; calls: number | null; quality_leads: number | null; positive_leads: number | null; hot_leads: number | null; revenue: number | null; deals_closed: number | null }

export default function EvolutionForm() {
  const today = istDate()

  const [userId, setUserId] = useState<string | null>(null)
  const [branchId, setBranchId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [branchName, setBranchName] = useState('')

  const [questions, setQuestions] = useState<Question[]>([])
  const [existingId, setExistingId] = useState<string | null>(null)
  const [oldAnswers, setOldAnswers] = useState<Record<string, string>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [reviewer, setReviewer] = useState(DEFAULT_REVIEWER)
  const [reviewNote, setReviewNote] = useState('')
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

      const [qs, evo, rep] = await Promise.all([
        supabase
          .from('evolution_questions')
          .select('id, question_en, question_gu, is_required, legacy_column')
          .eq('is_active', true)
          .order('sort_order'),
        supabase.from('daily_evolution').select('*').eq('user_id', user.id).eq('evolution_date', today).limit(1),
        supabase
          .from('daily_reports')
          .select('work_date, calls, quality_leads, positive_leads, hot_leads, revenue, deals_closed')
          .eq('user_id', user.id)
          .lt('work_date', today)
          .order('work_date', { ascending: false })
          .limit(1),
      ])

      if (qs.error) setMessage({ type: 'error', text: qs.error.message })
      const list: Question[] = qs.data ?? []
      setQuestions(list)

      const row = evo.data?.[0]
      if (row) {
        setExistingId(row.id)
        setReviewer(row.reviewer_name ?? DEFAULT_REVIEWER)
        setReviewNote(row.review_note ?? '')
        const saved: Record<string, string> = row.answers ?? {}
        setOldAnswers(saved)
        // New answers JSON first, old q1..q9 columns as fallback
        setAnswers(
          Object.fromEntries(list.map((q) => [q.id, saved[q.id] ?? (q.legacy_column ? row[q.legacy_column] ?? '' : '')])),
        )
      } else {
        setAnswers(Object.fromEntries(list.map((q) => [q.id, ''])))
      }
      setLast(rep.data?.[0] ?? null)
      setLoading(false)
    })()
  }, [today])

  async function handleSave() {
    if (!userId) return
    setMessage(null)

    const missing = questions.findIndex((q) => q.is_required && !(answers[q.id] ?? '').trim())
    if (missing !== -1) {
      setMessage({ type: 'error', text: `Answer question ${missing + 1} before submitting.` })
      document.getElementById(`q-${questions[missing].id}`)?.focus()
      return
    }

    setSaving(true)
    const cleaned = Object.fromEntries(questions.map((q) => [q.id, (answers[q.id] ?? '').trim()]))
    const payload: Record<string, unknown> = {
      user_id: userId,
      branch_id: branchId,
      evolution_date: today,
      reviewer_name: reviewer.trim() || null,
      // Keep answers to removed questions, overwrite the rest
      answers: { ...oldAnswers, ...cleaned },
    }
    // Also fill the old columns so older screens keep working
    for (const q of questions) if (q.legacy_column) payload[q.legacy_column] = cleaned[q.id] || null

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

    setOldAnswers({ ...oldAnswers, ...cleaned })
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

      {reviewNote && (
        <div className="mt-4 rounded-lg border border-orange-900/60 bg-orange-950/20 px-4 py-3 text-sm">
          <p className="text-orange-400">Note from your reviewer</p>
          <p className="mt-1 whitespace-pre-wrap text-gray-300">{reviewNote}</p>
        </div>
      )}

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
      {!loading && questions.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-8 text-center text-sm text-gray-500">
          No questions set up yet. Ask the Super Admin to add them.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="grid gap-3 rounded-2xl border border-[#242424] bg-[#151515] p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <label htmlFor={`q-${q.id}`} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">
                    {q.question_en}
                    {!q.is_required && <span className="ml-1.5 text-xs font-normal text-gray-500">(optional)</span>}
                  </span>
                  {q.question_gu && <span className="mt-0.5 block text-xs text-gray-500">{q.question_gu}</span>}
                </span>
              </label>
              <textarea
                id={`q-${q.id}`}
                rows={2}
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder="Your answer"
                className={`${inputCls} resize-y`}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-4 border-t border-[#1f1f1f] bg-[#0f0f0f]/95 py-4 backdrop-blur">
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Lock size={13} /> You can edit this form until midnight today.
        </p>
        <button
          onClick={handleSave}
          disabled={saving || loading || questions.length === 0}
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