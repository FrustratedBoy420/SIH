# ADR-006 — Geographic tile-level splits, never random

**Status:** Accepted
**Date:** 2026-09-09

## Context

Satellite datasets are geographically structured. Adjacent image patches frequently come from the same satellite tile, the same city, the same acquisition pass — and sometimes physically overlap.

BigEarthNet.txt carries latitude, longitude and country per record, so the geography is available.

## Decision

Split train / validation / test **by geographic region at tile level**. No tile appears in more than one split. Where a benchmark publishes an official split, use the official split unmodified.

## Alternatives considered

**Random shuffle then split 80/10/10.** Rejected. With geographically structured data this reliably places the same region in both training and test, and sometimes places physically overlapping patches on both sides. The model then scores well because it has memorised the neighbourhood, and the reported accuracy measures nothing.

This is not a theoretical concern — it is the standard way remote-sensing results get quietly inflated, and RSVQA itself uses tile-level splitting specifically to avoid it.

## Consequences

**+** Reported numbers estimate generalisation, which is what matters given the hidden ISRO/SAC evaluation set is drawn from different sensors and different geography entirely.
**+** Honest, and defensible when questioned.

**−** Reported accuracy will be **lower** than a random split would produce on the same model. When comparing against published work, check how that work split its data before treating the comparison as fair.

## Revisit if

Never. A random split on this data is a methodological error, not a trade-off.
