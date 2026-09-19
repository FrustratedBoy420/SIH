/**
 * The plate viewer — the map. One georeferenced raster as a cartographic
 * plate: graticule with lat/lon ticks on the frame, a scale bar, a pointer
 * readout in EPSG:4326, and evidence geometry drawn over it (OUT-04).
 *
 * Authored rather than OpenLayers: every scene here is a single plate with no
 * tiles (offline by design), and a map library would cost more of the bundle
 * than the rest of the interface.
 *
 * Evidence boxes draw their outline first and then fill; hectares tick up.
 * Boxes below the confidence gate are drawn dashed and never filled — they are
 * shown because the gate is part of the answer, but they carry no claim.
 */

import { useMemo, useRef, useState, type PointerEvent as RPE, type WheelEvent as RWE } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { EvidenceItem, GeoBox, Modality } from '@/lib/contract'
import { lat as fLat, lon as fLon, MODALITY_LABEL, MODALITY_VAR } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface PlateGeo {
  width: number
  height: number
  bounds: number[]           // [minLon, minLat, maxLon, maxLat] or pixel extent
  georeferenced: boolean
  gsd_m: number
}

function niceStep(span: number, target = 5) {
  const raw = span / target
  const p = 10 ** Math.floor(Math.log10(raw))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p
}

/** Size container for the plate, so `cq` units measure the frame's content box. */
const FIT_BOX = { containerType: 'size' } as const

