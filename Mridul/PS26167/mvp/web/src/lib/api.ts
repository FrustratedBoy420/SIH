/**
 * Typed client for the SatQuery backend.
 *
 * The shapes here mirror the Python dataclasses in `satquery/pipeline.py` and
 * `satquery/evidence.py`. They are written out rather than generated because a
 * generator is another build step to break at a venue, and because the surface
 * is small enough to keep in sync by reading it.
 */

export interface GeoBox {
  x0: number; y0: number; x1: number; y1: number
  lon0: number; lat0: number; lon1: number; lat1: number
  area_px: number; area_ha: number
}

export type Modality = 'optical' | 'sar' | 'fused' | 'temporal' | 'derived'

export interface EvidenceItem {
  claim: string
  value: string | number | null
  unit: string
  confidence: number
  modality: Modality
  source_model: string
  source_version: string
  boxes: GeoBox[]
  mask_area_ha: number
  supporting: string[]
  conflicts: string[]
  method: string
}

export interface TraceStep {
  step: string
  detail: string
  ok: boolean
  ms: number
  data: Record<string, unknown>
}

export interface QueryResult {
  query: string
  answer: string
  refused: boolean
  abstained: boolean
  confidence: number
  task: string
  tools: string[]
  params: Record<string, number>
  evidence: {
    threshold: number
    confidence: number
    abstain: boolean
    count: number
    passing: number
    items: EvidenceItem[]
  }
  geojson: { type: string; features: unknown[] }
  trace: TraceStep[]
  manifest: {
    modality: string
    count: number
    rasters: RasterSummary[]
  }
  elapsed_ms: number
  version: string
  engine: string
}

export interface RasterSummary {
  source: string; sensor: string; bands: number; band_names: string[]
  width: number; height: number; crs: string; georeferenced: boolean
  geotransform: number[]; gsd_m: number; bounds: number[]; centre: number[]
  acquired: string; role?: string
  platform?: string; cloud_pct?: number; looks?: number; polarisation?: string
}

export interface ScenePayload {
  size: number
  layers: string[]
  optical: RasterSummary
  sar: RasterSummary
  t1: RasterSummary
  t2: RasterSummary
  truth: Record<string, unknown>
  note: string
}

export interface DatasetEntry {
  key: string; name: string; role: 'training' | 'benchmark' | 'hidden'
  purpose: string; requirement: string; serves: string[]
  size: string; records: string; source: string
  huggingface?: string; paper?: string; licence?: string
  split_policy?: string; notes?: string
  status: 'complete' | 'partial' | 'absent' | 'unavailable'
  present: string[]; missing: string[]; path?: string
}

export interface ModelEntry {
  id: string; name: string; kind: string
  adapter?: string; trained: boolean; datasets: string[]
  requirement?: string; note: string
  candidates?: string[]
  weights_present: boolean | null
  weights_path?: string
  status: 'loaded' | 'not trained' | 'frozen' | 'rule-based'
}

export interface AblationRow {
  config: string; name: string; note: string
  built_f1: number; water_f1: number; mean_f1: number
  router_accuracy: number | null
  recovered_under_cloud_pct: number | null
  capability: number
  delta_vs_A: number
  delta_f1_vs_A: number
}

export interface Evaluation {
  tasks: { task: string; metric: string; value: number; detail: Record<string, number> }[]
  calibration: { ece: number; n: number }
  ablation: { scene: Record<string, unknown>; rows: AblationRow[]; note: string }
  note: string
}

const BASE = ''

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(`${path} → ${r.status}`)
  return r.json() as Promise<T>
}

export const api = {
  health: () => get<{ ok: boolean; version: string; engine: string; adapters_loaded: boolean; note: string }>('/api/health'),
  scene: () => get<ScenePayload>('/api/scene'),
  datasets: () => get<{ datasets: DatasetEntry[]; counts: Record<string, number> }>('/api/datasets'),
  models: () => get<{ models: ModelEntry[] }>('/api/models'),
  registry: () => get<{ tools: Record<string, Record<string, unknown>>; note: string }>('/api/registry'),
  evaluation: () => get<Evaluation>('/api/evaluation'),
  layerUrl: (layer: string) => `${BASE}/api/scene/${layer}.png`,

  async query(query: string, mode = 'optical_sar', threshold = 0.45): Promise<QueryResult> {
    const r = await fetch(BASE + '/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode, threshold }),
    })
    if (!r.ok) throw new Error(`query → ${r.status}`)
    return r.json() as Promise<QueryResult>
  },
}

/** Which colour a modality owns. Never used decoratively. */
export const modalityColour: Record<Modality, string> = {
  optical: 'var(--color-optical)',
  sar: 'var(--color-sar)',
  fused: 'var(--color-fusion)',
  temporal: 'var(--color-nir)',
  derived: 'var(--color-ink-2)',
}
