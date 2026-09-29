# PS26080 — Regime-Aware Rainfall Post-Processing: Product Requirements

| | |
|---|---|
| **Problem statement** | SIH 2026 PS26080 — *Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts* |
| **Organisation** | Ministry of Earth Sciences (MoES) · National Centre for Medium Range Weather Forecasting (NCMRWF) |
| **Category / theme** | Software · Smart Automation |
| **Version** | 1.0, 29 Sep 2026 |
| **Portal deadline** | 30 Sep 2026 (idea deck, PDF only). Finale is a 36-hour build. |
| **Status** | Nothing is built yet. This document fixes what we build and how we judge it. |
| **Companions** | [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) (how) · [`PPT_TEAM_GUIDE.md`](PPT_TEAM_GUIDE.md) (deck) |

---

## 1. The problem

Weather models predict rainfall on a grid. Over India the errors are not the same everywhere or in every situation. The same model that is too wet during a monsoon break can be too dry during an active spell, and it usually under-predicts the heaviest rain on the Western Ghats. A single bias correction, one rule for the whole monsoon, averages these opposite errors together and fixes none of them properly.

The statement asks for a system that does it in two steps:

1. **Identify the prevailing weather regime** (active monsoon, break, depression or low, orographic, coastal, western disturbance).
2. **Apply the correction that suits that regime** to the raw model rainfall, with particular attention to heavy and very heavy rain.

The people who receive the result are forecasters at NCMRWF and IMD, state disaster management authorities and district administrations. They act on heavy-rain warnings, so an under-forecast of an extreme event is the costly failure.

## 2. Users

| User | What they need | What they do with it |
|---|---|---|
| **NCMRWF / IMD forecaster** | Corrected rainfall grid, the regime it was corrected under, and evidence the correction helps in that regime | Adjust guidance, issue district warnings |
| **State / district disaster officer** | A district table: expected rainfall, chance of exceeding IMD thresholds, plain-language regime | Pre-position teams, issue alerts |
| **Agromet advisory unit** | District rainfall by day, with uncertainty | Sowing and irrigation advice |
| **Evaluator (SIH judge)** | Measured skill against a named baseline, honest limits | Score the idea |

Primary user for design decisions: the forecaster. If the forecaster does not trust it, nobody downstream sees it.

## 3. What the statement requires

Five expected outcomes, taken from the statement. Each is one deliverable.

| ID | Statement's expected outcome | Our deliverable | Acceptance test |
|---|---|---|---|
| **D1** | Weather regime classifier: active, break, depression, coastal/orographic | Classifier that assigns a regime to every grid cell and day, from forecast fields only | Confusion matrix against rule-based labels on held-out seasons; macro-F1 and per-class recall reported |
| **D2** | Bias-corrected rainfall forecast, improved over raw NWP | Corrected 24-hour rainfall grid, Day 1 to Day 10 | Beats raw NWP on RMSE and on the heavy-rain scores in leave-one-monsoon-out validation, confidence interval excludes zero |
| **D3** | Heavy-rainfall probability above operational thresholds | Probability grid for each IMD threshold | Brier skill score above 0 against climatology; reliability diagram close to the diagonal |
| **D4** | District-level rainfall product: table or map | District choropleth and downloadable table (CSV, GeoJSON) | Every district of the domain has a value and a probability; totals reconcile with the grid |
| **D5** | Verification report: RMSE, ETS, CSI, POD, FAR, FSS | Auto-generated report with all six metrics, per regime, per lead, raw vs corrected | Report reproduces from one command; every number traces to a file |

The statement supplies its own yardstick. Success is a set of named numbers, so the product is judged on measurement more than on interface polish.

## 4. Goals and non-goals

### Goals

