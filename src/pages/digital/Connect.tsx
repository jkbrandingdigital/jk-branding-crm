import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Lock, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { digitalApi, startFacebook, PLATFORM, type ConnectResult, type InviteInfo } from '../../lib/digital'
import PickPages from '../../components/digital/PickPages'

/*
  The page a client opens from the WhatsApp link: /connect/<code>.

  Public — no CRM login. It is outside the login gate in App.tsx. The only
  thing it can learn from the database is the company name and which
  networks the link is for (digital_invite_info). Facebook brings the
  client back here with ?pick=… or ?fb=error.
*/
const REASON: Record<string, string> = {
  not_found: 'This link is not valid.',
  revoked: 'This link was switched off.',
  expired: 'This link has expired.',
  used: 'This link has already been used — your page is connected.',
}

export default function Connect() {
  const { token = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const pick = params.get('pick')
  const fbError = params.get('fb') === 'error' ? params.get('msg') : null

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<ConnectResult[] | null>(null)

  useEffect(() => {
    digitalApi.inviteInfo(token).then(setInfo).catch((e: Error) => setError(e.message))
  }, [token])

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await startFacebook({ invite: token, returnPath: `/connect/${token}` })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const ok = done?.filter((r) => r.ok) ?? []

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#0f0f0f] px-4 py-10 text-white">
      <div className="w-full max-w-md rounded-2xl border border-[#242424] bg-[#151515] p-6 sm:p-8">
        <img src="/logo.png" alt="JK Branding" className="mx-auto h-12 w-auto" />

        {!info && !error && (
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" /> Opening…
          </p>
        )}

        {info && !info.ok && !done && (
          <div className="mt-8 text-center">
            {info.reason === 'used'
              ? <CheckCircle2 size={36} className="mx-auto text-green-500" />
              : <AlertCircle size={36} className="mx-auto text-amber-400" />}
            <p className="mt-3 font-medium">{REASON[info.reason]}</p>
            <p className="mt-2 text-sm text-gray-400">For another page, ask JK Branding for a new link.</p>
          </div>
        )}

        {done && (
          <div className="mt-8 text-center">
            {ok.length ? <CheckCircle2 size={40} className="mx-auto text-green-500" /> : <AlertCircle size={40} className="mx-auto text-amber-400" />}
            <p className="mt-3 text-lg font-semibold">{ok.length ? 'All done — thank you!' : 'Nothing was connected'}</p>
            {ok.length > 0 && (
              <p className="mt-2 text-sm text-gray-400">
                {ok.map((r) => r.name).join(', ')} {ok.length === 1 ? 'is' : 'are'} now connected to JK Branding. You can close this page.
              </p>
            )}
          </div>
        )}

        {info?.ok && !done && pick && (
          <div className="mt-6">
            <h1 className="mb-3 text-center text-lg font-semibold">Pick your pages</h1>
            <PickPages
              pick={pick}
              onDone={setDone}
              onCancel={() => setParams({}, { replace: true })}
            />
          </div>
        )}

        {info?.ok && !done && !pick && (
          <div className="mt-6">
            <h1 className="text-center text-lg font-semibold">Connect {info.company_name}</h1>
            <p className="mt-2 text-center text-sm text-gray-400">
              JK Branding will post for you on{' '}
              {info.platforms.map((p) => PLATFORM[p].label).join(' and ')}.
            </p>

            {(fbError || error) && (
              <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{fbError || error}</p>
            )}

            <ul className="mt-6 space-y-3 text-sm text-gray-300">
              <li className="flex gap-3"><Lock size={16} className="mt-0.5 shrink-0 text-orange-400" />You log in to your own Facebook. We never see or ask for your password.</li>
              <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-orange-400" />Facebook shows exactly what you allow. Keep every option ticked so posting works.</li>
              <li className="flex gap-3"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-orange-400" />You can remove access any time: Facebook → Settings → Business integrations.</li>
            </ul>

            <button onClick={go} disabled={busy}
              className="mt-7 w-full rounded-lg bg-[#1877f2] py-3 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60">
              {busy ? 'Opening Facebook…' : 'Continue with Facebook'}
            </button>
            <p className="mt-3 text-center text-[11px] text-gray-500">
              Instagram must be a Business or Creator account linked to your Facebook page.
            </p>
          </div>
        )}

        {error && !info && <p className="mt-8 text-center text-sm text-red-300">{error}</p>}
      </div>
    </div>
  )
}
