/**
 * The query is a bar, not a chat panel (UI-02): an analysis tool with a
 * conversational door. The threshold beside it is the one parameter the
 * registry permits a caller to set.
 *
 * It sits at the top of the workstation (the first thing a visitor should
 * find) with an accent border to say so. A suggested question — from a
 * sample photo — is never written into the box as if already typed: it shows
 * as the placeholder, in the same grey as the default, so clicking in and
 * typing behaves exactly like an empty box. Typing two or more characters
 * offers matching example questions beneath the bar.
 */

import { forwardRef, useState } from 'react'

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
  /** shown in place of the value when empty — a recommendation, not a prefill */
  placeholderText?: string
  /** question text offered as you type; matched by substring, case-insensitive */
  examples: string[]
}

const QueryBar = forwardRef<HTMLInputElement, Props>(function QueryBar(
  { value, onChange, onSubmit, running, busy, threshold, onThreshold, onPalette, inputsLabel, placeholderText, examples }, ref,
) {
  const [open, setOpen] = useState(false)
  const norm = value.trim().toLowerCase()
  const matches = norm.length >= 2
    ? examples.filter((e) => e.toLowerCase().includes(norm) && e.toLowerCase() !== norm).slice(0, 6)
    : []
  const showMatches = open && matches.length > 0

  return (
    <form
      className="raised relative flex flex-wrap items-center gap-x-4 gap-y-2 border-2 border-accent bg-surface py-2 pl-3 pr-2 sm:pl-4"
      onSubmit={(e) => { e.preventDefault(); if (!running) { setOpen(false); onSubmit() } }}
      role="search"
    >
      <span className="mono hidden shrink-0 border border-rule px-2 py-1 text-[11px] text-ink-2 md:inline lg:hidden 2xl:inline" title="What the router will see">{inputsLabel}</span>
      <label className="flex min-w-[200px] flex-1 items-center gap-2">
        <span className="sr-only">Ask about this imagery</span>
        <span className="text-[20px] text-accent" aria-hidden>⌕</span>
        <input
          ref={ref}
          data-testid="query-input"
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
          maxLength={500}
          placeholder={placeholderText || 'Ask about this imagery…'}
          className="h-11 w-full bg-transparent text-[17px] outline-none placeholder:text-ink-3"
          autoComplete="off"
          role="combobox"
          aria-expanded={showMatches}
          aria-controls="query-suggestions"
          aria-autocomplete="list"
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

      {showMatches && (
        <ul id="query-suggestions" role="listbox" data-testid="query-suggestions"
          className="frame raised absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto bg-surface">
          {matches.map((m) => (
            <li key={m} role="option" aria-selected={false}>
              {/* mousedown, not click: keeps focus in the input so it never blurs before the pick registers */}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(m); setOpen(false) }}
                className="block w-full px-4 py-2 text-left text-[13.5px] text-ink hover:bg-sun/25">
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
})

export default QueryBar
