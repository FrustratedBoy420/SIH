# PS26167 — Technical Requirements Document

**SatQuery AI** · SIH 2026 · ISRO · PS 26167

| | |
|---|---|
| **Version** | 1.0 — full rewrite, consolidated from the document set |
| **Date** | 2026-09-11 |
| **Owners** | **Mridul** (M) — models, training, benchmarks · **Shreyash** (S) — everything else |
| **Companion** | [`07_PRD.md`](07_PRD.md) — the product view of the same requirements |
| **Describes** | The **target system** as specified by `00`, `01`, `03`, `05`, `06`, `09`, `10` and the ADRs. It is not a status report on the current code |

A TRD is a **contract, not a description** (`04` §3). Every requirement below is atomic (one line, one ID), testable (a pass/fail check exists), traced (back to a PS clause or decision, forward to a verification), and owned. If a row cannot be checked, it does not belong here.

---

## 0. Conventions

**IDs** are grouped by area: `ING` ingestion · `VAL` validation and refusal · `QRY` query understanding · `RTR` router · `VQA` M1 · `GRD` M2 · `CHG` M3 · `XMD` M4 cross-modal · `EVD` evidence · `ANS` answer layer · `TRC` trace · `OUT` outputs · `ADP` adaptation and model runtime · `UI` interface · `OPS` persistence and operations · `NFR` non-functional · `DAT` data · `TRN` training · `EVL` evaluation.

**Priority** — `MUST` (a PS clause or a settled decision depends on it) · `SHOULD` (strongly expected; cost marks or credibility if absent) · `COULD` (improves the result; first to cut).

**Phase** — `S` needed for the portal submission · `B` Build phase (Oct–Nov) · `F` needed by the Grand Finale.

**Verification** — `T` automated test · `B` benchmark run on a public test split · `E` evaluation harness (ablation, calibration, stress suite) · `D` live demo check · `U` headless UI check · `I` inspection or review.

**Trace** cites the PS (`PS` + section of `00`), a requirement number from the PRD (`R1`–`R5`), an ADR, or a document section.

---

## 1. Scope and context

**In scope:** the five mandatory capabilities; ingestion, upload, validation and refusal; evidence, confidence, abstention and the execution trace; outputs and reports; the web application; the evaluation harness; the training and benchmarking needed to evidence adaptation.

**Out of scope:** captioning (ADR-002); training a foundation model (ADR-001); research-grade co-registration (`01` §9); an agent framework (ADR-004); authentication, multi-tenancy and production deployment (`05` §8); satellite tasking.

**Boundary** (`05` §1). Every external dependency — base weights, datasets, benchmark splits — is fetched at **build time**. At runtime the system uses no network. The ISRO/SAC evaluation set lies outside the boundary and is never available.

---

## 2. Architecture baseline

The structure every requirement below assumes. Detail in `05_System_Design.md`.

### 2.1 Containers

| Container | Responsibility | Technology (per docs) | Must fail by |
|---|---|---|---|
| **Web application** | Upload, query, map and modality stack, evidence, trace, export | React + TypeScript; map viewer (OpenLayers or MapLibre); three.js modality stack | Degrading to no map — the answer text still renders |
| **API service** | Ingestion, validation, routing, evidence fusion, trace, reports | Python, FastAPI; stateless, CPU | — |
| **Model runtime** | Base VLM + LoRA adapters + SAR encoder — the **only GPU-bound unit** | PyTorch, PEFT, bitsandbytes | Falling back to labelled pre-computed results |
| **Result store** | Metadata, geometry, results | PostgreSQL + PostGIS (ADR-009, *Proposed*) — SpatiaLite acceptable for a single-machine demo if stated | Results not persisted; live answers continue |
| **Raster store** | Imagery | S3-compatible object store or filesystem; never database blobs | Hard failure — no imagery readable |
| **Adapter store** | LoRA weights, 50–200 MB each | Filesystem | Base model only, degraded accuracy |

**ARC-01 (MUST).** The model runtime sits behind a defined interface so that running it in-process (development) or as a separate service (venue) is a configuration change, not a rewrite. This isolation is what makes the venue fallback possible (`05` §2).

### 2.2 Components and the six layers

| Layer | Component | Responsibility | Owner |
|---|---|---|---|
| 1 · Ingestion | raster reader, validator | GeoTIFF/TIFF parsing, CRS, geotransform, bands, sensor, compatibility, refusal | S |
| 2 · Query understanding | query interpreter | Fuzzy language → structured intent | S |
| 3 · Router | registry, router | Classify → validate → select → sequence → execute | S |
| 4 · Specialists | M1 VQA, M2 grounding, M3 change, M4 SAR + fusion | The measurements | M |
| 5 · Evidence | evidence layer | Normalised records, pixel → EPSG:4326, confidence gate, conflicts | S |
| 6 · Answer | answer generator (M6) | Phrases validated evidence; abstains | S |
| — | trace | The observable execution summary | S |

**ARC-02 (MUST).** The SAR encoder hangs off the pipeline, not off the shared base (ADR-003). **ARC-03 (MUST).** The answer generator is downstream of the evidence layer only — no path exists from a vision model or a raster to the answer generator (ADR-007). Both are checkable by following arrows in `05` §3.

### 2.3 Environments

| Environment | Runs | Constraint that matters |
|---|---|---|
| Development — laptop | all containers in one process; SQLite/SpatiaLite acceptable | 4 GB VRAM: no local training, no local 4-bit 7B inference (`09` §3.1) |
| Training — Kaggle 2×T4 or rented GPU | model runtime only | 16 GB, QLoRA, **fp16 not bf16**, 9-hour sessions (`10` §6) |
| **Venue — the demo laptop** | everything via `docker compose` | **No network assumed**; 6–8 GB VRAM at 4-bit; pre-computed results staged for every demo scene (`05` §4) |

---

## 3. Functional requirements

