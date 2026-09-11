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
import * as scenes from './scene'
import { parseUpload } from './upload'

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

function demo(kind: DemoKind, size: number): WorkerRaster[] {
  const seed = 7
  const want: Record<DemoKind, string[]> = {
    crossmodal: ['optical', 'sar'], bitemporal: ['t1', 't2'], optical: ['optical'], sar: ['sar'], full: ['optical', 'sar', 't1', 't2'],
  }
  const roles = want[kind]
  const out: WorkerRaster[] = []
  let sc: scenes.Scene | null = null
  let bt: ReturnType<typeof scenes.bitemporal> | null = null
  for (const role of roles) {
    const id = `demo-${size}-${role}`
    let r = store.get(id)
    if (!r) {
      if (role === 'optical' || role === 'sar') {
        sc ??= scenes.build(size, seed)
        r = role === 'optical' ? scenes.optical(sc, seed, true, id) : scenes.sar(sc, seed, id)
      } else {
        bt ??= scenes.bitemporal(size, seed)
        r = scenes.optical(role === 't1' ? bt.t1 : bt.t2, seed, false, id)
        r.source = `${role === 't1' ? 'kharagpur_2022' : 'kharagpur_2024'}_optical.tif`
      }
      r.role = role
      store.set(id, r)
    }
    out.push(pack(r))
  }
  return out
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
    case 'evaluate': return evaluate(m.size)
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
