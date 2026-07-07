import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// La PWA installata su mobile può restare aperta a lungo (o "in pausa" in
// background) senza mai ricaricare: senza questo, un nuovo deploy resta
// invisibile finché l'utente non chiude e riapre l'app per intero.
// Controlliamo se c'è un service worker più recente sia periodicamente sia
// ogni volta che l'app torna in primo piano, e appena prende il controllo
// della pagina ricarichiamo.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => registration.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})

let hadController = !!navigator.serviceWorker?.controller
let refreshingAfterUpdate = false
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  // Primo insediamento del service worker (clientsClaim alla prima visita):
  // non c'è nessuna nuova versione da applicare, quindi niente reload —
  // cancellerebbe ad esempio il form di login appena compilato.
  if (!hadController) {
    hadController = true
    return
  }
  if (refreshingAfterUpdate) return
  refreshingAfterUpdate = true
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
      <SpeedInsights />
    </ErrorBoundary>
  </StrictMode>,
)
