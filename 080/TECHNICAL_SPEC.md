# PS26080 — Technical Specification

| | |
|---|---|
| **Version** | 1.0, 29 Sep 2026 |
| **Implements** | [`PRD.md`](PRD.md) (requirement IDs FR-x, NFR-x refer to it) |
| **Audience** | Whoever writes code (Mridul: classifier, correction, probability models; Shreyash: pipeline, API, interface). The PPT team should read sections 1, 2 and 13 only. |
| **State** | Design only. No code for 26080 exists yet. Everything marked *verify* has not been tested by us. |

Facts checked on 29 Sep 2026 from this machine: the WeatherBench2 HRES store lists `total_precipitation_24hr` (shape 5114 inits x 41 leads at 1.5 degree); the 0.25 degree HRES store `2016-2022-0012-1440x721.zarr` exists; CHIRPS `p25` daily files answer HTTP 200; the IMD Pune download page did not respond.

---

## 1. Architecture in one page

```
   WeatherBench2 HRES ─┐                      ┌── regime labels (rules, ERA5 + CHIRPS + tracks)
   (raw forecast)      │                      │
                       ▼                      ▼
   CHIRPS ────► harmonise ──► feature cube ──► regime classifier (forecast fields only)
   (truth)      (grid, day,     (per init,          │
                 units, mask)    lead, cell)        ▼
                                              regime map per day
                                                    │
                       raw rain ────────────────────┼──► stratified quantile mapping ──► corrected rain
                                                    │                                          │
                                                    └──► gradient-boosted exceedance model ────┤
                                                                                                ▼
                                          verification (RMSE, ETS, CSI, POD, FAR, FSS, Brier)  district products
                                                                                                │
                                                        FastAPI  ◄──────────────────────────────┘
                                                           │
                                                   web app (map, table, scorecard)
```

Three properties drive every decision:

1. **The regime is estimated from forecast fields.** At forecast time we do not know what rain will fall. A classifier that used observed rainfall at valid time would look excellent and would be useless.
2. **Everything is scored out of sample, by monsoon season.** Seven seasons of HRES exist. We leave one out each time.
3. **Every layer has a baseline next to it.** Raw, single correction, regime-aware, so each claim is a difference we can measure.

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.11 | Matches `167/pyproject.toml` |
| Arrays / data | `xarray`, `zarr`, `fsspec`, `gcsfs`, `numpy`, `scipy` | Remote zarr from a public bucket, lazy slicing to the India box |
| Geo | `geopandas`, `regionmask`, `shapely` | District masks, region aggregation |
| ML | `lightgbm`, `scikit-learn` | Tabular, trains in minutes, no GPU needed |
| Metrics | Own numpy code (section 9) plus `scikit-learn` for Brier | Short, testable, no black box |
| API | FastAPI + pydantic (as `167/satquery/server.py`) | Reuse the pattern |
| Web | React 19, Vite, MapLibre GL, Field Atlas design system from `167/web` | Reuse; see `167/docs/06_Design_System.md` |
| Compute | Laptop for 1.5 degree; Kaggle free tier for 0.25 degree | Zero cost (NFR-6) |
| Packaging | `pip` with pinned versions, `uv lock` or `requirements.txt` | Reproducibility (NFR-1) |

Reuse from SatQuery: the FastAPI app factory, the offline-first pattern, the Field Atlas tokens, the report generator idea, the deployment spec (`167/docs/12_Deployment_Spec.md`). Do not import SatQuery code; copy the pattern.

### Repository layout (proposed)

```
080/
  PRD.md  TECHNICAL_SPEC.md  PPT_TEAM_GUIDE.md  README.md
  rainregime/                  python package
    ingest.py                  remote zarr + CHIRPS download, cache to disk
    harmonise.py               grid, time, units, land mask
    regimes.py                 rule-based labels
    features.py                feature cube from forecast fields
    classify.py                regime classifier
    correct.py                 stratified quantile mapping, fallback ladder
    exceed.py                  heavy-rain probability model
    verify.py                  metrics, bootstrap, report
    products.py                districts, tables, GeoJSON
    server.py                  FastAPI
    cli.py                     run / verify / serve / daily
    tests.py
  web/                         copy of the Field Atlas shell, new pages
  data/                        cache (git-ignored), manifest.json (committed)
  results/                     report.json, figures/ (committed, small)
```

