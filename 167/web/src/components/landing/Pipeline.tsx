/**
 * The five mandatory capabilities as the pipeline they actually are — not
 * five identical cards (PRD §3.1). Six numbered steps; each shows its own
 * evidence from the RQ-4 run the hero made. Steps advance on their own until
 * the reader picks one, and never under reduced motion.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import type { RegistryTool } from '@/lib/contract'
import { MODALITY_VAR } from '@/lib/format'
import { cn } from '@/lib/utils'
import PlateViewer from '@/components/PlateViewer'
import TracePanel from '@/components/TracePanel'
import { NumberTicker } from '@/components/ui/NumberTicker'
import { TextEffect } from '@/components/ui/TextEffect'
import type { LandingData } from './useLanding'

const STAGES = [
  { n: '01', title: 'Input', req: 'R5 · input check', body: 'Two images enter: optical and SAR of the same place. Count, modality, format, CRS and co-registration are checked before any model is touched.' },
  { n: '02', title: 'Understand', req: 'R5 · task identification', body: 'The question becomes a structured request: a task, the imagery it requires, the parameters it may set. Rules match words; nothing is inferred that the trace cannot show.' },
  { n: '03', title: 'Route', req: 'R5 · agentic selection', body: 'The task is matched against a fixed registry of four tools. The router picks from this table and cannot invent one. A plain router, not an agent framework — explainable on one slide.' },
  { n: '04', title: 'Execute', req: 'R1 · R2 · R3 · R4', body: 'Specialists measure: spectral indices, backscatter, change vectors, connected components. Counts and hectares come from pixels, never from language.' },
  { n: '05', title: 'Fuse', req: 'R4 · late fusion · gate', body: 'Each sensor keeps its own evidence; the fusion reads both and records where they disagree, at a cost to confidence. Anything below the gate is dropped. If nothing clears it, the system abstains.' },
  { n: '06', title: 'Answer', req: 'Evidence · trace', body: 'Language phrases only what passed the gate. Every number in the sentence exists in an evidence record, and the trace shows what ran — never why it “thought” so.' },
]

const Check = ({ ok = true, d = 0, children }: { ok?: boolean; d?: number; children: React.ReactNode }) => (
  <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: d, duration: 0.18 }} className="flex items-baseline gap-2 border-b border-rule py-1.5">
    <span className={cn('mono text-[12px]', ok ? 'text-good' : 'text-nir')}>{ok ? '✓' : '✕'}</span>
    <span className="mono text-[12.5px]">{children}</span>
  </motion.li>
)

/** The query as the router saw it: the matched words marked, then the request it became. */
function Understand({ r }: { r: LandingData['result'] }) {
  const step = r.trace.find((t) => t.step === 'Task identified')
  const detail = step?.detail ?? ''
  const rule = detail.match(/\/(.+)\//)?.[1]
  const compat = r.trace.find((t) => t.step === 'Compatibility check')?.detail ?? ''
  const conf = step?.data?.confidence
  let marked: React.ReactNode = r.query
  if (rule) {
    try {
      const m = r.query.match(new RegExp(rule, 'i'))
      if (m && m.index !== undefined) {
        marked = <>{r.query.slice(0, m.index)}<motion.mark initial={{ backgroundColor: 'rgba(255,192,0,0)' }} animate={{ backgroundColor: 'rgba(255,192,0,0.55)' }} transition={{ delay: 0.3, duration: 0.4 }} className="text-ink">{m[0]}</motion.mark>{r.query.slice(m.index + m[0].length)}</>
      }
    } catch { /* a rule that is not a JS regex is shown unmarked */ }
  }
  const rows: [string, string][] = [
    ['task', `${r.task}${typeof conf === 'number' ? ` · router confidence ${conf.toFixed(2)}` : ''}`],
    ['matched', rule ? `/${rule}/ — a rule, not a guess` : detail],
    ['requires', compat.split(' satisfies ')[1] ?? compat],
    ['supplied', r.manifest.rasters.map((x) => x.role ?? x.sensor).join(' + ')],
    ['parameters', Object.entries(r.params).map(([k, v]) => `${k} = ${v}`).join(', ') || 'none'],
  ]
  return (
    <div>
      <div className="frame bg-paper px-4 py-3">
        <p className="label">Query</p>
        <p className="mt-1 text-[19px] leading-snug">{marked}</p>
      </div>
      <p className="mono my-3 text-center text-[12px] text-ink-3" aria-hidden>↓ parsed into</p>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] border-t border-ink">
        {rows.map(([k, v], i) => (
          <motion.div key={k} className="col-span-2 grid grid-cols-subgrid border-b border-rule py-2"
            initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.12, duration: 0.2 }}>
            <dt className="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{k}</dt>
            <dd className="mono min-w-0 break-words text-[13px]">{v}</dd>
          </motion.div>
        ))}
      </dl>
    </div>
  )
}

