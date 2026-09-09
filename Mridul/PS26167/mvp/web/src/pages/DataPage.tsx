/**
 * Data & models.
 *
 * Previously this lived in a 340 px sidebar tab, where a dataset card with a
 * licence, a split policy and a caveat had about four lines to say it in. It is
 * reference material, not part of an analysis session, so it belongs on its own
 * page — which also makes §5.1's honest gap (the adapters are not trained)
 * legible instead of buried.
 */

import { useEffect, useState } from 'react'
import { Page } from '@/components/Shell'
import { Datasets, Models, Registry } from '@/components/panels'
import {
  api, type DatasetEntry, type ModelEntry,
} from '@/lib/api'

type Registries = Record<string, Record<string, unknown>>

export default function DataPage() {
  const [datasets, setDatasets] = useState<DatasetEntry[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [models, setModels] = useState<ModelEntry[]>([])
  const [tools, setTools] = useState<Registries>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.datasets(), api.models(), api.registry()])
      .then(([d, m, r]) => {
        setDatasets(d.datasets); setCounts(d.counts)
        setModels(m.models); setTools(r.tools)
      })
      .catch(() => setError('backend unreachable — start `python -m satquery.cli serve`'))
  }, [])

  const trained = models.filter((m) => m.trained).length

  return (
    <Page
      title="Data and models"
      lede="Every dataset the system is specified against, with its real state on
            this machine — not a diagram of what a fully-resourced version would
            hold. The same applies to the model registry: what is frozen, what is
            rule-based, and what has no weights yet."
    >
      {error && (
        <p className="mono border border-[#5c2318] bg-[#170a08] px-3 py-2 text-[12px] text-nir">
          {error}
        </p>
      )}

      {/* headline counts */}
      <div className="grid grid-cols-2 gap-px border border-rule bg-rule md:grid-cols-4">
        {[
          ['datasets specified', String(datasets.length)],
          ['locally complete', String(counts.complete ?? 0)],
          ['model components', String(models.length)],
          ['adapters trained', `${trained} / ${models.filter((m) => m.adapter).length}`],
        ].map(([k, v]) => (
          <div key={k} className="bg-abyss px-4 py-4">
            <div
              className="mono text-[24px] leading-none"
              style={{ color: 'var(--color-sar)' }}
            >
              {v}
            </div>
            <div className="label mt-2">{k}</div>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.25fr_1fr]">
        <section>
          <h2 className="text-[19px] font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}>
            Datasets
          </h2>
          <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-ink-2">
            Four public sources plus the ISRO/SAC evaluation set, which is
            undisclosed by design. Status is read from disk at request time —
            <span className="text-nir"> unavailable</span> means the data cannot
            be obtained at all, not that it has yet to be downloaded.
          </p>
          <div className="mt-4">
            <Datasets items={datasets} />
          </div>
        </section>

        <section>
          <h2 className="text-[19px] font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}>
            Model components
          </h2>
          <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-ink-2">
            One frozen base with swappable LoRA adapters — ADR-003. The adapters
            for M1 to M3 are specified and wired but carry no weights; the
            execution trace reports them as absent rather than silently
            substituting a heuristic.
          </p>
          <div className="mt-4">
            <Models items={models} />
          </div>
        </section>
      </div>

      <section className="mt-12">
        <h2 className="text-[19px] font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}>
          Tool registry
        </h2>
        <p className="mt-1.5 max-w-[72ch] text-[13px] leading-relaxed text-ink-2">
          §5.5 requires the agent to select from a <em>predefined</em> registry.
          This is that registry. The router may choose a tool and set the one
          permitted parameter; it cannot invent a tool, and a tool whose input
          requirement is unmet causes a refusal rather than a substitution.
        </p>
        <div className="mt-4 max-w-[80ch]">
          <Registry tools={tools} />
        </div>
      </section>
    </Page>
  )
}
