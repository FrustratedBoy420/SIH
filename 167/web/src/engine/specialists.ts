/**
 * The four specialists — a port of `satquery/specialists.py`, classical path.
 *
 * Each names the adapter that should serve it. No adapter runs in the browser,
 * so every result here reports the classical path, and the trace says so.
 */

import * as cv from './cv'
import { EvidenceSet, boxesFromProps, confidenceFromSeparation, ev, maskAreaHa } from './evidence'
import { bounds, grey, has, named, type Raster } from './raster'

export const VERSION = '0.1.0'
const PATH = 'classical'

interface Target { words: string[]; index: 'ndwi' | 'ndvi' | 'backscatter'; mode: 'top' | 'bottom' | 'band'; min_area: number; linear?: boolean; floor?: number }

export const TARGETS: Record<string, Target> = {
  water: { words: ['water', 'river', 'lake', 'channel', 'waterbody', 'water body', 'stream', 'reservoir', 'pond'], index: 'ndwi', mode: 'top', min_area: 60, linear: true, floor: 0 },
  vegetation: { words: ['vegetation', 'forest', 'green', 'crop', 'tree', 'canopy', 'farmland', 'agricultur'], index: 'ndvi', mode: 'top', min_area: 120, floor: 0.2 },
  built: { words: ['building', 'built', 'built-up', 'urban', 'settlement', 'structure', 'house', 'city', 'town', 'infrastructure'], index: 'backscatter', mode: 'top', min_area: 40 },
  bare: { words: ['bare', 'soil', 'barren', 'sand', 'exposed', 'fallow'], index: 'ndvi', mode: 'band', min_area: 100 },
}

export function resolveTarget(text: string): string | null {
  const low = (text || '').toLowerCase()
  let best: string | null = null, score = 0
  for (const [name, spec] of Object.entries(TARGETS)) {
    for (const w of spec.words) if (low.includes(w) && w.length > score) { best = name; score = w.length }
  }
  return best
}

const src = (model: string) => ({ model, version: VERSION })

/* ------------------------------------------------------ co-registration */

function prep(r: Raster, n = 128): Float64Array {
  const g = grey(r)
  const s = new Float64Array(n * n)
  for (let y = 0; y < n; y++) {
    const sy = Math.floor((y * (r.height - 1)) / (n - 1))
    for (let x = 0; x < n; x++) s[y * n + x] = g[sy * r.width + Math.floor((x * (r.width - 1)) / (n - 1))]
  }
  const m = new Float64Array(n * n)
  const at = (y: number, x: number) => s[y * n + x]
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx = x === 0 ? at(y, 1) - at(y, 0) : x === n - 1 ? at(y, x) - at(y, x - 1) : (at(y, x + 1) - at(y, x - 1)) / 2
      const gy = y === 0 ? at(1, x) - at(0, x) : y === n - 1 ? at(y, x) - at(y - 1, x) : (at(y + 1, x) - at(y - 1, x)) / 2
      m[y * n + x] = Math.hypot(gx, gy)
    }
  }
  let mean = 0
  for (const v of m) mean += v / m.length
  let sd = 0
  for (let i = 0; i < m.length; i++) { m[i] -= mean; sd += m[i] * m[i] / m.length }
  sd = Math.sqrt(sd)
  if (sd > 1e-8) for (let i = 0; i < m.length; i++) m[i] /= sd
  return m
}

