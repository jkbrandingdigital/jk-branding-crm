import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileBarChart, ClipboardCheck, Users, CalendarCheck, CalendarOff,
  Building2, Target, Megaphone, Settings, Menu, X, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { getCurrentUser, getUserProfile } from '../lib/auth'

type NavItem = { label: string; path: string; icon: LucideIcon; ready: boolean }

// When a page is built, add its route in App.tsx and set ready: true
const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', path: '/admin', icon: LayoutDashboard, ready: true }],
  },
  {
    title: 'Sales',
    items: [
      { label: 'Daily Reports', path: '/admin/reports', icon: FileBarChart, ready: false },
      { label: 'Evolution Forms', path: '/admin/evolution', icon: ClipboardCheck, ready: false },
      { label: 'Sales Targets', path: '/admin/targets', icon: Target, ready: false },
    ],
  },
  {
    title: 'HR',
    items: [
      { label: 'Employees', path: '/admin/employees', icon: Users, ready: false },
      { label: 'Attendance', path: '/admin/attendance', icon: CalendarCheck, ready: false },
      { label: 'Leave Requests', path: '/admin/leaves', icon: CalendarOff, ready: false },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Branches', path: '/admin/branches', icon: Building2, ready: false },
      { label: 'Announcements', path: '/admin/announcements', icon: Megaphone, ready: false },
      { label: 'Settings', path: '/admin/settings', icon: Settings, ready: false },
    ],
  },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [userName, setUserName] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const profile = await getUserProfile(user.id)
        setUserName(profile?.full_name || user.email || '')
      } catch {
        // Profile missing is fine — sidebar just shows the role
      }
    })()
  }, [])

  // Close mobile drawer on navigation
  useEffect(() => setOpen(false), [pathname])

  const isActive = (path: string) => (path === '/admin' ? pathname === '/admin' : pathname.startsWith(path))

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-3 text-xs text-gray-500">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                const base = 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors'
                if (!item.ready) {
                  return (
                    <li key={item.path}>
                      <span className={`${base} cursor-not-allowed text-gray-600`} title="Coming soon">
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
                        active
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
        <p className="truncate text-sm font-medium">{userName || 'Super Admin'}</p>
        <p className="text-xs text-orange-400">Super Admin</p>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-[#1f1f1f] bg-[#121212] lg:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-[#1f1f1f] bg-[#121212]">
              <div className="flex justify-end px-3 pt-3">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-gray-400 hover:text-white"
                  aria-label="Close menu"
                >
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