### 3.1 Ingestion and upload — Layer 1

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| ING-01 | The system accepts **uploaded** imagery through the web application and the API | MUST | S | PS Expected Solution "input upload" | T, D | S |
| ING-02 | GeoTIFF/TIFF is the primary input format; CRS, geotransform, band count and sensor are read from the file | MUST | S | PS Input Scope | T | S |
| ING-03 | PNG/JPEG are accepted **only** for prescribed benchmark datasets and are flagged non-georeferenced; geographic outputs are never claimed for them | MUST | S | PS Input Scope | T | S |
| ING-04 | Band identity is established (RGB, NIR, SWIR, SAR VV/VH); access to a missing band fails loudly rather than returning a wrong band | MUST | S | `01` §23 | T | S |
| ING-05 | Radiometric normalisation brings optical and SAR values into comparable ranges before any model sees them; SAR keeps its own normalisation, never an RGB conversion | MUST | S | `01` §23, ADR-003 | T | S |
| ING-06 | Rasters larger than a model's input are tiled; tile results are stitched back in the original geometry | SHOULD | B | `01` §23 | T | S |
| ING-07 | A malformed file, or one missing a CRS where geography is needed, produces a specific, readable error naming what is missing — never a crash or a stack trace | MUST | S | `01` §23, `05` QA-4 | T | S |
| ING-08 | A pixel position converts to EPSG:4326 and back without loss beyond floating-point tolerance | MUST | S | `03` §11 | T | S |
| ING-09 | Each accepted raster is summarised for the user: role, sensor, CRS, bands, ground sample distance, georeferenced flag | MUST | S | PS R5 "metadata" | T, U | S |

### 3.2 Validation and refusal

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| VAL-01 | Before any model runs, the system checks the **number, modality, format, metadata and compatibility** of the inputs against what the classified task needs | MUST | S | PS R5 | T | S |
| VAL-02 | A task whose input requirement is unmet is **refused** and **no model is invoked** | MUST | S | PS R5, `05` §5.2 | T, D | S |
| VAL-03 | Every refusal states what to upload instead | MUST | S | `01` §25.2 | T | S |
| VAL-04 | A single-image task is satisfiable by a superset of inputs (an optical–SAR pair, or a bi-temporal pair) | MUST | S | `07` §8.2 | T | S |
| VAL-05 | Co-registration of a pair is **validated**, not solved: the offset is estimated in pixels and reported | MUST | S | `01` §9, PS Evaluation | T | S |
| VAL-06 | A pair whose offset exceeds tolerance is flagged in the trace, lowers confidence, and is recorded as a conflict — it is never silently trusted | MUST | S | `01` §9 | T | S |
| VAL-07 | Uploaded and built-in imagery pass through **the same** validation and refusal path | MUST | S | PS Expected Solution | T | S |
| VAL-08 | Refusal and success results share one response shape; evidence collections are empty on refusal, never absent | MUST | S | API contract | T | S |

### 3.3 Query understanding — Layer 2

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| QRY-01 | A free-text query becomes a structured intent: task, sub-tasks, modality required, whether spatial evidence is needed, and any spatial constraint (`01` §24 schema, §4.5 below) | MUST | S | PS R5 "interpret the query" | T | S |
| QRY-02 | Spatial constraints in the query ("in the northern half", "within 2 km of the river", "only built-up areas") are extracted and applied as filters on results | COULD | B | `01` §24 | T | S |
| QRY-03 | An empty or unintelligible query is refused with a prompt to ask a question about the imagery | MUST | S | `01` §25 | T | S |
| QRY-04 | The query interpreter never reads pixels | MUST | S | ADR-007 | I | S |

### 3.4 Agentic router — Layer 3

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| RTR-01 | The router classifies each query into one of: single-image VQA, grounding, change analysis, cross-modal analysis — or refuses | MUST | S | PS R5 | T, E | S |
| RTR-02 | Tools are selected **only** from a predefined registry (§4.3); the router cannot invent or name an unregistered tool | MUST | S | PS R5, ADR-004 | T | S |
| RTR-03 | Only **permitted** parameters are configurable, and each is clamped to its declared range | MUST | S | PS R5 | T | S |
| RTR-04 | The router sequences more than one tool when a query needs it (e.g. *"is there any new construction?"* → change + building grounding) | MUST | S | PS R5 "sequence", `01` §25.4 | T | S |
| RTR-05 | The router is a plain, inspectable function — no agent framework — explainable on one slide | MUST | S | ADR-004 | I | S |
| RTR-06 | The five representative PS queries (RQ-1–RQ-5, `07` §10) each route to the correct capability; RQ-5 on a single image is refused | MUST | S | PS Representative Queries | T, D | S |
| RTR-07 | Dispatch accuracy is measured on a **held-out** paraphrase set written without reference to the router's rules; target ≈ 0.85 | MUST | S | `10` §3, §9 rule 2 | E | S |
| RTR-08 | The rule-based classifier is replaceable by a trained classifier (M5) behind the same interface; the trace records which one ran | SHOULD | B | `03` §8 | T | S |
| RTR-09 | The router is built and wired **after** each specialist has been measured standing alone | MUST | S | `03` §13, `01` §41 | I | S |

### 3.5 M1 — Remote-sensing-adapted VQA

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| VQA-01 | Visual question answering over one optical/multispectral or SAR image | MUST | S | PS R2 | T, B, D | M |
| VQA-02 | VQA is served by the **remote-sensing-adapted** component (M1), not the generic base | MUST | S | PS R1, R2 | B, I | M |
| VQA-03 | Counting, presence and area questions resolve to a **measurement** (region labelling, thresholded masks, pixel area × GSD²), not to a language model's guess | MUST | S | ADR-007 | T | M |
| VQA-04 | Every VQA answer carries a confidence derived from the model (token probabilities) and/or measured class separation — never a fixed constant | MUST | S | `03` §4 | T, E | M |
| VQA-05 | Accuracy is reported per question category, not only overall | MUST | S | `01` §37 | B | M |
| VQA-06 | SAR imagery reaches VQA through the SAR path, never as a greyscale photograph | MUST | S | ADR-003 | I | M |

