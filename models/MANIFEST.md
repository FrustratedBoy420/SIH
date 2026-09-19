# Adapter manifest

Weights are not tracked in git — they are large and reproducible. This file is,
so a missing `.safetensors` is a re-run rather than a loss.

One row per pack, filled in when the pack is produced. **Do not add a row until
the numbers next to it have been measured.**

| Pack | Component | Base model | Corpus | Split | Zero-shot | Adapted | Gain | Trained |
|---|---|---|---|---|---|---|---|---|
| `qwen2vl_rs_vqa` | M1 RS-VQA | `Qwen/Qwen2-VL-7B-Instruct` | VRSBench | train → val, seed 0, n=2000 | 0.5270 | **0.6305** | **+0.1035** | 2026-09-19 |

---

## The result

```
zero-shot   0.5270
adapted     0.6305
            ──────
gain       +0.1035   (+10.35 points)
```

This is the evidence for requirement 1 of the problem statement. The absolute
score is not: a model reporting 0.6305 with no baseline beside it says nothing
about whether adaptation did anything.

Both numbers come from the same script, the same prompt, the same 2,000-item
subset and the same seed — `eval_baseline.py`, with and without `--adapter`.
Had either side used a different path, the difference between them would not be
the adaptation.

### Against the published anchors

| | VRSBench VQA |
|---|---|
| MiniGPT-v2 | 0.3710 |
| GeoChat zero-shot | 0.4080 |
| **this work, zero-shot** | **0.5270** |
| GeoChat fine-tuned | 0.6060 |
| **this work, adapted** | **0.6305** |
| GPT-4V | 0.6560 |

**Not an apples-to-apples comparison, and it should not be presented as one.**
The figures above are measured on a 2,000-item subset of `Annotations_val`;
the published GeoChat and GPT-4V numbers are on the full VRSBench test set. At
n=2,000 the 95 % interval on 0.6305 is roughly 0.609–0.652, which places the
published GeoChat fine-tuned figure at the lower edge. The defensible claim is
**"matches or exceeds the published GeoChat fine-tuned result on our subset"**,
not "beats it".

---

## Measured runs

| Date | Base | Adapter | n | Exact | Lenient | Latency p50 |
|---|---|---|---|---|---|---|
| 2026-09-18 | `Qwen/Qwen2-VL-7B-Instruct` | — | 2,000 | 0.5270 | 0.5355 | 0.70 s |
| 2026-09-19 | `Qwen/Qwen2-VL-7B-Instruct` | `qwen2vl_rs_vqa` | 2,000 | **0.6305** | 0.6335 | — |
| 2026-09-18 | `MBZUAI/geochat-7B` | — | — | did not load | — | — |

Both scored runs use `Annotations_val`, `--seed 0`, `--limit 2000`, 4-bit NF4
weights with fp16 compute, on a Kaggle T4. The predictions are kept as JSONL, so
every figure here can be recomputed from the rows rather than trusted.

**GeoChat could not be measured.** On transformers 5.18.0.dev0 the checkpoint
raises `ValueError: ... has model type 'geochat' but Transformers does not
recognize this architecture`. It declares `model_type: "geochat"` and ships no
`auto_map`, so `trust_remote_code` has nothing to load; the architecture lives
only in `github.com/mbzuai-oryx/GeoChat`, which pins transformers ~4.31 — a pin
that breaks Qwen2-VL. Recorded rather than worked around: a base an evaluator
cannot load is not a deliverable, and that settles the choice on its own.

---

## Per category — where the gain came from

| Category | n | Zero-shot | Adapted | Gain |
|---|---|---|---|---|
| object shape | 73 | 0.2740 | 0.5753 | **+0.3013** |
| image | 57 | 0.6491 | 0.9474 | **+0.2983** |
| object position | 299 | 0.3478 | 0.5217 | **+0.1739** |
| object size | 62 | 0.4194 | 0.5645 | +0.1451 |
| object category | 275 | 0.3127 | 0.4436 | **+0.1309** |
| scene type | 185 | 0.4757 | 0.5892 | +0.1135 |
| rural or urban | 13 | 0.9231 | 1.0000 | +0.0769 |
| object existence | 429 | 0.8578 | 0.9091 | +0.0513 |
| object quantity | 349 | 0.4814 | 0.5301 | +0.0487 |
| reasoning | 44 | 0.7273 | 0.7727 | +0.0454 |
| object direction | 24 | 0.3750 | 0.4167 | +0.0417 |
| object color | 190 | 0.5474 | 0.5842 | +0.0368 |

**The gain landed where the baseline error analysis said it would.** Before
training, the dominant failure was vocabulary rather than perception:
`ground-track-field` answered as *Stadium*, `small-vehicle` as *Car*,
`rectangular` as *Square*, image-relative `Top` answered as *North*. The three
weakest categories — shape, position, category — are the three that moved most.
Categories the base model already handled (existence 0.86, reasoning 0.73) moved
least, because there was less there to learn.

The model was not taught to see. It was taught the dataset's vocabulary, and
that is why 4,000 samples were enough to move the number ten points.

A second, smaller signal says the same thing: the gap between lenient and exact
scoring fell from 0.0085 to 0.0030. The adapted model answers more tersely —
adaptation transferred the answer *form* as well as its content.

---

## Training configuration

`models/train_rs_vqa.py`, rung 1 of the ladder in `models/README.md`.

| | |
|---|---|
| Corpus | VRSBench `Annotations_train/` — never `val`, which the score is measured on |
| Samples | 4,000, seeded shuffle (`--seed 0`) |
| Epochs | 1 |
| Method | QLoRA — 4-bit NF4 base, frozen |
| LoRA | r=8, alpha=16, dropout=0.05, on `q_proj`/`k_proj`/`v_proj`/`o_proj` |
| Trainable | 5,046,272 of 4,696,922,624 packed params — **0.107 %** |
| Optimiser | lr 2e-4, cosine, 3 % warmup, effective batch 32 (1 × 32 accumulation) |
| Precision | fp16 compute (Kaggle T4 has no bf16) |
| Hardware | one Kaggle T4, ~2.0 s per sample, 125 optimizer steps |

Exact configuration and wall time are written to `training_record.json` beside
the pack.

The run was interrupted by a session termination at roughly step 75 and resumed
from `checkpoint-75` with `--resume`; optimiser, scheduler and RNG state were
restored, so the completed run is equivalent to an uninterrupted one.

---

## Rules

1. **Record the zero-shot baseline before training.** Requirement 1 of the PS is
   evidenced by the *gain*; an adapted number with no baseline proves nothing.
2. **State the split.** Geographic or by source tile, never random over patches —
   see `docs/03_Model_Specification.md` section 10. These figures use VRSBench's
   own published train/val split with a fixed shuffle seed, so the subset is
   reproducible and is not a block of adjacent tiles.
3. **Report what was measured**, not what was targeted, and say when a comparison
   is not like-for-like — see the caveat under *Against the published anchors*.
4. **Quote the exact-match column.** The lenient figure is a diagnostic for
   verbosity and is never the reported accuracy.
5. **Keep the predictions.** Every number here is recomputable from the JSONL
   rows. A figure that can only be taken on trust is worth less than one a
   reader can check.