/** Optical and SAR slide together into the fused reading. */
function Fusion({ data }: { data: LandingData }) {
  const tile = 'aspect-square w-full border border-ink object-cover'
  const cap = 'mono mt-1 text-[10.5px] text-ink-2'
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
      <motion.figure initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
        <img src={data.optical.layers.base} alt="" className={tile} /><figcaption className={cap}><span style={{ color: 'var(--color-optical)' }}>●</span> optical · cloud {data.stats.cloud_pct.toFixed(1)} %</figcaption>
      </motion.figure>
      <span className="mono pb-5 text-[18px] text-ink-3" aria-hidden>+</span>
      <motion.figure initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
        <img src={data.sar.layers.base} alt="" className={tile} /><figcaption className={cap}><span style={{ color: 'var(--color-sar)' }}>●</span> SAR · through cloud</figcaption>
      </motion.figure>
      <span className="mono pb-5 text-[18px] text-ink-3" aria-hidden>=</span>
      <motion.figure initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.55, duration: 0.4 }}>
        <img src={data.fusion} alt="Fused reading: SAR structures over optical, recovered built-up in red" className={tile} /><figcaption className={cap}><span style={{ color: 'var(--color-fusion)' }}>●</span> fused · recovered in red</figcaption>
      </motion.figure>
    </div>
  )
}

