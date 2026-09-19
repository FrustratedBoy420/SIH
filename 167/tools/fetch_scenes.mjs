/**
 * Fetch the built-in demo scenes: real Sentinel-2 L2A and Sentinel-1 RTC over
 * west Hyderabad (Kokapet / Gandipet — Osman Sagar, the Outer Ring Road and
 * the Neopolis build-out), 512 × 512 px at 10 m in EPSG:32644.
 *
 *   optical  S2B 2024-08-10, monsoon cloud over part of the built-up area
 *   sar      S1A 2024-08-13 (RTC, γ⁰ linear), three days later, cloud-blind
 *   t1 / t2  S2A 2018-05-19 and S2B 2025-03-28, both clear
 *
 * Reads windows straight out of the public cloud-optimised GeoTIFFs with
 * geotiff.js (from web/node_modules) — no account, no GDAL. Writes raw bands
 * and a manifest to var/scenes-raw/; tools/bake_scenes.py turns them into the
 * GeoTIFFs under web/public/scenes/.
 *
 *     node tools/fetch_scenes.mjs && python3 tools/bake_scenes.py
 *
 * Sources: Element84 Earth Search (sentinel-2-l2a, Copernicus data on AWS) and
 * Microsoft Planetary Computer (sentinel-1-rtc, anonymous read token).
 * Contains modified Copernicus Sentinel data 2018, 2024, 2025.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const { fromUrl } = await import(path.join(here, '../web/node_modules/geotiff/dist-module/geotiff.js'))
const OUT = path.join(here, '../var/scenes-raw')
mkdirSync(OUT, { recursive: true })

// the frame: 5120 m square, snapped to the shared 10 m grid of both missions
const EPSG = 32644, SIZE = 512, RES = 10
const MINX = 211310, MINY = 1923110
const BBOX = [MINX, MINY, MINX + SIZE * RES, MINY + SIZE * RES]

const S2 = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/'
const S1 = 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-1-rtc/items/'

const SCENES = [
  { role: 'optical', kind: 's2', id: 'S2B_44QKE_20240810_0_L2A' },
  { role: 'sar', kind: 's1', id: 'S1A_IW_GRDH_1SDV_20240813T003913_20240813T003938_055187_06B9ED_rtc' },
  { role: 't1', kind: 's2', id: 'S2A_44QKE_20180519_0_L2A' },
  { role: 't2', kind: 's2', id: 'S2B_44QKE_20250328_0_L2A' },
]

async function window(href, resample = 'nearest', size = SIZE) {
  const tiff = await fromUrl(href)
  const img = await tiff.getImage()
  const code = img.getGeoKeys()?.ProjectedCSTypeGeoKey
  if (code !== EPSG) throw new Error(`${href} is EPSG:${code}, expected ${EPSG}`)
  const r = await tiff.readRasters({ bbox: BBOX, width: size, height: size, resampleMethod: resample })
  return r[0]
}

const json = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} → HTTP ${r.status}`); return r.json() }

const manifest = { epsg: EPSG, size: SIZE, resolution_m: RES, bbox: BBOX, scenes: {} }
for (const sc of SCENES) {
  const bands = {}
  let item
  if (sc.kind === 's2') {
    item = await json(S2 + sc.id)
    // 10 m bands in R, G, B, NIR order, as the pipeline assumes for 4-band optical
    for (const [name, key] of [['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['nir', 'nir']]) bands[name] = await window(item.assets[key].href)
    // SCL is 20 m; resampled nearest onto the 10 m frame. 8, 9, 10 = cloud medium, high, cirrus
    const scl = await window(item.assets.scl.href)
    let cloudy = 0
    for (const v of scl) if (v === 8 || v === 9 || v === 10) cloudy++
    sc.cloud_pct = +(100 * cloudy / scl.length).toFixed(1)
    sc.platform = `${item.properties.platform.replace('sentinel-', 'Sentinel-').toUpperCase().replace('SENTINEL', 'Sentinel')} MSI L2A`
  } else {
    item = await json(S1 + sc.id)
    const { token } = await json('https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-1-rtc')
    for (const pol of ['vv', 'vh']) bands[pol] = await window(`${item.assets[pol].href}?${token}`)
    sc.platform = `${item.properties.platform.replace('SENTINEL-', 'Sentinel-')} IW GRD · RTC γ⁰`
    sc.orbit = item.properties['sat:orbit_state']
  }
  for (const [name, arr] of Object.entries(bands)) writeFileSync(path.join(OUT, `${sc.role}_${name}.bin`), Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
  manifest.scenes[sc.role] = {
    product: sc.id, platform: sc.platform, acquired: item.properties.datetime,
    bands: Object.keys(bands), dtype: Object.values(bands)[0].constructor.name,
    ...(sc.cloud_pct !== undefined && { cloud_pct: sc.cloud_pct }), ...(sc.orbit && { orbit: sc.orbit }),
  }
  console.log(`${sc.role.padEnd(8)} ${sc.id}  ${manifest.scenes[sc.role].dtype}${sc.cloud_pct !== undefined ? `  cloud ${sc.cloud_pct}%` : ''}`)
}
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`→ ${OUT}`)
