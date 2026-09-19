"""KAAL spike — REAL Google Earth Engine pipeline (skeleton).

This is the function that replaces src/kaal/mock.py once you have Earth Engine
access. It emits the SAME schema mock_kaal() does, so the dossier + NYAYA code
work unchanged.

PREREQUISITES (you run these once):
    pip install earthengine-api geemap
    earthengine authenticate            # interactive, opens browser
    # then set your Cloud project id below (EE_PROJECT)

WHAT IT DOES (per PRD Band A / MVP Build Spec §3):
    1. Build an annual dry-season (Nov-Mar) Landsat NDVI series 1972->now over a parcel.
    2. Run LandTrendr temporal segmentation to find the breakpoint YEAR.
    3. Classify the break (forest -> cultivation) and emit conversion_year + confidence.
    4. Pull decade thumbnails for the evidence strip.

NOTE: precomputed GEE CCDC is 1999-2019 only; for pre-1999 dating we run
LandTrendr ourselves on the full MSS+TM stack (see PRD §10 note).

This file intentionally does NOT run in the offline demo. Wire it up on a machine
with EE access, then in run_demo.py swap:  from kaal.mock import mock_kaal
                                     -->   from spike.kaal_gee import kaal_gee as mock_kaal
"""
from __future__ import annotations

EE_PROJECT = "REPLACE-WITH-YOUR-GCP-PROJECT"   # <-- set this


def _init():
    import ee
    ee.Initialize(project=EE_PROJECT)
    return ee


def _annual_ndvi_collection(ee, geom, start_year=1972, end_year=2024):
    """Harmonised annual dry-season NDVI across MSS/TM/ETM+/OLI."""
    def scale_l(img, red, nir):
        ndvi = img.normalizedDifference([nir, red]).rename("NDVI")
        return ndvi.copyProperties(img, ["system:time_start"])

    # Sensor -> (collection id, red band, nir band)
    sensors = [
        ("LANDSAT/LM01/C02/T1", "B6", "B7"),   # MSS ~1972-78 (79 m)  -- pre-1982, coarsest
        ("LANDSAT/LM02/C02/T1", "B6", "B7"),
        ("LANDSAT/LM03/C02/T1", "B6", "B7"),
        ("LANDSAT/LT05/C02/T1_L2", "SR_B3", "SR_B4"),  # TM 1984-2012 (30 m)
        ("LANDSAT/LE07/C02/T1_L2", "SR_B3", "SR_B4"),  # ETM+ 1999-
        ("LANDSAT/LC08/C02/T1_L2", "SR_B4", "SR_B5"),  # OLI 2013-
        ("LANDSAT/LC09/C02/T1_L2", "SR_B4", "SR_B5"),  # 2021-
    ]
    imgs = []
    for cid, red, nir in sensors:
        col = (ee.ImageCollection(cid)
               .filterBounds(geom)
               .filter(ee.Filter.calendarRange(11, 3, "month")))  # dry season Nov-Mar
        imgs.append(col.map(lambda im, r=red, n=nir: scale_l(ee, im, r, n)))
    merged = imgs[0]
    for c in imgs[1:]:
        merged = merged.merge(c)

    def year_composite(y):
        y = ee.Number(y)
        start = ee.Date.fromYMD(y, 1, 1)
        end = ee.Date.fromYMD(y, 12, 31)
        annual = merged.filterDate(start, end)
        img = annual.median().set("year", y).set("n_obs", annual.size())
        return img.set("system:time_start", start.millis())

    years = ee.List.sequence(start_year, end_year)
    return ee.ImageCollection(years.map(year_composite)), years


def kaal_gee(claim: dict) -> dict:
    """REAL KAAL result for a claim polygon. Same schema as mock_kaal()."""
    ee = _init()
    # claim geometry: prefer a real polygon; fall back to a buffer around centroid
    if claim.get("geometry"):
        geom = ee.Geometry(claim["geometry"])
    else:
        lat, lon = claim["geometry_centroid"]
        geom = ee.Geometry.Point([lon, lat]).buffer(150)  # ~parcel-scale

    col, years = _annual_ndvi_collection(ee, geom)

    # Reduce each annual image to the mean NDVI over the parcel -> time series
    def reduce_year(img):
        img = ee.Image(img)
        val = img.reduceRegion(ee.Reducer.mean(), geom, 30).get("NDVI")
        return ee.Feature(None, {"year": img.get("year"), "ndvi": val,
                                 "n_obs": img.get("n_obs")})
    series_fc = col.map(reduce_year).filter(ee.Filter.notNull(["ndvi"]))
    series = series_fc.getInfo()["features"]
    yrs = [int(f["properties"]["year"]) for f in series]
    nd = [float(f["properties"]["ndvi"]) for f in series]

    # --- LandTrendr breakpoint (run on the NDVI stack) ---
    # For robustness in the spike you can either:
    #   (a) call ee.Algorithms.TemporalSegmentation.LandTrendr on an annual NDVI
    #       ImageCollection and read the vertices, or
    #   (b) do a simple offline change-point on the reduced series (below) as a
    #       fallback and cross-check against LandTrendr.
    conv_year, break_mag = _offline_breakpoint(yrs, nd)  # fallback; replace w/ LandTrendr vertices

    valid_obs = sum(1 for f in series if (f["properties"].get("n_obs") or 0) > 0)
    clf_prob = 0.85   # TODO: real classifier prob (forest->cultivation vs other)
    conf = max(0.4, min(0.95,
              0.30 + 0.35 * (valid_obs / 45) + 0.55 * (break_mag / 0.5) + 0.20 * (clf_prob - 0.8)))

    # decade thumbnails (URLs) — optional; for the strip use getThumbURL per epoch
    strip = _decade_strip_urls(ee, geom, col, conv_year)

    return {
        "claim_id": claim["claim_id"],
        "conversion_year": conv_year,
        "break_direction": "loss",
        "trajectory_class": "forest_to_cultivation",
        "confidence": round(conf, 2),
        "confidence_drivers": {
            "valid_observation_years": valid_obs,
            "break_magnitude_ndvi": round(break_mag, 2),
            "classifier_probability": clf_prob,
            "corona_registration_rmse_m": None,  # set after Corona georef in QGIS
        },
        "years": yrs, "ndvi": nd,
        "evidence_strip": strip,
        "corona_available": False,
        "registration_rmse_m": None,
        "_source": "GEE",
    }


def _offline_breakpoint(yrs, nd):
    """Simple max-drop change point as a fallback / cross-check for LandTrendr."""
    import numpy as np
    y = np.array(yrs); v = np.array(nd)
    best_year, best_drop = None, 0.0
    for i in range(3, len(y) - 3):
        pre = v[:i].mean(); post = v[i:].mean(); drop = pre - post
        if drop > best_drop:
            best_drop, best_year = drop, int(y[i])
    return best_year, float(best_drop)


def _decade_strip_urls(ee, geom, col, conv_year):
    strip = []
    for y in [1975, 1985, 1995, 2005, 2015, 2023]:
        label = "forest" if (conv_year and y < conv_year) else "cultivated"
        strip.append({"year": y, "label": label,
                      "kind": "landsat" if y < 2016 else "sentinel", "available": True})
    # Corona (1967) is added manually after QGIS georeferencing.
    return strip


if __name__ == "__main__":
    print(__doc__)
    print("Set EE_PROJECT and run kaal_gee(claim) with a claim that has 'geometry' "
          "or 'geometry_centroid'.")
