import { useState } from 'react'
import {
  Filter, Target, FileBarChart, ClipboardCheck, Users, CalendarCheck, CalendarOff,
  Building2, Megaphone, Share2, Tag, TrendingUp, Shuffle, Settings,
  type LucideIcon,
} from 'lucide-react'
import { signIn } from '../lib/auth'

type Node = { label: string; icon: LucideIcon; angle: number; soon?: boolean }

// angle in degrees, 0 = right, going clockwise
const NODES: Node[] = [
  { label: 'Leads', icon: Filter, angle: -90 },
  { label: 'Lead Assignment', icon: Shuffle, angle: -64 },
  { label: 'Labels', icon: Tag, angle: -38 },
  { label: 'Facebook Ads', icon: Share2, angle: -12 },
  { label: 'Targets', icon: Target, angle: 14 },
  { label: 'Performance', icon: TrendingUp, angle: 40 },
  { label: 'Daily Reports', icon: FileBarChart, angle: 66 },
  { label: 'Evolution', icon: ClipboardCheck, angle: 92 },
  { label: 'Employees', icon: Users, angle: 118 },
  { label: 'Attendance', icon: CalendarCheck, angle: 144, soon: true },
  { label: 'Leave', icon: CalendarOff, angle: 170, soon: true },
  { label: 'Branches', icon: Building2, angle: 196, soon: true },
  { label: 'Announcements', icon: Megaphone, angle: 222, soon: true },
  { label: 'Settings', icon: Settings, angle: 248 },
]

const R = 190 // how far the icons sit from the centre
const pos = (angle: number) => ({
  x: Math.cos((angle * Math.PI) / 180) * R,
  y: Math.sin((angle * Math.PI) / 180) * R,
})

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-[#0f0f0f] lg:grid-cols-2">
      <style>{`
        @keyframes jk-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        @keyframes jk-pulse { 0% { transform: scale(.85); opacity:.55 } 100% { transform: scale(1.9); opacity:0 } }
        @keyframes jk-dash { to { stroke-dashoffset: -60 } }
        @keyframes jk-spin { to { transform: rotate(360deg) } }
        @media (prefers-reduced-motion: reduce) {
          .jk-node, .jk-ring, .jk-line, .jk-orbit { animation: none !important }
        }
      `}</style>

      {/* Left: the system at a glance */}
      <div className="relative hidden items-center justify-center overflow-hidden border-r border-[#1b1b1b] bg-[#121212] lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(60% 50% at 50% 45%, rgba(249,115,22,.10), transparent 70%)' }}
        />

        <div className="relative h-[560px] w-[560px]">
          {/* connecting lines */}
          <svg viewBox="-280 -280 560 560" className="absolute inset-0 h-full w-full">
            <circle className="jk-orbit" r={R} fill="none" stroke="#242424" strokeWidth="1" strokeDasharray="3 7"
              style={{ animation: 'jk-spin 90s linear infinite', transformOrigin: 'center' }} />
            {NODES.map((n, i) => {
              const { x, y } = pos(n.angle)
              return (
                <line
                  key={n.label}
                  className="jk-line"
                  x1="0" y1="0" x2={x} y2={y}
                  stroke="#f97316"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                  strokeDasharray="4 8"
                  style={{ animation: `jk-dash ${7 + (i % 5)}s linear infinite` }}
                />
              )
            })}
          </svg>

          {/* centre */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="jk-ring absolute inset-0 rounded-full border border-orange-500/40"
              style={{ animation: 'jk-pulse 3.2s ease-out infinite' }} />
            <span className="jk-ring absolute inset-0 rounded-full border border-orange-500/30"
              style={{ animation: 'jk-pulse 3.2s ease-out 1.6s infinite' }} />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#161616] shadow-[0_0_40px_rgba(249,115,22,.15)]">
              <img src="/jklogoicon.png" alt="JK Branding" className="h-12 w-auto" />
            </div>
          </div>

          {/* modules */}
          {NODES.map((n, i) => {
            const { x, y } = pos(n.angle)
            const Icon = n.icon
            return (
              <div
                key={n.label}
                className="jk-node absolute left-1/2 top-1/2 flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
                style={{ marginLeft: x, marginTop: y, animation: `jk-float ${4 + (i % 4)}s ease-in-out ${i * 0.25}s infinite` }}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border ${n.soon ? 'border-[#242424] bg-[#151515] text-gray-600' : 'border-orange-500/30 bg-[#1a1512] text-orange-400'}`}>
                  <Icon size={19} />
                </div>
                <span className={`text-center text-[11px] leading-tight ${n.soon ? 'text-gray-600' : 'text-gray-400'}`}>{n.label}</span>
              </div>
            )
          })}
        </div>

        <p className="absolute bottom-8 text-xs text-gray-600">One system for leads, targets and the team.</p>
      </div>

      {/* Right: sign in */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <img src="/jklogoicon.png" alt="JK Branding" className="h-14 w-auto lg:hidden" />
            <h1 className="mt-3 text-3xl font-bold text-white lg:mt-0">JK Branding CRM</h1>
            <p className="mt-1 text-xs font-medium text-orange-400">Vision 2036 : Agency to Unicorn</p>
            <p className="mt-1 text-[11px] font-medium tracking-wide text-orange-400/80">
              THINK BIG | BUILD SYSTEMS | CREATE IMPACT | SCALE GLOBALLY
            </p>
            <p className="mt-3 text-gray-400">Sign in to continue to your dashboard</p>
          </div>

          <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-8">
            {error && (
              <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@jkbrandingindia.com"
                  required
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-white transition-colors focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-white transition-colors focus:border-orange-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">Accounts are created by your administrator.</p>
          </div>
        </div>
      </div>
    </div>
  )
}