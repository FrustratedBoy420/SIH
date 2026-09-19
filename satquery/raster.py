"""GeoTIFF and TIFF ingestion.

A raster is not an image. The difference is the geotransform: six numbers that
convert a pixel position into a position on Earth. Everything downstream that
reports *where* something is depends on this module reading those numbers
correctly.

rasterio is used when available. It usually is not — it pulls GDAL, which is a
large native dependency and not something a hackathon venue machine will have.
So there is a fallback that reads the GeoTIFF tags directly through Pillow,
which covers the tags this project needs:

    33550  ModelPixelScale      (sx, sy, sz)
    33922  ModelTiepoint        (i, j, k, x, y, z)
    34737  GeoAsciiParams       CRS name
    34735  GeoKeyDirectory      CRS code

That is enough to build an affine transform and name the coordinate system,
which is all the evidence layer asks for.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

try:                                    # pragma: no cover - environment dependent
    import rasterio                     # type: ignore
    _HAVE_RASTERIO = True
except Exception:
    _HAVE_RASTERIO = False

from PIL import Image, TiffImagePlugin

Image.MAX_IMAGE_PIXELS = None


# --------------------------------------------------------------------------- #
# Affine geotransform
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class GeoTransform:
    """GDAL-order affine transform.

    x = c + a*col + b*row
    y = f + d*col + e*row

    Stored in GDAL's six-element order (c, a, b, f, d, e) because that is what
    every geospatial tool and every piece of documentation uses. Naming them
    after their role rather than their index keeps the arithmetic readable.
    """

    origin_x: float          # c
    pixel_width: float       # a
    row_rotation: float      # b
    origin_y: float          # f
    col_rotation: float      # d
    pixel_height: float      # e   (negative for north-up imagery)

    @classmethod
    def identity(cls, width: int, height: int) -> "GeoTransform":
        """A transform for imagery with no georeferencing.

        Maps the raster onto the unit square. Used so that non-georeferenced
        benchmark imagery (the PNG/JPEG path the problem statement permits for
        prescribed datasets) still flows through the same code, with the
        `georeferenced` flag telling downstream code not to trust the numbers.
        """
        return cls(0.0, 1.0 / max(width, 1), 0.0, 0.0, 0.0, -1.0 / max(height, 1))

    def pixel_to_world(self, col: float, row: float) -> tuple[float, float]:
        x = self.origin_x + self.pixel_width * col + self.row_rotation * row
        y = self.origin_y + self.col_rotation * col + self.pixel_height * row
        return x, y

    def world_to_pixel(self, x: float, y: float) -> tuple[float, float]:
        det = self.pixel_width * self.pixel_height - self.row_rotation * self.col_rotation
        if abs(det) < 1e-15:
            raise ValueError("geotransform is not invertible")
        dx, dy = x - self.origin_x, y - self.origin_y
        col = (self.pixel_height * dx - self.row_rotation * dy) / det
        row = (-self.col_rotation * dx + self.pixel_width * dy) / det
        return col, row

    @property
    def ground_sample_distance(self) -> float:
        """Metres per pixel, approximated for geographic coordinates.

        For EPSG:4326 the transform is in degrees, so this converts using the
        standard 111 320 m per degree of latitude. It is an approximation and
        is reported as one — good enough to state a scene's resolution, not
        good enough to measure with.
        """
        return abs(self.pixel_width) * 111_320.0

    def as_tuple(self) -> tuple[float, ...]:
        return (self.origin_x, self.pixel_width, self.row_rotation,
                self.origin_y, self.col_rotation, self.pixel_height)


# --------------------------------------------------------------------------- #
# Raster
# --------------------------------------------------------------------------- #

@dataclass
class Raster:
    """One scene: pixels plus the metadata that makes them locatable."""

    data: np.ndarray                       # (bands, rows, cols), float32 in [0, 1]
    transform: GeoTransform
    crs: str = "EPSG:4326"
    georeferenced: bool = True
    sensor: str = "unknown"                # optical | sar | unknown
    band_names: list[str] = field(default_factory=list)
    source: str = ""
    acquired: str = ""
    meta: dict[str, Any] = field(default_factory=dict)

    # -- shape ------------------------------------------------------------- #
    @property
    def bands(self) -> int:
        return self.data.shape[0]

    @property
    def height(self) -> int:
        return self.data.shape[1]

    @property
    def width(self) -> int:
        return self.data.shape[2]

    @property
    def shape_hw(self) -> tuple[int, int]:
        return self.height, self.width

    # -- extent ------------------------------------------------------------ #
    def bounds(self) -> tuple[float, float, float, float]:
        """(min_x, min_y, max_x, max_y) over the four corners."""
        corners = [self.transform.pixel_to_world(c, r)
                   for c, r in ((0, 0), (self.width, 0),
                                (0, self.height), (self.width, self.height))]
        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        return min(xs), min(ys), max(xs), max(ys)

    def centre(self) -> tuple[float, float]:
        return self.transform.pixel_to_world(self.width / 2, self.height / 2)

    # -- pixels ------------------------------------------------------------ #
    def band(self, index: int) -> np.ndarray:
        return self.data[index]

    def named(self, name: str) -> np.ndarray:
        """Fetch a band by name, e.g. 'nir' or 'vv'.

        Raises rather than guessing. A silent wrong-band selection produces
        results that look plausible and are wrong, which is the worst failure
        mode this pipeline can have.
        """
        try:
            return self.data[self.band_names.index(name)]
        except ValueError as exc:
            raise KeyError(
                f"band {name!r} not in {self.band_names} for {self.source or 'raster'}"
            ) from exc

    def has(self, name: str) -> bool:
        return name in self.band_names

    def rgb(self) -> np.ndarray:
        """(rows, cols, 3) float32 in [0, 1] for display.

        Optical uses true colour where the bands exist. SAR is single-channel
        and is returned as greyscale — deliberately *not* colourised, because
        a false colour map on backscatter invites the reader to interpret it
        as reflectance. See ADR-003.
        """
        if self.sensor == "sar":
            # display stretch only — analysis always uses the linear values
            from .cv import percentile_stretch
            g = percentile_stretch(self.data[0], 1.0, 97.0)
            return np.repeat(g[:, :, None], 3, axis=2)
        for combo in (("red", "green", "blue"), ("r", "g", "b")):
            if all(self.has(b) for b in combo):
                return np.stack([self.named(b) for b in combo], axis=2)
        if self.bands >= 3:
            return np.transpose(self.data[:3], (1, 2, 0))
        g = self.data[0]
        return np.repeat(g[:, :, None], 3, axis=2)

    def summary(self) -> dict[str, Any]:
        minx, miny, maxx, maxy = self.bounds()
        cx, cy = self.centre()
        return {
            "source": self.source,
            "sensor": self.sensor,
            "bands": self.bands,
            "band_names": self.band_names,
            "width": self.width,
            "height": self.height,
            "crs": self.crs,
            "georeferenced": self.georeferenced,
            "geotransform": [round(v, 10) for v in self.transform.as_tuple()],
            "gsd_m": round(self.transform.ground_sample_distance, 2),
            "bounds": [round(v, 6) for v in (minx, miny, maxx, maxy)],
            "centre": [round(cy, 6), round(cx, 6)],   # lat, lon
            "acquired": self.acquired,
            **self.meta,
        }


# --------------------------------------------------------------------------- #
# Reading
# --------------------------------------------------------------------------- #

def _geokeys_from_pillow(img: Image.Image) -> tuple[GeoTransform | None, str, bool]:
    """Pull the GeoTIFF tags Pillow exposes.

    Returns (transform, crs, georeferenced). Absent tags are not an error —
    the problem statement permits PNG/JPEG for prescribed benchmark datasets,
    which carry no georeferencing at all.
    """
    tags = getattr(img, "tag_v2", {}) or {}

    scale = tags.get(33550)         # ModelPixelScale  (sx, sy, sz)
    tiepoint = tags.get(33922)      # ModelTiepoint    (i, j, k, x, y, z)

    transform = None
    if scale and tiepoint and len(scale) >= 2 and len(tiepoint) >= 6:
        sx, sy = float(scale[0]), float(scale[1])
        i, j, _k, x, y, _z = (float(v) for v in tiepoint[:6])
        # north-up: pixel height is negative
        transform = GeoTransform(
            origin_x=x - i * sx, pixel_width=sx, row_rotation=0.0,
            origin_y=y + j * sy, col_rotation=0.0, pixel_height=-sy,
        )

    crs = "EPSG:4326"
    ascii_params = tags.get(34737)
    if isinstance(ascii_params, str) and ascii_params.strip():
        crs = ascii_params.strip().strip("|")
    keydir = tags.get(34735)
    if keydir:
        # GeoKeyDirectory is flat groups of 4 shorts; 3072 = ProjectedCSType,
        # 2048 = GeographicType. The value sits in the fourth slot.
        for n in range(4, len(keydir), 4):
            key = keydir[n]
            if key in (2048, 3072):
                code = keydir[n + 3]
                if code and code != 32767:
                    crs = f"EPSG:{code}"
                break

    return transform, crs, transform is not None


def read(path: str | Path, sensor: str = "", band_names: list[str] | None = None) -> Raster:
    """Read a raster, preferring rasterio and falling back to Pillow."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"no such raster: {path}")

    if _HAVE_RASTERIO:                                   # pragma: no cover
        with rasterio.open(path) as ds:
            arr = ds.read().astype(np.float32)
            if arr.max() > 1.5:
                arr = arr / (65535.0 if arr.max() > 255 else 255.0)
            t = ds.transform
            gt = GeoTransform(t.c, t.a, t.b, t.f, t.d, t.e)
            return Raster(
                data=arr, transform=gt,
                crs=str(ds.crs) if ds.crs else "EPSG:4326",
                georeferenced=ds.crs is not None,
                sensor=(resolved := sensor or _guess_sensor(path.name, arr.shape[0])),
                band_names=band_names or _default_band_names(arr.shape[0], resolved),
                source=path.name,
            )

    with Image.open(path) as img:
        transform, crs, geo = _geokeys_from_pillow(img)
        frames = []
        try:
            while True:
                frames.append(np.array(img.convert("F"), dtype=np.float32))
                img.seek(img.tell() + 1)
        except EOFError:
            pass
        if len(frames) == 1:
            a = np.array(Image.open(path).convert("RGB"), dtype=np.float32)
            arr = np.transpose(a, (2, 0, 1)) if a.ndim == 3 else frames[0][None]
        else:
            arr = np.stack(frames)

    if arr.max() > 1.5:
        arr = arr / (65535.0 if arr.max() > 255 else 255.0)
    arr = np.clip(arr, 0.0, 1.0).astype(np.float32)

    height, width = arr.shape[1], arr.shape[2]
    return Raster(
        data=arr,
        transform=transform or GeoTransform.identity(width, height),
        crs=crs,
        georeferenced=geo,
        sensor=(resolved := sensor or _guess_sensor(path.name, arr.shape[0])),
        band_names=band_names or _default_band_names(arr.shape[0], resolved),
        source=path.name,
    )


