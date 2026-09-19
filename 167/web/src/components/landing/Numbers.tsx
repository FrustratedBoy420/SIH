/**
 * The numbers band — each figure with its published anchor beside it. What
 * needs a model run reads XX.X until one exists (EVL-01, P7); what was
 * measured says where and when.
 */

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PLACEHOLDER } from '@/lib/format'
import { NumberTicker } from '@/components/ui/NumberTicker'
import { BlurFade } from '@/components/ui/BlurFade'

const PENDING = [
  { label: 'VQA accuracy · VRSBench', unit: '%', anchor: 'GeoChat fine-tuned 60.6 % · GPT-4V 65.6 %', target: 'target 55–62 %' },
  { label: 'Adaptation gain · zero-shot → M1', unit: 'pts', anchor: 'GeoChat 40.8 → 60.6 = +19.8', target: 'target +10 to +20', sign: '+' },
  { label: 'Grounding Acc@0.5', unit: '%', anchor: 'GeoChat best 39.6 %', target: 'target 30–45 %' },
  { label: 'Router · held-out paraphrases', unit: '', anchor: 'written blind to the rules', target: 'target ≈ 0.85' },
]

export default function Numbers() {
  const { data: ev } = useQuery({ queryKey: ['evaluation'], queryFn: api.evaluation })
  const measured = ev?.tasks.filter((t) => !t.task.startsWith('router')) ?? []
  return (
    <section className="px-5 py-24 sm:px-8" data-testid="numbers" aria-labelledby="numbers-h">
      <p className="label mb-4">Results</p>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h2 id="numbers-h" className="t-section max-w-[820px]">The gain is the evidence, not the score</h2>
        <Link to="/results" className="btn btn-line btn-sm">All results, with formulas →</Link>
      </div>
      <div className="frame mt-12 grid gap-px bg-ink sm:grid-cols-2 lg:grid-cols-4">
        {PENDING.map((p, i) => (
          <BlurFade key={p.label} delay={i * 0.06} className="bg-surface p-6">
            <p className="label">{p.label}</p>
            <p className="t-telemetry mt-5 text-[clamp(48px,5vw,80px)] text-ink-3" aria-label={`${p.label}: not yet measured`}>{p.sign ?? ''}{PLACEHOLDER}<span className="text-[0.32em]"> {p.unit}</span></p>
            <p className="mono mt-3 text-[12px]">{p.target}</p>
            <p className="mono text-[12px] text-ink-2">anchor · {p.anchor}</p>
            <p className="mt-3 inline-block bg-warn-bg px-2 py-0.5 text-[12px] text-warn">Pending model run — never estimated</p>
          </BlurFade>
        ))}
      </div>
      <div className="mt-10">
        <p className="text-[14px] font-medium">Measured in your browser just now · synthetic scene {ev ? `${ev.scene.size} px, seed ${ev.scene.seed}` : ''} · ground truth the pipeline never reads</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {measured.map((t) => (
            <div key={t.task} className="border-t border-ink pt-3">
              <p className="text-[13px] text-ink-2">{t.task}</p>
              <p className="t-display mt-1 text-[40px] leading-none"><NumberTicker value={t.value} decimalPlaces={2} /> <span className="mono text-[13px] text-ink-2">{t.metric}</span></p>
            </div>
          ))}
          {!ev && <p className="mono text-[12px] text-ink-2">measuring…</p>}
        </div>
      </div>
    </section>
  )
}
