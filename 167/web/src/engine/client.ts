/** Promise RPC over the preview-engine worker, plus pixel → object-URL conversion. */

import type { ApiError } from '@/lib/contract'
import type { Pixels } from './render'
import type { DemoKind, WorkerRaster } from './worker'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()

function w(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; data?: unknown; error?: ApiError }>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.ok) p.resolve(e.data.data)
    else p.reject(new EngineFailure(e.data.error!))
  }
  return worker
}

export class EngineFailure extends Error {
  code: string
  remedy: string
  constructor(e: ApiError) {
    super(e.message)
    this.code = e.code
    this.remedy = e.remedy
  }
}

export function call<T>(msg: Record<string, unknown>): Promise<T> {
  const id = ++seq
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    w().postMessage({ id, msg })
  })
}

/** Pixels → PNG object URL. Drawn on the main thread so it works in every browser. */
export async function pixelsToUrl(p: Pixels): Promise<string> {
  const c = document.createElement('canvas')
  c.width = p.width
  c.height = p.height
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.buffer), p.width, p.height), 0, 0)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'))
  return URL.createObjectURL(blob)
}

export type { DemoKind, WorkerRaster, Pixels }
