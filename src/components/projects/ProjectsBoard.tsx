import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, Download, FolderKanban, ListTodo, Loader2,
  Pencil, Plus, Search, Trash2, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import ProjectModal from './ProjectModal'
import {
  downloadCsv, fmtDate, loadStages, money, STAGE_CLS,
  type ProjectRow, type ProjectStage,
} from '../customers/customerUtils'

/*
  Projects.

  One line per piece of work a client has ordered. A client with a logo,
  a brochure and a website has three — which is the whole reason the
  customer and the project are different things.

  Opened from a customer's row, the list arrives already narrowed to that
  client and says so, with a way out.
*/

export default function ProjectsBoard({ tasksPath }: { tasksPath?: string }) {
  const { can, ready } = usePermissions()
  const [params, setParams] = useSearchParams()
  const customerId = params.get('customer')

  const [rows, setRows] = useState<ProjectRow[]>([])
  const [stages, setStages] = useState<ProjectStage[]>([])
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [stageF, setStageF] = useState<'open' | 'all' | string>('open')
  const [editing, setEditing] = useState<ProjectRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const canDelete = can('project_delete')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    let qy = supabase.from('project_list').select('*').order('created_at', { ascending: false }).limit(1000)
    if (customerId) qy = qy.eq('customer_id', customerId)

    const [{ data, error }, st, pr] = await Promise.all([
      qy,
      loadStages(),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setRows((data ?? []) as ProjectRow[])
    setStages(st)
    setStaff((pr.data ?? []) as { id: string; full_name: string }[])
  }, [customerId])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((p) => {
      if (stageF === 'open' && p.is_done) return false
      if (stageF !== 'open' && stageF !== 'all' && p.stage_id !== stageF) return false
      if (!t) return true
      return (
        p.title.toLowerCase().includes(t) ||
        p.customer_name.toLowerCase().includes(t) ||
        p.project_code.toLowerCase().includes(t) ||
        (p.owner_name ?? '').toLowerCase().includes(t)
      )
    })
  }, [rows, q, stageF])

  const openValue = shown.filter((p) => !p.is_done).reduce((n, p) => n + Number(p.value_amount || 0), 0)
  const narrowedTo = customerId ? rows[0]?.customer_name ?? 'this client' : null

  async function moveStage(p: ProjectRow, stage_id: string) {
    setBusy(p.id)
    const { error } = await supabase.from('projects').update({ stage_id }).eq('id', p.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  async function remove(p: ProjectRow) {
    if (p.task_count > 0) {
      return setMsg({
        type: 'err',
        text: `${p.title} has ${p.task_count} task(s) on it. Move those off the project first, or mark it Done instead.`,
      })
    }
    if (!confirm(`Delete ${p.project_code} — ${p.title}?`)) return
    setBusy(p.id)
    const { error } = await supabase.from('projects').delete().eq('id', p.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  function toExcel() {
    downloadCsv(
      `projects-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Code', 'Project', 'Customer', 'Customer code', 'Stage', 'Value', 'Start', 'Due', 'Running it', 'Tasks', 'Notes'],
      shown.map((p) => [
        p.project_code, p.title, p.customer_name, p.customer_code, p.stage_name ?? '',
        p.value_amount, fmtDate(p.start_date), fmtDate(p.due_date),
        p.owner_name ?? '', p.task_count, p.notes ?? '',
      ]),
    )
  }

  if (ready && !can('mod_projects')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Projects is not switched on for you.
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <FolderKanban size={22} className="text-orange-400" />
            Projects
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Each piece of work a client has ordered. One client can have several.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={15} /> New project
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Narrowed to one client — say so, and give a way back. A filtered
          list that does not admit it is filtered is how people conclude
          their work has disappeared. */}
      {customerId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-300">
          <span>Showing only {narrowedTo}.</span>
          <button
            onClick={() => { params.delete('customer'); setParams(params) }}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs hover:bg-orange-500/20"
          >
            <X size={13} /> Show all
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-[#2a2a2a] p-0.5">
          {([['open', 'Open'], ['all', 'All']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setStageF(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                stageF === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
          {stages.map((s) => (
            <button
              key={s.id}
              onClick={() => setStageF(s.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                stageF === s.id ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, client or code" className={`${input} pl-9`} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {shown.length} {shown.length === 1 ? 'project' : 'projects'}
        {openValue > 0 && <span> · {money(openValue)} still open</span>}
      </p>

      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                {['Code', 'Project', 'Customer', 'Stage', 'Value', 'Due', 'Running it', ''].map((h, i) => (
                  <th key={i} className="border-b border-[#242424] px-4 py-3 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="border-t border-[#202020] px-4 py-3 font-mono text-xs text-gray-500">{p.project_code}</td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <p className="font-medium text-white">{p.title}</p>
                    {p.task_count > 0 && (
                      tasksPath ? (
                        <a href={`${tasksPath}?project=${p.id}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-orange-400">
                          <ListTodo size={12} /> {p.task_count} task{p.task_count === 1 ? '' : 's'}
                        </a>
                      ) : (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
                          <ListTodo size={12} /> {p.task_count} task{p.task_count === 1 ? '' : 's'}
                        </span>
                      )
                    )}
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <p className="text-gray-300">{p.customer_name}</p>
                    <p className="font-mono text-xs text-gray-600">{p.customer_code}</p>
                  </td>

                  {/* The stage changes here rather than in the edit window.
                      It is the thing that changes most often, and opening a
                      window to move one step is five clicks for one. */}
                  <td className="border-t border-[#202020] px-4 py-3">
                    <select
                      value={p.stage_id ?? ''}
                      onChange={(e) => moveStage(p, e.target.value)}
                      disabled={busy === p.id}
                      className={`cursor-pointer rounded-md border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50 ${
                        STAGE_CLS[p.stage_color ?? 'gray'] ?? STAGE_CLS.gray
                      }`}
                    >
                      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 tabular-nums text-gray-300">
                    {Number(p.value_amount) > 0 ? money(p.value_amount) : '—'}
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 text-xs text-gray-400">
                    {fmtDate(p.due_date)}
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 text-xs text-gray-400">
                    {p.owner_name ?? '—'}
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        aria-label="Edit project"
                        className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                      >
                        <Pencil size={14} />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => remove(p)}
                          disabled={busy === p.id}
                          aria-label="Delete project"
                          className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-red-400 disabled:opacity-50"
                        >
                          {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q.trim() || stageF !== 'open'
                      ? 'Nothing matches.'
                      : 'No open projects. A project opens on its own when a lead is won.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 size={18} className="mx-auto animate-spin text-gray-500" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {(adding || editing) && (
        <ProjectModal
          project={editing}
          stages={stages}
          staff={staff}
          fixedCustomer={
            adding && customerId && rows[0]
              ? { id: rows[0].customer_id, name: rows[0].customer_name, code: rows[0].customer_code }
              : null
          }
          onClose={() => { setAdding(false); setEditing(null) }}
          onSaved={() => { setAdding(false); setEditing(null); void load() }}
        />
      )}
    </div>
  )
}