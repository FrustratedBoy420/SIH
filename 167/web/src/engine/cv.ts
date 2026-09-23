/**
 * Classical computer-vision primitives — a port of `satquery/cv.py`.
 *
 * These are the measurement layer: the count, the hectares and the boxes in
 * an answer come from here, never from language (ADR-007).
 */

export type Mask = Uint8Array

function finiteRange(x: Float32Array): [number, number] {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v }
  }
  return [lo, hi]
}

function histogram(x: Float32Array, bins: number, lo: number, hi: number): Float64Array {
  const hist = new Float64Array(bins)
  const scale = bins / (hi - lo)
  let total = 0
  for (let i = 0; i < x.length; i++) {
    const v = x[i]
    if (!Number.isFinite(v)) continue
    let b = Math.floor((v - lo) * scale)
    if (b >= bins) b = bins - 1
    if (b < 0) b = 0
    hist[b]++
    total++
  }
  for (let b = 0; b < bins; b++) hist[b] /= Math.max(total, 1)
  return hist
}

/** Otsu's threshold: the value that minimises intra-class variance. */
export function otsu(x: Float32Array, bins = 256): number {
  const [lo, hi] = finiteRange(x)
  if (!Number.isFinite(lo)) return 0
  if (hi - lo < 1e-9) return lo
  const p = histogram(x, bins, lo, hi)
  const step = (hi - lo) / bins
  let total = 0
  for (let b = 0; b < bins; b++) total += p[b] * (lo + (b + 0.5) * step)
  let w0 = 0, m0s = 0, best = -1, bestB = 0
  for (let b = 0; b < bins; b++) {
    const c = lo + (b + 0.5) * step
    w0 += p[b]
    m0s += p[b] * c
    const w1 = 1 - w0
    const m0 = m0s / (w0 < 1e-12 ? 1 : w0)
    const m1 = (total - m0s) / (w1 < 1e-12 ? 1 : w1)
    const between = w0 * w1 * (m0 - m1) ** 2
    if (between > best) { best = between; bestB = b }
  }
  return lo + (bestB + 0.5) * step
}

/**
 * Multi-level Otsu, three classes, exhaustive over a 128-bin histogram.
 * A scene has four scattering regimes; the upper threshold of a three-class
 * split isolates the brightest mode instead of halving the scene.
 */
export function otsuMulti(x: Float32Array, bins = 128): [number, number] {
  const [lo, hi] = finiteRange(x)
  if (!Number.isFinite(lo)) return [0, 0]
  if (hi - lo < 1e-9) return [lo, lo]
  const p = histogram(x, bins, lo, hi)
  const step = (hi - lo) / bins
  const w = new Float64Array(bins), m = new Float64Array(bins)
  let cw = 0, cm = 0
  for (let b = 0; b < bins; b++) {
    cw += p[b]; cm += p[b] * (lo + (b + 0.5) * step)
    w[b] = cw; m[b] = cm
  }
  const band = (i: number, j: number) => {
    const wt = w[j] - (i >= 0 ? w[i] : 0)
    if (wt < 1e-12) return 0
    const mu = (m[j] - (i >= 0 ? m[i] : 0)) / wt
    return wt * mu * mu
  }
  let best = -1, bi = Math.floor(bins / 3), bj = Math.floor(2 * bins / 3)
  for (let i = 1; i < bins - 2; i++) {
    const b0 = band(-1, i)
    for (let j = i + 1; j < bins - 1; j++) {
      const v = b0 + band(i, j) + band(j, bins - 1)
      if (v > best) { best = v; bi = i; bj = j }
    }
  }
  return [lo + (bi + 0.5) * step, lo + (bj + 0.5) * step]
}

/* ------------------------------------------------------------ morphology */

export function dilate(mask: Mask, w: number, h: number, r = 1): Mask {
  let out = mask.slice()
  for (let k = 0; k < r; k++) {
    const acc = out.slice()
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (acc[i]) continue
        if ((x > 0 && out[i - 1]) || (x < w - 1 && out[i + 1]) ||
            (y > 0 && out[i - w]) || (y < h - 1 && out[i + w])) acc[i] = 1
      }
    }
    out = acc
  }
  return out
}

const not = (m: Mask): Mask => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = m[i] ? 0 : 1; return o }

export function erode(mask: Mask, w: number, h: number, r = 1): Mask {
  return not(dilate(not(mask), w, h, r))
}
/** Erode then dilate: removes speckle smaller than the kernel. */
export const opening = (m: Mask, w: number, h: number, r = 1) => dilate(erode(m, w, h, r), w, h, r)
/** Dilate then erode: fills holes smaller than the kernel. */
export const closing = (m: Mask, w: number, h: number, r = 1) => erode(dilate(m, w, h, r), w, h, r)

