/**
 * Datasets and models with their ACTUAL local state (UI-08, US-9). The four
 * public datasets and the hidden ISRO/SAC set; M0–M6 with weight status; the
 * registry the router selects from. Where the state came from is stated.
 */

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DatasetEntry, ModelEntry } from '@/lib/contract'
import { cn } from '@/lib/utils'

const STATUS: Record<string, { cls: string; text: string }> = {
  complete: { cls: 'border-good text-good', text: 'complete · staged locally' },
  partial: { cls: 'border-warn text-warn', text: 'partial · some files staged' },
  absent: { cls: 'border-ink-3 text-ink-2', text: 'absent · not staged' },
  unavailable: { cls: 'border-ink text-ink', text: 'unavailable · not public' },
  serving: { cls: 'border-good text-good', text: 'serving' },
  loaded: { cls: 'border-warn text-warn', text: 'loaded · not serving yet' },
  trained: { cls: 'border-ink text-ink', text: 'trained · weights not staged here' },
  'not trained': { cls: 'border-warn text-warn', text: 'not trained · no weights' },
  frozen: { cls: 'border-ink-3 text-ink-2', text: 'frozen · not trained by design' },
  'rule-based': { cls: 'border-ink-3 text-ink-2', text: 'rule-based stand-in' },
}

const Chip = ({ s }: { s: string }) => <span className={cn('mono inline-block border px-1.5 py-0.5 text-[11px]', STATUS[s]?.cls)}>{STATUS[s]?.text ?? s}</span>

function DatasetRow({ d, i }: { d: DatasetEntry; i: number }) {
  return (
    <article className="frame grid gap-6 bg-surface p-6 sm:p-8 lg:grid-cols-[56px_minmax(0,4fr)_minmax(0,5fr)]" data-testid="dataset-row">
      <p className="grid size-10 place-items-center bg-sun font-display text-[18px] font-bold">{i + 1}</p>
      <div>
        <p className="label">{d.role}{d.role === 'hidden' ? ' · final scoring' : ''}</p>
        <h3 className="t-display mt-1 text-[clamp(26px,2.8vw,38px)]">{d.name}</h3>
        <div className="mt-3 flex flex-wrap gap-2"><Chip s={d.status} /><span className="mono border border-rule px-1.5 py-0.5 text-[11px]">{d.requirement}</span></div>
        <p className="mt-4 text-[15px] leading-[1.55] text-ink-2">{d.purpose}</p>
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 self-start text-[13px]">
        <dt className="text-ink-2">Records</dt><dd className="mono">{d.records}</dd>
        <dt className="text-ink-2">Size</dt><dd className="mono">{d.size}</dd>
        <dt className="text-ink-2">Split</dt><dd>{d.split_policy}</dd>
        <dt className="text-ink-2">Serves</dt><dd className="mono">{d.serves.join(' · ')}</dd>
        <dt className="text-ink-2">Licence</dt><dd>{d.licence}</dd>
        <dt className="text-ink-2">Source</dt><dd className="mono break-all">{d.source.startsWith('http') ? <a className="text-accent underline-offset-2 hover:underline" href={d.source} target="_blank" rel="noreferrer">{d.source}</a> : d.source}{d.huggingface ? <><br />hf: {d.huggingface}</> : null}{d.paper ? <><br />{d.paper}</> : null}</dd>
        {(d.present.length > 0 || d.missing.length > 0) && (
          <>
            <dt className="text-ink-2">Local files</dt>
            <dd className="mono text-[12px]">
              {d.path && <span className="text-ink-2">{d.path}/<br /></span>}
              {d.present.map((f) => <span key={f} className="block text-good">✓ {f}</span>)}
              {d.missing.map((f) => <span key={f} className="block text-ink-2">✕ {f}</span>)}
            </dd>
          </>
        )}
        {d.notes && <><dt className="text-ink-2">Note</dt><dd className="text-ink-2">{d.notes}</dd></>}
      </dl>
    </article>
  )
}

function ModelRow({ m }: { m: ModelEntry }) {
  return (
    <tr className="border-b border-rule align-top" data-testid="model-row">
      <td className="t-display py-4 pr-4 text-[26px]">{m.id}</td>
      <td className="py-4 pr-4"><p className="text-[15px] font-semibold">{m.name}</p><p className="mono text-[11.5px] text-ink-2">{m.kind}{m.requirement ? ` · ${m.requirement}` : ''}</p></td>
      <td className="py-4 pr-4"><Chip s={m.status} />{m.weights_path && <p className="mono mt-1 text-[11px] text-ink-2">{m.weights_path}</p>}</td>
      <td className="mono py-4 pr-4 text-[12px]">{m.adapter ?? '—'}<br /><span className="text-ink-2">{m.datasets.join(', ') || '—'}</span></td>
      <td className="py-4 text-[13px] text-ink-2">{m.note}{m.candidates && <span className="mono mt-1 block text-[11.5px]">candidates: {m.candidates.join(' · ')}</span>}</td>
    </tr>
  )
}

