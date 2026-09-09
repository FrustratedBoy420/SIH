/**
 * Panel components.
 *
 * Every one of these renders something the problem statement asks for, and
 * nothing renders decoration:
 *
 *   Trace       §5.5 "an auditable execution summary containing the selected
 *               task, model/tool names, and key parameters" -- and NOT chain of
 *               thought, which the statement says is neither required nor
 *               evaluated (ADR-008)
 *   Evidence    §Expected Solution "visual evidence, confidence information"
 *   Datasets    the four named public sources plus the hidden ISRO/SAC set,
 *               with their real local state
 *   Models      what is trained, what is frozen, what weights exist
 *   Registry    §5.5 "select one or more models or tools from a predefined
 *               registry"
 *   Evaluation  the A-E ablation that turns a demo into a result
 *
 * REVISION 2 -- visual. Previously every card in every list carried a 3 px
 * coloured bar down its left edge. With four modality hues and four status
 * hues in play, a screen of cards became a barcode: because everything was
 * emphasised, nothing was. Identity is now a 6 px dot next to the title, the
 * card itself is neutral, and the only cards that take a tint are the ones
 * that genuinely need one -- a refusal, a conflict, a failed step.
 */

import { useState, type ReactNode } from 'react'
import {
  AlertTriangle, Check, ChevronRight, CircleDashed, Database, Layers,
  Ban, Cpu, Activity, X,
} from 'lucide-react'
import type {
  AblationRow, DatasetEntry, EvidenceItem, Evaluation, ModelEntry,
  QueryResult, TraceStep,
} from '@/lib/api'
import { modalityColour } from '@/lib/api'

/* ------------------------------------------------------------------ shell */

