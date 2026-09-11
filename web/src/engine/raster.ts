/**
 * Rasters, geotransforms and coordinate conversion — a port of
 * `satquery/raster.py` for the in-browser preview engine.
 *
 * The preview engine exists because the API service is not running yet. It is
 * the classical measurement path of the backend, ported line for line, so the
 * interface can be exercised end to end on real pixels. It is labelled as the
 * preview engine everywhere it answers, and it is replaced by the API the
 * moment `/api/health` answers.
 */

import type { RasterSummary } from '@/lib/contract'

/** GDAL-order affine transform: x = ox + pw*col + rr*row; y = oy + cr*col + ph*row */
export interface GeoTransform {
  ox: number; pw: number; rr: number
  oy: number; cr: number; ph: number
}

export type Sensor = 'optical' | 'sar'

export interface Raster {
  id: string
  role?: string
  data: Float32Array[]           // one array per band, row-major
  width: number
  height: number
  bandNames: string[]
  sensor: Sensor
  crs: string                    // "EPSG:4326", "EPSG:32644", or "none"
  georeferenced: boolean
  transform: GeoTransform
  source: string
  acquired: string
  meta: Record<string, string | number | boolean>
}

export const IDENTITY: GeoTransform = { ox: 0, pw: 1, rr: 0, oy: 0, cr: 0, ph: 1 }

export function pixelToNative(t: GeoTransform, col: number, row: number): [number, number] {
  return [t.ox + t.pw * col + t.rr * row, t.oy + t.cr * col + t.ph * row]
}

/* ------------------------------------------------------------------ CRS */

function epsgCode(crs: string): number | null {
  const m = /^EPSG:(\d+)$/.exec(crs)
  return m ? Number(m[1]) : null
}

/** Inverse UTM (WGS84) — Snyder, USGS PP 1395, eq. 8-18 onward. */
function utmToLonLat(x: number, y: number, zone: number, south: boolean): [number, number] {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2)
  const x0 = x - 500000
  const y0 = south ? y - 10000000 : y
  const M = y0 / k0
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
  const s = Math.sin(phi1), c = Math.cos(phi1), t = Math.tan(phi1)
  const N1 = a / Math.sqrt(1 - e2 * s * s)
  const T1 = t * t, C1 = ep2 * c * c
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * s * s, 1.5)
  const D = x0 / (N1 * k0)
  const lat = phi1 - (N1 * t / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720)
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c
  return [lon * 180 / Math.PI, lat * 180 / Math.PI]
}

/** Whether this engine can turn the raster's native coordinates into EPSG:4326. */
export function canReproject(crs: string): boolean {
  const c = epsgCode(crs)
  if (c === null) return false
  return c === 4326 || c === 3857 || (c >= 32601 && c <= 32660) || (c >= 32701 && c <= 32760)
}

export function nativeToLonLat(crs: string, x: number, y: number): [number, number] | null {
  const c = epsgCode(crs)
  if (c === 4326) return [x, y]
  if (c === 3857) {
    const lon = (x / 6378137) * 180 / Math.PI
    const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI
    return [lon, lat]
  }
  if (c !== null && c >= 32601 && c <= 32660) return utmToLonLat(x, y, c - 32600, false)
  if (c !== null && c >= 32701 && c <= 32760) return utmToLonLat(x, y, c - 32700, true)
  return null
}

export function pixelToLonLat(r: Raster, col: number, row: number): [number, number] | null {
  if (!r.georeferenced) return null
  const [x, y] = pixelToNative(r.transform, col, row)
  return nativeToLonLat(r.crs, x, y)
}

/**
 * Metres per pixel. For EPSG:4326 the transform is in degrees, so — exactly as
 * the backend does — it converts at 111 320 m per degree: good enough to state
 * a resolution, not to survey with. Projected CRSs are already in metres.
 */
export function gsd(r: Raster): number {
  if (!r.georeferenced) return 0
  const c = epsgCode(r.crs)
  return c === 4326 ? Math.abs(r.transform.pw) * 111_320 : Math.abs(r.transform.pw)
}

/** (minLon, minLat, maxLon, maxLat) over the four corners, or pixel extent. */
export function bounds(r: Raster): [number, number, number, number] {
  const corners: [number, number][] = [[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]]
  const pts = corners.map(([c, rr]) => pixelToLonLat(r, c, rr) ?? [c, rr])
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export function centre(r: Raster): [number, number] {
  const p = pixelToLonLat(r, r.width / 2, r.height / 2)
  return p ? [p[1], p[0]] : [r.height / 2, r.width / 2]     // lat, lon
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

export function summary(r: Raster): RasterSummary {
  const t = r.transform
  return {
    raster_id: r.id,
    source: r.source,
    sensor: r.sensor,
    bands: r.data.length,
    band_names: r.bandNames,
    width: r.width,
    height: r.height,
    crs: r.crs,
    georeferenced: r.georeferenced,
    geotransform: [t.ox, t.pw, t.rr, t.oy, t.cr, t.ph].map((v) => round(v, 10)),
    gsd_m: round(gsd(r), 2),
    bounds: bounds(r).map((v) => round(v, 6)),
    centre: centre(r).map((v) => round(v, 6)),
    acquired: r.acquired,
    role: r.role,
    ...r.meta,
  }
}

/* ---------------------------------------------------------------- bands */

/** Co-pol and cross-pol stand-ins, so an HH/HV scene reads through the VV/VH path. */
const ALIASES: Record<string, string[]> = { vv: ['vv', 'hh'], vh: ['vh', 'hv'] }

export function has(r: Raster, name: string): boolean {
  return (ALIASES[name] ?? [name]).some((n) => r.bandNames.includes(n))
}

export function named(r: Raster, name: string): Float32Array {
  for (const n of ALIASES[name] ?? [name]) {
    const i = r.bandNames.indexOf(n)
    if (i >= 0) return r.data[i]
  }
  // Loud, never a wrong band (ING-04).
  throw new EngineError('missing_band',
    `This ${r.sensor} raster has no "${name}" band (it has ${r.bandNames.join(', ')}).`,
    `Upload a raster that carries a ${name.toUpperCase()} band.`)
}

/** Mean of the visible bands (optical) or the co-pol band (SAR). */
export function grey(r: Raster): Float32Array {
  if (r.sensor === 'sar') return r.data[0]
  const n = Math.min(3, r.data.length)
  const out = new Float32Array(r.width * r.height)
  for (let b = 0; b < n; b++) {
    const d = r.data[b]
    for (let i = 0; i < out.length; i++) out[i] += d[i] / n
  }
  return out
}

export class EngineError extends Error {
  code: string
  remedy: string
  constructor(code: string, message: string, remedy: string) {
    super(message)
    this.code = code
    this.remedy = remedy
  }
}
