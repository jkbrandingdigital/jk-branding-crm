import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

/*
  The private key (Fin_F10). A master unlocks with a PIN for 15
  minutes; until then they see what everyone sees. The server decides
  what is shown — this only tracks "unlocked" so a screen knows whether
  to offer Split, and reloads the page when it opens or closes so no
  screen keeps old figures.
*/

export type MasterStatus = {
  is_master: boolean
  is_super?: boolean
  has_pin?: boolean
  open?: boolean
  until?: string | null
  blocked_until?: string | null
}

type Res = { ok: true; until?: string } | { ok: false; reason: string }

let open = false
let until: number | null = null
let loaded: Promise<void> | null = null
let timer: number | undefined
const listeners = new Set<() => void>()

function set(nowOpen: boolean, untilIso?: string | null) {
  open = nowOpen
  until = nowOpen && untilIso ? new Date(untilIso).getTime() : null
  window.clearTimeout(timer)
  if (until) {
    // Closes itself when its time is up. A hidden tab reloads when it
    // is looked at again, not in the background.
    timer = window.setTimeout(() => {
      open = false; until = null
      listeners.forEach((l) => l())
      if (document.visibilityState === 'visible') window.location.reload()
      else document.addEventListener('visibilitychange', () => window.location.reload(), { once: true })
    }, Math.max(until - Date.now(), 0))
  }
  listeners.forEach((l) => l())
}

export async function masterStatus(): Promise<MasterStatus> {
  const { data, error } = await supabase.rpc('master_status')
  if (error) {
    console.error('master_status failed:', error.message)
    return { is_master: false }
  }
  if (!data) return { is_master: false }
  const s = data as MasterStatus
  set(!!s.open, s.until)
  return s
}

// Once per page load, and only for screens that ask.
function loadOnce() {
  if (!loaded) loaded = masterStatus().then(() => undefined)
  return loaded
}

export function useMaster(): { open: boolean; until: number | null } {
  useEffect(() => { void loadOnce() }, [])
  const o = useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => open,
  )
  return { open: o, until }
}

async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<Res> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: error.message }
  const r = (data ?? {}) as { ok?: boolean; reason?: string; until?: string }
  return r.ok ? { ok: true, until: r.until } : { ok: false, reason: r.reason ?? 'That did not go through.' }
}

export const masterUnlock = (pin: string) => rpc('master_unlock', { p_pin: pin })
export const masterSetPin = (oldPin: string | null, newPin: string) =>
  rpc('master_set_pin', { p_old: oldPin, p_new: newPin })

export async function masterLock() {
  await supabase.rpc('master_lock')
  set(false)
}

export type MasterPerson = { id: string; name: string | null; code: string | null; master: boolean; has_pin: boolean; me: boolean }

async function people(fn: string, args: Record<string, unknown> = {}): Promise<{ ok: true; people: MasterPerson[] } | { ok: false; reason: string }> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) return { ok: false, reason: error.message }
  const r = (data ?? {}) as { ok?: boolean; reason?: string; people?: MasterPerson[] }
  return r.ok ? { ok: true, people: r.people ?? [] } : { ok: false, reason: r.reason ?? 'That did not go through.' }
}

export const masterPeople = () => people('master_people')
// Super Admin: give a key with its PIN, or a new PIN on a key (Fin_F11).
export const masterGive = (user: string, pin: string) => people('master_give', { p_user: user, p_pin: pin })
export const masterRemove = (user: string) => people('master_grant', { p_user: user, p_on: false })