## 3. Regimes

### 3.1 Definition

Two labels per day and cell, kept separate because they answer different questions.

| Label | Values | Scope | Derived from |
|---|---|---|---|
| **Synoptic regime** | `active`, `break`, `depression`, `wd` (western disturbance), `neutral` | One value per day for the domain (depression may be local, see below) | Rules on reanalysis and observed rainfall (training labels) |
| **Geographic modifier** | `orographic`, `coastal`, `plain` | One value per cell, fixed in time except through flow | Terrain and coastline masks combined with low-level flow |

The statement lists six regime names. Active, break, depression and western disturbance are weather states that change day to day. Orographic and coastal are about *where* rain falls and how the flow meets terrain, so they are modifiers.

### 3.2 Label rules (training labels only)

| Regime | Rule | Source |
|---|---|---|
| **Active / break** | Standardised daily rainfall anomaly averaged over the core monsoon zone (about 18-28 N, 65-88 E). Active: anomaly at least +1 standard deviation; break: at most -1; for at least 3 consecutive days. Standardise per calendar day using 1981-2010 CHIRPS. Following Rajeevan et al. (2010). | CHIRPS |
| **Depression / low** | Closed cyclonic circulation at 850 hPa: relative vorticity above a threshold over a 3 x 3 degree area together with a mean-sea-level-pressure minimum. Cross-check against IBTrACS North Indian Ocean depression tracks where they exist. Local flag around the system centre (radius about 500 km). | ERA5, IBTrACS |
| **Western disturbance** | Upper-level trough: 500 hPa geopotential anomaly minimum over 60-80 E, north of 25 N, with a southwesterly jet at 300 hPa. Applies October to May. | ERA5 |
| **Neutral** | None of the above | |
| **Orographic modifier** | Cell inside a terrain mask (Western Ghats windward slope, Himalayan foothills, north-east hills, from surface geopotential and slope) and 850 hPa flow component across the terrain above a threshold | ERA5 static fields, winds |
| **Coastal modifier** | Cell within about 100 km of the coast | Land-sea mask |

Thresholds above are starting values. Fix them once, before looking at correction skill, and then run the sensitivity runs in section 10.1.

*Verify:* the exact vorticity and flow thresholds against published depression-detection and orographic-rain studies; whether IBTrACS holds depressions (not only cyclones).

### 3.3 Classifier

- **Purpose:** predict the synoptic regime and modifier from *forecast* fields, so it can run on a live forecast. (FR-3)
- **Inputs (all from HRES at valid time):** 850 hPa u and v, 850 hPa relative vorticity (computed), 500 hPa geopotential, 700 hPa vertical velocity, mean sea level pressure, 850 hPa specific humidity, forecast 24-hour rainfall, cell-neighbourhood maximum of forecast rainfall, day of year (as sine and cosine), lead time.
- **Model:** LightGBM multiclass, one model per lead group (Days 1-3, 4-6, 7-10). Class weights inverse to frequency.
- **Output:** class probabilities. The predicted regime is the argmax, and the top probability is the confidence (FR-6). Below a confidence floor (0.5 to start, tune on the calibration fold) the correction falls back to the parent stratum.
- **Metrics:** confusion matrix, per-class recall and precision, macro-F1, against a majority-class baseline and a climatology-by-day-of-year baseline. Report per lead group; skill will fall with lead time and we show that.
- **Expected shape:** active/break at Day 1 is easy, since forecast rainfall in the core zone almost defines the label. By Day 8-10 it is weak. The classifier is only useful where its confidence is high, and the fallback ladder is what protects the output when it is not.

Sanity check before training: count the labelled days per class per season. If `depression` or `wd` have fewer than about 30 days per season, merge them into one `disturbed` class for the model and say so.

## 4. Data pipeline

### 4.1 Ingest (`ingest.py`)

