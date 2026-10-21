// src/components/attendance/ScanSetup.tsx
//
// HR's one page for the QR attendance: where the posters hang, the codes,
// who scans, which phones are allowed, today's attempts, and scan health.
//
// Needs one package for the QR image:  npm i qrcode   (see QrPoster.tsx)
//
// Everything on this page goes through an RPC from Hr_HR5. None of it
// writes to a table directly: the token must be made where nobody can
// watch, the old code must land in history in the same breath as the new
// one is issued, and nobody may approve their own phone. Those are rules,
// not screen behaviour, so they live in the database and this page only
// asks.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  MapPin, QrCode, Users, Smartphone, ListChecks, Activity, Crosshair,
  Printer, RefreshCw, ChevronDown, Check, X, AlertCircle, CheckCircle2,
  Plus, Loader2, Ban, type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../lib/permissions'
import { PosterSheet, QrImage, type PosterInfo } from './QrPoster'

// ── types ────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string }
type Site = {
  id: string
  branch_id: string
  name: string
  lat: number
  lng: number
  radius_m: number
  accuracy_max_m: number
  qr_no: number
  is_active: boolean
}
type Person = {
  id: string
  emp_code: string
  full_name: string
  branch_id: string | null
  mobile_scan: boolean
  is_active: boolean
}
type Device = {
  id: string
  user_id: string
  device_key: string
  device_name: string | null
  status: 'Waiting' | 'Approved' | 'Blocked'
  first_seen: string
  last_seen: string
}
type Scan = {
  id: string
  at: string
  emp_code: string
  full_name: string
  kind: string | null
  ok: boolean
  refuse_reason: string | null
  distance_m: number | null
  accuracy_m: number | null
  site: string | null
  qr_no: number | null
  late_by_min: number | null
  late_reason: string | null
  entered_by: string | null
}
type Health = {
  day: string
  people: number
  first_try_ok: number
  refused: number
  top_reason: string | null
}
type Fix = { lat: number; lng: number; accuracy: number }

// ── small helpers ────────────────────────────────────────────────────────

// Everything on screen is 12-hour. The database keeps 24-hour times
// because "09:00" cannot be misread there, but nobody in the office
// thinks in 19:00.
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  })

const day = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
  })