/** Validate, not solve: geometric extent agreement plus phase-correlation peak on gradients. */
export function coregistrationOffset(a: Raster, b: Raster) {
  const [ax0, ay0, ax1] = bounds(a)
  const [bx0, by0] = bounds(b)
  const span = Math.max(ax1 - ax0, 1e-9)
  const geo = (Math.max(Math.abs(ax0 - bx0), Math.abs(ay0 - by0)) / span) * a.width
  const n = 128
  const ar = prep(a), br = prep(b)
  const ai = new Float64Array(n * n), bi = new Float64Array(n * n)
  cv.fft2(ar, ai, n); cv.fft2(br, bi, n)
  const cr = new Float64Array(n * n), ci = new Float64Array(n * n)
  for (let i = 0; i < n * n; i++) {
    const re = ar[i] * br[i] + ai[i] * bi[i]     // a * conj(b)
    const im = ai[i] * br[i] - ar[i] * bi[i]
    const mag = Math.max(Math.hypot(re, im), 1e-12)
    cr[i] = re / mag; ci[i] = im / mag
  }
  cv.fft2(cr, ci, n, true)
  let best = -Infinity, peak = 0
  for (let i = 0; i < n * n; i++) if (cr[i] > best) { best = cr[i]; peak = i }
  let dy = Math.floor(peak / n), dx = peak % n
  if (dy > 64) dy -= n
  if (dx > 64) dx -= n
  const scale = a.width / n
  const phase = Math.hypot(dx * scale, dy * scale)
  const offset = Math.max(geo, phase)
  const r3 = (v: number) => Math.round(v * 1000) / 1000
  return {
    aligned: offset < 1, offset_px: r3(offset), geometric_px: r3(geo), phase_px: r3(phase),
    same_crs: a.crs === b.crs, same_shape: a.width === b.width && a.height === b.height,
  }
}

/** Nearest-neighbour resample of `r` onto `ref`'s pixel grid (same extent assumed; offset is validated separately). */
export function alignTo(ref: Raster, r: Raster): Raster {
  if (ref.width === r.width && ref.height === r.height) return r
  const data = r.data.map((band) => {
    const o = new Float32Array(ref.width * ref.height)
    for (let y = 0; y < ref.height; y++) {
      const sy = Math.min(r.height - 1, Math.floor((y * r.height) / ref.height))
      for (let x = 0; x < ref.width; x++) o[y * ref.width + x] = band[sy * r.width + Math.min(r.width - 1, Math.floor((x * r.width) / ref.width))]
    }
    return o
  })
  return { ...r, data, width: ref.width, height: ref.height, transform: ref.transform }
}

/* ------------------------------------------------------------ grounding */

function thresholdMode(score: Float32Array, mode: Target['mode'], floor?: number): [cv.Mask, number, string] {
  const [lo, hi] = cv.otsuMulti(score)
  if (mode === 'top') {
    let thr = hi, note = `upper threshold ${hi.toFixed(4)} of a 3-class Otsu split`
    if (floor !== undefined && thr < floor) { thr = floor; note = `Otsu gave ${hi.toFixed(4)}, clamped to the physical floor ${floor.toFixed(2)}` }
    return [cv.threshold(score, thr), thr, note]
  }
  if (mode === 'bottom') return [cv.threshold(score, lo, false), lo, `lower threshold ${lo.toFixed(4)} of a 3-class Otsu split`]
  const m = new Uint8Array(score.length)
  for (let i = 0; i < m.length; i++) m[i] = score[i] > lo && score[i] < hi ? 1 : 0
  return [m, (lo + hi) / 2, `between ${lo.toFixed(4)} and ${hi.toFixed(4)}, the middle class of a 3-class split`]
}

function score(spec: Target, optical?: Raster, sar?: Raster): [Float32Array | null, EvidenceModality, string] {
  if (spec.index === 'ndwi' && optical && has(optical, 'green') && has(optical, 'nir'))
    return [cv.ndwi(named(optical, 'green'), named(optical, 'nir')), 'optical', 'NDWI = (green - nir) / (green + nir)']
  if (spec.index === 'ndvi' && optical && has(optical, 'nir') && has(optical, 'red'))
    return [cv.ndvi(named(optical, 'nir'), named(optical, 'red')), 'optical', 'NDVI = (nir - red) / (nir + red)']
  if (spec.index === 'backscatter' && sar)
    return [cv.leeFilter(named(sar, 'vv'), sar.width, sar.height, 7, 4), 'sar', 'Lee-filtered VV backscatter, 7x7, 4 looks']
  if (optical) return [grey(optical), 'optical', 'panchromatic brightness (no suitable index)']
  return [null, 'derived', 'no band combination supports this target']
}
type EvidenceModality = 'optical' | 'sar' | 'derived'

