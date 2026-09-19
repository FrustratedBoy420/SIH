import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const require = createRequire(import.meta.url)

/**
 * MapLibre 6 loads its worker by URL, and that worker imports a sibling chunk
 * by a *relative* path of its own. Neither file is reachable through the module
 * graph, so a normal build emits neither and the map dies on two silent 404s:
 * the canvas is created, stays 300 px tall and never paints.
 *
 * Both files are plain ESM and need no transformation — they only need to land
 * in the same directory under their original names, which is what this does.
 * `Chart.tsx` then points `setWorkerUrl` at the first one.
 */
function maplibreWorker(): Plugin {
  // Resolve through package.json: the package's `exports` map does not expose
  // these internal files, so `require.resolve('maplibre-gl')` on the entry is
  // the only supported way to find the directory they live in.
  const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist')
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    generateBundle() {
      for (const name of files) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${name}`,
          source: readFileSync(join(dist, name), 'utf8'),
        })
      }
    },
  }
}

/**
 * The bundle is served by `darktransit.cli serve` from the same origin as the
 * API, so it builds to a relative base and the dev server proxies the API
 * routes rather than the app knowing a host. One origin in both modes means no
 * CORS and no environment variable to forget at a venue.
 */
export default defineConfig({
  plugins: [react(), maplibreWorker()],
  base: './',
  build: {
    outDir: 'dist',
    // The run rasters and cloud.json are fetched, never bundled; what ships is
    // the app itself, and it should stay small enough to read.
    chunkSizeWarningLimit: 1400,
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/run.json', '/runs', '/capabilities'].map((p) => [
        p,
        { target: 'http://127.0.0.1:8000', changeOrigin: true },
      ]),
    ),
  },
})