export default function PlateViewer({
  src, geo, items, threshold, overlays, selected, onSelect, alt, className, runKey, compact = false, processing,
}: {
  /** while a run replays: what is executing; the plate shows a scan instead of evidence */
  processing?: string
  src?: string
  geo?: PlateGeo
  items: EvidenceItem[]
  threshold: number
  overlays: Record<Modality, boolean>
  selected: number | null
  onSelect?: (i: number | null) => void
  alt: string
  className?: string
  runKey?: string
  compact?: boolean
}) {
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  const W = geo?.width ?? 512, H = geo?.height ?? 512
  const [minX, minY, maxX, maxY] = geo?.bounds ?? [0, 0, W, H]
  const toPx = (b: GeoBox): [number, number, number, number] => {
    if (geo?.georeferenced && b.lon0 !== null && b.lat0 !== null && b.lon1 !== null && b.lat1 !== null) {
      const x0 = ((Math.min(b.lon0, b.lon1) - minX) / (maxX - minX)) * W
      const x1 = ((Math.max(b.lon0, b.lon1) - minX) / (maxX - minX)) * W
      const y0 = ((maxY - Math.max(b.lat0, b.lat1)) / (maxY - minY)) * H
      const y1 = ((maxY - Math.min(b.lat0, b.lat1)) / (maxY - minY)) * H
      return [x0, y0, x1, y1]
    }
    return [b.x0, b.y0, b.x1 + 1, b.y1 + 1]
  }

  const grid = useMemo(() => {
    if (!geo?.georeferenced) return { xs: [], ys: [] }
    const sx = niceStep(maxX - minX), sy = niceStep(maxY - minY)
    const xs: number[] = [], ys: number[] = []
    for (let v = Math.ceil(minX / sx) * sx; v <= maxX; v += sx) xs.push(v)
    for (let v = Math.ceil(minY / sy) * sy; v <= maxY; v += sy) ys.push(v)
    return { xs, ys }
  }, [geo?.georeferenced, minX, maxX, minY, maxY])

  const scale = useMemo(() => {
    if (!geo?.gsd_m) return null
    const widthKm = (geo.gsd_m * W) / 1000 / view.k
    const km = niceStep(widthKm, 4)
    return { km, frac: km / widthKm }
  }, [geo, W, view.k])

  const clamp = (v: { k: number; x: number; y: number }) => {
    const k = Math.min(8, Math.max(1, v.k))
    const lim = (1 - 1 / k) / 2
    return { k, x: Math.min(lim, Math.max(-lim, v.x)), y: Math.min(lim, Math.max(-lim, v.y)) }
  }
  const zoom = (f: number, cx = 0.5, cy = 0.5) => setView((v) => {
    const k = Math.min(8, Math.max(1, v.k * f))
    // keep the point under the cursor fixed
    const px = (cx - 0.5) / v.k + v.x, py = (cy - 0.5) / v.k + v.y
    return clamp({ k, x: px - (cx - 0.5) / k, y: py - (cy - 0.5) / k })
  })

  const onWheel = (e: RWE) => {
    if (!e.ctrlKey && !e.metaKey && view.k === 1 && e.deltaY > 0) return
    const r = frame.current!.getBoundingClientRect()
    zoom(e.deltaY < 0 ? 1.25 : 0.8, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }
  const onMove = (e: RPE) => {
    const r = frame.current!.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height
    const ix = ((fx - 0.5) / view.k + view.x + 0.5), iy = ((fy - 0.5) / view.k + view.y + 0.5)
    setCursor(ix >= 0 && ix <= 1 && iy >= 0 && iy <= 1 ? [ix, iy] : null)
    if (drag.current) {
      const d = drag.current
      setView((v) => clamp({ ...v, x: d.vx - (e.clientX - d.x) / r.width / v.k, y: d.vy - (e.clientY - d.y) / r.height / v.k }))
    }
  }

  const boxes = items.flatMap((it, i) =>
    overlays[it.modality] === false ? [] : it.boxes.slice(0, 40).map((b, j) => ({ it, i, j, b, pass: it.confidence >= threshold })))

  // One label per passing record, on its largest box, so the sentence in the
  // answer and the region on the plate are visibly the same thing (brief §17).
  // Labels that would land on top of one another stack downward.
  const labels = useMemo(() => {
    if (compact) return []
    // A box right of centre hangs its label from its right edge, so long claims
    // run inward instead of off the plate.
    const out: { it: EvidenceItem; i: number; x: number; right: boolean; top: number }[] = []
    items.forEach((it, i) => {
      if (overlays[it.modality] === false || it.confidence < threshold || !it.boxes.length) return
      const big = it.boxes.reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a))
      const [x0, y0, x1] = toPx(big)
      const right = (x0 + x1) / 2 > W * 0.55
      const x = right ? 100 - (x1 / W) * 100 : (x0 / W) * 100
      let top = Math.max(0, (y0 / H) * 100 - 5.5)
      while (out.some((o) => o.right === right && Math.abs(o.x - x) < 24 && Math.abs(o.top - top) < 5)) top += 5
      out.push({ it, i, x: Math.max(0, x), right, top: Math.min(top, 94) })
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overlays, threshold, compact, W, H, minX, minY, maxX, maxY])

  // Contain the plate in both dimensions. `h-full` + `aspect-ratio` alone lets
  // the explicit height win in a tall, narrow region and stretches the scene.
  const fit = { aspectRatio: `${W} / ${H}`, width: `min(100cqw, calc(100cqh * ${W / H}))` }
  const transform = `translate(${(-view.x * 100 * view.k).toFixed(3)}%, ${(-view.y * 100 * view.k).toFixed(3)}%) scale(${view.k})`

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="relative min-h-0 flex-1">
        {/* frame: ticks live in the margin, outside the image */}
        <div className={cn('absolute inset-0 grid place-items-center', compact ? 'p-0' : 'pb-6 pl-14 pr-3 pt-5')} style={FIT_BOX}>
          <div
            ref={frame}
            data-testid="plate"
            tabIndex={0}
            aria-label={`${alt}. Scroll or use + and − to zoom, arrow keys to pan.`}
            className="frame relative cursor-crosshair overflow-hidden bg-surface-2 outline-offset-4"
            style={fit}
            onWheel={onWheel}
            onPointerDown={(e) => { if (view.k > 1) { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y } } }}
            onPointerUp={() => { drag.current = null }}
            onPointerMove={onMove}
            onPointerLeave={() => setCursor(null)}
            onKeyDown={(e) => {
              if (e.key === '+' || e.key === '=') zoom(1.25)
              else if (e.key === '-') zoom(0.8)
              else if (e.key === '0') setView({ k: 1, x: 0, y: 0 })
              else if (e.key.startsWith('Arrow')) {
                const d = 0.06 / view.k
                setView((v) => clamp({ ...v, x: v.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0), y: v.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0) }))
              } else return
              e.preventDefault()
            }}
          >
            <div className="absolute inset-0 origin-center" style={{ transform, transformOrigin: '50% 50%' }}>
              <AnimatePresence mode="sync">
                {src && (
                  <motion.img
                    key={src} src={src} alt={alt} draggable={false}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
                    className="absolute inset-0 h-full w-full select-none"
                    style={{ imageRendering: view.k > 2.5 ? 'pixelated' : 'auto' }}
                  />
                )}
              </AnimatePresence>
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden={!boxes.length}>
                {grid.xs.map((x) => { const px = ((x - minX) / (maxX - minX)) * W; return <line key={`x${x}`} x1={px} x2={px} y1={0} y2={H} stroke="white" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 4" /> })}
                {grid.ys.map((y) => { const py = ((maxY - y) / (maxY - minY)) * H; return <line key={`y${y}`} y1={py} y2={py} x1={0} x2={W} stroke="white" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 4" /> })}
                {boxes.map(({ it, i, j, b, pass }) => {
                  const [x0, y0, x1, y1] = toPx(b)
                  const col = MODALITY_VAR[it.modality]
                  const sel = selected === i
                  const dim = selected !== null && !sel
                  return (
                    <g key={`${runKey}-${i}-${j}`} onClick={(e) => { e.stopPropagation(); onSelect?.(sel ? null : i) }} className="cursor-pointer" opacity={dim ? 0.25 : 1} data-testid="evidence-box">
                      <title>{`${it.claim} · ${b.area_ha > 0 ? `${b.area_ha.toFixed(2)} ha` : `${b.area_px} px`} · confidence ${it.confidence.toFixed(2)}`}</title>
                      {pass && (
                        <motion.rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={col}
                          initial={{ fillOpacity: 0 }} animate={{ fillOpacity: sel ? 0.34 : 0.2 }}
                          transition={{ delay: 0.5 + j * 0.03 + i * 0.12, duration: 0.3 }} />
                      )}
                      <motion.rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none"
                        stroke={pass ? col : 'white'} strokeWidth={sel ? 2.5 : 1.5} vectorEffect="non-scaling-stroke"
                        strokeDasharray={pass ? undefined : '4 3'}
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ delay: j * 0.03 + i * 0.12, duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }} />
                    </g>
                  )
                })}
              </svg>
              {labels.map(({ it, i, x, right, top }) => (
                <motion.div
                  key={`${runKey}-l${i}`}
                  className={cn('pointer-events-none absolute whitespace-nowrap bg-ink/85 px-1.5 py-[3px] text-paper', right ? 'origin-top-right' : 'origin-top-left')}
                  style={{ [right ? 'right' : 'left']: `${x}%`, top: `${top}%`, scale: 1 / view.k, borderLeft: `3px solid ${MODALITY_VAR[it.modality]}` }}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: selected !== null && selected !== i ? 0.25 : 1, y: 0 }} transition={{ delay: 0.85 + i * 0.12, duration: 0.2 }}
                  data-testid="evidence-label"
                >
                  <span className="text-[11px] font-medium">{it.claim}</span>
                  <span className="mono ml-2 text-[10.5px] text-[#cfe3e6]">
                    {it.mask_area_ha > 0 ? `${it.mask_area_ha.toFixed(2)} ha · ` : ''}{it.confidence.toFixed(2)}
                  </span>
                </motion.div>
              ))}
            </div>
            {processing && src && (
              <div className="pointer-events-none absolute inset-0 bg-accent/10" data-testid="processing" aria-hidden>
                <motion.div className="absolute inset-x-0 h-[2px] bg-accent shadow-[0_0_14px_3px_rgb(14_124_134/0.5)]"
                  initial={{ top: '0%' }} animate={{ top: '100%' }} transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }} />
                <span className="mono absolute left-2 top-2 bg-ink/85 px-1.5 py-0.5 text-[10.5px] text-paper">executing · {processing}</span>
              </div>
            )}
            {!src && <div className="absolute inset-0 grid place-items-center text-ink-2"><span className="label">No imagery loaded</span></div>}
          </div>

          {/* tick labels on the frame */}
          {!compact && geo?.georeferenced && view.k === 1 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center pb-6 pl-14 pr-3 pt-5" style={FIT_BOX} aria-hidden>
              <div className="relative" style={fit}>
                {grid.xs.map((x) => (
                  <span key={x} className="mono absolute -bottom-5 -translate-x-1/2 text-[10.5px] text-ink-2" style={{ left: `${((x - minX) / (maxX - minX)) * 100}%` }}>{fLon(x, 2)}</span>
                ))}
                {grid.ys.map((y) => (
                  <span key={y} className="mono absolute -left-1.5 -translate-x-full -translate-y-1/2 text-[10.5px] text-ink-2" style={{ top: `${((maxY - y) / (maxY - minY)) * 100}%` }}>{fLat(y, 2)}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="flex h-7 shrink-0 items-center gap-4 border-t border-rule px-3 text-[11px]">
          <span className="mono text-ink-2" data-testid="cursor-readout" aria-live="off">
            {cursor && geo
              ? geo.georeferenced
                ? `${fLat(maxY - cursor[1] * (maxY - minY))}  ${fLon(minX + cursor[0] * (maxX - minX))}  EPSG:4326`
                : `px ${Math.floor(cursor[0] * W)}, ${Math.floor(cursor[1] * H)} · no CRS`
              : geo?.georeferenced ? 'EPSG:4326 · move over the plate' : 'pixel coordinates · no CRS'}
          </span>
          {scale && (
            <span className="ml-auto flex items-center gap-2">
              <span className="block h-1.5 border-x border-b border-ink" style={{ width: `${Math.max(24, scale.frac * 180)}px` }} />
              <span className="mono text-ink-2">{scale.km >= 1 ? `${scale.km} km` : `${scale.km * 1000} m`}</span>
            </span>
          )}
          <span className={cn('mono text-ink-2', !scale && 'ml-auto')}>×{view.k.toFixed(2)}</span>
          <div className="flex gap-1">
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.25)} className="mono size-5 border border-rule leading-none hover:border-ink">+</button>
            <button type="button" aria-label="Zoom out" onClick={() => zoom(0.8)} className="mono size-5 border border-rule leading-none hover:border-ink">−</button>
            <button type="button" aria-label="Reset view" onClick={() => setView({ k: 1, x: 0, y: 0 })} className="mono h-5 border border-rule px-1 leading-none hover:border-ink">fit</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function OverlayLegend({ items, overlays, onToggle }: { items: EvidenceItem[]; overlays: Record<Modality, boolean>; onToggle: (m: Modality) => void }) {
  const mods = [...new Set(items.filter((i) => i.boxes.length).map((i) => i.modality))]
  if (!mods.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Evidence overlays">
      <span className="label mr-1">Overlays</span>
      {mods.map((m) => (
        <button key={m} type="button" aria-pressed={overlays[m]} onClick={() => onToggle(m)}
          className={cn('flex items-center gap-1.5 border px-2 py-0.5 text-[12px]', overlays[m] ? 'border-ink-3 bg-surface text-ink' : 'border-rule text-ink-3 line-through')}>
          <span className="inline-block size-2" style={{ background: MODALITY_VAR[m] }} />{MODALITY_LABEL[m]}
        </button>
      ))}
    </div>
  )
}
