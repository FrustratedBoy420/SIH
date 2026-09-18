/**
 * The execution trace — always visible, because it is what is scored
 * (ADR-008). Task, tools, parameters, outputs. No reasoning text.
 *
 * Steps land one at a time in the order and at the pace they were recorded,
 * compressed so the whole run replays in under a second and a half.
 */

import { motion, useReducedMotion } from 'motion/react'
import type { TraceStep } from '@/lib/contract'
import { ms } from '@/lib/format'
import { stepDelay } from '@/lib/replay'
import { cn } from '@/lib/utils'

export default function TracePanel({ steps, runKey, compact = false }: { steps: TraceStep[]; runKey: string; compact?: boolean }) {
  const reduce = useReducedMotion()
  if (!steps.length) {
    return <p className="px-1 py-3 text-[13.5px] text-ink-2">The trace appears here the moment a query runs: validation, task, compatibility, tools, parameters, execution, gate.</p>
  }
  return (
    <ol className="relative" aria-label="Execution trace">
      <span className="absolute bottom-3 left-[7px] top-3 w-px bg-rule" aria-hidden />
      {steps.map((s, i) => {
        const delay = reduce ? 0 : stepDelay(steps, i)
        const dataKeys = Object.keys(s.data ?? {})
        return (
          <motion.li
            key={`${runKey}-${i}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, delay }}
            className="relative grid grid-cols-[16px_1fr_auto] gap-x-2.5 py-1.5"
            data-testid="trace-step" data-ok={s.ok}
          >
            <span className={cn('relative z-[1] mt-[3px] grid size-[15px] place-items-center rounded-full border text-[9px] font-bold leading-none',
              s.ok ? 'border-good bg-good-bg text-good' : 'border-nir bg-nir text-white')} aria-label={s.ok ? 'ok' : 'failed'}>
              {s.ok ? '✓' : '✕'}
            </span>
            <div className="min-w-0">
              <p className={cn('text-[13px] font-medium leading-tight', !s.ok && 'text-nir')}>
                <span className="mono mr-1.5 text-[10.5px] font-normal text-ink-3">{String(i + 1).padStart(2, '0')}</span>{s.step}
              </p>
              <p className="mono mt-0.5 break-words text-[11px] leading-snug text-ink-2">{s.detail}</p>
              {!compact && dataKeys.length > 0 && (
                <details className="mt-0.5">
                  <summary className="mono cursor-pointer text-[10.5px] text-accent">data · {dataKeys.join(', ')}</summary>
                  <pre className="mono scroll-thin mt-1 max-h-40 overflow-auto bg-surface-2 p-2 text-[10.5px] leading-snug text-ink-2">{JSON.stringify(s.data, null, 1)}</pre>
                </details>
              )}
            </div>
            <span className="mono pt-px text-[10.5px] text-ink-2">{ms(s.ms)}</span>
          </motion.li>
        )
      })}
    </ol>
  )
}
