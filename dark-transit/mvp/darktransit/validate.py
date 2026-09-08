"""Drift validation (PRD 17, AC-7).

The stated method is: take a drifting buoy whose position is known at two
times, hindcast it backward through our forcing from the later position, and
measure whether the earlier position falls inside the 95 % containment radius.
It validates the advection scheme against reality with no spill involved, and
it is the only part of this product that can be checked against ground truth.

**This module runs that method against synthetic drifters, not against the
Global Drifter Program.** The buoys are advected through the same analytic
forcing the hindcast then uses, so what is measured is whether the ensemble's
uncertainty is honestly sized -- whether r95 actually contains the truth 95 %
of the time -- and NOT whether our forcing resembles the real ocean. Those are
different claims and only the first is made here.

AC-7 is not satisfied by this. It is satisfied when the same function is
pointed at real drifter trajectories, which is a Phase 1 data task. The code
does not change; `drifter_truth` does.
"""

from __future__ import annotations

import math

import numpy as np

from . import drift, forcing, geo


def _domain(seed=11):
    lon0, lat0 = 69.20, 22.45
    hours = np.arange(-60.0, 12.0, 1.0)
    bbox = (lon0 - 1.6, lat0 - 1.2, lon0 + 1.6, lat0 + 1.2)
    current = forcing.make_current(bbox, hours, mean_speed=0.26, mean_dir_deg=70.0)
    wind = forcing.make_wind(bbox, hours, base_dir_deg=60.0)
    return lon0, lat0, current, wind


def drifter_truth(n, rng, current, wind, lon0, lat0, hours_back):
    """Synthetic buoys: released at t = -hours_back, tracked to t = 0.

    Replace this function with a reader for real trajectories and the rest of
    the module is unchanged. Buoys are drogued, so they follow the current with
    no leeway -- alpha = 0, which is also a small independent check that the
    leeway term is not silently baked into the advection.
    """
    plane = geo.TangentPlane(lat0, lon0)
    x0 = rng.uniform(-45000, 45000, n)
    y0 = rng.uniform(-40000, 40000, n)
    slon, slat = plane.to_lonlat(x0, y0)
    params = drift.DriftParams(alpha=0.0, k_h=0.0, sigma_current=0.0, sigma_alpha=0.0)
    end_lon, end_lat = [], []
    for i in range(n):
        snaps = drift.integrate(np.array([slon[i]]), np.array([slat[i]]),
                                -hours_back, hours_back, current, wind, params, rng=None)
        last = snaps[-1]
        if len(last.lons) == 0:
            end_lon.append(np.nan)
            end_lat.append(np.nan)
        else:
            end_lon.append(float(last.lons[0]))
            end_lat.append(float(last.lats[0]))
    return (np.asarray(slon), np.asarray(slat),
            np.asarray(end_lon), np.asarray(end_lat))


