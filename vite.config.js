import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('node_modules/react/')) return 'vendor-react'
          if (id.includes('node_modules/@tanstack/react-query')) return 'vendor-query'
          if (id.includes('node_modules/zustand')) return 'vendor-zustand'
        },
      },
    },
  },
  server: {
    // Pin the dev port so the OAuth redirect_uri is stable. Google's
    // OAuth client allow-list is a strict equality check on the
    // redirect URI — if Vite picks a different port (because 5173 is
    // taken) sign-in fails with redirect_uri_mismatch. `strictPort`
    // surfaces a clean "port in use" error at startup instead of
    // silently falling through to 5174.
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // OpenAI image generation at quality=high can take 60–180s, and
        // batch=4 can push close to 3 minutes. The default
        // http-proxy-middleware timeouts are short enough to surface as a
        // `502 Bad Gateway` on the browser before the backend finishes, so
        // we bump both sides of the proxy to a comfortable 5 minutes.
        timeout: 300000, // client → proxy
        proxyTimeout: 300000, // proxy → backend
      },
      '/__brevo': {
        target: 'https://api.brevo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__brevo/, ''),
      },
    },
  },
})
