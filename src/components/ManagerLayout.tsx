import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity, Cake, FolderKanban, Users2, LayoutDashboard, TrendingUp, Target, FileBarChart, CalendarCheck, CalendarOff, Menu, X, Filter, AlarmClock, ListTodo, ListChecks, StickyNote, FileText, Plus, ChevronDown, QrCode, Wallet, BookOpen, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { WorkTimerBar } from './tasks/WorkTimer'
import { supabase } from '../lib/supabase'
import { usePermissions } from '../lib/permissions'
import { NavIcon, SIDEBAR_W, SidebarToggle, useCollapsedSidebar } from './SidebarChrome'
import { getCurrentUser, getUserProfile } from '../lib/auth'

type NavItem = { label: string; path: string; icon: LucideIcon; ready: boolean; perm?: string }

// These sections open on a click; the rest stay in plain view
const FOLDABLE = ['Productivity', 'Business']

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', path: '/manager', icon: LayoutDashboard, ready: true }] },
  {
    title: 'Sales',
    items: [
      { label: 'Leads', path: '/manager/leads', icon: Filter, ready: true, perm: 'mod_leads' },
      { label: 'Sales Performance', path: '/manager/performance', icon: TrendingUp, ready: true, perm: 'mod_performance' },
      { label: 'Team Targets', path: '/manager/targets', icon: Target, ready: true, perm: 'mod_targets' },
      { label: 'Daily Reports', path: '/manager/reports', icon: FileBarChart, ready: true, perm: 'mod_reports' },
    ],
  },
  {
    title: 'Productivity',
    items: [
      { label: 'Projects', path: '/manager/projects', icon: FolderKanban, ready: true, perm: 'mod_projects' },
      { label: 'Tasks', path: '/manager/tasks', icon: ListTodo, ready: true, perm: 'mod_tasks' },
      { label: 'Team activity', path: '/manager/activity', icon: Activity, ready: true, perm: 'timer_view_all' },
      { label: 'To-Do', path: '/manager/todos', icon: ListChecks, ready: true, perm: 'mod_todos' },
      { label: 'Reminders', path: '/manager/reminders', icon: AlarmClock, ready: true, perm: 'mod_reminders' },
      { label: 'Notes', path: '/manager/notes', icon: StickyNote, ready: true, perm: 'mod_notes' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Create Quotation', path: '/manager/quotations/new', icon: Plus, ready: true, perm: 'quote_create' },
      { label: 'Customers', path: '/manager/customers', icon: Users2, ready: true, perm: 'mod_customers' },
      { label: 'Greetings', path: '/manager/greetings', icon: Cake, ready: true, perm: 'mod_customers' },
      { label: 'All Quotations', path: '/manager/quotations', icon: FileText, ready: true, perm: 'mod_quotations' },
    ],
  },
  {
    title: 'Team',
    items: [
      { label: 'Attendance', path: '/manager/attendance', icon: CalendarCheck, ready: true, perm: 'attendance_view_branch' },
      { label: 'Leave Requests', path: '/manager/leaves', icon: CalendarOff, ready: false },
      
    ],
  },
  // Its own section, not inside Team. Team > Attendance is everybody's
  // register; this is the manager's own days. Side by side under one
  // heading they would read as the same thing.
    {
    title: 'Me',
    items: [
      { label: 'Scan attendance', path: '/scan', icon: QrCode, ready: true },
      { label: 'My attendance', path: '/manager/my-attendance', icon: CalendarCheck, ready: true },
      { label: 'My leave', path: '/manager/my-leave', icon: CalendarOff, ready: true },
      { label: 'My payslips', path: '/manager/my-payslips', icon: Wallet, ready: true },
      { label: 'Policies', path: '/manager/policies', icon: BookOpen, ready: true },
    ],
  },
]

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready: permsReady } = usePermissions()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useCollapsedSidebar()
  const [shut, setShut] = useState<string[]>(FOLDABLE)
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')

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

  useEffect(() => setOpen(false), [pathname])

  // Only the closest match lights up, so a "new" page does not also light up its list
  const bestMatch = NAV_SECTIONS.flatMap((s) => s.items)
    .filter((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? null
  const isActive = (path: string) => (path === '/manager' ? pathname === '/manager' : path === bestMatch)

  // Only the modules this person is allowed to open
  const sections = NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.perm || (permsReady && can(i.perm))),
  })).filter((s) => s.items.length > 0)

  // Whichever section holds the page you are on stays open
  useEffect(() => {
    const here = sections.find((s) => s.items.some((i) => i.path && isActive(i.path)))?.title
    if (here) setShut((list) => list.filter((t) => t !== here))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, permsReady])

  const sidebarFor = (narrow: boolean) => (
    <nav className="flex h-full flex-col">
      <SidebarToggle narrow={narrow} onToggle={() => setCollapsed(!narrow)} />
      <div className={`flex-1 overflow-y-auto py-3 ${narrow ? 'space-y-3 px-2' : 'space-y-6 px-3'}`}>
        {sections.map((section) => {
          const foldable = FOLDABLE.includes(section.title)
          const openSection = !foldable || !shut.includes(section.title)
          return (
          <div key={section.title}>
            {/* Narrowed there is no room for a heading, and a folded
                section would hide its icons with nothing left to say so.
                A rule between the groups carries what it can. */}
            {narrow ? (
              <div className="mb-2 border-t border-[#222] first:border-0" />
            ) : foldable ? (
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
            <ul className={`space-y-0.5 ${openSection || narrow ? '' : 'hidden'}`}>
              {section.items.map((item) => {
                const Icon = item.icon
                const base = `flex items-center rounded-lg py-2 text-sm transition-colors ${
                  narrow ? 'justify-center px-0' : 'gap-3 px-3'
                }`
                if (!item.ready) {
                  return (
                    <li key={item.path}>
                      <span
                        className={`${base} cursor-not-allowed text-gray-600`}
                        title={narrow ? `${item.label} — soon` : undefined}
                      >
                        <NavIcon icon={Icon} narrow={narrow} muted />
                        {!narrow && (
                          <>
                            <span className="flex-1">{item.label}</span>
                            <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                          </>
                        )}
                      </span>
                    </li>
                  )
                }
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      title={narrow ? item.label : undefined}
                      className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                        isActive(item.path)
                        ? `bg-orange-500/10 font-medium text-orange-400 ${narrow ? '' : 'shadow-[inset_3px_0_0_#f97316]'}`
                          : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      <NavIcon icon={Icon} narrow={narrow} active={isActive(item.path)} />
                      {!narrow && item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
          )
        })}
      </div>

      {narrow ? (
        <div className="border-t border-[#222] px-2 py-3" title={name || 'Branch Manager'}>
          <p className="truncate text-center text-xs font-medium text-orange-400">
            {(name || 'Branch Manager').trim().slice(0, 2).toUpperCase()}
          </p>
        </div>
      ) : (
        <div className="border-t border-[#222] px-5 py-4">
          <p className="truncate text-sm font-medium">{name || 'Branch Manager'}</p>
          <p className="text-xs text-orange-400">Branch Manager{branch && ` · ${branch}`}</p>
        </div>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <WorkTimerBar />
      <div className="flex">
        <aside
          className={`hidden shrink-0 border-r border-[#1f1f1f] bg-[#121212] transition-[width] duration-200 lg:block ${
            collapsed ? SIDEBAR_W.narrow : SIDEBAR_W.wide
          }`}
        >
          <div className="sticky top-0 h-screen">{sidebarFor(collapsed)}</div>
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
              {/* The drawer is already something you open and close, so
                  it is never narrowed. */}
              <div className="h-[calc(100%-52px)]">{sidebarFor(false)}</div>
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