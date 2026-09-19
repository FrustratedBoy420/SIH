# SatQuery AI — SIH26167

**An agentic vision-language assistant for multimodal remote-sensing imagery.**
Smart India Hackathon 2026 · Indian Space Research Organisation · Space Technology

Satellite imagery normally needs a specialist: which software, which model, which
parameters. This removes that. A user uploads imagery, asks a question in plain
language, and the system decides which specialist model to run, checks that the
imagery can actually support the question, and returns an answer with the
evidence behind it.

```bash
pip install -e .                     # Python 3.11+; pinned, no GDAL
satquery selftest                    # 46 checks, ~5 s
satquery serve --build               # UI + API on http://127.0.0.1:8000 (--build needs Node 20+)
docker compose up                    # or: the same, containerised, offline once built
```

---

## Where things are

```
docs/            the problem statement, the analysis, the build contract,
                 the PRD/TRD, the ADRs, and the decision record
satquery/        the Python package — the pipeline, router, specialists
web/             the React + Three.js workstation
notebooks/       adapter training (Kaggle)
models/          adapter weights — gitignored; MANIFEST.md is tracked
data/            corpora — gitignored
tools/           fetch and setup scripts
ml/              the model build plan
deck/            the SIH 2026 idea deck (mock)
research/        earlier deep analyses of PS26167 by team members
```

Commands below run from this folder (`167/`). The official SIH problem-statement
dump is shared by both ideas and lives in `../extra/reference/`.

**Start with [`docs/00_Official_Problem_Statement.md`](docs/00_Official_Problem_Statement.md).**
It is the verbatim requirement and the source of truth. When any other document
says "the PS requires X", it is quoting that file.

Then [`docs/10_Decision_Record.md`](docs/10_Decision_Record.md) — what is built,
what is not, and the dated checkpoints between here and submission.

---

## What the PS makes compulsory

Five capabilities. The system must satisfy all five.

| | Requirement | State |
|---|---|---|
| 1 | **Remote-sensing adaptation — a fine-tuned visual or vision-language component** | **not built** — see below |
| 2 | Single-image VQA, plus one more single-image task | built, classical |
| 3 | Bi-temporal change analysis | built, classical |
| 4 | Optical–SAR cross-modal analysis | built, classical |
| 5 | Agentic orchestration — routing, validation, execution | built |

Requirement 1 is the one the statement calls disqualifying to omit:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the
> requirements."*

It is the current build's single open item, and the whole near-term plan is
pointed at it. `models/MANIFEST.md` stays empty until a pack exists with a
measured before-and-after number beside it.

---

## What is real and what is simulated

State this before anything else, because a judge who finds an undisclosed
simulation stops believing the disclosed ones.

**Real — the demo imagery.** The built-in scenes are 512 × 512 px, 10 m crops
of west Hyderabad (Kokapet, Gandipet / Osman Sagar, the Outer Ring Road) in
EPSG:32644, stored exactly as the missions ship them: Sentinel-2 L2A digital
numbers (S2B 2024-08-10 under monsoon cloud; S2A 2018-05-19 and S2B 2025-03-28
for change) and Sentinel-1 RTC γ⁰ (S1A 2024-08-13). They load through the same
reader as an upload. `tools/fetch_scenes.mjs` + `tools/bake_scenes.py`
reproduce them. *Contains modified Copernicus Sentinel data 2018, 2024, 2025.*
They have no ground truth, so their numbers are measurements, not scores.

**Simulated — the scoring scene.** Accuracy needs a pixel-level answer key,
which no real scene has; Cartosat-2S and RISAT imagery cannot be obtained and
the ISRO/SAC evaluation set is undisclosed. So `satquery/scene.py` generates the
scenes behind every metric on the Results page, with the cloud deck placed over
the built-up cluster on purpose — the case where optical and SAR differ.

**Real — everything that reads the pixels.** Lee speckle filter, multi-level
Otsu, run-based connected components, change vector analysis, NDVI/NDWI,
phase-correlation co-registration, inverse UTM and affine geotransforms, the
router's classify–validate–select–sequence–execute cycle, and the confidence
gate — tuned to hold on real Sentinel data (`docs/10_Decision_Record.md`).

**Trained — M1, the adapted VQA component of `docs/03_Model_Specification.md`
§1 and §4.** A QLoRA adapter on `Qwen/Qwen2-VL-7B-Instruct`, trained on
VRSBench. Measured on 2,000 held-out items, same script and prompt on both
sides:

```
zero-shot   0.5270
adapted     0.6305
gain       +0.1035
```

Numbers, per-category breakdown and the caveats on comparing them to published
results are in `models/MANIFEST.md`. The training script is
`models/train_rs_vqa.py`; the evaluation is `models/eval_baseline.py`, with and
without `--adapter`.

**The seam is wired; M1's inference behind it is not yet.** With a pack staged
under `adapters/`, the pipeline asks the model runtime (in-process, or
`satquery runtime` over HTTP) *after* the classical measurement, turns its
claims into evidence, and records a conflict wherever a model number disagrees
with the measurement by more than 25 % (audit A3). If the runtime is down or
slow, the classical result serves and the trace says why. `engine` reports what
actually ran. Checks in `satquery/tests.py` drive all of this with a stub pack,
in process and over HTTP. What remains is the GPU inference call for the real
M1 pack inside `InProcessRuntime.infer`; until it lands, a real pack answers
`not_implemented`, the classical path serves, and results say `classical`.

