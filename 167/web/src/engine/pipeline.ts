/**
 * Orchestration — a port of `satquery/pipeline.py`.
 *
 *   validate → classify → compatibility → select → execute → gate → phrase
 *
 * `answer()` receives an EvidenceSet and nothing else; it cannot invent a
 * number because it never sees a pixel (ADR-007). The trace records what ran,
 * never reasoning (ADR-008).
 */

import type { QueryResult, RasterSummary, TraceStep } from '@/lib/contract'
import { EvidenceSet } from './evidence'
import { summary, type Raster } from './raster'
import { REGISTRY, modalityOf, plan, type Inputs, type Task } from './router'
import * as sp from './specialists'

export const ENGINE_VERSION = '0.3.0-preview'

class Trace {
  steps: TraceStep[] = []
  t0 = performance.now()
  add(step: string, detail: string, ok = true, data: Record<string, unknown> = {}) {
    this.steps.push({ step, detail, ok, ms: Math.round((performance.now() - this.t0) * 10) / 10, data })
  }
}

function manifest(i: Inputs) {
  const roles: [keyof Inputs, Raster | undefined][] = [['optical', i.optical], ['sar', i.sar], ['t1', i.t1], ['t2', i.t2]]
  const rasters: RasterSummary[] = roles.filter(([, r]) => r).map(([role, r]) => ({ ...summary(r!), role }))
  return { modality: modalityOf(i), count: rasters.length, rasters }
}

function single(i: Inputs): [Raster | undefined, Raster | undefined] {
  const optical = i.optical ?? (i.t1 && i.t1.sensor !== 'sar' ? i.t1 : undefined) ?? (i.t2 && i.t2.sensor !== 'sar' ? i.t2 : undefined)
  const sar = i.sar ?? (i.t1?.sensor === 'sar' ? i.t1 : undefined) ?? (i.t2?.sensor === 'sar' ? i.t2 : undefined)
  return [optical, sar]
}

function execute(tool: string, q: string, i: Inputs, thr: number): EvidenceSet {
  const [o, s] = single(i)
  if (tool === 'rs_vqa') return sp.vqa(o, s, q, thr)
  if (tool === 'grounding') return sp.grounding(o, s, q, thr)
  if (tool === 'change_vqa') return sp.change(i.t1!, i.t2!, q, thr)
  if (tool === 'optical_sar') return sp.fusion(i.optical!, i.sar!, q, thr)
  throw new Error(`${tool} is not in the registry`)
}

const newId = () => `run-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`

function result(base: Partial<QueryResult> & Pick<QueryResult, 'query' | 'answer' | 'trace' | 'manifest'>, t0: number): QueryResult {
  const empty = new EvidenceSet(0.45)
  return {
    run_id: newId(), created: new Date().toISOString(),
    refused: false, abstained: false, confidence: 0, task: '', tools: [], params: {},
    evidence: empty.toDict(), geojson: empty.geojson(),
    version: ENGINE_VERSION, engine: 'classical', precomputed: false,
    ...base,
    elapsed_ms: Math.round((performance.now() - t0) * 10) / 10,
  }
}

export function run(query: string, inputs: Inputs, threshold = 0.45): QueryResult {
  const t0 = performance.now()
  const tr = new Trace()
  const m = manifest(inputs)

  // 1 — input validation
  if (m.count === 0) {
    tr.add('Input validated', 'no rasters supplied', false)
    tr.add('Refused', 'no model invoked', false)
    return result({ query, answer: 'No imagery was supplied. Upload at least one image to analyse.', refused: true, trace: tr.steps, manifest: m }, t0)
  }
  tr.add('Input validated', `${m.count} raster(s) · ${m.modality}`, true, {
    rasters: m.rasters.map((r) => ({ role: r.role, sensor: r.sensor, crs: r.crs, bands: r.bands, gsd_m: r.gsd_m, georeferenced: r.georeferenced })),
  })

  // 2, 3, 4 — classify, check compatibility, select
  const p = plan(query, inputs, threshold)
  tr.add('Task identified', `${p.task} · ${p.rule}`, true, { confidence: p.task_confidence, router: 'rules' })

  if (!p.valid) {
    tr.add('Compatibility check', `requires ${p.modality_required || 'n/a'}, found ${p.modality_found || 'n/a'}`, false, { reason: p.reason })
    tr.add('Refused', 'no model invoked', false)
    return result({ query, answer: `${p.reason} ${p.remedy}`, refused: true, task: p.task, trace: tr.steps, manifest: m }, t0)
  }

  tr.add('Compatibility check', `${p.modality_found} satisfies ${p.tools[0]}`)
  tr.add('Tool selected', p.tools.map((t) => `${t} (${REGISTRY[t].adapter})`).join(' -> '), true, { registry_size: Object.keys(REGISTRY).length })
  tr.add('Parameters', Object.entries(p.params).map(([k, v]) => `${k}=${v}`).join(' · '), true, { permitted: Object.keys(REGISTRY[p.tools[0]].params) })

  // 5 — execute
  const es = new EvidenceSet(p.params.threshold)
  for (const tool of p.tools) {
    const sub = execute(tool, query, inputs, p.params.threshold)
    sub.items.forEach((i) => es.add(i))
    tr.add(`Executed ${tool}`, `${sub.items.length} evidence item(s) · path classical · engine browser-preview`, true, {
      items: sub.items.map((i) => ({ claim: i.claim, value: i.value, confidence: Math.round(i.confidence * 1000) / 1000, modality: i.modality })),
    })
  }

  // 6 — fuse and gate
  const conflicts = es.items.flatMap((e) => e.conflicts)
  if (conflicts.length) tr.add('Conflicts recorded', `${conflicts.length} — confidence reduced`, true, { conflicts })

  const common = { query, task: p.task, tools: p.tools, params: p.params, evidence: es.toDict(), geojson: es.geojson(), manifest: m }
  if (es.abstain) {
    tr.add('Confidence gate', `nothing cleared ${es.threshold.toFixed(2)} — abstaining`, false)
    return result({
      ...common, trace: tr.steps, abstained: true, confidence: es.confidence,
      answer: 'I am not sufficiently confident to answer that from this imagery. Every measurement fell below the confidence threshold, so no claim is being made.',
    }, t0)
  }
  tr.add('Confidence', `${es.confidence.toFixed(2)} · ${es.passing.length}/${es.items.length} items passed the gate`)

  // 7 — phrase (evidence only — no pixels)
  const text = answer(p.task, es)
  const gj = es.geojson()
  tr.add('Evidence returned', gj.features.length ? `${gj.features.length} georeferenced feature(s) · ${es.crs}` : 'no georeferenced features — pixel coordinates only')
  return result({ ...common, geojson: gj, answer: text, confidence: es.confidence, trace: tr.steps }, t0)
}

