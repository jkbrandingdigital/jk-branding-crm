import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, Loader2, LogIn, Unplug, X, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type ConnectedPage = {
  page_id: string
  page_name: string | null
  picture_url: string | null
  subscribed: boolean
  last_error: string | null
  connected_at: string
  last_lead_at: string | null
}
type PendingPage = { page_id: string; page_name: string | null; picture_url: string | null; connected: boolean }
type Msg = { type: 'ok' | 'err'; text: string } | null

const FB_BLUE = '#1877F2'

async function callMeta<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('meta-connect', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await (error as any).context?.json()
      if (j?.error) msg = j.error
    } catch { /* keep generic message */ }
    throw new Error(msg)
  }
  return data as T
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—'

function PageAvatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full border border-[#2a2a2a] object-cover" />
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2a2a2a] bg-[#1a1a1a] text-sm text-gray-300">
      {(name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}

export default function IntegrationsTab() {
  const [params, setParams] = useSearchParams()
  const [pages, setPages] = useState<ConnectedPage[]>([])
  const [pending, setPending] = useState<PendingPage[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const loadConnected = useCallback(async () => {
    setLoading(true)
    try {
      const res = await callMeta<{ pages: ConnectedPage[] }>({ action: 'list' })
      setPages(res.pages)
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    }
    setLoading(false)
  }, [])

  const loadPending = useCallback(async () => {
    try {
      const res = await callMeta<{ pages: PendingPage[] }>({ action: 'pending' })
      setPending(res.pages)
      setPicked(new Set(res.pages.filter((p) => !p.connected).map((p) => p.page_id)))
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    }
  }, [])

  // Result of the Facebook login redirect
  useEffect(() => {
    const fb = params.get('fb')
    if (!fb) return
    const text = params.get('msg')
    if (fb === 'select') loadPending()
    else if (fb === 'cancelled') setMsg({ type: 'err', text: 'Facebook login was cancelled.' })
    else if (fb === 'nopages') setMsg({ type: 'err', text: 'No Facebook pages found. Make sure you are an admin of the page and allowed access to it during login.' })
    else if (fb === 'error') setMsg({ type: 'err', text: text || 'Facebook login failed. Please try again.' })
    const next = new URLSearchParams(params)
    next.delete('fb')
    next.delete('msg')
    setParams(next, { replace: true })
  }, [params, setParams, loadPending])

  useEffect(() => { loadConnected() }, [loadConnected])

  const login = async () => {
    setBusy('login')
    try {
      const res = await callMeta<{ url: string }>({ action: 'start', origin: window.location.origin })
      window.location.href = res.url
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
      setBusy(null)
    }
  }

  const connect = async () => {
    setBusy('connect')
    try {
      const res = await callMeta<{ results: { page_name: string | null; ok: boolean; error?: string }[] }>({
        action: 'connect',
        page_ids: [...picked],
      })
      const failed = res.results.filter((r) => !r.ok)
      if (failed.length) {
        setMsg({ type: 'err', text: `Could not connect ${failed.map((f) => f.page_name).join(', ')}: ${failed[0].error ?? 'unknown error'}` })
      } else {
        setMsg({ type: 'ok', text: `${res.results.length} page${res.results.length > 1 ? 's' : ''} connected.` })
      }
      setPending(null)
      loadConnected()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    }
    setBusy(null)
  }

  const cancelPick = async () => {
    setPending(null)
    try { await callMeta({ action: 'cancel' }) } catch { /* ignore */ }
  }

  const disconnect = async (p: ConnectedPage) => {
    if (!confirm(`Disconnect ${p.page_name ?? 'this page'}? New leads from this page will stop coming into the CRM.`)) return
    setBusy(p.page_id)
    try {
      await callMeta({ action: 'disconnect', page_id: p.page_id })
      setMsg({ type: 'ok', text: `${p.page_name ?? 'Page'} disconnected.` })
      loadConnected()
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message })
    }
    setBusy(null)
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const connectedCount = pages.length

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {msg.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Dismiss" className="text-current opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Facebook Lead Ads */}
      <section className="rounded-lg border border-[#242424] bg-[#151515]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#242424] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white" style={{ background: FB_BLUE }}>
              f
            </div>
            <div>
              <h2 className="font-semibold text-white">Facebook Lead Ads</h2>
              <p className="mt-0.5 max-w-xl text-sm text-gray-400">
                Leads from your Facebook and Instagram lead forms arrive in the CRM automatically and are assigned by round robin.
              </p>
              <p className="mt-2 text-xs">
                {loading ? (
                  <span className="text-gray-500">Checking…</span>
                ) : connectedCount ? (
                  <span className="text-green-400">Connected · {connectedCount} page{connectedCount > 1 ? 's' : ''}</span>
                ) : (
                  <span className="text-gray-500">Not connected</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {connectedCount > 0 && (
              <button
                onClick={loadConnected}
                className="flex items-center gap-2 rounded-md border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:border-[#3a3a3a] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            )}
            <button
              onClick={login}
              disabled={busy === 'login'}
              style={{ background: FB_BLUE }}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              {busy === 'login' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              {connectedCount ? 'Add more pages' : 'Login with Facebook'}
            </button>
          </div>
        </div>

        {/* Page picker after login */}
        {pending && (
          <div className="border-b border-[#242424] bg-[#121212] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-white">Select pages to connect</h3>
              <span className="text-xs text-gray-400">{picked.size} selected</span>
            </div>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-400">No pages found. Log in again and allow access to your pages.</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {pending.map((p) => (
                  <li key={p.page_id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-[#1a1a1a]">
                      <input
                        type="checkbox"
                        checked={picked.has(p.page_id)}
                        onChange={() => toggle(p.page_id)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <PageAvatar url={p.picture_url} name={p.page_name} />
                      <span className="flex-1 text-sm text-white">{p.page_name ?? p.page_id}</span>
                      {p.connected && <span className="text-xs text-green-400">Already connected</span>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={connect}
                disabled={!picked.size || busy === 'connect'}
                className="flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                {busy === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />}
                Connect selected pages
              </button>
              <button
                onClick={cancelPick}
                className="rounded-md border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connected pages */}
        <div className="p-5">
          {loading ? (
            <div className="py-4 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : connectedCount === 0 ? (
            <p className="text-sm text-gray-400">
              Click <span className="text-white">Login with Facebook</span> and choose the pages whose lead forms should come into the CRM.
            </p>
          ) : (
            <ul className="divide-y divide-[#242424]">
              {pages.map((p) => (
                <li key={p.page_id} className="flex flex-wrap items-center gap-3 py-3">
                  <PageAvatar url={p.picture_url} name={p.page_name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{p.page_name ?? p.page_id}</div>
                    <div className="text-xs text-gray-400">
                      Connected {when(p.connected_at)} · Last lead {when(p.last_lead_at)}
                    </div>
                    {!p.subscribed && (
                      <div className="mt-1 text-xs text-red-400">
                        Not receiving leads{p.last_error ? `: ${p.last_error}` : ''}. Try "Add more pages" and select it again.
                      </div>
                    )}
                  </div>
                  <span className={`text-xs ${p.subscribed ? 'text-green-400' : 'text-red-400'}`}>
                    {p.subscribed ? 'Receiving leads' : 'Error'}
                  </span>
                  <button
                    onClick={() => disconnect(p)}
                    disabled={busy === p.page_id}
                    className="flex items-center gap-1.5 rounded-md border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                  >
                    {busy === p.page_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}