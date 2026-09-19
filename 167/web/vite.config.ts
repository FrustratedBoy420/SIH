import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // The Python backend owns /api. Proxying in dev means the frontend uses
    // the same relative paths it will use in production, where the API serves
    // the built bundle from the same origin — no CORS, no per-venue base URL.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  // The preview engine runs in a module worker and lazy-imports geotiff.
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // three.js never changes between builds and only the landing globe
        // and the workstation's stack need it, so it gets its own lazily
        // loaded chunk. Everything
        // else splits naturally — grouping all of node_modules into one
        // "vendor" chunk would pull the lazy libraries into the first load.
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'react'
        },
      },
    },
  },
})
