import { useCallback, useEffect, useState } from 'react'
import { Copy, Check, MessageCircle, Link2Off } from 'lucide-react'
import { digitalApi, fullLink, inviteMessage, waLink, type ConnectPlatform, type Invite, type WorkspaceDetail } from '../../lib/digital'
import { ErrorLine, Modal, PlatformBadge } from './ui'

const ENDED: Record<string, string> = { used: 'Used', revoked: 'Switched off', expired: 'Expired' }

/*
  "Invite client" — a link the client opens to connect their own page.
  No CRM login for them, and no password to us: they log in to their own
  Facebook and press Allow.
*/
export default function InviteModal({ ws, onClose }: { ws: WorkspaceDetail; onClose: () => void }) {
  const [platforms, setPlatforms] = useState<ConnectPlatform[]>(['facebook_page', 'instagram_business'])
  const [days, setDays] = useState(7)
  const [singleUse, setSingleUse] = useState(true)
  const [made, setMade] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [list, setList] = useState<Invite[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    digitalApi.invites(ws.id).then(setList).catch((e: Error) => setError(e.message))
  }, [ws.id])
  useEffect(load, [load])

  function flip(p: ConnectPlatform) {
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const r = await digitalApi.inviteCreate(ws.id, platforms, days, singleUse)
      setMade(fullLink(r.path))
      setCopied(false)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy. Select the link and copy it by hand.')
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Switch this link off? Anyone who has it will not be able to use it.')) return
    try {
      await digitalApi.inviteRevoke(id)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const phone = ws.customer.whatsapp || ws.customer.phone
  const msg = made ? inviteMessage(ws.customer.contact_person, made) : ''

  return (
    <Modal title="Invite client to connect" sub={`${ws.customer.company_name} · ${ws.customer.code}`} onClose={onClose}>
      <div className="space-y-4">
        <ErrorLine text={error} />

        {!made ? (
          <>
            <div>
              <p className="mb-2 text-xs text-gray-400">What should the client connect?</p>
              <div className="grid grid-cols-2 gap-2">
                {(['facebook_page', 'instagram_business'] as ConnectPlatform[]).map((p) => (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                      platforms.includes(p) ? 'border-orange-500/60 bg-orange-500/10 text-white' : 'border-[#2a2a2a] text-gray-300'
                    }`}
                  >
                    <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={platforms.includes(p)} onChange={() => flip(p)} />
                    <PlatformBadge platform={p} size="sm" />
                    {p === 'facebook_page' ? 'Facebook Page' : 'Instagram Business'}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Instagram must be a Business or Creator account linked to the Facebook page. Groups and personal
                profiles cannot be connected by link — add them by hand.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Link works for</span>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                >
                  <option value={1}>1 day</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-end gap-2 pb-2 text-sm text-gray-300">
                <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} />
                <span>
                  One-use link
                  <span className="block text-[11px] text-gray-500">Stops after the page is connected</span>
                </span>
              </label>
            </div>

            <button
              onClick={create}
              disabled={busy || platforms.length === 0}
              className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
            >
              {busy ? 'Making link…' : 'Make the link'}
            </button>
          </>
        ) : (
          <div className="space-y-3 rounded-xl border border-[#242424] bg-[#151515] p-4">
            <p className="text-xs text-gray-400">Send this to the client</p>
            <p className="break-all rounded-lg bg-[#1a1a1a] px-3 py-2 font-mono text-xs text-orange-300">{made}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => copy(made)}
                className="flex items-center justify-center gap-2 rounded-lg border border-[#2a2a2a] py-2 text-sm text-gray-200 hover:bg-[#1a1a1a]"
              >
                {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <a
                href={waLink(phone, msg)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-[#25d366] py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                <MessageCircle size={15} /> WhatsApp
              </a>
            </div>
            {!phone && <p className="text-[11px] text-amber-300/90">This client has no phone on file — WhatsApp will ask whom to send it to.</p>}
            <button onClick={() => setMade(null)} className="text-xs text-orange-400 hover:underline">Make another link</button>
          </div>
        )}

        {list.length > 0 && (
          <div>
            <p className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Links sent</p>
            <ul className="divide-y divide-[#1f1f1f] rounded-lg border border-[#242424]">
              {list.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2.5 text-xs">
                  <span className="flex gap-1">{i.platforms.map((p) => <PlatformBadge key={p} platform={p} size="sm" />)}</span>
                  <span className="min-w-0 flex-1 text-gray-400">
                    {new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                    {i.created_by && ` · ${i.created_by}`}
                    {i.used_count > 0 && ` · used ${i.used_count}×`}
                    {i.single_use && ' · one-use'}
                  </span>
                  {i.live ? (
                    <>
                      <span className="rounded-full bg-green-950/60 px-2 py-0.5 text-green-400">Live</span>
                      <button onClick={() => revoke(i.id)} className="rounded p-1 text-gray-500 hover:text-red-400" aria-label="Switch link off" title="Switch off">
                        <Link2Off size={14} />
                      </button>
                    </>
                  ) : (
                    <span className="rounded-full bg-[#1f1f1f] px-2 py-0.5 text-gray-500">{ENDED[i.ended ?? 'revoked']}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
