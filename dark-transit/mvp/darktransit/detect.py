"""Dark-region detection and look-alike discrimination (DT-1 ... DT-7).

Oil damps short capillary and gravity waves, so a slick returns almost nothing
and arrives as a hole in the image. So does a low-wind cell, a biogenic film,
rain, and the lee of a headland. Separating them is the whole of this stage.

The single most useful discriminator: a spill holds a sharp boundary because it
is a film with a physical edge, and a low-wind cell fades.

MVP honesty note: in the full build the discriminator coefficients are fitted
on the Zenodo Sentinel-1 oil-spill dataset holdout, and a fine-tuned U-Net
refines the masks (DT-3). Here the coefficients are hand-set from the physics
and the classical path stands alone. That degradation is recorded in the run
log, exactly as PRD 10.4 requires.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import raster

# Reference mean / spread used to z-score each feature. Hand-set in the MVP.
FEATURE_REF = {
    "edge_gradient_db_per_px": (1.20, 1.20),
    "contrast_db":             (6.00, 3.00),
    "wind_ms":                 (5.50, 2.00),
    "shape_complexity":        (2.60, 1.40),
    "homogeneity":             (0.35, 0.20),
    "elongation":              (2.00, 1.10),
}

# Signed weights. Positive = raises confidence that the dark patch is oil.
BETA = {
    "intercept":               -2.60,
    "edge_gradient_db_per_px":  1.60,   # sharp boundary: the strongest signal
    "contrast_db":              0.95,
    "wind_ms":                  1.00,   # no Bragg waves below ~3 m/s to damp
    "shape_complexity":        -0.55,   # blooms are raggeder than films
    "homogeneity":             -0.35,   # weak here, and weighted accordingly
    "elongation":               0.60,   # a discharge under way is a line source
}

MIN_AREA_KM2 = 0.3
WIND_FLOOR_MS = 3.0          # below this, dark means calm, not oil
CONFIDENCE_GATE = 0.50       # Gate 1

DEFAULT_PACK_PATH = "detector.v1.json"

# Provenance of the coefficients actually in force, reported in the run log and
# on dossier page 2. "hand-set" is a weaker claim than "fitted" and the product
# has to say which one it is making.
_ACTIVE = dict(source="hand-set", version=None, file=None, metrics=None,
               note=("coefficients hand-set from the physics; no fitted pack was "
                     "found, so the detector is running its documented fallback"))


def load_pack(path=DEFAULT_PACK_PATH):
    """Load a fitted discriminator pack, if one exists.

    Absent, the hand-set constants stand and the fallback is logged rather than
    hidden -- same contract as the missing U-Net in DT-3.
    """
    global FEATURE_REF, BETA, _ACTIVE
    p = Path(path)
    if not p.is_file():
        return dict(_ACTIVE)
    pack = json.loads(p.read_text())
    FEATURE_REF = {k: (float(v[0]), float(v[1])) for k, v in pack["feature_ref"].items()}
    BETA = {k: float(v) for k, v in pack["beta"].items()}
    _ACTIVE = dict(source="fitted", version=pack.get("version"), file=str(p),
                   metrics=pack.get("metrics", {}).get("holdout"),
                   sign_disagreements=pack.get("sign_disagreements", []),
                   note=pack.get("caveat", ""))
    return dict(_ACTIVE)


def active_pack():
    return dict(_ACTIVE)


@dataclass
class Candidate:
    cid: str
    mask: np.ndarray = field(repr=False)
    area_km2: float = 0.0
    features: dict = field(default_factory=dict)
    confidence: float = 0.0
    drivers: list = field(default_factory=list)
    verdict: str = "rejected"
    rejection_basis: str = ""
    delta_db: float = 0.0
    centroid_px: tuple = (0.0, 0.0)


def candidates(scene, threshold_k=1.25, window_km=6.0, min_area_km2=MIN_AREA_KM2):
    """DT-1, DT-2: speckle filter, adaptive threshold, connected components.

    The threshold is local because sigma-nought falls off across the swath with
    incidence angle -- a global threshold either misses one edge of the scene
    or floods the other.
    """
    img = raster.refined_lee(scene.sigma0_db, r=2, looks=scene.looks)
    r = max(3, int(round(window_km * 1000.0 / scene.pixel_m)))
    mu, sd = raster.box_mean_std(img, r)
    dark = img < (mu - threshold_k * sd)
    dark &= img < (np.median(img) - 2.5)          # absolute sanity floor

    # DT-1 land mask, dilated by 2 km so shoreline artefacts do not survive as
    # candidates. A dark patch touching the coast is a wind shadow far more
    # often than it is a slick.
    if getattr(scene, "land_mask", None) is not None and scene.land_mask.any():
        buf = max(1, int(round(2000.0 / scene.pixel_m)))
        dark &= ~raster.dilate(scene.land_mask, buf)

    dark = raster.close(dark, 1)

    lab, n = raster.label(dark)
    px_km2 = (scene.pixel_m / 1000.0) ** 2
    out = []
    for k in range(1, n + 1):
        m = lab == k
        area = float(m.sum() * px_km2)
        if area < min_area_km2:
            continue
        out.append(Candidate(cid=f"C{len(out) + 1:02d}", mask=m, area_km2=area))
    out.sort(key=lambda c: -c.area_km2)
    for i, c in enumerate(out):
        c.cid = f"C{i + 1:02d}"
    return out, img, int(n)


def features(scene, cand: Candidate, filtered: np.ndarray) -> dict:
    m = cand.mask
    ring_out = raster.dilate(m, 2) & ~m
    ring_in = m & ~raster.erode(m, 2)
    inside = filtered[m]
    background = filtered[ring_out]

    grad = raster.gradient_magnitude(filtered)
    edge_band = raster.dilate(m, 1) & ~raster.erode(m, 1)
    edge_gradient = float(np.mean(grad[edge_band])) if edge_band.any() else 0.0

    contrast = float(np.mean(background) - np.mean(inside)) if len(background) else 0.0

    ys, xs = np.nonzero(m)
    cy, cx = float(ys.mean()), float(xs.mean())
    lon, lat = scene.lonlat_of_px(cx, cy)
    wind = float(np.atleast_1d(scene.wind_ms[int(round(cy)), int(round(cx))])[0])

    area_m2 = m.sum() * scene.pixel_m ** 2
    perim_m = raster.perimeter_pixels(m) * scene.pixel_m
    complexity = float(perim_m ** 2 / (4 * math.pi * area_m2)) if area_m2 > 0 else 99.0

    lin = 10.0 ** (inside / 10.0)
    homogeneity = float(lin.std() / max(lin.mean(), 1e-9))

    pts = np.stack([xs - cx, ys - cy], axis=1).astype(float)
    cov = (pts.T @ pts) / max(len(pts), 1)
    ev = np.linalg.eigvalsh(cov)
    elong = float(math.sqrt(max(ev[1], 1e-9) / max(ev[0], 1e-9)))

    return dict(
        edge_gradient_db_per_px=edge_gradient,
        contrast_db=contrast,
        wind_ms=wind,
        shape_complexity=complexity,
        homogeneity=homogeneity,
        elongation=elong,
        centroid_lon=float(np.atleast_1d(lon)[0]),
        centroid_lat=float(np.atleast_1d(lat)[0]),
        centroid_px=(cx, cy),
        inside_db=float(np.mean(inside)),
        background_db=float(np.mean(background)) if len(background) else float("nan"),
        _ring_in=len(ring_in),
    )


def discriminate(cand: Candidate) -> Candidate:
    """DT-4, DT-5: logistic over named features, confidence with its drivers.

    A bare confidence number is a defect. The emitted value always carries the
    terms that produced it, with sign and magnitude.
    """
    f = cand.features
    z = BETA["intercept"]
    drivers = []
    for name, (mu, sd) in FEATURE_REF.items():
        zs = (f[name] - mu) / sd
        term = BETA[name] * zs
        z += term
        drivers.append(dict(name=name, value=round(float(f[name]), 3),
                            z=round(float(zs), 2), contribution=round(float(term), 3)))
    drivers.sort(key=lambda d: -abs(d["contribution"]))
    cand.confidence = float(1.0 / (1.0 + math.exp(-z)))
    cand.drivers = drivers
    cand.delta_db = round(float(f["contrast_db"]), 2)

    # Hard physical vetoes come before the statistical score and are reported
    # by name, because "dark because the wind dropped" is a different statement
    # from "dark and we scored it low".
    if f["wind_ms"] < WIND_FLOOR_MS:
        cand.verdict, cand.rejection_basis = "rejected", "wind_below_threshold"
    elif f["contrast_db"] < 3.0:
        cand.verdict, cand.rejection_basis = "rejected", "contrast_insufficient"
    elif cand.confidence >= CONFIDENCE_GATE:
        cand.verdict, cand.rejection_basis = "retained", ""
    else:
        worst = min(drivers, key=lambda d: d["contribution"])
        basis = {
            "edge_gradient_db_per_px": "edge_too_soft",
            "homogeneity": "interior_too_variable",
            "shape_complexity": "shape_complexity_high",
            "wind_ms": "wind_below_threshold",
            "contrast_db": "contrast_insufficient",
            "elongation": "no_principal_axis",
        }.get(worst["name"], "score_below_gate")
        cand.verdict, cand.rejection_basis = "rejected", basis
    return cand


def detect(scene, pack_path=DEFAULT_PACK_PATH, **kw):
    """Full detection stage. Returns (all_candidates, retained, raw_component_count)."""
    load_pack(pack_path)
    cands, filtered, raw_n = candidates(scene, **kw)
    for c in cands:
        c.features = features(scene, c, filtered)
        c.centroid_px = c.features["centroid_px"]
        discriminate(c)
    retained = [c for c in cands if c.verdict == "retained"]
    retained.sort(key=lambda c: -c.confidence)
    return cands, retained, raw_n