export default function DataModels() {
  const { data: cat } = useQuery({ queryKey: ['catalog'], queryFn: api.catalog })
  const { data: reg } = useQuery({ queryKey: ['registry'], queryFn: api.registry })
  const adapters = cat?.models.filter((m) => m.adapter) ?? []
  // "Serving now" is claimed only for what answers queries. A pack that is
  // trained or loaded is counted as a pack, never as serving — counting
  // `loaded` here once put "M1 adapted" over answers the classical path gave.
  const packs = adapters.filter((m) => ['serving', 'loaded', 'trained'].includes(m.status))
  const serving = adapters.filter((m) => m.status === 'serving')

  return (
    <div className="px-5 pb-24 pt-14 sm:px-8" data-testid="data-page">
      <p className="label">Data & models · UI-08</p>
      <h1 className="t-hero mt-4 max-w-[900px]">What it is built on</h1>
      <p className="frame mt-8 max-w-[760px] bg-surface px-4 py-3 text-[14.5px]" data-testid="state-source">
        <span className="label mr-2 !text-ink">Local state</span>{cat?.state_source ?? 'reading…'}
      </p>

      <div className="frame mt-14 grid gap-px bg-ink sm:grid-cols-2 lg:grid-cols-4">
        {[
          { v: 464044, label: 'BigEarthNet.txt — co-registered S1/S2 image pairs' },
          { v: 9.6, d: 1, pre: '~', suf: ' M', label: 'BigEarthNet.txt — text annotations (not images)' },
          { v: 123221, label: 'VRSBench — VQA pairs; trains and tests M1' },
          { v: 2968, label: 'CDVQA — bi-temporal pairs for change VQA' },
        ].map((x) => (
          <div key={x.label} className="bg-surface p-6">
            {/* Static on purpose: these are catalogue facts, not measurements
                arriving, and a count-up shows wrong figures mid-flight (DAT-01). */}
            <p className="t-display text-[clamp(36px,4vw,60px)]">{x.pre}{x.v.toLocaleString('en-US', { minimumFractionDigits: x.d ?? 0 })}{x.suf}</p>
            <p className="mt-2 text-[13px] text-ink-2">{x.label}</p>
          </div>
        ))}
      </div>

      <section className="mt-20" aria-labelledby="ds-h">
        <h2 id="ds-h" className="t-section">Datasets</h2>
        <p className="mt-3 max-w-[700px] text-ink-2">The four public datasets the problem statement names, and the undisclosed set it is scored on. Official splits are used unmodified; anything self-built is split geographically at tile level, never randomly.</p>
        <div className="mt-8 space-y-5">{cat?.datasets.map((d, i) => <DatasetRow key={d.key} d={d} i={i} />)}</div>
      </section>

      <section className="mt-20" aria-labelledby="m-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="m-h" className="t-section">Models</h2>
          <p className="mono text-[13px]" data-testid="serving-now">serving now: {serving.length ? `${serving.map((m) => m.id).join(', ')} adapted` : 'the classical path, for all four tools'} · adapter packs {packs.length}/{adapters.length}</p>
        </div>
        <p className="mt-3 max-w-[760px] text-ink-2">One frozen base, swappable LoRA adapters, a separate SAR encoder. Status is what is on disk, not what is planned. An adapter reads “trained” when a measured pack exists, “loaded” when its weights are on this machine, and “serving” only when something can run them — the three were once collapsed, and a loaded pack was claimed as serving.</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead><tr className="border-b border-ink">{['', 'Component', 'State', 'Adapter · data', 'Note'].map((h) => <th key={h} className="label py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{cat?.models.map((m) => <ModelRow key={m.id} m={m} />)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="r-h">
        <h2 id="r-h" className="t-section">The registry</h2>
        <p className="mt-3 max-w-[700px] text-ink-2">The only tools the router may select, and the only parameter it may set. A tool without a row here cannot run (CON-02).</p>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
            <thead><tr className="border-b border-ink">{['Tool', 'Task', 'Requires', 'Accepts', 'Outputs', 'Adapter', 'Permitted'].map((h) => <th key={h} className="label py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {Object.entries(reg ?? {}).map(([name, t]) => (
                <tr key={name} className="border-b border-rule">
                  <td className="mono py-2.5 font-medium">{name}</td><td className="mono">{t.tasks.join(', ')}</td><td className="mono">{t.requires}</td>
                  <td className="mono">{t.accepts.join(', ')}</td><td className="mono">{t.outputs.join(', ')}</td><td className="mono text-ink-2">{t.adapter}</td>
                  <td className="mono">{Object.entries(t.params).map(([k, [lo, hi, d]]) => `${k} ∈ [${lo}, ${hi}] · default ${d}`).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
