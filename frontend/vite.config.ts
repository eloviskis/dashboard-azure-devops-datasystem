import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    hmr: {
      clientPort: 443 // Porta HTTPS para HMR via ngrok
    },
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..']
    }
  }
})
