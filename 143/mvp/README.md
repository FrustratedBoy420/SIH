# Dark Transit — reference implementation

A runnable pipeline for SIH26143: one SAR scene and one AIS archive in, a ranked vessel shortlist and a dossier out.

**Runtime dependencies: numpy.** Nothing else — including for the neural detector, whose forward pass is written in numpy and whose weights ship as an `.npz`. No network at any point. Deterministic under a recorded seed.

```bash
python3 -m darktransit.cli capabilities    # which optional paths are live here
python3 -m darktransit.cli scenarios       # what each incident demonstrates
python3 -m darktransit.cli run             # nominal incident, ~41 s
python3 -m darktransit.cli selftest        # 66 checks: primitives, capabilities, PRD section 19
python3 -m darktransit.cli ablate          # re-rank with each factor zeroed in turn
python3 -m darktransit.cli fit             # refit the discriminator and measure it, ~3 min
python3 -m darktransit.cli train           # fit the DT-3 U-Net (needs torch), ~10 min
python3 -m darktransit.cli validate        # hindcast known drifter tracks, ~20 s
python3 -m darktransit.cli ingest FILE     # read a real Sentinel-1 GeoTIFF
python3 -m darktransit.cli serve           # http://127.0.0.1:8000
```

Five capabilities are optional, and each one degrades rather than fails when its
wheel is missing — `cli capabilities` says which are live:

| | Needs | Without it |
|---|---|---|
| DT-3 U-Net refinement | a weights pack (`.npz`); **not** torch | classical detection alone, logged as a degradation |
| Training the U-Net | `torch` | inference still runs on a pack trained elsewhere |
| PDF dossier | `weasyprint` | the HTML dossier still ships |
| Real GeoTIFF ingest | `rasterio` (or Pillow) | the synthetic scene path is unaffected |
| React workstation | `node`, once, to build | the pre-React views at `/classic` still serve |

Eight scenarios: `kutch` nominal, `lookalike` and `clean` for gate 1, `wide` for gate 2,
`no-radar` for gate 3, `ambiguous` for gate 4, `short-archive` for gate 5, and `spoofed`
for the kinematic plausibility check.

## The seven stages

Strictly sequential, each writing a typed artefact into `runs/<run_id>/`, so any stage replays from stored input without re-running the ones before it.

| | Stage | Module | Gate |
|---|---|---|---|
| 01 | intake and pre-flight | `incident`, `ais` | 5 · archive coverage |
| 02 | dark-region detection and look-alike rejection | `detect`, `raster` | 1 · detection confidence |
| 03 | characterisation — area, axis, elongation, age | `characterise` | |
| 04 | backward and forward advection | `drift`, `forcing` | 2 · origin region size |
| 05 | traffic replay, cadence baselines, reachable sets | `traffic` | |
| 06 | dark channel — CFAR and AIS matching | `cfar` | 3 · channel availability |
| 07 | five-factor attribution and the dossier | `score`, `dossier` | 4 · leader margin |

## What is real and what is simulated

**Simulated:** the σ⁰ pixel values, the ocean and wind fields, and the AIS traffic. Real AIS for Indian waters is restricted and the problem statement explicitly permits synthetic traffic.

**Real:** everything that reads them. The speckle filter, the land mask, the adaptive threshold, connected components, the six-feature look-alike discriminator **and the fit that produced its coefficients**, the U-Net that refines the boundary **and the training run that produced its weights**, the Sentinel-1 GeoTIFF reader, the PDF renderer, PCA geometry, RK4 advection with leeway and a diffusive random walk, the per-particle forcing ensemble, multi-part density-quantile origin regions, the landfall forecast with land as an absorbing boundary, per-vessel cadence baselines, the kinematic plausibility check, the reachable-set ellipse and its overlap with the region, CA-CFAR with a stated `P_fa`, target-to-AIS matching, the weighted score, all five gates, the dossier and both front ends.

The synthetic scene is not decoration. The slick in it is the **forward-advected release plume** laid along the culprit's own track, so when the pipeline hindcasts it back, it is recovering a truth it was never shown. `runs/<id>/run.json` carries a `truth` block and a `top1_correct` flag; the pipeline never reads either.

### DT-3, the learned detector

The U-Net is now trained and running. It refines candidate boundaries between
`candidates()` and `features()`, so the six discriminator features, the
geometry, the drift seed and the attribution are all computed on whichever mask
is finally in force.

