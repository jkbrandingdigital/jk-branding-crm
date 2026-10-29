import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, UserPlus, FileBarChart, AlarmClock, StickyNote, ListChecks, QrCode, CalendarCheck, CalendarOff, Wallet, BookOpen, Menu, X, type LucideIcon } from 'lucide-react'
import Header from './Header'
import { supabase } from '../lib/supabase'
import { NavIcon, SIDEBAR_W, SidebarToggle, useCollapsedSidebar } from './SidebarChrome'
import { getCurrentUser, getUserProfile } from '../lib/auth'

export type ReceptionNav =
  | 'today' | 'add' | 'report'
  | 'reminders' | 'notes' | 'todos'
  | 'scan' | 'attendance' | 'my-leave' | 'my-payslips' | 'policies'

const ROUTE: Record<ReceptionNav, string> = {
  today: '/reception',
  add: '/reception/add',
  report: '/reception/report',
  reminders: '/reception/reminders',
  notes: '/reception/notes',
  todos: '/reception/todos',
  scan: '/scan',
  attendance: '/reception/attendance',
  'my-leave': '/reception/my-leave',
  'my-payslips': '/reception/my-payslips',
  policies: '/reception/policies',
}

type NavItem = { label: string; page: ReceptionNav; icon: LucideIcon; hint?: string }

// Reception's own screens carry no permission — the whole module is
// their daily job, and only a reception user ever mounts this layout.
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Reception',
    items: [
      { label: "Today's Visitors", page: 'today', icon: ClipboardList },
      { label: 'Add Visitor', page: 'add', icon: UserPlus },
      { label: 'Visitor Report', page: 'report', icon: FileBarChart },
    ],
  },
  {
    title: 'Productivity',
    items: [
      { label: 'My Reminders', page: 'reminders', icon: AlarmClock },
      { label: 'My Notes', page: 'notes', icon: StickyNote },
      { label: 'My To-Do', page: 'todos', icon: ListChecks },
    ],
  },
  {
    title: 'Me',
    items: [
      { label: 'Scan attendance', page: 'scan', icon: QrCode },
      { label: 'My attendance', page: 'attendance', icon: CalendarCheck },
      { label: 'My leave', page: 'my-leave', icon: CalendarOff },
      { label: 'My payslips', page: 'my-payslips', icon: Wallet },
      { label: 'Policies', page: 'policies', icon: BookOpen },
    ],
  },
]

export default function ReceptionLayout({ active, children }: { active: ReceptionNav; children: ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [branch, setBranch] = useState('')
  const [collapsed, setCollapsed] = useCollapsedSidebar()

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

  const sidebarFor = (narrow: boolean) => (
    <nav className="flex h-full flex-col">
      <SidebarToggle narrow={narrow} onToggle={() => setCollapsed(!narrow)} />
      <div className={`flex-1 overflow-y-auto py-3 ${narrow ? 'space-y-3 px-2' : 'space-y-6 px-3'}`}>
        {NAV.map((section) => (
          <div key={section.title}>
            {narrow ? (
              <div className="mb-2 border-t border-[#222] first:border-0" />
            ) : (
              <p className="mb-2 px-3 text-xs text-gray-500">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = item.page === active
                const base = `flex items-center rounded-lg py-2 text-sm transition-colors ${narrow ? 'justify-center px-0' : 'gap-3 px-3'}`
                return (
                  <li key={item.label}>
                    <Link
                      to={ROUTE[item.page]}
                      title={narrow ? item.label : undefined}
                      className={`${base} focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                        isActive
                          ? `bg-orange-500/10 font-medium text-orange-400 ${narrow ? '' : 'shadow-[inset_3px_0_0_#f97316]'}`
                          : 'text-gray-300 hover:bg-[#1a1a1a] hover:text-white'
                      }`}
                    >
                      <NavIcon icon={Icon} narrow={narrow} active={isActive} />
                      {!narrow && (
                        <span className="flex-1">
                          {item.label}
                          {item.hint && <span className="block text-[11px] font-normal text-gray-500">{item.hint}</span>}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {narrow ? (
        <div className="border-t border-[#222] px-2 py-3" title={name || 'Reception'}>
          <p className="truncate text-center text-xs font-medium text-orange-400">{(name || 'RE').trim().slice(0, 2).toUpperCase()}</p>
        </div>
      ) : (
        <div className="border-t border-[#222] px-5 py-4">
          <p className="truncate text-sm font-medium">{name || 'Reception'}</p>
          <p className="text-xs text-orange-400">Reception{branch && ` · ${branch}`}</p>
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

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <button onClick={() => setOpen(true)} className="mb-4 flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2 text-sm text-gray-300 lg:hidden" aria-label="Open menu">
            <Menu size={18} /> Menu
          </button>
          {children}
        </main>
      </div>
    </div>
  )
}