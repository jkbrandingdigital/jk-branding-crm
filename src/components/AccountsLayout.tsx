import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Wallet, Package, FileText, CalendarOff, CalendarCheck, QrCode,
  BookOpen, Menu, X, type LucideIcon,
} from 'lucide-react'
import Header from './Header'
import { usePermissions } from '../lib/permissions'
import { NavIcon, SIDEBAR_W, SidebarToggle, useCollapsedSidebar } from './SidebarChrome'
import { getCurrentUser, getUserProfile } from '../lib/auth'

/*
  The accounts side of the CRM.

  What the printers are owed, and what has been paid. The register is
  the same one dispatch works from — a job work is a bill waiting to
  happen, and keeping two lists of the same orders is how the two
  stopped agreeing last time.

  The app does not move money. Payment goes out through the bank, and
  what is written here is the amount, the date, the mode and the
  reference, so the open figure is right.
*/

type NavItem = { label: string; path?: string; icon: LucideIcon; perm?: string }

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Accounts',
    items: [
      { label: 'Vendor Payments', path: '/accounts', icon: Wallet, perm: 'job_work_payment' },
      { label: 'Job Work Orders', path: '/accounts/job-works', icon: Package, perm: 'mod_job_works' },
      { label: 'Quotations', path: '/accounts/quotations', icon: FileText, perm: 'mod_quotations' },
    ],
  },
  {
    title: 'Me',
    items: [
      { label: 'Scan attendance', path: '/scan', icon: QrCode },
      { label: 'My attendance', path: '/accounts/attendance', icon: CalendarCheck },
      { label: 'My leave', path: '/accounts/my-leave', icon: CalendarOff },
      { label: 'My payslips', path: '/accounts/my-payslips', icon: Wallet },
      { label: 'Policies', path: '/accounts/policies', icon: BookOpen },
    ],
  },
]

export default function AccountsLayout({ children }: { children: ReactNode }) {
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

  const isActive = (path: string) =>
    path === '/accounts' ? pathname === '/accounts' : pathname.startsWith(path)

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
                const base = `flex items-center rounded-lg py-2 text-sm transition-colors ${
                  narrow ? 'justify-center px-0' : 'gap-3 px-3'
                }`
                if (!item.path) {
                  return (
                    <li key={item.label}>
                      <span className={`${base} cursor-not-allowed text-gray-600`} title={narrow ? `${item.label} — soon` : undefined}>
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
        ))}
      </div>

      {narrow ? (
        <div className="border-t border-[#222] px-2 py-3" title={name || 'Accounts'}>
          <p className="truncate text-center text-xs font-medium text-orange-400">
            {(name || 'Accounts').trim().slice(0, 2).toUpperCase()}
          </p>
        </div>
      ) : (
        <div className="border-t border-[#222] px-5 py-4">
          <p className="truncate text-sm font-medium">{name || 'Accounts'}</p>
          <p className="text-xs text-orange-400">Accounts{designation && ` · ${designation}`}</p>
        </div>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Header />
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