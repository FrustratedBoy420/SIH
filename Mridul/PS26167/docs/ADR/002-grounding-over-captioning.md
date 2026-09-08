# ADR-002 — Grounding, not captioning, as the second single-image task

**Status:** Accepted
**Date:** 2026-09-09

## Context

The problem statement, §5.2:

> *"Visual question answering shall be mandatory. Each solution must additionally implement either captioning/scene description or text-guided region grounding."*

VQA is compulsory. The second task is a genuine choice, and it is the only place in the mandatory scope where the statement offers one.

## Decision

Implement **text-guided region grounding**. Do not implement captioning.

## Alternatives considered

**Captioning / scene description.** Rejected on three grounds, in order of weight:

1. **A judge cannot verify it quickly.** A box is either around the right thing or it is not — one second, no interpretation. A caption has to be read, then judged against what the reader believes the image shows. In a five-minute demo that difference is decisive.
2. **It produces nothing the rest of the system can use.** A grounding box converts through the GeoTIFF geotransform into latitude and longitude, which feeds the map overlay, the GeoJSON export and the evidence layer. A caption is text with nothing to attach it to.
3. **It is scored with weak metrics.** Captioning is measured with BLEU, CIDEr and ROUGE, which measure word overlap rather than correctness, and which technically literate judges rightly distrust. Grounding is measured with IoU — an objective geometric quantity.

## Consequences

**+** Objective metric: Acc@0.5 and mAP@0.5.
**+** Feeds the evidence layer and the map directly, so it does double duty.
**+** Instantly verifiable on stage.

**−** Grounding is genuinely hard, and the published ceiling is low. GeoChat reaches **39.6%** Acc@0.5 overall on VRSBench; fine-tuned, **55.1%** on unique objects but only **28.5%** on non-unique ones. Absolute numbers will look poor to anyone who has not seen the baselines.

**Mitigation for that last point:** never report grounding accuracy without the published anchor beside it. "39.6% is state of the art on this benchmark" turns a weak-looking number into a competitive one.

## Revisit if

Nothing plausible. This is settled.
