/**
 * The replay clock. A run answers in tens of milliseconds, which is too fast to
 * read, so the trace replays its recorded steps — in order, at their recorded
 * relative pace, compressed to about a second. The rest of the workstation
 * (plate, evidence, answer) waits on this same clock, so what appears last is
 * what the run produced last. Nothing is delayed before the result exists.
 */

import type { TraceStep } from './contract'

const BUDGET_MS = 1100
const GAP_MS = 90

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Seconds after the result arrives at which step `i` of the trace lands. */
export function stepDelay(steps: TraceStep[], i: number): number {
  if (reducedMotion()) return 0
  const last = steps[steps.length - 1]?.ms || 1
  const pace = Math.min(1, BUDGET_MS / last)
  return (i * GAP_MS + steps[i].ms * pace) / 1000
}

/** Seconds until the whole trace has landed; 0 under reduced motion. */
export function replaySeconds(steps: TraceStep[]): number {
  if (!steps.length || reducedMotion()) return 0
  return stepDelay(steps, steps.length - 1) + 0.14
}
