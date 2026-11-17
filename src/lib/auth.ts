import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  clearAuthCache()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/*
  Who is logged in, from the session the browser already holds.

  This was getUser(), which asks the auth server every single time — and
  every layout calls this on mount, so every page change was a request
  to /auth/v1/user. That one endpoint was 38% of the project's egress
  and a large share of its logs.

  getSession() answers from local storage. It is the right tool for
  "whose name goes in the sidebar": RLS on the server still checks the
  token on every query, so nothing is trusted here that matters.
*/
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

/*
  The same thing, shaped exactly like authUser().

  Thirteen screens call getUser() directly, each with its own way of
  unpacking the answer — { data }, { data: u }, { data: { user } }, and
  one inside a Promise.all. Rewriting each by hand is thirteen chances
  to get one wrong.

  So this returns the identical shape: { data: { user }, error }. The
  line around it does not change at all — only the name of what is
  being called. The difference is where the answer comes from: the
  session the browser already holds, instead of a request to the auth
  server on every mount.

  error is always null. getSession() does not fail the way getUser()
  does — there is nothing to ask — so a caller that checks error simply
  never sees one, and a missing user still arrives as null.
*/
export async function authUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return { data: { user: session?.user ?? null }, error: null }
}

/*
  ── Role and profile, asked once per person ──

  Eight layouts and AuthContext all ask for the same two rows, and they
  ask on every mount — so moving between pages re-read the same profile
  over and over. Kept here instead, keyed by user id.

  The PROMISE is kept, not just the answer, so two components asking in
  the same instant share one request rather than racing two.

  A failed request is not kept: the next caller tries again. Keeping a
  rejection would turn one dropped packet into a permanently broken
  sidebar until the page is reloaded.
*/
const roleCache = new Map<string, Promise<string | undefined>>()
const profileCache = new Map<string, Promise<any>>()

function remember<T>(map: Map<string, Promise<T>>, key: string, get: () => Promise<T>): Promise<T> {
  const hit = map.get(key)
  if (hit) return hit
  const p = get().catch((e) => {
    map.delete(key)
    throw e
  })
  map.set(key, p)
  return p
}

/* Signing out, or switching person, starts clean. */
export function clearAuthCache() {
  roleCache.clear()
  profileCache.clear()
}

/* After someone edits their own profile, so the sidebar shows the new
   name without a reload. */
export function forgetProfile(userId: string) {
  profileCache.delete(userId)
}

export async function getUserRole(userId: string) {
  return remember(roleCache, userId, async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()
    if (error) throw error
    return data?.role
  })
}

export async function getUserProfile(userId: string) {
  return remember(profileCache, userId, async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw error
    return data
  })
}