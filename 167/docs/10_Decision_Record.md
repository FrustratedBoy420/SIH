# Decision Record — the road to submission

**Written:** 10 September 2026
**Status:** PS26167 is the project. This file records what is settled, what is
open, and the dates by which each open item must close.

Keep this file current. When a decision changes, amend it here rather than
arguing it again from scratch.

---

## 1. What is settled

| | Decision |
|---|---|
| Problem statement | **PS26167 — SatQuery AI**, ISRO, Space Technology |
| Repository | this one; SatQuery is at the root, nothing else is |
| Compute | rented / free-tier cloud GPU. The development laptop has 4 GB VRAM against a 16 GB floor and cannot train |
| Scope for submission | **M1 only.** The PS requires *"at least one"* adapted component. One is the target; M2–M4 are post-submission |
| Training corpus | **VRSBench**, not the full BigEarthNet imagery — see §4 |
| Web design | **Field Atlas** (19 Sep 2026), modelled on Earth Genome / Earth Index and Picterra; supersedes the "editorial instrument" direction. Spec in `06_Design_System.md` §1–§5 |

---

## 2. The one requirement that decides everything

The statement says, of remote-sensing adaptation:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the
> requirements."*

Today the repository contains **no neural code**: no `torch`, no `transformers`,
no `peft`. `Pipeline(adapters=...)` accepts a pack and `Specialist.method`
reports `neural+classical` when one is loaded, but no pack exists and none of
the call sites pass one.

Everything below exists to close that.

**The evidence is the gain, not the score.** A trained adapter with no
zero-shot baseline beside it proves nothing about adaptation. Measure the
baseline first; it needs no GPU quota and no training.

---

## 3. Targets — use these, not intuition

Published anchors, from `03_Model_Specification.md` §4 and §5:

| Metric | Realistic target | Published anchor |
|---|---|---|
| VQA accuracy (VRSBench) | **55–62 %** | GeoChat fine-tuned **60.6 %**; GPT-4V **65.6 %** |
| Adaptation gain, zero-shot → adapted | **+10 to +20 points** | GeoChat's published gain: 40.8 % → 60.6 % = **+19.8** |
| Grounding Acc@0.5 | **30–45 %** | GeoChat best **39.6 %** |
| Router, on held-out paraphrases | **~0.85** | — |

> **Do not adopt targets above these.** 80 % VQA is above GPT-4V; 70 %
> grounding IoU is roughly 1.8× the best published result. A target above the
> state of the art converts a good result into a perceived failure, and the
> predictable response is to keep training past the point of returns or to
> quietly measure it some easier way.
>
> §5 of the specification says it directly: *"Teams abandon this problem because
> they hit 40 % and assume failure. They have not failed."*

---

## 4. Corpus — VRSBench, not BigEarthNet imagery

`BigEarthNet.txt` on Hugging Face is **467 MB of annotations**, keyed by
`patch_id` and `s1_name`. The Sentinel-1/2 pixels those keys point at are a
**separate 155 GB dataset**. Downloading it is not compatible with the schedule
and does not fit the available disk.

The statement permits the alternative explicitly:

> *"fine-tuned or otherwise adapted using BigEarthNet.txt **or the any open
> source training data**"*

**VRSBench is 12.5 GB, carries VQA pairs, and is one of the benchmarks the work
is scored against.** Train on it, evaluate on its test split, report the gain.

A 2.5 GB Lithuania-summer subset of BigEarthNet v2 exists if a Sentinel-specific
result is wanted later. It is not needed for M1.

---

## 5. Base model — benchmark before choosing

The specification recommends GeoChat, and for a general build that is right.
For *this* submission the choice interacts with the evidence:

| Base | Absolute score | Gain available to demonstrate |
|---|---|---|
| `MBZUAI/geochat-7B` | higher — already remote-sensing adapted | small, because the adaptation already happened |
| `Qwen/Qwen2-VL-7B-Instruct` | lower | larger, because it starts generic |

Requirement 1 asks for evidence of *adaptation*, and §4 of the specification
says *"report the gain, not just the absolute."* Those two facts favour the
generic base.

