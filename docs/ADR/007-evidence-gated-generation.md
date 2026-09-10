# ADR-007 — The language model phrases validated evidence only

**Status:** Accepted
**Date:** 2026-09-09

## Context

The problem statement requires *evidence-grounded* responses with confidence information and visual evidence, and states plainly:

> *"A generic LLM or VLM without remote-sensing adaptation will not satisfy the requirements."*

The dominant failure mode for a vision-language system is hallucination: a fluent, confident claim with nothing behind it. For a system intended for a space agency, a wrong building count stated confidently is worse than no answer.

## Decision

Vision models produce **structured facts**. Those facts pass an evidence validator (confidence threshold, geometry validity). Only then does a constrained generator turn them into a sentence.

**The language model never sees pixels.**

```
specialist vision model
        ↓
{"detected_objects": 14, "confidence": 0.93, "regions": [...]}
        ↓
evidence validator  →  fails  →  "I am not sufficiently confident to answer
        ↓  passes                 that from this imagery."
constrained generator
        ↓
"14 buildings were detected, concentrated in the north-eastern quadrant."
```

## Alternatives considered

**End-to-end VLM generation** — image and question in, answer out. Rejected: it produces no confidence that means anything, nothing to attach to the map, no way to abstain, and no audit trail. It is also the architecture the problem statement explicitly disqualifies.

## Consequences

**+** The count `14` came from a model that counted. The language layer could not have invented it, because it never had the image.
**+** Abstention becomes possible and meaningful — and a system that declines when uncertain is worth more to an operational user than one that always answers.
**+** Every claim traces to a model, a version and an evidence record.

**−** More moving parts than a single generation call.
**−** Answers are less fluent than free generation. This is the correct trade for this audience.

## Revisit if

Never. This is the architecture, not a detail of it.
