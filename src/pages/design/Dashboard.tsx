import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Loader2, ListTodo } from 'lucide-react'
import DesignLayout from '../../components/DesignLayout'
import { useAuth } from '../../contexts/AuthContext'
import {
  currentAssignees, fmtTaskDT, isTaskOverdue, loadTaskStages, loadTasks, priorityOf,
  type Task, type TaskStage,
} from '../../components/tasks/taskUtils'

export default function DesignDashboard() {
  const { user, profile } = useAuth()
  const me = user?.id ?? ''
  const [tasks, setTasks] = useState<Task[]>([])
  const [stages, setStages] = useState<TaskStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const [t, s] = await Promise.all([loadTasks(), loadTaskStages()])
        setTasks(t)
        setStages(s)
      } catch (e) {
        setError((e as Error).message)
      }
      setLoading(false)
    })()
  }, [])

  const stageOf = useMemo(() => {
    const m = new Map(stages.map((s) => [s.id, s]))
    return (id: string | null) => (id ? m.get(id) : undefined)
  }, [stages])

  const mine = useMemo(() => tasks.filter((t) => currentAssignees(t).includes(me)), [tasks, me])

  const open = mine.filter((t) => {
    const s = stageOf(t.stage_id)
    return !s?.is_done && !s?.is_rejected
  })
  const overdue = open.filter((t) => isTaskOverdue(t, stageOf(t.stage_id)))
  const doneToday = mine.filter(
    (t) => t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString(),
  )

  const byStage = stages
    .filter((s) => !s.is_done && !s.is_rejected)
    .map((s) => ({ stage: s, items: open.filter((t) => t.stage_id === s.id) }))

  const cards = [
    { label: 'Open tasks', value: open.length, icon: ListTodo, cls: 'text-orange-400' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, cls: 'text-red-400' },
    { label: 'Finished today', value: doneToday.length, icon: CheckCircle2, cls: 'text-green-400' },
  ]

  return (
    <DesignLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {profile?.full_name ? `Hello, ${profile.full_name.split(' ')[0]}` : 'Your work today'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">Everything assigned to you, newest first.</p>
        </div>

        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="py-20 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {cards.map((c) => {
                const Icon = c.icon
                return (
                  <div key={c.label} className="rounded-xl border border-[#242424] bg-[#151515] p-5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-400">{c.label}</p>
                      <Icon size={18} className={c.cls} />
                    </div>
                    <p className="mt-2 text-3xl font-semibold text-white">{c.value}</p>
                  </div>
                )
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {byStage.map(({ stage, items }) => (
                <div key={stage.id} className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
                  <div className="flex items-center justify-between border-b border-[#242424] px-4 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-white">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                      {stage.name}
                    </span>
                    <span className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-xs text-gray-400">{items.length}</span>
                  </div>
                  <ul className="divide-y divide-[#1f1f1f]">
                    {items.slice(0, 6).map((t) => {
                      const late = isTaskOverdue(t, stage)
                      const p = priorityOf(t.priority)
                      return (
                        <li key={t.id}>
                          <Link to="/design/tasks" className="block px-4 py-3 hover:bg-[#1a1a1a]">
                            <p className="truncate text-sm text-white">{t.subject}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                              <span className={`rounded px-1.5 py-0.5 ${p.cls}`}>{p.label}</span>
                              <span className={`flex items-center gap-1 ${late ? 'text-red-400' : 'text-gray-500'}`}>
                                <Clock size={12} /> {fmtTaskDT(t.due_at)}
                              </span>
                            </p>
                          </Link>
                        </li>
                      )
                    })}
                    {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-600">Nothing here.</li>}
                    {items.length > 6 && (
                      <li className="px-4 py-2 text-center">
                        <Link to="/design/tasks" className="text-xs text-orange-400 hover:underline">
                          See all {items.length}
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DesignLayout>
  )
}