- **G1.** Show that regime-aware correction beats raw model output on real, held-out monsoon seasons, with the six named metrics.
- **G2.** Show whether regime-awareness adds anything over a single correction. This is the scientific claim in the title and we test it directly (ablation, section 9).
- **G3.** Improve heavy and very heavy rain specifically, where the operational cost of error is highest.
- **G4.** Give a forecaster an interface that explains each correction: which regime, which method, how much changed.
- **G5.** Run daily without hand-holding on public data, so the same system works on a live forecast.

### Non-goals

- Not a new weather model. We correct an existing forecast, we do not replace it.
- Not a nowcast (0-6 h). Scope is medium range, Day 1 to Day 10.
- Not a per-station or panchayat forecast. Resolution is grid and district.
- Not a claim on NCMRWF's own model output. NCUM and NEPS-G are not public. We validate on an open model and specify the adapter for theirs (TECHNICAL_SPEC section 12).
- Not temperature, wind or other variables. Rainfall only.

## 5. Scope

| Dimension | Decision | Why |
|---|---|---|
| Variable | 24-hour accumulated rainfall | The unit of IMD's warnings and thresholds |
| Domain | India land, box 5-40 N, 65-100 E, masked to land and districts | Matches the statement; same box as the other NCMRWF ideas so data code is shared |
| Season | Monsoon, June to September (JJAS) is the core. Western-disturbance regime uses October to May. | Statement centres on the monsoon but names western disturbances |
| Lead time | Day 1 to Day 10, 24-hour steps | Medium range, and the range open models cover |
| Raw forecast | ECMWF IFS HRES (2016-2022) from the public WeatherBench2 store | Only public physical model with 7 years and rainfall |
| Truth | CHIRPS 2.0 daily; IMD gridded rainfall if reachable | ERA5 rainfall is a model product, a poor truth for rain |
| Resolution | 1.5 degree for development, 0.25 degree for reported numbers | Speed while iterating, realism at the end |

## 6. Functional requirements

Priority: **M** must have, **S** should have, **C** could have.

### Regime classification

| ID | Requirement | Pri |
|---|---|---|
| FR-1 | Assign one **synoptic regime** per day and domain: active, break, depression/low, western disturbance, or neutral | M |
| FR-2 | Assign a **geographic modifier** per grid cell: orographic, coastal, or plain | M |
| FR-3 | Regime is derived from **forecast fields at valid time**, never from observed rainfall at valid time (this would leak the answer) | M |
| FR-4 | Labels for training come from independent rules on reanalysis (section 3 of the spec), documented and reproducible | M |
| FR-5 | Every output records the regime that produced it | M |
| FR-6 | Report classifier confidence; low confidence falls back to the parent (regime-blind) correction | S |

### Correction

| ID | Requirement | Pri |
|---|---|---|
| FR-7 | Regime-specific quantile mapping of forecast rainfall to observed rainfall, per lead time | M |
| FR-8 | Fallback ladder when a regime has too few samples: regime, then regime group, then all-regime | M |
| FR-9 | Corrected rainfall is non-negative, monotone in the raw rainfall, and preserves dry days | M |
| FR-10 | Baselines always computed alongside: raw NWP, and a single all-regime correction | M |
| FR-11 | Heavy-rainfall probability model for IMD thresholds (64.5, 115.6, 204.5 mm/day) and for local percentile thresholds | M |
| FR-12 | Probabilities calibrated (isotonic or Platt) on a separate calibration fold | S |

### Verification

| ID | Requirement | Pri |
|---|---|---|
| FR-13 | RMSE, ETS, CSI, POD, FAR and FSS computed per lead time, per regime, per threshold | M |
| FR-14 | FSS at several neighbourhood sizes | M |
| FR-15 | Brier score, Brier skill score, reliability diagram, frequency bias | M |
| FR-16 | Leave-one-monsoon-out cross-validation across 2016-2022 | M |
| FR-17 | Block-bootstrap confidence intervals (resample by week, not by grid cell) | M |
| FR-18 | One command regenerates the full report and every figure | M |

### Products and interface

