/**
 * What "Workstation" opens: a choice, not a page. Two ways in, as a tab pair
 * at the top — Load scene (the built-in Sentinel imagery, selected by
 * default) and Load image (the sample photo library, upload at the bottom).
 * A library pick or an upload happens here, before navigating, using the
 * same `useStation` store and `api.upload` the workstation itself uses, so
 * the workstation opens with the image already loaded. A scene pick is
 * simpler still: `?scene=` is a deep link the workstation already reads.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DemoKind } from '@/engine/client'
import { api, asApiError } from '@/lib/api'
import type { ApiError } from '@/lib/contract'
import { SAMPLES, sampleUrl, thumbUrl, type Sample } from '@/lib/samples'
import { useStation } from '@/lib/store'
import { cn } from '@/lib/utils'

type Tab = 'scene' | 'image'

const SCENES: { kind: DemoKind; title: string; desc: string; layers: string[]; recommended?: boolean }[] = [
  { kind: 'optical', title: 'Optical', desc: 'Single image — VQA, grounding', layers: ['optical'] },
  { kind: 'crossmodal', title: 'Optical + SAR', desc: 'Radar sees through cloud', layers: ['optical', 'sar'], recommended: true },
  { kind: 'bitemporal', title: 'Before & after', desc: 'Change between two dates', layers: ['t1', 't2'] },
]

export default function StartDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('scene')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const close = () => { onOpenChange(false); setTab('scene'); setError(null) }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const goScene = (kind: DemoKind) => { close(); navigate(`/workstation?scene=${kind}`) }

  const loadOptical = async (f: File, suggestion?: string) => {
    setError(null)
    try {
      const r = await api.upload('optical', f)
      useStation.getState().setInput('optical', r)
      useStation.getState().setSuggestion(suggestion ?? null)
      close()
      navigate('/workstation')
    } catch (e) {
      setError(asApiError(e))
    } finally {
      setBusy(null)
    }
  }

  const pickSample = async (sm: Sample) => {
    setBusy(sm.title)
    try {
      const blob = await (await fetch(sampleUrl(sm))).blob()
      await loadOptical(new File([blob], sm.file, { type: blob.type || 'image/png' }), sm.question)
    } catch (e) {
      setError(asApiError(e))
      setBusy(null)
    }
  }

  const tabClass = (t: Tab) => cn(
    'flex-1 border-2 py-2.5 text-center text-[14.5px] font-semibold',
    t === tab ? 'border-sun bg-sun/25 text-ink' : 'border-rule text-ink-2 hover:border-ink hover:text-ink',
  )

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/25 px-4" role="dialog" aria-modal="true"
      aria-labelledby="start-h" data-testid="start-dialog" onClick={close}>
      <div className="frame raised flex max-h-[90vh] w-[min(920px,94vw)] flex-col overflow-hidden bg-surface" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
          <h2 id="start-h" className="t-display flex-1 text-[19px]">Open the workstation</h2>
          <button type="button" onClick={close} aria-label="Close" className="mono border border-rule px-2 py-1 text-[11px] text-ink-2 hover:border-ink hover:text-ink">esc</button>
        </div>

        <div className="flex gap-2 px-5 pt-4" role="tablist" aria-label="How to start">
          <button type="button" role="tab" aria-selected={tab === 'scene'} data-testid="start-tab-scene" onClick={() => setTab('scene')} className={tabClass('scene')}>Load scene</button>
          <button type="button" role="tab" aria-selected={tab === 'image'} data-testid="start-tab-image" onClick={() => setTab('image')} className={tabClass('image')}>Load image</button>
        </div>

        {error && (
          <div role="alert" className="mx-5 mt-4 border-l-2 border-nir bg-nir-bg/60 px-3 py-2 text-[13px]">
            <p className="text-nir">{error.message}</p>
            <p className="text-ink-2">{error.remedy}</p>
          </div>
        )}

        <div className="scroll-thin overflow-y-auto p-5">
          {tab === 'scene' && (
            <div data-testid="start-scene-panel">
              <p className="mb-3 text-[12.5px] leading-snug text-ink-2">Real Sentinel-1/2 imagery of west Hyderabad. Pick what to load — nothing else to set up.</p>
              <ul className="grid gap-4 sm:grid-cols-3">
                {SCENES.map((sc) => (
                  <li key={sc.kind}>
                    <button type="button" data-testid={`start-scene-${sc.kind}`} onClick={() => goScene(sc.kind)}
                      className={cn('group relative flex w-full flex-col gap-2 border-2 p-3 text-left',
                        sc.recommended ? 'border-sun bg-sun/10 hover:bg-sun/20' : 'border-ink hover:bg-surface-2')}>
                      {sc.recommended && <span className="mono absolute right-2.5 top-2.5 bg-sun px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]">Recommended</span>}
                      <span className="flex gap-1">
                        {sc.layers.map((l) => (
                          <img key={l} src={`/api/scenes/demo/${l}.png`} alt="" loading="lazy" className="aspect-square min-w-0 flex-1 border border-rule object-cover" />
                        ))}
                      </span>
                      <span className="text-[14.5px] font-semibold text-ink">{sc.title}</span>
                      <span className="text-[12px] leading-snug text-ink-2">{sc.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'image' && (
            <div data-testid="start-image-panel">
              <p className="mb-3 text-[12.5px] leading-snug text-ink-2">Real photos, unmodified. Click one to load it into Optical, or upload your own below.</p>
              <ul className="grid grid-cols-4 gap-3 sm:grid-cols-8">
                {SAMPLES.map((sm) => (
                  <li key={sm.file}>
                    <button type="button" data-testid={`start-sample-${sm.file.replace('.png', '')}`} onClick={() => pickSample(sm)} disabled={!!busy}
                      title={`${sm.title} — ${sm.question}`} className={cn('group block w-full text-left', busy && busy !== sm.title && 'opacity-40')}>
                      <span className="relative block">
                        <img src={thumbUrl(sm)} alt={sm.title} className="aspect-square w-full border border-rule object-cover group-hover:border-accent" />
                        {busy === sm.title && <span className="absolute inset-0 grid place-items-center bg-surface/70">
                          <span className="mono text-[10px] text-ink">loading…</span>
                        </span>}
                      </span>
                      <span className="mono mt-1 block truncate text-[10.5px] leading-tight text-ink-2 group-hover:text-ink">{sm.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mono mt-3 text-[10.5px] leading-snug text-ink-3">VRSBench validation split, CC-BY-4.0 (Li, Ding, Elhoseiny).</p>

              <button type="button" data-testid="start-upload" onClick={() => file.current?.click()} disabled={!!busy}
                className="mt-4 flex w-full items-center justify-center gap-2 border-2 border-accent bg-surface px-3 py-2.5 text-[13px] font-semibold text-accent hover:bg-accent hover:text-surface disabled:opacity-50">
                <span aria-hidden>⇪</span> Upload your own image…
              </button>
              <input ref={file} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" className="hidden" data-testid="start-upload-input"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setBusy('Uploading…'); loadOptical(f) } e.target.value = '' }} />
              <p className="mono mt-1.5 text-[10.5px] leading-snug text-ink-3">A GeoTIFF, or a PNG/JPG as non-georeferenced benchmark imagery.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
