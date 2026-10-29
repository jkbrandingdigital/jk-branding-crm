// Visitor Report / History — date range + employee filter + Excel export.

import { useEffect, useState } from 'react'
import { Download, Filter } from 'lucide-react'
import { DateField } from '../DateField'
import EmployeeSelect from './EmployeeSelect'
import {
  visitsReport, getEmployees, STATUS_META, istTime, istDateShort, duration, downloadCSV,
  monthStartStr, istTodayStr, type VisitRow, type Employee,
} from '../../lib/reception'

export default function VisitorReport() {
  const [from, setFrom] = useState(monthStartStr())
  const [to, setTo] = useState(istTodayStr())
  const [employeeId, setEmployeeId] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<VisitRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    getEmployees().then(setEmployees).catch(() => setEmployees([]))
  }, [])

  async function run() {
    setLoading(true)
    try {
      setRows(await visitsReport({ from, to, employeeId: employeeId || null }))
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function exportCsv() {
    const headers = ['Visitor Name', 'Mobile', 'Company', 'Email', 'Visitor Type', 'Visit Date', 'Check-in', 'Check-out', 'Meeting With', 'Department', 'Purpose', 'Duration', 'Status', 'Reception Remark']
    const data = rows.map((r) => [
      r.full_name, r.mobile, r.company_name, r.email, r.visitor_type, istDateShort(r.check_in_at),
      istTime(r.check_in_at), istTime(r.check_out_at), r.meeting_employee_name, r.department, r.purpose,
      duration(r.duration_minutes), STATUS_META[r.status].label, r.reception_remark,
    ])
    downloadCSV(`visitor-report-${from}_to_${to}.csv`, headers, data)
  }

  const label = 'mb-1 block text-xs font-medium text-gray-400'

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#1f1f1f] bg-[#121212] p-4">
        <div>
          <label className={label}>From</label>
          <DateField value={from} onChange={setFrom} />
        </div>
        <div>
          <label className={label}>To</label>
          <DateField value={to} onChange={setTo} />
        </div>
        <div className="min-w-[200px]">
          <label className={label}>Employee (optional)</label>
          <EmployeeSelect employees={employees} value={employeeId} onChange={(e) => setEmployeeId(e?.id ?? '')} />
        </div>
        <button onClick={run} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:bg-orange-500/40">
          <Filter size={15} /> {loading ? 'Loading…' : 'Apply'}
        </button>
        <button onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-[#1a1a1a] disabled:opacity-40">
          <Download size={15} /> Export Excel
        </button>
      </div>

      <p className="mt-3 text-sm text-gray-500">{loaded ? `${rows.length} visit${rows.length === 1 ? '' : 's'} found` : ''}</p>

      <div className="mt-2 overflow-hidden rounded-xl border border-[#1f1f1f]">
        <table className="min-w-full divide-y divide-[#1f1f1f] text-sm">
          <thead className="bg-[#161616] text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Visitor</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Check-out</th>
              <th className="px-4 py-3">Meeting With</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#161616] bg-[#121212]">
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">{loaded ? 'No visits in this range.' : 'Choose a range and Apply.'}</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#161616]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{r.full_name}</div>
                    <div className="text-xs text-gray-500">{r.mobile}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{r.company_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{istDateShort(r.check_in_at)}<div className="text-xs text-gray-600">{istTime(r.check_in_at)}</div></td>
                  <td className="px-4 py-3 text-gray-400">{istTime(r.check_out_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{r.meeting_employee_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{r.purpose}</td>
                  <td className="px-4 py-3 text-gray-400">{duration(r.duration_minutes)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_META[r.status].badge}`}>{STATUS_META[r.status].label}</span>
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