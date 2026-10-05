import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ListTodo, AlarmClock, CalendarOff, Menu, X, type LucideIcon } from 'lucide-react'
import Header from './Header'
import { usePermissions } from '../lib/permissions'
import { getCurrentUser, getUserProfile } from '../lib/auth'

type NavItem = { label: string; path?: string; icon: LucideIcon; perm?: string }

const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [{ label: 'Dashboard', path: '/design', icon: LayoutDashboard }] },
  {
    title: 'Work',
    items: [
      { label: 'Tasks', path: '/design/tasks', icon: ListTodo, perm: 'mod_tasks' },
      { label: 'Reminders', path: '/design/reminders', icon: AlarmClock, perm: 'mod_reminders' },
    ],
  },
  { title: 'Me', items: [{ label: 'Leave', icon: CalendarOff }] },
]

export default function DesignLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { can, ready } = usePermissions()
  const [open, setOpen] = useState(false)
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
    items: s.items.filter((i) => !i.perm || !ready || can(i.perm)),
  })).filter((s) => s.items.length > 0)

  const isActive = (path: string) => (path === '/design' ? pathname === '/design' : pathname.startsWith(path))

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-xs text-gray-500">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors'
                if (!item.path) {
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
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                        isActive(item.path)
                          ? 'bg-orange-500/10 font-medium text-orange-400 shadow-[inset_3px_0_0_#f97316]'
                          : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      <Icon size={17} />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#222] px-5 py-4">
        <p className="truncate text-sm font-medium">{name || 'Design Team'}</p>
        <p className="text-xs text-orange-400">Design Team{designation && ` · ${designation}`}</p>
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