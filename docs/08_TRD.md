# PS26167 — Technical Requirements Document

**SatQuery AI** · SIH 2026 · ISRO · v0.4.0-mvp · 2026-09-11

A modern TRD is a **contract, not a description**. Every requirement below is atomic, testable, traced back to a problem-statement clause and forward to the component and the check that proves it. If a row cannot be checked, it does not belong here. Every row now also carries an **Owner**, because the team is two people with disjoint skill — Mridul is the ML specialist, Shreyash does everything the PS needs that is not model training — and a contract nobody is assigned to is not a contract.

**Verification key** — `T` automated self-test (`python -m satquery.cli selftest`) · `E` measured by `cli eval` · `U` headless UI check (`node web/verify.mjs`) · `M` manual · **bold Verify** = not yet met, tracked in §8

This revision is corrected against `09_External_Review_And_Recommendation.md` (reviewed commit `2d55bd3`, findings unchanged as of `554da63`) and against `10_Decision_Record.md`. Three kinds of change from the previous revision: rows added for real gaps the review found (upload, stdlib serving, held-out router), one table relabelled because its old label was itself a finding (ablation row A), and an Owner column added throughout.

---

## 1. Scope

Point at [`00_Official_Problem_Statement.md`](00_Official_Problem_Statement.md) for the requirement and [`05_System_Design.md`](05_System_Design.md) for the structure. This document does not restate either.

**In scope:** the five mandatory capabilities, input upload and validation and refusal, evidence-grounded output, the execution trace, and a web application.
**Out of scope:** training foundation models, research-grade co-registration, authentication, satellite tasking, RSVQA/CDVQA benchmark loaders (deferred to M2–M3).

---

## 2. Functional requirements

### 2.1 Ingestion

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-001 | Accept GeoTIFF/TIFF and read CRS, geotransform, band count and sensor | §Defined Input Scope | `raster.read` | T | Shreyash |
| TR-002 | Accept PNG/JPEG **only** for prescribed benchmark datasets, flagged `georeferenced=false` | §Defined Input Scope | `raster.read`, `GeoTransform.identity` | T | Shreyash |
| TR-003 | A pixel position converts to EPSG:4326 and back within 1e-6 px | §Expected Solution | `GeoTransform` | T | Shreyash |
| TR-004 | A malformed raster raises a typed, readable error — never a stack trace to the user | NFR | `raster.read` | T | Shreyash |
| TR-005 | Band access by name raises rather than silently returning the wrong band | safety | `Raster.named` | T | Shreyash |
| TR-006 | A written GeoTIFF reads back with geotransform and CRS intact | deliverable | `raster.write_geotiff` | T | Shreyash |
| **TR-007** | **A file `POST`ed to an upload route reaches `raster.read()` and returns the same compatibility manifest as the synthetic path** | §Defined Input Scope, "**Input upload and compatibility checking**" — **mandatory** | new: an `/api/upload` route in `server.py` | **not met — no route exists** | Shreyash |

`raster.read()` (`raster.py:263`) is the hard half of TR-007 and it already exists, is already exercised by `tests.py`, and works. The missing half is the easy half: a multipart `POST` handler that hands the uploaded bytes to it. Per `09_External_Review…` §4.1, this is the single highest-value fix in the document — it is a mandatory deliverable line and the first thing an evaluator will try. Checkpoint 24 Sep, per `10_Decision_Record.md` §8.

