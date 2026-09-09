/**
 * The chart. MapLibre GL, with every layer sourced from the run itself.
 *
 * **No basemap, on purpose.** There is no tile server here, and adding one
 * would make the workstation useless at a venue with no network — which is
 * where it has to work. The sea is a flat S-52 night fill, the land comes from
 * the run's own coastline, and the imagery is the run's own georeferenced SAR
 * raster. Everything drawn is evidence; nothing is borrowed scenery.
 *
 * Layer order, bottom to top, is the order of inference: what the sensor saw,
 * then what we concluded from it, then who was there.
 */

import { useEffect, useRef } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 loads its worker by URL, and the worker imports a sibling chunk by
// a relative path of its own. `vite.config.ts` emits both beside this bundle;
// resolving against `import.meta.url` finds them wherever the app is mounted.
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson'

import { runFile } from '../api'

setWorkerUrl(new URL('./maplibre-gl-worker.mjs', import.meta.url).href)
import type { Bounds, Cloud, LonLat, Ranked, Run } from '../types'

export interface LayerToggles {
  sar: boolean
  slick: boolean
  particles: boolean
  origin: boolean
  tracks: boolean
  reachable: boolean
  radar: boolean
  forecast: boolean
}

interface Props {
  run: Run
  cloud: Cloud | null
  hour: number
  ranked: Ranked[]
  selected: string | null
  onSelect: (mmsi: string | null) => void
  layers: LayerToggles
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Suspicion drives colour, so the map and the rail cannot disagree. */
function suspicionColour(score: number): string {
  if (score >= 0.75) return '#e0409a'
  if (score >= 0.5) return '#b8579f'
  if (score >= 0.3) return '#5b7fb8'
  return '#3f6a80'
}

export default function Chart({
  run,
  cloud,
  hour,
  ranked,
  selected,
  onSelect,
  layers,
}: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const ready = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ---- create once ------------------------------------------------------ //
  useEffect(() => {
    if (!holder.current || map.current) return
    // A run that halts at gate 5 never reaches the stage that writes a raster,
    // so `rasters` is absent by design. The chart still has to draw whatever
    // the run did produce, and failing here would take the whole view down
    // over a case the pipeline handles correctly.
    const b = extent(run)

    const m = new MapLibreMap({
      container: holder.current,
      style: {
        // No glyphs and no sprite: nothing on this chart is label-driven, and
        // declaring an undefined glyph URL makes MapLibre log a style error.
        version: 8,
        sources: {},
        layers: [{ id: 'sea', type: 'background', paint: { 'background-color': '#0a121c' } }],
      },
      center: [(b.west + b.east) / 2, (b.south + b.north) / 2],
      zoom: 9,
      attributionControl: false,
      dragRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left')
    m.addControl(new ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right')

    m.on('load', () => {
      ready.current = true
      try {
        buildLayers(m, run)
      } catch (err) {
        console.error('chart layers', err)
      }
      m.fitBounds(
        [
          [b.west, b.south],
          [b.east, b.north],
        ],
        { padding: 60, duration: 0 },
      )
      m.on('click', 'tracks-hit', (e: MapMouseEvent & { features?: Feature[] }) => {
        const f = e.features?.[0]
        onSelectRef.current(f ? ((f.properties?.mmsi as string) ?? null) : null)
      })
      m.on('mouseenter', 'tracks-hit', () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', 'tracks-hit', () => (m.getCanvas().style.cursor = ''))
    })

    map.current = m
    return () => {
      m.remove()
      map.current = null
      ready.current = false
    }
  }, [run])

  // ---- data that changes with the hour ---------------------------------- //
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    setData(m, 'particles', particleFeatures(cloud, hour))
    setData(m, 'ships', shipFeatures(run, ranked, hour))
  }, [cloud, hour, ranked, run])

  // ---- data that changes with ranking or selection ----------------------- //
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    setData(m, 'tracks', trackFeatures(run, ranked, selected))
    setData(m, 'reachable', reachableFeatures(ranked, selected))
  }, [run, ranked, selected])

  // ---- visibility -------------------------------------------------------- //
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    const show: Record<string, boolean> = {
      sar: layers.sar,
      'slick-fill': layers.slick,
      'slick-line': layers.slick,
      particles: layers.particles,
      'origin-fill': layers.origin,
      'origin-line': layers.origin,
      tracks: layers.tracks,
      'tracks-dark': layers.tracks,
      'tracks-hit': layers.tracks,
      ships: layers.tracks,
      'reachable-fill': layers.reachable,
      'reachable-line': layers.reachable,
      radar: layers.radar,
      'forecast-line': layers.forecast,
      'forecast-point': layers.forecast,
    }
    for (const [id, on] of Object.entries(show)) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
  }, [layers])

  return <div className="map" ref={holder} aria-label="Incident chart" />
}

