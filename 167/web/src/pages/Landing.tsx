/**
 * The front page. Open on the globe and the promise, show what can be asked,
 * then how it works, what the two sensors see, how it refuses, and what it
 * measured. Every figure on this page was computed in this session.
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import AskCards from '@/components/landing/AskCards'
import CompareBand from '@/components/landing/CompareBand'
import Hero from '@/components/landing/Hero'
import Numbers from '@/components/landing/Numbers'
import Pipeline from '@/components/landing/Pipeline'
import Refusal from '@/components/landing/Refusal'
import { useLanding } from '@/components/landing/useLanding'
import { BlurFade } from '@/components/ui/BlurFade'

const BUILT_ON = ['Sentinel-1 SAR', 'Sentinel-2 optical', 'Cartosat-2S', 'RISAT', 'BigEarthNet', 'VRSBench', 'RSVQA', 'CDVQA']

const PROMISES = [
  { t: 'Vision measures, language phrases', b: 'Specialist models produce every fact. The answer layer gets their evidence records and never a pixel, so it cannot invent a count it was not given.' },
  { t: 'Optical, SAR and two dates', b: 'One question box across modalities. Radar fills in what cloud hides; a before-and-after pair turns into change, located and measured in hectares.' },
  { t: 'A trace of what actually ran', b: 'Task, tools, parameters, confidence gate. Download the GeoJSON or the report for any run and check it yourself.' },
]

export default function Landing() {
  const { data } = useLanding()
  const { data: registry } = useQuery({ queryKey: ['registry'], queryFn: api.registry })
  return (
    <div data-testid="landing">
      <Hero data={data} />

      <section className="border-y border-ink bg-surface px-5 py-20 sm:px-8" aria-labelledby="thesis-h">
        <BlurFade>
          <h2 id="thesis-h" className="t-section max-w-[980px]">Not a chatbot that looks at satellite images. An analysis system that happens to accept language.</h2>
        </BlurFade>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {PROMISES.map((p, i) => (
            <BlurFade key={p.t} delay={0.08 * i}>
              <div className="mb-4 grid size-9 place-items-center bg-sun font-display text-[17px] font-bold">{i + 1}</div>
              <h3 className="t-display text-[22px]">{p.t}</h3>
              <p className="mt-2 text-[16px] leading-[1.55] text-ink-2">{p.b}</p>
            </BlurFade>
          ))}
        </div>
      </section>

      <AskCards data={data} />
      <Pipeline data={data} registry={registry} />
      <CompareBand data={data} />
      <Refusal optical={data?.optical} />
      <Numbers />

      <section className="px-5 pb-20 sm:px-8" aria-label="Built on">
        <p className="label mb-5 text-ink-2">Built on open data and ISRO sensors</p>
        <ul className="flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-6">
          {BUILT_ON.map((b) => <li key={b} className="text-[18px] font-semibold tracking-[-0.01em] text-ink-3">{b}</li>)}
        </ul>
      </section>

      <section className="bg-ink px-5 py-24 text-paper sm:px-8">
        <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div>
            <h2 className="t-hero">Ask your own imagery</h2>
            <p className="mt-6 max-w-[560px] text-[18px] leading-[1.55] text-[#c9d2d5]">
              Upload a GeoTIFF — optical, SAR, or two dates — and ask. It is described, routed or refused on exactly the terms the built-in scenes are.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link to="/workstation" className="btn btn-sun" data-testid="cta-workstation">Open the workstation</Link>
              <Link to="/data" className="btn border border-paper/40 text-paper hover:bg-paper hover:text-ink">Data and models</Link>
            </div>
          </div>
          <p className="text-[14px] leading-[1.6] text-[#9fb0b5]">
            Every answer carries its evidence, its confidence and its trace; GeoJSON and a report download from the run. Borrowed components are listed in <span className="mono">web/CREDITS.md</span>.
          </p>
        </div>
      </section>
    </div>
  )
}
