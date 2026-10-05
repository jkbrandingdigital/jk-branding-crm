import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Filter, Users, CalendarCheck, CalendarOff, Menu, X, AlarmClock, ListTodo, type LucideIcon } from 'lucide-react'
import Header from './Header'
import { usePermissions } from '../lib/permissions'

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
      { label: 'Reminders', path: '/hr/reminders', icon: AlarmClock, ready: true, perm: 'mod_reminders' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Employees', path: '/hr/employees', icon: Users, ready: true, perm: 'mod_employees' },
      { label: 'Attendance', path: '/hr/attendance', icon: CalendarCheck, ready: false },
      { label: 'Leave Requests', path: '/hr/leaves', icon: CalendarOff, ready: false },
    ],
  },
]

export default function HrLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready: permsReady } = usePermissions()
  const [drawer, setDrawer] = useState(false)

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
      active ? 'bg-orange-500/10 font-medium text-orange-400 shadow-[inset_3px_0_0_#f97316]' : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
    }`

  const sidebar = (
    <nav className="flex h-full flex-col px-3 py-5">
      <div className="flex-1 space-y-5 overflow-y-auto [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
        {GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || !permsReady || can(i.perm)) }))
          .filter((g) => g.items.length > 0)
          .map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-xs uppercase tracking-wide text-gray-600">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon
                if (!item.ready) {
                  return (
                    <li key={item.path}>
                      <span className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600">
                        <Icon size={18} />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                      </span>
                    </li>
                  )
                }
                const active = item.path === '/hr' ? pathname === '/hr' : pathname.startsWith(item.path)
                return (
                  <li key={item.path}>
                    <Link to={item.path} onClick={() => setDrawer(false)} className={linkCls(active)}>
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#222] px-2 pt-4">
        <p className="text-xs text-orange-400">HR</p>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
      <div className="flex">
        <aside className="hidden w-64 shrink-0 border-r border-[#1f1f1f] bg-[#121212] lg:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
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
              <div className="h-[calc(100%-52px)]">{sidebar}</div>
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