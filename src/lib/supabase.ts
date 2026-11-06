import { createClient } from '@supabase/supabase-js'

/*
  The Supabase client.

  ── About the session being lost on a phone ──

  The options below are written out, but be clear about what they do
  and do not fix: persistSession and autoRefreshToken are already on by
  default, so naming them changes no behaviour at all. They are here so
  that the next person reading this can see the session is MEANT to
  survive the app being closed, rather than having to go and look up
  what the defaults happen to be this year.

  Nothing in this file is why somebody gets sent back to the login
  screen on their phone. That is almost always storage, not auth:

    · A "Add to Home Screen" SHORTCUT is a Chrome tab wearing an icon,
      and it does not reliably keep its own storage. An INSTALLED app —
      the WebAPK, or the APK — uses Chrome's storage for this origin,
      which is the same storage the browser has and is far more
      durable. This is the one that usually explains it.
    · Clearing Chrome's data, or Android reclaiming storage when the
      phone is nearly full, takes localStorage with it.

  A lost refresh response on bad 4G is survivable without anything
  here: Supabase allows the same refresh token to be used again inside
  a short reuse window for exactly that reason.

  So: the APK is the fix for this symptom, not a client option.

  flowType is deliberately NOT set. It decides how a magic link or an
  OAuth redirect hands back a session, which is a different thing
  again, and changing it would change how those links behave for
  everyone already using them.
*/
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/*
  Missing at build time is worth saying out loud.

  Without this the app loads, every query fails with something that
  reads like a network problem, and the real cause — an env var that
  was never set on the host — is nowhere on screen. The anon key is
  public by design (it is in the bundle either way), so there is
  nothing here to leak; the point is to fail where it can be read.
*/
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
    'Set both in .env for a local run, and in the host\'s environment for a build.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    /* Keep the session across a closed app. */
    persistSession: true,
    /* Refresh it before it expires, without the person noticing. */
    autoRefreshToken: true,
    /* Read a session out of the address bar once, on the way back from
       a magic link or an OAuth redirect. */
    detectSessionInUrl: true,
  },
})