// JK BrandOS — service worker
//
// WHAT THIS CACHES: one file, offline.html. Nothing else. Not the app
// shell, not the JS, not the CSS.
//
// WHY: a worker that caches the app will one day hand somebody last
// month's CRM, and Ctrl+Shift+R will not shift it — the worker answers
// before the network is ever asked. Chasing that from a phone in another
// branch is miserable. Every deploy stays instant for everyone because
// nothing of the app lives here.
//
// WHAT IT BUYS: installability (PWA and TWA both want a worker), a
// branded screen instead of the browser's "no internet" page — or,
// inside the APK, instead of a blank white screen with no way out — and
// notifications that arrive with the app closed.
//
// Only NAVIGATIONS fall back, and only when fetch actually throws. An API
// call to Supabase that fails must keep failing, loudly, so the screen can
// say so — swallowing those would make the CRM lie about what saved.
//
// VERSION: bump this whenever offline.html changes. Nothing else depends
// on it.

const VERSION = 'jk-brandos-v3'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION)
    // `cache: 'reload'` so a stale HTTP-cached copy never gets stored.
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  // Page loads only. Everything else goes straight to the network, as if
  // this worker were not here.
  if (event.request.mode !== 'navigate') return

  event.respondWith((async () => {
    try {
      return await fetch(event.request)
    } catch {
      const cache = await caches.open(VERSION)
      const page = await cache.match(OFFLINE_URL)
      return page ?? Response.error()
    }
  })())
})

// ── notifications ────────────────────────────────────────────────────
//
// This is the only part of the app that runs with the app closed. The
// phone wakes the worker, hands it the message, and gives it a few
// seconds — so nothing here asks the network or reads the database. The
// message arrives carrying everything the notification needs to say.
//
// It is here rather than waiting for the native app because Android
// shows these from inside the APK too, once notification delegation is
// switched on while the package is being built. Switched off, Android
// never asks the person and nothing below ever runs.
//
// Shape the server sends:
//   { "title": "...", "body": "...", "url": "/design/tasks",
//     "tag": "task-142", "icon": "/icons/icon-192.png" }

self.addEventListener('push', (event) => {
  /*
    A payload that is not JSON still has to show something. A silent
    push is worse than an ugly one: Android counts pushes that show no
    notification and takes the permission away after a few of them.
  */
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'JK BrandOS'

  const options = {
    body: data.body || '',
    /* Where tapping it goes. Read in notificationclick below. */
    data: { url: data.url || '/' },
    /*
      A tag replaces an earlier notification with the same one rather
      than stacking. Four updates to task #142 should leave one line in
      the tray, not four — so the server sends a tag per thing, not per
      event. renotify makes the replacement buzz; without it the newer
      message lands silently and nobody looks.
    */
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    /*
      No icon path is written in here. A hard-coded one that does not
      exist is a 404 on every notification, and the icons have moved
      once already. Sent by the server, it is used; left out, Android
      falls back to the app's own icon, which is the right picture
      anyway.
    */
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    /* A leave approval can sit there until it is read; most things
       should not. The server decides. */
    requireInteraction: Boolean(data.requireInteraction),
    timestamp: Date.now(),
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  /*
    Reuse the window that is already open.

    openWindow every time leaves a sales person with six copies of the
    CRM after a busy morning, each with its own session and its own
    half-filled form. So: find a window on this origin, focus it, and
    send it where the notification points. Only if there is none does a
    new one open.

    includeUncontrolled matters — a tab opened before this worker took
    over is still a window the person is looking at.
  */
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) {
          try {
            await client.navigate(url)
          } catch {
            /* Some Android versions refuse navigate on a focused client.
               Focused is still better than a seventh window. */
          }
        }
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})

/*
  The subscription a browser hands out is not permanent — Chrome
  replaces it when it decides to, and the old one stops working with no
  error anywhere. When that happens the browser fires this, and the only
  one who can record the new subscription is the page, which has the
  logged-in user.

  So the worker does not try to save it itself. It tells whatever window
  is open, and the app posts the new subscription to Supabase as the
  person it belongs to. With nothing open, the next load re-subscribes
  anyway, which is the same answer a day later.
*/
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage({ type: 'push-subscription-changed' })
  })())
})