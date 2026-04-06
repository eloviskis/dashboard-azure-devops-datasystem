import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
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
        target: 'https://dsmetrics.online',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
