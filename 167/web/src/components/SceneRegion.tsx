/**
 * The scene — the largest region (UI-02). Three views of the same inputs:
 *
 *   Plate    the map: one plate, graticule, evidence overlays (OUT-04)
 *   Stack    optical / fusion / SAR as separable planes (UI-06)
 *   Compare  drag between two sensors, or two dates
 */

import { lazy, Suspense, useMemo, useState } from 'react'
import type { LoadedRaster } from '@/lib/api'
import type { EvidenceItem, Role } from '@/lib/contract'
import { ROLE_LABEL } from '@/lib/format'
import { hasWebGL } from '@/lib/hooks'
import { useStation, type View } from '@/lib/store'
import { cn } from '@/lib/utils'
import ErrorBoundary from './ErrorBoundary'
import PlateViewer, { OverlayLegend, type PlateGeo } from './PlateViewer'
import StackFallback from './StackFallback'
import { ImageComparison, ImageComparisonImage, ImageComparisonSlider } from './ui/ImageComparison'

const ModalityStack = lazy(() => import('./ModalityStack'))

const VIEWS: { key: View; label: string }[] = [
  { key: 'map', label: 'Plate' },
  { key: 'stack', label: 'Stack · 3D' },
  { key: 'compare', label: 'Compare' },
]

export interface LayerOption { value: string; label: string; src: string; geo: PlateGeo }

export function layerOptions(inputs: Partial<Record<Role, LoadedRaster>>, derived: { fusion?: string; change?: string }): LayerOption[] {
  const geo = (r: LoadedRaster): PlateGeo => ({ width: r.summary.width, height: r.summary.height, bounds: r.summary.bounds, georeferenced: r.summary.georeferenced, gsd_m: r.summary.gsd_m })
  const out: LayerOption[] = []
  for (const role of ['optical', 'sar', 't1', 't2'] as Role[]) {
    const r = inputs[role]
    if (!r) continue
    out.push({ value: `${role}:base`, label: `${ROLE_LABEL[role]} · ${r.summary.sensor === 'sar' ? 'VV, dB stretch' : 'true colour'}`, src: r.layers.base, geo: geo(r) })
    if (r.layers.false) out.push({ value: `${role}:false`, label: `${ROLE_LABEL[role]} · false colour NIR-R-G`, src: r.layers.false, geo: geo(r) })
  }
  if (derived.fusion && inputs.optical) out.push({ value: 'derived:fusion', label: 'Fusion · SAR structures; recovered in red', src: derived.fusion, geo: geo(inputs.optical) })
  if (derived.change && inputs.t2) out.push({ value: 'derived:change', label: 'Change · CVA mask over T2', src: derived.change, geo: geo(inputs.t2) })
  return out
}

