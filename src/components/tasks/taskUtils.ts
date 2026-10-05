import { supabase } from '../../lib/supabase'

export type TaskStage = {
  id: string
  name: string
  color: string
  sort_order: number
  is_default: boolean
  is_done: boolean
  is_rejected: boolean
  is_active: boolean
}

export type TaskLabel = { id: string; name: string; color: string; sort_order: number; is_active: boolean }

export type TaskAssignee = { user_id: string; assigned_by: string | null; assigned_at: string; is_current: boolean }

export type Task = {
  id: string
  task_no: number
  subject: string
  description: string | null
  priority: Priority
  stage_id: string | null
  label_id: string | null
  customer_name: string | null
  customer_phone: string | null
  lead_id: string | null
  start_at: string
  due_at: string | null
  completed_at: string | null
  repeat_every: 'none' | 'daily' | 'weekly' | 'monthly'
  branch_id: string | null
  created_by: string
  created_at: string
  updated_at: string
  task_assignees: TaskAssignee[]
}

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export const PRIORITIES: { key: Priority; label: string; cls: string }[] = [
  { key: 'low', label: 'Low', cls: 'bg-sky-950/60 text-sky-300' },
  { key: 'medium', label: 'Medium', cls: 'bg-amber-950/60 text-amber-300' },
  { key: 'high', label: 'High', cls: 'bg-orange-950/60 text-orange-300' },
  { key: 'urgent', label: 'Urgent', cls: 'bg-red-950/60 text-red-300' },
]
export const priorityOf = (k: string) => PRIORITIES.find((p) => p.key === k) ?? PRIORITIES[0]

export const REPEATS = [
  { key: 'none', label: 'Does not repeat' },
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Every week' },
  { key: 'monthly', label: 'Every month' },
] as const

const TZ = 'Asia/Kolkata'

export const fmtTaskDT = (iso: string | null) =>
  iso
    ? new Date(iso)
        .toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
        .replace(/\//g, '-')
        .replace(',', '')
    : '—'

export const isTaskOverdue = (t: Task, stage?: TaskStage) =>
  !!t.due_at && new Date(t.due_at).getTime() < Date.now() && !stage?.is_done && !stage?.is_rejected

export const currentAssignees = (t: Task) => t.task_assignees.filter((a) => a.is_current).map((a) => a.user_id)

export async function loadTaskStages(): Promise<TaskStage[]> {
  const { data } = await supabase.from('task_stages').select('*').eq('is_active', true).order('sort_order')
  return (data ?? []) as TaskStage[]
}

export async function loadTaskLabels(): Promise<TaskLabel[]> {
  const { data } = await supabase.from('task_labels').select('*').eq('is_active', true).order('sort_order')
  return (data ?? []) as TaskLabel[]
}

// Every task this person is allowed to see
export async function loadTasks(): Promise<Task[]> {
  const out: Task[] = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, task_assignees(user_id, assigned_by, assigned_at, is_current)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(start, start + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as Task[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// How many comments and files each task has (one query each, not one per task)
export async function loadTaskCounts(): Promise<{ comments: Record<string, number>; files: Record<string, number> }> {
  const tally = (rows: { task_id: string }[] | null) => {
    const out: Record<string, number> = {}
    for (const r of rows ?? []) out[r.task_id] = (out[r.task_id] ?? 0) + 1
    return out
  }
  const [c, f] = await Promise.all([
    supabase.from('task_comments').select('task_id'),
    supabase.from('task_attachments').select('task_id'),
  ])
  return { comments: tally(c.data), files: tally(f.data) }
}

// Replace who the task is with: old people stay on record, marked as past
export async function setAssignees(taskId: string, userIds: string[], existing: TaskAssignee[]) {
  const keep = userIds
  const had = existing.map((a) => a.user_id)
  const toAdd = keep.filter((u) => !had.includes(u))
  const toRevive = keep.filter((u) => had.includes(u) && !existing.find((a) => a.user_id === u)?.is_current)
  const toRetire = existing.filter((a) => a.is_current && !keep.includes(a.user_id)).map((a) => a.user_id)
  const { data: who } = await supabase.auth.getUser()
  const by = who.user?.id ?? null

  if (toRetire.length) {
    const { error } = await supabase
      .from('task_assignees')
      .update({ is_current: false })
      .eq('task_id', taskId)
      .in('user_id', toRetire)
    if (error) throw new Error(error.message)
  }
  if (toRevive.length) {
    const { error } = await supabase
      .from('task_assignees')
      .update({ is_current: true, assigned_by: by, assigned_at: new Date().toISOString() })
      .eq('task_id', taskId)
      .in('user_id', toRevive)
    if (error) throw new Error(error.message)
  }
  if (toAdd.length) {
    const { error } = await supabase
      .from('task_assignees')
      .insert(toAdd.map((user_id) => ({ task_id: taskId, user_id, assigned_by: by })))
    if (error) throw new Error(error.message)
  }
}