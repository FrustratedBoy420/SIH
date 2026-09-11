/**
 * The agentic router — a port of `satquery/router.py`.
 *
 * Classify → validate → select from a fixed registry → sequence → configure
 * permitted parameters. A plain function, not an agent framework (ADR-004).
 */

import type { Raster } from './raster'

export type Task = 'single_vqa' | 'grounding' | 'temporal_change' | 'cross_modal' | 'unknown'
export type InputModality = 'single' | 'bi_temporal' | 'optical_sar' | 'none'

export interface RegistryEntry {
  tasks: Task[]
  requires: 'single' | 'bi_temporal' | 'optical_sar'
  accepts: string[]
  outputs: string[]
  adapter: string
  params: Record<string, [number, number, number]>
  description: string
}

export const REGISTRY: Record<string, RegistryEntry> = {
  rs_vqa: {
    tasks: ['single_vqa'], requires: 'single', accepts: ['optical', 'sar'],
    outputs: ['text', 'confidence'], adapter: 'adapter_A_rs_general',
    params: { threshold: [0, 1, 0.45] }, description: 'Remote-sensing visual question answering.',
  },
  grounding: {
    tasks: ['grounding'], requires: 'single', accepts: ['optical', 'sar'],
    outputs: ['boxes', 'confidence'], adapter: 'adapter_B_grounding',
    params: { threshold: [0, 1, 0.45] }, description: 'Text-guided region grounding, returning georeferenced boxes.',
  },
  change_vqa: {
    tasks: ['temporal_change'], requires: 'bi_temporal', accepts: ['optical', 'sar'],
    outputs: ['text', 'change_regions', 'confidence'], adapter: 'adapter_C_change',
    params: { threshold: [0, 1, 0.45] }, description: 'Change detection and change VQA over a bi-temporal pair.',
  },
  optical_sar: {
    tasks: ['cross_modal'], requires: 'optical_sar', accepts: ['optical', 'sar'],
    outputs: ['text', 'evidence', 'confidence'], adapter: 'fusion_late_v0',
    params: { threshold: [0, 1, 0.45] }, description: 'Complementary extraction from a co-registered optical-SAR pair.',
  },
}

/** Which supplied modalities SATISFY each requirement — a superset relation. */
const SATISFIES: Record<string, InputModality[]> = {
  single: ['single', 'optical_sar', 'bi_temporal'],
  optical_sar: ['optical_sar'],
  bi_temporal: ['bi_temporal'],
}

export interface Inputs { optical?: Raster; sar?: Raster; t1?: Raster; t2?: Raster }

export function modalityOf(i: Inputs): InputModality {
  if (i.t1 && i.t2) return 'bi_temporal'
  if (i.optical && i.sar) return 'optical_sar'
  if (i.optical || i.sar) return 'single'
  return 'none'
}

const PATTERNS: [Task, RegExp][] = [
  ['temporal_change', /\b(chang(e|ed|es|ing)|differ(ence|ent)?|between these two|since|before and after|bi-?temporal|grew|expansion|new .*(built|construct))\b/],
  ['cross_modal', /\b(sar|radar|backscatter|both (images|sensors)|together|complementary|cross[- ]modal|optical and|under (the )?cloud)\b/],
  ['grounding', /\b(highlight|where (is|are)|show me|locate|mark|outline|delineate|find the|point out)\b/],
  ['single_vqa', /\b(how many|count|number of|is there|are there|what (type|kind)|describe|dominant|how much|what is)\b/],
]

/**
 * RQ-5 has no explicit temporal keyword ("Has the built-up area increased,
 * decreased, or remained unchanged?") yet must reach change analysis (RTR-06).
 * The Python rules miss it; this pattern is the frontend's fix, flagged in the
 * trace so it cannot pass as the backend's behaviour.
 */
const TREND = /\b(increas(e|ed|ing)|decreas(e|ed|ing)|remained unchanged|grown|shrunk|trend)\b/

export function classify(query: string): [Task, number, string] {
  const q = (query || '').toLowerCase().trim()
  if (!q) return ['unknown', 0, 'empty query']
  for (const [task, re] of PATTERNS) {
    const m = re.exec(q)
    if (m) return [task, 0.86, `matched /${m[0]}/`]
  }
  const t = TREND.exec(q)
  if (t) return ['temporal_change', 0.74, `matched trend /${t[0]}/ (preview rule, RTR-06)`]
  return ['single_vqa', 0.42, 'no rule matched; defaulted to single-image VQA']
}

export interface Plan {
  valid: boolean
  task: Task
  tools: string[]
  params: Record<string, number>
  modality_required: string
  modality_found: string
  reason: string
  remedy: string
  task_confidence: number
  rule: string
}

const NAMES: Record<string, string> = {
  single: 'one image', bi_temporal: 'a bi-temporal pair',
  optical_sar: 'a co-registered optical and SAR pair', none: 'no images',
}

const REMEDY: Record<string, string> = {
  bi_temporal: 'Upload an image for T1 and an image for T2 — two dates of the same area.',
  optical_sar: 'Upload a co-registered optical image and a SAR image of the same area.',
  single: 'Upload at least one image.',
  none: 'Upload at least one image.',
}

export function plan(query: string, inputs: Inputs, threshold = 0.45): Plan {
  const [task, conf, rule] = classify(query)
  const base = { tools: [], params: {}, modality_required: '', modality_found: '', task_confidence: conf, rule }
  if (task === 'unknown') {
    return { ...base, valid: false, task, reason: 'No query was supplied.', remedy: 'Ask a question about the imagery.' }
  }
  const tool = Object.keys(REGISTRY).find((n) => REGISTRY[n].tasks.includes(task))!
  const required = REGISTRY[tool].requires
  const found = modalityOf(inputs)

  // ---- the compatibility gate ----
  if (!SATISFIES[required].includes(found)) {
    return {
      ...base, valid: false, task, modality_required: required, modality_found: found,
      reason: `This question needs ${NAMES[required]}, but ${NAMES[found]} ${found === 'single' || found === 'none' ? 'was' : 'were'} supplied.`,
      remedy: REMEDY[required],
    }
  }

  // ---- geography needs a CRS (07 §8.2, TRD §5.3) ----
  if (task === 'temporal_change' || task === 'cross_modal') {
    const needed = task === 'temporal_change' ? [inputs.t1, inputs.t2] : [inputs.optical, inputs.sar]
    const bare = needed.find((r) => r && !r.georeferenced)
    if (bare) {
      return {
        ...base, valid: false, task, modality_required: required, modality_found: found,
        reason: `${bare.source} has no coordinate reference system. ${task === 'temporal_change' ? 'Change analysis' : 'Cross-modal analysis'} needs georeferenced imagery.`,
        remedy: 'Upload a GeoTIFF that carries a CRS and geotransform.',
      }
    }
  }

  const [lo, hi, def] = REGISTRY[tool].params.threshold
  const params = { threshold: Number.isFinite(threshold) ? Math.min(Math.max(threshold, lo), hi) : def }
  const tools = [tool]
  if (task === 'cross_modal' && /\b(where|highlight|locate|show)\b/.test((query || '').toLowerCase())) tools.push('grounding')

  return {
    ...base, valid: true, task, tools, params, modality_required: required, modality_found: found,
    reason: found === required ? `${found} satisfies ${tool}` : `${found} satisfies ${tool} (needs ${required}; a superset was supplied)`,
    remedy: '',
  }
}