export function Panel({ title, count, children, right }: {
  title: string; count?: number | string; children: ReactNode; right?: ReactNode
}) {
  return (
    <section className="border-b border-rule px-5 py-4">
      <header className="mb-3 flex items-center gap-2.5">
        <h2 className="label">{title}</h2>
        {count !== undefined && (
          <span className="mono rounded-pill bg-surface px-2 py-0.5 text-[10.5px] text-ink-3">
            {count}
          </span>
        )}
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-ink-3">{children}</p>
}

/** The card every list item is built from. Neutral by default, by design. */
function Card({ children, tint, className = '' }: {
  children: ReactNode; tint?: string; className?: string
}) {
  return (
    <div
      className={`rounded-card border border-rule bg-surface transition-colors ${className}`}
      style={tint ? {
        borderColor: `color-mix(in oklab, ${tint} 34%, var(--color-rule))`,
        background: `color-mix(in oklab, ${tint} 7%, var(--color-surface))`,
      } : undefined}
    >
      {children}
    </div>
  )
}

function Dot({ tone }: { tone: string }) {
  return <span className="dot" style={{ background: tone }} />
}

/* ------------------------------------------------------------------ trace */

export function Trace({ steps }: { steps?: TraceStep[] }) {
  const list = steps ?? []
  if (!list.length) return <Empty>Ask a question, or pick one below.</Empty>
  return (
    <ol className="flex flex-col gap-0.5">
      {list.map((s, i) => (
        <li
          key={i}
          className="rise grid grid-cols-[16px_1fr] gap-2.5 rounded-control px-2 py-2 transition-colors hover:bg-surface"
          style={{ animationDelay: `${i * 40}ms` }}
        >
          <span className="pt-[3px]">
            {s.ok
              ? <Check size={13} className="text-good" />
              : <X size={13} className="text-bad" />}
          </span>
          <div className="min-w-0">
            <div className="label text-[9.5px]">{s.step}</div>
            <div className="mono mt-0.5 break-words text-[11.5px] leading-relaxed text-ink">
              {s.detail}
            </div>
            {s.ms > 0 && (
              <div className="mono mt-0.5 text-[10px] text-ink-3">+{s.ms.toFixed(0)} ms</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

/* --------------------------------------------------------------- evidence */

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const tone = value >= 0.8 ? 'var(--color-good)'
    : value >= 0.55 ? 'var(--color-warn)' : 'var(--color-bad)'
  return (
    <div className="flex items-center gap-2.5">
      <span className="label text-[9px]">conf</span>
      <div className="h-[4px] flex-1 overflow-hidden rounded-pill bg-rule-2">
        <div className="h-full rounded-pill transition-[width] duration-500"
             style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="mono text-[11px]" style={{ color: tone }}>{value.toFixed(2)}</span>
    </div>
  )
}

export function Evidence({ items, threshold }: { items?: EvidenceItem[]; threshold?: number }) {
  const [open, setOpen] = useState<number | null>(0)
  // Defensive: the server guarantees this shape, but a component that unmounts
  // the whole app because one field arrived undefined is a bad trade.
  const list = items ?? []
  const gate = threshold ?? 0.45
  if (!list.length) return <Empty>No evidence yet.</Empty>

  return (
    <div className="flex flex-col gap-2">
      {list.map((e, i) => {
        const passing = e.confidence >= gate
        const colour = modalityColour[e.modality] ?? 'var(--color-ink-2)'
        const isOpen = open === i
        return (
          <div key={i} className="rise" style={{ animationDelay: `${i * 45}ms` }}>
            <Card className={passing ? '' : 'opacity-55'}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left"
              >
                <ChevronRight
                  size={13}
                  className="mt-[3px] shrink-0 text-ink-3 transition-transform"
                  style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <Dot tone={colour} />
                    <span className="text-[13px] font-medium leading-snug">{e.claim}</span>
                  </span>
                  <span className="mono mt-1 block pl-[14px] text-[11px] text-ink-3">
                    {e.value !== null && `${e.value} ${e.unit}`.trim()}
                    {e.mask_area_ha > 0 && ` · ${e.mask_area_ha.toLocaleString()} ha`}
                  </span>
                </span>
                <span className="label shrink-0 text-[9px]" style={{ color: colour }}>
                  {e.modality}
                </span>
              </button>

              <div className="px-3.5 pb-3">
                <Confidence value={e.confidence} />
              </div>

              {isOpen && (
                <div className="border-t border-rule px-3.5 py-3">
                  <p className="mono mb-2 text-[11px] leading-relaxed text-ink-2">{e.method}</p>
                  {e.supporting.map((s, k) => (
                    <p key={k} className="mono text-[10.5px] leading-relaxed text-ink-3">· {s}</p>
                  ))}
                  {e.conflicts.map((c, k) => (
                    <p key={k}
                       className="mono mt-2 flex gap-1.5 rounded-control px-2 py-1.5 text-[10.5px] leading-relaxed"
                       style={{ color: 'var(--color-warn)',
                                background: 'color-mix(in oklab, var(--color-warn) 10%, transparent)' }}>
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {c}
                    </p>
                  ))}
                  {e.boxes.length > 0 && (
                    <div className="mt-3 border-t border-rule pt-2">
                      <div className="label mb-1.5 text-[9px]">geometry · EPSG:4326</div>
                      {e.boxes.slice(0, 4).map((b, k) => (
                        <p key={k} className="mono text-[10.5px] leading-relaxed text-ink-3">
                          {b.lat0.toFixed(4)}N {b.lon0.toFixed(4)}E · {b.area_ha.toFixed(2)} ha
                        </p>
                      ))}
                      {e.boxes.length > 4 && (
                        <p className="mono text-[10.5px] text-ink-3">+{e.boxes.length - 4} more</p>
                      )}
                    </div>
                  )}
                  <p className="mono mt-3 text-[10px] text-ink-3">
                    {e.source_model} v{e.source_version}
                  </p>
                </div>
              )}
            </Card>
          </div>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- answer */

export function Answer({ r }: { r: QueryResult }) {
  const tone = r.refused ? 'var(--color-nir)'
    : r.abstained ? 'var(--color-warn)' : 'var(--color-accent)'
  const Icon = r.refused ? Ban : r.abstained ? CircleDashed : Activity

  return (
    <div className="border-b border-rule px-5 py-4">
      <div className="rise rounded-card border p-4"
           style={{ background: `color-mix(in oklab, ${tone} 8%, var(--color-surface))`,
                    borderColor: `color-mix(in oklab, ${tone} 30%, var(--color-rule))` }}>
        <div className="mb-2 flex items-center gap-2">
          <Icon size={13} style={{ color: tone }} />
          <span className="label text-[9px]" style={{ color: tone }}>
            {r.refused ? 'refused — no model invoked'
              : r.abstained ? 'abstained — below confidence gate'
                : `${r.task} · ${r.tools.join(' → ')}`}
          </span>
        </div>
        <p className="text-[13.5px] leading-relaxed">{r.answer}</p>
        <div className="mono mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-rule pt-2.5 text-[10px] text-ink-3">
          <span>{r.elapsed_ms.toFixed(0)} ms</span>
          {!r.refused && <span>confidence {r.confidence.toFixed(2)}</span>}
          {!r.refused && <span>{r.geojson?.features?.length ?? 0} geo features</span>}
          <span>engine {r.engine}</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- datasets */

const STATUS_TONE: Record<string, string> = {
  complete: 'var(--color-good)',
  partial: 'var(--color-warn)',
  absent: 'var(--color-ink-3)',
  unavailable: 'var(--color-nir)',
}

export function Datasets({ items }: { items: DatasetEntry[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {items.map((d) => {
        const tone = STATUS_TONE[d.status]
        const isOpen = open === d.key
        return (
          <Card key={d.key}>
            <button onClick={() => setOpen(isOpen ? null : d.key)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <Database size={15} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{d.name}</span>
                <span className="mono mt-0.5 block text-[10.5px] text-ink-3">{d.requirement}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-pill border border-rule-2 px-2.5 py-1">
                <Dot tone={tone} />
                <span className="label text-[9px]" style={{ color: tone }}>{d.status}</span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-rule px-4 py-3">
                <p className="text-[12.5px] leading-relaxed text-ink-2">{d.purpose}</p>
                <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-3">
                  <span>{d.records}</span>
                  <span>size · {d.size}</span>
                  {d.split_policy && <span>split · {d.split_policy}</span>}
                </div>
                {d.huggingface && (
                  <p className="mono mt-2 text-[10.5px]" style={{ color: 'var(--color-accent)' }}>
                    hf: {d.huggingface}
                  </p>
                )}
                {d.notes && (
                  <p className="mt-2.5 rounded-control px-2.5 py-2 text-[12px] leading-relaxed"
                     style={{ color: 'var(--color-warn)',
                              background: 'color-mix(in oklab, var(--color-warn) 9%, transparent)' }}>
                    {d.notes}
                  </p>
                )}
                <p className="mono mt-2.5 text-[10px] text-ink-3">
                  serves · {d.serves.join(', ') || '—'}
                </p>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- models */

const MODEL_TONE: Record<string, string> = {
  loaded: 'var(--color-good)',
  'not trained': 'var(--color-warn)',
  frozen: 'var(--color-ink-3)',
  'rule-based': 'var(--color-accent)',
}

export function Models({ items }: { items: ModelEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((m) => {
        const tone = MODEL_TONE[m.status] ?? 'var(--color-ink-3)'
        return (
          <Card key={m.id} className="px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <Cpu size={14} className="shrink-0 text-ink-3" />
              <span className="mono rounded-pill bg-raised px-1.5 py-0.5 text-[10px] text-ink-3">
                {m.id}
              </span>
              <span className="flex-1 text-[13.5px] font-medium">{m.name}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Dot tone={tone} />
                <span className="label text-[9px]" style={{ color: tone }}>{m.status}</span>
              </span>
            </div>
            {m.requirement && (
              <p className="mono mt-1.5 text-[10.5px] text-ink-3">{m.requirement}</p>
            )}
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{m.note}</p>
            {m.adapter && (
              <p className="mono mt-1.5 text-[10px] text-ink-3">adapter · {m.adapter}</p>
            )}
          </Card>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------- registry */

export function Registry({ tools }: { tools: Record<string, Record<string, unknown>> }) {
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(tools).map(([name, spec]) => (
        <Card key={name} className="px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <Layers size={14} className="shrink-0 text-ink-3" />
            <span className="mono flex-1 text-[12.5px] text-ink">{name}</span>
            <span className="mono rounded-pill border border-rule-2 px-2 py-0.5 text-[10px] text-ink-3">
              needs {String(spec.requires)}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            {String(spec.description)}
          </p>
          <p className="mono mt-1.5 text-[10px] text-ink-3">
            adapter · {String(spec.adapter)} — params · {Object.keys(spec.params as object).join(', ')}
          </p>
        </Card>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ evaluation */

export function Ablation({ rows }: { rows: AblationRow[] }) {
  const max = Math.max(...rows.map((r) => r.capability), 0.0001)
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const best = r.config === 'E'
        return (
          <Card key={r.config} className="px-4 py-3" tint={best ? 'var(--color-accent)' : undefined}>
            <div className="flex items-baseline gap-2.5">
              <span className="mono w-4 shrink-0 text-[12px]"
                    style={{ color: best ? 'var(--color-accent)' : 'var(--color-ink-3)' }}>
                {r.config}
              </span>
              <span className="flex-1 text-[12.5px] leading-tight">{r.name}</span>
              <span className="mono text-[13px] font-medium">{r.capability.toFixed(3)}</span>
            </div>
            <div className="mt-2 h-[4px] w-full overflow-hidden rounded-pill bg-rule-2">
              <div className="h-full rounded-pill transition-[width] duration-700"
                   style={{ width: `${(r.capability / max) * 100}%`,
                            background: best ? 'var(--color-accent)' : 'var(--color-ink-3)' }} />
            </div>
            <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-ink-3">
              <span>seg F1 {r.mean_f1.toFixed(3)}</span>
              {r.router_accuracy !== null && <span>router {r.router_accuracy.toFixed(2)}</span>}
              {r.recovered_under_cloud_pct !== null &&
                <span>x-modal {r.recovered_under_cloud_pct.toFixed(0)}%</span>}
              <span>Δ {r.delta_vs_A >= 0 ? '+' : ''}{r.delta_vs_A.toFixed(3)}</span>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export function Metrics({ e }: { e: Evaluation }) {
  const rows: [string, string, number][] = [
    ...e.tasks.map((t) => [t.task, t.metric, t.value] as [string, string, number]),
    ['calibration error', 'ECE', e.calibration.ece],
  ]
  return (
    <div className="flex flex-col">
      {rows.map(([task, metric, value], i) => (
        <div key={task}
             className="flex items-baseline gap-3 border-b border-rule py-2.5 last:border-0">
          <span className="flex-1 text-[13px]">{task}</span>
          <span className="mono rounded-pill bg-raised px-2 py-0.5 text-[9.5px] uppercase tracking-wider text-ink-3">
            {metric}
          </span>
          <span className="mono w-16 text-right text-[13px]"
                style={{ color: i === rows.length - 1 ? 'var(--color-ink)'
                  : value >= 0.85 ? 'var(--color-good)'
                    : value >= 0.6 ? 'var(--color-warn)' : 'var(--color-bad)' }}>
            {value.toFixed(4)}
          </span>
        </div>
      ))}
    </div>
  )
}
