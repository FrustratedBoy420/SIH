# Dark Transit — Technical Requirements & Low-Level Design

**Problem statement:** SIH26143 · NTRO · *Leveraging satellite imagery to determine oil spills at sea along with AIS data correlations to identify the vessel responsible.*
**Document:** TRD + LLD, revision A · 7 September 2026
**Implements:** `PRD.md` revision B · **Implemented by:** `mvp/` (measured numbers throughout are from that build)

---

## Document control

| | |
|---|---|
| Status | Working draft, binding on the build |
| Owner | Tech lead |
| Upstream | `PRD.md` rev B — the *what*. This document is the *how*. |
| Downstream | `mvp/darktransit/*.py`, `mvp/web/index.html` |
| Numbering | This document's IDs are always **`TR-<letter><digit>`** (`TR-U1`, `TR-P4`, `TR-S7`). The PRD's traffic requirements are **`TR-<digit>`** (`TR-1` … `TR-8`) — one letter apart, and the only place the two families touch. All other PRD IDs are `IN/DT/CH/DR/HD/DK/SC/RP/UI/NFR-*`. |

**Rule for reading.** A `TR-*` requirement here is testable from the code alone. Where a number is quoted as measured, it came from a recorded run and §14 gives the hardware and the spread. Where it is a budget, it says budget.

**Rule for writing.** No design in this document may weaken a PRD §16 safeguard. If an implementation shortcut would, the shortcut is wrong, not the safeguard.

---

## Contents

