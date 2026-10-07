import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Eye, Loader2, MessageCircle,
  Pencil, Plus, Search, SlidersHorizontal, Trash2, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { loadStaff, waLink, type Staff } from '../leads/leadUtils'
import { DateField } from '../DateField'
import {
  GST_TYPES, STATUSES, fmtDate, loadQuotation, loadQuotations, money, nextQuoteNo, statusOf,
  type Quotation, type QuoteStatus,
} from './Quoteutils'

const select =
  'rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-gray-300 focus:border-orange-500 focus:outline-none'
const iconBtn = 'rounded-md p-1.5 text-gray-400 transition-colors hover:bg-[#222] hover:text-white disabled:opacity-30'

export default function QuotationList({ basePath }: { basePath: string }) {
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [rows, setRows] = useState<Quotation[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [q, setQ] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState<'all' | QuoteStatus>('all')
  const [gst, setGst] = useState('all')
  const [creator, setCreator] = useState('all')
  const [from, setFrom] = useState('')
  const [till, setTill] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  const canCreate = can('quote_create')
  const canEdit = can('quote_edit')
  const canDelete = can('quote_delete')

  const load = useCallback(async () => {
    setError('')
    try {
      const [r, s] = await Promise.all([loadQuotations(), loadStaff()])
      setRows(r)
      setStaff(s)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const nameOf = useMemo(() => {
    const m = new Map(staff.map((s) => [s.id, s.full_name]))
    return (id: string | null) => (id && m.get(id)) || '—'
  }, [staff])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false
      if (gst !== 'all' && r.gst_type !== gst) return false
      if (creator !== 'all' && r.created_by !== creator) return false
      if (from && r.quote_date < from) return false
      if (till && r.quote_date > till) return false
      if (!term) return true
      return [r.quote_no, r.customer_name, r.company_name, r.mobile, nameOf(r.created_by)]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [rows, q, status, gst, creator, from, till, nameOf])

  useEffect(() => { setPage(1) }, [q, status, gst, creator, from, till, perPage])

  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const current = Math.min(page, pages)
  const startIdx = (current - 1) * perPage
  const shown = filtered.slice(startIdx, startIdx + perPage)
  const filtersOn = status !== 'all' || gst !== 'all' || creator !== 'all' || !!from || !!till

  async function remove(r: Quotation) {
    if (!window.confirm(`Delete quotation ${r.quote_no}?`)) return
    const { error: e } = await supabase.from('quotations').delete().eq('id', r.id)
    if (e) return setError(e.message)
    load()
  }

  // A copy keeps the items but takes a fresh number and today's date
  async function duplicate(r: Quotation) {
    try {
      const full = await loadQuotation(r.id)
      if (!full) return
      const { quote_no, seq } = await nextQuoteNo()
      const { id: _id, created_at: _c, quotation_items: itemsOf, ...rest } = full
      const { data, error: e } = await supabase
        .from('quotations')
        .insert({
          ...rest,
          quote_no,
          seq,
          status: 'draft',
          quote_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        })
        .select('id')
        .single()
      if (e) throw e
      if (itemsOf?.length) {
        const { error: iErr } = await supabase.from('quotation_items').insert(
          itemsOf.map(({ id: _itemId, ...it }) => ({ ...it, quotation_id: data.id })),
        )
        if (iErr) throw iErr
      }
      navigate(`${basePath}/${data.id}`)
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not copy that quotation.')
    }
  }

  async function setStatusOf(r: Quotation, next: QuoteStatus) {
    const { error: e } = await supabase.from('quotations').update({ status: next }).eq('id', r.id)
    if (e) return setError(e.message)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-4">
        <h1 className="mr-auto text-xl font-semibold text-white">Quotations</h1>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search number, customer, company"
            className="w-64 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2 pl-9 pr-8 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={15} />
            </button>
          )}
        </div>

        <button
          onClick={() => setFilterOpen((f) => !f)}
          aria-expanded={filterOpen}
          className={`flex items-center gap-2 rounded-lg border bg-[#1a1a1a] px-3 py-2 text-sm ${
            filtersOn ? 'border-orange-500/60 text-orange-300' : 'border-[#2a2a2a] text-gray-300 hover:text-white'
          }`}
        >
          <SlidersHorizontal size={16} /> Filter
        </button>

        {canCreate && (
          <button
            onClick={() => navigate(`${basePath}/new`)}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus size={17} /> Create quotation
          </button>
        )}
      </div>

      {filterOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#242424] bg-[#151515] px-5 py-3">
          <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | QuoteStatus)} className={select} aria-label="Status">
            <option value="all">Any status</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={gst} onChange={(e) => setGst(e.target.value)} className={select} aria-label="GST type">
            <option value="all">Any GST type</option>
            {GST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={creator} onChange={(e) => setCreator(e.target.value)} className={select} aria-label="Created by">
            <option value="all">Anyone created</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <label className="text-xs text-gray-500">
            From
            <DateField value={from} onChange={setFrom} className="mt-1 w-40" placeholder="Any date" />
          </label>
          <label className="text-xs text-gray-500">
            To
            <DateField value={till} onChange={setTill} className="mt-1 w-40" placeholder="Any date" />
          </label>
          {filtersOn && (
            <button
              onClick={() => { setStatus('all'); setGst('all'); setCreator('all'); setFrom(''); setTill('') }}
              className="pb-2 text-sm text-gray-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-[#242424] bg-[#151515]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead>
              <tr className="border-b border-[#2a2a2a] bg-[#1a1a1a] text-left text-gray-400">
                <th className="px-4 py-3 font-medium">No.</th>
                <th className="px-3 py-3 font-medium">Actions</th>
                <th className="px-3 py-3 font-medium">Quote no.</th>
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Mobile</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">GST</th>
                <th className="px-3 py-3 text-right font-medium">Total</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Created by</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} className="py-16 text-center text-gray-500"><Loader2 size={20} className="mx-auto animate-spin" /></td></tr>
              )}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-gray-500">
                    {rows.length === 0 ? (
                      canCreate ? (
                        <>No quotations yet. <button onClick={() => navigate(`${basePath}/new`)} className="text-orange-400 hover:underline">Create the first one</button></>
                      ) : 'No quotations yet.'
                    ) : 'Nothing matches these filters.'}
                  </td>
                </tr>
              )}
              {!loading && shown.map((r, i) => {
                const st = statusOf(r.status)
                const wa = waLink(r.mobile)
                return (
                  <tr key={r.id} className="border-b border-[#202020] text-gray-200 hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2.5 text-gray-500">{startIdx + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => navigate(`${basePath}/${r.id}/preview`)} aria-label="View" title="View" className={iconBtn}>
                          <Eye size={15} />
                        </button>
                        {canEdit && (
                          <button onClick={() => navigate(`${basePath}/${r.id}`)} aria-label="Edit" title="Edit" className={iconBtn}>
                            <Pencil size={15} />
                          </button>
                        )}
                        {canCreate && (
                          <button onClick={() => duplicate(r)} aria-label="Duplicate" title="Duplicate" className={iconBtn}>
                            <Copy size={15} />
                          </button>
                        )}
                        {wa && (
                          <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp" className={`${iconBtn} text-green-500 hover:text-green-400`}>
                            <MessageCircle size={15} />
                          </a>
                        )}
                        {canDelete && (
                          <button onClick={() => remove(r)} aria-label="Delete" title="Delete" className={`${iconBtn} hover:text-red-400`}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button onClick={() => navigate(`${basePath}/${r.id}/preview`)} className="text-orange-300 hover:underline">
                        {r.quote_no}
                      </button>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5">{r.company_name || '—'}</td>
                    <td className="max-w-[180px] truncate px-3 py-2.5">{r.customer_name}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.mobile || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(r.quote_date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-400">
                      {GST_TYPES.find((t) => t.key === r.gst_type)?.label}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(Number(r.total), r.currency)}</td>
                    <td className="px-3 py-2.5">
                      {canEdit ? (
                        <select
                          value={r.status}
                          onChange={(e) => setStatusOf(r, e.target.value as QuoteStatus)}
                          className={`rounded px-1.5 py-0.5 text-xs ${st.cls} border-0 focus:outline-none`}
                          aria-label={`Status of ${r.quote_no}`}
                        >
                          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{nameOf(r.created_by)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-[#242424] px-5 py-3 text-sm text-gray-400">
          <label className="flex items-center gap-2">
            Rows per page
            <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className={`${select} py-1`}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>
            {filtered.length === 0 ? '0' : `${startIdx + 1}–${Math.min(startIdx + perPage, filtered.length)}`} of {filtered.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={current === 1} aria-label="First page" className={iconBtn}><ChevronsLeft size={17} /></button>
            <button onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page" className={iconBtn}><ChevronLeft size={17} /></button>
            <span className="px-2">Page {current} of {pages}</span>
            <button onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page" className={iconBtn}><ChevronRight size={17} /></button>
            <button onClick={() => setPage(pages)} disabled={current === pages} aria-label="Last page" className={iconBtn}><ChevronsRight size={17} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}