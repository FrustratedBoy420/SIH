/**
 * The answer, with its confidence beside it — always (ADR-007, UI-04).
 * Refusal and abstention are visually distinct from an answer and from each
 * other, and each says what to do next (UI-07):
 *
 *   refusal     red rule   the inputs cannot support the question; no model ran
 *   abstention  ochre rule the models ran; nothing cleared the confidence gate
 */

import { Fragment } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { QueryResult } from '@/lib/contract'
import { ms, TASK_LABEL } from '@/lib/format'
import { NumberTicker } from './ui/NumberTicker'
import { cn } from '@/lib/utils'

export interface Remedy { label: string; run: () => void }

export default function AnswerBlock({ result, running, replaying = false, remedies = [], preview }: {
  result: QueryResult | null
  running: boolean
  /** the result exists and its trace is replaying; the answer lands when it ends */
  replaying?: boolean
  remedies?: Remedy[]
  preview: boolean
}) {
  if (running || (replaying && result)) {
    const route = result?.tools.join(' → ')
    return (
      <div className="relative h-[112px] overflow-hidden border-l-[3px] border-accent bg-surface px-4 py-3" role="status" aria-live="polite" data-testid="answer-pending">
        <p className="label">{replaying ? 'Executing' : 'Running'}</p>
        <p className="mt-2 text-ink-2">{replaying && result
          ? <>{result.task ? <>Task <span className="mono text-ink">{result.task}</span>{route ? <> · route <span className="mono text-ink">{route}</span></> : null}.</> : 'Checking the inputs.'} The trace below is the run, step by step.</>
          : 'Validating inputs, routing, measuring…'}</p>
        <div className="animate-sweep absolute inset-x-0 bottom-0 h-[2px] bg-accent" />
      </div>
    )
  }
  if (!result) {
    return (
      <div className="border-l-[3px] border-rule bg-surface px-4 py-3" data-testid="answer-idle">
        <p className="label">No query yet</p>
        <p className="mt-1.5 text-[14px] text-ink-2">Ask below, or press <kbd className="mono border border-rule px-1 text-[11px]">⌘K</kbd> for the problem statement's own five questions.</p>
      </div>
    )
  }

  const state = result.refused ? 'refused' : result.abstained ? 'abstained' : 'answered'
  const [problem, remedy] = result.refused ? splitRemedy(result.answer) : [result.answer, '']

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={result.run_id}
        initial={{ opacity: 0, x: state === 'answered' ? 0 : -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}
        className={cn('border-l-[3px] bg-surface px-4 py-3',
          state === 'refused' ? 'border-nir bg-nir-bg/60' : state === 'abstained' ? 'border-warn bg-warn-bg/60' : 'border-ink')}
        data-testid={state === 'refused' ? 'refusal' : state === 'abstained' ? 'abstention' : 'answer'}
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={cn('label', state === 'refused' && '!text-nir', state === 'abstained' && '!text-warn')}>
              {state === 'refused' ? 'Refused · no model invoked' : state === 'abstained' ? 'Abstained · no claim made' : 'Analysis complete'}
            </p>
            {state !== 'answered' && (
              <p className="mono mt-0.5 break-words text-[11px] text-ink-2">
                {result.tools.length ? result.tools.join(' → ') : 'no tool'} · {result.engine}{preview ? ' · browser preview' : ''} · {ms(result.elapsed_ms)}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            {state === 'answered'
              ? <NumberTicker key={result.run_id} value={result.confidence} decimalPlaces={2} className="text-[30px] leading-none font-medium tracking-tight" data-testid="confidence" />
              : <span className="mono text-[30px] leading-none text-ink-3" data-testid="confidence">{result.confidence.toFixed(2)}</span>}
            <p className="label mt-1">confidence</p>
          </div>
        </div>

        {result.precomputed && (
          <p className="mono mt-2 inline-block border border-warn px-1.5 text-[11px] text-warn" data-testid="precomputed-badge">PRE-COMPUTED · venue fallback, not live inference</p>
        )}

        <p className="mt-2.5 text-[15px] leading-[1.5] text-ink" data-testid="answer-text">{problem}</p>

        {state === 'answered' && <Readout result={result} preview={preview} />}

        {state === 'refused' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-3 border-t border-nir/30 pt-2.5">
            <p className="label !text-ink">What to do</p>
            <p className="mt-1 text-[14px]">{remedy || 'Supply imagery that can answer this question.'}</p>
            {remedies.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{remedies.map((r) => <RemedyButton key={r.label} r={r} />)}</div>}
          </motion.div>
        )}
        {state === 'abstained' && (
          <div className="mt-3 border-t border-warn/30 pt-2.5">
            <p className="label !text-ink">What to do</p>
            <p className="mt-1 text-[14px]">Every measurement fell below the gate at <span className="mono">{result.evidence.threshold.toFixed(2)}</span>. Ask about something the specialists can measure — water, vegetation, built-up, bare soil — or lower the threshold and read the evidence critically.</p>
            {remedies.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{remedies.map((r) => <RemedyButton key={r.label} r={r} />)}</div>}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * The run as an instrument readout (brief §5): every row is a field of the
 * result, nothing is composed for effect. AREA is the single highest-confidence
 * passing record with an area — summing records would double-count, because
 * cross-modal records overlap by design.
 */
const fade = (i: number) => ({ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: 0.05 + i * 0.05 } })

function Readout({ result, preview }: { result: QueryResult; preview: boolean }) {
  const passing = result.evidence.items.filter((e) => e.confidence >= result.evidence.threshold)
  const models = [...new Set(passing.map((e) => `${e.source_model}@${e.source_version}`))]
  const area = passing.filter((e) => e.mask_area_ha > 0).sort((a, b) => b.confidence - a.confidence)[0]
  const rows: [string, React.ReactNode][] = [
    ['task', (TASK_LABEL[result.task] ?? result.task).toUpperCase()],
    ['inputs', result.manifest.rasters.map((r) => (r.role ?? r.sensor).toUpperCase()).join(' + ') || '—'],
    ['route', result.tools.join(' → ') || 'no tool'],
    ['model', models.length ? models.join(', ') : '—'],
    ['evidence', `${result.evidence.passing}/${result.evidence.count} records passed · gate ${result.evidence.threshold.toFixed(2)}`],
  ]
  if (area) rows.push(['area', <><b className="font-medium text-ink">{area.mask_area_ha.toFixed(2)} ha</b> · {area.claim}</>])
  rows.push(['execution', `${ms(result.elapsed_ms)} · ${result.engine} path${preview ? ' · browser preview' : ''}`])
  return (
    <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] border-t border-rule pt-2 text-[11.5px]" data-testid="readout">
      {rows.map(([k, v], i) => (
        <Fragment key={k}>
          <motion.dt {...fade(i)} className="mono py-[3px] uppercase tracking-[0.06em] text-ink-3">{k}</motion.dt>
          <motion.dd {...fade(i)} className="mono min-w-0 break-words py-[3px] text-ink-2">{v}</motion.dd>
        </Fragment>
      ))}
    </dl>
  )
}

function RemedyButton({ r }: { r: Remedy }) {
  return <button type="button" onClick={r.run} className="border border-ink bg-surface px-2.5 py-1 text-[13px] hover:bg-ink hover:text-paper">{r.label}</button>
}

/** The pipeline's refusal is "<reason> <remedy>"; the remedy is its last sentence. */
function splitRemedy(text: string): [string, string] {
  const parts = text.match(/[^.]+(\.|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  if (parts.length < 2) return [text, '']
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]]
}
