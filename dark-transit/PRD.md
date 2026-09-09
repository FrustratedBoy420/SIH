# Dark Transit — Product Requirements Document

**Problem statement:** SIH26143 · *Leveraging satellite imagery to determine oil spills at sea along with AIS data correlations to identify the vessel responsible*
**Organisation:** National Technical Research Organisation (NTRO) · **Category:** Software · **Theme:** Disaster Management
**Revision:** B (supersedes the rev A interface study in `artifacts/dark-transit-prd.html`)
**Date:** 7 September 2026 · **Portal closes:** 20 September 2026

---

## Document control

| | |
|---|---|
| Status | Working draft, binding on the build |
| Owner | Tech lead |
| Supersedes | `artifacts/dark-transit-prd.html` (rev A, narrative form) |
| Companion artefacts | `artifacts/dark-transit-workstation.html` (analyst UI study), `artifacts/forty-hours-back.html` (narrative study, now wired live in `mvp/web/`) |
| Implements | `mvp/` — runnable reference pipeline, §22 |
| Source PS text | `docs/PS26143_Brief.md` |

**How to read this.** §1–§7 are orientation and can be read by a non-specialist. §8–§13 are the build contract: requirement IDs here are the IDs used in code, tests and the run log. §14–§21 are execution. §22 states exactly which parts of this document the MVP in this repository already implements, and which are still targets — read it before quoting any capability as done.

**On numbers.** Every figure in §17 is a **target, not a measurement**, until an experiment has been run and recorded. Presenting a target as a result is an integrity failure and judges do check. The MVP's own measured outputs live in `mvp/runs/<run_id>/`, and are the only numbers in this project that may be quoted as achieved.

---

## Table of contents

