import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, ListTodo, Megaphone, CalendarClock, Loader2, ChevronRight } from 'lucide-react'
import { loadMyProjects, type DmProject } from '../../lib/dm'

/*
  The projects a Digital person runs.

  A project reaches them through its existing "Who is running it" — the
  project screens themselves are not changed. From here they go to the
  client's social pages (its workspace) and to the project's tasks.

  `limit` shows the first few on the dashboard; the full page has none.
*/

function dueLabel(due: string | null, done: boolean) {
  if (!due || done) return null
  const days = Math.floor((new Date(due).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000)
  if (days < 0) return { text: days === -1 ? 'A day late' : `${-days} days late`, cls: 'bg-red-950/50 text-red-300' }
  if (days === 0) return { text: 'Due today', cls: 'bg-amber-950/50 text-amber-300' }
  if (days <= 3) return { text: days === 1 ? 'Due tomorrow' : `${days} days left`, cls: 'bg-amber-950/50 text-amber-300' }
  return { text: new Date(due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: 'bg-[#1f1f1f] text-gray-400' }
}

export default function MyProjects({ limit }: { limit?: number }) {
  const [rows, setRows] = useState<DmProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadMyProjects().then(setRows).catch((e: Error) => setError(e.message))
  }, [])

  const open = (rows ?? []).filter((p) => !p.is_done && !p.is_rejected)
  const closed = (rows ?? []).filter((p) => p.is_done || p.is_rejected)
  const shown = limit ? open.slice(0, limit) : open

  return (
    <section className="space-y-4" aria-label="My projects">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500/15 text-orange-400"><FolderKanban size={15} /></span>
          My projects
          {rows && <span className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-xs text-gray-400">{open.length}</span>}
        </h2>
        {limit && open.length > limit && (
          <Link to="/dm/projects" className="inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-white">
            See all <ChevronRight size={13} />
          </Link>
        )}
      </div>

      {error && <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
      {!rows && !error && <p className="py-8 text-center text-gray-500"><Loader2 size={18} className="mx-auto animate-spin" /></p>}

      {rows && open.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[#2a2a2a] px-4 py-8 text-center text-sm text-gray-500">
          No project is given to you yet. When a project names you under "Who is running it", it appears here.
        </p>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}

      {!limit && closed.length > 0 && (
        <details className="rounded-2xl border border-[#242424] bg-[#131313] px-4 py-3">
          <summary className="cursor-pointer text-sm text-gray-400">Finished or closed ({closed.length})</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {closed.map((p) => <ProjectCard key={p.id} p={p} />)}
          </div>
        </details>
      )}
    </section>
  )
}

function ProjectCard({ p }: { p: DmProject }) {
  const due = dueLabel(p.due_date, Boolean(p.is_done || p.is_rejected))
  return (
    <article className="flex flex-col rounded-2xl border border-[#242424] bg-[#151515] p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">{p.title}</p>
          <p className="truncate text-xs text-gray-500">{p.customer_name}{p.customer_code ? ` · ${p.customer_code}` : ''}</p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-gray-600">{p.project_code}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {p.stage_name && <span className="rounded bg-[#232323] px-1.5 py-0.5 text-[11px] text-gray-300">{p.stage_name}</span>}
        {due && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${due.cls}`}>
            <CalendarClock size={11} /> {due.text}
          </span>
        )}
        {(p.service_keys ?? []).map((k) => (
          <span key={k} className="rounded bg-[#1c1c1c] px-1.5 py-0.5 text-[11px] text-gray-400">{k}</span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {p.workspace_id ? (
          <Link to={`/digital?ws=${p.workspace_id}`}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-300 hover:bg-orange-500/20">
            <Megaphone size={14} /> Social media
          </Link>
        ) : (
          <span className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2a2a2a] px-3 py-2 text-xs text-gray-500"
            title="This client has no Digital workspace yet">
            No workspace yet
          </span>
        )}
        <Link to={`/dm/tasks?project=${p.id}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-200 hover:bg-[#1a1a1a]">
          <ListTodo size={14} /> Tasks
          <span className={`rounded-full px-1.5 text-[11px] ${p.open_tasks ? 'bg-orange-500/20 text-orange-300' : 'bg-[#222] text-gray-500'}`}>{p.open_tasks}</span>
        </Link>
      </div>
    </article>
  )
}