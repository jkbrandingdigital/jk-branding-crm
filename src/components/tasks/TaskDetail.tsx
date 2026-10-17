import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Download, Loader2, Paperclip, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChartTheme } from '../../lib/chartTheme'
import { fmtDT, type Staff } from '../leads/leadUtils'
import { RichHtml } from '../RichText'
import { CHANGE_SOURCES, currentAssignees, fmtTaskDT, mins, priorityOf, type Task, type TaskLabel, type TaskStage, type TimeStatus } from './taskUtils'
import { hhmm, TaskTimerButton } from './WorkTimer'
import ExtraTimeRequest from './ExtraTimeRequest'

type Tab = 'details' | 'comments' | 'files' | 'history'
type TimeRow = { user_id: string; full_name: string | null; secs: number; sessions: number }
type Sitting = { id: string; user_id: string; started_at: string; ended_at: string | null; end_reason: string | null; end_note: string | null }
type Comment = { id: string; user_id: string; body: string; created_at: string }
type FileRow = { id: string; file_path: string; file_name: string; file_size: number | null; uploaded_by: string; created_at: string }
type Activity = { id: string; user_id: string | null; kind: string; detail: string | null; created_at: string }

const REASON_LABEL: Record<string, string> = {
  switched: 'moved to another task',
  urgent: 'urgent work came in',
  waiting: 'waiting on content',
  break: 'break',
  done: 'finished',
  day_end: 'end of day',
  auto: 'left running, closed automatically',
}

const KIND_LABEL: Record<string, string> = {
  created: 'Created',
  assign: 'Assigned to',
  unassign: 'Removed',
  stage: 'Stage',
  units: 'Quantity',
  change: 'Changes',
  priority: 'Priority',
  due: 'Due date',
  label: 'Label',
  comment: 'Comment',
  file: 'File',
}

