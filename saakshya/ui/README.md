# SAAKSHYA — interface

FRA evidence-to-action platform for PS 25108. This is a full rebuild of the
front end: React + TypeScript + Vite, MapLibre for the WebGIS, Motion for the
animation, Tailwind v4 for the token system.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/
npm run preview
```

Nothing here needs a key or a network service to boot. The only network calls
are Google Fonts and the map basemap tiles (Esri World Imagery and CARTO). If
you are recording somewhere with no connection, open the atlas once beforehand
so the tiles are in the browser cache, or switch the basemap toggle off
imagery — every claim layer is drawn from local data and renders without tiles.

---

## The design

Two surfaces, always. A cold graphite **deck** is the satellite side; a warm
archival **paper** sheet is the legal record. Every screen carries both,
because the product is imagery joined to paperwork.

**Colour comes from the subject.** Archive frames are rendered in real Landsat
false-colour infrared — band combination 4-3-2, where vegetation returns
strongly in the near infrared and prints *red*, worked soil prints *cyan*, and
water prints near-black. That is why the forest is crimson. Interface status
colours follow Survey of India toposheet convention: survey green for
recognised, contour sienna for pending, settlement carmine for refused.
Carmine is also the single interactive accent, because in this product a
refusal is the call to action.

**Type.** Archivo (variable, using its width axis for console labels), 
Newsreader for anything set on paper, IBM Plex Mono for every number the system
produces, Noto Sans Devanagari for Hindi.

**The Chronoscope** is the signature instrument: fifty-eight years of archive as
one film strip, sprocket holes and frame numbers included, with the 13 December
2005 cutoff burned in as a fiducial you physically drag across. Scrub it and
the parcel frame, the spectral trace and the verdict all move together.

---

## Routes

| Route | Screen |
|---|---|
| `/` | Landing — the archive runs forward and stops on the cutoff |
| `/atlas` | District WebGIS: claim layers, conflict topology, evidence-strength ramp, claim drawer |
| `/claim/:id` | KAAL evidence: Chronoscope, parcel viewport, NDVI trace, confidence and drivers, the order on paper |
| `/decision/:id` | NYAYA: ground-to-evidence match, appeal ladder, sixty-day window, SETU convergence, priority model |
| `/district` | Officer view: KPIs, grounds for refusal, recovery queue, village priority |
| `/village/:code` | Village FRA intelligence profile with the explainable DSS chain |
| `/sabha/:id` | Gram Sabha view — full paper, plain language, English / हिन्दी |
| `/dossier/:id` | The dossier assembling, then `Ctrl-P` prints a real A4 filing |
| `/method` | Pipeline, what is running versus designed, glossary |

## A two-minute demo path

1. `/` — let the hero run. The year counter climbs, the cutoff bar slams
   across the frame, the second headline resolves.
2. **Enter the atlas.** Tick **Evidence strength**; the dots recolour. Tick
   **Boundary conflicts**. Click a carmine dot.
3. **Open the archive.** Press **Sweep archive** and let the Chronoscope run
   1967 → 2025. The band under the frame flips as it crosses 2005. Point at
   the moment the strip turns from maroon to a red-and-cyan mosaic.
4. Scroll to the trace: raw series in grey, LandTrendr fit in white, the
   breakpoint fiducial dropping in left of the cutoff line.
5. **Open the appeal route.** The ladder, the closed window, the next action.
6. **Assemble the dossier.** Watch it build, then say the last line out loud —
   satellite evidence supplements, it does not decide.
7. **Gram Sabha** — switch to हिन्दी. Same finding, other register.

---

## Where the logic lives

```
src/engine/
  kaal.ts      breakpoint dating, confidence model, sensor eras   (mirrors spike/01_kaal_gee.py)
  nyaya.ts     ground → evidence match, appeal routing, deadlines (ported from src/nyaya/engine.py)
  setu.ts      scheme rules, priority weights
  data.ts      district derivation: parcels, villages, conflicts, profiles
src/lib/
  parcelRenderer.ts   the false-colour archive frame renderer (WebGL)
```

`runKaal()` emits exactly the schema the real Earth Engine run emits, so
swapping the source is a one-function change.

## What is running, and what is not

| | |
|---|---|
| Interface, routing, atlas, all screens | Built and working |
| MapLibre WebGIS, claim layers, conflict topology | Built and working |
| Breakpoint dating, confidence model, ST/OTFD rules | Real logic, synthetic input |
| Appeal routing, scheme convergence, priority score | Computed from the data on screen |
| Archive frames | Procedurally reconstructed — **not** distributed Landsat scenes |
| LandTrendr over real Landsat | Designed, not wired; needs Earth Engine credentials |
| Claim records and rejection orders | Synthetic, labelled on every screen |

The frame renderer simulates sensor character honestly: MSS carries its
six-detector striping, ETM+ after May 2003 carries the scan-line-corrector
failure wedges, Corona is panchromatic film with grain and scratches. Every
frame is captioned as a reconstruction.

## Language rules the copy follows

Never "proves". The platform *reconstructs historical spatial evidence*, the
evidence *corroborates*, the output is *supplementary*, confidence describes
*evidence strength, not legal validity*, and a finding that would cut against a
claimant is withheld from every claimant-facing artefact.

---

The previous static prototype is still at `../app` and is untouched.
