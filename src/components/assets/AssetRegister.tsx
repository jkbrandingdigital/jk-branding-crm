// src/components/assets/AssetRegister.tsx
//
// What the company owns and who has it. Route: /hr/assets
//
// The register answers two different questions and they are not the
// same screen:
//
//   "Where is AST-0007?"   — the list of things.
//   "What is with Abdul?"  — the list of people.
//
// HR asks the second one far more often, usually on the day somebody
// leaves, so it is a tab of its own rather than something you work out
// by sorting the first one.
//
// Nothing here is ever deleted. A laptop that was bought and is now
// lost is a fact, and this register is the only place that fact lives —
// so "Lost" and "Retired" are states, with a reason, and the thing
// stays on the books.

import { useCallback, useEffect, useState } from 'react'
import {
  Package, Plus, Search, UserPlus, Undo2, Loader2, X, History,
  Laptop, Users, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Row = {
  id: string; code: string; name: string; category: string | null
  make_model: string | null; serial_no: string | null
  branch: string | null; branch_id: string | null
  status: string; condition: string | null
  bought_on: string | null; value_inr: number | null
  warranty_upto: string | null; notes: string | null
  held_by: string | null; held_by_name: string | null; held_by_code: string | null
  given_at: string | null; times_given: number
}

type Person = {
  user_id: string; emp_code: string; full_name: string; branch: string | null
  items: number; value_inr: number; what: string
}

type Hist = {
  given_at: string; full_name: string; emp_code: string
  given_by_name: string | null; given_note: string | null; condition_out: string | null
  returned_at: string | null; return_note: string | null; condition_in: string | null
}

type Counts = {
  ok: boolean; total?: number; given?: number; in_stock?: number
  repair?: number; lost?: number; retired?: number; value?: number
}

type Option = { id: string; name: string }
type Staff = { id: string; full_name: string; emp_code: string }

const rupees = (n: number | null | undefined) =>
  n === null || n === undefined ? '—'
  : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const STATE_CLS: Record<string, string> = {
  'In stock':  'bg-[#1f1f1f] text-gray-300 ring-[#2a2a2a]',
  'Given out': 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
  'In repair': 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  Lost:        'bg-red-500/10 text-red-300 ring-red-500/20',
  Retired:     'bg-[#1f1f1f] text-gray-500 ring-[#2a2a2a]',
}

function Chip({ state }: { state: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ${
      STATE_CLS[state] ?? STATE_CLS['In stock']}`}>
      {state}
    </span>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#242424] bg-[#141414] px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white ' +
  'placeholder:text-gray-600 transition-colors focus:border-orange-500 focus:outline-none ' +
  '[color-scheme:dark]'

const btn =
  'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-40'

const EMPTY = {
  id: '', name: '', category: '', make: '', serial: '', branch: '',
  condition: '', bought: '', bill: '', value: '', warranty: '', notes: '',
}

export default function AssetRegister() {
  const [tab, setTab] = useState<'things' | 'people'>('things')
  const [rows, setRows] = useState<Row[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [cats, setCats] = useState<Option[]>([])
  const [branches, setBranches] = useState<Option[]>([])
  const [staff, setStaff] = useState<Staff[]>([])

  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ ...EMPTY })
  const [editing, setEditing] = useState(false)
  const [giving, setGiving] = useState<Row | null>(null)
  const [giveTo, setGiveTo] = useState('')
  const [giveNote, setGiveNote] = useState('')
  const [history, setHistory] = useState<{ row: Row; lines: Hist[] } | null>(null)

  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)

  const load = useCallback(async () => {
    const [l, p, c, cat, b, s] = await Promise.all([
      supabase.rpc('assets_list', { p_q: q || null, p_status: status || null, p_branch: null }),
      supabase.rpc('assets_by_person'),
      supabase.rpc('assets_counts'),
      supabase.from('asset_categories').select('id, name').eq('is_active', true).order('sort_no'),
      supabase.from('branches').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, emp_code').eq('is_active', true).order('emp_code'),
    ])
    setRows((l.data ?? []) as unknown as Row[])
    setPeople((p.data ?? []) as unknown as Person[])
    setCounts((c.data ?? null) as unknown as Counts | null)
    setCats((cat.data ?? []) as unknown as Option[])
    setBranches((b.data ?? []) as unknown as Option[])
    setStaff((s.data ?? []) as unknown as Staff[])
  }, [q, status])

  useEffect(() => {
    const id = setTimeout(load, 250)   // the search box types
    return () => clearTimeout(id)
  }, [load])

  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true)
    setSaid(null)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) {
      setSaid({ kind: 'bad', text: error?.message ?? r?.reason ?? 'Not saved.' })
      return false
    }
    setSaid({ kind: 'ok', text: ok })
    load()
    return true
  }

  async function save() {
    const done = await call('asset_save', {
      p_id: form.id || null,
      p_name: form.name.trim(),
      p_category: form.category || null,
      p_make: form.make.trim() || null,
      p_serial: form.serial.trim() || null,
      p_branch: form.branch || null,
      p_condition: form.condition.trim() || null,
      p_bought_on: form.bought || null,
      p_bill_no: form.bill.trim() || null,
      p_value: form.value ? Number(form.value) : null,
      p_warranty: form.warranty || null,
      p_notes: form.notes.trim() || null,
    }, form.id ? 'Saved.' : 'Added to the register.')
    if (done) { setForm({ ...EMPTY }); setEditing(false) }
  }

  async function openHistory(row: Row) {
    const { data } = await supabase.rpc('asset_history', { p_id: row.id })
    setHistory({ row, lines: (data ?? []) as unknown as Hist[] })
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <p className="mt-1 text-sm text-gray-500">
            What the company owns, and who has it right now.
          </p>
        </div>
        <button
          onClick={() => { setForm({ ...EMPTY }); setEditing(true); setSaid(null) }}
          className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
        >
          <Plus size={15} /> Add an asset
        </button>
      </header>

      {said && (
        <p className={`mb-4 rounded-xl border px-4 py-2.5 text-sm ${
          said.kind === 'ok'
            ? 'border-green-900/40 bg-green-950/15 text-green-300'
            : 'border-red-900/40 bg-red-950/15 text-red-300'}`}>
          {said.text}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="On the books" value={counts?.total ?? 0} />
        <Tile label="With people" value={counts?.given ?? 0} />
        <Tile label="In stock" value={counts?.in_stock ?? 0} />
        <Tile label="What it cost" value={rupees(counts?.value)} />
      </section>

      {((counts?.lost ?? 0) > 0 || (counts?.repair ?? 0) > 0) && (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-[#242424] bg-[#141414] px-4 py-2.5 text-xs text-gray-400">
          <AlertTriangle size={13} className="text-amber-400" />
          {counts?.repair ?? 0} in repair · {counts?.lost ?? 0} lost · {counts?.retired ?? 0} retired.
          Nothing is deleted here — a thing that is gone stays on the books with its reason.
        </p>
      )}

      {/* ── which question ─────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[#242424] bg-[#141414] p-1">
          {([['things', 'Things', Laptop], ['people', 'People', Users]] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
                tab === k ? 'bg-orange-500/10 text-orange-300' : 'text-gray-400 hover:text-white'}`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {tab === 'things' && (
          <>
            <div className="relative min-w-[16rem] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Code, name, model, serial, or who has it"
                className={`${inputCls} pl-9`}
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[#2a2a2a] bg-[#161616] px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none">
              <option value="">Every state</option>
              <option>In stock</option>
              <option>Given out</option>
              <option>In repair</option>
              <option>Lost</option>
              <option>Retired</option>
            </select>
          </>
        )}
      </div>

      {/* ── the things ─────────────────────────────────────────── */}
      {tab === 'things' && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
          {rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-600">
              {q || status ? 'Nothing matches that.' : 'Nothing on the register yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-[#1f1f1f] text-left text-xs text-gray-500">
                    <th className="px-5 py-2.5 font-normal">Code</th>
                    <th className="px-3 py-2.5 font-normal">What</th>
                    <th className="px-3 py-2.5 font-normal">With</th>
                    <th className="px-3 py-2.5 font-normal">Branch</th>
                    <th className="px-3 py-2.5 text-right font-normal">Value</th>
                    <th className="px-3 py-2.5 font-normal">State</th>
                    <th className="px-5 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1a1a1a]">
                  {rows.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-[#181818]">
                      <td className="px-5 py-3 font-mono text-[11px] text-gray-400">{r.code}</td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{r.name}</p>
                        <p className="text-[11px] text-gray-500">
                          {[r.category, r.make_model, r.serial_no].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        {r.held_by_name ? (
                          <>
                            <p className="text-gray-200">{r.held_by_name}</p>
                            <p className="text-[11px] text-gray-500">since {day(r.given_at)}</p>
                          </>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-400">{r.branch ?? '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-300">{rupees(r.value_inr)}</td>
                      <td className="px-3 py-3"><Chip state={r.status} /></td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          {r.held_by ? (
                            <button
                              onClick={() => call('asset_return', { p_asset: r.id, p_note: 'Taken back' }, 'Taken back.')}
                              disabled={busy}
                              className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-[11px] text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                            >
                              <Undo2 size={12} className="mr-1 inline" /> Take back
                            </button>
                          ) : r.status === 'In stock' ? (
                            <button
                              onClick={() => { setGiving(r); setGiveTo(''); setGiveNote(''); setSaid(null) }}
                              className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-[11px] text-gray-300 hover:bg-[#1f1f1f] hover:text-white"
                            >
                              <UserPlus size={12} className="mr-1 inline" /> Give out
                            </button>
                          ) : null}
                          <button
                            onClick={() => openHistory(r)}
                            className="rounded-lg p-1.5 text-gray-500 hover:bg-[#1f1f1f] hover:text-white"
                            aria-label={`History of ${r.code}`}
                          >
                            <History size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setForm({
                                id: r.id, name: r.name,
                                category: cats.find((c) => c.name === r.category)?.id ?? '',
                                make: r.make_model ?? '', serial: r.serial_no ?? '',
                                branch: r.branch_id ?? '', condition: r.condition ?? '',
                                bought: r.bought_on ?? '', bill: '',
                                value: r.value_inr ? String(r.value_inr) : '',
                                warranty: r.warranty_upto ?? '', notes: '',
                              })
                              setEditing(true)
                              setSaid(null)
                            }}
                            className="rounded-lg px-2.5 py-1 text-[11px] text-gray-500 hover:text-white"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── the people ─────────────────────────────────────────── */}
      {tab === 'people' && (
        <section className="mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-[#141414]">
          <p className="border-b border-[#242424] px-5 py-3 text-xs text-gray-500">
            The list to read on somebody&rsquo;s last day.
          </p>
          {people.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-600">Nothing is out with anybody.</p>
          ) : (
            <ul className="divide-y divide-[#1a1a1a]">
              {people.map((p) => (
                <li key={p.user_id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f1f1f] text-xs font-semibold text-gray-300">
                    {p.full_name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {p.full_name}
                      <span className="ml-2 font-mono text-[11px] text-gray-500">{p.emp_code}</span>
                      {p.branch && <span className="ml-2 text-xs text-gray-500">· {p.branch}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{p.what}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{p.items}</p>
                    <p className="text-[11px] text-gray-500">{rupees(p.value_inr)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── add / edit ─────────────────────────────────────────── */}
      {editing && (
        <Modal title={form.id ? 'Edit asset' : 'Add an asset'} onClose={() => setEditing(false)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="What is it? *" className={inputCls} />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
              <option value="">Kind</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Make and model" className={inputCls} />
            <input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder="Serial / IMEI / SIM number" className={inputCls} />
            <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} className={inputCls}>
              <option value="">Branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} placeholder="Condition — New, Good, Scratched…" className={inputCls} />
            <input type="date" value={form.bought} onChange={(e) => setForm({ ...form, bought: e.target.value })} className={inputCls} />
            <input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="What it cost" className={inputCls} />
            <input type="date" value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} className={inputCls} />
            <input value={form.bill} onChange={(e) => setForm({ ...form, bill: e.target.value })} placeholder="Bill number" className={inputCls} />
            <div className="sm:col-span-2">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything worth remembering" className={inputCls} />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="rounded-xl px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button
              onClick={save}
              disabled={busy || form.name.trim().length < 2}
              className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Package size={15} />} Save
            </button>
          </div>
        </Modal>
      )}

      {/* ── give out ───────────────────────────────────────────── */}
      {giving && (
        <Modal title={`Give out ${giving.code}`} onClose={() => setGiving(null)}>
          <p className="mb-3 text-sm text-gray-400">{giving.name}</p>
          <div className="grid gap-3">
            <select value={giveTo} onChange={(e) => setGiveTo(e.target.value)} className={inputCls}>
              <option value="">Who is taking it</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.emp_code} · {s.full_name}</option>)}
            </select>
            <input value={giveNote} onChange={(e) => setGiveNote(e.target.value)} placeholder="What it is for" className={inputCls} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setGiving(null)} className="rounded-xl px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
            <button
              onClick={async () => {
                const done = await call('asset_give', {
                  p_asset: giving.id, p_user: giveTo,
                  p_note: giveNote.trim() || null, p_condition: giving.condition,
                }, 'Handed over.')
                if (done) setGiving(null)
              }}
              disabled={busy || !giveTo}
              className={`${btn} bg-orange-600 text-white hover:bg-orange-500`}
            >
              <UserPlus size={15} /> Give out
            </button>
          </div>
        </Modal>
      )}

      {/* ── history ────────────────────────────────────────────── */}
      {history && (
        <Modal title={`${history.row.code} · ${history.row.name}`} onClose={() => setHistory(null)}>
          {history.lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-600">It has never been given out.</p>
          ) : (
            <ul className="divide-y divide-[#1f1f1f]">
              {history.lines.map((h, i) => (
                <li key={i} className="py-3 text-sm">
                  <p>
                    <span className="font-medium">{h.full_name}</span>
                    <span className="ml-2 font-mono text-[11px] text-gray-500">{h.emp_code}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {day(h.given_at)} → {h.returned_at ? day(h.returned_at) : 'still with them'}
                    {h.given_by_name && ` · given by ${h.given_by_name}`}
                  </p>
                  {(h.given_note || h.return_note) && (
                    <p className="mt-1 text-xs text-gray-400">
                      {[h.given_note, h.return_note].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#242424] bg-[#121212] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1f1f1f] hover:text-white">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}