function cleanMask(sc: Float32Array, spec: Target, w: number, h: number): [cv.Mask, number, string] {
  let [mask, t, split] = thresholdMode(sc, spec.mode, spec.floor)
  // Opening deletes structures narrower than the kernel — measured water IoU
  // fell from 0.86 to 0.28 with it — so linear features get closing only.
  if (!spec.linear) mask = cv.opening(mask, w, h, 1)
  mask = cv.closing(mask, w, h, 1)
  return [mask, t, split]
}

/** The grounding mask exactly as the product computes it — for the evaluation harness. */
export function groundingMask(target: string, optical?: Raster, sar?: Raster): cv.Mask | null {
  const spec = TARGETS[target]
  const [sc, modality] = score(spec, optical, sar)
  if (!sc) return null
  const ref = (modality === 'sar' ? sar : optical ?? sar)!
  return cleanMask(sc, spec, ref.width, ref.height)[0]
}

export function grounding(optical: Raster | undefined, sar: Raster | undefined, query: string, thr = 0.45): EvidenceSet {
  const es = new EvidenceSet(thr)
  const S = src('adapter_B_grounding')
  const target = resolveTarget(query)
  if (!target) {
    es.add(ev(S, { claim: 'target not in vocabulary', confidence: 0, method: 'resolve_target returned no match', supporting: [`vocabulary: ${Object.keys(TARGETS).join(', ')}`] }))
    return es
  }
  const spec = TARGETS[target]
  const [sc, modality, method] = score(spec, optical, sar)
  if (!sc) {
    es.add(ev(S, { claim: `cannot ground ${target} from the supplied bands`, confidence: 0, method }))
    return es
  }
  const ref = (modality === 'sar' ? sar : optical ?? sar)!
  const { width: w, height: h } = ref
  const [mask, t, split] = cleanMask(sc, spec, w, h)
  const [labels, n] = cv.connectedComponents(mask, w, h)
  const minArea = Math.max(12, Math.floor(spec.min_area * (w * h) / (512 * 512)))
  const props = cv.regionProps(labels, n, w, minArea)
  let conf = confidenceFromSeparation(sc, t)
  const conflicts: string[] = []
  if (target === 'bare') {
    conflicts.push('bare soil and built-up share an NDVI range, so this extent includes built-up ground; SAR backscatter separates them')
    conf = Math.min(conf, 0.72)
  }
  es.add(ev(S, {
    conflicts, claim: `${target} regions located`, value: props.length, unit: 'regions',
    confidence: props.length ? conf : 0.15, modality,
    boxes: boxesFromProps(props, ref), mask_area_ha: maskAreaHa(cv.countTrue(mask), ref), method,
    supporting: [split, `${props.length} regions above ${minArea} px`, `path: ${PATH}`],
  }))
  return es
}

/* ------------------------------------------------------------------ VQA */

function intent(q: string) {
  if (/how many|count|number of/.test(q)) return 'count'
  // Before presence, as in satquery/specialists.py: "how much vegetation is
  // there?" contains "is there" and was answered "yes."
  if (/how much/.test(q)) return 'area'
  if (/is there|are there|does .* (contain|have)|any /.test(q)) return 'presence'
  if (/how much|area|hectare|extent|coverage/.test(q)) return 'area'
  return 'describe'
}

export function vqa(optical: Raster | undefined, sar: Raster | undefined, question: string, thr = 0.45): EvidenceSet {
  const es = new EvidenceSet(thr)
  const S = src('adapter_A_rs_general')
  const q = (question || '').toLowerCase()
  if (!optical && !sar) { es.add(ev(S, { claim: 'no raster supplied', confidence: 0 })); return es }
  const kind = intent(q)
  const target = resolveTarget(q)

  if (kind !== 'describe' && target) {
    const s = grounding(optical, sar, target, thr).items[0]
    if (kind === 'count') {
      es.add(ev(S, { claim: `count of ${target} regions`, value: s.value, unit: 'regions', confidence: s.confidence, modality: s.modality, boxes: s.boxes, mask_area_ha: s.mask_area_ha, method: 'connected-component labelling over the thresholded index', supporting: s.supporting }))
    } else if (kind === 'presence') {
      es.add(ev(S, { claim: `presence of ${target}`, value: s.value ? 'yes' : 'no', confidence: s.confidence, modality: s.modality, boxes: s.boxes.slice(0, 6), mask_area_ha: s.mask_area_ha, method: 'thresholded index, then area test', supporting: s.supporting }))
    } else {
      es.add(ev(S, { claim: `area of ${target}`, value: s.mask_area_ha, unit: 'ha', confidence: s.confidence, modality: s.modality, mask_area_ha: s.mask_area_ha, method: 'pixel count x ground sample distance squared', supporting: s.supporting }))
    }
    return es
  }
  if (kind === 'count' || kind === 'presence') {
    es.add(ev(S, { claim: kind === 'count' ? 'nothing countable named in the question' : 'nothing identifiable named', confidence: 0, supporting: [`vocabulary: ${Object.keys(TARGETS).join(', ')}`] }))
    return es
  }
  return dominant(optical, sar, es)
}