const metres = (m: number | null) =>
  m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`

/** Straight-line metres, the same haversine the database uses. */
function distance(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180
  return (
    6371000 * 2 *
    Math.asin(
      Math.sqrt(
        Math.sin(r(bLat - aLat) / 2) ** 2 +
          Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2,
      ),
    )
  )
}

/** A latitude and longitude out of a pasted Google Maps link or pin. */
function pinOf(text: string): { lat: number; lng: number } | null {
  const t = text.trim()
  // "@22.3039,70.8022,17z" from a maps URL, or "22.3039, 70.8022" typed in
  const m =
    t.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    t.match(/[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    t.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

/**
 * Take the spot, from twelve readings.
 *
 * A single GPS reading indoors can be eighty metres out, and the circle
 * drawn around it would then refuse people standing at the door for ever.
 * So: collect up to twelve readings, throw away the worse half, and
 * average what is left weighted by 1/accuracy² — a reading that claims
 * ±5 m counts far more than one claiming ±40 m.
 */
function takeSpot(
  onTick: (n: number, best: number) => void,
): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This device has no location.'))
      return
    }
    const got: Fix[] = []
    let done = false

    const finish = () => {
      if (done) return
      done = true
      navigator.geolocation.clearWatch(watch)
      window.clearTimeout(stop)
      if (got.length === 0) {
        reject(new Error('No location came from the device. Step near a window and try again.'))
        return
      }
      const sorted = [...got].sort((a, b) => a.accuracy - b.accuracy)
      const keep = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)))
      let wsum = 0, lat = 0, lng = 0
      for (const f of keep) {
        const w = 1 / Math.max(1, f.accuracy) ** 2
        wsum += w
        lat += f.lat * w
        lng += f.lng * w
      }
      resolve({
        lat: lat / wsum,
        lng: lng / wsum,
        accuracy: keep[keep.length - 1].accuracy,
      })
    }

    const watch = navigator.geolocation.watchPosition(
      (p) => {
        got.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy })
        onTick(got.length, Math.min(...got.map((g) => g.accuracy)))
        if (got.length >= 12) finish()
      },
      (e) => {
        if (got.length === 0) {
          navigator.geolocation.clearWatch(watch)
          window.clearTimeout(stop)
          done = true
          reject(
            new Error(
              e.code === e.PERMISSION_DENIED
                ? 'Location was not allowed. Allow it for this site and try again.'
                : 'The device could not find your location. Step near a window and try again.',
            ),
          )
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    )

    // Twelve readings or twenty seconds, whichever comes first.
    const stop = window.setTimeout(finish, 20000)
  })
}


// Fold and Switch sit out here on purpose.
//
// Declared inside ScanSetup they would be a NEW component type on every
// render, so React would unmount and rebuild the whole section each time —
// and the search box inside one of them would lose focus on every
// keystroke. App.tsx carries the same note about Guard.

function Fold({
  title, icon: Icon, summary, open, onToggle, children,
}: {
  title: string
  icon: LucideIcon
  summary: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#242424] bg-[#151515]">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-[#1a1a1a]"
      >
        <Icon size={16} className="shrink-0 text-orange-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-white">{title}</span>
          <span className="block truncate text-xs text-gray-500">{summary}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-gray-500 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="border-t border-[#242424] px-5 py-5">{children}</div>}
    </section>
  )
}

function Switch({
  on, onClick, label, disabled,
}: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${
        on ? 'bg-orange-500' : 'bg-[#2a2a2a]'
      }`}
    >
      <span className={`h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

// ── the page ─────────────────────────────────────────────────────────────

export default function ScanSetup() {
  const { can, ready, isSuper } = usePermissions()

  const [branches, setBranches] = useState<Branch[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [scans, setScans] = useState<Scan[]>([])
  const [health, setHealth] = useState<Health[]>([])

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [open, setOpen] = useState<string[]>(['Where the posters hang'])

  // the place being edited
  const [editSite, setEditSite] = useState<Site | 'new' | null>(null)
  const [form, setForm] = useState({
    branch_id: '', name: '', lat: '', lng: '', radius_m: '30', accuracy_max_m: '40',
  })
  const [spotting, setSpotting] = useState<{ n: number; best: number } | null>(null)
  const [pin, setPin] = useState('')
  const [test, setTest] = useState<string | null>(null)

  // printing
  const [poster, setPoster] = useState<{ info: PosterInfo; paper: 'A4' | 'A5' } | null>(null)
  const [codeFor, setCodeFor] = useState<Record<string, string>>({})

  const [peopleQ, setPeopleQ] = useState('')
  const [scanDate, setScanDate] = useState('')   // blank = today

  const mounted = useRef(true)
  // Set on the way IN as well as cleared on the way out. React 18 runs
  // effects twice in dev (mount, clean up, mount again); clearing only on
  // cleanup leaves this false for ever, and then every load() throws its
  // own answer away and the page sits there empty with no error.
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const say = (kind: 'ok' | 'bad', text: string) => setNote({ kind, text })

  const load = useCallback(async () => {
    setLoading(true)
    const [b, s, p, d, sc, h] = await Promise.all([
      supabase.from('branches').select('id, name').order('name'),
      supabase
        .from('branch_sites')
        .select('id, branch_id, name, lat, lng, radius_m, accuracy_max_m, qr_no, is_active')
        .order('name'),
      supabase
        .from('profiles')
        .select('id, emp_code, full_name, branch_id, mobile_scan, is_active')
        .eq('is_active', true)
        .order('emp_code'),
      supabase
        .from('devices')
        .select('id, user_id, device_key, device_name, status, first_seen, last_seen')
        .order('first_seen', { ascending: false }),
      supabase.rpc('scans_of_day', scanDate ? { p_date: scanDate } : {}),
      supabase.rpc('scan_health', { p_days: 7 }),
    ])
    if (!mounted.current) return
    const err = b.error ?? s.error ?? p.error ?? d.error ?? sc.error ?? h.error
    if (err) say('bad', err.message)
    setBranches(b.data ?? [])
    setSites((s.data ?? []) as Site[])
    setPeople((p.data ?? []) as Person[])
    setDevices((d.data ?? []) as Device[])
    setScans((sc.data ?? []) as Scan[])
    setHealth((h.data ?? []) as Health[])
    setLoading(false)
  }, [scanDate])

  // `ready`, never `can` — usePermissions() hands back a NEW `can` on every
  // render, so a dependency on it reloads the page for ever.
  useEffect(() => {
    if (ready) load()
  }, [ready, load])

  // isSuper as well as the key: a super admin is never locked out of
  // their own setup page by a missing role default.
  const mayEdit = isSuper || can('scan_setup')

  // ── actions ────────────────────────────────────────────────────────────

  async function rpc(fn: string, args: Record<string, unknown>, okText?: string) {
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { say('bad', error.message); return null }
    const r = data as { ok?: boolean; reason?: string; warn?: string } | null
    if (r && r.ok === false) { say('bad', r.reason ?? 'That did not work.'); return null }
    if (r?.warn) say('bad', r.warn)            // a warning is not a success
    else if (okText) say('ok', okText)
    await load()
    return r
  }

  function openSite(s: Site | 'new') {
    setEditSite(s)
    setTest(null)
    setPin('')
    setForm(
      s === 'new'
        ? { branch_id: branches[0]?.id ?? '', name: '', lat: '', lng: '', radius_m: '30', accuracy_max_m: '40' }
        : {
            branch_id: s.branch_id,
            name: s.name,
            lat: String(s.lat),
            lng: String(s.lng),
            radius_m: String(s.radius_m),
            accuracy_max_m: String(s.accuracy_max_m),
          },
    )
  }

  async function saveSite() {
    const lat = Number(form.lat), lng = Number(form.lng)
    if (!form.name.trim()) return say('bad', 'Give the place a name.')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return say('bad', 'Take the spot, or paste a map pin.')
    const r = await rpc('site_save', {
      p_site: editSite === 'new' ? null : editSite?.id,
      p_branch: editSite === 'new' ? form.branch_id : null,
      p_name: form.name.trim(),
      p_lat: lat,
      p_lng: lng,
      p_radius: Number(form.radius_m) || 30,
      p_accuracy: Number(form.accuracy_max_m) || 40,
    }, editSite === 'new' ? 'Place added. Print its posters next.' : 'Place saved.')
    if (r) setEditSite(null)
  }

  async function spot() {
    setSpotting({ n: 0, best: 0 })
    try {
      const f = await takeSpot((n, best) => setSpotting({ n, best }))
      setForm((x) => ({ ...x, lat: f.lat.toFixed(6), lng: f.lng.toFixed(6) }))
      say('ok', `Spot taken, give or take ${Math.round(f.accuracy)} m.`)
    } catch (e) {
      say('bad', e instanceof Error ? e.message : String(e))
    } finally {
      setSpotting(null)
    }
  }

  function usePin() {
    const p = pinOf(pin)
    if (!p) return say('bad', 'That does not look like a map pin. Paste a Google Maps link, or "22.3039, 70.8022".')
    setForm((x) => ({ ...x, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }))
    say('ok', 'Pin taken.')
  }

  /**
   * A rehearsal, not the real check. The real one runs in record_scan on
   * the server, where a changed app cannot reach it. This only answers
   * "would a phone standing here get in", which is what HR needs while
   * deciding where to hang the poster.
   */
  async function testHere() {
    const lat = Number(form.lat), lng = Number(form.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return say('bad', 'Take the spot first.')
    setTest('Finding your location…')
    try {
      const f = await takeSpot(() => {})
      const d = distance(lat, lng, f.lat, f.lng)
      const radius = Number(form.radius_m) || 30
      const limit = Number(form.accuracy_max_m) || 40
      if (f.accuracy > limit) {
        setTest(`Your GPS says ±${Math.round(f.accuracy)} m, over the ${limit} m limit — a scan from here would be refused for that alone.`)
      } else if (d - f.accuracy > radius) {
        setTest(`${metres(d)} away. A scan from here would be refused.`)
      } else {
        setTest(`${metres(d)} away, ±${Math.round(f.accuracy)} m. A scan from here would work.`)
      }
    } catch (e) {
      setTest(e instanceof Error ? e.message : String(e))
    }
  }

  async function showCode(site: Site) {
    const { data, error } = await supabase.rpc('site_qr', { p_site: site.id })
    if (error) return say('bad', error.message)
    const r = data as { ok: boolean; reason?: string; payload?: string }
    if (!r?.ok || !r.payload) return say('bad', r?.reason ?? 'The code could not be read.')
    setCodeFor((m) => ({ ...m, [site.id]: r.payload as string }))
  }

  async function print(site: Site, paper: 'A4' | 'A5') {
    const { data, error } = await supabase.rpc('site_qr', { p_site: site.id })
    if (error) return say('bad', error.message)
    const r = data as { ok: boolean; reason?: string; payload?: string; branch?: string }
    if (!r?.ok || !r.payload) return say('bad', r?.reason ?? 'The code could not be read.')
    setPoster({
      paper,
      info: {
        payload: r.payload,
        place: site.name,
        branch: r.branch ?? '',
        codeNo: site.qr_no,
        radiusM: site.radius_m,
      },
    })
  }

  async function newCode(site: Site) {
    const ok = window.confirm(
      `New code for ${site.name}?\n\n` +
        'Every printed poster and every photo of the old one stops working the moment you do this. ' +
        'Print and put up the new posters straight away.',
    )
    if (!ok) return
    const r = await rpc('site_new_code', { p_site: site.id })
    if (r) {
      say('ok', `New code made. Print the posters for ${site.name} now.`)
      setCodeFor((m) => {
        const c = { ...m }
        delete c[site.id]
        return c
      })
    }
  }

  // ── pieces ─────────────────────────────────────────────────────────────

  const input =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-orange-500 focus:outline-none'

  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name ?? 'Someone'
  const branchOf = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—'

  const waiting = devices.filter((d) => d.status === 'Waiting')
  const scanOn = people.filter((p) => p.mobile_scan).length
  const noBranch = people.filter((p) => p.mobile_scan && !p.branch_id)
  const refusedToday = scans.filter((s) => !s.ok).length

  if (ready && !mayEdit) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#242424] bg-[#151515] p-8 text-center">
        <p className="font-medium text-white">Scan setup is not switched on for you</p>
        <p className="mt-2 text-sm text-gray-400">
          Ask the super admin to open Employees, find your name, and switch on "QR posters &amp; devices".
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      {poster && <PosterSheet info={poster.info} paper={poster.paper} onDone={() => setPoster(null)} />}

      <h1 className="text-2xl font-bold">Scan setup</h1>
      <p className="mt-1 text-sm text-gray-400">
        Where the posters hang, who scans, and which phones are allowed.
      </p>

      {/* The one thing that stops a person scanning while looking right at
          the poster, said here rather than found out on the first morning. */}
      {noBranch.length > 0 && (
        <div className="mt-5 rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <p className="font-medium">
            {noBranch.length === 1 ? '1 person has' : `${noBranch.length} people have`} scan on but no branch
          </p>
          <p className="mt-1 text-xs opacity-90">
            {noBranch.map((p) => p.full_name).join(', ')} — the shift and the poster both come from the branch, so
            they will be refused at the gate. Set it in Employees, or switch their scan off below.
          </p>
        </div>
      )}

      {note && (
        <div
          className={`mt-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            note.kind === 'ok'
              ? 'border-green-900 bg-green-950/40 text-green-300'
              : 'border-red-900 bg-red-950/40 text-red-300'
          }`}
        >
          {note.kind === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
          <span className="min-w-0 flex-1">{note.text}</span>
          <button onClick={() => setNote(null)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      <div className={`mt-6 space-y-3 ${loading ? 'opacity-50' : ''}`}>
        {/* ── places ─────────────────────────────────────────────────── */}
        <Fold
          title="Where the posters hang"
          open={open.includes('Where the posters hang')}
          onToggle={() => setOpen((l) => (l.includes('Where the posters hang') ? l.filter((t) => t !== 'Where the posters hang') : [...l, 'Where the posters hang']))}
          icon={MapPin}
          summary={
            sites.length === 0
              ? 'No place yet — nobody can scan until there is one'
              : `${sites.length} place${sites.length > 1 ? 's' : ''}: ${sites.map((s) => s.name).join(', ')}`
          }
        >
          {sites.length === 0 && (
            <p className="mb-4 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              Add the place first. Stand inside the office when you take the spot — a pin dropped from a desk
              chair somewhere else is how a 30 m circle ends up on the wrong side of the road.
            </p>
          )}

          <ul className="space-y-2">
            {sites.map((s) => (
              <li key={s.id} className="rounded-xl border border-[#242424] bg-[#121212] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-gray-500">{branchOf(s.branch_id)}</span>
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)} · inside {s.radius_m} m · GPS limit {s.accuracy_max_m} m ·
                      code #{s.qr_no}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => openSite(s)} className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white">
                      Edit
                    </button>
                    <button onClick={() => (codeFor[s.id] ? setCodeFor((m) => { const c = { ...m }; delete c[s.id]; return c }) : showCode(s))}
                      className="flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-xs text-gray-300 hover:text-white">
                      <QrCode size={13} /> {codeFor[s.id] ? 'Hide code' : 'Show code'}
                    </button>
                    <button onClick={() => print(s, 'A4')} className="flex items-center gap-1.5 rounded-lg border border-orange-500/60 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10">
                      <Printer size={13} /> A4
                    </button>
                    <button onClick={() => print(s, 'A5')} className="flex items-center gap-1.5 rounded-lg border border-orange-500/60 px-3 py-1.5 text-xs text-orange-400 hover:bg-orange-500/10">
                      <Printer size={13} /> A5
                    </button>
                    <button onClick={() => newCode(s)} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50">
                      <RefreshCw size={13} /> New code
                    </button>
                  </div>
                </div>

                {codeFor[s.id] && (
                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[#242424] pt-4">
                    <div className="rounded-lg bg-white p-2">
                      <QrImage payload={codeFor[s.id]} size={150} />
                    </div>
                    <p className="max-w-sm text-xs text-gray-500">
                      This is the code on the poster. Printing gives two sheets — one for the entrance and one for
                      inside, because the morning queue and the going-home queue are not in the same place.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <button onClick={() => openSite('new')} className="mt-3 flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
            <Plus size={15} /> Add a place
          </button>
        </Fold>

        {/* ── who scans ──────────────────────────────────────────────── */}
        <Fold
          title="Who scans from their phone"
          open={open.includes('Who scans from their phone')}
          onToggle={() => setOpen((l) => (l.includes('Who scans from their phone') ? l.filter((t) => t !== 'Who scans from their phone') : [...l, 'Who scans from their phone']))}
          icon={Users}
          summary={`${scanOn} of ${people.length} switched on`}
        >
          <input value={peopleQ} onChange={(e) => setPeopleQ(e.target.value)} placeholder="Search name or code" className={`${input} mb-3 max-w-xs`} />
          <ul className="divide-y divide-[#1f1f1f]">
            {people
              .filter((p) => {
                const t = `${p.full_name} ${p.emp_code}`.toLowerCase()
                return !peopleQ || t.includes(peopleQ.toLowerCase())
              })
              .map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-20 shrink-0 font-mono text-xs text-gray-500">{p.emp_code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{p.full_name}</span>
                    <span className={`block text-xs ${p.branch_id ? 'text-gray-500' : 'text-amber-400'}`}>
                      {p.branch_id ? branchOf(p.branch_id) : 'No branch — cannot scan'}
                    </span>
                  </span>
                  <Switch
                    on={p.mobile_scan}
                    disabled={!mayEdit || busy}
                    label={`Scan for ${p.full_name}`}
                    onClick={() =>
                      rpc('set_mobile_scan', { p_user: p.id, p_on: !p.mobile_scan },
                        `Scan ${p.mobile_scan ? 'switched off' : 'switched on'} for ${p.full_name}.`)
                    }
                  />
                </li>
              ))}
          </ul>
        </Fold>

        {/* ── phones ─────────────────────────────────────────────────── */}
        <Fold
          title="Phones"
          open={open.includes('Phones')}
          onToggle={() => setOpen((l) => (l.includes('Phones') ? l.filter((t) => t !== 'Phones') : [...l, 'Phones']))}
          icon={Smartphone}
          summary={
            waiting.length > 0
              ? `${waiting.length} waiting for approval`
              : `${devices.filter((d) => d.status === 'Approved').length} approved, none waiting`
          }
        >
          <p className="mb-4 rounded-lg border border-[#242424] bg-[#121212] px-3 py-2 text-xs text-gray-400">
            A phone appears here the first time it tries to scan. <span className="text-gray-300">iPhone:</span> the
            icon added to the home screen keeps its own storage, so it asks to be approved a second time even after
            Safari was approved. Approve it again and it is done.
          </p>

          {devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No phone has tried to scan yet.</p>
          ) : (
            <ul className="divide-y divide-[#1f1f1f]">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-white">{nameOf(d.user_id)}</span>
                    <span className="block text-xs text-gray-500">
                      {d.device_name ?? d.device_key.slice(0, 8)} · first seen {day(d.first_seen.slice(0, 10))} {clock(d.first_seen)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      d.status === 'Approved'
                        ? 'bg-green-950/60 text-green-400'
                        : d.status === 'Blocked'
                          ? 'bg-red-950/40 text-red-400'
                          : 'bg-amber-950/50 text-amber-300'
                    }`}
                  >
                    {d.status}
                  </span>
                  <span className="flex gap-2">
                    {d.status !== 'Approved' && (
                      <button disabled={busy} onClick={() => rpc('device_set', { p_device: d.id, p_status: 'Approved' }, `${nameOf(d.user_id)}'s phone approved.`)}
                        className="flex items-center gap-1 rounded-lg border border-green-900 px-2.5 py-1 text-xs text-green-400 hover:bg-green-950/40 disabled:opacity-50">
                        <Check size={13} /> Approve
                      </button>
                    )}
                    {d.status === 'Approved' && (
                      <button disabled={busy} onClick={() => rpc('device_set', { p_device: d.id, p_status: 'Waiting' }, 'Phone set back to waiting.')}
                        className="rounded-lg border border-[#2a2a2a] px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-50">
                        Revoke
                      </button>
                    )}
                    {d.status !== 'Blocked' && (
                      <button disabled={busy} onClick={() => rpc('device_set', { p_device: d.id, p_status: 'Blocked' }, 'Phone blocked.')}
                        className="flex items-center gap-1 rounded-lg border border-red-900 px-2.5 py-1 text-xs text-red-400 hover:bg-red-950/40 disabled:opacity-50">
                        <Ban size={13} /> Block
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Fold>

        {/* ── today's attempts ───────────────────────────────────────── */}
        <Fold
          title="Scans"
          open={open.includes('Scans')}
          onToggle={() => setOpen((l) => (l.includes('Scans') ? l.filter((t) => t !== 'Scans') : [...l, 'Scans']))}
          icon={ListChecks}
          summary={
            scans.length === 0
              ? 'Nothing yet'
              : `${scans.length} attempt${scans.length > 1 ? 's' : ''}${refusedToday ? `, ${refusedToday} refused` : ''}`
          }
        >
          <div className="mb-3 flex items-center gap-2">
            <input type="date" value={scanDate} onChange={(e) => setScanDate(e.target.value)} className={`${input} max-w-[12rem]`} aria-label="Day" />
            {scanDate && (
              <button onClick={() => setScanDate('')} className="text-xs text-orange-400 hover:underline">Back to today</button>
            )}
          </div>

          {scans.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No attempt on this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[#242424] text-left text-xs text-gray-500">
                    <th className="py-2 pr-3 font-normal">Time</th>
                    <th className="py-2 pr-3 font-normal">Who</th>
                    <th className="py-2 pr-3 font-normal">What</th>
                    <th className="py-2 pr-3 font-normal">Where</th>
                    <th className="py-2 pr-3 font-normal">Why not</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s) => (
                    <tr key={s.id} className="border-b border-[#1a1a1a] last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-gray-300">{clock(s.at)}</td>
                      <td className="py-2 pr-3">
                        <span className="block text-white">{s.full_name}</span>
                        <span className="block font-mono text-xs text-gray-600">{s.emp_code}</span>
                      </td>
                      <td className="py-2 pr-3">
                        {s.ok ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded-full bg-green-950/60 px-2 py-0.5 text-xs text-green-400">{s.kind}</span>
                            {s.entered_by && <span className="text-xs text-gray-500">by {s.entered_by}</span>}
                            {s.late_by_min ? <span className="text-xs text-amber-400">{s.late_by_min}m late</span> : null}
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-950/40 px-2 py-0.5 text-xs text-red-400">Refused</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-500">
                        {s.site ?? '—'}
                        {s.distance_m != null && <> · {metres(s.distance_m)}</>}
                        {s.accuracy_m != null && <> · ±{Math.round(s.accuracy_m)} m</>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-400">
                        {s.refuse_reason ?? (s.late_reason ? <span className="text-gray-500">&ldquo;{s.late_reason}&rdquo;</span> : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Fold>

        {/* ── scan health ────────────────────────────────────────────── */}
        <Fold
          title="Scan health"
          open={open.includes('Scan health')}
          onToggle={() => setOpen((l) => (l.includes('Scan health') ? l.filter((t) => t !== 'Scan health') : [...l, 'Scan health']))}
          icon={Activity}
          summary={
            health.length === 0
              ? 'Nothing to measure yet'
              : `${health[0].first_try_ok} of ${health[0].people} got in on the first try today`
          }
        >
          <p className="mb-4 text-xs text-gray-500">
            How often the day's <span className="text-gray-300">first</span> try worked. This is the number that says
            whether the trouble is Location being off, a weak GPS, or people genuinely standing too far away —
            guessing at it from complaints never works.
          </p>
          {health.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No scans in the last seven days.</p>
          ) : (
            <ul className="space-y-2">
              {health.map((h) => {
                const pct = h.people ? Math.round((h.first_try_ok / h.people) * 100) : 0
                return (
                  <li key={h.day} className="rounded-xl border border-[#242424] bg-[#121212] p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-white">{day(h.day)}</span>
                      <span className="text-xs text-gray-500">
                        {h.first_try_ok} of {h.people} first try
                        {h.refused ? ` · ${h.refused} refused` : ''}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#242424]">
                      <div
                        className={`h-full rounded-full ${pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {h.top_reason && <p className="mt-2 text-xs text-gray-500">Commonest refusal: {h.top_reason}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </Fold>
      </div>

      {/* ── the place panel ──────────────────────────────────────────── */}
      {editSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" onClick={() => !busy && setEditSite(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <aside className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#242424] bg-[#121212]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#222] bg-[#171717] px-6 py-4">
              <h2 className="font-semibold">{editSite === 'new' ? 'Add a place' : editSite.name}</h2>
              <button onClick={() => setEditSite(null)} className="rounded-lg p-2 text-gray-400 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {editSite === 'new' && (
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Branch *</span>
                  <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={input}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <span className="mt-1 block text-xs text-gray-500">
                    Only this branch's people can scan at this poster.
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-xs text-gray-400">Name *</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rajkot office" className={input} />
              </label>

              <div className="rounded-xl border border-[#242424] bg-[#151515] p-4">
                <p className="text-sm font-medium text-white">The spot</p>
                <p className="mt-1 text-xs text-gray-500">
                  Stand inside the office and take it here. Twelve readings are taken and the worse half thrown
                  away — one reading indoors can be eighty metres out, and a circle drawn around that refuses
                  people standing at the door.
                </p>

                <button onClick={spot} disabled={!!spotting} className="mt-3 flex items-center gap-2 rounded-lg border border-orange-500/60 px-3 py-2 text-sm text-orange-400 hover:bg-orange-500/10 disabled:opacity-60">
                  {spotting ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
                  {spotting ? `Reading ${spotting.n} of 12 · best ±${Math.round(spotting.best)} m` : 'I am here — take this spot'}
                </button>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-gray-400">Latitude</span>
                    <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className={`${input} font-mono text-xs`} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-gray-400">Longitude</span>
                    <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className={`${input} font-mono text-xs`} />
                  </label>
                </div>

                <div className="mt-3 flex gap-2">
                  <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="…or paste a Google Maps link" className={`${input} text-xs`} />
                  <button onClick={usePin} className="whitespace-nowrap rounded-lg border border-[#2a2a2a] px-3 text-xs text-gray-300 hover:text-white">
                    Use pin
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">Circle (metres)</span>
                  <input type="number" min={10} max={500} value={form.radius_m} onChange={(e) => setForm({ ...form, radius_m: e.target.value })} className={input} />
                  <span className="mt-1 block text-xs text-gray-500">30 suits most offices.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-gray-400">GPS limit (metres)</span>
                  <input type="number" min={10} max={200} value={form.accuracy_max_m} onChange={(e) => setForm({ ...form, accuracy_max_m: e.target.value })} className={input} />
                  <span className="mt-1 block text-xs text-gray-500">A vaguer reading than this is refused.</span>
                </label>
              </div>

              <div className="rounded-xl border border-[#242424] bg-[#151515] p-4">
                <button onClick={testHere} className="rounded-lg border border-[#2a2a2a] px-3 py-2 text-sm text-gray-300 hover:text-white">
                  Test from here
                </button>
                {test && <p className="mt-2 text-xs text-gray-400">{test}</p>}
                <p className="mt-2 text-xs text-gray-600">
                  A rehearsal only. The real check runs on the server, where a changed app cannot reach it.
                </p>
              </div>

              {editSite !== 'new' && (
                <p className="text-xs text-gray-500">
                  Moving the spot does not change the code — posters already on the wall keep working.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#222] px-6 py-4">
              <button onClick={() => setEditSite(null)} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={saveSite} disabled={busy} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? 'Saving…' : editSite === 'new' ? 'Add place' : 'Save'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}