def write_geotiff(raster: Raster, path: str | Path) -> Path:
    """Write a single-band or RGB GeoTIFF carrying the geotransform tags.

    Written through Pillow so the demo data is real, georeferenced, readable
    by QGIS — not a PNG pretending to be a raster.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    rgb = (np.clip(raster.rgb(), 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(rgb, mode="RGB")

    t = raster.transform
    info = TiffImagePlugin.ImageFileDirectory_v2()
    info[33550] = (abs(t.pixel_width), abs(t.pixel_height), 0.0)
    info[33922] = (0.0, 0.0, 0.0, t.origin_x, t.origin_y, 0.0)
    info[34737] = raster.crs + "|"
    code = 4326
    if raster.crs.upper().startswith("EPSG:"):
        try:
            code = int(raster.crs.split(":")[1])
        except ValueError:
            code = 4326
    # one geokey: GeographicType (2048)
    info[34735] = (1, 1, 0, 1, 2048, 0, 1, code)

    img.save(path, tiffinfo=info)
    return path


def _guess_sensor(name: str, bands: int) -> str:
    """Filename evidence only, defaulting to optical — audit B4.

    Band count is not evidence of sensor type. A Cartosat-2S panchromatic
    scene is one band and entirely optical; treating it as SAR would send it
    down the speckle-filtering path and produce confident nonsense. The
    declared role from the upload always wins over this function; it is
    consulted only when nothing was declared.
    """
    low = name.lower()
    if any(k in low for k in ("s1", "sar", "grd", "risat", "vv", "vh")):
        return "sar"
    return "optical"


def _default_band_names(n: int, sensor: str = "optical") -> list[str]:
    """Names for unlabelled bands, which depend on the sensor, not the count.

    SAR polarisations are reported as supplied: VV/VH and HH/HV are both
    ordinary, and single-pol is as common as dual-pol (audit B4). A one-band
    optical raster is panchromatic, not VV.
    """
    if sensor == "sar":
        if n == 1:
            return ["vv"]
        if n == 2:
            return ["vv", "vh"]
        return [f"pol{i}" for i in range(1, n + 1)]
    if n == 1:
        return ["pan"]
    if n == 2:
        return ["b1", "b2"]
    if n == 3:
        return ["red", "green", "blue"]
    if n >= 4:
        return ["red", "green", "blue", "nir"] + [f"b{i}" for i in range(5, n + 1)]
    return [f"b{i}" for i in range(1, n + 1)]


# --------------------------------------------------------------------------- #
# Co-registration check
# --------------------------------------------------------------------------- #

def coregistration_offset(a: Raster, b: Raster) -> dict[str, Any]:
    """Estimate the misalignment between two rasters.

    The ISRO/SAC evaluation pairs arrive pre-georeferenced and co-registered,
    so this validates rather than solves — see ADR-003's note and the
    co-registration section of the analysis. Two independent signals:

      geometric  the two geotransforms should agree on the same ground extent
      phase      normalised cross-correlation peak offset, in pixels

    Phase correlation is computed on downsampled gradient magnitude, which is
    robust to the radiometric difference between optical and SAR — the two
    look nothing alike in brightness but share edges.
    """
    ax0, ay0, ax1, ay1 = a.bounds()
    bx0, by0, bx1, by1 = b.bounds()
    span = max(ax1 - ax0, 1e-9)
    geo_off_px = (max(abs(ax0 - bx0), abs(ay0 - by0)) / span) * a.width

    def prep(r: Raster, size: int = 128) -> np.ndarray:
        g = r.rgb().mean(axis=2)
        ys = np.linspace(0, g.shape[0] - 1, size).astype(int)
        xs = np.linspace(0, g.shape[1] - 1, size).astype(int)
        s = g[np.ix_(ys, xs)]
        gy, gx = np.gradient(s)
        m = np.hypot(gx, gy)
        m -= m.mean()
        sd = m.std()
        return m / sd if sd > 1e-8 else m

    fa, fb = np.fft.fft2(prep(a)), np.fft.fft2(prep(b))
    cross = fa * np.conj(fb)
    mag = np.abs(cross)
    corr = np.fft.ifft2(cross / np.where(mag < 1e-12, 1e-12, mag)).real
    peak = np.unravel_index(np.argmax(corr), corr.shape)
    dy = peak[0] if peak[0] <= 64 else peak[0] - 128
    dx = peak[1] if peak[1] <= 64 else peak[1] - 128
    scale = a.width / 128.0
    phase_off_px = math.hypot(dx * scale, dy * scale)

    offset = max(geo_off_px, phase_off_px)
    return {
        "aligned": bool(offset < 1.0),
        "offset_px": round(float(offset), 3),
        "geometric_px": round(float(geo_off_px), 3),
        "phase_px": round(float(phase_off_px), 3),
        "shift": [int(dx * scale), int(dy * scale)],
        "same_crs": a.crs == b.crs,
        "same_shape": a.shape_hw == b.shape_hw,
    }
