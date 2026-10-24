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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Camera, Check, X, Loader2, RefreshCw, Zap, ZapOff, QrCode, MapPin,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { says, BUTTON_WORDS } from './words'
import { istDate } from '../../lib/format'

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

const longDate = () =>
  new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long',
  })

const initials = (name?: string) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '—'

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

/**
 * What this person could scan next, best guess first.
 *
 * This used to answer with ONE kind, and after 'In' that one kind was
 * always 'Out' — so the second scan of the day sent everybody home at
 * lunchtime. The lunch kinds existed in the database and record_scan()
 * accepted them; the phone simply never asked for one.
 *
 * A normal day is four scans: in, out for lunch, back, home. So after
 * 'In' the first guess is lunch — but leaving early is a real thing, so
 * the other choices are on the screen too rather than hidden behind a
 * guess. Nobody should have to fight a default at a gate.
 */
function choices(t: Today | null): { kind: Kind; label: string }[] {
  const last = t?.lastKind ?? null
  if (!last) return [{ kind: 'In', label: BUTTON_WORDS.In }]
  if (last === 'Lunch out') return [{ kind: 'Lunch in', label: BUTTON_WORDS['Lunch in'] }]
  if (last === 'Step out') return [{ kind: 'Back', label: BUTTON_WORDS.Back }]

  const out = { kind: 'Out' as Kind, label: BUTTON_WORDS.Out }
  const step = { kind: 'Step out' as Kind, label: BUTTON_WORDS['Step out'] }
  const lunch = { kind: 'Lunch out' as Kind, label: BUTTON_WORDS['Lunch out'] }

  // Lunch is only offered once a day, and only before it has been taken.
  const lunchDone = Boolean(t?.lunchOut)
  if (last === 'In' && !lunchDone) return [lunch, step, out]
  return [out, step]
}

// ── the page ─────────────────────────────────────────────────────────────

