/**
 * Inputs — one slot per role (optical, SAR, T1, T2). The role is declared by
 * where the file is dropped, never inferred from band count: a one-band
 * Cartosat panchromatic image is optical, not SAR (audit B4).
 *
 * Every loaded raster shows what the system read from it — CRS, bands, GSD,
 * sensor, size, acquisition time — and any assumption it had to make (UI-05).
 */

import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import type { LoadedRaster } from '@/lib/api'
import type { ApiError, RasterSummary, Role } from '@/lib/contract'
import { ROLES } from '@/lib/contract'
import { lat, lon, ROLE_LABEL, utc } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DemoKind } from '@/engine/client'

const MARK: Record<Role, string> = { optical: 'var(--color-optical)', sar: 'var(--color-sar)', t1: 'var(--color-nir)', t2: 'var(--color-nir)' }
const HINT: Record<Role, string> = {
  optical: 'multispectral · R,G,B,NIR',
  sar: 'VV/VH or HH/HV backscatter',
  t1: 'the earlier date',
  t2: 'the later date',
}

export const DEMOS: { kind: DemoKind; label: string; sub: string }[] = [
  { kind: 'crossmodal', label: 'Cross-modal pair', sub: 'optical + SAR' },
  { kind: 'bitemporal', label: 'Bi-temporal pair', sub: 'T1 2022 · T2 2024' },
  { kind: 'optical', label: 'Single optical', sub: 'one image' },
  { kind: 'full', label: 'All four', sub: 'optical · SAR · T1 · T2' },
]

function alignment(a: RasterSummary, b: RasterSummary) {
  const [ax0, ay0, ax1] = a.bounds, [bx0, by0] = b.bounds
  const off = (Math.max(Math.abs(ax0 - bx0), Math.abs(ay0 - by0)) / (ax1 - ax0 || 1)) * a.width
  return { sameCrs: a.crs === b.crs, off, sameSize: a.width === b.width && a.height === b.height, geo: a.georeferenced && b.georeferenced }
}

function Meta({ s }: { s: RasterSummary }) {
  const assumed = typeof s.band_order === 'string' && /assumed|no NIR|unnamed/.test(s.band_order)
  const rows: [string, string, boolean?][] = [
    ['CRS', s.crs === 'none' ? 'none — not georeferenced' : s.crs, !s.georeferenced],
    ['Bands', `${s.bands} · ${s.band_names.join(', ')}`],
    ['GSD', s.gsd_m ? `${s.gsd_m.toFixed(1)} m` : '—'],
    ['Size', `${s.width} × ${s.height} px`],
    ['Sensor', String(s.platform ?? s.sensor)],
    ['Acquired', utc(s.acquired)],
  ]
  if (s.georeferenced) rows.push(['Centre', `${lat(s.centre[0], 3)} ${lon(s.centre[1], 3)}`])
  if (s.polarisation) rows.push(['Pol.', String(s.polarisation)])
  if (typeof s.cloud_pct === 'number') rows.push(['Cloud', `${s.cloud_pct.toFixed(1)} % (generator)`])
  return (
    <div className="mt-2">
      <dl className="grid grid-cols-[62px_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
        {rows.map(([k, v, bad]) => (
          <div key={k} className="contents">
            <dt className="text-ink-2">{k}</dt>
            <dd className={cn('mono min-w-0 break-words', bad && 'text-warn')} title={v}>{v}</dd>
          </div>
        ))}
      </dl>
      {s.band_order && <p className={cn('mono mt-1.5 text-[10.5px] leading-snug', assumed ? 'text-warn' : 'text-ink-2')}>{assumed ? '⚠ ' : ''}{String(s.band_order)}</p>}
      {s.normalisation && <p className="mono text-[10.5px] leading-snug text-ink-2">{String(s.normalisation)}</p>}
      {s.analysed_at && <p className="mono text-[10.5px] leading-snug text-ink-2">analysed at {String(s.analysed_at)}</p>}
      {typeof s.note === 'string' && <p className="mt-1 text-[11.5px] leading-snug text-warn">⚠ {s.note}</p>}
    </div>
  )
}

