# SAAKSHYA — MVP

FRA claim-recovery platform. This repo is the **MVP core** owned by the tech lead:
the **KAAL evidence engine** + the **evidence-dossier generator** (the money-shot).
See `../SAAKSHYA_docs/` for PRD, PPT pack, build spec, team brief.

**One line:** *Existing FRA tools map the claims that were granted. SAAKSHYA rebuilds the proof for the claims that were rejected.*

## What runs today (offline, no cloud creds)
End-to-end **claim → mock-KAAL → NYAYA → dossier PDF** on a synthetic Dindori (MP) district.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt        # numpy, matplotlib, reportlab, Pillow
.venv/bin/python run_demo.py                     # all rejected claims -> out/*.pdf
.venv/bin/python run_demo.py FRA-DND-0007        # one claim
```
Output: `out/dossier_<claim>.pdf` + `.png`, and `out/summary.json`.

## Repo map
```
data/demo_district.json     synthetic claims + villages (Dindori) — clearly labelled demo data
src/kaal/mock.py            KAAL stand-in: emits the real pipeline's schema (breakpoint, NDVI, strip)
src/nyaya/rules.json        rejection-reason -> evidence rule table + appeal routing (declarative)
src/nyaya/engine.py         evidence match + appeal forum/deadline (ST vs OTFD honest logic)
src/dossier/generate.py     the money-shot: single-page A4 dossier (PDF+PNG)
spike/01_kaal_gee.py        REAL Earth Engine pipeline (skeleton) — same output schema as mock
run_demo.py                 end-to-end runner
out/                        generated dossiers
```

## The contract (why mock ↔ real swap is trivial)
`mock_kaal(claim)` and `spike/01_kaal_gee.py:kaal_gee(claim)` return the **same dict schema**
(`conversion_year, confidence, confidence_drivers, years[], ndvi[], evidence_strip[], ...`).
Everything downstream (NYAYA, dossier) consumes that schema, so wiring real Earth Engine =
one import swap in `run_demo.py`.

## Going real (KAAL spike)
1. `pip install earthengine-api geemap` → `earthengine authenticate` → set `EE_PROJECT` in `spike/01_kaal_gee.py`.
2. Pick the demo district; **confirm Corona KH-4B coverage on USGS EarthExplorer first**.
3. Run `kaal_gee()` on a real parcel; cross-check the LandTrendr breakpoint against the offline change-point.
4. Georeference one Corona 1967 scene in QGIS (record RMSE) for the pre-1972 strip chip.

## Honest limits baked into the code (do not remove — they are scoring points)
- **ST vs OTFD:** `nyaya/engine.py` returns `ANSWERED` for ST pre-2005, but `STRENGTHENED_NOT_PROVEN`
  for OTFD (75-yr / ~1930 bar is beyond any satellite).
- **Supplementary evidence only:** dossier states Rule-13 "supplement not replace", never "decisive proof".
- **Adverse findings withheld:** a post-2005 breakpoint returns `CONTRADICTED` and is *not* rendered as
  an adverse artifact (dual-use safety, PRD NFR2).
- **Demo data is synthetic** — labelled on every dossier + in the JSON.
- **Metrics are projected targets** until the real spike validates them.
```