/** Box blur via a summed-area table over an edge-padded copy. */
export function boxBlur(x: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return x
  const p = r + 1, W = w + 2 * p, H = h + 2 * p
  const S = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.max(0, y - p))
    let row = 0
    for (let xx = 0; xx < W; xx++) {
      const sx = Math.min(w - 1, Math.max(0, xx - p))
      row += x[sy * w + sx]
      S[(y + 1) * (W + 1) + xx + 1] = S[y * (W + 1) + xx + 1] + row
    }
  }
  const k = 2 * r + 1
  const out = new Float32Array(w * h)
  const at = (yy: number, xx: number) => S[yy * (W + 1) + xx]
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      const y0 = i + 1, y1 = i + k, x0 = j + 1, x1 = j + k   // pad-space, inclusive
      out[i * w + j] = (at(y1 + 1, x1 + 1) - at(y0, x1 + 1) - at(y1 + 1, x0) + at(y0, x0)) / (k * k)
    }
  }
  return out
}

/* ------------------------------------------------- connected components */

export interface Region {
  label: number
  area_px: number
  bbox: [number, number, number, number]
  centroid: [number, number]
}

/** 8-connected labelling, union-find. Returns (labels, count). */
export function connectedComponents(mask: Mask, w: number, h: number): [Int32Array, number] {
  const labels = new Int32Array(w * h)
  const parent: number[] = [0]
  const find = (a: number) => {
    let r = a
    while (parent[r] !== r) r = parent[r]
    while (parent[a] !== r) { const n = parent[a]; parent[a] = r; a = n }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  let next = 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      const nb: number[] = []
      if (x > 0 && labels[i - 1]) nb.push(labels[i - 1])
      if (y > 0) {
        if (labels[i - w]) nb.push(labels[i - w])
        if (x > 0 && labels[i - w - 1]) nb.push(labels[i - w - 1])
        if (x < w - 1 && labels[i - w + 1]) nb.push(labels[i - w + 1])
      }
      if (nb.length === 0) { labels[i] = next; parent.push(next); next++ }
      else {
        let m = nb[0]
        for (const l of nb) if (l < m) m = l
        labels[i] = m
        for (const l of nb) union(m, l)
      }
    }
  }
  const remap = new Int32Array(next)
  let count = 0
  for (let l = 1; l < next; l++) {
    const r = find(l)
    if (!remap[r]) remap[r] = ++count
    remap[l] = remap[r]
  }
  for (let i = 0; i < labels.length; i++) if (labels[i]) labels[i] = remap[labels[i]]
  return [labels, count]
}

/** Per-region area, bounding box and centroid, largest first. */
export function regionProps(labels: Int32Array, count: number, w: number, minArea = 0): Region[] {
  if (count === 0) return []
  const area = new Float64Array(count + 1)
  const minx = new Int32Array(count + 1).fill(1 << 30), maxx = new Int32Array(count + 1).fill(-1)
  const miny = new Int32Array(count + 1).fill(1 << 30), maxy = new Int32Array(count + 1).fill(-1)
  const sx = new Float64Array(count + 1), sy = new Float64Array(count + 1)
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    if (!l) continue
    const x = i % w, y = (i - x) / w
    area[l]++
    if (x < minx[l]) minx[l] = x
    if (x > maxx[l]) maxx[l] = x
    if (y < miny[l]) miny[l] = y
    if (y > maxy[l]) maxy[l] = y
    sx[l] += x; sy[l] += y
  }
  const out: Region[] = []
  for (let l = 1; l <= count; l++) {
    const a = area[l]
    if (a === 0 || a < minArea) continue
    out.push({ label: l, area_px: a, bbox: [minx[l], miny[l], maxx[l], maxy[l]], centroid: [sx[l] / a, sy[l] / a] })
  }
  out.sort((a, b) => b.area_px - a.area_px)
  return out
}

/* ------------------------------------------------------------------- SAR */

/** Lee filter — speckle is multiplicative, so smooth only where variance is speckle-like. */
export function leeFilter(img: Float32Array, w: number, h: number, size = 5, looks = 4): Float32Array {
  const r = Math.floor(size / 2)
  const mean = boxBlur(img, w, h, r)
  const sqIn = new Float32Array(img.length)
  for (let i = 0; i < img.length; i++) sqIn[i] = img[i] * img[i]
  const sq = boxBlur(sqIn, w, h, r)
  const cu2 = 1 / looks
  const out = new Float32Array(img.length)
  for (let i = 0; i < img.length; i++) {
    const mu = mean[i]
    const v = Math.max(sq[i] - mu * mu, 0)
    const ci2 = v / Math.max(mu * mu, 1e-8)
    const k = Math.min(1, Math.max(0, 1 - cu2 / Math.max(ci2, 1e-8)))
    out[i] = mu + k * (img[i] - mu)
  }
  return out
}

