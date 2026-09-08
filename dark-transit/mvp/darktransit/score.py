"""The attribution model (SC-1 ... SC-5).

Five factors, each normalised to [0,1], combined as a weighted mean whose
weights live in a versioned JSON pack and nowhere else.

    score(v) = sum_i w_i f_i(v) / sum_i w_i

A factor that cannot be computed for a vessel -- a heading factor on a slick
with no usable axis, for instance -- is dropped from BOTH the numerator and the
denominator and reported as suppressed. Scoring a missing factor as zero would
silently penalise the vessel for our own ignorance.

Why the weights are exposed rather than defended: any weighting is an
assumption. Drop `heading` to zero in front of a judge and watch the leader
margin collapse; that is an honest statement about how much of the conclusion
rests on one geometric argument, and it is worth more than a defended number.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from . import ais, geo

FACTORS = ["containment", "timing", "heading", "broadcast", "class_prior"]

DEFAULT_PACK = {
    "version": "v4",
    "file": "weights.v4.json",
    "weights": {"containment": 22, "timing": 18, "heading": 26, "broadcast": 24, "class_prior": 10},
}

CORRIDOR_M = 3000.0     # how wide a swept corridor a track is credited with


def load_pack(path=None):
    if path is None:
        return dict(DEFAULT_PACK)
    p = Path(path)
    pack = json.loads(p.read_text())
    pack.setdefault("file", p.name)
    return pack


def track_coverage(region_lonlat, lon, lat, plane, corridor_m=CORRIDOR_M, n=90):
    """Fraction of the origin region swept by a track, as a corridor.

    Normalised by the region -- a long track through empty water gets no credit
    for its length, only for the part of the region it actually covered.
    """
    bb = geo.region_bbox(region_lonlat)
    if bb is None or len(lon) == 0:
        return 0.0
    lo, hi = bb
    gx = np.linspace(lo[0], hi[0], n)
    gy = np.linspace(lo[1], hi[1], n)
    mx, my = np.meshgrid(gx, gy)
    pts = np.stack([mx.ravel(), my.ravel()], axis=1)
    inside = geo.points_in_rings(pts, region_lonlat)
    if not inside.any():
        return 0.0
    qx, qy = plane.to_xy(pts[inside, 0], pts[inside, 1])
    tx, ty = plane.to_xy(lon, lat)
    step = max(1, len(tx) // 600)
    tx, ty = tx[::step], ty[::step]
    d = np.min(np.hypot(qx[:, None] - tx[None, :], qy[:, None] - ty[None, :]), axis=1)
    return float(np.mean(d <= corridor_m))


def _timing_factor(rec, window_h):
    w0, w1 = window_h
    spans = []
    t = np.asarray(rec.positions["t_h"])
    if np.isfinite(rec.crossing_h):
        spans.append((rec.crossing_h, rec.crossing_h))
    for g in rec.gaps:
        spans.append((g.start_h, g.end_h))
    if not spans:
        return 0.0, "no crossing and no broadcast gap in the archive"
    best, detail = 0.0, ""
    for a, b in spans:
        if b >= w0 and a <= w1:
            f, why = 1.0, "inside the origin window"
        else:
            gap_h = w0 - b if b < w0 else a - w1
            f = float(np.clip(1.0 - gap_h / 6.0, 0.0, 1.0))
            why = f"{gap_h:.1f} h outside the origin window"
        if f > best:
            best, detail = f, why
    return best, detail


def factors_for(rec, region_lonlat, window_h, geom, plane):
    f, why, suppressed = {}, {}, []

    # --- containment ---
    gap_overlap = max([g.overlap for g in rec.gaps] or [0.0])
    t = np.asarray(rec.positions["t_h"])
    in_win = (t >= window_h[0] - 1.0) & (t <= window_h[1] + 1.0)
    cov = track_coverage(region_lonlat, rec.positions["lon"][in_win],
                         rec.positions["lat"][in_win], plane) if in_win.any() else 0.0
    f["containment"] = float(max(gap_overlap, cov))
    if gap_overlap >= cov and gap_overlap > 0:
        why["containment"] = (f"reachable set across the broadcast gap covers "
                              f"{gap_overlap * 100:.0f} % of the origin region; this "
                              f"establishes the vessel could have been there, not that it was")
    else:
        why["containment"] = (f"broadcast track sweeps {cov * 100:.0f} % of the origin "
                              f"region within a {CORRIDOR_M / 1000:.0f} km corridor")

    # --- timing ---
    f["timing"], d = _timing_factor(rec, window_h)
    why["timing"] = d

    # --- heading ---
    if not geom.axis_usable:
        suppressed.append("heading")
        why["heading"] = (f"suppressed: slick elongation {geom.elongation} is below "
                          f"1.6, so its principal axis is not a bearing (HD-2)")
    elif not np.isfinite(rec.cog_through_region):
        suppressed.append("heading")
        why["heading"] = "suppressed: no course over ground recorded through the region"
    else:
        delta = geo.axis_delta_deg(rec.cog_through_region, geom.principal_axis_deg)
        f["heading"] = float(np.clip(1.0 - delta / 90.0, 0.0, 1.0))
        why["heading"] = (f"course {rec.cog_through_region:.0f} deg against observed slick "
                          f"axis {geom.principal_axis_deg:.0f} deg, difference {delta:.0f} deg "
                          f"(the observed axis includes advective stretching since release)")

    # --- broadcast ---
    best_gap, best = None, 0.0
    for g in rec.gaps:
        if g.end_h >= window_h[0] and g.start_h <= window_h[1]:
            v = g.anomaly * (0.5 + 0.5 * min(g.overlap * 2.0, 1.0))
            if v > best:
                best, best_gap = v, g
    f["broadcast"] = float(best)
    if best_gap is None:
        why["broadcast"] = ("no broadcast gap overlapping the origin window; reporting "
                            "cadence is consistent with this vessel's own baseline")
    else:
        why["broadcast"] = (f"{best_gap.duration_s / 3600:.2f} h of silence against this "
                            f"vessel's own {best_gap.baseline_cadence_s:.0f} s baseline "
                            f"cadence, beginning {abs(best_gap.start_h):.1f} h before detection "
                            f"and ending {abs(best_gap.end_h):.1f} h before it")

    # --- class prior ---
    spec = ais.SHIP_CLASSES.get(rec.vessel.ship_type, {"prior": 0.3})
    size = float(np.clip(rec.vessel.length_m / 140.0, 0.0, 1.0))
    f["class_prior"] = float(spec["prior"] * size)
    why["class_prior"] = (f"{rec.vessel.ship_type.replace('_', ' ')}, {rec.vessel.length_m:.0f} m; "
                          f"class prior {spec['prior']:.2f} scaled by size")
    if rec.vessel.length_m < 60:
        why["class_prior"] += " -- a hull this small cannot produce a slick of this area"

    return f, why, suppressed


def score_one(f, suppressed, weights):
    num = den = 0.0
    for k in FACTORS:
        if k in suppressed or k not in f:
            continue
        w = float(weights.get(k, 0.0))
        num += w * f[k]
        den += w
    return float(num / den) if den > 0 else 0.0


def rank(records, region_lonlat, window_h, geom, plane, pack=None):
    pack = pack or dict(DEFAULT_PACK)
    weights = pack["weights"]
    rows = []
    for rec in records:
        f, why, sup = factors_for(rec, region_lonlat, window_h, geom, plane)
        rows.append(dict(
            mmsi=rec.vessel.mmsi, name=rec.vessel.name, ship_type=rec.vessel.ship_type,
            length_m=rec.vessel.length_m, source=rec.vessel.source, channel=rec.channel,
            cog=None if not np.isfinite(rec.cog_through_region) else round(rec.cog_through_region, 1),
            delta_axis=None if not (np.isfinite(rec.cog_through_region) and geom.axis_usable)
                       else round(geo.axis_delta_deg(rec.cog_through_region, geom.principal_axis_deg), 1),
            crossing_h=None if not np.isfinite(rec.crossing_h) else round(rec.crossing_h, 2),
            closest_approach_km=round(rec.closest_approach_km, 2),
            baseline_cadence_s=round(rec.baseline_cadence_s, 1),
            implausible_fixes=rec.implausible_fixes,
            factors={k: round(v, 4) for k, v in f.items()},
            suppressed=sup,
            justifications=why,
            gaps=[dict(start_h=round(g.start_h, 3), end_h=round(g.end_h, 3),
                       duration_s=round(g.duration_s, 1),
                       baseline_cadence_s=round(g.baseline_cadence_s, 1),
                       anomaly=round(g.anomaly, 3), overlap=round(g.overlap, 3),
                       envelope=g.envelope) for g in rec.gaps],
            score=0.0,
        ))
    return rescore(rows, weights, pack)


def rescore(rows, weights, pack=None):
    """Pure function of stored factors -- this is what /rescore calls, and why
    a weight slider re-ranks instantly without recomputing stages 1-6."""
    for r in rows:
        r["score"] = round(score_one(r["factors"], r.get("suppressed", []), weights), 4)
    rows.sort(key=lambda r: -r["score"])
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    margin = round(rows[0]["score"] - rows[1]["score"], 4) if len(rows) > 1 else float("nan")
    return dict(
        ranked=rows,
        leader_margin=margin,
        weights=dict(weights),
        weight_pack=(pack or DEFAULT_PACK).get("file", "weights.v4.json"),
        weight_pack_version=(pack or DEFAULT_PACK).get("version", "v4"),
    )


def ablate(rows, weights):
    """SC-5: re-rank with each factor zeroed in turn.

    Turns the sensitivity claim into a measurement rather than an assertion.
    """
    base = rescore([dict(r) for r in rows], weights)
    out = {"baseline": {"leader": base["ranked"][0]["mmsi"],
                        "margin": base["leader_margin"]}}
    for k in FACTORS:
        w = dict(weights)
        w[k] = 0
        alt = rescore([dict(r) for r in rows], w)
        out[k] = {"leader": alt["ranked"][0]["mmsi"], "margin": alt["leader_margin"],
                  "leader_changed": alt["ranked"][0]["mmsi"] != base["ranked"][0]["mmsi"]}
    return out
