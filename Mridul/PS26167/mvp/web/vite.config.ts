import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    // The Python backend owns /api. Proxying in dev means the frontend uses
    // the same relative paths it will use in production, where FastAPI serves
    // the built bundle from the same origin — so there is no CORS story and no
    // environment-specific base URL to get wrong at a venue.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // three.js is ~600 kB and never changes between builds; splitting it
        // keeps the app chunk small enough to re-deploy quickly. Rollup 4
        // types the object form narrowly, so use the function form.
        manualChunks(id: string) {
          if (id.includes('node_modules/three') ||
              id.includes('@react-three')) return 'three'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
