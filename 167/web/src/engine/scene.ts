/**
 * Synthetic scene generation — a port of `satquery/scene.py`.
 *
 * Simulated: the pixel values. Cartosat-2S and RISAT imagery cannot be
 * obtained and the ISRO/SAC evaluation set is undisclosed.
 *
 * Real: everything that reads them. The rasters carry a real affine
 * geotransform in EPSG:4326, the right band structure, and radiometry that
 * follows what each sensor measures. The noise and land-cover code is the same
 * arithmetic as the Python generator, so the preview scene matches the one the
 * API serves; only the SAR speckle comes from a different (seeded) generator.
 *
 * `truth` is read by `evaluate.ts` alone. No analysis module touches it.
 */

import type { Raster } from './raster'

export const WATER = 0, VEGETATION = 1, SOIL = 2, BUILT = 3
export const CLASS_NAMES = ['water', 'vegetation', 'bare soil', 'built-up']

/* --------------------------------------------------------- value noise */

function hash2(x: number, y: number, seed: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return h - Math.floor(h)
}

/**
 * The Python hashes the parcel grid from float32 arrays, so numpy evaluates
 * the whole expression — sin included — in single precision. At 43758× the
 * fractional part is sensitive to the last bits, and a float64 port picks
 * different parcels. Math.fround at each step reproduces the float32 path.
 */
const f = Math.fround
function hash2f32(x: number, y: number, seed: number): number {
  const arg = f(f(f(f(x) * f(127.1)) + f(f(y) * f(311.7))) + f(seed * 74.7))
  const h = f(f(Math.sin(arg)) * f(43758.5453))
  return f(h - Math.floor(h))
}

function valueNoise(h: number, w: number, freq: number, seed: number, out: Float32Array, amp: number) {
  for (let gy = 0; gy < h; gy++) {
    const y = (gy / h) * freq
    const yi = Math.floor(y), yf = y - yi
    const v = yf * yf * (3 - 2 * yf)
    for (let gx = 0; gx < w; gx++) {
      const x = (gx / w) * freq
      const xi = Math.floor(x), xf = x - xi
      const u = xf * xf * (3 - 2 * xf)
      const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed)
      const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed)
      out[gy * w + gx] += amp * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v)
    }
  }
}