// ------------------------------------------------------------------ layers //

/**
 * The area the chart should open on.
 *
 * The detection raster when there is one; otherwise whatever geometry the run
 * did reach, and finally a small box around the origin so a halted run still
 * opens somewhere real rather than at null island.
 */
function extent(run: Run): Bounds {
  const r = run.rasters?.detection?.bounds
  if (r) return r

  const pts: LonLat[] = [
    ...(run.geometry?.polygon ?? []),
    ...(run.drift?.origin_region?.flat() ?? []),
    ...(run.drift?.coastline ?? []),
    ...(run.traffic?.vessels ?? []).flatMap((v) =>
      v.track.map(([lon, lat]) => [lon, lat] as LonLat),
    ),
  ]
  if (!pts.length) return { west: 68.6, south: 22.0, east: 70.0, north: 23.0 }

  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  const pad = 0.05
  return {
    west: Math.min(...lons) - pad,
    south: Math.min(...lats) - pad,
    east: Math.max(...lons) + pad,
    north: Math.max(...lats) + pad,
  }
}

function buildLayers(m: MapLibreMap, run: Run) {
  const r = run.rasters?.detection

  // 1. what the sensor saw, when the run got far enough to record it
  if (r) {
    const b = r.bounds
    m.addSource('sar', {
      type: 'image',
      url: runFile(run.run_id, r.file),
      coordinates: [
        [b.west, b.north],
        [b.east, b.north],
        [b.east, b.south],
        [b.west, b.south],
      ],
    })
    m.addLayer({
      id: 'sar',
      type: 'raster',
      source: 'sar',
      paint: { 'raster-opacity': 0.62, 'raster-contrast': -0.12, 'raster-saturation': -1 },
    })
  }

  // 2. land, from the run's own coastline
  const coast = run.drift?.coastline ?? []
  m.addSource('coast', {
    type: 'geojson',
    data: coast.length
      ? {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coast } as LineString },
          ],
        }
      : EMPTY,
  })
  m.addLayer({
    id: 'coast',
    type: 'line',
    source: 'coast',
    paint: { 'line-color': '#4a3f28', 'line-width': 2 },
  })

  // 3. what we concluded — origin region first, it is the largest claim
  m.addSource('origin', { type: 'geojson', data: originFeatures(run) })
  m.addLayer({
    id: 'origin-fill',
    type: 'fill',
    source: 'origin',
    paint: { 'fill-color': '#e0409a', 'fill-opacity': 0.13 },
  })
  m.addLayer({
    id: 'origin-line',
    type: 'line',
    source: 'origin',
    paint: { 'line-color': '#e0409a', 'line-width': 1.4, 'line-dasharray': [3, 2] },
  })

  m.addSource('particles', { type: 'geojson', data: EMPTY })
  m.addLayer({
    id: 'particles',
    type: 'circle',
    source: 'particles',
    paint: {
      'circle-radius': 1.7,
      'circle-color': '#4fd5d0',
      'circle-opacity': 0.55,
    },
  })

  m.addSource('slick', { type: 'geojson', data: slickFeatures(run) })
  m.addLayer({
    id: 'slick-fill',
    type: 'fill',
    source: 'slick',
    paint: { 'fill-color': '#eef4fa', 'fill-opacity': 0.16 },
  })
  m.addLayer({
    id: 'slick-line',
    type: 'line',
    source: 'slick',
    paint: { 'line-color': '#eef4fa', 'line-width': 1.6 },
  })

  m.addSource('forecast', { type: 'geojson', data: forecastFeatures(run) })
  m.addLayer({
    id: 'forecast-line',
    type: 'line',
    source: 'forecast',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#e8a33d', 'line-width': 1.2, 'line-dasharray': [2, 3] },
  })
  m.addLayer({
    id: 'forecast-point',
    type: 'circle',
    source: 'forecast',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 5,
      'circle-color': 'transparent',
      'circle-stroke-color': '#e8a33d',
      'circle-stroke-width': 1.4,
    },
  })

  // 4. who was there
  m.addSource('reachable', { type: 'geojson', data: EMPTY })
  m.addLayer({
    id: 'reachable-fill',
    type: 'fill',
    source: 'reachable',
    paint: { 'fill-color': '#5b7fb8', 'fill-opacity': 0.07 },
  })
  m.addLayer({
    id: 'reachable-line',
    type: 'line',
    source: 'reachable',
    paint: { 'line-color': '#7ea3d6', 'line-width': 1, 'line-dasharray': [1, 2], 'line-opacity': 0.8 },
  })

  // Two track layers, not one. `line-dasharray` is the one line paint property
  // MapLibre will not evaluate per feature, and a data-driven expression there
  // makes the whole layer fail to draw with nothing logged — which is exactly
  // how the tracks went missing the first time. Splitting on a filter keeps the
  // meaning: a gap in the transponder record is drawn as a gap in the line.
  m.addSource('tracks', { type: 'geojson', data: EMPTY })
  m.addLayer({
    id: 'tracks',
    type: 'line',
    source: 'tracks',
    filter: ['!', ['get', 'dark']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': ['case', ['get', 'selected'], 2.6, 1.3],
      'line-opacity': ['case', ['get', 'selected'], 1, 0.62],
    },
  })
  m.addLayer({
    id: 'tracks-dark',
    type: 'line',
    source: 'tracks',
    filter: ['get', 'dark'],
    layout: { 'line-cap': 'butt' },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': ['case', ['get', 'selected'], 2.6, 1.3],
      'line-opacity': ['case', ['get', 'selected'], 0.9, 0.5],
      'line-dasharray': [1.5, 2.5],
    },
  })
  m.addLayer({
    id: 'tracks-hit',
    type: 'line',
    source: 'tracks',
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 },
  })

  m.addSource('radar', { type: 'geojson', data: radarFeatures(run) })
  m.addLayer({
    id: 'radar',
    type: 'circle',
    source: 'radar',
    paint: {
      'circle-radius': 6,
      'circle-color': 'transparent',
      'circle-stroke-color': '#e8a33d',
      'circle-stroke-width': 2,
    },
  })

  m.addSource('ships', { type: 'geojson', data: EMPTY })
  m.addLayer({
    id: 'ships',
    type: 'circle',
    source: 'ships',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 6, 4],
      'circle-color': ['get', 'colour'],
      'circle-stroke-color': '#05090f',
      'circle-stroke-width': 1,
    },
  })
}