### 3.6 M2 — Text-guided grounding

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| GRD-01 | A text description ("the water body", "residential buildings") returns boxes or masks with scores | MUST | S | PS R2, ADR-002 | T, D | M |
| GRD-02 | Every box is converted through the geotransform to EPSG:4326 and carries an area in hectares | MUST | S | `03` §11 | T | S |
| GRD-03 | A target outside the vocabulary fails loudly — it never grounds something else instead | MUST | S | safety | T | M |
| GRD-04 | Thresholds adapt per scene and are clamped to a physical floor where one exists (NDWI > 0 for open water, NDVI > 0.2 for vegetation) | SHOULD | S | domain | E | M |
| GRD-05 | Linear features (rivers, roads) are not erased by morphological cleaning | SHOULD | S | domain | E | M |
| GRD-06 | A dedicated grounding adapter (M2) trained on VRSBench; Acc@0.5 and mAP@0.5 reported against the 39.6 % anchor | SHOULD | B | `03` §5 | B | M |

### 3.7 M3 — Change analysis

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| CHG-01 | Change description and change VQA over a bi-temporal pair | MUST | S | PS R3 | T, D | M |
| CHG-02 | Output covers levels 1–4 of `01` §12: whether changed, what kind, how much, where; level 5 (interpretation) is phrased by the answer layer from those facts | MUST | S | `01` §12 | T | M |
| CHG-03 | Change is classified **semantically** (e.g. construction vs regrowth), not merely detected | MUST | S | PS R3, `01` §12 | T | M |
| CHG-04 | Changed area is reported in hectares and as a share of the scene; the built-up trend in percentage points | MUST | S | PS Representative Query 5 | T | M |
| CHG-05 | A spatial change map is emitted as georeferenced geometry where reference masks allow | SHOULD | S | PS R3 (optional clause) | T | M |
| CHG-06 | Misregistration lowers confidence and is reported, so apparent change from an offset is never presented as real change | MUST | S | `01` §9 | T | M |
| CHG-07 | M3 architecture: shared (Siamese) encoder, difference module, mask head and change-VQA head; evaluated on CDVQA | SHOULD | B | `03` §6 | B | M |

### 3.8 M4 — Optical–SAR cross-modal analysis

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| XMD-01 | Extract **complementary** information from a co-registered optical–SAR pair | MUST | S | PS R4 | T, D, E | M |
| XMD-02 | SAR is processed by its own encoder path (speckle filtering, backscatter semantics), outside the shared base | MUST | S | ADR-003 | I | M |
| XMD-03 | **Late fusion**: each modality produces its own evidence; the fusion layer combines conclusions; per-modality evidence stays separable | MUST | S | ADR-005 | T | M |
| XMD-04 | Cloud cover on the optical image is quantified as a percentage | MUST | S | PS R4 | T | M |
| XMD-05 | Structures detected by SAR beneath optical cloud are reported with count and area — information neither sensor provides alone | MUST | S | PS R4 | T, D | M |
| XMD-06 | Modality disagreement is recorded as a conflict and lowers confidence; it is never silently resolved | MUST | S | ADR-005 | T | M |
| XMD-07 | A SAR encoder trained on Sentinel-1 (M4); revisit feature-level fusion if fusion adds < 2 points over the better single modality | SHOULD | B | `03` §7, ADR-005 | E | M |

### 3.9 Evidence and confidence — Layer 5

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| EVD-01 | Every specialist writes the **one normalised evidence record** (§4.4) — claim, value, unit, confidence, modality, source model and version, geometry, supporting facts, conflicts, method | MUST | S | `03` §11, `01` §27 | T | S |
| EVD-02 | Spatial evidence leaves the evidence layer in EPSG:4326; pixel coordinates never leave the API service | MUST | S | `05` §6 | T | S |
| EVD-03 | A confidence gate applies a threshold; evidence below it does not reach the answer | MUST | S | PS R5 "estimate confidence" | T | S |
| EVD-04 | Aggregate confidence weights claims by the area they rest on and is penalised by recorded conflicts | SHOULD | S | `01` §27 | T | S |
| EVD-05 | Every claim names the model and version that produced it | MUST | S | auditability | T | S |
| EVD-06 | Ground truth is readable **only** by the evaluation harness, never by any analysis component | MUST | S | integrity | T | S |

### 3.10 Answer generation and abstention — Layer 6

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| ANS-01 | The answer generator receives validated evidence records and **never** a raster or image | MUST | S | ADR-007 | T | S |
| ANS-02 | Every number in an answer appears in a passing evidence record | MUST | S | ADR-007 | T | S |
| ANS-03 | When nothing clears the gate, the system **abstains** with an explicit statement and makes no claim | MUST | S | `01` §28 | T, D | S |
| ANS-04 | The generator may be templates or a constrained LLM (M6); the contract — evidence in, sentence out — is identical either way | MUST | S | `03` §9 | I | S |
| ANS-05 | Modality disagreements that survived the gate are mentioned in the answer | SHOULD | S | ADR-005 | T | S |

### 3.11 Execution trace

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| TRC-01 | Every request emits a trace covering: input validation, task identified, compatibility check, tool(s) selected, parameters, execution per tool, conflicts, confidence, evidence returned — or the refusal/abstention | MUST | S | PS R5 "auditable execution summary" | T | S |
| TRC-02 | Each step records its outcome (ok/failed), elapsed time, and the data behind it (tool names, model versions, parameter values) | MUST | S | PS R5 | T | S |
| TRC-03 | The trace contains **no** internal reasoning or chain-of-thought text | MUST | S | PS §Agentic, ADR-008 | T | S |
| TRC-04 | A pre-computed (venue fallback) result is labelled as such in the trace | MUST | F | `05` §5.3 | T, D | S |
| TRC-05 | The trace records which router (rules or trained classifier) and which engine (classical or adapted) served the request | SHOULD | S | `03` §8 | T | S |

### 3.12 Outputs and reports

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| OUT-01 | Spatial evidence exports as GeoJSON in EPSG:4326 that opens correctly in QGIS | MUST | S | PS Expected Solution | T, I | S |
| OUT-02 | A **downloadable report** per run: query, answer, evidence per claim with confidence and source model, the trace, parameters, input metadata, and a "what this cannot establish" section | MUST | S | PS Expected Solution "downloadable reports" | T, D | S |
| OUT-03 | The report and GeoJSON are produced from the stored run, so they match what the user saw exactly | MUST | S | reproducibility | T | S |
| OUT-04 | Map overlays render evidence geometry over the imagery, toggleable per layer (optical, SAR, change) | MUST | S | `01` §42 | U | S |

