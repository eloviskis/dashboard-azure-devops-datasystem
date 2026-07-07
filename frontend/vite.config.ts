import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['imagem-fluxometria.png', 'logo-datasystem.png', 'pwa-192x192.svg', 'pwa-512x512.svg'],
      manifest: {
        name: 'Fluxometria',
        short_name: 'Fluxometria',
        description: 'Dashboard de metricas de engenharia para equipes Azure DevOps',
        theme_color: '#071829',
        background_color: '#071829',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
        categories: ['productivity', 'business'],
        shortcuts: [
          { name: 'Performance', short_name: 'Perf', url: '/?tab=performance', description: 'Visao de performance' },
          { name: 'Cycle Time', short_name: 'CT', url: '/?tab=cycle-analytics', description: 'Cycle Time Analytics' },
          { name: 'QA Tracker', short_name: 'QA', url: '/?tab=qa-tracker', description: 'QA Tracker' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{css,html,svg,png,jpg,jpeg,woff,woff2}'], // sem JS (muito grande)
        globIgnores: ['**/exceljs*', '**/index-*.js', '**/index2-*.js'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fluxometria\.com\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      output: {
        // Força hash único usando timestamp
        entryFileNames: `assets/[name]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-${Date.now()}.[ext]`
      }
    }
  },
  server: {
    host: '0.0.0.0', // Permite acesso de qualquer IP
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'carry-explanatory-sharell.ngrok-free.dev',
      '.ngrok-free.dev',
      '.ngrok.io',
      'localhost'
    ],
    hmr: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