| Item | Detail |
|---|---|
| Raw forecast | `gs://weatherbench2/datasets/hres/2016-2022-0012-1440x721.zarr` (0.25 degree) and `...-240x121_equiangular_with_poles_conservative.zarr` (1.5 degree). Variables used: `total_precipitation_24hr`, `u_component_of_wind`, `v_component_of_wind`, `geopotential`, `vertical_velocity`, `specific_humidity`, `mean_sea_level_pressure`. HTTPS mirror: `https://storage.googleapis.com/weatherbench2/datasets/hres/...` |
| Inits | 00 UTC only for v1 (one per day). 12 UTC optional later. |
| Leads | 24, 48 ... 240 h (Days 1-10) for rainfall. Check the `prediction_timedelta` axis: rain accumulations are stamped at the end of the accumulation window. *Verify.* |
| Reanalysis | `gs://weatherbench2/datasets/era5/1959-2022-6h-240x121_equiangular_with_poles_conservative.zarr`: winds, geopotential, MSLP, `land_sea_mask`, `geopotential_at_surface`, sub-grid orography fields. Confirmed on 29 Sep. |
| Truth | CHIRPS 2.0 daily, `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/netcdf/p25/chirps-v2.0.YYYY.days_p25.nc` for 2016-2022 (plus 1981-2010 for the climatology). About 0.25 degree, land only. |
| Better truth | IMD gridded daily rainfall, 0.25 degree, if reachable (PRD risk R-2). Plug in through the same `TruthSource` interface. |
| Cache | Slice to the India box (5-40 N, 65-100 E), JJAS plus the October-May days needed for `wd`, write local zarr under `data/`. Write `manifest.json` (source URL, date fetched, checksum) and commit it, not the data. |

Sizes at 0.25 degree over the India box, JJAS only, 7 seasons, 10 leads, float32: rainfall about 0.7 GB; five upper-air fields at two or three levels a few GB. Reads from the public bucket are the slow part, so cache once.

### 4.2 Harmonise (`harmonise.py`)

Five traps, each with a test.

| Trap | Handling |
|---|---|
| **Units** | WeatherBench2 rain is in metres; convert to mm (x 1000). CHIRPS is mm/day. |
| **Valid time vs init time** | Score by valid time. Row = (init, lead) with `valid = init + lead`. Truth for that valid day. |
| **Rainfall day boundary** | CHIRPS uses a UTC calendar day. IMD's rainfall day runs 03 UTC to 03 UTC (0830 to 0830 IST). Test a shift of 0 and 1 (three-hourly not available in CHIRPS) on 2020, pick the convention with the higher correlation, document it. Never mix conventions between raw and truth. |
| **Grid** | Same grid for forecast and truth. At 0.25 degree the HRES `1440x721` grid and CHIRPS `p25` share cell size; check the origin offset and regrid conservatively if they differ. At 1.5 degree, regrid CHIRPS conservatively (`xesmf`) to the WeatherBench2 grid; a plain block mean does not align. |
| **Mask** | Score over land cells inside India only. Apply the same mask everywhere. |

Every downstream function takes a `Dataset` that has passed `validate_harmonised()` (dims, units attribute, mask, no NaN inside mask, time monotonic).

### 4.3 Splits

Season = one JJAS. Seven seasons (2016-2022). For each test season `s`:

- **Train:** the other six seasons, minus one.
- **Calibration:** one of the remaining seasons (rotates), used for probability calibration and the classifier's confidence floor.
- **Test:** season `s`.

No random splits by day or cell: neighbouring days and cells share weather, so they leak. An automated test asserts that no test-season timestamp appears in any fit call (NFR-2). Classifier, quantile maps and exceedance models are all fitted inside the fold.

Reserve nothing further: with only seven seasons there is no spare "final test". Do not tune anything against the same folds you report. Fix hyper-parameters from a single earlier season pair (for example tune on 2016-2017 only, report on all folds except those two, and say so), or keep hyper-parameters at defaults.

## 5. Correction (`correct.py`)

### 5.1 Ladder

| Rung | Method |
|---|---|
| L0 | Raw HRES |
| L1 | Quantile mapping, per cell (or per small region), per lead, all days pooled |
| L2 | Quantile mapping per **stratum** = (synoptic regime, geographic modifier, homogeneous region) per lead, with fallback |
| L3 | L2 plus the exceedance model of section 6, for heavy-rain probability and a tail adjustment |
| L4 | L2 with oracle regime labels (upper bound, never a result) |

### 5.2 Quantile mapping

Fit one mapping per (stratum, lead) from pooled samples of (forecast, observed) rainfall in that stratum in the training seasons.

