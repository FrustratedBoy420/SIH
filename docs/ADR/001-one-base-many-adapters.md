# ADR-001 — One frozen base VLM, three swappable LoRA adapters

**Status:** Accepted
**Date:** 2026-09-09

## Context

The problem statement mandates four task capabilities: single-image VQA, grounding, bi-temporal change analysis, and optical–SAR cross-modal extraction. It also mandates that at least one visual or vision-language component be fine-tuned or adapted.

The binding constraint is VRAM. The target training machine is a 24 GB card (RTX 3090/4090 class), with a 16 GB fallback on free Kaggle T4s. Inference at the finale happens on a laptop.

A 7B-parameter VLM occupies roughly 15 GB in bf16.

## Decision

Load **one** base VLM, frozen, and attach **three LoRA adapters** trained separately — remote-sensing general (BigEarthNet.txt), grounding (VRSBench), and change (CDVQA). Swap the active adapter at request time based on the router's task classification.

## Alternatives considered

**Four separately fine-tuned full models.** Rejected: roughly 60 GB of VRAM to hold them concurrently, four full fine-tuning runs instead of three LoRA runs, and ~60 GB of weights to move between machines. Unaffordable on the available hardware and unnecessary — the tasks share a visual domain.

**One model, multi-task fine-tuned on all three datasets at once.** Rejected for two reasons. Task interference: grounding and change VQA pull the same weights in different directions, and there is no cheap way to diagnose which task degraded which. And it destroys per-capability ablation — the A–E experiment needs each contribution isolated, which a single blended model cannot provide.

## Consequences

**+** Inference footprint is ~15 GB rather than ~60 GB, or ~6 GB quantised to 4-bit.
**+** Each adapter is 50–200 MB, so they move over a USB stick and swap in milliseconds.
**+** Each capability can be ablated independently, which is what the evaluation protocol requires.
**+** A failed adapter can be retrained without touching the others.

**−** Adapter swapping is an extra code path in `base.py` and a source of state bugs.
**−** All three tasks are locked to whatever architecture the base provides. A task needing a different visual backbone cannot be served this way — see ADR-003, which is exactly that case.

## Revisit if

A capability turns out to need an architecture the shared base cannot express, or if adapter swap latency measurably hurts the p95 target.
