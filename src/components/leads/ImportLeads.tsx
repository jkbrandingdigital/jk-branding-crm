import { useMemo, useRef, useState } from 'react'
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { SOURCES, fromInputDT, type Staff } from './leadUtils'
import { type Label } from './labels'

type Props = {
  staff: Staff[]
  labels: Label[]
  myId: string | null
  canAssign: boolean
  onClose: () => void
  onDone: () => void
}

type Row = Record<string, string>

// Where each CRM field can come from in the file
const FIELDS: { key: string; label: string; hints: string[]; required?: boolean }[] = [
  { key: 'name', label: 'Name', hints: ['name', 'full name', 'customer', 'client', 'lead name', 'first name'], required: true },
  { key: 'phone', label: 'Phone', hints: ['phone', 'mobile', 'contact', 'number', 'phone number'], required: true },
  { key: 'email', label: 'Email', hints: ['email', 'mail', 'e-mail'] },
  { key: 'company', label: 'Company', hints: ['company', 'firm', 'business', 'company name', 'organisation'] },
  { key: 'city', label: 'City', hints: ['city', 'town', 'location', 'area'] },
  { key: 'requirement', label: 'Requirement', hints: ['requirement', 'message', 'remark', 'note', 'comment', 'enquiry'] },
  { key: 'estimated_amount', label: 'Estimated amount', hints: ['amount', 'value', 'budget', 'estimate', 'deal size'] },
  { key: 'next_follow_up', label: 'Next follow-up', hints: ['follow up', 'followup', 'next follow', 'nfd'] },
]

// A small CSV reader: handles quotes, commas inside quotes and both line endings
function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); out.push(row) }

  const clean = out.filter((r) => r.some((v) => v.trim() !== ''))
  if (clean.length === 0) return { headers: [], rows: [] }
  const headers = clean[0].map((h) => h.trim())
  const rows = clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, rows }
}

const digits = (v: string) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length > 10 && d.startsWith('91') ? d.slice(-10) : d
}

