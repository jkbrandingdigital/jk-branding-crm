import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, FileCheck2, Loader2, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { searchLeads, type LeadLite } from '../reminders/reminderUtils'
import { DateField } from '../DateField'
import {
  GST_TYPES, STATUSES, emptyItem, lineTotal, loadBrochures, loadCompany, loadProducts, loadQuotation,
  money, nextQuoteNo, totalsOf,
  type Brochure, type CompanyProfile, type GstType, type Product, type QuoteItem, type QuoteStatus,
} from './Quoteutils'

const input =
  'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
const label = 'mb-1.5 block text-xs text-gray-400'

export default function QuotationForm({ basePath }: { basePath: string }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const fromLead = params.get('lead') // came from a lead's 3-dot menu
  const editing = Boolean(id)

  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [brochures, setBrochures] = useState<Brochure[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pickFor, setPickFor] = useState<number | null>(null)   // which row has its product list open

  const [customer, setCustomer] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [mobile, setMobile] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)

  const [quoteDate, setQuoteDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [validUntil, setValidUntil] = useState('')
  const [gstType, setGstType] = useState<GstType>('non_gst')
  const [gstPercent, setGstPercent] = useState(18)
  const [status, setStatus] = useState<QuoteStatus>('draft')
  const [brochureId, setBrochureId] = useState('')
  const [terms, setTerms] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([emptyItem(0)])

  const [leadQ, setLeadQ] = useState('')
  const [leadHits, setLeadHits] = useState<LeadLite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [c, b, pr] = await Promise.all([loadCompany(), loadBrochures(), loadProducts()])
      setCompany(c)
      setBrochures(b)
      setProducts(pr)
      if (!editing) {
        setTerms(c?.default_terms ?? '')
        // Non GST band hoy to navu quotation GST sathe j shuru thay
        if (!c?.allow_non_gst) setGstType('sgst_cgst')
      }

      // Opened from a lead: its details fill the top of the form
      if (!editing && fromLead) {
        const { data: l } = await supabase
          .from('leads')
          .select('id, name, phone, email, company, city')
          .eq('id', fromLead)
          .maybeSingle()
        if (l) {
          setLeadId(l.id as string)
          setCustomer((l.name as string) ?? '')
          setMobile((l.phone as string) ?? '')
          setEmail((l.email as string) ?? '')
          setCompanyName((l.company as string) ?? '')
          setAddress((l.city as string) ?? '')
        }
      }

      if (editing && id) {
        const q = await loadQuotation(id)
        if (!q) {
          setError('That quotation is no longer there.')
        } else {
          setCustomer(q.customer_name)
          setCompanyName(q.company_name ?? '')
          setMobile(q.mobile ?? '')
          setEmail(q.email ?? '')
          setAddress(q.address ?? '')
          setLeadId(q.lead_id)
          setQuoteDate(q.quote_date)
          setValidUntil(q.valid_until ?? '')
          setGstType(q.gst_type)
          setGstPercent(Number(q.gst_percent) || 0)
          setStatus(q.status)
          setBrochureId(q.brochure_id ?? '')
          setTerms(q.terms ?? '')
          setNotes(q.notes ?? '')
          setItems(q.quotation_items?.length ? q.quotation_items : [emptyItem(0)])
        }
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [editing, id, fromLead])

  useEffect(() => { load() }, [load])

  // Clicking elsewhere closes the product list
  useEffect(() => {
    if (pickFor === null) return
    const away = () => setPickFor(null)
    const t = setTimeout(() => document.addEventListener('click', away), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', away)
    }
  }, [pickFor])

  useEffect(() => {
    if (leadId) return
    const t = setTimeout(async () => setLeadHits(await searchLeads(leadQ)), 300)
    return () => clearTimeout(t)
  }, [leadQ, leadId])

  const totals = useMemo(() => totalsOf(items, gstType, gstPercent), [items, gstType, gstPercent])

  // Non GST fakt tyare, jyare settings ma chalu hoy — ke pachhi juno
  // quotation pehlathi non GST hoy, jethi e kholi ane save kari shakay
  const gstChoices = GST_TYPES.filter(
    (t) => t.key !== 'non_gst' || company?.allow_non_gst || gstType === 'non_gst',
  )

  function setItem(i: number, patch: Partial<QuoteItem>) {
    setItems((list) => list.map((it, n) => (n === i ? { ...it, ...patch } : it)))
  }

  // Saved products whose name carries these letters
  function matches(text: string) {
    const t = text.trim().toLowerCase()
    const list = t ? products.filter((p) => p.name.toLowerCase().includes(t)) : products
    return list.slice(0, 8)
  }

  // Picking a product fills the name, HSN, unit and rate
  function pickProduct(i: number, p: Product) {
    setItem(i, {
      product_id: p.id,
      name: p.name,
      hsn_code: p.hsn_code,
      unit: p.unit,
      cost: Number(p.rate) || 0,
    })
    setPickFor(null)
  }

  function pickLead(l: LeadLite) {
    setLeadId(l.id)
    setCustomer(l.name)
    if (l.phone) setMobile(l.phone)
    setLeadQ('')
    setLeadHits([])
  }

  async function save(then: 'generate' | 'download') {
    setError('')
    if (!customer.trim()) return setError('Who is this quotation for?')
    const rows = items.filter((it) => it.name.trim())
    if (rows.length === 0) return setError('Add at least one item.')

    setBusy(true)
    try {
      const head = {
        customer_name: customer.trim(),
        company_name: companyName.trim() || null,
        mobile: mobile.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        lead_id: leadId,
        quote_date: quoteDate,
        valid_until: validUntil || null,
        gst_type: gstType,
        gst_percent: gstType === 'non_gst' ? 0 : gstPercent,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        total: totals.total,
        terms: terms.trim() || null,
        notes: notes.trim() || null,
        brochure_id: brochureId || null,
        status,
      }

      let quoteId = id
      if (!quoteId) {
        const { quote_no, seq } = await nextQuoteNo()
        const { data, error: e } = await supabase
          .from('quotations')
          .insert({ ...head, quote_no, seq })
          .select('id')
          .single()
        if (e) throw e
        quoteId = data.id as string
      } else {
        const { error: e } = await supabase.from('quotations').update(head).eq('id', quoteId)
        if (e) throw e
        const { error: dErr } = await supabase.from('quotation_items').delete().eq('quotation_id', quoteId)
        if (dErr) throw dErr
      }

      const { error: iErr } = await supabase.from('quotation_items').insert(
        rows.map((it, n) => ({
          quotation_id: quoteId,
          sort_order: n,
          name: it.name.trim(),
          hsn_code: it.hsn_code?.trim() || null,
          unit: it.unit?.trim() || null,
          product_id: it.product_id,
          cost: Number(it.cost) || 0,
          qty: Number(it.qty) || 0,
          discount: Number(it.discount) || 0,
          discount_type: it.discount_type,
          sub_total: lineTotal(it),
          comments: it.comments?.trim() || null,
        })),
      )
      if (iErr) throw iErr

      // Download lands on the sheet with the print dialog already open
      navigate(`${basePath}/${quoteId}/preview${then === 'download' ? '?print=1' : ''}`)
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Could not save the quotation.')
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(basePath)} aria-label="Back" className="rounded-lg border border-[#2a2a2a] p-2 text-gray-300 hover:text-white">
          <ArrowLeft size={18} />
        </button>
        <h1 className="mr-auto text-xl font-semibold text-white">{editing ? 'Edit quotation' : 'Create quotation'}</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus)} className={`${input} w-auto`} aria-label="Status">
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>}

      {/* Company header, the way it will print */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {company?.logo_url && <img src={company.logo_url} alt="" className="mb-3 h-14 w-auto" />}
            <p className="font-semibold text-white">{company?.name}</p>
            <p className="mt-1 text-sm text-gray-400">{company?.phone}</p>
            <p className="text-sm text-gray-400">{company?.email}</p>
            <p className="mt-1 max-w-xl text-sm text-gray-400">{company?.address}</p>
            {company?.gstin && <p className="mt-1 text-sm text-gray-400">GSTIN: {company.gstin}</p>}
          </div>
          <div className="flex gap-3">
            <div>
              <label className={label} htmlFor="q-date">Date</label>
              <DateField id="q-date" value={quoteDate} onChange={setQuoteDate} className="w-44" />
            </div>
            <div>
              <label className={label} htmlFor="q-valid">Valid until</label>
              <DateField id="q-valid" value={validUntil} onChange={setValidUntil} className="w-44" placeholder="Not set" />
            </div>
          </div>
        </div>
      </section>

      {/* Quotation to */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">Quotation to</h2>

        {leadId ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm">
            <span className="text-white">From lead · {customer}</span>
            <button onClick={() => setLeadId(null)} aria-label="Unlink lead" className="text-gray-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="relative mb-4">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={leadQ}
              onChange={(e) => setLeadQ(e.target.value)}
              placeholder="Search a lead to fill this in"
              className={`${input} pl-9`}
            />
            {leadHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#161616] shadow-lg">
                {leadHits.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => pickLead(l)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#1f1f1f] hover:text-white">
                      <span>#{l.lead_no} {l.name}</span>
                      <span className="text-gray-500">{l.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={label} htmlFor="q-cust">Customer name *</label>
            <input id="q-cust" value={customer} onChange={(e) => setCustomer(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="q-comp">Company name</label>
            <input id="q-comp" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="q-mob">Mobile</label>
            <input id="q-mob" value={mobile} onChange={(e) => setMobile(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="q-mail">Email</label>
            <input id="q-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={label} htmlFor="q-addr">Address</label>
            <textarea id="q-addr" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className={`${input} resize-y`} />
          </div>
        </div>
      </section>

      {/* GST */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <span className={label}>GST type</span>
            <div className="flex gap-4">
              {gstChoices.map((t) => (
                <label key={t.key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="radio"
                    name="gst"
                    checked={gstType === t.key}
                    onChange={() => setGstType(t.key)}
                    className="accent-orange-500"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          {gstType !== 'non_gst' && (
            <div>
              <label className={label} htmlFor="q-gst">GST %</label>
              <input
                id="q-gst"
                type="number"
                min={0}
                step="0.01"
                onWheel={(e) => e.currentTarget.blur()}
                value={gstPercent}
                onChange={(e) => setGstPercent(Number(e.target.value))}
                className={`${input} w-28 tabular-nums`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">Items</h2>

        <div className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className="rounded-lg border border-[#242424] bg-[#171717] p-4">
              <div className="flex items-start gap-3">
                <div className="relative min-w-0 flex-1">
                  <label className={label} htmlFor={`it-name-${i}`}>Item</label>
                  <input
                    id={`it-name-${i}`}
                    value={it.name}
                    onChange={(e) => {
                      setItem(i, it.product_id
                        ? { name: e.target.value, product_id: null, hsn_code: null, unit: null }
                        : { name: e.target.value })
                      setPickFor(i)
                    }}
                    onFocus={() => setPickFor(i)}
                    placeholder="Product or service"
                    autoComplete="off"
                    className={input}
                  />
                  {/* Saved products, offered while typing */}
                  {pickFor === i && matches(it.name).length > 0 && (
                    <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#191919] py-1 shadow-xl">
                      {matches(it.name).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => pickProduct(i, p)}
                            className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#232323] hover:text-white"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{p.name}</span>
                              {p.hsn_code && <span className="text-xs text-gray-500">HSN {p.hsn_code}</span>}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-orange-400">{money(Number(p.rate))}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* What the chosen product brings along — it prints, nobody types it here */}
                  {(it.hsn_code || it.unit) && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {it.hsn_code && (
                        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 tabular-nums text-gray-400">HSN {it.hsn_code}</span>
                      )}
                      {it.unit && <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-gray-400">{it.unit}</span>}
                      <span>from the product list</span>
                    </p>
                  )}
                </div>
                {items.length > 1 && (
                  <button
                    onClick={() => setItems((list) => list.filter((_, n) => n !== i))}
                    aria-label="Remove item"
                    className="mt-6 rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className={label} htmlFor={`it-cost-${i}`}>Cost</label>
                  <input
                    id={`it-cost-${i}`}
                    type="number"
                    min={0}
                    step="0.01"
                    onWheel={(e) => e.currentTarget.blur()}
                    value={it.cost}
                    onChange={(e) => setItem(i, { cost: Number(e.target.value) })}
                    className={`${input} tabular-nums`}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`it-qty-${i}`}>Qty</label>
                  <input
                    id={`it-qty-${i}`}
                    type="number"
                    min={0}
                    step="0.001"
                    onWheel={(e) => e.currentTarget.blur()}
                    value={it.qty}
                    onChange={(e) => setItem(i, { qty: Number(e.target.value) })}
                    className={`${input} tabular-nums`}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`it-disc-${i}`}>Discount</label>
                  <input
                    id={`it-disc-${i}`}
                    type="number"
                    min={0}
                    step="0.01"
                    onWheel={(e) => e.currentTarget.blur()}
                    value={it.discount}
                    onChange={(e) => setItem(i, { discount: Number(e.target.value) })}
                    className={`${input} tabular-nums`}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`it-dt-${i}`}>Discount type</label>
                  <select
                    id={`it-dt-${i}`}
                    value={it.discount_type}
                    onChange={(e) => setItem(i, { discount_type: e.target.value as QuoteItem['discount_type'] })}
                    className={input}
                  >
                    <option value="amount">Flat amount</option>
                    <option value="percent">Percent</option>
                  </select>
                </div>
                <div>
                  <span className={label}>Sub total</span>
                  <p className="rounded-lg border border-[#242424] bg-[#131313] px-3 py-2 text-sm tabular-nums text-white">
                    {money(lineTotal(it))}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <label className={label} htmlFor={`it-note-${i}`}>Comments</label>
                <textarea
                  id={`it-note-${i}`}
                  rows={2}
                  value={it.comments ?? ''}
                  onChange={(e) => setItem(i, { comments: e.target.value })}
                  className={`${input} resize-y`}
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setItems((list) => [...list, emptyItem(list.length)])}
          className="mt-4 flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white"
        >
          <Plus size={16} /> Add item
        </button>
      </section>

      {/* Brochure, terms and the sums */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-[#242424] bg-[#151515] p-5">
            <label className={label} htmlFor="q-broch">Brochure to send along</label>
            <select id="q-broch" value={brochureId} onChange={(e) => setBrochureId(e.target.value)} className={input}>
              <option value="">No brochure</option>
              {brochures.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="rounded-xl border border-[#242424] bg-[#151515] p-5">
            <label className={label} htmlFor="q-terms">Terms and conditions</label>
            <textarea id="q-terms" rows={6} value={terms} onChange={(e) => setTerms(e.target.value)} className={`${input} resize-y`} />
            <label className={`${label} mt-4`} htmlFor="q-notes">Notes <span className="text-gray-600">(stay inside the CRM)</span></label>
            <textarea id="q-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${input} resize-y`} />
          </div>
        </div>

        <div className="h-fit rounded-xl border border-[#242424] bg-[#151515] p-5">
          <dl className="space-y-2.5 text-sm">
            <Row k="Subtotal" v={money(totals.subtotal)} />
            <Row k="Discount" v={`− ${money(totals.discount_total)}`} />
            {gstType !== 'non_gst' && <Row k="Taxable" v={money(totals.taxable)} />}
            {gstType === 'igst' && <Row k={`IGST ${gstPercent}%`} v={money(totals.tax_total)} />}
            {gstType === 'sgst_cgst' && (
              <>
                <Row k={`CGST ${gstPercent / 2}%`} v={money(totals.tax_total / 2)} />
                <Row k={`SGST ${gstPercent / 2}%`} v={money(totals.tax_total / 2)} />
              </>
            )}
            <div className="flex justify-between border-t border-[#242424] pt-3 text-base font-semibold text-white">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(totals.total)}</dd>
            </div>
          </dl>

          <div className="mt-5 space-y-2">
            <button
              onClick={() => save('generate')}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />} Generate
            </button>
            <button
              onClick={() => save('download')}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] py-2.5 text-sm text-gray-300 hover:text-white disabled:opacity-50"
            >
              <Download size={16} /> Download
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-gray-400">
      <dt>{k}</dt>
      <dd className="tabular-nums text-gray-200">{v}</dd>
    </div>
  )
}