| ID | Requirement | Pri |
|---|---|---|
| FR-19 | District choropleth for a chosen date and lead, with a regime badge | M |
| FR-20 | Raw vs corrected toggle (and a difference layer) | M |
| FR-21 | District table: raw mm, corrected mm, probability per threshold, regime, exportable as CSV | M |
| FR-22 | Skill scorecard: the six metrics, raw vs corrected, filter by regime and lead | M |
| FR-23 | Reliability diagram and per-regime error charts | S |
| FR-24 | Live mode: fetch the latest public forecast (GFS, IFS open data) and produce today's corrected map | S |
| FR-25 | Plain-language line per district, for example "Heavy rain likely (62%), active monsoon spell" | S |
| FR-26 | NCUM / NEPS-G input adapter, documented and tested on a GRIB2 sample | C |

## 7. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | **Reproducibility.** Fixed seeds, pinned dependencies, data version recorded per run | Same command gives identical report |
| NFR-2 | **No leakage.** Splits by monsoon season; regime labels and training never see the test season | Checked by an automated test |
| NFR-3 | **Honest labelling.** Every chart states its dataset, resolution, truth source and split | Enforced by a shared chart wrapper |
| NFR-4 | **Latency.** Map and table for a date and lead served from precomputed arrays | Under 1 second |
| NFR-5 | **Offline demo.** The finale bundle runs without network | Bundle of cached zarr and precomputed results |
| NFR-6 | **Cost.** Free tier only: Kaggle or Colab for training, free host for the API | Zero spend |
| NFR-7 | **Accessibility.** Colour scales readable by colour-blind users; rainfall uses a sequential scale, errors a diverging one | Checked in review |
| NFR-8 | **Boundaries.** District map uses an official depiction of India's borders | See risk R-9 |

## 8. Success metrics

Stated before any experiment, so we cannot move them afterwards. Baseline is raw HRES. Split is leave-one-monsoon-out over JJAS 2016-2022 (seven folds).

| Metric | Level | Pass | Stretch |
|---|---|---|---|
| Heavy-rain ETS, threshold 64.5 mm/day (or the local 95th percentile where 64.5 mm is too rare at the grid size) | Days 1-5 | Corrected above raw, 95% CI excludes 0 | Improvement holds in every fold |
| FSS at 64.5 mm/day, neighbourhood 100 km | Days 1-5 | Corrected above raw | Also above single-correction baseline |
| Frequency bias for heavy rain | Days 1-5 | Closer to 1 than raw | Within 0.8-1.2 |
| RMSE | All leads | Corrected below raw | Also below single-correction baseline |
| Brier skill score, heavy-rain probability | Days 1-5 | Above 0 vs climatology | Above raw-threshold baseline |
| Regime classifier macro-F1 | Held-out seasons | Above majority-class baseline by a clear margin | Reported per class with confusion matrix |
| **Regime-aware minus single correction**, heavy-rain ETS | Days 1-5 | Reported honestly, whichever sign | Positive with CI excluding 0 |

The last row is the important one. If regime-awareness does not beat a single correction, the correct claim is smaller: the corrected forecast and heavy-rain probability still improve on raw, and we say what regime-awareness explains rather than what it improves. See risk R-1.

Not claimed until measured: any percentage improvement, any comparison with NCMRWF's operational post-processing, any result on NCUM.

## 9. The experiment that decides the claim (ablation ladder)

| Rung | Method | What it isolates |
|---|---|---|
| L0 | Raw HRES | The baseline everything must beat |
| L1 | Per-cell, per-lead quantile mapping, all days pooled | What ordinary bias correction gives |
| L2 | **Regime-stratified** quantile mapping | What regime-awareness adds over L1 |
| L3 | L2 plus gradient-boosted heavy-rain probability | What machine learning adds for extremes |
| L4 | Oracle regimes (labels from observed rainfall) | Ceiling: how much a perfect classifier would give |

L4 is an upper bound and is never shown as a result. It tells us whether the classifier or the idea is the limiting factor.

