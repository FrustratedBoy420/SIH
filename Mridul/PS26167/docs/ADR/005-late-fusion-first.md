# ADR-005 — Late fusion for optical–SAR

**Status:** Accepted
**Date:** 2026-09-09

## Context

Given a separate SAR encoder (ADR-003), the two modalities must be combined. Three strategies are available, in increasing order of sophistication and cost:

1. **Late fusion** — run each modality independently, combine the conclusions
2. **Feature-level fusion** — concatenate or cross-attend the feature maps before the prediction head
3. **Cross-modal attention** — a jointly trained model attending across both

## Decision

**Late fusion**, for the first implementation. Each modality produces its own evidence record; the fusion layer combines conclusions and reconciles disagreement.

## Alternatives considered

**Feature-level fusion.** Stronger in principle, but requires joint training of both encoders and destroys the property that makes late fusion valuable here — separability. Once features are concatenated there is no longer an "optical said X" to show.

**Cross-modal attention.** Strongest and most expensive. Out of scope for the timeline, and it compounds the same separability problem.

## Consequences

**+** Per-modality evidence stays separable, which is precisely what the cross-modal ablation needs:

```
Optical only     XX.X
SAR only         XX.X
Optical + SAR    XX.X   ← must exceed both, or fusion is doing nothing
```

Requirement 5.4 asks for *complementary* information. That table is the proof, and it is only constructible under late fusion.

**+** Explainable on stage: *"optical said this, SAR said that, here is how they combined."*
**+** Conflict handling becomes possible and honest. When the modalities disagree, report the disagreement and lower confidence rather than silently picking one. *"Optical suggests vegetation, SAR suggests a hard structure — confidence reduced"* is more trustworthy than a confident guess.

**−** Likely a lower accuracy ceiling than learned fusion.

## Revisit if

The cross-modal ablation shows fusion adding less than about 2 points over the better single modality. At that point either the fusion rule is too naive and feature-level fusion is worth the cost, or the SAR encoder is underperforming and that is the real problem.
