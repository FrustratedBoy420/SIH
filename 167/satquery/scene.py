"""Synthetic scene generation.

**What is simulated and what is real.**

Simulated: the pixel values. We cannot obtain Cartosat-2S or RISAT imagery, and
the ISRO/SAC evaluation set is explicitly undisclosed. So the scenes here are
generated.

Real: everything that *reads* them. The rasters produced by this module are
genuine GeoTIFFs with a real affine geotransform in EPSG:4326, correct band
structure, and radiometry that follows the physics each sensor actually
measures. Every downstream module — grounding, change detection, SAR fusion,
the evidence layer — operates on them exactly as it would on a real
acquisition, and none of them knows the difference.

The generator also records ground truth in `Scene.truth`. **No analysis module
ever reads it.** It exists so `eval.py` can score the pipeline against a
quantity the pipeline was never shown, which is the only way a synthetic
benchmark means anything.

The physics that matter here:

  optical   measures reflected sunlight per wavelength band. Vegetation is
            bright in near-infrared and dark in red — that contrast is what
            NDVI exploits. Water absorbs NIR almost completely. Cloud is
            opaque and bright across the visible bands.

  SAR       measures backscatter: how much of an emitted radar pulse returns.
            Smooth water is specular and reflects away, so it is very dark.
            Vegetation scatters diffusely, mid-grey. Buildings act as corner
            reflectors and return strongly, so they are very bright. Cloud is
            transparent at radar wavelengths. Speckle is multiplicative, not
            additive — that distinction changes which filters work.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .raster import GeoTransform, Raster

# land-cover classes
WATER, VEGETATION, SOIL, BUILT = 0, 1, 2, 3
CLASS_NAMES = {WATER: "water", VEGETATION: "vegetation",
               SOIL: "bare soil", BUILT: "built-up"}


# --------------------------------------------------------------------------- #
# value noise
# --------------------------------------------------------------------------- #

def _hash2(x: np.ndarray, y: np.ndarray, seed: int) -> np.ndarray:
    h = np.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return h - np.floor(h)


def _value_noise(h: int, w: int, freq: float, seed: int) -> np.ndarray:
    gy, gx = np.mgrid[0:h, 0:w]
    x = gx / w * freq
    y = gy / h * freq
    xi, yi = np.floor(x), np.floor(y)
    xf, yf = x - xi, y - yi
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    a = _hash2(xi, yi, seed)
    b = _hash2(xi + 1, yi, seed)
    c = _hash2(xi, yi + 1, seed)
    d = _hash2(xi + 1, yi + 1, seed)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def fbm(h: int, w: int, octaves: int = 5, freq: float = 4.0, seed: int = 0) -> np.ndarray:
    out = np.zeros((h, w), np.float32)
    amp, f, norm = 0.5, freq, 0.0
    for i in range(octaves):
        out += amp * _value_noise(h, w, f, seed + i * 17)
        norm += amp
        amp *= 0.5
        f *= 2
    return (out / max(norm, 1e-6)).astype(np.float32)


# --------------------------------------------------------------------------- #
# Scene
# --------------------------------------------------------------------------- #

@dataclass
class Scene:
    """A synthetic acquisition: land cover, plus the rasters derived from it."""

    name: str
    size: int
    classes: np.ndarray                       # (h, w) uint8, land-cover class
    roughness: np.ndarray                     # (h, w) float32, drives backscatter
    cloud: np.ndarray                         # (h, w) float32, optical opacity
    transform: GeoTransform
    truth: dict[str, Any] = field(default_factory=dict)

    # -- sensors ----------------------------------------------------------- #
    def optical(self, seed: int = 0, with_cloud: bool = True) -> Raster:
        """Four bands: red, green, blue, nir. Cloud is opaque."""
        h, w = self.classes.shape
        grain = fbm(h, w, 4, 14.0, seed + 3) * 0.30 + 0.85

        # per-class reflectance, roughly Sentinel-2 surface reflectance shapes
        refl = {
            WATER:      (0.035, 0.055, 0.085, 0.015),   # NIR nearly zero
            VEGETATION: (0.045, 0.085, 0.038, 0.400),   # NIR very high
            SOIL:       (0.220, 0.200, 0.165, 0.290),
            BUILT:      (0.185, 0.190, 0.195, 0.210),
        }
        bands = np.zeros((4, h, w), np.float32)
        for cls, vals in refl.items():
            m = self.classes == cls
            for b in range(4):
                bands[b][m] = vals[b]
        bands *= grain[None]

        if with_cloud:
            c = self.cloud[None]
            bands = bands * (1 - c) + np.array([0.92, 0.93, 0.95, 0.88],
                                               np.float32)[:, None, None] * c

        bands = np.clip(bands * 2.2, 0, 1)     # display stretch
        return Raster(
            data=bands.astype(np.float32), transform=self.transform,
            crs="EPSG:4326", georeferenced=True, sensor="optical",
            band_names=["red", "green", "blue", "nir"],
            source=f"{self.name}_optical.tif",
            acquired=self.truth.get("acquired", ""),
            meta={"platform": "Sentinel-2 (synthetic)", "display_gain": 2.2,
                  "cloud_pct": round(float((self.cloud > 0.3).mean() * 100), 1)},
        )

    def sar(self, seed: int = 0) -> Raster:
        """Two bands: VV, VH. Multiplicative speckle. Cloud is invisible."""
        h, w = self.roughness.shape
        # gamma-distributed speckle is the correct model for multi-look SAR
        rng = np.random.default_rng(seed + 991)
        looks = 4
        speckle = rng.gamma(looks, 1.0 / looks, size=(h, w)).astype(np.float32)

        vv = np.clip(self.roughness * speckle, 0, 1)
        # VH is cross-polarised: weaker overall, and relatively stronger over
        # vegetation because volume scattering depolarises the return
        veg = (self.classes == VEGETATION).astype(np.float32)
        vh = np.clip(self.roughness * 0.42 * speckle * (1 + 0.55 * veg), 0, 1)

        data = np.stack([vv, vh]).astype(np.float32)
        return Raster(
            data=data, transform=self.transform, crs="EPSG:4326",
            georeferenced=True, sensor="sar", band_names=["vv", "vh"],
            source=f"{self.name}_sar.tif",
            acquired=self.truth.get("acquired", ""),
            meta={"platform": "Sentinel-1 GRD (synthetic)",
                  "looks": looks, "polarisation": "VV+VH"},
        )


def build(name: str = "kharagpur", size: int = 512, seed: int = 7,
          origin: tuple[float, float] = (85.24, 23.50),
          extent_deg: float = 0.18,
          urban_growth: float = 0.0,
          acquired: str = "2024-01-15T05:42:00Z") -> Scene:
    """Generate a scene.

    `urban_growth` expands the built-up cluster, which is how the bi-temporal
    pair is produced: the same scene at two values of it. The change detector
    is then measured against a truth mask it never sees.
    """
    h = w = size
    gy, gx = np.mgrid[0:h, 0:w]
    u, v = gx / w, gy / h

    grain = fbm(h, w, 5, 9.0, seed)
    fine = fbm(h, w, 4, 22.0, seed + 41)

    # -- river: a meander, width modulated along its length ------------------
    axis = 0.62 + 0.13 * np.sin(u * 7.5) + 0.05 * np.sin(u * 17.0 + 1.2)
    river_w = 0.014 + 0.006 * np.sin(u * 11.0)
    river = np.abs(v - axis) < river_w

    # -- agricultural parcels: hard rectangular edges ------------------------
    pu, pv = np.floor(u * 11).astype(int), np.floor(v * 9).astype(int)
    parcel = _hash2(pu.astype(np.float32) * 31.0, pv.astype(np.float32) * 17.0, seed + 5)
    soil = parcel > 0.62

    # -- settlements ---------------------------------------------------------
    # A main town under the cloud deck plus three outlying villages. Multiple
    # separated clusters matter: a single blob makes the detection count
    # meaningless, and a real landscape does not look like one either. Only the
    # main town sits under cloud, so the cross-modal recovery claim is about a
    # specific, countable subset rather than "everything".
    settlements = [
        (0.70, 0.26, 0.150),      # main town — under the cloud deck
        (0.30, 0.72, 0.062),      # village, south-west, clear sky
        (0.16, 0.34, 0.045),      # hamlet, north-west, clear sky
        (0.52, 0.50, 0.038),      # hamlet, centre, clear sky
    ]
    built = np.zeros((h, w), bool)
    for cx, cy, r in settlements:
        radius = r + urban_growth * (1.0 if r > 0.1 else 0.35)
        built |= (np.hypot(u - cx, v - cy) < radius) & (grain > 0.36)

    classes = np.full((h, w), VEGETATION, np.uint8)
    classes[soil] = SOIL
    classes[built] = BUILT
    classes[river] = WATER

    # -- roughness -> radar backscatter --------------------------------------
    roughness = np.zeros((h, w), np.float32)
    roughness[classes == WATER] = 0.02
    roughness[classes == VEGETATION] = 0.40
    roughness[classes == SOIL] = 0.28
    roughness[classes == BUILT] = 0.88
    roughness += fine * 0.10
    roughness[classes == WATER] = 0.02 + fine[classes == WATER] * 0.015
    roughness = np.clip(roughness, 0, 1)

    # -- cloud deck, deliberately over the built-up cluster -------------------
    cd = 1 - np.clip(np.hypot(u - 0.68, v - 0.30) / 0.34, 0, 1)
    cloud = np.clip(cd ** 2 * (0.55 + 0.45 * fbm(h, w, 4, 4.5, seed + 77)), 0, 1)

    px = extent_deg / size
    transform = GeoTransform(
        origin_x=origin[0], pixel_width=px, row_rotation=0.0,
        origin_y=origin[1], col_rotation=0.0, pixel_height=-px,
    )

    truth = {
        "acquired": acquired,
        "class_counts": {CLASS_NAMES[c]: int((classes == c).sum())
                         for c in (WATER, VEGETATION, SOIL, BUILT)},
        "built_fraction": float((classes == BUILT).mean()),
        "cloud_fraction": float((cloud > 0.3).mean()),
        "built_under_cloud_fraction": float(
            ((classes == BUILT) & (cloud > 0.3)).sum() / max((classes == BUILT).sum(), 1)),
        "urban_growth": urban_growth,
    }
    return Scene(name=name, size=size, classes=classes, roughness=roughness,
                 cloud=cloud, transform=transform, truth=truth)


def bitemporal(name: str = "kharagpur", size: int = 512, seed: int = 7,
               growth: float = 0.055) -> tuple[Scene, Scene, np.ndarray]:
    """Two dates of the same area, plus the true change mask.

    The change mask is ground truth for `eval.py`. `change.py` never sees it.
    """
    t1 = build(name, size, seed, urban_growth=0.0, acquired="2022-01-18T05:41:00Z")
    t2 = build(name, size, seed, urban_growth=growth, acquired="2024-01-15T05:42:00Z")
    mask = (t2.classes == BUILT) & (t1.classes != BUILT)
    t2.truth["changed_pixels"] = int(mask.sum())
    t2.truth["changed_fraction"] = float(mask.mean())
    return t1, t2, mask
