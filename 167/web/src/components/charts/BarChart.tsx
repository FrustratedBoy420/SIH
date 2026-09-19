/**
 * Horizontal bar chart, single series (dataviz skill: one series → one
 * colour, no legend box; thin bars ≤ 24 px with a 4 px rounded data end;
 * hairline solid grid; value at the tip; hover and keyboard tooltip; a table
 * twin). Reference values — published anchors and targets — are drawn as
 * labelled threshold rules, which is the one place a dashed line is right.
 *
 * A row whose value is null is PENDING: an outlined empty track reading
 * XX.X. Nothing is estimated to fill it.
 */

import { useState } from 'react'
import { motion } from 'motion/react'
import { PLACEHOLDER } from '@/lib/format'

export interface BarRow { key: string; label: string; sub?: string; value: number | null; mark?: string; from?: number; tip?: string }
export interface RefLine { value: number; label: string }

export default function BarChart({ rows, max = 1, ticks, fmt = (v) => v.toFixed(2), refs = [], band, caption, testId }: {
  rows: BarRow[]; max?: number; ticks?: number[]; fmt?: (v: number) => string; refs?: RefLine[]
  band?: [number, number, string]; caption: string; testId?: string
}) {
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const t = ticks ?? [0, max / 4, max / 2, (3 * max) / 4, max]
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`
  const hasRefs = refs.length > 0 || band
  return (
    <figure data-testid={testId} className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)] gap-x-4">
        <div />
        {/* reference labels ride above the plot, stacked in rows — band on top, anchors alternating below — so near values never overprint */}
        <div className={hasRefs ? 'relative mb-1 h-11' : 'h-2'}>
          {band && <span className="mono absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] text-ink-2" style={{ left: pct((band[0] + band[1]) / 2) }}>{band[2]}</span>}
          {refs.map((r, i) => (
            <span key={r.label} className="mono absolute -translate-x-1/2 whitespace-nowrap text-[10.5px] text-ink-2" style={{ left: pct(r.value), top: (band ? 14 : 0) + (i % 2) * 14 }}>{r.label}</span>
          ))}
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="contents">
            <div className="flex items-center gap-2 py-2 pr-1 text-[13px]">
              {r.mark && <span className="inline-block size-2.5 shrink-0" style={{ background: r.mark }} aria-hidden />}
              <span className="min-w-0"><span className="block leading-tight">{r.label}</span>{r.sub && <span className="mono block text-[10.5px] text-ink-2">{r.sub}</span>}</span>
            </div>
            <div className="relative py-2">
              <div className="relative h-6">
                {r.value === null ? (
                  <div className="absolute inset-y-0 left-0 right-0 flex items-center border border-dashed border-rule-2 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgb(14_33_41/0.06)_6px_7px)] px-2">
                    <span className="mono text-[12px] text-ink-2">{PLACEHOLDER} · not measured</span>
                  </div>
                ) : (
                  <button type="button" className="group absolute inset-y-0 left-0 right-0 cursor-default text-left focus-visible:outline-offset-0"
                    aria-label={`${r.label}: ${fmt(r.value)}`}
                    onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ i, x: e.clientX - b.left, y: 0 }) }}
                    onMouseLeave={() => setTip(null)} onFocus={() => setTip({ i, x: 40, y: 0 })} onBlur={() => setTip(null)}>
                    <motion.span className="absolute inset-y-1 left-0 block rounded-r-[4px] bg-ink group-hover:bg-accent"
                      initial={{ width: pct(r.from ?? 0) }} animate={{ width: pct(r.value) }}
                      transition={{ duration: 0.9, delay: i * 0.06, ease: [0.2, 0.7, 0.3, 1] }} />
                    <motion.span className="mono absolute top-1/2 -translate-y-1/2 pl-2 text-[12px] text-ink"
                      initial={{ left: pct(r.from ?? 0) }} animate={{ left: pct(r.value) }}
                      transition={{ duration: 0.9, delay: i * 0.06, ease: [0.2, 0.7, 0.3, 1] }}>{fmt(r.value)}</motion.span>
                  </button>
                )}
              </div>
              {tip?.i === i && r.value !== null && (
                <div role="tooltip" className="raised frame pointer-events-none absolute z-20 -translate-y-full bg-surface px-2.5 py-1.5 text-[12px]" style={{ left: Math.min(tip.x, 360), top: 0 }}>
                  <p className="font-medium">{r.label}</p>
                  <p className="mono">{fmt(r.value)}</p>
                  {r.tip && <p className="mono max-w-[260px] text-[11px] text-ink-2">{r.tip}</p>}
                </div>
              )}
            </div>
          </div>
        ))}
        <div />
        <div className="relative h-5 border-t border-rule">
          {t.map((v) => <span key={v} className="mono absolute top-1 -translate-x-1/2 text-[10.5px] text-ink-2" style={{ left: pct(v) }}>{fmt(v)}</span>)}
        </div>
      </div>
      {/* grid, anchors and band sit behind the bars, across the plot column only */}
      <div className="pointer-events-none absolute inset-0 grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)] gap-x-4" aria-hidden>
        <div />
        <div className={`relative ${hasRefs ? 'mt-12' : 'mt-2'} mb-5`}>
          {t.map((v) => <div key={v} className="absolute inset-y-0 w-px bg-rule/70" style={{ left: pct(v) }} />)}
          {band && <div className="absolute inset-y-0 bg-sage/30" style={{ left: pct(band[0]), width: `calc(${pct(band[1])} - ${pct(band[0])})` }} />}
          {refs.map((r) => <div key={r.label} className="absolute inset-y-0 border-l border-dashed border-ink-2" style={{ left: pct(r.value) }} />)}
        </div>
      </div>
      <details className="mt-3">
        <summary className="mono cursor-pointer text-[11.5px] text-accent">table view</summary>
        <table className="mt-2 w-full border-collapse text-left text-[12.5px]">
          <thead><tr className="border-b border-ink"><th className="py-1 font-medium">Row</th><th className="font-medium">Value</th><th className="font-medium">Note</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-b border-rule"><td className="py-1">{r.label}</td><td className="mono">{r.value === null ? PLACEHOLDER : fmt(r.value)}</td><td className="text-ink-2">{r.tip ?? r.sub ?? ''}</td></tr>)}
            {refs.map((r) => <tr key={r.label} className="border-b border-rule"><td className="py-1">anchor · {r.label}</td><td className="mono">{fmt(r.value)}</td><td className="text-ink-2">published reference</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
