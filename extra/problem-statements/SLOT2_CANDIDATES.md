# Slot 2 candidates: replacing PS26143 (Dark Transit)

First written 25 Sep 2026, re-ranked 27 Sep. Selection rule from the team: **lowest number of submissions**, weighted very heavily.

Submission counts come from a live pull of `sih.gov.in/sih2026PS`. The `sih2026_ps.json` in this folder was scraped before submissions opened, so every count in it is `0/500`. Counts change daily until the deadline, so re-pull on 29 Sep and again on 30 Sep morning.

- Deadline on the live portal: **30 September 2026**.
- The portal lists 240 statements (the repo snapshot has 229).
- PS26143 (Dark Transit, being replaced): **223 / 500** (162 on 25 Sep).
- PS26167 (SatQuery, slot 1): **305 / 500** (215 on 25 Sep).

## 1. Ranking (27 Sep 12:00 IST pull)

Each PS advances 3-7 ideas from the screening round. Planning number: **3**. Goal is to clear this round.

**Score = (3 / submissions) x a mild feasibility factor.** The factor is 1.00 High, 0.95 Medium-high, 0.90 Medium, 0.85 Low-medium, 0.80 Low, from the 36-hour feasibility rating in section 3. The factor is deliberately small so the submission count dominates. Raw odds assume selection is random. A strong deck beats random, so treat them as a floor.

| Rank | PS | Title (short) | Subs 25 Sep | Subs now | Random odds of 3 | 36-hr feasibility | Score |
|---|---|---|---|---|---|---|---|
| 1 | 26080 | Regime-aware monsoon rainfall post-processing (NCMRWF) | 15 | 21 | 14.3% | High | 14.3 |
| 2 | 26081 | Hybrid AI-NWP forecast blending (NCMRWF) | 11 | 22 | 13.6% | High | 13.6 |
| 3 | 26084 | Convective nowcasting 0-6 h, 1-3 km (NCMRWF) | 11 | 18 | 16.7% | Low | 13.3 |
| 4 | 26072 | AI thunderstorm and lightning nowcasting (IMD) | 14 | 18 | 16.7% | Low | 13.3 |
| 5 | 26074 | Block to panchayat forecast downscaling (IMD) | 11 | 22 | 13.6% | Medium-high | 12.9 |
| 6 | 26086 | Hyperlocal monsoon onset/break, 7-30 days (NCMRWF) | 17 | 24 | 12.5% | Medium | 11.3 |
| 7 | 26079 | Forecast bust detection (NCMRWF) | 18 | 27 | 11.1% | High | 11.1 |
| 8 | 26078 | Extreme-weather tracking + diffusion downscaling (NCMRWF) | 12 | 31 | 9.7% | Low-medium | 8.2 |

For comparison: 26143 (old slot 2) 223 subs, 1.3% random odds. 26167 (slot 1, SatQuery) 305 subs, 1.0%. Worth deciding how to handle slot 1.

**Pick: 26081**, with 26080 as the equal-odds alternative and 26074 next.
- 26080 and 26081 are within one submission of each other. 26081 wins the tie because we can put one real measured result in the deck (blended vs single-model error from WeatherBench2). 26080 needs CHIRPS or IMD rainfall as truth, and the IMD download is unconfirmed. 26080 also names its own yardstick (RMSE, ETS, CSI, POD, FAR, FSS), which suits a rigorous deck.
- 26084 and 26072 have the lowest raw counts (18) and land 3rd and 4th on score. Their 36-hour builds are not deliverable: no radar or lightning data. Take one only if the decision is purely "clear this round" and we accept a weak finale. If so, 26084, because its statement is better specified.
- 26074 has the strongest UI and impact story, but the thinnest statement. It is 5th on score, close behind.
- 26079 was rank 1 in the first analysis (best finale build) and is now 7th, at 27 submissions.
- 26078 nearly tripled (12 to 31) and is now last.

### What moved between 25 Sep and 27 Sep

