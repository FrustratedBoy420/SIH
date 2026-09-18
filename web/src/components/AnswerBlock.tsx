/**
 * The answer, with its confidence beside it — always (ADR-007, UI-04).
 * Refusal and abstention are visually distinct from an answer and from each
 * other, and each says what to do next (UI-07):
 *
 *   refusal     red rule   the inputs cannot support the question; no model ran
 *   abstention  ochre rule the models ran; nothing cleared the confidence gate
 */

import { AnimatePresence, motion } from 'motion/react'
import type { QueryResult } from '@/lib/contract'
import { ms, TASK_LABEL } from '@/lib/format'
import { NumberTicker } from './ui/NumberTicker'
import { cn } from '@/lib/utils'

export interface Remedy { label: string; run: () => void }

export default function AnswerBlock({ result, running, remedies = [], preview }: {
  result: QueryResult | null
  running: boolean
  remedies?: Remedy[]
  preview: boolean
}) {
  if (running) {
    return (
      <div className="relative h-[112px] overflow-hidden border-l-[3px] border-accent bg-surface px-4 py-3" role="status" aria-live="polite">
        <p className="label">Running</p>
        <p className="mt-2 text-ink-2">Validating inputs, routing, measuring…</p>
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
              {state === 'refused' ? 'Refused · no model invoked' : state === 'abstained' ? 'Abstained · no claim made' : TASK_LABEL[result.task] ?? result.task}
            </p>
            <p className="mono mt-0.5 break-words text-[11px] text-ink-2">
              {result.tools.length ? result.tools.join(' → ') : 'no tool'} · {result.engine}{preview ? ' · browser preview' : ''} · {ms(result.elapsed_ms)}
            </p>
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

function RemedyButton({ r }: { r: Remedy }) {
  return <button type="button" onClick={r.run} className="border border-ink bg-surface px-2.5 py-1 text-[13px] hover:bg-ink hover:text-paper">{r.label}</button>
}

/** The pipeline's refusal is "<reason> <remedy>"; the remedy is its last sentence. */
function splitRemedy(text: string): [string, string] {
  const parts = text.match(/[^.]+(\.|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  if (parts.length < 2) return [text, '']
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]]
}
