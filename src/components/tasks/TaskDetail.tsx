import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, Paperclip, Pencil, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fmtDT, type Staff } from '../leads/leadUtils'
import { currentAssignees, fmtTaskDT, priorityOf, type Task, type TaskLabel, type TaskStage } from './taskUtils'

type Tab = 'details' | 'comments' | 'files' | 'history'
type Comment = { id: string; user_id: string; body: string; created_at: string }
type FileRow = { id: string; file_path: string; file_name: string; file_size: number | null; uploaded_by: string; created_at: string }
type Activity = { id: string; user_id: string | null; kind: string; detail: string | null; created_at: string }

const KIND_LABEL: Record<string, string> = {
  created: 'Created',
  assign: 'Assigned to',
  unassign: 'Removed',
  stage: 'Stage',
  priority: 'Priority',
  due: 'Due date',
  label: 'Label',
  comment: 'Comment',
  file: 'File',
}

export default function TaskDetail({
  task, stages, labels, staff, canEdit, initialTab = 'details', onEdit, onClose, onChanged,
}: {
  task: Task
  stages: TaskStage[]
  labels: TaskLabel[]
  staff: Staff[]
  canEdit: boolean
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
  const [error, setError] = useState('')
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
      const { data } = await supabase.from('task_activities').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      setHistory((data ?? []) as Activity[])
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

  async function upload(f: File) {
    if (f.size > 25 * 1024 * 1024) return setError('Files must be under 25 MB.')
    setBusy(true)
    const safe = f.name.replace(/[^\w.\- ]/g, '_')
    const path = `${task.id}/${Date.now()}-${safe}`
    const { error: upErr } = await supabase.storage.from('task-files').upload(path, f)
    if (upErr) {
      setBusy(false)
      return setError(upErr.message)
    }
    const { error: e } = await supabase
      .from('task_attachments')
      .insert({ task_id: task.id, file_path: path, file_name: f.name, file_size: f.size })
    setBusy(false)
    if (e) return setError(e.message)
    loadTab()
    onChanged()
  }

  async function openFile(row: FileRow) {
    const { data, error: e } = await supabase.storage.from('task-files').createSignedUrl(row.file_path, 60)
    if (e || !data) return setError(e?.message ?? 'Could not open the file.')
    window.open(data.signedUrl, '_blank', 'noopener')
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
            <h2 id="task-detail-title" className="truncate font-semibold text-white">{task.subject}</h2>
            <p className="mt-0.5 text-xs text-gray-500">#{task.task_no} · {nameOf(task.created_by)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
                    {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                ) : (
                  stage?.name ?? '—'
                ),
              )}
              {row('Priority', <span className={`rounded px-1.5 py-0.5 text-xs ${p.cls}`}>{p.label}</span>)}
              {row('Label', label ? <span className="rounded bg-[#232323] px-1.5 py-0.5 text-xs text-gray-300">{label.name}</span> : 'No label')}
              {row('Assigned to', currentAssignees(task).map(nameOf).join(', ') || '—')}
              {row('Start', fmtTaskDT(task.start_at))}
              {row('Due', fmtTaskDT(task.due_at))}
              {task.completed_at && row('Finished', fmtTaskDT(task.completed_at))}
              {row('Customer', task.customer_name || '—')}
              {row('Customer mobile', task.customer_phone || '—')}
              {row('Description', task.description ? <span className="whitespace-pre-wrap">{task.description}</span> : '—')}
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
                    <button onClick={() => openFile(f)} aria-label="Open file" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-white">
                      <Download size={15} />
                    </button>
                    {(f.uploaded_by === me || canEdit) && (
                      <button onClick={() => removeFile(f)} aria-label="Delete file" className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </li>
                ))}
                {files.length === 0 && <li className="py-8 text-center text-sm text-gray-500">No files yet.</li>}
              </ul>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) upload(f)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />} Add a file
              </button>
            </div>
          )}

          {tab === 'history' && (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500/70" />
                  <span className="min-w-0 flex-1">
                    <span className="text-gray-200">{KIND_LABEL[h.kind] ?? h.kind}</span>
                    {h.detail && <span className="text-gray-400"> · {h.detail}</span>}
                    <span className="block text-xs text-gray-600">{nameOf(h.user_id)} · {fmtDT(h.created_at)}</span>
                  </span>
                </li>
              ))}
              {history.length === 0 && <li className="py-8 text-center text-sm text-gray-500">Nothing recorded yet.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}