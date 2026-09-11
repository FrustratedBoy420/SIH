/**
 * One client, two engines.
 *
 *   http     — the SatQuery API (`satquery/BUILD_PLAN.md` §2.8), same origin.
 *   preview  — the in-browser port of the classical pipeline, used while the
 *              API is not running. Every surface that shows one of its
 *              results says so.
 *
 * Selection, first match wins: `?engine=` in the URL, the choice saved from
 * the engine badge, `VITE_ENGINE` at build time ('preview' | 'http' | 'auto').
 * 'auto' probes `/api/health`. The default is 'preview' until the API lands,
 * because a probe against a dead proxy logs a console error (NFR-12).
 *
 * Contract assumptions the backend has not confirmed yet, stated so they are
 * checked rather than discovered:
 *   - built-in demo rasters are addressed as `demo:<role>` in `inputs`
 *   - demo layers are served at `/api/scenes/demo/<layer>.png`
 */

import { call, EngineFailure, pixelsToUrl, type DemoKind, type WorkerRaster } from '@/engine/client'
import { datasetsSnapshot, modelsSnapshot, STATE_SNAPSHOT } from '@/engine/catalog'
import { ENGINE_VERSION } from '@/engine/pipeline'
import { REGISTRY } from '@/engine/router'
import type {
  ApiError, Catalog, Evaluation, Health, QueryRequest, QueryResult, RasterSummary, RegistryTool, Role,
} from './contract'

export type EngineMode = 'http' | 'preview'

const KEY = 'sq.engine'
const safe = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

let resolved: Promise<EngineMode> | null = null

async function probe(): Promise<boolean> {
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 1500)
    const r = await fetch('/api/health', { signal: ctl.signal })
    clearTimeout(t)
    if (!r.ok) return false
    const j = await r.json()
    return typeof j?.version === 'string'
  } catch { return false }
}

export function engineMode(): Promise<EngineMode> {
  if (resolved) return resolved
  const url = new URLSearchParams(location.search).get('engine')
  const pick = url ?? safe.get(KEY) ?? (import.meta.env.VITE_ENGINE as string | undefined) ?? 'preview'
  resolved = pick === 'http' ? Promise.resolve('http')
    : pick === 'auto' ? probe().then((ok) => (ok ? 'http' : 'preview'))
      : Promise.resolve('preview')
  return resolved
}

export function setEngine(mode: EngineMode | 'auto') {
  safe.set(KEY, mode)
  location.reload()
}

/* ---------------------------------------------------------------- errors */

export class ApiFailure extends Error {
  code: string
  remedy: string
  constructor(e: ApiError) { super(e.message); this.code = e.code; this.remedy = e.remedy }
}

export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiFailure || e instanceof EngineFailure) return { code: e.code, message: e.message, remedy: e.remedy }
  return { code: 'internal', message: e instanceof Error ? e.message : String(e), remedy: 'Try again.' }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) {
    let err: ApiError = { code: `http_${r.status}`, message: `${path} answered ${r.status}.`, remedy: 'Check that the API is running.' }
    try { const j = await r.json(); if (j?.error) err = j.error } catch { /* not JSON */ }
    throw new ApiFailure(err)
  }
  return r.json() as Promise<T>
}

/* ----------------------------------------------------------------- rasters */

export interface LoadedRaster {
  role: Role
  /** the id the active engine knows the raster by */
  raster_id: string
  /** the preview worker's id — always present, because the plate is drawn from it */
  local_id: string
  summary: RasterSummary
  layers: Record<string, string>
}

async function toLoaded(w: WorkerRaster, serverId?: string): Promise<LoadedRaster> {
  const layers: Record<string, string> = {}
  for (const [k, p] of Object.entries(w.layers)) layers[k] = await pixelsToUrl(p)
  return { role: w.role as Role, raster_id: serverId ?? w.raster_id, local_id: w.raster_id, summary: w.summary, layers }
}

/* -------------------------------------------------------------------- runs */

const RUNS = 'sq.runs'
function readRuns(): QueryResult[] {
  try { return JSON.parse(localStorage.getItem(RUNS) ?? '[]') as QueryResult[] } catch { return [] }
}
function saveRun(r: QueryResult) {
  const list = [r, ...readRuns().filter((x) => x.run_id !== r.run_id)].slice(0, 12)
  try { localStorage.setItem(RUNS, JSON.stringify(list)) } catch {
    try { localStorage.setItem(RUNS, JSON.stringify(list.slice(0, 3))) } catch { /* quota */ }
  }
}

