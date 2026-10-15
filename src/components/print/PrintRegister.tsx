import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, Download, Loader2, Mail, MailCheck,
  Pencil, Plus, Printer, Search, SlidersHorizontal, Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import PickList from './PickList'
import PrintJobModal from './PrintJobModal'
import PrintListsModal from './PrintListsModal'
import {
  downloadCsv, fmtDT, fmtTime, loadNames, PERIODS, windowOf,
  type Period, type PrintJob, type PrintName,
} from './printUtils'

/*
  Printing Media — the print register.

  One line per job sent to a printer: who it was for, what it was, which
  printer it went to, and whether the mail has gone out.

  The point of the screen is the last column. Everything else is there so
  that column can be trusted — the question this answers at six o'clock
  is "what have I not sent yet", and the Not sent filter answers it in
  one click.
*/

const MAX_ROWS = 1000

export default function PrintRegister() {
  const { can, ready } = usePermissions()
  const [rows, setRows] = useState<PrintJob[]>([])
  const [services, setServices] = useState<PrintName[]>([])
  const [offsets, setOffsets] = useState<PrintName[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState('')

  const [period, setPeriod] = useState<Period>('month')
  const [q, setQ] = useState('')
  const [only, setOnly] = useState<'all' | 'pending' | 'sent'>('all')

  const [client, setClient] = useState('')
  const [service, setService] = useState<string | null>(null)
  const [offsetId, setOffsetId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [editing, setEditing] = useState<PrintJob | null>(null)
  const [listsOpen, setListsOpen] = useState(false)

  const canEditAny = can('print_job_edit')
  const canDelete = can('print_job_delete')
  const canLists = can('print_lists_edit')

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setMe(user?.id ?? '')
    })()
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const loadLists = useCallback(async () => {
    const [s, o] = await Promise.all([loadNames('print_services'), loadNames('print_offsets')])
    setServices(s)
    setOffsets(o)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let qy = supabase.from('print_register').select('*').order('job_at', { ascending: false }).limit(MAX_ROWS)

    const win = windowOf(period)
    if (win) qy = qy.gte('job_at', win.from.toISOString()).lt('job_at', win.to.toISOString())
    if (only !== 'all') qy = qy.eq('status', only)

    const { data, error } = await qy
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setRows((data ?? []) as PrintJob[])
  }, [period, only])

  useEffect(() => { void loadLists() }, [loadLists])
  useEffect(() => { void load() }, [load])

  // Searching happens here, not in the database: a month of entries is a
  // few hundred rows, already in hand, and filtering them is instant
  // while a query per keystroke is not.
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) =>
      r.client_name.toLowerCase().includes(t) ||
      (r.service_name ?? '').toLowerCase().includes(t) ||
      (r.offset_name ?? '').toLowerCase().includes(t))
  }, [rows, q])

  const pending = rows.filter((r) => r.status === 'pending').length

  // Client names already in the register, for the suggestion list. The
  // same client comes back week after week, so typing it again in full
  // every time is wasted keystrokes.
  const clientNames = useMemo(
    () => Array.from(new Set(rows.map((r) => r.client_name))).sort().slice(0, 300),
    [rows],
  )

  async function addName(table: 'print_services' | 'print_offsets', name: string): Promise<PrintName | null> {
    const { data, error } = await supabase.from(table).insert({ name }).select('id, name, active').single()
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return null
    }
    await loadLists()
    return data as PrintName
  }

  async function add() {
    if (!client.trim()) return setMsg({ type: 'err', text: 'Whose job is it? Put a client name.' })
    if (!service) return setMsg({ type: 'err', text: 'Pick a service.' })
    if (!offsetId) return setMsg({ type: 'err', text: 'Pick where it is printing.' })

    setAdding(true)
    const { error } = await supabase.from('print_jobs').insert({
      client_name: client.trim(),
      service_id: service,
      offset_id: offsetId,
    })
    setAdding(false)
    if (error) return setMsg({ type: 'err', text: error.message })

    // The client usually stays the same across a few entries; the service
    // does not. So the name is kept and the rest is cleared.
    setService(null)
    setOffsetId(null)
    setMsg({ type: 'ok', text: 'Added.' })
    void load()
  }

  async function toggleSent(r: PrintJob) {
    setBusy(r.id)
    const { error } = await supabase
      .from('print_jobs')
      .update({ status: r.status === 'sent' ? 'pending' : 'sent' })
      .eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  async function remove(r: PrintJob) {
    if (!confirm(`Delete entry #${r.job_no} — ${r.client_name}?`)) return
    setBusy(r.id)
    const { error } = await supabase.from('print_jobs').delete().eq('id', r.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  function toExcel() {
    downloadCsv(
      `print-register-${new Date().toISOString().slice(0, 10)}.csv`,
      ['No.', 'Date & Time', 'Client Name', 'Services', 'Offset', 'Status', 'Mail sent at', 'Sent by', 'Entered by', 'Remark'],
      shown.map((r) => [
        r.job_no,
        fmtDT(r.job_at),
        r.client_name,
        r.service_name ?? '',
        r.offset_name ?? '',
        r.status === 'sent' ? 'Sent' : 'Not sent',
        r.sent_at ? fmtDT(r.sent_at) : '',
        r.sent_by_name ?? '',
        r.created_by_name ?? '',
        r.remark ?? '',
      ]),
    )
  }

  if (ready && !can('mod_print_jobs')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Printing Media is not switched on for you.
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="space-y-5">
      {/* ---------------- heading ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Printer size={22} className="text-orange-400" />
            Printing Media
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            What went to which printer, and whether the mail has gone out.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canLists && (
            <button
              onClick={() => setListsOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white"
            >
              <SlidersHorizontal size={15} /> Lists
            </button>
          )}
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg.text}
        </div>
      )}

      {/* ---------------- add one ----------------
          A row of three boxes and a button, always open. The entries come
          in bursts of ten or twenty, and a modal that has to be opened and
          closed for each one would be twenty needless clicks. */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-4">
        <p className="mb-3 text-xs text-gray-500">Add an entry</p>
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && client.trim() && service && offsetId) void add() }}
            list="print-clients"
            placeholder="Client name"
            className={input}
          />
          <datalist id="print-clients">
            {clientNames.map((n) => <option key={n} value={n} />)}
          </datalist>

          <PickList
            value={service}
            options={services}
            onPick={setService}
            placeholder="Service"
            onCreate={canLists ? (n) => addName('print_services', n) : undefined}
          />
          <PickList
            value={offsetId}
            options={offsets}
            onPick={setOffsetId}
            placeholder="Offset"
            onCreate={canLists ? (n) => addName('print_offsets', n) : undefined}
          />

          <button
            onClick={add}
            disabled={adding}
            className="flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Dated now. Enter adds it. To put in an older job, add it and change the date with the pencil.
        </p>
      </section>

      {/* ---------------- filters ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client, service or printer"
            className={`${input} pl-9`}
          />
        </div>

        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {([['all', 'All'], ['pending', 'Not sent'], ['sent', 'Sent']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setOnly(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                only === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p.key ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
        {pending > 0 && only === 'all' && <span className="text-amber-400"> · {pending} not sent</span>}
      </p>

      {/* ---------------- the register ---------------- */}
      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="border-b border-[#242424] px-4 py-3 font-normal">No.</th>
                <th className="border-b border-[#242424] px-4 py-3 font-normal">Date &amp; Time</th>
                <th className="border-b border-[#242424] px-4 py-3 font-normal">Client Name</th>
                <th className="border-b border-[#242424] px-4 py-3 font-normal">Services</th>
                <th className="border-b border-[#242424] px-4 py-3 font-normal">Offset</th>
                <th className="border-b border-[#242424] px-4 py-3 font-normal">Status</th>
                <th className="border-b border-[#242424] px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                // While the signed-in id is still being read, nothing is
                // greyed out — a button that is dead for the first second
                // looks broken, and the database refuses the change anyway
                // if the person really has no right to it.
                const mine = !me || r.created_by === me
                return (
                  <tr key={r.id} className="align-top">
                    <td className="border-t border-[#202020] px-4 py-3 tabular-nums text-gray-500">#{r.job_no}</td>
                    <td className="border-t border-[#202020] px-4 py-3 whitespace-nowrap text-gray-300">
                      {fmtDT(r.job_at)}
                    </td>
                    <td className="border-t border-[#202020] px-4 py-3 font-medium text-white">
                      {r.client_name}
                      {r.remark && <span className="block text-xs font-normal text-gray-500">{r.remark}</span>}
                    </td>
                    <td className="border-t border-[#202020] px-4 py-3 text-gray-300">{r.service_name ?? '—'}</td>
                    <td className="border-t border-[#202020] px-4 py-3 text-gray-300">{r.offset_name ?? '—'}</td>

                    <td className="border-t border-[#202020] px-4 py-3">
                      {r.status === 'sent' ? (
                        <button
                          onClick={() => toggleSent(r)}
                          disabled={busy === r.id || !(mine || canEditAny)}
                          title={
                            r.sent_at
                              ? `Sent ${fmtDT(r.sent_at)}${r.sent_by_name ? ` by ${r.sent_by_name}` : ''}`
                              : 'Sent'
                          }
                          className="flex items-center gap-1.5 rounded-md border border-green-600/40 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 disabled:cursor-default"
                        >
                          {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <MailCheck size={13} />}
                          Sent
                          {r.sent_at && <span className="font-normal text-green-600/80">· {fmtTime(r.sent_at)}</span>}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleSent(r)}
                          disabled={busy === r.id || !(mine || canEditAny)}
                          className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-400 hover:border-green-600/50 hover:text-green-400 disabled:opacity-50"
                        >
                          {busy === r.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                          Mark sent
                        </button>
                      )}
                    </td>

                    <td className="border-t border-[#202020] px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {(mine || canEditAny) && (
                          <button
                            onClick={() => setEditing(r)}
                            aria-label="Edit entry"
                            className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => remove(r)}
                            aria-label="Delete entry"
                            className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q.trim() || only !== 'all' ? 'Nothing matches.' : 'Nothing in the register yet.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                    <Loader2 size={18} className="mx-auto animate-spin" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {rows.length >= MAX_ROWS && (
        <p className="text-xs text-gray-600">
          Showing the newest {MAX_ROWS}. Pick a shorter period to see the rest.
        </p>
      )}

      {editing && (
        <PrintJobModal
          job={editing}
          services={services}
          offsets={offsets}
          canEditLists={canLists}
          onAddName={addName}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load() }}
        />
      )}

      {listsOpen && (
        <PrintListsModal onClose={() => { setListsOpen(false); void loadLists(); void load() }} />
      )}
    </div>
  )
}