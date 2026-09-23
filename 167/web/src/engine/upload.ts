/**
 * Upload parsing — GeoTIFF / TIFF / PNG / JPEG into a Raster.
 *
 * Runs in the worker for both engines: the API owns analysis once it is up,
 * but the browser still needs the pixels to draw the plate, and the metadata
 * panel (UI-05) should not wait on a round trip.
 *
 * Limits are declared and enforced before any pixel is decoded (API-13):
 * extension, file size, and pixel count — the last because a small
 * compressed TIFF can decode to gigabytes.
 */

import { EngineError, IDENTITY, canReproject, type Raster, type Sensor } from './raster'
import { percentile } from './cv'

export const LIMITS = {
  maxBytes: 250 * 1024 * 1024,
  maxPixels: 100_000_000,
  analysisMaxSide: 1024,
  extensions: ['.tif', '.tiff', '.png', '.jpg', '.jpeg'],
}

const ROLE_SENSOR: Record<string, Sensor> = { optical: 'optical', sar: 'sar', t1: 'optical', t2: 'optical' }

const BAND_ALIASES: [RegExp, string][] = [
  [/\b(red|b0?4)\b/i, 'red'], [/\b(green|b0?3)\b/i, 'green'], [/\b(blue|b0?2)\b/i, 'blue'],
  [/\b(nir|near.?infra.?red|b0?8a?)\b/i, 'nir'], [/\b(swir|b1[12])\b/i, 'swir'],
  [/\bvv\b/i, 'vv'], [/\bvh\b/i, 'vh'], [/\bhh\b/i, 'hh'], [/\bhv\b/i, 'hv'], [/\b(pan|panchromatic)\b/i, 'pan'],
]

function bandNamesFromGdal(meta: string | undefined, count: number): string[] | null {
  if (!meta) return null
  const names: string[] = new Array(count).fill('')
  const re = /<Item name="DESCRIPTION" sample="(\d+)"[^>]*>([^<]*)<\/Item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(meta))) {
    const i = Number(m[1])
    const hit = BAND_ALIASES.find(([rx]) => rx.test(m![2]))
    if (i < count && hit) names[i] = hit[1]
  }
  return names.every(Boolean) ? names : null
}

function assumedBands(sensor: Sensor, count: number, role: string): [string[], string] {
  if (sensor === 'sar') {
    if (count === 1) return [['vv'], 'single-pol, read as co-pol (VV or HH)']
    return [['vv', 'vh', ...Array.from({ length: count - 2 }, (_, i) => `b${i + 3}`)], 'dual-pol, read as co-pol then cross-pol']
  }
  if (count === 1) return [['pan'], 'one band — panchromatic']
  if (count === 3) return [['red', 'green', 'blue'], 'three bands, read as R,G,B — no NIR, so NDVI/NDWI are unavailable']
  if (count >= 4) return [['red', 'green', 'blue', 'nir', ...Array.from({ length: count - 4 }, (_, i) => `b${i + 5}`)], 'no band descriptions in the file; order assumed R,G,B,NIR']
  return [Array.from({ length: count }, (_, i) => `b${i + 1}`), `${count} unnamed bands (${role})`]
}

