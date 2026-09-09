/**
 * Panel components.
 *
 * Every one of these renders something the problem statement asks for, and
 * nothing renders decoration:
 *
 *   Trace       §5.5 "an auditable execution summary containing the selected
 *               task, model/tool names, and key parameters" — and NOT chain of
 *               thought, which the statement says is neither required nor
 *               evaluated (ADR-008)
 *   Evidence    §Expected Solution "visual evidence, confidence information"
 *   Datasets    the four named public sources plus the hidden ISRO/SAC set,
 *               with their real local state
 *   Models      what is trained, what is frozen, what weights exist
 *   Registry    §5.5 "select one or more models or tools from a predefined
 *               registry"
 *   Evaluation  the A–E ablation that turns a demo into a result
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
    <section className="border-b border-rule">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="label">{title}</h2>
        {count !== undefined && (
          <span className="mono text-[10px] text-ink-3">{count}</span>
        )}
        <div className="ml-auto">{right}</div>
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-ink-3">{children}</p>
}

/* ------------------------------------------------------------------ trace */

export function Trace({ steps }: { steps?: TraceStep[] }) {
  const list = steps ?? []
  if (!list.length) return <Empty>Ask a question, or pick one below.</Empty>
  return (
    <ol className="flex flex-col">
      {list.map((s, i) => (
        <li
          key={i}
          className="rise grid grid-cols-[14px_1fr] gap-2 border-b border-rule/60 py-1.5 last:border-0"
          style={{ animationDelay: `${i * 45}ms` }}
        >
          <span className="pt-0.5">
            {s.ok
              ? <Check size={12} className="text-good" />
              : <X size={12} className="text-bad" />}
          </span>
          <div className="min-w-0">
            <div className="label text-[9.5px]">{s.step}</div>
            <div className="mono break-words text-[11px] text-ink">{s.detail}</div>
            {s.ms > 0 && (
              <div className="mono text-[9.5px] text-ink-3">+{s.ms.toFixed(0)} ms</div>
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
    <div className="flex items-center gap-2">
      <span className="label text-[9px]">conf</span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-rule">
        <div className="h-full rounded-full transition-[width] duration-500"
             style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="mono text-[10.5px]" style={{ color: tone }}>{value.toFixed(2)}</span>
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
          <div
            key={i}
            className="rise border border-rule bg-surface"
            style={{ borderLeft: `3px solid ${passing ? colour : 'var(--color-rule-2)'}`,
                     animationDelay: `${i * 55}ms`, opacity: passing ? 1 : 0.5 }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
            >
              <ChevronRight
                size={12}
                className="mt-1 shrink-0 text-ink-3 transition-transform"
                style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium leading-snug">{e.claim}</span>
                <span className="mono block text-[10.5px] text-ink-3">
                  {e.value !== null && `${e.value} ${e.unit}`.trim()}
                  {e.mask_area_ha > 0 && ` · ${e.mask_area_ha.toLocaleString()} ha`}
                </span>
              </span>
              <span className="label shrink-0 text-[9px]" style={{ color: colour }}>
                {e.modality}
              </span>
            </button>

            <div className="px-2.5 pb-2">
              <Confidence value={e.confidence} />
            </div>

            {isOpen && (
              <div className="border-t border-rule px-2.5 py-2">
                <p className="mono mb-1.5 text-[10.5px] leading-relaxed text-ink-2">
                  {e.method}
                </p>
                {e.supporting.map((s, k) => (
                  <p key={k} className="mono text-[10px] leading-relaxed text-ink-3">· {s}</p>
                ))}
                {e.conflicts.map((c, k) => (
                  <p key={k} className="mono mt-1.5 flex gap-1 text-[10px] leading-relaxed"
                     style={{ color: 'var(--color-warn)' }}>
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {c}
                  </p>
                ))}
                {e.boxes.length > 0 && (
                  <div className="mt-2 border-t border-rule pt-1.5">
                    <div className="label mb-1 text-[9px]">geometry · EPSG:4326</div>
                    {e.boxes.slice(0, 4).map((b, k) => (
                      <p key={k} className="mono text-[10px] text-ink-3">
                        {b.lat0.toFixed(4)}N {b.lon0.toFixed(4)}E · {b.area_ha.toFixed(2)} ha
                      </p>
                    ))}
                    {e.boxes.length > 4 && (
                      <p className="mono text-[10px] text-ink-3">
                        +{e.boxes.length - 4} more
                      </p>
                    )}
                  </div>
                )}
                <p className="mono mt-2 text-[9.5px] text-ink-3">
                  {e.source_model} v{e.source_version}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------------- answer */

export function Answer({ r }: { r: QueryResult }) {
  const tone = r.refused ? 'var(--color-nir)'
    : r.abstained ? 'var(--color-warn)' : 'var(--color-sar)'
  const Icon = r.refused ? Ban : r.abstained ? CircleDashed : Activity

  return (
    <div className="rise border-b border-rule px-4 py-3"
         style={{ background: `color-mix(in oklab, ${tone} 9%, var(--color-abyss))`,
                  borderLeft: `3px solid ${tone}` }}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={12} style={{ color: tone }} />
        <span className="label text-[9px]" style={{ color: tone }}>
          {r.refused ? 'refused — no model invoked'
            : r.abstained ? 'abstained — below confidence gate'
              : `${r.task} · ${r.tools.join(' → ')}`}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed">{r.answer}</p>
      <div className="mono mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-ink-3">
        <span>{r.elapsed_ms.toFixed(0)} ms</span>
        {!r.refused && <span>confidence {r.confidence.toFixed(2)}</span>}
        {!r.refused && <span>{r.geojson?.features?.length ?? 0} geo features</span>}
        <span>engine {r.engine}</span>
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
    <div className="flex flex-col gap-1.5">
      {items.map((d) => {
        const tone = STATUS_TONE[d.status]
        const isOpen = open === d.key
        return (
          <div key={d.key} className="border border-rule bg-surface"
               style={{ borderLeft: `3px solid ${tone}` }}>
            <button onClick={() => setOpen(isOpen ? null : d.key)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
              <Database size={12} style={{ color: tone }} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">{d.name}</span>
                <span className="mono block text-[10px] text-ink-3">{d.requirement}</span>
              </span>
              <span className="label shrink-0 text-[9px]" style={{ color: tone }}>
                {d.status}
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-rule px-2.5 py-2">
                <p className="text-[11.5px] leading-relaxed text-ink-2">{d.purpose}</p>
                <p className="mono mt-1.5 text-[10px] text-ink-3">{d.records}</p>
                <p className="mono text-[10px] text-ink-3">size · {d.size}</p>
                {d.huggingface && (
                  <p className="mono mt-1 text-[10px]" style={{ color: 'var(--color-sar)' }}>
                    hf: {d.huggingface}
                  </p>
                )}
                {d.split_policy && (
                  <p className="mono mt-1 text-[10px] text-ink-3">split · {d.split_policy}</p>
                )}
                {d.notes && (
                  <p className="mt-1.5 border-t border-rule pt-1.5 text-[11px] leading-relaxed"
                     style={{ color: 'var(--color-warn)' }}>{d.notes}</p>
                )}
                <p className="mono mt-1.5 text-[9.5px] text-ink-3">
                  serves · {d.serves.join(', ') || '—'}
                </p>
              </div>
            )}
          </div>
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
  'rule-based': 'var(--color-sar)',
}

export function Models({ items }: { items: ModelEntry[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((m) => {
        const tone = MODEL_TONE[m.status] ?? 'var(--color-ink-3)'
        return (
          <div key={m.id} className="border border-rule bg-surface px-2.5 py-2"
               style={{ borderLeft: `3px solid ${tone}` }}>
            <div className="flex items-center gap-2">
              <Cpu size={12} style={{ color: tone }} className="shrink-0" />
              <span className="mono text-[10px] text-ink-3">{m.id}</span>
              <span className="flex-1 text-[12.5px] font-medium">{m.name}</span>
              <span className="label text-[9px]" style={{ color: tone }}>{m.status}</span>
            </div>
            {m.requirement && (
              <p className="mono mt-1 text-[10px] text-ink-3">{m.requirement}</p>
            )}
            <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{m.note}</p>
            {m.adapter && (
              <p className="mono mt-1 text-[9.5px] text-ink-3">adapter · {m.adapter}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------- registry */

export function Registry({ tools }: { tools: Record<string, Record<string, unknown>> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {Object.entries(tools).map(([name, spec]) => (
        <div key={name} className="border border-rule bg-surface px-2.5 py-2">
          <div className="flex items-center gap-2">
            <Layers size={12} className="shrink-0 text-sar" />
            <span className="mono flex-1 text-[12px]">{name}</span>
            <span className="mono text-[9.5px] text-ink-3">
              needs {String(spec.requires)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
            {String(spec.description)}
          </p>
          <p className="mono mt-1 text-[9.5px] text-ink-3">
            adapter · {String(spec.adapter)} — params · {Object.keys(spec.params as object).join(', ')}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ evaluation */

export function Ablation({ rows }: { rows: AblationRow[] }) {
  const max = Math.max(...rows.map((r) => r.capability), 0.0001)
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.config} className="border border-rule bg-surface px-2.5 py-1.5">
          <div className="flex items-baseline gap-2">
            <span className="mono w-4 shrink-0 text-[11px] text-sar">{r.config}</span>
            <span className="flex-1 text-[11.5px] leading-tight">{r.name}</span>
            <span className="mono text-[11px]">{r.capability.toFixed(3)}</span>
          </div>
          <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full transition-[width] duration-700"
                 style={{ width: `${(r.capability / max) * 100}%`,
                          background: r.config === 'E' ? 'var(--color-nir)' : 'var(--color-sar)' }} />
          </div>
          <div className="mono mt-1 flex flex-wrap gap-x-2.5 text-[9.5px] text-ink-3">
            <span>seg F1 {r.mean_f1.toFixed(3)}</span>
            {r.router_accuracy !== null && <span>router {r.router_accuracy.toFixed(2)}</span>}
            {r.recovered_under_cloud_pct !== null &&
              <span style={{ color: 'var(--color-nir)' }}>
                x-modal {r.recovered_under_cloud_pct.toFixed(0)}%
              </span>}
            <span>Δ {r.delta_vs_A >= 0 ? '+' : ''}{r.delta_vs_A.toFixed(3)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Metrics({ e }: { e: Evaluation }) {
  return (
    <div className="flex flex-col gap-1">
      {e.tasks.map((t) => (
        <div key={t.task} className="flex items-baseline gap-2 border-b border-rule/60 py-1 last:border-0">
          <span className="flex-1 text-[11.5px]">{t.task}</span>
          <span className="label text-[9px]">{t.metric}</span>
          <span className="mono w-14 text-right text-[11.5px]"
                style={{ color: t.value >= 0.85 ? 'var(--color-good)'
                  : t.value >= 0.6 ? 'var(--color-warn)' : 'var(--color-bad)' }}>
            {t.value.toFixed(4)}
          </span>
        </div>
      ))}
      <div className="flex items-baseline gap-2 pt-1">
        <span className="flex-1 text-[11.5px]">calibration error</span>
        <span className="label text-[9px]">ECE</span>
        <span className="mono w-14 text-right text-[11.5px]">{e.calibration.ece.toFixed(4)}</span>
      </div>
    </div>
  )
}
