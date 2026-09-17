import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getUserRole, getUserProfile } from '../lib/auth'
import type { AuthState, UserRole } from '../types/index'

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  profile: null,
  loading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    profile: null,
    loading: true,
  })

  useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      try {
        const role = await getUserRole(session.user.id) as UserRole
        const profile = await getUserProfile(session.user.id)
        setState({ user: session.user, role, profile, loading: false })
      } catch {
        // Error aave to logout karo
        await supabase.auth.signOut()
        setState({ user: null, role: null, profile: null, loading: false })
      }
    } else {
      setState({ user: null, role: null, profile: null, loading: false })
    }
  })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const role = await getUserRole(session.user.id) as UserRole
          const profile = await getUserProfile(session.user.id)
          setState({ user: session.user, role, profile, loading: false })
        } else {
          setState({ user: null, role: null, profile: null, loading: false })
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)