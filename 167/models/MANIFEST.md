# Adapter manifest

Weights are not tracked in git — they are large and reproducible. This file is,
so a missing `.safetensors` is a re-run rather than a loss.

One row per pack, filled in when the pack is produced. **Do not add a row until
the numbers next to it have been measured.**

| Pack | Component | Base model | Corpus | Split | Zero-shot | Adapted | Gain | Trained | Status |
|---|---|---|---|---|---|---|---|---|---|
| **`m1-rs-vqa-r2`** | M1 RS-VQA | `Qwen/Qwen2-VL-7B-Instruct` | VRSBench | train → val, seed 0, n=2000 | 0.5270 | **0.6600** | **+0.1330** | 2026-09-20 | **shipped** — `adapters/m1-rs-vqa/` |
| `qwen2vl_rs_vqa` (r1) | M1 RS-VQA | `Qwen/Qwen2-VL-7B-Instruct` | VRSBench | train → val, seed 0, n=2000 | 0.5270 | 0.6305 | +0.1035 | 2026-09-19 | superseded by r2 |

---

## The result

```
zero-shot   0.5270
adapted     0.6600    (m1-rs-vqa-r2, 12,000 training samples)
            ──────
gain       +0.1330    (+13.30 points)
```

This is the evidence for requirement 1 of the problem statement. The absolute
score is not: a model reporting 0.6600 with no baseline beside it says nothing
about whether adaptation did anything.

Every number here comes from the same script, the same prompt, the same
2,000-item subset and the same seed — `eval_baseline.py`, with and without
`--adapter`. Had either side used a different path, the difference between them
would not be the adaptation.

### The data ladder

`models/README.md` prescribes climbing in rungs and measuring each one rather
than training on everything at once. The two rungs climbed:

| Rung | Training samples | Adapted | Gain over zero-shot | Gain over previous rung |
|---|---|---|---|---|
| — | 0 (zero-shot) | 0.5270 | — | — |
| 1 | 4,000 | 0.6305 | +10.35 | +10.35 |
| 2 | 12,000 | **0.6600** | **+13.30** | +2.95 |

The first 4,000 samples bought ten points; the next 8,000 bought three. The
curve is still rising, and flattening. A third rung would cost another ~7 GPU
hours for an expected point or two, so the climb stops here for the
submission. That is a decision made from the curve, not a ceiling that was hit.

### Split integrity — counted, not assumed

Training reads `Annotations_train/`, evaluation reads `Annotations_val/` —
VRSBench's own published split, which `docs/03_Model_Specification.md` §10
requires. Because the adapted score came in above the published anchors, the
split was checked for leakage directly rather than trusted:

```
train 20,264   val 9,350   OVERLAP 0
```

No image used in training appears in the evaluation split.

### Against the published anchors

| | VRSBench VQA |
|---|---|
| MiniGPT-v2 | 0.3710 |
| GeoChat zero-shot | 0.4080 |
| **this work, zero-shot** | **0.5270** |
| GeoChat fine-tuned | 0.6060 |
| this work, rung 1 | 0.6305 |
| GPT-4V | 0.6560 |
| **this work, adapted (r2)** | **0.6600** |

**Not an apples-to-apples comparison, and it must not be presented as one.**
These figures are measured on a 2,000-item subset of `Annotations_val`; the
published numbers are on the full VRSBench test set. At n=2,000 the 95 %
interval on 0.6600 is roughly **0.639–0.681**, which contains GPT-4V's 0.6560.
The defensible claim is **"above the published GeoChat fine-tuned result and
level with GPT-4V, on our subset"** — not "beats GPT-4V".

---

## Measured runs

| Date | Base | Adapter | n | Exact | Lenient | Latency p50 |
|---|---|---|---|---|---|---|
| 2026-09-18 | `Qwen/Qwen2-VL-7B-Instruct` | — | 2,000 | 0.5270 | 0.5355 | 0.70 s |
| 2026-09-19 | `Qwen/Qwen2-VL-7B-Instruct` | r1 (4,000 samples) | 2,000 | 0.6305 | 0.6335 | — |
| 2026-09-22 | `Qwen/Qwen2-VL-7B-Instruct` | **r2 (12,000 samples)** | 2,000 | **0.6600** | 0.6630 | 0.9 s/item |
| 2026-09-18 | `MBZUAI/geochat-7B` | — | — | did not load | — | — |

All scored runs: `Annotations_val`, `--seed 0`, `--limit 2000`, 4-bit NF4
weights with fp16 compute, on a Kaggle T4.

