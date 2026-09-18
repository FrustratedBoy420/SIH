# Adapter manifest

Weights are not tracked in git — they are large and reproducible. This file is,
so a missing `.safetensors` is a re-run rather than a loss.

One row per pack, filled in when the pack is produced. **Do not add a row until
the numbers next to it have been measured.**

| Pack | Component | Base model | Corpus | Split | Zero-shot | Adapted | Gain | Trained |
|---|---|---|---|---|---|---|---|---|
| _(none yet)_ | M1 RS-VQA | `Qwen/Qwen2-VL-7B-Instruct` | VRSBench | `Annotations_val`, seed 0, n=2000 | **0.5270** | — | — | — |

## Measured baselines

Zero-shot, no adapter. Rule 1 below is why these are recorded before any
training run exists.

| Date | Base | n | Exact | Lenient | Latency p50 | Notes |
|---|---|---|---|---|---|---|
| 2026-09-18 | `Qwen/Qwen2-VL-7B-Instruct` | 2,000 | **0.5270** | 0.5355 | 0.70 s | 4-bit NF4, fp16 compute, T4. `--seed 0` |

**Per category** (same run):

| Category | n | Exact |
|---|---|---|
| object existence | 429 | 0.8578 |
| object quantity | 349 | 0.4814 |
| object position | 299 | 0.3478 |
| object category | 275 | 0.3127 |
| object color | 190 | 0.5474 |
| scene type | 185 | 0.4757 |
| object shape | 73 | 0.2740 |
| object size | 62 | 0.4194 |
| image | 57 | 0.6491 |
| reasoning | 44 | 0.7273 |
| object direction | 24 | 0.3750 |
| rural or urban | 13 | 0.9231 |

**What the errors are.** Inspected, not assumed. Only 0.9 % of items were
scored wrong while containing the gold answer, so the exact-match figure is not
an artefact of strict normalisation — 1,750 of 2,000 predictions are a single
word. The dominant failure is vocabulary, not perception: `ground-track-field`
answered as *Stadium*, `small-vehicle` as *Car*, `Harbors` as *Docks*, and
image-relative positions (`Top`) answered in compass terms (*North*). The model
is reading the scene and naming it in everyday English rather than in the
dataset's remote-sensing vocabulary.

That is the headroom adaptation is expected to take, and it is why the gain
should be read per category rather than only overall.

## Rules

1. **Record the zero-shot baseline before training.** Requirement 1 of the PS is
   evidenced by the *gain*; an adapted number with no baseline proves nothing.
2. **State the split.** Geographic or by source tile, never random over patches —
   see `docs/03_Model_Specification.md` section 10. The VRSBench figure above
   uses the published `Annotations_val` split with a fixed shuffle seed, so the
   2,000-item subset is reproducible and is not a block of adjacent tiles.
3. **Report what was measured**, not what was targeted. Published anchors for
   this task are GeoChat 60.6 % VQA and ~39.6 % grounding Acc@0.5; a result near
   those has matched peer-reviewed work.
4. **Quote the exact-match column.** The lenient figure is a diagnostic for
   verbosity and is never the reported accuracy.
