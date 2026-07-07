import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registrazione manuale in src/main.tsx (con controllo periodico di
      // aggiornamenti e reload automatico): disabilitiamo quella iniettata
      // di default per evitare una doppia registrazione del service worker.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pavone League',
        short_name: 'Pavone League',
        description: 'Gestione partite, giocatori e statistiche del nostro calcetto.',
        theme_color: '#1b5e20',
        background_color: '#1b5e20',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