### 2.2 Validation and refusal

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-010 | Report the number, modality, format, metadata and compatibility of inputs | §5.5 | `Inputs.manifest` | T | Shreyash |
| TR-011 | A task whose modality requirement is unmet is **refused**, and **no model is invoked** | §5.5 | `router.plan` | T | Shreyash |
| TR-012 | A refusal states what to upload instead | usability | `router._remedy` | T | Shreyash |
| TR-013 | A single-image task is satisfiable by a **superset** of inputs (a pair, or a bi-temporal pair) | §5.5 | `router.SATISFIES` | T | Shreyash |
| TR-014 | Co-registration is **validated**, not solved; offset reported in pixels | §Evaluation | `raster.coregistration_offset` | T | Shreyash |
| TR-015 | A misregistered pair lowers confidence and records a conflict | correctness | `Change.run` | T | Mridul |
| TR-016 | Every result carries the same shape — `evidence.items` is `[]` on a refusal, never absent | API contract | `Pipeline._refuse` | T | Shreyash |
| TR-017 | TR-007's upload path runs through the same manifest and refusal logic as the synthetic path — no separate, weaker validation branch | integrity | `Inputs.manifest` | **not met — blocked on TR-007** | Shreyash |

### 2.3 Single-image capabilities — §5.2

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-020 | Visual question answering over one image — **mandatory** | §5.2 | `specialists.VQA` | T | Mridul |
| TR-021 | Text-guided region grounding returning georeferenced boxes — the chosen second task (ADR-002) | §5.2 | `specialists.Grounding` | T | Mridul |
| TR-022 | Counting questions resolve to connected-component labelling, not a language model | ADR-007 | `VQA._intent` | T | Mridul |
| TR-023 | A target outside the vocabulary fails loudly rather than grounding something else | safety | `resolve_target` | T | Mridul |
| TR-024 | Thresholds adapt per scene, clamped to a physical floor where one exists | correctness | `Grounding._threshold` | E | Mridul |
| TR-025 | Linear features are not eroded by morphological opening | correctness | `TARGETS[...].linear` | E | Mridul |
| TR-026 | At least one of TR-020/021's underlying models is remote-sensing **adapted** — the disqualifying requirement | §5.1, §Background — **mandatory** | new: an adapter loaded into `specialists.VQA` or `.Grounding` via `Pipeline(adapters=...)` | **not met — zero neural code in the tree** | Mridul |

### 2.4 Change analysis — §5.3

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-030 | Detect and describe change across a bi-temporal pair — **mandatory** | §5.3 | `specialists.Change` | T | Mridul |
| TR-031 | Report changed area in hectares and as a share of the scene | §5.3 | `Change.run` | T | Mridul |
| TR-032 | Classify change **semantically** (construction vs regrowth), not merely detect it | §5.3 | `Change._semantics` | T | Mridul |
| TR-033 | Emit a spatial change map as georeferenced geometry | §5.3 optional | `evidence.EvidenceSet.geojson` | T | Shreyash |

### 2.5 Cross-modal analysis — §5.4

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-040 | Extract **complementary** information from a co-registered optical–SAR pair — **mandatory** | §5.4 | `specialists.Fusion` | T | Mridul |
| TR-041 | Quantify the optical scene unusable through cloud, as a percentage | §5.4 | `cv.cloud_mask` | E | Mridul |
| TR-042 | Report built-up area **recovered by SAR beneath cloud** — information neither sensor gives alone | §5.4 | `Fusion.run` | T | Mridul |
| TR-043 | SAR is processed by its own encoder path, never as a greyscale photograph | ADR-003 | `cv.lee_filter`, `Fusion` | M | Mridul |
| TR-044 | Per-modality evidence remains separable (late fusion) | ADR-005 | `Fusion.run` | T | Mridul |
| TR-045 | Modality disagreement is recorded as a conflict and lowers confidence | correctness | `Fusion.run` | T | Mridul |

