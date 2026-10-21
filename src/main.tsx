import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './styles/theme.css'
import { applySavedAppearance } from './lib/appearance'

applySavedAppearance()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Makes the app installable — its own window and icon instead of a tab.
// The worker caches nothing; see the note at the top of public/sw.js.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an old browser, or a plain-http host — the app still works */
    })
  })
}