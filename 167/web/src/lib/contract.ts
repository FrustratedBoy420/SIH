/**
 * The API contract, as the frontend consumes it.
 *
 * Mirrors `docs/08_TRD.md` §4.4–§5.2 and `satquery/BUILD_PLAN.md` §2.8. The
 * result shape is identical for success, refusal and abstention (VAL-08), so
 * no component here branches on a missing field.
 */

export type Modality = 'optical' | 'sar' | 'fused' | 'temporal' | 'derived'
export type Role = 'optical' | 'sar' | 't1' | 't2'
export const ROLES: Role[] = ['optical', 'sar', 't1', 't2']

export interface GeoBox {
  x0: number; y0: number; x1: number; y1: number
  /** null for non-georeferenced benchmark imagery (PNG/JPEG) — audit A1 */
  lon0: number | null; lat0: number | null; lon1: number | null; lat1: number | null
  area_px: number; area_ha: number
}

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

export interface RasterSummary {
  raster_id?: string
  source: string
  sensor: 'optical' | 'sar'
  bands: number
  band_names: string[]
  width: number
  height: number
  crs: string
  georeferenced: boolean
  geotransform: number[]
  gsd_m: number
  bounds: number[]
  centre: number[]           // [lat, lon]
  acquired: string
  role?: string
  platform?: string
  cloud_pct?: number
  looks?: number
  polarisation?: string
  synthetic?: boolean
  /** a built-in scene: real Sentinel imagery shipped with the app, never deleted from the store */
  builtin?: boolean
  product?: string
  attribution?: string
  band_order?: string
  normalisation?: string
  analysed_at?: string
  [k: string]: unknown
}

export interface Feature {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: number[][][] }
  properties: Record<string, unknown>
}

export interface QueryResult {
  run_id: string
  created: string
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
  geojson: { type: string; features: Feature[]; crs?: unknown }
  trace: TraceStep[]
  manifest: { modality: string; count: number; rasters: RasterSummary[] }
  elapsed_ms: number
  version: string
  engine: string
  precomputed: boolean
}

export interface QueryRequest {
  query: string
  inputs: Partial<Record<Role, string>>
  threshold?: number
}

export interface Health {
  ok: boolean
  version: string
  engine: string
  adapters_loaded: boolean
  note: string
}

export interface RegistryTool {
  tasks: string[]
  requires: string
  accepts: string[]
  outputs: string[]
  adapter: string
  params: Record<string, [number, number, number]>
  description: string
}

export type DatasetStatus = 'complete' | 'partial' | 'absent' | 'unavailable'

export interface DatasetEntry {
  key: string; name: string; role: 'training' | 'benchmark' | 'hidden'
  purpose: string; requirement: string; serves: string[]
  size: string; records: string; source: string
  huggingface?: string; paper?: string; licence?: string
  split_policy?: string; notes?: string
  status: DatasetStatus
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

export interface Catalog {
  datasets: DatasetEntry[]
  models: ModelEntry[]
  /** where the local state came from, stated rather than implied */
  state_source: string
}

export interface TaskScore { task: string; metric: string; value: number; detail: Record<string, number> }

export interface SystemAblationRow {
  config: string
  name: string
  runs: string
  built_f1: number
  water_f1: number
  mean_f1: number
  router_accuracy: number | null
  recovered_under_cloud_pct: number | null
  capability: number
  delta_vs_A: number
}

export interface Evaluation {
  source: 'api' | 'browser'
  measured_at: string
  scene: { size: number; seed: number }
  tasks: TaskScore[]
  system_ablation: { rows: SystemAblationRow[]; formula: string; note: string }
  /** A (base, zero-shot) vs B (M1) on VRSBench test — Mridul's runs. null until measured. */
  adaptation: { zero_shot: number | null; adapted: number | null; gain: number | null; split: string }
  /** optical-only / SAR-only / both. null until measured. */
  cross_modal: { optical: number | null; sar: number | null; both: number | null; metric: string }
  calibration: {
    ece: number | null; n: number; bins: number; required_n: number
    accuracy?: number | null; mean_confidence?: number | null; measured_at?: string; version?: string
    reliability?: { lo: number; hi: number; n: number; confidence: number; accuracy: number }[]
    by_kind?: Record<string, { n: number; accuracy: number; mean_confidence: number }>
    design?: { scenes: number; seeds: number[]; noise_sd: number[]; size_px: number; correct_if: string }
  }
  router_heldout: { accuracy: number | null; n: number }
  note: string
}

export interface ApiError { code: string; message: string; remedy: string }

export interface Upload { raster_id: string; summary: RasterSummary }
