# SatQuery AI — SIH26167

**An agentic vision-language assistant for multimodal remote-sensing imagery.**
Smart India Hackathon 2026 · Indian Space Research Organisation · Space Technology

Satellite imagery normally needs a specialist: which software, which model, which
parameters. This removes that. A user uploads imagery, asks a question in plain
language, and the system decides which specialist model to run, checks that the
imagery can actually support the question, and returns an answer with the
evidence behind it.

```bash
python3 -m satquery.cli selftest     # 30 checks, ~1.4 s
python3 -m satquery.cli demo         # one cross-modal run, printed
python3 -m satquery.cli eval         # metrics and the A–E ablation
python3 -m satquery.cli serve        # http://127.0.0.1:8000
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
reference/       the official SIH problem-statement dump
```

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

**Simulated — the pixel values.** Cartosat-2S and RISAT imagery cannot be
obtained and the ISRO/SAC evaluation set is explicitly undisclosed. Scenes come
from `satquery/scene.py`.

**Constructed on purpose — the cloud placement.** `scene.py` puts the cloud deck
over the built-up cluster deliberately. That is the case where optical and SAR
genuinely differ, which is the case worth demonstrating. It is a designed
scenario, not a discovery.

**Real — everything that reads the pixels.** Lee speckle filter, multi-level
Otsu, run-based connected components, change vector analysis, NDVI/NDWI,
phase-correlation co-registration, inverse affine geotransform, the router's
classify–validate–select–sequence–execute cycle, and the confidence gate.

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

**Not yet wired into the pipeline.** The seam exists and is tested:
`Pipeline(adapters=...)` accepts a pack, `Specialist.path` reports
`neural+classical` when one is loaded, and that claim travels out to
`Result.engine`. Four checks in `satquery/tests.py` ("adapter socket") drive it
with a stub, so a pack reaching the wrong specialist — or a missing pack
producing a neural claim — fails the self-test. What remains is connecting the
trained pack to that seam; until that lands, the running system reports
`classical`, which is the truth.

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
built-up regions"*, then pull the modality stack apart. The answer quantifies
how much built-up area lies beneath cloud and is therefore invisible to the
optical sensor.

---

## The workstation

```bash
cd web && npm install && npm run build
cd .. && python3 -m satquery.cli serve      # UI and API on one origin
```

Serving the built UI currently requires **FastAPI**; the stdlib fallback serves
`/api/*` only. Until that is fixed, `pip install fastapi uvicorn` is a
prerequisite for seeing the interface.

Development, with hot reload:

```bash
python3 -m satquery.cli serve      # terminal 1 — API on :8000
cd web && npm run dev              # terminal 2 — UI on :5173, proxying /api
```

Headless checks:

```bash
cd web && node verify.mjs http://127.0.0.1:8000
```

---

## Measured

Against ground truth the pipeline never reads. Reproduce with `cli eval`.

| Task | Metric | Value |
|---|---|---|
| Water grounding | IoU | 1.0000 |
| Vegetation grounding | IoU | 0.9958 |
| SAR built-up detection | F1 | 0.9450 |
| Bi-temporal change | F1 | 0.7698 |
| Calibration | ECE | 0.0328 |
| Cross-modal query | latency | ~90 ms at 512 px |

**Router accuracy is deliberately not listed here.** The current figure is
measured over the same labelled queries the routing rules were written from, so
it reports construction rather than generalisation. It will be reported once a
held-out paraphrase set exists — see `docs/10_Decision_Record.md`.

**Not claimed:** VRSBench, RSVQA or CDVQA numbers. Those need the adapters and
a benchmark loader, neither of which exists yet.

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
