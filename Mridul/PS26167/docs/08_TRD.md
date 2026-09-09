# PS26167 — Technical Requirements Document

**SatQuery AI** · SIH 2026 · ISRO · v0.3.0-mvp · 2026-09-10

A modern TRD is a **contract, not a description**. Every requirement below is atomic, testable, traced back to a problem-statement clause and forward to the component and the check that proves it. If a row cannot be checked, it does not belong here.

**Verification key** — `T` automated self-test (`python -m satquery.cli selftest`) · `E` measured by `cli eval` · `U` headless UI check (`node web/verify.mjs`) · `M` manual

---

## 1. Scope

Point at [`00_Official_Problem_Statement.md`](00_Official_Problem_Statement.md) for the requirement and [`05_System_Design.md`](05_System_Design.md) for the structure. This document does not restate either.

**In scope:** the five mandatory capabilities, input validation and refusal, evidence-grounded output, the execution trace, and a web application.
**Out of scope:** training foundation models, research-grade co-registration, authentication, satellite tasking.

---

## 2. Functional requirements

### 2.1 Ingestion

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-001 | Accept GeoTIFF/TIFF and read CRS, geotransform, band count and sensor | §Defined Input Scope | `raster.read` | T |
| TR-002 | Accept PNG/JPEG **only** for prescribed benchmark datasets, flagged `georeferenced=false` | §Defined Input Scope | `raster.read`, `GeoTransform.identity` | T |
| TR-003 | A pixel position converts to EPSG:4326 and back within 1e-6 px | §Expected Solution | `GeoTransform` | T |
| TR-004 | A malformed raster raises a typed, readable error — never a stack trace to the user | NFR | `raster.read` | T |
| TR-005 | Band access by name raises rather than silently returning the wrong band | safety | `Raster.named` | T |
| TR-006 | A written GeoTIFF reads back with geotransform and CRS intact | deliverable | `raster.write_geotiff` | T |

### 2.2 Validation and refusal

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-010 | Report the number, modality, format, metadata and compatibility of inputs | §5.5 | `Inputs.manifest` | T |
| TR-011 | A task whose modality requirement is unmet is **refused**, and **no model is invoked** | §5.5 | `router.plan` | T |
| TR-012 | A refusal states what to upload instead | usability | `router._remedy` | T |
| TR-013 | A single-image task is satisfiable by a **superset** of inputs (a pair, or a bi-temporal pair) | §5.5 | `router.SATISFIES` | T |
| TR-014 | Co-registration is **validated**, not solved; offset reported in pixels | §Evaluation | `raster.coregistration_offset` | T |
| TR-015 | A misregistered pair lowers confidence and records a conflict | correctness | `Change.run` | T |
| TR-016 | Every result carries the same shape — `evidence.items` is `[]` on a refusal, never absent | API contract | `Pipeline._refuse` | T |

### 2.3 Single-image capabilities — §5.2

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-020 | Visual question answering over one image — **mandatory** | §5.2 | `specialists.VQA` | T |
| TR-021 | Text-guided region grounding returning georeferenced boxes — the chosen second task (ADR-002) | §5.2 | `specialists.Grounding` | T |
| TR-022 | Counting questions resolve to connected-component labelling, not a language model | ADR-007 | `VQA._intent` | T |
| TR-023 | A target outside the vocabulary fails loudly rather than grounding something else | safety | `resolve_target` | T |
| TR-024 | Thresholds adapt per scene, clamped to a physical floor where one exists | correctness | `Grounding._threshold` | E |
| TR-025 | Linear features are not eroded by morphological opening | correctness | `TARGETS[...].linear` | E |

### 2.4 Change analysis — §5.3

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-030 | Detect and describe change across a bi-temporal pair — **mandatory** | §5.3 | `specialists.Change` | T |
| TR-031 | Report changed area in hectares and as a share of the scene | §5.3 | `Change.run` | T |
| TR-032 | Classify change **semantically** (construction vs regrowth), not merely detect it | §5.3 | `Change._semantics` | T |
| TR-033 | Emit a spatial change map as georeferenced geometry | §5.3 optional | `evidence.EvidenceSet.geojson` | T |

### 2.5 Cross-modal analysis — §5.4

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-040 | Extract **complementary** information from a co-registered optical–SAR pair — **mandatory** | §5.4 | `specialists.Fusion` | T |
| TR-041 | Quantify the optical scene unusable through cloud, as a percentage | §5.4 | `cv.cloud_mask` | E |
| TR-042 | Report built-up area **recovered by SAR beneath cloud** — information neither sensor gives alone | §5.4 | `Fusion.run` | T |
| TR-043 | SAR is processed by its own encoder path, never as a greyscale photograph | ADR-003 | `cv.lee_filter`, `Fusion` | M |
| TR-044 | Per-modality evidence remains separable (late fusion) | ADR-005 | `Fusion.run` | T |
| TR-045 | Modality disagreement is recorded as a conflict and lowers confidence | correctness | `Fusion.run` | T |

