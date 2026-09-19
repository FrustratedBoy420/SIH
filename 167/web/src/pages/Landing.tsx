/**
 * The thesis. Open by using the system; explain after it has been seen
 * working (07 §13). Every figure on this page was computed in this session.
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import CompareBand from '@/components/landing/CompareBand'
import Hero from '@/components/landing/Hero'
import Numbers from '@/components/landing/Numbers'
import Pipeline from '@/components/landing/Pipeline'
import Refusal from '@/components/landing/Refusal'
import { useLanding } from '@/components/landing/useLanding'
import { BlurFade } from '@/components/ui/BlurFade'
import { Magnetic } from '@/components/ui/Magnetic'
import { Marquee } from '@/components/ui/Marquee'

const STRIP = [
  'B02 blue 490 nm', 'B03 green 560 nm', 'B04 red 665 nm', 'B08 NIR 842 nm', 'VV', 'VH', 'HH/HV', 'C-band 5.405 GHz',
  'EPSG:4326', 'σ⁰ dB', 'NDVI', 'NDWI', 'Lee 7×7 · 4 looks', '3-class Otsu', 'change vector analysis',
  '464,044 S1/S2 pairs', '~9.6 M text annotations', '123,221 VQA pairs', '29,614 images', '2,968 bi-temporal pairs', 'Cartosat-2S', 'RISAT',
]

export default function Landing() {
  const { data } = useLanding()
  const { data: registry } = useQuery({ queryKey: ['registry'], queryFn: api.registry })
  return (
    <div data-testid="landing">
      <Hero data={data} />

      <div className="border-y border-ink bg-surface py-3" aria-label="Vocabulary">
        <Marquee pauseOnHover className="[--duration:70s]">
          {STRIP.map((s) => <span key={s} className="mono whitespace-nowrap text-[18px] text-ink">{s}<span className="ml-12 text-ink-3">/</span></span>)}
        </Marquee>
      </div>

      <section className="grid gap-10 px-5 py-24 sm:px-10 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-end" aria-labelledby="thesis-h">
        <BlurFade>
          <h2 id="thesis-h" className="t-section">Not a chatbot that looks at satellite images. An analysis system that happens to accept language.</h2>
        </BlurFade>
        <BlurFade delay={0.1} className="space-y-4 text-[16px] leading-[1.55] text-ink-2">
          <p><b className="font-semibold text-ink">Vision models produce the facts; language only phrases them.</b> The answer layer is handed evidence records and never a pixel, so it cannot invent a count it was not given.</p>
          <p>Optical, SAR and two-date imagery. A fixed registry of specialists. A confidence gate. A trace of what ran — task, tools, parameters — and nothing it did not.</p>
        </BlurFade>
      </section>

      <Pipeline data={data} registry={registry} />
      <CompareBand data={data} />
      <Refusal optical={data?.optical} />
      <Numbers />

      <section className="border-t border-ink px-5 py-24 sm:px-10">
        <p className="label mb-6">The instrument</p>
        <Magnetic intensity={0.12} range={220} className="inline-block">
          <Link to="/workstation" className="t-hero group inline-block hover:text-accent" data-testid="cta-workstation">
            Open the<br />workstation <span className="inline-block transition-transform group-hover:translate-x-3">→</span>
          </Link>
        </Magnetic>
        <div className="mt-16 grid gap-6 border-t border-rule pt-6 text-[13px] text-ink-2 sm:grid-cols-3">
          <p>Upload your own GeoTIFF — optical, SAR, or two dates — and ask. It is described, routed or refused on exactly the terms the built-in scenes are.</p>
          <p>Every answer carries its evidence, its confidence and its trace; GeoJSON and a report download from the run.</p>
          <p>Borrowed components are listed in <span className="mono">web/CREDITS.md</span>. Everything else is authored for this project.</p>
        </div>
      </section>
    </div>
  )
}
