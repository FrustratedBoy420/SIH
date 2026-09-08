# Architecture Decision Records

One file per decision that was **contested, non-obvious, or expensive to reverse**. Not a log of everything that was chosen — a record of the choices somebody will later ask about.

## Why these exist

A diagram shows the shape you ended up with. It cannot show the shapes you rejected, and for this project that is exactly where the credibility sits. When an ISRO judge asks *"why not just use GPT-4V?"*, a container diagram is silent and **ADR-007 answers in a paragraph**.

A design with no recorded rejections is usually a design nobody examined.

## Format

Every record has the same seven fields. Keep each to one page.

```
Title      ADR-NNN — a decision, stated as a decision
Status     Proposed | Accepted | Superseded by ADR-NNN
Date
Context    The forces. What made this a decision rather than a default
Decision   What was chosen, in one or two sentences
Alternatives considered   Each one, with WHY it was rejected
Consequences   + what this buys, − what it costs
Revisit if     The condition that would reopen this
```

The `Alternatives` and `Revisit if` fields are the ones that matter. A record without them is a description, not a decision.

## Index

| # | Decision | Status | Forced by |
|---|---|---|---|
| [001](001-one-base-many-adapters.md) | One frozen base VLM, three swappable LoRA adapters | Accepted | VRAM budget |
| [002](002-grounding-over-captioning.md) | Grounding, not captioning, as the second single-image task | Accepted | — |
| [003](003-separate-sar-encoder.md) | SAR gets its own encoder | Accepted | Sensor physics |
| [004](004-plain-python-router.md) | Plain Python router, not an agent framework | Accepted | — |
| [005](005-late-fusion-first.md) | Late fusion for optical–SAR | Accepted | — |
| [006](006-geographic-splits.md) | Geographic tile-level splits, never random | Accepted | Methodology |
| [007](007-evidence-gated-generation.md) | The language model phrases validated evidence only | Accepted | PS §Expected Solution |
| [008](008-trace-not-chain-of-thought.md) | Show the execution trace, hide chain-of-thought | Accepted | **PS clause** |
| [009](009-postgis.md) | PostgreSQL + PostGIS; rasters in object storage | Proposed | — |
| [010](010-base-model-by-benchmark.md) | Base model chosen by benchmark, not reputation | Proposed | — |

**Status caveat.** These were argued in `../01_Complete_Deep_Analysis.md` and `../03_Model_Specification.md` and lifted here into the fixed format. `Accepted` means the reasoning is settled and nobody has objected — not that the team has formally ratified it. Read them; change any you disagree with rather than working around it.

## Superseding

Never edit an accepted ADR to change its decision. Write a new one, set the old one to `Superseded by ADR-NNN`, and leave the original text intact. The history is the point.
