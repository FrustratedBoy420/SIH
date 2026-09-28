# PS26081 — Hybrid AI–NWP Multi-Model Forecast Blending System

**Workflow documentation and slide-by-slide deck guide.** Written 28 Sep 2026.
Portal deadline: **30 Sep 2026** (idea deck, PDF only).

Organisation: Ministry of Earth Sciences (MoES) · Department: NCMRWF · Category: Software · Theme: Miscellaneous.

Everything below was collected from:

| Source | What it gave |
|---|---|
| `extra/reference/sih_2026_problem_statements.json` | The official statement text (verbatim in §1) |
| `SLOT2_CANDIDATES.md` (root, 25 Sep) | Why 26081 is the slot-2 pick, 11 submissions, first design and risks |
| `extra/problem-statements/shortlist_ranked.md` | Earlier ranking; notes 26079/26080/26081 share ~80 % of the data pipeline |
| `extra/templates-and-examples/SIH2026-IDEA-Presentation-Format.pptx` | The mandatory 6-slide structure (§9) |
| Live probe of `gs://weatherbench2` (28 Sep) | Which models have which variables, years and lead times (§3). **This changes the plan — read §3.** |
| Web: IMD MME papers, public GitHub repos for PS 26081 | Prior work the judges know, and what rival teams are pitching (§6) |

**No code for 26081 exists in the repo yet.** This document is the plan.

---

## 1. The problem statement (verbatim)

> Different forecasting systems perform differently depending on region, season, lead time and weather
> situation. Physical NWP models, ensemble forecasts and AI/ML weather models may each have strengths under
> different conditions. Therefore, there is a need for an intelligent blending system that can dynamically
> combine multiple forecasts.
>
> The challenge is to develop a hybrid AI–NWP blending framework that assigns adaptive weights to different
> forecast sources based on historical skill, forecast lead time, region, season and weather regime. The final
> product should provide an optimized forecast for rainfall, temperature, wind and extreme weather indicators.

**Expected outcomes → how we meet each one**

| # | Expected outcome (PS) | Our deliverable | Where in the workflow |
|---|---|---|---|
| 1 | Dynamically blended forecast | Blended fields for 24 h rain, 2 m temperature, 10 m wind, MSLP, Day 1–10 | Stages 5–6 |
| 2 | Model weight maps | Per-cell, per-lead, per-regime weight maps + "which model wins here" map | Stage 9 |
| 3 | Improved forecast skill | Blended vs best single model, RMSE / bias / ACC; rain CSI, ETS, FSS | Stage 8 |
| 4 | Extreme weather guidance | Heavy-rain, heat-wave, high-wind exceedance probabilities with POD/FAR/CSI | Stage 7 |
| 5 | Operational workflow | Daily scheduled script → dashboard bundle; NCUM/NEPS-G adapter | Stages 10–12 |

The five adaptive-weight conditions named in the PS are **historical skill, lead time, region, season,
weather regime**. Every one must be visible in the design. Regime is the one most teams will drop — keep it.

---

## 2. Fixed vs flexible — read this before changing anything

| Fixed (set by the PS or the template — do not change) | Flexible (our choice) |
|---|---|
| Must blend **multiple** sources incl. at least one physical NWP and one AI model | Which specific models |
| Weights must adapt to skill, lead time, region, season, regime | How weights are computed |
| Output must cover rainfall, temperature, wind, extremes | Resolution, domain, lead range |
| Must beat individual models | Which metrics headline the deck |
| Weight maps are a named deliverable | How they are drawn |
| Deck: 6 slides incl. title, template headings unchanged, PDF upload | Visuals, wording, layout inside each slide |

---

## 3. Data — what actually exists (verified 28 Sep 2026)

Probed each store's `.zmetadata` in the public WeatherBench2 bucket. No login needed.