- Total submissions across all 240 PS: 23,562 to 30,528 (+30%). 233 of 240 PS moved. On 25 Sep only 57 moved.
- The low-count PS did not stay low: 26081 and 26074 doubled (11 to 22), 26078 went from 12 to 31.
- No unexpected low-count software statement appeared. The lowest non-weather statements are Oil India, AICTE and Autodesk, all off-profile (section 6).
- Expect more rush near 30 Sep. The gaps between the top five are 1-4 submissions, so the order can flip on the day. Re-pull before choosing.

Section 3 below keeps the entries in the original order of 25 Sep. The ranking above replaces it. Submission counts inside section 3 are updated.


## 2. What decided the ranking

1. **Data.** None of the 8 statements ships a dataset. The NCMRWF operational models (NCUM, NEPS-G), IMD Doppler radar and the lightning network are not public. So the useful question is which PS can be built from open data.
2. **Judges.** Six of the eight are MoES (NCMRWF or IMD). The judges will be atmospheric scientists. They will ask for skill scores against a named baseline, not for a nice dashboard. Most teams will show a UI on made-up data. Real verification numbers stand out.
3. **Reuse.** SatQuery already has a MapLibre web app, a FastAPI backend pattern and a deployment spec. A slot-2 idea that reuses those does not split the team's effort.
4. **Team.** Mridul does the models. Shreyash does everything else. Six people total, and slot 1 (SatQuery) still needs work.

### Open data confirmed reachable from this machine (25 Sep)

| Source | What | Access | Used by |
|---|---|---|---|
| WeatherBench2 (`gs://weatherbench2`) | ERA5 truth 1959-2022 | Public zarr, no login | 26079, 26080, 26081, 26078 |
| WeatherBench2 `hres` | IFS HRES forecasts 2016-2022, 0.25° | Public zarr | 26079, 26080, 26081 |
| WeatherBench2 `ifs_ens` | IFS ensemble 2018-2022 (2016-2024 at coarser grids) | Public zarr | 26079, 26078 |
| WeatherBench2 `graphcast_v2`, `pangu`, `fuxi`, `gencast` | AI-model forecasts. GraphCast only for 2018, 2020, 2022. FuXi and GenCast only for 2020. | Public zarr | 26079, 26081 |
| WeatherBench2 `era5-hourly-climatology` | 1990-2019 climatology | Public zarr | 26078 |
| NOAA GFS on AWS | Live and archived 0.25° forecasts | Open S3 | live demos |
| ECMWF open data on AWS | Live IFS and AIFS forecasts | Open S3 | live demos |
| Himawari-9 on AWS | Geostationary imagery, 2 km | Open S3 | 26084, 26072 |
| CHIRPS 2.0 daily 5 km | Rainfall truth | Open HTTPS | 26080, 26078 |
| NOAA ISD | Hourly station observations | Open HTTPS | 26074 |

