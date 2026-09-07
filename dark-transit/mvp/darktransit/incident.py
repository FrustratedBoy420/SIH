"""Incident generation -- the truth side of the MVP.

Everything in this module is the world. Nothing in the pipeline may read from
it except through the three observables an operator would actually have:

    * a calibrated sigma-nought scene,
    * an AIS position table,
    * gridded ocean and wind forcing.

Keeping that boundary sharp is what makes the run a closed-loop test: the slick
in the scene is the forward-advected release plume, so when the hindcast walks
it back, it is recovering a truth it was never shown.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import ais, drift, forcing, geo, scene as scene_mod

KN = ais.KN


@dataclass
class Scenario:
    name: str = "kutch"
    label: str = "Gulf of Kutch approaches"
    seed: int = 20260314
    detection_utc: str = "2026-03-14T06:12:00Z"
    release_lon: float = 69.20
    release_lat: float = 22.45
    release_age_h: float = 10.0          # truth: hours before detection
    release_duration_h: float = 0.30     # discharge under way
    culprit_cog: float = 41.0
    culprit_sog_kn: float = 11.4
    culprit_gap: tuple = (-10.62, -8.30)
    archive_start_h: float = -48.0
    archive_end_h: float = 4.0
    horizon_h: float = 40.0
    pixel_m: float = 100.0
    half_width_m: float = 32000.0
    with_oil: bool = True
    with_lookalikes: bool = True
    with_archive_scene: bool = True
    archive_scene_h: float = -10.20
    sigma_current: float = 0.15
    sigma_alpha: float = 0.25
    decoy_gap: bool = False              # the ambiguous scenario
    k_h: float = 5.0
    notes: str = ""


SCENARIOS = {
    "kutch": Scenario(),
    "lookalike": Scenario(name="lookalike", with_oil=False,
                          notes="Look-alikes only: a biogenic film and two low-wind cells, "
                                "no oil anywhere in the scene. Gate 1 should fire."),
    "clean": Scenario(name="clean", with_oil=False, with_lookalikes=False,
                      notes="Negative control: clean sea, ordinary traffic, nothing dark. "
                            "The correct output is Gate 1 firing and no vessel named."),
    "wide": Scenario(name="wide", sigma_current=1.10, sigma_alpha=1.20, horizon_h=40.0,
                     notes="Poorly constrained forcing. The origin region grows past the "
                           "point where it constrains traffic. Gate 2 should fire."),
    "no-radar": Scenario(name="no-radar", with_archive_scene=False,
                         notes="No radar pass covers the origin window, so the dark channel "
                               "is unavailable and the result is single-channel. Gate 3."),
    "ambiguous": Scenario(name="ambiguous", decoy_gap=True,
                          notes="A second tanker on a near-identical course, dark over the "
                                "same window. The evidence should not separate them. Gate 4."),
    "short-archive": Scenario(name="short-archive", archive_start_h=-12.0,
                              notes="The AIS archive does not span the drift horizon. "
                                    "Gate 5 should refuse to start."),
}


def _plane(sc):
    return geo.TangentPlane(sc.release_lat, sc.release_lon)


def build(sc: Scenario):
    """Generate one incident. Returns a dict of observables plus a `truth` block."""
    rng = np.random.default_rng(sc.seed)
    hours = np.arange(sc.archive_start_h - 8.0, sc.archive_end_h + 8.0, 1.0)
    bbox = (sc.release_lon - 1.6, sc.release_lat - 1.2,
            sc.release_lon + 1.6, sc.release_lat + 1.2)

    low_wind = [(sc.release_lon + 0.38, sc.release_lat + 0.25, 20.0, 5.4),
                (sc.release_lon - 0.06, sc.release_lat - 0.11, 16.0, 5.0)]
    current = forcing.make_current(bbox, hours, mean_speed=0.26, mean_dir_deg=70.0)
    wind = forcing.make_wind(bbox, hours, base_dir_deg=60.0, low_wind_cells=low_wind)

    plane = _plane(sc)
    params = drift.DriftParams(k_h=sc.k_h)

    # ---- truth: the release, laid along the culprit's own track ----
    n_p = 6000
    t_rel = np.linspace(-sc.release_age_h - sc.release_duration_h / 2,
                        -sc.release_age_h + sc.release_duration_h / 2, n_p)
    v = sc.culprit_sog_kn * KN
    d = (t_rel + sc.release_age_h) * 3600.0 * v
    rx = d * math.sin(math.radians(sc.culprit_cog))
    ry = d * math.cos(math.radians(sc.culprit_cog))
    rlon, rlat = plane.to_lonlat(rx, ry)

    slick = None
    if sc.with_oil:
        # Truth uses the true forcing: no ensemble perturbation. The ensemble
        # in the hindcast represents OUR uncertainty about the forcing, which
        # the ocean does not share.
        snaps = drift.integrate(rlon, rlat, -sc.release_age_h, sc.release_age_h,
                                current, wind, params, np.random.default_rng(sc.seed + 1))
        slick = (snaps[-1].lons, snaps[-1].lats)
        centre_lon = float(slick[0].mean())
        centre_lat = float(slick[1].mean())
    else:
        fwd = plane.to_lonlat(np.array([12000.0]), np.array([9000.0]))
        centre_lon, centre_lat = float(fwd[0][0]), float(fwd[1][0])

    # ---- fleet ----
    used = set()
    tracks = []

    culprit = ais.make_vessel(rng, "crude_tanker", used)
    culprit.cadence_s = 3.0
    culprit.v_max_ms = 13.5 * KN
    tracks.append(ais.straight_track(
        culprit, rng, sc.release_lon, sc.release_lat, -sc.release_age_h,
        sc.culprit_cog, sc.culprit_sog_kn, sc.archive_start_h, sc.archive_end_h,
        jitter_deg=1.5, gaps=[sc.culprit_gap]))

    # Others, deliberately built to be cleared on different grounds, so the
    # dropped-vessel report (TR-2) has something to say.
    fleet_spec = [
        # (type, through-offset m, at hour, cog, sog, jitter, gaps, why)
        ("product_tanker", (-1500, 2000), -10.10, 268.0, 12.6, 2.0, [], "course against the axis"),
        ("bulk_carrier",   (3000, -2500), -9.80, 130.0, 11.8, 1.5, [], "course against the axis"),
        ("container",      (1000, 1000),  -16.40, 236.0, 17.5, 1.0, [], "transited before the window"),
        ("general_cargo",  (26000, 14000), -10.00, 300.0, 11.2, 2.0, [], "no entry into the region"),
        ("crude_tanker",   (-2600, -1800), -10.30, 55.0, 12.1, 1.2, [], "course close to the axis, still broadcasting"),
        ("product_tanker", (-33000, 21000), -22.0, 95.0, 12.9, 1.5, [(-23.0, -21.2)], "gap far from the region"),
        ("fishing",        (-9500, 6800),  -9.95, 45.0, 7.4, 6.0, [], "course close to the axis, cannot produce this slick"),
        ("container",      (-4000, 3500),  -10.50, 220.0, 16.8, 1.0, [], "course against the axis"),
        ("tug",            (18000, -21000), -11.0, 12.0, 9.5, 3.0, [], "no entry into the region"),
        ("bulk_carrier",   (-27000, -26000), -13.0, 350.0, 12.2, 1.5, [], "no entry into the region"),
    ]
    for (stype, off, at_h, cog, sog, jit, gaps, _why) in fleet_spec:
        ves = ais.make_vessel(rng, stype, used)
        lo, la = plane.to_lonlat(np.array([float(off[0])]), np.array([float(off[1])]))
        if sc.decoy_gap and stype == "crude_tanker":
            gaps = [(-10.55, -8.45)]
            ves.cadence_s = 3.0
            cog = 44.0
        # OQ-6: the plausible maximum speed bound is taken as the larger of the
        # class design speed and the speed actually observed for this hull in the
        # archive. A bound below the observed speed would collapse the reachable
        # set to a degenerate segment.
        ves.v_max_ms = max(ves.v_max_ms, (sog + 1.8) * KN)
        tracks.append(ais.straight_track(ves, rng, float(lo[0]), float(la[0]), at_h,
                                         cog, sog, sc.archive_start_h, sc.archive_end_h,
                                         jitter_deg=jit, gaps=gaps))

    # ---- scenes ----
    biogenic = []
    if sc.with_lookalikes:
        b1 = plane.to_lonlat(np.array([-2000.0]), np.array([19000.0]))
        biogenic.append((float(b1[0][0]), float(b1[1][0]), 4200, 2600, 20, 9.0))

    def ships_at(h):
        out = []
        for tr in tracks:
            lo, la = tr.interp(h)
            if np.isfinite(lo[0]):
                out.append((float(lo[0]), float(la[0]), tr.vessel.length_m))
            elif h > tr.t_h[0] and h < tr.t_h[-1]:
                # dark, but still made of metal: dead-reckon the true position
                lo2 = np.interp(h, tr.t_h, tr.lon)
                la2 = np.interp(h, tr.t_h, tr.lat)
                out.append((float(lo2), float(la2), tr.vessel.length_m))
        return out

    det_scene = scene_mod.make_scene(
        "S1A-SYNTH-DET", centre_lon, centre_lat, sc.half_width_m, sc.pixel_m, 0.0, wind,
        slick_lonlat=slick, biogenic=biogenic, ship_lonlat=ships_at(0.0),
        rng=np.random.default_rng(sc.seed + 2))

    arc_scene = None
    if sc.with_archive_scene:
        cx, cy = plane.to_lonlat(np.array([2000.0]), np.array([2000.0]))
        arc_scene = scene_mod.make_scene(
            "S1A-SYNTH-ARC", float(cx[0]), float(cy[0]), sc.half_width_m, sc.pixel_m,
            sc.archive_scene_h, wind, slick_lonlat=None, biogenic=[],
            ship_lonlat=ships_at(sc.archive_scene_h),
            rng=np.random.default_rng(sc.seed + 3))

    return dict(
        scenario=sc,
        current=current, wind=wind, plane=plane, params=params,
        tracks=tracks, detection_scene=det_scene, archive_scene=arc_scene,
        truth=dict(
            release_lon=sc.release_lon, release_lat=sc.release_lat,
            release_age_h=sc.release_age_h, culprit_mmsi=culprit.mmsi,
            culprit_name=culprit.name, culprit_cog=sc.culprit_cog,
            slick_area_km2=(det_scene.truth["oil_pixels"] * (sc.pixel_m / 1000.0) ** 2),
        ),
    )
