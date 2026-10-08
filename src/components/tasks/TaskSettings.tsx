import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Trash2, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import type { TaskLabel, TaskStage } from './taskUtils'

const input =
  'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

// Colours that read on both the dark and the light screen
const SWATCHES = [
  '#0e7490', '#4338ca', '#7c3aed', '#15803d', '#b91c1c',
  '#FF5E00', '#b45309', '#0891b2', '#db2777', '#64748b',
]

export default function TaskSettings() {
  const { can, ready } = usePermissions()
  const allowed = ready && can('task_settings')

  const [stages, setStages] = useState<TaskStage[]>([])
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [newStage, setNewStage] = useState({ name: '', color: SWATCHES[0] })
  const [newLabel, setNewLabel] = useState({ name: '', color: SWATCHES[5] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    // Settings shows the switched-off ones too, so they can be brought back
    const [s, l] = await Promise.all([
      supabase.from('task_stages').select('*').order('sort_order'),
      supabase.from('task_labels').select('*').order('sort_order'),
    ])
    setStages((s.data ?? []) as TaskStage[])
    setLabels((l.data ?? []) as TaskLabel[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (allowed) load()
    else setLoading(false)
  }, [ready, allowed, load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  const fail = (e: { message?: string; code?: string } | null, dupText: string) => {
    if (!e) return false
    setMsg({ ok: false, text: e.code === '23505' ? dupText : e.message ?? 'Could not save.' })
    load()
    return true
  }

  // ---------- Stages ----------
  async function addStage() {
    const name = newStage.name.trim()
    if (!name) return setMsg({ ok: false, text: 'Write the status name first.' })
    setBusy(true)
    const { error } = await supabase.from('task_stages').insert({
      name,
      color: newStage.color,
      sort_order: (stages.at(-1)?.sort_order ?? 0) + 1,
    })
    setBusy(false)
    if (fail(error, 'A status with this name already exists.')) return
    setNewStage({ name: '', color: SWATCHES[0] })
    setMsg({ ok: true, text: 'Status added.' })
    load()
  }

  async function saveStage(s: TaskStage, patch: Partial<TaskStage>) {
    setStages((list) => list.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('task_stages').update(patch).eq('id', s.id)
    fail(error, 'A status with this name already exists.')
  }

  // Only one status can be the starting one, and only one can close a task
  async function makeOnly(s: TaskStage, flag: 'is_default' | 'is_done' | 'is_rejected') {
    setStages((list) => list.map((x) => ({ ...x, [flag]: x.id === s.id })))
    await supabase.from('task_stages').update({ [flag]: false }).neq('id', s.id)
    const { error } = await supabase.from('task_stages').update({ [flag]: true }).eq('id', s.id)
    if (error) fail(error, '')
  }

  async function moveStage(s: TaskStage, by: -1 | 1) {
    const i = stages.findIndex((x) => x.id === s.id)
    const j = i + by
    if (j < 0 || j >= stages.length) return
    const other = stages[j]
    const next = [...stages]
    next[i] = other
    next[j] = s
    setStages(next)
    await supabase.from('task_stages').update({ sort_order: other.sort_order }).eq('id', s.id)
    await supabase.from('task_stages').update({ sort_order: s.sort_order }).eq('id', other.id)
    load()
  }

  async function removeStage(s: TaskStage) {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('stage_id', s.id)
      .is('deleted_at', null)

    if (count && count > 0) {
      return setMsg({
        ok: false,
        text: `${count} task${count > 1 ? 's are' : ' is'} in "${s.name}". Move them first, or switch this status off instead.`,
      })
    }
    if (!window.confirm(`Remove "${s.name}"?`)) return
    const { error } = await supabase.from('task_stages').delete().eq('id', s.id)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Status removed.' })
    load()
  }

  // ---------- Labels ----------
  async function addLabel() {
    const name = newLabel.name.trim()
    if (!name) return setMsg({ ok: false, text: 'Write the label name first.' })
    setBusy(true)
    const { error } = await supabase.from('task_labels').insert({
      name,
      color: newLabel.color,
      sort_order: (labels.at(-1)?.sort_order ?? 0) + 1,
    })
    setBusy(false)
    if (fail(error, 'A label with this name already exists.')) return
    setNewLabel({ name: '', color: SWATCHES[5] })
    setMsg({ ok: true, text: 'Label added.' })
    load()
  }

  async function saveLabel(l: TaskLabel, patch: Partial<TaskLabel>) {
    setLabels((list) => list.map((x) => (x.id === l.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('task_labels').update(patch).eq('id', l.id)
    fail(error, 'A label with this name already exists.')
  }

  async function removeLabel(l: TaskLabel) {
    if (!window.confirm(`Remove "${l.name}"? Tasks carrying it simply lose the label.`)) return
    const { error } = await supabase.from('task_labels').delete().eq('id', l.id)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Label removed.' })
    load()
  }

  if (!ready || loading) {
    return <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
  }

  if (!allowed) {
    return (
      <p className="p-6 text-gray-400">
        You need the <span className="text-white">Task settings</span> permission for this page.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Task settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          The board columns and the labels everyone picks from. Changes here show up for the whole company.
        </p>
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-2.5 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </p>
      )}

      {/* Task status */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-1 text-sm font-medium text-gray-300">Task status</h2>
        <p className="mb-4 text-xs text-gray-500">
          Each one is a column on the board, left to right.
        </p>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={newStage.name}
            onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addStage()}
            placeholder="Status name"
            aria-label="Status name"
            className={input}
          />
          <Swatches value={newStage.color} onChange={(color) => setNewStage({ ...newStage, color })} />
          <button
            onClick={addStage}
            disabled={busy || !newStage.name.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className={`rounded-lg border border-[#242424] bg-[#171717] p-3 ${s.is_active ? '' : 'opacity-50'}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex shrink-0 flex-col">
                  <button
                    onClick={() => moveStage(s, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded p-0.5 text-gray-500 hover:text-white disabled:opacity-20"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    onClick={() => moveStage(s, 1)}
                    disabled={i === stages.length - 1}
                    aria-label="Move down"
                    className="rounded p-0.5 text-gray-500 hover:text-white disabled:opacity-20"
                  >
                    <ArrowDown size={13} />
                  </button>
                </span>

                <input
                  value={s.name}
                  onChange={(e) => saveStage(s, { name: e.target.value })}
                  aria-label="Status name"
                  className={`${input} min-w-0 flex-1`}
                />
                <Swatches value={s.color} onChange={(color) => saveStage(s, { color })} />

                <Toggle on={s.is_active} onChange={(v) => saveStage(s, { is_active: v })} title="In use" />
                <button
                  onClick={() => removeStage(s)}
                  aria-label={`Remove ${s.name}`}
                  className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2 pl-7">
                <Flag on={s.is_default} onClick={() => makeOnly(s, 'is_default')} text="Starts here" />
                <Flag on={s.is_done} onClick={() => makeOnly(s, 'is_done')} text="Counts as done" icon="done" />
                <Flag on={s.is_rejected} onClick={() => makeOnly(s, 'is_rejected')} text="Counts as rejected" icon="reject" />
              </div>
            </li>
          ))}
          {stages.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No status yet.</li>}
        </ul>

        <p className="mt-3 text-xs text-gray-500">
          Only a coordinator may move a task into the done or rejected one. Switch a status off to keep it off the
          board without touching the tasks already in it.
        </p>
      </section>

      {/* Task labels */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-1 text-sm font-medium text-gray-300">Task label</h2>
        <p className="mb-4 text-xs text-gray-500">What kind of work it is — picked while adding a task.</p>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={newLabel.name}
            onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            placeholder="Label name"
            aria-label="Label name"
            className={input}
          />
          <Swatches value={newLabel.color} onChange={(color) => setNewLabel({ ...newLabel, color })} />
          <button
            onClick={addLabel}
            disabled={busy || !newLabel.name.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {labels.map((l) => (
            <li
              key={l.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border border-[#242424] bg-[#171717] p-3 ${l.is_active ? '' : 'opacity-50'}`}
            >
              <input
                value={l.name}
                onChange={(e) => saveLabel(l, { name: e.target.value })}
                aria-label="Label name"
                className={`${input} min-w-0 flex-1`}
              />
              <Swatches value={l.color} onChange={(color) => saveLabel(l, { color })} />
              <Toggle on={l.is_active} onChange={(v) => saveLabel(l, { is_active: v })} title="In use" />
              <button
                onClick={() => removeLabel(l)}
                aria-label={`Remove ${l.name}`}
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {labels.length === 0 && <li className="py-6 text-center text-sm text-gray-500">No labels yet.</li>}
        </ul>
      </section>

      <p className="pb-6 text-xs text-gray-500">
        Everything on this page saves as you type — there is no Save button.
      </p>
    </div>
  )
}

/* ── Small pieces ─────────────────────────────────────────────── */

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label="Colour">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          className={`h-6 w-6 rounded-full border-2 transition-transform ${
            value.toLowerCase() === c.toLowerCase() ? 'scale-110 border-white' : 'border-transparent'
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

function Toggle({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={title}
      aria-label={title}
      className="shrink-0"
    >
      <span className={`relative block h-5 w-9 rounded-full transition-colors ${on ? 'bg-orange-500' : 'bg-[#2a2a2a]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

function Flag({
  on, onClick, text, icon,
}: {
  on: boolean
  onClick: () => void
  text: string
  icon?: 'done' | 'reject'
}) {
  const Icon = icon === 'done' ? CheckCircle2 : icon === 'reject' ? XCircle : null
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        on
          ? 'border-orange-500/60 bg-orange-500/10 text-orange-400'
          : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300'
      }`}
    >
      {Icon && <Icon size={13} />}
      {text}
    </button>
  )
}