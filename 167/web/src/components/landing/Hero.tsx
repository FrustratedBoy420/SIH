/**
 * The opening: what SatQuery turns into what, one yellow action, and the
 * globe with a marker on the scene the rest of the page runs on. The readout
 * under the actions is measured from that scene's pixels, not written.
 */

import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { lat, lon, utc } from '@/lib/format'
import type { LandingData } from './useLanding'

// three.js arrives after the headline has painted
const Globe = lazy(() => import('./Globe'))

const GLOBE_BOX = 'mx-auto aspect-square w-full max-w-[min(680px,calc(100dvh-var(--chrome)-4rem))]'

export default function Hero({ data }: { data?: LandingData }) {
  const s = data?.optical.summary
  const rec = data?.result.evidence.items.find((e) => e.claim.includes('recovered by SAR'))

  return (
    <section className="grid items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:min-h-[calc(100dvh-var(--chrome))] lg:grid-cols-[minmax(0,11fr)_minmax(0,12fr)] lg:py-8"
      data-testid="hero" aria-labelledby="hero-h">
      <div className="max-w-[640px]">
        <p className="label mb-6 text-ink-2">PS26167 · ISRO · Smart India Hackathon 2026</p>
        <h1 id="hero-h" className="t-hero">From raw imagery to answers you can check</h1>
        <p className="mt-7 max-w-[520px] text-[19px] leading-[1.5] text-ink-2">
          Upload optical, SAR or two-date satellite imagery and ask in plain language. SatQuery picks the right model, checks the imagery can support the question, and shows the evidence behind every answer.
        </p>
        <div className="mt-9 flex flex-wrap gap-4">
          <Link to="/workstation" className="btn btn-sun" data-testid="hero-cta">Ask the imagery</Link>
          <Link to="/results" className="btn btn-ink">See the results</Link>
        </div>

        <dl className="mt-12 grid max-w-[560px] grid-cols-2 gap-x-6 gap-y-3 border-t border-ink pt-4 sm:grid-cols-4" data-testid="telemetry" aria-label="Demo scene, measured">
          {[
            ['Scene centre', s ? <>{lat(s.centre[0], 2)}<br />{lon(s.centre[1], 2)}</> : '…'],
            ['Acquired', s ? utc(s.acquired).split(' ')[0] : '…'],
            ['Built-up σ⁰', data?.stats.built_db != null ? `${data.stats.built_db.toFixed(1)} dB` : '…'],
            ['Seen through cloud', rec ? `${rec.mask_area_ha?.toFixed(0) ?? '—'} ha` : '…'],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[12.5px] text-ink-2">{k}</dt>
              <dd className="mono mt-0.5 text-[15px] leading-tight">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <figure className="relative">
        <Suspense fallback={<div className={GLOBE_BOX} />}>
          <Globe marker={s ? [s.centre[0], s.centre[1]] : undefined} className={`${GLOBE_BOX} cursor-grab active:cursor-grabbing`} />
        </Suspense>
        <figcaption className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
          <span><i className="mr-1.5 inline-block size-2.5 bg-sun align-[-1px]" />India</span>
          <span><i className="mr-1.5 inline-block size-2.5 bg-ink align-[-1px]" />Demo scene{s ? ` · ${s.crs} · GSD ${s.gsd_m.toFixed(0)} m` : ''}</span>
        </figcaption>
      </figure>
    </section>
  )
}