### 2.6 Agentic orchestration — §5.5

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-050 | Classify the requested task from the query | §5.5 | `router.classify` | E | Shreyash |
| TR-051 | Select tools **only** from a predefined registry — never invent one | §5.5 | `router.REGISTRY` | T | Shreyash |
| TR-052 | Configure **only** permitted parameters, clamped to range | §5.5 | `router.plan` | T | Shreyash |
| TR-053 | Sequence more than one tool where the query needs it | §5.5 | `router.plan` | T | Shreyash |
| TR-054 | Emit an auditable execution summary: task, tools, parameters, outputs | §5.5 | `pipeline.Trace` | T | Shreyash |
| TR-055 | The trace contains **no** internal reasoning text | §5.5, ADR-008 | `pipeline.Trace` | T | Shreyash |
| **TR-056** | **Router dispatch accuracy is reported on a held-out paraphrase set that was not used to write `router.py`'s patterns** | measurement integrity — `09_External_Review…` §5.1 | new: ~200 hand-written paraphrases, split, evaluated against the existing 4 regexes | **not met — the only figure that exists (1.0000) is measured on the 19 examples the 4 patterns were written from** | Shreyash |

TR-056 exists because of a specific, checkable defect: `router.py:144` defines 4 regex patterns, `evaluate.py:195`'s `ROUTER_CASES` defines 19 labelled queries, and all 19 are matched by a pattern written to match them. That is not a dispatch-accuracy measurement, it is a restatement that the regexes were written after the examples. Target once held-out: **~0.85** (`10_Decision_Record.md` §3). Expect it to be lower than 1.0000, and report that — a router at 0.82 on unseen phrasing is a stronger claim than 1.00 on its own construction.

### 2.7 Evidence and output

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-060 | Every claim carries a confidence derived from measured class separation | §Expected Solution | `confidence_from_separation` | T | Shreyash (harness), Mridul (whether it stays valid once neural) |
| TR-061 | Below threshold the system **abstains** rather than answering | trust | `EvidenceSet.abstain` | T | Shreyash |
| TR-062 | The answer layer receives evidence and **never** a raster | ADR-007 | `pipeline.answer` | T | Shreyash |
| TR-063 | Spatial evidence exports as GeoJSON in EPSG:4326 | §Expected Solution | `EvidenceSet.geojson` | T, U | Shreyash |
| TR-064 | Every claim names the model and version that produced it | auditability | `Evidence.source_model` | T | Shreyash |
| TR-065 | Runs persist with seed and environment, so any run replays | reproducibility | `pipeline.save_run` | M | Shreyash |

### 2.8 Data and models

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-070 | Name all four public datasets plus the hidden ISRO/SAC set, with purpose and scale | §Background | `datasets.REGISTRY` | T | Shreyash |
| TR-071 | Report **real** local dataset state — never an aspirational list | honesty | `datasets.status` | T | Shreyash |
| TR-072 | The ISRO/SAC set is marked `unavailable` and is never treated as obtainable | §Evaluation | `datasets.REGISTRY` | T | Shreyash |
| TR-073 | Report which model weights exist on disk and which do not | honesty | `datasets.models` | U | Shreyash |
| TR-074 | Splits are geographic at tile level, never random | ADR-006 | training pipeline | M | Mridul |
| TR-075 | Ground truth is read **only** by the evaluator, never by any analysis module | integrity | `evaluate` | T | Shreyash |

### 2.9 Interface

| ID | Requirement | Trace | Component | Verify | Owner |
|---|---|---|---|---|---|
| TR-080 | Interactive web application | §Expected Solution | `web/` | U | Shreyash |
| TR-081 | The execution trace is visible without navigating away | ADR-008 | `App.tsx` | U | Shreyash |
| TR-082 | Evidence appears above the trace — a judge reads it first | usability | `App.tsx` | U | Shreyash |
| TR-083 | Optical, SAR and fusion are separable and comparable in one gesture | §5.4 | `ModalityStack.tsx` | U | Shreyash |
| TR-084 | Synthetic imagery is disclosed prominently and permanently | integrity | `App.tsx` banner | U | Shreyash |
| TR-085 | Evidence geometry is downloadable as GeoJSON | §Expected Solution | `App.tsx` | U | Shreyash |
| TR-086 | The interface degrades usefully without WebGL | robustness | `ModalityStack.tsx` | M | Shreyash |
| **TR-087** | **The built UI is served identically whether or not FastAPI is installed** | README's own dependency claim ("numpy and Pillow. No torch...") vs `cli serve` | `server.py` `_serve_stdlib` | **not met — 404 at `/` on the stdlib path** | Shreyash |
| TR-088 | An upload control exists in the interface and calls TR-007 | §Defined Input Scope | `Workstation.tsx` | **not met — blocked on TR-007** | Shreyash |