### 3.13 Adaptation and model runtime

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| ADP-01 | One frozen base VLM (M0) is loaded once; task adapters attach to it | MUST | S | ADR-001 | I | M |
| ADP-02 | The base is chosen by zero-shot VRSBench benchmark across candidates (at least GeoChat-7B and Qwen2-VL-7B-Instruct); the table is kept | MUST | S | ADR-010, `10` §5 | B | M |
| ADP-03 | At least one component — M1 — is LoRA-adapted on remote-sensing data | MUST | S | PS R1 | B | M |
| ADP-04 | The adaptation is evidenced by the **gain** over the measured zero-shot baseline on the same test split, reported alongside the absolute | MUST | S | `10` §2 | B | M |
| ADP-05 | Adapter packs follow the contract in §4.6; loading one switches the serving path from classical to adapted, and the result says which ran | MUST | S | `10` §6 | T | M + S |
| ADP-06 | The adapter-loading path is exercised by a test with a **stub** pack before real weights exist | MUST | S | `10` §6 | T | M + S |
| ADP-07 | Adapter swap between consecutive requests adds < 200 ms | SHOULD | F | `05` QA-8 | E | M |
| ADP-08 | The runtime loads at 4-bit on a 6 GB laptop GPU without OOM | MUST | F | `05` QA-7 | E | M |
| ADP-09 | If the model runtime is unavailable or times out, staged demo scenes are answered from pre-computed results (labelled); any other query returns an honest degradation notice | MUST | F | `05` §5.3 | T, D | S |

### 3.14 Interface

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| UI-01 | An interactive web application: upload, query, results, evidence, trace, export | MUST | S | PS Deliverables | U | S |
| UI-02 | The imagery is the primary region; the query is a bar, not a dominating chat panel | MUST | S | `06` §5 | U, I | S |
| UI-03 | The execution trace is visible without navigating away | MUST | S | ADR-008 | U | S |
| UI-04 | Evidence appears above the trace, with confidence beside every answer | MUST | S | ADR-007, `06` §5 | U | S |
| UI-05 | Input metadata (CRS, bands, GSD, sensor, alignment) is shown for every loaded raster | MUST | S | `01` §42 | U | S |
| UI-06 | The modality stack presents optical, fusion and SAR as separable planes the user can pull apart | SHOULD | S | `06` §7, PS R4 | U | S |
| UI-07 | Refusal and abstention are visually distinct from answers and state what to do next | MUST | S | `06` §2 | U | S |
| UI-08 | Datasets and models are listed with their **actual** local state, not an aspirational list | MUST | S | honesty | U | S |
| UI-09 | A results view shows metrics, the adaptation gain, both ablations and calibration, each with its published anchor | MUST | S | `01` §39 | U | S |
| UI-10 | Synthetic imagery and constructed scenarios are disclosed permanently on screen | MUST | S | `10` §9 rule 3 | U | S |
| UI-11 | The visual system follows `06`: light theme, domain-derived colour, mono tabular figures for every value, glass only on floating surfaces | MUST | S | `06` §1–4 | I | S |
| UI-12 | The interface degrades usefully without WebGL — the 3D stack becomes 2D panels | SHOULD | S | `06` §7 | U | S |
| UI-13 | Accessibility floor: WCAG AA text, visible focus, `prefers-reduced-motion`, no colour-only encoding, 3D never the only path to information | MUST | S | `06` §10 | U, I | S |

### 3.15 Persistence and operations

| ID | Requirement | Pri | Ph | Trace | Verify | Own |
|---|---|---|---|---|---|---|
| OPS-01 | Every run persists its result, evidence, GeoJSON and environment (version, engine, seed, platform) so it can be replayed | MUST | S | `05` §6 | T | S |
| OPS-02 | Runs are deterministic under a recorded seed | MUST | S | `05` §6 | T | S |
| OPS-03 | `docker compose up` brings the whole system up cold on the venue laptop, first time | MUST | F | `05` §4 | D | S |
| OPS-04 | Dependencies are declared in a manifest so a judge can reproduce the environment from the repository | MUST | S | PS Deliverables "codes … test and demonstration" | I | S |
| OPS-05 | Result geometry is queryable spatially (PostGIS, or SpatiaLite for a single-machine demo, stated) | COULD | B | ADR-009 | T | S |
| OPS-06 | No runtime network call anywhere — fonts, basemaps, weights and scenes are local | MUST | F | `05` §4 | D | S |

---

## 4. Component contracts

The shapes every component must honour. These are the seams between owners: Mridul's models produce §4.1 outputs and ship §4.6 packs; Shreyash's pipeline consumes them through §4.4.

### 4.1 Model inventory and I/O

From `03` §1–§9. **Six components; four trained; none from scratch.**

| # | Component | Kind | Trained | Input | Output | Serves |
|---|---|---|---|---|---|---|
| M0 | Base VLM | pretrained, **frozen** | no | — | foundation for M1–M3 | — |
| M1 | RS-adapted VQA | LoRA on M0 | **yes — the mandatory one** | image tensor (optical/MS or SAR path), question | `{answer, confidence}` | R1, R2 |
| M2 | Grounding | LoRA on M0 | yes (Build) | image tensor, text description | `{boxes[[x1,y1,x2,y2]], scores[], labels[]}` | R2 |
| M3 | Change / change-VQA | LoRA on M0 + Siamese difference head | yes (Build) | image T1, image T2, optional question | `{answer, changed_regions[polygon], change_type, area_change, confidence}` | R3 |
| M4 | SAR encoder + fusion | separate small encoder (ResNet-50 / small ViT), late fusion | yes, light (Build) | optical, SAR, question | per-modality evidence + fused evidence | R4 |
| M5 | Router | rules → small text classifier | yes, trivial (Build) | query, input manifest | `{task, tools[], params{}, valid, reason}` | R5 |
| M6 | Answer generator | M0's language head or a small open LLM | **no** | validated evidence records only | sentence | output layer |

**CON-01 (MUST).** Every model output is converted into §4.4 evidence records before anything else consumes it. No component downstream of the evidence layer reads a model output directly.

### 4.2 Structured intent — Layer 2 output

```json
{
  "task": "change_analysis",
  "sub_tasks": ["change_description", "change_localisation"],
  "modality_required": "bi_temporal",
  "needs_spatial_evidence": true,
  "spatial_constraint": null
}
```

