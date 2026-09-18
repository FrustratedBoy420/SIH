# Dark Transit — model and orchestration plan

**PS26143 · NTRO · written 18 September 2026 · status: proposal**

This document plans the two things the MVP does not yet have: models measured on real Sentinel-1 data, and an orchestration layer that can carry real data, real forcing and repeated experiments without giving up the determinism the MVP is built on. It is written against the state of `mvp/` at commit `ad973ad`, and it assumes **free or near-free compute, Kaggle first**.

Read `PRD.md` §10, §17, §18 and §22 alongside it. Nothing here changes a PRD requirement; it says how to get the ◐ and ⬜ rows of §22.2 to ✅, in what order, on what hardware.

---

## Contents

1. Where the build stands
2. What the Zenodo dataset actually is
3. Principles
4. Models
   - M1 Segmentation detector on real SAR
   - M2 Look-alike discriminator, refit on real candidates
   - M3 Drift on real forcing, validated on real drifters
   - M4 Attribution calibration by sweep
5. Compute plan — Kaggle and the laptop
6. Orchestration
7. Timeline
8. Risks
9. Open decisions
10. Corrections this plan requires elsewhere in the repo

---

## 1. Where the build stands

Verified on 18 September 2026 against `shreyash` @ `ad973ad`.

| Area | State |
|---|---|
| Pipeline | Seven strictly sequential stages in `mvp/darktransit/pipeline.py`, each writing a typed artefact to `runs/<run_id>/`. numpy only, offline, deterministic under a recorded seed. Five gates. |
| Self-test | 66 checks. Five consecutive runs on 18 Sep gave 65/66 once and 66/66 four times — **one check is flaky** and is not yet identified (§8, R-7). |
| Look-alike discriminator | `detector.v1.json` — logistic regression over six features, fitted on **our own synthetic scenes**. Two coefficients (`wind_ms`, `homogeneity`) come out with the opposite sign to the physics prior. |
| Segmentation | `detector.unet.v2.npz` — `unet-s-v1`, 487 009 parameters, numpy forward pass, torch parity 3.4e-5. Holdout IoU 0.938 / F1 0.968 — **on the synthetic corpus**. Refines classical candidates only; cannot originate a detection. |
| Drift | RK4 advection, leeway, diffusion, per-particle ensemble — real code over **analytic** forcing. AC-7 method runs on **synthetic** drifters. |
| AIS | Synthetic generator, MMSI prefix 999. Permitted by the PS. |
| Real imagery | `readers/sentinel1.py` reads a calibrated GeoTIFF; no real scene has been run end to end. |
| Zenodo corpus | Confirmed open (CC-BY-4.0). Not downloaded. |

**The single largest gap is that no detection number has been measured on real SAR.** Every model figure in the repository describes the model against our own simulator, and the repository says so. Closing that gap is the highest-value model work, and it is the only part of this plan that needs a GPU.

Stage by stage, the ML surface is small:

| Stage | Nature | Needs GPU |
|---|---|---|
| 02 detection | segmentation + a linear discriminator | **yes, for training only** |
| 03 characterisation | geometry | no |
| 04 drift | physics | no |
| 05 traffic | rules over AIS | no |
| 06 dark channel | CFAR | no |
| 07 attribution | weighted rule pack | no |

---

## 2. What the Zenodo dataset actually is

Read from the Zenodo records API on 18 Sep 2026.