Three properties worth stating, because each one is a constraint rather than a
feature:

**It cannot originate a detection.** The network only redraws inside a dilation
of what the classical pass already proposed. A mis-trained model degrades the
geometry; it cannot invent an incident. Asserted by a test.

**Its numpy forward pass is checked against torch.** Batch-norm is folded into
the preceding convolution at export, which is exactly the step that is silently
wrong, so `verify_export` runs both implementations on the same tensors and
refuses to write the pack if they differ by more than 1e-4. The recorded
agreement is 3.4e-5 and it is printed in the run's detection stage.

**Its holdout is split by source tile, never by patch.** Patches cut from one
scene share speckle statistics, wind field and often the same slick; letting
them straddle the split would report memorisation as generalisation.

Measured on the tile-disjoint holdout: **IoU 0.938, F1 0.968**, at an operating
threshold of 0.70 chosen by sweep. On the nominal incident it gives the true
slick a mean probability of **0.970** and both look-alikes **0.000** — so it discriminates as well as it refines, though only the
refinement is wired into the verdict today. Feeding that probability to the
discriminator as a seventh feature is the obvious next step and is *not* done:
it would require refitting `detector.v1.json`, and claiming it before measuring
it is the kind of thing this document exists to avoid.

### Reading a real scene

`cli ingest FILE [--detect]` reads a calibrated GeoTIFF and runs stage 02 on it.
Round-tripping the nominal scene through a georeferenced float32 dB GeoTIFF
recovers 99.8 m against a true 100 m pixel — the 0.2 % is the tangent-plane
conversion — detects the slick at 19.53 km² with confidence 1.000, and rejects
the low-wind look-alike on `wind_below_threshold`.

It also retains one 0.34 km² false positive that the native path does not, and
the reason is worth stating rather than tuning away: a real scene arrives with
pixels and no wind field, so `wind_proxy_ms` inverts the Bragg relation on a
smoothed σ⁰ to stand in for one. That proxy is good enough to keep a slick from
excusing itself as a calm patch — the whole point of the smoothing — but it is
not a measurement, and the discriminator's wind feature is correspondingly
weaker on it. The fix is a real CMEMS or ERA5 field, which is §18 delta 3, not a
different threshold.

**The corpus.** The shipped pack is trained on the synthetic corpus — real
labels, from a generator we wrote — and `detector.unet.v2.json` says so.
`cli train --corpus zenodo --zenodo DIR` retrains on the *Sentinel-1 SAR Oil
spill image dataset* (Zenodo 8253899 / 8346860 / 13761290, CC-BY-4.0), which is
the dataset the problem statement names: 2048x2048 sigma-nought tiles in
decibels with per-pixel ground truth, plus labelled look-alike and oil-free
tiles. Nothing else changes; the split, the metrics and the export check are
the same harness.

```bash
tools/fetch_zenodo.sh part3                     # 9.9 GB, resumable
7z x data/part3.7z -o data/part3
python3 -m darktransit.cli train --corpus zenodo --zenodo data/part3
```

**The corpus is confirmed available and is not yet in hand.** The records are
open, CC-BY-4.0, and labelled exactly as advertised — which settles open
question 1 in `docs/PS26143_Brief.md`. What has not happened is the download:
Zenodo drops long transfers and then serves the resume at a few hundred KB/s, so
`fetch_zenodo.sh` retries by byte range and is safe to interrupt and re-run.
Part III is the smallest useful record at 9.9 GB, and all three total ~96 GB.

The loader is verified against tiles laid out the way the archive extracts —
class directories, ground truth in a sibling directory with matching stems — and
`cli train --corpus zenodo` runs the whole path end to end on them, including
the torch-to-numpy parity check. What that proves is the plumbing, not a score:
the fixture is four tiles and any metric from it would be meaningless. The
holdout numbers quoted above are the synthetic corpus, and they say so.

## The API

A stdlib HTTP server standing in for FastAPI, same routes as PRD §12.

```
GET  /                          the narrative view
GET  /run.json                  the latest run
GET  /runs                      list run ids
GET  /runs/{id}/run.json        one run
GET  /runs/{id}/artifacts/{n}   one stage artefact  (intake|detection|geometry|drift|traffic|dark|attribution)
GET  /runs/{id}/dossier.html    the report
GET  /runs/{id}/log             the run log, one JSON line per stage and gate decision
GET  /runs/{id}/{file}          any other file the run emitted: the scene rasters, cloud.json
POST /runs/{id}/rescore         {"weights": {...}} -> re-ranked shortlist
```

