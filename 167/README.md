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
satquery selftest                    # 71 checks, ~5 s
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
| 1 | **Remote-sensing adaptation — a fine-tuned visual or vision-language component** | **trained, measured, wired** (M1, +13.30 points) — serves where it can run; see below |
| 2 | Single-image VQA, plus one more single-image task | built, classical |
| 3 | Bi-temporal change analysis | built, classical |
| 4 | Optical–SAR cross-modal analysis | built, classical |
| 5 | Agentic orchestration — routing, validation, execution | built |

Requirement 1 is the one the statement calls disqualifying to omit:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the
> requirements."*

M1 is trained and measured: zero-shot 0.5270 → adapted 0.6600 on 2,000
held-out VRSBench items, with train/val image overlap counted at zero. The pack
ships in `models/adapters/m1-rs-vqa/` and is wired into the pipeline: an
optical VQA query is answered by M1 wherever M1 can run — live on a CUDA GPU,
or from answers pre-computed by the same code on Kaggle — and `engine` says
which path answered each query.

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
rung 1      0.6305    4,000 training samples
rung 2      0.6600   12,000 training samples   <- shipped
gain       +0.1330
```

Train and evaluation are VRSBench's own published split, and the overlap
between them was counted rather than assumed: 0 of 20,264 / 9,350 images.

Numbers, per-category breakdown and the caveats on comparing them to published
results are in `models/MANIFEST.md`. The training script is
`models/train_rs_vqa.py`; the evaluation is `models/eval_baseline.py`, with and
without `--adapter`.

**How M1 serves.** `python3 -m satquery.cli serve --adapters models/adapters`
loads the pack. For an optical VQA question the pipeline asks the runtime for
M1's answer, in one of two ways:

| Mode | Where | What |
|---|---|---|
| **live** | a machine with a CUDA GPU (~6 GB for the 4-bit 7B) and `torch`/`peft` | base + adapter loaded once, run greedily — the same path that measured 0.660 |
| **pre-computed** | any machine, including a 4 GB laptop | answers that same live path produced earlier, for known images and questions — `models/precompute_m1.py` on Kaggle writes them to `models/adapters/m1-rs-vqa/precomputed.jsonl` |

M1's answer becomes one more evidence record, never a replacement for
measurement (ADR-007). It leads the answer for *what / where / which* questions;
a **measured** count or area leads its question, because M1 counts poorly
(object quantity 0.56) — and when M1 disagrees with the measurement, the
disagreement is recorded as a conflict and confidence drops (audit A3). SAR is
never shown to M1: it was trained on optical imagery (03 §7).

When M1 cannot answer — no GPU, an image it has no pre-computed answer for, a
SAR input — the classical specialist answers, the result says
`engine: classical`, and the trace says why. A pre-computed answer sets the
result's `precomputed` flag, so the interface discloses it (ADP-09).
`/api/health` reports each pack's mode — live, pre-computed with a count, or
not serving and why.

A loaded pack once counted as *available* whether or not anything could run
it, and staging M1 made results claim `neural+classical` on answers a
three-class Otsu split had produced. `available()` now means *can serve*, and
`satquery/tests.py` drives the whole path — stub packs, a real pack with no
inference path, pre-computed hits and misses, SAR, and a count conflict.

The other packs (M2–M4, when they exist) speak the claims contract in
`satquery/adapted.py`, in process or over HTTP via `satquery runtime`: their
claims join as evidence after the classical measurement, and a runtime that is
down or slow leaves the classical result serving, with the trace saying why.

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

**VRSBench VQA is claimed, for M1**: 0.5270 zero-shot → 0.6600 adapted on
2,000 held-out items, paired McNemar p = 1.2e-35 — with its caveats in
`models/MANIFEST.md`. **Not claimed:** RSVQA and CDVQA; there is no loader for
either.

**Projections.** Uploaded imagery in UTM (EPSG:326xx / 327xx) — how Cartosat
and Sentinel-2 products are delivered — is converted to WGS84 for every
position, box and GeoJSON vertex, and measured in metres. Until 23 Sep it was
read as degrees: a 164 ha UTM image reported 48,948,962,480 ha. Other
projections are refused into pixel space with a stated reason rather than
guessed. Areas on geographic (EPSG:4326) imagery now account for latitude; they
previously ran ~9 % high at the demo scene's 23 N, so the demo's hectare
figures are ~9 % lower than in earlier versions of this README.

**Router accuracy is deliberately not listed.** The in-sample figure is
measured on the queries the rules were written from. The held-out figure needs
`reference/router_heldout.jsonl`, written blind to the rules — see
`reference/README.md`; `satquery heldout` scores it.

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
rasters are block-averaged and say so), `SATQUERY_MAX_UPLOAD_MB` (default 200;
lower it on a small host such as a 512 MB free tier), `SATQUERY_VAR`, `SATQUERY_HOME`.

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
