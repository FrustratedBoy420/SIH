/**
 * The five mandatory capabilities as the pipeline they actually are — not
 * five identical cards (PRD §3.1). Each stage pins, shows its own evidence
 * from the RQ-4 run the hero made, and releases. Stage changes are hard cuts.
 */

import { useRef, useState, type RefObject } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import type { RegistryTool } from '@/lib/contract'
import { useMediaQuery } from '@/lib/hooks'
import { MODALITY_VAR } from '@/lib/format'
import { cn } from '@/lib/utils'
import PlateViewer from '@/components/PlateViewer'
import TracePanel from '@/components/TracePanel'
import { AnimatedBeam } from '@/components/ui/AnimatedBeam'
import { NumberTicker } from '@/components/ui/NumberTicker'
import { TextEffect } from '@/components/ui/TextEffect'
import type { LandingData } from './useLanding'

const STAGES = [
  { n: '01', title: 'Validate', req: 'R5 · input check', body: 'Count, modality, format, CRS and co-registration are checked before any model is touched. A question the imagery cannot support is refused here, in under a millisecond.' },
  { n: '02', title: 'Route', req: 'R5 · agentic selection', body: 'The question is classified and matched against a fixed registry of four tools. Only permitted parameters are set. A plain router, not an agent framework — explainable on one slide.' },
  { n: '03', title: 'Measure', req: 'R1 · R2 · R3 · R4', body: 'Specialists measure: spectral indices, backscatter, change vectors, connected components. Counts and hectares come from pixels, never from language.' },
  { n: '04', title: 'Gate', req: 'R5 · confidence', body: 'Each sensor’s evidence stays separate; disagreements are recorded and cost confidence; anything below the gate is dropped. If nothing clears it, the system abstains.' },
  { n: '05', title: 'Answer', req: 'Evidence · trace', body: 'Language phrases only what passed the gate. Every number in the sentence exists in an evidence record, and the trace shows what ran — never why it “thought” so.' },
]

const Check = ({ ok = true, d = 0, children }: { ok?: boolean; d?: number; children: React.ReactNode }) => (
  <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: d, duration: 0.18 }} className="flex items-baseline gap-2 border-b border-rule py-1.5">
    <span className={cn('mono text-[12px]', ok ? 'text-good' : 'text-nir')}>{ok ? '✓' : '✕'}</span>
    <span className="mono text-[12.5px]">{children}</span>
  </motion.li>
)

