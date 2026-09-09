/**
 * The run contract, as TECHNICAL_SPEC section 5.9 froze it.
 *
 * TR-G2 keeps this shape stable for the duration of Phase 1: fields may be
 * added, never renamed or removed, because three independent views read it.
 * Everything optional here is optional in the pipeline too — a halted run
 * stops emitting stages at the gate that halted it, and this view has to
 * render that state rather than crash on it.
 */

export type LonLat = [number, number]

export interface Gate {
  id: number
  name: string
  fired: boolean
  halts: boolean
  detail: string
}

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface RasterRef {
  file: string
  scene_id: string
  acquired_h: number
  width: number
  height: number
  pixel_m: number
  bounds: Bounds
  stretch: { lo_db: number; hi_db: number; note: string }
}

export interface Driver {
  name: string
  value: number
  z: number
  contribution: number
}

export interface CandidateRow {
  id: string
  area_km2: number
  verdict: string
  basis: string | null
  confidence: number
  delta_db: number | null
  wind_ms: number
  edge_gradient: number
  shape_complexity: number
  elongation: number
}

/** DT-3. Absent on a run whose weights pack was missing. */
export interface SegmentationSummary {
  detector: {
    source: 'unet' | 'absent'
    error?: string | null
    note?: string
    architecture?: string
    parameters?: number
    corpus?: string
    threshold?: number
    weights_file?: string
    split?: string
    export_parity?: number
    holdout?: { iou: number; f1: number; precision: number; recall: number } | null
  }
  candidates_seen: number
  candidates_refined: number
  mean_iou_with_classical?: number | null
  dilation_px?: number
  refinements: Array<{
    cid: string
    applied: boolean
    reason: string
    area_before_km2: number
    area_after_km2: number
    mean_probability: number
    iou_with_classical: number
  }>
}

export interface Detection {
  raw_components: number
  candidates: number
  retained: number
  confidence: number | null
  drivers: Driver[] | null
  sea_db: number
  slick_db: number | null
  method: string
  discriminator: Record<string, unknown>
  segmentation?: SegmentationSummary | null
  table: CandidateRow[]
  gate: Gate
}

export interface Geometry {
  area_km2: number
  perimeter_km: number
  centroid: LonLat
  principal_axis_deg: number
  elongation: number
  axis_usable: boolean
  length_km: number
  width_km: number
  age_hours: number
  age_hours_lo: number
  age_hours_hi: number
  age_method: string
  age_notes: string
  polygon: LonLat[]
  confidence: number
}

export interface R95Point {
  hour_back: number
  r95_km: number
  alive: number
}

export interface Forward {
  hours: number
  centroid: LonLat
  r95_km: number
  landfall: boolean
  available: boolean
  eta_utc: string | null
  first_contact_utc: string | null
  eta_hour: number | null
  first_contact_hour: number | null
  frac_threshold: number
  ashore_series: Array<{ hour: number; ashore_fraction: number }>
  note: string
}

export interface Drift {
  n_particles: number
  integrator: string
  dt_s: number
  leeway_alpha: number
  k_h: number
  horizon_h: number
  r95_series: R95Point[]
  r95_union_km: number
  origin_window_h: [number, number]
  origin_window: [string, string]
  origin_region: LonLat[][]
  origin_region_parts: number
  origin_centroid: LonLat
  shear_per_hour: number
  forward: Forward
  coastline: LonLat[]
  gate: Gate
  note: string
}

export interface BroadcastGap {
  start_utc: string
  end_utc: string
  duration_s: number
  baseline_cadence_s: number
  anomaly: number
  overlap: number
  v_max_ms: number
  envelope: LonLat[]
}

/** track points are [lon, lat, hours relative to detection] */
export type TrackPoint = [number, number, number]

export interface Vessel {
  mmsi: string
  name: string
  ship_type: string
  length_m: number
  source: string
  channel: string
  baseline_cadence_s: number
  cog: number | null
  crossing_utc: string | null
  closest_approach_km: number
  implausible_fixes: number
  gaps: BroadcastGap[]
  track: TrackPoint[]
}

export interface DroppedVessel {
  mmsi: string
  name: string
  ship_type: string
  basis: string
  closest_approach_km: number
}

export interface Traffic {
  in_window: number
  dropped: number
  kinematic_flags: {
    vessels_flagged: number
    total_fixes_flagged: number
    vessels: Array<{ mmsi: string; name: string; fixes: number }>
    note: string
  }
  vessels: Vessel[]
  dropped_vessels: DroppedVessel[]
  note: string
}

export interface DarkTarget {
  target_id: string
  lon: number
  lat: number
  est_length_m: number
  est_length_range_m: [number, number]
  peak_db: number
  in_origin_region: boolean
}

export interface Dark {
  available: boolean
  gate: Gate
  cfar: { pfa: number; tau: number; n_train: number; train_km: number; guard_km: number }
  acquired_h: number
  targets: number
  matched: number
  unmatched: number
  unmatched_targets: DarkTarget[]
  note: string
}

export type FactorName = 'containment' | 'timing' | 'heading' | 'broadcast' | 'class_prior'

export interface Ranked {
  rank: number
  mmsi: string | null
  name: string
  ship_type: string
  length_m: number
  source: string
  channel: string
  cog: number | null
  delta_axis: number | null
  crossing_h: number | null
  closest_approach_km: number
  baseline_cadence_s: number
  implausible_fixes: number
  factors: Partial<Record<FactorName, number>>
  suppressed: FactorName[]
  justifications: Partial<Record<FactorName, string>>
  gaps: BroadcastGap[]
  score: number
  corroboration?: { text: string; target_id?: string } | null
}

export interface Attribution {
  ranked: Ranked[]
  leader_margin: number
  weights: Record<FactorName, number>
  weight_pack: string
  weight_pack_version: string
  gate: Gate
  ablation: Record<string, { margin?: number; leader?: string; delta?: number }>
  finding: string
}

export interface Run {
  run_id: string
  generated_utc: string
  version: string
  scenario: string
  scenario_label: string
  scenario_notes: string
  detection_utc: string
  provenance: { ais: string; scene: string; forcing: string }
  parameters: Record<string, number | string>
  forcing: { current: string; wind: string }
  manifest_hash: string
  halted: Gate | null
  gates: Gate[]
  limitations: Array<{ title: string; text: string }>
  intake: Record<string, unknown>
  rasters: { detection: RasterRef; archive: RasterRef }
  detection?: Detection
  geometry?: Geometry
  drift?: Drift
  traffic?: Traffic
  dark?: Dark
  attribution?: Attribution
  dossier_pdf?: string
  dossier_pdf_pages?: number
  /** present only because every incident in this build is synthetic. No view may depend on it. */
  truth?: Record<string, unknown>
}

export interface CloudSnapshot {
  hour: number
  alive: number
  beached: number
  r95_km: number
  pts: LonLat[]
}

export interface Cloud {
  detection_utc: string
  particles_shown: number
  note: string
  backward: CloudSnapshot[]
  forward: CloudSnapshot[]
}

export interface LogLine {
  t: number
  stage: string
  event: string
  [k: string]: unknown
}
