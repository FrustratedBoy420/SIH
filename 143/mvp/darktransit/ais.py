"""Synthetic AIS (TR-7).

Real AIS for Indian waters is restricted; the problem statement explicitly
permits synthetic traffic, and this generator is what stands in for it. Every
run that uses it declares `provenance.ais = "synthetic"` in the run log, in the
interface, and on page 1 of the dossier (IN-5, NFR-7).

MMSIs are minted with the prefix 999, which is not an assigned Maritime
Identification Digit, so no generated identity can collide with a real vessel
(NFR-9).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import geo

KN = 0.514444  # knots to m/s

SHIP_CLASSES = {
    "crude_tanker":   dict(length=(180, 250), beam=(32, 44), draught=(11, 16), sog=(10, 14), prior=1.00),
    "product_tanker": dict(length=(110, 180), beam=(18, 32), draught=(8, 12),  sog=(11, 15), prior=0.92),
    "bulk_carrier":   dict(length=(150, 230), beam=(24, 36), draught=(9, 14),  sog=(11, 14), prior=0.55),
    "container":      dict(length=(180, 300), beam=(28, 45), draught=(10, 14), sog=(15, 20), prior=0.45),
    "general_cargo":  dict(length=(80, 140),  beam=(14, 22), draught=(6, 9),   sog=(10, 13), prior=0.50),
    "fishing":        dict(length=(18, 34),   beam=(5, 8),   draught=(2, 4),   sog=(5, 9),   prior=0.05),
    "tug":            dict(length=(24, 40),   beam=(8, 12),  draught=(3, 5),   sog=(8, 11),  prior=0.10),
}

_NAME_A = ["Kestrel", "Meridian", "Sable", "Harrow", "Pelagic", "Nautilus", "Corvid",
           "Halyard", "Bramble", "Ferrous", "Ostara", "Quillon", "Sandpiper", "Tarpon"]
_NAME_B = ["Ridge", "Crest", "Reach", "Point", "Sound", "Gate", "Strand", "Bay",
           "Channel", "Bank", "Passage", "Head"]


@dataclass
class Vessel:
    mmsi: str
    name: str
    ship_type: str
    length_m: float
    beam_m: float
    draught_m: float
    cadence_s: float
    v_max_ms: float
    source: str = "synthetic"


@dataclass
class Track:
    vessel: Vessel
    t_h: np.ndarray          # hours relative to detection time
    lon: np.ndarray
    lat: np.ndarray
    sog_kn: np.ndarray
    cog_deg: np.ndarray
    gaps: list = field(default_factory=list)   # [(start_h, end_h)] as generated

    def interp(self, t):
        """Position at time t (hours), or NaN inside a broadcast gap."""
        t = np.atleast_1d(np.asarray(t, dtype=float))
        lo = np.interp(t, self.t_h, self.lon, left=np.nan, right=np.nan)
        la = np.interp(t, self.t_h, self.lat, left=np.nan, right=np.nan)
        for a, b in self.gaps:
            inside = (t > a) & (t < b)
            lo = np.where(inside, np.nan, lo)
            la = np.where(inside, np.nan, la)
        return lo, la


def _mmsi(rng):
    return "999" + "".join(str(int(d)) for d in rng.integers(0, 10, 6))


def _name(rng, used):
    for _ in range(60):
        n = f"{_NAME_A[rng.integers(len(_NAME_A))]} {_NAME_B[rng.integers(len(_NAME_B))]}"
        if n not in used:
            used.add(n)
            return n
    return f"Vessel {len(used) + 1}"


def make_vessel(rng, ship_type, used_names):
    spec = SHIP_CLASSES[ship_type]
    length = float(rng.uniform(*spec["length"]))
    return Vessel(
        mmsi=_mmsi(rng),
        name=_name(rng, used_names),
        ship_type=ship_type,
        length_m=round(length, 1),
        beam_m=round(float(rng.uniform(*spec["beam"])), 1),
        draught_m=round(float(rng.uniform(*spec["draught"])), 1),
        # Class A cadence under way is 2-10 s; a few hulls report lazily, which
        # is exactly why gaps are scored against a per-vessel baseline (TR-3).
        cadence_s=float(rng.choice([3.0, 6.0, 10.0, 30.0, 60.0])),
        v_max_ms=float(rng.uniform(*spec["sog"]) + 2.0) * KN,
    )


def straight_track(vessel, rng, through_lon, through_lat, at_h, cog_deg, sog_kn,
                   t0_h, t1_h, jitter_deg=0.0, gaps=()):
    """A vessel passing through a given point at a given time on a given course.

    Course wanders by `jitter_deg` per hour so tracks are not perfectly
    straight, which matters for the COG extraction in TR-5.
    """
    n = int(max(8, (t1_h - t0_h) * 3600.0 / vessel.cadence_s))
    t = np.linspace(t0_h, t1_h, n)
    cog = cog_deg + jitter_deg * np.sin(2 * math.pi * (t - t0_h) / 9.0)
    v = sog_kn * KN
    dt = np.gradient(t) * 3600.0
    ve = v * np.sin(np.radians(cog))
    vn = v * np.cos(np.radians(cog))
    x = np.cumsum(ve * dt) - np.interp(at_h, t, np.cumsum(ve * dt))
    y = np.cumsum(vn * dt) - np.interp(at_h, t, np.cumsum(vn * dt))
    plane = geo.TangentPlane(through_lat, through_lon)
    lon, lat = plane.to_lonlat(x, y)
    return Track(vessel, t, np.asarray(lon), np.asarray(lat),
                 np.full(n, sog_kn), cog, list(gaps))


def to_positions(track: Track, drop_gaps=True):
    """Flatten a track into the normalised position table (IN-3)."""
    keep = np.ones(len(track.t_h), dtype=bool)
    if drop_gaps:
        for a, b in track.gaps:
            keep &= ~((track.t_h > a) & (track.t_h < b))
    return dict(
        mmsi=track.vessel.mmsi,
        t_h=track.t_h[keep],
        lon=track.lon[keep],
        lat=track.lat[keep],
        sog_kn=track.sog_kn[keep],
        cog_deg=track.cog_deg[keep],
    )
