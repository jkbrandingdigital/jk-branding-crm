import { useEffect, useState } from 'react'
import { UserMinus, UserPlus } from 'lucide-react'
import { digitalApi, type Person, type WorkspaceDetail } from '../../lib/digital'
import { ErrorLine } from './ui'

// Who works on this client. Only they (and "see every workspace" people)
// can open it.
export default function TeamTab({ ws, onChanged }: { ws: WorkspaceDetail; onChanged: () => void }) {
  const [staff, setStaff] = useState<Person[]>([])
  const [adding, setAdding] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const can = ws.rights.manage

  useEffect(() => {
    if (!can) return
    digitalApi.staff().then(setStaff).catch((e: Error) => setError(e.message))
  }, [can])

  const inIt = new Set(ws.members.map((m) => m.id))
  const free = staff.filter((s) => !inIt.has(s.id))

  async function set(user: string, on: boolean, name: string) {
    if (!on && !window.confirm(`Take ${name} out of ${ws.name}? They will stop seeing this client.`)) return
    setBusy(true)
    setError(null)
    try {
      await digitalApi.memberSet(ws.id, user, on)
      setAdding('')
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <ErrorLine text={error} />
      <ul className="divide-y divide-[#1f1f1f] rounded-xl border border-[#242424] bg-[#151515]">
        {ws.members.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">Nobody is in this workspace yet.</li>}
        {ws.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-500/15 text-xs font-semibold text-orange-300">
              {m.full_name.trim().slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white">{m.full_name}</span>
              <span className="block text-xs text-gray-500">{m.emp_code}</span>
            </span>
            {can && (
              <button onClick={() => set(m.id, false, m.full_name)} disabled={busy}
                className="rounded-md p-1.5 text-gray-500 hover:bg-red-950/40 hover:text-red-400" aria-label={`Remove ${m.full_name}`}>
                <UserMinus size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {can && (
        <div className="flex gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)}
            className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white">
            <option value="">{free.length ? 'Add a team member…' : 'Everyone with Digital is already in'}</option>
            {free.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name} · {s.emp_code}{s.department ? ` · ${s.department}` : ''}</option>
            ))}
          </select>
          <button onClick={() => adding && set(adding, true, '')} disabled={!adding || busy}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50">
            <UserPlus size={15} /> Add
          </button>
        </div>
      )}
      {can && (
        <p className="text-xs text-gray-500">
          Only people with Digital switched on in Employees are in this list.
        </p>
      )}
    </div>
  )
}
