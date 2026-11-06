// src/lib/push.ts
//
// Turning phone notifications on for this browser, and keeping them on.
//
// Three things get confused, so to be plain about which one this is:
//
//   · The bell in the header — rows in `notifications`, arriving live
//     over Supabase realtime. Needs the app open.
//   · new Notification(...) — a tray message the PAGE puts there. Also
//     needs the app open.
//   · THIS — a message the phone receives with the app CLOSED, handed
//     to the service worker, which shows it. Nothing else can do that.
//
// Four things have to line up:
//   1. a registered service worker (public/sw.js, with its push handler)
//   2. the person allowing notifications
//   3. a subscription recorded against their user id
//   4. the push-send Edge Function, to do the sending
//
// Every function here reports WHICH of those is missing, because the
// failures are otherwise completely silent — no error, no prompt,
// nothing on screen, and the only clue is a console nobody on a phone
// can open. That silence cost an evening; it is what `reason` is for.

import { supabase } from './supabase'

/*
  The VAPID public key, which is public — it ships in the bundle either
  way and identifies the sender to Google's push service. The PRIVATE
  half belongs only in the Edge Function's secrets.
*/
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState =
  | 'on'            // allowed, subscribed, and recorded
  | 'off'           // could be switched on, has not been
  | 'blocked'       // the person said no; only the phone's Settings can undo it
  | 'unsupported'   // no service worker or no Push API here
  | 'unconfigured'  // VITE_VAPID_PUBLIC_KEY never made it into the build
  | 'error'         // tried, and something said no

export type PushResult = {
  state: PushState
  /* Plain words, for the screen. Empty when there is nothing to say. */
  reason: string
  /*
    The raw facts, in one short line, for when the plain words are not
    enough — which is every time this is being fixed on somebody's
    phone, where there is no console to open. It says what the browser
    actually reported rather than what we concluded from it, so a
    screenshot of the panel is enough to tell where it stopped.
  */
  detail: string
}

const SAY: Record<PushState, string> = {
  on: '',
  off: 'Phone notifications are off. Switch them on to be told with the app closed.',
  blocked:
    'Notifications are blocked for this app. Only the phone can undo that: ' +
    'Settings → Apps → JK BrandOS → Notifications.',
  unsupported: 'This browser cannot show notifications with the app closed.',
  unconfigured: 'Notifications are not set up on this server yet. Tell the admin.',
  error: 'Notifications could not be switched on.',
}

/*
  What the browser itself reports, in one line: the permission as the
  page sees it, whether the key made it into the build, whether there
  is a subscription (when that has been checked), and whether this is
  the installed app or a browser tab — the last because the APK and
  Chrome keep separate answers, and mixing the two up is how an
  evening goes.
*/
function facts(sub?: boolean): string {
  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'none'
  const app =
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches
      ? 'app'
      : 'browser'
  const parts = [`perm=${perm}`, `key=${VAPID_PUBLIC_KEY ? 'yes' : 'no'}`]
  if (sub !== undefined) parts.push(`sub=${sub ? 'yes' : 'no'}`)
  parts.push(app)
  return parts.join(' · ')
}

/*
  "Blocked" is undone in a different place depending on where the page
  is running. Inside the APK it is the phone's own Settings; in a
  browser tab it is the icon beside the address. Sending a desktop user
  to "Settings → Apps" sends them looking for something that is not
  there.
*/
function blockedReason(): string {
  const app =
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches
  return app
    ? SAY.blocked
    : 'Notifications are blocked for this site. Click the icon left of the address bar → ' +
      'Notifications → Allow, then reload.'
}

const result = (state: PushState, reason?: string, sub?: boolean): PushResult => ({
  state,
  reason: reason ?? (state === 'blocked' ? blockedReason() : SAY[state]),
  detail: facts(sub),
})

