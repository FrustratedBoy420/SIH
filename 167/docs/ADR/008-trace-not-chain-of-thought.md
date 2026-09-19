# ADR-008 — Show the execution trace, hide chain-of-thought

**Status:** Accepted — **forced by the problem statement**
**Date:** 2026-09-09

## Context

The problem statement is unusually specific about what is evaluated:

> *"The controller may perform internal task planning; however, only the observable execution trace, including the selected task, models or tools, permitted parameters, and outputs will be evaluated. Internal reasoning text is neither required nor evaluated."*

That is two instructions in one sentence: display the trace, and do not display reasoning.

## Decision

The interface shows a **factual audit log** — what was selected, what ran, with which parameters, producing what:

```
Execution summary
  ✓ Input validated       2 GeoTIFF, EPSG:4326, co-registration confirmed
  ✓ Task identified       change_analysis + change_localisation
  ✓ Tool selected         change_vqa (v1.3)
  ✓ Parameters            threshold=0.5, min_region_px=64
  ✓ Result                3 changed regions, 4.7 ha total
  ✓ Confidence            0.91
  ✓ Evidence              change_map.geojson
```

It never streams model reasoning.

## Alternatives considered

**Stream the chain-of-thought.** Rejected on three grounds:

1. **It is explicitly not scored.** The statement says so directly.
2. **It costs latency** on a demo path where a judge will not wait.
3. **It invites attack.** A visible reasoning chain gives a judge a surface to find a flaw in — one that has no bearing on the output that was actually produced. There is no upside and a real downside.

Many teams will stream reasoning because it looks impressive and is what consumer AI products do. That instinct is wrong here.

## Consequences

**+** Compliant with the clause that governs scoring.
**+** Lower latency on the demo path.
**+** "Auditable" in the sense the statement means it — a record of what happened, not a narration of what was considered.

**−** Looks less overtly "AI" to a non-technical viewer. Competing demos may appear flashier for the wrong reason.

## Revisit if

Never. This is a problem-statement clause, not a design preference.