### 2.6 Agentic orchestration — §5.5

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-050 | Classify the requested task from the query | §5.5 | `router.classify` | E |
| TR-051 | Select tools **only** from a predefined registry — never invent one | §5.5 | `router.REGISTRY` | T |
| TR-052 | Configure **only** permitted parameters, clamped to range | §5.5 | `router.plan` | T |
| TR-053 | Sequence more than one tool where the query needs it | §5.5 | `router.plan` | T |
| TR-054 | Emit an auditable execution summary: task, tools, parameters, outputs | §5.5 | `pipeline.Trace` | T |
| TR-055 | The trace contains **no** internal reasoning text | §5.5, ADR-008 | `pipeline.Trace` | T |

### 2.7 Evidence and output

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-060 | Every claim carries a confidence derived from measured class separation | §Expected Solution | `confidence_from_separation` | T |
| TR-061 | Below threshold the system **abstains** rather than answering | trust | `EvidenceSet.abstain` | T |
| TR-062 | The answer layer receives evidence and **never** a raster | ADR-007 | `pipeline.answer` | T |
| TR-063 | Spatial evidence exports as GeoJSON in EPSG:4326 | §Expected Solution | `EvidenceSet.geojson` | T, U |
| TR-064 | Every claim names the model and version that produced it | auditability | `Evidence.source_model` | T |
| TR-065 | Runs persist with seed and environment, so any run replays | reproducibility | `pipeline.save_run` | M |

### 2.8 Data and models

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-070 | Name all four public datasets plus the hidden ISRO/SAC set, with purpose and scale | §Background | `datasets.REGISTRY` | T |
| TR-071 | Report **real** local dataset state — never an aspirational list | honesty | `datasets.status` | T |
| TR-072 | The ISRO/SAC set is marked `unavailable` and is never treated as obtainable | §Evaluation | `datasets.REGISTRY` | T |
| TR-073 | Report which model weights exist on disk and which do not | honesty | `datasets.models` | U |
| TR-074 | Splits are geographic at tile level, never random | ADR-006 | `08_Data_Engineering` | M |
| TR-075 | Ground truth is read **only** by the evaluator, never by any analysis module | integrity | `evaluate` | T |

### 2.9 Interface

| ID | Requirement | Trace | Component | Verify |
|---|---|---|---|---|
| TR-080 | Interactive web application | §Expected Solution | `web/` | U |
| TR-081 | The execution trace is visible without navigating away | ADR-008 | `App.tsx` | U |
| TR-082 | Evidence appears above the trace — a judge reads it first | usability | `App.tsx` | U |
| TR-083 | Optical, SAR and fusion are separable and comparable in one gesture | §5.4 | `ModalityStack.tsx` | U |
| TR-084 | Synthetic imagery is disclosed prominently and permanently | integrity | `App.tsx` banner | U |
| TR-085 | Evidence geometry is downloadable as GeoJSON | §Expected Solution | `App.tsx` | U |
| TR-086 | The interface degrades usefully without WebGL | robustness | `ModalityStack.tsx` | M |

---

## 3. Non-functional requirements

Written as **testable scenarios**. "The system should be fast" cannot be checked; these can.

| ID | Scenario | Target | Measured |
|---|---|---|---|
| NFR-01 | Cross-modal query, 512 px, venue laptop, no network | < 15 s p95 | **~90 ms** |
| NFR-02 | Single-image query | < 8 s p95 | **~60 ms** |
| NFR-03 | Refusal — inputs cannot support the question | < 1 s, no model invoked | **~0 ms** |
| NFR-04 | Full self-test | < 30 s | **~1.0 s** |
| NFR-05 | Runs with no network at any point after install | mandatory | **holds** |
| NFR-06 | Runs with no GPU | mandatory | **holds** |
| NFR-07 | Runs with neither `torch`, `rasterio`, `scipy` nor `opencv` | mandatory | **holds** — numpy + Pillow only |
| NFR-08 | Inference VRAM once adapters are loaded | ≤ 8 GB at 4-bit | not yet measurable |
| NFR-09 | Frontend production bundle | < 1.5 MB | **1.16 MB** (309 kB gzipped) |
| NFR-10 | Confidence is calibrated | ECE reported | **0.033** |
| NFR-11 | Malformed input produces a readable error | no stack trace | **holds** |
| NFR-12 | Deterministic under a recorded seed | mandatory | **holds** |
| NFR-13 | Zero console errors in the running UI | mandatory | **holds** |

---

## 4. Interface requirements

### 4.1 HTTP API

