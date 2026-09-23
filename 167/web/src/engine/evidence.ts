/**
 * The evidence layer — a port of `satquery/evidence.py`.
 *
 * Pixel coordinates become Earth coordinates; confidence is gated; conflicts
 * are recorded rather than silently resolved.
 */

import type { EvidenceItem, GeoBox, Modality } from '@/lib/contract'
import { pixelAreaM2, pixelToLonLat, type Raster } from './raster'
import type { Region } from './cv'

const r6 = (v: number) => Math.round(v * 1e6) / 1e6
const r3 = (v: number) => Math.round(v * 1e3) / 1e3

export function geoBox(r: Raster, bbox: [number, number, number, number], areaPx = 0): GeoBox {
  const [x0, y0, x1, y1] = bbox
  const a = pixelToLonLat(r, x0, y0)
  const b = pixelToLonLat(r, x1 + 1, y1 + 1)
  const area = areaPx || (x1 - x0 + 1) * (y1 - y0 + 1)
  return {
    x0, y0, x1, y1,
    lon0: a ? r6(a[0]) : null, lat0: a ? r6(a[1]) : null,
    lon1: b ? r6(b[0]) : null, lat1: b ? r6(b[1]) : null,
    area_px: area,
    area_ha: r3(area * pixelAreaM2(r, (x0 + x1) / 2, (y0 + y1) / 2) / 10_000),
  }
}

export const boxesFromProps = (props: Region[], r: Raster, limit = 24) =>
  props.slice(0, limit).map((p) => geoBox(r, p.bbox, p.area_px))

/** Measured at the scene centre; the backend uses the mask's centroid — within a
 * scene-sized image the two differ by well under 1 %. */
export function maskAreaHa(count: number, r: Raster): number {
  return r3(count * pixelAreaM2(r, r.width / 2, r.height / 2) / 10_000)
}

/**
 * Confidence from how cleanly a threshold splits the data (Cohen's d between
 * the two sides). Stops every detection being reported at a flat 0.9.
 */
export function confidenceFromSeparation(values: Float32Array, thr: number): number {
  let n0 = 0, n1 = 0, s0 = 0, s1 = 0, q0 = 0, q1 = 0, total = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (!Number.isFinite(v)) continue
    total++
    if (v < thr) { n0++; s0 += v; q0 += v * v } else { n1++; s1 += v; q1 += v * v }
  }
  if (total < 16) return 0.35
  if (n0 < 4 || n1 < 4) return 0.40
  const m0 = s0 / n0, m1 = s1 / n1
  const sd0 = Math.sqrt(Math.max(q0 / n0 - m0 * m0, 0))
  const sd1 = Math.sqrt(Math.max(q1 / n1 - m1 * m1, 0))
  const pooled = Math.sqrt((sd0 * sd0 + sd1 * sd1) / 2) || 1e-6
  const d = Math.abs(m1 - m0) / pooled
  return r3(Math.min(0.97, 0.42 + 0.16 * d))
}

export function ev(source: { model: string; version: string }, fields: Partial<EvidenceItem> & { claim: string }): EvidenceItem {
  return {
    value: null, unit: '', confidence: 0, modality: 'derived' as Modality,
    boxes: [], mask_area_ha: 0, supporting: [], conflicts: [], method: '',
    ...fields,
    source_model: source.model,
    source_version: source.version,
  }
}

export class EvidenceSet {
  items: EvidenceItem[] = []
  threshold: number
  crs = 'EPSG:4326'

  constructor(threshold = 0.45) { this.threshold = threshold }

  add(e: EvidenceItem) { this.items.push(e); return this }

  get passing() { return this.items.filter((e) => e.confidence >= this.threshold) }

  /** True when nothing cleared the gate — the system declines to answer. */
  get abstain() { return this.items.length > 0 && this.passing.length === 0 }

  /** Area-weighted mean over passing evidence, minus 0.08 per recorded conflict. */
  get confidence() {
    const p = this.passing
    if (!p.length) return 0
    const w = p.map((e) => (e.mask_area_ha ? Math.max(e.mask_area_ha, 0.01) : 1))
    const total = w.reduce((a, b) => a + b, 0)
    const base = p.reduce((a, e, i) => a + e.confidence * w[i], 0) / Math.max(total, 1e-9)
    const conflicts = p.reduce((a, e) => a + e.conflicts.length, 0)
    return r3(Math.max(0, base - 0.08 * conflicts))
  }

  geojson() {
    const features = []
    for (const e of this.passing) {
      for (const b of e.boxes) {
        if (b.lon0 === null || b.lat0 === null || b.lon1 === null || b.lat1 === null) continue
        features.push({
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[b.lon0, b.lat0], [b.lon1, b.lat0], [b.lon1, b.lat1], [b.lon0, b.lat1], [b.lon0, b.lat0]]],
          },
          properties: {
            area_ha: b.area_ha, area_px: b.area_px, claim: e.claim,
            confidence: r3(e.confidence), modality: e.modality, model: e.source_model,
          },
        })
      }
    }
    return { type: 'FeatureCollection', crs: { type: 'name', properties: { name: this.crs } }, features }
  }

  toDict() {
    return {
      threshold: this.threshold,
      confidence: this.confidence,
      abstain: this.abstain,
      count: this.items.length,
      passing: this.passing.length,
      items: this.items.map((e) => ({ ...e, confidence: r3(e.confidence) })),
    }
  }
}
