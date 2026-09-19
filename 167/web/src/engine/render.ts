/**
 * Layers for display. None of this touches analysis — analysis always runs
 * on the linear values; these are what a viewer shows.
 */

import * as cv from './cv'
import { has, named, type Raster } from './raster'
import { cloudOf, sarStructures, alignTo } from './specialists'

export interface Pixels { width: number; height: number; buffer: ArrayBuffer }

const px = (w: number, h: number) => new Uint8ClampedArray(w * h * 4)

/**
 * Display stretch: each band 2nd–98th percentile. For surface reflectance from
 * Sentinel-style digital numbers the top is capped at a physical value (0.3
 * visible, 0.5 NIR), as the missions' own true-colour products do — otherwise
 * a cloudy scene spends the whole range on white cloud and the ground goes
 * black. Mirrored in satquery/raster.py `Raster.rgb`.
 */
const REFLECTANCE_TOP: Record<string, number> = { nir: 0.5 }
function stretchOf(band: Float32Array, synthetic: boolean, reflectance = false, name = ''): (v: number) => number {
  if (synthetic) return (v) => v
  let [a, b] = cv.percentile(band, [2, 98])
  if (reflectance) b = Math.min(b, REFLECTANCE_TOP[name] ?? 0.3)
  const d = b - a < 1e-9 ? 1 : b - a
  return (v) => (v - a) / d
}

function composite(r: Raster, names: string[]): Pixels {
  const out = px(r.width, r.height)
  const bands = names.map((n) => (has(r, n) ? named(r, n) : r.data[0]))
  const syn = !!r.meta.synthetic
  const refl = r.meta.normalisation === 'digital numbers divided by 10000'
  const st = bands.map((b, k) => stretchOf(b, syn, refl, names[k]))
  for (let i = 0; i < r.width * r.height; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(1, st[c](bands[c][i]))) * 255
    out[i * 4 + 3] = 255
  }
  return { width: r.width, height: r.height, buffer: out.buffer }
}

export function trueColour(r: Raster): Pixels {
  if (r.sensor === 'sar') return sarLayer(r)
  if (r.data.length < 3) return composite(r, [r.bandNames[0], r.bandNames[0], r.bandNames[0]])
  return composite(r, ['red', 'green', 'blue'])
}

/** NIR-R-G: vegetation crimson, water near-black, built-up cyan-grey — the domain's own palette. */
export function falseColour(r: Raster): Pixels | null {
  if (r.sensor === 'sar' || !has(r, 'nir') || !has(r, 'red') || !has(r, 'green')) return null
  return composite(r, ['nir', 'red', 'green'])
}

/** VV in dB, 2–98 % stretch. Unstretched SAR reads as a black rectangle. */
export function sarLayer(r: Raster): Pixels {
  const vv = named(r, 'vv')
  const db = new Float32Array(vv.length)
  for (let i = 0; i < vv.length; i++) db[i] = cv.toDb(vv[i])
  const [a, b] = cv.percentile(db, [2, 98])
  const out = px(r.width, r.height)
  for (let i = 0; i < vv.length; i++) {
    const v = Math.max(0, Math.min(1, (db[i] - a) / Math.max(b - a, 1e-6))) * 255
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return { width: r.width, height: r.height, buffer: out.buffer }
}

const SAR_RGB = [0x2c, 0x7a, 0x8c], NIR_RGB = [0xc4, 0x34, 0x2a]

/**
 * Fusion: the optical scene, desaturated, with SAR structures in clear sky in
 * the SAR hue and the ones recovered from beneath cloud in the change hue.
 */
export function fusionLayer(optical: Raster, sarIn: Raster): Pixels {
  const sar = alignTo(optical, sarIn)
  const base = new Uint8ClampedArray(trueColour(optical).buffer)
  const { hard } = sarStructures(sar)
  const cloud = cloudOf(optical)
  for (let i = 0; i < hard.length; i++) {
    const o = i * 4
    const l = 0.3 * base[o] + 0.59 * base[o + 1] + 0.11 * base[o + 2]
    for (let c = 0; c < 3; c++) base[o + c] = l * 0.55 + base[o + c] * 0.45
    if (hard[i]) {
      const col = cloud[i] ? NIR_RGB : SAR_RGB
      const k = cloud[i] ? 0.82 : 0.6
      for (let c = 0; c < 3; c++) base[o + c] = base[o + c] * (1 - k) + col[c] * k
    }
  }
  return { width: optical.width, height: optical.height, buffer: base.buffer }
}

/** Change: T2, faded, with the CVA change mask in the change hue. */
export function changeLayer(t1: Raster, t2: Raster): Pixels {
  const base = new Uint8ClampedArray(trueColour(t2).buffer)
  if (t1.width !== t2.width || t1.height !== t2.height) return { width: t2.width, height: t2.height, buffer: base.buffer }
  const { width: w, height: h } = t2
  const mag = cv.boxBlur(cv.changeVector(t1.data, t2.data), w, h, 1)
  const mask = cv.closing(cv.opening(cv.threshold(mag, cv.otsu(mag)), w, h, 1), w, h, 2)
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4
    for (let c = 0; c < 3; c++) {
      base[o + c] = mask[i] ? base[o + c] * 0.2 + NIR_RGB[c] * 0.8 : base[o + c] * 0.55 + 243 * 0.45
    }
  }
  return { width: w, height: h, buffer: base.buffer }
}

/** Cloud opacity as seen by the detector, for the landing's reveal. */
export function cloudLayer(optical: Raster): Pixels {
  const cloud = cloudOf(optical)
  const out = px(optical.width, optical.height)
  for (let i = 0; i < cloud.length; i++) { out[i * 4 + 3] = cloud[i] ? 255 : 0 }
  return { width: optical.width, height: optical.height, buffer: out.buffer }
}

/** σ⁰ statistics that make the landing telemetry a measurement, not a slogan. */
export function stats(optical: Raster, sarIn: Raster) {
  const sar = alignTo(optical, sarIn)
  const { vv, hard } = sarStructures(sar)
  const cloud = cloudOf(optical)
  let bSum = 0, bN = 0, oSum = 0, oN = 0, cN = 0
  for (let i = 0; i < vv.length; i++) {
    const d = cv.toDb(vv[i])
    if (hard[i]) { bSum += d; bN++ } else { oSum += d; oN++ }
    cN += cloud[i]
  }
  return {
    built_db: bN ? bSum / bN : null,
    other_db: oN ? oSum / oN : null,
    cloud_pct: (cN / cloud.length) * 100,
  }
}