```python
import numpy as np

# Quantile levels: dense in the body, extra points in the tail where heavy rain lives.
Q = np.r_[np.linspace(0.0, 0.99, 100), 0.995, 0.999]

def fit_qm(fcst: np.ndarray, obs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Pool 1-D samples of forecast and observed 24 h rain (mm) from one stratum."""
    fq = np.quantile(fcst, Q)
    oq = np.quantile(obs, Q)
    fq = np.maximum.accumulate(fq)          # keep monotone
    oq = np.maximum.accumulate(oq)
    return fq, oq

def apply_qm(x: np.ndarray, fq: np.ndarray, oq: np.ndarray) -> np.ndarray:
    y = np.interp(x, fq, oq)                # linear between quantiles
    hi = x > fq[-1]
    y[hi] = oq[-1] + (x[hi] - fq[-1])       # beyond the last quantile: additive shift, no cap
    return np.clip(y, 0.0, None)
```

Requirements and checks:

- **Monotone** in the raw rainfall (FR-9): unit test that `apply_qm` is non-decreasing on a grid of inputs.
- **Dry days:** models drizzle too often. The mapping handles this because many small forecast values map to the observed (near zero) low quantiles. Report wet-day frequency raw vs corrected against truth. A wet threshold of 0.1 mm for counting.
- **Tail:** the top quantile is 99.9, so the very heavy tail depends on very few samples. The additive shift above it is a choice, not physics: say so, and test an alternative (a generalised Pareto fit above the 95th percentile) as a sensitivity run.
- **Conservation:** quantile mapping does not conserve the seasonal total. Report the seasonal mean before and after.

### 5.3 Fallback ladder (FR-8)

A stratum is used only if it has at least `N_MIN` wet samples in the training folds (start at 500; the heavy tail needs more, see below). Otherwise walk up:

```
(synoptic, modifier, homogeneous region)   most specific
        ↓ too few samples
(synoptic, modifier)
        ↓
(modifier)
        ↓
all days                                    L1
```

Each corrected value carries `stratum_used` and `n_train`. The interface shows it, and the report counts how often each level was used. If most cells end up on the last rung, regime-awareness is not doing the work and the report must say so.

*Homogeneous regions:* IMD's four homogeneous rainfall regions (north-west India, central north-east India, north-east India, peninsular India), from published boundaries. *Verify* that a usable boundary file is available; otherwise build four regions by clustering on latitude, longitude and elevation with a fixed seed.

## 6. Heavy-rainfall probability (`exceed.py`)

### 6.1 Thresholds

| Name | 24 h rainfall | Note |
|---|---|---|
| Heavy | 64.5 to 115.5 mm | IMD category |
| Very heavy | 115.6 to 204.4 mm | IMD category |
| Extremely heavy | 204.5 mm and above | IMD category |
| Local p95, p99 | Per-cell percentile of wet-day observed rain | Used because IMD's mm thresholds describe a point, and a grid cell mean at 0.25 degree or coarser is much smoother, so 64.5 mm is exceeded rarely |

Report both. Use the mm thresholds for the interface (that is what forecasters know) and the percentile thresholds for the fair skill comparison.

### 6.2 Model

One LightGBM binary classifier per threshold and lead group. Trained on the training seasons, calibrated on the calibration season.

| Feature | Notes |
|---|---|
| Raw forecast rain at the cell | |
| Corrected rain (L2 output) | Uses a fold-internal correction (nested), not one fitted on the test season |
| Neighbourhood max and mean of raw rain (3 x 3, 5 x 5 cells) | Captures displaced storms |
| Regime probabilities from the classifier | Soft, not argmax |
| Geographic modifier, elevation, distance to coast | Static |
| Column moisture proxy and low-level convergence from forecast winds and humidity | |
| Day-of-year sine and cosine, lead time | |

Calibration: isotonic regression on the calibration season (FR-12). Check the result with a reliability diagram before showing any probability.

### 6.3 Class imbalance

Extreme events are rare. Do not resample; use the model's weighting and rely on calibration. Report the number of positive events in each fold next to each score. If a fold has fewer than about 30 positives at a threshold, drop that threshold for that fold and say so.

## 7. Products (`products.py`)