| Record | Title suffix | Files | Size |
|---|---|---|---|
| [8346860](https://zenodo.org/records/8346860) | Part I | `01_Train_Val_Oil_Spill_images.7z`, `…_mask.7z` | 40.71 GB + 0.01 GB |
| [8253899](https://zenodo.org/records/8253899) | Part II | `01_Train_Val_Lookalike_images.7z`, `01_Train_Val_No_Oil_Images.7z`, two mask archives | 22.99 + 22.93 GB |
| [13761290](https://zenodo.org/records/13761290) | Part III | `02_Test_images_and_ground_truth.7z` | 9.86 GB |

Per the record descriptions: images are **2048 × 2048 × 2 (VV and VH)**, σ⁰ in dB, TIFF; ground truth is 2048 × 2048; images are georeferenced, masks are plain matrices on the same grid. Part II holds 685 oil-free images.

Three consequences, each of which contradicts something currently written in the repo:

1. **Part III is the official test set.** `mvp/README.md` currently recommends `cli train --corpus zenodo --zenodo data/part3`. Training on Part III burns the only independent test split the dataset offers. Anything trained on it can never be scored on it.
2. **The images are dual-polarisation float32.** 2048² × 2 × 4 bytes ≈ 33.5 MB per image, and 7z barely compresses float32 speckle, so image counts are roughly: oil ≈ 1 200, look-alike ≈ 686, no-oil 685, test ≈ 290. The MVP pipeline, the scene model and the GeoTIFF reader are all **VV-only**.
3. **The labelling is binary per class archive, not five-class.** PRD §10.4 describes background / oil / look-alike / ship / land as "the Zenodo set's own labelling". That is the labelling of a different dataset. Here there are oil masks and look-alike masks. Whether the look-alike masks mark look-alike *pixels* or are empty must be checked on first extract; it decides between binary segmentation plus a tile-level classifier, and three-class segmentation.

No Kaggle mirror of these three records was found. The oil-spill datasets that do exist on Kaggle (for example Deep-SAR SOS, or a binary oil / no-oil classification set) are different corpora and are not the dataset the PS names.

---

## 3. Principles

These are the rules the rest of the plan follows. Each one exists because breaking it would produce a number or a claim we could not defend.

- **P1 — Deterministic spine, no LLM in the decision path.** Stage 07 emits a vessel identity. AC-8 (identical inputs, identical scores) and the auditability argument both depend on stages 01–07 being pure functions of their inputs. SatQuery is agentic because its PS asks for it; Dark Transit is not, deliberately, and the slide says so.
- **P2 — The classical pass proposes, the network refines.** The U-Net can redraw a boundary inside a dilation of a classical candidate; it cannot create an incident. This survives every model upgrade in this plan. What it costs is measured, not assumed (M1, *proposer recall*).
- **P3 — One test split, scored once.** Part III is the test split. Thresholds and model choices are made on validation. The final holdout is scored once per candidate model, by a separate notebook, and the result is recorded whether it is good or bad.
- **P4 — Split by acquisition, not by patch.** Tiles cut from one Sentinel-1 product share wind, sea state and speckle. Splitting across them measures memorisation.
- **P5 — No learned attribution.** There is no labelled dataset of attributed spills. A ranker trained on our synthetic culprits would learn our AIS generator. Attribution weights stay declarative and are justified by ablation.
- **P6 — Every number carries its provenance.** Corpus, split hash, notebook version, pack hash. A figure without them does not go on a slide.
- **P7 — Degrade, never fail.** Every new model or data path is an optional capability with a logged fallback, exactly like the existing U-Net, PDF and GeoTIFF paths.

---

## 4. Models

### M1 — Segmentation detector on real SAR

**Goal.** A detection model with per-class IoU and a look-alike false-positive rate measured on Part III, and a pack the pipeline can load.

#### M1.0 Data preparation

Convert each image once, on Kaggle CPU, into a compact training format:

- **Quantise σ⁰ to uint8.** Clip to [−35, +5] dB and map linearly to 0–255: a step of about 0.16 dB. Speckle on a single-look GRD pixel is several dB, so the quantisation is far below the noise the model already has to see through. Size drops from 33.5 MB to 8.4 MB per image.
- **Optionally downsample 2×** to 1024², another 4×. Decide by measuring: train the baseline at both resolutions on Tier A and keep 1024² unless IoU drops by more than 0.02.
- Store VV and VH as two channels; the loader chooses which to feed.
- Keep masks as uint8 on the same grid.
- Write a **tile index**: file, class archive, Sentinel-1 product id if recoverable from the georeferenced TIFF metadata or filename, footprint, acquisition time if available, oil-pixel fraction.
- Write a **split file** (`splits/zenodo.v1.json`) grouping by product id where available, by image otherwise. Commit it. Its hash goes into every model card.

Estimated prepared sizes at 2048² uint8: oil ≈ 10 GB, look-alike ≈ 5.8 GB, no-oil ≈ 5.8 GB, test ≈ 2.5 GB. At 1024², a quarter of that. Both fit Kaggle's output limit if each class archive becomes its own Kaggle Dataset.

#### M1.1 Data tiers

| Tier | Download | Train / val | Test | When |
|---|---|---|---|---|
| **A** | Part III (9.9 GB) | internal split of Part III, by image | internal holdout of Part III | before 20 Sep |
| **B** | + Part I oil, + Part II look-alike (~64 GB) | Part I + Part II | **Part III, untouched** | Phase 1 |
| **C** | + Part II no-oil (23 GB) | as B, more negatives | Part III | if B's clean-tile FPR is poor |

Tier A exists only to put one real-SAR number in the submission. It must be labelled exactly as *"internal split of the published test part (Zenodo 13761290)"* wherever it appears. The Tier A model is never scored on Part III as a whole, and it is never the deployed model once Tier B exists.

Tier C is lowest priority: look-alike tiles and the synthetic corpus already supply hard negatives. Add it only if the clean-tile false-positive rate says it is needed.

#### M1.2 Step 1 — baseline, existing architecture

Retrain `unet-s-v1` on Tier A through the existing harness (`train_unet.py`), VV only, unchanged except for the corpus loader reading the prepared shards and the split file.

Why first: no new architecture, the torch-to-numpy parity check still applies, and the numpy pack it produces drops into the pipeline with no dependency change. About one GPU-hour.

#### M1.3 Step 2 — pretrained encoder

- `segmentation_models_pytorch` U-Net, **ResNet-18 encoder** first, ResNet-34 only if quota allows and ResNet-18 is clearly encoder-limited.
- First convolution built by averaging the ImageNet RGB kernels into one channel (VV) or two (VV+VH).
- Random 512² crops, positive-biased sampling (the current harness uses 0.6).
- Loss: BCE with `pos_weight` + soft Dice, as today.
- Augmentation: flips, rot90, multiplicative gamma speckle. **No photometric jitter** — σ⁰ is a physical quantity and shifting it teaches the model a lie.
- AMP on. Checkpoint every epoch to `/kaggle/working`.
- Two variants: VV-only (deployable today) and VV+VH (tells us whether extending the reader is worth it).

**Deployment.** Export to ONNX in fp16 and load through ONNX Runtime as a new optional capability. The in-repo numpy `unet-s` stays as the fallback, so a machine without ONNX Runtime still runs, and logs the degradation. Parity is checked torch-vs-ORT before the pack is written; fp16 needs a looser tolerance (on the order of 1e-2 on probabilities rather than 1e-4) and the card records the tolerance used.

**Size.** A ResNet-34 U-Net is about 24 M parameters, roughly 98 MB in fp32 — at the 100 MB limit the repo enforces for git (DAT-06). ResNet-18 in fp16 is on the order of 28 MB. Prefer ResNet-18; if ResNet-34 wins, ship it fp16.

**Adoption rule.** Step 2 replaces Step 1 only if it beats it on the *validation* split by a margin larger than the seed-to-seed spread (train each at least twice).

#### M1.4 Metrics

Report all of these, per model, in the model card. No aggregate IoU anywhere.

| Metric | Definition | Why it matters |
|---|---|---|
| Oil IoU | pixel IoU on the oil class, test split | the detection quality number |
| Oil F1 | pixel F1, same | comparable to literature |
| **Look-alike tile FPR** | share of look-alike tiles on which the full stage-02 path (classical + refinement + discriminator) emits any slick ≥ the minimum area | the number a judge asks for; the PS's own difficulty |
| Clean-tile FPR | same, on no-oil tiles | the negative control, on real data |
| **Classical proposer recall** | share of ground-truth oil components touched by any classical candidate | the ceiling P2 imposes; measure it before tuning anything else |
| Wilson 95 % intervals | on every proportion | n is small; intervals are not optional |

The operating threshold is chosen on **validation**. The current pack's threshold of 0.70 was "chosen by sweep"; confirm that sweep did not use the holdout, and if it did, say so in the card.

If proposer recall is low, the answer is not to quietly let the network propose. It is to report the ceiling, then decide explicitly (open decision D-3) whether to relax P2 with a guard — for example, network proposals admitted only above a high probability and a minimum area, and marked as network-originated in the dossier.

#### M1.5 Model card

Every pack ships with a JSON card beside it, extending the format `detector.unet.v2.json` already uses:

```json
{
  "pack_version": "unet.r18.v3",
  "architecture": "unet-resnet18",
  "channels": ["VV"],
  "corpus": "zenodo",
  "tier": "B",
  "split_file": "splits/zenodo.v1.json",
  "split_sha256": "…",
  "kaggle_notebook": "user/dark-transit-10-train",
  "kaggle_version": 7,
  "datasets": {"part1-oil": 2, "part2-lookalike": 1, "part3-test": 1},
  "threshold": {"value": 0.62, "chosen_on": "validation"},
  "export": {"format": "onnx-fp16", "parity_max_abs": 0.004, "tolerance": 0.01},
  "metrics": {"validation": {}, "test": {"scored_utc": "…", "oil_iou": null}},
  "caveat": "…"
}
```

`metrics.test` is written only by the evaluation notebook (§6.3).

### M2 — Look-alike discriminator, refit on real candidates

**Goal.** `detector.v2.json`: the six-feature discriminator refitted on candidates extracted from real SAR, with the sign check still applied.

- Run the classical candidate pass over the prepared training tiles (VV).
- **Labels.** A candidate is positive if its IoU with a ground-truth oil component is ≥ 0.5. Every candidate on a look-alike or no-oil tile is negative. Candidates on oil tiles that miss the ground truth are negative too, and counted separately.
- **Wind feature.** Zenodo carries no wind field. If the tile index recovers acquisition time and footprint, sample ERA5 10 m wind there (M3 already pulls ERA5). If not, use the existing Bragg-inversion proxy (`wind_proxy_ms`) and record that the wind feature is a proxy.
- **Seventh feature.** Fit with and without the U-Net's mean in-candidate probability. Adopt the seven-feature model only if its holdout precision/recall intervals separate from the six-feature model's. The README already names this as "the obvious next step and not done"; this is how it gets done honestly.
- **Sign check** stays in the fitting code. If `wind_ms` and `homogeneity` still disagree with the physics prior on real data, that is a finding, and the card says so.

Split, holdout and metrics follow M1 exactly (same split file). CPU only — Kaggle CPU session or the laptop.

### M3 — Drift on real forcing, validated on real drifters

**Goal.** AC-7 satisfied on real Global Drifter Program trajectories, with the ensemble spread calibrated rather than over-dispersed.

#### Forcing

| Field | Product | Resolution | Access |
|---|---|---|---|
| Surface current | CMEMS `GLOBAL_ANALYSISFORECAST_PHY`, `uo`/`vo` at the surface | 1/12°, hourly | free account, `copernicusmarine` CLI |
| 10 m wind | ERA5 single levels, `u10`/`v10` | 0.25°, hourly | free CDS account, `cdsapi`; **requests queue — submit on day one** |
| Coastline | GSHHG or Natural Earth | — | direct download |
| Drifters | GDP hourly product | — | NOAA AOML, free |

One region box (Gulf of Kutch / north-eastern Arabian Sea), one window long enough to cover the demo incident plus a validation month. The subsets are megabytes, and they go into `data/forcing/` with a manifest.

Implementation: a reader that turns the NetCDF subsets into the same gridded structure `forcing.py` already interpolates trilinearly. Nothing downstream changes. The analytic forcing remains the default for synthetic scenarios, and a run records which forcing it used.

#### Validation (AC-7)

- Select GDP drogued drifters inside the box and window.
- For each, take a known position, hindcast 24 h through real forcing with the drifter's object model (α = 0 for a drogued buoy), and record whether its true position 24 h earlier lies inside r₉₅.
- Target: 90 % coverage.
- **Calibrate the ensemble**, don't just report it. Sweep `K_h` and the current-amplitude spread, and plot observed coverage against nominal quantile (50, 68, 90, 95 %). A calibrated ensemble lies on the diagonal. Today's synthetic 30/30 lies far above it — over-dispersed, as PRD §17 already states.
- Keep the existing sanity check: re-running with oil's leeway (α = 0.03) on buoys must collapse coverage.

#### OpenDrift

Install OpenDrift/OpenOil as an optional capability and run it on the same seeds and forcing as a **cross-check**: compare centroid track and r₉₅ at 6, 12, 24 and 40 h. It is not a replacement; the RK4 integrator is validated in-repo and deterministic. Agreement goes on a slide; disagreement goes in the limitations page with the numbers.

### M4 — Attribution calibration by sweep

**Goal.** The PRD §17 sweeps and the ablation table, measured.

| Sweep | Values | Reports |
|---|---|---|
| Hindcast horizon | 6, 12, 24, 40 h | top-1 recall; horizon at which gate 2 starts firing |
| Traffic density | 5, 10, 25, 50 vessels | top-1 recall; leader margin distribution |
| Leeway α | 0.02, 0.03, 0.04 | r₉₅ sensitivity |
| `K_h` | 1, 5, 10 m²/s | r₉₅ sensitivity; slick-age bias |
| Ablation | each factor zeroed | top-1 recall per factor |

At least 30 seeds per cell, 50 where affordable. Wilson intervals on every recall. Weights stay in `weights.v4.json`; the sweep justifies them, it does not fit them (P5).

Cost: on the order of 800 runs × ~41 s. With the stage cache (§6.2) most runs reuse detection and drift, and with 14 worker processes on the laptop the whole grid is well under an hour.

---

## 5. Compute plan — Kaggle and the laptop

Everything in this plan runs on free compute.

| Work | Where | Why |
|---|---|---|
| Zenodo download, extraction, uint8 conversion, tile index | **Kaggle CPU notebook**, internet on | datacenter bandwidth; no GPU quota spent; the laptop has 19 GB free disk, not enough for Part I |
| M1 training | **Kaggle GPU notebook** (prefer T4 — tensor cores for AMP; P100 has none), committed with *Save & Run All* so it runs headless | PyTorch preinstalled; weekly GPU quota covers the plan |
| M1 test evaluation | Kaggle GPU, separate notebook | enforces P3 |
| M2 refit | Kaggle CPU or laptop | numpy |
| M3 forcing, drifters, OpenDrift | **laptop** — 16 cores, 15 GB RAM | small data; free accounts |
| M4 sweeps | **laptop**, `multiprocessing` | CPU-bound, embarrassingly parallel |
| GPU fallback | Colab free T4 | only if the Kaggle quota is exhausted |

**Kaggle limits to verify before relying on them.** The figures this plan assumes are recalled, not read from Kaggle: about 30 GPU-hours per week, 12 h per session, 20 GB of persisted output in `/kaggle/working`, phone verification required for internet and GPU. The size of the ephemeral scratch disk is not known; the first cell of every fetch notebook runs `df -h` and the notebook stops if the archive cannot fit.

**GPU budget.** Roughly 2 000 training images, 512² crops, 40 epochs, ResNet-18 on a T4 with AMP: on the order of 3–4 GPU-hours per run. A week's quota covers the baseline, ResNet-18 VV, ResNet-18 VV+VH, a repeat seed, and the test evaluation, with margin.

**Sessions longer than 12 h.** Each training version attaches the previous version's output as an input and resumes from its last checkpoint.

**Download risk.** Zenodo throttles long transfers. Use `aria2c -x8 -s8` (parallel connections) and measure throughput for the first five minutes. Part I at a few hundred KB/s will not finish in one session; if throughput is that low, split Part I across sessions with the byte-range logic already in `tools/fetch_zenodo.sh`, or stop at Tier A plus the look-alike archive.

**Moving outputs.** Prepared shards become Kaggle Datasets via *New Dataset from notebook output* — one dataset per class archive, so each stays under the output limit and can be versioned on its own. Trained packs come back to the repo with `kaggle kernels output`.

---

## 6. Orchestration

### 6.1 The shape does not change

The pipeline stays a strictly linear sequence of seven stages, each a pure function of stored inputs, each writing a typed artefact, gated where the PRD says. The changes below make that spine carry real data and repeated experiments; none of them adds a planner, a router or a model in the decision path.

### 6.2 Changes to the pipeline

| # | Change | Why |
|---|---|---|
| O1 | Split the 631-line `pipeline.run` into a stage registry: `Stage(name, inputs, fn, gate)`, run in order by a small driver | each stage testable and swappable (classical vs U-Net vs ONNX detector) without editing the spine |
| O2 | **Content-addressed stage cache.** Key = hash of input artefacts + stage config + **model pack hash** + forcing manifest hash | sweeps reuse detection and drift across weight and density variants; "rerun from stage N" becomes a cache hit, not a convention. Omitting the pack hash would silently reuse stale detections after a model swap |
| O3 | **Separate data plane.** `darktransit.fetch` subcommands (S1 GRD, CMEMS, ERA5, GDP, coastline) write to `data/` with a manifest recording source, request, time and checksum | downloads take hours to days; a pipeline run never touches the network (NFR offline rule stays true) |
| O4 | **Forcing-coverage pre-flight** in stage 01: refuse if the forcing on disk does not span the scene footprint and the drift horizon | same pattern as gate 5 — refuse before compute is spent |
| O5 | **Model registry.** Packs plus cards in `mvp/`, the run manifest records each pack's hash, the dossier prints which packs were in force and their corpus | P6, on the report a reader actually holds |
| O6 | **Sweep runner.** `cli sweep --grid grid.json --workers N`: a `multiprocessing` pool over (scenario, seed, parameter), results to CSV, then the §4 M4 tables generated from the CSV | M4 |
| O7 | **Run jobs in the server.** `POST /runs` starts a run in a subprocess and returns an id; `GET /runs/{id}/status` polls. FastAPI only if the finale demo needs a live run and the stdlib server cannot hold it | a nominal run is about 41 s and must not block a request |
| O8 | **Hybrid incident mode.** Real Sentinel-1 scene + real CMEMS/ERA5 + synthetic AIS, with the synthetic culprit laid along the *real* hindcast. Declared on dossier page 1, in the run log and in the UI | real imagery and real physics end to end, while respecting that real Indian AIS is restricted |
| O9 | **CI discipline.** `selftest` and `web-app/verify.mjs` before every merge and every demo; selftest writes failures to a file so a flake can be diagnosed from one run | the determinism claim cannot coexist with a flaky test |

### 6.3 Training orchestration — notebooks live in git

Kaggle is the executor; git is the source of truth.

```
dark-transit/kaggle/
  01-fetch-part3/       CPU, internet on   → dataset  dt-zenodo-part3
  02-fetch-part1-oil/   CPU, internet on   → dataset  dt-zenodo-part1-oil
  03-fetch-part2-la/    CPU, internet on   → dataset  dt-zenodo-part2-lookalike
  04-fetch-part2-no/    CPU, internet on   → dataset  dt-zenodo-part2-nooil      (tier C)
  10-train/             GPU, attaches the datasets and the split file
                        → pack + card (metrics.validation only)
  20-eval-test/         GPU, Part III only, one candidate pack per run
                        → card with metrics.test filled
```

Each directory holds a notebook and a `kernel-metadata.json`. Push with:

```bash
kaggle kernels push -p dark-transit/kaggle/10-train
kaggle kernels status <user>/dark-transit-10-train
kaggle kernels output <user>/dark-transit-10-train -p dark-transit/mvp/
```

`20-eval-test` is a separate notebook so that scoring the test split is a deliberate act, once per candidate, with the result recorded in the card either way. That enforces P3 by process rather than by discipline.

### 6.4 What stays out

- No LLM agent anywhere in stages 01–07 (P1).
- No transmit endpoint. Sending a dossier to an enforcement body remains a human action.
- No MLflow or experiment tracker; the model cards plus Kaggle version numbers are the record.

---

## 7. Timeline

The portal deadline in the repo is 20 September 2026; the SatQuery PRD records 20 vs 30 September as unresolved. Both branches are planned.

### Before 20 September (Phase 0)

The deliverable is the idea submission. **Model work must not block the deck.**

| Day | Work |
|---|---|
| 18 Sep | Start `01-fetch-part3` on Kaggle CPU; measure throughput. Submit the ERA5 request. Correct the `part3` training instruction in `mvp/README.md` (§10). |
| 19 Sep | Prepare Tier A shards and split file. Train M1 Step 1 (≈ 1 GPU-hour). If a number exists by the evening, it goes into the deck under its exact label. Find and fix the flaky selftest check. |
| 20 Sep | Submit. The deck quotes synthetic numbers as synthetic and the Tier A number, if any, as an internal split of the test part. |

### If the deadline is 30 September

Add, in order: Tier B download → M1 Step 2 (ResNet-18 VV) → first Part III test score → M2 refit → M3 real forcing and AC-7.

### Phase 1 (after selection, before the finale)

M1 Step 2 variants and final test score · M2 · M3 with AC-7 on real drifters and the OpenDrift cross-check · M4 sweeps and ablation · O1–O9 · one hybrid incident run end to end.

### Phase 2 (finale, 36 hours)

Nothing new is built. One live hybrid run inside the NFR-8 budget, the negative control, one deliberate gate firing in front of the judges, rehearsal.

---

## 8. Risks

| # | Risk | Likelihood | Handling |
|---|---|---|---|
| R-1 | Zenodo throughput too low to fetch Part I in a Kaggle session | medium | parallel connections; byte-range resume across sessions; fall back to Tier A + look-alike |
| R-2 | Kaggle scratch disk cannot hold a 41 GB archive plus extraction | medium | `df -h` guard; extract and convert in batches, deleting as you go; split across sessions |
| R-3 | Classical proposer recall on real SAR is low | medium | measured first (M1.4); decision D-3; reported either way |
| R-4 | Real-data IoU is far below the synthetic 0.938 | high | expected; the synthetic number was always a floor on method validity, not an accuracy claim. Report the real one |
| R-5 | Tier A model mistaken for the deployable model | low | card field `tier`; label on every slide; Tier B replaces it |
| R-6 | ERA5 queue delays M3 | medium | submit on day one; CMEMS alone still permits a current-only run, logged as degraded |
| R-7 | Flaky selftest check undermines the determinism claim | observed (1 in 5) | O9: capture failures to a file, then fix. Unconfirmed suspects: run ids carry one-second resolution (`pipeline.py:132`), and `tests.py:342` selects the "latest" run by mtime |
| R-8 | Kaggle quotas differ from the figures assumed here | low | verify on the settings page; Colab free T4 as fallback |
| R-9 | A ResNet-34 pack exceeds the git size limit | medium | prefer ResNet-18; fp16 export |

---

## 9. Open decisions

| # | Decision | Default if nobody decides |
|---|---|---|
| D-1 | Portal deadline: 20 or 30 September | plan for 20 |
| D-2 | Who owns the ML work for Dark Transit, given the SatQuery model owner is already committed there | Shreyash |
| D-3 | Relax P2 if proposer recall is low (network-originated detections, guarded and labelled) | no — report the ceiling |
| D-4 | Deploy VV+VH if it clearly beats VV-only (requires extending the reader and scene model) | VV-only until after the finale |
| D-5 | Store training data at 1024² or 2048² | 1024² unless Tier A shows IoU loss > 0.02 |

---

## 10. Corrections this plan requires elsewhere in the repo

Not made in this commit; listed so they are not forgotten.

1. `mvp/README.md` — replace the `train --corpus zenodo --zenodo data/part3` instruction: Part III is the test set (§2). Train on Part I + II; score on Part III.
2. `mvp/README.md` and `PRD.md` §22 — "Part III is the smallest useful record" is true of size but not of role; say what it is.
3. `PRD.md` §10.4 — the class list (background / oil / look-alike / ship / land) is not this dataset's labelling; replace with the binary per-class structure once the look-alike masks are inspected.
4. `PRD.md` §10.4 — input is dual-polarisation in the dataset; state the VV-only deployment decision (D-4).
5. `PRD.md` §17 — the detection row's target stays a target until M1's test score exists.