## 10. Data

| Need | Source | Access | Status |
|---|---|---|---|
| Raw forecast | IFS HRES, WeatherBench2 `hres`, 2016-2022, 00/12 UTC, Day 0-10, has `total_precipitation_24hr` | Public zarr, no login | Metadata probed 29 Sep: rainfall present |
| Rain truth | CHIRPS 2.0 daily, 0.25 degree file `p25` | Open HTTPS (UCSB CHC) | HTTP 200 on a 2020 file, 29 Sep. Full download not yet done. |
| Better rain truth | IMD gridded 0.25 degree rainfall | IMD Pune | Not reachable from this machine on 29 Sep. Try from the college network. |
| Regime inputs | ERA5 (winds, geopotential, MSLP, vorticity) from WeatherBench2 | Public zarr | Reachable |
| Depression tracks | IBTrACS North Indian Ocean | NOAA, open | Not yet fetched. Check that depressions (not only cyclones) are present. |
| MJO index | Bureau of Meteorology RMM | Open text file | Not yet fetched |
| Districts | Boundary file for Indian districts | To be chosen | Licence and border depiction to check (R-9) |
| Live forecast | NOAA GFS, ECMWF open data | AWS open data | Reachable per 25 Sep check |
| NCUM, NEPS-G | NCMRWF | Not public | Adapter only |

## 11. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Regime-aware correction does not beat single correction | Medium | High for the title claim | Ablation ladder decides; we report the result as measured and lead with heavy-rain probability and the product |
| R-2 | CHIRPS underestimates heavy rain and hides real gains | Medium | High | Use IMD grid if reachable; otherwise state the limit on the slide and compare only relative changes |
| R-3 | Few heavy-rain days per regime per cell | High | Medium | Pool cells into regions; hierarchical fallback (FR-8); percentile thresholds; report sample sizes |
| R-4 | Regime labels from rules are themselves crude | High | Medium | Use standard published definitions; show sensitivity to the thresholds; do not over-claim classifier accuracy |
| R-5 | Leakage through regime or feature choice | Medium | Critical | NFR-2 test; classifier sees forecast fields only |
| R-6 | Time alignment of the rainfall day (UTC vs IMD's 03-03 UTC day) | Medium | Medium | Document the convention; test the shift on 2020 |
| R-7 | Only seven seasons of HRES | Certain | Medium | Leave-one-season-out; wide honest intervals; no year-by-year tuning |
| R-8 | Judges compare with operational NCMRWF post-processing we cannot see | Medium | Medium | Say so plainly; position as method plus open-data proof, with the NCUM adapter |
| R-9 | District boundary licence or border depiction problem | Medium | Medium | Choose a boundary file whose depiction matches the Survey of India; check before the finale |
| R-10 | Finale machine has no network | Medium | High | Offline bundle (NFR-5) |

## 12. Milestones

| When | Milestone |
|---|---|
| 29-30 Sep | Deck uploaded as PDF. One measured line on slide 4 (spec section 14). |
| Screening result | Freeze PRD and spec, assign owners |
| Before finale | Data cached, labels built, L0-L3 running, report generated once end to end |
| Finale hours 0-12 | Pipeline and metrics reproduced on the finale machine |
| Hours 12-28 | Interface, district product, live mode |
| Hours 28-36 | Rehearsal, offline bundle, judge questions |

Detailed plan: TECHNICAL_SPEC section 15.

## 13. Open questions

1. Slot choice: 26080 and 26081 share about 80 percent of their data pipeline. Confirm which slot each one fills and who owns which. (`081/` already exists from another teammate.)
2. Does IMD gridded rainfall download from the college network? It changes risk R-2.
3. Are IBTrACS depression tracks complete enough to serve as a cross-check for FR-4?
4. Which district boundary file, and is its depiction acceptable?
5. Owners for the four team members not named in the repo notes: interface, data pipeline, deck, verification.