TR-087: `server.py:243–245` mounts `web/dist` only inside the FastAPI branch; `_serve_stdlib`'s `do_GET` has no static-file case at all. On the numpy+Pillow-only install the README specifies, `cli serve` starts, answers `/api/health` with 200, and returns 404 for `/`. Fix is ~20 minutes: either declare `fastapi`+`uvicorn` as real dependencies, or add a static-file branch to `_serve_stdlib`. Checkpoint: **11 Sep, today** — `10_Decision_Record.md` §8 calls this "trivial — no excuse."

---

## 3. Non-functional requirements

Written as **testable scenarios**. "The system should be fast" cannot be checked; these can.

| ID | Scenario | Target | Measured | Owner |
|---|---|---|---|---|
| NFR-01 | Cross-modal query, 512 px, venue laptop, no network | < 15 s p95 | **~90 ms** | Shreyash |
| NFR-02 | Single-image query | < 8 s p95 | **~60 ms** | Shreyash |
| NFR-03 | Refusal — inputs cannot support the question | < 1 s, no model invoked | **~0 ms** | Shreyash |
| NFR-04 | Full self-test | < 30 s | **~1.4 s** | Shreyash |
| NFR-05 | Runs with no network at any point after install | mandatory | **holds** | Shreyash |
| NFR-06 | Runs with no GPU | mandatory | **holds** | Shreyash |
| NFR-07 | Runs with neither `torch`, `rasterio`, `scipy` nor `opencv` | mandatory | **holds** — numpy + Pillow only | Shreyash |
| NFR-08 | Inference VRAM once adapters are loaded | ≤ 8 GB at 4-bit | **not yet measurable — no adapter trained** | Mridul |
| NFR-09 | Frontend production bundle | < 1.5 MB | **1.16 MB** (309 kB gzipped) | Shreyash |
| NFR-10 | Confidence is calibrated | ECE reported | **0.0328** | Shreyash |
| NFR-11 | Malformed input produces a readable error | no stack trace | **holds** | Shreyash |
| NFR-12 | Deterministic under a recorded seed | mandatory | **holds** | Shreyash |
| NFR-13 | Zero console errors in the running UI | mandatory | **holds** | Shreyash |
| **NFR-14** | **`node web/verify.mjs`'s answer assertion is not coupled to a Tailwind utility class** | test integrity — `09_External_Review…` §2.2 | **not met** — `verify.mjs:121` locates the answer with `page.locator('p.text-\[13px\]')`, which the `2d55bd3` restyle broke; **26/27 pass, the 1 failure is this, and it is a false alarm about a real, working feature** | Shreyash |

---

## 4. Interface requirements

### 4.1 HTTP API

| Method | Route | Returns | Owner |
|---|---|---|---|
| GET | `/api/health` | version, engine, whether adapters are loaded | Shreyash |
| GET | `/api/scene` | scene metadata for every layer | Shreyash |
| GET | `/api/scene/{layer}.png` | `optical` · `sar` · `fusion` · `t1` · `t2` | Shreyash |
| GET | `/api/datasets` | dataset registry with real local state | Shreyash |
| GET | `/api/models` | model registry with weight status | Shreyash |
| GET | `/api/registry` | the tool registry the router selects from | Shreyash |
| GET | `/api/evaluation` | task metrics and the A–E ablation | Shreyash |
| POST | `/api/query` | `{query, mode, threshold}` → full result | Shreyash |
| GET | `/api/runs`, `/api/runs/{id}` | persisted runs | Shreyash |
| **POST** | **`/api/upload`** | **manifest from an uploaded GeoTIFF/TIFF, per TR-007 — does not exist yet** | Shreyash |

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
  "elapsed_ms": 90.3, "version": "0.4.0-mvp", "engine": "classical"
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
| *(once TR-007 lands)* an uploaded file fails the manifest check | refuse on the same terms as the synthetic path — TR-017 |