| Source | Type | Years in WB2 | Leads | Rain? | T2m / wind / MSLP |
|---|---|---|---|---|---|
| **IFS HRES** (`hres/2016-2022-0012-*`) | Physical NWP | 2016–2022, 00/12 UTC | 0–240 h, 6 h step (41) | **yes** (6 h, 24 h) | yes |
| **GraphCast** (`graphcast_v2/{2018,2020,2022}-*`) | AI | 2018, 2020, 2022 only | 6–240 h (40) | **yes** (6 h, 24 h) | yes |
| **Pangu-Weather** (`pangu/2018-2022_*`) | AI | 2018–2022 | 6–240 h (40) | **no** | yes |
| **FuXi** (`fuxi/2020-*`) | AI | 2020 only | to 15 days (60) | **yes** | yes |
| **GenCast mean** (`gencast/2020-*_mean`) | AI ensemble | 2020 only | 12 h–15 days (30) | **yes** (12 h, 24 h) | yes |
| **Aurora** (`aurora/2022-*`) | AI | 2022 only | 40 | **no** | yes |
| **NeuralGCM** (`neuralgcm_deterministic/2020-*`) | Hybrid AI–physics | 2020 only | 31 | no (only P − E) | wind/T on levels only |
| **IFS ENS** (`ifs_ens`, `ens/*`) | Ensemble NWP | 2018–2022 | — | check before use | yes |
| **ERA5** (`era5/1959-2022-6h-*`) | Truth (reanalysis) | 1959–2022 | — | yes, but weak truth for rain | yes |