function normalise(r: Partial<QueryResult>): QueryResult {
  return {
    run_id: r.run_id ?? `run-${Date.now().toString(36)}`,
    created: r.created ?? new Date().toISOString(),
    precomputed: r.precomputed ?? false,
    ...r,
    evidence: r.evidence ?? { threshold: 0.45, confidence: 0, abstain: false, count: 0, passing: 0, items: [] },
    geojson: r.geojson ?? { type: 'FeatureCollection', features: [] },
    trace: r.trace ?? [],
    manifest: r.manifest ?? { modality: 'none', count: 0, rasters: [] },
  } as QueryResult
}

/* --------------------------------------------------------------------- api */

export const api = {
  mode: engineMode,

  async health(): Promise<Health> {
    if (await engineMode() === 'http') return http<Health>('/api/health')
    return { ok: true, version: ENGINE_VERSION, engine: 'classical', adapters_loaded: false, note: 'Browser preview engine — the classical path, ported. No adapter runs here.' }
  },

  async demo(kind: DemoKind, size = 512): Promise<LoadedRaster[]> {
    const mode = await engineMode()
    const list = await call<WorkerRaster[]>({ type: 'demo', kind, size })
    return Promise.all(list.map((w) => toLoaded(w, mode === 'http' ? `demo:${w.role}` : undefined)))
  },

  async upload(role: Role, file: File): Promise<LoadedRaster> {
    const local = await call<WorkerRaster>({ type: 'upload', role, file })
    if (await engineMode() === 'http') {
      const fd = new FormData()
      fd.append('role', role)
      fd.append('file', file)
      const up = await http<{ raster_id: string; summary: RasterSummary }>('/api/rasters', { method: 'POST', body: fd })
      const loaded = await toLoaded(local, up.raster_id)
      loaded.summary = { ...local.summary, ...up.summary, role }
      return loaded
    }
    return toLoaded(local)
  },

  remove(localId: string) { return call<boolean>({ type: 'remove', id: localId }) },

  async derived(kind: 'fusion' | 'change' | 'cloud', a: string, b?: string): Promise<string> {
    return pixelsToUrl(await call({ type: 'layer', kind, a, b }))
  },

  stats(optical: string, sar: string) {
    return call<{ built_db: number | null; other_db: number | null; cloud_pct: number }>({ type: 'stats', optical, sar })
  },

  /** `save: false` for the landing's illustrative runs, so they stay out of the run history. */
  async query(req: QueryRequest, local: Partial<Record<Role, string>>, opts: { save?: boolean } = {}): Promise<QueryResult> {
    let r: QueryResult
    if (await engineMode() === 'http') {
      r = normalise(await http<QueryResult>('/api/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
      }))
    } else {
      r = await call<QueryResult>({ type: 'query', query: req.query, inputs: local, threshold: req.threshold ?? 0.45 })
    }
    if (opts.save !== false) saveRun(r)
    return r
  },

  runs(): QueryResult[] { return readRuns() },

  async run(id: string): Promise<QueryResult | null> {
    const local = readRuns().find((r) => r.run_id === id)
    if (local) return local
    if (await engineMode() === 'http') return normalise(await http<QueryResult>(`/api/runs/${encodeURIComponent(id)}`))
    return null
  },

  async registry(): Promise<Record<string, RegistryTool>> {
    if (await engineMode() === 'http') return (await http<{ tools: Record<string, RegistryTool> }>('/api/registry')).tools
    return REGISTRY as unknown as Record<string, RegistryTool>
  },

  async catalog(): Promise<Catalog> {
    if (await engineMode() === 'http') {
      const [d, m] = await Promise.all([
        http<{ datasets: Catalog['datasets'] }>('/api/datasets'),
        http<{ models: Catalog['models'] }>('/api/models'),
      ])
      return { datasets: d.datasets, models: m.models, state_source: 'Live — read from disk by the API just now.' }
    }
    return { datasets: datasetsSnapshot(), models: modelsSnapshot(), state_source: STATE_SNAPSHOT }
  },

  async evaluation(): Promise<Evaluation> {
    if (await engineMode() === 'http') return http<Evaluation>('/api/evaluation')
    return call<Evaluation>({ type: 'evaluate', size: 256 })
  },

  /** Where exports come from — the stored run, so they match the screen (OUT-03). */
  async exportHrefs(id: string) {
    if (await engineMode() === 'http') return { geojson: `/api/runs/${id}/geojson`, report: `/api/runs/${id}/report` }
    return { geojson: null, report: null }
  },
}

export type { DemoKind }