function Slot({ role, r, loading, error, onFile, onRemove }: {
  role: Role; r?: LoadedRaster; loading?: boolean; error?: ApiError; onFile: (f: File) => void; onRemove: () => void
}) {
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  return (
    <div
      data-testid={`slot-${role}`}
      className={cn('border-b border-rule py-3', over && 'bg-accent-bg/50')}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-[3px]" style={{ background: MARK[role] }} />
        <h3 className="text-[13px] font-semibold">{ROLE_LABEL[role]}</h3>
        <span className="mono ml-auto text-[10.5px] text-ink-2">{loading ? 'reading…' : r ? (r.summary.synthetic ? 'built-in · synthetic' : 'uploaded') : 'empty'}</span>
        {r && !loading && <button type="button" aria-label={`Remove ${ROLE_LABEL[role]}`} onClick={onRemove} className="mono px-1 text-[12px] text-ink-2 hover:text-nir">✕</button>}
      </div>

      {loading && <div className="relative mt-2 h-14 overflow-hidden bg-surface-2"><div className="animate-sweep absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-accent-bg to-transparent" /></div>}

      {!loading && r && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="flex gap-2.5">
          <img src={r.layers.base} alt={`${ROLE_LABEL[role]} thumbnail`} className="mt-2 size-14 shrink-0 border border-rule object-cover" />
          <div className="min-w-0 flex-1">
            <p className="mono mt-2 truncate text-[11.5px]" title={r.summary.source}>{r.summary.source}</p>
            <Meta s={r.summary} />
          </div>
        </motion.div>
      )}

      {!loading && !r && (
        <button type="button" onClick={() => file.current?.click()}
          className="mt-2 flex w-full flex-col items-start border border-dashed border-rule-2 px-3 py-2.5 text-left hover:border-accent hover:bg-surface">
          <span className="text-[13px] text-ink">Drop a GeoTIFF, or choose a file</span>
          <span className="mono text-[10.5px] text-ink-2">{HINT[role]} · .tif .tiff (.png .jpg benchmark only)</span>
        </button>
      )}
      {r && !loading && (
        <button type="button" onClick={() => file.current?.click()} className="mono mt-2 text-[11px] text-accent underline-offset-2 hover:underline">replace…</button>
      )}
      <input ref={file} type="file" accept=".tif,.tiff,.png,.jpg,.jpeg" className="hidden" data-testid={`file-${role}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />

      {error && (
        <div role="alert" className="mt-2 border-l-2 border-nir bg-nir-bg/60 px-2 py-1.5 text-[12px]" data-testid={`upload-error-${role}`}>
          <p className="text-nir">{error.message}</p>
          <p className="text-ink-2">{error.remedy}</p>
        </div>
      )}
    </div>
  )
}

export default function InputsPanel({ inputs, loading, errors, onFile, onRemove, onDemo }: {
  inputs: Partial<Record<Role, LoadedRaster>>
  loading: Partial<Record<Role, boolean>>
  errors: Partial<Record<Role, ApiError>>
  onFile: (role: Role, f: File) => void
  onRemove: (role: Role) => void
  onDemo: (k: DemoKind) => void
}) {
  const pairs: [Role, Role, string][] = [['optical', 'sar', 'Optical ↔ SAR'], ['t1', 't2', 'T1 ↔ T2']]
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink px-4 pb-3 pt-3">
        <h2 className="label !text-ink">Inputs</h2>
        <p className="mt-2 text-[12px] text-ink-2">Built-in scenes</p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {DEMOS.map((d) => (
            <button key={d.kind} type="button" data-testid={`demo-${d.kind}`} onClick={() => onDemo(d.kind)}
              className="border border-rule bg-surface px-2 py-1.5 text-left hover:border-ink">
              <span className="block text-[12.5px] leading-tight">{d.label}</span>
              <span className="mono block text-[10px] text-ink-2">{d.sub}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4">
        {ROLES.map((role) => (
          <Slot key={role} role={role} r={inputs[role]} loading={loading[role]} error={errors[role]}
            onFile={(f) => onFile(role, f)} onRemove={() => onRemove(role)} />
        ))}
        <div className="py-3" data-testid="alignment">
          <h3 className="label">Alignment</h3>
          {pairs.map(([a, b, name]) => {
            const ra = inputs[a], rb = inputs[b]
            if (!ra || !rb) return <p key={name} className="mono mt-1 text-[11px] text-ink-2">{name} · needs both</p>
            const al = alignment(ra.summary, rb.summary)
            const ok = al.sameCrs && al.off < 1 && al.geo
            return (
              <p key={name} className={cn('mono mt-1 text-[11px]', ok ? 'text-good' : 'text-warn')}>
                {ok ? '✓' : '⚠'} {name} · {al.sameCrs ? 'same CRS' : 'CRS differs'} · offset {al.off.toFixed(2)} px{al.sameSize ? '' : ' · sizes differ'}
              </p>
            )
          })}
          <p className="mt-1.5 text-[11px] leading-snug text-ink-2">Geometric check from the headers. Phase correlation on image gradients runs with each cross-modal or change query and is recorded in the evidence.</p>
        </div>
      </div>
    </div>
  )
}
