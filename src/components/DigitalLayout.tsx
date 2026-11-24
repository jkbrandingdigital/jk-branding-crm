import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Megaphone, FolderKanban, ListTodo, ListChecks, AlarmClock, StickyNote,
  QrCode, CalendarCheck, CalendarOff, Wallet, BookOpen, X, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { usePermissions } from '../lib/permissions'
import { BottomNav, MAIN_PAD, NavIcon, SIDEBAR_W, SidebarToggle, useCollapsedSidebar, type BottomItem } from './SidebarChrome'
import { getCurrentUser, getUserProfile } from '../lib/auth'
import MyDay from './myday/MyDay'
import { DM_HOME } from '../lib/dm'

/*
  The Digital team's side of the CRM.

  Their day is clients' social pages and the projects they run for those
  clients. Social media (/digital) is the same client-workspace screen
  anybody with the switch opens; the rest lives under /dm.
*/

type NavItem = { label: string; path: string; icon: LucideIcon; perm?: string }

const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', path: DM_HOME, icon: LayoutDashboard }] },
  {
    title: 'Clients',
    items: [
      { label: 'Social media', path: '/digital', icon: Megaphone, perm: 'mod_digital' },
      // No perm: a project lands on them through "Who is running it".
      { label: 'My projects', path: '/dm/projects', icon: FolderKanban },
    ],
  },
  {
    title: 'Work',
    items: [
      { label: 'Tasks', path: '/dm/tasks', icon: ListTodo, perm: 'mod_tasks' },
      { label: 'To-Do', path: '/dm/todos', icon: ListChecks, perm: 'mod_todos' },
      { label: 'Reminders', path: '/dm/reminders', icon: AlarmClock, perm: 'mod_reminders' },
      { label: 'Notes', path: '/dm/notes', icon: StickyNote, perm: 'mod_notes' },
    ],
  },
  {
    title: 'Me',
    items: [
      // Your own attendance carries no permission — it is what your pay is
      // worked out from.
      { label: 'Scan attendance', path: '/scan', icon: QrCode },
      { label: 'My attendance', path: '/dm/attendance', icon: CalendarCheck },
      { label: 'My leave', path: '/dm/my-leave', icon: CalendarOff },
      { label: 'My payslips', path: '/dm/my-payslips', icon: Wallet },
      { label: 'Policies', path: '/dm/policies', icon: BookOpen },
    ],
  },
]

export default function DigitalLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready } = usePermissions()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useCollapsedSidebar()
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState('')

  useEffect(() => {
    ;(async () => {
      const user = await getCurrentUser()
      if (!user) return
      try {
        const p = await getUserProfile(user.id)
        setName(p?.full_name || user.email || '')
        setDesignation(p?.designation ?? '')
      } catch {
        setName(user.email ?? '')
      }
    })()
  }, [])

  useEffect(() => setOpen(false), [pathname])

  const sections = NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.perm || (ready && can(i.perm))),
  })).filter((s) => s.items.length > 0)

  const isActive = (path: string) => (path === DM_HOME ? pathname === DM_HOME : pathname.startsWith(path))

  // The four along the bottom of a phone: home, clients, tasks, scan.
  const bottom: BottomItem[] = [
    { label: 'Home', icon: LayoutDashboard, to: DM_HOME, active: pathname === DM_HOME },
    ...(!ready || can('mod_digital') ? [{ label: 'Social', icon: Megaphone, to: '/digital', active: isActive('/digital') }] : []),
    { label: 'Projects', icon: FolderKanban, to: '/dm/projects', active: isActive('/dm/projects') },
    { label: 'Scan', icon: QrCode, to: '/scan', active: false },
  ]

  const sidebarFor = (narrow: boolean) => (
    <nav className="flex h-full flex-col">
      <SidebarToggle narrow={narrow} onToggle={() => setCollapsed(!narrow)} />
      <div className={`flex-1 overflow-y-auto py-3 ${narrow ? 'space-y-3 px-2' : 'space-y-6 px-3'}`}>
        {sections.map((section) => (
          <div key={section.title}>
            {narrow ? (
              <div className="mb-2 border-t border-[#222] first:border-0" />
            ) : (
              <p className="mb-2 px-3 text-xs text-gray-500">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const base = `flex items-center rounded-lg py-2 text-sm transition-colors ${narrow ? 'justify-center px-0' : 'gap-3 px-3'}`
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
        ))}
      </div>

      {narrow ? (
        <div className="border-t border-[#222] px-2 py-3" title={name || 'Digital'}>
          <p className="truncate text-center text-xs font-medium text-orange-400">{(name || 'Digital').trim().slice(0, 2).toUpperCase()}</p>
        </div>
      ) : (
        <div className="border-t border-[#222] px-5 py-4">
          <p className="truncate text-sm font-medium">{name || 'Digital'}</p>
          <p className="text-xs text-orange-400">Digital{designation && ` · ${designation}`}</p>
        </div>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="flex">
        <aside className={`hidden shrink-0 border-r border-[#1f1f1f] bg-[#121212] transition-[width] duration-200 lg:block ${collapsed ? SIDEBAR_W.narrow : SIDEBAR_W.wide}`}>
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
              <div className="h-[calc(100%-52px)]">{sidebarFor(false)}</div>
            </aside>
          </div>
        )}

        <main className={`min-w-0 flex-1 ${MAIN_PAD}`}>
          {/* My day on the home page — the greeting, attendance, leave. */}
          {pathname === DM_HOME && <MyDay />}
          {children}
        </main>
      </div>

      <BottomNav items={bottom} onMore={() => setOpen(true)} moreActive={open} />
    </div>
  )
}