/** Per-sensor radiometric normalisation (ING-05). Stated, never silent. */
function normalise(data: Float32Array[], sensor: Sensor, bitsPerSample: number): string {
  let max = -Infinity, min = Infinity
  for (const b of data) for (let i = 0; i < b.length; i += 7) { if (b[i] > max) max = b[i]; if (b[i] < min) min = b[i] }
  if (sensor === 'sar') {
    if (min < 0) {
      for (const b of data) for (let i = 0; i < b.length; i++) b[i] = Math.pow(10, b[i] / 10)
      return 'backscatter supplied in dB; converted to linear power'
    }
    if (max > 1.5) {
      const [p] = percentile(data[0], [99.5])
      for (const b of data) for (let i = 0; i < b.length; i++) b[i] = Math.min(b[i] / p, 1.5)
      return `linear DN scaled by the 99.5th percentile (${p.toFixed(1)})`
    }
    return 'linear backscatter, unscaled'
  }
  if (max <= 1.5) return 'reflectance 0–1, unscaled'
  // The scale is judged from the 99.9th percentile of the first band, not the
  // brightest pixel: a few saturated cloud pixels above 12 000 must not flip a
  // Sentinel-2 scene from /10 000 to /65 535 and darken all of it.
  const [top] = percentile(data[0], [99.9])
  const div = bitsPerSample <= 8 || top <= 255 ? 255 : top <= 12000 ? 10000 : top <= 65535 ? 65535 : top
  for (const b of data) for (let i = 0; i < b.length; i++) b[i] = Math.min(Math.max(b[i] / div, 0), 1)
  return `digital numbers divided by ${div}`
}

function ext(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export async function parseUpload(file: File, role: string, id: string): Promise<Raster> {
  const e = ext(file.name)
  if (!LIMITS.extensions.includes(e)) {
    throw new EngineError('unsupported_format', `"${file.name}" is not a supported format.`, 'Upload a GeoTIFF (.tif/.tiff). PNG and JPEG are accepted only for benchmark imagery.')
  }
  if (file.size > LIMITS.maxBytes) {
    throw new EngineError('file_too_large', `"${file.name}" is ${(file.size / 1048576).toFixed(0)} MB; the limit is ${LIMITS.maxBytes / 1048576} MB.`, 'Clip the scene to the area of interest and upload again.')
  }
  const sensor = ROLE_SENSOR[role] ?? 'optical'
  // The filename is displayed, never used as a path (API-13).
  const source = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 120)
  if (e === '.png' || e === '.jpg' || e === '.jpeg') return parsePicture(file, role, id, sensor, source)
  return parseTiff(file, role, id, sensor, source)
}