/*
  The browser wants the key as raw bytes, and it arrives as base64url.
  atob only reads standard base64, so the two swapped characters go
  back and the padding is put on.
*/
function keyBytes(base64url: string) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  /*
    The ArrayBuffer is made first, on purpose.

    `new Uint8Array(n)` is typed Uint8Array<ArrayBufferLike> in newer
    TypeScript, and ArrayBufferLike takes in SharedArrayBuffer — which
    applicationServerKey will not accept, because a key that another
    thread could rewrite mid-call is not something the browser will
    take. Handing the constructor a real ArrayBuffer settles the type
    without an annotation, so this also compiles on the older
    TypeScript where Uint8Array had no type parameter at all.
  */
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/* A subscription's keys come back as ArrayBuffers; the table holds text. */
function b64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/*
  Where this browser actually stands — asked, not assumed.

  Permission alone is not the answer. A phone can have the permission
  granted and still have no subscription, which is exactly the state
  that looks fine and sends nothing.
*/
export async function pushStatus(): Promise<PushResult> {
  if (!pushSupported()) return result('unsupported')
  if (!VAPID_PUBLIC_KEY) return result('unconfigured')
  if (Notification.permission === 'denied') return result('blocked')
  if (Notification.permission !== 'granted') return result('off')
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub
      ? result('on', SAY.on, true)
      : result('off', 'Allowed, but this phone is not registered yet. Tap to finish.', false)
  } catch {
    return result('off')
  }
}

/*
  Subscribe this browser and record it.

  Safe to call again and again — that is the point. getSubscription()
  hands back the existing one when there is one, and push_subscribe()
  is an upsert, so every app open quietly refreshes last_seen_at and
  re-attaches the endpoint to whoever is logged in now.

  `ask` is false on the automatic call at startup: a permission prompt
  that appears on its own, before the person has done anything, is the
  one everybody denies — and a denial cannot be undone from inside the
  app, only from the phone's Settings. It is true only when they have
  asked for it themselves.
*/
export async function enablePush(ask = false): Promise<PushResult> {
  if (!pushSupported()) return result('unsupported')
  if (!VAPID_PUBLIC_KEY) return result('unconfigured')
  if (Notification.permission === 'denied') return result('blocked')

  if (Notification.permission === 'default') {
    if (!ask) return result('off')
    let answer: NotificationPermission = 'default'
    try {
      answer = await Notification.requestPermission()
    } catch {
      return result('error', 'The phone did not answer the permission request.')
    }
    if (answer === 'denied') return result('blocked')
    if (answer !== 'granted') {
      return result('off', 'Notifications were not switched on. Tap again to try.')
    }
  }

  try {
    /*
      ready, not register: the worker is registered by the app's own
      startup. Waiting here means this works whether it is the first
      load or the hundredth.
    */
    const reg = await navigator.serviceWorker.ready

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        // Google refuses a subscription that is allowed to stay silent.
        userVisibleOnly: true,
        applicationServerKey: keyBytes(VAPID_PUBLIC_KEY),
      }))

    const { error } = await supabase.rpc('push_subscribe', {
      p_endpoint: sub.endpoint,
      p_p256dh: b64url(sub.getKey('p256dh')),
      p_auth: b64url(sub.getKey('auth')),
      p_agent: navigator.userAgent,
    })

    if (error) {
      /*
        This is the one that hid for an evening.

        The browser subscribed perfectly well — permission granted, a
        real endpoint in hand — and the row never reached the table,
        because the session behind the RPC had expired. Everything on
        screen looked right and nothing was recorded, so the Edge
        Function kept answering "no subscriptions" and nobody could
        see why. Said out loud now, in the words that fit the cause.
      */
      const dead = /jwt|token|expired|403|401|not signed in/i.test(error.message)
      return result(
        'error',
        dead
          ? 'Your login has expired. Sign out, sign in again, and switch notifications on.'
          : `Could not register this phone: ${error.message}`,
      )
    }
    return result('on')
  } catch (e) {
    return result('error', `Could not switch notifications on: ${(e as Error).message}`)
  }
}

/* Switching it off on this browser only. The permission itself stays
   granted — only the person can take that back, in Settings. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  } catch {
    /* Nothing useful to do about it, and nothing worth saying. */
  }
}

/*
  Keep it alive, quietly.

  Two things rot a subscription. Chrome replaces it when it feels like
  it, and says so by firing pushsubscriptionchange in the worker — the
  worker cannot save the new one itself (it does not know who is logged
  in), so it posts a message here. And a person can log in as somebody
  else on the same phone, which has to move the endpoint across.

  Both are handled by subscribing again, which is why enablePush is
  built to be called repeatedly. Call this once, after login.
*/
export function watchPush(onChange?: (r: PushResult) => void): () => void {
  if (!pushSupported()) return () => {}

  void enablePush(false).then((r) => onChange?.(r))

  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'push-subscription-changed') {
      void enablePush(false).then((r) => onChange?.(r))
    }
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}