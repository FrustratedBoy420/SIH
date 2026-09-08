# Dark Transit — reference implementation

A runnable pipeline for SIH26143: one SAR scene and one AIS archive in, a ranked vessel shortlist and a dossier out.

**Dependencies: numpy.** Nothing else. No network. Deterministic under a recorded seed.

```bash
python3 -m darktransit.cli scenarios       # what each incident demonstrates
python3 -m darktransit.cli run             # nominal incident, ~6 s
python3 -m darktransit.cli selftest        # 48 checks: primitives, properties, PRD section 19
python3 -m darktransit.cli ablate          # re-rank with each factor zeroed in turn
python3 -m darktransit.cli fit             # refit the discriminator and measure it, ~3 min
python3 -m darktransit.cli validate        # hindcast known drifter tracks, ~20 s
python3 -m darktransit.cli serve           # http://127.0.0.1:8000/ and /workstation.html
```

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

**Real:** everything that reads them. The speckle filter, the land mask, the adaptive threshold, connected components, the six-feature look-alike discriminator **and the fit that produced its coefficients**, PCA geometry, RK4 advection with leeway and a diffusive random walk, the per-particle forcing ensemble, multi-part density-quantile origin regions, the landfall forecast with land as an absorbing boundary, per-vessel cadence baselines, the kinematic plausibility check, the reachable-set ellipse and its overlap with the region, CA-CFAR with a stated `P_fa`, target-to-AIS matching, the weighted score, all five gates, the dossier and both front ends.

The synthetic scene is not decoration. The slick in it is the **forward-advected release plume** laid along the culprit's own track, so when the pipeline hindcasts it back, it is recovering a truth it was never shown. `runs/<id>/run.json` carries a `truth` block and a `top1_correct` flag; the pipeline never reads either.

Not implemented, and logged as a degradation when the run starts: the fine-tuned U-Net of DT-3. The classical path plus the fitted linear discriminator stand in, and `02_detection.json.discriminator` records whether the coefficients in force are `fitted` or `hand-set`. See PRD §22 for the full traceability table.

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
  tests.py         primitives, properties, acceptance criteria -- 48 checks
web/index.html         the narrative view, reading run.json
web/workstation.html   the analyst tool: SAR basemap, time slider, live weights, run log
weights.v4.json    the weight pack
detector.v1.json   the fitted discriminator pack, with its holdout metrics
runs/              run artefacts (gitignored)
```