/**
 * RQ-1 — a structured scene summary: land-cover shares, plus the object
 * classes the specialists can count (audit B3). Built from measurements.
 */
function dominant(optical: Raster | undefined, sar: Raster | undefined, es: EvidenceSet): EvidenceSet {
  const S = src('adapter_A_rs_general')
  const shares: Record<string, number> = {}
  if (optical && has(optical, 'nir') && has(optical, 'red')) {
    const veg = cv.ndvi(named(optical, 'nir'), named(optical, 'red'))
    const wat = has(optical, 'green') ? cv.ndwi(named(optical, 'green'), named(optical, 'nir')) : null
    let v = 0, wa = 0, low = 0
    for (let i = 0; i < veg.length; i++) {
      if (veg[i] > 0.28) v++; else low++
      if (wat && wat[i] > 0.05) wa++
    }
    shares.vegetation = v / veg.length
    shares.water = wa / veg.length
    shares['bare soil'] = low / veg.length - shares.water
  }
  if (sar) {
    const vv = cv.leeFilter(named(sar, 'vv'), sar.width, sar.height)
    shares['built-up'] = cv.countTrue(cv.threshold(vv, cv.otsu(vv), true)) / vv.length
    // the Python uses a strict ">" here; >= differs by at most the threshold bin
  }
  for (const k of Object.keys(shares)) shares[k] = Math.max(0, shares[k])
  const keys = Object.keys(shares)
  if (!keys.length) { es.add(ev(S, { claim: 'insufficient bands to classify', confidence: 0 })); return es }
  const top = keys.reduce((a, b) => (shares[b] > shares[a] ? b : a))
  es.add(ev(S, {
    claim: 'dominant land cover', value: top, unit: '',
    confidence: Math.round((0.45 + 0.45 * shares[top]) * 1000) / 1000,
    modality: optical && sar ? 'fused' : optical ? 'optical' : 'sar',
    method: 'spectral index shares and backscatter share, compared',
    supporting: keys.sort((a, b) => shares[b] - shares[a]).map((k) => `${k}: ${(shares[k] * 100).toFixed(1)}%`),
  }))
  // the objects the scene contains, counted rather than named
  for (const t of ['water', 'built'] as const) {
    if (t === 'built' && !sar) continue
    const g = grounding(optical, sar, t, es.threshold).items[0]
    if (g.value) es.add(ev(S, { claim: `${t === 'built' ? 'built-up' : 'water'} objects in scene`, value: g.value, unit: 'regions', confidence: g.confidence, modality: g.modality, boxes: g.boxes, mask_area_ha: g.mask_area_ha, method: g.method, supporting: g.supporting.slice(0, 2) }))
  }
  return es
}

/* --------------------------------------------------------------- change */

function semantics(t1: Raster, t2: Raster, mask: cv.Mask): [number | null, string] {
  if (!(has(t1, 'nir') && has(t1, 'red') && has(t2, 'nir') && has(t2, 'red'))) return [null, 'no NIR/red pair — change type not classified']
  const v1 = cv.ndvi(named(t1, 'nir'), named(t1, 'red'))
  const v2 = cv.ndvi(named(t2, 'nir'), named(t2, 'red'))
  if (cv.countTrue(mask) < 10) return [0, 'changed area too small to classify']
  let d = 0, n = 0, b1 = 0, b2 = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) { d += v2[i] - v1[i]; n++ }
    if (v1[i] < 0.15) b1++
    if (v2[i] < 0.15) b2++
  }
  d /= n
  const kind = d < -0.05 ? 'vegetation lost inside the changed region — consistent with construction'
    : d > 0.05 ? 'vegetation gained inside the changed region — consistent with regrowth'
      : 'no consistent vegetation trend inside the changed region'
  return [(b2 - b1) / mask.length * 100, `${kind} (mean NDVI delta ${d >= 0 ? '+' : ''}${d.toFixed(3)})`]
}