**Do not assume the numbers.** Run zero-shot on both, then decide. Report what
the measurement says.

---

## 6. Environment — three things that cost a day each if discovered late

**`bf16` will not work on Kaggle.** §12's config specifies it. Kaggle provides
P100 (Pascal) or T4 (Turing); neither supports bf16. **Use `fp16`.**

**Sessions cap at 9 hours.** A ~16 GPU-hour run must checkpoint and resume.
Build that on day one, not when a run dies at hour eight.

**The `adapters=` path has never executed.** Not once, in any call site. Write a
test that constructs `Pipeline(adapters={...})` with a *stub* and asserts
`method == "neural+classical"` — before real weights exist. The first execution
of that code path should not happen under deadline pressure.

---

## 7. Open items, by cost

### Certain and cheap — do first

| Item | Cost | Why it matters |
|---|---|---|
| **Serve the built UI without FastAPI** | ~20 min | `server.py:245` mounts `dist` only in the FastAPI branch. Following the README on a clean install gives **404 at `/`**. A judge cloning the repo sees a blank page before seeing anything else |
| **Upload endpoint** | 2–3 days | There is no way to give the system a file. `raster.read()` handles GeoTIFF and is called by nothing. If an evaluator hands over imagery, this is where it fails — before the model is ever reached |
| Relabel ablation row A | minutes | `evaluate.py:223` calls it *"Generic VLM"*; it is grayscale Otsu with water defined as the complement of built-up. A judge who catches this stops trusting every other number |
| Print the `capability` formula | minutes | `evaluate.py:291` — an invented `0.50·f1 + 0.25·router + 0.25·(ran: yes/no)` that reads like a standard metric |
| Cloud disclosure on the slide | minutes | `scene.py:223` places the deck over the built-up cluster deliberately. Say so; a constructed scenario is a stronger demo than an accidental discovery |
| `data-testid` in `verify.mjs` | ~1 hr | the answer assertion is pinned to a Tailwind class and passes or fails on restyles, independent of the feature |

### The research item

| Item | Cost |
|---|---|
| Zero-shot baseline on VRSBench | ~1 day, **no GPU quota** |
| QLoRA training, M1 | ~16 GPU-h |
| Evaluate adapted, compute gain | ~1 day |
| Wire the pack into `Pipeline(adapters=...)` | ~2 days |
| Held-out router paraphrase set | ~1 day |

### Deferred, explicitly

M2 grounding, M3 change, M4 optical–SAR adapters. A benchmark loader for RSVQA
and CDVQA. Full BigEarthNet. These are post-submission.

---

## 8. Checkpoints

| Date | Must exist | If missing |
|---|---|---|
| **11 Sep** | README/FastAPI fix; the four labelling corrections | trivial — no excuse |
| **13 Sep** | **Zero-shot VQA baseline, measured** | the schedule has slipped; escalate. This needs no training |
| **18 Sep** | Training run complete or clearly converging | reduce scope, or ship classical with honest framing |
| **22 Sep** | Adapted number, stated gain, pack wired into the pipeline | stop adding scope; consolidate what works |
| **24 Sep** | Upload endpoint working end to end | — |
| **30 Sep** | Submission | — |

**13 September is the real gate.** The baseline requires no GPU and no training.
If it has not been measured by then, nothing downstream will land either.

---

## 9. Standing rules

1. **Report what was measured, never what was targeted.** `models/MANIFEST.md`
   stays empty until real numbers exist.
2. **A metric measured on its own construction is not a metric.** The router
   figure of 1.0000 comes from evaluating 19 labelled queries against the 4
   regexes those queries were written from. Held-out or not reported.
3. **Disclose constructed scenarios in the document a judge reads**, not only in
   a source comment. Every current disclosure exists somewhere in the code; the
   gap is that the README and slides said something friendlier.
4. **Never let the language layer invent a number.** `pipeline.answer()` takes an
   `EvidenceSet` and no raster — ADR-007. Keep it that way when the adapters land.
5. **One adapted component satisfies requirement 1.** Resist widening to four
   before one is finished and wired.
