# PS26080 — Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts

MoES / NCMRWF · Software · Smart Automation · portal closes 30 September 2026.

Rainfall forecast errors over India change with the weather regime: active monsoon, break, depression, mountain and coastal rain. This idea first identifies the regime from the forecast, then applies a correction made for that regime, gives the chance of heavy rain against IMD's thresholds, and grades itself on monsoon seasons it never saw.

**State: design only. No code and no measured results yet.**

## What is here

```
PRD.md              what and why: users, requirements (FR/NFR), success tests, risks
TECHNICAL_SPEC.md   how: regimes, data pipeline, correction, probability, metrics, API, build plan
PPT_TEAM_GUIDE.md   for the deck team: plain-language primer, slide-by-slide text, rules, judge Q&A
```

Read order: the deck team reads `PPT_TEAM_GUIDE.md` only. Builders read `PRD.md`, then `TECHNICAL_SPEC.md`.

## Related

`081/` (hybrid AI-NWP blending) uses most of the same data. `extra/problem-statements/SLOT2_CANDIDATES.md` has the ranking and the open-data checks.