### 4.3 Tool registry — the only tools the router may select

Each entry declares what it accepts and returns (`03` §8). The router matches the classified task and validated inputs against this table and nothing else.

| Tool | Tasks | Requires | Accepts | Outputs | Adapter | Permitted params |
|---|---|---|---|---|---|---|
| `rs_vqa` | single-image VQA | single image | optical, SAR | text, confidence | M1 | `threshold` [0, 1] |
| `grounding` | grounding | single image | optical (SAR via its path) | boxes, confidence | M2 | `threshold` [0, 1] |
| `change_vqa` | change, change VQA | bi-temporal pair | optical pair | text, change regions, confidence | M3 | `threshold` [0, 1] |
| `optical_sar` | cross-modal | co-registered optical + SAR | optical, SAR | text, per-modality evidence, confidence | M4 | `threshold` [0, 1] |

**CON-02 (MUST).** Adding a tool means adding a registry row with its declared inputs, outputs and permitted parameters. A tool without a row cannot be selected.

### 4.4 Evidence record

One normalised shape from every specialist (`03` §11, `01` §27):

```json
{
  "claim": "Built-up area increased",
  "value": 3,
  "unit": "regions",
  "confidence": 0.82,
  "modality": "temporal",
  "source": { "model": "change-v2", "version": "1.3" },
  "spatial_evidence": [
    { "geometry": "POLYGON((...))", "crs": "EPSG:4326", "score": 0.91, "area_ha": 4.7 }
  ],
  "temporal_evidence": { "before": "T1", "after": "T2" },
  "supporting": ["changed area 4.7 ha of 262 ha (1.8 %)"],
  "conflicts": [],
  "method": "Siamese encoder, difference head"
}
```

`modality` ∈ `optical | sar | fused | temporal | derived`. `conflicts` is a list of human-readable disagreements; each one lowers aggregate confidence.

### 4.5 Execution trace

A factual audit log (`03` §11, ADR-008). Rendered form:

```
Execution summary
  ✓ Input validated       2 GeoTIFF, EPSG:4326, co-registration confirmed
  ✓ Task identified       change_analysis + change_localisation
  ✓ Tool selected         change_vqa (v1.3)
  ✓ Parameters            threshold=0.5, min_region_px=64
  ✓ Result                3 changed regions, 4.7 ha total
  ✓ Confidence            0.91
  ✓ Evidence              change_map.geojson
```

Each step: `{step, detail, ok, ms, data}`. Refusal and abstention appear as failed steps with their reason. No step carries reasoning text.

### 4.6 Adapter pack — the model/pipeline seam

**CON-03 (MUST).** An adapter pack is a directory containing standard PEFT artefacts (`adapter_config.json`, `adapter_model.safetensors`) plus a manifest: pack id, component (M1–M4), base model id and revision, corpus and split, zero-shot score, adapted score, gain, date, licence.

**CON-04 (MUST).** One loader turns a pack directory into the object the pipeline receives, keyed by the same component names the registry uses (`adapter` column, §4.3). The pipeline never imports training code.

**CON-05 (MUST).** `models/MANIFEST.md` carries one row per pack, filled only with measured numbers (`10` §9 rule 1).

---

## 5. Interface requirements

### 5.1 API

REST/JSON between the web application and the API service; progress may stream over WebSocket (`05` §2). Required operations:

| ID | Operation | Purpose | Pri | Own |
|---|---|---|---|---|
| API-01 | **Upload** imagery with its role (optical, SAR, T1, T2) | ING-01; returns the raster summary (ING-09) | MUST | S |
| API-02 | **Query** — query text, input set, threshold | Returns the result contract (§5.2) | MUST | S |
| API-03 | Get a stored **run** and its trace | Replay and audit | MUST | S |
| API-04 | Download a run's **report** and **GeoJSON** | OUT-01, OUT-02 | MUST | S |
| API-05 | **Health** — version, engine (classical/adapted), adapters loaded | Operability | MUST | S |
| API-06 | **Registry** — the tool registry as the router sees it | Transparency (RTR-02) | MUST | S |
| API-07 | **Datasets** and **models** with actual local state | UI-08 | MUST | S |
| API-08 | **Evaluation** — metrics, ablations, calibration, with composite formulas | UI-09 | MUST | S |
| API-09 | Scene layers for the built-in demo scenes (optical, SAR, fusion, T1, T2) | Demo | SHOULD | S |
| API-10 | Unknown API paths return 404 — never the HTML shell | robustness | MUST | S |

### 5.2 Result contract

**API-11 (MUST).** Every query returns this shape, whatever the outcome:

```jsonc
{
  "query": "...", "answer": "...",
  "refused": false, "abstained": false, "confidence": 0.93,
  "task": "cross_modal", "tools": ["optical_sar"],
  "params": { "threshold": 0.45 },
  "evidence": { "threshold": 0.45, "confidence": 0.93, "abstain": false,
                "count": 5, "passing": 5, "items": [ /* §4.4 */ ] },
  "geojson": { "type": "FeatureCollection", "features": [ /* EPSG:4326 */ ] },
  "trace":   [ /* §4.5 */ ],
  "manifest": { "modality": "optical_sar", "count": 2, "rasters": [ /* ING-09 */ ] },
  "elapsed_ms": 90.3, "version": "…", "engine": "classical | neural+classical",
  "precomputed": false
}
```

On refusal, `evidence.items` is `[]` and `geojson.features` is `[]` — present, empty.

### 5.3 Refusal and abstention conditions

| Condition | Behaviour |
|---|---|
| No imagery supplied | Refuse — *"Upload at least one image."* |
| Change task, no second date | Refuse — ask for T1 and T2 |
| Cross-modal task, one sensor only | Refuse — ask for a co-registered optical–SAR pair |
| Geography needed, file has no CRS | Refuse — name the missing field |
| Empty query | Refuse — ask a question about the imagery |
| Target outside the vocabulary | Proceed, then abstain at the gate |
| Nothing clears the confidence threshold | Abstain — make no claim |

### 5.4 Errors

**API-12 (MUST).** Errors are typed and human-readable (what failed, why, what to do); no stack trace reaches a user. **API-13 (MUST).** Input validation limits (query length, file size, accepted formats) are declared and enforced.