---

## 5. Data requirements

| ID | Requirement | Owner |
|---|---|---|
| TR-100 | **VRSBench**, not the full BigEarthNet imagery, is the M1 training corpus. `BigEarthNet.txt` is 467 MB of annotations keyed by `patch_id`/`s1_name`; the pixels those keys point at are a separate 155 GB dataset that does not fit the schedule or the available disk | Mridul |
| TR-101 | VRSBench, RSVQA and CDVQA are used with their **official** splits, when their loaders exist (M2–M3) | Mridul |
| TR-102 | Splits are geographic at tile level; never random — ADR-006 | Mridul |
| TR-103 | Nothing over 100 MB is committed; `data/`, `adapters/`, `runs/` are ignored | Shreyash |
| TR-104 | The full 145 GB BigEarthNet imagery is streamed or subset, never bulk-downloaded, and is out of scope for M1 entirely | Mridul |
| TR-105 | Ground truth is visible to `evaluate` alone | Shreyash |
| TR-106 | Base model is chosen by measured zero-shot gain, not assumed — benchmark `geochat-7B` against `Qwen2-VL-7B-Instruct` before committing | `10_Decision_Record.md` §5 | Mridul |
| TR-107 | Licence of the trained/shipped base model is Apache-2.0 or equivalent — the deliverable hands weights to a government agency (ADR-010) | Mridul |

---

## 6. Constraints and assumptions

