import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TrendingUp, LayoutDashboard, Filter, Users, CalendarCheck, CalendarOff, Menu, X, AlarmClock, ListTodo, ListChecks, StickyNote, ChevronDown, QrCode, type LucideIcon } from 'lucide-react'
import Header from './Header'
import { WorkTimerBar } from './tasks/WorkTimer'
import { usePermissions } from '../lib/permissions'
import { NavIcon, SIDEBAR_W, SidebarToggle, useCollapsedSidebar } from './SidebarChrome'

type Item = { label: string; path: string; icon: LucideIcon; ready: boolean; perm?: string }
type Group = { title: string; items: Item[] }

const GROUPS: Group[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/hr', icon: LayoutDashboard, ready: true }],
  },
  {
    title: 'Hiring',
    items: [{ label: 'Leads', path: '/hr/leads', icon: Filter, ready: true, perm: 'mod_leads' }],
  },
  {
    title: 'Productivity',
    items: [
      { label: 'Tasks', path: '/hr/tasks', icon: ListTodo, ready: true, perm: 'mod_tasks' },
      { label: 'To-Do', path: '/hr/todos', icon: ListChecks, ready: true, perm: 'mod_todos' },
      { label: 'Reminders', path: '/hr/reminders', icon: AlarmClock, ready: true, perm: 'mod_reminders' },
      { label: 'Notes', path: '/hr/notes', icon: StickyNote, ready: true, perm: 'mod_notes' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', path: '/hr/employees', icon: Users, ready: true, perm: 'mod_employees' },
      { label: 'Design performance', path: '/hr/design-performance', icon: TrendingUp, ready: true, perm: 'design_perf' },
      { label: 'Scan setup', path: '/hr/scan-setup', icon: QrCode, ready: true, perm: 'scan_setup' },
      { label: 'Scan attendance', path: '/scan', icon: QrCode, ready: true },
      { label: 'My attendance', path: '/hr/my-attendance', icon: CalendarCheck, ready: true },
      { label: 'Attendance', path: '/hr/attendance', icon: CalendarCheck, ready: false },
      { label: 'Leave Requests', path: '/hr/leaves', icon: CalendarOff, ready: false },
    ],
  },
]

// This section opens on a click; the rest stay in plain view
const FOLDABLE = ['Productivity']

export default function HrLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready: permsReady } = usePermissions()
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useCollapsedSidebar()
  const [shut, setShut] = useState<string[]>(FOLDABLE)

  // Whichever section holds the page you are on stays open
  useEffect(() => {
    const here = GROUPS.find((g) => g.items.some((i) => pathname === i.path || pathname.startsWith(i.path + '/')))?.title
    if (here) setShut((list) => list.filter((t) => t !== here))
  }, [pathname])

  const linkCls = (active: boolean, narrow: boolean) =>
    `flex items-center rounded-lg py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
      narrow ? 'justify-center px-0' : 'gap-3 px-3'
    } ${
      active ? 'bg-orange-500/10 font-medium text-orange-400 shadow-[inset_3px_0_0_#f97316]' : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
    }`

  const sidebarFor = (narrow: boolean) => (
    <nav className={`flex h-full flex-col pb-5 ${narrow ? 'px-2' : 'px-3'}`}>
      <SidebarToggle narrow={narrow} onToggle={() => setCollapsed(!narrow)} />
      <div className={`flex-1 overflow-y-auto pt-4 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin] ${narrow ? 'space-y-3' : 'space-y-5'}`}>
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || (permsReady && can(i.perm))) }))
          .filter((g) => g.items.length > 0)
          .map((g) => {
          const foldable = FOLDABLE.includes(g.title)
          const openSection = !foldable || !shut.includes(g.title)
          return (
          <div key={g.title}>
            {/* Narrowed there is no room for a heading, and a folded
                section would hide its icons with nothing left to say so.
                A rule between the groups carries what it can. */}
            {narrow ? (
              <div className="mb-2 border-t border-[#222] first:border-0" />
            ) : foldable ? (
              <button
                onClick={() =>
                  setShut((list) => (list.includes(g.title) ? list.filter((t) => t !== g.title) : [...list, g.title]))
                }
                aria-expanded={openSection}
                className="flex w-full items-center gap-2 rounded-lg px-3 pb-1.5 text-xs uppercase tracking-wide text-gray-600 transition-colors hover:text-gray-400"
              >
                <span className="flex-1 text-left">{g.title}</span>
                <ChevronDown size={14} className={`transition-transform ${openSection ? '' : '-rotate-90'}`} />
              </button>
            ) : (
              <p className="px-3 pb-1.5 text-xs uppercase tracking-wide text-gray-600">{g.title}</p>
            )}
            <ul className={`space-y-0.5 ${openSection || narrow ? '' : 'hidden'}`}>
              {g.items.map((item) => {
                const Icon = item.icon
                if (!item.ready) {
                  return (
                    <li key={item.path}>
                      <span
                        title={narrow ? `${item.label} — soon` : undefined}
                        className={`flex cursor-not-allowed items-center rounded-lg py-2 text-sm text-gray-600 ${
                          narrow ? 'justify-center px-0' : 'gap-3 px-3'
                        }`}
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
                const active = item.path === '/hr' ? pathname === '/hr' : pathname.startsWith(item.path)
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      onClick={() => setDrawer(false)}
                      title={narrow ? item.label : undefined}
                      className={linkCls(active, narrow)}
                    >
                      <NavIcon icon={Icon} narrow={narrow} active={active} />
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
      <div className={`border-t border-[#222] pt-4 ${narrow ? 'px-0 text-center' : 'px-2'}`}>
        <p className="text-xs text-orange-400">HR</p>
      </div>
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

        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-[#1f1f1f] bg-[#121212]">
              <div className="flex justify-end px-3 pt-3">
                <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close menu">
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
            onClick={() => setDrawer(true)}
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