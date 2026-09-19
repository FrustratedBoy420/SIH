/**
 * Which engine is answering, always visible. A result from the browser
 * preview must never pass for the API, and a pre-computed venue result must
 * never pass for live inference (TRC-04, 06 §9).
 */

import { useState } from 'react'
import { setEngine } from '@/lib/api'
import { useEngineMode, useHealth } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export default function EngineBadge({ className }: { className?: string }) {
  const { data: mode } = useEngineMode()
  const { data: health } = useHealth()
  const [open, setOpen] = useState(false)
  const preview = mode !== 'http'

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        data-testid="engine-badge"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border border-ink/25 px-2.5 py-1.5 text-left hover:border-ink"
      >
        <span className="inline-block size-1.5 rounded-full" style={{ background: preview ? 'var(--color-warn)' : 'var(--color-good)' }} />
        <span className="text-[13px] font-medium">{preview ? 'Preview engine' : 'API'}</span>
        <span className="mono hidden text-[11px] text-ink-2 sm:inline">{health?.version ?? '…'}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Engine" className="raised frame absolute right-0 top-[calc(100%+8px)] z-[70] w-[340px] bg-surface p-4 text-[14px]">
          <p className="label mb-2">Answering now</p>
          <p className="mb-3 text-ink">
            {preview
              ? 'The in-browser preview engine: the classical path of the SatQuery pipeline, ported line for line and run on this machine. No model or adapter runs here.'
              : `The SatQuery API · ${health?.engine ?? ''} · adapters ${health?.adapters_loaded ? 'loaded' : 'not loaded'}.`}
          </p>
          {health?.note && <p className="mono mb-3 text-[11.5px] text-ink-2">{health.note}</p>}
          <div className="flex flex-wrap gap-2">
            {(['preview', 'auto', 'http'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setEngine(m)}
                className={cn('mono border px-2 py-1 text-[12px]', (m === 'http' ? !preview : m === 'preview' && preview) ? 'border-ink bg-sun text-ink' : 'border-rule text-ink-2 hover:border-ink')}>
                {m === 'auto' ? 'auto-detect API' : m === 'http' ? 'use API' : 'use preview'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