---

## 6. Non-functional requirements

Written as testable scenarios, not adjectives (`05` §7).

| ID | Scenario | Target | Pri | Verify | Own |
|---|---|---|---|---|---|
| NFR-01 | Single-image VQA query on the venue laptop, no network | < 8 s p95 | MUST | E | S |
| NFR-02 | Bi-temporal or cross-modal query, same machine | < 15 s p95 | MUST | E | S |
| NFR-03 | Refusal — inputs cannot support the question | < 1 s; no model invoked | MUST | T | S |
| NFR-04 | Malformed GeoTIFF with no CRS uploaded | readable error naming the missing field; no crash | MUST | T | S |
| NFR-05 | Model runtime unavailable during the demo | staged scenes still answer, labelled pre-computed | MUST | D | S |
| NFR-06 | System reports 0.9 confidence on a query set | correct on ≈ 90 %; ECE reported | MUST | E | M + S |
| NFR-07 | Model runtime loaded on a 6 GB laptop GPU | 4-bit, no OOM | MUST | E | M |
| NFR-08 | Adapter swapped between consecutive requests | < 200 ms added | SHOULD | E | M |
| NFR-09 | Any point after install | zero runtime network calls | MUST | D | S |
| NFR-10 | Cold start on the venue laptop | `docker compose up` to first answer < 60 s (model warm-up excluded, then pre-warmed) | SHOULD | D | S |
| NFR-11 | A run replayed from its record with the same seed | identical result | MUST | T | S |
| NFR-12 | The running interface | zero console errors; no uncaught exceptions | MUST | U | S |
| NFR-13 | Frontend production bundle | < 1.5 MB before compression | SHOULD | I | S |
| NFR-14 | A judge clones the repository and follows the README | the documented demo command brings up the UI and API without undeclared dependencies | MUST | D | S |
| NFR-15 | Accessibility audit of the interface | WCAG AA text contrast; keyboard reachable; reduced motion honoured | MUST | U, I | S |
| NFR-16 | Headless UI checks | anchored to `data-testid`, never to styling classes | SHOULD | I | S |

**Security stance** (`05` §8): out of scope beyond the demo path — no authentication, no multi-tenancy. Uploaded files are validated by format and size before parsing (API-13). Revisit if the system is ever exposed beyond a demo.

---

## 7. Data requirements

### 7.1 Corpora

| Dataset | Role | Scale | Use in this system | Split | Own |
|---|---|---|---|---|---|
| **VRSBench** (`xiang709/VRSBench`, CC-BY-4.0, 12.5 GB) | **M1 training corpus** (`10` §4) and single-image benchmark; base-model selection | 29,614 images · 123,221 VQA pairs · 52,472 object references | Train M1; evaluate VQA and grounding | **official, unmodified** | M |
| **BigEarthNet.txt** (`BIFOLD-BigEarthNetv2-0/BigEarthNet.txt`, CDLA-Permissive-1.0) | PS-named adaptation set; later M4 SAR encoder | 464,044 S1/S2 **pairs** · ~9.6 M **text annotations**; annotations 467 MB, imagery a separate ~155 GB | Post-M1; stream or subset (2.5 GB Lithuania-summer subset exists) | geographic, tile level | M |
| **RSVQA** (LR + HR) | Baseline VQA benchmark | LR: 772 images · 77,232 QA | Evaluate VQA, per category | official tile-level | M |
| **CDVQA** | Change-VQA benchmark; M3 training | 2,968 pairs at 512 × 512 · 122,000+ QA | Train/evaluate M3 | official | M |
| **ISRO/SAC set** | Final scoring | unknown; Cartosat-2S + RISAT pairs, annotations undisclosed | **Cannot access** — design for generalisation | n/a | — |
| **Router paraphrases** | M5 training and held-out evaluation | 5–20k synthetic + a separately written held-out set | RTR-07, RTR-08 | held-out written blind to the rules | S |

### 7.2 Rules

| ID | Requirement | Pri | Own |
|---|---|---|---|
| DAT-01 | Say the BigEarthNet numbers correctly: **464,044 pairs**, **~9.6 M annotations** — never "9.6 million images" | MUST | M |
| DAT-02 | Where a benchmark publishes an official split, use it unmodified | MUST | M |
| DAT-03 | Any self-built split is geographic at tile level; no tile in more than one split; never random | MUST | M |
| DAT-04 | Spatially overlapping patches are deduplicated before splitting | MUST | M |
| DAT-05 | Every source is normalised to one training-record schema (§7.3) — one loader, one validation path | SHOULD | M |
| DAT-06 | Nothing over 100 MB is committed; `data/` and model weights are ignored; `models/MANIFEST.md` is tracked | MUST | M + S |
| DAT-07 | The full BigEarthNet imagery is never bulk-downloaded to the development laptop; the corpus lives where the GPU lives | MUST | M |
| DAT-08 | BigEarthNet.txt annotations are treated as structured supervision (some are template- or LLM-generated), not unimpeachable ground truth | SHOULD | M |
| DAT-09 | The ISRO/SAC set is marked unavailable everywhere and never treated as obtainable | MUST | S |

### 7.3 Unified training record

```json
{
  "image": { "optical": "S2A_MSIL2A_20240115_T43RGN.tif", "sar": "S1B_IW_GRDH_20240115_T43RGN.tif" },
  "task": "vqa",
  "question": "Is there arable land next to pasture?",
  "answer": "yes",
  "latitude": 52.1, "longitude": 13.4, "country": "Germany", "season": "summer",
  "split": "train"
}
```

Grounding records carry `query` and `boxes` in place of `question` and `answer` (`01` §33).

---

## 8. Training requirements