| # | Constraint | Consequence | Owner |
|---|---|---|---|
| C-1 | The ISRO/SAC evaluation set is undisclosed | Optimise robustness, not benchmark peak | Mridul |
| C-2 | Scored pairs arrive pre-georeferenced and co-registered | Validate alignment; do not solve it | Shreyash |
| C-3 | **The judging weight table is missing from the PS** — literal placeholder text in the official record | Balance across all five mandatory capabilities | Both |
| C-4 | No GPU on the development laptop (4 GB VRAM against a 16 GB QLoRA floor) | Train on rented/free-tier cloud GPU (Kaggle 2×T4); the classical path stands on its own if training slips | Mridul |
| C-5 | Venue may have no network | No runtime external calls anywhere | Shreyash |
| C-6 | Deliverable includes models | Check every base-model licence before training — ADR-010 | Mridul |
| C-7 | Kaggle provides P100/T4 — neither supports `bf16` | Use `fp16` in every training config | Mridul |
| C-8 | Kaggle sessions cap at 9 hours; a ~16 GPU-hour run needs 2+ sessions | Checkpoint and resume, built on day one | Mridul |
| C-9 | **Submission deadline conflicts across documents** (20 Sep per `BRANCHING.md`/`PS26143_Brief.md`, 30 Sep per this decision record's own checkpoint table) | Every date in §8's checkpoint table below is provisional until this resolves | Shreyash |

---

## 7. Verification summary

| Suite | Command | Result |
|---|---|---|
| Self-test — 30 checks | `python -m satquery.cli selftest` | **30 / 30** |
| Metrics and ablation | `python -m satquery.cli eval` | see below |
| Headless UI — 27 checks | `node web/verify.mjs` | **26 / 27** — the one failure is `NFR-14`, a rotted selector, not a broken feature |
| Type check + build | `npm run build` | clean |

### Measured, against ground truth the pipeline never reads

| Task | Metric | Value |
|---|---|---|
| Water grounding | IoU | **1.0000** |
| Vegetation grounding | IoU | **0.9958** |
| SAR built-up detection | F1 | **0.9450** |
| Bi-temporal change | F1 | **0.7698** |
| Router dispatch, **on its own construction (not a held-out figure — see TR-056)** | accuracy | **1.0000** |
| Confidence calibration | ECE | **0.0328** |

### Ablation

Row A's label is corrected from the previous revision. It was called *"Generic VLM, no adaptation"*; there is no VLM anywhere in the codebase. It is grayscale Otsu thresholding, with the water class defined as the exact complement of the built-up class — a baseline that is bad by construction, not a stand-in for a real vision-language model.

| Config | Capability | Δ vs A |
|---|---|---|
| A · **no domain knowledge: panchromatic Otsu** *(was: "Generic VLM, no adaptation")* | 0.086 | — |
| B · remote-sensing adapted | 0.106 | +0.020 |
| C · specialists, no router | 0.453 | +0.367 |
| D · specialists + router | 0.703 | +0.617 |
| **E · + evidence fusion and gating** | **0.953** | **+0.867** |

**`capability`'s formula, printed here because a metric without its formula reads as a standard one:**

```
capability = 0.50 · mean_f1
           + 0.25 · (router_acc or 0.0)
           + 0.25 · (1.0 if recovered is not None else 0.0)
```

The third term is a boolean for whether a code path ran, weighted equally with an F1 score. This is a named, invented composite for this project, not a metric from the literature — present its three components separately alongside it, per `09_External_Review…` §5.3.

**Not claimed:** public-benchmark numbers on VRSBench, RSVQA or CDVQA. Those require the trained adapters, and stating them before running them would be fabrication.

---

## 8. Open

Merged with `10_Decision_Record.md` §7–8, so this table and that file do not drift apart. Keep both current; when one changes, change the other in the same commit.

| ID | Item | Owner | Checkpoint | Blocked on |
|---|---|---|---|---|
| OPEN-1 | Zero-shot VQA baseline on VRSBench, both candidate bases | Mridul | **13 Sep — the real gate, no GPU needed** | nothing — start now |
| OPEN-2 | Train M1 LoRA adapter | Mridul | 18 Sep | OPEN-1, rented GPU quota |
| OPEN-3 | **Confirm the submission deadline** (20 Sep vs 30 Sep — C-9) | Shreyash | before 13 Sep | the SPOC |
| OPEN-4 | Recover the truncated `Dataset Link` field for VRSBench/RSVQA/CDVQA (355-char cutoff in the official JSON export) | Shreyash | before finalising the data plan | the SIH portal listing |
| OPEN-5 | Base-model licence audit | Mridul | before training | ADR-010 |
| OPEN-6 | TR-087 — stdlib static-file serving | Shreyash | **11 Sep, today** | nothing |
| OPEN-7 | Ablation row A relabel + `capability` formula caption (done in this document; still needed in `evaluate.py`'s own output and any slide deck) | Shreyash | 11 Sep, today | nothing |
| OPEN-8 | Cloud-placement disclosure on the slide/README (`scene.py:223`) | Shreyash | 11 Sep, today | nothing |
| OPEN-9 | NFR-14 — unpin `verify.mjs` from the Tailwind selector, use `data-testid` | Shreyash | whenever, low cost | nothing |
| OPEN-10 | TR-007/TR-088 — upload endpoint + interface control | Shreyash | 24 Sep | nothing, start any time |
| OPEN-11 | TR-056 — held-out router paraphrase set (~200, blind to `router.py`) | Shreyash | before submission | nothing |
| OPEN-12 | Wire the agreed adapter pack into the 13 `Pipeline(...)` call sites (§7a's seam) | Joint | 22 Sep | OPEN-2 and the stub-adapter contract from `10_Decision_Record.md` §6 |
| OPEN-13 | Evaluate adapted model, report the gain (not the absolute) | Mridul | 22 Sep | OPEN-2 |
