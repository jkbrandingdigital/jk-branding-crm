import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Package, Plus, Save, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { loadBrochures, loadCompany, loadProducts, type Brochure, type CompanyProfile, type Product } from './Quoteutils'

const input =
  'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
const label = 'mb-1.5 block text-xs text-gray-400'

export default function QuotationSettings() {
  const { can, ready } = usePermissions()
  const allowed = ready && can('quote_settings')

  const [c, setC] = useState<CompanyProfile | null>(null)
  const [brochures, setBrochures] = useState<Brochure[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [newProd, setNewProd] = useState({ name: '', hsn_code: '', unit: '', rate: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const logoRef = useRef<HTMLInputElement>(null)
  const signRef = useRef<HTMLInputElement>(null)
  const brochureRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const [p, b, pr] = await Promise.all([loadCompany(), loadBrochures(), loadProducts(false)])
    setC(p)
    setBrochures(b)
    setProducts(pr)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (allowed) load()
    else setLoading(false)
  }, [ready, allowed, load])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3000)
    return () => clearTimeout(t)
  }, [msg])

  const set = (patch: Partial<CompanyProfile>) => setC((old) => (old ? { ...old, ...patch } : old))

  async function save() {
    if (!c) return
    setBusy(true)
    const { id: _id, ...rest } = c
    const { error } = await supabase.from('company_profile').update(rest).eq('id', 1)
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' })
  }

  // Logo and signature live in the open bucket so they show inside the PDF
  async function uploadImage(kind: 'logo' | 'sign', f: File) {
    if (f.size > 3 * 1024 * 1024) return setMsg({ ok: false, text: 'Keep images under 3 MB.' })
    setBusy(true)
    const path = `${kind}-${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`
    const { error } = await supabase.storage.from('branding').upload(path, f, { upsert: true })
    if (error) {
      setBusy(false)
      return setMsg({ ok: false, text: error.message })
    }
    const { data } = supabase.storage.from('branding').getPublicUrl(path)
    const patch = kind === 'logo' ? { logo_url: data.publicUrl } : { sign_url: data.publicUrl }
    const { error: uErr } = await supabase.from('company_profile').update(patch).eq('id', 1)
    setBusy(false)
    if (uErr) return setMsg({ ok: false, text: uErr.message })
    set(patch)
    setMsg({ ok: true, text: kind === 'logo' ? 'Logo updated.' : 'Signature updated.' })
  }

  async function addBrochure(f: File) {
    if (f.size > 20 * 1024 * 1024) return setMsg({ ok: false, text: 'Keep brochures under 20 MB.' })
    setBusy(true)
    const path = `${Date.now()}-${f.name.replace(/[^\w.\-]/g, '_')}`
    const { error } = await supabase.storage.from('brochures').upload(path, f)
    if (error) {
      setBusy(false)
      return setMsg({ ok: false, text: error.message })
    }
    const { error: iErr } = await supabase
      .from('quotation_brochures')
      .insert({ name: f.name.replace(/\.[^.]+$/, ''), file_path: path })
    setBusy(false)
    if (iErr) return setMsg({ ok: false, text: iErr.message })
    load()
    setMsg({ ok: true, text: 'Brochure added.' })
  }

  async function removeBrochure(b: Brochure) {
    if (!window.confirm(`Remove "${b.name}"?`)) return
    await supabase.storage.from('brochures').remove([b.file_path])
    const { error } = await supabase.from('quotation_brochures').delete().eq('id', b.id)
    if (error) return setMsg({ ok: false, text: error.message })
    load()
  }

  // ---------- Products ----------
  async function addProduct() {
    const name = newProd.name.trim()
    if (!name) return setMsg({ ok: false, text: 'Write the product name first.' })
    setBusy(true)
    const { error } = await supabase.from('products').insert({
      name,
      hsn_code: newProd.hsn_code.trim() || null,
      unit: newProd.unit.trim() || null,
      rate: Number(newProd.rate) || 0,
      sort_order: products.length,
    })
    setBusy(false)
    if (error) {
      return setMsg({
        ok: false,
        text: error.code === '23505' ? 'A product with this name already exists.' : error.message,
      })
    }
    setNewProd({ name: '', hsn_code: '', unit: '', rate: '' })
    setMsg({ ok: true, text: 'Product added.' })
    load()
  }

  async function saveProduct(p: Product, patch: Partial<Product>) {
    setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('products').update(patch).eq('id', p.id)
    if (error) {
      setMsg({ ok: false, text: error.message })
      load()
    }
  }

  async function removeProduct(p: Product) {
    if (!window.confirm(`Remove "${p.name}"? Quotations already saved stay as they are.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Product removed.' })
    load()
  }

  if (!ready || loading) {
    return <div className="py-24 text-center text-gray-500"><Loader2 size={22} className="mx-auto animate-spin" /></div>
  }

  if (!allowed) {
    return (
      <p className="p-6 text-gray-400">
        You need the <span className="text-white">Company and quote settings</span> permission for this page.
      </p>
    )
  }

  if (!c) return <p className="p-6 text-gray-400">No company profile found.</p>

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-white">Quotation settings</h1>
          <p className="mt-0.5 text-sm text-gray-500">This is what prints at the top of every quotation.</p>
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save changes
        </button>
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-2.5 text-sm ${msg.ok ? 'bg-green-500/10 text-green-400' : 'border border-red-500/20 bg-red-500/10 text-red-400'}`}>
          {msg.text}
        </p>
      )}

      {/* Company */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">Company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="c-name">Name</label>
            <input id="c-name" value={c.name} onChange={(e) => set({ name: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-gstin">GSTIN</label>
            <input id="c-gstin" value={c.gstin ?? ''} onChange={(e) => set({ gstin: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-phone">Phone</label>
            <input id="c-phone" value={c.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-email">Email</label>
            <input id="c-email" value={c.email ?? ''} onChange={(e) => set({ email: e.target.value })} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-addr">Address</label>
            <textarea id="c-addr" rows={3} value={c.address ?? ''} onChange={(e) => set({ address: e.target.value })} className={`${input} resize-y`} />
          </div>
        </div>
      </section>

      {/* Logo and signature */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#242424] bg-[#151515] p-5">
          <h2 className="mb-3 text-sm font-medium text-gray-300">Logo</h2>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-[#2a2a2a] bg-white p-2">
              {c.logo_url ? <img src={c.logo_url} alt="" className="max-h-full max-w-full" /> : <span className="text-xs text-gray-400">None</span>}
            </div>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage('logo', f); e.target.value = '' }} />
            <button onClick={() => logoRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
              <Upload size={15} /> Upload
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[#242424] bg-[#151515] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-300">Signature</h2>
            <Toggle on={c.show_sign} onChange={(v) => set({ show_sign: v })} label="Show on quotations" />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-[#2a2a2a] bg-white p-2">
              {c.sign_url ? <img src={c.sign_url} alt="" className="max-h-full max-w-full" /> : <span className="text-xs text-gray-400">None</span>}
            </div>
            <input ref={signRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage('sign', f); e.target.value = '' }} />
            <button onClick={() => signRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white">
              <Upload size={15} /> Upload
            </button>
          </div>
        </div>
      </section>

      {/* Bank */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">Bank details</h2>
          <Toggle on={c.show_bank} onChange={(v) => set({ show_bank: v })} label="Show on quotations" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="c-bank">Bank name</label>
            <input id="c-bank" value={c.bank_name ?? ''} onChange={(e) => set({ bank_name: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-acc">Account no.</label>
            <input id="c-acc" value={c.account_no ?? ''} onChange={(e) => set({ account_no: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="c-ifsc">IFSC code</label>
            <input id="c-ifsc" value={c.ifsc ?? ''} onChange={(e) => set({ ifsc: e.target.value })} className={input} />
          </div>
        </div>
      </section>

      {/* Numbering and terms */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">Numbering and terms</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="c-prefix">Number prefix</label>
            <input id="c-prefix" value={c.quote_prefix} onChange={(e) => set({ quote_prefix: e.target.value })} className={input} />
            <p className="mt-1 text-xs text-gray-500">Next one will be {c.quote_prefix}{c.next_number}</p>
          </div>
          <div>
            <label className={label} htmlFor="c-next">Next number</label>
            <input
              id="c-next"
              type="number"
              min={1}
              onWheel={(e) => e.currentTarget.blur()}
              value={c.next_number}
              onChange={(e) => set({ next_number: Number(e.target.value) })}
              className={`${input} tabular-nums`}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-6 rounded-lg border border-[#242424] bg-[#171717] px-4 py-3">
            <Toggle on={c.allow_non_gst} onChange={(v) => set({ allow_non_gst: v })} label="Allow Non GST quotations" />
            <p className="text-xs text-gray-500">
              Off, and everyone has to pick IGST or SGST / CGST. Quotations already saved stay as they are.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="c-terms">Default terms and conditions</label>
            <textarea id="c-terms" rows={5} value={c.default_terms ?? ''} onChange={(e) => set({ default_terms: e.target.value })} className={`${input} resize-y`} />
            <p className="mt-1 text-xs text-gray-500">Every new quotation starts with these; they can be changed one by one.</p>
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Package size={15} /> Products
          </h2>
          <Toggle
            on={c.show_hsn}
            onChange={(v) => set({ show_hsn: v })}
            label="Show HSN column on the PDF"
          />
        </div>

        {/* New product */}
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <input
            value={newProd.name}
            onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addProduct()}
            placeholder="Product name"
            aria-label="Product name"
            className={input}
          />
          <input
            value={newProd.hsn_code}
            onChange={(e) => setNewProd({ ...newProd, hsn_code: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addProduct()}
            placeholder="HSN / SAC"
            aria-label="HSN code"
            inputMode="numeric"
            className={`${input} tabular-nums`}
          />
          <input
            value={newProd.unit}
            onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addProduct()}
            placeholder="Unit"
            aria-label="Unit"
            className={input}
          />
          <input
            value={newProd.rate}
            onChange={(e) => setNewProd({ ...newProd, rate: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && addProduct()}
            placeholder="Rate"
            aria-label="Rate"
            type="number"
            min={0}
            step="0.01"
            onWheel={(e) => e.currentTarget.blur()}
            className={`${input} tabular-nums`}
          />
          <button
            onClick={addProduct}
            disabled={busy || !newProd.name.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {/* What is already there */}
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">
            No products yet. Add one above and it will come up while typing an item on a quotation.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {products.map((p) => (
              <li
                key={p.id}
                className={`grid gap-3 rounded-lg border border-[#242424] bg-[#171717] p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] ${
                  p.is_active ? '' : 'opacity-50'
                }`}
              >
                <input
                  value={p.name}
                  onChange={(e) => saveProduct(p, { name: e.target.value })}
                  aria-label="Product name"
                  className={input}
                />
                <input
                  value={p.hsn_code ?? ''}
                  onChange={(e) => saveProduct(p, { hsn_code: e.target.value })}
                  placeholder="HSN"
                  aria-label="HSN code"
                  className={`${input} tabular-nums`}
                />
                <input
                  value={p.unit ?? ''}
                  onChange={(e) => saveProduct(p, { unit: e.target.value })}
                  placeholder="Unit"
                  aria-label="Unit"
                  className={input}
                />
                <input
                  value={p.rate}
                  onChange={(e) => saveProduct(p, { rate: Number(e.target.value) || 0 })}
                  type="number"
                  min={0}
                  step="0.01"
                  onWheel={(e) => e.currentTarget.blur()}
                  aria-label="Rate"
                  className={`${input} tabular-nums`}
                />
                <div className="flex items-center gap-1">
                  <Toggle on={p.is_active} onChange={(v) => saveProduct(p, { is_active: v })} label="" />
                  <button
                    onClick={() => removeProduct(p)}
                    aria-label={`Remove ${p.name}`}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Changes here save as you type. Switch one off to keep it out of the list — quotations already saved stay as they are.
        </p>
      </section>

      {/* Brochures */}
      <section className="rounded-xl border border-[#242424] bg-[#151515] p-5">
        <h2 className="mb-4 text-sm font-medium text-gray-300">Brochures</h2>
        <ul className="space-y-2">
          {brochures.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-lg border border-[#242424] bg-[#171717] px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-white">{b.name}</span>
              <button onClick={() => removeBrochure(b)} aria-label={`Remove ${b.name}`} className="rounded-md p-1.5 text-gray-400 hover:bg-[#222] hover:text-red-400">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
          {brochures.length === 0 && <li className="py-4 text-center text-sm text-gray-500">None yet.</li>}
        </ul>
        <input ref={brochureRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addBrochure(f); e.target.value = '' }} />
        <button
          onClick={() => brochureRef.current?.click()}
          disabled={busy}
          className="mt-4 flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-50"
        >
          <Plus size={16} /> Add a brochure
        </button>
      </section>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="flex items-center gap-2 text-xs text-gray-400 hover:text-white"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-orange-500' : 'bg-[#2a2a2a]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}