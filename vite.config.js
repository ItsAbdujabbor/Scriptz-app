import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy /api to backend to avoid CORS preflight (OPTIONS) issues in dev
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      // Brevo Contacts API — dev only; avoids browser CORS to api.brevo.com
      '/brevo-api': {
        target: 'https://api.brevo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/brevo-api/, ''),
      },
    },
  },
})
