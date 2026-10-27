import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Luma: calm when you need it',
        short_name: 'Luma',
        description: 'Instant, personal self-support for panic and anxiety.',
        theme_color: '#0b0b24',
        background_color: '#0b0b24',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app shell (including the font) is cached, so the pacer and
        // techniques open with no connection. API calls are never cached here:
        // the app decides what to do offline (for example, queueing ratings).
        globPatterns: ['**/*.{js,css,html,png,woff2}'],
        globIgnores: ['push-sw.js'],
        // Reminder notifications (push and notification taps).
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
