/**
 * The campaign plate (web/BUILD_PLAN.md §2.1). The scene is full-bleed; the
 * headline is set straight across it; the telemetry runs beside it at the
 * same scale, because a coordinate is this product's slogan.
 *
 *   load    the plate develops line by line — the readout counts real raster rows
 *   scroll  the SAR plate wipes in beneath the cloud, and the settlement radar
 *           recovered draws its outline; the headline hard-cuts to say so
 */

import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useElementSize } from '@/lib/hooks'
import { lat, lon, utc } from '@/lib/format'
import { NumberTicker } from '@/components/ui/NumberTicker'
import { TextEffect } from '@/components/ui/TextEffect'
import type { LandingData } from './useLanding'
import { HERO_SIZE } from './useLanding'

export default function Hero({ data }: { data?: LandingData }) {
  const section = useRef<HTMLElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const { w, h } = useElementSize(frame)
  const side = Math.max(w, h)
  const reduce = useReducedMotion()

  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const [phase, setPhase] = useState<'ask' | 'radar'>('ask')
  const [boxes, setBoxes] = useState(false)
  useMotionValueEvent(scrollYProgress, 'change', (v) => { setPhase(v > 0.42 ? 'radar' : 'ask'); setBoxes(v > 0.6) })
  const wipe = useTransform(scrollYProgress, [0.08, 0.58], [100, 0])
  const sarClip = useTransform(wipe, (v) => `inset(0 0 0 ${v}%)`)
  const edgeLeft = useTransform(wipe, (v) => `${v}%`)
  const edgeOpacity = useTransform(wipe, (v) => (v > 0.5 && v < 99.5 ? 1 : 0))

  // development on load: rows of the raster appear top to bottom
  const dev = useMotionValue(0)
  const [row, setRow] = useState(0)
  useEffect(() => {
    if (!data) return
    const c = animate(dev, 1, { duration: reduce ? 0 : 1.9, ease: [0.2, 0.7, 0.3, 1] })
    return () => c.stop()
  }, [data, dev, reduce])
  useMotionValueEvent(dev, 'change', (v) => setRow(Math.round(v * HERO_SIZE)))
  const devClip = useTransform(dev, (v) => `inset(0 0 ${100 - v * 100}% 0)`)
  const scanTop = useTransform(dev, (v) => `${v * 100}%`)

  const s = data?.optical.summary
  const rec = data?.result.evidence.items.find((e) => e.claim.includes('recovered by SAR'))
  const [minX, minY, maxX, maxY] = s?.bounds ?? [0, 0, 1, 1]
  const recBoxes = (rec?.boxes ?? []).flatMap((b) => b.lon0 === null || b.lon1 === null || b.lat0 === null || b.lat1 === null ? [] : [{
    left: ((b.lon0 - minX) / (maxX - minX)) * 100, width: ((b.lon1 - b.lon0) / (maxX - minX)) * 100,
    top: ((maxY - b.lat0) / (maxY - minY)) * 100, height: ((b.lat0 - b.lat1) / (maxY - minY)) * 100,
  }])

  return (
    <section ref={section} className="relative h-[230vh]" data-testid="hero" aria-label="SatQuery AI">
      <div ref={frame} className="sticky top-[57px] h-[calc(100dvh-89px)] min-h-[560px] overflow-hidden bg-surface-2">
        {!data && (
          <div className="graticule absolute inset-0">
            <div className="animate-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-accent-bg to-transparent" />
            <p className="mono absolute left-6 top-6 text-[12px] text-ink-2" role="status">Generating scene · {HERO_SIZE} × {HERO_SIZE} · seed 7 — pixels synthetic, geotransform real</p>
          </div>
        )}

        {data && side > 0 && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: side, height: side }}>
            <motion.div className="absolute inset-0" style={{ clipPath: devClip }}>
              <img src={data.optical.layers.base} alt="Optical plate: a river, fields and a town, with cloud over the town." className="absolute inset-0 h-full w-full" />
              <motion.img src={data.sar.layers.base} alt="SAR plate of the same scene, cloud-free, with the town bright." className="absolute inset-0 h-full w-full" style={{ clipPath: sarClip }} />
              {boxes && recBoxes.map((b, i) => (
                <svg key={i} className="absolute overflow-visible" style={{ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  <motion.rect x={0} y={0} width={100} height={100} fill="var(--color-nir)" initial={{ fillOpacity: 0 }} animate={{ fillOpacity: 0.22 }} transition={{ delay: 0.5, duration: 0.3 }} />
                  <motion.rect x={0} y={0} width={100} height={100} fill="none" stroke="var(--color-nir)" strokeWidth={3} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
                </svg>
              ))}
            </motion.div>
            {row < HERO_SIZE && (
              <motion.div className="absolute inset-x-0 h-[2px] bg-accent shadow-[0_0_18px_4px_rgb(14_124_134/0.55)]" style={{ top: scanTop }} aria-hidden />
            )}
          </div>
        )}

        {/* the wipe edge: where optical ends and radar begins */}
        {data && (
          <motion.div className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-paper" style={{ left: edgeLeft, opacity: edgeOpacity }} aria-hidden>
            <span className="mono absolute left-2 top-1/3 whitespace-nowrap bg-paper px-1.5 py-0.5 text-[11px] text-ink" style={{ borderLeft: '3px solid var(--color-sar)' }}>SAR · VV · C-band — through cloud</span>
          </motion.div>
        )}

        {/* scrims so type clears contrast over any part of the plate */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(15_22_19/0.72),rgb(15_22_19/0.18)_45%,transparent_70%)]" aria-hidden />

        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-end justify-between gap-8 px-5 pb-8 text-paper sm:px-10 sm:pb-10">
          <div>
            <p className="mono mb-5 text-[11.5px] tracking-[0.08em] text-[#dfe6e3]">SATQUERY AI · AGENTIC REMOTE-SENSING ANALYSIS · PS26167 · ISRO</p>
            {phase === 'ask'
              ? <TextEffect key="ask" as="h1" per="line" preset="rise" duration={0.7} className="t-hero">{'Ask the\nimagery.'}</TextEffect>
              : <h1 key="radar" className="t-hero">Radar sees<br />under cloud.</h1>}
          </div>

          {data && s && (
            <dl className="text-right" data-testid="telemetry" aria-label="Scene telemetry">
              {phase === 'ask' ? (
                <>
                  <dt className="sr-only">Scene centre</dt>
                  <dd className="t-telemetry text-[clamp(28px,4.4vw,78px)]"><NumberTicker value={s.centre[0]} decimalPlaces={4} startValue={20} />°N</dd>
                  <dd className="t-telemetry text-[clamp(28px,4.4vw,78px)]"><NumberTicker value={s.centre[1]} decimalPlaces={4} startValue={80} delay={0.1} />°E</dd>
                  <dt className="sr-only">Built-up backscatter</dt>
                  <dd className="t-telemetry mt-1 text-[clamp(22px,2.6vw,44px)] text-[#cfe3e6]">σ⁰ <NumberTicker value={data.stats.built_db ?? 0} decimalPlaces={1} delay={0.2} /> dB</dd>
                  <dd className="mono mt-3 text-[12px] text-[#dfe6e3]">{s.crs} · {utc(s.acquired)} · GSD {s.gsd_m.toFixed(1)} m · built-up VV mean</dd>
                </>
              ) : (
                <>
                  <dt className="sr-only">Area recovered by SAR beneath cloud</dt>
                  <dd className="t-telemetry text-[clamp(28px,4.4vw,78px)]"><NumberTicker value={rec?.mask_area_ha ?? 0} decimalPlaces={0} /> ha</dd>
                  <dd className="mono text-[12.5px] text-[#dfe6e3]">built-up recovered beneath cloud — invisible to optical</dd>
                  <dt className="sr-only">Confidence</dt>
                  <dd className="t-telemetry mt-2 text-[clamp(22px,2.6vw,44px)]"><NumberTicker value={data.result.confidence} decimalPlaces={2} /> <span className="text-[0.5em] text-[#dfe6e3]">confidence</span></dd>
                  <dd className="mono mt-3 text-[12px] text-[#dfe6e3]">cloud {data.stats.cloud_pct.toFixed(1)} % · {lat(s.centre[0], 2)} {lon(s.centre[1], 2)} · RQ-4, run just now</dd>
                </>
              )}
            </dl>
          )}
        </div>

        <p className="mono absolute right-5 top-4 z-20 bg-[rgb(15_22_19/0.5)] px-1.5 text-[11px] text-paper sm:right-10" aria-live="off">
          {data ? (row < HERO_SIZE ? `acquiring · line ${row} / ${HERO_SIZE}` : `${s?.source} · ${HERO_SIZE}×${HERO_SIZE} · synthetic`) : ''}
        </p>
        <p className="mono absolute left-5 top-4 z-20 bg-[rgb(15_22_19/0.5)] px-1.5 text-[11px] text-paper sm:left-10">scroll ↓ the radar plate wipes in under the cloud</p>
      </div>
    </section>
  )
}