function setData(m: MapLibreMap, id: string, data: FeatureCollection) {
  const src = m.getSource(id)
  if (src && 'setData' in src) (src as GeoJSONSource).setData(data)
}

// ------------------------------------------------------------- feature sets //

function slickFeatures(run: Run): FeatureCollection {
  const poly = run.geometry?.polygon
  if (!poly?.length) return EMPTY
  const ring = [...poly, poly[0]]
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
    ],
  }
}

function originFeatures(run: Run): FeatureCollection {
  const parts = run.drift?.origin_region ?? []
  return {
    type: 'FeatureCollection',
    features: parts
      .filter((p) => p.length > 2)
      .map((p) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...p, p[0]]] } as Polygon,
      })),
  }
}

function particleFeatures(cloud: Cloud | null, hour: number): FeatureCollection {
  if (!cloud) return EMPTY
  const bank = hour <= 0 ? cloud.backward : cloud.forward
  const want = Math.abs(hour)
  let best = bank[0]
  for (const s of bank) {
    if (Math.abs(Math.abs(s.hour) - want) < Math.abs(Math.abs(best.hour) - want)) best = s
  }
  if (!best) return EMPTY
  return {
    type: 'FeatureCollection',
    features: best.pts.map((p) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point', coordinates: p } as Point,
    })),
  }
}

/**
 * Tracks, split at every broadcast gap. A vessel that stopped reporting gets a
 * broken line, because drawing straight through the silence would assert a
 * position nobody transmitted.
 */
