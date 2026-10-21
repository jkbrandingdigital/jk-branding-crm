// JK BrandOS — service worker
//
// Deliberately tiny. Its whole job is to make the app installable, so it
// gets its own window and an icon instead of a browser tab.
//
// It caches NOTHING of the app.
//
// That is the important decision here. A service worker that caches the
// app shell will, sooner or later, serve somebody last month's CRM — and
// Ctrl+Shift+R does not clear it, because the worker answers before the
// network is ever asked. Debugging that from a phone in another branch is
// miserable. Until there is a real reason to cache (offline scanning), it
// stays out of the way.
//
// If offline scanning is built later, this is where it goes, and then the
// version below has to be bumped on every deploy.

const VERSION = 'brandos-v1-no-cache'

self.addEventListener('install', () => {
  // Take over at once rather than waiting for every tab to close.
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Clear anything an earlier worker left behind, so a stale cache
      // cannot outlive the worker that made it.
      const names = await caches.keys()
      await Promise.all(names.map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

// No fetch handler that answers from a cache. The one below exists only
// because some browsers want a fetch listener present before they count
// the app as installable; it passes everything straight through.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // No respondWith — the browser handles it exactly as it would without
  // a service worker at all.
})