import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, MessageCircle, Pencil, Printer } from 'lucide-react'
import { waLink } from '../leads/leadUtils'
import {
  GST_TYPES, fmtDate, lineTotal, loadCompany, loadQuotation, money, totalsOf,
  type CompanyProfile, type Quotation,
} from './Quoteutils'

// The sheet below is deliberately on white with dark text in both themes:
// it is a printed page, not part of the app's skin.
export default function QuotationPreview({ basePath, canEdit }: { basePath: string; canEdit: boolean }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const sheetRef = useRef<HTMLDivElement>(null)
  const [making, setMaking] = useState(false)
  const [quote, setQuote] = useState<Quotation | null>(null)
  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [q, c] = await Promise.all([loadQuotation(id!), loadCompany()])
      if (!q) setError('That quotation is no longer there.')
      setQuote(q)
      setCompany(c)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Draws the sheet and saves it as a PDF, the way any other download behaves
  const downloadPdf = useCallback(async () => {
    const node = sheetRef.current
    if (!node || making) return
    setMaking(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 8
      const drawW = pageW - margin * 2
      const drawH = (canvas.height * drawW) / canvas.width

      // Taller than one page: lay it across as many pages as it needs
      let left = drawH
      let y = margin
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, y, drawW, drawH)
      left -= pageH - margin * 2
      while (left > 0) {
        y = margin - (drawH - left)
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, y, drawW, drawH)
        left -= pageH - margin * 2
      }

      pdf.save(`${quote?.quote_no ?? 'quotation'}.pdf`)
    } catch (e) {
      setError((e as Error).message)
    }
    setMaking(false)
  }, [making, quote])

  // Arriving with ?print=1 (the Download button on the form) saves it straight away
  useEffect(() => {
    if (loading || error || !quote || params.get('print') !== '1') return
    const t = setTimeout(() => {
      downloadPdf()
      const next = new URLSearchParams(params)
      next.delete('print')
      setParams(next, { replace: true })
    }, 500)
    return () => clearTimeout(t)
  }, [loading, error, quote, params, setParams, downloadPdf])

  if (loading) {
    return <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
  }
  if (error || !quote) {
    return <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</p>
  }

  const items = quote.quotation_items ?? []
  // HSN no column tyare j, jyare settings ma chalu hoy ane koi item par HSN hoy
  const showHsn = (company?.show_hsn ?? true) && items.some((it) => (it.hsn_code ?? '').trim() !== '')
  const totals = totalsOf(items, quote.gst_type, Number(quote.gst_percent))
  const half = totals.tax_total / 2
  const wa = waLink(quote.mobile)

  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @media print {
          body { background: #fff; }
          .jk-print-hide { display: none !important; }
          .jk-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      {/* Toolbar — not part of the printed page */}
      <div className="jk-print-hide mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(basePath)} aria-label="Back" className="rounded-lg border border-[#2a2a2a] p-2 text-gray-300 hover:text-white">
          <ArrowLeft size={18} />
        </button>
        <h1 className="mr-auto text-xl font-semibold text-white">{quote.quote_no}</h1>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-green-500 hover:text-green-400"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
        )}
        {canEdit && (
          <button
            onClick={() => navigate(`${basePath}/${quote.id}`)}
            className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            <Pencil size={16} /> Edit
          </button>
        )}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white"
        >
          <Printer size={16} /> Print
        </button>
        <button
          onClick={downloadPdf}
          disabled={making}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {making ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Download PDF
        </button>
      </div>

      {/* The sheet */}
      <div ref={sheetRef} className="jk-sheet rounded-xl bg-white p-10 text-[13px] leading-relaxed text-[#1a1a1a] shadow-xl">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#e5e0d6] pb-6">
          <div className="min-w-0">
            {company?.logo_url && <img src={company.logo_url} alt="" className="mb-3 h-16 w-auto" />}
            <p className="text-base font-semibold">{company?.name}</p>
            {company?.phone && <p className="mt-1">{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {company?.address && <p className="mt-1 max-w-md text-[12px] text-[#555]">{company.address}</p>}
            {company?.gstin && <p className="mt-1 text-[12px]">GSTIN: {company.gstin}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-wide">QUOTATION</p>
            <p className="mt-2 text-[12px] text-[#555]">No.</p>
            <p className="font-medium">{quote.quote_no}</p>
            <p className="mt-2 text-[12px] text-[#555]">Date</p>
            <p className="font-medium">{fmtDate(quote.quote_date)}</p>
            {quote.valid_until && (
              <>
                <p className="mt-2 text-[12px] text-[#555]">Valid until</p>
                <p className="font-medium">{fmtDate(quote.valid_until)}</p>
              </>
            )}
          </div>
        </div>

        {/* To */}
        <div className="flex flex-wrap justify-between gap-8 py-6">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-[#777]">Quotation to</p>
            <p className="mt-1 font-semibold">{quote.customer_name}</p>
            {quote.company_name && <p>{quote.company_name}</p>}
            {quote.mobile && <p>{quote.mobile}</p>}
            {quote.email && <p>{quote.email}</p>}
            {quote.address && <p className="mt-1 max-w-sm text-[12px] text-[#555]">{quote.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-[12px] uppercase tracking-wide text-[#777]">GST type</p>
            <p className="mt-1 font-medium">{GST_TYPES.find((t) => t.key === quote.gst_type)?.label}</p>
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#f4efe6] text-left">
              <th className="border border-[#e5e0d6] px-3 py-2 font-semibold">#</th>
              <th className="border border-[#e5e0d6] px-3 py-2 font-semibold">Item</th>
              {showHsn && <th className="border border-[#e5e0d6] px-3 py-2 font-semibold">HSN</th>}
              <th className="border border-[#e5e0d6] px-3 py-2 text-right font-semibold">Cost</th>
              <th className="border border-[#e5e0d6] px-3 py-2 text-right font-semibold">Qty</th>
              <th className="border border-[#e5e0d6] px-3 py-2 text-right font-semibold">Discount</th>
              <th className="border border-[#e5e0d6] px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id ?? i}>
                <td className="border border-[#e5e0d6] px-3 py-2 align-top">{i + 1}</td>
                <td className="border border-[#e5e0d6] px-3 py-2 align-top">
                  {it.name}
                  {it.comments && <span className="mt-0.5 block whitespace-pre-wrap text-[11.5px] text-[#666]">{it.comments}</span>}
                </td>
                {showHsn && (
                  <td className="border border-[#e5e0d6] px-3 py-2 align-top tabular-nums">{it.hsn_code || '—'}</td>
                )}
                <td className="border border-[#e5e0d6] px-3 py-2 text-right align-top tabular-nums">{money(Number(it.cost), quote.currency)}</td>
                <td className="border border-[#e5e0d6] px-3 py-2 text-right align-top tabular-nums">
                  {Number(it.qty)}
                  {it.unit && <span className="ml-1 text-[#666]">{it.unit}</span>}
                </td>
                <td className="border border-[#e5e0d6] px-3 py-2 text-right align-top tabular-nums">
                  {Number(it.discount) > 0
                    ? it.discount_type === 'percent'
                      ? `${Number(it.discount)}%`
                      : money(Number(it.discount), quote.currency)
                    : '—'}
                </td>
                <td className="border border-[#e5e0d6] px-3 py-2 text-right align-top tabular-nums">{money(lineTotal(it), quote.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-6 flex justify-end">
          <dl className="w-72 space-y-1.5 text-[12.5px]">
            <Row k="Subtotal" v={money(totals.subtotal, quote.currency)} />
            {totals.discount_total > 0 && <Row k="Discount" v={`− ${money(totals.discount_total, quote.currency)}`} />}
            {quote.gst_type !== 'non_gst' && <Row k="Taxable" v={money(totals.taxable, quote.currency)} />}
            {quote.gst_type === 'igst' && <Row k={`IGST ${Number(quote.gst_percent)}%`} v={money(totals.tax_total, quote.currency)} />}
            {quote.gst_type === 'sgst_cgst' && (
              <>
                <Row k={`CGST ${Number(quote.gst_percent) / 2}%`} v={money(half, quote.currency)} />
                <Row k={`SGST ${Number(quote.gst_percent) / 2}%`} v={money(half, quote.currency)} />
              </>
            )}
            <div className="flex justify-between border-t border-[#e5e0d6] pt-2 text-[15px] font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(totals.total, quote.currency)}</dd>
            </div>
          </dl>
        </div>

        {/* Bank and signature, shown only when the settings say so */}
        {(company?.show_bank || company?.show_sign) && (
          <div className="mt-8 flex flex-wrap items-end justify-between gap-8 border-t border-[#e5e0d6] pt-6">
            {company?.show_bank ? (
              <div className="text-[12.5px]">
                <p className="mb-1 font-semibold">Payment details</p>
                {company.bank_name && <p>Bank name: {company.bank_name}</p>}
                {company.account_no && <p>Account no.: {company.account_no}</p>}
                {company.ifsc && <p>IFSC code: {company.ifsc}</p>}
              </div>
            ) : (
              <span />
            )}
            {company?.show_sign && company.sign_url && (
              <div className="text-center">
                <img src={company.sign_url} alt="" className="mx-auto h-20 w-auto" />
                <p className="mt-1 border-t border-[#e5e0d6] pt-1 text-[12px]">Authorised signatory</p>
              </div>
            )}
          </div>
        )}

        {/* Terms */}
        {quote.terms && (
          <div className="mt-8 border-t border-[#e5e0d6] pt-5 text-[12px]">
            <p className="mb-1.5 font-semibold">Terms and conditions</p>
            <p className="whitespace-pre-wrap text-[#444]">{quote.terms}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[#666]">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  )
}