`/rescore` is a pure function of stored artefacts: weights change ranking and nothing upstream of stage 7 depends on them. That is what lets a weight slider in the interface re-rank instantly. There is deliberately no transmit endpoint — sending a dossier to an enforcement body is a human action with a human name attached.

## The weight pack

`weights.v4.json` is the only place the five scoring weights live. Weights normalise on read, so one can be moved without rebalancing the rest. Pass another pack with `--weights path.json`.

Any weighting is an assumption, so the interface exposes it: drop `heading` to zero and watch the leader margin collapse. That is an honest statement about how much the conclusion rests on one geometric argument, and `cli ablate` measures it for every factor at once.

## Layout

```
darktransit/
  geo.py           tangent plane, polygon predicates, the reachable-set ellipse
  raster.py        box statistics, Lee filter, morphology, labelling, contour tracing
  forcing.py       gridded current and wind, trilinear space-time interpolation
  drift.py         RK4 advection, diffusion, ensemble, r95, density-quantile region
  scene.py         synthetic calibrated sigma-nought scene
  ais.py           synthetic AIS: vessels, tracks, cadences, broadcast gaps
  incident.py      the truth side — scenarios, the release, the fleet, the scenes
  detect.py        candidates, six features, logistic discriminator, verdicts
  characterise.py  area, perimeter, principal axis, elongation, age
  traffic.py       cadence baselines, gap detection, reachable sets, the join
  cfar.py          CA-CFAR, length estimation, AIS matching
  score.py         the five factors, the weighted mean, ranking, ablation
  gates.py         the five refusals
  dossier.py       the report, limitations first
  pipeline.py      the spine
  server.py        the HTTP service
  cli.py           the entry point
  fit.py           labelled corpus, discriminator fitting, holdout metrics
  validate.py      the AC-7 drift-validation method
  png.py           PNG encoder, stdlib zlib -- the basemap has to reach a browser
  tests.py         primitives, capabilities, acceptance criteria -- 66 checks
  unet.py          the U-Net forward pass, in numpy
  train_unet.py    fitting it in torch, and proving the numpy export matches
  detect_ml.py     DT-3: boundary refinement, between candidates() and features()
  pdf.py           the dossier as PDF, WeasyPrint behind a capability check
  readers/
    sentinel1.py   real Sentinel-1 GeoTIFF -> Scene, the section 18 delta 1 seam
web-app/           React + Vite + TypeScript + MapLibre workstation
  src/components/Chart.tsx       the chart: SAR, slick, drift, tracks, reachable sets
  src/components/Transport.tsx   the time control that plots its own uncertainty
  verify.mjs                     24 headless checks against a running pipeline
web/index.html         the narrative view, reading run.json     (served at /classic)
web/workstation.html   the pre-React analyst tool
weights.v4.json          the weight pack
detector.v1.json         the fitted discriminator pack, with its holdout metrics
detector.unet.v2.npz     the DT-3 weights -- numpy loads this, torch is not needed
detector.unet.v2.json    how those weights were trained, and what they scored
runs/              run artefacts (gitignored)
```

## The workstation

```bash
cd web-app && npm install && npm run build      # once
cd .. && python3 -m darktransit.cli serve       # UI and API on one origin
```

React 19, Vite, TypeScript, MapLibre GL. It reads `run.json` and holds no
incident knowledge of its own — `verify.mjs` proves that by fetching the run
from the API and checking that no vessel name, MMSI or timestamp from it
appears anywhere in the built bundle.

**There is no basemap.** No tile server is reachable at a venue, and a chart
that needs one is a chart that fails when it matters. The sea is a flat S-52
night fill, the land is the run's own coastline, and the imagery is the run's
own georeferenced SAR raster. Everything drawn is evidence.

**The time control is the honest part.** Its track is not a groove — it is a
plot of r95, the radius containing 95 % of the particle cloud, against time. Scrub
back and the envelope widens under the handle, from 3.4 km at detection to
14.1 km forty hours earlier. The control renders the growing uncertainty of its
own answer, which is the one thing a confident dot at the origin would hide.

```bash
cd web-app && node verify.mjs http://127.0.0.1:8000    # 24 checks, screenshots to shots/
```
