import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Perms = Record<string, boolean>

/*
  ── Read once, shared by everyone ──

  This used to live inside the hook, so every component that called
  usePermissions() asked the server for itself: getUser() and then
  my_permissions, on mount, and again on INITIAL_SESSION — twice each.
  A page with the layout, the header, the board, the bell and a timer
  button is eight components, so one page load was sixteen requests for
  one answer. The Supabase logs show it plainly: eight /auth/v1/user and
  eight my_permissions inside the same second, from the same browser.
  Across 31 people all day, that was most of the project's log quota.

  Now the answer is kept here, at module level, and fetched once. Every
  hook reads the same copy and is told when it changes.

  It is fetched again only when the person changes — signing in as
  someone else, or signing out. Not on SIGNED_IN as such: supabase-js
  fires SIGNED_IN every time the tab regains focus, and re-reading the
  rights on every alt-tab was another quiet stream of requests.

  getSession(), not getUser(). getUser() asks the auth server every
  time; getSession() reads the session the browser already holds. For
  "who is this, and what may the screen show them" that is enough — the
  real check is RLS on the server, which sees the token either way.
*/
let cache: Perms | null = null
let cacheUser: string | null | undefined = undefined
let inflight: Promise<void> | null = null
let started = false
const listeners = new Set<(p: Perms | null) => void>()

function publish(p: Perms, uid: string | null) {
  cache = p
  cacheUser = uid
  listeners.forEach((l) => l(p))
}

function load(force = false): Promise<void> {
  if (inflight && !force) return inflight
  const p = (async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id ?? null
    if (!uid) {
      publish({}, null)
      return
    }
    if (!force && uid === cacheUser && cache) return
    const { data } = await supabase.rpc('my_permissions')
    /*
      Is it still the same person? The answer is published only if the
      session now belongs to whoever it was asked for — so rights read
      for someone who signed out mid-request are never shown to the
      next person.

      This replaced a generation counter, and the counter was a bug:
      INITIAL_SESSION arrives just after the first request leaves, it
      counted as "a different person", and the first answer was thrown
      away — with nothing asked again, because the request it was
      waiting on was that same one. Every screen sat on "Loading…".
      Checking the person, not counting events, cannot do that.
    */
    const { data: { session: now } } = await supabase.auth.getSession()
    if ((now?.user?.id ?? null) === uid) publish((data as Perms) ?? {}, uid)
  })()
  inflight = p
  p.finally(() => { if (inflight === p) inflight = null })
  return p
}

function start() {
  if (started) return
  started = true
  // One listener for the whole app, not one per component.
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null
    if (event === 'SIGNED_OUT') {
      publish({}, null)
      return
    }
    // Only a different person is worth a request. setTimeout keeps the
    // Supabase client out of its own callback. If a request is already
    // on its way it is let finish first, and only then is the person
    // checked again — usually it was for this same person, and nothing
    // more needs asking.
    if (uid !== cacheUser) {
      setTimeout(() => {
        const after = inflight ?? Promise.resolve()
        void after.then(() => { if (uid !== cacheUser) void load() })
      }, 0)
    }
  })
}

/*
  For a screen that has just changed the logged-in person's own rights
  and needs them back now, without a reload. Nothing calls it yet; it is
  here so that the day something does, it is one line.
*/
export function refreshPermissions() {
  return load(true)
}

// Logged-in user's rights (role defaults + personal toggles).
//
//  all          → Super Admin. Everything, always.
//  is_subadmin  → may open the admin area. It is NOT a master key:
//                 what they find inside is decided switch by switch,
//                 from Employees → "What they can open".
export function usePermissions() {
  const [perms, setPerms] = useState<Perms | null>(cache)

  useEffect(() => {
    start()
    listeners.add(setPerms)
    if (cache === null) void load()
    else setPerms(cache)
    return () => { listeners.delete(setPerms) }
  }, [])

  const isSuper = perms?.all === true
  const isSubAdmin = perms?.is_subadmin === true
  const can = (key: string) => !!perms && (perms.all === true || perms[key] === true)

  return {
    perms,
    can,
    ready: perms !== null,
    isSuper,
    isSubAdmin,
    // Who gets the admin sidebar at all
    adminArea: isSuper || isSubAdmin,
  }
}

// The person's own side of the CRM — their daily work, whatever extra
// admin rights they may also have.
//
// Every role in app_role needs a line here. The last one is a fallback,
// and a role that falls through to it lands on a path with no routes —
// which sends it straight back here, for ever.
export const ownHome = (role: string | null | undefined) =>
  role === 'super_admin' ? '/admin'
  : role === 'hr' ? '/hr'
  : role === 'branch_manager' ? '/manager'
  : role === 'design_team' ? '/design'
  : role === 'dispatch' ? '/dispatch'
  : role === 'accounts' ? '/accounts'
  : role === 'reception' ? '/reception'
  : '/sales'

// Every right the app knows about, grouped for the toggles screen
export const PERMISSION_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  {
    title: 'Leads',
    items: [
      { key: 'lead_view_all', label: 'View all leads' },
      { key: 'lead_create', label: 'Add lead' },
      { key: 'lead_edit', label: 'Edit lead' },
      { key: 'lead_delete', label: 'Delete lead' },
      { key: 'lead_assign', label: 'Transfer / assign' },
      { key: 'lead_export', label: 'Export' },
      { key: 'lead_import', label: 'Import' },
      { key: 'lead_settings', label: 'Lead settings' },
    ],
  },
  {
    title: 'Job Work & Dispatch',
    items: [
      { key: 'mod_job_works', label: 'Job Work Orders' },
      { key: 'job_work_create', label: 'Open a job work' },
      { key: 'job_work_edit', label: 'Change any job work' },
      { key: 'job_work_delete', label: 'Delete a job work' },
      { key: 'job_work_view_all', label: "See everyone's job work" },
      { key: 'job_work_view_branch', label: "See the branch's job work" },
      { key: 'job_work_payment', label: 'Vendor payment' },
      // These three are given person by person, not by role. Whoever
      // checks the goods gets them, whether they sit in sales, in design
      // or in dispatch — the work is the same either way.
      { key: 'mod_dispatch', label: 'Dispatch & QC' },
      { key: 'dispatch_qc', label: 'Record quality check' },
      { key: 'dispatch_courier', label: 'Add courier & LR number' },
    ],
  },
]