export function change(t1: Raster, t2: Raster, _q = '', thr = 0.45): EvidenceSet {
  const es = new EvidenceSet(thr)
  const S = src('adapter_C_change')
  const reg = coregistrationOffset(t1, t2)
  if (!reg.same_shape) {
    es.add(ev(S, { claim: 'pair not comparable', confidence: 0, method: 'shape mismatch', conflicts: [`${t1.height}x${t1.width} vs ${t2.height}x${t2.width}`] }))
    return es
  }
  const { width: w, height: h } = t2
  let mag = cv.changeVector(t1.data, t2.data)
  mag = cv.boxBlur(mag, w, h, 1)
  const t = cv.otsu(mag)
  let mask = cv.opening(cv.threshold(mag, t), w, h, 1)
  mask = cv.closing(mask, w, h, 2)
  const [labels, n] = cv.connectedComponents(mask, w, h)
  const props = cv.regionProps(labels, n, w, 80)
  let conf = confidenceFromSeparation(mag, t)
  if (!reg.aligned) conf = Math.max(0, conf - 0.2)
  const area = maskAreaHa(cv.countTrue(mask), t2)
  const total = maskAreaHa(w * h, t2)
  const [direction, sem] = semantics(t1, t2, mask)
  const item = ev(S, {
    claim: props.length ? 'change detected between the two dates' : 'no significant change detected',
    value: props.length, unit: 'regions',
    confidence: props.length ? conf : Math.max(0.35, conf - 0.15), modality: 'temporal',
    boxes: boxesFromProps(props, t2), mask_area_ha: area,
    method: 'change vector analysis, Otsu threshold, morphological clean',
    supporting: [
      `changed area ${area.toFixed(2)} ha of ${total.toFixed(2)} ha (${(area / Math.max(total, 1e-9) * 100).toFixed(2)}%)`,
      `otsu threshold ${t.toFixed(4)}`,
      `co-registration offset ${reg.offset_px.toFixed(2)} px`,
      sem, `path: ${PATH}`,
    ],
  })
  if (!reg.aligned) item.conflicts.push(`co-registration offset ${reg.offset_px.toFixed(2)} px exceeds 1 px — change may be apparent rather than real`)
  es.add(item)
  if (direction !== null) {
    es.add(ev(S, { claim: 'built-up area trend', value: Math.round(direction * 1000) / 1000, unit: '%', confidence: conf, modality: 'temporal', method: 'built-up share at T2 minus built-up share at T1', supporting: [sem] }))
  }
  return es
}

/* --------------------------------------------------------------- fusion */

export function sarStructures(sar: Raster) {
  const { width: w, height: h } = sar
  const vv = cv.leeFilter(named(sar, 'vv'), w, h, 7, 4)
  const thr = cv.otsuMulti(vv)[1]
  const hard = cv.closing(cv.opening(cv.threshold(vv, thr), w, h, 1), w, h, 1)
  return { vv, thr, hard }
}

export function cloudOf(optical: Raster) {
  const { width: w, height: h } = optical
  return cv.closing(cv.opening(cv.cloudMask(optical.data), w, h, 1), w, h, 2)
}