function Visual({ stage, data, registry }: { stage: number; data: LandingData; registry?: Record<string, RegistryTool> }) {
  const r = data.result
  const items = r.evidence.items
  if (stage === 0) {
    const coreg = items.find((e) => e.claim.startsWith('co-registration'))
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {r.manifest.rasters.map((x, k) => (
          <div key={x.role} className="frame bg-paper p-4">
            <div className="flex gap-3">
              <motion.img src={x.sensor === 'sar' ? data.sar.layers.base : data.optical.layers.base} alt="" aria-hidden
                initial={{ opacity: 0, x: k ? 24 : -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: k * 0.15 }}
                className="size-[72px] shrink-0 border border-ink object-cover" />
              <div className="min-w-0">
                <p className="label !text-ink" style={{ borderLeft: `3px solid ${x.sensor === 'sar' ? 'var(--color-sar)' : 'var(--color-optical)'}`, paddingLeft: 8 }}>{x.role}</p>
                <p className="mono mt-1 truncate text-[12px] text-ink-2">{x.source}</p>
              </div>
            </div>
            <ul className="mt-3">
              <Check d={0.1 + k * 0.3}>CRS {x.crs}</Check>
              <Check d={0.2 + k * 0.3}>{x.bands} bands · {x.band_names.join(', ')}</Check>
              <Check d={0.3 + k * 0.3}>GSD {x.gsd_m.toFixed(1)} m · {x.width}×{x.height}</Check>
              <Check d={0.4 + k * 0.3}>georeferenced</Check>
            </ul>
          </div>
        ))}
        <div className="border border-rule bg-paper p-4 sm:col-span-2">
          <ul>
            <Check d={0.9}>{r.trace.find((t) => t.step === 'Compatibility check')?.detail}</Check>
            {coreg && <Check d={1.05} ok={coreg.confidence > 0.5}>{coreg.claim} · offset {String(coreg.value)} px · {coreg.supporting[1]}</Check>}
          </ul>
        </div>
      </div>
    )
  }
  if (stage === 1) return <Understand r={r} />
  if (stage === 2) {
    return (
      <div>
        <p className="mono border-l-2 border-ink pl-2 text-[12.5px] text-ink-2">task <span className="text-ink">{r.task}</span> → which registered tool serves it?</p>
        <table className="mt-4 w-full border-collapse text-left text-[12.5px]">
          <thead><tr className="border-b border-ink"><th className="label py-1.5 font-medium">tool</th><th className="label font-medium">task</th><th className="label font-medium">requires</th><th className="label font-medium">adapter</th></tr></thead>
          <tbody>
            {Object.entries(registry ?? {}).map(([name, t], i) => {
              const chosen = r.tools.includes(name)
              return (
                <motion.tr key={name} initial={{ opacity: 0 }} animate={{ opacity: chosen ? 1 : 0.38 }} transition={{ delay: 0.2 + i * 0.08 }}
                  className={cn('border-b border-rule', chosen && 'bg-sun/45')}>
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
  if (stage === 3) {
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
                <p className="flex items-baseline gap-2 text-[13px]"><span className="inline-block size-2 shrink-0" style={{ background: MODALITY_VAR[e.modality] }} />{e.claim}</p>
                <p className="mono pl-3.5 text-[12px] text-ink-2">{String(e.value)} {e.unit} · {e.source_model}{e.mask_area_ha ? ` · ${e.mask_area_ha.toFixed(0)} ha` : ''}</p>
              </motion.li>
            ))}
          </ul>
          <p className="mt-3 border-l-2 border-warn pl-2 text-[12px] leading-snug text-ink-2">The adapted model (M1) is not trained yet, so the classical path serves every tool. The trace says so rather than hiding it.</p>
        </div>
      </div>
    )
  }
  if (stage === 4) {
    const thr = r.evidence.threshold
    return (
      <div>
        <Fusion data={data} />
        <ul className="mt-5 space-y-2.5">
          {items.map((e, i) => {
            const pass = e.confidence >= thr
            return (
              <li key={e.claim}>
                <div className="flex justify-between text-[12.5px]"><span>{e.claim}</span><span className="mono">{e.confidence.toFixed(2)} <b className={pass ? 'text-good' : 'text-ink-2'}>{pass ? 'PASS' : 'GATED'}</b></span></div>
                <div className="relative mt-1 h-3 bg-paper">
                  <motion.div className="absolute inset-y-0 left-0 bg-accent" initial={{ width: 0 }} animate={{ width: `${e.confidence * 100}%` }} transition={{ delay: 0.15 + i * 0.1, duration: 0.6, ease: [0.2, 0.7, 0.3, 1] }} />
                  <div className="absolute -inset-y-1 w-[2px] bg-nir" style={{ left: `${thr * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex items-end justify-between border-t border-ink pt-3">
          <p className="max-w-[340px] text-[12.5px] text-ink-2">Aggregate = area-weighted mean of passing records − 0.08 per recorded conflict. Red rule: the gate at <span className="mono">{thr.toFixed(2)}</span>.</p>
          <p className="text-right"><NumberTicker value={r.confidence} decimalPlaces={2} className="text-[56px] leading-none" /><span className="label block">aggregate</span></p>
        </div>
      </div>
    )
  }
  return (
    <div className="grid min-h-0 items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="frame bg-paper px-4 py-3">
        <p className="label">Answer · confidence {r.confidence.toFixed(2)}</p>
        <TextEffect per="word" preset="fade-in-blur" speed={2.4} className="mt-2 text-[17px] leading-[1.5]">{r.answer}</TextEffect>
      </div>
      <div className="scroll-thin max-h-[52vh] overflow-y-auto"><TracePanel steps={r.trace} runKey="landing" compact /></div>
    </div>
  )
}

function Steps({ stage, onPick }: { stage: number; onPick: (i: number) => void }) {
  return (
    <div className="scroll-thin -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <div className="grid min-w-[760px] grid-cols-6 border border-ink" role="tablist" aria-label="Pipeline stages">
        {STAGES.map((s, i) => (
          <button key={s.n} role="tab" aria-selected={stage === i} aria-controls="pipeline-panel" type="button" onClick={() => onPick(i)}
            className={cn('flex items-baseline gap-2 border-ink px-4 py-3 text-left transition-colors [&:not(:first-child)]:border-l',
              stage === i ? 'bg-ink text-paper' : 'hover:bg-surface-2')}>
            <span className={cn('mono text-[12px]', stage === i ? 'text-sun' : 'text-ink-3')}>{s.n}</span>
            <span className="text-[15px] font-medium">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Text({ i }: { i: number }) {
  return (
    <div>
      <p className="mono text-[13px] text-ink-2">Step {STAGES[i].n} · {STAGES[i].req}</p>
      <h3 className="t-display mt-3 text-[clamp(28px,3vw,40px)]">{STAGES[i].title}</h3>
      <p className="mt-4 max-w-[420px] text-[17px] leading-[1.55] text-ink-2">{STAGES[i].body}</p>
    </div>
  )
}

export default function Pipeline({ data, registry }: { data?: LandingData; registry?: Record<string, RegistryTool> }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { amount: 0.35 })
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(0)
  const [picked, setPicked] = useState(false)

  // advance on its own while on screen, until the reader takes over
  useEffect(() => {
    if (picked || reduce || !inView || !data) return
    const t = window.setTimeout(() => setStage((s) => (s + 1) % STAGES.length), 7000)
    return () => window.clearTimeout(t)
  }, [stage, picked, reduce, inView, data])

  return (
    <section ref={ref} className="px-5 py-24 sm:px-8" data-testid="pipeline" aria-labelledby="pipeline-h">
      <p className="label mb-4">How it works</p>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <h2 id="pipeline-h" className="t-section max-w-[760px]">Six steps from a question to an answer with evidence</h2>
        <p className="max-w-[380px] text-[15px] text-ink-2">Each step below is the real RQ-4 run on the demo scene, not an illustration.</p>
      </div>
      <Steps stage={stage} onPick={(i) => { setPicked(true); setStage(i) }} />
      <div id="pipeline-panel" role="tabpanel" className="grid min-h-[560px] items-start gap-10 border-x border-b border-ink bg-surface p-6 sm:p-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
        <div key={`t${stage}`}><Text i={stage} /></div>
        <div key={`v${stage}`} className={cn('min-w-0', stage === 3 && 'lg:h-[520px]')}>
          {data ? <Visual stage={stage} data={data} registry={registry} /> : <p className="text-ink-2">Running RQ-4…</p>}
        </div>
      </div>
    </section>
  )
}
