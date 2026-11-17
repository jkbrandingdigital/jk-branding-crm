import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { clearAuthCache, getUserRole, getUserProfile } from '../lib/auth'
import type { AuthState, UserRole } from '../types/index'

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  profile: null,
  loading: true,
})

/*
  ── What changed, and why ──

  This used to read the session twice on startup — once through
  getSession() and again when onAuthStateChange fired INITIAL_SESSION —
  and then read role and profile again on every auth event after that.
  supabase-js fires SIGNED_IN whenever the tab regains focus and
  TOKEN_REFRESHED every hour, so every alt-tab back to the CRM re-read
  two rows that had not changed.

  Now there is one listener. INITIAL_SESSION covers startup (supabase-js
  fires it as soon as the listener is attached), and role and profile
  are read only when the PERSON changes. A refocus or a token refresh
  just swaps in the fresh session object.

  The other change is in what happens when the read fails. It used to
  sign the person out on any error — which on a phone includes four
  seconds of bad signal at the moment the app opens. That is one of the
  ways "it keeps logging me out" happened. Now:

    · no role row at all (PGRST116) — the account really is not set up,
      so out, as before;
    · anything else — wait two seconds and try once more, and only sign
      out if that fails too.
*/

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const noRow = (e: unknown) => (e as { code?: string })?.code === 'PGRST116'

async function readRoleAndProfile(uid: string) {
  try {
    const role = (await getUserRole(uid)) as UserRole
    const profile = await getUserProfile(uid)
    return { role, profile }
  } catch (e) {
    if (noRow(e)) throw e
    await sleep(2000)
    const role = (await getUserRole(uid)) as UserRole
    const profile = await getUserProfile(uid)
    return { role, profile }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
    let alive = true
    let currentUid: string | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      const uid = user?.id ?? null

      if (!uid) {
        currentUid = null
        clearAuthCache()
        setState({ user: null, role: null, profile: null, loading: false })
        return
      }

      // Same person — a refocus or an hourly token refresh. Keep role and
      // profile, take the fresh user object, ask the server nothing.
      if (uid === currentUid) {
        setState((s) => ({ ...s, user }))
        return
      }

      currentUid = uid
      clearAuthCache()

      // setTimeout keeps Supabase calls out of Supabase's own callback,
      // where awaiting another auth request can stall the client.
      setTimeout(async () => {
        try {
          const { role, profile } = await readRoleAndProfile(uid)
          if (alive && currentUid === uid) setState({ user, role, profile, loading: false })
        } catch {
          // Error aave to logout karo
          if (!alive || currentUid !== uid) return
          await supabase.auth.signOut()
          setState({ user: null, role: null, profile: null, loading: false })
        }
      }, 0)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)