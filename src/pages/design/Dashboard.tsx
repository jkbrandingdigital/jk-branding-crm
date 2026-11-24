import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Clock, Loader2, ListTodo } from 'lucide-react'
import DesignLayout from '../../components/DesignLayout'
import { useAuth } from '../../contexts/AuthContext'

/*
  The design home page.

  My day (in DesignLayout, above this) now carries the greeting, the
  counts — open, past due, finished today — and the running clock. What is
  left here is the one thing My day does not show: this person's tasks,
  stage by stage. The open count is the same rule on both (stage not
  Completed, not Rejected), so the two can never disagree.
*/
import {
  currentAssignees, fmtTaskDT, isTaskOverdue, loadTaskStages, loadTasks, priorityOf,
  type Task, type TaskStage,
} from '../../components/tasks/taskUtils'

export default function DesignDashboard() {
  const { user } = useAuth()
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

  const byStage = stages
    .filter((s) => !s.is_done && !s.is_rejected)
    .map((s) => ({ stage: s, items: open.filter((t) => t.stage_id === s.id) }))

  return (
    <DesignLayout>
      <section className="space-y-4" aria-label="My tasks by stage">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500/15 text-orange-400"><ListTodo size={15} /></span>
            My tasks by stage
          </h2>
          <Link to="/design/tasks" className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-white">
            Open the board <ChevronRight size={13} />
          </Link>
        </div>

        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

        {loading ? (
          <div className="py-16 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {byStage.map(({ stage, items }) => (
              <div key={stage.id} className="overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
                <div className="flex items-center justify-between px-5 pb-3 pt-4">
                  <span className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                    {stage.name}
                  </span>
                  <span className="rounded-full bg-[#1f1f1f] px-2.5 py-0.5 text-xs tabular-nums text-gray-400">{items.length}</span>
                </div>
                <ul className="space-y-2 px-3 pb-3">
                  {items.slice(0, 6).map((t) => {
                    const late = isTaskOverdue(t, stage)
                    const p = priorityOf(t.priority)
                    return (
                      <li key={t.id}>
                        <Link
                          to="/design/tasks"
                          className={`block rounded-xl border bg-[#1a1a1a] px-3.5 py-3 transition-colors hover:border-orange-500/40 hover:bg-[#1d1d1d] ${
                            late ? 'border-red-900/60' : 'border-[#242424]'
                          }`}
                        >
                          <p className="truncate text-sm font-medium text-white">{t.subject}</p>
                          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className={`rounded px-1.5 py-0.5 ${p.cls}`}>{p.label}</span>
                            <span className={`flex items-center gap-1 ${late ? 'text-red-400' : 'text-gray-500'}`}>
                              <Clock size={12} /> {t.due_at ? fmtTaskDT(t.due_at) : 'No due date'}
                            </span>
                          </p>
                        </Link>
                      </li>
                    )
                  })}
                  {items.length === 0 && (
                    <li className="rounded-xl border border-dashed border-[#242424] px-4 py-6 text-center text-xs text-gray-600">Nothing here</li>
                  )}
                  {items.length > 6 && (
                    <li className="pt-1 text-center">
                      <Link to="/design/tasks" className="text-xs text-orange-400 hover:underline">See all {items.length}</Link>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </DesignLayout>
  )
}