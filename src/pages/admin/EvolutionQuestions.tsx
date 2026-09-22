import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, Pencil, EyeOff, Eye, Plus, CheckCircle2, AlertCircle, X } from 'lucide-react'
import AdminLayout from '../../components/AdminLayout'
import { supabase } from '../../lib/supabase'

type Question = {
  id: string
  question_en: string
  question_gu: string | null
  sort_order: number
  is_active: boolean
  is_required: boolean
  purpose: 'help' | 'commitment' | null
}
type Draft = { question_en: string; question_gu: string; is_required: boolean; purpose: '' | 'help' | 'commitment' }

const emptyDraft = (): Draft => ({ question_en: '', question_gu: '', is_required: true, purpose: '' })
const PURPOSE_LABEL = { help: 'Help request', commitment: 'Evening commitment' }

export default function EvolutionQuestions() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('evolution_questions').select('*').order('sort_order')
    if (error) setMessage({ type: 'error', text: error.message })
    setQuestions(data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const active = questions.filter((q) => q.is_active)
  const hidden = questions.filter((q) => !q.is_active)

  function startEdit(q: Question) {
    setEditingId(q.id)
    setDraft({ question_en: q.question_en, question_gu: q.question_gu ?? '', is_required: q.is_required, purpose: q.purpose ?? '' })
  }

  function startNew() {
    setEditingId('new')
    setDraft(emptyDraft())
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true)
    setMessage(null)
    const { error } = await fn()
    setBusy(false)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return false
    }
    setMessage({ type: 'success', text: ok })
    await load()
    return true
  }

  async function save() {
    if (!draft.question_en.trim()) return setMessage({ type: 'error', text: 'Write the question in English.' })
    setBusy(true)
    // Only one question can hold each special purpose
    if (draft.purpose) {
      const holder = questions.find((q) => q.purpose === draft.purpose && q.id !== editingId)
      if (holder) await supabase.from('evolution_questions').update({ purpose: null }).eq('id', holder.id)
    }
    setBusy(false)

    const row = {
      question_en: draft.question_en.trim(),
      question_gu: draft.question_gu.trim() || null,
      is_required: draft.is_required,
      purpose: draft.purpose || null,
    }
    const done =
      editingId === 'new'
        ? await run(
            () =>
              supabase
                .from('evolution_questions')
                .insert({ ...row, sort_order: (questions.reduce((m, q) => Math.max(m, q.sort_order), 0) || 0) + 1 }),
            'Question added. Sales will see it in their next form.',
          )
        : await run(() => supabase.from('evolution_questions').update(row).eq('id', editingId!), 'Question updated.')
    if (done) setEditingId(null)
  }

  async function move(q: Question, dir: -1 | 1) {
    const i = active.findIndex((x) => x.id === q.id)
    const other = active[i + dir]
    if (!other) return
    setBusy(true)
    await supabase.from('evolution_questions').update({ sort_order: other.sort_order }).eq('id', q.id)
    await supabase.from('evolution_questions').update({ sort_order: q.sort_order }).eq('id', other.id)
    setBusy(false)
    load()
  }

  async function setActive(q: Question, value: boolean) {
    if (!value && !window.confirm(`Remove "${q.question_en}" from the form? Old answers stay visible in reports.`)) return
    await run(
      () => supabase.from('evolution_questions').update({ is_active: value, ...(value ? {} : { purpose: null }) }).eq('id', q.id),
      value ? 'Question is back on the form.' : 'Question removed from the form.',
    )
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  const editor = (
    <div className="space-y-3 rounded-xl border border-orange-900/50 bg-[#121212] p-4">
      <label className="block">
        <span className="mb-1.5 block text-xs text-gray-400">Question (English) *</span>
        <input value={draft.question_en} onChange={(e) => setDraft({ ...draft, question_en: e.target.value })} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs text-gray-400">Question (Gujarati, optional helper line)</span>
        <input value={draft.question_gu} onChange={(e) => setDraft({ ...draft, question_gu: e.target.value })} className={inputCls} />
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={draft.is_required} onChange={(e) => setDraft({ ...draft, is_required: e.target.checked })} className="h-4 w-4 accent-orange-500" />
          Required
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-gray-400">Special use</span>
          <select value={draft.purpose} onChange={(e) => setDraft({ ...draft, purpose: e.target.value as Draft['purpose'] })} className={inputCls}>
            <option value="">None</option>
            <option value="help">Help request (shows Help chip in reports)</option>
            <option value="commitment">Evening commitment (compared with revenue)</option>
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setEditingId(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
            {editingId === 'new' ? 'Add question' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Evolution Questions</h1>
            <p className="mt-1 text-sm text-gray-400">These questions appear on every sales employee’s morning form, in this order.</p>
          </div>
          <button
            onClick={startNew}
            className="flex w-fit items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-orange-400"
          >
            <Plus size={16} /> Add question
          </button>
        </div>

        {message && (
          <div
            className={`mt-5 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              message.type === 'success' ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-auto text-gray-500 hover:text-white" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {editingId === 'new' && <div className="mt-6">{editor}</div>}

        {/* Active questions */}
        <ol className="mt-6 space-y-3">
          {active.map((q, i) => (
            <li key={q.id} className="rounded-2xl border border-[#242424] bg-[#151515] p-4">
              {editingId === q.id ? (
                editor
              ) : (
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{q.question_en}</p>
                    {q.question_gu && <p className="mt-0.5 text-xs text-gray-500">{q.question_gu}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 ${q.is_required ? 'bg-[#1f1f1f] text-gray-300' : 'bg-[#1a1a1a] text-gray-500'}`}>
                        {q.is_required ? 'Required' : 'Optional'}
                      </span>
                      {q.purpose && <span className="rounded-full bg-orange-950/60 px-2 py-0.5 text-orange-400">{PURPOSE_LABEL[q.purpose]}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn label="Move up" disabled={busy || i === 0} onClick={() => move(q, -1)}>
                      <ArrowUp size={15} />
                    </IconBtn>
                    <IconBtn label="Move down" disabled={busy || i === active.length - 1} onClick={() => move(q, 1)}>
                      <ArrowDown size={15} />
                    </IconBtn>
                    <IconBtn label="Edit" onClick={() => startEdit(q)}>
                      <Pencil size={15} />
                    </IconBtn>
                    <IconBtn label="Remove from form" onClick={() => setActive(q, false)} danger>
                      <EyeOff size={15} />
                    </IconBtn>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>

        {/* Removed questions */}
        {hidden.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-gray-400">Removed questions ({hidden.length})</h2>
            <p className="mt-0.5 text-xs text-gray-600">Not shown on the form. Old answers stay in reports.</p>
            <ul className="mt-3 space-y-2">
              {hidden.map((q) => (
                <li key={q.id} className="flex items-center gap-3 rounded-xl border border-[#1f1f1f] bg-[#131313] px-4 py-3 text-sm text-gray-500">
                  <span className="min-w-0 flex-1 truncate">{q.question_en}</span>
                  <button onClick={() => setActive(q, true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10">
                    <Eye size={14} /> Restore
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminLayout>
  )
}

function IconBtn({
  label, onClick, disabled = false, danger = false, children,
}: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-lg p-2 text-gray-500 disabled:opacity-30 ${danger ? 'hover:bg-red-950/40 hover:text-red-400' : 'hover:bg-[#1f1f1f] hover:text-white'}`}
    >
      {children}
    </button>
  )
}