**GeoChat could not be measured.** On transformers 5.18.0.dev0 the checkpoint
raises `ValueError: ... has model type 'geochat' but Transformers does not
recognize this architecture`. It declares `model_type: "geochat"` and ships no
`auto_map`, so `trust_remote_code` has nothing to load; the architecture lives
only in `github.com/mbzuai-oryx/GeoChat`, which pins transformers ~4.31 — a pin
that breaks Qwen2-VL. Recorded rather than worked around: a base an evaluator
cannot load is not a deliverable, and that settles the choice on its own.

### Evidence on disk

Rule 5 below: every figure here is recomputable from rows, not taken on trust.
What `models/results/` holds, each recomputed from its rows on 2026-09-23:

| File | Run | Rows | Recomputed |
|---|---|---|---|
| `zero_shot_predictions.jsonl` | zero-shot | 2,000 | 0.5270 |
| `rung1_adapted_predictions.jsonl` + `_summary.json` | r1 | 2,000 | 0.6305 |
| `rung2_adapted_predictions.jsonl` + `_summary.json` | **r2** | 2,000 | **0.6600** |

All three contain **the same 2,000 question ids**, so the comparison is paired:
each item was answered by both models.

### Paired significance

Because the items are identical, the gain can be tested item by item rather
than as a difference of two percentages (McNemar's test):

```
zero-shot wrong -> adapted right   359   fixed
zero-shot right -> adapted wrong    93   broken
right in both                      961

net +266 items = +13.30 points     chi2 = 155.4     p = 1.2e-35
```

The adapter breaks some answers — 93 of them — and fixes nearly four times as
many. Reporting both numbers, not only the net, is what makes the net credible.

A zero-shot copy of 1,690 rows also exists from an interrupted re-run on Kaggle.
Its 1,690 predictions are identical to the first 1,690 of the full run; it adds
nothing and is not used.

---

## Per category — where the gain came from

| Category | n | Zero-shot | r1 | **r2** | Gain (r2) |
|---|---|---|---|---|---|
| object existence | 429 | 0.8578 | 0.9091 | **0.9301** | +0.0723 |
| object quantity | 349 | 0.4814 | 0.5301 | **0.5616** | +0.0802 |
| object position | 299 | 0.3478 | 0.5217 | **0.5686** | **+0.2208** |
| object category | 275 | 0.3127 | 0.4436 | **0.5091** | **+0.1964** |
| object color | 190 | 0.5474 | 0.5842 | **0.6000** | +0.0526 |
| scene type | 185 | 0.4757 | 0.5892 | **0.6108** | +0.1351 |
| object shape | 73 | 0.2740 | 0.5753 | **0.6164** | **+0.3424** |
| object size | 62 | 0.4194 | 0.5645 | 0.5323 | +0.1129 |
| image | 57 | 0.6491 | 0.9474 | **0.9825** | +0.3334 |
| reasoning | 44 | 0.7273 | 0.7727 | 0.6818 | −0.0455 |
| object direction | 24 | 0.3750 | 0.4167 | **0.4583** | +0.0833 |
| rural or urban | 13 | 0.9231 | 1.0000 | 1.0000 | +0.0769 |

**The gain landed where the baseline error analysis said it would.** Before
training, the dominant failure was vocabulary rather than perception:
`ground-track-field` answered as *Stadium*, `small-vehicle` as *Car*,
`rectangular` as *Square*, image-relative `Top` answered as *North*. The three
weakest categories — shape, position, category — are the three that moved most.
The model was not taught to see. It was taught the dataset's vocabulary.

**Two categories fell between r1 and r2, and both are inside the noise.**
`reasoning` (n=44) moved 0.7727 → 0.6818 and `object size` (n=62) moved
0.5645 → 0.5323. At those sizes the 95 % interval on a single category is
roughly ±13 points, so neither movement is distinguishable from resampling.
Every category with n > 180 rose from r1 to r2. Stated here so the drop is read
as what it is, not discovered later and read as something worse.

---

## Training configuration

`models/train_rs_vqa.py`. Both rungs share everything except the sample count.

| | r1 | r2 (shipped) |
|---|---|---|
| Samples | 4,000 | **12,000** |
| Epochs | 1 | 1 |
| Optimizer steps | 125 | 375 |
| Speed (T4) | ~2.0 s / sample | ~2.2 s / sample |
| Wall time | ~2.2 h | ~7.4 h |
| Interruptions | session died near step 75, resumed | resumed near the end, from `checkpoint-370` |

| Common | |
|---|---|
| Corpus | VRSBench `Annotations_train/` — never `val`, which the score is measured on |
| Shuffle | seeded (`--seed 0`) |
| Method | QLoRA — 4-bit NF4 base, frozen |
| LoRA | r=8, alpha=16, dropout=0.05, on `q_proj`/`k_proj`/`v_proj`/`o_proj` |
| Trainable | 5,046,272 of 4,696,922,624 packed params — **0.107 %** |
| Optimiser | lr 2e-4, cosine, 3 % warmup, effective batch 32 (1 × 32 accumulation) |
| Precision | fp16 compute (Kaggle T4 has no bf16) |

Both runs were interrupted and resumed with `--resume`; optimiser, scheduler and
RNG state were restored from the checkpoint, so each completed run is
equivalent to an uninterrupted one. r2's `checkpoint-375/trainer_state.json`
records `global_step 375 = max_steps 375`.

**r2's `training_record.json` says `wall_hours: 0.11`, and that figure is
wrong.** The script started its clock when the process did, so a run resumed
five steps from the end recorded only those five steps. The record carries an
annotation with the verified step counts, and the script now records
`final_step`, `max_steps`, `completed` and `resumed_from_step` instead of a
single clock reading.

---

## The pack

```
models/adapters/m1-rs-vqa/
├── pack.json                  manifest — TRD §4.6, CON-03
├── adapter_config.json        PEFT
├── adapter_model.safetensors  PEFT, 20.2 MB — untracked, rebuildable
└── training_record.json       as written by the run, plus an annotation
```

- **Weights verified**: SHA-256 prefix `2ea5192277839e63`, identical to r2's
  `checkpoint-375` and different from `checkpoint-370` — the pack is the
  fully-trained adapter that scored 0.6600.
- **Licence**: base model `apache-2.0`, verified on the Hub model card
  2026-09-23. The deliverable is weights handed to a government agency; this
  is the check that makes that possible.
- **Revision**: `eed13092…` is the Hub head read on 2026-09-23. The training
  run did not pin a revision, so this is the one it most likely used, not one it
  recorded. Pin it for any re-run.

### Serving

Serve with `python -m satquery.cli serve --adapters models/adapters`. The pack
is wired into the pipeline (`satquery/pipeline.py`, `_adapted`) and served by
`satquery/runtime.py` in one of two modes:

| Mode | Needs | Behaviour |
|---|---|---|
| **live** | CUDA GPU (~6 GB), `torch`, `transformers`, `peft` | `M1Live` loads the base at the pinned revision plus this adapter, and answers with the prompt, processor and greedy decoding that `eval_baseline.py` measured 0.660 with |
| **pre-computed** | `precomputed.jsonl` beside `pack.json` | answers produced earlier by that same `M1Live` on Kaggle, keyed by a SHA-256 of the exact pixels M1 sees plus the normalised question |

To produce the pre-computed answers, on Kaggle:

```
python models/precompute_m1.py \
    --adapter-dir /kaggle/working/adapters/qwen2vl_rung2/adapter \
    --out /kaggle/working/precomputed.jsonl
```

then copy the file into `models/adapters/m1-rs-vqa/` and run
`python models/precompute_m1.py --check models/adapters/m1-rs-vqa/precomputed.jsonl`
on the laptop — it reports, without a GPU, which demo answers this machine will
find.

**State on 23 Sep:** no `precomputed.jsonl` yet, and the development laptop has
no GPU, so the pack is *installed but not serving* here. Every VQA result says
`engine: classical` and its trace says why. That is the correct report, not a
fault: the serving path is built and tested end to end with pre-computed packs
in `satquery/tests.py`; what is missing is one Kaggle run of the script above.

**Confidence.** M1's confidence is the geometric mean probability of the tokens
it generated. It is model-internal and not yet calibrated against outcomes
(audit B8); the evidence gate treats it like any other record's confidence.

**Before 23 Sep** a loaded pack counted as *available* whether or not anything
could run it, and staging this pack made results claim `neural+classical` on
answers citing a three-class Otsu split. `available()` now means *can serve*;
a check fails if a real pack without an inference path moves `engine` again.

---

## Rules

1. **Record the zero-shot baseline before training.** Requirement 1 of the PS is
   evidenced by the *gain*; an adapted number with no baseline proves nothing.
2. **State the split.** Geographic or by source tile, never random over patches —
   see `docs/03_Model_Specification.md` section 10. These figures use VRSBench's
   own published train/val split with a fixed shuffle seed, and the overlap
   between them has been counted: zero.
3. **Report what was measured**, not what was targeted, and say when a comparison
   is not like-for-like — see the caveat under *Against the published anchors*.
4. **Quote the exact-match column.** The lenient figure is a diagnostic for
   verbosity and is never the reported accuracy.
5. **Keep the predictions.** Every number here should be recomputable from the
   JSONL rows. A figure that can only be taken on trust is worth less than one a
   reader can check.
6. **A loaded pack is not a serving pack.** Nothing may report a neural path
   that did not run.
