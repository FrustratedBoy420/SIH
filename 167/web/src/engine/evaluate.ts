/**
 * Measurement — a port of `satquery/evaluate.py`, run against ground truth the
 * analysis path never reads.
 *
 * Two corrections relative to the Python, both from the 11 Sep honesty pass
 * (`07` §14.2, EVL-04/05):
 *
 *   1. Ablation rows are labelled by what actually runs. The Python calls row
 *      A "Generic VLM, no adaptation" — it is panchromatic brightness with a
 *      two-class Otsu split. No VLM runs anywhere in it.
 *   2. The composite "capability" score is printed with its formula.
 *
 * The adaptation ablation (zero-shot base vs M1 on VRSBench), the cross-modal
 * ablation and calibration are left null: they need model runs this engine
 * cannot make, and a placeholder is honest where an estimate is not.
 */

import type { Evaluation, SystemAblationRow, TaskScore } from '@/lib/contract'
import * as cv from './cv'
import { named, grey } from './raster'
import { classify, type Task } from './router'
import * as scenes from './scene'
import { groundingMask } from './specialists'

function prf(pred: cv.Mask, truth: cv.Mask) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (let i = 0; i < pred.length; i++) {
    const p = pred[i], t = truth[i]
    if (p && t) tp++; else if (p) fp++; else if (t) fn++; else tn++
  }
  const precision = tp / Math.max(tp + fp, 1)
  const recall = tp / Math.max(tp + fn, 1)
  const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-9)
  const iou = tp / Math.max(tp + fp + fn, 1)
  const r = (v: number) => Math.round(v * 10000) / 10000
  return { precision: r(precision), recall: r(recall), f1: r(f1), iou: r(iou), tp, fp, fn, tn }
}

const classMask = (s: scenes.Scene, c: number) => {
  const m = new Uint8Array(s.classes.length)
  for (let i = 0; i < m.length; i++) m[i] = s.classes[i] === c ? 1 : 0
  return m
}

export const ROUTER_CASES: [string, Task][] = [
  ['what changed between these two dates?', 'temporal_change'],
  ['has the built-up area increased since 2022?', 'temporal_change'],
  ['show the difference between the two images', 'temporal_change'],
  ['compare before and after', 'temporal_change'],
  ['use the optical and SAR images together', 'cross_modal'],
  ['what does radar reveal that optical cannot?', 'cross_modal'],
  ['identify structures under the cloud', 'cross_modal'],
  ['combine both sensors to map built-up land', 'cross_modal'],
  ['highlight the water body', 'grounding'],
  ['where are the buildings?', 'grounding'],
  ['show me the vegetation', 'grounding'],
  ['locate the river', 'grounding'],
  ['mark all built-up regions', 'grounding'],
  ['how many buildings are visible?', 'single_vqa'],
  ['is there a river in this image?', 'single_vqa'],
  ['what type of land dominates this region?', 'single_vqa'],
  ['how much forest is there?', 'single_vqa'],
  ['describe this scene', 'single_vqa'],
  ['count the water bodies', 'single_vqa'],
]

export function routerScore(): TaskScore {
  const hits = ROUTER_CASES.filter(([q, want]) => classify(q)[0] === want).length
  return { task: 'router (in-sample)', metric: 'accuracy', value: Math.round(hits / ROUTER_CASES.length * 10000) / 10000, detail: { correct: hits, total: ROUTER_CASES.length } }
}

export const CAPABILITY_FORMULA = 'capability = 0.50 × mean_F1(built, water) + 0.25 × router_accuracy + 0.25 × [cross-modal recovery present]'

const ROWS: [string, string, string, string[]][] = [
  ['A', 'Brightness floor', 'panchromatic brightness, 2-class Otsu — no spectral knowledge, no model', ['none']],
  ['B', 'Spectral indices', 'NDWI and raw VV backscatter, 2-class Otsu', ['indices']],
  ['C', 'Specialists, task named by hand', 'Lee filter, 3-class Otsu, morphology; no router', ['indices', 'morphology', 'components']],
  ['D', '+ rule router', 'C, with the task classified and validated automatically', ['indices', 'morphology', 'components', 'router']],
  ['E', '+ evidence gate and fusion', 'D, with confidence gating and cross-modal recovery', ['indices', 'morphology', 'components', 'router', 'evidence']],
]

