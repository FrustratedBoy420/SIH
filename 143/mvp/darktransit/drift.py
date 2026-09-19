"""Lagrangian particle advection -- forward, and backward.

u_oil = u_current + alpha * u_wind10, alpha ~ 0.03 (the leeway model, standard
operational practice), integrated with RK4 at dt = 600 s, plus a random-walk
increment for turbulent diffusion with horizontal eddy diffusivity K_h.

Forward advection-diffusion is well posed. Backward is not: diffusion cannot be
un-mixed. What the backward integration computes is a REACHABLE SET -- the
region a particle could plausibly have come from -- and not a probability
density over true origins. Hence: `origin region`, never `origin point`, and no
probability is ever quoted for a specific launch position (PRD 10.8).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import geo, raster


@dataclass
class DriftParams:
    alpha: float = 0.03          # leeway coefficient
    k_h: float = 5.0             # horizontal eddy diffusivity, m^2/s
    dt_s: float = 600.0          # RK4 step
    n_particles: int = 2600
    integrator: str = "RK4"
    # Ensemble spread (DR-8). Real hindcast uncertainty is dominated by error in
    # the forcing, not by turbulent diffusion, so each particle carries its own
    # multiplicative perturbation on the current and on the leeway coefficient.
    # Without this the cloud grows like sqrt(t) and stays implausibly tight;
    # with it the region grows roughly linearly, which is what actually happens.
    sigma_current: float = 0.15
    sigma_alpha: float = 0.25


def make_ensemble(n, params: DriftParams, rng):
    """Per-particle (current_scale, alpha_scale) draws, held fixed for the run."""
    cs = 1.0 + params.sigma_current * rng.standard_normal(n)
    as_ = np.maximum(0.0, 1.0 + params.sigma_alpha * rng.standard_normal(n))
    return np.stack([cs, as_], axis=1)


@dataclass
class CloudSnapshot:
    hour: float                  # signed hours from detection (negative = back)
    lons: np.ndarray
    lats: np.ndarray
    r95_km: float
    polygon: list = field(default_factory=list)   # [[lon, lat], ...]
    alive: int = 0
    beached: int = 0


def _velocity(lon, lat, t_h, current, wind, alpha, pert=None):
    uc, vc = current.sample(lon, lat, t_h)
    uw, vw = wind.sample(lon, lat, t_h)
    if pert is None:
        return uc + alpha * uw, vc + alpha * vw
    cs, as_ = pert[:, 0], pert[:, 1]
    return cs * uc + alpha * as_ * uw, cs * vc + alpha * as_ * vw


def step_rk4(lon, lat, t_h, dt_s, current, wind, params: DriftParams, rng=None, pert=None):
    """One RK4 step of `dt_s` seconds (sign carries the direction), then the
    diffusive random walk. Returns new (lon, lat); out-of-domain becomes NaN."""
    plane = geo.TangentPlane(float(np.nanmean(lat)), float(np.nanmean(lon)))
    x, y = plane.to_xy(lon, lat)
    h = dt_s / 3600.0

    def vel(xx, yy, tt):
        lo, la = plane.to_lonlat(xx, yy)
        return _velocity(lo, la, tt, current, wind, params.alpha, pert)

    k1x, k1y = vel(x, y, t_h)
    k2x, k2y = vel(x + dt_s * k1x / 2, y + dt_s * k1y / 2, t_h + h / 2)
    k3x, k3y = vel(x + dt_s * k2x / 2, y + dt_s * k2y / 2, t_h + h / 2)
    k4x, k4y = vel(x + dt_s * k3x, y + dt_s * k3y, t_h + h)

    x = x + (dt_s / 6.0) * (k1x + 2 * k2x + 2 * k3x + k4x)
    y = y + (dt_s / 6.0) * (k1y + 2 * k2y + 2 * k3y + k4y)

    if rng is not None and params.k_h > 0:
        s = math.sqrt(2.0 * params.k_h * abs(dt_s))
        x = x + s * rng.standard_normal(x.shape)
        y = y + s * rng.standard_normal(y.shape)

    return plane.to_lonlat(x, y)


def integrate(lon, lat, t0_h, hours, current, wind, params: DriftParams, rng=None,
              snapshot_every_h=1.0, pert=None, land=None):
    """Integrate for `hours` (negative = backward). Returns snapshots at every
    `snapshot_every_h` hours, including the start.

    `land`, when supplied, is an absorbing boundary: a particle that enters it
    is beached and stops moving. Only the forward run passes one. Without this
    the cloud advects straight through the coast and the ashore fraction falls
    again on the far side, which would report a slick as having left a beach it
    is in fact sitting on.
    """
    lon = np.asarray(lon, dtype=float).copy()
    lat = np.asarray(lat, dtype=float).copy()
    direction = 1.0 if hours >= 0 else -1.0
    dt = params.dt_s * direction
    total_steps = int(round(abs(hours) * 3600.0 / params.dt_s))
    every = max(1, int(round(snapshot_every_h * 3600.0 / params.dt_s)))

    land_poly = np.asarray(land, dtype=float) if (land is not None and len(land) >= 3) else None
    beached = np.zeros(len(lon), dtype=bool)
    hold_lon = np.zeros(len(lon)); hold_lat = np.zeros(len(lat))

    snaps = [_snapshot(0.0, lon, lat, beached)]
    t = t0_h
    for i in range(1, total_steps + 1):
        lon, lat = step_rk4(lon, lat, t, dt, current, wind, params, rng, pert)
        t += dt / 3600.0
        if land_poly is not None:
            if beached.any():                       # hold the ones already ashore
                lon = np.where(beached, hold_lon, lon)
                lat = np.where(beached, hold_lat, lat)
            ok = np.isfinite(lon) & np.isfinite(lat)
            newly = np.zeros_like(beached)
            if ok.any():
                hit = geo.points_in_polygon(
                    np.stack([np.where(ok, lon, 0.0), np.where(ok, lat, 0.0)], axis=1), land_poly)
                newly = hit & ok & ~beached
            if newly.any():
                hold_lon[newly] = lon[newly]
                hold_lat[newly] = lat[newly]
                beached |= newly
        if i % every == 0 or i == total_steps:
            snaps.append(_snapshot(direction * i * params.dt_s / 3600.0, lon, lat, beached))
    return snaps


def _snapshot(hour, lon, lat, beached=None) -> CloudSnapshot:
    ok = np.isfinite(lon) & np.isfinite(lat)
    lo, la = lon[ok], lat[ok]
    nb = 0 if beached is None else int((beached & ok).sum())
    return CloudSnapshot(hour=float(hour), lons=lo, lats=la,
                         r95_km=r95_km(lo, la), alive=int(ok.sum()), beached=nb)


def r95_km(lons, lats) -> float:
    """Radius about the cloud centroid containing 95 % of surviving particles."""
    if len(lons) < 3:
        return float("nan")
    plane = geo.TangentPlane(float(np.mean(lats)), float(np.mean(lons)))
    x, y = plane.to_xy(lons, lats)
    r = np.hypot(x - x.mean(), y - y.mean())
    return float(np.percentile(r, 95) / 1000.0)


def density_region(lons, lats, cell_m=500.0, quantile=0.95, simplify_m=250.0,
                   min_component_frac=0.05):
    """The smallest set of cells holding `quantile` of the particles, taken in
    descending density order, returned as a LIST of rings in lon/lat.

    A convex hull was rejected: over a bimodal cloud it invents water no
    particle visited, and the containment factor is normalised by region area,
    so invented area directly deflates every vessel's score.

    Every connected component holding at least `min_component_frac` of the
    retained cells is returned, not just the largest. A genuinely bimodal
    origin region -- two plausible release areas either side of an eddy, say --
    is a real outcome of backward advection, and dropping a lobe would quietly
    clear whatever vessel was in it.
    """
    if len(lons) < 8:
        return []
    plane = geo.TangentPlane(float(np.mean(lats)), float(np.mean(lons)))
    x, y = plane.to_xy(lons, lats)
    pad = 2
    ix = np.floor((x - x.min()) / cell_m).astype(int) + pad
    iy = np.floor((y - y.min()) / cell_m).astype(int) + pad
    h, w = int(iy.max()) + pad + 1, int(ix.max()) + pad + 1
    grid = np.zeros((h, w), dtype=int)
    np.add.at(grid, (iy, ix), 1)

    flat = grid.ravel()
    order = np.argsort(flat)[::-1]
    csum = np.cumsum(flat[order])
    need = quantile * flat.sum()
    keep_n = int(np.searchsorted(csum, need) + 1)
    mask = np.zeros_like(flat, dtype=bool)
    mask[order[:keep_n]] = True
    mask = raster.close(mask.reshape(h, w), 1)

    lab, n = raster.label(mask)
    if n == 0:
        return []
    sizes = [(int((lab == k).sum()), k) for k in range(1, n + 1)]
    total = sum(s for s, _ in sizes)
    rings = []
    for size, k in sorted(sizes, reverse=True):
        if size < max(2, min_component_frac * total):
            continue
        ring_px = raster.trace_boundary(lab == k)
        if len(ring_px) < 4:
            continue
        ring_px = geo.simplify(ring_px, tol_m=simplify_m / cell_m)
        rx = x.min() + (ring_px[:, 0] - pad + 0.5) * cell_m
        ry = y.min() + (ring_px[:, 1] - pad + 0.5) * cell_m
        rlon, rlat = plane.to_lonlat(rx, ry)
        rings.append([[round(float(a), 6), round(float(b), 6)]
                      for a, b in zip(rlon, rlat)])
    return rings


def landfall(snaps, land_lonlat, frac_threshold=0.05):
    """First forward hour at which the cloud reaches the coast (DR-5).

    Reported as the hour at which `frac_threshold` of surviving particles are
    ashore, together with the whole fraction series, because "the leading edge
    touched land" and "the slick is ashore" are different operational
    statements and the watch officer needs both.

    Particles that reach land are counted, not removed: this is a forecast of
    where the oil goes, not a beaching model.
    """
    if not land_lonlat or len(land_lonlat) < 3:
        return dict(available=False,
                    reason="no coastline supplied for this domain",
                    landfall=False)
    series, eta_hour, first_touch = [], None, None
    for sn in snaps:
        if sn.alive == 0:
            continue
        f = sn.beached / float(sn.alive)
        series.append(dict(hour=round(sn.hour, 1), ashore_fraction=round(f, 4),
                           beached=sn.beached, alive=sn.alive))
        if f > 0 and first_touch is None:
            first_touch = sn.hour
        if f >= frac_threshold and eta_hour is None:
            eta_hour = sn.hour
    return dict(available=True, landfall=eta_hour is not None,
                eta_hour=None if eta_hour is None else round(eta_hour, 1),
                first_contact_hour=None if first_touch is None else round(first_touch, 1),
                frac_threshold=frac_threshold,
                ashore_series=series,
                note=("Hour at which the stated fraction of surviving particles has "
                      "reached the coastline polygon. Land is an absorbing boundary in "
                      "the forward run, so the fraction is cumulative and cannot fall. "
                      "Forward advection is well posed, so unlike the origin region "
                      "this is a genuine forecast."))


def seed_in_polygon(poly_lonlat, n, rng):
    """Rejection-sample `n` seed points inside a lon/lat ring."""
    p = np.asarray(poly_lonlat, dtype=float)
    lo, hi = p.min(axis=0), p.max(axis=0)
    out_lon, out_lat = [], []
    guard = 0
    while len(out_lon) < n and guard < 400:
        guard += 1
        k = max(n * 3, 512)
        cand = np.stack([rng.uniform(lo[0], hi[0], k), rng.uniform(lo[1], hi[1], k)], axis=1)
        inside = geo.points_in_polygon(cand, p)
        out_lon.extend(cand[inside, 0].tolist())
        out_lat.extend(cand[inside, 1].tolist())
    return np.array(out_lon[:n]), np.array(out_lat[:n])


def shear_per_hour(lon, lat, t_h, current, wind, params, d_m=4000.0):
    """Local horizontal shear magnitude, 1/h -- the number behind the HD-3
    caveat that a slick's principal axis can rotate in a sheared flow."""
    plane = geo.TangentPlane(lat, lon)
    ox = np.array([-d_m, d_m, 0.0, 0.0])
    oy = np.array([0.0, 0.0, -d_m, d_m])
    lo, la = plane.to_lonlat(ox, oy)
    u, v = _velocity(lo, la, t_h, current, wind, params.alpha)
    dudx = (u[1] - u[0]) / (2 * d_m)
    dvdx = (v[1] - v[0]) / (2 * d_m)
    dudy = (u[3] - u[2]) / (2 * d_m)
    dvdy = (v[3] - v[2]) / (2 * d_m)
    mag = math.sqrt(dudx ** 2 + dvdx ** 2 + dudy ** 2 + dvdy ** 2)
    return float(mag * 3600.0)
