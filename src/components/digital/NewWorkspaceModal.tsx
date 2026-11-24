import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { digitalApi, type FreeCustomer, type Person } from '../../lib/digital'
import { ErrorLine, Modal } from './ui'

/*
  "+ New workspace". Made by hand, one per client, always on a CRM
  customer — so the client's projects, money and posts stay on one record.
  A client the CRM does not know yet is added right here.
*/
export default function NewWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<FreeCustomer[]>([])
  const [picked, setPicked] = useState<FreeCustomer | null>(null)
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState({ company: '', contact: '', phone: '', email: '' })
  const [name, setName] = useState('')
  const [staff, setStaff] = useState<Person[]>([])
  const [members, setMembers] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typed search, asked once the typing stops.
  useEffect(() => {
    const t = setTimeout(() => {
      digitalApi.customersFree(q.trim()).then(setList).catch((e: Error) => setError(e.message))
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    digitalApi.staff().then(setStaff).catch(() => setStaff([]))
  }, [])

  async function addCustomer() {
    setBusy(true)
    setError(null)
    try {
      const c = await digitalApi.quickAddCustomer(nc.company.trim(), nc.contact.trim(), nc.phone.trim(), nc.email.trim())
      setPicked({ ...c, contact_person: nc.contact.trim() || null, phone: nc.phone.trim() || null })
      setAdding(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!picked) return
    setBusy(true)
    setError(null)
    try {
      const r = await digitalApi.createWorkspace(picked.id, name.trim(), [...members])
      onCreated(r.id)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  return (
    <Modal
      title="New workspace"
      sub="One workspace for one client"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={create} disabled={busy || !picked}
            className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50">
            {busy ? 'Making…' : 'Make workspace'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorLine text={error} />

        <div>
          <p className="mb-1.5 text-xs text-gray-400">Client *</p>
          {picked ? (
            <div className="flex items-center justify-between rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{picked.company_name}</span>
                <span className="block text-xs text-gray-400">{picked.code}{picked.contact_person ? ` · ${picked.contact_person}` : ''}</span>
              </span>
              <button onClick={() => setPicked(null)} className="text-xs text-orange-400 hover:underline">Change</button>
            </div>
          ) : adding ? (
            <div className="space-y-2 rounded-lg border border-[#242424] bg-[#151515] p-3">
              <input value={nc.company} onChange={(e) => setNc({ ...nc, company: e.target.value })} placeholder="Company name *" className={inputCls} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <input value={nc.contact} onChange={(e) => setNc({ ...nc, contact: e.target.value })} placeholder="Contact person" className={inputCls} />
                <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} placeholder="Mobile" className={inputCls} inputMode="tel" />
              </div>
              <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email" className={inputCls} inputMode="email" />
              <p className="text-[11px] text-gray-500">Added as a CRM customer with no sales owner. Sales can fill the rest of the client form later.</p>
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className="flex-1 rounded-lg border border-[#2a2a2a] py-2 text-sm text-gray-300">Back</button>
                <button onClick={addCustomer} disabled={busy || nc.company.trim().length < 2}
                  className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-black disabled:opacity-50">Add client</button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact, phone or CL code" className={`${inputCls} pl-9`} autoFocus />
              </div>
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#242424]">
                {list.length === 0 && <li className="px-3 py-4 text-center text-xs text-gray-500">No client without a workspace matches.</li>}
                {list.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => { setPicked(c); setName('') }}
                      className="flex w-full items-center justify-between gap-2 border-b border-[#1c1c1c] px-3 py-2 text-left last:border-0 hover:bg-[#1a1a1a]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{c.company_name}</span>
                        <span className="block text-xs text-gray-500">{c.contact_person ?? '—'}{c.phone ? ` · ${c.phone}` : ''}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-gray-500">{c.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={() => { setAdding(true); setNc({ ...nc, company: q.trim() }) }}
                className="mt-2 flex items-center gap-1 text-xs text-orange-400 hover:underline">
                <Plus size={12} /> New client
              </button>
            </>
          )}
        </div>

        {picked && (
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-400">Workspace name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={picked.company_name} className={inputCls} />
          </label>
        )}

        {staff.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-gray-400">Team <span className="text-gray-600">(you are added yourself)</span></p>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => {
                const on = members.has(s.id)
                return (
                  <button key={s.id} type="button"
                    onClick={() => setMembers((m) => { const n = new Set(m); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n })}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-orange-500 bg-orange-500/15 text-orange-300' : 'border-[#2a2a2a] text-gray-400 hover:text-white'}`}>
                    {s.full_name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
