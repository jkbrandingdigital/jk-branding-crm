import { useState } from 'react'
import { Plus, RefreshCw, Pause, Play, Unplug, ExternalLink, Send, Bell } from 'lucide-react'
import {
  connectFn, digitalApi, MANUAL_PLATFORMS, PLATFORM, startFacebook,
  type Account, type ConnectPlatform, type Platform, type WorkspaceDetail,
} from '../../lib/digital'
import { Avatar, ErrorLine, Modal, PlatformBadge, StatusChip } from './ui'
import InviteModal from './InviteModal'

// Networks on the roadmap. Shown so the team knows they are coming, not
// clickable — each needs its own developer app and approval first.
const SOON = ['Threads', 'LinkedIn', 'YouTube', 'Google Business']

export default function ProfilesTab({ ws, onChanged }: { ws: WorkspaceDetail; onChanged: () => void }) {
  const [inviting, setInviting] = useState(false)
  const [manual, setManual] = useState<Platform | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const can = ws.rights.connect

  async function connectNow(p: ConnectPlatform) {
    setBusy(p)
    setError(null)
    try {
      await startFacebook({ workspaceId: ws.id, platforms: [p], returnPath: `/digital?ws=${ws.id}&tab=profiles` })
    } catch (e) {
      setError((e as Error).message)
      setBusy(null)
    }
  }

  async function act(a: Account, what: 'check' | 'pause' | 'resume' | 'disconnect') {
    if (what === 'disconnect' && !window.confirm(
      `Disconnect ${a.name}? The CRM forgets its key at once. Posts waiting to go there will not go.`)) return
    setBusy(a.id)
    setError(null)
    try {
      if (what === 'check') {
        const r = await connectFn<{ status: string; last_error: string | null }>({ action: 'check', account_id: a.id })
        if (r.status === 'expired') setError(`${a.name}: the key no longer works. Reconnect it.`)
      } else if (what === 'pause' || what === 'resume') {
        await digitalApi.pause(a.id, what === 'pause')
      } else {
        await digitalApi.disconnect(a.id)
      }
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const direct = ws.accounts.filter((a) => a.mode === 'direct')
  const notify = ws.accounts.filter((a) => a.mode === 'notify')

  return (
    <div className="space-y-6">
      <ErrorLine text={error} />

      {can && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Connect a profile</h2>
              <p className="text-xs text-gray-500">Connect it yourself if you are admin of the page, or send the client a link.</p>
            </div>
            <button
              onClick={() => setInviting(true)}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400"
            >
              <Send size={15} /> Invite client
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(['facebook_page', 'instagram_business'] as ConnectPlatform[]).map((p) => (
              <button
                key={p}
                onClick={() => connectNow(p)}
                disabled={busy !== null}
                className="flex flex-col items-center gap-2 rounded-xl border border-[#242424] bg-[#151515] px-3 py-5 text-center hover:border-orange-500/50 hover:bg-[#1a1a1a] disabled:opacity-60"
              >
                <PlatformBadge platform={p} />
                <span className="text-sm font-medium text-white">{PLATFORM[p].label}</span>
                <span className="text-[11px] text-gray-500">{busy === p ? 'Opening Facebook…' : 'Connect now'}</span>
              </button>
            ))}
            {MANUAL_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setManual(p)}
                className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#2a2a2a] bg-[#151515] px-3 py-5 text-center hover:border-orange-500/50 hover:bg-[#1a1a1a]"
              >
                <PlatformBadge platform={p} />
                <span className="text-sm font-medium text-white">{PLATFORM[p].label}</span>
                <span className="flex items-center gap-1 text-[11px] text-gray-500"><Bell size={11} /> Reminder · add by hand</span>
              </button>
            ))}
            {SOON.map((n) => (
              <div key={n} className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[#1f1f1f] px-3 py-5 text-center opacity-50">
                <span className="text-sm text-gray-400">{n}</span>
                <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-gray-500">Soon</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <AccountList title="Posts go out from the CRM" accounts={direct} can={can} busy={busy} onAct={act}
        empty="No Facebook page or Instagram connected yet." />
      <AccountList title="Reminder to post by hand" accounts={notify} can={can} busy={busy} onAct={act}
        empty="No groups or personal profiles added." note="Meta lets no app post to groups or personal profiles. At the post time, the team gets a reminder with the caption and pictures to post by hand." />

      {inviting && <InviteModal ws={ws} onClose={() => setInviting(false)} />}
      {manual && (
        <ManualAdd ws={ws} platform={manual} onClose={() => setManual(null)} onSaved={() => { setManual(null); onChanged() }} />
      )}
    </div>
  )
}

function AccountList({ title, accounts, can, busy, onAct, empty, note }: {
  title: string
  accounts: Account[]
  can: boolean
  busy: string | null
  onAct: (a: Account, what: 'check' | 'pause' | 'resume' | 'disconnect') => void
  empty: string
  note?: string
}) {
  return (
    <section>
      <h2 className="mb-1 font-semibold">{title} <span className="text-sm font-normal text-gray-500">({accounts.length})</span></h2>
      {note && <p className="mb-3 text-xs text-gray-500">{note}</p>}
      {accounts.length === 0 ? (
        <p className="rounded-xl border border-[#242424] bg-[#151515] px-4 py-6 text-center text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-xl border border-[#242424] bg-[#151515] p-4">
              <div className="flex items-start gap-3">
                <Avatar src={a.picture_url} platform={a.platform} name={a.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{a.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {PLATFORM[a.platform].label}{a.username ? ` · @${a.username}` : ''}
                  </p>
                </div>
                <StatusChip status={a.status} />
              </div>

              <p className="mt-3 text-[11px] text-gray-500">
                {a.connected_via === 'client_link' ? 'Client connected by link' : a.connected_via === 'manual' ? 'Added by hand' : 'Connected by the team'}
                {a.connected_fb_name && <> · <span className="text-gray-300">{a.connected_fb_name}</span> (Facebook)</>}
                {!a.connected_fb_name && a.connected_by_name && <> · {a.connected_by_name}</>}
                {' · '}{new Date(a.connected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
              </p>
              {a.status === 'expired' && a.last_error && <p className="mt-1 text-[11px] text-red-300">{a.last_error}</p>}

              {can && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#1f1f1f] pt-3">
                  {a.url && (
                    <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-[#1f1f1f]">
                      <ExternalLink size={12} /> Open
                    </a>
                  )}
                  {a.mode === 'direct' && (
                    <button onClick={() => onAct(a, 'check')} disabled={busy === a.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-[#1f1f1f] disabled:opacity-50">
                      <RefreshCw size={12} className={busy === a.id ? 'animate-spin' : ''} /> Check
                    </button>
                  )}
                  {a.status === 'connected' && (
                    <button onClick={() => onAct(a, 'pause')} disabled={busy === a.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-[#1f1f1f] disabled:opacity-50">
                      <Pause size={12} /> Pause
                    </button>
                  )}
                  {a.status === 'paused' && (
                    <button onClick={() => onAct(a, 'resume')} disabled={busy === a.id} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-[#1f1f1f] disabled:opacity-50">
                      <Play size={12} /> Resume
                    </button>
                  )}
                  <button onClick={() => onAct(a, 'disconnect')} disabled={busy === a.id} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50">
                    <Unplug size={12} /> Disconnect
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ManualAdd({ ws, platform, onClose, onSaved }: { ws: WorkspaceDetail; platform: Platform; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await digitalApi.addManual(ws.id, platform, name.trim(), url.trim())
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'
  return (
    <Modal
      title={`Add ${PLATFORM[platform].label}`}
      sub="Meta lets no app post here. The team gets a reminder at the post time."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={busy || name.trim().length < 2}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50">
            <Plus size={15} /> {busy ? 'Adding…' : 'Add'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorLine text={error} />
        <label className="block">
          <span className="mb-1.5 block text-xs text-gray-400">Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Rajkot Business Network" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-gray-400">Link</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://facebook.com/groups/…" inputMode="url" />
        </label>
      </div>
    </Modal>
  )
}
