"""Geodesy and planar geometry, kept deliberately small.

Everything metric happens in a local tangent plane (east, north) in metres,
centred on a scene reference point. At the scale this product works at -- one
scene, tens of kilometres -- an equirectangular tangent plane is accurate to
well under a pixel, and it keeps the whole pipeline free of a projection
dependency.
"""

from __future__ import annotations

import math

import numpy as np

R_EARTH = 6_371_008.8  # mean Earth radius, metres


class TangentPlane:
    """Local east/north plane about (lat0, lon0)."""

    def __init__(self, lat0: float, lon0: float):
        self.lat0 = float(lat0)
        self.lon0 = float(lon0)
        self._mlat = R_EARTH * math.pi / 180.0
        self._mlon = R_EARTH * math.pi / 180.0 * math.cos(math.radians(lat0))

    def to_xy(self, lon, lat):
        lon = np.asarray(lon, dtype=float)
        lat = np.asarray(lat, dtype=float)
        return (lon - self.lon0) * self._mlon, (lat - self.lat0) * self._mlat

    def to_lonlat(self, x, y):
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        return self.lon0 + x / self._mlon, self.lat0 + y / self._mlat


def haversine_m(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(math.sqrt(a))


def polygon_area_m2(xy) -> float:
    """Shoelace area of a planar ring, metres squared, sign discarded."""
    p = np.asarray(xy, dtype=float)
    if len(p) < 3:
        return 0.0
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def polygon_perimeter_m(xy) -> float:
    p = np.asarray(xy, dtype=float)
    if len(p) < 2:
        return 0.0
    d = np.roll(p, -1, axis=0) - p
    return float(np.hypot(d[:, 0], d[:, 1]).sum())


def points_in_polygon(pts, poly) -> np.ndarray:
    """Vectorised even-odd ray crossing. pts (N,2), poly (M,2)."""
    pts = np.asarray(pts, dtype=float).reshape(-1, 2)
    poly = np.asarray(poly, dtype=float)
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    x1, y1 = poly[:, 0], poly[:, 1]
    x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
    for i in range(len(poly)):
        ax, ay, bx, by = x1[i], y1[i], x2[i], y2[i]
        if ay == by:
            continue
        straddles = (ay > y) != (by > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            xint = ax + (y - ay) * (bx - ax) / (by - ay)
        inside ^= straddles & (x < xint)
    return inside


def convex_hull(pts) -> np.ndarray:
    """Andrew monotone chain."""
    p = np.unique(np.asarray(pts, dtype=float).reshape(-1, 2), axis=0)
    if len(p) <= 2:
        return p
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2:
                a, b = out[-2], out[-1]
                if (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) <= 0:
                    out.pop()
                else:
                    break
            out.append(q)
        return out

    lower, upper = half(p), half(p[::-1])
    return np.array(lower[:-1] + upper[:-1])


def ellipse_from_foci(f1, f2, sum_dist, n=96) -> np.ndarray:
    """The set {q : |q-f1| + |q-f2| <= sum_dist} as a closed ring.

    This is the reachable set across a broadcast gap (PRD 10.11): a vessel
    bounded by a maximum speed, dead-reckoned forward from the last fix and
    backward from the next, occupies exactly this ellipse.
    """
    f1 = np.asarray(f1, dtype=float)
    f2 = np.asarray(f2, dtype=float)
    c = np.linalg.norm(f2 - f1) / 2.0
    a = sum_dist / 2.0
    if a <= c:  # degenerate: the vessel cannot bridge the gap at v_max
        return np.array([f1, f2, f1])
    b = math.sqrt(a * a - c * c)
    mid = (f1 + f2) / 2.0
    ang = math.atan2(f2[1] - f1[1], f2[0] - f1[0])
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    ex, ey = a * np.cos(t), b * np.sin(t)
    ca, sa = math.cos(ang), math.sin(ang)
    return np.stack([mid[0] + ex * ca - ey * sa, mid[1] + ex * sa + ey * ca], axis=1)


def as_rings(region):
    """Normalise a region to a list of rings.

    A region may be a single ring [[lon,lat], ...] or several disjoint ones.
    Callers should not have to care, and the ones that did care were the bug:
    an origin region with two lobes used to lose one.
    """
    if region is None:
        return []
    r = list(region)
    if not r:
        return []
    first = r[0]
    # a single ring's first element is a coordinate pair of two numbers
    if len(first) == 2 and all(isinstance(v, (int, float, np.floating, np.integer))
                               for v in first):
        return [np.asarray(r, dtype=float)]
    return [np.asarray(ring, dtype=float) for ring in r if len(ring) >= 3]


def points_in_rings(pts, region) -> np.ndarray:
    """Inside ANY ring of a possibly multi-part region."""
    rings = as_rings(region)
    pts = np.asarray(pts, dtype=float).reshape(-1, 2)
    if not rings:
        return np.zeros(len(pts), dtype=bool)
    out = np.zeros(len(pts), dtype=bool)
    for ring in rings:
        out |= points_in_polygon(pts, ring)
    return out


def region_bbox(region):
    rings = as_rings(region)
    if not rings:
        return None
    allp = np.concatenate(rings, axis=0)
    return allp.min(axis=0), allp.max(axis=0)


def overlap_fraction(region_poly, other_poly, n=160) -> float:
    """area(other ∩ region) / area(region), by a deterministic grid sample.

    Normalised by the *region*, not by `other`: a huge reachable set gets no
    credit for covering everything, it gets credit for covering the origin
    region, which is the actual question (PRD 10.11).

    `region_poly` may be multi-part; the denominator is then the union, so a
    reachable set that covers one lobe of a two-lobe region scores about a
    half rather than a one.
    """
    bb = region_bbox(region_poly)
    if bb is None or len(np.asarray(other_poly)) < 3:
        return 0.0
    lo, hi = bb
    gx = np.linspace(lo[0], hi[0], n)
    gy = np.linspace(lo[1], hi[1], n)
    mx, my = np.meshgrid(gx, gy)
    pts = np.stack([mx.ravel(), my.ravel()], axis=1)
    in_r = points_in_rings(pts, region_poly)
    if not in_r.any():
        return 0.0
    in_o = points_in_polygon(pts[in_r], other_poly)
    return float(in_o.mean())


def bearing_deg(dx, dy) -> float:
    """Planar (east, north) delta to a compass bearing in degrees true."""
    return float((math.degrees(math.atan2(dx, dy))) % 360.0)


def axis_delta_deg(cog_deg: float, axis_deg: float) -> float:
    """|COG - axis| folded onto [0, 90]. A slick axis is undirected (HD-1)."""
    d = abs((cog_deg - axis_deg) % 180.0)
    return float(min(d, 180.0 - d))


def simplify(xy, tol_m: float = 120.0) -> np.ndarray:
    """Douglas-Peucker, so an emitted polygon is readable in GeoJSON."""
    p = np.asarray(xy, dtype=float)
    if len(p) < 3:
        return p
    keep = np.zeros(len(p), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(p) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = p[i], p[j]
        ab = b - a
        n = np.linalg.norm(ab)
        seg = p[i + 1 : j] - a
        if n == 0:
            d = np.linalg.norm(seg, axis=1)
        else:
            d = np.abs(seg[:, 0] * ab[1] - seg[:, 1] * ab[0]) / n
        k = int(np.argmax(d))
        if d[k] > tol_m:
            keep[i + 1 + k] = True
            stack.append((i, i + 1 + k))
            stack.append((i + 1 + k, j))
    return p[keep]
