import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Download, Loader2, Paperclip, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useChartTheme } from '../../lib/chartTheme'
import { fmtDT, type Staff } from '../leads/leadUtils'
import { RichHtml } from '../RichText'
import { SHEET_BACKDROP, sheetPanel } from '../Sheet'
import { CHANGE_SOURCES, currentAssignees, fmtTaskDT, mins, priorityOf, type Task, type TaskLabel, type TaskStage, type TimeStatus } from './taskUtils'
import { hhmm, TaskTimerButton } from './WorkTimer'
import ExtraTimeRequest from './ExtraTimeRequest'

type Tab = 'details' | 'comments' | 'files' | 'history'
type TimeRow = { user_id: string; full_name: string | null; secs: number; sessions: number }

/*
  One piece of the job: an option, or a round of changes.

  Three options of a festival greeting are three pieces of work, each with
  its own allowance. Held as one total, "47m over 18 sittings" cannot say
  whether option 2 ran over or option 1 saved the day.

  part_kind null is an older sitting, recorded before the pieces existed.
  Those show as "Option not set" rather than being guessed into option 1 —
  that time probably covered several options, and putting it on one of them
  would make that option look bad for no reason.
*/
type Part = {
  part_kind: 'option' | 'change' | null
  // Which piece: banner 1 of 5. A change round has none.
  piece_no: number | null
  part_no: number | null
  label: string
  allowed_mins: number
  spent_secs: number
  sittings: number
  running: boolean
  // Who actually worked it, most time first. A task can change hands
  // half way through, and the option carries that — the points follow
  // the clock, not the name on the task.
  workers: string | null
}
type Child = {
  id: string
  task_no: number
  subject: string
  work_qty: number
  // Inner Pages of a brochure: the page count is a multiplier on the
  // allowance, not a count of separate pieces. unit_qty holds it; unit is
  // what one is called ("page"); per_unit says the time scales by it.
  unit_qty: number
  unit: string | null
  per_unit: boolean
  stage_name: string | null
  is_done: boolean
  people: string | null
  allowed_mins: number | null
  spent_secs: number
}
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
  const [parts, setParts] = useState<Part[]>([])
  const [adding, setAdding] = useState(false)
  /*
    The pieces this task was broken into.

    Five banners is one task of five. The coordinator hands two to one
    designer and two to another, and each slice gets its share of the
    time without anybody working it out. The piece still unassigned is
    the number worth seeing: it is the work nobody is doing.
  */
  const [kids, setKids] = useState<Child[]>([])
  // A part's page count being re-set (which part, and to what).
  const [editUnitsFor, setEditUnitsFor] = useState<string | null>(null)
  const [editUnitsVal, setEditUnitsVal] = useState(1)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitTo, setSplitTo] = useState('')
  const [splitQty, setSplitQty] = useState(1)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState('')   // "2 of 5" while files go up
  const { dark } = useChartTheme()   // pale-on-cream cannot be read, so the tones swap
  const [error, setError] = useState('')

  /*
    Group jobs (Brochure): the parts this task is built from. The task
    carries a group work type; its parts — Front-Back Concept, Inner Pages —
    are set here, and the allowed time adds up from what is picked.
  */
  type Part2 = { id: string; name: string; minutes: number; per_unit: boolean; unit: string | null }
  const [isGroupTask, setIsGroupTask] = useState(false)
  const [groupParts, setGroupParts] = useState<Part2[]>([])     // the parts this group can hold
  const [addQty, setAddQty] = useState<Record<string, number>>({})  // page count while adding a per-unit part
  const [changeFor, setChangeFor] = useState<string | null>(null)   // which part's "changes" panel is open
  const [addedTypes, setAddedTypes] = useState<Set<string>>(new Set())      // parts already on the job
  const [kidParts, setKidParts] = useState<Record<string, Part[]>>({})      // each part's own options and change rounds

  const loadParts = useCallback(async () => {
    if (!task.work_type_id) { setIsGroupTask(false); setGroupParts([]); return }
    const { data: wt } = await supabase.from('work_types').select('is_group').eq('id', task.work_type_id).maybeSingle()
    if (!(wt as { is_group?: boolean } | null)?.is_group) {
      setIsGroupTask(false); setGroupParts([]); return
    }
    setIsGroupTask(true)
    const [ch, cw] = await Promise.all([
      supabase.from('work_types').select('id, name, minutes, per_unit, unit')
        .eq('parent_id', task.work_type_id).eq('is_active', true).order('sort_order'),
      // Which parts are already on the job — so a part cannot be added twice.
      supabase.from('tasks').select('work_type_id').eq('parent_task_id', task.id).is('deleted_at', null),
    ])
    setGroupParts((ch.data ?? []) as Part2[])
    setAddedTypes(new Set((cw.data ?? []).map((r) => (r as { work_type_id: string }).work_type_id)))
  }, [task.id, task.work_type_id])

  const loadTime = useCallback(async () => {
    const [t, st, pt, kd] = await Promise.all([
      supabase.rpc('task_time', { p_task_id: task.id }),
      supabase.from('task_time_status').select('*').eq('task_id', task.id).maybeSingle(),
      supabase.rpc('task_parts', { p_task: task.id }),
      supabase.rpc('task_children', { p_task: task.id }),
    ])
    setTime((t.data ?? []) as TimeRow[])
    setStatus((st.data ?? null) as TimeStatus | null)
    setParts((pt.data ?? []) as Part[])
    const kidList = (kd.data ?? []) as Child[]
    setKids(kidList)

    /*
      Each part's own options and change rounds, so a brochure part reads
      exactly like any other job: Option 1, Option 2, Changes · round 1 —
      each line with its own clock, not one lump of hours.
    */
    if (kidList.length > 0) {
      const got = await Promise.all(kidList.map((k) => supabase.rpc('task_parts', { p_task: k.id })))
      const map: Record<string, Part[]> = {}
      kidList.forEach((k, i) => { map[k.id] = (got[i].data ?? []) as Part[] })
      setKidParts(map)
    } else {
      setKidParts({})
    }
  }, [task.id])

  // Add a part to a group job. Each part becomes its own timed item with
  // its own options and changes.
  async function addPart(wtId: string, qty: number) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_part', { p_parent: task.id, p_work_type: wtId, p_qty: Math.max(1, qty || 1) })
    setAdding(false)
    if (e) return setError(e.message)
    await Promise.all([loadTime(), loadParts()])
  }
  // A part's own option / change / removal — the same RPCs any task uses,
  // pointed at the part.
  async function childOption(childId: string) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_option', { p_task: childId, p_piece: 1 })
    setAdding(false)
    if (e) return setError(e.message)
    await loadTime()
  }
  async function childChange(childId: string, source: string) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_change', { p_task: childId, p_source: source, p_note: null })
    setAdding(false)
    setChangeFor(null)
    if (e) return setError(e.message)
    await loadTime()
  }
  // A part's option taken back off — last of the piece, only while nothing
  // has been worked on it. Same RPC any task uses, pointed at the part.
  async function childRemoveOption(childId: string, piece: number) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_remove_option', { p_task: childId, p_piece: piece })
    setAdding(false)
    if (e) return setError(e.message)
    await loadTime()
  }
  // Change a part's page count — the allowance moves with it. Only while
  // nothing has been worked, so no one's spent time is quietly re-judged.
  async function saveUnits(childId: string) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_set_part_units', { p_part: childId, p_qty: Math.max(1, editUnitsVal || 1) })
    setAdding(false)
    setEditUnitsFor(null)
    if (e) return setError(e.message)
    await Promise.all([loadTime(), loadParts()])
  }

  async function removePart(childId: string) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_remove_part', { p_part: childId })
    setAdding(false)
    if (e) return setError(e.message)
    await Promise.all([loadTime(), loadParts()])
  }

  async function splitTask() {
    if (!splitTo) return setError('Pick who gets this piece.')
    setAdding(true)
    const { error: e } = await supabase.rpc('task_split', {
      p_task: task.id,
      p_user: splitTo,
      p_qty: splitQty,
      p_subject: null,
    })
    setAdding(false)
    if (e) return setError(e.message)
    setSplitOpen(false)
    setSplitTo('')
    setSplitQty(1)
    await loadTime()
    onChanged()
  }

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

  /*
    One more option.

    Option 1 comes with the task, so this always makes option 2 or
    later — which is why the button says the number it is about to
    create rather than a bare +. The allowed time goes up by itself;
    that is the whole point of counting options at all.
  */
  /*
    Taking an option back off.

    Only the last one of a piece, and only while nothing has been
    worked on it. Removing one from the middle would leave Option 1,
    3, 4 — and then an old sitting marked "Option 3" belongs to work
    nobody can name. Renumbering to close the gap is worse: it quietly
    rewrites what those sittings were for.
  */
  async function removeOption(piece = 1) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_remove_option', { p_task: task.id, p_piece: piece })
    setAdding(false)
    if (e) return setError(e.message)
    await loadTime()
    onChanged()
  }

  async function addOption(piece = 1) {
    setAdding(true)
    const { error: e } = await supabase.rpc('task_add_option', { p_task: task.id, p_piece: piece })
    setAdding(false)
    if (e) return setError(e.message)
    await loadTime()
    onChanged()
  }

  useEffect(() => {
    void loadTime()
  }, [loadTime])

  useEffect(() => {
    void loadParts()
  }, [loadParts])
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

  /*
    A split task has no allowance of its own, so the line above it used
    to read "0m of 0m" — which says the job was given no time at all,
    and that is not what happened. It shows its pieces' total instead:
    still the whole job, just added up from where the work actually is.
  */
  /*
    How many options a piece already has, read off the rows the
    database just sent. Asking the server again for a number that is
    already on screen is how two parts of one page end up disagreeing.
  */
  const optionsOf = (piece: number) =>
    parts.filter((x) => x.part_kind === 'option' && (x.piece_no ?? 1) === piece).length
  // "Banner", "Page" — whatever one of them is called in Settings.
  const unitName = (status?.unit ?? 'piece').replace(/^./, (c) => c.toUpperCase())

  const isContainer = (status?.child_count ?? 0) > 0
  const shownAllowed = isContainer ? (status?.rolled_allowed_mins ?? 0) : (status?.allowed_mins ?? 0)
  const shownSpent = isContainer ? Math.round((status?.rolled_spent_secs ?? 0) / 60) : spentMins
  const shownOver = shownAllowed > 0 && shownSpent > shownAllowed

  /*
    A label and its value.

    Side by side on a desktop, where a 9rem label column lines every
    value up. On a phone that column is a quarter of the screen and
    "Customer mobile" wraps to two lines next to a number that then has
    nowhere to go, so below sm the label simply sits above its value.
  */
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex flex-col gap-0.5 border-b border-[#1f1f1f] py-2.5 text-sm last:border-0 sm:flex-row sm:gap-3">
      <span className="text-gray-500 sm:w-36 sm:shrink-0">{k}</span>
      <span className="min-w-0 flex-1 text-gray-200">{v}</span>
    </div>
  )

  return (
    <div className={SHEET_BACKDROP} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        className={sheetPanel({ width: 'sm:max-w-3xl' })}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#242424] bg-[#171717] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 id="task-detail-title" className="truncate font-semibold text-white">{task.subject}</h2>
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
                  {status.work_qty > 1 && <> · {status.work_qty} pcs</>}
                  {/* One figure per option, not one for all of them.

                      "25m of 9h" is three options added up, and added up it
                      answers nothing: it cannot say whether option 1 ran
                      over or option 3 was never started. Each option is its
                      own piece of work with its own allowance, so each gets
                      its own figure here, the same as in the list below. */}
                  {/* The line under the title stays a total.

                      It used to print one figure per option, which was
                      readable at three. With pieces as well it would be
                      ten — banner 1 option 1, banner 1 option 2 — and a
                      title line of ten figures is a title line nobody
                      reads. The breakdown has a table of its own right
                      below, which is where that question belongs. */}
                  {' · '}
                  <span style={{ color: shownOver ? (dark ? '#fca5a5' : '#991b1b') : (dark ? '#6ee7b7' : '#065f46') }}>
                    {mins(shownSpent)} of {mins(shownAllowed)}
                    {shownOver && <> · over by {mins(shownSpent - shownAllowed)}</>}
                  </span>
                  {isContainer && <span className="text-gray-500"> across its pieces</span>}
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
            {/* A split task has no clock of its own: the work is in its
                pieces, and a timer here would count one banner twice. */}
            {!locked && (status?.child_count ?? 0) === 0 && (
              <TaskTimerButton taskId={task.id} size="md" onChanged={loadTime} />
            )}
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

        {/* Four tabs do not fit across a 360px phone, so the row slides
            sideways rather than squeezing the labels. shrink-0 is what
            stops flex from compressing them instead of scrolling. */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#242424] px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                tab === t.key ? 'border-orange-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1.5 rounded-full bg-[#242424] px-1.5 text-xs text-gray-400">{t.count}</span> : null}
            </button>
          ))}
        </div>

        {/* min-h-0 is what makes this scroll rather than stretch the
            sheet: without it a long history pushes the panel past the
            bottom of the phone and nothing scrolls at all. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {error && <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

          {locked && (
            <p className="mb-4 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-sm text-gray-400">
              This task is {stage?.name?.toLowerCase() ?? 'closed'}. Only a coordinator can reopen it.
            </p>
          )}

          {tab === 'details' && (
            <div>
              {/* The pieces of the job, each with its own clock.

                  The timer runs against one option at a time, so "option 1
                  took 10m of its 15m and option 2 took 8m" is a thing the
                  screen can actually say. Starting one option pauses
                  whatever was running — the database sees to that, the same
                  way it always has. */}
              {/* Five banners, two designers.

                  The big task becomes a container the moment it has a
                  piece: its own timer goes quiet and its allowance moves
                  into the pieces, so one banner's time cannot be counted
                  twice. What is left unassigned stays on screen, because
                  that is the piece nobody has been told to do. */}
              {/* A group job (Brochure): each part is its own timed item,
                  with its own Start, its own options and its own changes —
                  the same as any other service. The brochure adds them up. */}
              {isGroupTask && !task.parent_task_id && (
                <div className="mb-5 overflow-hidden rounded-lg border border-[#242424]">
                  <div className="border-b border-[#242424] bg-[#171717] px-4 py-2">
                    <p className="text-xs font-medium text-gray-300">{status?.work_type ?? 'Parts'}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Each part has its own timer, options and changes. The brochure adds them up.
                    </p>
                  </div>

                  {/* Parts already on this job */}
                  {kids.length > 0 && (
                    <ul>
                      {kids.map((k) => {
                        const kps = kidParts[k.id] ?? []
                        const opts = kps.filter((x) => x.part_kind === 'option')
                        // Pages can be re-set only before any time lands on the part.
                        const canEditUnits = canEdit && !locked && k.per_unit && k.spent_secs === 0
                        return (
                          <li key={k.id} className="border-b border-[#1f1f1f] px-4 py-2.5 last:border-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-gray-200">
                                  {k.subject}
                                  {/* How many pages this part is — why the time is what it is. */}
                                  {k.per_unit && (
                                    <span className="ml-1.5 text-[11px] font-normal text-gray-500">
                                      · {k.unit_qty} {k.unit ?? 'unit'}{k.unit_qty === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-[11px] text-gray-500">
                                  {k.people ?? 'Nobody'}{k.stage_name ? ` · ${k.stage_name}` : ''}
                                </span>
                              </span>
                              <span className="shrink-0 text-sm tabular-nums text-gray-300">
                                {hhmm(k.spent_secs)}
                                {k.allowed_mins ? <span className="text-gray-500"> of {mins(k.allowed_mins)}</span> : null}
                              </span>
                              {!locked && (
                                <>
                                  {/* Change the page count — only while untouched. */}
                                  {canEditUnits && (
                                    <button
                                      onClick={() => { setEditUnitsFor(editUnitsFor === k.id ? null : k.id); setEditUnitsVal(k.unit_qty) }}
                                      title="Change page count"
                                      aria-label="Change page count"
                                      className="rounded-md p-1 text-gray-500 hover:bg-[#222] hover:text-orange-300"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => childOption(k.id)}
                                    disabled={adding}
                                    className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300 disabled:opacity-50"
                                  >
                                    + option
                                  </button>
                                  <button
                                    onClick={() => setChangeFor(changeFor === k.id ? null : k.id)}
                                    className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:border-amber-500/60 hover:text-amber-300"
                                  >
                                    Changes
                                  </button>
                                  {k.spent_secs === 0 && (
                                    <button
                                      onClick={() => removePart(k.id)}
                                      disabled={adding}
                                      aria-label="Remove part"
                                      title="Remove — nothing has been worked on it"
                                      className="rounded-md p-1 text-gray-600 hover:bg-[#222] hover:text-red-400 disabled:opacity-50"
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Re-set the page count. */}
                            {editUnitsFor === k.id && !locked && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={editUnitsVal}
                                  onChange={(e) => setEditUnitsVal(Math.max(1, Number(e.target.value) || 1))}
                                  className="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm tabular-nums text-white focus:border-orange-500 focus:outline-none"
                                />
                                <span className="text-[11px] text-gray-500">{k.unit ?? 'unit'}{editUnitsVal === 1 ? '' : 's'}</span>
                                <button
                                  onClick={() => saveUnits(k.id)}
                                  disabled={adding}
                                  className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditUnitsFor(null)}
                                  className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}

                            {changeFor === k.id && !locked && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {CHANGE_SOURCES.map((c) => (
                                  <button
                                    key={c.key}
                                    onClick={() => childChange(k.id, c.key)}
                                    disabled={adding}
                                    className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white disabled:opacity-50"
                                  >
                                    {c.label}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Each option and change round — one line, one clock.
                                Option 1 is here from the start, with its own Start,
                                the same as any other service. */}
                            {kps.length > 0 && (
                              <ul className="mt-2 space-y-1.5 border-l border-[#2a2a2a] pl-3">
                                {kps.map((pt) => {
                                  const spentM = pt.spent_secs / 60
                                  const over = pt.allowed_mins > 0 && spentM > pt.allowed_mins
                                  return (
                                    <li
                                      key={`${k.id}-${pt.part_kind ?? 'none'}-${pt.piece_no ?? 0}-${pt.part_no ?? 0}`}
                                      className="flex flex-wrap items-center gap-x-3 gap-y-1"
                                    >
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-gray-300">
                                          {pt.label}
                                          {pt.running && <span className="ml-2 text-xs text-orange-400">running</span>}
                                        </span>
                                        {pt.workers && (
                                          <span className="block truncate text-[11px] text-gray-500">{pt.workers}</span>
                                        )}
                                      </span>
                                      <span className="shrink-0 text-sm tabular-nums">
                                        <span style={{ color: over ? (dark ? '#fca5a5' : '#991b1b') : (dark ? '#d1d5db' : '#4b4536') }}>
                                          {hhmm(pt.spent_secs)}
                                        </span>
                                        {pt.allowed_mins > 0 && <span className="text-gray-500"> of {mins(pt.allowed_mins)}</span>}
                                      </span>
                                      {!locked && pt.part_kind && (
                                        <TaskTimerButton
                                          taskId={k.id}
                                          part={{ kind: pt.part_kind, no: pt.part_no ?? 1, piece: pt.piece_no ?? 1 }}
                                          onChanged={loadTime}
                                        />
                                      )}
                                      {/* Last option, untouched — take it back off with ✕.
                                          One with time on it stays. */}
                                      {canEdit && !locked && pt.part_kind === 'option'
                                        && opts.length > 1
                                        && pt.part_no === opts.length
                                        && pt.spent_secs === 0 && (
                                        <button
                                          onClick={() => childRemoveOption(k.id, pt.piece_no ?? 1)}
                                          disabled={adding}
                                          aria-label={`Remove ${pt.label}`}
                                          title="Remove this option — nothing has been worked on it"
                                          className="rounded-md p-1 text-gray-600 hover:bg-[#222] hover:text-red-400 disabled:opacity-50"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {/* Add a part */}
                  {!locked && (
                    <div className="border-t border-[#242424] bg-[#141414] px-4 py-3">
                      <p className="mb-2 text-[11px] text-gray-500">Add a part</p>
                      <div className="space-y-2">
                        {/* A part already on the job is not offered again —
                            take it off first if it has to change. */}
                        {groupParts.filter((gp) => !addedTypes.has(gp.id)).map((gp) => (
                          <div key={gp.id} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 text-sm text-gray-300">
                              {gp.name}
                              <span className="ml-1.5 text-[11px] text-gray-500">
                                {gp.per_unit ? `${mins(gp.minutes)} per ${gp.unit ?? 'unit'}` : `${mins(gp.minutes)} fixed`}
                              </span>
                            </span>
                            {gp.per_unit && (
                              <input
                                type="number"
                                min={1}
                                max={999}
                                value={addQty[gp.id] ?? ''}
                                onChange={(e) => setAddQty((m) => ({ ...m, [gp.id]: Math.max(1, Number(e.target.value) || 1) }))}
                                placeholder={gp.unit ?? 'qty'}
                                className="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm tabular-nums text-white focus:border-orange-500 focus:outline-none"
                              />
                            )}
                            <button
                              onClick={() => addPart(gp.id, gp.per_unit ? (addQty[gp.id] ?? 1) : 1)}
                              disabled={adding}
                              className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300 disabled:opacity-50"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                        {groupParts.length === 0 && (
                          <p className="text-sm text-gray-500">No parts set up for this job yet.</p>
                        )}
                        {groupParts.length > 0 && groupParts.every((gp) => addedTypes.has(gp.id)) && (
                          <p className="text-sm text-gray-500">Every part is on the job.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(status?.work_qty ?? 1) > 1 && !task.parent_task_id && (
                <div className="mb-5 overflow-hidden rounded-lg border border-[#242424]">
                  <div className="flex flex-wrap items-center gap-3 border-b border-[#242424] bg-[#171717] px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-300">
                        {status?.work_qty} pieces
                        {kids.length > 0 && (
                          <span className="text-gray-500">
                            {' · '}{status?.assigned_qty} given out
                            {(status?.work_qty ?? 0) > (status?.assigned_qty ?? 0) && (
                              <span className="text-amber-400">
                                {' · '}{(status?.work_qty ?? 0) - (status?.assigned_qty ?? 0)} still with nobody
                              </span>
                            )}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Hand some of them to a designer — the time goes with them.
                      </p>
                    </div>
                    {canEdit && !locked && (status?.work_qty ?? 0) > (status?.assigned_qty ?? 0) && (
                      <button
                        onClick={() => setSplitOpen((o) => !o)}
                        className="shrink-0 rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300"
                      >
                        {splitOpen ? 'Cancel' : 'Hand some out'}
                      </button>
                    )}
                  </div>

                  {splitOpen && (
                    <div className="flex flex-wrap items-end gap-3 border-b border-[#1f1f1f] bg-[#141414] px-4 py-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] text-gray-500">How many</span>
                        <input
                          type="number"
                          min={1}
                          max={(status?.work_qty ?? 1) - (status?.assigned_qty ?? 0)}
                          value={splitQty}
                          onChange={(e) => setSplitQty(Math.max(1, Number(e.target.value) || 1))}
                          className="w-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm tabular-nums text-white focus:border-orange-500 focus:outline-none"
                        />
                      </label>
                      <label className="block min-w-[12rem] flex-1">
                        <span className="mb-1 block text-[11px] text-gray-500">To</span>
                        <select
                          value={splitTo}
                          onChange={(e) => setSplitTo(e.target.value)}
                          className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                        >
                          <option value="">Pick a designer</option>
                          {staff
                            .filter((x) => x.is_active && x.role === 'design_team')
                            .map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
                        </select>
                      </label>
                      <button
                        onClick={splitTask}
                        disabled={adding || !splitTo}
                        className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Give
                      </button>
                    </div>
                  )}

                  {kids.length > 0 && (
                    <ul>
                      {kids.map((k) => (
                        <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#1f1f1f] px-4 py-2.5 last:border-0">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-gray-200">
                              <span className="text-gray-500">#{k.task_no}</span> {k.subject}
                            </span>
                            <span className="block truncate text-[11px] text-gray-500">
                              {k.people ?? 'Nobody'}{k.stage_name ? ` · ${k.stage_name}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-gray-400">
                            {k.work_qty} pc{k.work_qty === 1 ? '' : 's'}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-gray-300">
                            {hhmm(k.spent_secs)}
                            {k.allowed_mins ? <span className="text-gray-500"> of {mins(k.allowed_mins)}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {parts.length > 0 && !isGroupTask && (status?.child_count ?? 0) === 0 && (
                <div className="mb-5 overflow-hidden rounded-lg border border-[#242424]">
                  <div className="border-b border-[#242424] bg-[#171717] px-4 py-2">
                    <p className="text-xs font-medium text-gray-300">Where the time went</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Start the option you are working on, so each one carries its own time.
                    </p>
                  </div>
                  <ul>
                    {parts.map((pt) => {
                      const spent = pt.spent_secs / 60
                      const partOver = pt.allowed_mins > 0 && spent > pt.allowed_mins
                      return (
                        <li
                          key={`${pt.part_kind ?? 'none'}-${pt.piece_no ?? 0}-${pt.part_no ?? 0}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#1f1f1f] px-4 py-2.5 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-sm text-gray-200">
                              {pt.label}
                              {pt.running && (
                                <span className="ml-2 text-xs text-orange-400">running</span>
                              )}
                            </span>
                            {/* Who did it. The option's points go to this
                                person, whoever the task is on now. */}
                            {pt.workers && (
                              <span className="block truncate text-[11px] text-gray-500">{pt.workers}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums">
                            <span
                              style={{
                                color: partOver
                                  ? (dark ? '#fca5a5' : '#991b1b')
                                  : (dark ? '#d1d5db' : '#4b4536'),
                              }}
                            >
                              {hhmm(pt.spent_secs)}
                            </span>
                            {/* An allowance of zero means there is nothing to
                                measure against — our own change round, or old
                                time with no option. Showing "of 0m" there
                                would read as a failure that never happened. */}
                            {pt.allowed_mins > 0 && (
                              <span className="text-gray-500"> of {mins(pt.allowed_mins)}</span>
                            )}
                          </span>
                          {pt.sittings > 0 && (
                            <span className="shrink-0 text-xs text-gray-500">
                              {pt.sittings} sitting{pt.sittings === 1 ? '' : 's'}
                            </span>
                          )}
                          {!locked && pt.part_kind && (status?.child_count ?? 0) === 0 && (
                            <TaskTimerButton
                              taskId={task.id}
                              part={{ kind: pt.part_kind, no: pt.part_no ?? 1, piece: pt.piece_no ?? 1 }}
                              onChanged={loadTime}
                            />
                          )}
                          {/* Only on the last option of a piece, and only
                              while it is still untouched. An option with
                              time on it is work that happened, and the
                              hours do not come back. */}
                          {canEdit && !locked && pt.part_kind === 'option'
                            && (status?.child_count ?? 0) === 0
                            && pt.part_no === optionsOf(pt.piece_no ?? 1)
                            && optionsOf(pt.piece_no ?? 1) > 1
                            && pt.spent_secs === 0 && (
                            <button
                              onClick={() => removeOption(pt.piece_no ?? 1)}
                              disabled={adding}
                              aria-label={`Remove ${pt.label}`}
                              title="Remove this option — nothing has been worked on it"
                              className="shrink-0 rounded-md p-1 text-gray-600 hover:bg-[#222] hover:text-red-400 disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>

                  {/* One button per piece, not one for the task.

                      A single button added an option to every piece at
                      once: two banners, and asking for a third draft of
                      the first one invented a third draft of the second
                      as well — four hours of work that was never done,
                      sitting in the allowance. The client wants three
                      of one and one of the other, and the screen has to
                      be able to say that. */}
                  {canEdit && !locked && status?.work_type && (status?.child_count ?? 0) === 0 && (
                    <div className="border-t border-[#242424] bg-[#141414] px-4 py-2.5">
                      <p className="mb-2 text-[11px] text-gray-500">
                        A new option adds its own time to this job.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from({ length: Math.max(status?.work_qty ?? 1, 1) }, (_, i) => i + 1).map((pc) => {
                          const next = optionsOf(pc) + 1
                          return (
                            <button
                              key={pc}
                              onClick={() => addOption(pc)}
                              disabled={adding}
                              className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:border-orange-500/60 hover:text-orange-300 disabled:opacity-50"
                            >
                              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                              {(status?.work_qty ?? 1) > 1
                                ? `${unitName} ${pc} · option ${next}`
                                : `Add option ${next}`}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

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