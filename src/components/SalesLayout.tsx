import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Sunrise, Moon, TrendingUp, CalendarOff, Menu, X, CheckCircle2, ChevronDown, Filter, AlarmClock, ListTodo, ListChecks, StickyNote, FileText, Plus, type LucideIcon } from 'lucide-react'
import Header from './Header'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/permissions'
import { getCurrentUser, getUserProfile } from '../lib/auth'
import { istDate } from '../lib/format'

export type SalesPage = 'evolution' | 'report' | 'performance' | 'leads'
// Pages with their own route (not ?page=) — kept out of SalesPage so sales/Dashboard stays as it is
type SalesNav = SalesPage | 'reminders' | 'tasks' | 'todos' | 'notes' | 'quotations' | 'quote-new'
const OWN_ROUTE: Partial<Record<SalesNav, string>> = {
  reminders: '/sales/reminders',
  tasks: '/sales/tasks',
  todos: '/sales/todos',
  notes: '/sales/notes',
  quotations: '/sales/quotations',
  'quote-new': '/sales/quotations/new',
}

type NavItem = { label: string; hint?: string; page?: SalesNav; icon: LucideIcon; perm?: string }

// These two open on a click; the rest stay in plain view
const FOLDABLE = ['Productivity', 'Business']

// A sales person's own work — their forms, their leads, their numbers —
// carries no permission. It is their job; there is nothing to switch off.
//
// The mod_* keys below, and the ones missing from this list, all mean the
// same thing now: may they see EVERYONE's, over in the admin area. So a
// sub admin keeps their own screens whatever you tick for them.
//
// Still switched: Tasks, Reminders, Notes and Quotations are tools, not
// everyone uses them.
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Today',
    items: [
      { label: 'Evolution Form', hint: 'Morning', page: 'evolution', icon: Sunrise },
      { label: 'Daily Report', hint: 'Evening', page: 'report', icon: Moon },
    ],
  },
  { title: 'Leads', items: [{ label: 'My Leads', page: 'leads', icon: Filter }] },
  {
    title: 'Productivity',
    items: [
      { label: 'My Tasks', page: 'tasks', icon: ListTodo, perm: 'mod_tasks' },
      { label: 'My To-Do', page: 'todos', icon: ListChecks, perm: 'mod_todos' },
      { label: 'My Reminders', page: 'reminders', icon: AlarmClock, perm: 'mod_reminders' },
      { label: 'My Notes', page: 'notes', icon: StickyNote, perm: 'mod_notes' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Create Quotation', page: 'quote-new', icon: Plus, perm: 'quote_create' },
      { label: 'All Quotations', page: 'quotations', icon: FileText, perm: 'mod_quotations' },
    ],
  },
  { title: 'Insights', items: [{ label: 'My Performance', page: 'performance', icon: TrendingUp }] },
  { title: 'Me', items: [{ label: 'Leave', icon: CalendarOff }] },
]

export default function SalesLayout({ active, children }: { active: SalesNav; children: ReactNode }) {
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const { can, ready } = usePermissions()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [done, setDone] = useState<{ evolution: boolean; report: boolean }>({ evolution: false, report: false })
  const [shut, setShut] = useState<string[]>(FOLDABLE)

  const loadStatus = useCallback(async () => {
    const user = await getCurrentUser()
    if (!user) return
    const today = istDate()
    const [e, r] = await Promise.all([
      supabase.from('daily_evolution').select('id').eq('user_id', user.id).eq('evolution_date', today).limit(1),
      supabase.from('daily_reports').select('id').eq('user_id', user.id).eq('work_date', today).limit(1),
    ])
    setDone({ evolution: (e.data?.length ?? 0) > 0, report: (r.data?.length ?? 0) > 0 })
  }, [])

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      try {
        const p = await getUserProfile(user.id)
        setName(p?.full_name || user.email || '')
        if (p?.branch_id) {
          const { data } = await supabase.from('branches').select('name').eq('id', p.branch_id).single()
          setBranch(data?.name ?? '')
        }
      } catch {
        setName(user.email ?? '')
      }
    })()
  }, [])

  useEffect(() => {
    loadStatus()
    window.addEventListener('jk:saved', loadStatus)
    return () => window.removeEventListener('jk:saved', loadStatus)
  }, [loadStatus])

  useEffect(() => setOpen(false), [searchParams, pathname])

  // Only the modules this person is allowed to open
  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.perm || !ready || can(i.perm)),
  })).filter((s) => s.items.length > 0)

  // Whichever section holds the page you are on stays open
  useEffect(() => {
    const here = sections.find((s) => s.items.some((i) => i.page === active))?.title
    if (here) setShut((list) => list.filter((t) => t !== here))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready])

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => {
          const foldable = FOLDABLE.includes(section.title)
          const openSection = !foldable || !shut.includes(section.title)
          return (
          <div key={section.title}>
            {foldable ? (
              <button
                onClick={() =>
                  setShut((list) =>
                    list.includes(section.title) ? list.filter((t) => t !== section.title) : [...list, section.title],
                  )
                }
                aria-expanded={openSection}
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
              >
                <span className="flex-1 text-left">{section.title}</span>
                <ChevronDown size={14} className={`transition-transform ${openSection ? '' : '-rotate-90'}`} />
              </button>
            ) : (
              <p className="mb-2 px-3 text-xs text-gray-500">{section.title}</p>
            )}
            <ul className={`space-y-0.5 ${openSection ? '' : 'hidden'}`}>
              {section.items.map((item) => {
                const Icon = item.icon
                const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors'
                if (!item.page) {
                  return (
                    <li key={item.label}>
                      <span className={`${base} cursor-not-allowed text-gray-600`}>
                        <Icon size={17} />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                      </span>
                    </li>
                  )
                }
                const isActive = item.page === active
                const isDone = (item.page === 'evolution' && done.evolution) || (item.page === 'report' && done.report)
                return (
                  <li key={item.label}>
                    <Link
                      to={OWN_ROUTE[item.page] ?? `/sales?page=${item.page}`}
                      className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                        isActive
                          ? 'bg-orange-500/10 font-medium text-orange-400 shadow-[inset_3px_0_0_#f97316]'
                          : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      <Icon size={17} />
                      <span className="flex-1">
                        {item.label}
                        {item.hint && <span className="block text-[11px] font-normal text-gray-500">{item.hint}</span>}
                      </span>
                      {isDone && <CheckCircle2 size={16} className="text-green-500" aria-label="Submitted today" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
          )
        })}
      </div>

      <div className="border-t border-[#222] px-5 py-4">
        <p className="truncate text-sm font-medium">{name || 'Sales'}</p>
        <p className="text-xs text-orange-400">Sales{branch && ` · ${branch}`}</p>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="flex">
        <aside className="hidden w-60 shrink-0 border-r border-[#1f1f1f] bg-[#121212] lg:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-[#1f1f1f] bg-[#121212]">
              <div className="flex justify-end px-3 pt-3">
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              <div className="h-[calc(100%-52px)]">{sidebar}</div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <button
            onClick={() => setOpen(true)}
            className="mb-4 flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-gray-300 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} /> Menu
          </button>
          {children}
        </main>
      </div>
    </div>
  )
}