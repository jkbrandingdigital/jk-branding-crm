import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, FolderKanban,
  Loader2, Mail, Phone, Plus, Search, Star, Trash2, Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import ClientMasterForm from './ClientMasterForm'
import CustomerDetail from './CustomerDetail'
import { CONTACT_ROLE_LABEL, downloadCsv, fmtDT, loadBranches, type Branch, type Customer } from './customerUtils'

/*
  Customers.

  One line per client, newest win first. The column that earns its place
  is "Client info": a customer converted in a hurry with half a form is
  the normal case, and this is where it gets finished.
*/

export default function CustomersBoard() {
  const { can, ready } = usePermissions()
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'active' | 'incomplete' | 'inactive'>('active')
  const [editing, setEditing] = useState<Customer | null>(null)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Customer | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchF, setBranchF] = useState('all')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const canDelete = can('customer_delete')

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_list')
      .select('*')
      .order('converted_at', { ascending: false })
      .limit(2000)
    setLoading(false)
    if (error) return setMsg({ type: 'err', text: error.message })
    setRows((data ?? []) as Customer[])
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void (async () => setBranches(await loadBranches()))() }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter((c) => {
      if (tab === 'inactive' && c.status !== 'inactive') return false
      if (tab === 'active' && c.status !== 'active') return false
      if (tab === 'incomplete' && (c.is_complete || c.status !== 'active')) return false
      if (branchF === 'none' && c.branch_id) return false
      if (branchF !== 'all' && branchF !== 'none' && c.branch_id !== branchF) return false
      if (!t) return true
      return (
        c.company_name.toLowerCase().includes(t) ||
        (c.contact_person ?? '').toLowerCase().includes(t) ||
        (c.phone ?? '').includes(t) ||
        (c.email ?? '').toLowerCase().includes(t) ||
        c.customer_code.toLowerCase().includes(t)
      )
    })
  }, [rows, q, tab, branchF])

  // The tab counts follow the branch filter too. A tab reading 41 above a
  // list of 6 is the kind of disagreement nobody can explain later.
  const counts = useMemo(() => {
    const inBranch = rows.filter((c) =>
      branchF === 'all' ? true : branchF === 'none' ? !c.branch_id : c.branch_id === branchF)
    return {
      active: inBranch.filter((c) => c.status === 'active').length,
      incomplete: inBranch.filter((c) => c.status === 'active' && !c.is_complete).length,
      inactive: inBranch.filter((c) => c.status === 'inactive').length,
    }
  }, [rows, branchF])

  async function setRating(c: Customer, rating: number) {
    setBusy(c.id)
    const { error } = await supabase
      .from('customers')
      .update({ rating: c.rating === rating ? 0 : rating })
      .eq('id', c.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  async function setStatus(c: Customer, status: 'active' | 'inactive') {
    setBusy(c.id)
    const { error } = await supabase.from('customers').update({ status }).eq('id', c.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  async function remove(c: Customer) {
    if (c.project_count > 0) {
      return setMsg({
        type: 'err',
        text: `${c.company_name} has ${c.project_count} project(s). Close those first, or set the client inactive instead.`,
      })
    }
    if (!confirm(`Delete ${c.company_name}? This cannot be undone.`)) return
    setBusy(c.id)
    const { error } = await supabase.from('customers').delete().eq('id', c.id)
    setBusy('')
    if (error) return setMsg({ type: 'err', text: error.message })
    void load()
  }

  function toExcel() {
    downloadCsv(
      `customers-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Code', 'Company / Brand', 'Branch', 'Contact Person', 'They are the', 'Mobile', 'WhatsApp',
       'Email', 'Billing Address', 'GST', 'Website', 'Birthday', 'Anniversary', 'Projects',
       'Client info', 'Rating', 'Status', 'Converted on', 'Converted by', 'Owner'],
      shown.map((c) => [
        c.customer_code, c.company_name, c.branch_name ?? '', c.contact_person ?? '',
        CONTACT_ROLE_LABEL[c.contact_role ?? ''] ?? '', c.phone ?? '', c.whatsapp ?? '',
        c.email ?? '', c.billing_address ?? '', c.gst_number ?? '', c.website ?? '',
        c.birth_date ?? '', c.anniversary_date ?? '', c.project_count,
        c.is_complete ? 'Complete' : 'Incomplete', c.rating, c.status,
        fmtDT(c.converted_at), c.converted_by_name ?? '', c.owner_name ?? '',
      ]),
    )
  }

  if (ready && !can('mod_customers')) {
    return (
      <div className="rounded-lg border border-[#242424] bg-[#151515] p-8 text-center text-gray-400">
        Customers is not switched on for you.
      </div>
    )
  }

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            <Users size={22} className="text-orange-400" />
            Customers
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Every client a deal was won with, and what is still missing from their file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toExcel}
            disabled={shown.length === 0}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40"
          >
            <Download size={15} /> Excel
          </button>
          {/* Most customers arrive by winning a lead. This is for the ones
              who never were a lead — an old client, or someone who walked
              in — and without it they could never get in at all. */}
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus size={15} /> Add customer
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* Incomplete is a tab, not a filter buried in a menu. It is the
          list someone actually works through. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
          {([
            ['active', 'Active', counts.active],
            ['incomplete', 'Incomplete', counts.incomplete],
            ['inactive', 'Inactive', counts.inactive],
          ] as const).map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === k ? 'bg-orange-500/15 text-orange-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
              <span className={`rounded px-1.5 ${k === 'incomplete' && n > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-[#1f1f1f] text-gray-500'}`}>
                {n}
              </span>
            </button>
          ))}
        </div>

        {branches.length > 0 && (
          <select
            value={branchF}
            onChange={(e) => setBranchF(e.target.value)}
            aria-label="Branch"
            className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="all">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="none">No branch</option>
          </select>
        )}

        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email or code" className={`${input} pl-9`} />
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                {['Code', 'Customer', 'Branch', 'Contact', 'Projects', 'Client info', 'Rating', 'Converted', ''].map((h, i) => (
                  <th key={i} className="border-b border-[#242424] px-4 py-3 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="border-t border-[#202020] px-4 py-3 font-mono text-xs text-gray-500">{c.customer_code}</td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <button onClick={() => setOpen(c)} className="text-left">
                      <span className="block font-medium text-white hover:text-orange-400">{c.company_name}</span>
                      {c.contact_person && (
                        <span className="block text-xs text-gray-500">
                          {c.contact_person}
                          {c.contact_role && <> · {CONTACT_ROLE_LABEL[c.contact_role]}</>}
                        </span>
                      )}
                    </button>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 text-xs text-gray-400">
                    {c.branch_name ?? '—'}
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 text-xs text-gray-400">
                    {c.phone && (
                      <span className="flex items-center gap-1.5"><Phone size={12} /> {c.phone}</span>
                    )}
                    {c.email && (
                      <span className="mt-1 flex items-center gap-1.5 truncate"><Mail size={12} /> {c.email}</span>
                    )}
                    {!c.phone && !c.email && '—'}
                  </td>

                  {/* The count opens the client, not a filtered board. What
                      someone wants from here is this client's work, and that
                      is a page about them — not the whole project list
                      narrowed down. */}
                  <td className="border-t border-[#202020] px-4 py-3">
                    <button
                      onClick={() => setOpen(c)}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-300 hover:text-orange-400"
                    >
                      <FolderKanban size={13} />
                      {c.project_count}
                      {c.open_projects > 0 && <span className="text-xs text-orange-400">({c.open_projects} open)</span>}
                    </button>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <button
                      onClick={() => setEditing(c)}
                      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                        c.is_complete
                          ? 'border-green-600/40 bg-green-500/10 text-green-400'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {c.is_complete ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                      {c.is_complete ? 'Complete' : 'Incomplete'}
                    </button>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setRating(c, n)}
                          disabled={busy === c.id}
                          aria-label={`Rate ${n}`}
                          className="disabled:opacity-50"
                        >
                          <Star
                            size={14}
                            className={n <= c.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-700'}
                          />
                        </button>
                      ))}
                    </div>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3 text-xs text-gray-400">
                    {fmtDT(c.converted_at)}
                    <span className="block text-gray-600">{c.converted_by_name ?? '—'}</span>
                  </td>

                  <td className="border-t border-[#202020] px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditing(c)}
                        aria-label="Client information"
                        title="Client information"
                        className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        onClick={() => setStatus(c, c.status === 'active' ? 'inactive' : 'active')}
                        disabled={busy === c.id}
                        className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-[#1f1f1f] hover:text-white disabled:opacity-50"
                      >
                        {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : c.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => remove(c)}
                          aria-label="Delete customer"
                          className="rounded-md p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-500">
                    {q.trim()
                      ? 'Nothing matches.'
                      : tab === 'incomplete'
                        ? 'Every client file is complete.'
                        : 'No customers yet. Win a lead and it will appear here.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Loader2 size={18} className="mx-auto animate-spin text-gray-500" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <CustomerDetail
          customer={open}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
          onEditInfo={() => { setEditing(open); setOpen(null) }}
        />
      )}

      {(editing || adding) && (
        <ClientMasterForm
          customer={editing}
          branches={branches}
          onClose={() => { setEditing(null); setAdding(false) }}
          onSaved={() => { setEditing(null); setAdding(false); void load() }}
        />
      )}
    </div>
  )
}