async function parsePicture(file: File, role: string, id: string, sensor: Sensor, source: string): Promise<Raster> {
  const bmp = await createImageBitmap(file)
  if (bmp.width * bmp.height > LIMITS.maxPixels) throw new EngineError('too_many_pixels', `${bmp.width}×${bmp.height} exceeds the pixel limit.`, 'Downsample the image first.')
  const s = Math.min(1, LIMITS.analysisMaxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const count = sensor === 'sar' ? 1 : 3
  const data = Array.from({ length: count }, () => new Float32Array(w * h))
  for (let i = 0; i < w * h; i++) {
    if (sensor === 'sar') data[0][i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / (3 * 255)
    else for (let b = 0; b < 3; b++) data[b][i] = px[i * 4 + b] / 255
  }
  const [bandNames, order] = assumedBands(sensor, count, role)
  return {
    id, role, data, width: w, height: h, bandNames, sensor, crs: 'none', georeferenced: false, transform: IDENTITY,
    source, acquired: '',
    meta: {
      band_order: order, normalisation: sensor === 'sar' ? '8-bit greyscale — not calibrated backscatter' : '8-bit, divided by 255',
      analysed_at: `${w}×${h} px`, benchmark_format: true,
      note: 'PNG/JPEG carry no georeferencing — accepted for benchmark imagery only; areas are in pixels',
    },
  }
}

async function parseTiff(file: File, role: string, id: string, sensor: Sensor, source: string): Promise<Raster> {
  return parseTiffBuffer(await file.arrayBuffer(), role, id, sensor, source)
}

/** A GeoTIFF already in memory — an upload, or a built-in scene fetched from /scenes/. */
export async function parseTiffBuffer(buf: ArrayBuffer, role: string, id: string, sensor: Sensor, source: string): Promise<Raster> {
  const { fromArrayBuffer } = await import('geotiff')
  let tiff
  try {
    tiff = await fromArrayBuffer(buf)
  } catch {
    throw new EngineError('unreadable_tiff', `"${source}" could not be read as a TIFF — the header is malformed or truncated.`, 'Re-export the raster as a standard GeoTIFF and upload again.')
  }
  const image = await tiff.getImage()
  const W = image.getWidth(), H = image.getHeight()
  if (W * H > LIMITS.maxPixels) {
    throw new EngineError('too_many_pixels', `${W.toLocaleString('en-US')}×${H.toLocaleString('en-US')} px exceeds the ${LIMITS.maxPixels / 1e6} MP limit.`, 'Clip or downsample the scene; the API tiles large scenes, the preview does not.')
  }
  const s = Math.min(1, LIMITS.analysisMaxSide / Math.max(W, H))
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s))
  // Bands either interleave in one image or sit one per page, as the Python
  // reader also accepts. Pages count as bands only when every page is the
  // same size as the first — otherwise they are overviews, not bands.
  const pages = [image]
  if (image.getSamplesPerPixel() === 1) {
    const n = await tiff.getImageCount()
    for (let k = 1; k < n; k++) {
      const pg = await tiff.getImage(k)
      if (pg.getWidth() !== W || pg.getHeight() !== H || pg.getSamplesPerPixel() !== 1) break
      pages.push(pg)
    }
  }
  const data: Float32Array[] = []
  for (const pg of pages) {
    const rasters = await pg.readRasters({ width: w, height: h, resampleMethod: 'bilinear' })
    for (let b = 0; b < rasters.length; b++) {
      const src = rasters[b] as ArrayLike<number>
      const f = new Float32Array(w * h)
      for (let i = 0; i < f.length; i++) f[i] = Number(src[i])
      data.push(f)
    }
  }
  const count = data.length

  // ---- georeferencing ----
  let crs = 'none', georeferenced = false, transform = IDENTITY
  const geo = image.getGeoKeys() as Record<string, number> | null
  const code = geo?.ProjectedCSTypeGeoKey ?? geo?.GeographicTypeGeoKey
  try {
    const [ox, oy] = image.getOrigin()
    const [rx, ry] = image.getResolution()
    if (code && code !== 32767) {
      crs = `EPSG:${code}`
      transform = { ox, pw: rx * (W / w), rr: 0, oy, cr: 0, ph: ry * (H / h) }
      georeferenced = canReproject(crs)
    }
  } catch { /* no tiepoint / pixel scale: not georeferenced */ }

  const fd = image.getFileDirectory() as unknown as Record<string, unknown>
  const gdal = typeof fd.GDALMetadata === 'string' ? fd.GDALMetadata : typeof fd.GDAL_METADATA === 'string' ? fd.GDAL_METADATA : undefined
  const described = bandNamesFromGdal(gdal as string | undefined, count)
  const [assumed, order] = assumedBands(sensor, count, role)
  const bandNames = described ?? assumed
  const bits = (image.getBitsPerSample?.() as number | undefined) ?? 16
  const norm = normalise(data, sensor, bits)

  const meta: Raster['meta'] = {
    band_order: described ? 'from GDAL band descriptions' : order,
    normalisation: norm,
    analysed_at: s < 1 ? `${w}×${h} px (resampled from ${W}×${H} for the preview)` : `${w}×${h} px`,
    original_size: `${W}×${H}`,
  }
  if (code && !georeferenced && crs !== 'none') meta.note = `${crs} is not one the preview engine can reproject; geography needs the API`
  if (!code) meta.note = 'This file has no coordinate reference system'
  if (sensor === 'sar') meta.polarisation = bandNames.filter((b) => ['vv', 'vh', 'hh', 'hv'].includes(b)).join('+').toUpperCase() || 'unknown'

  return {
    id, role, data, width: w, height: h, bandNames, sensor, crs: georeferenced ? crs : crs === 'none' ? 'none' : crs,
    georeferenced, transform, source, acquired: '', meta,
  }
}
