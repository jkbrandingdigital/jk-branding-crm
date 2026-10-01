import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, Users, AlertCircle, CalendarClock } from 'lucide-react'
import HrLayout from '../../components/HrLayout'
import { supabase } from '../../lib/supabase'
import { istDate } from '../../lib/format'

type Lead = {
  id: string
  lead_no: number
  name: string
  phone: string | null
  company: string | null
  created_at: string
  next_follow_up: string | null
}

export default function HRDashboard() {
  const today = istDate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [staffCount, setStaffCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const [l, p] = await Promise.all([
        supabase
          .from('leads')
          .select('id, lead_no, name, phone, company, created_at, next_follow_up')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])
      if (l.error) setError(l.error.message)
      setLeads((l.data ?? []) as Lead[])
      setStaffCount(p.count ?? 0)
      setLoading(false)
    })()
  }, [])

  const newToday = leads.filter((l) => l.created_at.slice(0, 10) === today).length
  const overdue = leads.filter((l) => l.next_follow_up && new Date(l.next_follow_up) < new Date()).length
  const dueToday = leads.filter((l) => l.next_follow_up?.slice(0, 10) === today).length

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

  return (
    <HrLayout>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-bold">HR Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">Hiring enquiries and the team, at a glance.</p>

        {error && <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className={loading ? 'opacity-50' : ''}>
          <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#242424] bg-[#242424] sm:grid-cols-4">
            <Stat icon={<Filter size={15} />} label="My leads" value={leads.length} />
            <Stat icon={<CalendarClock size={15} />} label="New today" value={newToday} />
            <Stat icon={<AlertCircle size={15} />} label="Overdue follow-ups" value={overdue} tone={overdue ? 'text-red-400' : undefined} />
            <Stat icon={<Users size={15} />} label="Active employees" value={staffCount} />
          </section>

          <section className="mt-6 rounded-2xl border border-[#242424] bg-[#151515] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-300">Latest enquiries</h2>
              <Link to="/hr/leads" className="text-xs text-orange-400 hover:underline">
                Open leads →
              </Link>
            </div>

            {leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                No leads yet. Hiring leads arrive here once the Hiring label is set up in Lead Labels.
              </p>
            ) : (
              <ul className="divide-y divide-[#222]">
                {leads.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
                    <span className="text-gray-600">#{l.lead_no}</span>
                    <span className="font-medium">{l.name}</span>
                    {l.company && <span className="text-xs text-gray-500">{l.company}</span>}
                    {l.phone && <span className="text-xs text-gray-400">{l.phone}</span>}
                    <span className="ml-auto text-xs text-gray-500">{fmt(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {dueToday > 0 && (
              <p className="mt-3 text-xs text-orange-400">{dueToday} follow-up{dueToday > 1 ? 's' : ''} due today.</p>
            )}
          </section>
        </div>
      </div>
    </HrLayout>
  )
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="bg-[#151515] px-5 py-4">
      <p className="flex items-center gap-2 text-xs text-gray-400">
        {icon} {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}