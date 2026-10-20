import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, CheckCircle2, Download, FolderKanban, LayoutGrid,
  ListTodo, Loader2, MessageCircle, Pencil, Phone, Plus, Rows3, Search,
  Trash2, TrendingUp, X,
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

const iconBtn =
  'rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#222] hover:text-white disabled:opacity-30'

/*
  The one badge that a stage column cannot say for itself: whether this
  job is running out of time. Red past the date, amber inside three days,
  nothing at all otherwise — most cards carry no badge, so the few that
  do are the ones worth looking at.
*/
function dueTone(due: string | null, done: boolean | null | undefined) {
  if (!due || done) return null
  const days = Math.floor((new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  const red = { late: true, chip: 'rgba(220,38,38,0.15)', text: '#fca5a5' }
  const amber = { late: false, chip: 'rgba(217,119,6,0.18)', text: '#fcd34d' }
  if (days < 0) return { ...red, label: days === -1 ? 'A day late' : `${-days} days late` }
  if (days === 0) return { ...amber, label: 'Due today' }
  if (days <= 3) return { ...amber, label: days === 1 ? 'Due tomorrow' : `${days} days left` }
  return null
}

// Two letters is enough to tell four colleagues apart, and it never
// needs a photo nobody has uploaded.
const initials = (name: string | null) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

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
  // Board first. The coordinator's question is "what is sitting where",
  // and a table answers that one row at a time. The list stays for the
  // things a board is bad at — reading dates and exporting.
  const [view, setView] = useState<'board' | 'list'>(() => {
    try { return localStorage.getItem('jk_projects_view') === 'list' ? 'list' : 'board' } catch { return 'board' }
  })
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<{ project: ProjectRow; stageId: string } | null>(null)
  const [rejectWhy, setRejectWhy] = useState('')
  // Which card has its stage list open. Dragging is quick with a mouse
  // and impossible on a phone, so the same move has a button too.
  const [stageMenu, setStageMenu] = useState<string | null>(null)
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

  /*
    The rows come from project_board(), not from the project_list view.

    A view cannot hide a column — a policy only hides rows — and a
    designer is meant to see the job without seeing what it sold for.
    The function decides both: which rows you get, and whether the value
    comes back at all. Anyone without `project_view_money` gets null
    there, so there is nothing on the wire to leak.
  */
  const load = useCallback(async () => {
    setLoading(true)

    const [{ data, error }, st, pr] = await Promise.all([
      supabase.rpc('project_board', { p_customer: customerId, p_open_only: false }),
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

  useEffect(() => {
    try { localStorage.setItem('jk_projects_view', view) } catch { /* private window */ }
  }, [view])

  // One click anywhere else closes an open stage list
  useEffect(() => {
    if (!stageMenu) return
    const close = () => setStageMenu(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [stageMenu])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((p) => {
      // On the board every stage has its own column, Completed included.
      // Hiding finished work there would leave one column permanently
      // empty and make people think the move had not saved.
      if (view === 'list' && stageF === 'open' && (p.is_done || p.is_rejected)) return false
      if (view === 'list' && stageF !== 'open' && stageF !== 'all' && p.stage_id !== stageF) return false
      if (!t) return true
      return (
        p.title.toLowerCase().includes(t) ||
        p.customer_name.toLowerCase().includes(t) ||
        p.project_code.toLowerCase().includes(t) ||
        (p.owner_name ?? '').toLowerCase().includes(t)
      )
    })
  }, [rows, q, stageF, view])

  // Only worth showing to someone who is allowed to see the money at
  // all. For a designer every value is null, and a total of ₹0 would be
  // a claim rather than a blank.
  const canSeeMoney = rows.some((p) => p.value_amount != null)
  const openValue = shown
    .filter((p) => !p.is_done && !p.is_rejected)
    .reduce((n, p) => n + Number(p.value_amount ?? 0), 0)
  const narrowedTo = customerId ? rows[0]?.customer_name ?? 'this client' : null

  // Stage moves go through an RPC, not an update on the table. A
  // coordinator should be able to move a card without also being able
  // to change its title, its client or what it sold for.
  //
  // Rejecting asks why first. "We lost it" is already on the card; what
  // the office can act on is whether the price was wrong, the work was
  // late, or the client never wanted it — three different problems with
  // three different answers.
  async function moveStage(p: ProjectRow, stage_id: string, reason?: string) {
    if (!stage_id || stage_id === p.stage_id) return

    const target = stages.find((s) => s.id === stage_id)
    if (target?.is_rejected && !reason) {
      setRejecting({ project: p, stageId: stage_id })
      return
    }

    setBusy(p.id)
    const { error } = await supabase.rpc('project_set_stage', {
      p_project: p.id,
      p_stage: stage_id,
      p_reason: reason ?? null,
    })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setRejecting(null)
    void load()
  }

  // A new project lands on nobody. Whoever is going to run it picks it
  // up here — better than a name filled in by someone who was guessing,
  // because a wrongly assigned job is one nobody then looks at.
  async function claim(p: ProjectRow) {
    setBusy(p.id)
    const { error } = await supabase.rpc('project_claim', { p_project: p.id })
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    setMsg({ type: 'ok', text: `${p.project_code} is yours now.` })
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
      ['Code', 'Project', 'Customer', 'Customer code', 'Stage', 'Value', 'Services',
       'Start', 'Due', 'Running it', 'Sold by', 'Tasks', 'Notes'],
      shown.map((p) => [
        p.project_code, p.title, p.customer_name, p.customer_code, p.stage_name ?? '',
        // Blank when the money is not ours to see. Zero would be a
        // figure, and a wrong one.
        p.value_amount ?? '',
        (p.service_keys ?? []).join(', '),
        fmtDate(p.start_date), fmtDate(p.due_date),
        p.owner_name ?? '', p.created_name ?? '', p.task_count, p.notes ?? '',
      ]),
    )
  }

  // A designer gets here through `mod_project_board` alone — they are
  // meant to see the work without the customer and money screens that
  // `mod_projects` carries with it.
  if (ready && !can('mod_projects') && !can('mod_project_board')) {
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
        {/* Only the list needs these. On the board every stage already has
            its own column, so a row of stage buttons above it was asking
            people to filter a thing that is already sorted. */}
        {view === 'list' && (
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
        )}

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project, client or code" className={`${input} pl-9`} />
        </div>

        {/* The shape of each icon says which is which, so the words were
            only taking up room next to a search box that wants it. */}
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {([['board', LayoutGrid, 'Board'], ['list', Rows3, 'List']] as const).map(([k, Icon, title]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              title={title}
              aria-label={title}
              aria-pressed={view === k}
              className={`rounded-md p-1.5 transition-colors ${
                view === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {shown.length} {shown.length === 1 ? 'project' : 'projects'}
        {canSeeMoney && openValue > 0 && <span> · {money(openValue)} still open</span>}
      </p>

      {/* ---------------- Board ---------------- */}
      {view === 'board' && (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {stages.map((s) => {
            const col = shown.filter((p) => p.stage_id === s.id)
            return (
              <div
                key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOverStage(s.id) }}
                onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOverStage(null)
                  const p = rows.find((r) => r.id === dragId)
                  setDragId(null)
                  if (p) void moveStage(p, s.id)
                }}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-[#131313] transition-colors ${
                  overStage === s.id ? 'border-orange-500/60' : 'border-[#242424]'
                }`}
              >
                <div className="flex items-center justify-between rounded-t-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5">
                  <span className="text-sm font-semibold text-white">{s.name}</span>
                  <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-medium text-white">{col.length}</span>
                </div>

                <div className="flex-1 space-y-2.5 p-2.5">
                  {col.map((p) => {
                    // A rejected job cannot be late — it is over.
                    const tone = dueTone(p.due_date, p.is_done || p.is_rejected)
                    const tel = digits(p.customer_phone)
                    return (
                      <article
                        key={p.id}
                        draggable
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => { setDragId(null); setOverStage(null) }}
                        onClick={() => setEditing(p)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(p) }
                        }}
                        className={`cursor-pointer rounded-lg border bg-[#171717] p-3 transition-colors hover:border-[#3a3a3a] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                          tone?.late ? 'border-red-500/40' : 'border-[#242424]'
                        } ${dragId === p.id ? 'opacity-50' : ''} ${busy === p.id ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium text-white">{p.title}</p>
                          <span className="shrink-0 font-mono text-[11px] text-gray-600">{p.project_code}</span>
                        </div>

                        {/* The badges a coordinator scans for: what work it
                            is, whether it is late, and what it is worth. */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {(p.service_keys ?? []).map((k) => (
                            <span key={k} className="rounded bg-[#232323] px-1.5 py-0.5 text-[11px] text-gray-300">{k}</span>
                          ))}
                          {(p.service_keys?.length ?? 0) === 0 && (
                            <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[11px] text-gray-600">No service set</span>
                          )}
                          {tone && (
                            <span
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                              style={{ background: tone.chip, color: tone.text }}
                            >
                              {tone.label}
                            </span>
                          )}
                          {/* Nothing at all when the money is not ours to
                              see. A dash would still say a figure exists. */}
                          {p.value_amount != null && Number(p.value_amount) > 0 && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-emerald-300">
                              {money(p.value_amount)}
                            </span>
                          )}
                          {p.task_count > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-[#232323] px-1.5 py-0.5 text-[11px] text-gray-300">
                              <ListTodo size={11} /> {p.task_count}
                            </span>
                          )}
                        </div>

                        <dl className="mt-2.5 space-y-1 text-xs text-gray-400">
                          <div className="flex gap-2">
                            <dt className="w-14 shrink-0 text-gray-500">Client</dt>
                            <dd className="truncate">{p.customer_name}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-14 shrink-0 text-gray-500">Sold by</dt>
                            <dd className="truncate">{p.created_name ?? '—'}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-14 shrink-0 text-gray-500">Running</dt>
                            <dd className="flex min-w-0 items-center gap-1.5">
                              {p.owner_id ? (
                                <>
                                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-orange-500/15 text-[9px] font-semibold text-orange-300">
                                    {initials(p.owner_name)}
                                  </span>
                                  <span className="truncate">{p.owner_name}</span>
                                </>
                              ) : (
                                <span className="text-gray-600">Nobody yet</span>
                              )}
                            </dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="w-14 shrink-0 text-gray-500">Due</dt>
                            <dd className={tone?.late ? 'text-red-400' : ''}>{fmtDate(p.due_date)}</dd>
                          </div>
                        </dl>

                        {/* The reason stays on the card. A lost job with no
                            reason on it teaches nobody anything. */}
                        {p.is_rejected && p.reject_reason && (
                          <p className="mt-2 rounded-md bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-300">
                            {p.reject_reason}
                          </p>
                        )}

                        <div
                          className="relative mt-2.5 flex items-center gap-0.5 border-t border-[#222] pt-2"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setStageMenu(stageMenu === p.id ? null : p.id)}
                            title="Change status"
                            aria-label="Change status"
                            className={iconBtn}
                          >
                            <TrendingUp size={14} />
                          </button>

                          {stageMenu === p.id && (
                            <div className="absolute bottom-9 left-0 z-20 w-48 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl">
                              {stages.map((st) => (
                                <button
                                  key={st.id}
                                  onClick={() => { setStageMenu(null); void moveStage(p, st.id) }}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#232323] ${
                                    st.id === p.stage_id ? 'text-orange-300' : 'text-gray-300'
                                  }`}
                                >
                                  <span
                                    aria-hidden
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                      st.id === p.stage_id ? 'bg-orange-400' : 'bg-[#3a3a3a]'
                                    }`}
                                  />
                                  {st.name}
                                </button>
                              ))}
                            </div>
                          )}

                          {tel && (
                            <>
                              <a href={`tel:${tel}`} title={`Call ${p.customer_name}`} aria-label="Call" className={iconBtn}>
                                <Phone size={14} />
                              </a>
                              <a
                                href={`https://wa.me/91${tel.slice(-10)}`}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp"
                                aria-label="WhatsApp"
                                className={iconBtn}
                              >
                                <MessageCircle size={14} />
                              </a>
                            </>
                          )}
                          {tasksPath && (
                            <a
                              href={`${tasksPath}?project=${p.id}`}
                              title={p.task_count > 0 ? `${p.task_count} task${p.task_count === 1 ? '' : 's'}` : 'Tasks'}
                              aria-label="Tasks"
                              className={iconBtn}
                            >
                              <ListTodo size={14} />
                            </a>
                          )}
                          <button onClick={() => setEditing(p)} title="Edit" aria-label="Edit" className={iconBtn}>
                            <Pencil size={14} />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => remove(p)}
                              disabled={busy === p.id}
                              title="Delete"
                              aria-label="Delete"
                              className={iconBtn}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}

                          {!p.owner_id && can('project_coordinate') && (
                            <button
                              onClick={() => void claim(p)}
                              disabled={busy === p.id}
                              className="ml-auto rounded-md border border-[#2a2a2a] px-2 py-1 text-[11px] text-gray-300 hover:border-orange-500/60 hover:text-orange-300 disabled:opacity-50"
                            >
                              {busy === p.id ? <Loader2 size={11} className="animate-spin" /> : 'Take it'}
                            </button>
                          )}
                        </div>
                      </article>
                    )
                  })}

                  {col.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-gray-600">Nothing here</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'list' && (
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
                    {/* Blank, not a dash, when the money is not ours to
                        see — a dash still says a figure is there. */}
                    {p.value_amount == null ? '' : Number(p.value_amount) > 0 ? money(p.value_amount) : '—'}
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
      )}

      {/* Why it was lost. Asked once, at the moment it happened, when
          the answer is still known. A month later nobody remembers. */}
      {rejecting && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setRejecting(null); setRejectWhy('') } }}
          role="dialog"
          aria-modal="true"
          aria-label="Why was this rejected?"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616] shadow-2xl">
            <div className="border-b border-[#242424] px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Why was this rejected?</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {rejecting.project.project_code} · {rejecting.project.customer_name}
              </p>
            </div>

            <div className="p-5">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {['Price too high', 'Went to someone else', 'We were late', 'Client dropped the plan', 'No budget'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRejectWhy(r)}
                    className={`rounded-md px-2 py-1 text-xs transition-colors ${
                      rejectWhy === r
                        ? 'bg-orange-500/15 text-orange-300'
                        : 'border border-[#2a2a2a] text-gray-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <textarea
                value={rejectWhy}
                onChange={(e) => setRejectWhy(e.target.value)}
                rows={3}
                autoFocus
                placeholder="What happened?"
                className={`${input} resize-y`}
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-[#242424] px-5 py-4">
              <button
                onClick={() => { setRejecting(null); setRejectWhy('') }}
                className="rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white"
              >
                Keep it open
              </button>
              <button
                onClick={() => {
                  const why = rejectWhy.trim()
                  if (!why) return
                  const { project, stageId } = rejecting
                  setRejectWhy('')
                  void moveStage(project, stageId, why)
                }}
                disabled={!rejectWhy.trim() || busy === rejecting.project.id}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busy === rejecting.project.id && <Loader2 size={15} className="animate-spin" />}
                Mark rejected
              </button>
            </div>
          </div>
        </div>
      )}

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