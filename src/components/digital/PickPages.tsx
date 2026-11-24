import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { connectFn, PLATFORM, type ConnectResult, type PendingAccount } from '../../lib/digital'
import { Avatar, ErrorLine } from './ui'

/*
  After Facebook: "which of your pages?"

  Used twice — by the team inside the CRM, and by the client on the public
  connect page. The `pick` code in the URL is the only key; it lives 30
  minutes and is thrown away once used.
*/
export default function PickPages({ pick, onDone, onCancel }: {
  pick: string
  onDone: (results: ConnectResult[]) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState<PendingAccount[] | null>(null)
  const [company, setCompany] = useState<string | null>(null)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ConnectResult[] | null>(null)

  useEffect(() => {
    let live = true
    connectFn<{ company_name: string | null; accounts: PendingAccount[] }>({ action: 'pending', pick })
      .then((r) => {
        if (!live) return
        setRows(r.accounts)
        setCompany(r.company_name)
        // Ticked to start with: whatever can be connected. A page that
        // belongs to another client is shown, but cannot be ticked.
        setTicked(new Set(r.accounts.filter((a) => a.state !== 'elsewhere').map((a) => a.id)))
      })
      .catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [pick])

  function toggle(id: string) {
    setTicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const r = await connectFn<{ results: ConnectResult[] }>({ action: 'connect', pick, ids: [...ticked] })
      setResults(r.results)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    try { await connectFn({ action: 'cancel', pick }) } catch { /* it expires anyway */ }
    onCancel()
  }

  if (results) {
    const ok = results.filter((r) => r.ok)
    return (
      <div className="space-y-3">
        {results.map((r) => (
          <div key={`${r.platform}:${r.name}`} className="flex items-start gap-2 text-sm">
            {r.ok
              ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-500" />
              : <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />}
            <span>
              <span className="text-white">{r.name}</span>
              <span className="text-gray-500"> · {PLATFORM[r.platform].label}</span>
              {r.error && <span className="block text-xs text-red-300">{r.error}</span>}
            </span>
          </div>
        ))}
        <button
          onClick={() => onDone(results)}
          className="mt-2 w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black hover:bg-orange-400"
        >
          {ok.length ? 'Done' : 'Close'}
        </button>
      </div>
    )
  }

  if (!rows && !error) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Reading your pages from Facebook…
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {company && <p className="text-sm text-gray-400">Pick the pages for <span className="text-white">{company}</span>.</p>}
      <ErrorLine text={error} />
      <ul className="space-y-2">
        {(rows ?? []).map((a) => {
          const blocked = a.state === 'elsewhere'
          return (
            <li key={a.id}>
              <label
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  blocked ? 'cursor-not-allowed border-[#242424] opacity-60' : 'cursor-pointer border-[#2a2a2a] hover:bg-[#1a1a1a]'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-orange-500"
                  checked={ticked.has(a.id)}
                  disabled={blocked || busy}
                  onChange={() => toggle(a.id)}
                />
                <Avatar src={a.picture_url} platform={a.platform} name={a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{a.name}</span>
                  <span className="block text-xs text-gray-500">
                    {PLATFORM[a.platform].label}{a.username ? ` · @${a.username}` : ''}
                    {a.state === 'here' && ' · already connected (will refresh)'}
                    {blocked && ' · connected to another client'}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-3 pt-1">
        <button onClick={cancel} disabled={busy} className="flex-1 rounded-lg border border-[#2a2a2a] py-2.5 text-sm text-gray-300 hover:text-white">
          Cancel
        </button>
        <button
          onClick={connect}
          disabled={busy || ticked.size === 0}
          className="flex-1 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
        >
          {busy ? 'Connecting…' : `Connect ${ticked.size || ''}`.trim()}
        </button>
      </div>
    </div>
  )
}