export default function SceneRegion({ items, onLoadCrossModal }: { items: EvidenceItem[]; onLoadCrossModal: () => void }) {
  const { inputs, derived, view, setView, base, setBase, overlays, toggleOverlay, selected, select, result, separation, setSeparation, threshold, replaying } = useStation()
  const options = useMemo(() => layerOptions(inputs, derived), [inputs, derived])
  const layer = options.find((o) => o.value === base) ?? options[0]
  const [comparePair, setComparePair] = useState<'sensors' | 'dates'>('sensors')

  const [glFailed, setGlFailed] = useState(false)
  const canStack = !!(inputs.optical && inputs.sar && derived.fusion)
  const gl = hasWebGL() && !glFailed
  const recovered = result?.task === 'cross_modal' ? result.evidence.items.find((e) => e.claim.includes('recovered by SAR'))?.boxes ?? [] : []
  const subs = {
    optical: inputs.optical ? `${inputs.optical.summary.platform ?? 'optical'} · ${inputs.optical.summary.bands} bands${typeof inputs.optical.summary.cloud_pct === 'number' ? ` · cloud ${inputs.optical.summary.cloud_pct}%` : ''}` : '',
    fusion: 'derived · recovered in red',
    sar: inputs.sar ? `${inputs.sar.summary.platform ?? 'SAR'} · ${inputs.sar.summary.polarisation ?? ''}` : '',
  }
  const urls = { optical: inputs.optical?.layers.base ?? '', fusion: derived.fusion ?? '', sar: inputs.sar?.layers.base ?? '' }

  const pair = comparePair === 'dates' && inputs.t1 && inputs.t2
    ? { a: inputs.t1, b: inputs.t2, la: 'T1 · before', lb: 'T2 · after' }
    : inputs.optical && inputs.sar ? { a: inputs.optical, b: inputs.sar, la: 'OPTICAL', lb: 'SAR · VV' }
      : inputs.t1 && inputs.t2 ? { a: inputs.t1, b: inputs.t2, la: 'T1 · before', lb: 'T2 · after' } : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-2">
        <div role="tablist" aria-label="Scene view" className="flex">
          {VIEWS.map((v) => (
            <button key={v.key} role="tab" type="button" aria-selected={view === v.key} data-testid={`view-${v.key}`}
              onClick={() => setView(v.key)}
              className={cn('border-b-2 px-3 py-1 text-[13px]', view === v.key ? 'border-ink text-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
              {v.label}
            </button>
          ))}
        </div>
        {view === 'map' && options.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="label">Layer</span>
            <select value={layer?.value} onChange={(e) => setBase(e.target.value)} data-testid="layer-select"
              className="mono max-w-[260px] border border-rule bg-surface px-1.5 py-1 text-[12px]">
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        )}
        {view === 'compare' && inputs.t1 && inputs.t2 && inputs.optical && inputs.sar && (
          <div className="flex gap-1">
            {(['sensors', 'dates'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={comparePair === p} onClick={() => setComparePair(p)}
                className={cn('mono border px-2 py-0.5 text-[11.5px]', comparePair === p ? 'border-ink' : 'border-rule text-ink-2')}>{p === 'sensors' ? 'optical ↔ SAR' : 'T1 ↔ T2'}</button>
            ))}
          </div>
        )}
        <div className="ml-auto">{view === 'map' && <OverlayLegend items={items} overlays={overlays} onToggle={toggleOverlay} />}</div>
      </div>

      <div className="relative min-h-[360px] flex-1 bg-paper">
        {view === 'map' && (
          <PlateViewer src={layer?.src} geo={layer?.geo} items={items} threshold={result?.evidence.threshold ?? threshold}
            overlays={overlays} selected={selected} onSelect={select} runKey={result?.run_id} alt={layer?.label ?? 'Scene'}
            processing={replaying && result ? (result.tools.join(' → ') || 'input checks') : undefined} />
        )}

        {view === 'stack' && (canStack ? (
          <div className="graticule absolute inset-0" data-testid="stack">
            {gl ? (
              <ErrorBoundary fallback={<StackFallback urls={urls} subs={subs} separation={separation} />}>
                <Suspense fallback={<p className="label p-4">Loading the stack…</p>}>
                  <ModalityStack urls={urls} subs={subs} separation={separation} boxes={recovered} onError={() => setGlFailed(true)}
                    bounds={inputs.optical!.summary.bounds} aspect={inputs.optical!.summary.width / inputs.optical!.summary.height} />
                </Suspense>
              </ErrorBoundary>
            ) : <StackFallback urls={urls} subs={subs} separation={separation} />}
            {/* The toolbar floating over the scene — floating over the scene. */}
            <div className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2">
              <span className="label !text-ink">Separation</span>
              <input type="range" min={0} max={1} step={0.01} value={separation} onChange={(e) => setSeparation(Number(e.target.value))} className="instrument w-44" aria-label="Separate the planes" data-testid="separation" />
              <span className="mono w-9 text-[12px]">{separation.toFixed(2)}</span>
            </div>
            <p className="mono absolute left-3 top-3 max-w-[300px] text-[11px] leading-snug text-ink-2">Drag to orbit. Click a plate to isolate it. Pull the planes apart: what optical loses under cloud, SAR recovers.</p>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="t-display text-[24px]">The stack needs an optical and a SAR raster.</p>
              <p className="mt-2 text-ink-2">Fusion is derived from the pair, so there is nothing to separate yet.</p>
              <button type="button" onClick={onLoadCrossModal} className="mt-4 border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">Load the cross-modal pair</button>
            </div>
          </div>
        ))}

        {view === 'compare' && (pair ? (
          <div className="flex h-full items-center justify-center p-4">
            <ImageComparison className="frame h-full max-h-full max-w-full" testId="compare" label={`Divider between ${pair.la} and ${pair.lb}`}>
              <div style={{ aspectRatio: `${pair.a.summary.width} / ${pair.a.summary.height}` }} className="relative h-full max-w-full">
                <ImageComparisonImage src={pair.a.layers.base} alt={`${pair.la} image`} position="right" />
                <ImageComparisonImage src={pair.b.layers.base} alt={`${pair.lb} image`} position="left" />
                <ImageComparisonSlider className="bg-paper">
                  <div className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center border border-ink bg-paper text-[12px]">⇆</div>
                </ImageComparisonSlider>
                <span className="mono absolute left-2 top-2 z-10 bg-paper px-1.5 py-0.5 text-[11px]" style={{ borderLeft: '3px solid var(--color-optical)' }}>{pair.la}</span>
                <span className="mono absolute right-2 top-2 z-10 bg-paper px-1.5 py-0.5 text-[11px]" style={{ borderRight: '3px solid var(--color-sar)' }}>{pair.lb}</span>
              </div>
            </ImageComparison>
          </div>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="t-display text-[24px]">Compare needs two rasters of one area.</p>
              <button type="button" onClick={onLoadCrossModal} className="mt-4 border border-ink px-3 py-1.5 hover:bg-ink hover:text-paper">Load the cross-modal pair</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