| Product | Content | Format |
|---|---|---|
| Corrected grid | 24 h rain, per date and lead | zarr, and PNG tiles for the map |
| Probability grid | P(rain above each threshold) | zarr |
| Regime map | Regime probabilities, argmax, confidence | zarr |
| District table | For each district: raw mm, corrected mm, P(heavy), P(very heavy), regime, stratum used | CSV, JSON, GeoJSON |
| Weight of evidence | Per district: number of training samples behind the correction | in the table |
| Verification report | All metrics, section 9 | `results/report.json`, HTML, PDF |

District aggregation: area-weighted mean of the grid over the district polygon. For probabilities, take the maximum and the area-mean, and label which is which. (The maximum answers "will any part of the district see heavy rain", the mean answers "how much of it".) Boundary file and its depiction: PRD risk R-9.

## 8. API (`server.py`)

FastAPI, read-only over precomputed arrays. All responses carry a `provenance` object (dataset, version, truth source, split).

| Method and path | Returns |
|---|---|
| `GET /api/health` | Status, data version |
| `GET /api/dates` | Available init dates and leads |
| `GET /api/grid?date=&lead=&layer=raw|corrected|diff|regime|prob&threshold=` | Tile URL or GeoJSON for the map |
| `GET /api/districts?date=&lead=` | District table |
| `GET /api/districts/{id}?date=` | One district, all leads, with the plain-language line |
| `GET /api/scorecard?regime=&lead=&threshold=` | Six metrics raw vs corrected with confidence intervals |
| `GET /api/reliability?threshold=&lead=` | Reliability curve points |
| `GET /api/regimes/confusion?lead_group=` | Classifier confusion matrix |
| `POST /api/live` | Runs the pipeline on the latest public forecast (FR-24) |
| `GET /api/export/districts.csv?date=&lead=` | CSV download |

Errors use the same shape as SatQuery (`errors.py`): a code, a plain sentence, and which input was wrong.

## 9. Verification (`verify.py`)

### 9.1 Metrics

Contingency counts for an event "rain at or above threshold T", pooled over cells, days and leads as stated per table:

| | Observed yes | Observed no |
|---|---|---|
| Forecast yes | H (hits) | F (false alarms) |
| Forecast no | M (misses) | C (correct negatives) |

| Metric | Formula |
|---|---|
| POD | H / (H + M) |
| FAR | F / (H + F) |
| CSI | H / (H + M + F) |
| ETS | (H - Hr) / (H + M + F - Hr), with Hr = (H + M)(H + F) / N |
| Frequency bias | (H + F) / (H + M) |
| RMSE | sqrt(mean((f - o)^2)) over mask cells, in mm |
| Brier / BSS | mean((p - o)^2); BSS = 1 - BS / BS_clim |
| FSS | 1 - mean((Pf - Po)^2) / (mean(Pf^2) + mean(Po^2)), fractions Pf, Po of cells at or above T in an n x n window |

```python
import numpy as np
from scipy.ndimage import uniform_filter

def contingency(f, o, thr):
    fy, oy = f >= thr, o >= thr
    H = np.sum(fy & oy); F = np.sum(fy & ~oy)
    M = np.sum(~fy & oy); C = np.sum(~fy & ~oy)
    return H, F, M, C

def ets(H, F, M, C):
    n = H + F + M + C
    hr = (H + M) * (H + F) / n
    den = H + M + F - hr
    return (H - hr) / den if den > 0 else np.nan

def fss(f, o, thr, n_cells):
    """f, o: arrays (day, lat, lon) already masked to land (NaN outside). Pooled over days."""
    num = den = 0.0
    for fd, od in zip(f, o):
        pf = uniform_filter(np.nan_to_num((fd >= thr).astype(float)), size=n_cells, mode="constant")
        po = uniform_filter(np.nan_to_num((od >= thr).astype(float)), size=n_cells, mode="constant")
        m = ~np.isnan(fd) & ~np.isnan(od)
        num += np.sum((pf[m] - po[m]) ** 2)
        den += np.sum(pf[m] ** 2) + np.sum(po[m] ** 2)
    return 1 - num / den if den > 0 else np.nan
```

Edge effects: a `constant` filter treats outside-mask cells as dry, which biases fractions near coasts and borders low. State the choice, or use a normalised mask-aware filter. Unit tests: FSS of identical fields is 1; FSS of a field against a shifted copy rises with window size; ETS of a random forecast is near 0.

Neighbourhood sizes for FSS: 1 (point), 3, 5, 9, 17 cells. At 0.25 degree that is about 25 km to 450 km.