function Visual({ stage, data, registry }: { stage: number; data: LandingData; registry?: Record<string, RegistryTool> }) {
  const r = data.result
  const items = r.evidence.items
  if (stage === 0) {
    const coreg = items.find((e) => e.claim.startsWith('co-registration'))
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {r.manifest.rasters.map((x, k) => (
          <div key={x.role} className="border border-ink bg-surface p-4">
            <p className="label !text-ink" style={{ borderLeft: `3px solid ${x.sensor === 'sar' ? 'var(--color-sar)' : 'var(--color-optical)'}`, paddingLeft: 8 }}>{x.role}</p>
            <p className="mono mt-1 truncate text-[12px] text-ink-2">{x.source}</p>
            <ul className="mt-3">
              <Check d={0.1 + k * 0.3}>CRS {x.crs}</Check>
              <Check d={0.2 + k * 0.3}>{x.bands} bands · {x.band_names.join(', ')}</Check>
              <Check d={0.3 + k * 0.3}>GSD {x.gsd_m.toFixed(1)} m · {x.width}×{x.height}</Check>
              <Check d={0.4 + k * 0.3}>georeferenced</Check>
            </ul>
          </div>
        ))}
        <div className="border border-rule bg-surface p-4 sm:col-span-2">
          <ul>
            <Check d={0.9}>{r.trace.find((t) => t.step === 'Compatibility check')?.detail}</Check>
            {coreg && <Check d={1.05} ok={coreg.confidence > 0.5}>{coreg.claim} · offset {String(coreg.value)} px · {coreg.supporting[1]}</Check>}
          </ul>
        </div>
      </div>
    )
  }
  if (stage === 1) {
    const task = r.trace.find((t) => t.step === 'Task identified')?.detail ?? ''
    return (
      <div>
        <div className="border border-ink bg-surface px-4 py-3">
          <p className="label">Query</p>
          <TextEffect per="char" preset="fade" speed={2.2} className="mt-1 text-[19px] leading-snug">{r.query}</TextEffect>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mono mt-2 text-[12.5px] text-accent-2">→ {task}</motion.p>
        </div>
        <table className="mt-4 w-full border-collapse text-left text-[12.5px]">
          <thead><tr className="border-b border-ink"><th className="label py-1.5 font-medium">tool</th><th className="label font-medium">task</th><th className="label font-medium">requires</th><th className="label font-medium">adapter</th></tr></thead>
          <tbody>
            {Object.entries(registry ?? {}).map(([name, t], i) => {
              const chosen = r.tools.includes(name)
              return (
                <motion.tr key={name} initial={{ opacity: 0 }} animate={{ opacity: chosen ? 1 : 0.38 }} transition={{ delay: 1.7 + i * 0.08 }}
                  className={cn('border-b border-rule', chosen && 'bg-accent-bg')}>
                  <td className="mono py-2 pl-1">{chosen ? '▸ ' : ''}{name}</td><td className="mono">{t.tasks.join(', ')}</td><td className="mono">{t.requires}</td><td className="mono text-ink-2">{t.adapter}</td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
        <p className="mono mt-2 text-[11.5px] text-ink-2">{r.trace.find((t) => t.step === 'Parameters')?.detail} — the only parameter the registry permits</p>
      </div>
    )
  }
  if (stage === 2) {
    const s = data.optical.summary
    return (
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-5">
        <div className="min-h-0">
          <PlateViewer compact src={data.optical.layers.base} geo={{ width: s.width, height: s.height, bounds: s.bounds, georeferenced: true, gsd_m: s.gsd_m }}
            items={items} threshold={r.evidence.threshold} overlays={{ optical: true, sar: true, fused: true, temporal: true, derived: true }} selected={null} alt="RQ-4 evidence over the optical plate" runKey="landing" />
        </div>
        <div className="min-w-0">
          <ul>
            {items.map((e, i) => (
              <motion.li key={e.claim} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.12 }} className="border-b border-rule py-2">
                <p className="flex items-baseline gap-2 text-[13px]"><span className="inline-block size-1.5 rounded-full" style={{ background: MODALITY_VAR[e.modality] }} />{e.claim}</p>
                <p className="mono pl-3.5 text-[12px] text-ink-2">{String(e.value)} {e.unit} · {e.source_model}{e.mask_area_ha ? ` · ${e.mask_area_ha.toFixed(0)} ha` : ''}</p>
              </motion.li>
            ))}
          </ul>
          <p className="mt-3 border-l-2 border-warn pl-2 text-[12px] leading-snug text-ink-2">The adapted model (M1) is not trained yet, so the classical path serves every tool. The trace says so rather than hiding it.</p>
        </div>
      </div>
    )
  }
  if (stage === 3) {
    const thr = r.evidence.threshold
    return (
      <div>
        <ul className="space-y-3">
          {items.map((e, i) => {
            const pass = e.confidence >= thr
            return (
              <li key={e.claim}>
                <div className="flex justify-between text-[12.5px]"><span>{e.claim}</span><span className="mono">{e.confidence.toFixed(2)} <b className={pass ? 'text-good' : 'text-ink-2'}>{pass ? 'PASS' : 'GATED'}</b></span></div>
                <div className="relative mt-1 h-3 bg-surface-2">
                  <motion.div className="absolute inset-y-0 left-0 rounded-r bg-ink" initial={{ width: 0 }} animate={{ width: `${e.confidence * 100}%` }} transition={{ delay: 0.15 + i * 0.1, duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }} />
                  <div className="absolute -inset-y-1 w-[2px] bg-nir" style={{ left: `${thr * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-6 flex items-end justify-between border-t border-ink pt-3">
          <p className="max-w-[340px] text-[12.5px] text-ink-2">Aggregate = area-weighted mean of passing records − 0.08 per recorded conflict. Red rule: the gate at <span className="mono">{thr.toFixed(2)}</span>.</p>
          <p className="text-right"><NumberTicker value={r.confidence} decimalPlaces={2} className="text-[56px] leading-none" /><span className="label block">aggregate</span></p>
        </div>
      </div>
    )
  }
  return (
    <div className="grid min-h-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="border-l-[3px] border-ink bg-surface px-4 py-3">
        <p className="label">Answer · confidence {r.confidence.toFixed(2)}</p>
        <TextEffect per="word" preset="fade-in-blur" speed={2.4} className="mt-2 text-[17px] leading-[1.5]">{r.answer}</TextEffect>
      </div>
      <div className="scroll-thin max-h-[52vh] overflow-y-auto"><TracePanel steps={r.trace} runKey="landing" compact /></div>
    </div>
  )
}

function Rail({ stage, onJump }: { stage: number; onJump: (i: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const nodes = [useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null), useRef<HTMLButtonElement>(null)]
  return (
    <div ref={box} className="relative flex items-center justify-between" role="tablist" aria-label="Pipeline stages">
      {STAGES.map((s, i) => (
        <button key={s.n} ref={nodes[i]} role="tab" aria-selected={stage === i} type="button" onClick={() => onJump(i)}
          className={cn('relative z-[1] flex items-center gap-2 border bg-paper px-3 py-1.5', stage === i ? 'border-ink bg-ink text-paper' : i < stage ? 'border-ink text-ink' : 'border-rule text-ink-2')}>
          <span className="mono text-[11px]">{s.n}</span><span className="text-[13px]">{s.title}</span>
        </button>
      ))}
      {STAGES.slice(1).map((_, i) => i < stage && (
        <AnimatedBeam key={i} containerRef={box} fromRef={nodes[i] as RefObject<HTMLElement>} toRef={nodes[i + 1] as RefObject<HTMLElement>} duration={2.2} />
      ))}
    </div>
  )
}

function Text({ i }: { i: number }) {
  return (
    <div>
      <p className="t-telemetry text-[clamp(72px,11vw,176px)] text-ink">{STAGES[i].n}</p>
      <h3 className="t-section mt-2">{STAGES[i].title}.</h3>
      <p className="mono mt-4 inline-block border border-ink px-2 py-0.5 text-[12px]">{STAGES[i].req}</p>
      <p className="mt-4 max-w-[440px] text-[16px] leading-[1.55] text-ink-2">{STAGES[i].body}</p>
    </div>
  )
}

export default function Pipeline({ data, registry }: { data?: LandingData; registry?: Record<string, RegistryTool> }) {
  const ref = useRef<HTMLElement>(null)
  const wide = useMediaQuery('(min-width: 1024px)')
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [stage, setStage] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setStage(Math.max(0, Math.min(4, Math.floor(v * 5)))))
  const jump = (i: number) => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + ((i + 0.5) / 5) * (el.offsetHeight - window.innerHeight), behavior: 'smooth' })
  }

  if (!wide) {
    return (
      <section className="border-t border-ink px-5 py-16" data-testid="pipeline">
        <p className="label mb-6">The pipeline · RQ-4, run on the scene above</p>
        {STAGES.map((_, i) => (
          <div key={i} className="mb-16"><Text i={i} />{data && <div className="mt-6"><Visual stage={i} data={data} registry={registry} /></div>}</div>
        ))}
      </section>
    )
  }

  return (
    <section ref={ref} className="relative border-t border-ink" style={{ height: '520vh' }} data-testid="pipeline">
      <div className="sticky top-[57px] flex h-[calc(100dvh-89px)] flex-col overflow-hidden px-10 py-7">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="label">The pipeline — RQ-4, run on the scene above, stage by stage</p>
          <p className="mono text-[11px] text-ink-2">stage {stage + 1} / 5</p>
        </div>
        <Rail stage={stage} onJump={jump} />
        {/* Centred on the viewport: stages differ in height, and top-aligned they
            left half the pinned frame empty. Measure fills it — its plate is the figure. */}
        <div className="mt-8 grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center gap-14 pb-6">
          <div key={`t${stage}`}><Text i={stage} /></div>
          <div key={`v${stage}`} className={cn('min-h-0', stage === 2 && 'self-stretch')}>{data ? <Visual stage={stage} data={data} registry={registry} /> : <p className="label">Running RQ-4…</p>}</div>
        </div>
      </div>
    </section>
  )
}