**Part I — Orientation**
1. [Summary](#1-summary)
2. [Problem and context](#2-problem-and-context)
3. [The ask, decoded](#3-the-ask-decoded)
4. [Positioning: the three claims](#4-positioning-the-three-claims)
5. [Goals and non-goals](#5-goals-and-non-goals)
6. [Users](#6-users)
7. [Domain primer and glossary](#7-domain-primer-and-glossary)

**Part II — The build contract**
8. [Architecture](#8-architecture)
9. [Functional requirements](#9-functional-requirements)
10. [Algorithms in detail](#10-algorithms-in-detail)
11. [Data model and artefact schemas](#11-data-model-and-artefact-schemas)
12. [API contract](#12-api-contract)
13. [Interface specification](#13-interface-specification)

**Part III — Execution**
14. [Data sources](#14-data-sources)
15. [Stack and rejected alternatives](#15-stack-and-rejected-alternatives)
16. [Non-functional requirements and dual-use safety](#16-non-functional-requirements-and-dual-use-safety)
17. [Validation and metrics](#17-validation-and-metrics)
18. [Build order, phases, team](#18-build-order-phases-team)
19. [Acceptance criteria](#19-acceptance-criteria)
20. [Risk register](#20-risk-register)
21. [Open questions](#21-open-questions)

**Part IV — This repository**
22. [MVP scope and traceability](#22-mvp-scope-and-traceability)
23. [Appendix: notation and references](#23-appendix-notation-and-references)

---
---

# Part I — Orientation

## 1. Summary

Dark Transit takes **one synthetic-aperture radar scene** and **one AIS archive**, and returns a **ranked shortlist of vessels** that could have produced the oil slick in that scene — with a per-factor score breakdown, an explicit uncertainty region rather than a point, and a generated dossier whose first page states what the analysis cannot establish.

**The one line.** Everyone else detects the spill. We reconstruct the crime scene and name the suspects — with the limits of that naming printed above the finding, not buried under it.

**Why that framing wins this problem statement.** Clause (a) of the PS — detect the slick — is a solved research problem with a labelled public dataset named in the PS itself. It is where most teams will spend their time and where the marks are cheapest. Clause (c) — attribute the slick to a hull — is where the PS author put the unsolved part, and most teams will arrive there with two hours left. The build order in §18 inverts that allocation deliberately.

---

## 2. Problem and context

Ships generate oily bilge and slop-tank residue. Discharging it at sea is free; landing it at a port reception facility costs money and time alongside. Deliberate operational discharge is therefore common, and it is illegal under **MARPOL Annex I** — which caps oil content in any discharge from machinery spaces at 15 ppm and forbids discharge entirely inside special areas.

Enforcement fails at a specific, identifiable point. Satellite radar finds the slick hours or days after the fact. By then:

- the vessel has left, often across a jurisdictional boundary;
- the slick has spread over tens of square kilometres and drifted tens of kilometres from where it was poured;
- there is no chain of custody from the observed feature back to a hull.

So the gap is not detection. The gap is the step from *there is oil here* to *this hull put it here*. That step is a chain of three inferences:

1. **Where and when did it start?** — invert the drift.
2. **Who was there then?** — replay historic AIS over that region and window.
3. **Is their behaviour consistent with having poured it?** — score geometry, timing and broadcast behaviour.

Each link is uncertain, and the uncertainty compounds. A product that hides that compounding produces an accusation. A product that reports it produces evidence. Dark Transit is built to be the second thing, and §16 makes that a set of testable requirements rather than a disclaimer.

### Scale, for the deck

Operational discharges are estimated to contribute a substantially larger share of chronic marine oil input than headline tanker casualties do — the casualties are visible and rare, the discharges are invisible and continuous. India's EEZ spans roughly 2.3 million km² across two coasts and two of the world's busiest tanker corridors (the Gulf of Kutch approaches and the Palk Strait / Gulf of Mannar). Sentinel-1 revisit over that area is on the order of days, not hours, so **any workable system must reason backwards in time.** That is the whole thesis of this product.

> Cite specific tonnages only from a source you have actually read. Do not carry a number into the deck from this paragraph.

---

## 3. The ask, decoded

### 3.1 Official text, verbatim

> "Participants are to design an intelligent automated pipeline to do the following:
> **(a)** Detect and characterise the oil spill and calculating geometric properties and age if feasible.
> **(b)** Using oceanographic and meteorological data, it is envisaged to trace the slick towards the origin point and time, predict the future flow of the slick, and
> **(c)** analyse and attribute the spill to a vessel using historic AIS data to reconstruct vessel traffic around the origin window in space and time. The irrelevant traffic is to be filtered out and potential suspect vessels are to be scored considering various aspects such as proximity, trajectory, behavioural anomalies etc."
>
> "An automated detection and hindcasting machine learning model … It also ranks potential culprit vessel based on spatio-temporal correlation with AIS data. A suitable visual interface is also to be developed."

### 3.2 Requirement decomposition

Read past the phrase "machine learning model" and look at where the difficulty actually sits.

| Clause | What it really is | Novel ML? | Where the risk sits |
|---|---|---|---|
| (a) detect | Semantic segmentation on SAR + look-alike discriminator | Fine-tune only | Look-alike false positives, not detection |
| (a) characterise | Polygon geometry — PCA, moments, perimeter | No | "Age if feasible" is under-specified in the PS |
| (b) hindcast | Lagrangian particle advection through a reanalysis velocity field | No | Backward diffusion is ill-posed |
| (b) forecast | Same integrator run forward + coastline intersection | No | Low — this direction is well-posed |
| (c) filter | Spatio-temporal join | No | Low |
| (c) score | Declarative weighted rule pack over derived features | No | Defensibility of the weights |
| interface | React + MapLibre workstation | No | Low |

**Two consequences shape the whole plan.**

1. The team's weakest axis — training novel models — is barely loaded. One component is a fine-tune with a public recipe and a public dataset.
2. The crowded half of the PS is clause (a). The half that decides the round is clause (c).

### 3.3 What the PS does *not* ask for, that we build anyway

- **A dark channel** (§10.12). The same SAR scene that shows the slick shows ships as bright point targets, whether or not they broadcast. This gives a second, transponder-independent channel. The PS does not mention it. It is the differentiator.
- **Refusal gates** (§10.14). The PS asks for a ranking. It does not ask the system to decline to rank. Declining, legibly, when the evidence does not support a conclusion is what makes the ranking worth anything.

---

## 4. Positioning: the three claims

An oil-spill detector is a commodity. ESA, EMSA's CleanSeaNet and a long tail of published papers already do it, and a judge has seen the dark-patch-on-radar slide before. What nobody hands them is the chain from that patch to a hull. Three claims carry the product.

### Claim one — the slick's shape is a bearing

A discharge made **under way** is a line source: the ship lays film along its own track while moving. The resulting slick is elongated, and its **principal axis is a heading**.

Comparing that axis against each candidate's course over ground is:
- the single most discriminating factor in the model (§10.13);
- cheap — one PCA on the detection mask;
- **independent of the drift reconstruction being right**, because advection translates and stretches the patch but, over the hours involved and in a locally coherent flow, does not arbitrarily rotate its long axis.

That last property is the important one. Every other factor inherits the hindcast's error. This one largely does not.

> Caveat to state out loud: in a region of strong horizontal shear the axis *does* rotate. The pipeline reports the local shear magnitude alongside the heading factor, and the factor's written justification says so when shear is high. See HD-3 in §9.

### Claim two — silence is a signal, scored against the vessel's own baseline

A Class A transponder reports position every 2–10 seconds under way. A hull that goes dark on approach to the origin region and resumes after leaving it has produced an anomaly.

The naive version of this factor — "flag any gap longer than N minutes" — is worthless, because satellite AIS coverage genuinely thins offshore and half the ocean would light up. The defensible version scores each gap **against that vessel's own median reporting cadence over the archive**. A hull that normally reports every 3 seconds and then stops for 2 h 40 m has deviated from itself. That is a statement about one ship, not about coverage.

### Claim three — a hull is bright on radar whether or not it speaks

Metal returns radar hard. Running a **CFAR** detector over the same scene yields ship targets independently of AIS, and matching those returns against AIS positions interpolated to acquisition time yields matched and **unmatched** counts. An unmatched bright return inside the origin envelope is corroboration that survives a switched-off transponder.

Strict rule, enforced in code by DK-4: **an unmatched radar return is never promoted to a named suspect.** It has no identity. It may only corroborate a vessel already ranked through AIS.

### Where the marks are

Clause (c) is worth more than clause (a) because that is where the PS author placed the unsolved part. §18's build order reflects it: detection is scheduled **fourth**, so a slow model cannot take the demo down with it.

---

## 5. Goals and non-goals

### Goals

- **G-1** Given one SAR scene and an AIS archive covering the drift horizon, produce a ranked vessel shortlist with a per-factor breakdown, unattended, in one command.
- **G-2** Express every spatial output as a **region** and every temporal output as a **window** — never a point, never an instant — and show the uncertainty growing as the hindcast runs back.
- **G-3** Refuse, explicitly and legibly, when the evidence does not support a conclusion (§10.14). A halt is a successful outcome.
- **G-4** Emit a dossier whose **first page is the limitations, above the finding**.
- **G-5** Keep every scoring weight in a versioned JSON pack, editable live in the interface, so a reader can see how much the conclusion depends on any single assumption.
- **G-6** Make a run reproducible from its manifest: same inputs and same weight pack produce byte-identical scores.

### Non-goals

- **NG-1** Not a real-time monitoring service. One incident, one scene, one window.
- **NG-2** Not a finding of legal responsibility. No output may be worded as one (RP-3 makes this checkable).
- **NG-3** Not an oil weathering / fate-and-transport model. We advect and diffuse. We do not model evaporation, emulsification, dispersion or biodegradation beyond what OpenDrift gives for free.
- **NG-4** Not a global AIS ingest. One region, one archive, one 72-hour window.
- **NG-5** Not a spoofing detector. We note that AIS can be forged and we score kinematic plausibility; we do not claim to catch a careful spoof.
- **NG-6** Not a vessel-identification-from-imagery system. The dark channel estimates length; it does not name ships.

---

## 6. Users

| Who | What they need from it | What loses their trust |
|---|---|---|
| **NTRO imagery analyst** *(primary)* | To see *why* one candidate was retained and thirteen rejected; to re-run with different weights; to know which stage a confidence came from. | A single confidence number with no decomposition. A model that will not say "look-alike". |
| **MRCC / Coast Guard watch officer** *(primary)* | Forward drift and time-to-coast so a response can be staged. To them the forecast matters more than the shortlist. | An origin region so large it constrains nothing, presented as though it does. |
| **DG Shipping enforcement** *(downstream, receives the dossier)* | A document that survives being questioned: method, parameters, weight-pack version, and an explicit statement of what it cannot establish. | Anything that reads like an accusation. A number they cannot reproduce. |

### Jobs to be done

- *"A scene came down four hours ago. Is there oil in it, and if so is it actually oil?"* → stages 1–2, Gate 1.
- *"Where did it come from and is it going to hit the coast?"* → stage 4, forward run, landfall flag.
- *"Give me a short list I can justify tasking a patrol against."* → stages 5–7.
- *"A shipowner's lawyer is asking how you got this."* → the dossier, the weight pack version, and the run manifest.

---

## 7. Domain primer and glossary

Written for a reader with no remote-sensing or maritime background. Every term used later is defined here.

### 7.1 How radar sees oil

A SAR satellite illuminates the sea with microwaves and measures what comes back. Over open water the return is dominated by **Bragg scattering**: small wind-driven capillary and short gravity waves, of a wavelength resonant with the radar, throw energy back toward the sensor. Rougher sea, brighter image.

An oil film **damps** those short waves. The surface flattens locally, the Bragg resonance collapses, energy scatters forward and away instead of back, and the slick arrives in the image as a **dark region — a hole**.

That is the entire detection principle, and it is also the entire difficulty, because the following are also holes:

| Look-alike | Why it is dark | How we separate it |
|---|---|---|
| Low-wind cell | Below roughly 3 m/s there are no Bragg waves to damp | Wind field at the pixel (ERA5, or CMOD5-derived) |
| Algal / biogenic film | Natural surfactant, damps the same waves | Edge sharpness, shape complexity, seasonality |
| Rain cell | Attenuation and surface splash | Shape, co-located precipitation |
| Wind shadow / lee of a headland | Sheltered water | Proximity to coast, wind direction |
| Grease ice, upwelling | Various | Region and season priors |

The single most useful discriminator in practice: **a spill has a sharp boundary because it is a physical film with an edge; a low-wind cell fades.** That is an edge-gradient measurement and it removes most false positives before any model is consulted.

### 7.2 What AIS is

**AIS** (Automatic Identification System) is a VHF broadcast every large vessel transmits continuously: identity, position, course and speed. Two message families matter here.

- **Dynamic** (types 1/2/3, 18/19): MMSI, latitude, longitude, timestamp, **SOG** (speed over ground, knots), **COG** (course over ground, degrees true), true heading, navigational status. Class A under way reports every 2–10 s depending on speed and rate of turn.
- **Static** (type 5, 24): MMSI, IMO number, name, call sign, **ship type**, dimensions (length, beam), draught, destination, ETA.

Carriage is mandatory under SOLAS V/19 for vessels ≥ 300 GT on international voyages, ≥ 500 GT otherwise, and all passenger ships. **Below that threshold, nothing is broadcast** — which is NFR-3: their absence is evidence of nothing.

Received either terrestrially (coastal, ~40 nmi) or by satellite (**S-AIS**, global but with genuinely patchy coverage and message collision in dense traffic). This is why gaps must be scored against a per-vessel baseline (§10.10).

### 7.3 How oil moves

To first order, and this is standard operational practice rather than a shortcut:

```
u_oil  =  u_current  +  α · u_wind10
```

where `u_current` is the surface current, `u_wind10` the wind at 10 m, and `α` the **leeway coefficient**, conventionally ≈ 0.03 (3 %). On top of that deterministic drift sits **turbulent diffusion**, modelled as a random walk with horizontal eddy diffusivity `K_h`.

Running this **forward** is well-posed. Running it **backward** is not — see §10.8, which is the most important paragraph in this document.

### 7.4 Glossary

| Term | Meaning |
|---|---|
| **σ⁰ (sigma nought)** | Normalised radar backscatter coefficient, dB. The calibrated pixel value. Sea ≈ −8 to −14 dB; slick ≈ −20 to −26 dB. |
| **GRD** | Ground Range Detected — Sentinel-1 product, multi-looked, projected to ground range. Our input. |
| **IW** | Interferometric Wide swath — Sentinel-1's default 250 km mode, 10 m pixel spacing. |
| **VV / VH** | Polarisation: transmit-vertical/receive-vertical, transmit-vertical/receive-horizontal. VV is the standard choice for slick detection. |
| **Speckle** | Multiplicative noise inherent to coherent imaging. Removed with a refined Lee filter. |
| **CFAR** | Constant False Alarm Rate — adaptive-threshold target detector that holds a stated false-alarm probability against a local clutter estimate. |
| **Leeway (α)** | Fraction of the 10 m wind that adds to a floating object's drift. ≈ 0.03 for oil. |
| **K_h** | Horizontal eddy diffusivity, m²/s. Sets the random-walk spread. |
| **Hindcast** | Running the drift model backward in time. |
| **Reachable set** | The region an object *could* have occupied given a bound on its speed. Not a probability density. |
| **r₉₅** | Radius containing 95 % of the particle cloud. Our headline uncertainty number. |
| **Origin region** | The space–time region the slick could have come from. Never called an origin *point*. |
| **Leader margin** | Score gap between rank 1 and rank 2. Gate 4 fires below 0.10. |
| **MMSI** | Maritime Mobile Service Identity — the 9-digit AIS ship identifier. |
| **MARPOL Annex I** | The IMO convention chapter governing oil discharge from ships. |
| **MRCC** | Maritime Rescue Coordination Centre. |
| **Weight pack** | Versioned JSON file holding the five scoring weights. The only place they live. |

---
---

# Part II — The build contract

## 8. Architecture

### 8.1 Seven stages

Strictly sequential. Three can halt the run. **Every stage writes a typed artefact to the run directory**, so any stage can be replayed against a stored input without re-running the ones before it — which is also what makes the demo robust when a download stalls.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │ 01 INTAKE          scene + AIS archive + forcing                       │
  │                    pre-flight: CRS declared, archive spans horizon,    │
  │                    forcing responded, provenance recorded              │
  │                    ── GATE 5 ────────────────────────── can halt       │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 02 DETECTION       calibrate → speckle filter → land mask →            │
  │                    adaptive threshold → candidates → look-alike        │
  │                    rejection → confidence with named drivers           │
  │                    ── GATE 1 ────────────────────────── can halt       │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 03 CHARACTERISE    area · perimeter · centroid · principal axis ·      │
  │                    elongation · two independent age estimates          │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 04 HINDCAST        seed particles → RK4 backward 40 h through          │
  │       + FORECAST   current + α·wind + random walk → origin region      │
  │                    as space–time density, r₉₅ per hour;                │
  │                    same integrator forward → landfall flag             │
  │                    ── GATE 2 ────────────────────────── can halt       │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 05 TRAFFIC         AIS replay → spatio-temporal join → per-vessel      │
  │                    cadence baseline → gap detection → reachable        │
  │                    set across each gap → overlap fraction              │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 06 DARK CHANNEL    CFAR bright targets → length estimate →             │
  │                    match against interpolated AIS → unmatched set      │
  │                    ── GATE 3 ─────────────────── degrades, not halts   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ 07 ATTRIBUTION     five-factor weighted score → rank → leader margin   │
  │       + DOSSIER    → PDF, limitations on page 1                        │
  │                    ── GATE 4 ─────────────────── can decline to name   │
  └────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Design principles

1. **A halt is a successful outcome.** Gates are features, demonstrated deliberately, not error paths.
2. **Typed artefact per stage.** Stage *n* reads only stage *n−1*'s artefact. No hidden state, no in-memory coupling.
3. **No bare numbers.** Every score, confidence and verdict carries its drivers and a written justification (NFR-1).
4. **Region, not point.** Enforced at the type level: the origin artefact has no `origin_point` field to fill in (G-2).
5. **Weights are data.** `weights.v4.json`, versioned, hashed into the run manifest.
6. **Deterministic.** One seed, recorded in the manifest, drives every stochastic step.

### 8.3 Run directory layout

```
runs/<run_id>/
  manifest.json        inputs, parameters, weight-pack hash, seed, versions
  01_scene.json        scene metadata + calibration record
  02_detection.json    candidate table, verdicts, rejection bases, confidence
  03_geometry.json     polygon, area, axis, elongation, both age estimates
  04_drift.json        origin region per hour-back, r95 series, forward landfall
  05_traffic.json      vessels in window, cadence baselines, gaps, reachable sets
  06_dark.json         CFAR targets, matches, unmatched, availability verdict
  07_attribution.json  factors, scores, ranks, leader margin, justifications
  run.json             flattened view for the web front end
  dossier.html         the report; limitations page first
  log.jsonl            one line per stage and per gate decision
```

`run_id` format: `<incident>-<YYYYMMDDTHHMMSS>-<8 hex of manifest hash>`.

---

## 9. Functional requirements

MoSCoW against the grand-finale build. **Must** means the demo does not exist without it. These IDs appear in code, in the run log, and in §22's traceability table.

### IN — Intake and pre-flight

| ID | Requirement | Priority |
|---|---|---|
| IN-1 | Ingest a Sentinel-1 GRD product (IW, VV/VH), read CRS and pixel spacing, subset to an AOI. | Must |
| IN-2 | Apply radiometric calibration to σ⁰ and record the noise floor in the run log. | Must |
| IN-3 | Ingest an AIS archive (NMEA or CSV) and normalise to a position table keyed on (MMSI, timestamp). | Must |
| IN-4 | Pre-flight refuses to start unless: AIS archive spans the full drift horizon, CRS is declared, forcing sources responded. | Must |
| IN-5 | Declare in the run log **and on dossier page 1** whether AIS is real or synthetic. | Must |
| IN-6 | Accept RISAT or any other calibrated σ⁰ product through the same path. | Could |
| IN-7 | Record the SHA-256 of every input file in the manifest. | Should |

### DT — Detection

| ID | Requirement | Priority |
|---|---|---|
| DT-1 | Speckle-filter (refined Lee) and land-mask the calibrated scene. | Must |
| DT-2 | Adaptive threshold producing dark-region candidates; report the candidate count. | Must |
| DT-3 | Segment candidates with U-Net or DeepLabv3 on a pretrained encoder, fine-tuned on the Zenodo Sentinel-1 oil-spill dataset. **No architecture is to be invented.** | Must |
| DT-4 | Reject look-alikes on explicit, individually reported criteria: edge-gradient sharpness, wind speed at pixel, shape complexity, contrast ratio. | Must |
| DT-5 | Emit a confidence value with its drivers named — never a bare number. | Must |
| DT-6 | Derive the DT-4 wind field from ERA5; upgrade to SAR-derived wind via CMOD5 if time allows. | Should |
| DT-7 | Report the **full candidate table with per-candidate rejection reason**, not only the survivor. | Should |
| DT-8 | Fuse a co-temporal optical (EO) scene. | Won't |

### CH — Characterisation

| ID | Requirement | Priority |
|---|---|---|
| CH-1 | Area (km²), perimeter (km), centroid in EPSG:4326. | Must |
| CH-2 | Principal axis orientation in degrees true and elongation ratio, from PCA on the mask. | Must |
| CH-3 | Emit the polygon as GeoJSON, EPSG:4326, confidence attached. | Must |
| CH-4 | **Age from lateral spreading:** across-track width grows by diffusion since release, so `t ≈ w²/(32·K_h)`. Independent of the hindcast. | Should |
| CH-5 | Report the age as a **range over a factor-two sweep of `K_h`**, never as a single number, and state in the dossier that the estimate rests entirely on that one constant. | Should |
| CH-6 | Second, physically independent age estimator (damping-ratio decay, or Fay spreading regimes). **Not attempted** — see the honesty note in §10.6. | Won't |

### DR — Drift

| ID | Requirement | Priority |
|---|---|---|
| DR-1 | Seed ≥ 2 000 particles inside the slick polygon. | Must |
| DR-2 | Advect with `u = u_current + α·u_wind10`, α ≈ 0.03, RK4, dt = 600 s. | Must |
| DR-3 | Add a horizontal random walk with eddy diffusivity `K_h`, so the cloud spreads for a physical reason and not a cosmetic one. | Must |
| DR-4 | Run backward to a 40 h horizon; emit the origin region as a space–time density plus a 95 % containment radius per hour. | Must |
| DR-5 | Run forward over the same horizon; flag any coastline the cloud reaches, with time of arrival. | Must |
| DR-6 | Report the growing r₉₅ as a **first-class output**, on screen and in the dossier. | Must |
| DR-7 | Use OpenDrift's OpenOil module; fall back to hand-rolled advection if integration cost is too high. | Should |
| DR-8 | Ensemble over perturbed `α` and current amplitude, drawn per particle. **Not optional in practice:** hindcast uncertainty is dominated by forcing error, not by turbulent diffusion, so without this the region grows like `√t` and stays implausibly tight. | Must |

> **Stated limitation, carry it to the slide.** Forward advection with diffusion is well-posed. Backward is not: diffusion cannot be un-mixed. The backward cloud is a **reachable set** — the region a particle could have come from — and not a probability density over true origins. We use the phrase "origin region", never "origin point", and never quote a probability for a specific launch position.

### TR — Traffic and broadcast behaviour

| ID | Requirement | Priority |
|---|---|---|
| TR-1 | Spatio-temporal join: retain only vessels whose track intersects the origin region **within** the origin window. | Must |
| TR-2 | Report how many vessels were dropped and on what basis, not only how many survived. | Must |
| TR-3 | Compute each vessel's own median reporting cadence over the archive and score gaps **relative to that baseline** — never against a fixed threshold. | Must |
| TR-4 | For each gap, dead-reckon forward from the last fix and backward from the next, bounded by plausible maximum speed, to build a reachable set across the dark period; report its overlap fraction with the origin region. | Must |
| TR-5 | Extract COG through the region for the heading factor. | Must |
| TR-6 | Read ship type and dimensions from AIS static (type 5) for the class prior. | Must |
| TR-7 | Synthetic AIS generator producing a realistic multi-vessel scene with a parameterised culprit, for evaluation and demo. | Must |
| TR-8 | Kinematic plausibility check flagging positions implying impossible speeds. | Should |

### HD — Heading factor safeguards

| ID | Requirement | Priority |
|---|---|---|
| HD-1 | Compare `|COG − axis|` modulo 180°, since a slick axis is undirected. | Must |
| HD-2 | Suppress the heading factor when elongation < 1.6 — a round slick has no meaningful axis. Report the suppression. | Must |
| HD-3 | Report local horizontal shear over the hindcast path; when shear is high, state in the factor justification that axis rotation may have occurred. | Should |

### DK — Dark channel

| ID | Requirement | Priority |
|---|---|---|
| DK-1 | CFAR bright-target detection over the same scene, with guard cells and a stated false-alarm rate. | Should |
| DK-2 | Match targets against AIS positions interpolated to acquisition time; report matched and unmatched counts. | Should |
| DK-3 | Estimate target length from extent, with azimuth-smearing caveats stated. | Should |
| DK-4 | Present an unmatched return as **corroboration** of an already-ranked vessel where geometry agrees — **never** as a separate named suspect. | Must |
| DK-5 | Declare the channel "unavailable", in those words, when no radar pass covers the origin window. | Must |

### SC — Scoring

| ID | Requirement | Priority |
|---|---|---|
| SC-1 | Five-factor weighted score per §10.13, weights loaded from a versioned JSON pack, never hardcoded. | Must |
| SC-2 | Per-factor breakdown with a **written justification** per factor per vessel. | Must |
| SC-3 | Report the **leader margin** as a first-class output. | Must |
| SC-4 | Weights normalise on read, so a reader can move one without rebalancing the rest. | Must |
| SC-5 | Emit the ablation table — top-1 recall with each factor zeroed in turn — as part of evaluation. | Should |

### RP — Report

| ID | Requirement | Priority |
|---|---|---|
| RP-1 | Generate a dossier whose **first page carries the limitations, above the finding**. | Must |
| RP-2 | Record method, parameters, forcing sources, weight-pack version, seed and run timestamp so a reader can recompute. | Must |
| RP-3 | Word every conclusion as a ranking for investigation. The string "responsible for" may not appear in generated output; a test asserts this. | Must |
| RP-4 | State AIS provenance (real or synthetic) on page 1. | Must |

### UI — Interface

| ID | Requirement | Priority |
|---|---|---|
| UI-1 | MapLibre workstation with layers: SAR scene, slick polygon, backward drift, origin region, AIS tracks coloured by rank. | Must |
| UI-2 | Time slider scrubbing the whole incident, driving drift cloud and clock together. | Must |
| UI-3 | Live weight sliders that re-rank on input. | Must |
| UI-4 | Run log visible in the interface, including every gate decision. | Should |
| UI-5 | Narrative walkthrough view for the pitch, driven by the same `run.json` as the workstation — no separately maintained numbers. | Should |

---

## 10. Algorithms in detail

Notation: `x` is a 2-vector position in metres in a local tangent plane; `φ, λ` are latitude and longitude in degrees; `t` is UTC; bold-free lowercase `u` denotes a velocity 2-vector in m/s.

### 10.1 Calibration and speckle filtering

Sentinel-1 GRD digital numbers `DN` convert to σ⁰ by the product's calibration LUT:

```
σ⁰ = DN² / A_σ(i)²          then      σ⁰_dB = 10 · log10(σ⁰)
```

with `A_σ` the range-dependent sigma-nought calibration vector.

**Refined Lee filter.** Speckle in SAR is multiplicative: `I = R · n`, with `E[n] = 1` and `Var[n] = 1/L` for `L` looks. The Lee estimator over a local window is

```
R̂ = Ī + k · (I − Ī)
k  = max(0, (Var[I] − Ī²·C_u²) / Var[I])
C_u² = 1/L
```

The *refined* variant selects, among eight directional sub-windows, the one whose gradient is most homogeneous, so edges survive. **Preserving edges matters more here than anywhere else in the pipeline**, because edge sharpness is the primary look-alike discriminator (§10.3).

### 10.2 Candidate extraction

1. **Land mask** from GSHHG; dilate by 2 km so shoreline artefacts do not survive.
2. **Adaptive threshold.** Global thresholds fail because σ⁰ falls off across the swath with incidence angle. Use a local mean over a window `W` (≈ 5 km) and mark a pixel dark when

   ```
   σ⁰_dB(p)  <  μ_W(p) − k_τ · s_W(p)          k_τ ≈ 2.0
   ```

3. **Connected components** with 8-connectivity; discard components below a minimum area (≈ 0.5 km²) as speckle residue.
4. **Morphological close** with a small structuring element to bridge thin gaps in a film.

Output: candidate table with per-candidate pixel mask. Report the count (DT-2); this is the "14 candidates" in the narrative.

### 10.3 Look-alike discrimination

Per candidate, compute a small, individually reportable feature set:

| Feature | Definition | Spill behaviour |
|---|---|---|
| `edge_gradient` | Mean `|∇σ⁰_dB|` over a 3-pixel band on the boundary | **High** — a film has a physical edge |
| `contrast_db` | `μ_background − μ_candidate`, dB | High, typically 8–14 dB |
| `wind_ms` | ERA5 10 m wind at the centroid | Must exceed ≈ 3 m/s; below that, dark means calm |
| `shape_complexity` | `P² / (4πA)` — 1 for a circle, large for a ragged natural film | Moderate; blooms are more complex |
| `homogeneity` | `s_candidate / μ_candidate` inside the mask | Low — a slick is uniformly dark |
| `elongation` | PCA eigenvalue ratio | High when discharged under way |

Combine with a **logistic** whose coefficients are fitted on the Zenodo holdout, not hand-set:

```
z = β₀ + Σ βⱼ · zscore(featureⱼ)
confidence = 1 / (1 + e^(−z))
```

**DT-5 is a hard requirement:** the emitted confidence must carry the top contributing terms `βⱼ · zscoreⱼ` by magnitude, with sign, so the interface can render "0.87, driven by edge gradient +, wind 5.9 m/s +, homogeneity +". A bare 0.87 is a defect.

Rejection reasons are recorded per candidate (DT-7): `wind_below_threshold`, `edge_too_soft`, `contrast_insufficient`, `area_below_minimum`, `shape_complexity_high`.

### 10.4 Segmentation model (full build)

- **Architecture:** U-Net, ResNet-34 encoder pretrained on ImageNet. DeepLabv3+ as the alternative. Nothing invented.
- **Input:** 256×256 tiles of calibrated, speckle-filtered σ⁰_dB, normalised per scene; VV and, where present, VH as a second channel.
- **Classes:** background, oil, look-alike, ship, land — the Zenodo set's own labelling. **Report per-class IoU, never an aggregate**, because aggregate IoU on a background-dominated set is meaningless.
- **Loss:** Dice + weighted cross-entropy, class weights inverse to pixel frequency.
- **Augmentation:** flips, rotations, and multiplicative speckle injection. No photometric jitter — σ⁰ is a physical quantity.
- **Deployment:** the model *refines* the candidate masks from §10.2; it does not replace the classical pass. If the model fails to load, the pipeline degrades to §10.2 + §10.3 and **says so in the run log**. That degradation path is why detection can be scheduled fourth.

### 10.5 Geometry

Reproject the mask into a local azimuthal equidistant projection centred on the candidate centroid, so areas and lengths are metric and undistorted at this scale.

- **Area** `A` = pixel count × pixel area; report km².
- **Perimeter** `P` from the traced boundary, with the standard 8-connectivity correction (diagonal steps count √2).
- **Centroid** = mean of member pixel coordinates, reprojected to EPSG:4326.
- **Principal axis.** Build the 2×2 covariance of member pixel coordinates:

  ```
  C = (1/N) Σ (xᵢ − x̄)(xᵢ − x̄)ᵀ
  ```

  Eigendecompose. The eigenvector `v₁` of the larger eigenvalue `λ₁` is the principal axis; report its bearing in **degrees true**:

  ```
  axis_deg = (90 − atan2(v₁.y, v₁.x)·180/π)  mod 180
  ```

  The modulo is 180 because a slick axis is undirected (HD-1).
- **Elongation** = `√(λ₁/λ₂)`. HD-2 suppresses the heading factor below 1.6.

### 10.6 Age, and the estimator we do not have

A discharge under way is a line source. Along-track length is roughly `v_ship · duration`; across-track width grows only by lateral diffusion. For a Fickian spread from a line source the across-track standard deviation is `σ_y = √(2·K_h·t)`, so taking the observed width as `w ≈ 4σ_y`:

```
age  ≈  w² / (32 · K_h)
```

This does not use the hindcast, so it is independent of the drift reconstruction. It is **entirely dependent on `K_h`**, which for coastal surface water is known to perhaps a factor of two. The product therefore reports the age as a **range over a factor-two sweep of `K_h`**, and the dossier says in as many words that the estimate rests on one constant.

> **Honesty note.** An earlier draft of this document claimed a second, independent age estimate taken from the hindcast. That was wrong and has been removed. The hindcast tells you *where* the slick was at a given age; it does not tell you the age, because the backward cloud does not converge on a time. Running the same diffusion physics twice — closed form and Monte Carlo — would check the numerics, not the physics, and must not be presented as corroboration. A genuinely independent estimator (damping-ratio decay, or Fay spreading regimes) is CH-6 and is not attempted in this build. Until it exists, this product has **one** age estimate with a wide bracket, and says so.

The origin **window** follows directly: `t_detection − [age_hi, age_lo]`. It is wide, typically ten hours or more. That is the honest width, and narrowing it for presentation would be the single easiest place in this product to lie.

### 10.7 Forcing fields and interpolation

Two gridded, time-varying vector fields: surface current (CMEMS `GLOBAL_ANALYSISFORECAST_PHY`, 1/12°, hourly) and 10 m wind (ERA5, 0.25°, hourly).

Interpolate **trilinearly** in (lon, lat, time) to each particle at each substep. Cache the subset in memory as an `xarray` block for the whole AOI and window — re-reading netCDF per particle per step is the single easiest way to miss NFR-8.

Out-of-domain particles are **retired, counted, and reported**, not clamped to the boundary. Clamping produces a false pile-up on the edge of the domain that reads as a confident origin.

### 10.8 Advection — and why backward is not the same as forward

Particle state `x`. Velocity

```
u(x, t)  =  u_current(x, t)  +  α · u_wind10(x, t),        α = 0.03
```

**RK4** per step of `dt = 600 s` (negative when hindcasting):

```
k₁ = u(x,           t)
k₂ = u(x + dt·k₁/2, t + dt/2)
k₃ = u(x + dt·k₂/2, t + dt/2)
k₄ = u(x + dt·k₃,   t + dt)
x ← x + (dt/6)(k₁ + 2k₂ + 2k₃ + k₄)
```

then a **random-walk** increment for turbulent diffusion:

```
x ← x + √(2·K_h·|dt|) · N(0, I₂)
```

`K_h` ≈ 1–10 m²/s for coastal surface waters; the value used is recorded in the manifest, and DR-8 sweeps it.

#### The paragraph that matters

Forward advection–diffusion is well-posed: given an initial patch, the future distribution is determined. **The backward problem is not.** Diffusion is irreversible — reversing the sign of time in an advection–diffusion equation gives the *anti*-diffusion equation, which is ill-posed and blows up. What our backward integration actually computes is not "where the oil came from, with probability". It is:

> the set of positions from which a particle, subject to this flow and this diffusivity, **could plausibly have reached** the observed slick.

That is a **reachable set**. Consequences, all binding:

- Output is called an **origin region** and never an origin point.
- We never quote a probability for a specific launch position.
- The `r₉₅` series grows monotonically with hours rewound, and that growth is displayed, not hidden (DR-6).
- Past the Gate 2 threshold the region no longer constrains traffic, and the pipeline says so rather than shrinking it to look decisive.

The forward run, by contrast, *is* a legitimate forecast, and the landfall time it produces may be quoted as one.

### 10.9 Origin region construction

At each hour back `h`:

1. Bin surviving particles onto a metric grid (500 m cells).
2. `r₉₅(h)` = radius about the particle-cloud centroid containing 95 % of particles.
3. **Region polygon** = boundary of the smallest set of cells containing 95 % of particles, taken in descending density order — a density quantile contour, not a convex hull. A convex hull over a bimodal cloud invents water that no particle visited.
4. Emit `{hour_back, polygon, r95_km, particle_count}`.

The **origin window** is the time interval over which the cloud's density is above a stated fraction of its peak — in the demo incident, 22:00–02:00 UTC. Report the window, never a timestamp.

### 10.10 AIS normalisation, cadence baselines and gaps

**Normalise** to `(mmsi, t, lat, lon, sog, cog, heading, nav_status)`, deduplicated on `(mmsi, t)`, sorted per vessel.

**Kinematic plausibility (TR-8).** For consecutive fixes, implied speed `d/Δt`; flag anything above the vessel's plausible maximum. Flagged positions are dropped from the track but **reported**, since a burst of them is itself a spoofing indicator.

**Cadence baseline (TR-3).** Per vessel, `c₀ = median(Δt)` over the whole archive. This is the vessel's own normal.

**Gap detection.** An interval `Δt > max(k_g · c₀, Δ_min)` is a gap, with `k_g ≈ 20` and `Δ_min ≈ 15 min` so a vessel with a naturally slow cadence is not penalised for noise. Each gap records `duration`, `baseline_cadence`, and

```
gap_anomaly = clip( log(Δt / c₀) / log(k_max), 0, 1 )
```

so the score is a **ratio against the vessel's own behaviour**, exactly as Claim Two requires.

### 10.11 The reachable set across a gap

This is the part that does real work.

When a transponder goes dark, the vessel does not vanish — it becomes **bounded**. From the last fix `p₋` at `t₋` it can travel no further than `v_max·(t − t₋)`. From the next fix `p₊` at `t₊`, the same constraint runs backward: `v_max·(t₊ − t)`. At any time `t` inside the gap the vessel lies in the intersection of two discs:

```
E(t) = B(p₋, v_max·(t − t₋))  ∩  B(p₊, v_max·(t₊ − t))
```

Swept over the gap, `E = ⋃_t E(t)` is an ellipse-like lens with foci `p₋, p₊` — the set of points `q` satisfying

```
|q − p₋| + |q − p₊|  ≤  v_max · (t₊ − t₋)
```

which is exactly an **ellipse with foci at the two fixes** and semi-major axis `v_max·(t₊−t₋)/2`. That closed form is what the implementation uses; the per-time discs are what the interface animates.

**`v_max` choice (OQ-6):** either design speed by ship class, or the maximum speed actually observed for that hull in the archive, whichever is *smaller* — using the larger inflates the lens and is not conservative in the direction that matters. State which was used.

**Containment contribution:**

```
overlap = area(E ∩ OriginRegion) / area(OriginRegion)
```

Note the denominator. Normalising by the origin region — not by the lens — means a huge lens does not get credit for covering everything; it means the origin region is well covered, which is the actual question.

**The rule, in the dossier, in these words:** a reachable set establishes that a vessel **could** have been at the origin. It never establishes that it was.

### 10.12 The dark channel — CFAR and matching

**CA-CFAR.** For each test cell, estimate clutter from a ring of `N` training cells separated by guard cells (so a large ship's own energy does not raise its own threshold). Declare a target when

```
σ⁰(p)  >  τ · μ_train(p),        τ = N · (P_fa^(−1/N) − 1)
```

with `P_fa` the stated per-cell false-alarm probability (e.g. 1e-6). **State `P_fa` in the dossier**; a CFAR result without its `P_fa` is uninterpretable.

**Length estimate (DK-3).** From the detected blob's extent along the range direction, converted with pixel spacing. Caveat, stated every time: a moving ship smears in **azimuth** proportionally to its radial velocity, so azimuth extent overestimates length. Report a range-derived length and an uncertainty, not a single number.

**Matching (DK-2).** Interpolate each AIS track to scene acquisition time; greedy-match each CFAR target to the nearest AIS position within a gate of `max(3·position_error, 500 m)`. Report matched and unmatched counts. Unmatched targets are the interesting ones — and DK-4 governs what may be said about them.

**Availability (DK-5).** If no radar pass covers the origin window, the channel is declared **unavailable** in that word, and the result is reported as single-channel. Not silently omitted.

### 10.13 The attribution model

Five factors, each normalised to `[0,1]`, combined as a weighted mean.

```
score(v) = Σᵢ wᵢ · fᵢ(v) / Σᵢ wᵢ
```

Default pack `weights.v4.json`:

```json
{ "version": "v4",
  "weights": { "containment": 22, "timing": 18, "heading": 26, "broadcast": 24, "class_prior": 10 } }
```

| Factor | Computed from | Why it discriminates |
|---|---|---|
| **Containment** | Overlap fraction of the vessel's track — or its reachable set across a gap — with the origin region (§10.11) | Direct spatial evidence. Weak alone, because the region is large by construction. |
| **Timing** | Alignment of the crossing, or the dark period, with the hindcast origin window | Cheaply clears vessels that transited hours before the window opened. |
| **Heading** | `|COG − axis|` mod 180°, mapped `f = 1 − Δ/90°` | **Strongest single factor.** A discharge under way lays film along the track; a 40° mismatch is decisive and does not depend on the drift being right. |
| **Broadcast** | Gap duration and placement scored against the vessel's own median cadence (§10.10) | Behavioural rather than geometric, so genuinely independent of the other four. |
| **Class prior** | Ship type and dimensions from AIS static | Weakest, weighted accordingly. A 27 m fishing hull cannot produce a 12 km² slick. |

**Leader margin (SC-3):** `score(rank 1) − score(rank 2)`. First-class output, drives Gate 4.

**Why the weights are exposed.** Any weighting is an assumption, and hiding it invites exactly the question we cannot answer. Putting the sliders in the interface converts the weakness into the demonstration: **drop `heading` to zero in front of a judge and watch the leader margin collapse.** That is an honest statement about how much of the conclusion rests on one geometric argument, and it is worth more than a defended number.

**Ablation (SC-5).** Re-score the synthetic evaluation set with each factor zeroed in turn and report top-1 recall for each. This turns the sensitivity claim into a measurement.

### 10.14 The gates

The product's central claim is that it knows what it cannot establish. That claim is only credible if the refusals are implemented, reachable, and demonstrated. Each gate halts or degrades the run, states its reason in the log and the dossier, and is worth showing deliberately.

| Gate | Condition | Behaviour |
|---|---|---|
| **1 · detection confidence** | confidence < 0.50 | Report a look-alike and **stop**. No origin region, no vessel named. Output is "a dark feature was found and we do not believe it is oil", with the criteria that drove that. |
| **2 · origin region size** | r₉₅ > 36 km | **Drop the spatial filter** and report attribution as unavailable, rather than shrinking the region to look decisive. |
| **3 · dark channel availability** | no radar pass in the origin window | Declare the channel unavailable; continue single-channel, flagged. |
| **4 · leader margin** | rank1 − rank2 < 0.10 | **Name neither.** Report that the evidence does not separate the candidates and return both. Most likely to fire on real data; most worth building. |
| **5 · archive coverage** | AIS archive does not span the drift horizon | **Do not start.** Caught in pre-flight, before compute is spent. A partial archive silently truncates the candidate set, which is worse than not running. |

> **OQ-4 is open:** the 36 km Gate 2 threshold is currently our own judgement, derived from the point at which typical traffic density makes the region non-discriminating. Either ground it in literature or say plainly that it is a design choice with a stated rationale. Do not present a house number as a published one.

---

## 11. Data model and artefact schemas

### 11.1 Entities

| Entity | Key fields |
|---|---|
| **Scene** | `scene_id, sensor, mode, polarisation, acquired_utc, crs, pixel_m, noise_floor_db, aoi_bbox` |
| **Detection** | `detection_id, scene_id, geometry (Polygon, EPSG:4326), confidence, drivers[], verdict, sigma0_delta_db, rejection_basis` |
| **SlickGeometry** | `detection_id, area_km2, perimeter_km, centroid, principal_axis_deg, elongation, axis_usable, length_km, width_km, age_hours, age_hours_lo, age_hours_hi, age_method` |
| **DriftRun** | `run_id, detection_id, n_particles, integrator, dt_s, leeway_alpha, k_h, horizon_h, forcing_current, forcing_wind, seed` |
| **OriginRegion** | `run_id, hour_back, geometry, r95_km, window_start_utc, window_end_utc` |
| **Vessel** | `mmsi, imo, name, ship_type, length_m, beam_m, draught_m, source (real \| synthetic)` |
| **Track** | `mmsi, positions[] (t, lat, lon, sog, cog, heading, nav_status), median_cadence_s` |
| **BroadcastGap** | `mmsi, gap_start_utc, gap_end_utc, duration_s, baseline_cadence_s, anomaly_score, envelope_geometry, overlap_fraction` |
| **RadarTarget** | `target_id, scene_id, position, est_length_m, matched_mmsi (nullable), pfa` |
| **Candidate** | `run_id, mmsi (nullable), factors{}, score, rank, channel, justifications{}` |
| **Dossier** | `run_id, generated_utc, weight_pack_version, gates_fired[], pages, limitations[]` |

**`Candidate.mmsi` is nullable on purpose.** An unmatched radar target is a candidate with no identity, and the model must be able to hold that without inventing one.

### 11.2 `run.json` — the front-end contract

One flattened document, the single source of numbers for both the workstation and the narrative view (UI-5). Stable shape:

```jsonc
{
  "run_id": "IND-2026-0314-KUT-20260907T...-a1b2c3d4",
  "generated_utc": "...",
  "provenance": { "ais": "synthetic", "scene": "synthetic", "forcing": "analytic" },
  "scene":     { "sensor": "...", "mode": "IW", "polarisation": "VV",
                 "acquired_utc": "...", "pixel_m": 10, "noise_floor_db": -22.0 },
  "detection": { "candidates": 14, "retained": 1, "confidence": 0.87,
                 "drivers": [{ "name": "edge_gradient", "contribution": 1.4, "value": 0.62 }],
                 "sea_db": -11.4, "slick_db": -23.8,
                 "table": [{ "id": "C07", "verdict": "rejected",
                             "basis": "wind_below_threshold", "delta_db": 6.1 }] },
  "geometry":  { "area_km2": 18.37, "perimeter_km": 31.2, "principal_axis_deg": 23.1,
                 "elongation": 2.81, "axis_usable": true, "centroid": [69.33, 22.48],
                 "length_km": 8.3, "width_km": 2.8,
                 "age_hours": 14.69, "age_hours_lo": 8.64, "age_hours_hi": 24.49,
                 "age_method": "lateral diffusion width, closed form t = w^2 / (32 K_h)",
                 "polygon": [[lon, lat], ...] },
  "drift":     { "n_particles": 2600, "integrator": "RK4", "dt_s": 600,
                 "leeway_alpha": 0.03, "k_h": 5.0, "horizon_h": 40,
                 "sigma_current": 0.15, "sigma_alpha": 0.25,
                 "r95_series": [{ "hour_back": 0, "r95_km": 3.46 }, ...],
                 "r95_union_km": 14.11, "shear_per_hour": 0.0217,
                 "origin_window": ["...T05:42:36Z", "...T21:33:36Z"],
                 "origin_region": [[lon, lat], ...],
                 "forward": { "landfall": false, "eta_utc": null } },
  "traffic":   { "in_window": 9, "cleared": 8, "gap_flagged": 1,
                 "vessels": [{ "mmsi": "419...", "name": "...", "cog": 47,
                               "delta_axis": 6, "status": "holding",
                               "gap": { "start": "...", "end": "...", "seconds": 9600,
                                        "baseline_cadence_s": 3, "overlap": 0.71 } }] },
  "dark":      { "available": true, "pfa": 1e-6, "targets": 14,
                 "matched": 13, "unmatched": 1, "est_length_m": 118 },
  "attribution": { "weight_pack": "weights.v4.json",
                   "weights": { "containment": 22, ... },
                   "leader_margin": 0.19,
                   "ranked": [{ "rank": 1, "mmsi": "...", "name": "...", "score": 0.81,
                                "factors": { "containment": 0.74, ... },
                                "justifications": { "heading": "COG 047° against axis 041°..." } }] },
  "gates":     [{ "id": 1, "name": "detection_confidence", "fired": false,
                  "detail": "0.87 >= 0.50" }],
  "limitations": [{ "title": "A lens is not a track",
                    "text": "A reachable set establishes that a vessel could have been ..." }, ...]
}
```

Front ends read this and nothing else. **No number may be hardcoded in a view** — that is the rule that keeps the narrative page honest once it is wired to a real pipeline (§22).

---

## 12. API contract

FastAPI, sharing the Python geospatial runtime.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/runs` | Start a run. Body: scene ref, AIS archive ref, parameters, weight pack. Returns `run_id`. |
| `GET` | `/runs/{run_id}` | Run status, current stage, gates fired so far. |
| `GET` | `/runs/{run_id}/run.json` | The §11.2 document. |
| `GET` | `/runs/{run_id}/artifacts/{stage}` | One typed stage artefact. |
| `POST` | `/runs/{run_id}/rescore` | Re-rank with a supplied weight pack. **Pure function of stored artefacts — no re-computation of stages 1–6.** This is what makes UI-3's sliders instant. |
| `GET` | `/runs/{run_id}/dossier.pdf` | The report. |
| `GET` | `/runs/{run_id}/log` | `log.jsonl`, including every gate decision. |

**`/rescore` is deliberately separated from `/runs`.** Weights change ranking only; nothing upstream of stage 7 depends on them. Keeping that boundary sharp is what allows a judge to drag a slider and see the answer move in real time.

**NFR-4 in the API:** there is no `POST /transmit`. Sending a dossier to an enforcement body is a human action with a human name attached, taken outside this system.

---

## 13. Interface specification

### 13.1 Workstation (UI-1 … UI-4) — study in `artifacts/dark-transit-workstation.html`

Seven-stage left rail mirroring §8.1, each stage showing its gate state. Centre is a MapLibre canvas; right is the stage's evidence panel.

- **Intake** — scene picker, AIS archive summary, pre-flight table with pass/caution per check.
- **Detection** — candidate table with per-candidate verdict and rejection basis; σ⁰ profile across the slick boundary.
- **Hindcast** — time slider driving the particle cloud, with the r₉₅ curve plotted underneath and the Gate 2 threshold drawn as a horizontal line the curve visibly approaches.
- **Traffic** — vessel table with COG, Δaxis, status; the gap vessel expands into its reachable-set lens on the map.
- **Attribution** — ranked shortlist, five weight sliders, live leader margin.
- **Dossier** — page preview, limitations page first, export.

### 13.2 Narrative view (UI-5) — study in `artifacts/forty-hours-back.html`

A scroll-driven walkthrough of a single incident for the pitch: surface → the hole → rewind → traffic → the cut → the return → the file → limits.

**Requirement:** it reads the same `run.json` as the workstation. The pitch and the product must never be able to disagree, which they will the moment a number is typed into the page by hand. See §22 for how this was closed in the MVP.

### 13.3 Interface rules

- Every confidence, score and verdict is clickable to its drivers (NFR-1).
- No spatial output renders as a point; no temporal output as an instant (NFR-6).
- AIS provenance badge is always visible, never in a tooltip (NFR-7).
- The run log is a first-class panel, not a debug console (UI-4).

---
---

# Part III — Execution

## 14. Data sources

| What | Source | Note |
|---|---|---|
| SAR imagery | Sentinel-1 GRD via Copernicus Data Space | Free, registration required. IW, 10 m, VV/VH. |
| Labelled spills | Zenodo Sentinel-1 SAR Oil Spill Dataset | Named in the PS. **Verify it downloads and is labelled as advertised — OQ-1.** |
| Surface currents | CMEMS `GLOBAL_ANALYSISFORECAST_PHY`, 1/12°, hourly | Free with account. HYCOM as fallback. |
| Wind | ERA5 10 m, 0.25°, hourly, via CDS API | **Requests queue — pull the region on day one.** |
| AIS format | `marinecadastre.gov` sample | Referenced by the PS for format only. |
| AIS traffic | Synthetic generator (TR-7) | Explicitly permitted by the PS. Declared on dossier page 1. |
| Drift validation | Global Drifter Program trajectories | Real drogued-buoy tracks — the independent check in §17. |
| Coastline | GSHHG / Natural Earth | Land mask and the forward-drift landfall flag. |

---

## 15. Stack and rejected alternatives

| Layer | Choice | Because |
|---|---|---|
| Raster I/O | `rasterio`, `xarray`, `netCDF4` | Standard; xarray handles time-varying forcing grids natively. |
| Detection | PyTorch, U-Net / DeepLabv3, pretrained encoder | Public recipe, public weights, public dataset. |
| Drift | OpenDrift (OpenOil), else numpy advection | Purpose-built; the fallback is ~200 lines. |
| Geospatial | `geopandas`, `shapely`, `pyproj` | The track–region join is one spatial predicate. |
| AIS parsing | `pyais`, `pandas` | Handles NMEA sentence assembly. |
| Scoring | Declarative JSON weight pack | Weights must be editable without a deploy, and versioned for audit. |
| API | FastAPI | Shares the Python geospatial runtime; no second language. |
| Front end | React + Vite + TypeScript + MapLibre GL | Already shipped once by this team. |
| Report | WeasyPrint | HTML to PDF, so the dossier and the web view share one template. |

### Rejected — say these out loud on the slide

- **Not ArcGIS / ENVI.** Licensed, and undeployable to the operational users in §6.
- **Not a from-scratch segmentation architecture.** The dataset is small and the recipe is public; inventing here spends a week to lose accuracy.
- **Not YOLO on the slick.** Object detection returns a box. The task needs a polygon, because the polygon's principal axis is the strongest scoring factor.
- **Not a learned end-to-end attribution model.** There is no labelled corpus of attributed spills to train it on, and a black box cannot produce the per-factor justification that makes the dossier usable.

---

## 16. Non-functional requirements and dual-use safety

This system points at a named vessel. That is the whole value and the whole hazard. The safeguards below are **product requirements with tests**, not a disclaimer appended at the end.

| ID | Requirement |
|---|---|
| **NFR-1** | **Explainability.** Every score carries its factors, their weights, a written justification per factor, and the weight-pack version. No bare numbers anywhere in the product. |
| **NFR-2** | **Ranking, not finding.** Output is a shortlist for investigation. Generated text may not assert responsibility. |
| **NFR-3** | **Absence is not evidence.** Vessels below the AIS carriage threshold broadcast nothing. Stated as a limitation; never scored against anyone. |
| **NFR-4** | **No automated transmission.** The dossier is generated; sending it is a human action with a human name attached. No API endpoint transmits. |
| **NFR-5** | **Reproducibility.** A run is fully described by scene ID, archive, forcing sources, parameters, seed and weight-pack version. Same inputs, same output. |
| **NFR-6** | **Uncertainty is first-class.** No spatial output renders as a point, no temporal output as an instant. |
| **NFR-7** | **Provenance of traffic.** Real vs synthetic AIS is declared in the run log, in the interface, and on dossier page 1. |
| **NFR-8** | **Performance.** A full run over one scene and a 72 h archive completes in under 10 minutes on a laptop, so the demo is live rather than a recording. |
| **NFR-9** | **Demo identities are synthetic.** Every MMSI, name and track in any demo, screenshot or slide is generated and labelled as such. No real vessel is ever shown as a suspect. |

**Tests that enforce these:** `test_no_responsibility_language` (NFR-2/RP-3) greps generated output for a forbidden-phrase list; `test_determinism` (NFR-5) runs the pipeline twice and compares scores exactly; `test_no_point_outputs` (NFR-6) asserts the origin artefact contains no scalar origin coordinate.

---

## 17. Validation and metrics

> **Every figure below is a target, not a result.** Numbers move out of this section only after the experiment has been run and recorded.

The honest difficulty: **no ground-truth dataset of attributed spills exists.** We therefore validate the three stages independently rather than pretending to validate the whole chain.

| Stage | Method | Target | Measured in this build |
|---|---|---|---|
| Detection | Held-out split of the Zenodo dataset. **Per-class IoU**, not an aggregate. | IoU ≥ 0.70 | **0.939 mean IoU on retained**, but against *our own simulator*, not Zenodo — see the caveat below |
| Look-alike rejection | Same holdout, restricted to labelled look-alikes. | FPR ≤ 0.15 | **0.000** (0 of 471 look-alike candidates retained), same caveat |
| Detection precision / recall | Scene-disjoint holdout of the generated corpus | — | precision **1.00** [0.89, 1.00], recall **0.914** [0.78, 0.97], n = 506 candidates, 35 positive |
| **Drift — the real one** | Global Drifter Program buoys: take a drifter's known position, hindcast it backward 24 h through our forcing, measure the distance to its actual position then. **Validates the advection scheme against reality with no spill involved.** | 90 % inside r₉₅ | **Method implemented and running, on synthetic drifters.** 30/30 inside r₉₅, median centroid error 0.14 km against a median r₉₅ of 7.0 km. **This does not satisfy AC-7** — see below. |
| Attribution | Synthetic scenes with an injected culprit, swept over horizon and traffic density. | top-1 ≥ 0.70 @ 24 h | top-1 correct on every scenario that reaches attribution; the sweep is not yet run |
| Refusal | Adversarial scenes built to fire each gate. | 5 of 5 fire | **5 of 5**, plus a sixth scenario for the kinematic check |

### What those detection numbers do and do not mean

They were produced by `darktransit.fit`, which generates a labelled corpus of synthetic scenes, fits the six discriminator coefficients on a **scene-disjoint** training split (never a candidate split — two candidates from one scene share a wind field and a speckle realisation, so splitting by candidate would leak), and evaluates on the held-out scenes.

**They measure the model against our own simulator.** They are a floor on method validity — the pipeline can separate the populations it was shown — and they are not an accuracy claim about Sentinel-1 imagery. Refit on the Zenodo dataset before quoting any of this as detection performance. The pack states this in its own `caveat` field, and the dossier prints the provenance of the coefficients in force.

**Two fitted coefficients disagree with the physics prior**: `wind_ms` and `homogeneity` come out with the opposite sign to what the physics says they should have. Both are small. The honest reading is that they are weakly identified in this corpus — the two strong features, edge gradient and contrast, are doing the work — and not that the physics is wrong. `detector.v1.json` records the disagreement rather than hiding it.

### On the drift validation

The harness runs the AC-7 *method*. It does not satisfy AC-7. The buoys are advected through the same analytic forcing the hindcast then uses, so there is no forcing error for the ensemble to be sized against, and coverage of 30/30 against a 90 % target means the ensemble is **over-dispersed**, not that it is correct: median error 0.14 km inside a median r₉₅ of 7.0 km is a ratio of 0.02.

What it does establish: the integrator round-trips, and the harness is sensitive to a wrong object model. Re-run with `--alpha 0.03` — oil's leeway applied to a drogued buoy — and coverage collapses to 0/30 with a median error of 19.6 km, which is `0.03 × U₁₀ × 24 h` to within a few per cent. A validation that cannot detect a wrong leeway coefficient would be worth nothing; this one detects it at the right magnitude.

AC-7 is satisfied when `validate.drifter_truth` is pointed at real Global Drifter Program trajectories. No other line of that module changes.

### The ablation

Re-score the synthetic evaluation set with each factor zeroed in turn; report top-1 recall for each. This produces the §10.13 sensitivity claim as a **measurement rather than an assertion**, and it is the single most useful table to put in front of a technical judge.

### The negative control

Run the full pipeline on a **clean scene with no spill and ordinary traffic**. The correct output is Gate 1 firing. A system that names a vessel here is worse than useless. This test runs before every demo.

### Sweeps that must be reported

- Hindcast horizon: 6, 12, 24, 40 h → top-1 recall, and the horizon at which Gate 2 starts firing.
- Traffic density: 5, 10, 25, 50 vessels in window → top-1 recall and leader margin.
- Leeway α: 0.02, 0.03, 0.04 → r₉₅ sensitivity.
- `K_h`: 1, 5, 10 m²/s → r₉₅ sensitivity and slick-age bias.

---

## 18. Build order, phases, team

### 18.1 Build order

Each step must stand alone and demo alone before the next connects to it.

1. **Scene on a map.** Load a Sentinel-1 GRD, calibrate, render in MapLibre. Nothing else.
2. **Hand-drawn polygon → drift → origin region.** Hardcode the slick. Get forcing data flowing and the uncertainty growing on screen. *Detection is not involved.*
3. **Synthetic AIS → filter → score → ranked list.** The whole of clause (c), against a hardcoded polygon and a real origin region.
4. **Train the detector** and swap out the hardcoded polygon.
5. **Dark channel** — CFAR and AIS matching.
6. **Dossier** generation.
7. **Gates**, adversarial scenes, ablation, negative control.
8. **Polish** — time slider, weight sliders, run log.

**Why detection is fourth.** It is the only ML component and the only one that can silently consume a week. Everything downstream is buildable and demonstrable against a hand-drawn polygon. If detection underperforms, the system still runs, still ranks, and still demos — and clause (c), where the marks are, is unaffected.

### 18.2 Phases

**Phase 0 — portal submission (now → 20 Sep 2026).** The deliverable is the *idea submission*, not the system.

- Submission deck in the SIH prescribed format.
- A demonstrable vertical slice for credibility — build steps 1–3, which need no trained model. **This is what `mvp/` is.**
- One generated dossier, even against a hardcoded polygon.
- OQ-1 and OQ-2 resolved, because both can invalidate the approach.

**Phase 1 — full build (post-selection → finale).** Build steps 4–7. Detector trained and evaluated, dark channel in, all five gates implemented and covered by adversarial scenes, ablation table produced. §17 metrics move from target to measured, or are removed.

**Phase 2 — grand finale, 36 hours.** *Nothing new is built in 36 hours.* The finale is for the incident walkthrough, one live end-to-end run inside the NFR-8 budget, the negative control, and one deliberate gate firing in front of the judges. Everything else is polish and rehearsal.

### 18.3 Team allocation — 6 members

| Role | Owns | Critical path |
|---|---|---|
| Tech lead | Pipeline spine, run artefacts, gates, dossier | Build steps 2, 6, 7 |
| Remote sensing | Scene ingest, calibration, CFAR dark channel | Build steps 1, 5 |
| ML / CV | Detector fine-tune, look-alike rejection, IoU evaluation | Build step 4 |
| Oceanography / data | CMEMS and ERA5 pulls, OpenDrift integration, drifter validation | Build step 2 — **starts first**, downloads are slow |
| Full-stack | MapLibre workstation, time slider, weight sliders | Build steps 3, 8 |
| Research / deck | MARPOL grounding, submission deck, claims traceability | Phase 0 |

Compliance is mandatory and unforgiving: exactly six members, at least one female member, one idea per team, all from the same institution, no identifying metadata in a blind submission.

---

## 19. Acceptance criteria

| ID | Criterion |
|---|---|
| **AC-1** | Given one SAR scene and an AIS archive, the pipeline runs end to end unattended and emits a dossier. No manual step. |
| **AC-2** | Dossier page 1 carries the limitations above the finding, and names whether AIS was real or synthetic. |
| **AC-3** | Every ranked vessel shows five factor scores, five written justifications, and the weight-pack version. |
| **AC-4** | Moving any weight in the interface re-ranks the shortlist and updates the leader margin, live. |
| **AC-5** | All five gates fire on their adversarial scenes and are reported in the run log. |
| **AC-6** | Negative control: clean scene, ordinary traffic — Gate 1 fires, no vessel named. |
| **AC-7** | Drift validation against ≥ 20 Global Drifter Program trajectories, result reported whatever it is. |
| **AC-8** | Two runs with identical inputs produce identical scores and rankings. |
| **AC-9** | Full run completes in under 10 minutes on the demo laptop. |
| **AC-10** | No generated text asserts responsibility; the forbidden-phrase test passes. |
| **AC-11** | The narrative view and the workstation read the same `run.json`; no number is hardcoded in either. |

---

## 20. Risk register

| ID | Risk | Handling |
|---|---|---|
| **R-1** | Detection is the team's ML gap and can eat a week. | Public dataset, public architecture, pretrained encoder. Scheduled fourth so it cannot block the demo, with a classical fallback path (§10.4). |
| **R-2** | CMEMS and ERA5 downloads are large and queue for hours or days. | Owner assigned day one. Subset to one region and one window immediately. |
| **R-3** | Backward drift is ill-posed and the region may be too large to constrain anything. | That is Gate 2, and it is a feature. Demo it deliberately. |
| **R-4** | Synthetic AIS caps realism and a judge may call it out. | Explicitly permitted by the PS. Say so first, on the slide, before being asked. |
| **R-5** | The Zenodo dataset may not be as advertised. | OQ-1. Verify inside 48 hours; it changes the whole detection plan. |
| **R-6** | Scope creep into full spill forecasting or a monitoring service. | §5 non-goals are binding. One incident, one scene, one 72 h window. |
| **R-7** | The system names an innocent vessel in a demo and the framing is misread as an accusation. | NFR-2, NFR-3, NFR-9, RP-3, Gate 4. All demo identities synthetic and labelled. |
| **R-8** | Thirteen days to the portal is not enough for a trained detector. | It is not meant to be. Phase 0 needs build steps 1–3 only. |
| **R-9** | The heading factor carries the result, and a judge attacks it. | Own it: the weight slider demonstrates the dependency, HD-2 suppresses the factor when the slick is round, HD-3 reports shear. Do not defend it as certain. |
| **R-10** | Someone quotes a §17 target as a measured result. | The section header says target; every number moved out of it must be accompanied by its run record. |

---

## 21. Open questions

| ID | Question | Blocks |
|---|---|---|
| **OQ-1** | Does the Zenodo Sentinel-1 oil-spill dataset actually download, and is it labelled as the PS claims? | DT-3 · **highest** |
| **OQ-2** | Which incident do we hindcast? Needs a documented spill with a known date and a Sentinel-1 pass over it. | §17 validation |
| **OQ-3** | Real AIS for Indian waters, or synthetic? Changes the whole of TR. | TR-7 |
| **OQ-4** | Is the 36 km Gate 2 threshold defensible from literature, or is it our own judgement? Say which. | Gate 2 |
| **OQ-5** | Does OpenDrift integrate inside the timeline, or do we ship hand-rolled advection? | DR-7 |
| **OQ-6** | Plausible maximum speed bound per ship class for the reachable set — design speed, or observed maximum in archive? | TR-4 |
| **OQ-7** | Does the SIH prescribed submission format allow an appendix beyond the main slides? | Phase 0 |
| **OQ-8** | What is the correct width→age constant in CH-5, calibrated against the synthetic generator? | CH-5 |

---
---

# Part IV — This repository

## 22. MVP scope and traceability

`mvp/` is a **runnable reference implementation of build steps 1–3 plus the classical detection path, the dark channel, the gates, the scoring model and the dossier** — everything except the trained segmentation network and the real data pulls. It has **no dependency beyond numpy**, runs offline, and is deterministic under a recorded seed.

Run it:

```bash
cd mvp
python3 -m darktransit.cli run --scenario kutch
python3 -m darktransit.cli selftest              # the acceptance criteria of section 19
python3 -m darktransit.cli fit                   # refit the discriminator and measure it
python3 -m darktransit.cli validate              # hindcast known drifter tracks
python3 -m darktransit.cli serve                 # narrative view, and /workstation.html
```

### 22.1 What is real, and what is simulated

| Component | Status in MVP |
|---|---|
| Calibrated σ⁰ raster | **Simulated** — generated scene with a Bragg-like background, multiplicative speckle, an under-way slick, low-wind cells, a biogenic film and bright ship targets |
| Speckle filter, land mask | **Real** — Lee filter implemented on the generated raster |
| Adaptive threshold, connected components | **Real** |
| Look-alike features and discriminator | **Real** — features per §10.3, logistic combination, per-candidate rejection basis |
| Look-alike discriminator coefficients | **Fitted and measured** — `darktransit.fit` generates a labelled corpus, fits on a scene-disjoint split, and reports precision/recall/FPR/IoU with Wilson intervals into `detector.v1.json`. The detector loads that pack and reports `source: fitted`; absent the pack it falls back to the hand-set constants and says so. |
| U-Net segmentation | **Trained and running (DT-3)** — `unet-s-v1`, 487 009 parameters, fitted by `darktransit.train_unet` in PyTorch and exported to an `.npz` the numpy runtime loads, so inference needs no torch. Boundary refinement only: it runs between `candidates()` and `features()` and works inside a dilation of the classical mask, so it cannot originate a detection. Holdout **IoU 0.630, F1 0.773** on a split made by source tile, never by patch. The batch-norm fold is verified against torch on real tensors before the pack is written (agreement 1.4e-6) and the pipeline refuses to ship weights that disagree. Absent a pack the classical path stands in and the degradation is logged, per §10.4. |
| U-Net training corpus | **Synthetic by default, Zenodo on request** — the shipped pack is trained on generated scenes whose per-pixel labels we control, and `detector.unet.v1.json` records which corpus produced it. `cli train --corpus zenodo` retrains on the *Sentinel-1 SAR Oil spill image dataset* (Zenodo 8253899 / 8346860 / 13761290, CC-BY-4.0) — the dataset this PS names — through the same split, metrics and export check. |
| Geometry, PCA axis, elongation | **Real** |
| Age from lateral spreading, with its `K_h` bracket | **Real** |
| Forcing fields | **Simulated** — analytic tidal + mean current and a rotating wind field on a real grid, interpolated trilinearly like the real thing |
| RK4 advection, leeway, random walk | **Real** |
| Origin region, r₉₅ series, density quantile contour | **Real** |
| Forward run, landfall flag | **Real** — a synthetic coastline, land as an absorbing boundary, first-contact and 5 %-ashore times, cumulative ashore fraction |
| Land mask in detection (DT-1) | **Real** — land is in the raster and is masked with a 2 km buffer before thresholding |
| AIS archive | **Simulated** — generator per TR-7, with a parameterised culprit and a broadcast gap |
| Cadence baseline, gap detection | **Real** |
| Reachable-set ellipse, overlap fraction | **Real** |
| CFAR, length estimate, AIS matching | **Real** on the generated raster |
| Five-factor scoring, weight pack, leader margin | **Real** |
| All five gates | **Real**, each with an adversarial scenario that fires it |
| Dossier, limitations page first | **Real**, HTML **and PDF** — WeasyPrint renders the same print-first template to a six-page A4 file beside it, and the page count in the file is checked against the count the renderer reported. Absent WeasyPrint the HTML still ships and the degradation is logged. |
| Sentinel-1 GRD ingest | **Real reader, no real scene yet** — `readers.sentinel1` turns a calibrated GeoTIFF into the same `Scene` the generator produces, reading CRS, geotransform and radiometry from the file, and refusing to place an ungeoreferenced tile at a guess. What is still simulated is the *imagery*, not the code that reads it. |
| Analyst workstation | **Real** — React 19 + Vite + TypeScript + MapLibre GL, served from the same origin as the API. No basemap: every layer is the run's own evidence. 24 headless checks, including a proof that no vessel name, MMSI or timestamp from the run appears in the built bundle. |
| Drift validation harness | **Real**, on synthetic drifters — the AC-7 method, not AC-7 |
| API | **Stdlib HTTP server** standing in for FastAPI; same routes as §12, plus the run's own files |
| Narrative front end | **Real** — `artifacts/forty-hours-back.html` rewired to read `run.json`; no number is hardcoded |
| Workstation front end | **Real** — `web/workstation.html`, seven stage panels, the SAR scene as the basemap, pan/zoom, a time slider over the whole horizon, live weight sliders, the run log. No map tiles and no network. |

### 22.2 Requirement traceability

| Requirement | MVP | Note |
|---|---|---|
| IN-1…IN-5, IN-7 | ✅ | Synthetic scene and archive, provenance declared everywhere |
| DT-1, DT-2, DT-4, DT-5, DT-7 | ✅ | Classical path |
| DT-3 | ◐ | No U-Net. A **fitted** linear discriminator over six named features stands in, with a measured scene-disjoint holdout |
| DT-6 | ◐ | Wind field present and used by both the scene and the discriminator; the ERA5 pull is Phase 1 |
| CH-1…CH-5 | ✅ | One age estimate, reported as a `K_h` bracket |
| CH-6 | ⬜ | No second independent age estimator exists in this build |
| DR-1…DR-6 | ✅ | Analytic forcing; DR-5 runs a real landfall test against a coastline with land as an absorbing boundary |
| DR-7 | ⬜ | OpenDrift integration is Phase 1 |
| DR-8 | ✅ | Per-particle ensemble over current amplitude and leeway |
| TR-1…TR-8 | ✅ | |
| HD-1, HD-2, HD-3 | ✅ | |
| DK-1…DK-5 | ✅ | |
| SC-1…SC-5 | ✅ | Ablation in `cli ablate` |
| RP-1…RP-4 | ✅ | HTML dossier |
| UI-1, UI-2 | ✅ | Live workstation. The basemap is the emitted SAR raster rather than map tiles, which is offline by construction and shows the measurement instead of a cartoon of it. MapLibre remains Phase 1 and is not needed for the demo. |
| UI-3 | ✅ | Weight sliders re-rank live via `/rescore` |
| UI-4 | ✅ | Run log drawer in the workstation, gate state on every stage in the rail |
| UI-5 | ✅ | Narrative view reads `run.json` |
| NFR-1…NFR-9 | ✅ | Enforced by `mvp/tests` |
| AC-1…AC-6, AC-8, AC-10, AC-11 | ✅ | `python3 -m darktransit.cli selftest` — **48 checks**, including 19 layer-0 primitive and property checks |
| TR-8 | ✅ | A `spoofed` scenario forges a run of positions; the kinematic check flags both seams |
| AC-7 | ◐ | The method runs, on synthetic drifters, and detects a wrong leeway at the right magnitude. Real Global Drifter Program trajectories are still needed. |
| AC-9 | ⬜ | Needs real data volumes |

Legend: ✅ implemented · ◐ partial · ⬜ Phase 1.

---

## 23. Appendix: notation and references

### Notation

| Symbol | Meaning |
|---|---|
| `σ⁰` | Normalised radar cross section (backscatter), linear or dB |
| `u_c`, `u_w` | Surface current, 10 m wind velocity vectors |
| `α` | Leeway coefficient, 0.03 |
| `K_h` | Horizontal eddy diffusivity, m²/s |
| `r₉₅(h)` | 95 % containment radius of the particle cloud at `h` hours back |
| `c₀` | A vessel's own median AIS reporting cadence |
| `E` | Reachable set (lens/ellipse) across a broadcast gap |
| `f_i`, `w_i` | Attribution factor `i` and its weight |
| `P_fa` | CFAR per-cell false-alarm probability |

### References to obtain and actually read before citing

1. MARPOL Annex I, Regulations 15 and 34 — discharge criteria and special areas.
2. Alpers, W. et al. — oil-spill look-alikes in SAR imagery; the canonical look-alike taxonomy.
3. Topouzelis, K. — SAR oil-spill detection review; threshold and feature methods.
4. Solberg, A. — statistical look-alike discrimination; the ancestor of §10.3.
5. Dagestad, K.-F. et al. — **OpenDrift** framework paper, and the OpenOil module.
6. IMO SOLAS V/19 — AIS carriage requirements.
7. ITU-R M.1371 — AIS message structure and reporting intervals.
8. EMSA CleanSeaNet service description — operational baseline to position against.
9. Copernicus Marine `GLOBAL_ANALYSISFORECAST_PHY` product user manual.
10. ERA5 documentation, and CMOD5 for SAR-derived wind (DT-6).

> Every one of these is a "read it, then cite it" item. Nothing in this document should reach a slide with a citation that nobody on the team has opened.

---

*Dark Transit — PRD revision B. Source of truth for SIH26143. Companion interface studies in `artifacts/`. Runnable reference implementation in `mvp/`. Every metric in §17 is a projected target until the experiment is run and recorded.*
