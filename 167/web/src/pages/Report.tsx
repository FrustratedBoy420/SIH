/**
 * The report view — a print-styled page mirroring the downloadable report
 * (OUT-02). Both are built from the stored run, so they match what the user
 * saw (OUT-03). "Print" gives a PDF with no server and no network.
 */

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { MODALITY_LABEL, ms, TASK_LABEL, utc } from '@/lib/format'
import { useEngineMode } from '@/lib/hooks'
import { cannotEstablish, outcome, reportHtml } from '@/lib/report'
import { cn, download } from '@/lib/utils'

const H = ({ children }: { children: React.ReactNode }) => <h2 className="label mt-10 border-t border-ink pt-3 !text-ink">{children}</h2>

export default function Report() {
  const { runId = '' } = useParams()
  const { data: r, isLoading } = useQuery({ queryKey: ['run', runId], queryFn: () => api.run(runId) })
  const { data: mode } = useEngineMode()
  const preview = mode !== 'http'

  if (isLoading) return <p className="label p-10">Loading run…</p>
  if (!r) {
    return (
      <section className="px-5 py-20 sm:px-8">
        <h1 className="t-section">No run {runId}.</h1>
        <p className="mt-4 max-w-lg text-ink-2">Runs made by the preview engine are kept in this browser only; this one is not here. Run the query again from the workstation.</p>
        <Link to="/workstation" className="btn btn-sun mt-6">Open the workstation</Link>
      </section>
    )
  }

  const ev = r.evidence
  const state = r.refused ? 'refused' : r.abstained ? 'abstained' : 'answered'
  const saveHtml = () => download(`satquery-report-${r.run_id}.html`, reportHtml(r, preview), 'text/html')
  const saveGeo = () => download(`satquery-${r.run_id}.geojson`, JSON.stringify(r.geojson, null, 2), 'application/geo+json')

  return (
    <div className="px-5 py-10 sm:px-8 print:p-0" data-testid="report">
      <div className="no-print mb-8 flex flex-wrap gap-2">
        <button type="button" onClick={saveHtml} data-testid="download-report" className="btn btn-sun btn-sm">Download report (.html)</button>
        <button type="button" onClick={() => window.print()} className="btn btn-line btn-sm">Print / save as PDF</button>
        <button type="button" onClick={saveGeo} disabled={!r.geojson.features.length} className="btn btn-line btn-sm disabled:opacity-40">GeoJSON ({r.geojson.features.length})</button>
        <Link to={`/workstation?q=${encodeURIComponent(r.query)}`} className="ml-auto self-center text-[13.5px] text-accent hover:underline">← back to the workstation</Link>
      </div>

      <article className="frame mx-auto max-w-[980px] bg-surface p-6 sm:p-10 print:border-0 print:p-0">
        <p className="mono text-[11.5px] text-ink-2">SatQuery AI · run report · {r.run_id} · {utc(r.created)}</p>
        <h1 className={cn('t-section mt-3', state === 'refused' && 'text-nir')}>{outcome(r)}</h1>
        <p className="mono mt-2 text-[12px] text-ink-2">engine {r.engine}{preview ? ' (browser preview)' : ''} · version {r.version} · {ms(r.elapsed_ms)}{r.precomputed ? ' · PRE-COMPUTED' : ''}</p>

        <H>Query</H>
        <p className="mt-2 text-[17px]">{r.query || <em>(empty)</em>}</p>

        <H>Answer</H>
        <p className={cn('mt-3 border-l-[3px] py-1 pl-4 text-[18px] leading-[1.45]', state === 'refused' ? 'border-nir' : state === 'abstained' ? 'border-warn' : 'border-ink')}>{r.answer}</p>
        <p className="mono mt-2 text-[12.5px]">confidence {r.confidence.toFixed(3)} · task {TASK_LABEL[r.task] ?? (r.task || '—')} · tools {r.tools.join(' → ') || 'none'}</p>

        <H>Evidence — {ev.passing} of {ev.count} records passed the gate at {ev.threshold.toFixed(2)}</H>
        {ev.items.length ? (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[720px] border-collapse text-left text-[12.5px]">
              <thead><tr className="border-b border-ink">{['Claim', 'Value', 'Confidence', 'Modality', 'Source', 'ha', 'Method'].map((h) => <th key={h} className="label py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {ev.items.map((e) => (
                  <tr key={e.claim} className={cn('border-b border-rule align-top', e.confidence < ev.threshold && 'text-ink-2')}>
                    <td className="py-2 pr-3">{e.claim}{e.conflicts.map((c) => <p key={c} className="text-[11.5px] text-warn">⚠ {c}</p>)}</td>
                    <td className="mono pr-3">{String(e.value ?? '—')} {e.unit}</td>
                    <td className="mono pr-3">{e.confidence.toFixed(3)} {e.confidence >= ev.threshold ? 'pass' : 'gated'}</td>
                    <td className="pr-3">{MODALITY_LABEL[e.modality]}</td>
                    <td className="mono pr-3">{e.source_model}@{e.source_version}</td>
                    <td className="mono pr-3">{e.mask_area_ha ? e.mask_area_ha.toFixed(2) : '—'}</td>
                    <td className="pr-1">{e.method}<p className="mono text-[11px] text-ink-2">{e.supporting.join(' · ')}</p></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-ink-2">No evidence: nothing was measured.</p>}

        <H>Inputs</H>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[720px] border-collapse text-left text-[12.5px]">
            <thead><tr className="border-b border-ink">{['Role', 'File', 'Sensor', 'CRS', 'Bands', 'GSD', 'Size', 'Acquired'].map((h) => <th key={h} className="label py-1.5 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {r.manifest.rasters.map((x) => (
                <tr key={x.role} className="border-b border-rule"><td className="py-1.5 pr-3">{x.role}</td><td className="mono pr-3">{x.source}</td><td className="pr-3">{String(x.platform ?? x.sensor)}</td>
                  <td className="mono pr-3">{x.crs}</td><td className="mono pr-3">{x.bands} · {x.band_names.join(', ')}</td><td className="mono pr-3">{x.gsd_m ? `${x.gsd_m} m` : '—'}</td>
                  <td className="mono pr-3">{x.width}×{x.height}</td><td className="mono">{utc(x.acquired)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <H>Parameters</H>
        <p className="mono mt-2 text-[13px]">{Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(' · ') || 'none set — the run stopped before parameters were configured'}</p>

        <H>Execution trace</H>
        <ol className="mt-3">
          {r.trace.map((s, i) => (
            <li key={i} className={cn('grid grid-cols-[18px_180px_1fr_70px] gap-2 border-b border-rule py-1.5 text-[12.5px]', !s.ok && 'text-nir')}>
              <span>{s.ok ? '✓' : '✕'}</span><span className="font-medium">{s.step}</span><span className="mono break-words">{s.detail}</span><span className="mono text-right">{ms(s.ms)}</span>
            </li>
          ))}
        </ol>

        <H>What this cannot establish</H>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px]" data-testid="cannot-establish">
          {cannotEstablish(r, preview).map((c) => <li key={c}>{c}</li>)}
        </ul>
      </article>
    </div>
  )
}