**Part A — Technical requirements**
1. [Scope and system context](#1-scope-and-system-context)
2. [Technology constraints and dependency policy](#2-technology-constraints-and-dependency-policy)
3. [Conventions: units, coordinates, time, identifiers](#3-conventions-units-coordinates-time-identifiers)
4. [Technical requirements](#4-technical-requirements)
5. [Data contracts](#5-data-contracts)

**Part B — Low-level design**
6. [Module map and layering](#6-module-map-and-layering)
7. [Layer 0 — primitives: `geo`, `raster`](#7-layer-0--primitives)
8. [Layer 1 — physics and world: `forcing`, `drift`, `scene`, `ais`, `incident`](#8-layer-1--physics-and-world)
9. [Layer 2 — stages: `detect`, `characterise`, `traffic`, `cfar`, `score`, `gates`](#9-layer-2--stages)
10. [Layer 3 — orchestration and delivery: `pipeline`, `dossier`, `server`, `cli`, `tests`](#10-layer-3--orchestration-and-delivery)
11. [Control flow: sequences and the stage state machine](#11-control-flow)
12. [Front-end low-level design](#12-front-end-low-level-design)
13. [API low-level design](#13-api-low-level-design)
14. [Performance: budgets and measurements](#14-performance-budgets-and-measurements)
15. [Error taxonomy, logging, observability](#15-error-taxonomy-logging-observability)
16. [Safety controls, in code](#16-safety-controls-in-code)
17. [Test design](#17-test-design)
18. [Full-build deltas](#18-full-build-deltas)
19. [Traceability matrix](#19-traceability-matrix)
20. [Appendix: constants, and the arithmetic behind them](#20-appendix-constants-and-the-arithmetic-behind-them)

---
---

# Part A — Technical requirements

## 1. Scope and system context

### 1.1 What this system is, technically

A batch pipeline. One invocation consumes a calibrated SAR scene, an AIS position archive and two gridded forcing fields, and produces a directory of typed JSON artefacts plus one HTML dossier. A thin read-mostly HTTP service exposes that directory, and two browser views render it. There is no database, no queue, no background worker, and no persistent process holding state between runs.

That shape is a deliberate choice, not a simplification. Every intermediate is a file on disk, so any stage can be re-run against a stored input; a demo that loses its network at stage 4 still has stages 1–3 on disk and can present them.

### 1.2 Context diagram

```
        ┌────────────────────────────────────────────────────────────────┐
        │  EXTERNAL (full build)                                         │
        │   Copernicus Data Space ──── Sentinel-1 GRD (SAFE / GeoTIFF)   │
        │   CMEMS ──────────────────── surface currents  (netCDF)        │
        │   CDS / ERA5 ─────────────── 10 m wind         (netCDF)        │
        │   AIS archive ────────────── NMEA / CSV                        │
        │   GSHHG ──────────────────── coastline         (shapefile)     │
        └───────────────┬────────────────────────────────────────────────┘
                        │  (MVP: darktransit.incident generates all of these)
                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  PIPELINE  darktransit.pipeline.run()                          │
        │  stages 01..07, three of which can halt                        │
        └───────────────┬────────────────────────────────────────────────┘
                        │  writes
                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  RUN DIRECTORY  runs/<run_id>/                                 │
        │  manifest.json · 01..07_*.json · run.json · dossier.html       │
        │  log.jsonl                                                     │
        └───────────────┬────────────────────────────────────────────────┘
                        │  read-mostly
                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  SERVICE  darktransit.server (stdlib) → FastAPI in full build  │
        │  GET run.json / artefacts / dossier / log · POST rescore       │
        └───────────────┬────────────────────────────────────────────────┘
                        ▼
        ┌────────────────────────────────────────────────────────────────┐
        │  VIEWS   web/index.html (narrative, live)                      │
        │          workstation (MapLibre, Phase 1)                       │
        └────────────────────────────────────────────────────────────────┘
```

### 1.3 Deployment topology

Single host. The pipeline is a CLI process; the service is a second process reading the same directory. Nothing is shared but the filesystem. For the grand finale this runs on one laptop with no network, which is the whole point of the dependency policy in §2.

### 1.4 Explicitly out of technical scope

No authentication, no multi-tenancy, no persistence layer, no message bus, no container orchestration, no horizontal scale. One incident, one operator, one machine. Adding any of these before the finale is scope creep against PRD §5 non-goals.

---

## 2. Technology constraints and dependency policy

### 2.1 The rule

**TR-D1.** The MVP shall import nothing outside the Python standard library except `numpy`.

The reason is operational, not aesthetic. The finale is 36 hours on venue hardware and possibly venue network. A `pip install` that fails at hour 30 is a lost round. Every dependency admitted must survive the question *"what happens if this cannot be installed at the venue?"*

Measured cost of holding that line: ~900 lines of `geo.py` + `raster.py` reimplementing what `shapely` and `scipy.ndimage` would give. That is the price and it was paid deliberately.

### 2.2 Runtime

| | MVP (measured) | Full build (target) |
|---|---|---|
| Python | 3.14.7 | ≥ 3.11 |
| numpy | 2.4.4 | ≥ 1.26 |
| Everything else | none | see PRD §15 |
| Network at run time | none | Phase 1 data pulls only, cached to disk |
| Peak RSS | 176 MB | ≤ 4 GB (TR-P4) |

**TR-D2.** Any dependency added in Phase 1 shall be introduced behind a module boundary named in §18, and the pipeline shall degrade to the numpy path and **log the degradation** when the dependency is absent. Detection already works this way (`detect.py` stands in for the unavailable U-Net, and `02_detection.json.method` says so).

**TR-D3.** No code path shall require a GPU. Training (Phase 1) may; inference and everything in this document may not.

### 2.3 Reproducibility of the environment

**TR-D4.** The run manifest shall record `python`, tool `version`, every parameter, the weight-pack file and version, and the seed. Two runs whose manifests match shall produce identical scores (verified by `tests.py::AC-8`).

---

## 3. Conventions: units, coordinates, time, identifiers

Most defects in a geospatial pipeline are unit and frame defects. These conventions are therefore requirements, not style.

### 3.1 Units

**TR-U1.** SI internally, without exception:

| Quantity | Internal unit | Emitted unit | Suffix in field names |
|---|---|---|---|
| Distance | metre | kilometre (display only) | `_m`, `_km` |
| Speed | m/s | knots (display only) | `_ms`, `_kn` |
| Time | second | ISO-8601 UTC string | `_s`, `_h`, `_utc` |
| Angle | degrees true | degrees | `_deg` |
| Backscatter | dB (log domain) | dB | `_db` |
| Area | m² | km² | `_m2`, `_km2` |
| Diffusivity | m²/s | m²/s | `k_h` |

**TR-U2.** Every emitted numeric field shall carry its unit in the field name. A field named `length` is a defect; `length_m` is not.

**TR-U3.** Conversions live in exactly one place per pair. Knots↔m/s is `ais.KN = 0.514444` and nowhere else.

### 3.2 Coordinates

**TR-C1.** Geographic input and output are EPSG:4326, longitude first (`[lon, lat]`), matching GeoJSON.

**TR-C2.** All metric computation happens in a **local tangent plane** (`geo.TangentPlane`), east/north metres, anchored at a stated reference latitude and longitude. Rationale: at scene scale (tens of km) an equirectangular tangent plane is accurate to well under one pixel, and it removes a `pyproj` dependency.

**TR-C3.** A tangent plane's anchor shall be recorded wherever its outputs are persisted. Comparing metres computed in two different planes is a defect; the code avoids it by passing one plane down the whole run (`incident.build() → inc["plane"]`).

**TR-C4.** Bearings are degrees true, clockwise from north, `atan2(east, north)`. Undirected axes (a slick's principal axis) are folded to `[0, 180)`; directed courses stay in `[0, 360)`.

### 3.3 Time

**TR-T1.** Two representations, and only two:
- **Internal:** float `t_h`, hours relative to the detection acquisition time. Negative is the past. This is the axis every array is indexed on.
- **External:** ISO-8601 UTC with a `Z` suffix, produced only at the emit boundary by `pipeline._utc(base_iso, hours)`.

**TR-T2.** No naive local time anywhere. No `datetime.now()` outside `run_id` minting and `generated_utc`.

**TR-T3.** A temporal output shall be a window, never an instant (NFR-6). The type system enforces this by there being no `origin_time` field to populate — only `origin_window: [start, end]`.

### 3.4 Identifiers

**TR-I1.** `run_id = "<scenario>-<YYYYMMDDTHHMMSS>-<manifest_sha256[:8]>"`. Sortable, unique per invocation, and carries its own provenance.

**TR-I2.** Synthetic MMSIs shall be minted with prefix `999`, which is not an assigned Maritime Identification Digit, so a generated identity cannot collide with a real vessel (NFR-9, `ais._mmsi`).

**TR-I3.** Candidate ids are `C01..Cnn` ordered by descending area; radar target ids are `T01..Tnn` in raster scan order. Both are stable within a run and meaningless across runs.

---

## 4. Technical requirements

Grouped by concern. Each is testable; §17 says by what.

### 4.1 Determinism and reproducibility

| ID | Requirement |
|---|---|
| **TR-R1** | Every stochastic step shall draw from an explicitly passed `numpy.random.Generator`. No module shall call the global `numpy.random` namespace. |
| **TR-R2** | Generators shall be derived from the single manifest seed by fixed offsets (`seed+1` truth advection, `seed+2` detection scene, `seed+3` archive scene, `seed+11` pipeline), so any stage's randomness is reproducible in isolation. |
| **TR-R3** | The truth-side forward advection and the pipeline-side hindcast shall use **different** generators. Sharing them would make the hindcast reversible and the recovery test meaningless. |
| **TR-R4** | No dict-ordering, set-iteration or filesystem-listing order shall affect a numeric output. Sorting keys are explicit (`sort(key=-score)`, `sort(key=-area)`). |
| **TR-R5** | Two runs with the same manifest shall produce byte-identical `07_attribution.json` modulo the `generated_utc` timestamp. |

### 4.2 Numerical requirements

| ID | Requirement |
|---|---|
| **TR-N1** | All floating-point work is float64. No float32 anywhere in the geometry, drift or scoring paths. |
| **TR-N2** | Every division by a possibly-zero denominator shall be guarded with an explicit epsilon, and the epsilon shall be visible at the call site (`max(den, 1e-9)`), never hidden in a helper. |
| **TR-N3** | Eigen-decomposition of the mask covariance shall use `numpy.linalg.eigh` (symmetric), never `eig`, so eigenvalues are real and ordered. |
| **TR-N4** | Particles leaving the forcing domain shall be set to NaN, counted, and retired — never clamped to the boundary. Clamping produces a false pile-up on the domain edge that reads as a confident origin. |
| **TR-N5** | Emitted JSON shall contain no `NaN`, `Infinity` or `-Infinity` tokens; non-finite values become `null` via `pipeline._clean`. Strict-JSON parsers (including the browser's) reject the alternatives. |
| **TR-N6** | Angular differences shall be computed modulo the correct period — 360° for courses, 180° for undirected axes — and never by naive subtraction. |
| **TR-N7** | The RK4 step shall evaluate the velocity field four times per step at the correct sub-times (`t`, `t+h/2`, `t+h/2`, `t+h`). A step that reuses one velocity is Euler wearing a costume. |

### 4.3 Interface requirements

| ID | Requirement |
|---|---|
| **TR-A1** | Stage *n* shall read only stage *n−1*'s artefact and the run manifest. No stage shall reach into another stage's in-memory objects. |
| **TR-A2** | The pipeline shall never read the `truth` block. It is written for scoring the run and is inert input to nothing. |
| **TR-A3** | `run.json` is the sole contract between backend and every view. No view shall read a stage artefact directly, and no view shall hold a number of its own. |
| **TR-A4** | `POST /rescore` shall be a pure function of `07_attribution.json` and the supplied weights. It shall not touch stages 1–6, and it shall not write to the run directory. |
| **TR-A5** | There shall be no endpoint that transmits a dossier anywhere (NFR-4). |

### 4.4 Performance requirements

| ID | Requirement | Budget | Measured (MVP) |
|---|---|---|---|
| **TR-P1** | Full pipeline, one scene + 52 h archive | ≤ 600 s (NFR-8) | **6.1 s** |
| **TR-P2** | Slowest single stage | ≤ 300 s | **2.46 s** (stage 04) |
| **TR-P3** | `POST /rescore` round trip | ≤ 150 ms | ~15 ms |
| **TR-P4** | Peak RSS | ≤ 4 GB | **176 MB** |
| **TR-P5** | `run.json` size (the view must load it over a venue network) | ≤ 5 MB | **211 KB** |
| **TR-P6** | Time to first meaningful paint of the narrative view | ≤ 2 s | not yet measured on venue hardware |

Full-build headroom: real Sentinel-1 IW at 10 m is ~25 000× more pixels than the 640×640 synthetic scene per unit area, and the real forcing read is I/O-bound. §14.4 works through where the budget goes.

### 4.5 Robustness requirements

| ID | Requirement |
|---|---|
| **TR-B1** | A gate firing is a normal return path, not an exception. Gates return a record; only `halts=True` short-circuits, and the run still emits every artefact produced so far, plus `run.json` and a dossier. |
| **TR-B2** | A halted run's dossier shall still carry page 1 (limitations) and shall state the halt reason in place of a finding. |
| **TR-B3** | A stage that cannot produce its primary output shall emit the artefact with an explicit `available: false` and a `reason`, not omit the artefact. The dark channel is the worked example. |
| **TR-B4** | Degenerate geometry shall be handled explicitly and reported: a reachable-set ellipse with semi-major ≤ focal half-distance returns a degenerate ring rather than raising (`geo.ellipse_from_foci`), and the caller's overlap becomes 0. |
| **TR-B5** | Contour tracing shall be bounded by an explicit step limit (`8·|mask| + 64`) so a pathological mask cannot spin forever. |
| **TR-B6** | An empty candidate set, an empty vessel set and a single-vessel shortlist shall each produce a valid run — Gate 1, an empty ranked list, and Gate 4 respectively. |

### 4.6 Security and dual-use requirements

Restated here as code-level obligations; the product-level statements are PRD §16.

| ID | Requirement |
|---|---|
| **TR-S1** | Generated text shall be scanned for a forbidden-phrase list before the dossier is written; a hit raises `AssertionError` and fails the run (`pipeline.check_language`). |
| **TR-S2** | Static file serving shall resolve the requested path and refuse anything outside `web/` (`server.Handler._static` path-prefix check). |
| **TR-S3** | The service shall bind `127.0.0.1` only. |
| **TR-S4** | The rescore endpoint shall accept only a weights mapping and shall ignore unknown keys; it shall never accept a code path, expression or file path. |
| **TR-S5** | No vessel identity in any demo artefact shall be capable of matching a real vessel (TR-I2). |
| **TR-S6** | Run artefacts shall contain no credentials. In the full build, data-source credentials live in the environment and are recorded in the manifest by *source name only*, never by value. |

---

## 5. Data contracts

Field-by-field. `?` marks nullable. Types are JSON types; the unit is in the name per TR-U2.

### 5.1 `manifest.json`

| Field | Type | Notes |
|---|---|---|
| `tool`, `version` | string | `"dark-transit"`, semver + build tag |
| `scenario`, `label`, `notes` | string | incident identity |
| `seed` | int | root of every generator (TR-R2) |
| `detection_utc` | string | ISO-8601 Z; the origin of the `t_h` axis |
| `parameters` | object | `leeway_alpha, k_h, dt_s, n_particles, integrator, horizon_h, sigma_current, sigma_alpha` |
| `forcing` | object | `current`, `wind` — source names, not values |
| `provenance` | object | `ais`, `scene`, `forcing` ∈ {`real`, `synthetic`, `analytic`} |
| `weight_pack`, `weight_pack_version`, `weights` | string, string, object | |
| `python` | string | interpreter version |
| `hash` | string | SHA-256 over the sorted manifest, minus `hash` and `run_id` |
| `run_id` | string | TR-I1 |

### 5.2 `01_intake.json`

`scene{scene_id, sensor, mode, polarisation, pixel_m, looks, noise_floor_db, acquired_utc, crs, size_px[2]}`, `archive_scene?{scene_id, acquired_utc, acquired_h}`, `ais{source, positions, distinct_mmsi, window[2], span_h}`, `preflight[]{check, status ∈ {pass,caution,fail}, detail}`, `gate`.

### 5.3 `02_detection.json`

`raw_components` int, `candidates` int, `retained` int, `confidence?` float ∈ [0,1], `drivers?[]{name, value, z, contribution}`, `sea_db`, `slick_db?`, `method` string, `table[]{id, area_km2, verdict ∈ {retained,rejected}, basis, confidence, delta_db, wind_ms, edge_gradient, shape_complexity, elongation}`, `gate`.

**Contract note.** `drivers` is required whenever `confidence` is non-null (DT-5, NFR-1). A confidence without drivers is a schema violation, not a cosmetic one.

### 5.4 `03_geometry.json`

`area_km2`, `perimeter_km`, `centroid[lon,lat]`, `principal_axis_deg` ∈ [0,180), `elongation` ≥ 1, `axis_usable` bool, `length_km`, `width_km`, `age_hours`, `age_hours_lo`, `age_hours_hi`, `age_method` string, `age_notes` string, `polygon[][lon,lat]`, `confidence`.

**Contract note.** `axis_usable=false` obliges every consumer to suppress the heading factor (HD-2). A consumer that reads `principal_axis_deg` without checking `axis_usable` is defective.

### 5.5 `04_drift.json`

`n_particles`, `integrator`, `dt_s`, `leeway_alpha`, `k_h`, `horizon_h`, `sigma_current`, `sigma_alpha`, `r95_series[]{hour_back, r95_km, alive}`, `r95_union_km`, `origin_window_h[2]`, `origin_window[2]` (ISO), `origin_region[][lon,lat]`, `origin_centroid[lon,lat]`, `shear_per_hour`, `forward{hours, centroid, r95_km, landfall, eta_utc?, note}`, `gate`, `note`.

**Contract note.** There is deliberately **no** `origin_point` field (NFR-6, TR-T3). `origin_centroid` exists for map framing and is documented as such; it is not an origin estimate and no scoring factor reads it.

### 5.6 `05_traffic.json`

`in_window`, `dropped`, `vessels[]`, `dropped_vessels[]{mmsi, name, ship_type, basis, closest_approach_km}`, `note`.

Each `vessels[]` entry: `mmsi, name, ship_type, length_m, source, channel ∈ {ais, ais-gap}, baseline_cadence_s, cog?, crossing_utc?, closest_approach_km, implausible_fixes, gaps[], track[][lon,lat,t_h]`.

Each `gaps[]` entry: `start_utc, end_utc, duration_s, baseline_cadence_s, anomaly ∈ [0,1], overlap ∈ [0,1], v_max_ms, envelope[][lon,lat]`.

**Contract note.** `track` is decimated to ≤ 260 points for transport (TR-P5). The full table stays in memory during the run and is never emitted; if a consumer needs it, it re-runs stage 05.

### 5.7 `06_dark.json`

`available` bool, `reason?`, `gate`, and when available: `cfar{pfa, tau, n_train, train_km, guard_km}`, `acquired_h`, `targets`, `matched`, `unmatched`, `unmatched_targets[]{target_id, lon, lat, est_length_m, est_length_range_m[2], peak_db, in_origin_region}`, `note`.

**Contract note.** `pfa` is mandatory whenever `available` is true. A CFAR count without its false-alarm probability is uninterpretable and must not be rendered.

### 5.8 `07_attribution.json`

`ranked[]`, `leader_margin?`, `weights`, `weight_pack`, `weight_pack_version`, `gate`, `ablation`, `finding`.

Each `ranked[]` entry: `rank, mmsi?, name, ship_type, length_m, source, channel, cog?, delta_axis?, crossing_h?, closest_approach_km, baseline_cadence_s, implausible_fixes, factors{}, suppressed[], justifications{}, gaps[], score, corroboration?`.

**Contract notes.**
- `mmsi` is nullable by design: an unmatched radar return is a candidate with no identity, and the model must hold that without inventing one. In this build no such row is ever created (DK-4 forbids promotion), but the field stays nullable so the invariant is visible.
- `justifications` shall have one entry per factor **including suppressed ones**, whose text says why it was suppressed. Five factors, five sentences, always.
- `factors` omits suppressed keys; `suppressed` lists them. A consumer that treats a missing factor as zero is defective — that is exactly the bug the split exists to prevent.

### 5.9 `run.json`

The flattened view contract. Superset of the above plus `run_id, generated_utc, version, scenario, scenario_label, scenario_notes, detection_utc, provenance, parameters, forcing, manifest_hash, halted?, gates[], limitations[]{title,text}, truth{...}`.

**Contract note.** `truth` is present only because every incident in this build is synthetic; it carries `top1_correct` so a run can be scored. In a real deployment the block is absent, and no view may depend on it. `web/index.html` does not read it.

### 5.10 `log.jsonl`

One JSON object per line: `{t: float seconds since run start, stage: string, event: string, ...}`. Gate decisions appear inside their stage's record and again in `run.json.gates`. Append-only, flushed once at the end of the run.

---
---

# Part B — Low-level design

## 6. Module map and layering

3 304 lines of Python across 18 modules, plus a 1 152-line single-file front end.

```
 layer 3   cli ── server ── pipeline ── dossier ── tests
 delivery   │        │          │
            │        │          ├──────────────┬───────────┬──────────┐
 layer 2    │        │      detect      characterise    traffic    cfar    score    gates
 stages     │        │          │              │           │         │        │
            │        │          └──────────────┴─────┬─────┴─────────┘        │
 layer 1    │        │                          scene · ais · incident · drift · forcing
 world      │        │                                   │        │
 layer 0    └────────┴───────────────────────────────  geo  ·  raster
 primitives                                          (numpy only)
```

### 6.1 Layering rules

| ID | Rule |
|---|---|
| **TR-L1** | Imports go downward only. `geo` and `raster` import nothing from the package. A cycle is a build failure, not a smell. |
| **TR-L2** | Layer 2 modules do not import each other. They are siblings coordinated by `pipeline`; `score` is the one exception, importing `ais.SHIP_CLASSES` for the class prior, and that constant is data, not behaviour. |
| **TR-L3** | `incident` is the only module permitted to hold ground truth. Nothing in layer 2 may import it. (`pipeline` imports it to *construct* the world, then hands layer 2 only observables.) |
| **TR-L4** | `dossier` and the front end read `run.json`-shaped dicts, never dataclasses. That is what keeps the HTML template and the browser view interchangeable. |

### 6.2 Module inventory

| Module | Lines | Layer | Responsibility |
|---|---|---|---|
| `geo.py` | 186 | 0 | tangent plane, polygon predicates, reachable-set ellipse |
| `raster.py` | 171 | 0 | box statistics, speckle filter, morphology, labelling, contour tracing |
| `forcing.py` | 150 | 1 | gridded current and wind, trilinear space–time interpolation |
| `drift.py` | 202 | 1 | RK4 advection, diffusion, ensemble, r₉₅, density-quantile region |
| `scene.py` | 162 | 1 | synthetic calibrated σ⁰ scene |
| `ais.py` | 140 | 1 | vessels, tracks, cadences, broadcast gaps |
| `incident.py` | 208 | 1 | scenarios and ground truth |
| `detect.py` | 193 | 2 | candidates, features, discriminator, verdicts |
| `characterise.py` | 112 | 2 | area, perimeter, axis, elongation, age |
| `traffic.py` | 170 | 2 | cadence baselines, gaps, reachable sets, the join |
| `cfar.py` | 115 | 2 | CA-CFAR, length estimation, AIS matching |
| `score.py` | 235 | 2 | five factors, weighted mean, ranking, ablation |
| `gates.py` | 70 | 2 | the five refusals |
| `pipeline.py` | 504 | 3 | the spine |
| `dossier.py` | 272 | 3 | the report |
| `server.py` | 127 | 3 | HTTP service |
| `cli.py` | 128 | 3 | entry point |
| `tests.py` | 152 | 3 | acceptance criteria, executable |

---

## 7. Layer 0 — primitives

### 7.1 `geo.py`

**Responsibility.** Everything that turns degrees into metres and back, and every planar predicate the pipeline needs. Deliberately not a geometry library: it holds exactly the eight operations used, each in a form the rest of the code can reason about.

**Public surface.**

```python
R_EARTH = 6_371_008.8                                   # metres, mean

class TangentPlane:
    def __init__(self, lat0: float, lon0: float)
    def to_xy(self, lon, lat)      -> (ndarray, ndarray)   # east, north metres
    def to_lonlat(self, x, y)      -> (ndarray, ndarray)

def haversine_m(lon1, lat1, lon2, lat2)                 -> float
def polygon_area_m2(xy)                                 -> float
def polygon_perimeter_m(xy)                             -> float
def points_in_polygon(pts, poly)                        -> ndarray[bool]
def convex_hull(pts)                                    -> ndarray
def ellipse_from_foci(f1, f2, sum_dist, n=96)           -> ndarray          # (n,2) ring
def overlap_fraction(region_poly, other_poly, n=160)    -> float            # [0,1]
def bearing_deg(dx, dy)                                 -> float            # [0,360)
def axis_delta_deg(cog_deg, axis_deg)                   -> float            # [0,90]
def simplify(xy, tol_m=120.0)                           -> ndarray
```

**`TangentPlane`.** Two scale factors computed once in `__init__`:

```
m_lat = R · π/180                        metres per degree latitude
m_lon = R · π/180 · cos(lat0)            metres per degree longitude at the anchor
```

Cost: two multiplies per point, no trig at call time. Error: the longitude scale is exact only at `lat0` and drifts as `cos(lat)/cos(lat0)`. Over ±0.6° of latitude at 22.5°N that is 0.4 %, i.e. 260 m over a 64 km scene — sub-pixel at 100 m and acceptable at 10 m for the AOI subsets this product uses. **TR-C5:** if an AOI ever exceeds ±1° of latitude, this class is replaced by `pyproj` and this note is the trigger.

**`points_in_polygon`.** Vectorised even–odd ray crossing. Loops over the *edges* (typically 12–96) and tests all N points per edge with numpy, rather than the naive per-point loop. `O(N·M)` but with the N dimension vectorised, so a 25 600-point grid against a 96-vertex ellipse is ~2.5 M elementwise operations — milliseconds. Horizontal edges are skipped (`ay == by`) to avoid the divide-by-zero and the classic double-count at a vertex.

**`ellipse_from_foci`.** The reachable set, in closed form. A vessel dark from `t₋` at `p₋` to `t₊` at `p₊`, bounded by `v_max`, occupies

```
{ q : |q − p₋| + |q − p₊| ≤ v_max · (t₊ − t₋) }
```

which is an ellipse with foci at the two fixes, `a = v_max·Δt/2`, `c = |p₊ − p₋|/2`, `b = √(a² − c²)`. Sampled at 96 points, rotated by the focal bearing, translated to the focal midpoint.

*Degenerate case, and why it is returned rather than raised:* `a ≤ c` means the vessel could not have travelled between its own two fixes at `v_max` — either `v_max` is set below the vessel's observed speed, or the fixes are inconsistent. The function returns a 3-point degenerate ring so the caller's `overlap_fraction` yields 0 and the vessel simply scores nothing on containment. **This was a real defect during the build:** `make_vessel` drew `v_max` independently of the scripted track speed and occasionally undercut it, silently zeroing a decoy vessel's containment. Fixed at source (`incident.build` clamps `v_max ≥ sog + 1.8 kn`, which is also the OQ-6 answer: the bound is the larger of class design speed and observed speed).

**`overlap_fraction`.** Deterministic grid sample, `n×n = 25 600` points over the *region's* bounding box, tested against the region and then against the other polygon. Normalised by the region, not by the other polygon — a huge reachable set gets no credit for covering everything; it gets credit for covering the origin region, which is the actual question. Quantisation error at n=160 over a ~30 km region is ~190 m per cell, so the fraction is good to about ±0.6 %. **TR-N8:** the sample count is fixed, not adaptive, because an adaptive count would make the score depend on region size in a way nobody could explain to a judge.

**`simplify`.** Iterative Douglas–Peucker with an explicit stack (no recursion, so a pathological ring cannot blow the Python stack). Used with `tol_m=2.0` px on detection contours and `250 m / cell_m` on drift regions.

**Failure modes.** All functions accept degenerate input (< 3 vertices, empty point arrays) and return 0 or an empty array rather than raising. That is deliberate: at this layer a raise would abort a run over a cosmetic geometry, and the stages above are the right place to decide that an empty polygon matters.

### 7.2 `raster.py`

**Responsibility.** The image operations detection needs, on numpy alone.

**Public surface.**

```python
def box_mean(a, r)                      -> ndarray     # (2r+1)^2 mean, shrinking at edges
def box_mean_std(a, r)                  -> (ndarray, ndarray)
def lee_filter(img, r=3, looks=4.0)     -> ndarray
def refined_lee(img, r=3, looks=4.0)    -> ndarray
def gradient_magnitude(a)               -> ndarray
def dilate(mask, it=1) / erode / close  -> ndarray[bool]
def label(mask, connectivity=8)         -> (ndarray[int32], int)
def trace_boundary(mask)                -> ndarray     # (k,2) as (col,row)
def perimeter_pixels(mask)              -> float
```

**`box_mean` — the workhorse.** Summed-area table (integral image), so a window mean of *any* radius costs `O(1)` per pixel after an `O(HW)` prefix sum. Two integral images are built: one of the data, one of an all-ones array, so the edge-shrunk window's true element count is exact rather than assumed. Every other statistic in the module is built from this: `box_mean_std` via `E[x²] − E[x]²` (clamped at zero for float error), the Lee filter via local mean and variance, CFAR ring statistics via a difference of two box sums.

Complexity for a 640×640 scene: 2 prefix sums, then constant work per pixel per call. Detection calls it 4 times, CFAR 4 times.

**`lee_filter`.** SAR speckle is multiplicative, `I = R·n` with `E[n]=1`, `Var[n]=1/L` for `L` looks:

```
k = max(0, Var[I] − Ī²/L) / Var[I]
R̂ = Ī + k·(I − Ī)
```

Where local variance is fully explained by speckle, `k → 0` and the pixel goes to the local mean; where it exceeds that, `k → 1` and the pixel is left alone.

**`refined_lee`.** The textbook version selects among eight directional sub-windows. This build uses a cheaper equivalent for the purpose at hand: compute the plain Lee estimate, compute the gradient of the smoothed image, and **leave the raw pixel wherever the gradient is above its 97th percentile**. Edges therefore survive unsmoothed.

*Why this shortcut is defensible here:* the only thing downstream that depends on edge fidelity is `edge_gradient_db_per_px`, the primary look-alike discriminator. A filter that softened edges would systematically bias that feature toward "look-alike" for every candidate, oil included. Preserving the top 3 % of gradients preserves exactly the quantity being measured. **The honest caveat, which belongs on the slide:** this is not the published refined Lee, and the 97th-percentile threshold is a house parameter. Phase 1 replaces it with the directional-window implementation and re-measures the feature distribution.

**`label`.** BFS flood fill with an explicit `collections.deque`, 8-connectivity by default. `O(HW)` with a Python-level inner loop — the one place in the pipeline where the interpreter shows. Measured: it dominates the 1.02 s detection stage, over 1 299 components in a 640×640 scene. Phase 1 replaces it with `scipy.ndimage.label` behind the same signature; the call sites do not change.

**`trace_boundary`.** Moore-neighbourhood tracing from the topmost-leftmost pixel, back-tracking direction maintained as `(i + 4) % 8`, terminating on return to the start.

*Defect found and fixed during the build:* the back-track index was initially computed as `(i + 4 + 4) % 8`, i.e. `i`, which made the tracer oscillate between two pixels and emit 1 505 points for a 180-pixel rectangle. The regression test is now the geometry it failed: a 10×18 rectangle must trace to a 52-pixel perimeter, and a 36×14 ellipse must land within 1 % of Ramanujan's approximation. Both are in `tests.py`'s reach and were verified during construction.

**`perimeter_pixels`.** Traced-contour path length, so diagonal steps contribute √2 rather than 1 — the standard 8-connectivity correction. A naive boundary-pixel count overestimates a diagonal edge by 41 %, which would propagate straight into `shape_complexity = P²/(4πA)` and skew the look-alike discriminator.

---

## 8. Layer 1 — physics and world

### 8.1 `forcing.py`

**Responsibility.** Serve `u(lon, lat, t)` for two vector fields with the same interface the real reanalysis products will have.

```python
@dataclass
class ForcingField:
    lons: ndarray     # (nx,)   ascending
    lats: ndarray     # (ny,)   ascending
    times_h: ndarray  # (nt,)   ascending, hours relative to detection
    u: ndarray        # (nt, ny, nx) eastward m/s
    v: ndarray        # (nt, ny, nx) northward m/s
    name: str
    def sample(self, lon, lat, t_h) -> (ndarray, ndarray)
    def speed(self, lon, lat, t_h)  -> ndarray

def make_current(bbox, hours, res_deg=1/12, mean_speed, mean_dir_deg,
                 tide_amp, eddy=True, name=...) -> ForcingField
def make_wind(bbox, hours, res_deg=0.25, base_speed, base_dir_deg,
              veer_deg_per_h, low_wind_cells=(), name=...) -> ForcingField
```

**`sample` — trilinear in (lon, lat, t).** `searchsorted` for the cell index, fractional offset, bilinear in space on each of the two bracketing time slices, then linear in time. Vectorised over the particle array: one `sample` call advances all 2 600 particles.

Out-of-domain points return NaN (TR-N4). The mask is computed once and applied to both components.

**Grid resolutions are not arbitrary.** `1/12°` for current and `0.25°` for wind are the actual resolutions of CMEMS `GLOBAL_ANALYSISFORECAST_PHY` and ERA5. Using them in the synthetic build means the interpolation code, the memory footprint per hour, and — importantly — the *inability of the wind grid to resolve a small feature* are all faithful. A low-wind cell of 9 km radius simply cannot be represented on a 27 km grid, which is why `incident` specifies cells at 16–20 km.

**Analytic field construction.**
- Current: uniform mean flow + M2 tide (period 12.4206 h, amplitude on both components with a quarter-period phase offset, so the tidal ellipse is elliptical rather than rectilinear) + one Gaussian-enveloped solid-body eddy of 26 km scale. The eddy exists to put real horizontal shear in the field, so `drift.shear_per_hour` has something to measure and the HD-3 caveat is not decorative.
- Wind: a synoptic vector that veers slowly with time, minus Gaussian deficits at the low-wind cells.

**Memory.** `(nt, ny, nx)` float64 × 2 components. For the MVP domain (85 h × 15 × 20 current, 85 × 6 × 7 wind) that is 0.4 MB. For a real ERA5 + CMEMS subset over one AOI and 72 h, ~200 MB — within TR-P4 provided the subset is cut *before* load. **TR-P7:** forcing shall be subset to the AOI and window at read time and held as a single in-memory block for the whole run. Re-reading netCDF per particle per step is the single easiest way to miss TR-P1.

### 8.2 `drift.py`

**Responsibility.** The physics the whole product rests on, and the honest reporting of its uncertainty.

```python
@dataclass
class DriftParams:
    alpha: float = 0.03          # leeway coefficient
    k_h: float = 5.0             # horizontal eddy diffusivity, m²/s
    dt_s: float = 600.0
    n_particles: int = 2600
    integrator: str = "RK4"
    sigma_current: float = 0.15  # ensemble spread on current amplitude
    sigma_alpha: float = 0.25    # ensemble spread on leeway

@dataclass
class CloudSnapshot:
    hour: float; lons: ndarray; lats: ndarray; r95_km: float
    polygon: list; alive: int

def make_ensemble(n, params, rng)                          -> ndarray (n,2)
def step_rk4(lon, lat, t_h, dt_s, current, wind, params, rng=None, pert=None)
def integrate(lon, lat, t0_h, hours, current, wind, params, rng=None,
              snapshot_every_h=1.0, pert=None)             -> list[CloudSnapshot]
def r95_km(lons, lats)                                     -> float
def density_region(lons, lats, cell_m=500.0, quantile=0.95,
                   simplify_m=250.0)                       -> list[[lon,lat]]
def seed_in_polygon(poly_lonlat, n, rng)                   -> (ndarray, ndarray)
def shear_per_hour(lon, lat, t_h, current, wind, params, d_m=4000.0) -> float
```

**Velocity model.**

```
u(x,t) = c_i · u_current(x,t) + α · a_i · u_wind10(x,t)
```

`c_i ~ N(1, σ_c)` and `a_i ~ max(0, N(1, σ_a))` are **per-particle** draws, fixed for the run (`make_ensemble`). This is DR-8, and it is not optional. Without it the cloud grows only by diffusion, `r₉₅ ~ √(2·K_h·t)` = 1.7 km at 40 h, which is not remotely the real uncertainty of a 40-hour hindcast, and Gate 2 could never fire on any input. With it the spread is dominated by forcing error and grows roughly linearly:

| hours back | 0 | 8 | 16 | 24 | 32 | 40 |
|---|---|---|---|---|---|---|
| r₉₅ (km), measured | 3.46 | 4.59 | 7.37 | 10.01 | 13.75 | 18.55 |

**Integration.** Classical RK4 at `dt = ±600 s`, all four stages evaluated at their proper sub-times (TR-N7), followed by the diffusive increment `x += √(2·K_h·|dt|)·N(0,I₂)`. The tangent plane for a step is re-anchored on the current cloud centroid, so the plane never drifts far from its own anchor even over a 40-hour translation.

Per-step cost: 4 forcing evaluations × 2 fields × N particles. For N = 2 600 and 240 steps: 2.0 M interpolations per direction, measured at **2.46 s for both directions plus region construction** — 41 % of total pipeline time and the correct place to optimise first if TR-P1 ever comes under pressure.

**`r95_km`.** Radius about the cloud centroid containing 95 % of *surviving* particles. Retired (NaN) particles are excluded from the percentile and counted separately in `alive`, so a shrinking population is visible rather than silently improving the statistic.

**`density_region`.** The origin region, and the one piece of this module that is a modelling decision rather than physics:

1. bin particles onto a metric grid (700 m cells in the pipeline);
2. sort cells by descending count, accumulate until 95 % of particles are covered;
3. morphological close (1 iteration) to bridge single-cell gaps;
4. label, keep the **largest** component;
5. trace its boundary, simplify, convert to lon/lat.

A convex hull was rejected: over a bimodal cloud it invents water no particle visited, and the containment factor is normalised by region area, so invented area directly deflates every vessel's score. Keeping only the largest component is a stated approximation — a genuinely bimodal origin region would lose a lobe, and `alive` plus the r₉₅ series are what would reveal it. **Open item:** emit all components above a size threshold instead. Cheap; not yet done.

**Why backward is not forward.** Forward advection–diffusion is well-posed; reversing time gives the anti-diffusion equation, which is ill-posed. What `integrate(hours < 0)` computes is therefore a **reachable set**, not a probability density over origins. Three code-level consequences: the output type has no scalar origin field; `r95_series` is a first-class emitted array, not a debug aid; and Gate 2 exists.

**The hindcast draws a fresh ensemble.** The truth-side forward run and the pipeline-side backward run must not share `pert` (TR-R3). During construction they briefly did, and the backward r₉₅ *contracted* from 5.2 km to 2.1 km at 10 h before re-expanding — the ensemble was exactly reversible, which is a physics claim no hindcast may make. Fresh draws restore monotone growth.

### 8.3 `scene.py`

**Responsibility.** A calibrated σ⁰ raster containing everything that makes detection hard.

```python
@dataclass
class Scene:
    scene_id: str; sigma0_db: ndarray; wind_ms: ndarray
    plane: TangentPlane; x: ndarray; y: ndarray; pixel_m: float
    acquired_h: float; sensor/mode/polarisation: str
    looks: float; noise_floor_db: float; truth: dict
    def px_of(self, lon, lat)      -> (col, row)      # float, unrounded
    def lonlat_of_px(self, col, row) -> (lon, lat)

def make_scene(scene_id, centre_lon, centre_lat, half_width_m, pixel_m,
               acquired_h, wind_field, slick_lonlat=None, slick_damping_db=12.0,
               biogenic=(), ship_lonlat=(), rng=None, looks=4.0, ...) -> Scene
```

**Radiometry.**

```
σ⁰_dB(sea) = −22 + 12·log₁₀(U₁₀)            U₁₀ from the wind field, same field detection reads
σ⁰_dB(oil) = σ⁰_dB(sea) − 12 dB
```

Giving −11.6 dB at 7.5 m/s, −17.2 dB at 2.5 m/s, −23.6 dB under a slick. Right order of magnitude, right ordering, **not** a calibrated instrument model — and the code says so in its docstring so nobody quotes these as CMOD-derived.

**Row/column orientation.** `y` ascends with row index, so row 0 is the southernmost row and no vertical flip is needed anywhere between raster space and the tangent plane. Every geometry consumer depends on this; it is stated here because it is the kind of convention that gets silently inverted in a refactor.

**The slick is not drawn.** It is the forward-advected release plume, binned to a density, blurred over 400 m, hard-cut at 0.14 of peak, closed, then feathered by one pixel of box mean. Consequences: the shape is whatever the physics produced, its principal axis carries the advective stretching a real slick would carry, and the hindcast that walks it back is recovering a truth it was never shown.

**Ship targets.** Disc of radius `length/(2·pixel)` boosted by `16 + 6·log₁₀(length/100)` dB.

*Defect found during the build:* the radius was initially `length/pixel`, doubling every target's extent. Two vessels 600 m apart merged into one 500 m blob, the merged target matched the wrong MMSI, and the culprit's unmatched return vanished — the dark channel reported 7 of 7 matched and the corroboration path never fired. The fix was one line; the lesson is that **target extent is a physical quantity and must be derived from length, not from a convenient constant.**

**Speckle, last.** `lin *= rng.gamma(L, 1/L)`, then a noise floor of −24.5 dB is added in the linear domain, then back to dB. Order matters: speckle multiplies the scene, the noise floor adds to it. Applying either in the wrong domain changes the slick's apparent contrast by several dB.

### 8.4 `ais.py`

**Responsibility.** Synthetic traffic with the properties the scoring model depends on.

```python
KN = 0.514444
SHIP_CLASSES: dict[str, {length, beam, draught, sog: (lo,hi), prior: float}]

@dataclass
class Vessel:  mmsi, name, ship_type, length_m, beam_m, draught_m,
               cadence_s, v_max_ms, source="synthetic"
@dataclass
class Track:   vessel, t_h, lon, lat, sog_kn, cog_deg, gaps: list[(a,b)]
    def interp(self, t) -> (lon, lat)     # NaN inside a gap

def make_vessel(rng, ship_type, used_names)  -> Vessel
def straight_track(vessel, rng, through_lon, through_lat, at_h, cog_deg,
                   sog_kn, t0_h, t1_h, jitter_deg=0.0, gaps=()) -> Track
def to_positions(track, drop_gaps=True)      -> dict[str, ndarray]
```

**Cadence.** Drawn from `{3, 6, 10, 30, 60}` s. Class A under way reports every 2–10 s; the 30 and 60 s hulls are there on purpose, because they are what breaks a fixed-threshold gap detector and prove the per-vessel baseline is doing work.

**Track construction.** Course wanders as `cog + jitter·sin(2π(t−t₀)/9)`, position integrated by cumulative trapezoid and then translated so the vessel is exactly at the specified point at the specified time. Realism cost: none that matters. Benefit: `cog_through_region` is a *mean over the fixes inside the region*, so it exercises the same averaging the real extractor will.

**Gaps are a property of the track, not of the data.** `Track.gaps` declares the dark intervals; `to_positions` drops the fixes inside them. Downstream, `traffic.find_gaps` must *rediscover* them from the position table alone. Nothing passes the declared gaps to the detector, which is what makes gap detection testable rather than assumed.

**Volume.** 11 vessels × 52 h at 3–60 s = **314 808 positions** in the nominal run, held as numpy arrays. Emitted tracks are decimated to ≤ 260 points (TR-P5).

### 8.5 `incident.py`

**Responsibility.** The truth side. The only module that knows what actually happened.

```python
@dataclass
class Scenario:                 # 24 fields; the levers a scenario can pull
    name, label, seed, detection_utc,
    release_lon, release_lat, release_age_h, release_duration_h,
    culprit_cog, culprit_sog_kn, culprit_gap,
    archive_start_h, archive_end_h, horizon_h,
    pixel_m, half_width_m,
    with_oil, with_lookalikes, with_archive_scene, archive_scene_h,
    sigma_current, sigma_alpha, decoy_gap, k_h, notes

SCENARIOS: dict[str, Scenario]  # kutch, lookalike, clean, wide,
                                # no-radar, ambiguous, short-archive
def build(sc: Scenario) -> dict   # observables + truth
```

**`build` returns observables and truth in one dict, and the boundary between them is a convention the pipeline enforces (TR-A2):**

| Key | Kind | Consumed by |
|---|---|---|
| `current`, `wind` | observable | stage 04 |
| `tracks` | observable | stages 05, 06 |
| `detection_scene`, `archive_scene` | observable | stages 02, 06 |
| `plane`, `params` | observable | all |
| `truth` | **not an input** | written to `run.json` for scoring only |

**Truth generation order.** Release track → line-source particle seed over `release_duration_h` → forward advect `release_age_h` with the *true* forcing and no ensemble → slick particles → scene. The fleet is then laid out around the release point with courses chosen to be cleared on different grounds, so `05_traffic.json.dropped_vessels` has a genuinely varied set of reasons.

**Scenario design as adversarial testing.** Each non-nominal scenario is a minimal edit that must fire exactly one gate:

| Scenario | Edit | Fires |
|---|---|---|
| `lookalike` | `with_oil=False` | 1 |
| `clean` | `with_oil=False, with_lookalikes=False` | 1 (no candidates at all) |
| `wide` | `σ_c 0.15→1.10`, `σ_α 0.25→1.20` | 2 (r₉₅ 40.7 km > 36) |
| `no-radar` | `with_archive_scene=False` | 3 |
| `ambiguous` | `decoy_gap=True` — second tanker, COG 44°, dark over the same window | 4 (margin 0.040) |
| `short-archive` | `archive_start_h −48→−12` | 5 |

**TR-B7:** every gate shall have at least one scenario that fires it, and `tests.py` shall assert all five. A gate with no scenario is an untested claim.

---

## 9. Layer 2 — stages

### 9.1 `detect.py` — stage 02

**Responsibility.** Turn a σ⁰ raster into a small table of dark candidates, each with a verdict, a confidence, and the named drivers of that confidence.

```python
FEATURE_REF = {                     # (mean, sd) used to z-score each feature
    "edge_gradient_db_per_px": (1.20, 1.20),
    "contrast_db":             (6.00, 3.00),
    "wind_ms":                 (5.50, 2.00),
    "shape_complexity":        (2.60, 1.40),
    "homogeneity":             (0.35, 0.20),
    "elongation":              (2.00, 1.10),
}
BETA = {"intercept": -2.60, "edge_gradient_db_per_px": 1.60, "contrast_db": 0.95,
        "wind_ms": 1.00, "shape_complexity": -0.55, "homogeneity": -0.35,
        "elongation": 0.60}
MIN_AREA_KM2, WIND_FLOOR_MS, CONFIDENCE_GATE = 0.3, 3.0, 0.50

@dataclass
class Candidate: cid, mask, area_km2, features, confidence, drivers,
                 verdict, rejection_basis, delta_db, centroid_px

def candidates(scene, threshold_k=1.25, window_km=6.0, min_area_km2=...) -> (list, ndarray, int)
def features(scene, cand, filtered)  -> dict
def discriminate(cand)               -> Candidate
def detect(scene, **kw)              -> (all_candidates, retained, raw_component_count)
```

**Pipeline inside the stage.**

```
σ⁰_dB ──refined_lee(r=2)──▶ filtered
                             │
        ┌────────────────────┴─────────────────────┐
        │ local threshold: filtered < μ_6km − 1.25σ │
        │ absolute floor:  filtered < median − 2.5  │
        └────────────────────┬─────────────────────┘
                       close(1) ──▶ label(8) ──▶ drop < 0.3 km² ──▶ sort by area
                                                                       │
                              per candidate: 6 features ──▶ logistic ──▶ verdict
```

**Why the threshold is local.** σ⁰ falls off across a swath with incidence angle; a global threshold either misses one edge of the scene or floods the other. `window_km = 6` is chosen to be several times the slick's width (2.8 km measured) and several times smaller than the swath — a window comparable to the target would adapt *to* the target and erase it.

**Why there is also an absolute floor.** The local test alone marks the darker half of any homogeneous patch. `median − 2.5 dB` says "and it must actually be dark", which drops thousands of marginal components. Measured effect on the nominal scene: 1 299 raw connected components, 7 surviving the area filter.

**The six features, and what each is for.**

| Feature | Computed from | Oil (measured) | Look-alike (measured) | β |
|---|---|---|---|---|
| `edge_gradient_db_per_px` | mean \|∇σ⁰\| over a 1-px dilated/eroded boundary band | 3.36 | 0.27–0.54 | **+1.60** |
| `contrast_db` | mean(2-px outer ring) − mean(interior) | 7.14 | 0.50–1.60 | +0.95 |
| `wind_ms` | wind field at the centroid pixel | 5.0 | 2.5–5.7 | +1.00 |
| `shape_complexity` | `P²/(4πA)` | 2.32 | 1.66–12.03 | −0.55 |
| `homogeneity` | `std/mean` of interior, **linear domain** | not emitted | not emitted | −0.35 |
| `elongation` | `√(λ₁/λ₂)` of the mask covariance | 2.81 | 1.24–3.55 | +0.60 |

`z = β₀ + Σ βⱼ·(fⱼ − μⱼ)/σⱼ`, `confidence = σ(z)`. Drivers are the terms `βⱼ·zⱼ`, sorted by |magnitude| and emitted with the confidence — **DT-5 is a schema obligation, not a nicety** (§5.3).

**Two honesty notes that belong on the slide.**

1. *The coefficients are hand-set from the physics, not fitted.* In the full build they are fitted on the Zenodo holdout (DT-3). `02_detection.json.method` says which is in force, and the string is rendered on dossier page 2. An earlier tuning pass produced `confidence = 1.000` on the slick; the constants were re-derived to put the oil at **0.689** and every look-alike below 0.05, because a saturated confidence is not a confidence.
2. *`homogeneity` is the weakest feature here and is weighted accordingly.* Real slicks are uniformly dark; the synthetic slick's damping follows particle density, so its interior varies more than a look-alike's. The coefficient is −0.35 rather than the −0.85 an earlier draft used, because the synthetic scene cannot support the stronger claim. This is a case where the generator's limitation was allowed to constrain the model rather than be hidden by it.

**Hard vetoes before the score.** `wind_ms < 3.0` → `wind_below_threshold`; `contrast_db < 3.0` → `contrast_insufficient`. These precede the logistic because "dark because the wind dropped" is a different statement from "dark and it scored low", and the rejection basis is what an analyst reads.

**Rejection basis when the score is what failed.** The most negative driver maps to a named basis (`edge_too_soft`, `interior_too_variable`, `shape_complexity_high`, `no_principal_axis`), falling back to `score_below_gate`. Every candidate carries one — DT-7 requires the whole table, not just the survivor.

**Complexity.** `O(HW)` for filtering and thresholding, `O(HW)` for labelling with a Python inner loop, then `O(|mask|)` per candidate. Measured: **1.02 s** for 640×640.

### 9.2 `characterise.py` — stage 03

```python
MIN_ELONGATION_FOR_AXIS = 1.6

@dataclass
class SlickGeometry:
    area_km2, perimeter_km, centroid, principal_axis_deg, elongation,
    axis_usable, length_km, width_km,
    age_hours, age_hours_lo, age_hours_hi, age_method, age_notes,
    polygon, confidence

def characterise(scene, cand, k_h=5.0, k_h_sweep=(0.5, 2.0)) -> SlickGeometry
```

**Principal axis.** Covariance of member-pixel positions **in metres** (not pixel indices — they differ if pixels are ever non-square), `eigh`, take the eigenvector of the larger eigenvalue:

```
axis_deg = degrees(atan2(v₁.east, v₁.north)) mod 180
elongation = √(λ₁/λ₂)
length_m = 4√λ₁,  width_m = 4√λ₂          # ±2σ, ~95 % of the mass
```

`mod 180` because a slick axis is undirected (TR-C4, HD-1). `axis_usable = elongation ≥ 1.6` is emitted as a field so consumers cannot forget it (§5.4, HD-2).

**Measured on the nominal run:** area 18.37 km², axis 23.1°, elongation 2.81, length 8.19 km, width 2.91 km. The culprit's course was 41°, and the 18° difference is **advective stretching**: 10 hours of drift toward ~070° rotated the observed axis away from the release bearing. That is a real effect, not an artefact, and it is why `justifications["heading"]` says *"the observed axis includes advective stretching since release"* and why `shear_per_hour` is emitted alongside.

**Age.**

```
age = w² / (32·K_h)                       w = 4σ_y, σ_y = √(2·K_h·t)
```

Reported as a bracket over `k_h_sweep`, which the pipeline sets to `(0.6, 1.7)`: measured 14.69 h, range 8.64–24.49 h, against a truth of 10.0 h. **The truth is inside the bracket and not near its centre**, which is the honest outcome and is exactly why the age is never reported as a point.

There is **one** age estimator, not two. PRD §10.6 carries the retraction: the hindcast tells you where the slick was at a given age, not the age, and running the same diffusion physics closed-form and Monte-Carlo checks the numerics, not the physics.

**The origin window follows:** `t_detection − [age_hi, age_lo]`, ~16 h wide. Wide is correct. Narrowing it would be the single easiest place in this product to lie, and it would improve the demo.

### 9.3 `traffic.py` — stage 05

```python
K_GAP, MIN_GAP_S, K_MAX = 20.0, 900.0, 2000.0

@dataclass
class Gap: start_h, end_h, duration_s, baseline_cadence_s, anomaly,
           envelope, overlap, last_fix, next_fix, v_max_ms
@dataclass
class VesselRecord: vessel, positions, baseline_cadence_s, gaps, in_region,
                    closest_approach_km, crossing_h, cog_through_region,
                    drop_reason, implausible_fixes, channel

def baseline_cadence_s(t_h)                             -> float
def kinematic_flags(pos, v_max_ms, plane)               -> int
def find_gaps(pos, cadence_s, v_max_ms, plane, ...)     -> list[Gap]
def analyse(tracks, region_lonlat, window_h, plane, positions_fn) -> (records, dropped)
```

**Baseline cadence.** `median(diff(t))` over the whole archive — median, not mean, because one long gap must not redefine the vessel's normal.

**Gap criterion.** `Δt > max(20·c₀, 900 s)`. Both terms are load-bearing: the ratio term is what makes it per-vessel; the floor stops a 3 s reporter from flagging a routine 90 s dropout.

```
anomaly = clip( log(Δt / c₀) / log(2000), 0, 1 )
```

Log-ratio, so a 3 s hull dark for 2.3 h scores near the top while a 60 s hull needs proportionally longer for the same score. Measured: the culprit's 2.32 h against a 3 s baseline gives `anomaly ≈ 1.0`.

**Reachable set.** `geo.ellipse_from_foci(last_fix, next_fix, v_max·Δt)`, then `overlap = area(E ∩ region)/area(region)`. Measured for the culprit: **0.66**.

**Two ways into the candidate set.** A vessel qualifies if its broadcast track intersects the region within the window (`channel = "ais"`), **or** if it was dark over the window and its reachable set overlaps the region (`channel = "ais-gap"`). The second path is the one the culprit takes — it is not in the region on any broadcast fix, because it was not broadcasting. A pipeline with only the first path cannot find the vessel that switched off its transponder, which is the entire problem statement.

**Closest approach.** Full pairwise distance from every track fix to every region vertex, `min`, zeroed where the fix is inside. `O(P·V)` with both dimensions vectorised; P is decimated only at emit time, so the number reported is computed on the full track.

**Drop reasons.** `"no entry into origin region (closest approach X km)"` or `"entered the region outside the origin window"`. TR-2 requires the count *and* the basis: 4 dropped in the nominal run, each with its distance.

### 9.4 `cfar.py` — stage 06

```python
@dataclass
class RadarTarget: target_id, lon, lat, est_length_m,
                   est_length_lo_m, est_length_hi_m, peak_db,
                   matched_mmsi: str|None, match_distance_m

def ca_cfar(scene, pfa=1e-6, train_km=1.2, guard_km=0.4, min_px=2)
        -> (list[RadarTarget], dict)
def match_to_ais(targets, tracks, acq_h, plane, gate_m=800.0)
        -> (matched, unmatched)
```

**Cell-averaging CFAR.** Ring clutter estimate built as a difference of two box sums (training window minus guard window), using the same integral-image machinery as detection:

```
μ_ring = (Σ_train − Σ_guard) / (N_train − N_guard)
τ      = N·(P_fa^(−1/N) − 1)
hit    ⟺ σ⁰_linear > τ·μ_ring
```

Measured with `P_fa = 1e-6`, `train_km = 1.2`, `guard_km = 0.4` at 100 m pixels: `N = 544`, `τ = 13.99`. **`P_fa` is emitted and rendered (§5.7)** — a CFAR count without it cannot be interpreted.

The guard band exists so a large ship's own energy cannot raise its own threshold. 0.4 km at 100 m is 4 pixels each side, comfortably larger than the largest synthetic target's radius.

**Length estimation** uses the **range (column) extent only**. Azimuth extent smears in proportion to the target's radial velocity, so it overestimates length for exactly the vessels that matter. The emitted range is `[0.65×, 1.45×]` of the point estimate, and it is that range — not the point value — that the corroboration test in `pipeline._corroborate` compares against a vessel's AIS-declared length.

**Matching.** Greedy nearest-fix within an 800 m gate, each AIS fix consumable once. Greedy rather than Hungarian: the gate is small relative to typical vessel separation, and an optimal assignment would be harder to explain for no measurable gain at this density. **TR-B8:** if a future scene has targets closer together than the gate, this becomes a Hungarian assignment; the failure signature is a plausible target matching an implausibly distant MMSI, and `match_distance_m` is emitted so that is visible.

**Which scene the dark channel runs on.** Not the detection scene — the **archive scene covering the origin window** (`acquired_h = −10.2 h`). A pass at detection time says nothing about who was at the origin ten hours earlier. `pipeline.dark_channel` checks `window_h[0] ≤ acquired_h ≤ window_h[1]` and fires Gate 3 with the interval in the message when it fails.

### 9.5 `score.py` — stage 07

```python
FACTORS = ["containment", "timing", "heading", "broadcast", "class_prior"]
CORRIDOR_M = 3000.0

def load_pack(path=None)                                  -> dict
def track_coverage(region, lon, lat, plane, corridor_m, n=90) -> float
def factors_for(rec, region, window_h, geom, plane)        -> (factors, why, suppressed)
def score_one(f, suppressed, weights)                      -> float
def rank(records, region, window_h, geom, plane, pack)     -> dict
def rescore(rows, weights, pack=None)                      -> dict
def ablate(rows, weights)                                  -> dict
```

**The score.**

```
score(v) = Σ_{i ∉ suppressed} w_i·f_i(v) / Σ_{i ∉ suppressed} w_i
```

Suppressed factors leave **both** sums. Scoring a factor that could not be computed as zero would penalise a vessel for our ignorance; that is the single most important line in the module and the reason `factors` and `suppressed` are separate fields in the contract (§5.8).

**The five factors, as computed.**

| Factor | Formula | Notes |
|---|---|---|
| `containment` | `max(gap_overlap, track_coverage)` | `track_coverage` = fraction of region sample points within 3 km of the track. Normalised by the region. |
| `timing` | 1 inside the window; else `clip(1 − hours_outside/6, 0, 1)` | evaluated over the crossing *and* every gap, best wins |
| `heading` | `clip(1 − Δ/90°, 0, 1)`, `Δ = axis_delta_deg(cog, axis)` | suppressed if `not axis_usable` or no COG |
| `broadcast` | `anomaly · (0.5 + 0.5·min(2·overlap, 1))` over gaps intersecting the window | placement matters, not just duration |
| `class_prior` | `SHIP_CLASSES[type].prior · clip(length/140, 0, 1)` | a 23 m fishing hull cannot produce an 18 km² slick |

**Justifications are generated with the numbers in them**, one per factor per vessel, including suppressed ones. NFR-1 is enforced by the shape of the return value, not by review.

**`rescore` is deliberately a separate pure function** of the stored factor rows (TR-A4). It is what `POST /rescore` calls and what the weight sliders drive. Nothing upstream of stage 07 depends on the weights, so re-ranking costs one pass over ≤ 20 rows.

**`ablate`** re-ranks with each factor zeroed in turn and reports leader and margin. Measured, nominal run:

| removed | leader | margin | |
|---|---|---|---|
| — (baseline) | culprit | 0.332 | |
| containment | culprit | 0.360 | |
| timing | culprit | 0.405 | |
| heading | culprit | 0.394 | |
| **broadcast** | culprit | **0.121** | ← carries the margin |
| class_prior | culprit | 0.341 | |

**This measurement contradicted the pitch and the pitch was changed.** PRD §4 claims heading is the strongest factor in general. On this incident, broadcast is: removing it collapses the margin by 64 %, removing heading *widens* it. `pipeline._finding` was rewritten to name the measured leading contributor rather than assert the geometric one. A demo script that says "heading is what caught it" while the ablation table says otherwise is the kind of thing a technical judge finds in thirty seconds.

**Timing is nearly inert here** — the origin window is 16 h wide, so almost every candidate scores 1.0. That is honest and it is visible in the table. It also says the timing weight is doing less work than its 18 points suggest, which is a Phase 1 question, not a thing to quietly re-weight.

### 9.6 `gates.py` — the refusals

```python
CONFIDENCE_MIN, R95_MAX_KM, MARGIN_MIN = 0.50, 36.0, 0.10

def gate(gid, name, fired, detail, halts=False) -> dict
def gate1_confidence(confidence, n_candidates)  -> dict   # halts
def gate2_region(r95_km)                        -> dict   # halts
def gate3_dark_channel(available, reason="")    -> dict   # degrades
def gate4_margin(margin)                        -> dict   # degrades
def gate5_archive(archive_span_h, horizon_h)    -> dict   # halts
```

**Uniform record:** `{id, name, fired: bool, halts: bool, detail: str}`. `halts` is `halts_flag and fired`, so a non-firing halting gate reports `halts=False` and the caller needs no special case.

**`detail` is a sentence, always, fired or not** — "detection confidence 0.69 >= 0.50" is as useful as the failing case, and it is what appears in the run log, on dossier page 2, and in the front end's gate panel. A boolean with no sentence would make every one of those places invent its own wording.

**Design decision: gates are values, not exceptions** (TR-B1). An exception-based design would lose every artefact produced before the halt and would make "the system correctly refused" indistinguishable from "the system crashed". Here a halt returns through the same `_finish` path as success, emits everything computed so far, and produces a dossier whose finding is the halt reason.

**Thresholds and their status:**

| Constant | Value | Provenance |
|---|---|---|
| `CONFIDENCE_MIN` | 0.50 | logistic midpoint; a natural, defensible cut |
| `R95_MAX_KM` | 36.0 | **our own judgement** — the radius at which regional traffic density stops being constrained. PRD OQ-4 is open and the deck must say "design choice", not cite a paper we have not read. |
| `MARGIN_MIN` | 0.10 | our own judgement; ~11 % of the observed leader score |
| `K_GAP`, `MIN_GAP_S` | 20, 900 s | tuned against the synthetic cadence distribution |

---

## 10. Layer 3 — orchestration and delivery

### 10.1 `pipeline.py` — the spine

504 lines, the largest module, and the only one that knows the stage order.

```python
VERSION = "0.5.0-mvp"
LIMITATIONS: list[{title, text}]                 # rendered on dossier page 1 and in the view
FORBIDDEN = ["responsible for", "is guilty", "found guilty",
             "proves that", "conclusive proof"]

class _Enc(json.JSONEncoder)          # numpy scalars, arrays, dataclasses
def _clean(o)                         # NaN/Inf -> None, recursive (TR-N5)
class RunLog:  __call__(stage, event, **kw); dump(path)
def _utc(base_iso, hours) -> str      # the one t_h -> ISO conversion point (TR-T1)

def run(scenario_name="kutch", seed=None, out_root="runs",
        weight_pack=None, n_particles=2600, quiet=False) -> (run_doc, out_path)
```

**Shape of `run`.** Seven blocks, each: compute → build artefact dict → evaluate gate → `emit()` → `log()` → conditional early return through `_finish`. Every early return path goes through the same `_finish`, so a halted run produces `run.json`, `manifest.json`, `dossier.html` and `log.jsonl` exactly like a completed one.

**Manifest and `run_id` are minted before any compute**, so a crash still leaves an identifiable directory.

**`_corroborate` implements DK-4** and is the only place the two channels meet. For each unmatched radar target inside the origin region, it looks for an already-ranked vessel whose declared length falls inside the target's estimated length *range* and whose reachable-set envelope contains the target. On a match it attaches a `corroboration` object to that vessel's row. It **cannot** create a row: the loop iterates `result["ranked"]`, which is closed by then. The invariant is structural, not a convention.

**`_finding`** composes the finding sentence: identity, score, margin, the **measured** leading factor with its share of the weighted total, the geometric factor if it was not the leader, the corroboration if present, and the fixed closing clause. When Gate 4 fires it names neither vessel and returns both.

**`check_language`** greps the rendered dossier for `FORBIDDEN` and raises `AssertionError` on a hit (TR-S1). It runs *before* the file is written, so a run that would assert responsibility fails instead of shipping.

**Numpy JSON encoding is not incidental.** `np.float64` is not `float` to `json`, `np.bool_` is not `bool`, and `NaN` serialises to a token no strict parser accepts. `_Enc` plus `_clean` handle all three; without them the front end fails on `JSON.parse` with an error that points nowhere near the cause.

### 10.2 `dossier.py`

Four pages of print-oriented HTML with an `@page A4` rule, no external assets, no JavaScript. WeasyPrint renders this same template to PDF in the full build, which is why it is print-first.

| Page | Contents |
|---|---|
| 1 | stamp ("ranking for investigation · not a finding"), run identity, provenance, weight pack, **limitations**, then finding, then recommended action |
| 2 | method and parameters: detection method string, geometry, drift parameters and origin window, dark channel, **every gate with its detail** |
| 3 | ranked shortlist with per-factor columns and the weights in the header; dropped vessels with their basis |
| 4 | per-vessel factor justifications; the ablation table |

**Page 1 ordering is load-bearing** and `tests.py` asserts it by string offset: `index("What this assessment cannot establish") < index("<h2>Finding</h2>")`. A reader who gets no further than page one has read the caveats, not the accusation.

**A halted run still produces pages 1–2** and stops there; `render` returns early when `attribution` is absent.

### 10.3 `server.py`

Stdlib `ThreadingHTTPServer`, bound to `127.0.0.1` (TR-S3). ~127 lines. Route table in §13.

**`_static` refuses traversal** by resolving the path and requiring the result to start with `WEB.resolve()` (TR-S2).

**`_run_dir("latest")`** picks the newest directory containing `run.json` by mtime. Convenience for the demo; every route also accepts an explicit `run_id`.

**No writes.** `POST /rescore` computes and returns; it does not persist. A weight experiment cannot corrupt a run.

### 10.4 `cli.py`

`argparse` with five subcommands: `run`, `scenarios`, `ablate`, `selftest`, `serve`. `cmd_run` prints the gate ladder first, then the result — so the refusals are what an operator sees before the answer, matching the dossier's ordering.

### 10.5 `tests.py`

The acceptance criteria of PRD §19, executable. Runs all seven scenarios, then asserts 18 checks. It is a script, not a pytest suite, for the same reason as TR-D1: it must run on venue hardware with nothing installed.

---

## 11. Control flow

### 11.1 Nominal run — sequence

```
cli.run          pipeline.run          incident        stages            disk
  │                   │                   │              │                │
  ├── run(scenario) ─▶│                   │              │                │
  │                   ├── build(sc) ─────▶│              │                │
  │                   │◀── observables + truth           │                │
  │                   ├── manifest, run_id, mkdir ───────────────────────▶│
  │                   ├── 01 intake ─── gate5 ──────────────── emit ─────▶│
  │                   ├── 02 detect ───▶ detect.detect ────── gate1 ─────▶│
  │                   ├── 03 charac ───▶ characterise ──────────────────  ▶│
  │                   ├── 04 drift  ───▶ seed → integrate(−40h)          │
  │                   │                  integrate(+40h)                 │
  │                   │                  density_region ──── gate2 ──────▶│
  │                   ├── 05 traffic ──▶ traffic.analyse ───────────────  ▶│
  │                   ├── 06 dark    ──▶ ca_cfar → match ─── gate3 ──────▶│
  │                   ├── 07 attrib  ──▶ score.rank → _corroborate
  │                   │                  → gate4 → ablate → _finding ────▶│
  │                   ├── _finish ──▶ run.json ─▶ dossier.render
  │                   │              ─▶ check_language (raises on hit)
  │                   │              ─▶ dossier.html, log.jsonl ─────────▶│
  │◀── (run_doc, out) │                   │              │                │
  └── print gate ladder, shortlist, finding
```

### 11.2 Halt — sequence (Gate 2, `wide`)

```
  ├── 04 drift ──▶ r95_union = 40.67 km
  │               gate2_region(40.67) → {fired: True, halts: True}
  │               emit 04_drift.json                      ← artefact still written
  │               halted = gate2
  │               ─────────────▶ _finish(stages = 01..04)
  │                              run.json.halted = {...}
  │                              dossier: pages 1–2 only, finding = halt detail
  └── exit 0                                              ← a halt is not an error
```

### 11.3 Rescore — sequence

```
browser                     server                  score
  │ slider input              │                       │
  ├─ local recompute ─────────┼───────────────────────┤   ← instant, no network
  ├─ debounce 260 ms          │                       │
  ├─ POST /runs/{id}/rescore ▶│                       │
  │                           ├─ read 07_attribution ─┤
  │                           ├─ rescore(rows, w) ───▶│
  │                           ├─ ablate(rows, w) ────▶│
  │◀── {ranked, leader_margin, ablation}              │
  ├─ replace RANKED, re-render, show "confirmed by POST …"
  └─ on failure: keep the local ranking, say the service did not answer
```

The local recompute is not a cache — it is the same arithmetic, so the two agree. It exists because a slider that lags 200 ms feels broken, and the API call exists because the service is the authority and the demo should show it being used.

### 11.4 Stage state machine

```
        ┌──────────┐  gate5 fired
        │ 01 INTAKE├──────────────────────────────────────────▶ HALTED
        └────┬─────┘
             ▼
        ┌──────────┐  gate1 fired (no oil, or confidence < 0.50)
        │ 02 DETECT├──────────────────────────────────────────▶ HALTED
        └────┬─────┘
             ▼
        ┌──────────┐
        │ 03 CHAR  │  (cannot halt)
        └────┬─────┘
             ▼
        ┌──────────┐  gate2 fired (r95 > 36 km)
        │ 04 DRIFT ├──────────────────────────────────────────▶ HALTED
        └────┬─────┘
             ▼
        ┌──────────┐  (cannot halt; may return zero candidates)
        │ 05 TRAFFIC│
        └────┬─────┘
             ▼
        ┌──────────┐  gate3 fired → available=false, DEGRADED, continue
        │ 06 DARK  │
        └────┬─────┘
             ▼
        ┌──────────┐  gate4 fired → names neither, DEGRADED, continue
        │ 07 ATTRIB│
        └────┬─────┘
             ▼
          COMPLETE
```

Three terminal states: `COMPLETE`, `COMPLETE (degraded)`, `HALTED`. All three emit a full artefact set and a dossier. **There is no `FAILED` state** for gate reasons; `FAILED` exists only for an unhandled exception or a `check_language` assertion, and both are bugs rather than outcomes.

---

## 12. Front-end low-level design

`web/index.html`, 1 152 lines, single file, zero build step, zero framework. Two `<script>` blocks: the original artifact's presentation layer, and a hydration layer appended below it.

### 12.1 Why one file and no framework

It must open from a filesystem on venue hardware with no network and no `npm install`. Google Fonts fail closed to system fallbacks. The MapLibre workstation of Phase 1 will need a build step; this view deliberately does not.

### 12.2 Script boundary

Both blocks are classic scripts, so top-level `let`/`const` share one global lexical environment. The presentation layer publishes exactly three seams:

```js
window.__setBase(ms)      // re-anchor the split-flap clock to the run's detection time
window.__setGlitch(str)   // the last-fix line that degrades into noise at "the cut"
renderRoster()            // rebuild the shortlist from RANKED + WEIGHTS
```

plus the shared bindings `RANKED`, `WEIGHTS`, `WPACK`, `sel`, `FK`. Everything else — WebGL, the particle-text canvas, scroll phase, the depth nav — is untouched from the original study.

**TR-F1.** The presentation layer shall contain no incident data. `tests.py` asserts the markup carries none of `12.4`, `0.87`, `419•`, `2 600`, `−11.4`, `−23.8`, `14.9`, `041°`, and that the strings `const V=[` and `Kestrel Ridge` are absent from the file.

### 12.3 Binding contract

Scalars bind by attribute; anything list-shaped is rendered by id.

**`data-b` keys (27)** — text substitution, `—` when the run did not produce the value:

`eyebrow`, `sensor`, `extent`, `axis`, `broadcasting`, `dark_count`, `sea_db`, `slick_db`, `candidates`, `retained`, `confidence`, `horizon_words`, `particles`, `integrator`, `leeway`, `r95_label`, `r95`, `window`, `gate2`, `in_window_words`, `gap_start`, `gap_end`, `targets`, `matched`, `unmatched`, `est_length`, `overlap`.

**Rendered regions (by id):**

| id | Source | Renders |
|---|---|---|
| `#prov` | `provenance` | always-visible badge: run id, ais/imagery/forcing (NFR-7) |
| `#drivers` | `detection.drivers` | top four terms with sign — the decomposition of the confidence |
| `#r95curve` | `drift.r95_series` | every 8th hour of the growing radius |
| `#cleared` | `attribution.ranked[1:]` + `traffic.dropped_vessels` | one line per vessel with the basis |
| `#glitchline` | leader's track ∩ gap start | masked MMSI, position, COG |
| `#darkline` | `dark` | the sentence, including the unavailable case |
| `#roster` / `#facs` | `attribution.ranked` | shortlist and per-factor justification panel |
| `#wpack` | `attribution.weights` | five sliders, `#margin`, `#margingate`, `#apistate` |
| `#lims` | `limitations` | numbered cards, title + text |
| `#gatelist` | `gates` | five rows, fired/held, with `detail` |
| `#manifest` | manifest fields | hash, forcing names, weight pack, version |
| `#runlog` | `GET /runs/{id}/log` | formatted `log.jsonl` |

### 12.4 Hydration order and failure behaviour

```
fetch run.json ──┬── ok ──▶ provenance badge
                 │         ├─ halt banner + hide sections 5,6,7 if doc.halted
                 │         ├─ scalars, then rendered regions
                 │         ├─ RANKED/WEIGHTS/WPACK ─▶ renderRoster()
                 │         └─ fetch runs/{id}/log ── ok ──▶ #runlog
                 │                                └─ fail ─▶ "open through cli serve"
                 └── fail ─▶ #prov: "no run loaded — run then serve", stop
```

Every branch degrades to text. No `throw` escapes the IIFE, so a missing optional block (a halted run has no `attribution`) leaves its section em-dashed rather than blanking the page.

**Masking.** MMSIs render as `999•••773`. The synthetic identity is already collision-proof (TR-I2); masking is a habit worth having before the build ever touches real AIS.

### 12.5 Weight slider event flow

`input` → update `WEIGHTS[k]` → update the `<output>` → `renderRoster()` (synchronous, ≤ 20 rows) → debounce 260 ms → `POST /rescore` → replace `RANKED` with the server's rows → re-render → set `#apistate`. Gate 4's threshold is applied client-side too: `#margin` turns magenta and `#margingate` reads *"below 0.10 — gate 4 fires, neither vessel is named"* the moment the margin crosses it.

### 12.6 Verification without a browser

There is no headless browser in this environment, so the hydration layer is verified two ways: `node --check` on both extracted script blocks, and a DOM/`fetch` shim (~50 lines) that runs the hydration IIFE against a real `run.json` and prints every captured binding. Both were run; all 27 keys and all 12 regions populated. **TR-F2:** any change to the hydration layer shall be re-verified the same way before it is presented.

---

## 13. API low-level design

Stdlib now, FastAPI in Phase 1, same routes and same shapes.

| Method | Path | Request | 200 response | Errors |
|---|---|---|---|---|
| GET | `/` | — | `web/index.html` | 404 if missing |
| GET | `/run.json` | — | latest `run.json` | 404 `{"error":"no runs"}` |
| GET | `/runs` | — | `[run_id, …]` sorted | — |
| GET | `/runs/{id}` | — | that run's `run.json` | 404 unknown run |
| GET | `/runs/{id}/run.json` | — | same | 404 |
| GET | `/runs/{id}/artifacts/{stage}` | `stage` ∈ intake, detection, geometry, drift, traffic, dark, attribution | that stage artefact | 404 unknown artefact |
| GET | `/runs/{id}/dossier.html` | — | `text/html` | 404 |
| GET | `/runs/{id}/log` | — | `text/plain` JSONL | 404 |
| POST | `/runs/{id}/rescore` | `{"weights": {factor: number}}` | `{ranked, leader_margin, weights, weight_pack, weight_pack_version, ablation}` | 404 unknown run · **409** run halted before attribution |
| — | *transmit* | — | — | **does not exist (NFR-4, TR-A5)** |

**Conventions.** `Cache-Control: no-store` on everything — a stale `run.json` after a re-run is the most confusing possible demo failure. `Content-Length` always set. Access logging suppressed (`log_message` overridden) so the CLI output stays readable during a demo.

**`{id}` accepts the literal `latest`** on every run-scoped route.

**409 rather than 404 for a halted run** distinguishes "no such run" from "that run legitimately has nothing to re-rank", which is a state the client should render, not treat as an error.

**Idempotency.** Every GET is pure. The single POST is pure and non-persisting. There is no route that mutates a run; re-running the pipeline creates a new `run_id`.

---

## 14. Performance: budgets and measurements

### 14.1 Measured — nominal scenario, 640×640 scene, 314 808 AIS positions, 2 600 particles

Hardware: Intel Core i5-1240P, 16 threads, Python 3.14.7, numpy 2.4.4. Three consecutive isolated runs.

| Stage | Δt | Share | Dominant cost |
|---|---|---|---|
| 01 intake (incl. world generation) | 1.53 s | 25 % | truth advection + two scene rasters |
| 02 detection | 1.02 s | 17 % | `raster.label` Python inner loop |
| 03 characterisation | 0.01 s | 0 % | one eigendecomposition |
| **04 drift** | **2.46 s** | **41 %** | 2.0 M forcing interpolations per direction |
| 05 traffic | 0.41 s | 7 % | pairwise track↔region distances |
| 06 dark channel | 0.34 s | 6 % | 4 integral images + labelling |
| 07 attribution | 0.29 s | 5 % | `track_coverage`: 8 100 grid points × 7 vessels |
| **total, internal** | **6.07 s** | | wall over three runs: 6.10, 6.41, 6.77 s |

Peak RSS 176 MB. `run.json` 211 KB, of which 153 KB is stage 05 (decimated tracks). Dossier 17 KB.

### 14.2 Complexity summary

| Operation | Complexity | At MVP scale |
|---|---|---|
| `box_mean` | `O(HW)` regardless of radius | 410 k px |
| `label` | `O(HW)`, Python loop | 1 299 components |
| `trace_boundary` | `O(perimeter)`, bounded by `8·\|mask\|+64` | |
| `points_in_polygon` | `O(N·M)`, N vectorised | 25 600 × 96 |
| `integrate` | `O(steps · N · 4 · 2)` | 240 × 2 600 × 8 |
| `density_region` | `O(N + cells·log cells)` | 2 600 particles |
| `traffic.analyse` | `O(V · P · R)` | 11 × 28 k × 13 |
| `score.rank` | `O(V · n²)` for coverage | 7 × 8 100 |
| `rescore` | `O(V · 5)` | trivial |

### 14.3 Where it goes if pressed

1. `raster.label` → `scipy.ndimage.label` (same signature): −0.25 s.
2. Precompute the forcing on the particle bounding box per hour and index rather than `searchsorted` per stage: the drift stage is 4 interpolations per step and 3 of them land in the same cell.
3. `snapshot_every_h` is already 1.0; snapshots are not the cost, the 240 integration steps are.

None of this is worth doing at 6 s against a 600 s budget. It is written down so that when the real forcing arrives and stage 04 becomes I/O-bound, the shape of the problem is already known.

### 14.4 Full-build projection

| Change | Effect |
|---|---|
| Real Sentinel-1 IW at 10 m, AOI-subset to 64 km | ~41 M px vs 410 k → detection ~40 s with `scipy`, dominated by the U-Net forward pass on CPU |
| Real CMEMS + ERA5 subsets | one-time load 10–60 s, then in-memory; **must be subset before load** (TR-P7) |
| Real AIS archive, 1.2 M positions | traffic stage ~4× → under 1 s |
| OpenDrift instead of hand-rolled advection | comparable or slower; the fallback stays |
| **Projected total** | **60–150 s**, inside the 600 s NFR-8 budget with room |

---

## 15. Error taxonomy, logging, observability

### 15.1 Four classes, three of which are not errors

| Class | Example | Handling | Exit |
|---|---|---|---|
| **Refusal** | Gate 1–5 fires | record, emit everything so far, dossier states it | 0 |
| **Degradation** | no archive scene; U-Net absent | `available: false` + `reason`, or a `method` string naming the fallback; continue | 0 |
| **Degenerate input** | `a ≤ c` ellipse; empty polygon; single candidate | return a neutral value (0, empty ring), let the stage decide | 0 |
| **Defect** | unhandled exception; `check_language` hit | propagate, no dossier written | ≠ 0 |

**TR-E1.** A refusal shall never be raised as an exception, and a defect shall never be swallowed as a refusal. The line between them is: could a valid input produce this? Gate 2 firing, yes. A forbidden phrase in generated text, no.

### 15.2 Log schema

`log.jsonl`, one object per line, appended in memory and flushed once in `_finish`:

```jsonc
{"t": 2.40, "stage": "04_drift", "event": "complete",
 "r95_union_km": 14.11, "origin_window": ["...Z", "...Z"]}
```

`t` is seconds since `RunLog.__init__`, so stage durations are differences and need no separate timer. Free-form extra keys per stage; the three fixed keys are `t`, `stage`, `event`.

**TR-E2.** Every stage shall log exactly one `complete` record carrying the two or three numbers a reader would want to sanity-check that stage. The log is a demo artefact, not a debug channel — it is rendered in the front end (`#runlog`) and summarised on dossier page 2.

**TR-E3.** Gate decisions appear twice on purpose: inside the stage artefact (`.gate`) and collected in `run.json.gates`. The first is for replay, the second is for display.

### 15.3 What is deliberately not logged

No per-particle state, no per-pixel diagnostics, no progress bars. A 900-byte log for a full run is a feature: it can be read aloud in a demo.

---

## 16. Safety controls, in code

PRD §16 states the policy; this is where each control physically lives.

| Control | Requirement | Implementation | Test |
|---|---|---|---|
| No responsibility language | NFR-2, RP-3, TR-S1 | `pipeline.check_language` raises before write | AC-10 scans every `*.html` and `*.json` in every scenario's run directory |
| Provenance always declared | NFR-7 | `manifest.provenance` → dossier page 1 → `#prov` fixed badge | AC-2 |
| Limitations before finding | RP-1 | page-1 template order | AC-2, by string offset |
| No bare numbers | NFR-1 | `drivers` mandatory with `confidence`; `justifications` mandatory per factor | AC-3 |
| Absence is not evidence | NFR-3 | vessels with no gap score `broadcast = 0`, never negative; suppressed factors leave the denominator | explicit check in `tests.py` |
| No point origin | NFR-6 | no such field exists; `r95_series` emitted per hour | asserts `"origin_point" not in json` |
| Unmatched radar ≠ suspect | DK-4 | `_corroborate` iterates a closed `ranked` list and can only attach | structural |
| Synthetic identities | NFR-9 | MMSI prefix 999 | TR-I2 |
| No transmit path | NFR-4 | no such route | route table |
| Localhost only, no traversal | TR-S2, TR-S3 | bind `127.0.0.1`; resolved-path prefix check | |
| Determinism | NFR-5 | seeded generators, no global RNG | AC-8 |

**TR-S7.** Any new generated-text surface — a new dossier page, a new UI string, a slide generator — shall be routed through `check_language` before it is shown to anyone. The list is short and blunt on purpose; extending it is cheap.

---

## 17. Test design

### 17.1 Levels

| Level | What it covers | Where |
|---|---|---|
| Primitive verification | tangent-plane round trip, shoelace area, ellipse area vs `πab`, rectangle perimeter = 52 px, ellipse perimeter vs Ramanujan, `axis_delta_deg` folding | run during construction; **to be promoted into `tests.py`** — see gap below |
| Closed loop | hindcast recovers a truth it was never shown | `tests.py`: top-1 correct, true release time inside the origin window |
| Gate coverage | each gate fires on its scenario | `tests.py` AC-5 across six scenarios |
| Contract | schema invariants: five factors, five justifications, weight-pack version, no `origin_point`, r₉₅ per hour | `tests.py` |
| Safety | forbidden language across every artefact of every scenario | `tests.py` AC-10 |
| Determinism | two runs, identical scores | `tests.py` AC-8 |
| API purity | rescore changes the ranking without re-running stages | `tests.py` AC-4 |
| Front-end contract | fetches `run.json`; no hardcoded incident numbers; no vessel data | `tests.py` AC-11 |
| Front-end runtime | hydration against a real `run.json` | `node --check` + DOM shim (§12.6) |

**Result: 18/18 checks pass** across all seven scenarios, total runtime ~25 s.

### 17.2 Known gaps, stated rather than hidden

- **The layer-0 primitive checks are not yet in `tests.py`.** They were run during construction (and caught the `trace_boundary` back-track defect and the ellipse degeneracy), but they live in shell history, not in the suite. That is the highest-value next test work: the geometry is where a silent numerical defect would hide.
- **No property-based tests.** `points_in_polygon` against a random polygon and a Monte-Carlo area estimate, and `ellipse_from_foci` against the focal-sum definition, are both natural properties and neither is asserted.
- **AC-7 (drifter validation) and AC-9 (10-minute budget on real data) cannot pass in this build** — both need real data. PRD §22 marks them ⬜ and they must not be claimed.
- **`kinematic_flags` (TR-8) is implemented and exercised but no scenario injects an impossible-speed fix**, so its detection path is unproven. A `spoofed` scenario is one `Scenario` field away.

### 17.3 Test data policy

**TR-X1.** Every test fixture is generated from a `Scenario` and a seed. No binary fixtures, no recorded golden files, no network. A test that cannot be regenerated from a seed is not admitted.

---

## 18. Full-build deltas

The boundaries chosen so Phase 1 replaces implementations without touching call sites.

| # | Change | Module boundary | What must not change |
|---|---|---|---|
| 1 | Sentinel-1 GRD reader | new `readers/sentinel1.py` → returns a `Scene` | the `Scene` dataclass and `px_of`/`lonlat_of_px` |
| 2 | U-Net segmentation | new `detect_ml.py`, called between `candidates()` and `features()` | `Candidate.mask` semantics; the six features are computed on the refined mask |
| 3 | CMEMS + ERA5 | `forcing.from_netcdf(...) -> ForcingField` | `ForcingField.sample` signature — `drift` never learns where the numbers came from |
| 4 | OpenDrift | `drift.integrate_opendrift(...)` returning `list[CloudSnapshot]` | `CloudSnapshot`; `r95_km` and `density_region` operate on the snapshots either way |
| 5 | Real AIS (NMEA/CSV) | `ais.from_nmea(...) -> list[Track]` | `Track`, `to_positions` output dict |
| 6 | FastAPI | swap `server.py`, same routes | §13 route table and response shapes |
| 7 | React + MapLibre workstation | new app consuming `run.json` | §5.9 contract — the narrative view stays a second consumer |
| 8 | WeasyPrint PDF | `dossier.render()` output piped to WeasyPrint | the template; it is already print-first |
| 9 | `scipy.ndimage` | `raster.label`, morphology | signatures |

**TR-G1.** Each of these shall land behind a runtime capability check that falls back to the current implementation and logs the fallback, so a venue machine missing a wheel degrades rather than fails.

**TR-G2.** The `run.json` contract (§5.9) is frozen for the duration of Phase 1. Additive fields are permitted; renames and removals are not, because two independent views and the dossier all read it.

---

## 19. Traceability matrix

PRD requirement → module → function → test.

| PRD | Module | Function | Verified by |
|---|---|---|---|
| IN-3 | `ais` | `to_positions` | AC-1 |
| IN-4, Gate 5 | `gates`, `pipeline` | `gate5_archive` | AC-5 (`short-archive`) |
| IN-5, NFR-7 | `pipeline`, `dossier`, front end | `manifest.provenance`, `#prov` | AC-2 |
| DT-1 | `raster` | `refined_lee` | visual + feature separation |
| DT-2 | `detect` | `candidates` | AC-1 |
| DT-4 | `detect` | `features`, `discriminate` | AC-6 (`clean`, `lookalike`) |
| DT-5, NFR-1 | `detect` | `discriminate` → `drivers` | AC-3, §5.3 contract |
| DT-7 | `detect` | `detect` → full table | `02_detection.json` |
| CH-1…CH-3 | `characterise` | `characterise` | AC-1 |
| CH-4, CH-5 | `characterise` | `age_h` + sweep | closed-loop age-bracket check |
| DR-2, DR-3 | `drift` | `step_rk4` | closed loop |
| DR-4, DR-6 | `drift`, `pipeline` | `r95_km`, `r95_series` | NFR-6 check |
| DR-8 | `drift` | `make_ensemble` | r₉₅ growth table §8.2 |
| Gate 2 | `gates` | `gate2_region` | AC-5 (`wide`) |
| TR-1, TR-2 | `traffic` | `analyse` | `05_traffic.json.dropped_vessels` |
| TR-3 | `traffic` | `baseline_cadence_s`, `find_gaps` | NFR-3 check |
| TR-4 | `geo`, `traffic` | `ellipse_from_foci`, `find_gaps` | closed loop (culprit enters via `ais-gap`) |
| TR-8 | `traffic` | `kinematic_flags` | **gap — no scenario injects it** |
| HD-1 | `geo` | `axis_delta_deg` | primitive check |
| HD-2 | `characterise`, `score` | `axis_usable`, suppression | AC-3 |
| HD-3 | `drift` | `shear_per_hour` | emitted in `04_drift.json` |
| DK-1, DK-3 | `cfar` | `ca_cfar` | `06_dark.json` |
| DK-2 | `cfar` | `match_to_ais` | matched/unmatched counts |
| DK-4 | `pipeline` | `_corroborate` | structural — cannot create a row |
| DK-5, Gate 3 | `gates` | `gate3_dark_channel` | AC-5 (`no-radar`) |
| SC-1, SC-4 | `score` | `load_pack`, `score_one` | AC-3 |
| SC-2 | `score` | `factors_for` → `justifications` | AC-3 |
| SC-3, Gate 4 | `score`, `gates` | `rescore`, `gate4_margin` | AC-5 (`ambiguous`) |
| SC-5 | `score` | `ablate` | `cli ablate`, dossier page 4 |
| RP-1 | `dossier` | `render` page 1 | AC-2 by string offset |
| RP-3, NFR-2 | `pipeline` | `check_language` | AC-10 |
| UI-3 | front end, `server` | sliders → `POST /rescore` | AC-4 |
| UI-4 | front end | `#gatelist`, `#runlog` | manual + shim |
| UI-5 | front end | hydration layer | AC-11 |
| NFR-5 | `pipeline` | manifest + seeds | AC-8 |
| NFR-6 | `drift`, `pipeline` | no origin point | explicit check |

---

## 20. Appendix: constants, and the arithmetic behind them

Every tunable in one place, with its provenance. **"House"** means we chose it and no paper backs it; those are the ones the deck must not dress up as literature.

| Constant | Value | Where | Provenance |
|---|---|---|---|
| `R_EARTH` | 6 371 008.8 m | `geo` | IUGG mean radius |
| `KN` | 0.514444 | `ais` | exact by definition |
| `M2_PERIOD_H` | 12.4206 | `forcing` | principal lunar semidiurnal tide |
| `alpha` (leeway) | 0.03 | `drift` | standard operational practice for oil |
| `k_h` | 5.0 m²/s | `drift` | mid-range for coastal surface water; swept in validation |
| `dt_s` | 600 | `drift` | house — 6 steps/hour, stable for the velocity scales here |
| `n_particles` | 2 600 | `drift` | house — r₉₅ stable to <2 % above ~2 000 |
| `sigma_current` | 0.15 | `drift` | house — forcing-error proxy; the honest value needs drifter validation (AC-7) |
| `sigma_alpha` | 0.25 | `drift` | house — leeway is the least constrained parameter |
| `cell_m` (region) | 700 | `pipeline` | house — ~1/20 of typical r₉₅ |
| `quantile` | 0.95 | `drift` | matches the r₉₅ definition |
| σ⁰ sea model | `−22 + 12·log₁₀(U₁₀)` | `scene` | house, Bragg-like; **not** CMOD |
| slick damping | 12 dB | `scene` | typical observed range 8–14 dB |
| `looks` | 4.0 | `scene` | Sentinel-1 GRD IW is ~4.4 equivalent looks |
| noise floor | −24.5 dB | `scene` | order-of-magnitude for S-1 IW NESZ |
| `threshold_k` | 1.25 | `detect` | house, tuned to yield 5–15 candidates |
| `window_km` | 6.0 | `detect` | house — several × slick width, ≪ swath |
| absolute floor | median − 2.5 dB | `detect` | house |
| `MIN_AREA_KM2` | 0.3 | `detect` | house — below this, speckle residue |
| `WIND_FLOOR_MS` | 3.0 | `detect` | below this there are no Bragg waves to damp |
| `FEATURE_REF`, `BETA` | §9.1 | `detect` | **house, hand-set**; fitted on Zenodo in Phase 1 |
| `CONFIDENCE_GATE` | 0.50 | `detect`/`gates` | logistic midpoint |
| `MIN_ELONGATION_FOR_AXIS` | 1.6 | `characterise` | house — below it, PCA axis is noise |
| `k_h_sweep` | (0.6, 1.7) | `pipeline` | house — "K_h known to ~×1.5" |
| `K_GAP` | 20 | `traffic` | house — 20 missed reports is unambiguous |
| `MIN_GAP_S` | 900 | `traffic` | house — protects 30–60 s reporters |
| `K_MAX` | 2000 | `traffic` | house — normalises the log-ratio |
| `v_max` rule | `max(class design, observed) ` | `incident` | **answers PRD OQ-6** |
| `CORRIDOR_M` | 3000 | `score` | house — AIS position error ≪ this; slick width ≈ this |
| weights | 22/18/26/24/10 | `weights.v4.json` | house — and exposed in the UI precisely because they are |
| `P_fa` | 1e-6 | `cfar` | house; standard order for ship CFAR |
| `train_km`, `guard_km` | 1.2, 0.4 | `cfar` | house — guard ≫ largest target radius |
| match `gate_m` | 800 | `cfar` | house — ≫ AIS error, ≪ vessel separation here |
| length range | ×[0.65, 1.45] | `cfar` | house — azimuth-smearing allowance |
| `R95_MAX_KM` | 36 | `gates` | **house — PRD OQ-4 open.** Say "design choice" on the slide. |
| `MARGIN_MIN` | 0.10 | `gates` | house |
| forbidden phrases | 5 strings | `pipeline` | ours, deliberately blunt |

### Numerical identities worth keeping in view

```
r₉₅ from diffusion alone      ≈ 2.45·√(2·K_h·t)        → 1.7 km at 40 h, K_h = 5
r₉₅ from forcing error        ≈ 1.96·σ_c·|u|·t          → 21 km at 40 h, σ_c = 0.15, |u| = 0.5 m/s
                                 measured, both together   → 18.6 km at 40 h
                                                          the second term dominates; hence DR-8
age from width                 = w²/(32·K_h)             → 14.7 h at w = 2.91 km, K_h = 5
reachable-set semi-major       = v_max·Δt/2              → 27 km for 14 kn over 2.3 h
CFAR multiplier                = N·(P_fa^(−1/N) − 1)     → 13.99 at N = 544, P_fa = 1e-6
```

---

*Dark Transit — Technical Requirements & Low-Level Design, revision A. Upstream: `PRD.md` rev B. Implemented by `mvp/`. Every measured number here is from a recorded run; every constant marked "house" is ours and must be presented as ours.*
