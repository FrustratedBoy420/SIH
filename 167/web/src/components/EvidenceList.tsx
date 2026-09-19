/**
 * Evidence records (TRD §4.4). Every claim shows its confidence against the
 * gate, its source model and version, its modality (dot + word, never colour
 * alone) and the hectares it rests on.
 */

import { motion } from 'motion/react'
import type { EvidenceItem, GeoBox } from '@/lib/contract'
import { MODALITY_LABEL, MODALITY_VAR } from '@/lib/format'
import { cn } from '@/lib/utils'

function valueText(e: EvidenceItem) {
  if (e.value === null || e.value === undefined) return '—'
  return `${e.value}${e.unit ? (e.unit === '%' ? '%' : ` ${e.unit}`) : ''}`
}

/** The imagery a claim rests on: cropped to its first region with some context, or the whole plate. */
export interface Plate { src: string; width: number; height: number }

function Thumb({ box, plate, colour }: { box?: GeoBox; plate?: Plate; colour: string }) {
  const frame = 'relative size-14 shrink-0 overflow-hidden border border-ink'
  if (!plate) return <div className={frame} style={{ background: colour, opacity: 0.35 }} aria-hidden />
  // a scene-wide claim: the whole plate, marked with its modality underneath
  if (!box) return (
    <div className={frame} aria-hidden>
      <img src={plate.src} alt="" className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: colour }} />
    </div>
  )
  const cx = (box.x0 + box.x1) / 2 / plate.width, cy = (box.y0 + box.y1) / 2 / plate.height
  const side = Math.min(1, Math.max(0.08, 1.8 * Math.max((box.x1 - box.x0) / plate.width, (box.y1 - box.y0) / plate.height)))
  const left = Math.min(1 - side, Math.max(0, cx - side / 2)), top = Math.min(1 - side, Math.max(0, cy - side / 2))
  return (
    <div className={frame} aria-hidden>
      <img src={plate.src} alt="" className="absolute max-w-none"
        style={{ width: `${100 / side}%`, height: `${100 / side}%`, left: `${(-left / side) * 100}%`, top: `${(-top / side) * 100}%` }} />
      <span className="absolute border-2" style={{
        borderColor: colour,
        left: `${((box.x0 / plate.width - left) / side) * 100}%`, top: `${((box.y0 / plate.height - top) / side) * 100}%`,
        width: `${((box.x1 - box.x0) / plate.width / side) * 100}%`, height: `${((box.y1 - box.y0) / plate.height / side) * 100}%`,
      }} />
    </div>
  )
}

export default function EvidenceList({ items, threshold, selected, onSelect, runKey, plate }: {
  items: EvidenceItem[]; threshold: number; selected: number | null; onSelect: (i: number | null) => void; runKey: string; plate?: Plate
}) {
  if (!items.length) return <p className="px-1 py-3 text-[13.5px] text-ink-2">No evidence records. A refusal runs no model, so there is nothing to show — by design.</p>
  return (
    <ol className="space-y-2" aria-label="Evidence records">
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
              className={cn('flex w-full gap-3 border p-2 text-left transition-colors', sel ? 'border-ink bg-sun/25' : 'border-rule bg-paper hover:border-ink', !pass && 'opacity-60')}>
              <Thumb box={e.boxes[0]} plate={plate} colour={MODALITY_VAR[e.modality]} />
              <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 text-[13.5px] font-medium leading-snug text-ink">{e.claim}</span>
                <span className="mono shrink-0 text-[13px] text-ink">{valueText(e)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                {/* confidence against the gate */}
                <div className="relative h-1.5 flex-1 bg-surface-2" aria-hidden>
                  <motion.div className="absolute inset-y-0 left-0" style={{ background: pass ? 'var(--color-accent)' : 'var(--color-ink-3)' }}
                    initial={{ width: 0 }} animate={{ width: `${Math.round(e.confidence * 100)}%` }} transition={{ duration: 0.5, delay: 0.1 + i * 0.04 }} />
                  <div className="absolute -inset-y-1 w-px bg-nir" style={{ left: `${threshold * 100}%` }} />
                </div>
                <span className="mono w-9 text-right text-[11.5px]">{e.confidence.toFixed(2)}</span>
                <span className={cn('mono w-10 text-[10.5px]', pass ? 'text-good' : 'text-ink-2')}>{pass ? 'PASS' : 'GATED'}</span>
              </div>
              <p className="mono mt-1 text-[10.5px] text-ink-2">
                <span className="mr-1 inline-block size-2 align-[-1px]" style={{ background: MODALITY_VAR[e.modality] }} />{MODALITY_LABEL[e.modality]} · {e.source_model}@{e.source_version}
                {e.mask_area_ha > 0 && ` · ${e.mask_area_ha.toFixed(2)} ha`}
                {e.boxes.length > 0 && ` · ${e.boxes.length} ${e.boxes.length === 1 ? 'region' : 'regions'}`}
              </p>
              {sel && (
                <div className="mt-2 space-y-1 text-[12.5px]">
                  <p className="text-ink-2"><span className="label mr-1.5">method</span>{e.method}</p>
                  {e.supporting.map((s) => <p key={s} className="mono text-[11px] text-ink-2">· {s}</p>)}
                  {e.conflicts.map((c) => <p key={c} className="text-[12px] text-warn">⚠ {c}</p>)}
                </div>
              )}
              {!sel && e.conflicts.length > 0 && <p className="mt-1 text-[11.5px] text-warn">⚠ {e.conflicts.length} conflict recorded — confidence reduced</p>}
              </div>
            </button>
          </motion.li>
        )
      })}
    </ol>
  )
}
