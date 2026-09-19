# SIH26143 — Oil Spill Detection + Vessel Attribution

**Org:** NTRO · **Category:** Software · **Theme:** Disaster Management
**Deadline:** 20 September 2026 · **Submissions at scrape time:** 0/500

---

## 1. What the PS actually asks

Ships illegally dump oily bilge water at sea. The slick gets spotted days later,
by which time the ship is gone and nobody can prove who did it. NTRO wants a
pipeline that closes that gap.

Three stages, stated in the PS:

**(a) Detect and characterise the slick.** From satellite imagery — SAR (radar)
and EO (optical). Output its geometry: area, perimeter, centroid, shape, and
age if you can estimate it.

**(b) Trace it backward and forward.** Oil drifts with current and wind. Using
ocean and weather data, run the drift *backward* to find where and when the
spill started (hindcast), and *forward* to predict where it goes next.

**(c) Attribute it to a vessel.** Pull historic AIS (ship GPS broadcasts) for
that origin box and time window. Throw out irrelevant traffic. Score the
remaining ships on proximity, trajectory, and behavioural anomalies. Rank them.

Plus: a visual interface.

---

## 2. Why this suits us

The PS says "machine learning model", but read where the difficulty actually
sits:

| Stage | Real nature of the work | ML needed? |
|---|---|---|
| (a) Detect slick | Image segmentation | Yes — but pretrained/existing, dataset given |
| (b) Drift hindcast | Physics + data plumbing | **No** |
| (c) Attribution | Geospatial joins + scoring rules | **No** |
| Interface | React + MapLibre | **No** |

Two of the three stages, and the whole part that makes this impressive, are a
**data-pipeline-and-rules problem**. That is what we already ship.

The other reason: most teams will stop at stage (a). Detection is the obvious,
crowded half. Attribution is the half that makes a judge sit up — nobody wants
a slick detector, they want a name.

---

## 3. What exactly we build

### Stage A — Slick detection

**Input:** Sentinel-1 SAR scene (GeoTIFF).
Oil flattens the sea surface, so it shows up as a dark patch on radar. Problem
is that low wind, algae blooms and ship wakes also look dark — those are called
look-alikes, and telling them apart is the whole game.

**Do:**
- Use the **Zenodo Sentinel-1 SAR Oil Spill Dataset** named in the PS. It is
  labelled. Do not go collect our own.
- Take an existing segmentation model (U-Net / DeepLabv3 with a pretrained
  encoder) and fine-tune on it. This is a solved recipe with public code —
  nobody on the team has to invent an architecture.
- Post-process the mask into geometry: area (km²), perimeter, centroid lat/lon,
  elongation ratio, orientation.
- Add a **look-alike confidence score**, not just a binary mask. Say how sure
  we are and why (wind speed at that pixel, shape regularity, edge sharpness).

**Output:** a polygon in EPSG:4326 with a confidence value.

### Stage B — Drift, backward and forward

**Input:** the slick polygon + detection timestamp.

Oil moves at roughly `current velocity + ~3% of wind velocity`. That simple
rule is standard practice, not a hack — it is the leeway model.

**Do:**
- Pull ocean currents from **Copernicus Marine (CMEMS)** or **HYCOM**, wind from
  **ERA5** or GFS. Both free, both have Python clients.
- Seed a few thousand virtual particles inside the slick polygon.
- Step them **backward** in time, hour by hour, for 24–72 h. Where they converge
  is the origin region. It is a cloud, not a point — that matters, see below.
- Step them **forward** for the same window to predict where the slick lands,
  and flag coastline within reach.
- Optional upgrade: **OpenDrift**, an open-source Python library that does
  exactly this (it has an `OpenOil` module). Use it if the timeline allows,
  hand-rolled advection if not.

**Output:** an origin probability cloud — a heatmap over space *and* time, plus
a forward drift forecast.

**The honest bit:** backward drift diverges. The further back you go, the
bigger the cloud. Show that growing uncertainty on screen instead of drawing a
confident dot. That is the move that wins panels.

### Stage C — Vessel attribution

**Input:** the origin cloud (space + time).

AIS is a stream of ship position broadcasts: MMSI (ship ID), lat, lon,
timestamp, speed over ground, course. Format sample at
<https://marinecadastre.gov/accessais/>. If real AIS for our region is not
available, the PS **explicitly allows synthetic AIS** — so generate a realistic
traffic scene with one guilty ship in it.

