# SatQuery AI — ML Build Plan

**Owner: Mridul. Scope: PS26167 requirement 1 — remote-sensing adaptation.**

This is the one mandatory capability with zero code behind it. Requirements 2–5 are built, classically, and measured (`docs/07_PRD.md` §7). If this plan doesn't land, nothing else in the repository closes the disqualifying gap:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the requirements."*

Read `docs/03_Model_Specification.md` for the full domain rationale (why LoRA, why one base, why late fusion, why geographic splits) — that document argues the reasoning at length and this one does not repeat it. Read `docs/10_Decision_Record.md` for the dates and the settled decisions this plan builds on. This document is the step-by-step build sequence and the exact interface contract with the rest of the codebase, grounded in what actually exists on disk today, not in the aspirational layout §15 of the model specification proposes.

---

## 0. Reality check before you start

`docs/03_Model_Specification.md` §15 proposes a nested layout — `satquery/models/adapters/train_rs_vqa.py`, `satquery/pipeline/orchestrator.py`, a `configs/` directory, `docker-compose.yml`. **None of that exists.** The `cebd3d1` restructure flattened everything to one package with no subpackages:

```
satquery/
├── __init__.py       (41 lines)
├── cli.py             (190) — selftest / demo / eval / serve commands
├── cv.py               (412) — classical CV primitives: Otsu, Lee filter, NDWI, morphology
├── datasets.py         (275) — the dataset registry, with real (not aspirational) local state
├── evaluate.py         (355) — metrics + the A–E ablation
├── evidence.py         (210) — EvidenceSet, GeoBox — the normalised output schema
├── pipeline.py         (378) — Pipeline class: orchestration, the adapters= hook
├── raster.py           (419) — GeoTIFF/TIFF I/O — read() exists, works, is called by nothing
├── router.py           (255) — classify / validate / plan / registry
├── scene.py            (258) — synthetic scene generator
├── server.py           (358) — FastAPI + stdlib HTTP
├── specialists.py      (571) — VQA, Grounding, Change, Fusion classes — THE FILE YOU EDIT MOST
└── tests.py            (415) — 30 self-tests, `python -m satquery.cli selftest`
```

**Your new code goes into a new flat file, `satquery/adapters.py`** — not a `models/` subpackage. This matches the convention every other module already follows and keeps the diff a plain addition, per `BRANCHING.md`'s mechanics (though that file no longer governs this repo — see `docs/04_Documentation_Plan.md`'s historical note — the *reasoning* about additive diffs still applies).

Nothing in `specialists.py` or `pipeline.py` needs restructuring to receive your work. The hook is already built and waiting — see §7.

---

## 1. Scope for M1 — one component, not four

Per `docs/10_Decision_Record.md` §1 and §7 standing rule 5: **one adapted component satisfies requirement 1.** Resist widening to grounding, change, or fusion adapters before this one is finished and wired. M2–M4 are explicitly post-submission.

