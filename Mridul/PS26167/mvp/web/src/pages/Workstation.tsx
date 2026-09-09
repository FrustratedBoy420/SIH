/**
 * The workstation.
 *
 * Cleaned up from the earlier single-screen version. Three changes, all aimed
 * at the same problem — the first version put everything on screen at once and
 * read as clutter rather than density:
 *
 *   - Data and Evaluation moved out to their own pages. They were never part of
 *     an analysis session; they were reference material squeezed into a sidebar.
 *   - Scene metadata collapsed behind a summary line. The CRS and band count
 *     matter, but not enough to occupy a permanent column.
 *   - The honesty notice reduced to one line with an expander, instead of a
 *     paragraph across the top of every screen.
 *
 * What is left is the analysis loop: layers, the scene, the answer, the
 * evidence, the trace.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown, Download, Eye, EyeOff, Info, Loader2, RotateCcw, Send,
} from 'lucide-react'
import ModalityStack, { type LayerKey } from '@/components/ModalityStack'
import { Masthead } from '@/components/Shell'
import { Answer, Empty, Evidence, Panel, Trace } from '@/components/panels'
import { api, type QueryResult, type ScenePayload } from '@/lib/api'

const EXAMPLES: { q: string; mode: string; note?: string }[] = [
  { q: 'Use the optical and SAR images together to identify built-up regions', mode: 'optical_sar' },
  { q: 'Highlight the water body', mode: 'optical_sar' },
  { q: 'How many built-up areas are visible?', mode: 'optical_sar' },
  { q: 'What changed between these two dates?', mode: 'bi_temporal' },
  { q: 'What changed between these two dates?', mode: 'optical_sar', note: 'refuses' },
  { q: 'Highlight the unicorn', mode: 'optical_sar', note: 'abstains' },
]

const LAYER_KEYS: LayerKey[] = ['optical', 'fusion', 'sar']
// Labels are written out rather than produced by `capitalize`, which renders
// the SAR layer as "Sar".
const LAYER_META: Record<LayerKey, { tone: string; label: string; sub: string }> = {
  optical: { tone: 'var(--color-optical)', label: 'Optical', sub: 'Sentinel-2 · R,G,B,NIR' },
  fusion: { tone: 'var(--color-fusion)', label: 'Fusion', sub: 'derived overlay' },
  sar: { tone: 'var(--color-sar)', label: 'SAR', sub: 'Sentinel-1 · VV,VH' },
}

export default function Workstation() {
  const [separation, setSeparation] = useState(0.48)
  const [hidden, setHidden] = useState<Set<LayerKey>>(new Set())
  const [focus, setFocus] = useState<LayerKey | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [traceOpen, setTraceOpen] = useState(true)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('optical_sar')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scene, setScene] = useState<ScenePayload | null>(null)

  useEffect(() => {
    api.scene().then(setScene).catch(() => setError('backend unreachable'))
  }, [])

  const run = useCallback(async (q: string, m: string) => {
    if (!q.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const r = await api.query(q, m)
      setResult(r)
      setFocus(null)
      // Open the stack rather than close it. Evidence geometry is drawn on the
      // fusion plane, so a collapsed stack hides it behind the optical plane --
      // the header would announce "7 evidence boxes" with none on screen.
      if (!r.refused && r.evidence.passing > 0) setSeparation(0.62)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'query failed')
    } finally {
      setBusy(false)
    }
  }, [busy])

  const boxes = useMemo(
    () => result && !result.refused
      ? result.evidence.items
          .filter((i) => i.confidence >= result.evidence.threshold)
          .flatMap((i) => i.boxes)
      : [],
    [result],
  )

  const reset = () => {
    setSeparation(0.48); setFocus(null); setHidden(new Set())
    setResult(null); setQuery('')
  }

  const toggle = (k: LayerKey) => {
    const next = new Set(hidden)
    next.has(k) ? next.delete(k) : next.add(k)
    setHidden(next)
  }

  const exportGeoJSON = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.geojson, null, 2)],
      { type: 'application/geo+json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `satquery_${result.task || 'evidence'}.geojson`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <Masthead dense />

      <main className="grid min-h-0 grid-cols-[240px_1fr_340px]">

        {/* ───────────────────────── layers ───────────────────────── */}
        <aside className="min-h-0 overflow-y-auto border-r border-rule bg-abyss">
          <Panel title="Layers">
            <div className="flex flex-col gap-1.5">
              {LAYER_KEYS.map((k) => {
                const off = hidden.has(k)
                const isFocus = focus === k
                return (
                  <div
                    key={k}
                    className="flex items-center gap-2 border border-rule bg-surface px-2.5 py-2 transition-colors"
                    style={{
                      borderLeft: `3px solid ${LAYER_META[k].tone}`,
                      opacity: off ? 0.4 : 1,
                      background: isFocus
                        ? 'color-mix(in oklab, var(--color-sar) 8%, var(--color-surface))'
                        : undefined,
                    }}
                  >
                    <button
                      onClick={() => setFocus(isFocus ? null : k)}
                      className="min-w-0 flex-1 text-left"
                      title={isFocus ? 'release isolation' : 'isolate this layer'}
                    >
                      <span className="block text-[12.5px] font-medium">{LAYER_META[k].label}</span>
                      <span className="mono block text-[9.5px] text-ink-3">
                        {LAYER_META[k].sub}
                      </span>
                    </button>
                    <button onClick={() => toggle(k)} aria-label={`toggle ${k}`}>
                      {off
                        ? <EyeOff size={13} className="text-ink-3" />
                        : <Eye size={13} style={{ color: LAYER_META[k].tone }} />}
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="mono mt-2.5 text-[9.5px] leading-relaxed text-ink-3">
              {focus
                ? `isolating ${focus} — click the name again to release`
                : 'click a name to isolate it · the eye hides it'}
            </p>
          </Panel>

          {/* metadata behind a summary — it matters, but not permanently */}
          {scene && (
            <section className="border-b border-rule">
              <button
                onClick={() => setMetaOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
              >
                <span className="label">Scene</span>
                <span className="mono ml-auto text-[10px] text-ink-3">
                  {scene.optical.crs} · {scene.optical.gsd_m.toFixed(0)} m
                </span>
                <ChevronDown
                  size={12}
                  className="text-ink-3 transition-transform"
                  style={{ transform: metaOpen ? 'rotate(180deg)' : undefined }}
                />
              </button>
              {metaOpen && (
                <dl className="px-4 pb-4">
                  {[
                    ['acquired', scene.optical.acquired.slice(0, 16).replace('T', ' ')],
                    ['platform', String(scene.optical.platform ?? '—')],
                    ['bands', `${scene.optical.bands} optical + ${scene.sar.bands} SAR`],
                    ['cloud', `${scene.optical.cloud_pct ?? '—'} %`],
                    ['sar looks', String(scene.sar.looks ?? '—')],
                    ['centre', `${scene.optical.centre[0].toFixed(3)}N ${scene.optical.centre[1].toFixed(3)}E`],
                    ['extent', `${(scene.optical.bounds[2] - scene.optical.bounds[0]).toFixed(3)}°`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2 border-b border-rule/50 py-1 last:border-0">
                      <dt className="text-[11px] text-ink-3">{k}</dt>
                      <dd className="mono text-[11px]">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          <Panel title="Why two sensors">
            <p className="text-[11.5px] leading-relaxed text-ink-2">
              Cloud covers the north-east of the optical scene. Radar passes
              through it, and built structures return strongly from corner
              reflection — so SAR recovers what optical cannot see.
            </p>
            <p className="mt-2 text-[11.5px] text-nir">Pull the stack apart to compare.</p>
          </Panel>
        </aside>

        {/* ───────────────────────── the scene ───────────────────────── */}
        <section className="graticule relative min-h-0 bg-void">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="sweep absolute inset-y-0 w-1/3"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(53,224,232,0.03), transparent)' }}
            />
          </div>

          {scene ? (
            <ModalityStack
              separation={separation}
              layerUrl={api.layerUrl}
              hidden={hidden}
              focus={focus}
              onSelect={(k) => setFocus(focus === k ? null : k)}
              boxes={boxes}
              scene={scene.optical}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="mono text-[12px] text-ink-3">{error ?? 'loading scene…'}</p>
            </div>
          )}

          <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1">
            <span className="mono text-[10px] text-ink-3">drag to orbit · scroll to zoom</span>
            {boxes.length > 0 && (
              <span className="mono text-[10px] text-nir">
                {boxes.length} evidence {boxes.length === 1 ? 'box' : 'boxes'}
              </span>
            )}
          </div>

          {/* one-line disclosure, expandable — not a paragraph on every screen */}
          <div className="absolute right-4 top-3 max-w-[380px]">
            <button
              onClick={() => setNoteOpen((v) => !v)}
              className="mono ml-auto flex items-center gap-1.5 border border-[#4a3d18] bg-[#141005]/90 px-2 py-1 text-[10px] text-[#d9b26a] backdrop-blur"
            >
              <Info size={10} /> synthetic imagery
            </button>
            {noteOpen && (
              <p className="mt-1.5 border border-[#4a3d18] bg-[#141005]/95 p-2.5 text-[11px] leading-relaxed text-ink-2 backdrop-blur">
                Cartosat-2S and RISAT data cannot be obtained and the ISRO/SAC
                evaluation set is undisclosed, so the pixels are generated. They
                are real GeoTIFFs with a correct geotransform, and every algorithm
                here — Lee speckle filtering, multi-level Otsu, connected
                components, change vector analysis, co-registration, the router
                and the confidence gate — is a real implementation measured
                against ground truth it never sees.
              </p>
            )}
          </div>

          {/* the one place glass is permitted: floating over the scene */}
          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-4 border px-3.5 py-2"
            style={{
              background: 'rgba(8,14,16,0.55)',
              backdropFilter: 'blur(14px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
              borderColor: 'rgba(53,224,232,0.22)',
            }}
          >
            <span className="label">separation</span>
            <input
              type="range" min={0} max={100}
              value={Math.round(separation * 100)}
              onChange={(e) => setSeparation(Number(e.target.value) / 100)}
              className="w-36" aria-label="layer separation"
            />
            <button
              onClick={reset}
              className="flex items-center gap-1 border border-rule-2 px-2 py-1 text-[11px] text-ink-2 transition-colors hover:text-ink"
            >
              <RotateCcw size={11} /> reset
            </button>
          </div>
        </section>

        {/* ───────────────────────── results ───────────────────────── */}
        <aside className="min-h-0 overflow-y-auto border-l border-rule bg-abyss">
          {result ? <Answer r={result} /> : (
            <div className="border-b border-rule px-4 py-5">
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Ask a question below, or pick one of the examples. The answer,
                its evidence and the execution trace appear here.
              </p>
            </div>
          )}

          <Panel
            title="Evidence"
            count={result ? `${result.evidence.passing}/${result.evidence.count}` : undefined}
            right={result && !result.refused && result.geojson.features.length > 0 ? (
              <button
                onClick={exportGeoJSON}
                className="flex items-center gap-1 text-[10px] text-ink-3 transition-colors hover:text-sar"
              >
                <Download size={10} /> geojson
              </button>
            ) : undefined}
          >
            {result
              ? <Evidence items={result.evidence.items} threshold={result.evidence.threshold} />
              : <Empty>No evidence yet.</Empty>}
          </Panel>

          <Panel
            title="Execution trace"
            count={result?.trace.length}
            right={result ? (
              <button
                onClick={() => setTraceOpen((v) => !v)}
                className="text-[10px] text-ink-3 transition-colors hover:text-sar"
              >
                {traceOpen ? 'collapse' : 'expand'}
              </button>
            ) : undefined}
          >
            {traceOpen || !result
              ? <Trace steps={result?.trace ?? []} />
              : (
                <p className="mono text-[11px] text-ink-3">
                  {result.trace.length} steps ·{' '}
                  {result.trace.filter((s) => !s.ok).length} failed
                </p>
              )}
          </Panel>

          <div className="px-4 py-4">
            <Link to="/evaluation" className="text-[12px] text-sar transition-opacity hover:opacity-80">
              How accurate is this? →
            </Link>
          </div>
        </aside>
      </main>

      {/* ───────────────────────── query ───────────────────────── */}
      <footer className="border-t border-rule bg-abyss px-6 py-3">
        <div className="flex gap-2">
          <div className="flex overflow-hidden border border-rule">
            {['optical_sar', 'bi_temporal'].map((m) => (
              <button
                key={m} onClick={() => setMode(m)}
                className="mono px-3 py-2 text-[10px] transition-colors"
                style={{
                  background: mode === m
                    ? 'color-mix(in oklab, var(--color-sar) 14%, transparent)' : 'transparent',
                  color: mode === m ? 'var(--color-sar)' : 'var(--color-ink-3)',
                }}
              >
                {m === 'optical_sar' ? 'optical + SAR' : 'bi-temporal'}
              </button>
            ))}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run(query, mode)}
            placeholder="Ask about this imagery…"
            className="flex-1 border border-rule bg-surface px-3.5 py-2 text-[13.5px] outline-none placeholder:text-ink-3 focus:border-sar"
          />

          <button
            onClick={() => run(query, mode)}
            disabled={busy || !query.trim()}
            className="flex items-center gap-1.5 px-5 py-2 text-[13px] font-medium transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-sar)', color: 'var(--color-void)' }}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Analyse
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => { setQuery(ex.q); setMode(ex.mode); run(ex.q, ex.mode) }}
              className="border px-2 py-1 text-[10.5px] transition-colors"
              style={{
                borderColor: ex.note ? 'var(--color-nir-dim)' : 'var(--color-rule)',
                borderStyle: ex.note ? 'dashed' : 'solid',
                color: ex.note ? 'var(--color-nir)' : 'var(--color-ink-2)',
              }}
            >
              {ex.note && '⚠ '}{ex.q}
              {ex.note && <span className="ml-1 opacity-70">· {ex.note}</span>}
            </button>
          ))}
        </div>
      </footer>
    </div>
  )
}