Other truth / live sources (from `SLOT2_CANDIDATES.md`, confirmed reachable 25 Sep):
CHIRPS 2.0 daily 5 km (rain truth), NOAA GFS on AWS (live), ECMWF open data IFS + AIFS on AWS (live).
Not available: **NCUM, NEPS-G** (NCMRWF's own models), IMD gridded rain (unconfirmed from our network), IMERG (needs login).

### What this means (the three consequences that shape everything)

1. **Rainfall blending has only four sources: HRES, GraphCast, FuXi, GenCast.** Pangu, Aurora and
   NeuralGCM can only be blended for temperature, wind and pressure. Do not draw a rainfall weight map with
   Pangu on it.
2. **2020 is the only year where every model overlaps.** Full-set training and testing must happen *inside*
   2020 (blocked cross-validation by month or by 10-day block, never random days). The **HRES + GraphCast +
   Pangu** set has three years (2018, 2020, 2022) and supports true leave-one-year-out — use that trio for the
   headline skill number.
3. **Common lead grid is 24 h → 240 h in 24 h steps** (Day 1–10). FuXi and GenCast go to Day 15, but no one
   else does, so Day 11–15 is out of scope.

---

## 4. End-to-end workflow

```
 ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐
 │ 1 Ingest │──▶│2 Harmonise │──▶│ 3 Truth  │──▶│4 Regimes │──▶│5 Skill memory│
 └──────────┘   └────────────┘   └──────────┘   └──────────┘   └──────┬───────┘
                                                                     ▼
 ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐
 │12 NCUM   │◀──│11 Dashboard│◀──│10 Daily  │◀──│9 Products│◀──│6 Weighting   │
 │ adapter  │   │            │   │  run     │   │ + maps   │   │7 Extremes    │
 └──────────┘   └────────────┘   └──────────┘   └──────────┘   │8 Verify      │
                                                               └──────────────┘
```

### Stage 0 — Scope (decide once, write down)

| Choice | Default | Why |
|---|---|---|
| Domain | India box 5–40° N, 65–100° E | Covers mainland, Bay of Bengal, Arabian Sea |
| Grid | 1.5° (`240x121` stores) for development; 0.25° (`1440x721`) for the final run | 1.5° loads in minutes on a laptop; 0.25° is ~36× more data |
| Variables | `total_precipitation_24hr`, `2m_temperature`, `10m_wind_speed`, `mean_sea_level_pressure` | The three the PS names (rain, temp, wind) + MSLP for regimes |
| Leads | Day 1–10 at 24 h | Common to all models (§3) |
| Inits | 00 UTC | Every model has it; halves the data |

### Stage 1 — Ingest

- `xarray.open_zarr("gs://weatherbench2/datasets/...", storage_options={"token": "anon"})`, subset to the India
  box, the four variables and the 10 leads, write a local zarr cache per model.
- One loader per source behind the same interface: `load(model, var, init_range) -> DataArray[init, lead, lat, lon]`.
  This interface is what later lets NCUM plug in (Stage 12).

### Stage 2 — Harmonise

- Same grid (conservative regrid where grids differ), same `init × lead` coordinates, same units
  (precipitation m → mm; temperature K → °C only at display time).
- Precipitation: use each model's own 24 h accumulation; FuXi has `total_precipitation_24hr_from_6hr`,
  GenCast has 12 h and 24 h. Check the accumulation window ends at the valid time for every model.
- Naming differs between stores (`lat/lon` vs `latitude/longitude`, `lead_time_secs`) — normalise in the loader.

### Stage 3 — Truth

| Variable | Truth | Note |
|---|---|---|
| T2m, 10 m wind, MSLP | ERA5 | WB2 standard. ERA5 is built on IFS, so it slightly favours HRES — say so. |
| 24 h rain | **CHIRPS** (land only), IMD gridded if it downloads | ERA5 rain is a model product, a poor truth for monsoon rain. CHIRPS has no ocean — rain skill is land-only. |

### Stage 4 — Regime labels

Keep it simple and explainable; judges are meteorologists.

| Label | Rule |
|---|---|
| Season | JF / MAM / JJAS / OND |
| Monsoon active / break / normal (JJAS) | Core-monsoon-zone area-mean rain anomaly (standard active/break definition) from truth |
| Depression / low present | MSLP minimum below a threshold over Bay of Bengal / land, from ERA5 |
| Western disturbance (DJF–MAM) | 500 hPa trough over NW India (ERA5 geopotential anomaly) |
| Heat regime (MAM) | Regional T2m anomaly > +1 σ |

Optional upgrade: k-means on ERA5 850 hPa wind + MSLP anomalies, then name clusters by hand. Only if the
rule-based labels are too coarse.

**Important:** at forecast time the regime of the *valid* day is unknown. Use the regime at *initialisation*
(known) or the regime the **models themselves predict** for the valid day. Using the true future regime is
leakage.

### Stage 5 — Skill memory

For every cell × lead × variable × season × regime × model: running MSE and bias over the training window.
Smooth across neighbouring cells (e.g. 3×3) so sparse regime bins do not give noisy weights.

### Stage 6 — Weighting ladder (each rung must beat the one below or it is not shipped)

| Rung | Method | What it shows |
|---|---|---|
| B0 | Best single model per variable | The bar to beat |
| B1 | Equal-weight mean of bias-corrected models | Classic multi-model mean |
| B2 | Inverse-MSE weights per cell × lead (static) | = IMD MME idea (grid-wise weights from past skill) |
| B3 | B2 + season + regime conditioning | **Our core claim** |
| B4 | B3 with exponentially decaying recent skill (online update) | "Dynamic" in the PS |
| B5 (optional) | Gradient-boosted / ridge stacking with lead, season, regime, model spread as features; weights constrained ≥ 0, sum 1 | Only if it beats B4 out of sample |

Every model is bias-corrected (mean bias per cell × lead × season) before weighting.

### Stage 7 — Extremes

Averaging smooths peaks: a blended rain field will under-forecast heavy rain. So extremes are **not** read off
the blended mean.

| Indicator | Threshold | How |
|---|---|---|
| Heavy rain | ≥ 64.5 mm / 24 h (IMD "heavy"); ≥ 115.6 very heavy; ≥ 204.5 extremely heavy | Weighted fraction of models exceeding, calibrated on training years |
| Heat wave | IMD criterion (≥ 40 °C plains and departure ≥ 4.5 °C, or ≥ 45 °C) | Exceedance probability of T2m (daily-max proxy — see §5) |
| High wind | 10 m wind ≥ our chosen threshold (e.g. 15 m/s); state it on the slide | Exceedance probability |

Verify with POD, FAR, CSI, ETS and FSS (FSS at 1, 3, 5 cell neighbourhoods).

### Stage 8 — Verification

- Split: **leave-one-year-out** for HRES + GraphCast + Pangu (2018 / 2020 / 2022). **Blocked months** inside 2020
  for the full five-model set. Never random days (neighbouring days are correlated → fake skill).
- Metrics: RMSE, bias, ACC per variable and lead; rain: CSI, ETS, POD, FAR, FSS; skill score vs B0 and vs B1.
- Significance: paired bootstrap over days (or Diebold–Mariano) on the RMSE difference. Report the CI.
- Report per region and per regime, not only an India-wide number — that is what shows the weights earn their keep.

### Stage 9 — Products

- Blended fields per variable × lead.
- **Weight maps:** one panel per model per lead; plus a "dominant model" map (categorical colour per model).
  Animate over Day 1–10. This is the most visual deliverable.
- Skill scorecard: rows = variables × leads, columns = models + blend, green where the blend wins.
- Extreme guidance: exceedance-probability maps + district roll-up.

### Stage 10 — Daily operational run

```
cron 06:00 IST → fetch latest GFS (NOAA AWS) + ECMWF IFS & AIFS open data
             → regrid to our grid → apply stored weights (by cell, lead, season, today's regime)
             → write blended NetCDF + PNG / GeoJSON tiles + scorecard JSON → dashboard reads bundle
```

**Catch:** the live models (GFS, IFS open data, AIFS) are *not* the models the weights were learned on
(HRES, GraphCast, Pangu, FuXi, GenCast). IFS open data ≈ HRES, so its weights transfer; GFS and AIFS have no
history in WB2. Either learn their weights from a short live archive we collect, or start them at equal weight and
update online (rung B4). Say this plainly.

### Stage 11 — Dashboard

Reuse the SatQuery stack (FastAPI + React + MapLibre, Field Atlas design system) so slot 2 does not split the
team. Panels: map with variable/lead slider, weight-map toggle, dominant-model map, scorecard, extremes, region
click → "why this weight" card (skill history for that cell and regime).

### Stage 12 — NCUM / NEPS-G adapter

A documented loader for NCMRWF's GRIB/NetCDF output that implements the Stage 1 interface. We cannot test it on
real NCUM data; we test it on GFS GRIB, which has the same shape. Say "adapter ready, needs NCMRWF data".

---

## 5. Things that are easy to get wrong (known traps)

| Trap | Consequence | Guard |
|---|---|---|
| Random-day train/test split | Inflated skill that collapses on new data | Year or block split only |
| Verifying rain against ERA5 | Rewards models that look like ERA5, not reality | CHIRPS / IMD for rain |
| Using the valid-day regime | Leakage | Init-time or forecast regime |
| Taking extremes from the blended mean | Heavy rain under-forecast | Exceedance probabilities |
| WB2 T2m is instantaneous 00/12 UTC, not daily max | Heat-wave criterion is on Tmax | Say "proxy"; calibrate threshold on truth at the same hour |
| Few samples per regime bin | Noisy weight maps | Spatial smoothing + shrink toward season weights |
| Blend "wins" only because of bias correction | Credit goes to the wrong thing | Report B1 (bias-corrected mean) separately |

---

## 6. Competition and prior work (what judges already know)

- **IMD has run a multi-model ensemble (MME) since 2008** for district-level rainfall: ECMWF, JMA, GFS, UKMO with
  grid-wise weights from past skill ([Roy Bhowmik & Durai, J. Earth Syst. Sci.](https://link.springer.com/article/10.1007/s12040-011-0013-5);
  [Meteorol. Atmos. Phys. 2014](https://link.springer.com/article/10.1007/s00703-014-0334-4)).
  → "Weights by past skill" alone is **not novel** to NCMRWF. Our novelty must be: AI models in the mix,
  regime-conditioned weights, dynamic online update, and extremes handled separately. Cite MME as the baseline
  we extend — never pretend it does not exist.
- **Rival teams already have public repos for PS 26081**, e.g. AtmosArbiter (U-Net + cross-attention + physics gate,
  GFS + IMD) and AtmosFusion (GFS/ECMWF/NCUM/WRF + GraphCast/AIFS, cell-by-cell weights). Both state *targets*
  (e.g. "RMSE improvement ≥ 15–20 %") rather than measured results.
  → Our edge: **one real, measured, honestly sized number** against a named baseline, and a design a
  meteorologist can audit. Do not compete on architecture complexity.

---

## 7. What can change vs what will hurt us

### Safe to change (low cost, decide freely)

| Item | Options | Cost of changing |
|---|---|---|
| Grid resolution | 1.5° ↔ 0.25° | Re-run only; code unchanged |
| Domain box | India / South Asia | Re-run |
| Colour scheme, dashboard layout, slide visuals | anything | None |
| Adding T/wind-only models (Pangu, Aurora) | yes | Small — loader + one line |
| High-wind threshold | any stated value | None, if stated on the slide |
| Stacking model (B5) | GBM ↔ ridge ↔ none | Optional rung; drop without harm |
| Project name | anything | Title slide only |
| Deck wording, order of bullets inside a slide | anything | None |

### Risky to change (will cause difficulty)

| Item | Why it hurts | What to do instead |
|---|---|---|
| **Promising rainfall weight maps for Pangu / Aurora / NeuralGCM** | They have no precipitation in WB2 | Rain set = HRES, GraphCast, FuXi, GenCast |
| **Promising NCUM / NEPS-G results** | Not public; NCMRWF data only at the finale, if at all | Show the adapter, not numbers |
| **Promising a big headline gain ("20–30 % better")** | Honest blending gains are usually a few % RMSE; meteorologist judges know this | Promise "beats best single model, measured, with CI"; lead with maps, regimes and extremes |
| **Multi-year training for the full model set** | Only 2020 has all models | Trio (HRES/GraphCast/Pangu) for LOYO; full set within 2020 |
| **Switching to a deep blending net (U-Net etc.)** | Too little overlapping data to train; unexplainable weights; 36 h build risk | Keep the weighting ladder; deep net only as "future work" |
| **Changing the verification split late** | All numbers on the deck become invalid | Fix the split on day 1 |
| **Dropping the regime condition** | It is one of the five named conditions in the PS | Keep at least season + monsoon active/break |
| **Live demo with models that have no history (GFS, AIFS)** | Weights not learned for them | Equal start + online update; label it on screen |
| **Swapping to PS26079 or 26080 after the deck is in** | Idea is registered per PS | Decide before 30 Sep; the data pipeline is shared, the deck is not |
| **Claiming district-level rain skill** | Models are 0.25° at best | Show a district *roll-up* of the gridded product, not district skill |

---

## 8. Team split and timeline

| When | Who | What |
|---|---|---|
| 28 Sep | Mridul | 1.5° run: HRES + GraphCast + Pangu, T2m + 10 m wind, 2018/2020/2022, LOYO, rungs B0–B2. This gives the one measured number for slide 4. |
| 28–29 Sep | Shreyash | Deck (§9) + one weight-map figure + one flow diagram |
| 29 Sep | both | Re-pull live submission counts; freeze the number on slide 4 |
| 30 Sep | — | Upload PDF |
| Before finale | Mridul | Rain (CHIRPS), regimes (B3/B4), extremes, 0.25° |
| Before finale | Shreyash | Daily run, dashboard, NCUM adapter |

If the day-1 run does not beat B0, the slide says "matches best model; regime weights under test" — never a made-up number.

---

## 9. Slide-by-slide (SIH 2026 template, 6 slides max, PDF only)

Template rules: max 6 slides incl. title; keep the template's headings; points/diagrams, not paragraphs; PDF upload.

---

### Slide 1 — Title

| Field | Content |
|---|---|
| Problem Statement ID | 26081 |
| Title | Hybrid AI–NWP Multi-Model Forecast Blending System |
| Theme | Miscellaneous |
| PS Category | Software |
| Team ID / Team Name | from the portal |

**Explain:** fill exactly as the portal shows. **Can change:** only the idea's short name (a product name under
the title). **Difficulty if changed:** a mismatched PS ID or theme can get the entry screened out.

---

### Slide 2 — Proposed Solution

**Content (points):**
- **Problem:** No single forecast is best everywhere. HRES, GraphCast, FuXi, GenCast each win in different
  regions, seasons, leads and monsoon phases. Forecasters today reconcile them by experience.
- **Solution:** A blending engine that learns, from past verification, how much to trust each model for *this*
  cell, *this* lead, *this* season and *this* weather regime, and combines them into one forecast for rain,
  temperature, wind and extremes.
- **How it addresses the PS:** the five outcomes → blended forecast · weight maps · skill vs every model ·
  extreme-weather probabilities · daily automated run + dashboard.
- **Innovation / uniqueness:**
  - Physical NWP **and** AI weather models in one blend (IMD MME uses NWP only).
  - Regime-aware weights: active vs break monsoon, depressions, western disturbances.
  - Extremes forecast as probabilities, not read from the smoothed mean.
  - Every weight is auditable: click a cell → the skill history that set it.
  - Built on open data now; NCUM / NEPS-G plug in through an adapter.
- **Visual:** a "dominant model" map of India for one lead time (from the day-1 run).

**Can change:** wording, which innovation points, the visual. **Difficulty if changed:** do not list Pangu for
rain; do not say "replaces NCMRWF's forecast" — say "assists forecasters".

---

### Slide 3 — Technical Approach

**Technologies:**
Python · xarray · zarr · NumPy · scikit-learn / LightGBM · FastAPI · React · MapLibre · WeatherBench2 (ERA5, HRES,
GraphCast, Pangu, FuXi, GenCast) · CHIRPS · NOAA GFS & ECMWF open data (live).

**Methodology (flow chart, left → right):**
`Ingest models` → `Harmonise grid / leads / units` → `Truth: ERA5 + CHIRPS` → `Regime labels` →
`Skill memory (cell × lead × season × regime)` → `Weights (B0…B4)` → `Blend + extreme probabilities` →
`Verify (leave-one-year-out)` → `Daily run → dashboard`

Side box: "Weighting ladder — each rung must beat the last out of sample: best single → equal mean → skill
weights → + regime → + online update."

**Explain:** the flow is the §4 workflow compressed. **Can change:** the libraries (any Python stack), the
diagram style. **Difficulty if changed:** do not draw a deep neural network as the core — it is not what we can
train on one overlapping year, and judges will ask about data size.

---

### Slide 4 — Feasibility and Viability

**Feasibility:**
- All data is public and reachable today (WeatherBench2, CHIRPS, GFS/ECMWF on AWS). No login.
- Runs on a laptop at 1.5°; 0.25° on free Kaggle/Colab.
- No deep training: statistics + gradient boosting.
- **Measured today:** *[fill from the 28 Sep run — e.g. "T2m Day-3 RMSE: best single X, blend Y, −Z % (95 % CI …),
  leave-one-year-out 2018/20/22"]*

**Challenges → strategies:**

| Challenge | Strategy |
|---|---|
| NCUM / NEPS-G not public | Loader interface, tested on GFS GRIB; plug in at NCMRWF |
| Only 2020 has all AI models | Trio for multi-year verification; full set in blocked months |
| Blending smooths extremes | Separate exceedance-probability product |
| Live models ≠ training models | Online weight update from equal start |
| Rain truth | CHIRPS / IMD, not ERA5 |

**Viability:** open source, zero licence cost, runs on existing NCMRWF hardware, fits beside the current MME workflow.

**Can change:** table rows, wording. **Difficulty if changed:** the measured line is the single most valuable
thing on the deck — never replace it with a target, and never round it up.

---

### Slide 5 — Impact and Benefits

**Target audience:** NCMRWF / IMD forecasters · State disaster management authorities · Agro-met advisory units ·
Power-grid load planners (temperature, wind) · Researchers comparing AI weather models over India.

**Benefits:**
- **Social:** earlier, more reliable heavy-rain and heat-wave signals for disaster preparedness.
- **Economic:** better agro-advisories and power planning from forecasts NCMRWF already produces.
- **Operational:** one best-estimate forecast instead of forecasters reconciling five.
- **Scientific:** a live scorecard of where AI weather models beat or lose to physics over India.

**Comparison table:**

| Capability | Single model | IMD MME (2008) | Ours |
|---|---|---|---|
| Uses AI weather models | ◐ | ✗ | ✓ |
| Weights by region + lead | ✗ | ✓ | ✓ |
| Weights by season + regime | ✗ | ✗ | ✓ |
| Extremes as probabilities | ✗ | ✗ | ✓ |
| Weight maps shown to forecaster | ✗ | ✗ | ✓ |

**Can change:** audiences, benefit wording. **Difficulty if changed:** do not claim lives saved or rupee figures
without a source; if you add one real-world number, cite it.

---

### Slide 6 — Research and References

1. SIH 2026 PS26081, MoES / NCMRWF — official problem statement.
2. Rasp et al., "WeatherBench 2: A benchmark for the next generation of data-driven global weather models," JAMES 2024.
3. Lam et al., "Learning skillful medium-range global weather forecasting" (GraphCast), Science 2023.
4. Bi et al., "Accurate medium-range global weather forecasting with 3D neural networks" (Pangu-Weather), Nature 2023.
5. Chen et al., FuXi, npj Clim. Atmos. Sci. 2023 · Price et al., GenCast, Nature 2025.
6. Roy Bhowmik & Durai — IMD multi-model ensemble, J. Earth Syst. Sci. / Meteorol. Atmos. Phys. (the baseline we extend).
7. Krishnamurti et al., "Improved weather and seasonal climate forecasts from multimodel superensemble," Science 1999.
8. Funk et al., CHIRPS, Scientific Data 2015 · Hersbach et al., ERA5, QJRMS 2020.
9. Roberts & Lean, Fractions Skill Score, MWR 2008.

Links box: GitHub · demo video · prototype (fill before upload).

**Can change:** order, add papers. **Difficulty if changed:** check every citation's year and venue before
upload — NCMRWF judges will know these papers.

---

## 10. Checklist before upload (30 Sep)

- [ ] Day-1 measured number on slide 4 (or the honest "matches best model" line)
- [ ] No rainfall claims for Pangu / Aurora / NeuralGCM
- [ ] IMD MME cited as the baseline
- [ ] Heat-wave text says T2m is a proxy for Tmax
- [ ] 6 slides max, template headings intact, exported to PDF
- [ ] Live submission count re-pulled on 29 / 30 Sep