function trackFeatures(
  run: Run,
  ranked: Ranked[],
  selected: string | null,
): FeatureCollection {
  const vessels = run.traffic?.vessels ?? []
  const scoreOf = new Map(ranked.map((r) => [r.mmsi ?? '', r.score]))
  const features: Feature[] = []

  for (const v of vessels) {
    const score = scoreOf.get(v.mmsi) ?? 0
    const colour = suspicionColour(score)
    const isSel = selected === v.mmsi
    const gaps = v.gaps ?? []

    let segment: number[][] = []
    let inGap = false
    const flush = (dark: boolean) => {
      if (segment.length > 1) {
        features.push({
          type: 'Feature',
          properties: { mmsi: v.mmsi, name: v.name, colour, selected: isSel, dark },
          geometry: { type: 'LineString', coordinates: segment },
        })
      }
      segment = []
    }

    for (const [lon, lat, t] of v.track) {
      const utc = hourToUtc(run.detection_utc, t)
      const nowDark = gaps.some((g) => utc >= g.start_utc && utc <= g.end_utc)
      if (nowDark !== inGap) {
        segment.push([lon, lat])
        flush(inGap)
        inGap = nowDark
      }
      segment.push([lon, lat])
    }
    flush(inGap)
  }
  return { type: 'FeatureCollection', features }
}

/** Where a vessel could have been while it was not broadcasting (TR-4). */
function reachableFeatures(
  ranked: Ranked[],
  selected: string | null,
): FeatureCollection {
  const features: Feature[] = []
  for (const r of ranked) {
    if (selected && r.mmsi !== selected) continue
    for (const g of r.gaps ?? []) {
      if (g.envelope?.length > 2) {
        features.push({
          type: 'Feature',
          properties: { mmsi: r.mmsi, overlap: g.overlap },
          geometry: { type: 'Polygon', coordinates: [[...g.envelope, g.envelope[0]]] },
        })
      }
    }
  }
  return { type: 'FeatureCollection', features }
}

/** Vessel positions at the scrubbed hour, interpolated between fixes. */
function shipFeatures(run: Run, ranked: Ranked[], hour: number): FeatureCollection {
  const scoreOf = new Map(ranked.map((r) => [r.mmsi ?? '', r.score]))
  const features: Feature[] = []
  for (const v of run.traffic?.vessels ?? []) {
    const at = interpolate(v.track, hour)
    if (!at) continue
    features.push({
      type: 'Feature',
      properties: {
        mmsi: v.mmsi,
        name: v.name,
        colour: suspicionColour(scoreOf.get(v.mmsi) ?? 0),
        selected: false,
      },
      geometry: { type: 'Point', coordinates: at },
    })
  }
  return { type: 'FeatureCollection', features }
}

function radarFeatures(run: Run): FeatureCollection {
  const targets = run.dark?.unmatched_targets ?? []
  return {
    type: 'FeatureCollection',
    features: targets.map((t) => ({
      type: 'Feature' as const,
      properties: { id: t.target_id, length: t.est_length_m },
      geometry: { type: 'Point', coordinates: [t.lon, t.lat] } as Point,
    })),
  }
}

function forecastFeatures(run: Run): FeatureCollection {
  const f = run.drift?.forward
  const slick = run.geometry?.centroid
  if (!f?.available || !slick) return EMPTY
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [slick, f.centroid] },
      },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: f.centroid } },
    ],
  }
}

// ----------------------------------------------------------------- helpers //

function interpolate(track: Array<[number, number, number]>, hour: number): [number, number] | null {
  if (!track.length) return null
  if (hour <= track[0][2]) return [track[0][0], track[0][1]]
  const last = track[track.length - 1]
  if (hour >= last[2]) return [last[0], last[1]]
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]
    const b = track[i]
    if (hour <= b[2]) {
      const span = b[2] - a[2]
      const f = span === 0 ? 0 : (hour - a[2]) / span
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
    }
  }
  return null
}

function hourToUtc(detectionUtc: string, hoursRelative: number): string {
  const t = new Date(detectionUtc).getTime() + hoursRelative * 3600_000
  return new Date(t).toISOString().replace(/\.\d+Z$/, 'Z')
}

export { suspicionColour }
