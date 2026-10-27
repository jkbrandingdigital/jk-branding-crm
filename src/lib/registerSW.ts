// src/lib/registerSW.ts
//
// Register the service worker. Called ONCE from main.tsx — see the note
// in there.
//
// The worker itself caches nothing (see public/sw.js for why). What it
// buys is "installable": iPhone and Android both need a worker before
// the Add to Home Screen prompt will offer a real app window instead
// of a Safari-in-a-wrapper, and before the icon can be the brand mark
// rather than a page screenshot.
//
// Guarded on `serviceWorker` in navigator so a development build in a
// browser that does not support it (old Safari in a private window,
// most notably) still runs — the catch is quiet because a failed
// registration is not something the person using the app can act on.

export function registerSW() {
  if (!('serviceWorker' in navigator)) return
  // Only once the page has loaded, so the worker never races the first
  // render for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* nothing to tell the person about */
    })
  })
}