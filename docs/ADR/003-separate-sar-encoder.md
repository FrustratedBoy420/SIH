# ADR-003 — SAR gets its own encoder

**Status:** Accepted
**Date:** 2026-09-09

## Context

The problem statement, §5.4, requires the system to *"extract complementary information from a co-registered optical/multispectral and SAR image pair."*

SAR and optical imagery are different physical measurements. Optical records reflected sunlight per wavelength band — colour and material. SAR emits its own radar pulse and records **backscatter** — how much energy returned, which encodes surface roughness, structure and geometry. Calm water is very dark because the pulse reflects away; buildings are very bright because corners reflect straight back.

SAR data is single-channel and conventionally displayed as greyscale, which makes a shortcut extremely tempting.

## Decision

SAR is processed by a **separate encoder** — a ResNet or small ViT trained on Sentinel-1 data — outside the shared base VLM of ADR-001. Its output enters the pipeline as its own evidence stream.

## Alternatives considered

**Convert SAR to a greyscale PNG and feed it to the optical encoder.** Rejected, and this is the decision the ADR exists to record, because it is what most competing teams will do.

A model trained on ordinary photographs interprets bright pixels as *bright things* rather than *high backscatter*. It has no prior for speckle, which has multiplicative rather than additive noise statistics. The result is a model that produces confident, fluent, wrong answers about radar imagery.

There is also a presentation dimension. The panel is ISRO. If a judge asks how SAR is handled and the honest answer is *"we saved it as a grey image"*, that is an unrecoverable moment. Conversely, explaining backscatter correctly is one of the cheapest ways to establish credibility with this specific audience.

**Published support:** RingMo-Agent uses separated embedding layers per modality specifically to reduce cross-modal interference across optical, SAR and infrared. The approach here is the same principle at smaller scale.

## Consequences

**+** Physically correct, and defensible under questioning.
**+** Keeps per-modality evidence separable, which ADR-005's late fusion depends on.

**−** Breaks the single-base elegance of ADR-001 — this is the one component that sits outside it.
**−** An additional model to train, evaluate and ship.

## Revisit if

A published unified multi-sensor encoder becomes usable within the timeline and benchmarks better than the separate path.
