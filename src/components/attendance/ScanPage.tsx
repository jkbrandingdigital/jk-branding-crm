// src/components/attendance/ScanPage.tsx
//
// What an employee sees at the gate. Route: /scan
//
// It opens straight into the camera. No dashboard, no menu, no "what would
// you like to do" — at nine in the morning there are twenty people in a
// line and every extra tap is twenty taps.
//
// The phone decides nothing. It reads the poster, takes a location, and
// hands both to record_scan(). Every rule — the circle, the GPS limit, the
// branch, the approved phone, which kind of scan this is — is answered by
// the database, where a modified app cannot reach it.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera, Check, X, Loader2, RefreshCw, Zap, ZapOff, LogOut, Coffee, Clock,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ── the device key ───────────────────────────────────────────────────────

/**
 * This phone's name, as far as the database is concerned.
 *
 * Kept in localStorage. It is not proof of anything on its own — anybody
 * can clear it — and that is precisely why a new key has to be approved by
 * HR before it counts. Its job is to make "a phone nobody approved" a
 * thing the server can notice, not to be unforgeable.
 */
function deviceKey(): string {
  const K = 'jk_device_key'
  try {
    let v = localStorage.getItem(K)
    if (!v) {
      v = crypto.randomUUID()
      localStorage.setItem(K, v)
    }
    return v
  } catch {
    // Private windows and locked-down browsers throw here. A key that
    // lasts one visit still works; it just needs approving again.
    return 'nostore-' + Math.random().toString(36).slice(2, 10)
  }
}

// ── types ────────────────────────────────────────────────────────────────

type Kind = 'In' | 'Lunch out' | 'Lunch in' | 'Step out' | 'Back' | 'Out'

type ScanResult = {
  ok: boolean
  id?: string
  kind?: Kind
  site?: string
  at?: string
  distance_m?: number
  late_by_min?: number
  needs_reason?: boolean
  message?: string | null
  repeat?: boolean
  reason?: string
}

type Today = {
  in: string | null
  out: string | null
  lunchOut: string | null
  lunchIn: string | null
  minutes: number
  lastKind: Kind | null
  daysThisMonth: number
}

type Site = { id: string; name: string; lat: number; lng: number; radius_m: number; accuracy_max_m: number }

type Fix = { lat: number; lng: number; accuracy: number }

// ── helpers ──────────────────────────────────────────────────────────────

const clock = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : null

