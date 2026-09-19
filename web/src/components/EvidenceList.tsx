/**
 * Evidence records (TRD §4.4). Every claim shows its confidence against the
 * gate, its source model and version, its modality (dot + word, never colour
 * alone) and the hectares it rests on.
 */

import { motion } from 'motion/react'
import type { EvidenceItem } from '@/lib/contract'
import { MODALITY_LABEL, MODALITY_VAR } from '@/lib/format'
import { cn } from '@/lib/utils'

function valueText(e: EvidenceItem) {
  if (e.value === null || e.value === undefined) return '—'
  return `${e.value}${e.unit ? (e.unit === '%' ? '%' : ` ${e.unit}`) : ''}`
}

export default function EvidenceList({ items, threshold, selected, onSelect, runKey }: {
  items: EvidenceItem[]; threshold: number; selected: number | null; onSelect: (i: number | null) => void; runKey: string
}) {
  if (!items.length) return <p className="px-1 py-3 text-[13.5px] text-ink-2">No evidence records. A refusal runs no model, so there is nothing to show — by design.</p>
  return (
    <ol className="divide-y divide-rule" aria-label="Evidence records">
      {items.map((e, i) => {
        const pass = e.confidence >= threshold
        const sel = selected === i
        return (
          <motion.li
            key={`${runKey}-${i}`}
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.24, delay: i * 0.04, ease: [0.2, 0.7, 0.3, 1] }}
            data-testid="evidence-item"
          >
            <button type="button" onClick={() => onSelect(sel ? null : i)} aria-pressed={sel}
              className={cn('block w-full px-1 py-2.5 text-left', sel && 'bg-accent-bg/60', !pass && 'opacity-60')}>
              <div className="flex items-baseline gap-2">
                <span className="inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: MODALITY_VAR[e.modality] }} />
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{e.claim}</span>
                <span className="mono shrink-0 text-[13px] text-ink">{valueText(e)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-3.5">
                {/* confidence against the gate */}
                <div className="relative h-1 flex-1 bg-surface-2" aria-hidden>
                  <motion.div className="absolute inset-y-0 left-0" style={{ background: pass ? 'var(--color-ink)' : 'var(--color-ink-3)' }}
                    initial={{ width: 0 }} animate={{ width: `${Math.round(e.confidence * 100)}%` }} transition={{ duration: 0.5, delay: 0.1 + i * 0.04 }} />
                  <div className="absolute -inset-y-1 w-px bg-nir" style={{ left: `${threshold * 100}%` }} />
                </div>
                <span className="mono w-9 text-right text-[11.5px]">{e.confidence.toFixed(2)}</span>
                <span className={cn('mono w-10 text-[10.5px]', pass ? 'text-good' : 'text-ink-2')}>{pass ? 'PASS' : 'GATED'}</span>
              </div>
              <p className="mono mt-1 pl-3.5 text-[10.5px] text-ink-2">
                {MODALITY_LABEL[e.modality]} · {e.source_model}@{e.source_version}
                {e.mask_area_ha > 0 && ` · ${e.mask_area_ha.toFixed(2)} ha`}
                {e.boxes.length > 0 && ` · ${e.boxes.length} ${e.boxes.length === 1 ? 'region' : 'regions'}`}
              </p>
              {sel && (
                <div className="mt-2 space-y-1 pl-3.5 text-[12.5px]">
                  <p className="text-ink-2"><span className="label mr-1.5">method</span>{e.method}</p>
                  {e.supporting.map((s) => <p key={s} className="mono text-[11px] text-ink-2">· {s}</p>)}
                  {e.conflicts.map((c) => <p key={c} className="text-[12px] text-warn">⚠ {c}</p>)}
                </div>
              )}
              {!sel && e.conflicts.length > 0 && <p className="mt-1 pl-3.5 text-[11.5px] text-warn">⚠ {e.conflicts.length} conflict recorded — confidence reduced</p>}
            </button>
          </motion.li>
        )
      })}
    </ol>
  )
}
