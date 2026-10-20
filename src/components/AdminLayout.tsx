import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, FileBarChart, ClipboardCheck, ListChecks, Target,
  Users, CalendarCheck, CalendarOff, Megaphone, Building2, Settings,
  Briefcase, UserCog, MonitorSmartphone, Truck, Palette, Wallet, Landmark,
  Activity, Cake, FolderKanban, Timer, ChevronDown, Menu, X, Filter, Shuffle, AlarmClock, ListTodo, ListChecks as TodoIcon, StickyNote, FileText, Plus, DatabaseBackup, Printer, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { WorkTimerBar } from './tasks/WorkTimer'
import { usePermissions } from '../lib/permissions'
import { getCurrentUser, getUserProfile } from '../lib/auth'

type NavItem = { label: string; path: string; icon: LucideIcon; ready: boolean; perm?: string }
type NavGroup = { key: string; label: string; icon: LucideIcon; items: NavItem[] }

/*
  One colour for every department icon.

  A colour each was tried and it read as decoration: nine hues down one
  column, none of them meaning anything, so the eye had nothing to rest
  on. One amber across all of them keeps the icons warm and visible and
  leaves orange free to mean the one thing it should — you are here.
*/
const NAV_TINT = '#f97316'

// Departments grow here: add items to a group, add the route in App.tsx, set ready: true
//
// Every ready item needs a `perm`. Without one it would show to every sub
// admin, which is how HR and Company settings used to leak.
const GROUPS: NavGroup[] = [
  {
    key: 'sales',
    label: 'Sales Department',
    icon: Megaphone,
    items: [
      { label: 'Leads', path: '/admin/leads', icon: Filter, ready: true, perm: 'mod_leads' },
      { label: 'Lead Assignment', path: '/admin/lead-assignment', icon: Shuffle, ready: true, perm: 'mod_lead_assignment' },
      { label: 'Sales Performance', path: '/admin/performance', icon: TrendingUp, ready: true, perm: 'mod_performance' },
      { label: 'Daily Reports', path: '/admin/reports', icon: FileBarChart, ready: true, perm: 'mod_reports' },
      { label: 'Evolution Forms', path: '/admin/evolution', icon: ClipboardCheck, ready: true, perm: 'mod_evolution' },
      { label: 'Evolution Questions', path: '/admin/questions', icon: ListChecks, ready: true, perm: 'mod_questions' },
      { label: 'Sales Targets', path: '/admin/targets', icon: Target, ready: true, perm: 'mod_targets' },
    ],
  },
  {
    key: 'hr',
    label: 'HR Department',
    icon: UserCog,
    items: [
      { label: 'Employees', path: '/admin/employees', icon: Users, ready: true, perm: 'mod_employees' },
      { label: 'Attendance', path: '/admin/attendance', icon: CalendarCheck, ready: false },
      { label: 'Leave Requests', path: '/admin/leaves', icon: CalendarOff, ready: false },
    ],
  },
  {
    key: 'productivity',
    label: 'Productivity',
    icon: Timer,
    items: [
      { label: 'Tasks', path: '/admin/tasks', icon: ListTodo, ready: true, perm: 'mod_tasks' },
      { label: 'Task Settings', path: '/admin/tasks/settings', icon: Settings, ready: true, perm: 'task_settings' },
      { label: 'To-Do', path: '/admin/todos', icon: TodoIcon, ready: true, perm: 'mod_todos' },
      { label: 'Reminders', path: '/admin/reminders', icon: AlarmClock, ready: true, perm: 'mod_reminders' },
      { label: 'Notes', path: '/admin/notes', icon: StickyNote, ready: true, perm: 'mod_notes' },
    ],
  },
  {
    key: 'business',
    label: 'Business',
    icon: Briefcase,
    items: [
      { label: 'Create Quotation', path: '/admin/quotations/new', icon: Plus, ready: true, perm: 'quote_create' },
      { label: 'All Quotations', path: '/admin/quotations', icon: FileText, ready: true, perm: 'mod_quotations' },
      { label: 'Customers', path: '/admin/customers', icon: Users, ready: true, perm: 'mod_customers' },
      // A project is what a client bought, not a thing the design team
      // owns. It sits beside the customer and the quotation it came from.
      { label: 'Projects', path: '/admin/projects', icon: FolderKanban, ready: true, perm: 'mod_projects' },
      { label: 'Quotation Settings', path: '/admin/quotations/settings', icon: Settings, ready: true, perm: 'quote_settings' },
    ],
  },
  { key: 'digital', label: 'Digital Department', icon: MonitorSmartphone, items: [] },
  { key: 'dispatch', label: 'Dispatch Zone', icon: Truck, items: [] },
  {
    key: 'designing',
    label: 'Designing Department',
    icon: Palette,
    items: [
      { label: 'Team activity', path: '/admin/activity', icon: Activity, ready: true, perm: 'timer_view_all' },
      { label: 'Design performance', path: '/admin/design-performance', icon: TrendingUp, ready: true, perm: 'design_perf' },
      { label: 'Work Types', path: '/admin/work-types', icon: Timer, ready: true, perm: 'work_types_edit' },
      { label: 'Printing Media', path: '/admin/print', icon: Printer, ready: true, perm: 'mod_print_jobs' },
    ],
  },
  { key: 'finance', label: 'Finance Department', icon: Wallet, items: [] },
  {
    key: 'company',
    label: 'Company',
    icon: Landmark,
    items: [
      { label: 'Branches', path: '/admin/branches', icon: Building2, ready: false },
      { label: 'Announcements', path: '/admin/announcements', icon: Megaphone, ready: false },
      { label: 'General Settings', path: '/admin/settings', icon: Settings, ready: true, perm: 'mod_settings' },
      { label: 'Greetings', path: '/admin/greetings', icon: Cake, ready: true, perm: 'mod_customers' },
      { label: 'Backup', path: '/admin/backup', icon: DatabaseBackup, ready: true, perm: 'mod_backup' },
    ],
  },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready: permsReady, isSuper } = usePermissions()
  const [drawer, setDrawer] = useState(false)
  const [userName, setUserName] = useState('')

  // Only the closest match lights up: /admin/quotations/new must not also
  // light up /admin/quotations
  const bestMatch = GROUPS.flatMap((g) => g.items)
    .filter((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? null
  const isActive = (path: string) => path === bestMatch

  const activeGroup = GROUPS.find((g) => g.items.some((i) => isActive(i.path)))?.key ?? null
  const [open, setOpen] = useState<string | null>(activeGroup)

  /*
    Narrowed sidebar.

    Most of the day a person is reading a board, not the menu, and 256px
    of department names is 256px the board does not get. Narrowed, the
    menu keeps only its icons; pressing one opens the sidebar again on
    that department, so nothing is reached by memory alone.

    The choice is remembered per browser — somebody who works narrow
    should not have to say so every morning.
  */
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('jk_sidebar_collapsed') === '1' } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem('jk_sidebar_collapsed', collapsed ? '1' : '0') } catch { /* private window */ }
  }, [collapsed])

  useEffect(() => {
    ;(async () => {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const profile = await getUserProfile(user.id)
        setUserName(profile?.full_name || user.email || '')
      } catch {
        /* sidebar just shows the role */
      }
    })()
  }, [])

  // Close mobile drawer and open the current page's group on navigation
  useEffect(() => {
    setDrawer(false)
    if (activeGroup) setOpen(activeGroup)
  }, [pathname, activeGroup])

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
      active ? 'bg-orange-500/10 font-medium text-orange-400 shadow-[inset_3px_0_0_#f97316]' : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
    }`

  // What this person may see. Nothing is shown until the rights have
  // arrived, so a sub admin never catches a glimpse of someone else's
  // department. "Soon" placeholders are for the super admin only.
  const visible = permsReady
    ? GROUPS
        .map((g) => ({ ...g, items: g.items.filter((i) => (i.ready ? i.perm && can(i.perm) : isSuper)) }))
        .filter((g) => g.items.length > 0 || isSuper)
    : []

  const sidebarFor = (narrow: boolean) => (
    <nav className="flex h-full flex-col">
      {/* Narrow or wide. Only on the desktop rail — the mobile drawer is
          already a thing you open and close. */}
      {/* The same button in both states, in the same place. A pair of
          arrows that flip direction asks people to read them; a menu
          icon is one thing everybody already knows, and leaving it put
          means the way back is where the way out was. */}
      <div className={`hidden pt-3 lg:flex ${narrow ? 'justify-center px-2' : 'justify-end px-3'}`}>
        <button
          onClick={() => setCollapsed(!narrow)}
          title={narrow ? 'Open the menu' : 'Narrow the menu'}
          aria-label={narrow ? 'Open the menu' : 'Narrow the menu'}
          aria-expanded={!narrow}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-[#1a1a1a] hover:text-white"
        >
          <Menu size={20} />
        </button>
      </div>

      <div
        className={`flex-1 space-y-1 overflow-y-auto py-3 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin] ${
          narrow ? 'px-2' : 'px-3'
        }`}
      >
        {/* Dashboard — company-wide numbers, so super admin only */}
        {isSuper && (
          <Link
            to="/admin"
            title={narrow ? 'Dashboard' : undefined}
            className={`${linkCls(pathname === '/admin')} ${narrow ? 'justify-center px-0' : ''}`}
          >
            <span
              className={`grid shrink-0 place-items-center rounded-lg ${narrow ? 'h-9 w-9' : 'h-8 w-8'}`}
              style={
                pathname === '/admin'
                  ? { background: 'rgba(249,115,22,0.15)', color: '#fb923c' }
                  : { background: `${NAV_TINT}1f`, color: NAV_TINT }
              }
            >
              <LayoutDashboard size={narrow ? 20 : 18} strokeWidth={2} />
            </span>
            {!narrow && 'Dashboard'}
          </Link>
        )}

        {/* Department groups */}
        {visible.map((g) => {
          const GIcon = g.icon
          const soon = g.items.length === 0
          const isOpen = open === g.key
          const hasActive = g.key === activeGroup
          return (
            <div key={g.key}>
              <button
                onClick={() => {
                  if (soon) return
                  // Narrow: the icon is the way back. Opening the menu on
                  // the department you pressed beats opening it on
                  // whatever happened to be open last.
                  if (narrow) { setCollapsed(false); setOpen(g.key); return }
                  setOpen(isOpen ? null : g.key)
                }}
                disabled={soon}
                aria-expanded={narrow ? undefined : isOpen}
                title={narrow ? g.label : undefined}
                className={`flex w-full items-center rounded-lg py-2 text-left text-sm transition-colors ${
                  narrow ? 'justify-center px-0' : 'gap-3 px-3'
                } ${
                  soon ? 'cursor-not-allowed text-gray-600' : hasActive ? 'text-white' : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                {/* The icon sits in its own tinted square. On its own a
                    line icon against a dark panel is thin and easy to
                    miss; the square gives it a body, and the department's
                    colour gives it a name you can aim at. */}
                <span
                  className={`grid shrink-0 place-items-center rounded-lg transition-colors ${
                    narrow ? 'h-9 w-9' : 'h-8 w-8'
                  }`}
                  style={{
                    background: hasActive ? 'rgba(249,115,22,0.15)' : `${NAV_TINT}1f`,
                    color: hasActive ? '#fb923c' : soon ? '#4b5563' : NAV_TINT,
                  }}
                >
                  <GIcon size={narrow ? 20 : 18} strokeWidth={2} />
                </span>
                {!narrow && (
                  <>
                    <span className="flex-1">{g.label}</span>
                    {soon ? (
                      <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                    ) : (
                      <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    )}
                  </>
                )}
              </button>

              {isOpen && !soon && !narrow && (
                <ul className="mb-1 ml-5 mt-0.5 space-y-0.5 border-l border-[#232323] pl-2">
                  {g.items.map((item) => {
                    const Icon = item.icon
                    if (!item.ready) {
                      return (
                        <li key={item.path}>
                          <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-gray-600">
                            <Icon size={16} />
                            <span className="flex-1">{item.label}</span>
                            <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                          </span>
                        </li>
                      )
                    }
                    return (
                      <li key={item.path}>
                        <Link to={item.path} className={`${linkCls(isActive(item.path))} py-1.5`}>
                          <Icon size={16} />
                          {item.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {narrow ? (
        <div className="border-t border-[#222] px-2 py-3" title={userName || undefined}>
          <p className="truncate text-center text-xs font-medium text-orange-400">
            {(userName || 'Admin').trim().slice(0, 2).toUpperCase()}
          </p>
        </div>
      ) : (
        <div className="border-t border-[#222] px-5 py-4">
          <p className="truncate text-sm font-medium">{userName || (isSuper ? 'Super Admin' : 'Sub Admin')}</p>
          <p className="text-xs text-orange-400">{isSuper ? 'Super Admin' : 'Sub Admin'}</p>
        </div>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <WorkTimerBar />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={`hidden shrink-0 border-r border-[#1f1f1f] bg-[#121212] transition-[width] duration-200 lg:block ${
            collapsed ? 'w-16' : 'w-64'
          }`}
        >
          <div className="sticky top-0 h-screen">{sidebarFor(collapsed)}</div>
        </aside>

        {/* Mobile drawer */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-[#1f1f1f] bg-[#121212]">
              <div className="flex justify-end px-3 pt-3">
                <button onClick={() => setDrawer(false)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              {/* The drawer is already something you open and close, so it
                  is never narrowed. */}
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