export function fusion(optical: Raster, sarIn: Raster, _q = '', thr = 0.45): EvidenceSet {
  const es = new EvidenceSet(thr)
  const S = src('fusion_late_v0')
  const reg = coregistrationOffset(optical, sarIn)
  const sar = alignTo(optical, sarIn)
  const { width: w, height: h } = optical
  es.add(ev(S, {
    claim: reg.aligned ? 'co-registration verified' : 'co-registration outside tolerance',
    value: reg.offset_px, unit: 'px', confidence: reg.aligned ? 0.95 : 0.30, modality: 'fused',
    method: 'geometric extent + phase correlation',
    supporting: [`geometric ${reg.geometric_px.toFixed(2)} px`, `phase ${reg.phase_px.toFixed(2)} px`, `same CRS: ${reg.same_crs}`],
  }))

  // optical: where can we actually see?
  const cloud = cloudOf(optical)
  const cloudN = cv.countTrue(cloud)
  es.add(ev(S, {
    claim: 'optical scene obscured by cloud', value: Math.round(cloudN / cloud.length * 10000) / 100, unit: '%',
    confidence: 0.88, modality: 'optical', mask_area_ha: maskAreaHa(cloudN, optical),
    method: 'brightness and spectral flatness across visible bands',
    supporting: [`${cloudN.toLocaleString('en-US')} px of ${cloud.length.toLocaleString('en-US')}`],
  }))

  // SAR: structures, everywhere, cloud or not
  const { vv, thr: t, hard } = sarStructures(sar)
  const [labels, n] = cv.connectedComponents(hard, w, h)
  const minArea = Math.max(12, Math.floor(48 * (w * h) / (512 * 512)))
  const props = cv.regionProps(labels, n, w, minArea)
  const sarConf = confidenceFromSeparation(vv, t)
  const hardN = cv.countTrue(hard)
  es.add(ev(S, {
    claim: 'built-up areas detected by backscatter', value: props.length, unit: 'areas', confidence: sarConf, modality: 'sar',
    boxes: boxesFromProps(props, sar), mask_area_ha: maskAreaHa(hardN, sar),
    method: 'Lee filter, Otsu on backscatter, connected components',
    supporting: [
      `threshold ${t.toFixed(4)} linear (${cv.toDb(t).toFixed(1)} dB), upper of a 3-class Otsu split`,
      'Lee filter 7x7, 4 looks — speckle is multiplicative',
      'corner reflection from structures returns strongly', `path: ${PATH}`,
    ],
  }))

  // the complementarity measurement
  const recovered = cv.and(hard, cloud)
  const [rl, rn] = cv.connectedComponents(recovered, w, h)
  const rp = cv.regionProps(rl, rn, w, minArea)
  const recN = cv.countTrue(recovered)
  const recHa = maskAreaHa(recN, sar)
  es.add(ev(S, {
    claim: 'built-up areas recovered by SAR beneath cloud', value: rp.length, unit: 'areas',
    confidence: Math.round(Math.min(0.95, sarConf * 0.96) * 1000) / 1000, modality: 'fused',
    boxes: boxesFromProps(rp, sar), mask_area_ha: recHa,
    method: 'intersection of the SAR structure mask with the optical cloud mask',
    supporting: [
      `${(recN / Math.max(hardN, 1) * 100).toFixed(1)}% of detected built-up area lies under cloud`,
      `${recHa.toFixed(2)} ha invisible to the optical sensor`,
      'radar penetrates cloud; optical does not — this is the complementary information neither modality gives alone',
    ],
  }))

  // agreement where both can see
  const clearN = cloud.length - cloudN
  if (clearN > 100 && has(optical, 'nir') && has(optical, 'red')) {
    const veg = cv.ndvi(named(optical, 'nir'), named(optical, 'red'))
    let dis = 0, base = 0
    for (let i = 0; i < hard.length; i++) {
      if (hard[i] && !cloud[i]) { base++; if (veg[i] > 0.28) dis++ }
    }
    const rate = dis / Math.max(base, 1)
    const item = ev(S, {
      claim: 'cross-modal agreement in clear sky', value: Math.round((1 - rate) * 10000) / 100, unit: '%',
      confidence: Math.round((0.6 + 0.35 * (1 - rate)) * 1000) / 1000, modality: 'fused',
      method: 'SAR structure mask against optical NDVI, cloud-free pixels only',
      supporting: [`${((1 - rate) * 100).toFixed(1)}% of clear-sky built-up pixels are not vegetated in the optical scene`],
    })
    if (rate > 0.25) item.conflicts.push(`${(rate * 100).toFixed(1)}% of SAR built-up pixels fall on optically vegetated ground — possible volume scattering or misregistration`)
    es.add(item)
  }
  return es
}
