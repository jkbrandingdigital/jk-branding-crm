// Today's Visitors — summary cards + live table + checkout + export.

import { useEffect, useMemo, useState } from 'react'
import { Users, LogIn, LogOut, RefreshCw, Download, Search } from 'lucide-react'
import {
  todaysVisits, checkoutVisit, STATUS_META, istTime, istDateShort, duration, downloadCSV,
  type VisitRow,
} from '../../lib/reception'

export default function ReceptionBoard({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRows(await todaysVisits())
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const counts = useMemo(() => ({
    total: rows.length,
    inside: rows.filter((r) => r.status === 'checked_in').length,
    out: rows.filter((r) => r.status === 'checked_out').length,
  }), [rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      r.full_name?.toLowerCase().includes(s) ||
      r.company_name?.toLowerCase().includes(s) ||
      r.meeting_employee_name?.toLowerCase().includes(s) ||
      r.mobile?.includes(s))
  }, [rows, q])

  async function checkout(r: VisitRow) {
    setBusy(r.id)
    try {
      await checkoutVisit(r.id)
      await load()
    } finally {
      setBusy(null)
    }
  }

  function exportCsv() {
    const headers = ['Visitor Name', 'Mobile', 'Company', 'Visitor Type', 'Visit Date', 'Check-in', 'Check-out', 'Meeting With', 'Department', 'Purpose', 'Duration', 'Status', 'Reception Remark']
    const data = filtered.map((r) => [
      r.full_name, r.mobile, r.company_name, r.visitor_type, istDateShort(r.check_in_at),
      istTime(r.check_in_at), istTime(r.check_out_at), r.meeting_employee_name, r.department, r.purpose,
      duration(r.duration_minutes), STATUS_META[r.status].label, r.reception_remark,
    ])
    downloadCSV(`todays-visitors-${istDateShort(new Date().toISOString())}.csv`, headers, data)
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={Users} label="Today's Visitors" value={counts.total} />
        <Stat icon={LogIn} label="Currently Inside" value={counts.inside} tone="green" />
        <Stat icon={LogOut} label="Checked Out" value={counts.out} tone="gray" />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, employee or mobile…"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#161616] py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:bg-[#1a1a1a]">
            <RefreshCw size={15} /> Refresh
          </button>
          <button onClick={exportCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-500/40">
            <Download size={15} /> Export Excel
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[#1f1f1f]">
        <table className="min-w-full divide-y divide-[#1f1f1f] text-sm">
          <thead className="bg-[#161616] text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Visitor</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Meeting With</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">{readOnly ? 'Duration' : 'Action'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#161616] bg-[#121212]">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No visitors for today yet.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-[#161616]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{r.full_name}</div>
                    <div className="text-xs text-gray-500">{r.mobile}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{r.company_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{r.meeting_employee_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{istTime(r.check_in_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{istTime(r.check_out_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{r.purpose}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {readOnly ? (
                      <span className="text-xs text-gray-500">{r.status === 'checked_out' ? duration(r.duration_minutes) : '—'}</span>
                    ) : r.status === 'checked_in' ? (
                      <button onClick={() => checkout(r)} disabled={busy === r.id} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:bg-orange-500/40">
                        {busy === r.id ? '…' : 'Check Out'}
                      </button>
                    ) : r.status === 'checked_out' ? (
                      <span className="text-xs text-gray-500">{duration(r.duration_minutes)}</span>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone = 'orange' }: { icon: typeof Users; label: string; value: number; tone?: 'orange' | 'green' | 'gray' }) {
  const colors: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-500/10',
    green: 'text-green-400 bg-green-500/10',
    gray: 'text-gray-400 bg-gray-500/10',
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#1f1f1f] bg-[#121212] p-5">
      <div className={`grid h-11 w-11 place-items-center rounded-lg ${colors[tone]}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-sm text-gray-400">{label}</div>
        <div className="text-2xl font-bold text-white">{value}</div>
      </div>
    </div>
  )
}