**Build the RS-adapted VQA component (M1 in `03_Model_Specification.md`'s numbering).** Two reasons this is the highest-leverage single choice, not just the first-listed one:

1. It satisfies §5.1 (adaptation) *and* strengthens §5.2 (VQA is already mandatory, classical-only today) — one piece of work, two requirement rows moved.
2. `docs/09_External_Review_And_Recommendation.md` confirms the classical VQA/Grounding/Change/Fusion specialists already measure well (grounding IoU 0.99, SAR F1 0.945) — the gap is specifically that none of them are adapted, not that they perform badly.

---

## 2. Base model — measure, don't assume

`ADR-010` is explicit: benchmark before choosing, because every adapter trains against whichever base you pick and reversing that choice later is the most expensive mistake available.

| Candidate | HF ID | Licence | Note |
|---|---|---|---|
| GeoChat | `MBZUAI/geochat-7B` | **Apache-2.0** — verified live by the external review | Already RS-adapted. Higher absolute score, **smaller gain to demonstrate** |
| Qwen2-VL-7B-Instruct | `Qwen/Qwen2-VL-7B-Instruct` | **Apache-2.0** | Generic. Lower absolute score, **larger gain to demonstrate** |

Both are already licence-cleared — no audit blocker either way (`OPEN-5` closes regardless of which you pick).

`docs/10_Decision_Record.md` §5 reasons that the generic base (Qwen2-VL) is favoured, because requirement 1 is evidenced by *the gain*, not the absolute score, and GeoChat's adaptation already happened before you touch it. **That is a reasoned prior, not a substitute for measurement.** Do this:

1. Load each candidate frozen (Kaggle, or wherever you'll train — no point benchmarking on hardware you won't train on).
2. Run zero-shot inference against **VRSBench's own test split** (§4 below — do not build a custom split for this).
3. Compute VQA accuracy for each.
4. Pick the one with room to show a gain. State which, and why, next to the numbers — this comparison is also a slide.

**Due 13 September — the real gate** (`10_Decision_Record.md` §8). This step needs no training and no GPU quota beyond a few hours of inference. If it slips past 13 Sep, everything downstream slips with it — escalate rather than pushing through silently.

---

## 3. Corpus — VRSBench, not BigEarthNet imagery

Settled in `10_Decision_Record.md` §4, for a concrete reason: `BigEarthNet.txt` on Hugging Face is 467 MB of *annotations*, keyed by `patch_id`/`s1_name`, into a **separate 155 GB imagery dataset**. That does not fit the schedule or the disk.

Use **VRSBench** instead — HF `xiang709/VRSBench`, 12.5 GB, CC-BY-4.0, 29,614 images, 123,221 VQA pairs. The PS permits this explicitly ("BigEarthNet.txt **or any open source training data**"), and VRSBench is one of the benchmarks the work is scored against anyway.

**VRSBench ships its own official train/test split. Use it unmodified.** `ADR-006` (geographic tile-level splitting, never random) is fully satisfied by using VRSBench's published split as-is — you do not need to build a custom geographic splitter for this corpus. That work only applies if you later train on raw BigEarthNet imagery (M2–M4, post-submission).

---

## 4. Training configuration

Base config from `03_Model_Specification.md` §4, with **one correction that costs a day if missed** (`10_Decision_Record.md` §6):

```yaml
model:
  base: Qwen/Qwen2-VL-7B-Instruct    # or your benchmarked winner — §2 above
  load_in_4bit: true                  # QLoRA
lora:
  r: 8
  alpha: 16
  dropout: 0.05
  target_modules: [q_proj, k_proj, v_proj, o_proj]
training:
  precision: fp16                     # NOT bf16 — Kaggle's P100/T4 don't support it
  gradient_checkpointing: true
  per_device_batch_size: 1
  gradient_accumulation_steps: 32     # effective batch 32
  learning_rate: 2e-4
  epochs: 3
  warmup_ratio: 0.03
data:
  source: xiang709/VRSBench
  split: official                     # use VRSBench's own split — see §3
```

**Two environment traps, both already identified in `10_Decision_Record.md` §6, both cost a day if discovered late:**

- **`bf16` silently fails on Kaggle.** P100 is Pascal, T4 is Turing — neither has bf16 support. Use `fp16`.
- **Kaggle sessions cap at 9 hours.** A ~16 GPU-hour run needs 2+ sessions. **Build checkpoint/resume before the first real training run, not after one dies at hour eight.** Use HF `Trainer` (or `trl`'s `SFTTrainer`) with `save_strategy` on a step interval and `resume_from_checkpoint=<path>` on restart — both are built into the library, don't hand-roll this. Persist checkpoints somewhere that survives a Kaggle session boundary (a Kaggle Dataset output, not just `/kaggle/working` if that gets wiped between sessions — verify this on day one).

**Checkpoint: 18 September** — training run complete, or clearly converging. If it's neither, the honest fallback is shipping the classical path with clear framing (`07_PRD.md` §7 already states this framing), not quietly degrading the target.

---

## 5. Evaluate — report the gain, not the absolute

Same VRSBench test split, same metric, both runs (zero-shot baseline from §2, adapted from §4).

| Metric | Target | Anchor |
|---|---|---|
| VQA accuracy (adapted) | **55–62%** | GeoChat fine-tuned 60.6%; GPT-4V 65.6% |
| **Gain (adapted − zero-shot)** | **+10 to +20 points** | GeoChat's published gain: 40.8% → 60.6% = +19.8 |

**Do not target above these.** 80% VQA is above GPT-4V; a target above the state of the art reads as a perceived failure even when the absolute number is good, and the predictable response is to keep training past the point of returns. `03_Model_Specification.md` §5 says it directly: *"Teams abandon this problem because they hit 40% and assume failure. They have not failed."*

**The evidence is the gain, not the score** (`10_Decision_Record.md` §2). A trained adapter with no zero-shot baseline beside it proves nothing about adaptation — this is why §2's benchmark step is not optional and not skippable under time pressure.

**Checkpoint: 22 September** — adapted number, stated gain, pack wired into the pipeline (§7).

---

## 6. The stub-adapter test — do this first, paired with Shreyash

`10_Decision_Record.md` §6: *"The `adapters=` path has never executed. Not once, in any call site."* `Pipeline(adapters=...)` is wired to accept a pack (`specialists.py:105` declares the flag, `pipeline.py:112` sets it), but nothing has ever exercised it.

**Before either of you goes off to build your own half, write a test together that constructs `Pipeline(adapters={"vqa": <stub>, ...})` with a fake object and asserts `.method == "neural+classical"`.** This costs an hour, needs no trained weights, and is the executable version of the interface contract in §7 below — agree the dict's key names *here*, in a passing test, not later by inspection of two divergent implementations.

This test belongs in `satquery/tests.py`, which Shreyash owns — but you should write the stub and the assertion together, because you're the one who knows what the real pack will look like.

---

## 7. The interface contract — the one seam with the backend

This is the only place your work and Shreyash's work touch. Keep the surface small.

**You own:** a new file, `satquery/adapters.py`, exposing one function:

```python
def load_adapter_pack(path: str | Path) -> dict[str, object]:
    """Load a trained LoRA pack from disk.

    Returns a dict keyed by the same model names specialists.py's
    Specialist.model field already uses — check specialists.py around
    line 105 for the exact strings before you pick your keys. Whatever
    you return here is passed straight through to Pipeline(adapters=...),
    unchanged, at every call site.
    """
```

**Shreyash owns:** the 13 existing `Pipeline(...)` call sites (`evaluate.py:326`, `cli.py:98`, `cli.py:105`, `server.py:133`, nine in `tests.py`) — each changes from `Pipeline()` to `Pipeline(adapters=load_adapter_pack(ADAPTER_PATH))` behind a config flag, so the classical demo path never breaks if the adapter isn't ready yet.

**Before you train anything**, grep `specialists.py` for how `.model` is currently set on the `VQA`/`Grounding`/`Change`/`Fusion` instances and match those exact string keys in your dict. A mismatch here is a silent no-op, not an error — `Specialist.method` will keep reporting `"classical"` and nobody will notice until someone asks why the adapter isn't doing anything.

**Deliverable alongside the weights:** a directory (suggested: `models/adapters/m1-vqa/`) with the standard PEFT save format (`adapter_config.json` + `adapter_model.safetensors` from `model.save_pretrained()`) plus a small manifest — base model id, corpus, zero-shot score, adapted score, gain, date measured, licence. That manifest is what fills in `models/MANIFEST.md`.

---

## 8. `models/MANIFEST.md` — stays empty until it's real

Standing rule 1 (`10_Decision_Record.md` §9): *"Report what was measured, never what was targeted."* Do not populate this file with target numbers or placeholders. Fill it in once, after §5's evaluation, with the actual measured pair (zero-shot, adapted) and the gain. An empty manifest is honest; a manifest with placeholder numbers is exactly the kind of claim `docs/09_External_Review_And_Recommendation.md` was written to catch.

---

## 9. Definition of done

- [ ] Zero-shot measured on **both** base candidates; base chosen, with the numbers stated
- [ ] VRSBench downloaded; **official split used unmodified**
- [ ] Training config uses `fp16`; checkpoint/resume verified across at least one real Kaggle session boundary
- [ ] Adapter trained, saved in standard PEFT format
- [ ] Adapted VQA accuracy measured on the same VRSBench test split used for the baseline
- [ ] Gain reported (adapted − zero-shot) alongside, not instead of, the absolute
- [ ] `satquery/adapters.py::load_adapter_pack()` written; key names confirmed against `specialists.py`
- [ ] Stub-adapter test (§6) passing, written jointly
- [ ] `models/MANIFEST.md` filled with real, dated, measured numbers
- [ ] Licence confirmed Apache-2.0 for the chosen base (already true for both candidates)

## 10. Explicitly not this plan

M2 (grounding adapter), M3 (change adapter), M4 (optical–SAR fusion adapter), RSVQA/CDVQA benchmark loaders, full BigEarthNet imagery. All deferred post-submission per `10_Decision_Record.md` §7. Do not start these before M1's checklist above is complete — widening scope before one adapted component is finished and wired is the specific failure mode standing rule 5 exists to prevent.

## 11. Read more

| Document | For |
|---|---|
| `docs/03_Model_Specification.md` §3–§9 | Full architectural rationale for M0–M6 |
| `docs/10_Decision_Record.md` | Dates, targets, standing rules — keep it current as things change |
| `docs/ADR/001-one-base-many-adapters.md` | Why one frozen base + swappable adapters |
| `docs/ADR/003-separate-sar-encoder.md` | Why SAR never goes through the shared base (M4, later) |
| `docs/ADR/006-geographic-splits.md` | Why splits matter, and why VRSBench's official split already satisfies this |
| `docs/ADR/010-base-model-by-benchmark.md` | The full reasoning behind §2 above |
| `docs/09_External_Review_And_Recommendation.md` §4, §5.1 | What was actually run and found against the current code |
