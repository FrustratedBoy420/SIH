/**
 * The query is a bar, not a chat panel (UI-02): an analysis tool with a
 * conversational door. The threshold beside it is the one parameter the
 * registry permits a caller to set.
 */

import { forwardRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  running: boolean
  /** why the bar is locked, when it is not a run in progress */
  busy?: string
  threshold: number
  onThreshold: (v: number) => void
  onPalette: () => void
  inputsLabel: string
}

const QueryBar = forwardRef<HTMLInputElement, Props>(function QueryBar({ value, onChange, onSubmit, running, busy, threshold, onThreshold, onPalette, inputsLabel }, ref) {
  return (
    <form
      className="frame raised flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface py-2 pl-3 pr-2 sm:pl-4"
      onSubmit={(e) => { e.preventDefault(); if (!running) onSubmit() }}
      role="search"
    >
      <span className="mono hidden shrink-0 border border-rule px-2 py-1 text-[11px] text-ink-2 md:inline lg:hidden 2xl:inline" title="What the router will see">{inputsLabel}</span>
      <label className="flex min-w-[200px] flex-1 items-center gap-2">
        <span className="sr-only">Ask about this imagery</span>
        <span className="text-[20px] text-ink-3" aria-hidden>⌕</span>
        <input
          ref={ref}
          data-testid="query-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          placeholder="Ask about this imagery…"
          className="h-11 w-full bg-transparent text-[17px] outline-none placeholder:text-ink-3"
          autoComplete="off"
        />
      </label>
      <button type="button" onClick={onPalette} data-testid="open-palette" className="mono shrink-0 border border-rule px-2 py-1 text-[11.5px] text-ink-2 hover:border-ink hover:text-ink">
        examples <kbd className="ml-1 text-ink-3">⌘K</kbd>
      </button>
      <label className="flex shrink-0 items-center gap-2" title="Confidence gate — the only permitted parameter">
        <span className="text-[13px] text-ink-2">Gate</span>
        <input type="range" min={0} max={1} step={0.05} value={threshold} onChange={(e) => onThreshold(Number(e.target.value))} className="instrument w-20" aria-label="Confidence threshold" data-testid="threshold" />
        <span className="mono w-8 text-[12.5px]">{threshold.toFixed(2)}</span>
      </label>
      <button type="submit" disabled={running} data-testid="query-submit" className="btn btn-sun h-11 shrink-0 !py-0 disabled:opacity-60">
        {busy ?? (running ? 'Analysing…' : 'Analyse')}
      </button>
    </form>
  )
})

export default QueryBar