def run(n_drifters=25, hours_back=24.0, n_particles=600, seed=11, alpha=0.0,
        verbose=True):
    """Hindcast each drifter and check whether the truth lands inside r95.

    `alpha` is the leeway of the object being hindcast. A drogued buoy sits
    below the surface and has none, so the default is 0. Passing the oil value
    of 0.03 here is a deliberate mismatch and is what `--alpha 0.03` on the CLI
    does: see the sensitivity note in the return value.
    """
    rng = np.random.default_rng(seed)
    lon0, lat0, current, wind = _domain(seed)
    t_lon0, t_lat0, obs_lon, obs_lat = drifter_truth(
        n_drifters, rng, current, wind, lon0, lat0, hours_back)

    params = drift.DriftParams(n_particles=n_particles, alpha=alpha)
    rows = []
    for i in range(n_drifters):
        if not (np.isfinite(obs_lon[i]) and np.isfinite(t_lon0[i])):
            continue
        seed_lon = np.full(n_particles, obs_lon[i])
        seed_lat = np.full(n_particles, obs_lat[i])
        pert = drift.make_ensemble(n_particles, params, rng)
        snaps = drift.integrate(seed_lon, seed_lat, 0.0, -hours_back, current, wind,
                                params, rng, snapshot_every_h=hours_back, pert=pert)
        last = snaps[-1]
        if last.alive < 10:
            continue
        plane = geo.TangentPlane(float(np.mean(last.lats)), float(np.mean(last.lons)))
        cx, cy = plane.to_xy(float(np.mean(last.lons)), float(np.mean(last.lats)))
        tx, ty = plane.to_xy(t_lon0[i], t_lat0[i])
        err_km = float(np.hypot(tx - cx, ty - cy) / 1000.0)
        rows.append(dict(drifter=i, r95_km=round(last.r95_km, 3),
                         centroid_error_km=round(err_km, 3),
                         inside_r95=bool(err_km <= last.r95_km)))

    if not rows:
        return dict(available=False, reason="no drifter stayed inside the forcing domain")

    inside = sum(r["inside_r95"] for r in rows)
    errs = np.array([r["centroid_error_km"] for r in rows])
    r95s = np.array([r["r95_km"] for r in rows])
    from .fit import wilson
    out = dict(
        available=True, method="synthetic drifters, not Global Drifter Program",
        n=len(rows), hours_back=hours_back, n_particles=n_particles, seed=seed,
        leeway_alpha=alpha,
        inside_r95=inside,
        coverage=round(inside / len(rows), 4),
        coverage_ci95=wilson(inside, len(rows)),
        target_coverage=0.90,
        median_centroid_error_km=round(float(np.median(errs)), 3),
        p90_centroid_error_km=round(float(np.percentile(errs, 90)), 3),
        median_r95_km=round(float(np.median(r95s)), 3),
        drifters=rows,
        sensitivity=("Re-run with --alpha 0.03, the oil leeway, and coverage collapses "
                     "to 0 with a median error near 0.03 * U10 * t. The harness detects "
                     "a wrong leeway coefficient at the right magnitude, which is the "
                     "main thing one wants of it."),
        caveat=("Buoys were advected through the same analytic forcing the hindcast "
                "uses, so this measures whether the ensemble sizes its own uncertainty "
                "honestly, NOT whether the forcing resembles the real ocean. AC-7 needs "
                "real Global Drifter Program trajectories and is not satisfied by this."),
    )
    # Interpretation, derived rather than asserted. Coverage far above target is
    # not a pass: with the truth advected through the very forcing the hindcast
    # uses, there is no forcing error for the ensemble to be sized against, so
    # r95 is bound to be conservative. Saying "90 % target met" here would be
    # the most flattering available misreading of the number.
    ratio = out["median_centroid_error_km"] / max(out["median_r95_km"], 1e-9)
    if out["coverage"] >= 0.99 and ratio < 0.25:
        out["interpretation"] = (
            f"Over-dispersed, as expected. Median error {out['median_centroid_error_km']} km "
            f"against a median r95 of {out['median_r95_km']} km is a ratio of {ratio:.3f}: the "
            f"ensemble is far wider than the residual it has to cover, because the truth was "
            f"advected through the same forcing. This validates that the integrator round-trips "
            f"and that r95 is conservative. It does NOT validate the SIZE of r95 -- only real "
            f"drifters through independently-sourced forcing can do that (AC-7).")
    elif out["coverage"] < out["target_coverage"]:
        out["interpretation"] = (
            f"Coverage {out['coverage']:.2f} is below the {out['target_coverage']} target: the "
            f"ensemble is under-dispersed or biased. Median error "
            f"{out['median_centroid_error_km']} km against median r95 "
            f"{out['median_r95_km']} km. Check the leeway coefficient first -- a wrong alpha "
            f"shows up here as a bias of roughly alpha * U10 * t.")
    else:
        out["interpretation"] = (
            f"Coverage {out['coverage']:.2f} against a {out['target_coverage']} target, "
            f"error/r95 ratio {ratio:.3f}.")

    if verbose:
        print(f"  drifters              {out['n']}, hindcast {hours_back:.0f} h, "
              f"leeway alpha {alpha}")
        print(f"  inside r95            {inside}/{out['n']} = {out['coverage']:.2f} "
              f"(95 % CI {out['coverage_ci95']}, target {out['target_coverage']})")
        print(f"  centroid error        median {out['median_centroid_error_km']} km, "
              f"p90 {out['p90_centroid_error_km']} km")
        print(f"  median r95            {out['median_r95_km']} km")
        print()
        print(f"  {out['interpretation']}")
        print()
        print(f"  {out['caveat']}")
    return out