const hhmm = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`

function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180
  return (
    6371000 * 2 *
    Math.asin(Math.sqrt(
      Math.sin(r(bLat - aLat) / 2) ** 2 +
        Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2,
    ))
  )
}

/** What the big button should say, from the day so far. */
function nextKind(t: Today | null): { kind: Kind; label: string } {
  const last = t?.lastKind ?? null
  if (!last) return { kind: 'In', label: 'Scan in' }
  if (last === 'In' || last === 'Lunch in' || last === 'Back') return { kind: 'Out', label: 'Scan out' }
  if (last === 'Lunch out') return { kind: 'Lunch in', label: 'Back from lunch' }
  if (last === 'Step out') return { kind: 'Back', label: 'Back' }
  return { kind: 'Out', label: 'Scan out' }
}

// ── the page ─────────────────────────────────────────────────────────────

export default function ScanPage() {
  const video = useRef<HTMLVideoElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const watch = useRef<number | null>(null)
  const reading = useRef(false)
  const sent = useRef(false)
  const alive = useRef(true)

  const [me, setMe] = useState<{ name: string; code: string } | null>(null)
  const [today, setToday] = useState<Today | null>(null)
  const [sites, setSites] = useState<Site[]>([])

  const [fix, setFix] = useState<Fix | null>(null)
  // The newest fix, readable from inside an async function.
  //
  // `fix` on its own is not enough: a value read inside send() is the one
  // captured when send() started, and it never changes however long that
  // function waits. Waiting on it is waiting on a photograph. That is why
  // a scan sent "Location is off" while the location was plainly on.
  const fixRef = useRef<Fix | null>(null)
  const [locState, setLocState] = useState<'asking' | 'ok' | 'off' | 'weak'>('asking')
  const [camState, setCamState] = useState<'asking' | 'on' | 'off'>('asking')
  const [torch, setTorch] = useState<boolean | null>(null)   // null = no torch on this camera

  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [reason, setReason] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState<{ id: string; kind: string; late_by_min: number } | null>(null)
  const [wait, setWait] = useState<string | null>(null)

  const want = nextKind(today)
  const dayDone = today?.lastKind === 'Out'

  // ── who am I, and what has today been so far ───────────────────────────

  const loadDay = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) return

    const [p, s, scans, month, nag] = await Promise.all([
      supabase.from('profiles').select('full_name, emp_code').eq('id', uid).maybeSingle(),
      supabase.from('branch_sites').select('id, name, lat, lng, radius_m, accuracy_max_m').eq('is_active', true),
      supabase
        .from('attendance_scans')
        .select('kind, scanned_at')
        .eq('user_id', uid).eq('ok', true)
        .gte('scanned_at', new Date(Date.now() - 20 * 3600 * 1000).toISOString())
        .order('scanned_at'),
      supabase.from('attendance').select('work_date, minutes_worked').eq('user_id', uid),
      supabase.rpc('my_pending_reason'),
    ])
    if (!alive.current) return

    if (p.data) setMe({ name: p.data.full_name, code: p.data.emp_code })
    setSites((s.data ?? []) as Site[])

    const rows = (scans.data ?? []) as { kind: Kind; scanned_at: string }[]
    const first = (k: Kind) => rows.find((r) => r.kind === k)?.scanned_at ?? null
    const last = (k: Kind) => [...rows].reverse().find((r) => r.kind === k)?.scanned_at ?? null
    const mins = (() => {
      const i = first('In'), o = last('Out')
      if (!i) return 0
      return Math.max(0, Math.round(((o ? new Date(o) : new Date()).getTime() - new Date(i).getTime()) / 60000))
    })()

    const nowMonth = new Date().toISOString().slice(0, 7)
    const days = ((month.data ?? []) as { work_date: string; minutes_worked: number }[])
      .filter((r) => r.work_date.startsWith(nowMonth) && r.minutes_worked > 0).length

    setToday({
      in: first('In'),
      out: last('Out'),
      lunchOut: last('Lunch out'),
      lunchIn: last('Lunch in'),
      minutes: mins,
      lastKind: rows.length ? rows[rows.length - 1].kind : null,
      daysThisMonth: days,
    })

    const n = nag.data as { id?: string; kind?: string; late_by_min?: number } | null
    if (n?.id) setPending({ id: n.id, kind: n.kind ?? '', late_by_min: n.late_by_min ?? 0 })
  }, [])

  // ── arriving with the code already in hand ─────────────────────────────
  //
  // The poster is a link, so the phone's own camera brings people here
  // with ?c=TOKEN already set. That is the ordinary way in: no in-app
  // camera, no permission to grant, and it works on iPhone, where Safari
  // cannot read a QR from a web page but the Camera app reads one fine.
  //
  // The location still has to arrive, so this waits for a fix the same
  // way a camera scan does rather than firing at once with nothing.

  const fromLink = useRef<string | null>(
    new URLSearchParams(window.location.search).get('c'),
  )

  useEffect(() => {
    if (!fromLink.current || sent.current || !today) return
    const code = fromLink.current
    fromLink.current = null
    // Take it out of the address bar: a reload should not re-fire a scan,
    // and the code has no business sitting in the phone's history.
    window.history.replaceState({}, '', '/scan')
    send(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  // ── location, kept warm ────────────────────────────────────────────────
  //
  // Asked for the moment this page opens, not when the code is read.
  // The QR takes under a second; a first GPS fix takes three to fifteen.
  // Asking in that order is most of the difference between a scan that
  // feels instant and one that feels broken.

  useEffect(() => {
    alive.current = true
    loadDay()

    if (!('geolocation' in navigator)) {
      setLocState('off')
    } else {
      watch.current = navigator.geolocation.watchPosition(
        (p) => {
          if (!alive.current) return
          const f = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
          fixRef.current = f
          setFix(f)
          setLocState(f.accuracy <= 60 ? 'ok' : 'weak')
        },
        () => alive.current && setLocState('off'),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
      )
    }

    return () => {
      alive.current = false
      if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [loadDay])

  // ── the camera ─────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    if (stream.current) return
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (!alive.current) { s.getTracks().forEach((t) => t.stop()); return }
      stream.current = s
      if (video.current) {
        video.current.srcObject = s
        await video.current.play().catch(() => {})
      }
      const track = s.getVideoTracks()[0]
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
      setTorch(caps.torch ? false : null)
      setCamState('on')
    } catch {
      setCamState('off')
    }
  }, [])

  useEffect(() => {
    // The day is finished — no camera. Nothing good comes of a scanner
    // that is still hunting after the last scan of the day.
    if (dayDone || result) return
    startCamera()
  }, [dayDone, result, startCamera])

  async function flipTorch() {
    const track = stream.current?.getVideoTracks()[0]
    if (!track || torch === null) return
    try {
      // `torch` is Chrome's own, not in the standard type at all, so the
      // cast goes the long way round rather than pretending it fits.
      await track.applyConstraints(
        { advanced: [{ torch: !torch }] } as unknown as MediaTrackConstraints,
      )
      setTorch(!torch)
    } catch { /* some phones say they can and then will not */ }
  }

  // ── reading the code ───────────────────────────────────────────────────
  //
  // BarcodeDetector where the browser has it (Android Chrome), which is
  // fast and costs nothing. Everywhere else the page shows the manual
  // button rather than pulling in a second decoder: iOS Safari has no
  // BarcodeDetector, and shipping a whole decoder for it is a decision
  // worth making on purpose, not by accident.

  useEffect(() => {
    if (camState !== 'on' || busy || result) return
    const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!Detector) return

    const det = new Detector({ formats: ['qr_code'] })
    let stop = false

    const tick = async () => {
      if (stop || !video.current || reading.current) return
      reading.current = true
      try {
        const v = video.current
        if (v.readyState >= 2) {
          const found = await det.detect(v)
          if (found.length > 0 && !sent.current) await send(found[0].rawValue)
        }
      } catch { /* a frame that would not decode; the next one will */ }
      reading.current = false
    }

    const id = window.setInterval(tick, 300)
    return () => { stop = true; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camState, busy, result])

  // ── sending it ─────────────────────────────────────────────────────────

  /**
   * The token out of whatever the camera read.
   *
   * The poster carries a link now (…/scan?c=TOKEN) so a phone's own
   * camera can open it. The in-app camera reads that same link, so what
   * comes back here is a whole URL, not a token — and sending the URL
   * straight on is what made every scan come back "not the current QR".
   */
  function tokenOf(raw: string): string {
    const t = raw.trim()
    const m = t.match(/[?&]c=([^&#\s]+)/)
    if (m) return decodeURIComponent(m[1])
    return t
  }

  async function send(rawPayload: string) {
    if (sent.current) return
    sent.current = true
    const payload = tokenOf(rawPayload)
    setBusy(true)
    setWait(null)

    // The code is usually read before the first sharp fix arrives. Rather
    // than refusing, wait for one — this is the single biggest cause of a
    // scan that "did not work" on the first try.
    //
    // Everything here reads fixRef, never the fix state: see the note
    // where fixRef is declared.
    const until = Date.now() + 15000
    while (
      alive.current &&
      Date.now() < until &&
      (!fixRef.current || fixRef.current.accuracy > 60)
    ) {
      const left = Math.ceil((until - Date.now()) / 1000)
      setWait(
        fixRef.current
          ? `Code read. Sharpening the location… ${left}s`
          : `Code read. Finding your location… ${left}s`,
      )
      await new Promise((r) => setTimeout(r, 300))
    }
    const f = fixRef.current
    setWait(null)

    // Nothing at all after fifteen seconds. Say so here rather than
    // sending an empty scan: the server would answer "Location is off",
    // which is not true and sends the person hunting for a switch that is
    // already on.
    if (!f) {
      setBusy(false)
      sent.current = false
      setResult({
        ok: false,
        reason:
          'No location from the phone yet. Keep this screen open, step near a door or window, and try again. ' +
          'If it keeps happening, turn on Precise location for this app.',
      })
      return
    }

    const { data, error } = await supabase.rpc('record_scan', {
      p_token: payload,
      p_lat: f.lat,
      p_lng: f.lng,
      p_accuracy: f.accuracy,
      p_device: deviceKey(),
      p_kind: want.kind,
    })

    setBusy(false)
    if (error) {
      setResult({ ok: false, reason: error.message })
      sent.current = false
      return
    }

    const r = data as ScanResult
    setResult(r)
    if (r.ok) {
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
      if (navigator.vibrate) navigator.vibrate(r.repeat ? 40 : [60, 40, 60])
      if (r.needs_reason && r.id) setPending({ id: r.id, kind: r.kind ?? '', late_by_min: r.late_by_min ?? 0 })
      await loadDay()
    } else {
      // A refusal is worth another try — the person moves closer and goes
      // again — so the scanner is let loose once more.
      sent.current = false
      if (navigator.vibrate) navigator.vibrate(200)
    }
  }

  async function saveReason() {
    if (!pending || reason.trim().length < 3) return
    setBusy(true)
    const { data, error } = await supabase.rpc('scan_reason', { p_scan: pending.id, p_reason: reason.trim() })
    setBusy(false)
    const r = data as { ok: boolean; reason?: string } | null
    if (error || !r?.ok) return setResult({ ok: false, reason: error?.message ?? r?.reason ?? 'Not saved.' })
    setSaved(true)
    setPending(null)
    setReason('')
  }

  function again() {
    setResult(null)
    setWait(null)
    setSaved(false)
    sent.current = false
    startCamera()
  }

  // ── what the dots say ──────────────────────────────────────────────────

  const nearest = (() => {
    if (!fix || sites.length === 0) return null
    const withD = sites.map((s) => ({ s, d: metresBetween(s.lat, s.lng, fix.lat, fix.lng) }))
    return withD.sort((a, b) => a.d - b.d)[0]
  })()
  const inside = nearest ? nearest.d - (fix?.accuracy ?? 0) <= nearest.s.radius_m : null

  const Dot = ({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) => (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          ok === null ? 'bg-gray-600' : ok ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="min-w-0">
        <span className="block text-xs text-gray-300">{label}</span>
        {hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
      </span>
    </div>
  )

  // ── screens ────────────────────────────────────────────────────────────

  // 1. A scan that worked
  if (result?.ok) {
    return (
      <Shell me={me}>
        <div className="flex flex-col items-center py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15">
            <Check size={40} className="text-green-400" />
          </div>
          <p className="mt-5 text-3xl font-bold text-white">{result.kind}</p>
          <p className="mt-1 text-lg text-gray-300">{result.at}</p>
          {result.site && <p className="mt-1 text-sm text-gray-500">{result.site}</p>}
          {result.repeat && <p className="mt-3 text-xs text-gray-500">Already scanned a moment ago — nothing new was added.</p>}

          {result.message && !saved && (
            <div className="mt-6 w-full rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-left">
              <p className="text-sm text-amber-200">{result.message}</p>
              {pending && (
                <>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Traffic at Kalawad road"
                    className="mt-3 w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none"
                  />
                  <button
                    onClick={saveReason}
                    disabled={busy || reason.trim().length < 3}
                    className="mt-2 w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Send reason'}
                  </button>
                  <p className="mt-2 text-[11px] text-amber-200/70">
                    Your scan is already counted. The reason goes with it.
                  </p>
                </>
              )}
            </div>
          )}

          {saved && (
            <p className="mt-5 flex items-center gap-2 text-sm text-green-400">
              <Check size={15} /> Reason sent. Thank you.
            </p>
          )}

          <DayStrip today={today} />

          {result.kind === 'Out' ? (
            <p className="mt-6 text-sm text-gray-400">Day complete — see you tomorrow.</p>
          ) : (
            <button onClick={again} className="mt-6 rounded-lg border border-[#2a2a2a] px-4 py-2 text-sm text-gray-300">
              Scan again
            </button>
          )}
        </div>
      </Shell>
    )
  }

  // 2. A scan that was refused
  if (result && !result.ok) {
    return (
      <Shell me={me}>
        <div className="flex flex-col items-center py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15">
            <X size={40} className="text-red-400" />
          </div>
          <p className="mt-5 text-lg font-medium text-white">Not counted</p>
          <p className="mt-2 max-w-sm text-sm text-gray-300">{result.reason}</p>

          <button onClick={again} className="mt-6 flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-black">
            <RefreshCw size={15} /> Try again
          </button>
          <p className="mt-4 max-w-sm text-xs text-gray-500">
            Still stuck? Tell HR what this screen says — every attempt, and the reason it was refused, is already
            on their screen.
          </p>
        </div>
      </Shell>
    )
  }

  // 3. The day is over
  if (dayDone) {
    return (
      <Shell me={me}>
        <div className="py-10 text-center">
          <p className="text-2xl font-bold text-white">Day complete</p>
          <p className="mt-1 text-sm text-gray-400">
            {clock(today?.in ?? null)} to {clock(today?.out ?? null)} · {hhmm(today?.minutes ?? 0)} worked
          </p>
          <DayStrip today={today} />
          <p className="mt-8 text-xs text-gray-600">See you tomorrow.</p>
        </div>
      </Shell>
    )
  }

  // 4. The scanner
  return (
    <Shell me={me}>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#242424] bg-black">
        <div className="relative aspect-square w-full">
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          <canvas ref={canvas} className="hidden" />

          {/* the frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[62%] w-[62%] rounded-2xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>

          {camState === 'off' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#111] px-6 text-center">
              <Camera size={28} className="text-gray-500" />
              <p className="text-sm text-gray-300">The camera is not open</p>
              <p className="text-xs text-gray-500">
                Allow the camera for this site, then press below. On Android: the lock icon next to the address →
                Permissions → Camera. On iPhone: Settings → Safari → Camera.
              </p>
              <button onClick={startCamera} className="mt-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black">
                Open the camera
              </button>
            </div>
          )}

          {torch !== null && camState === 'on' && (
            <button
              onClick={flipTorch}
              aria-label="Torch"
              className="absolute bottom-3 right-3 rounded-full bg-black/60 p-3 text-white backdrop-blur"
            >
              {torch ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>
          )}

          {(busy || wait) && (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-4 py-3 text-sm text-white backdrop-blur">
              <Loader2 size={15} className="animate-spin" />
              {wait ?? 'Sending…'}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-lg font-semibold text-white">{want.label}</p>
      <p className="mt-1 text-center text-xs text-gray-500">
        Hold the phone up to the poster &mdash; or point your phone&rsquo;s own camera at it
      </p>

      {/* No BarcodeDetector (iPhone, older browsers) — the camera still
          shows, so a person can line the code up, but nothing will read it.
          Saying so beats a scanner that silently never fires. */}
      {camState === 'on' && !(window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector && (
        <p className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-center text-xs text-amber-200">
          This browser cannot read a QR code from inside a page. Use your phone&rsquo;s own camera on the poster
          instead &mdash; it opens this page with the code already read.
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-[#242424] bg-[#151515] p-4">
        <Dot
          ok={locState === 'ok' ? true : locState === 'asking' ? null : false}
          label="Location"
          hint={
            locState === 'off' ? 'Switch it on' :
            locState === 'weak' ? `±${Math.round(fix?.accuracy ?? 0)} m` :
            locState === 'asking' ? 'Looking…' : 'Ready'
          }
        />
        <Dot
          ok={inside}
          label="At the place"
          hint={nearest ? `${Math.round(nearest.d)} m from ${nearest.s.name}` : 'Waiting for location'}
        />
        <Dot ok={camState === 'on' ? true : camState === 'asking' ? null : false} label="Camera" hint={camState === 'on' ? 'Ready' : 'Not open'} />
      </div>

      <p className="mt-3 text-center text-[11px] text-gray-600">
        Your location is read only at the moment you scan. You are not tracked through the day.
      </p>

      <DayStrip today={today} />
    </Shell>
  )
}

// ── the frame around every screen ────────────────────────────────────────

function Shell({ me, children }: { me: { name: string; code: string } | null; children: React.ReactNode }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-[#0f0f0f] px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs tracking-[0.2em] text-orange-500">JK BRANDOS</p>
            <p className="mt-1 text-sm text-gray-300">{me?.name ?? '—'}</p>
            <p className="font-mono text-xs text-gray-600">{me?.code ?? ''}</p>
          </div>
          <p className="tabular-nums text-2xl font-semibold text-white">
            {now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── today, in one line ───────────────────────────────────────────────────

function DayStrip({ today }: { today: Today | null }) {
  if (!today) return null
  const cell = (icon: React.ReactNode, label: string, value: string | null) => (
    <div className="min-w-0 flex-1 text-center">
      <p className="flex items-center justify-center gap-1 text-[11px] text-gray-500">{icon} {label}</p>
      <p className="mt-0.5 truncate text-sm tabular-nums text-white">{value ?? '—'}</p>
    </div>
  )
  return (
    <>
      <div className="mt-6 flex gap-2 rounded-xl border border-[#242424] bg-[#151515] px-3 py-3">
        {cell(<Check size={11} />, 'In', clock(today.in))}
        {cell(<Coffee size={11} />, 'Lunch', clock(today.lunchOut))}
        {cell(<LogOut size={11} />, 'Out', clock(today.out))}
        {cell(<Clock size={11} />, 'Worked', today.in ? hhmm(today.minutes) : null)}
      </div>
      <p className="mt-2 text-center text-xs text-gray-500">
        This month: {today.daysThisMonth} {today.daysThisMonth === 1 ? 'day' : 'days'} present
      </p>
    </>
  )
}