export const toDb = (v: number, floor = 1e-4) => 10 * Math.log10(Math.max(v, floor))

/** Percentile on a strided sample — display and summary use only. */
export function percentile(x: Float32Array, q: number[]): number[] {
  const stride = Math.max(1, Math.floor(x.length / 65536))
  const s: number[] = []
  for (let i = 0; i < x.length; i += stride) if (Number.isFinite(x[i])) s.push(x[i])
  s.sort((a, b) => a - b)
  return q.map((p) => {
    if (!s.length) return 0
    const pos = (p / 100) * (s.length - 1)
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)
  })
}

/* --------------------------------------------------------------- indices */

export function ndvi(nir: Float32Array, red: Float32Array): Float32Array {
  const o = new Float32Array(nir.length)
  for (let i = 0; i < o.length; i++) o[i] = (nir[i] - red[i]) / Math.max(nir[i] + red[i], 1e-6)
  return o
}

export function ndwi(green: Float32Array, nir: Float32Array): Float32Array {
  const o = new Float32Array(nir.length)
  for (let i = 0; i < o.length; i++) o[i] = (green[i] - nir[i]) / Math.max(green[i] + nir[i], 1e-6)
  return o
}

/** Cloud: bright, spectrally flat, no vegetation signal. Tuned for precision. */
/**
 * Clip the bright tail of linear backscatter at the 95th percentile before an
 * Otsu split, so corner-reflector spikes do not take the whole top class.
 * Only the threshold moves; see satquery/cv.py `tail_clip` for why the
 * selected pixels are unchanged and for the measurements.
 */
export function tailClip(x: Float32Array, q = 95): Float32Array {
  const [p] = percentile(x, [q])
  const o = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) o[i] = Math.min(x[i], p)
  return o
}

/**
 * Opaque cloud in surface reflectance: bright, near-white, bluish, no
 * vegetation. `gain` is divided out first (the synthetic generator stores
 * reflectance × 2.2). Same rule and thresholds as satquery/cv.py
 * `cloud_mask`, where the precision/recall measurements are recorded.
 */
export function cloudMask(bands: Float32Array[], gain = 1, thresh = 0.26, relSpreadMax = 0.35, ndviMax = 0.3, blueRedMin = 0.9): Mask {
  const [R, G, B] = bands
  const N = bands.length >= 4 ? bands[3] : null
  const o = new Uint8Array(R.length)
  for (let i = 0; i < o.length; i++) {
    const r = R[i] / gain, g = G[i] / gain, b = B[i] / gain
    const br = (r + g + b) / 3
    const flat = (Math.max(r, g, b) - Math.min(r, g, b)) / (br + 1e-6) < relSpreadMax
    const nir = N ? N[i] / gain : 0
    const veg = N ? (nir - r) / Math.max(nir + r, 1e-6) < ndviMax : true
    o[i] = br > thresh && flat && b >= blueRedMin * r && veg ? 1 : 0
  }
  return o
}

/** Change Vector Analysis magnitude across shared bands. */
export function changeVector(a: Float32Array[], b: Float32Array[]): Float32Array {
  const n = Math.min(a.length, b.length)
  const o = new Float32Array(a[0].length)
  for (let i = 0; i < o.length; i++) {
    let s = 0
    for (let k = 0; k < n; k++) { const d = a[k][i] - b[k][i]; s += d * d }
    o[i] = Math.sqrt(s)
  }
  return o
}

export const countTrue = (m: Mask) => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c }
export const and = (a: Mask, b: Mask): Mask => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] & b[i]; return o }
export const threshold = (x: Float32Array, t: number, above = true): Mask => {
  const o = new Uint8Array(x.length)
  for (let i = 0; i < x.length; i++) o[i] = (above ? x[i] >= t : x[i] <= t) ? 1 : 0
  return o
}

/* -------------------------------------------------- phase correlation */

function fft1(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inverse ? 1 : -1)
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = ncr
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}

export function fft2(re: Float64Array, im: Float64Array, n: number, inverse = false) {
  const rr = new Float64Array(n), ri = new Float64Array(n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) { rr[x] = re[y * n + x]; ri[x] = im[y * n + x] }
    fft1(rr, ri, inverse)
    for (let x = 0; x < n; x++) { re[y * n + x] = rr[x]; im[y * n + x] = ri[x] }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) { rr[y] = re[y * n + x]; ri[y] = im[y * n + x] }
    fft1(rr, ri, inverse)
    for (let y = 0; y < n; y++) { re[y * n + x] = rr[y]; im[y * n + x] = ri[y] }
  }
}
