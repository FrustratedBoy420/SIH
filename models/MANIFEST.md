# Adapter manifest

Weights are not tracked in git — they are large and reproducible. This file is,
so a missing `.safetensors` is a re-run rather than a loss.

One row per pack, filled in when the pack is produced. **Do not add a row until
the numbers next to it have been measured.**

| Pack | Component | Base model | Corpus | Split | Zero-shot | Adapted | Gain | Trained |
|---|---|---|---|---|---|---|---|---|
| _(none yet)_ | M1 RS-VQA | — | — | — | — | — | — | — |

## Rules

1. **Record the zero-shot baseline before training.** Requirement 1 of the PS is
   evidenced by the *gain*; an adapted number with no baseline proves nothing.
2. **State the split.** Geographic or by source tile, never random over patches —
   see `docs/03_Model_Specification.md` section 10.
3. **Report what was measured**, not what was targeted. Published anchors for
   this task are GeoChat 60.6 % VQA and ~39.6 % grounding Acc@0.5; a result near
   those has matched peer-reviewed work.