| ID | Requirement | Pri | Ph | Source | Own |
|---|---|---|---|---|---|
| TRN-01 | Measure **zero-shot** VQA on VRSBench's test split for every candidate base before training anything | MUST | S | `10` §5, ADR-010 | M |
| TRN-02 | Choose the base by the measured result and the gain it leaves room to demonstrate; state the reasoning next to the numbers | MUST | S | `10` §5 | M |
| TRN-03 | Confirm the chosen base's licence permits delivering weights to a government agency (Apache-2.0: GeoChat-7B, Qwen2-VL-7B) | MUST | S | `09` §3 | M |
| TRN-04 | QLoRA: 4-bit base, LoRA r = 8, α = 16, dropout 0.05, targets `q/k/v/o_proj`; batch 1 × 32 accumulation; lr 2e-4; 3 epochs; warmup 3 %; gradient checkpointing | MUST | S | `03` §4 | M |
| TRN-05 | Precision is **fp16** on Kaggle P100/T4 — they do not support bf16 | MUST | S | `10` §6 | M |
| TRN-06 | Training checkpoints and resumes across 9-hour session limits, verified before the first real run | MUST | S | `10` §6 | M |
| TRN-07 | Checkpoints persist somewhere that survives a session boundary | MUST | S | `10` §6 | M |
| TRN-08 | Every run records seed, base revision, corpus, split, config and metrics | MUST | S | `05` §6 | M |
| TRN-09 | For BigEarthNet-scale corpora, climb a data ladder (100k → 500k → 1M) and stop when the curve flattens; balance tasks over volume | SHOULD | B | `03` §4 | M |
| TRN-10 | Curriculum for later adapters: RS general → single-image → temporal → cross-modal → router | SHOULD | B | `01` §34 | M |
| TRN-11 | Budget ≈ 16 GPU-hours per adapter; ~40–60 GPU-hours for all four, within Kaggle's weekly quota over the Build phase | SHOULD | B | `09` §3.1 | M |

---

## 9. Evaluation requirements

### 9.1 Metrics — definitions are fixed and visible

| Capability | Metric | Definition |
|---|---|---|
| VQA | accuracy, **per category** | correct / total, per question type |
| Grounding | IoU; Acc@0.5; mAP@0.5 | ∩ / ∪; share of targets matched at IoU ≥ 0.5 |
| Change | F1; change IoU; localisation accuracy | 2PR / (P + R) |
| Router | dispatch accuracy, **held-out** | correctly routed / total |
| Confidence | expected calibration error | does 0.9 mean right nine times in ten |
| Abstention | abstention precision | share of abstentions that were correct to abstain |
| Latency | p50, p95 end to end | per query type |

### 9.2 Rules

| ID | Requirement | Pri | Own |
|---|---|---|---|
| EVL-01 | Report only measured numbers; leave `XX.X` until a run fills it | MUST | M + S |
| EVL-02 | A metric measured on its own construction is not a metric — router accuracy is reported on held-out paraphrases only | MUST | S |
| EVL-03 | Every figure is shown with its published anchor (VRSBench VQA: GeoChat 40.8 % → 60.6 %, GPT-4V 65.6 %; grounding Acc@0.5 39.6 %) | MUST | S |
| EVL-04 | **Ablation A–E** on one test set — A generic VLM, B RS-adapted, C specialists without router, D + router, E + evidence fusion — each row labelled by **what actually ran** | MUST | M + S |
| EVL-05 | Any composite score is printed with its formula beside it; its components are shown separately | MUST | S |
| EVL-06 | **Cross-modal ablation** — optical only, SAR only, optical + SAR; the third must beat both, or fusion is doing nothing | MUST | M |
| EVL-07 | If a layer does not help, it is removed or redesigned, and that is reported | SHOULD | M + S |
| EVL-08 | Stress suite: held-out regions; small and large targets; low/high contrast; cloud and haze; deliberate 2-px misregistration; optical-only, SAR-only, paired; tiny and large changes; ambiguous queries; malformed and CRS-less files; mismatched inputs; Indian imagery where obtainable | MUST | M + S |
| EVL-09 | Ground truth is visible to the evaluation harness alone | MUST | S |
| EVL-10 | Results are reproducible from recorded runs (seed, config, split) | MUST | M + S |
| EVL-11 | A results dashboard shows every metric of §9.1 plus the gain and both ablations, populated only from real runs | MUST | S |

---

## 10. Constraints and assumptions

| # | Constraint | Consequence |
|---|---|---|
| C-1 | The ISRO/SAC evaluation set is undisclosed | Optimise robustness, not benchmark peak; build the stress suite (EVL-08) |
| C-2 | Scored pairs arrive pre-georeferenced and co-registered | Validate alignment (VAL-05); do not solve it |
| C-3 | **The judging-weight table is missing from the PS** | Balance all five capabilities; make each separately measurable |
| C-4 | The `Dataset Link` field is truncated at 355 characters | Default to official benchmark splits; recover the field from the portal |
| C-5 | Development laptop: 4 GB VRAM, ~1 MB/s link, ~17 GB free disk | All training and corpus handling on rented/free-tier GPUs; only adapters (20–80 MB each) come back down |
| C-6 | Kaggle: P100/T4, no bf16, 9-hour sessions, ~30 GPU-h/week | fp16 (TRN-05); checkpoint/resume (TRN-06) |
| C-7 | Venue: no network assumed, 6–8 GB VRAM, one machine, ten-minute slot | Offline by design; 4-bit; `docker compose`; pre-computed labelled fallback |
| C-8 | The deliverable includes trained models handed to a government agency | Licence check before training (TRN-03) |
| C-9 | **Submission deadline unconfirmed** — 20 Sep (portal scrape, `04`) vs 30 Sep (`10` §8) | Plan portal-critical work against 20 Sep until the SPOC confirms |
| C-10 | Submission scope is **M1 only** | M2–M4, RSVQA/CDVQA loaders and full BigEarthNet are Build-phase |

---

## 11. Technology stack

As specified across `01` §30, `03` §15, `05` §2 and `06` §7.

| Layer | Choice | Notes |
|---|---|---|
| Backend | Python, FastAPI | Same language as the ML stack; a no-framework fallback server is acceptable if it serves the UI and API identically (NFR-14) |
| ML | PyTorch, Hugging Face Transformers, **PEFT** (LoRA), bitsandbytes (4-bit), `trl` for supervised fine-tuning | Checkpoint/resume through the trainer, not hand-rolled |
| Geospatial | rasterio / GDAL, GeoPandas, Shapely | A pure-Python GeoTIFF tag reader is acceptable where GDAL is unavailable, provided CRS and geotransform survive |
| Vision (classical) | NumPy; OpenCV optional | Speckle filtering, indices, morphology, connected components |
| Agent | **Plain Python router** | LangGraph only if sequencing routinely exceeds ~3 chained calls (ADR-004 revisit) |
| Database | PostgreSQL + PostGIS (*Proposed*, ADR-009); SpatiaLite for a single-machine demo, stated | Never store rasters as blobs |
| Object storage | S3-compatible (MinIO) or filesystem | — |
| Frontend | React + TypeScript; map viewer OpenLayers (best GeoTIFF support) or MapLibre; three.js via react-three-fiber for the modality stack | Interaction components may be sourced from React Bits / 21st.dev and restyled (`06` §8) |
| Packaging | `docker compose` for the venue; a dependency manifest in the repository | OPS-03, OPS-04 |

