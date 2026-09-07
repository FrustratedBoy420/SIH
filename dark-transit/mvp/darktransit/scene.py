"""Synthetic calibrated SAR scene.

Simulated: the pixel values. Real: everything that reads them. The scene is
built so that the things which make detection hard are actually present --
low-wind cells, a biogenic film, speckle, bright ship targets -- and so that
the slick is the *forward-advected* release plume rather than a hand-drawn
ellipse, which is what makes the hindcast a closed-loop test rather than a
demonstration of a shape someone typed in.

Radiometry, roughly Bragg-like and monotone in wind:

    sigma0_dB(sea)  = -22 + 12 * log10(U10)          U10 in m/s
    sigma0_dB(oil)  = sigma0_dB(sea) - damping_dB

so a 7.5 m/s sea sits near -11.5 dB, a 2.5 m/s low-wind cell near -17.2 dB, and
a slick near -23.5 dB. Those are the right order of magnitude and the right
ordering; they are not a calibrated instrument model.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from . import geo, raster


@dataclass
class Scene:
    scene_id: str
    sigma0_db: np.ndarray
    wind_ms: np.ndarray
    plane: geo.TangentPlane
    x: np.ndarray            # (nx,) easting of pixel centres, metres
    y: np.ndarray            # (ny,) northing
    pixel_m: float
    acquired_h: float        # hours relative to detection
    sensor: str
    mode: str
    polarisation: str
    looks: float
    noise_floor_db: float
    truth: dict

    @property
    def shape(self):
        return self.sigma0_db.shape

    def lonlat_grid(self):
        X, Y = np.meshgrid(self.x, self.y)
        return self.plane.to_lonlat(X, Y)

    def xy_of(self, lon, lat):
        return self.plane.to_xy(lon, lat)

    def px_of(self, lon, lat):
        gx, gy = self.plane.to_xy(lon, lat)
        col = (gx - self.x[0]) / self.pixel_m
        row = (gy - self.y[0]) / self.pixel_m
        return col, row

    def lonlat_of_px(self, col, row):
        gx = self.x[0] + np.asarray(col, dtype=float) * self.pixel_m
        gy = self.y[0] + np.asarray(row, dtype=float) * self.pixel_m
        return self.plane.to_lonlat(gx, gy)


def _sea_db(wind_ms):
    return -22.0 + 12.0 * np.log10(np.maximum(wind_ms, 0.5))


def _blob(X, Y, cx, cy, rx, ry, rot_deg, rng=None, roughness=0.0):
    ca, sa = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
    dx, dy = X - cx, Y - cy
    u = dx * ca + dy * sa
    v = -dx * sa + dy * ca
    r = np.sqrt((u / rx) ** 2 + (v / ry) ** 2)
    if roughness > 0:
        ang = np.arctan2(v, u)
        r = r * (1.0 + roughness * (np.sin(3 * ang + 0.7) + 0.6 * np.sin(5 * ang - 1.3)) / 2.0)
    return r


def make_scene(scene_id, centre_lon, centre_lat, half_width_m, pixel_m, acquired_h,
               wind_field, slick_lonlat=None, slick_damping_db=12.0,
               biogenic=(), ship_lonlat=(), rng=None, looks=4.0,
               sensor="Sentinel-1 (synthetic analogue)", mode="IW", polarisation="VV"):
    """Build one calibrated sigma-nought scene.

    slick_lonlat : (lon, lat) arrays of advected oil particles, or None
    biogenic     : iterable of (lon, lat, semi_major_m, semi_minor_m, rot_deg, damping_dB)
    ship_lonlat  : iterable of (lon, lat, length_m)
    """
    rng = rng if rng is not None else np.random.default_rng(0)
    plane = geo.TangentPlane(centre_lat, centre_lon)
    n = int(2 * half_width_m / pixel_m)
    x = (np.arange(n) - n / 2 + 0.5) * pixel_m
    y = (np.arange(n) - n / 2 + 0.5) * pixel_m
    X, Y = np.meshgrid(x, y)
    lon, lat = plane.to_lonlat(X, Y)

    wind = wind_field.speed(lon.ravel(), lat.ravel(), acquired_h).reshape(X.shape)
    sigma_db = _sea_db(wind)

    truth = {"oil_pixels": 0, "biogenic_pixels": 0, "ships": 0}

    # --- oil: kernel density of the advected particle cloud, sharply edged ---
    if slick_lonlat is not None and len(slick_lonlat[0]) > 8:
        sx, sy = plane.to_xy(slick_lonlat[0], slick_lonlat[1])
        col = np.clip(((sx - x[0]) / pixel_m).astype(int), 0, n - 1)
        row = np.clip(((sy - y[0]) / pixel_m).astype(int), 0, n - 1)
        dens = np.zeros_like(sigma_db)
        np.add.at(dens, (row, col), 1.0)
        dens = raster.box_mean(dens, max(2, int(round(400.0 / pixel_m))))
        if dens.max() > 0:
            dens = dens / dens.max()
            # A film has a physical edge: a hard cut, then one pixel of feather.
            core = dens > 0.14
            core = raster.close(core, 1)
            soft = raster.box_mean(core.astype(float), 1)
            sigma_db = sigma_db - slick_damping_db * soft
            truth["oil_pixels"] = int(core.sum())
            truth["oil_mask"] = core

    # --- biogenic film: same darkness, no edge ---
    for (blon, blat, rx, ry, rot, damp) in biogenic:
        bx, by = plane.to_xy(blon, blat)
        r = _blob(X, Y, float(bx), float(by), rx, ry, rot, roughness=0.35)
        soft = np.clip(1.6 - r, 0.0, 1.0)                # wide, gradual falloff
        soft = raster.box_mean(soft, max(3, int(round(900.0 / pixel_m))))
        sigma_db = sigma_db - damp * soft
        truth["biogenic_pixels"] += int((soft > 0.5).sum())

    # --- ships: metal returns radar hard ---
    for (slon, slat, length_m) in ship_lonlat:
        cx, cy = plane.to_xy(slon, slat)
        col = int(round((float(cx) - x[0]) / pixel_m))
        row = int(round((float(cy) - y[0]) / pixel_m))
        if not (1 <= col < n - 1 and 1 <= row < n - 1):
            continue
        extent = max(1, int(round(length_m / (2.0 * pixel_m))))
        boost = 16.0 + 6.0 * math.log10(max(length_m, 20.0) / 100.0)
        for dr in range(-extent, extent + 1):
            for dc in range(-extent, extent + 1):
                rr, cc = row + dr, col + dc
                if 0 <= rr < n and 0 <= cc < n and (dr * dr + dc * dc) <= extent * extent:
                    sigma_db[rr, cc] += boost
        truth["ships"] += 1

    # --- multiplicative speckle, L looks ---
    lin = 10.0 ** (sigma_db / 10.0)
    lin = lin * rng.gamma(looks, 1.0 / looks, lin.shape)
    noise_floor = -24.5
    lin = lin + 10.0 ** (noise_floor / 10.0)
    sigma_db = 10.0 * np.log10(lin)

    return Scene(scene_id=scene_id, sigma0_db=sigma_db, wind_ms=wind, plane=plane,
                 x=x, y=y, pixel_m=pixel_m, acquired_h=acquired_h, sensor=sensor,
                 mode=mode, polarisation=polarisation, looks=looks,
                 noise_floor_db=noise_floor, truth=truth)