**Do:**
1. **Filter.** Keep only vessels whose track intersects the origin cloud in
   both space and time. This drops 95% of traffic immediately.
2. **Score each survivor.** Weighted, and every weight visible in the UI:
   - *Proximity* — how deep inside the origin cloud the track passes.
   - *Timing* — how well the crossing time matches the hindcast time window.
   - *Track alignment* — a slick from a moving discharge is elongated along the
     ship's heading. Compare slick orientation to vessel course. This is the
     strongest single signal and most teams will miss it.
   - *Behavioural anomalies* — AIS gap (transponder switched off) near the
     origin window, unexplained slowdown, course change, night-time transit.
   - *Vessel type* — tanker vs fishing boat, from AIS static data.
3. **Rank** and produce a shortlist, not an accusation.

**Output:** ranked suspect list, each with a score breakdown.

### Stage D — Interface and the artifact

- **React + Vite + MapLibre.** Layers: SAR scene, slick polygon, backward drift
  animation, origin cloud heatmap, AIS tracks colour-coded by suspicion.
- Time slider scrubbing the whole incident.
- Click a vessel → its score breakdown, factor by factor.
- **Generated PDF incident dossier**: slick geometry, drift method and
  parameters, origin window, ranked suspects with evidence per factor, and an
  explicit **"what this cannot establish"** section — AIS can be spoofed, dark
  vessels do not broadcast, drift error grows with time.

That last section is not a weakness. It is the thing that makes the report
usable by someone who would actually have to act on it.

---

## 4. Stack

| Layer | Tool |
|---|---|
| Imagery | Sentinel-1 GRD via Copernicus Data Space, `rasterio`, `xarray` |
| Detection | PyTorch, U-Net/DeepLabv3, pretrained encoder |
| Ocean/met | CMEMS or HYCOM currents, ERA5 wind, `xarray` + `netCDF4` |
| Drift | OpenDrift, or hand-rolled particle advection with `numpy` |
| AIS | `pandas` + `geopandas`, `shapely` for track intersection |
| Scoring | Declarative weighted rule pack — JSON config, not hardcoded |
| API | FastAPI |
| Front end | React + Vite + TypeScript + MapLibre GL |
| Report | WeasyPrint or ReportLab |

---

## 5. Build order

Each stage must stand alone before the next connects to it.

1. Load a Sentinel-1 scene, render it in MapLibre. Nothing else.
2. Hand-drawn slick polygon → backward drift → origin cloud on the map.
   *(Skip detection entirely at this stage — hardcode the polygon.)*
3. Synthetic AIS → filter → score → ranked list.
4. Now train the detector and swap out the hardcoded polygon.
5. PDF dossier.
6. Polish, time slider, score breakdown panel.

**Why detection is step 4, not step 1:** it is the only ML piece and the only
one that can silently eat a week. Everything downstream can be built and demoed
against a hand-drawn polygon. If detection underperforms, the rest of the
system still works and still demos.

---

## 6. Risks

| Risk | Handling |
|---|---|
| SAR detection is the ML gap | Use the given Zenodo dataset + existing model. Never train from scratch. |
| Ocean data is large and slow to fetch | Subset to one region, one incident, early. Downloads can take days. |
| Backward drift is genuinely uncertain | Show the uncertainty. Do not fake a point origin. |
| Synthetic AIS caps realism | PS permits it explicitly. Say so on the slide, do not hide it. |
| Scope creep into full spill forecasting | One region, one documented incident, one 72 h window. |

---

## 7. Demo script

> "Sentinel-1 pass, Gulf of Kutch, 14 March, 06:12 UTC. System flags a
> 12.4 km² dark feature. Confidence 0.87, and here is why it is not a
> look-alike. We run drift backward 48 hours — watch the cloud grow, that is
> honest uncertainty. Origin window: this box, between 22:00 and 02:00. Nine
> vessels transited it. Eight are cleared. This one — tanker, MMSI 419xxxxxx —
> crossed at 23:40, its heading matches the slick's long axis to within 6
> degrees, and its AIS went dark for 40 minutes right there. Here is the
> dossier, and here is the page that says what we cannot prove."

That is one screen, eight minutes, and a name at the end.

---

## 8. Open questions before committing

- Is the Zenodo dataset actually downloadable and labelled as advertised? **Check first.**
- Which incident do we hindcast? Needs a documented real spill with a known date and a Sentinel-1 pass over it.
- Real AIS for Indian waters, or synthetic? Decide early — it changes stage C entirely.
