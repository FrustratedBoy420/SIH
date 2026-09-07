"""The dark channel: CFAR ship detection and AIS matching (DK-1 ... DK-5).

A hull is bright on radar whether or not it is broadcasting. Running a
constant-false-alarm-rate detector over the same scene gives ship targets
independently of the transponder, and matching them against AIS positions
interpolated to acquisition time gives matched and unmatched counts.

Hard rule (DK-4): an unmatched return has no identity and is NEVER promoted to
a named suspect. It may only corroborate a vessel already ranked through AIS.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import raster


@dataclass
class RadarTarget:
    target_id: str
    lon: float
    lat: float
    est_length_m: float
    est_length_lo_m: float
    est_length_hi_m: float
    peak_db: float
    matched_mmsi: str | None = None
    match_distance_m: float = float("nan")


def ca_cfar(scene, pfa=1e-6, train_km=1.2, guard_km=0.4, min_px=2):
    """Cell-averaging CFAR.

    Clutter is estimated from a ring of training cells separated from the test
    cell by guard cells, so a large ship's own energy cannot raise its own
    threshold. The multiplier follows from the stated per-cell false-alarm
    probability:  tau = N * (Pfa^(-1/N) - 1).

    A CFAR result without its Pfa is uninterpretable, so Pfa is carried into
    the artefact and printed in the dossier.
    """
    lin = 10.0 ** (scene.sigma0_db / 10.0)
    R = max(2, int(round(train_km * 1000.0 / scene.pixel_m)))
    G = max(1, int(round(guard_km * 1000.0 / scene.pixel_m)))

    ones = np.ones_like(lin)
    sum_R = raster.box_mean(lin, R) * raster.box_mean(ones, R) * (2 * R + 1) ** 2
    cnt_R = raster.box_mean(ones, R) * (2 * R + 1) ** 2
    sum_G = raster.box_mean(lin, G) * raster.box_mean(ones, G) * (2 * G + 1) ** 2
    cnt_G = raster.box_mean(ones, G) * (2 * G + 1) ** 2

    ring_sum = np.maximum(sum_R - sum_G, 0.0)
    ring_cnt = np.maximum(cnt_R - cnt_G, 1.0)
    mu = ring_sum / ring_cnt

    n_train = float(np.median(ring_cnt))
    tau = n_train * (pfa ** (-1.0 / n_train) - 1.0)

    hits = lin > tau * mu
    lab, n = raster.label(hits)

    targets = []
    for k in range(1, n + 1):
        m = lab == k
        if m.sum() < min_px:
            continue
        ys, xs = np.nonzero(m)
        lon, lat = scene.lonlat_of_px(xs.mean(), ys.mean())
        # Length from the range (column) extent. Azimuth extent is smeared in
        # proportion to the target's radial velocity, so it is not used.
        extent_px = xs.max() - xs.min() + 1
        est = float(extent_px * scene.pixel_m)
        targets.append(RadarTarget(
            target_id=f"T{len(targets) + 1:02d}",
            lon=round(float(np.atleast_1d(lon)[0]), 6),
            lat=round(float(np.atleast_1d(lat)[0]), 6),
            est_length_m=round(est, 1),
            est_length_lo_m=round(est * 0.65, 1),
            est_length_hi_m=round(est * 1.45, 1),
            peak_db=round(float(scene.sigma0_db[m].max()), 2),
        ))
    return targets, dict(pfa=pfa, tau=round(float(tau), 3), n_train=int(n_train),
                         train_km=train_km, guard_km=guard_km)


def match_to_ais(targets, tracks, acq_h, plane, gate_m=800.0):
    """DK-2: greedy nearest match inside a gate. Reports matched and unmatched."""
    fixes = []
    for tr in tracks:
        lo, la = tr.interp(acq_h)
        if np.isfinite(lo[0]) and np.isfinite(la[0]):
            fixes.append((tr.vessel.mmsi, float(lo[0]), float(la[0])))

    used = set()
    for t in targets:
        tx, ty = plane.to_xy(t.lon, t.lat)
        best, bestd = None, float("inf")
        for mmsi, flo, fla in fixes:
            if mmsi in used:
                continue
            fx, fy = plane.to_xy(flo, fla)
            d = float(np.hypot(tx - fx, ty - fy))
            if d < bestd:
                best, bestd = mmsi, d
        if best is not None and bestd <= gate_m:
            t.matched_mmsi = best
            t.match_distance_m = round(bestd, 1)
            used.add(best)
    matched = [t for t in targets if t.matched_mmsi]
    unmatched = [t for t in targets if not t.matched_mmsi]
    return matched, unmatched