export default function ImportLeads({ staff, labels, myId, canAssign, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [map, setMap] = useState<Record<string, string>>({})
  const [assign, setAssign] = useState('auto')
  const [source, setSource] = useState('other')
  const [labelId, setLabelId] = useState('')
  const [skipDup, setSkipDup] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; skipped: number; failed: number } | null>(null)

  const assignable = staff.filter((s) => s.is_active && (s.role === 'sales' || s.role === 'branch_manager'))

  function readFile(file: File) {
    setError(null)
    setResult(null)
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      const { headers: h, rows: r } = parseCsv(String(reader.result ?? ''))
      if (h.length === 0) return setError('That file looks empty.')
      setHeaders(h)
      setRows(r)
      // guess the columns
      const guess: Record<string, string> = {}
      for (const f of FIELDS) {
        const hit = h.find((x) => f.hints.some((hint) => x.toLowerCase().replace(/[_-]/g, ' ').includes(hint)))
        if (hit) guess[f.key] = hit
      }
      setMap(guess)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows])
  const ready = Boolean(map.name && map.phone && rows.length > 0)

  async function runImport() {
    setError(null)
    if (!ready) return setError('Pick which column holds the name and the phone.')

    setBusy(true)
    const cleaned = rows
      .map((r) => ({
        name: (r[map.name] ?? '').trim(),
        phone: digits(r[map.phone] ?? ''),
        email: map.email ? (r[map.email] ?? '').trim() : '',
        company: map.company ? (r[map.company] ?? '').trim() : '',
        city: map.city ? (r[map.city] ?? '').trim() : '',
        requirement: map.requirement ? (r[map.requirement] ?? '').trim() : '',
        amount: map.estimated_amount ? Number((r[map.estimated_amount] ?? '').replace(/[^0-9.]/g, '')) || 0 : 0,
        follow: map.next_follow_up ? (r[map.next_follow_up] ?? '').trim() : '',
      }))
      .filter((r) => r.name && r.phone.length >= 10)

    if (cleaned.length === 0) {
      setBusy(false)
      return setError('No usable rows. Every lead needs a name and a 10 digit phone number.')
    }

    // Drop numbers that are already in the CRM
    let skipped = rows.length - cleaned.length
    let list = cleaned
    if (skipDup) {
      const { data, error: dErr } = await supabase.rpc('lead_phones_exist', { p_phones: cleaned.map((r) => r.phone) })
      if (dErr) {
        setBusy(false)
        return setError(dErr.message)
      }
      const taken = new Set(((data ?? []) as { phone_digits: string }[]).map((x) => x.phone_digits))
      const before = list.length
      list = list.filter((r) => !taken.has(r.phone))
      skipped += before - list.length
    }

    // Also drop repeats inside the file itself
    const seen = new Set<string>()
    const unique = list.filter((r) => (seen.has(r.phone) ? false : (seen.add(r.phone), true)))
    skipped += list.length - unique.length

    const assigned_to = assign === 'auto' ? null : assign === 'me' ? myId : assign
    let added = 0
    let failed = 0

    for (let i = 0; i < unique.length; i += 100) {
      const batch = unique.slice(i, i + 100).map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email || null,
        company: r.company || null,
        city: r.city || null,
        requirement: r.requirement || null,
        source,
        estimated_amount: r.amount,
        next_follow_up: r.follow ? fromInputDT(r.follow.replace(' ', 'T')) : null,
        label_id: labelId || null,
        assigned_to,
      }))
      const { error: iErr, count } = await supabase.from('leads').insert(batch, { count: 'exact' })
      if (iErr) failed += batch.length
      else added += count ?? batch.length
    }

    setBusy(false)
    setResult({ added, skipped, failed })
    if (added > 0) onDone()
  }

  function downloadTemplate() {
    const csv = 'Name,Phone,Email,Company,City,Requirement,Amount\nRahul Shah,9876543210,rahul@example.com,Shah Traders,Rajkot,Needs 10 hoardings,50000\n'
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'leads-template.csv'
    a.click()
  }

  const inputCls =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[#242424] bg-[#151515]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#242424] px-5 py-4">
          <div>
            <h2 className="font-semibold">Import leads</h2>
            <p className="mt-0.5 text-xs text-gray-500">From another CRM, Meta, IndiaMART or any spreadsheet saved as CSV.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {result ? (
            <div className="rounded-xl border border-green-900/50 bg-green-950/10 p-6 text-center">
              <CheckCircle2 size={30} className="mx-auto text-green-400" />
              <p className="mt-3 text-lg font-semibold">{result.added} leads imported</p>
              <p className="mt-1 text-sm text-gray-400">
                {result.skipped} skipped (already in the CRM, repeated, or missing a name or phone)
                {result.failed > 0 && <span className="text-red-400"> · {result.failed} failed</span>}
              </p>
              <button onClick={onClose} className="mt-5 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* 1. file */}
              <div>
                <p className="mb-2 text-sm font-medium text-gray-300">1. Choose the file</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white"
                  >
                    <Upload size={15} /> Pick a CSV file
                  </button>
                  {fileName && (
                    <span className="flex items-center gap-2 text-sm text-gray-400">
                      <FileSpreadsheet size={15} /> {fileName} · {rows.length} rows
                    </span>
                  )}
                  <button onClick={downloadTemplate} className="ml-auto flex items-center gap-1.5 text-xs text-orange-400 hover:underline">
                    <Download size={13} /> Sample file
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">In Excel use File → Save As → CSV UTF-8.</p>
              </div>

              {/* 2. columns */}
              {headers.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-300">2. Match the columns</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FIELDS.map((f) => (
                      <label key={f.key} className="block">
                        <span className="mb-1 block text-xs text-gray-400">
                          {f.label} {f.required && <span className="text-orange-400">*</span>}
                        </span>
                        <select
                          value={map[f.key] ?? ''}
                          onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}
                          className={inputCls}
                        >
                          <option value="">— not in the file —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. settings */}
              {headers.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-300">3. What to do with them</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Source</span>
                      <select value={source} onChange={(e) => setSource(e.target.value)} className={inputCls}>
                        {SOURCES.map((s) => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Label</span>
                      <select value={labelId} onChange={(e) => setLabelId(e.target.value)} className={inputCls}>
                        <option value="">No label</option>
                        {labels.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Assign to</span>
                      <select value={assign} onChange={(e) => setAssign(e.target.value)} className={inputCls} disabled={!canAssign}>
                        {canAssign && <option value="auto">Auto (round robin)</option>}
                        <option value="me">Me</option>
                        {canAssign && assignable.map((s) => (
                          <option key={s.id} value={s.id}>{s.full_name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} className="h-4 w-4 accent-orange-500" />
                    Skip numbers that are already in the CRM
                  </label>
                </div>
              )}

              {/* preview */}
              {preview.length > 0 && ready && (
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-300">Preview (first 5)</p>
                  <div className="overflow-x-auto rounded-lg border border-[#242424]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#242424] text-left text-gray-500">
                          <th className="px-3 py-2 font-normal">Name</th>
                          <th className="px-3 py-2 font-normal">Phone</th>
                          <th className="px-3 py-2 font-normal">Company</th>
                          <th className="px-3 py-2 font-normal">City</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => (
                          <tr key={i} className="border-b border-[#1c1c1c] last:border-0">
                            <td className="px-3 py-2 text-white">{r[map.name]}</td>
                            <td className="px-3 py-2 text-gray-300">{digits(r[map.phone] ?? '')}</td>
                            <td className="px-3 py-2 text-gray-400">{map.company ? r[map.company] : '—'}</td>
                            <td className="px-3 py-2 text-gray-400">{map.city ? r[map.city] : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="flex items-center justify-between gap-3 border-t border-[#242424] px-5 py-4">
            <p className="text-xs text-gray-500">Leads with no name or a short phone number are skipped.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">
                Cancel
              </button>
              <button
                onClick={runImport}
                disabled={!ready || busy}
                className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-40"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Import {rows.length > 0 ? `${rows.length} rows` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}