export default function TaskDetail({
  task, stages, labels, staff, canEdit, stageChoices, locked = false, initialTab = 'details', onEdit, onClose, onChanged,
}: {
  task: Task
  stages: TaskStage[]
  labels: TaskLabel[]
  staff: Staff[]
  canEdit: boolean
  stageChoices?: TaskStage[]
  locked?: boolean
  initialTab?: Tab
  onEdit: () => void
  onClose: () => void
  onChanged: () => void
}) {
  const { user } = useAuth()
  const me = user?.id ?? ''
  const [tab, setTab] = useState<Tab>(initialTab)
  const [comments, setComments] = useState<Comment[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [history, setHistory] = useState<Activity[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState('')   // id of the file being downloaded
  const [time, setTime] = useState<TimeRow[]>([])
  const [status, setStatus] = useState<TimeStatus | null>(null)
  const [sittings, setSittings] = useState<Sitting[]>([])
  const [adding, setAdding] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState('')   // "2 of 5" while files go up
  const { dark } = useChartTheme()   // pale-on-cream cannot be read, so the tones swap
  const [error, setError] = useState('')

  const loadTime = useCallback(async () => {
    const [t, st] = await Promise.all([
      supabase.rpc('task_time', { p_task_id: task.id }),
      supabase.from('task_time_status').select('*').eq('task_id', task.id).maybeSingle(),
    ])
    setTime((t.data ?? []) as TimeRow[])
    setStatus((st.data ?? null) as TimeStatus | null)
  }, [task.id])

  // Records that the job came back. A client's change buys more allowed
  // time; our own mistake does not. The name of whoever records it goes
  // into the history, which is the only guard this needs.
  async function addChange(source: string) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_change', {
      p_task: task.id,
      p_source: source,
      p_note: changeNote.trim() || null,
    })
    setAdding(false)
    setChangeOpen(false)
    setChangeNote('')
    if (e) return setError(e.message)
    await loadTime()
    onChanged()
  }

  // Adds one option, or one brochure page. The database works out the
  // new allowed time and writes it into the history.
  async function addUnit() {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_unit', { p_task: task.id, p_by: 1 })
    setAdding(false)
    if (e) return setError(e.message)
    await loadTime()
    onChanged()
  }

  useEffect(() => {
    void loadTime()
  }, [loadTime])
  const fileRef = useRef<HTMLInputElement>(null)

  const stage = stages.find((s) => s.id === task.stage_id)
  const label = labels.find((l) => l.id === task.label_id)
  const p = priorityOf(task.priority)
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? '—'

  const loadTab = useCallback(async () => {
    setError('')
    if (tab === 'comments') {
      const { data } = await supabase.from('task_comments').select('*').eq('task_id', task.id).order('created_at')
      setComments((data ?? []) as Comment[])
    } else if (tab === 'files') {
      const { data } = await supabase.from('task_attachments').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      setFiles((data ?? []) as FileRow[])
    } else if (tab === 'history') {
      // Everything that happened to this task, in one list: the changes and
      // the sittings. Looking at them apart hides how the time went.
      const [a, s2] = await Promise.all([
        supabase.from('task_activities').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
        supabase.from('task_sessions').select('id, user_id, started_at, ended_at, end_reason, end_note')
          .eq('task_id', task.id).order('started_at', { ascending: false }),
      ])
      setHistory((a.data ?? []) as Activity[])
      setSittings((s2.data ?? []) as Sitting[])
    }
  }, [tab, task.id])

  useEffect(() => { loadTab() }, [loadTab])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  async function changeStage(id: string) {
    setBusy(true)
    const { error: e } = await supabase.from('tasks').update({ stage_id: id }).eq('id', task.id)
    setBusy(false)
    if (e) return setError(e.message)
    onChanged()
  }

  async function addComment() {
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    const { error: e } = await supabase.from('task_comments').insert({ task_id: task.id, body })
    setBusy(false)
    if (e) return setError(e.message)
    setDraft('')
    loadTab()
    onChanged()
  }

  async function removeComment(id: string) {
    const { error: e } = await supabase.from('task_comments').delete().eq('id', id)
    if (e) return setError(e.message)
    loadTab()
    onChanged()
  }

  const MAX_MB = 25

  // Files go up one at a time, not all at once.
  //
  // A designer dropping ten CDR files in one go would otherwise open ten
  // uploads together, and a phone or a weak line drops half of them. One
  // after another is slower to watch but it finishes.
  async function uploadMany(list: File[]) {
    if (locked || list.length === 0) return
    setError('')

    const tooBig = list.filter((f) => f.size > MAX_MB * 1024 * 1024)
    const ok = list.filter((f) => f.size <= MAX_MB * 1024 * 1024)
    if (tooBig.length) {
      setError(
        tooBig.length === list.length
          ? `Files must be under ${MAX_MB} MB.`
          : `Skipped ${tooBig.length} file(s) over ${MAX_MB} MB: ${tooBig.map((f) => f.name).join(', ')}`,
      )
    }
    if (ok.length === 0) return

    setBusy(true)
    const failed: string[] = []

    for (let i = 0; i < ok.length; i++) {
      const f = ok[i]
      setSending(ok.length > 1 ? `${i + 1} of ${ok.length}` : f.name)

      const safe = f.name.replace(/[^\w.\- ]/g, '_')
      const path = `${task.id}/${Date.now()}-${i}-${safe}`

      const { error: upErr } = await supabase.storage.from('task-files').upload(path, f)
      if (upErr) { failed.push(f.name); continue }

      const { error: e } = await supabase
        .from('task_attachments')
        .insert({ task_id: task.id, file_path: path, file_name: f.name, file_size: f.size })
      // The file is in Storage but the row did not save — take it back out
      // rather than leave something nobody can see or delete.
      if (e) {
        await supabase.storage.from('task-files').remove([path])
        failed.push(f.name)
      }
    }

    setSending('')
    setBusy(false)
    if (failed.length) setError(`Could not upload: ${failed.join(', ')}`)
    loadTab()
    onChanged()
  }

  // Only files, and only real ones. Dragging text out of a mail or a folder
  // off the desktop both land here as drag events with nothing to upload.
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (locked) return
    const picked = Array.from(e.dataTransfer.files ?? [])
    if (picked.length) void uploadMany(picked)
  }

  // Pulls the file down first, then saves it from the browser's own memory.
  //
  // A signed URL points at Storage, so the browser decides what to do with it
  // and shows a PDF or an image in a new tab instead of saving it. A blob URL
  // is this page's own, so the `download` attribute is always obeyed and every
  // file type is saved the same way, with the task still open behind it.
  async function saveFile(row: FileRow) {
    setError('')
    setSaving(row.id)
    const { data, error: e } = await supabase.storage.from('task-files').download(row.file_path)
    setSaving('')
    if (e || !data) return setError(e?.message ?? 'Could not download the file.')

    const url = URL.createObjectURL(data)
    const a = document.createElement('a')
    a.href = url
    a.download = row.file_name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async function removeFile(row: FileRow) {
    await supabase.storage.from('task-files').remove([row.file_path])
    const { error: e } = await supabase.from('task_attachments').delete().eq('id', row.id)
    if (e) return setError(e.message)
    loadTab()
    onChanged()
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'comments', label: 'Comments', count: comments.length || undefined },
    { key: 'files', label: 'Files', count: files.length || undefined },
    { key: 'history', label: 'History' },
  ]

  // The changes and the sittings, woven into one list. Kept apart they hide
  // how the time actually went.
  type Line =
    | { row: 'change'; id: string; at: string; user_id: string | null; kind: string; detail: string | null }
    | { row: 'sitting'; id: string; at: string; user_id: string; secs: number; reason: string | null; note: string | null; running: boolean }

  const timeline: Line[] = [
    ...history.map((h): Line => ({ row: 'change', id: h.id, at: h.created_at, user_id: h.user_id, kind: h.kind, detail: h.detail })),
    ...sittings.map((v): Line => ({
      row: 'sitting',
      id: v.id,
      at: v.started_at,
      user_id: v.user_id,
      secs: (new Date(v.ended_at ?? Date.now()).getTime() - new Date(v.started_at).getTime()) / 1000,
      reason: v.end_reason,
      note: v.end_note,
      running: v.ended_at === null,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  // The original work, with the client's change rounds kept out — that is
  // what the allowed time was set for.
  const spentMins = Math.round((status?.base_secs ?? status?.actual_secs ?? 0) / 60)
  const over = (status?.allowed_mins ?? 0) > 0 && spentMins > (status?.allowed_mins ?? 0)

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-3 border-b border-[#1f1f1f] py-2.5 text-sm last:border-0">
      <span className="w-36 shrink-0 text-gray-500">{k}</span>
      <span className="min-w-0 flex-1 text-gray-200">{v}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#121212]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#242424] bg-[#171717] px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="task-detail-title" className="truncate font-semibold text-white">{task.subject}</h2>
              {/* One more logo option, or one more brochure page. The allowed
                  time goes up by itself — that is the whole point of it. */}
              {status?.per_unit && !locked && (
                <button
                  onClick={addUnit}
                  disabled={adding}
                  aria-label={`Add one ${status.unit}`}
                  title={`Add one ${status.unit} · +${mins(Math.round((status.allowed_mins ?? 0) / Math.max(status.work_qty, 1)))}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#2a2a2a] text-gray-400 hover:border-orange-500/60 hover:text-orange-400 disabled:opacity-50"
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              <span>#{task.task_no} · {nameOf(task.created_by)}</span>
              {status?.in_changes && (
                <span
                  className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                  style={dark
                    ? { background: 'rgba(217,119,6,0.18)', color: '#fcd34d' }
                    : { background: 'rgba(217,119,6,0.14)', color: '#92400e' }}
                >
                  Changes{status.change_rounds > 1 ? ` ×${status.change_rounds}` : ''}
                </span>
              )}
              {status?.work_type && (
                <span className="text-gray-400">
                  · {status.work_type}
                  {status.per_unit && <> · {status.work_qty} {status.unit}{status.work_qty === 1 ? '' : 's'}</>}
                  {' · '}
                  <span style={{ color: over ? (dark ? '#fca5a5' : '#991b1b') : (dark ? '#6ee7b7' : '#065f46') }}>
                    {mins(spentMins)} of {mins(status.allowed_mins ?? 0)}
                    {over && <> · over by {mins(spentMins - (status.allowed_mins ?? 0))}</>}
                  </span>
                  {status.change_secs > 0 && (
                    <span className="text-gray-500"> · +{mins(status.change_secs / 60)} on changes</span>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Next to the timer, because that is where someone looks the
                moment the allowed time runs out. */}
            <ExtraTimeRequest
              taskId={task.id}
              allowedMins={status?.allowed_mins ?? null}
              spentMins={spentMins}
              locked={locked}
              onChanged={loadTime}
            />
            {!locked && <TaskTimerButton taskId={task.id} size="md" onChanged={loadTime} />}
            {canEdit && (
              <button onClick={onEdit} aria-label="Edit task" title="Edit" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white">
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-[#242424] px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key}
              className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
                tab === t.key ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1.5 rounded-full bg-[#242424] px-1.5 text-xs text-gray-400">{t.count}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

          {locked && (
            <p className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-sm text-gray-400">
              This task is {stage?.name?.toLowerCase() ?? 'closed'}. Only a coordinator can reopen it.
            </p>
          )}

          {tab === 'details' && (
            <div>
              {row('Stage',
                canEdit ? (
                  <select
                    value={task.stage_id ?? ''}
                    disabled={busy}
                    onChange={(e) => changeStage(e.target.value)}
                    className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-1 text-sm text-white focus:border-orange-500 focus:outline-none"
                  >
                    {(stageChoices ?? stages).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  stage?.name ?? '—'
                ),
              )}
              {row('Priority', <span className={`rounded px-1.5 py-0.5 text-xs ${p.cls}`}>{p.label}</span>)}
              {row('Label', label ? <span className="rounded bg-[#232323] px-1.5 py-0.5 text-xs text-gray-300">{label.name}</span> : 'No label')}
              {row('Assigned to', currentAssignees(task).map(nameOf).join(', ') || '—')}
              {/* Who asked for this. A sales person's name belongs on the task
                  itself, not only in the small line above the tabs. */}
              {row(
                'Created by',
                <span>
                  {nameOf(task.created_by)}
                  <span className="text-gray-500"> · {fmtTaskDT(task.created_at)}</span>
                </span>,
              )}
              {/* The job came back. Saying who asked for it is the whole
                  point — a client's change is not the designer's fault, and
                  our own mistake does not earn extra time. */}
              {status?.work_type && !locked &&
                row(
                  'Changes',
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-300">
                        {status.change_rounds === 0
                          ? 'None yet'
                          : `${status.change_rounds} round${status.change_rounds === 1 ? '' : 's'} · ${status.client_changes} from the client, ${status.our_changes} ours`}
                        {status.change_secs > 0 && (
                          <span className="ml-2" style={{ color: dark ? '#fcd34d' : '#92400e' }}>
                            {mins(status.change_secs / 60)} spent on the client's changes
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => setChangeOpen((o) => !o)}
                        className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:border-amber-500/60 hover:text-amber-300"
                      >
                        {changeOpen ? 'Cancel' : 'Changes came in'}
                      </button>
                    </div>

                    {changeOpen && (
                      <div className="space-y-2 rounded-lg border border-[#2a2a2a] bg-[#171717] p-3">
                        <input
                          value={changeNote}
                          onChange={(e) => setChangeNote(e.target.value)}
                          placeholder="What has to change? (optional)"
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          {CHANGE_SOURCES.map((c) => (
                            <button
                              key={c.key}
                              onClick={() => addChange(c.key)}
                              disabled={adding}
                              className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                            >
                              {adding && <Loader2 className="h-3 w-3 animate-spin" />}
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600">
                          A client's change adds time to what this job is allowed. Our own mistake
                          adds none — redoing our own work is not new work. Either way your name goes
                          on the record.
                        </p>
                      </div>
                    )}
                  </div>,
                )}
              {row('Start', fmtTaskDT(task.start_at))}
              {row('Due', fmtTaskDT(task.due_at))}
              {/* Hours actually spent, not days elapsed. A job can sit for a
                  week and still have taken two hours. */}
              {time.length > 0 &&
                row(
                  'Time on this',
                  <span className="space-y-0.5">
                    {time.map((r) => (
                      <span key={r.user_id} className="block">
                        {r.full_name ?? '—'} · <span className="text-white">{hhmm(r.secs)}</span>
                        <span className="text-gray-500"> · {r.sessions} sitting{r.sessions === 1 ? '' : 's'}</span>
                      </span>
                    ))}
                  </span>,
                )}
              {task.completed_at && row('Finished', fmtTaskDT(task.completed_at))}
              {row('Customer', task.customer_name || '—')}
              {row('Customer mobile', task.customer_phone || '—')}
              {row('Description', <RichHtml html={task.description} />)}
            </div>
          )}

          {tab === 'comments' && (
            <div className="space-y-4">
              <ul className="space-y-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-lg border border-[#242424] bg-[#171717] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">{nameOf(c.user_id)}</p>
                      <span className="flex items-center gap-2 text-xs text-gray-500">
                        {fmtDT(c.created_at)}
                        {c.user_id === me && (
                          <button onClick={() => removeComment(c.id)} aria-label="Delete comment" className="text-gray-500 hover:text-red-400">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-300">{c.body}</p>
                  </li>
                ))}
                {comments.length === 0 && <li className="py-8 text-center text-sm text-gray-500">No comments yet.</li>}
              </ul>
              {locked ? null : (
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a comment"
                  className="flex-1 resize-y rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={addComment}
                  disabled={busy || !draft.trim()}
                  aria-label="Post comment"
                  className="self-end rounded-lg bg-orange-500 p-2.5 text-white hover:bg-orange-600 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-4">
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-lg border border-[#242424] bg-[#171717] px-3 py-2.5">
                    <Paperclip size={15} className="shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{f.file_name}</span>
                      <span className="block text-xs text-gray-500">
                        {nameOf(f.uploaded_by)} · {fmtDT(f.created_at)}
                        {f.file_size ? ` · ${Math.max(1, Math.round(f.file_size / 1024))} KB` : ''}
                      </span>
                    </span>
                    <button
                      onClick={() => saveFile(f)}
                      disabled={saving === f.id}
                      aria-label="Download file"
                      title="Download"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white disabled:opacity-50"
                    >
                      {saving === f.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    </button>
                    {(f.uploaded_by === me || canEdit) && (
                      <button onClick={() => removeFile(f)} aria-label="Delete file" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
                {files.length === 0 && !dragging && !busy && (
                  <li className="py-6 text-center text-sm text-gray-500">No files yet.</li>
                )}
              </ul>

              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  if (picked.length) void uploadMany(picked)
                  e.target.value = ''
                }}
              />

              {/*
                The whole panel takes a drop, not a thin strip at the bottom.
                Someone dragging a file aims at the box they are looking at,
                and missing it by a few pixels drops the file onto the page,
                which makes the browser open it and lose the task.

                dragOver must call preventDefault() or the browser refuses
                the drop — that one line is what makes dropping possible.
              */}
              {!locked && (
                <div
                  onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true) }}
                  onDragLeave={(e) => {
                    // Moving across a child fires dragLeave too; ignore those.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
                  }}
                  onDrop={onDrop}
                  className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    dragging
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  {busy ? (
                    <p className="flex items-center justify-center gap-2 text-sm text-gray-300">
                      <Loader2 size={15} className="animate-spin" />
                      Uploading {sending}…
                    </p>
                  ) : dragging ? (
                    <p className="text-sm font-medium text-orange-300">Drop to attach</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">
                        Drag files here, or{' '}
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="font-medium text-orange-400 underline-offset-2 hover:underline"
                        >
                          browse
                        </button>
                      </p>
                      <p className="mt-1 text-xs text-gray-600">Several at once is fine · up to {MAX_MB} MB each</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <ul className="space-y-3">
              {timeline.map((h) =>
                h.row === 'change' ? (
                  <li key={`a${h.id}`} className="flex gap-3 text-sm">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500/70" />
                    <span className="min-w-0 flex-1">
                      <span className="text-gray-200">{KIND_LABEL[h.kind] ?? h.kind}</span>
                      {h.detail && <span className="text-gray-400"> · {h.detail}</span>}
                      <span className="block text-xs text-gray-600">{nameOf(h.user_id)} · {fmtDT(h.at)}</span>
                    </span>
                  </li>
                ) : (
                  <li key={`s${h.id}`} className="flex gap-3 text-sm">
                    <Clock size={13} className="mt-1 shrink-0 text-sky-400/80" />
                    <span className="min-w-0 flex-1">
                      <span className="text-gray-200">
                        Worked {mins(h.secs / 60)}
                        {h.running && <span className="text-orange-400"> · still running</span>}
                      </span>
                      {!h.running && h.reason && (
                        <span className="text-gray-400"> · stopped: {REASON_LABEL[h.reason] ?? h.reason}</span>
                      )}
                      {h.note && <span className="block text-gray-300">"{h.note}"</span>}
                      <span className="block text-xs text-gray-600">{nameOf(h.user_id)} · {fmtDT(h.at)}</span>
                    </span>
                  </li>
                ),
              )}
              {timeline.length === 0 && <li className="py-8 text-center text-sm text-gray-500">Nothing recorded yet.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}