### 9.2 Stratification

Every metric is reported for: all days, each synoptic regime, each geographic modifier, each lead (Day 1 to Day 10), each threshold. Regime here means the *observed-label* regime for stratifying the scores, and separately the *predicted* regime for the operational view. Show both; they differ where the classifier is wrong.

### 9.3 Uncertainty

Block bootstrap by ISO week within each season (resample weeks, not days or cells, to keep the weather persistence). 1,000 resamples, 95 percent percentile interval. Difference metrics (corrected minus raw, L2 minus L1) get their own intervals; a difference is claimed only if its interval excludes zero.

### 9.4 Report

`rainregime verify` writes:

- `results/report.json`: every metric, fold, regime, lead, threshold, with n and interval
- `results/figures/*.svg`: reliability, per-regime skill bars, weight-of-evidence map, classifier confusion
- `results/report.html` and PDF

Each figure states dataset, resolution, truth, split and n in its footer (NFR-3). The report opens with the pre-registered success table from PRD section 8 and marks each row pass or fail, in that order, before anything else.

## 10. Testing

| Kind | Tests |
|---|---|
| Unit | Metric functions on tiny hand-computed tables; `apply_qm` monotone and non-negative; fallback ladder picks the right rung; FSS properties above |
| Leakage | Assert no test-season timestamp reaches `fit_*`; assert classifier features contain no observed rainfall |
| Data | `validate_harmonised()`; unit conversion; valid-time alignment on a known event |
| Integration | End to end on one season at 1.5 degree in under 5 minutes |
| Regression | `results/report.json` hash for a fixed seed on a small subset |
| Property | Corrected rainfall never negative; dry raw days stay near dry |

### 10.1 Sensitivity runs (report all; hide none)

| Change | What it tells us |
|---|---|
| Active/break threshold at +/- 0.75 and 1.25 SD | Whether the result depends on the label rule |
| Tail method: additive shift vs GPD | Whether extremes are an artefact |
| `N_MIN` at 300 and 1000 | Whether stratification is starved |
| Truth = CHIRPS vs IMD (if available) | Truth dependence |
| 1.5 degree vs 0.25 degree | Resolution dependence |
| 00 UTC vs 12 UTC inits | Whether the finding is robust |

## 11. Operations

- **Daily job (`rainregime daily`, FR-24):** fetch the newest GFS 0.25 degree forecast from `noaa-gfs-bdp-pds` (open data on AWS) or ECMWF open data; apply the trained classifier and maps; write today's products; log the run. GFS is a different model from the HRES the maps were fitted on, so a GFS input must use maps fitted on GFS archive data or be labelled "HRES-trained correction applied to GFS, not validated". Do not hide this. Simplest honest v1: live mode uses ECMWF open-data IFS (same family as HRES) and states the difference between open-data and operational HRES.
- **Offline bundle (NFR-5):** cached zarr, precomputed products for a set of demonstration dates, built web bundle, one script. Tested with the network off.
- **Hosting:** API and web on a free CPU host (see `167/docs/12_Deployment_Spec.md`); no GPU is needed for anything in this project.
- **Logging:** each run writes `runs/<timestamp>.json` (git hash, data manifest, seed, timings).

## 12. NCUM and NEPS-G adapter

NCMRWF's models are not public, so a judge may ask about them. What we can do is show the boundary.

- A `ForecastSource` interface: `load(init, leads, box) -> xarray.Dataset` with named variables and units.
- Implementations: `HresZarr`, `GfsGrib2`, `EcmwfOpen`, and `NcumGrib2` (documented stub with a parser tested on any sample NCUM or NEPS-G GRIB2 file we can obtain; otherwise tested on a GFS GRIB2 file, since the container format is the same).
- Bias structure differs per model, so the maps must be refitted on that model's archive. The system exposes `rainregime fit --source ncum --archive PATH`.
- What we say: "validated on ECMWF HRES; runs on NCUM once NCMRWF provides the archive." We do not say we validated on NCUM.

## 13. What is real, what is simulated, what is unverified

This section is for anyone writing about the project.

