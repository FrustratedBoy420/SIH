/// <reference lib="webworker" />
/**
 * The preview engine's thread. Everything pixel-heavy runs here so the
 * interface never stalls while a scene is generated or a query is measured.
 */

import type { RasterSummary } from '@/lib/contract'
import { evaluate } from './evaluate'
import { run } from './pipeline'
import { EngineError, summary, type Raster } from './raster'
import { changeLayer, cloudLayer, falseColour, fusionLayer, stats, trueColour, type Pixels } from './render'
import type { Inputs } from './router'
import { parseTiffBuffer, parseUpload } from './upload'

const store = new Map<string, Raster>()

export type DemoKind = 'crossmodal' | 'bitemporal' | 'optical' | 'sar' | 'full'

export interface WorkerRaster {
  role: string
  raster_id: string
  summary: RasterSummary
  layers: Record<string, Pixels>
}

function layersOf(r: Raster): Record<string, Pixels> {
  const out: Record<string, Pixels> = { base: trueColour(r) }
  const fc = falseColour(r)
  if (fc) out.false = fc
  return out
}

function pack(r: Raster): WorkerRaster {
  return { role: r.role ?? '', raster_id: r.id, summary: { ...summary(r), role: r.role }, layers: layersOf(r) }
}

interface SceneManifest { scenes: Record<string, { file: string; product: string; platform: string; acquired: string; bands: string[]; attribution: string; cloud_pct?: number; orbit?: string }> }
let manifest: Promise<SceneManifest> | null = null
const publicUrl = (f: string) => new URL(`${import.meta.env.BASE_URL}${f}`, self.location.origin).href
const sceneUrl = (f: string) => publicUrl(`scenes/${f}`)

/**
 * The built-in scenes: real Sentinel-2 L2A and Sentinel-1 RTC crops over west
 * Hyderabad, baked by tools/fetch_scenes.mjs + tools/bake_scenes.py. They are
 * fetched and read through the same parser an upload goes through, so the
 * demo exercises exactly the path real input takes (VAL-07). `size` is kept
 * for the message shape; the scenes are 512 px and are not generated.
 */
async function demo(kind: DemoKind, _size: number): Promise<WorkerRaster[]> {
  const want: Record<DemoKind, string[]> = {
    crossmodal: ['optical', 'sar'], bitemporal: ['t1', 't2'], optical: ['optical'], sar: ['sar'], full: ['optical', 'sar', 't1', 't2'],
  }
  manifest ??= fetch(sceneUrl('scenes.json')).then((r) => {
    if (!r.ok) throw new EngineError('missing_scene', 'The built-in scenes are not in this build.', 'Run tools/fetch_scenes.mjs and tools/bake_scenes.py, then rebuild.')
    return r.json() as Promise<SceneManifest>
  }).catch((e) => { manifest = null; throw e })
  const m = await manifest
  return Promise.all(want[kind].map(async (role) => {
    const id = `demo-${role}`
    let r = store.get(id)
    if (!r) {
      const sc = m.scenes[role]
      const res = await fetch(sceneUrl(sc.file))
      if (!res.ok) throw new EngineError('missing_scene', `The built-in ${role} scene could not be loaded.`, 'Reload the page.')
      r = await parseTiffBuffer(await res.arrayBuffer(), role, id, role === 'sar' ? 'sar' : 'optical', `${sc.product}.tif`)
      r.bandNames = sc.bands
      r.role = role
      r.acquired = sc.acquired
      r.meta = {
        ...r.meta, platform: sc.platform, product: sc.product, builtin: true, attribution: sc.attribution,
        band_order: 'from the scene manifest',
        ...(sc.cloud_pct !== undefined && { cloud_pct: sc.cloud_pct }), ...(sc.orbit && { orbit: sc.orbit }),
      }
      delete r.meta.note
      store.set(id, r)
    }
    return pack(r)
  }))
}

function get(id: string | undefined): Raster | undefined {
  if (!id) return undefined
  const r = store.get(id)
  if (!r) throw new EngineError('unknown_raster', `Raster ${id} is no longer loaded.`, 'Load the imagery again.')
  return r
}

type Msg =
  | { type: 'demo'; kind: DemoKind; size: number }
  | { type: 'upload'; role: string; file: File }
  | { type: 'remove'; id: string }
  | { type: 'layer'; kind: 'fusion' | 'change' | 'cloud'; a: string; b?: string }
  | { type: 'query'; query: string; inputs: Record<string, string | undefined>; threshold: number }
  | { type: 'evaluate'; size: number }
  | { type: 'stats'; optical: string; sar: string }

let uploads = 0

async function handle(m: Msg): Promise<unknown> {
  switch (m.type) {
    case 'demo': return demo(m.kind, m.size)
    case 'upload': {
      const id = `upl-${Date.now().toString(36)}-${++uploads}`
      const r = await parseUpload(m.file, m.role, id)
      store.set(id, r)
      return pack(r)
    }
    case 'remove': store.delete(m.id); return true
    case 'layer': {
      const a = get(m.a)!, b = get(m.b)
      if (m.kind === 'cloud') return cloudLayer(a)
      if (!b) throw new EngineError('missing_input', 'This layer needs two rasters.', 'Load both.')
      return m.kind === 'fusion' ? fusionLayer(a, b) : changeLayer(a, b)
    }
    case 'query': {
      const i: Inputs = {}
      for (const role of ['optical', 'sar', 't1', 't2'] as const) {
        const r = get(m.inputs[role])
        if (r) i[role] = r
      }
      return run(m.query, i, m.threshold)
    }
    case 'evaluate': {
      // Calibration needs >= 200 judged records; it is measured once by the
      // API (`satquery calibrate`) and shipped as a file, and reported here
      // as that recorded study — never recomputed or estimated in the browser.
      const ev = evaluate(m.size)
      try {
        const r = await fetch(publicUrl('calibration.json'))
        if (r.ok) ev.calibration = await r.json()
      } catch { /* no recorded study in this build: calibration stays null */ }
      try {
        const r = await fetch(publicUrl('stress.json'))
        if (r.ok) ev.stress = await r.json()
      } catch { /* no recorded stress run in this build */ }
      return ev
    }
    case 'stats': return stats(get(m.optical)!, get(m.sar)!)
  }
}

function transferables(v: unknown, out: Transferable[] = []): Transferable[] {
  if (v instanceof ArrayBuffer) out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => transferables(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => transferables(x, out))
  return out
}

self.onmessage = async (e: MessageEvent<{ id: number; msg: Msg }>) => {
  const { id, msg } = e.data
  try {
    const data = await handle(msg)
    ;(self as unknown as Worker).postMessage({ id, ok: true, data }, transferables(data))
  } catch (err) {
    const error = err instanceof EngineError
      ? { code: err.code, message: err.message, remedy: err.remedy }
      : { code: 'internal', message: err instanceof Error ? err.message : String(err), remedy: 'Try again; if it repeats, reload the page.' }
    ;(self as unknown as Worker).postMessage({ id, ok: false, error })
  }
}
