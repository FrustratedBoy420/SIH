"""Ocean current and 10 m wind forcing.

In the full build these are CMEMS GLOBAL_ANALYSISFORECAST_PHY (1/12 deg,
hourly) and ERA5 (0.25 deg, hourly), read with xarray. Here they are generated
analytically -- but they are generated *onto a real grid* and consumed through
the same trilinear space-time interpolator the real fields would use, so the
drift code below is the drift code that ships.

Simulated: the values. Real: the grid, the interpolation, and everything
downstream of it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

M2_PERIOD_H = 12.4206  # principal lunar semidiurnal tide


@dataclass
class ForcingField:
    lons: np.ndarray          # (nx,)
    lats: np.ndarray          # (ny,)
    times_h: np.ndarray       # (nt,) hours relative to t_ref
    u: np.ndarray             # (nt, ny, nx) eastward, m/s
    v: np.ndarray             # (nt, ny, nx) northward, m/s
    name: str = ""

    def sample(self, lon, lat, t_h):
        """Trilinear interpolation in (lon, lat, time).

        Particles that leave the domain are reported as NaN and retired by the
        caller -- never clamped to the boundary, because clamping produces a
        false pile-up on the domain edge that reads as a confident origin.
        """
        lon = np.atleast_1d(np.asarray(lon, dtype=float))
        lat = np.atleast_1d(np.asarray(lat, dtype=float))
        t_h = float(t_h)

        def frac(grid, q):
            i = np.searchsorted(grid, q) - 1
            i = np.clip(i, 0, len(grid) - 2)
            f = (q - grid[i]) / (grid[i + 1] - grid[i])
            return i, f

        ix, fx = frac(self.lons, lon)
        iy, fy = frac(self.lats, lat)
        it, ft = frac(self.times_h, np.array([t_h]))
        it, ft = int(it[0]), float(ft[0])

        oob = (
            (lon < self.lons[0]) | (lon > self.lons[-1])
            | (lat < self.lats[0]) | (lat > self.lats[-1])
        )

        out = []
        for comp in (self.u, self.v):
            c0, c1 = comp[it], comp[it + 1]

            def bil(c):
                return (
                    c[iy, ix] * (1 - fx) * (1 - fy)
                    + c[iy, ix + 1] * fx * (1 - fy)
                    + c[iy + 1, ix] * (1 - fx) * fy
                    + c[iy + 1, ix + 1] * fx * fy
                )

            val = bil(c0) * (1 - ft) + bil(c1) * ft
            out.append(np.where(oob, np.nan, val))
        return out[0], out[1]

    def speed(self, lon, lat, t_h):
        u, v = self.sample(lon, lat, t_h)
        return np.hypot(u, v)


def _grid(bbox, res_deg):
    lon0, lat0, lon1, lat1 = bbox
    return (
        np.arange(lon0, lon1 + res_deg / 2, res_deg),
        np.arange(lat0, lat1 + res_deg / 2, res_deg),
    )


def make_current(bbox, hours, res_deg=1 / 12, mean_speed=0.28, mean_dir_deg=250.0,
                 tide_amp=0.22, eddy=True, name="analytic-current-1/12deg-hourly"):
    """Mean flow + M2 tidal ellipse + one stationary eddy.

    The mean flow sets where the hindcast walks back to; the tide sets how much
    the answer depends on *when* in the cycle the discharge happened; the eddy
    puts horizontal shear in the field so the axis-rotation caveat (HD-3) has
    something real to measure.
    """
    lons, lats = _grid(bbox, res_deg)
    LON, LAT = np.meshgrid(lons, lats)
    th = math.radians(mean_dir_deg)
    um, vm = mean_speed * math.sin(th), mean_speed * math.cos(th)

    clon, clat = LON.mean(), LAT.mean()
    dx = (LON - clon) * 111e3 * math.cos(math.radians(clat))
    dy = (LAT - clat) * 111e3
    r = np.hypot(dx, dy)
    if eddy:
        scale = 26e3
        rot = 0.30 * np.exp(-(r / scale) ** 2)
        ue, ve = -rot * dy / max(scale, 1), rot * dx / max(scale, 1)
    else:
        ue = ve = np.zeros_like(LON)

    u = np.empty((len(hours), len(lats), len(lons)))
    v = np.empty_like(u)
    for k, h in enumerate(hours):
        ph = 2 * math.pi * h / M2_PERIOD_H
        ut = tide_amp * math.cos(ph)
        vt = 0.6 * tide_amp * math.sin(ph)
        u[k] = um + ut + ue
        v[k] = vm + vt + ve
    return ForcingField(lons, lats, np.asarray(hours, dtype=float), u, v, name)


def make_wind(bbox, hours, res_deg=0.25, base_speed=7.6, base_dir_deg=235.0,
              veer_deg_per_h=0.35, low_wind_cells=(), name="analytic-wind10m-0.25deg-hourly"):
    """Synoptic wind that slowly veers, with optional low-wind cells.

    The cells matter twice: they are what the drift feels, and they are what
    makes part of the radar scene dark without any oil in it. Detection's
    look-alike rejection (DT-4) reads wind from this same field, so the scene
    and the discriminator cannot disagree.

    low_wind_cells: iterable of (lon, lat, radius_km, deficit_ms).
    """
    lons, lats = _grid(bbox, res_deg)
    LON, LAT = np.meshgrid(lons, lats)
    deficit = np.zeros_like(LON)
    for clon, clat, rad_km, dfc in low_wind_cells:
        dx = (LON - clon) * 111.0 * math.cos(math.radians(clat))
        dy = (LAT - clat) * 111.0
        deficit += dfc * np.exp(-((dx * dx + dy * dy) / (2 * rad_km * rad_km)))

    u = np.empty((len(hours), len(lats), len(lons)))
    v = np.empty_like(u)
    for k, h in enumerate(hours):
        sp = np.maximum(base_speed - deficit, 0.4)
        th = np.radians(base_dir_deg + veer_deg_per_h * h)
        u[k] = sp * np.sin(th)
        v[k] = sp * np.cos(th)
    return ForcingField(lons, lats, np.asarray(hours, dtype=float), u, v, name)