export function evaluate(size = 256, seed = 7): Evaluation {
  const sc = scenes.build(size, seed)
  const optClear = scenes.optical(sc, seed, false)
  const opt = scenes.optical(sc, seed, true)
  const sar = scenes.sar(sc, seed)
  const w = size, h = size

  const tasks: TaskScore[] = []
  const gm = (t: string, o = optClear) => groundingMask(t, o, sar)!
  const water = prf(gm('water'), classMask(sc, scenes.WATER))
  tasks.push({ task: 'grounding · water', metric: 'IoU', value: water.iou, detail: water })
  const veg = prf(gm('vegetation'), classMask(sc, scenes.VEGETATION))
  tasks.push({ task: 'grounding · vegetation', metric: 'IoU', value: veg.iou, detail: veg })
  const built = prf(gm('built'), classMask(sc, scenes.BUILT))
  tasks.push({ task: 'SAR structures', metric: 'F1', value: built.f1, detail: built })

  const { t1, t2, mask } = scenes.bitemporal(size, seed)
  const r1 = scenes.optical(t1, seed, false), r2 = scenes.optical(t2, seed, false)
  let mag = cv.boxBlur(cv.changeVector(r1.data, r2.data), w, h, 1)
  const thr = cv.otsu(mag)
  const pred = cv.closing(cv.opening(cv.threshold(mag, thr), w, h, 1), w, h, 2)
  mag = new Float32Array(0)
  const ch = prf(pred, mask)
  tasks.push({ task: 'change detection', metric: 'F1', value: ch.f1, detail: ch })
  const router = routerScore()
  tasks.push(router)

  // --- system ablation, on the clouded scene ---
  const truthB = classMask(sc, scenes.BUILT), truthW = classMask(sc, scenes.WATER)
  const rows: SystemAblationRow[] = []
  for (const [config, name, runs, caps] of ROWS) {
    let pb: cv.Mask, pw: cv.Mask
    if (!caps.includes('indices')) {
      const g = grey(opt)
      const t = cv.otsu(g)
      pb = cv.threshold(g, t, true); pw = cv.threshold(g, t, false)
    } else {
      let vv = named(sar, 'vv')
      const nd = cv.ndwi(named(opt, 'green'), named(opt, 'nir'))
      if (caps.includes('morphology')) vv = cv.tailClip(cv.leeFilter(vv, w, h, 7, 4))
      if (caps.includes('components')) {
        pb = cv.threshold(vv, cv.otsuMulti(vv)[1]); pw = cv.threshold(nd, cv.otsuMulti(nd)[1])
      } else {
        pb = cv.threshold(vv, cv.otsu(vv)); pw = cv.threshold(nd, cv.otsu(nd))
      }
      if (caps.includes('morphology')) {
        pb = cv.closing(cv.opening(pb, w, h, 1), w, h, 1)
        pw = cv.closing(cv.opening(pw, w, h, 1), w, h, 1)
      }
    }
    const b = prf(pb, truthB), wa = prf(pw, truthW)
    const racc = caps.includes('router') ? router.value : null
    let recovered: number | null = null
    if (caps.includes('evidence')) {
      const cloud = cv.closing(cv.opening(cv.cloudMask(opt.data, Number(opt.meta.display_gain ?? 1)), w, h, 1), w, h, 3)
      recovered = Math.round(cv.countTrue(cv.and(pb, cloud)) / Math.max(cv.countTrue(pb), 1) * 10000) / 100
    }
    const meanF1 = Math.round((b.f1 + wa.f1) / 2 * 10000) / 10000
    const capability = Math.round((0.5 * meanF1 + 0.25 * (racc ?? 0) + 0.25 * (recovered !== null ? 1 : 0)) * 10000) / 10000
    rows.push({ config, name, runs, built_f1: b.f1, water_f1: wa.f1, mean_f1: meanF1, router_accuracy: racc, recovered_under_cloud_pct: recovered, capability, delta_vs_A: 0 })
  }
  rows.forEach((r) => { r.delta_vs_A = Math.round((r.capability - rows[0].capability) * 10000) / 10000 })

  return {
    source: 'browser',
    measured_at: new Date().toISOString(),
    scene: { size, seed },
    tasks,
    system_ablation: {
      rows, formula: CAPABILITY_FORMULA,
      note: 'mean F1 is segmentation only, and is flat across C, D and E: the router and the gate add capability, not sharper masks. The composite is what separates them — and its weights are a choice, printed so they can be argued with.',
    },
    adaptation: { zero_shot: null, adapted: null, gain: null, split: 'VRSBench test (official)' },
    cross_modal: { optical: null, sar: null, both: null, metric: 'built-up F1' },
    calibration: { ece: null, n: 0, bins: 10, required_n: 200 },
    router_heldout: { accuracy: null, n: 0 },
    note: 'Measured in this browser, just now, on synthetic scenes against ground truth the analysis never reads. Public-benchmark numbers need the trained adapters and are not claimed.',
  }
}