export default function ScanPage() {
  const [pick, setPick] = useState<Kind | null>(null)
  const pickRef = useRef<Kind>('In')
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
  const [wait, setWait] = useState<string | null>(null)
  // The camera is a sheet over the card, opened by the button, so it is
  // not running while somebody is only looking at their times.
  const [scanning, setScanning] = useState(false)
  const [now, setNow] = useState(new Date())

  const opts = choices(today)
  const want = opts.find((o) => o.kind === pick) ?? opts[0]
  // send() is called from the decoder, whose closure may be several
  // renders old. It must read the choice from a ref, not from `want`.
  useEffect(() => { pickRef.current = want.kind }, [want.kind])
  const dayDone = today?.lastKind === 'Out'
  const hasDetector = typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== 'undefined'

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  // ── who am I, and what has today been so far ───────────────────────────

  const loadDay = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser()
    const uid = u?.user?.id
    if (!uid) return

    const [p, s, scans, month] = await Promise.all([
      supabase.from('profiles').select('full_name, emp_code').eq('id', uid).maybeSingle(),
      supabase.from('branch_sites').select('id, name, lat, lng, radius_m, accuracy_max_m').eq('is_active', true),
      // Today by the office calendar, not "the last twenty hours".
      //
      // A rolling window made yesterday evening's Out still count this
      // morning, so the app decided the day was already finished and
      // would not open the camera at all. work_date is set by the
      // database in Asia/Kolkata and is the only thing that means today.
      supabase
        .from('attendance_scans')
        .select('kind, scanned_at')
        .eq('user_id', uid).eq('ok', true)
        .eq('work_date', istDate())
        .order('scanned_at'),
      supabase.from('attendance').select('work_date, minutes_worked').eq('user_id', uid),
    ])
    if (!alive.current) return

    if (p.data) setMe({ name: p.data.full_name, code: p.data.emp_code })
    setSites((s.data ?? []) as Site[])

    const rows = (scans.data ?? []) as { kind: Kind; scanned_at: string }[]
    const first = (k: Kind) => rows.find((r) => r.kind === k)?.scanned_at ?? null
    const last = (k: Kind) => [...rows].reverse().find((r) => r.kind === k)?.scanned_at ?? null
    // Time actually INSIDE, not the gap between the first scan and the
    // last. This used to be `now − In`, which on a day with a four-hour
    // lunch still read as if the whole four hours had been worked —
    // somebody could scan out for lunch and watch the number keep
    // climbing. The database never believed it (attendance_apply has
    // taken lunch and step-outs off since Hr_HR1d); only this card did.
    //
    // So walk the day: every 'In', 'Lunch in' and 'Back' opens a
    // stretch, every 'Lunch out', 'Step out' and 'Out' closes it. A
    // stretch still open counts up to now.
    const mins = (() => {
      let total = 0
      let openFrom: number | null = null
      for (const r of rows) {
        const t = new Date(r.scanned_at).getTime()
        if (r.kind === 'In' || r.kind === 'Lunch in' || r.kind === 'Back') {
          if (openFrom === null) openFrom = t
        } else if (openFrom !== null) {
          total += t - openFrom
          openFrom = null
        }
      }
      if (openFrom !== null) total += Date.now() - openFrom
      return Math.max(0, Math.round(total / 60000))
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
    setScanning(true)     // so the sheet is up while it sends
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
    // The camera runs only while the sheet is open, and never once the
    // day is finished: a scanner still hunting after the last scan of
    // the day is a hot phone and nothing else.
    if (!scanning || dayDone || result) return
    startCamera()
  }, [scanning, dayDone, result, startCamera])

  function openScanner() {
    setResult(null)
    sent.current = false
    setScanning(true)
  }

  function closeScanner() {
    setScanning(false)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setCamState('asking')
  }

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
    if (!scanning || camState !== 'on' || busy || result) return
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
  }, [scanning, camState, busy, result])

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
      p_kind: pickRef.current,
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
      await loadDay()
    } else {
      // A refusal is worth another try — the person moves closer and goes
      // again — so the scanner is let loose once more.
      sent.current = false
      if (navigator.vibrate) navigator.vibrate(200)
    }
  }

  function again() {
    setResult(null)
    setWait(null)
    sent.current = false
    setScanning(false)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setCamState('asking')
  }

  // ── what the dots say ──────────────────────────────────────────────────

  const nearest = (() => {
    if (!fix || sites.length === 0) return null
    const withD = sites.map((s) => ({ s, d: metresBetween(s.lat, s.lng, fix.lat, fix.lng) }))
    return withD.sort((a, b) => a.d - b.d)[0]
  })()
  const inside = nearest ? nearest.d - (fix?.accuracy ?? 0) <= nearest.s.radius_m : null

  // ── screens ─────────────────────────────────────────────────────────
  //
  // The card is light; the camera and the pass are dark sheets over it.
  //
  // Not a whim: this screen is used at a gate, outdoors, at nine in the
  // morning with the sun on the phone — and a light screen is the one
  // that stays readable there. The sheets go dark so the camera picture
  // and the big green tick carry the moment without competing with a
  // bright page behind them.

  const place = nearest?.s.name ?? null

  return (
    <div className="min-h-screen bg-[#eef1f6] text-[#0f172a]">
      {/* ── the strip above the card ──────────────────────────────── */}
      <div className="mx-auto flex max-w-md items-center gap-2.5 px-5 pt-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          <QrCode size={17} className="text-orange-500" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-bold tracking-wide">JK BRANDOS</span>
          <span className="block text-[11px] text-slate-500">JK Branding · attendance</span>
        </span>
      </div>

      {/* ── the card ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-md px-5 pb-10 pt-3">
        <div className="rounded-3xl bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_12px_32px_-12px_rgba(15,23,42,0.18)]">
          <p className="text-center text-sm font-bold tracking-wide text-[#0f172a]">JK BRANDING</p>
          <p className="mt-0.5 text-center text-[11px] text-slate-500">{longDate()}</p>

          <p className="mx-auto mt-3 w-fit rounded-full bg-[#1e293b] px-6 py-2 text-2xl font-semibold tabular-nums tracking-tight text-white">
            {now.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            })}
          </p>

          {/* who you are — before the scan, not only after it */}
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#f1f5f9] px-4 py-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#1e293b] text-sm font-semibold text-white">
              {initials(me?.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold">{me?.name ?? '—'}</span>
              <span className="block text-[11px] text-slate-500">Code: {me?.code ?? '—'}</span>
            </span>
          </div>

          {/* IN · LUNCH IN · LUNCH OUT · OUT — the office's words, which
              are the reverse of the database's for the two lunch
              punches. words.ts holds that reversal, once. Lunch was
              being recorded and never shown — so a person who scanned
              out for lunch had no way of telling whether it had gone
              through, which is the one thing this card is for. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Figure label="IN" value={clock(today?.in ?? null)} />
            <Figure label="OUT" value={clock(today?.out ?? null)} />
            <Figure label="LUNCH IN" value={clock(today?.lunchOut ?? null)} />
            <Figure label="LUNCH OUT" value={clock(today?.lunchIn ?? null)} />
          </div>

          <div className="mt-2 flex items-center justify-between rounded-2xl bg-[#f1f5f9] px-4 py-3">
            <span className="text-[10px] font-medium tracking-[0.12em] text-slate-500">WORKED</span>
            <span className={`text-sm font-semibold tabular-nums ${
              today?.in ? 'text-[#0f172a]' : 'text-slate-400'}`}>
              {today?.in ? hhmm(today.minutes) : '—'}
            </span>
          </div>

          <div className="mt-7 flex justify-center">
            {dayDone ? (
              <div className="flex h-40 w-40 flex-col items-center justify-center rounded-full bg-[#f1f5f9] text-center">
                <Check size={26} className="text-green-600" />
                <p className="mt-2 px-5 text-sm font-semibold text-slate-700">Day complete</p>
                <p className="px-5 text-[11px] text-slate-500">See you tomorrow</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => { setPick(opts[0].kind); pickRef.current = opts[0].kind; openScanner() }}
                  className="h-40 w-40 rounded-full bg-orange-500 text-base font-bold uppercase leading-tight tracking-wide text-white shadow-[0_14px_38px_-8px_rgba(249,115,22,0.85)] transition active:scale-95"
                >
                  {opts[0].label}
                </button>

                {/* The other things this scan could be. Small, but on the
                    screen — a guess you cannot overrule is worse than no
                    guess. */}
                {opts.length > 1 && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {opts.slice(1).map((o) => (
                      <button
                        key={o.kind}
                        onClick={() => { setPick(o.kind); pickRef.current = o.kind; openScanner() }}
                        className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition active:scale-95"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Green only when a scan would really go through. A chip that
              is friendly whatever the truth is sends somebody to the
              poster to be refused. */}
          <div
            className={`mt-7 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium ${
              inside
                ? 'bg-green-50 text-green-700'
                : locState === 'off'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-[#f1f5f9] text-slate-500'
            }`}
          >
            <MapPin size={13} className="shrink-0" />
            {locState === 'off'
              ? 'Location is off — switch it on to scan'
              : !fix
                ? 'Finding your location…'
                : inside
                  ? `At ${place}`
                  : nearest
                    ? `${Math.round(nearest.d)} m from ${place}`
                    : 'Waiting for the office location'}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span>
              This month: <span className="font-semibold text-[#0f172a]">{today?.daysThisMonth ?? 0} days present</span>
            </span>
            {torch !== null && camState === 'on' && (
              <button onClick={flipTorch} className="flex items-center gap-1">
                {torch ? <Zap size={12} /> : <ZapOff size={12} />} Torch
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-500">
          Your location is read only at the moment you scan.<br />You are not tracked through the day.
        </p>
      </div>

      {/* ── the camera ────────────────────────────────────────────── */}
      {scanning && !result && (
        <Sheet onClose={closeScanner}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-white">{want.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Point at the office QR
                {fix ? ` · GPS ±${Math.round(fix.accuracy)} m` : ' · finding GPS…'}
              </p>
            </div>
            <button onClick={closeScanner} aria-label="Close" className="rounded-full p-2 text-slate-400 ring-1 ring-white/15">
              <X size={16} />
            </button>
          </div>

          <div className="relative mt-4 aspect-square w-full overflow-hidden rounded-2xl bg-black">
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            <canvas ref={canvas} className="hidden" />

            {/* corners, not a closed box: a box reads as "line it up
                exactly", which is not what the reader needs */}
            <div className="pointer-events-none absolute inset-0">
              {[
                'left-4 top-4 border-l-[3px] border-t-[3px] rounded-tl-xl',
                'right-4 top-4 border-r-[3px] border-t-[3px] rounded-tr-xl',
                'left-4 bottom-4 border-l-[3px] border-b-[3px] rounded-bl-xl',
                'right-4 bottom-4 border-r-[3px] border-b-[3px] rounded-br-xl',
              ].map((c) => (
                <span key={c} className={`absolute h-11 w-11 border-orange-500 ${c}`} />
              ))}
              <span className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#1e293b]/90 px-3 py-1 text-xs tabular-nums text-white">
                {now.toLocaleTimeString('en-IN', {
                  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                })}
              </span>
            </div>

            {camState === 'off' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1220] px-7 text-center">
                <Camera size={26} className="text-slate-500" />
                <p className="text-sm text-slate-200">The camera did not open</p>
                <p className="text-xs leading-relaxed text-slate-400">
                  Allow the camera for this app and try again. Android: hold the app icon → Site settings →
                  Camera. iPhone: Settings → Safari → Camera.
                </p>
                <button onClick={startCamera} className="mt-1 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white">
                  Open the camera
                </button>
              </div>
            )}

            {(busy || wait) && (
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/80 px-4 py-3 text-sm text-white backdrop-blur">
                <Loader2 size={15} className="animate-spin text-orange-400" />
                {wait ?? 'Sending…'}
              </div>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-slate-400">Hold steady — it reads by itself.</p>

          {!hasDetector && (
            <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-center text-[11px] leading-relaxed text-amber-300">
              This browser cannot read a QR from inside a page. Use your phone&rsquo;s own camera on the poster
              instead — it opens this app with the code already read.
            </p>
          )}
        </Sheet>
      )}

      {/* ── the pass ──────────────────────────────────────────────── */}
      {result?.ok && (
        <Sheet onClose={again}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-semibold text-white">
                {result.kind === 'In' ? "You're in" : result.kind === 'Out' ? "You're out" : says(result.kind)}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {result.repeat ? 'Already scanned a moment ago.' : 'Saved to your attendance.'}
              </p>
            </div>
            <button onClick={again} aria-label="Close" className="rounded-full p-2 text-slate-400 ring-1 ring-white/15">
              <X size={16} />
            </button>
          </div>

          <div className="mt-6 flex flex-col items-center">
            <span className="grid h-24 w-24 place-items-center rounded-full bg-green-500">
              <Check size={46} className="text-white" strokeWidth={3} />
            </span>
            <p className="mt-4 text-xs uppercase tracking-[0.22em] text-slate-400">{says(result.kind)}</p>
            <p className="text-5xl font-bold tabular-nums tracking-tight text-white">{result.at}</p>
          </div>

          <div className="mt-5 rounded-2xl bg-white/5 px-4 py-3 text-center ring-1 ring-white/10">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-orange-400">JK BRANDING</p>
            <p className="mt-1 text-sm font-semibold text-white">{me?.name}</p>
            <p className="text-[11px] text-slate-400">Code: {me?.code}</p>
          </div>

          <p className="mt-3 text-center text-[11px] text-slate-400">
            {result.site} · {longDate()}
          </p>

          {/* Late is told, not asked about. The minutes are already on
              HR's screen; a text box here would collect "traffic"
              twenty-two times and tell nobody anything. */}
          {result.message ? (
            <p className="mt-5 rounded-2xl bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-300">
              {result.message}
            </p>
          ) : (
            <p className="mt-5 text-center text-xl font-semibold text-orange-400">Thank you</p>
          )}

          <button onClick={again} className="mt-5 w-full rounded-2xl bg-white py-3.5 text-sm font-semibold text-[#0f172a]">
            Done
          </button>
        </Sheet>
      )}

      {/* ── a refusal ─────────────────────────────────────────────── */}
      {result && !result.ok && (
        <Sheet onClose={again}>
          <div className="flex flex-col items-center py-2 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-full bg-red-500/15">
              <X size={38} className="text-red-400" />
            </span>
            <p className="mt-4 font-semibold text-white">Not counted</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{result.reason}</p>

            <button
              onClick={again}
              className="mt-6 flex items-center gap-2 rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white"
            >
              <RefreshCw size={15} /> Try again
            </button>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              Still stuck? Tell HR exactly what this says — every attempt and its reason is already on their screen.
            </p>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────

/** One of the three figures on the card. */
function Figure({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl bg-[#f1f5f9] px-2 py-3 text-center">
      <p className="text-[10px] font-medium tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${value ? 'text-[#0f172a]' : 'text-slate-400'}`}>
        {value ?? '—'}
      </p>
    </div>
  )
}

/**
 * A dark sheet that rises over the card.
 *
 * Outside the component for the same reason Fold is in ScanSetup:
 * declared inside, it would be a new component type on every render and
 * React would rebuild its contents each time — and with a camera inside,
 * that means tearing down and restarting the video stream.
 */
function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#111c2e] p-5 pb-7 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl">
        {children}
      </div>
    </div>
  )
}