export function fbm(h: number, w: number, octaves = 5, freq = 4, seed = 0): Float32Array {
  const out = new Float32Array(h * w)
  let amp = 0.5, f = freq, norm = 0
  for (let i = 0; i < octaves; i++) {
    valueNoise(h, w, f, seed + i * 17, out, amp)
    norm += amp
    amp *= 0.5
    f *= 2
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(norm, 1e-6)
  return out
}

/** mulberry32 — small, seeded, deterministic (OPS-02). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* --------------------------------------------------------------- scene */

export interface Scene {
  name: string
  size: number
  classes: Uint8Array
  roughness: Float32Array
  cloud: Float32Array
  origin: [number, number]
  extent: number
  truth: {
    acquired: string
    class_counts: Record<string, number>
    built_fraction: number
    cloud_fraction: number
    built_under_cloud_fraction: number
    urban_growth: number
    changed_pixels?: number
  }
}

export function build(size = 512, seed = 7, urbanGrowth = 0,
  acquired = '2024-01-15T05:42:00Z', origin: [number, number] = [85.24, 23.5],
  extent = 0.18, name = 'kharagpur'): Scene {
  const h = size, w = size, n = h * w
  const grain = fbm(h, w, 5, 9, seed)
  const fine = fbm(h, w, 4, 22, seed + 41)
  const cloudNoise = fbm(h, w, 4, 4.5, seed + 77)

  // A main town under the cloud deck plus three outlying villages — the
  // cross-modal claim is then about a specific, countable subset.
  const settlements: [number, number, number][] = [
    [0.70, 0.26, 0.150], [0.30, 0.72, 0.062], [0.16, 0.34, 0.045], [0.52, 0.50, 0.038],
  ]

  const classes = new Uint8Array(n)
  const roughness = new Float32Array(n)
  const cloud = new Float32Array(n)

  for (let gy = 0; gy < h; gy++) {
    const v = gy / h
    for (let gx = 0; gx < w; gx++) {
      const u = gx / w
      const i = gy * w + gx
      const axis = 0.62 + 0.13 * Math.sin(u * 7.5) + 0.05 * Math.sin(u * 17 + 1.2)
      const riverW = 0.014 + 0.006 * Math.sin(u * 11)
      const river = Math.abs(v - axis) < riverW
      const pu = Math.floor(u * 11), pv = Math.floor(v * 9)
      const soil = hash2f32(pu * 31, pv * 17, seed + 5) > 0.62
      let built = false
      for (const [cx, cy, r] of settlements) {
        const radius = r + urbanGrowth * (r > 0.1 ? 1 : 0.35)
        if (Math.hypot(u - cx, v - cy) < radius && grain[i] > 0.36) { built = true; break }
      }
      let c = VEGETATION
      if (soil) c = SOIL
      if (built) c = BUILT
      if (river) c = WATER
      classes[i] = c

      let ro = c === WATER ? 0.02 : c === VEGETATION ? 0.40 : c === SOIL ? 0.28 : 0.88
      ro += fine[i] * 0.10
      if (c === WATER) ro = 0.02 + fine[i] * 0.015
      roughness[i] = Math.min(1, Math.max(0, ro))

      const cd = 1 - Math.min(1, Math.max(0, Math.hypot(u - 0.68, v - 0.30) / 0.34))
      cloud[i] = Math.min(1, Math.max(0, cd * cd * (0.55 + 0.45 * cloudNoise[i])))
    }
  }

  const counts = [0, 0, 0, 0]
  let cloudPx = 0, builtUnder = 0
  for (let i = 0; i < n; i++) {
    counts[classes[i]]++
    if (cloud[i] > 0.3) { cloudPx++; if (classes[i] === BUILT) builtUnder++ }
  }
  return {
    name, size, classes, roughness, cloud, origin, extent,
    truth: {
      acquired,
      class_counts: Object.fromEntries(CLASS_NAMES.map((k, c) => [k, counts[c]])),
      built_fraction: counts[BUILT] / n,
      cloud_fraction: cloudPx / n,
      built_under_cloud_fraction: builtUnder / Math.max(counts[BUILT], 1),
      urban_growth: urbanGrowth,
    },
  }
}

function transformOf(s: Scene) {
  const px = s.extent / s.size
  return { ox: s.origin[0], pw: px, rr: 0, oy: s.origin[1], cr: 0, ph: -px }
}

/** Four bands: red, green, blue, nir. Cloud is opaque. */
export function optical(s: Scene, seed = 7, withCloud = true, id = 'optical'): Raster {
  const n = s.size * s.size
  const grain = fbm(s.size, s.size, 4, 14, seed + 3)
  const refl: number[][] = [
    [0.035, 0.055, 0.085, 0.015],   // water — NIR nearly zero
    [0.045, 0.085, 0.038, 0.400],   // vegetation — NIR very high
    [0.220, 0.200, 0.165, 0.290],   // soil
    [0.185, 0.190, 0.195, 0.210],   // built
  ]
  const cloudRefl = [0.92, 0.93, 0.95, 0.88]
  const bands = [0, 1, 2, 3].map(() => new Float32Array(n))
  let cloudPx = 0
  for (let i = 0; i < n; i++) {
    const g = grain[i] * 0.30 + 0.85
    const c = withCloud ? s.cloud[i] : 0
    if (c > 0.3) cloudPx++
    const rv = refl[s.classes[i]]
    for (let b = 0; b < 4; b++) {
      const v = rv[b] * g * (1 - c) + cloudRefl[b] * c
      bands[b][i] = Math.min(1, Math.max(0, v * 2.2))     // display stretch
    }
  }
  return {
    id, data: bands, width: s.size, height: s.size,
    bandNames: ['red', 'green', 'blue', 'nir'], sensor: 'optical',
    crs: 'EPSG:4326', georeferenced: true, transform: transformOf(s),
    source: `${s.name}_optical.tif`, acquired: s.truth.acquired,
    meta: {
      platform: 'Sentinel-2 (synthetic)',
      display_gain: 2.2,     // reflectance × 2.2 — divided out before any physical threshold
      cloud_pct: Math.round((withCloud ? cloudPx / n : 0) * 1000) / 10,
      synthetic: true,
    },
  }
}

/** Two bands: VV, VH. Multiplicative gamma speckle. Cloud is invisible. */
export function sar(s: Scene, seed = 7, id = 'sar'): Raster {
  const n = s.size * s.size
  const rand = rng(seed + 991)
  const looks = 4
  const vv = new Float32Array(n), vh = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    // Gamma(k=4, θ=1/4) as the sum of four exponentials — exact for integer k,
    // and the correct speckle model for 4-look intensity data.
    let e = 0
    for (let k = 0; k < looks; k++) e -= Math.log(1 - rand())
    const speckle = e / looks
    const veg = s.classes[i] === VEGETATION ? 1 : 0
    vv[i] = Math.min(1, Math.max(0, s.roughness[i] * speckle))
    vh[i] = Math.min(1, Math.max(0, s.roughness[i] * 0.42 * speckle * (1 + 0.55 * veg)))
  }
  return {
    id, data: [vv, vh], width: s.size, height: s.size,
    bandNames: ['vv', 'vh'], sensor: 'sar',
    crs: 'EPSG:4326', georeferenced: true, transform: transformOf(s),
    source: `${s.name}_sar.tif`, acquired: s.truth.acquired,
    meta: { platform: 'Sentinel-1 GRD (synthetic)', looks, polarisation: 'VV+VH', synthetic: true },
  }
}

/** Two dates of the same area, plus the true change mask (for evaluation only). */
export function bitemporal(size = 512, seed = 7, growth = 0.055) {
  const t1 = build(size, seed, 0, '2022-01-18T05:41:00Z')
  const t2 = build(size, seed, growth, '2024-01-15T05:42:00Z')
  const mask = new Uint8Array(size * size)
  let changed = 0
  for (let i = 0; i < mask.length; i++) {
    if (t2.classes[i] === BUILT && t1.classes[i] !== BUILT) { mask[i] = 1; changed++ }
  }
  t2.truth.changed_pixels = changed
  return { t1, t2, mask }
}