---

## 12. Traceability matrix

Every PS clause, forward to the requirements that satisfy it and the demo beat that shows it (`07` §13).

| PS clause (`00`) | Requirements | Verified by | Demo beat |
|---|---|---|---|
| Single image — VQA, grounding | VQA-01–06, GRD-01–06 | T, B, D | 1 |
| Cross-modal pair — joint extraction | XMD-01–07 | T, D, E | 3 |
| Bi-temporal pair — change detection, description, VQA | CHG-01–07 | T, B, D | 2 |
| Formats — GeoTIFF/TIFF; PNG/JPEG for benchmarks only | ING-02, ING-03 | T | 1 |
| R1 — remote-sensing adaptation | ADP-01–06, TRN-01–08 | B | 5 |
| R2 — VQA + one more single-image task | VQA-01, GRD-01 | T, B | 1 |
| R3 — change description / change VQA; change map | CHG-01–05 | T, B | 2 |
| R4 — complementary optical–SAR information | XMD-01, XMD-05, EVL-06 | T, E | 3 |
| R5 — select, sequence, execute | RTR-01–09 | T, E | 4 |
| Controller: interpret and classify | QRY-01, RTR-01 | T | 4 |
| Controller: check number, modality, format, metadata, compatibility | VAL-01–08, ING-07, ING-09 | T | 4 |
| Controller: select from a predefined registry | RTR-02, CON-02 | T | 4 |
| Controller: only permitted parameters | RTR-03 | T | 4 |
| Controller: combine outputs, estimate confidence, return visual evidence | EVD-01–05, ANS-01–03, OUT-04 | T, U | 1–3 |
| Controller: auditable execution summary | TRC-01–05 | T, U | 4 |
| Only the observable trace is evaluated | TRC-03, UI-03 | T, U | 4 |
| Expected Solution: input upload and compatibility checking | ING-01, VAL-07, API-01 | T, D | 1 |
| Expected Solution: RS-adapted VL component | ADP-03, VQA-02 | B | 5 |
| Expected Solution: visual evidence, confidence, execution summaries, **downloadable reports** | UI-03–05, OUT-01–03 | U, D | 1–5 |
| Deliverables: GUI/web app + agentic backend | UI-01–13, §2 | U | all |
| Deliverables: codes and models, test and demonstration | OPS-03, OPS-04, CON-03, CON-05, TRN-03 | I, D | — |
| Evaluation: VRSBench, RSVQA, CDVQA test subsets | VQA-05, GRD-06, CHG-07, DAT-02 | B | 5 |
| Evaluation: ISRO/SAC set | DAT-09, EVL-08, C-1 | E | — |
| Representative queries RQ-1–RQ-5 | RTR-06 | T, D | 1–4 |

---

## 13. Verification plan

| Method | What it covers | When it runs | Owner |
|---|---|---|---|
| **T** — automated tests | Every MUST row marked T: shapes, refusal, registry, parameters, trace contents, geometry round-trips, answer-layer isolation, stub-adapter load | On every change; green before any demo | S (M for model rows) |
| **B** — benchmark runs | Zero-shot and adapted scores on official test splits; per-category VQA | 13 Sep (zero-shot), 22 Sep (adapted), Build phase (M2–M4) | M |
| **E** — evaluation harness | Ablations, calibration, latency, held-out router, stress suite | Each checkpoint; before submission | M + S |
| **U** — headless UI checks | Trace visible, evidence above trace, upload flow, refusal visible, export works, deep links, zero console errors | On every UI change | S |
| **D** — live demo check | The five-beat demo and the Definition of Done in `07` §19, on the venue-class laptop, network off | Before submission; November on the real venue machine | S |
| **I** — inspection | ADR compliance (SAR path, answer isolation, no agent framework), licences, labelling honesty | At each checkpoint | M + S |

**Exit criteria for the portal submission:** every `MUST · S` row verified; the zero-shot and adapted numbers recorded in `models/MANIFEST.md`; the demo runs end to end offline.

---

## 14. Open items

Kept in sync with `10_Decision_Record.md` §7–§8.

| # | Item | Owner | By |
|---|---|---|---|
| O-1 | Zero-shot VQA baseline on VRSBench, both candidate bases | M | 13 Sep |
| O-2 | M1 QLoRA training, converging | M | 18 Sep |
| O-3 | Adapted score and gain; pack serving the pipeline (CON-03–05, ADP-05) | M + S | 22 Sep |
| O-4 | Stub-adapter test proving the load path (ADP-06) | M + S | before O-3 |
| O-5 | Upload end to end (ING-01, API-01, VAL-07) | S | 24 Sep |
| O-6 | Held-out router paraphrase set (RTR-07) | S | before submission |
| O-7 | Downloadable report (OUT-02) | S | before submission |
| O-8 | Confirm the submission deadline (C-9) | S | now |
| O-9 | Recover the full `Dataset Link` field (C-4) | S | before finalising the data plan |
| O-10 | Check the portal for a published judging table (C-3) | S | before submission |

---

## 15. Change log

| Version | Date | Change |
|---|---|---|
| 0.3.0-mvp | 2026-09-10 | First TRD — requirements traced to the MVP modules |
| 0.4.0-mvp | 2026-09-11 | Owner column; corrections from `09`; three rows for gaps it found |
| **1.0** | 2026-09-11 | **Full rewrite from the document set** (`00`, `01`, `03`, `05`, `06`, `09`, `10`, ADRs). Describes the target system rather than the early code. Adds priority and phase, component contracts, the API contract, data, training and evaluation requirements, the PS traceability matrix and the verification plan |
