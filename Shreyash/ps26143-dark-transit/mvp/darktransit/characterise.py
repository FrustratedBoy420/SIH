"""Slick characterisation (CH-1 ... CH-5).

Geometry is computed in the scene's local tangent plane, where a pixel is a
square of known side, so areas and bearings are metric without a projection
dependency.

The principal axis is the product's strongest single piece of evidence: a
discharge made under way is a line source, so an elongated slick's long axis is
a bearing, and that bearing does not inherit the hindcast's error.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import geo, raster

MIN_ELONGATION_FOR_AXIS = 1.6      # HD-2: a round slick has no meaningful axis


@dataclass
class SlickGeometry:
    area_km2: float
    perimeter_km: float
    centroid: tuple
    principal_axis_deg: float
    elongation: float
    axis_usable: bool
    length_km: float
    width_km: float
    age_hours: float
    age_hours_lo: float
    age_hours_hi: float
    age_method: str
    age_notes: str
    polygon: list = field(default_factory=list)
    confidence: float = 0.0


def characterise(scene, cand, k_h=5.0, k_h_sweep=(0.5, 2.0)):
    m = cand.mask
    ys, xs = np.nonzero(m)
    px = scene.pixel_m

    x = scene.x[0] + xs * px
    y = scene.y[0] + ys * px
    cx, cy = x.mean(), y.mean()
    pts = np.stack([x - cx, y - cy], axis=1)
    cov = (pts.T @ pts) / len(pts)
    evals, evecs = np.linalg.eigh(cov)
    lam2, lam1 = float(evals[0]), float(evals[1])
    v1 = evecs[:, 1]

    # Bearing of the long axis, degrees true, folded to [0,180): a slick axis
    # is undirected, so 041 and 221 are the same axis (HD-1).
    axis_deg = (math.degrees(math.atan2(v1[0], v1[1]))) % 180.0
    elong = math.sqrt(max(lam1, 1e-9) / max(lam2, 1e-9))

    # 4-sigma extents: ~95 % of the mass along each principal direction.
    length_m = 4.0 * math.sqrt(max(lam1, 0.0))
    width_m = 4.0 * math.sqrt(max(lam2, 0.0))

    area_km2 = float(m.sum() * (px / 1000.0) ** 2)
    perim_km = float(raster.perimeter_pixels(m) * px / 1000.0)

    lon_c, lat_c = scene.lonlat_of_px(xs.mean(), ys.mean())
    ring_px = raster.trace_boundary(m)
    ring_px = geo.simplify(ring_px, tol_m=2.0)
    rlon, rlat = scene.lonlat_of_px(ring_px[:, 0], ring_px[:, 1])
    polygon = [[round(float(a), 6), round(float(b), 6)] for a, b in zip(rlon, rlat)]

    # --- age from lateral spreading (CH-5) ---
    # A line source spreads across-track by Fickian diffusion only:
    #   sigma_y = sqrt(2 K_h t),  and we take the observed width as 4 sigma_y,
    # hence  t = w^2 / (32 K_h).
    # This estimate does NOT use the hindcast, so it is independent of the drift
    # reconstruction. It does depend entirely on K_h, so it is reported as a
    # range over a factor-two sweep of K_h rather than as a number.
    def age_h(k):
        return (width_m ** 2) / (32.0 * max(k, 1e-6)) / 3600.0

    age = age_h(k_h)
    age_hi = age_h(k_h * k_h_sweep[0])     # smaller K_h -> older
    age_lo = age_h(k_h * k_h_sweep[1])     # larger K_h -> younger

    return SlickGeometry(
        area_km2=round(area_km2, 3),
        perimeter_km=round(perim_km, 3),
        centroid=(round(float(np.atleast_1d(lon_c)[0]), 6),
                  round(float(np.atleast_1d(lat_c)[0]), 6)),
        principal_axis_deg=round(axis_deg, 1),
        elongation=round(elong, 2),
        axis_usable=bool(elong >= MIN_ELONGATION_FOR_AXIS),
        length_km=round(length_m / 1000.0, 2),
        width_km=round(width_m / 1000.0, 2),
        age_hours=round(age, 2),
        age_hours_lo=round(age_lo, 2),
        age_hours_hi=round(age_hi, 2),
        age_method="lateral diffusion width, closed form t = w^2 / (32 K_h)",
        age_notes=(
            "Independent of the drift hindcast, and entirely dependent on K_h. "
            f"Reported over a factor-two sweep of K_h ({k_h * k_h_sweep[0]:.1f}"
            f"-{k_h * k_h_sweep[1]:.1f} m^2/s). The hindcast supplies WHERE the "
            "slick was at a given age, not the age itself; there is no second "
            "physically independent age estimator in this build."
        ),
        polygon=polygon,
        confidence=round(float(cand.confidence), 3),
    )