Not confirmed or not usable: IMD Pune gridded rainfall (unreachable from here, may work from the team's network), NASA IMERG (needs a free Earthdata login), INSAT-3D on MOSDAC (needs registration), IMD radar, lightning networks, NCUM and NEPS-G (not public).

Variables in each WeatherBench2 dataset (especially precipitation) still need a check before we commit. That is part of the first-hour test in section 5.

---

## 3. Candidates in detail

### PS26079, AI-Based Forecast Bust Detection for Medium-Range Weather Forecasts

**Org:** MoES / NCMRWF. **Category:** Software. **Submissions:** 27/500 (27 Sep).

**What the statement asks.** Medium-range forecasts sometimes fail badly during fast-evolving systems (monsoon depressions, heavy rain, western disturbances, cyclones, heat waves, active/break monsoon). Build an AI/ML system that says where and at which lead times a forecast is likely to be wrong, by comparing current forecast patterns with past error behaviour.

**Required deliverables (from the statement).**
- Forecast confidence map, region-wise, Day 1 to Day 10
- Forecast bust probability per region
- Error-prone area detection
- Explainable output: the meteorological reasons for low confidence
- Prototype dashboard or API

**What we would build.**
- Define a "bust" as forecast error above a high percentile of that region's and lead time's error distribution. Truth is ERA5.
- Features: ensemble spread (IFS ENS), disagreement between HRES, GraphCast and Pangu, large-scale flow and moisture patterns, season, regime.
- Model: gradient-boosted trees for bust probability per grid cell, per lead time. A small CNN on forecast fields is an optional second model.
- Explanation: SHAP values turned into plain sentences ("low confidence: models disagree on the depression track, high spread over the Bay of Bengal").
- Baseline to beat: spread-skill (spread alone as the error predictor). Metrics: AUC, Brier skill score, reliability diagram, hit rate for the top-decile errors.
- Live mode: pull today's GFS, IFS and AIFS forecasts and draw the confidence map for the next 10 days. This is the best moment in a demo.

**ML difficulty: medium.** Tabular ML on gridded data. No large model training. Runs on Kaggle or a laptop. The hard part is the label design and the leakage-free split (split by year or by event, never by random grid cell).

**UI potential: high.** India map with a confidence heat layer, a lead-time slider (Day 1-10), click-a-region to get the explanation card, a compare-models panel, a reliability chart. The Field Atlas design system from SatQuery carries over.

**36-hour feasibility: high.** Data is a download plus a slice to the India box. The model trains in minutes. Most of the time goes to the UI, the explanation text and the live pipeline.

**Risks.**
- We need enough meteorology to write correct explanations. Read up on spread-skill relationships and forecast verification first.
- If the ML model does not beat plain ensemble spread, the honest result is a smaller claim. We should be ready to say what the model adds (for example, multi-model disagreement including AI models).
- NCMRWF's own NCUM errors are not available, so we validate on open models and describe an adapter for NCUM.

**Edge over other teams.** Real numbers against a named baseline, plus multi-model disagreement as a cheap uncertainty signal that includes AI weather models.

---

### PS26081, Hybrid AI-NWP Multi-Model Forecast Blending System

**Org:** MoES / NCMRWF. **Category:** Software. **Submissions:** 22/500 (27 Sep).

**What the statement asks.** Different forecast systems (physical NWP, ensembles, AI weather models) perform differently by region, season, lead time and weather regime. Build a blending framework with adaptive weights based on historical skill, and produce one optimized forecast for rainfall, temperature, wind and extreme-weather indicators.

**Required deliverables.**
- Dynamically blended forecast
- Model weight maps (which model is more reliable where and at which lead time)
- Better skill than each individual model
- Extreme-weather guidance (heavy rain, heat wave, high wind)
- Automated script or dashboard for routine blending

**What we would build.**
- Sources: HRES, GraphCast, Pangu (and FuXi or GenCast where the years allow), later NCUM through an adapter.
- Weighting methods, in increasing complexity: static per-region weights, exponentially weighted average by recent skill, gradient-boosted stacking conditioned on lead time, season and regime.
- Outputs: blended forecast for temperature, wind, pressure and rainfall (rainfall only from models that provide it), weight maps by lead time, extreme indicators with CSI and FSS.
- Verification: RMSE and bias against ERA5 and CHIRPS, leave-one-year-out.
- Routine workflow: a scheduled script that pulls the latest forecasts, applies the weights and writes a dashboard bundle.

**ML difficulty: low to medium.** Stacking and online weighting. No deep training. The rigour is in the verification.

**UI potential: high.** The weight maps are visually striking: an India map that shows which model wins where, animated over lead time. Add a blended vs single-model skill chart and an extreme-event panel.

**36-hour feasibility: high.** Same data pipeline as 26079.

**Risks.**
- Honest skill gains from blending are usually small (a few percent in RMSE). The pitch must lean on regime-conditioned weights, the maps and the extreme-event skill, not on a big headline number.
- Limited overlap years across models (GraphCast covers only 2018, 2020, 2022 in WeatherBench2), so the training set for some combinations is small.
- NCUM and NEPS-G are what NCMRWF actually cares about, and we cannot get them. Show the adapter, not the data.

---

### PS26080, Regime-Aware AI Post-Processing of Monsoon Rainfall Forecasts

**Org:** MoES / NCMRWF. **Category:** Software. **Submissions:** 21/500 (27 Sep).

**What the statement asks.** Rainfall forecast errors depend on the weather regime (active monsoon, break, depression, orographic, coastal, western disturbance). One bias correction does not fit all. First identify the regime, then apply a matching correction to the raw NWP rainfall forecast, especially for heavy and very heavy rain.

**Required deliverables.**
- Weather regime classifier (active, break, depression, coastal/orographic)
- Bias-corrected rainfall forecast, better than raw NWP
- Heavy-rainfall probability above operational thresholds
- District-level rainfall product (table or map)
- Verification report with RMSE, ETS, CSI, POD, FAR and FSS

This statement supplies its own yardstick: success is a set of named numbers.

**What we would build.**
- Regime labels from ERA5 (monsoon trough position, low-level jet), the MJO index, IBTrACS depression tracks, and the standard active/break rule on a core-monsoon-zone rainfall anomaly.
- Truth: CHIRPS, or IMD gridded rainfall if it downloads from the team's network.
- Correction: quantile mapping per regime plus a gradient-boosted model for heavy-rain probability.
- Verification: all six named metrics, with FSS at several neighbourhood scales, reliability diagrams, leave-one-monsoon-out.
- Output: district-aggregated rainfall table and map.

**ML difficulty: medium.** Classifier plus bias correction plus probabilistic exceedance. Still tabular-scale. The work is careful data handling.

**UI potential: medium-high.** District choropleth with a regime badge, raw vs corrected toggle, a skill scorecard. Less visual variety than 26079 or 26081.

**36-hour feasibility: high.**

**Risks.**
- Least novel of the top three: bias correction by regime is a known idea. We win on rigour, not on originality.
- Rainfall in WeatherBench2 needs checking per model (not every model outputs it).
- ERA5 rainfall is a poor truth, so CHIRPS or IMD must be used, and the IMD download is unconfirmed.

---

### PS26074, Downscaling of Weather Forecast from Block to Panchayat Level

**Org:** MoES / IMD. **Category:** Software (Agriculture, FoodTech & Rural Development). **Submissions:** 22/500 (27 Sep).

**What the statement asks.** The full text is one sentence: infer high-resolution data from low-resolution data to give panchayat-level forecasts for agro-meteorological advisory services. No deliverables list, no dataset.

**What we would build.**
- Statistical downscaling of temperature, humidity, wind and rainfall from coarse forecasts to about 1-5 km, using static high-resolution covariates (elevation, slope, aspect, land cover, distance to coast) and ML.
- Aggregate to block and panchayat units. Panchayat boundaries need SHRUG or Bhuvan. Block boundaries are easier. Fallback is a hex grid of panchayat size.
- Add quantile outputs so each cell carries an uncertainty range.
- An advisory layer: rules that turn the forecast into crop-stage advice in Indian languages (spray, irrigate, harvest, delay sowing).
- Validation: hold out NOAA ISD stations and compare downscaled vs coarse.

**ML difficulty: medium.** Temperature downscaling with terrain works well. Rainfall downscaling has modest real gains, so we should say so.

**UI potential: very high.** Drill-down state to district to block to panchayat, farmer-facing advisory cards, language switcher, mobile layout. The best demo surface of the whole list.

**36-hour feasibility: medium-high.**

**Risks.**
- No public panchayat-scale ground truth. We can only validate at station points, and the station network is sparse.
- The statement is thin. Judges' expectations are unknown, so we choose the metrics ourselves and must defend them.
- With 11 submissions, several other teams will likely build "XGBoost plus elevation". We need uncertainty, validation and the advisory layer to separate.

---

### PS26086, Hyperlocal Monsoon Onset and Break Prediction System

**Org:** MoES / NCMRWF. **Category:** Software (Agriculture). **Submissions:** 24/500 (27 Sep).

**What the statement asks.** A hybrid predictive framework giving a 7-to-30-day probabilistic outlook of monsoon behaviour (onset, dry spells or breaks, heavy rain) at block and panchayat scale. Ingest ENSO, IOD and MJO indices and downscale them with ML.

**Required deliverables.**
- A hybrid model pairing large-scale climate indices with regional atmospheric data
- Colour-coded probability risk maps at block or panchayat level, 1 to 4 weeks ahead
- An expert-system engine that turns rainfall probabilities into crop-specific advisories
- A mobile web app or SMS/WhatsApp gateway with advisories in regional languages

**What we would build.**
- Onset and break definitions from rainfall, and MJO/ENSO/IOD conditional composites for week 1-4 probabilities.
- ECMWF extended-range data from WeatherBench2 (`ifs_extended_range`, `era5_biweekly`) as predictors.
- Calibrated probabilities against climatology, block-level maps, an advisory rule engine, multilingual mobile UI, a simulated SMS gateway.

**ML difficulty: medium-high.** The modelling is not exotic, but skill at week 3-4 and block scale is close to climatology in reality. The hard part is being honest about it. Calibrated, modest probabilities are defensible. Confident village-level claims will be caught.

**UI potential: very high.** Farmer app, risk maps, advisory feed in several languages.

**36-hour feasibility: medium.** It has the widest surface area: model, maps, rule engine, multilingual text, app, gateway. Too much for 36 hours unless scoped down.

**Risks.** Over-claiming skill. Scope creep. The statement lists four separate products.

---

### PS26078, AI-Driven Spatio-Temporal Tracking of Extreme Weather Anomalies

**Org:** MoES / NCMRWF. **Category:** Software. **Submissions:** 31/500 (27 Sep).

**What the statement asks.** The text is a full research proposal: a graph neural network on an icosahedral mesh to track anomalies in 12 km ensemble data over 3-10 days, then a conditional diffusion model to downscale to 5 km without smoothing away extremes, with physics-informed loss terms. Deliverables: a tracking module (4D bounding boxes), a downscaling module, a visualization and alert dashboard, and a REST alerting API with low/moderate/severe alerts in a 5 km radius.

**What we can build in scope.**
- Extreme Forecast Index (EFI) from an open ensemble against ERA5 climatology. This is a defined formula and a real operational product.
- Anomaly objects tracked through space and time with classical connected-component and centroid tracking, output as bounding boxes and trajectories.
- A small conditional downscaler to about 5 km, using CHIRPS as the 5 km target. A U-Net first, a small diffusion model only if time allows.
- Alert API with three severity classes.

**ML difficulty: very high** if we follow the statement (GNN, diffusion, physics loss, custom mesh). **Medium** for the reduced version above.

**UI potential: high.** Animated anomaly tracks on a globe or map, alert radius overlays, a severity feed.

**36-hour feasibility: low to medium.** The reduced version is feasible. The full stated architecture is not.

**Risks.** The statement effectively describes a finished design, and judges will expect it. NEPS-G is not public. A small diffusion model trained on one monsoon on free compute may not beat a plain U-Net, and we would have to say so.

---

### PS26084, Convective-Scale Nowcasting for Thunderstorms, Hail and Cloudbursts (0-6 h)

**Org:** MoES / NCMRWF. **Category:** Software (Disaster Management). **Submissions:** 18/500 (27 Sep).

**What the statement asks.** A real-time, 0-6 hour nowcasting system at 1-3 km resolution. Fuse Doppler weather radar (reflectivity and velocity), geostationary satellite (INSAT-3D/3DR thermal and infrared) and ground lightning detection. Detect convective initiation and forecast lightning density, hail probability, downburst velocity and cloudburst thresholds. Deliver a GIS dashboard with hazard zones and live storm-arrival countdown clocks.

**What we can build.**
- A satellite-only version from Himawari-9 infrared (2 km): cloud-top cooling rate for convective initiation, optical-flow advection with pySTEPS for the 0-2 h track, IMERG or CHIRPS-derived rain labels where available.
- The countdown dashboard, which is a strong visual.
- An ingestion adapter documented for IMD radar and lightning feeds we cannot access.

**ML difficulty: high.** Radar-based nowcasting models need radar archives to train, and we have none. A physics and optical-flow baseline is what we can honestly ship.

**UI potential: very high.** Live radar-style animation, hazard polygons, countdown clocks.

**36-hour feasibility: low.** Himawari sees the western edge of India at an oblique angle, radar and lightning are absent, and the resolution target of 1-3 km cannot be met with the data we can get.

**Risks.** Scientists will ask about radar first. Anything trained on non-Indian radar and presented as ours would not survive scrutiny.

---

### PS26072, AI/ML Nowcasting of Thunderstorm and Lightning

**Org:** MoES / IMD. **Category:** Software. **Submissions:** 18/500 (27 Sep).

**What the statement asks.** One sentence: AI/ML nowcasting of thunderstorm and lightning using multiple radars, satellite, lightning and model data.

**Assessment.** Same problem and same data limits as PS26084, with a thinner statement. Everything in the PS26084 entry applies. Because the scope is undefined we can choose it ourselves, but the missing data is the same. If we pick a nowcasting statement at all, PS26084 is the better-specified one. Neither is recommended.

---

## 4. Can we be a top 3-4 team?

The count of 18-31 submissions (27 Sep) means only that many teams applied for these statements. It does not say how many reach the finale or how many are ranked. Two facts I could not check:

1. **How many finalists each PS gets, and how many are placed.** If a PS has only a handful of finalists, a top-3 placement is far more likely. This is the strongest reason to prefer low-count statements. Check the SIH 2026 rules and the nodal centre.
2. **Whether we may prepare data and models before the 36-hour build,** and whether NCMRWF or IMD supplies data at the finale. No statement lists a dataset.

Under those assumptions my judgment is in the summary table. What would move the odds:

- **Up:** real verification against a named baseline, a live "today" demo, an honest limitations slide, and a working demo on the finale day.
- **Down:** claims of village-level or week-4 skill, a UI on synthetic data, an ML model that is more complicated than the result needs, and no one on the team who can talk about the meteorology.

## 5. Open questions and next steps

- [ ] Confirm the SIH 2026 finalist count per PS and the preparation rules.
- [ ] Check which variables (especially precipitation) exist per WeatherBench2 model, and whether IMD gridded rainfall downloads from our network.
- [ ] One-hour feasibility test for PS26079: load HRES and ERA5 over India for one monsoon season, compute an error label, and check whether spread alone predicts it. That gives a real baseline AUC before we commit.
- [ ] Decide between 26079 and 26081 after that test. They share data, so the choice can wait for the numbers.
- [ ] Re-pull live submission counts on 29 Sep and on 30 Sep morning, then re-run the ranking in section 1.
- [ ] Deck for slot 2 (the SIH template and winning-deck PDFs are in the repo root).
- [ ] Someone on the team reads up on forecast verification (spread-skill, FSS, reliability) before the finale.

## 6. Other low-count statements that were left out

| PS | Subs (25 Sep) | Why not |
|---|---|---|
| 26211 | 6 | AICTE student-innovation prompt, Hardware, scored 18.6 in the first pass |
| 26096 | 9 | Digital Heritage Archive. Tagged Hardware, so it may be judged against physical builds |
| 26120, 26121 | 13, 14 | Oil India well-optimization and offset-well tools. Domain data is proprietary |
| 26119 | 14 | MRPL GPU optimization solver. Low fit for the team, heavy numerical engineering |
| 26087, 26233, 26030, 26064, 26232, 26235 | 14-19 | Hardware or hardware-heavy |
| 26163, 26148, 26160 | 14-21 | NTRO security tooling. Off-profile for this team |
