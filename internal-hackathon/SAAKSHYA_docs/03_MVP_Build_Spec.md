# SAAKSHYA — MVP Build Spec (for the MVP/tech lead)

**Goal of the MVP for the internal round:** produce **one real, dated evidence dossier** on one district (the proof artifact for Slide 4) + **polished mockups** of the platform for Slides 3/5. The internal round is a **blind PDF, no live demo** — so you are building for *screenshots + one real dossier*, not a deployed app. If selected, this same code becomes the SIH vertical slice.

**Build ambition (locked):** Real KAAL spike + polished mockups. Build the evidence engine for real; mock the rest of the UI.

---

## 1. What "done" looks like (internal round)
- ✅ A KAAL notebook that takes a parcel in the demo district and outputs: `conversion_year`, `confidence`, and a **decade image strip** — from real Landsat/Corona data.
- ✅ One **Evidence Dossier PDF** generated from that output (the money-shot).
- ✅ 3–4 **high-fidelity UI mockups** (atlas, claim drawer, NYAYA panel, dual-user views) — Figma or static React, screenshot-ready.
- ✅ Optional: 60-sec screen recording of the dossier generating → QR on Slide 4.

Everything else (full pipeline automation, real OCR, deployment) = post-selection.

---

## 2. Pick the district FIRST (blocks everything)
Score candidates on: **Corona KH-4B coverage** (check USGS EarthExplorer *before* committing — C10), MoTA rejection density, open claim-boundary availability, dry-season cloud-free Landsat count.
- Primary candidate: **Dindori or Mandla (MP)** — high ST population, FRA-active. Backup: **Kandhamal (Odisha)**.
- Deliverable: a one-paragraph decision + a confirmed Corona scene ID over the AOI.

## 3. The KAAL spike (the real build) — step by step
Notebook: `spike/01_kaal.ipynb` (Google Earth Engine Python API).

