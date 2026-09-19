/**
 * The trust story (PRD §8.2) as a replay of a real refusal: one image, a
 * change question, the compatibility step failing in red, no model invoked,
 * and the remedy. It replays each time it scrolls into view.
 */

import { useRef, useState } from 'react'
import { motion, useInView } from 'motion/react'
import type { LoadedRaster } from '@/lib/api'
import { ms } from '@/lib/format'
import TracePanel from '@/components/TracePanel'
import { TextEffect } from '@/components/ui/TextEffect'
import { REFUSAL_Q, useRefusal } from './useLanding'

export default function Refusal({ optical }: { optical?: LoadedRaster }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.45 })
  const [nonce, setNonce] = useState(0)
  const { data } = useRefusal(optical)
  const remedy = data?.answer.split('. ').slice(-1)[0]
  const reason = data?.answer.replace(remedy ?? '', '').trim()
  const key = `${nonce}-${inView}`

  return (
    <section className="px-5 py-24 sm:px-8" data-testid="refusal-replay" aria-labelledby="refusal-h">
      <p className="label mb-4">Refuse rather than guess</p>
      <div ref={ref} className="frame grid bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="p-6 sm:p-10">
          <h2 id="refusal-h" className="t-section">When the imagery can’t answer, it <span className="text-nir">says so</span></h2>
          <p className="mt-6 max-w-[460px] text-[17px] leading-[1.55] text-ink-2">
            One image, and a question about change. A generic model would describe a difference it cannot see. SatQuery checks the inputs against the question first — and stops, before any model runs, with what to upload instead.
          </p>
        </div>
        <div className="border-t border-ink bg-paper p-6 sm:p-8 lg:border-l lg:border-t-0" key={key}>
          {inView && data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono border border-ink px-2 py-0.5 text-[12px]">1 raster · optical · {data.manifest.rasters[0]?.crs}</span>
                <span className="mono ml-auto text-[11.5px] text-ink-2">{ms(data.elapsed_ms)} · no model invoked</span>
              </div>
              <p className="label mt-4">Query</p>
              <TextEffect per="char" preset="fade" speed={2.5} className="mt-1 text-[20px]">{REFUSAL_Q}</TextEffect>
              <div className="mt-4"><TracePanel steps={data.trace} runKey={key} compact /></div>
              <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.6, duration: 0.3 }} className="mt-4 border border-nir bg-nir-bg px-4 py-3">
                <p className="label !text-nir">Refused · no model invoked</p>
                <p className="mt-1 text-[15px]">{reason}</p>
                <p className="mt-2 text-[14px]"><b className="font-semibold">What to do:</b> {remedy}</p>
              </motion.div>
            </>
          )}
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="mt-4 text-[14px] font-medium text-accent hover:underline">↻ Replay</button>
        </div>
      </div>
    </section>
  )
}