| Item | State on 29 Sep 2026 |
|---|---|
| HRES rain in WeatherBench2 | **Real, present.** Metadata probed. Data not yet downloaded. |
| CHIRPS truth | **Reachable.** One file answered HTTP 200. Not yet downloaded or compared. |
| IMD gridded rainfall | **Not reachable from this machine.** Unknown from the college network. |
| Regime labels | **Not built.** Rules specified only. |
| Classifier | **Not built.** |
| Quantile maps and skill numbers | **None exist.** Any number on a slide before `verify` runs is a target or a guess. |
| District boundaries | **Not chosen.** |
| Web interface | **Not built.** The Field Atlas shell exists in `167/web` and can be copied. |
| NCUM results | **None, and none possible without NCMRWF data.** |

## 14. The minimum experiment before the 30 Sep deadline

So the deck can carry one true number. Budget: two to three hours for one person. Everything here is small.

1. Fetch HRES 1.5 degree `total_precipitation_24hr` for JJAS 2018-2020, 00 UTC, Day 1 and Day 3 only.
2. Fetch CHIRPS `p25` for the same dates; regrid conservatively to 1.5 degree over the India land mask.
3. Convert units, align valid times (section 4.2), compute L0 RMSE, frequency bias, and ETS at the local 95th percentile.
4. Fit L1 (pooled quantile mapping) on 2018 and 2019, score on 2020. Then L2 with only the active/break/neutral labels from the core-zone rule on CHIRPS (no classifier yet, observed labels), fitted on 2018-2019 and scored on 2020.
5. Write down L0, L1, L2 for Day 1 and Day 3 with their sample sizes. Two seasons of training and one of test is thin, so the slide must say "one held-out season (2020), indicative".

Rule of the outcome: put on the slide exactly what came out. If L2 is not better than L1, the slide says the regime effect is not visible on this small test and shows what is (raw vs L1). Do not run more variants until one looks good.

If this cannot finish by the deadline, the deck carries the design and states that measurement follows, which is honest and acceptable.

## 15. Build plan for the finale (36 hours)

| Hours | Work | Output |
|---|---|---|
| 0-3 | Environment, cache the data at 1.5 and 0.25 degree, `validate_harmonised` passing | Cached zarr, manifest |
| 3-8 | Labels, classifier, first L1 and L2 numbers on all seven folds | `regimes.py`, `classify.py`, first `report.json` |
| 8-12 | Exceedance model, calibration, full metric set, bootstrap | L3 results, reliability diagrams |
| 12-20 | API and interface: map, raw/corrected toggle, regime badge, scorecard | Working app on cached data |
| 20-26 | District product, plain-language lines, live mode, offline bundle | Products, bundle |
| 26-32 | Sensitivity runs, fix what breaks, report PDF | Final report |
| 32-36 | Rehearsal, judge questions, freeze | Demo |

Cut order if time runs short: live mode, then 0.25 degree runs (keep 1.5), then exceedance calibration polish. Never cut the ablation, the leakage test or the honesty labels.

## 16. Ownership

| Area | Owner |
|---|---|
| Regime labels and classifier, correction, exceedance model | Mridul |
| Ingest, harmonise, API, interface, deployment | Shreyash |
| Verification code and report | To be assigned |
| Districts and boundary licence | To be assigned |
| Deck | PPT team (see `PPT_TEAM_GUIDE.md`) |

## 17. References

- Rajeevan, M., Gadgil, S., Bhate, J. (2010). Active and break spells of the Indian summer monsoon. *J. Earth Syst. Sci.* 119.
- Roberts, N. M., Lean, H. W. (2008). Scale-selective verification of rainfall accumulations from high-resolution forecasts of convective events. *Monthly Weather Review* 136. (FSS)
- Rasp, S. et al. (2024). WeatherBench 2: A benchmark for the next generation of data-driven global weather models. *J. Adv. Model. Earth Syst.*
- Funk, C. et al. (2015). The climate hazards infrared precipitation with stations (CHIRPS). *Scientific Data* 2.
- Pai, D. S. et al. (2014). Development of a new high spatial resolution (0.25 x 0.25) long period (1901-2010) daily gridded rainfall data set over India. *Mausam* 65.
- Cannon, A. J. (2018). Multivariate quantile mapping bias correction. *Climate Dynamics* 50. (background on quantile mapping limits)
- IMD rainfall intensity categories: heavy 64.5-115.5 mm, very heavy 115.6-204.4 mm, extremely heavy 204.5 mm and above, per 24 hours.

*Verify every citation before it goes on a slide.*
