/**
 * The modality stack without WebGL (UI-12): the same three plates as 2D
 * panels, offset by the same separation control. Nothing is lost but depth.
 */

import type { LayerKey } from './ModalityStack'

const ORDER: { key: LayerKey; label: string; colour: string }[] = [
  { key: 'optical', label: 'OPTICAL', colour: 'var(--color-optical)' },
  { key: 'fusion', label: 'FUSION', colour: 'var(--color-fusion)' },
  { key: 'sar', label: 'SAR', colour: 'var(--color-sar)' },
]

export default function StackFallback({ urls, subs, separation }: { urls: Record<LayerKey, string>; subs: Record<LayerKey, string>; separation: number }) {
  const gap = 8 + separation * 56
  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-6" data-testid="stack-fallback">
      <div className="relative" style={{ width: 'min(58%, 420px)', aspectRatio: '1', transform: 'perspective(900px) rotateX(52deg) rotateZ(-28deg)' }}>
        {ORDER.map((l, i) => (
          <figure key={l.key} className="absolute inset-0 border-2 bg-surface" style={{ borderColor: l.colour, transform: `translateY(${(i - 1) * gap}px)`, zIndex: 3 - i, transition: 'transform 180ms var(--ease-instrument)' }}>
            <img src={urls[l.key]} alt={`${l.label} plate`} className="h-full w-full" />
            <figcaption className="mono absolute -left-2 top-2 -translate-x-full whitespace-nowrap border border-rule bg-surface px-1.5 py-0.5 text-[10px]" style={{ borderRight: `3px solid ${l.colour}` }}>
              <b>{l.label}</b> <span className="text-ink-2">{subs[l.key]}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mono absolute bottom-3 left-3 text-[11px] text-ink-2">WebGL unavailable — 2D stack</p>
    </div>
  )
}