/* ---------------------------------------------------------------- answer */

const plural = (n: number, w: string, p?: string) => (n === 1 ? w : p ?? w + 's')

export function answer(task: Task, es: EvidenceSet): string {
  const items = es.passing
  if (!items.length) return 'No claim cleared the confidence threshold.'
  const parts: string[] = []
  const find = (s: string) => items.find((e) => e.claim.includes(s))

  if (task === 'cross_modal') {
    const rec = find('recovered by SAR'), cloud = find('obscured by cloud'), sarE = find('backscatter')
    if (sarE) {
      const n = Number(sarE.value ?? 0)
      parts.push(`SAR detects ${n} built-up ${plural(n, 'area')} totalling ${sarE.mask_area_ha.toFixed(1)} ha.`)
    }
    if (cloud) parts.push(`Cloud obscures ${cloud.value}% of the optical scene.`)
    if (rec && rec.value) {
      const n = Number(rec.value)
      parts.push(n === 1
        ? `1 of them — ${rec.mask_area_ha.toFixed(1)} ha — lies beneath that cloud and is invisible to the optical sensor. Radar recovered it because radar penetrates cloud and built structures return strongly from corner reflection. That is information neither sensor provides alone.`
        : `${n} of them — ${rec.mask_area_ha.toFixed(1)} ha — lie beneath that cloud and are invisible to the optical sensor. Radar recovered them because radar penetrates cloud and built structures return strongly from corner reflection. That is information neither sensor provides alone.`)
    } else if (rec) {
      parts.push('No detected built-up area lies beneath cloud in this scene, so here the two sensors corroborate each other rather than complement each other.')
    }
  } else if (task === 'temporal_change') {
    const ch = find('change'), trend = items.find((e) => e.claim === 'built-up area trend')
    if (ch && ch.value) {
      const n = Number(ch.value)
      parts.push(`${n} changed ${plural(n, 'region')} ${n === 1 ? 'was' : 'were'} detected between the two dates, covering ${ch.mask_area_ha.toFixed(2)} ha.`)
      const sem = ch.supporting.find((s) => s.includes('NDVI delta'))
      if (sem) parts.push(sem[0].toUpperCase() + sem.slice(1) + '.')
    } else if (ch) parts.push('No significant change was detected between the two dates.')
    if (trend && typeof trend.value === 'number') {
      parts.push(`Built-up share ${trend.value > 0 ? 'rose' : 'fell'} by ${Math.abs(trend.value).toFixed(2)} percentage points.`)
    }
  } else if (task === 'grounding') {
    const g = items[0]
    const n = Number(g.value ?? 0)
    if (n) {
      parts.push(`${n} region${n !== 1 ? 's' : ''} matched, covering ${g.mask_area_ha.toFixed(2)} ha.`)
      const b = g.boxes[0]
      if (b && b.lat0 !== null && b.lat1 !== null && b.lon0 !== null && b.lon1 !== null) {
        parts.push(`The largest is centred at ${((b.lat0 + b.lat1) / 2).toFixed(4)} N ${((b.lon0 + b.lon1) / 2).toFixed(4)} E and covers ${b.area_ha.toFixed(2)} ha.`)
      } else if (b) {
        parts.push(`The largest spans pixels ${b.x0},${b.y0}–${b.x1},${b.y1} (${b.area_px} px); this image has no CRS, so no geographic position is claimed.`)
      }
    } else parts.push('Nothing matching that description was located in this scene.')
  } else {
    const e = items[0]
    if (e.unit === 'regions' || e.unit === 'areas') {
      parts.push(`${e.value}.`)
      if (e.mask_area_ha) parts.push(`Total extent ${e.mask_area_ha.toFixed(2)} ha.`)
    } else if (e.unit === 'ha') parts.push(`${e.value} hectares.`)
    else parts.push(e.value !== null ? `${e.value}.` : `${e.claim}.`)
    if (e.supporting.length) parts.push('Shares: ' + e.supporting.slice(0, 3).join('; ') + '.')
    const objs = items.filter((i) => i.claim.endsWith('objects in scene'))
    if (objs.length) parts.push('Objects counted: ' + objs.map((o) => `${o.value} ${o.claim.replace(' objects in scene', '')} ${plural(Number(o.value), 'region')}`).join(', ') + '.')
  }

  const conflicts = items.flatMap((e) => e.conflicts)
  if (conflicts.length) parts.push('Note: ' + conflicts[0])
  return parts.length ? parts.join(' ') : 'Analysis complete; see the evidence panel.'
}
