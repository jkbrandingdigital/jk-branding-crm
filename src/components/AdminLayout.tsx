import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, FileBarChart, ClipboardCheck, ListChecks, Target,
  Users, CalendarCheck, CalendarOff, Megaphone, Building2, Settings,
  Briefcase, UserCog, MonitorSmartphone, Truck, Palette, Wallet, Landmark,
  ChevronDown, Menu, X, Filter, Shuffle, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { getCurrentUser, getUserProfile } from '../lib/auth'

type NavItem = { label: string; path: string; icon: LucideIcon; ready: boolean }
type NavGroup = { key: string; label: string; icon: LucideIcon; items: NavItem[] }

// Departments grow here: add items to a group, add the route in App.tsx, set ready: true
const GROUPS: NavGroup[] = [
  {
    key: 'sales',
    label: 'Sales Department',
    icon: Briefcase,
    items: [
      { label: 'Leads', path: '/admin/leads', icon: Filter, ready: true },
      { label: 'Lead Assignment', path: '/admin/lead-assignment', icon: Shuffle, ready: true },
      { label: 'Sales Performance', path: '/admin/performance', icon: TrendingUp, ready: true },
      { label: 'Daily Reports', path: '/admin/reports', icon: FileBarChart, ready: true },
      { label: 'Evolution Forms', path: '/admin/evolution', icon: ClipboardCheck, ready: true },
      { label: 'Evolution Questions', path: '/admin/questions', icon: ListChecks, ready: true },
      { label: 'Sales Targets', path: '/admin/targets', icon: Target, ready: true },
    ],
  },
  {
    key: 'hr',
    label: 'HR Department',
    icon: UserCog,
    items: [
      { label: 'Employees', path: '/admin/employees', icon: Users, ready: true },
      { label: 'Attendance', path: '/admin/attendance', icon: CalendarCheck, ready: false },
      { label: 'Leave Requests', path: '/admin/leaves', icon: CalendarOff, ready: false },
    ],
  },
  { key: 'digital', label: 'Digital Department', icon: MonitorSmartphone, items: [] },
  { key: 'dispatch', label: 'Dispatch Zone', icon: Truck, items: [] },
  { key: 'designing', label: 'Designing Department', icon: Palette, items: [] },
  { key: 'finance', label: 'Finance Department', icon: Wallet, items: [] },
  {
    key: 'company',
    label: 'Company',
    icon: Landmark,
    items: [
      { label: 'Branches', path: '/admin/branches', icon: Building2, ready: false },
      { label: 'Announcements', path: '/admin/announcements', icon: Megaphone, ready: false },
      { label: 'Settings', path: '/admin/settings', icon: Settings, ready: false },
    ],
  },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [userName, setUserName] = useState('')

  const activeGroup = GROUPS.find((g) => g.items.some((i) => pathname.startsWith(i.path)))?.key ?? null
  const [open, setOpen] = useState<string | null>(activeGroup)

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

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-5 [scrollbar-color:#2a2a2a_transparent] [scrollbar-width:thin]">
        {/* Dashboard */}
        <Link to="/admin" className={linkCls(pathname === '/admin')}>
          <LayoutDashboard size={18} />
          Dashboard
        </Link>

        {/* Department groups */}
        {GROUPS.map((g) => {
          const GIcon = g.icon
          const soon = g.items.length === 0
          const isOpen = open === g.key
          const hasActive = g.key === activeGroup
          return (
            <div key={g.key}>
              <button
                onClick={() => !soon && setOpen(isOpen ? null : g.key)}
                disabled={soon}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  soon ? 'cursor-not-allowed text-gray-600' : hasActive ? 'text-white' : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                }`}
              >
                <GIcon size={18} className={hasActive ? 'text-orange-400' : ''} />
                <span className="flex-1">{g.label}</span>
                {soon ? (
                  <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
                ) : (
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                )}
              </button>

              {isOpen && !soon && (
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
                        <Link to={item.path} className={`${linkCls(pathname.startsWith(item.path))} py-1.5`}>
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
        <aside className="hidden w-64 shrink-0 border-r border-[#1f1f1f] bg-[#121212] lg:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
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