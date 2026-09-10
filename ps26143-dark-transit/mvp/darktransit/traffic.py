"""Traffic replay, broadcast behaviour, and the reachable set (TR-1 ... TR-8).

Two ideas do the work here.

1. A gap is scored against the vessel's OWN median cadence, never against a
   fixed threshold. Satellite AIS coverage genuinely thins offshore, so a naive
   gap detector flags half the ocean. A hull that normally reports every three
   seconds and then stops for two hours has deviated from itself, and that is a
   statement about one ship rather than about coverage.

2. When a transponder goes dark the vessel does not vanish, it becomes bounded.
   From the last fix it can travel no further than v_max * (t - t_last); from
   the next fix the same constraint runs backward. The swept intersection is
   exactly the ellipse with foci at the two fixes and semi-major axis
   v_max * (t_next - t_last) / 2.

   That establishes a vessel COULD have been at the origin. It never
   establishes that it was.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import geo

K_GAP = 20.0          # a gap must exceed this many baseline cadences
MIN_GAP_S = 900.0     # ... and this many seconds, so slow reporters are safe
K_MAX = 2000.0        # normalising ratio for the anomaly score


@dataclass
class Gap:
    start_h: float
    end_h: float
    duration_s: float
    baseline_cadence_s: float
    anomaly: float
    envelope: list = field(default_factory=list)   # reachable set, lon/lat ring
    overlap: float = 0.0
    last_fix: tuple = (0.0, 0.0)
    next_fix: tuple = (0.0, 0.0)
    v_max_ms: float = 0.0


@dataclass
class VesselRecord:
    vessel: object
    positions: dict
    baseline_cadence_s: float
    gaps: list = field(default_factory=list)
    in_region: bool = False
    closest_approach_km: float = float("inf")
    crossing_h: float = float("nan")
    cog_through_region: float = float("nan")
    drop_reason: str = ""
    implausible_fixes: int = 0
    channel: str = "ais"


def baseline_cadence_s(t_h) -> float:
    if len(t_h) < 3:
        return float("nan")
    d = np.diff(np.asarray(t_h, dtype=float)) * 3600.0
    d = d[d > 0]
    return float(np.median(d)) if len(d) else float("nan")


def kinematic_flags(pos, v_max_ms, plane) -> int:
    """TR-8: positions implying an impossible speed between consecutive fixes."""
    if len(pos["t_h"]) < 2:
        return 0
    x, y = plane.to_xy(pos["lon"], pos["lat"])
    d = np.hypot(np.diff(x), np.diff(y))
    dt = np.diff(pos["t_h"]) * 3600.0
    with np.errstate(divide="ignore", invalid="ignore"):
        v = d / np.maximum(dt, 1e-6)
    return int(np.sum(v > 1.6 * v_max_ms))


def find_gaps(pos, cadence_s, v_max_ms, plane, k_gap=K_GAP, min_gap_s=MIN_GAP_S):
    t = np.asarray(pos["t_h"], dtype=float)
    if len(t) < 3 or not np.isfinite(cadence_s):
        return []
    dt = np.diff(t) * 3600.0
    thr = max(k_gap * cadence_s, min_gap_s)
    out = []
    for i in np.nonzero(dt > thr)[0]:
        dur = float(dt[i])
        p_last = (float(pos["lon"][i]), float(pos["lat"][i]))
        p_next = (float(pos["lon"][i + 1]), float(pos["lat"][i + 1]))
        x0, y0 = plane.to_xy(*p_last)
        x1, y1 = plane.to_xy(*p_next)
        ring_xy = geo.ellipse_from_foci([float(x0), float(y0)], [float(x1), float(y1)],
                                        v_max_ms * dur)
        rlon, rlat = plane.to_lonlat(ring_xy[:, 0], ring_xy[:, 1])
        out.append(Gap(
            start_h=float(t[i]), end_h=float(t[i + 1]), duration_s=dur,
            baseline_cadence_s=float(cadence_s),
            anomaly=float(np.clip(math.log(max(dur / cadence_s, 1.0)) / math.log(K_MAX), 0.0, 1.0)),
            envelope=[[round(float(a), 6), round(float(b), 6)] for a, b in zip(rlon, rlat)],
            last_fix=p_last, next_fix=p_next, v_max_ms=float(v_max_ms),
        ))
    return out


def analyse(tracks, region_lonlat, window_h, plane, positions_fn):
    """TR-1 ... TR-6. Returns (records, dropped) with the reason for each drop.

    Report how many vessels were dropped and on what basis, not only how many
    survived (TR-2).
    """
    region = np.asarray(region_lonlat, dtype=float)
    records, dropped = [], []
    w0, w1 = window_h

    for tr in tracks:
        pos = positions_fn(tr)
        cad = baseline_cadence_s(pos["t_h"])
        rec = VesselRecord(vessel=tr.vessel, positions=pos, baseline_cadence_s=cad)
        rec.implausible_fixes = kinematic_flags(pos, tr.vessel.v_max_ms, plane)
        rec.gaps = find_gaps(pos, cad, tr.vessel.v_max_ms, plane)

        t = np.asarray(pos["t_h"])
        in_win = (t >= w0) & (t <= w1)

        # distance to the region, for the closest-approach report
        pts = np.stack([pos["lon"], pos["lat"]], axis=1)
        inside = geo.points_in_polygon(pts, region)
        rx, ry = plane.to_xy(region[:, 0], region[:, 1])
        px, py = plane.to_xy(pos["lon"], pos["lat"])
        d = np.min(np.hypot(px[:, None] - rx[None, :], py[:, None] - ry[None, :]), axis=1)
        rec.closest_approach_km = float(np.min(np.where(inside, 0.0, d)) / 1000.0)

        hit = inside & in_win
        if hit.any():
            rec.in_region = True
            k = int(np.nonzero(hit)[0][len(np.nonzero(hit)[0]) // 2])
            rec.crossing_h = float(t[k])
            rec.cog_through_region = float(np.mean(pos["cog_deg"][hit]) % 360.0)
        else:
            # A vessel can still be a candidate if it was dark over the window
            # and its reachable set covers the region.
            for g in rec.gaps:
                g.overlap = geo.overlap_fraction(region, np.asarray(g.envelope, dtype=float))
                if g.overlap > 0 and not (g.end_h < w0 or g.start_h > w1):
                    rec.in_region = True
                    rec.channel = "ais-gap"
                    rec.crossing_h = 0.5 * (max(g.start_h, w0) + min(g.end_h, w1))
                    near = np.abs(t - g.start_h) < 0.5
                    if near.any():
                        rec.cog_through_region = float(np.mean(pos["cog_deg"][near]) % 360.0)

        for g in rec.gaps:
            if g.overlap == 0.0:
                g.overlap = geo.overlap_fraction(region, np.asarray(g.envelope, dtype=float))

        if rec.in_region:
            records.append(rec)
        else:
            if rec.closest_approach_km > 0:
                rec.drop_reason = (f"no entry into origin region "
                                   f"(closest approach {rec.closest_approach_km:.1f} km)")
            else:
                rec.drop_reason = "entered the region outside the origin window"
            dropped.append(rec)
    return records, dropped
