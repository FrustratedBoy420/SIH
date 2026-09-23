# ADR-010 — Base model chosen by benchmark, not reputation

**Status:** Accepted, 2026-09-18 — Qwen2-VL-7B-Instruct. It measured 0.527 zero-shot on VRSBench VQA; GeoChat did not load on a current transformers, which settled the choice (`models/MANIFEST.md`, "Measured runs")
**Date:** 2026-09-09

## Context

Several credible base VLMs exist for this domain:

| Candidate | Hugging Face ID |
|---|---|
| GeoChat | `MBZUAI/geochat-7B` |
| Qwen2-VL-7B | `Qwen/Qwen2-VL-7B-Instruct` |
| InternVL2-8B | `OpenGVLab/InternVL2-8B` |
| LLaVA-1.5-7B | `llava-hf/llava-1.5-7b-hf` |

GeoChat is the obvious pick by reputation — it is already remote-sensing adapted, it is the CVPR 2024 reference, and the VRSBench numbers everyone quotes are its numbers.

Reputation is not evidence, and the base model choice is the most expensive decision to reverse: every adapter is trained against it.

## Decision

Run **each candidate, zero-shot, against the VRSBench test split**. Record VQA accuracy and grounding Acc@0.5 for all of them. Pick the winner. Keep the table.

Check the licence of the winner before training anything — the deliverable is *"codes and models including test and demonstration"*, handed to a government agency, so a research-only licence is a problem worth discovering in week one rather than week ten.

## Alternatives considered

**Pick GeoChat by reputation and start immediately.** Tempting, and it may well be the right answer. Rejected because:

1. The comparison table is itself a **presentation asset** — it evidences that the choice was made rather than assumed, which is exactly the kind of rigour this panel rewards.
2. The licence check has to happen anyway.
3. It is one to two days of work against a three-month build, and it de-risks the least reversible decision in the project.

## Consequences

**+** The choice is evidence-based and defensible.
**+** Produces a slide that most competing teams will not have.
**+** Licence risk surfaces early.

**−** One to two days before adapter training can start.

## Revisit if

Time pressure makes the benchmark run impossible. In that case default to GeoChat, and **say in the write-up that it was chosen by reputation rather than measurement.** An honest shortcut is defensible; an unstated one is not.