**Not built — M2 grounding, M3 change, M4 optical–SAR adapters.** Deferred by
`docs/10_Decision_Record.md` §1: the problem statement requires *at least one*
adapted component, and one is what exists.

---

## The architectural rule

> **Vision models produce the facts. The language layer only phrases them.
> Never the reverse.**

`pipeline.answer()` takes an `EvidenceSet` and no raster, so it cannot invent a
number it was never given. Enforced by the type signature and asserted by a
test — see `docs/ADR/007-evidence-gated-generation.md`.

---

## Two things to try first

**The refusal.** Ask *"what changed between these two dates?"* with an optical +
SAR pair loaded. The system declines, the trace shows the compatibility check
failing, and **no model is invoked**. Most implementations run the change model
on a duplicated image and return a confident, meaningless answer.

**The recovery.** Ask *"use the optical and SAR images together to identify
built-up regions"* on the built-in pair: west Hyderabad in the August 2024
monsoon. The answer quantifies the built-up area SAR found beneath cloud —
invisible to the optical pass three days earlier — and the fused layer shows
where.

---

## The workstation

```bash
pip install -e .                   # FastAPI and uvicorn are pinned dependencies
satquery serve --build             # builds web/dist once (npm ci + build), then UI + API on one origin
```

Without a build, `/` explains how to make one and the API still answers.

Development, with hot reload:

```bash
satquery serve                     # terminal 1 — API on :8000
cd web && npm run dev              # terminal 2 — UI on :5173, proxying /api
```

Headless checks:

```bash
cd web && node verify.mjs http://127.0.0.1:8000
```

---

## Measured

Against ground truth the pipeline never reads, on the synthetic scoring scene.
Reproduce with `satquery eval`, `satquery calibrate`, `satquery stress`,
`satquery bench`.

| What | Metric | Value |
|---|---|---|
| Water grounding | IoU | 1.0000 |
| Vegetation grounding | IoU | 0.9958 |
| SAR built-up detection | F1 | 0.9317 |
| Bi-temporal change | F1 | 0.7698 |
| Calibration, 216 judged records over 36 scenes | ECE | 0.0508 |
| Stress suite (EVL-08), behaviour under bad input | cases as expected | 16 / 16 |
| Cross-modal query, 512 px real scene | p95 latency | 185 ms (target < 15 s) |

**Calibration finds one weakness, reported rather than tuned away:** change
detection states 0.97 confidence and is right 0.78 of the time. The Results
page marks it overconfident.

**Router accuracy is deliberately not listed.** The in-sample figure is
measured on the queries the rules were written from. The held-out figure needs
`reference/router_heldout.jsonl`, written blind to the rules — see
`reference/README.md`; `satquery heldout` scores it.

**Not claimed:** VRSBench, RSVQA or CDVQA numbers from the running system.
Those need M1 serving through the seam and a benchmark loader.

---

## Running it

| | |
|---|---|
| `satquery serve [--build]` | UI + API on one origin; `--build` builds `web/dist` first if missing |
| `docker compose up` | the same in a container, offline once built; `SATQUERY_PORT=8080` if 8000 is taken |
| `docker compose --profile model up` | plus `satquery runtime` serving `./adapters`; set `SATQUERY_RUNTIME=http://runtime:8100` |
| `satquery batch manifest.json --out results/` | evaluator mode: JSON / JSON Lines in, `results.jsonl` + GeoJSON out, offline; `--example m.json` writes a starter |
| `satquery replay RUN_ID` · `POST /api/runs/{id}/replay` | re-run a stored run from its request and diff every field |
| `satquery stress` · `calibrate` · `heldout` · `bench` | the measurements above |

Environment: `SATQUERY_RUNTIME` (`inproc` or an URL), `SATQUERY_RUNTIME_TIMEOUT`
(s, default 20), `SATQUERY_ANALYSIS_MAX_SIDE` (px, default 2048 — larger
rasters are block-averaged and say so), `SATQUERY_VAR`, `SATQUERY_HOME`.

---

## Reference

| | |
|---|---|
| [`docs/00_Official_Problem_Statement.md`](docs/00_Official_Problem_Statement.md) | the authoritative requirement, plus two defects found in the official data |
| [`docs/03_Model_Specification.md`](docs/03_Model_Specification.md) | build contract: components, datasets, LoRA configs, compute, targets |
| [`docs/05_System_Design.md`](docs/05_System_Design.md) | C4, deployment, runtime views |
| [`docs/08_TRD.md`](docs/08_TRD.md) | atomic, testable, traced requirements |
| [`docs/09_External_Review_And_Recommendation.md`](docs/09_External_Review_And_Recommendation.md) | independent review of this build, with its own correction recorded |
| [`docs/10_Decision_Record.md`](docs/10_Decision_Record.md) | what is open, what is deferred, dated checkpoints |
| [`docs/ADR/`](docs/ADR/) | why each structural choice was made |
