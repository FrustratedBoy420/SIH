/**
 * The run report (OUT-02): query, answer, evidence per claim with confidence
 * and source model, input metadata, parameters, the trace, and what the run
 * cannot establish. Built from the stored run only, so it matches the screen
 * exactly (OUT-03). The .html download is self-contained — no external CSS,
 * fonts or scripts — so it stands alone as a record.
 */

import type { QueryResult } from './contract'
import { TASK_LABEL, utc } from './format'

export function outcome(r: QueryResult) {
  return r.refused ? 'Refused — no model invoked' : r.abstained ? 'Abstained — no claim made' : 'Answered'
}

/** What this run cannot establish — derived from the run itself, never boilerplate alone. */
export function cannotEstablish(r: QueryResult, preview: boolean): string[] {
  const out: string[] = []
  const rs = r.manifest.rasters
  if (rs.some((x) => x.synthetic)) out.push('The imagery is synthetic. The pixels were generated; the geotransform, band structure and radiometric behaviour are real. Nothing here is a statement about a real place.')
  if (r.engine === 'classical') out.push('No learned model served this run. Every value comes from the classical measurement path (spectral indices, backscatter thresholds, change vectors); the RS-adapted model (M1) is not yet serving.')
  if (preview) out.push('The run was made by the browser preview engine, a port of the API’s classical path, not by the API itself.')
  if (r.precomputed) out.push('This result was pre-computed for the venue fallback. It is not live inference.')
  if (r.refused) out.push('Because the inputs could not support the question, nothing was measured. The refusal says nothing about the scene.')
  if (r.abstained) out.push('Nothing cleared the confidence gate, so no claim about the scene is made.')
  if (rs.some((x) => !x.georeferenced)) out.push('At least one input has no coordinate reference system: its regions are in pixel coordinates and its areas cannot be stated in hectares.')
  if (rs.some((x) => x.crs === 'EPSG:4326')) out.push('Hectares for EPSG:4326 rasters use 111,320 m per degree — adequate to state a resolution, not to survey with.')
  if (r.task === 'cross_modal' || r.task === 'temporal_change') out.push('Co-registration was validated (geometric extent and phase correlation), not corrected. An offset above one pixel lowers confidence; it is not removed.')
  if (r.task === 'temporal_change') out.push('Change type is inferred from the NDVI trend inside the changed region (vegetation lost → construction). It cannot distinguish construction from, for example, bare-earth clearing.')
  out.push('Confidence is a separation measure on the thresholded index, penalised per recorded conflict. It is not yet calibrated: expected calibration error needs at least 200 labelled predictions and has not been reported.')
  return out
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function reportHtml(r: QueryResult, preview: boolean): string {
  const ev = r.evidence
  const rows = ev.items.map((e) => `<tr class="${e.confidence >= ev.threshold ? '' : 'gated'}">
    <td>${esc(e.claim)}${e.conflicts.map((c) => `<div class="warn">⚠ ${esc(c)}</div>`).join('')}</td>
    <td class="m">${esc(e.value)}${e.unit ? ' ' + esc(e.unit) : ''}</td>
    <td class="m">${e.confidence.toFixed(3)} ${e.confidence >= ev.threshold ? 'pass' : 'gated'}</td>
    <td>${esc(e.modality)}</td><td class="m">${esc(e.source_model)}@${esc(e.source_version)}</td>
    <td class="m">${e.mask_area_ha ? e.mask_area_ha.toFixed(2) : '—'}</td>
    <td>${esc(e.method)}<div class="s">${e.supporting.map(esc).join(' · ')}</div></td></tr>`).join('')
  const inputs = r.manifest.rasters.map((x) => `<tr><td>${esc(x.role)}</td><td class="m">${esc(x.source)}</td><td>${esc(x.platform ?? x.sensor)}</td>
    <td class="m">${esc(x.crs)}</td><td class="m">${x.bands} · ${esc(x.band_names.join(', '))}</td><td class="m">${x.gsd_m ? x.gsd_m + ' m' : '—'}</td>
    <td class="m">${x.width}×${x.height}</td><td class="m">${esc(utc(x.acquired))}</td><td>${x.georeferenced ? 'yes' : 'no'}</td></tr>`).join('')
  const trace = r.trace.map((s) => `<tr class="${s.ok ? '' : 'fail'}"><td>${s.ok ? '✓' : '✕'}</td><td>${esc(s.step)}</td><td class="m">${esc(s.detail)}</td><td class="m">${s.ms.toFixed(1)} ms</td></tr>`).join('')
  const caveats = cannotEstablish(r, preview).map((c) => `<li>${esc(c)}</li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SatQuery run ${esc(r.run_id)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--ink:#0f1613;--ink2:#4a5551;--rule:#d3dad7;--nir:#c4342a;--warn:#a1740f;--paper:#f3f5f4}
*{box-sizing:border-box}body{margin:0;padding:32px;background:var(--paper);color:var(--ink);font:14px/1.5 "IBM Plex Sans",system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;background:#fff;padding:40px;border:1px solid var(--rule)}
h1{font:800 40px/1 "Bricolage Grotesque",system-ui,sans-serif;letter-spacing:-.03em;margin:0 0 6px}
h2{font:600 11px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin:28px 0 8px;border-top:1px solid var(--ink);padding-top:10px}
.m,code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse;font-size:12.5px}td,th{border-bottom:1px solid var(--rule);padding:6px 8px 6px 0;text-align:left;vertical-align:top}
th{font-weight:600;font-size:11px;color:var(--ink2);text-transform:uppercase;letter-spacing:.06em}
.gated{color:var(--ink2)}.fail td{color:var(--nir)}.warn{color:var(--warn);font-size:12px}.s{color:var(--ink2);font-size:11.5px}
.answer{font-size:18px;line-height:1.45;border-left:3px solid var(--ink);padding:4px 0 4px 14px}
.refused{border-color:var(--nir)}.abstained{border-color:var(--warn)}
.meta{color:var(--ink2);font-size:12px}ul{padding-left:18px}li{margin:4px 0}
</style></head><body><main>
<p class="meta m">SatQuery AI · run report · ${esc(r.run_id)} · ${esc(utc(r.created))}</p>
<h1>${esc(outcome(r))}</h1>
<p class="meta m">engine ${esc(r.engine)}${preview ? ' (browser preview)' : ''} · version ${esc(r.version)} · ${r.elapsed_ms.toFixed(1)} ms${r.precomputed ? ' · PRE-COMPUTED' : ''}</p>
<h2>Query</h2><p>${esc(r.query) || '<em>(empty)</em>'}</p>
<h2>Answer</h2><p class="answer ${r.refused ? 'refused' : r.abstained ? 'abstained' : ''}">${esc(r.answer)}</p>
<p class="m">confidence ${r.confidence.toFixed(3)} · task ${esc(TASK_LABEL[r.task] ?? r.task)} · tools ${esc(r.tools.join(' → ') || 'none')}</p>
<h2>Evidence — ${ev.passing} of ${ev.count} records passed the gate at ${ev.threshold.toFixed(2)}</h2>
${ev.items.length ? `<table><thead><tr><th>Claim</th><th>Value</th><th>Confidence</th><th>Modality</th><th>Source</th><th>ha</th><th>Method</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No evidence: nothing was measured.</p>'}
<p class="meta">GeoJSON: ${r.geojson.features.length} feature(s) in EPSG:4326.</p>
<h2>Inputs</h2><table><thead><tr><th>Role</th><th>File</th><th>Sensor</th><th>CRS</th><th>Bands</th><th>GSD</th><th>Size</th><th>Acquired</th><th>Georef.</th></tr></thead><tbody>${inputs}</tbody></table>
<h2>Parameters</h2><p class="m">${Object.entries(r.params).map(([k, v]) => `${esc(k)}=${esc(v)}`).join(' · ') || 'none set'}</p>
<h2>Execution trace</h2><table><tbody>${trace}</tbody></table>
<h2>What this cannot establish</h2><ul>${caveats}</ul>
</main></body></html>`
}