1. **AOI + parcels:** define the district; hand-draw or import ~15–20 sample claim polygons (real village locations; synthetic boundaries labelled illustrative). Include a **negative control** (continuous dense forest).
2. **Acquire stack:** GEE — Landsat MSS (1972→), TM/ETM+/OLI; Sentinel-2 for present. Dry-season (Nov–Mar) composites. **Record valid-observation count per year** (flag thin years, don't interpolate silently).
3. **Corona:** download ≥1 KH-4B scene from EarthExplorer; **georeference in QGIS** against SoI toposheet/OSM; record RMSE.
4. **Indices:** annual NDVI / NBR / Tasseled-Cap-Wetness per parcel.
5. **Breakpoint:** run **LandTrendr** (GEE) and/or **CCDC** → get Year-Of-Detection per parcel. *(Note: GEE precomputed CCDC is 1999–2019 only; for pre-1999 dating run LandTrendr/CCDC yourself on the full stack.)*
6. **Classify:** break direction + post-break trajectory → cultivation / settlement / stable. Handle **podu/jhum** as a positive traditional-occupation class, not noise.
7. **Emit:** `{claim_id, conversion_year, break_direction, trajectory_class, confidence, evidence_strip[decade chips], corona_available, registration_rmse}`.
8. **Confidence:** `f(valid_obs_count, break_magnitude, classifier_prob, registration_rmse)` — surface the drivers.

**Acceptance:** on ≥20 test polygons, conversion year agrees with visual Corona/Google-Earth-historical interpretation on **≥70%** of a hand-labelled subset; negative control returns "no conversion." **Validation caveat:** high-res reference often starts ~2003–06 — for older breaks, cross-validate Corona↔Landsat; report accuracy only where reference exists. Present ±3 yr as a **target**, not an achieved result, on the slide.

## 4. The Dossier generator (money-shot) — `spike/02_dossier.py`
PDF template, one claim → one PDF:
```
┌─────────────────────────────────────────────┐
│  SAAKSHYA — Evidence Dossier   Claim #____   │
│  Village ____  District ____  Type: IFR/CFR  │
├─────────────────────────────────────────────┤
│  [parcel map]        [confidence dial 0.87]  │
│  DECADE STRIP: 1967(Corona) 75 85 95 05 15 → │
│  FINDING: cultivation since ~1993 (pre-2005) │
│  Legal basis: Rule 13 supplementary evidence │
│  REJECTION-REASON MATCH:                      │
│    reason: "no pre-2005 proof" → ANSWERED ✔  │
│  Appeal: SDLC · deadline = order+60d          │
│  [ oral testimony slot ] [ GS resolution ]   │
└─────────────────────────────────────────────┘
```
Bilingual stub (Hindi/Odia + English). This PDF *is* the Slide-4 hero image.

## 5. Mockups (for Slides 3 & 5) — Figma or static React
Build screenshot-ready, real district names, labelled "illustrative data," readable at thumbnail size (no lorem):
1. **Atlas:** layer tree (IFR/CR/CFR + Rejected + Conflict + Evidence-strength choropleth); claim drawer with evidence timeline + "Generate Dossier" button.
2. **NYAYA panel:** rejection reason → evidence held/gap → appeal forum + 60-day countdown.
3. **Dual-user:** officer view (district rejection heatmap + appeal-deadline queue) vs Gram-Sabha view (map + voice-testimony record + boundary trace).

## 6. Data schema (demo district) — `data/demo_district.json`
See PRD §8 for entities. Minimum for the demo: 15–20 `Claim` records (mix granted/rejected, ST/OTFD), each with geometry + a `RejectionOrder` for the rejected ones (synthesize realistic reason text), + `Village` water/scheme indicators for SETU. **State openly that demo data is curated/synthetic** — real per-claim polygons + rejection orders aren't openly available (PRD risk §11.3).

## 7. Repo structure
```
saakshya/
├─ spike/            01_kaal.ipynb, 02_dossier.py, notebooks
├─ src/
│  ├─ kaal/          GEE pull, indices, breakpoint, classify
│  ├─ seema/         Sentinel-2 segmentation, PostGIS conflict
│  ├─ vaani/         OCR/NER (post-selection; stub for now)
│  ├─ nyaya/         rejection→evidence rule table, appeal logic (JSON DSL)
│  ├─ setu/          scheme eligibility rules
│  └─ dossier/       PDF generator
├─ web/              React + MapLibre mockups
├─ data/            demo_district.json, rasters (regenerable from GEE)
├─ environment.yml   pinned deps
└─ README.md
```

## 8. Build vs fake (internal round)
| Piece | Internal round | Why |
|---|---|---|
| KAAL breakpoint dating | **BUILD REAL** | It's the proof; one real dossier beats a perfect mock |
| Corona georef + decade strip | **BUILD REAL** (1 parcel) | Hero visual |
| Dossier PDF | **BUILD REAL** | Money-shot |
| Atlas / NYAYA / dual-user UI | **MOCK** (Figma/static) | Screenshots only; no live demo needed |
| SEEMA segmentation | **MOCK / 1 sample tile** | Enough for a slide; full train post-selection |
| VAANI OCR/NER | **FAKE** (pre-extracted JSON + 1 sample card) | Never run live OCR |
| SETU scheme rules | **STUB** (rules table, few examples) | Compliance layer |

## 9. Acceptance criteria (MVP)
- AC1. One real dossier PDF exists for a real parcel in the demo district.
- AC2. Negative control returns "no conversion."
- AC3. Mockups readable at slide-thumbnail size, no lorem, real place names.
- AC4. Every number destined for a slide is reproducible from the notebook (no hand-faked stats).
- AC5. `environment.yml` pinned; rasters regenerable from GEE scripts.

## 10. Watch-outs (from the audit)
- **OTFD 75-yr limit:** if a demo claim is OTFD, don't claim satellite proves it — show "occupation back to earliest imagery" and label continuity-strengthening only.
- **No "zero-touch" claim** if Corona (manual georef) is in the path — say "one georef step."
- **Don't render absence-of-evidence** as an output (dual-use safety).
- **Label all metrics as projected targets** until the spike validates them.