| Method | Route | Returns |
|---|---|---|
| GET | `/api/health` | version, engine, whether adapters are loaded |
| GET | `/api/scene` | scene metadata for every layer |
| GET | `/api/scene/{layer}.png` | `optical` · `sar` · `fusion` · `t1` · `t2` |
| GET | `/api/datasets` | dataset registry with real local state |
| GET | `/api/models` | model registry with weight status |
| GET | `/api/registry` | the tool registry the router selects from |
| GET | `/api/evaluation` | task metrics and the A–E ablation |
| POST | `/api/query` | `{query, mode, threshold}` → full result |
| GET | `/api/runs`, `/api/runs/{id}` | persisted runs |

**TR-090** — every response carries the same shape regardless of outcome. A refused query returns `evidence.items = []`, not an absent field.

### 4.2 Result contract

```jsonc
{
  "query": "...", "answer": "...",
  "refused": false, "abstained": false, "confidence": 0.93,
  "task": "cross_modal", "tools": ["optical_sar"],
  "params": { "threshold": 0.45 },
  "evidence": { "threshold": 0.45, "confidence": 0.93, "abstain": false,
                "count": 5, "passing": 5, "items": [ /* Evidence */ ] },
  "geojson": { "type": "FeatureCollection", "features": [ /* EPSG:4326 */ ] },
  "trace":   [ { "step": "...", "detail": "...", "ok": true, "ms": 2.0 } ],
  "manifest": { "modality": "optical_sar", "count": 2, "rasters": [ /* ... */ ] },
  "elapsed_ms": 90.3, "version": "0.3.0-mvp", "engine": "classical"
}
```

### 4.3 Refusal conditions

| Condition | Response |
|---|---|
| No imagery supplied | refuse; ask for at least one image |
| Bi-temporal task, no second date | refuse; ask for T1 and T2 |
| Cross-modal task, one sensor only | refuse; ask for a co-registered optical–SAR pair |
| Target outside the vocabulary | proceed, then abstain at the confidence gate |
| Everything below threshold | abstain; make no claim |

---

## 5. Data requirements

| ID | Requirement |
|---|---|
| TR-100 | BigEarthNet.txt is the primary adaptation set — §5.1 |
| TR-101 | VRSBench, RSVQA and CDVQA are used with their **official** splits |
| TR-102 | Splits are geographic at tile level; never random — ADR-006 |
| TR-103 | Nothing over 100 MB is committed; `data/`, `adapters/`, `runs/` are ignored |
| TR-104 | The full 145 GB BigEarthNet imagery is streamed or subset, never bulk-downloaded |
| TR-105 | Ground truth is visible to `evaluate` alone |

---

## 6. Constraints and assumptions

| # | Constraint | Consequence |
|---|---|---|
| C-1 | The ISRO/SAC evaluation set is undisclosed | Optimise robustness, not benchmark peak |
| C-2 | Scored pairs arrive pre-georeferenced and co-registered | Validate alignment; do not solve it |
| C-3 | **The judging weight table is missing from the PS** | Balance across all five mandatory capabilities |
| C-4 | No GPU available during development | Classical path is real and measured; the neural slot is wired |
| C-5 | Venue may have no network | No runtime external calls anywhere |
| C-6 | Deliverable includes models | Check every base-model licence before training — ADR-010 |

---

## 7. Verification summary

| Suite | Command | Result |
|---|---|---|
| Self-test — 30 checks | `python -m satquery.cli selftest` | **30 / 30** |
| Metrics and ablation | `python -m satquery.cli eval` | see below |
| Headless UI — 20 checks | `node web/verify.mjs` | **20 / 20**, zero console errors |
| Type check + build | `npm run build` | clean |

### Measured, against ground truth the pipeline never reads

| Task | Metric | Value |
|---|---|---|
| Water grounding | IoU | **1.0000** |
| Vegetation grounding | IoU | **0.9958** |
| SAR built-up detection | F1 | **0.9450** |
| Bi-temporal change | F1 | **0.7698** |
| Router dispatch | accuracy | **1.0000** |
| Confidence calibration | ECE | **0.0328** |

### Ablation

| Config | Capability | Δ vs A |
|---|---|---|
| A · generic, no adaptation | 0.086 | — |
| B · remote-sensing adapted | 0.106 | +0.020 |
| C · specialists, no router | 0.453 | +0.367 |
| D · specialists + router | 0.703 | +0.617 |
| **E · + evidence fusion and gating** | **0.953** | **+0.867** |

**Not claimed:** public-benchmark numbers on VRSBench, RSVQA or CDVQA. Those require the trained adapters, and stating them before running them would be fabrication.

---

## 8. Open

| ID | Item | Blocked on |
|---|---|---|
| OPEN-1 | Train M1–M3 LoRA adapters | a 24 GB GPU |
| OPEN-2 | Public-benchmark evaluation | OPEN-1 |
| OPEN-3 | Confirm the submission deadline | the SPOC |
| OPEN-4 | Recover the truncated `Dataset Link` field | the SIH portal |
| OPEN-5 | Base-model licence audit | ADR-010 |
